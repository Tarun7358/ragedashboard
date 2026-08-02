import { sendVoiceProtectionLog } from './logger.js';
import { checkBypassImmunity } from '../../utils/whitelistCheck.js';
import { VoiceIncidentRepository } from './VoiceIncidentRepository.js';

const cooldowns: Map<string, number> = new Map();

export async function isMemberImmune(member: any, config: any, context?: any): Promise<boolean> {
  if (!member) return true;
  if (!context) {
    // Fallback if context is not supplied (e.g. from tests)
    if (member.id === member.guild.ownerId) return true;
    if (config.whitelistedUsers?.includes(member.id)) return true;
    if (config.whitelistedRoles?.some((rId: string) => rId && member.roles?.cache?.has(rId))) return true;
    return false;
  }
  return checkBypassImmunity(member.id, member.guild, context, 'voice_protection');
}

export async function executePunishment(
  client: any,
  guildId: string,
  userId: string,
  channelId: string,
  avgLoudness: number,
  peakLoudness: number,
  config: any,
  context: any,
  reason = 'Excessive volume detected'
) {
  // Check cooldown
  const now = Date.now();
  const cooldownEnd = cooldowns.get(userId);
  if (cooldownEnd && now < cooldownEnd) {
    return; // On cooldown, do not punish again
  }

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return;

  if (await isMemberImmune(member, config, context)) {
    return; // Immune, skip
  }

  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;

  // Set cooldown
  const cooldownDuration = (config.cooldown || 60) * 1000;
  cooldowns.set(userId, now + cooldownDuration);

  let punishmentType = config.punishment || 'servermute';
  if (punishmentType === 'escalate') {
    const recentCount = await VoiceIncidentRepository.getRecentCountForUser(guildId, userId, 24 * 60 * 60 * 1000);
    if (recentCount === 0) {
      punishmentType = 'warn';
    } else if (recentCount === 1) {
      punishmentType = 'tempmute';
    } else if (recentCount === 2) {
      punishmentType = 'timeout';
    } else if (recentCount === 3) {
      const modules = context.getModulesState ? context.getModulesState(guildId) : [];
      const secMod = modules.find((m: any) => m.id === 'security');
      const quarantineRoleId = secMod?.config?.quarantineRoleId;
      if (quarantineRoleId) {
        punishmentType = 'quarantine';
      } else {
        punishmentType = 'servermute';
      }
    } else {
      punishmentType = 'ban';
    }
  }

  let actionApplied = punishmentType;

  // Save incident to database
  try {
    await VoiceIncidentRepository.insert({
      id: `vi_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      guildId,
      userId,
      username: member.user.username,
      channelId,
      channelName: channel.name,
      loudness: avgLoudness,
      peakLoudness,
      action: punishmentType,
      reason,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Voice Protection] Failed to save incident to database:', err);
  }

  // Perform DM notification
  if (config.dmNotification) {
    try {
      const dm = await member.createDM();
      const embed = {
        title: '<:voicechannelgreen:1532425750278438962> Voice Protection Notification',
        description: `You have been punished in **${guild.name}** for **${reason.toLowerCase()}** in channel **${channel.name}**.`,
        color: 0xe74c3c,
        fields: [
          { name: 'Action', value: punishmentType.toUpperCase(), inline: true }
        ],
        timestamp: new Date().toISOString()
      } as any;

      if (punishmentType === 'tempmute' || punishmentType === 'timeout') {
        embed.fields.push({ name: 'Duration', value: `${config.muteDuration || 30} seconds`, inline: true });
      }

      await dm.send({ embeds: [embed] }).catch(() => {});
    } catch (err) {
      // User has DMs disabled
    }
  }

  // Apply Action
  if (punishmentType === 'servermute' || punishmentType === 'tempmute') {
    try {
      if (member.voice.channel) {
        await member.voice.setMute(true, 'Voice Protection: Excessive volume detected').catch(() => {});
      }
    } catch (err) {
      console.error(`[Voice Protection] Failed to server-mute member ${member.user.username}:`, err);
    }
  } else if (punishmentType === 'disconnect') {
    try {
      if (member.voice.channel) {
        await member.voice.disconnect('Voice Protection: Excessive volume').catch(() => {});
      }
    } catch (err) {
      console.error(`[Voice Protection] Failed to disconnect member ${member.user.username}:`, err);
    }
  } else if (punishmentType === 'timeout') {
    try {
      const muteDuration = config.muteDuration || 30;
      await member.timeout(muteDuration * 1000, 'Voice Protection: Excessive volume').catch(() => {});
    } catch (err) {
      console.error(`[Voice Protection] Failed to timeout member ${member.user.username}:`, err);
    }
  } else if (punishmentType === 'quarantine') {
    try {
      const modules = context.getModulesState ? context.getModulesState(guildId) : [];
      const secMod = modules.find((m: any) => m.id === 'security');
      const quarantineRoleId = secMod?.config?.quarantineRoleId;
      if (quarantineRoleId) {
        await member.roles.add(quarantineRoleId, 'Voice Protection: Quarantine assignment').catch(() => {});
      }
    } catch (err) {
      console.error(`[Voice Protection] Failed to quarantine member ${member.user.username}:`, err);
    }
  } else if (punishmentType === 'ban') {
    try {
      await member.ban({ reason: 'Voice Protection: Maximum voice violations exceeded' }).catch(() => {});
    } catch (err) {
      console.error(`[Voice Protection] Failed to ban member ${member.user.username}:`, err);
    }
  }

  if (punishmentType === 'tempmute') {
    const muteDuration = config.muteDuration || 30;
    const unmuteAt = now + (muteDuration * 1000);
    const activeMutes = config.activeMutes || [];
    activeMutes.push({ userId, unmuteAt });
    
    // Save to Firestore configuration state
    await context.updateModuleConfig('voice-protection', { activeMutes });
  }

  // Update statistics
  const stats = config.stats || {
    totalDetections: 0,
    totalMutes: 0,
    avgLoudness: 0,
    peakLoudness: 0,
    mostDetectedUsers: {},
    history: []
  };

  stats.totalDetections = (stats.totalDetections || 0) + 1;
  if (punishmentType === 'servermute' || punishmentType === 'tempmute') {
    stats.totalMutes = (stats.totalMutes || 0) + 1;
  }

  // Calculate new running average
  const prevTotal = stats.totalDetections - 1;
  const currentAvg = stats.avgLoudness || 0;
  stats.avgLoudness = Math.round(((currentAvg * prevTotal) + avgLoudness) / stats.totalDetections);
  stats.peakLoudness = Math.max(stats.peakLoudness || 0, peakLoudness);

  // User detection frequency
  const userStats = stats.mostDetectedUsers[userId] || { username: member.user.username, count: 0 };
  userStats.count += 1;
  stats.mostDetectedUsers[userId] = userStats;

  // History tracking (daily)
  const todayStr = new Date().toISOString().split('T')[0];
  const history = stats.history || [];
  const dayEntry = history.find((h: any) => h.date === todayStr);
  if (dayEntry) {
    dayEntry.detections += 1;
  } else {
    history.push({ date: todayStr, detections: 1 });
  }
  stats.history = history.slice(-30); // Keep last 30 days

  await context.updateModuleConfig('voice-protection', { stats });

  // Log action
  await sendVoiceProtectionLog(client, guildId, config, context, {
    user: member.user,
    channel,
    avgLoudness,
    peakLoudness,
    action: actionApplied,
    duration: punishmentType === 'tempmute' ? config.muteDuration : undefined
  });
}
