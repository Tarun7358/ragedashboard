import { EmbedBuilder, Role } from 'discord.js';
import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { Database } from '../../core/Database.js';

// Safe user tag helper
function userTag(user: any): string {
  return user?.globalName ?? user?.username ?? user?.tag ?? user?.id ?? 'Unknown';
}

// Variable parser engine supporting all requested Koya tokens
function parseWelcomeVariables(str: string, member: any, countOverride?: number): string {
  if (!str) return '';
  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  const memberCount = countOverride ?? member.guild.memberCount;
  const targetUser = member.user || member;

  return str
    .replace(/{user}/g, targetUser.toString())
    .replace(/{username}/g, targetUser.username)
    .replace(/{userTag}/g, userTag(targetUser))
    .replace(/{user\.tag}/g, userTag(targetUser))
    .replace(/{userId}/g, targetUser.id)
    .replace(/{server}/g, member.guild.name)
    .replace(/{memberCount}/g, memberCount.toString())
    .replace(/{date}/g, dateStr)
    .replace(/{boosts}/g, (member.guild.premiumSubscriptionCount || 0).toString())
    .replace(/{boostTier}/g, (member.guild.premiumTier || 0).toString());
}

// Check member birthdays for the current day
async function checkBirthdays(client: any, context: any) {
  try {
    const guildId = context.guildId;
    const modules = context.getModulesState ? context.getModulesState() : [];
    const welcomeMod = modules.find((m: any) => m.id === 'welcome-v2');
    
    // Check if module is enabled and birthdays are configured
    if (!welcomeMod || welcomeMod.status !== 'enabled') return;
    const config = welcomeMod.config || {};
    if (!config.birthdaysEnabled || !config.birthdaysChannelId) return;

    const db = Database.getDb();
    if (!db) return;

    // Get MM-DD representation of today (e.g. 07-17)
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${mm}-${dd}`; // Search for MM-DD birthday suffix

    const birthdayRows = await db.all<any>(
      `SELECT userId FROM member_birthdays WHERE guildId = ? AND birthday LIKE ?`,
      [guildId, `%${todayStr}`]
    );

    if (birthdayRows.length === 0) return;

    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;

    const channel = await guild.channels.fetch(config.birthdaysChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    for (const row of birthdayRows) {
      try {
        const member = await guild.members.fetch(row.userId).catch(() => null);
        if (!member) continue;

        const defaultEmbed = {
          title: '<:information:1532621274092929124> Happy Birthday, {user}!',
          description: 'Wishing **{userTag}** a fantastic birthday today!',
          color: '#d4af37',
          showAvatar: true
        };

        const embedConfig = config.birthdaysEmbed || defaultEmbed;
        const embed = new EmbedBuilder().setColor((embedConfig.color || '#d4af37') as any);

        if (embedConfig.title) {
          embed.setTitle(parseWelcomeVariables(embedConfig.title, member));
        }
        if (embedConfig.description) {
          embed.setDescription(parseWelcomeVariables(embedConfig.description, member));
        }
        if (embedConfig.showAvatar) {
          embed.setThumbnail(member.user.displayAvatarURL({ forceStatic: false }));
        }
        if (embedConfig.footer) {
          embed.setFooter({ text: parseWelcomeVariables(embedConfig.footer, member) });
        }
        if (embedConfig.timestamp) {
          embed.setTimestamp();
        }

        const content = config.birthdaysMessage 
          ? parseWelcomeVariables(config.birthdaysMessage, member) 
          : `<:information:1532621274092929124> Happy Birthday ${member}!`;

        await channel.send({ content, embeds: [embed] });
        context.logSyncEvent(`Welcome vNext: Dispatched birthday greetings for "${userTag(member.user)}"`, 'success');
      } catch (err) {
        console.error('Error dispatching birthday message:', err);
      }
    }
  } catch (err) {
    console.error('Error running daily birthdays check:', err);
  }
}

// Build standard embed wrapper
function buildWelcomeEmbed(config: any, member: any, countOverride?: number): EmbedBuilder | null {
  if (!config) return null;
  const embed = new EmbedBuilder().setColor((config.color || '#4f8cff') as any);
  let hasContent = false;

  if (config.title) {
    embed.setTitle(parseWelcomeVariables(config.title, member, countOverride));
    hasContent = true;
  }
  if (config.description) {
    embed.setDescription(parseWelcomeVariables(config.description, member, countOverride));
    hasContent = true;
  }
  if (config.author) {
    embed.setAuthor({ name: parseWelcomeVariables(config.author, member, countOverride) });
    hasContent = true;
  }
  if (config.showAvatar) {
    embed.setThumbnail(member.user.displayAvatarURL({ forceStatic: false }));
    hasContent = true;
  }
  if (config.imageUrl) {
    embed.setImage(config.imageUrl);
    hasContent = true;
  }
  if (config.footer) {
    embed.setFooter({ text: parseWelcomeVariables(config.footer, member, countOverride) });
    hasContent = true;
  }
  if (config.timestamp) {
    embed.setTimestamp();
    hasContent = true;
  }
  if (config.fields && Array.isArray(config.fields)) {
    config.fields.forEach((f: any) => {
      embed.addFields({
        name: parseWelcomeVariables(f.name, member, countOverride),
        value: parseWelcomeVariables(f.value, member, countOverride),
        inline: !!f.inline
      });
    });
    hasContent = true;
  }

  return hasContent ? embed : null;
}

export const WelcomeV2Manifest: ModuleManifest = {
  id: 'welcome-v2',
  name: 'Welcome System vNext',
  version: '2.0.0',
  description: 'Premium Welcome suite including graphic cards, auto-roles, boosting triggers, milestone trackers, and birthdays.',
  configSchema: {
    requiredFields: [],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      const errors: string[] = [];
      let progress = 0;

      const channelExists = (id: string) => registry.channels.some(c => c.id === id);
      const roleExists = (id: string) => registry.roles.some(r => r.id === id);

      if (config.welcomeEnabled && config.welcomeChannelId) {
        progress += 20;
        if (!channelExists(config.welcomeChannelId)) {
          errors.push(`Welcome channel ID (${config.welcomeChannelId}) is invalid!`);
        }
      }
      if (config.goodbyeEnabled && config.goodbyeChannelId) {
        progress += 20;
        if (!channelExists(config.goodbyeChannelId)) {
          errors.push(`Goodbye channel ID (${config.goodbyeChannelId}) is invalid!`);
        }
      }
      if (config.autoroleEnabled && config.autoroleRoleIds) {
        progress += 20;
        config.autoroleRoleIds.forEach((rid: string) => {
          if (!roleExists(rid)) {
            errors.push(`Auto-assigned role ID (${rid}) is invalid!`);
          }
        });
      }

      return { progress: Math.min(100, progress || 50), errors };
    }
  },
  commands: [],
  events: [
    {
      name: 'ready',
      handler: async (client: any, context: any) => {
        // Run daily birthdays checker
        setTimeout(() => checkBirthdays(client, context), 8000);
        setInterval(() => checkBirthdays(client, context), 24 * 60 * 60 * 1000);
      }
    },
    {
      name: 'guildMemberAdd',
      handler: async (client: any, member: any, context: any) => {
        const globalSettings = context.getGlobalSettings ? context.getGlobalSettings() : {};
        if (!globalSettings.useV2Welcome) return;

        const modules = context.getModulesState ? context.getModulesState() : [];
        const welcomeMod = modules.find((m: any) => m.id === 'welcome-v2');
        if (!welcomeMod || welcomeMod.status !== 'enabled') return;

        const config = welcomeMod.config || {};

        // 1. Auto-role Assignment
        if (config.autoroleEnabled && config.autoroleRoleIds && config.autoroleRoleIds.length > 0) {
          const delayMs = Math.max(0, Number(config.autoroleDelay || 0) * 1000);
          setTimeout(async () => {
            try {
              const rolesToAssign = config.autoroleRoleIds
                .map((rid: string) => member.guild.roles.cache.get(rid))
                .filter(Boolean);
              if (rolesToAssign.length > 0) {
                await member.roles.add(rolesToAssign);
                context.logSyncEvent(`Welcome vNext: Assigned auto-roles [${rolesToAssign.map((r: Role) => r.name).join(', ')}] to "${userTag(member.user)}"`, 'success');
              }
            } catch (err: any) {
              console.error('[WelcomeV2] Failed to assign auto-roles:', err);
              context.logSyncEvent(`Welcome vNext: Failed to assign auto-roles: ${err.message}`, 'warn');
            }
          }, delayMs);
        }

        // 2. DM welcome
        if (config.dmEnabled && config.dmMessage) {
          try {
            const payload: any = {
              content: parseWelcomeVariables(config.dmMessage, member)
            };
            const dmEmbed = buildWelcomeEmbed(config.dmEmbed, member);
            if (dmEmbed) {
              payload.embeds = [dmEmbed];
            }
            await member.send(payload);
          } catch (err: any) {
            console.warn(`[WelcomeV2] Failed to DM user ${member.user.username}:`, err.message);
          }
        }

        // 3. Welcome channel message & image card
        if (config.welcomeEnabled && config.welcomeChannelId) {
          try {
            const channel = await member.guild.channels.fetch(config.welcomeChannelId).catch(() => null);
            if (channel && channel.isTextBased()) {
              const payload: any = {};
              
              if (config.welcomeMessage) {
                payload.content = parseWelcomeVariables(config.welcomeMessage, member);
              }

              const welcomeEmbed = buildWelcomeEmbed(config.welcomeEmbed, member);
              if (welcomeEmbed) {
                payload.embeds = [welcomeEmbed];
              }

              // Dynamic welcome image attachment disabled (Puppeteer removed)
              if (config.welcomeImageEnabled) {
                context.logSyncEvent(
                  "Welcome image generation disabled (Puppeteer removed).",
                  "info"
                );
              }

              if (payload.content || (payload.embeds && payload.embeds.length > 0) || (payload.files && payload.files.length > 0)) {
                await channel.send(payload);
                context.logSyncEvent(`Welcome vNext: Dispatched welcome greetings for "${userTag(member.user)}"`, 'success');
              }
            }
          } catch (err) {
            console.error('[WelcomeV2] Failed to send welcome channel message:', err);
          }
        }

        // 4. Milestone Tracker
        if (config.milestonesEnabled && config.milestonesChannelId && config.milestonesInterval) {
          const currentCount = member.guild.memberCount;
          const interval = Number(config.milestonesInterval);
          if (interval > 0 && currentCount % interval === 0) {
            try {
              const channel = await member.guild.channels.fetch(config.milestonesChannelId).catch(() => null);
              if (channel && channel.isTextBased()) {
                const defaultMileEmbed = {
                  title: '<:information:1532621274092929124> Server Milestone Reached!',
                  description: 'Congratulations! **{server}** has officially hit **{memberCount}** members!',
                  color: '#99CC00'
                };
                const embedConfig = config.milestonesEmbed || defaultMileEmbed;
                const embed = buildWelcomeEmbed(embedConfig, member);
                
                const content = config.milestonesMessage
                  ? parseWelcomeVariables(config.milestonesMessage, member)
                  : `<:information:1532621274092929124> Server Milestone Reached!`;

                await channel.send({
                  content,
                  embeds: embed ? [embed] : []
                });
                context.logSyncEvent(`Welcome vNext: Server milestone of ${currentCount} members reached and announced.`, 'info');
              }
            } catch (err) {
              console.error('[WelcomeV2] Failed to send milestone announcement:', err);
            }
          }
        }
      }
    },
    {
      name: 'guildMemberRemove',
      handler: async (client: any, member: any, context: any) => {
        const globalSettings = context.getGlobalSettings ? context.getGlobalSettings() : {};
        if (!globalSettings.useV2Welcome) return;

        const modules = context.getModulesState ? context.getModulesState() : [];
        const welcomeMod = modules.find((m: any) => m.id === 'welcome-v2');
        if (!welcomeMod || welcomeMod.status !== 'enabled') return;

        const config = welcomeMod.config || {};

        if (config.goodbyeEnabled && config.goodbyeChannelId) {
          try {
            const channel = await member.guild.channels.fetch(config.goodbyeChannelId).catch(() => null);
            if (channel && channel.isTextBased()) {
              const payload: any = {};
              
              if (config.goodbyeMessage) {
                payload.content = parseWelcomeVariables(config.goodbyeMessage, member);
              }

              const goodbyeEmbed = buildWelcomeEmbed(config.goodbyeEmbed, member);
              if (goodbyeEmbed) {
                payload.embeds = [goodbyeEmbed];
              }

              if (payload.content || (payload.embeds && payload.embeds.length > 0)) {
                await channel.send(payload);
                context.logSyncEvent(`Welcome vNext: Dispatched goodbye leave log for "${userTag(member.user)}"`, 'info');
              }
            }
          } catch (err) {
            console.error('[WelcomeV2] Failed to send goodbye channel message:', err);
          }
        }
      }
    },
    {
      name: 'guildMemberUpdate',
      handler: async (client: any, oldMember: any, newMember: any, context: any) => {
        const globalSettings = context.getGlobalSettings ? context.getGlobalSettings() : {};
        if (!globalSettings.useV2Welcome) return;

        const modules = context.getModulesState ? context.getModulesState() : [];
        const welcomeMod = modules.find((m: any) => m.id === 'welcome-v2');
        if (!welcomeMod || welcomeMod.status !== 'enabled') return;

        const config = welcomeMod.config || {};

        const oldBoost = oldMember.premiumSince;
        const newBoost = newMember.premiumSince;

        // 1. Check if user started boosting
        if (!oldBoost && newBoost) {
          if (config.boostEnabled && config.boostChannelId) {
            try {
              const channel = await newMember.guild.channels.fetch(config.boostChannelId).catch(() => null);
              if (channel && channel.isTextBased()) {
                const defaultBoostEmbed = {
                  title: '<:booster:1532621228492460172> Server Boosted!',
                  description: 'Thank you so much to {user} for boosting the server!',
                  color: '#99CC00',
                  showAvatar: true
                };
                const embedConfig = config.boostEmbed || defaultBoostEmbed;
                const embed = buildWelcomeEmbed(embedConfig, newMember);

                const content = config.boostMessage
                  ? parseWelcomeVariables(config.boostMessage, newMember)
                  : `<:booster:1532621228492460172> Server Boosted by ${newMember}!`;

                await channel.send({
                  content,
                  embeds: embed ? [embed] : []
                });
                context.logSyncEvent(`Welcome vNext: Boost event announced for "${userTag(newMember.user)}"`, 'success');
              }
            } catch (err) {
              console.error('[WelcomeV2] Failed to send boost announcement:', err);
            }
          }
        }

        // 2. Check if user stopped boosting
        if (oldBoost && !newBoost) {
          if (config.unboostEnabled && config.unboostChannelId) {
            try {
              const channel = await newMember.guild.channels.fetch(config.unboostChannelId).catch(() => null);
              if (channel && channel.isTextBased()) {
                const defaultUnboostEmbed = {
                  title: '<:wrong:1532390628330307634> Server Unboosted',
                  description: 'Oh no! **{userTag}** is no longer boosting the server.',
                  color: '#99CC00'
                };
                const embedConfig = config.unboostEmbed || defaultUnboostEmbed;
                const embed = buildWelcomeEmbed(embedConfig, newMember);

                const content = config.unboostMessage
                  ? parseWelcomeVariables(config.unboostMessage, newMember)
                  : `<:wrong:1532390628330307634> Server Unboosted by ${newMember}`;

                await channel.send({
                  content,
                  embeds: embed ? [embed] : []
                });
                context.logSyncEvent(`Welcome vNext: Unboost event announced for "${userTag(newMember.user)}"`, 'info');
              }
            } catch (err) {
              console.error('[WelcomeV2] Failed to send unboost announcement:', err);
            }
          }
        }
      }
    }
  ]
};
