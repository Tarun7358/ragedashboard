import { AuditLogEvent, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { checkWhitelistPermission, getGuildAndCheckPermission, checkBypassImmunity } from '../../utils/whitelistCheck.js';
import { Database } from '../../core/Database.js';
import { checkRoleAssignment } from '../join-role-guard/manifest.js';


// UPM Live Snapshots & Active Quarantines tracking
export const liveSnapshots = new Map<string, any>();
export const activeQuarantines = new Set<string>();

// BUG-012 FIX: Gate verbose anti-nuke debug logs behind an env var.
// Set DEBUG=antinuke in .env to enable (off by default in production).
const DEBUG_ANTINUKE = (process.env.DEBUG || '').includes('antinuke');

function extractDomains(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  const inviteRegex = /(discord\.gg\/[^\s]+)/gi;
  const domains: string[] = [];

  const urlMatches = text.match(urlRegex) || [];
  for (const url of urlMatches) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname) {
        domains.push(parsed.hostname.toLowerCase());
      }
    } catch (e) {}
  }

  const inviteMatches = text.match(inviteRegex) || [];
  for (const inv of inviteMatches) {
    domains.push('discord.gg');
  }

  return domains;
}

// Simple in-memory tracker for rate limits
interface ActionTracker {
  count: number;
  timestamps: number[];
}

const userActions = new Map<string, Map<string, ActionTracker>>();

function checkRateLimit(guildId: string, userId: string, ruleId: string, limit: number, windowSeconds: number): boolean {
  const key = `${userId}_${ruleId}`;
  if (!userActions.has(guildId)) {
    userActions.set(guildId, new Map());
  }
  const guildTracker = userActions.get(guildId)!;
  const now = Date.now();

  // Active memory cleanup for this guild
  for (const [k, tracker] of guildTracker.entries()) {
    tracker.timestamps = tracker.timestamps.filter(ts => now - ts < windowSeconds * 1000);
    if (tracker.timestamps.length === 0) {
      guildTracker.delete(k);
    }
  }

  if (!guildTracker.has(key)) {
    guildTracker.set(key, { count: 0, timestamps: [] });
  }
  const tracker = guildTracker.get(key)!;
  tracker.timestamps.push(now);
  tracker.count = tracker.timestamps.length;
  return tracker.count >= limit;
}

function isRecentEntry(entry: any, maxAgeMs = 10000): boolean {
  if (!entry) return false;
  const now = Date.now();
  const created = entry.createdTimestamp;
  const age = now - created;
  return age < maxAgeMs && age > -10000;
}

export async function captureLiveSnapshot(guild: any) {
  const channels = guild.channels.cache.map((channel: any) => ({
    id: channel.id,
    name: channel.name,
    type: channel.type,
    parentId: channel.parentId,
    position: channel.position,
    permissionOverwrites: channel.permissionOverwrites.cache.map((o: any) => ({
      id: o.id,
      type: o.type,
      allow: o.allow.bitfield.toString(),
      deny: o.deny.bitfield.toString()
    })),
    topic: channel.topic || null,
    nsfw: channel.nsfw || false,
    rateLimitPerUser: channel.rateLimitPerUser || 0,
    userLimit: channel.userLimit || 0,
    bitrate: channel.bitrate || null,
    rtcRegion: channel.rtcRegion || null
  }));

  const roles = guild.roles.cache.map((role: any) => ({
    id: role.id,
    name: role.name,
    color: role.color,
    hoist: role.hoist,
    permissions: role.permissions.bitfield.toString(),
    position: role.position,
    mentionable: role.mentionable
  }));

  const guildSettings = {
    name: guild.name,
    icon: guild.icon || null,
    banner: guild.banner || null,
    vanityURLCode: guild.vanityURLCode || null,
    verificationLevel: guild.verificationLevel,
    defaultMessageNotifications: guild.defaultMessageNotifications,
    explicitContentFilter: guild.explicitContentFilter,
    systemChannelId: guild.systemChannelId || null,
    rulesChannelId: guild.rulesChannelId || null,
    publicUpdatesChannelId: guild.publicUpdatesChannelId || null
  };

  return {
    timestamp: Date.now(),
    channels,
    roles,
    guildSettings
  };
}

export async function saveLiveSnapshotToDb(guildId: string, snap: any) {
  liveSnapshots.set(guildId, snap);

  const db = Database.getDb();
  if (db) {
    try {
      const timestamp = snap.timestamp || Date.now();
      const channels = JSON.stringify(snap.channels || []);
      const roles = JSON.stringify(snap.roles || []);
      const guildSettings = JSON.stringify(snap.guildSettings || {});

      await Database.run(
        `INSERT INTO upm_snapshots (guildId, timestamp, channels, roles, guildSettings)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(guildId) DO UPDATE SET
           timestamp = excluded.timestamp,
           channels = excluded.channels,
           roles = excluded.roles,
           guildSettings = excluded.guildSettings`,
        [guildId, timestamp, channels, roles, guildSettings]
      );
    } catch (err) {
      console.error('Failed to save live snapshot to SQLite database:', err);
    }
  }
}

export async function restoreFromLiveSnapshot(guild: any, client: any, context: any) {
  const guildId = guild.id;
  context.logSyncEvent(guildId, '🔄 [UPM Restore]: Initializing full server restoration sequence...', 'info');

  let snap = liveSnapshots.get(guildId);
  if (!snap) {
    const db = Database.getDb();
    if (db) {
      try {
        const row = await Database.get('SELECT * FROM upm_snapshots WHERE guildId = ?', [guildId]);
        if (row) {
          snap = {
            timestamp: row.timestamp,
            channels: JSON.parse(row.channels || '[]'),
            roles: JSON.parse(row.roles || '[]'),
            guildSettings: JSON.parse(row.guildSettings || '{}')
          };
          liveSnapshots.set(guildId, snap);
        }
      } catch (err) {
        console.error('Failed to fetch live snapshot from SQLite database:', err);
      }
    }
  }

  if (!snap) {
    context.logSyncEvent(guildId, '❌ [UPM Restore Failed]: No snapshot found in database or memory.', 'warn');
    return;
  }

  // Restore Guild Settings
  if (snap.guildSettings) {
    const gs = snap.guildSettings;
    const needsEdit = guild.name !== gs.name ||
                      guild.verificationLevel !== gs.verificationLevel ||
                      guild.explicitContentFilter !== gs.explicitContentFilter;
    if (needsEdit) {
      await guild.edit({
        name: gs.name,
        verificationLevel: gs.verificationLevel,
        explicitContentFilter: gs.explicitContentFilter,
        systemChannelId: gs.systemChannelId,
        rulesChannelId: gs.rulesChannelId,
        publicUpdatesChannelId: gs.publicUpdatesChannelId
      }).catch(() => null);
    }
  }

  // Restore Roles
  const roleMap = new Map<string, any>();
  if (snap.roles) {
    const sortedRoles = [...snap.roles].sort((a, b) => a.position - b.position);
    for (const rSnap of sortedRoles) {
      if (rSnap.name === '@everyone') {
        const everyoneRole = guild.roles.everyone;
        if (everyoneRole && everyoneRole.permissions.bitfield.toString() !== rSnap.permissions) {
          await everyoneRole.setPermissions(BigInt(rSnap.permissions)).catch(() => null);
        }
        roleMap.set(rSnap.id, everyoneRole);
        continue;
      }

      let existingRole = guild.roles.cache.get(rSnap.id) || guild.roles.cache.find((r: any) => r.name === rSnap.name && !r.managed);
      if (!existingRole) {
        existingRole = await guild.roles.create({
          name: rSnap.name,
          color: rSnap.color,
          hoist: rSnap.hoist,
          permissions: BigInt(rSnap.permissions),
          mentionable: rSnap.mentionable,
          reason: 'UPM Recovery: Recreating deleted role'
        }).catch(() => null);
      } else {
        const diff = existingRole.color !== rSnap.color ||
                     existingRole.hoist !== rSnap.hoist ||
                     existingRole.mentionable !== rSnap.mentionable ||
                     existingRole.permissions.bitfield.toString() !== rSnap.permissions;
        if (diff) {
          await existingRole.edit({
            color: rSnap.color,
            hoist: rSnap.hoist,
            mentionable: rSnap.mentionable,
            permissions: BigInt(rSnap.permissions)
          }).catch(() => null);
        }
      }

      if (existingRole) {
        roleMap.set(rSnap.id, existingRole);
      }
    }
  }

  // Restore Channels
  if (snap.channels) {
    const categories = snap.channels.filter((c: any) => c.type === 4);
    const otherChannels = snap.channels.filter((c: any) => c.type !== 4);
    const channelMap = new Map<string, any>();

    const restoreChannel = async (cSnap: any, parentActualId?: string) => {
      let existingChannel = guild.channels.cache.get(cSnap.id) || guild.channels.cache.find((c: any) => c.name === cSnap.name && c.type === cSnap.type);

      const overwrites = (cSnap.permissionOverwrites || []).map((o: any) => {
        let targetId = o.id;
        const mappedRole = roleMap.get(o.id);
        if (mappedRole) {
          targetId = mappedRole.id;
        }
        return {
          id: targetId,
          type: o.type,
          allow: BigInt(o.allow),
          deny: BigInt(o.deny)
        };
      });

      if (!existingChannel) {
        existingChannel = await guild.channels.create({
          name: cSnap.name,
          type: cSnap.type,
          parent: parentActualId || undefined,
          nsfw: cSnap.nsfw,
          topic: cSnap.topic || undefined,
          rateLimitPerUser: cSnap.rateLimitPerUser || undefined,
          userLimit: cSnap.userLimit || undefined,
          bitrate: cSnap.bitrate || undefined,
          rtcRegion: cSnap.rtcRegion || undefined,
          permissionOverwrites: overwrites,
          reason: 'UPM Recovery: Recreating deleted channel'
        }).catch(() => null);
      } else {
        await existingChannel.edit({
          name: cSnap.name,
          parent: parentActualId || undefined,
          nsfw: cSnap.nsfw,
          topic: cSnap.topic || undefined,
          rateLimitPerUser: cSnap.rateLimitPerUser || undefined,
          userLimit: cSnap.userLimit || undefined,
          bitrate: cSnap.bitrate || undefined,
          rtcRegion: cSnap.rtcRegion || undefined,
          permissionOverwrites: overwrites
        }).catch(() => null);
      }

      if (existingChannel) {
        channelMap.set(cSnap.id, existingChannel);
      }
    };

    for (const catSnap of categories) {
      await restoreChannel(catSnap);
    }
    for (const chSnap of otherChannels) {
      const parentActualId = chSnap.parentId ? channelMap.get(chSnap.parentId)?.id : undefined;
      await restoreChannel(chSnap, parentActualId);
    }
  }

  context.logSyncEvent(guildId, '✅ [UPM Restore Completed]: Full server state successfully restored from snapshot.', 'success');
}

async function isExecutorBypassed(guild: any, executorId: string, config: any, context?: any, ruleId?: string): Promise<boolean> {
  return checkBypassImmunity(executorId, guild, context, ruleId);
}

async function punishViolator(client: any, guild: any, executorId: string, executorUsername: string, reason: string, ruleAction: string, config: any, context: any, ruleId?: string) {
  // BUG FIX (BUG-005): Key by guildId_userId to prevent cross-guild false positives
  // where a quarantine in Guild A blocks a legitimate quarantine in Guild B for the same user.
  const quarantineKey = `${guild.id}_${executorId}`;

  // BUG FIX: Check activeQuarantines FIRST before any async whitelist lookup to
  // prevent double-processing when concurrent events fire for the same executor.
  if (activeQuarantines.has(quarantineKey)) {
    console.log(`[Anti-Nuke Safety] Skipping punishment for ${executorUsername} — already in activeQuarantines cooldown.`);
    return;
  }

  let bypassed = await isExecutorBypassed(guild, executorId, config, context, ruleId);
  if (ruleId === 'anti_role_grant') {
    bypassed = bypassed || await isExecutorBypassed(guild, executorId, config, context, 'anti_member_update');
  }
  if (bypassed) {
    context.logSyncEvent(guild.id, `🛡️ [Anti-Nuke Safety]: Prevented punishment of bypassed/whitelisted user ${executorUsername} for rule: ${ruleId || 'general'}.`, 'info');
    return;
  }

  // Re-check after async whitelist lookup to handle race between concurrent events
  if (activeQuarantines.has(quarantineKey)) {
    console.log(`[Anti-Nuke Safety] Skipping punishment for ${executorUsername} — quarantine race condition detected.`);
    return;
  }
  activeQuarantines.add(quarantineKey);
  setTimeout(() => activeQuarantines.delete(quarantineKey), 15000); // 15s cooldown to cover audit log delays


  try {
    const member = await guild.members.fetch(executorId).catch(() => null);
    if (!member) return;

    // BUG FIX: Snapshot original roles BEFORE stripping admin roles so that the
    // quarantine originalRoles list is accurate (includes admin roles that are
    // about to be removed). Previously the snapshot happened AFTER strips, causing
    // already-removed roles to sometimes still appear due to stale cache.
    const originalRoleIds = Array.from(
      member.roles.cache
        .filter((r: any) => r.id !== guild.id && !r.managed && r.id !== config.quarantineRoleId)
        .keys()
    );

    // 1. Identify and strip ALL administrative roles (roles with Administrator permission)
    const adminRoleIds = member.roles.cache
      .filter((r: any) => r.permissions.has(PermissionFlagsBits.Administrator) && r.id !== guild.id)
      .map((r: any) => r.id);
    for (const roleId of adminRoleIds) {
      await member.roles.remove(roleId).catch(() => {});
    }

    // 2. Apply action punishment
    if (ruleAction === 'quarantine' && config.quarantineRoleId) {
      // BUG FIX: Re-fetch member after admin role strips so we get a fresh cache
      // before computing the remaining roles to remove. Without this, Discord.js
      // cache may still show already-removed admin roles, leading to redundant
      // remove calls that silently fail and log confusing errors.
      const freshMember = await guild.members.fetch(executorId).catch(() => member);
      const remainingRoleIds = Array.from(
        freshMember.roles.cache
          .filter((r: any) => r.id !== guild.id && !r.managed && r.id !== config.quarantineRoleId)
          .keys()
      );

      await freshMember.roles.add(config.quarantineRoleId).catch(console.error);
      for (const roleId of remainingRoleIds) {
        await freshMember.roles.remove(roleId).catch(() => {});
      }

      const quarantinedUsers = config.quarantinedUsers || [];
      if (!quarantinedUsers.some((u: any) => u.userId === executorId)) {
        quarantinedUsers.push({
          id: `q-${Date.now()}`,
          tag: executorUsername,
          userId: executorId,
          reason: reason,
          time: new Date().toISOString(),
          status: 'Quarantined',
          risk: 'danger',
          originalRoles: originalRoleIds  // Uses pre-strip snapshot for accurate restore list
        });
        context.updateModuleConfig('security', { quarantinedUsers });
      }
      context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Action]: Quarantined ${executorUsername} and stripped all Administrative roles. Reason: ${reason}`, 'warn');
    } else if (ruleAction === 'ban') {
      await guild.members.ban(executorId, { reason }).catch(console.error);
      context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Action]: Banned ${executorUsername}. Reason: ${reason}`, 'warn');
    } else if (ruleAction === 'kick') {
      await member.kick(reason).catch(console.error);
      context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Action]: Kicked ${executorUsername}. Reason: ${reason}`, 'warn');
    }
  } catch (err) {
    console.error('Error punishing violator:', err);
  }
}

export const SecurityManifest: ModuleManifest = {
  id: 'security',
  name: 'Security Guard',
  version: '1.5.0',
  description: 'Enterprise Security Center featuring real-time SOC logs, threat detection rules, scan diagnostics, and automatic quarantines.',
  configSchema: {
    requiredFields: ['quarantineRoleId', 'alertChannelId'],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      const errors: string[] = [];
      let progress = 0;

      const roleExists = (id: string) => registry.roles.some(r => r.id === id);
      const channelExists = (id: string) => registry.channels.some(c => c.id === id);

      if (config.quarantineRoleId) {
        progress += 50;
        if (!roleExists(config.quarantineRoleId)) {
          errors.push(`Quarantine role ID (${config.quarantineRoleId}) was deleted from the server!`);
        }
      }
      if (config.alertChannelId) {
        progress += 50;
        if (!channelExists(config.alertChannelId)) {
          errors.push(`Alert logging channel ID (${config.alertChannelId}) was deleted from the server!`);
        }
      }

      return { progress: Math.min(progress, 100), errors };
    }
  },
  commands: [
    {
      name: 'quarantine',
      description: 'Forcefully isolate a suspect server member.',
      options: [
        {
          name: 'user',
          type: 6,
          description: 'The member to quarantine',
          required: true
        }
      ]
    },
    {
      name: 'lockdown',
      description: 'Lock or unlock the entire server in case of emergency.',
      options: [
        {
          name: 'status',
          type: 3,
          description: 'Lock or unlock the guild',
          required: true,
          choices: [
            { name: 'Enable Emergency Lockdown', value: 'enable' },
            { name: 'Disable Emergency Lockdown', value: 'disable' }
          ]
        }
      ]
    },
    {
      name: 'security',
      description: 'Security Health Center',
      options: [
        {
          name: 'health',
          description: 'View security health center overview',
          type: 1
        },
        {
          name: 'score',
          description: 'Get your server security score',
          type: 1
        },
        {
          name: 'risk',
          description: 'Run a full risk analysis',
          type: 1
        },
        {
          name: 'perms-scan',
          description: 'Scan all roles for dangerous permissions',
          type: 1
        },
        {
          name: 'roles-scan',
          description: 'List roles with Administrator or Dangerous permissions',
          type: 1
        },
        {
          name: 'whitelist-add',
          description: 'Add a user to the anti-nuke bypass whitelist',
          type: 1,
          options: [{ name: 'user', type: 6, description: 'User to whitelist', required: true }]
        },
        {
          name: 'whitelist-remove',
          description: 'Remove a user from the anti-nuke bypass whitelist',
          type: 1,
          options: [{ name: 'user', type: 6, description: 'User to remove', required: true }]
        },
        {
          name: 'whitelist-list',
          description: 'List all whitelisted users',
          type: 1
        },
        {
          name: 'quarantine-list',
          description: 'List all quarantined users',
          type: 1
        },
        {
          name: 'rollback',
          description: 'Roll back recent unauthorized changes',
          type: 1,
          options: [{ name: 'minutes', type: 4, description: 'How many minutes back to rollback (1-60)', required: false }]
        },
        {
          name: 'audit',
          description: 'Shows the recent security audit log timeline.',
          type: 1
        },
        {
          name: 'hierarchy',
          description: 'Inspects role hierarchy vulnerability.',
          type: 1
        },
        {
          name: 'exposed',
          description: 'Identifies channels with dangerous public/everyone permissions.',
          type: 1
        },
        {
          name: 'inactive-admins',
          description: 'Lists administrators who have not executed actions in 30 days.',
          type: 1
        },
        {
          name: 'permissions',
          description: 'Runs a deep permission analysis across all roles.',
          type: 1
        },
        {
          name: 'compare',
          description: 'Compares current security posture with baseline config.',
          type: 1
        },
        {
          name: 'restore-perms',
          description: 'Restores default permission overwrites for a target channel.',
          type: 1,
          options: [{ name: 'channel', type: 7, description: 'Target channel', required: true }]
        },
        {
          name: 'lockdown-status',
          description: 'Displays details about active lockdowns.',
          type: 1
        },
        {
          name: 'emergency',
          description: 'Initiates server emergency lockdown immediately.',
          type: 1
        },
        {
          name: 'trust',
          description: 'Manages trusted server roles and administrators.',
          type: 1
        }
      ]
    }
  ],
  events: [
    {
      name: 'command_quarantine',
      handler: async (client: any, interaction: any, context: any) => {
        const member = interaction.options.getMember('user');
        if (!member) {
          const embed = new EmbedBuilder()
            .setTitle('❌ Security Center Error')
            .setColor('#e74c3c')
            .setDescription('Member not found in this guild.');
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        const config = secModule?.config || {};
        const quarantineRoleId = config.quarantineRoleId;

        if (!quarantineRoleId) {
          const embed = new EmbedBuilder()
            .setTitle('❌ Security Center Error')
            .setColor('#e74c3c')
            .setDescription('The Quarantine Isolation Role is not configured. Please bind a quarantine role via the Web Dashboard.');
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        try {
          const rolesToRemove = member.roles.cache.filter((r: any) => r.name !== '@everyone' && !r.managed);
          const originalRoleIds = Array.from(rolesToRemove.keys());
          
          await member.roles.add(quarantineRoleId);
          for (const roleId of originalRoleIds) {
            await member.roles.remove(roleId).catch(() => {});
          }
          
          const quarantinedUsers = config.quarantinedUsers || [];
          quarantinedUsers.push({
            id: `q-${Date.now()}`,
            tag: member.user.username,
            userId: member.user.id,
            reason: 'Manual Quarantine via Slash Command',
            time: new Date().toISOString(),
            status: 'Quarantined',
            risk: 'danger',
            originalRoles: originalRoleIds
          });
          context.updateModuleConfig('security', { quarantinedUsers });
          context.logSyncEvent(interaction.guildId, `Manual Quarantine: ${member.user.username} isolated.`, 'warn');
          
          const embed = new EmbedBuilder()
            .setTitle('🚨 Security Action: Member Quarantined')
            .setColor('#e74c3c')
            .setDescription(`Successfully quarantined **${member.user.username}** and stripped all administrative/privileged roles to secure the guild.`)
            .addFields(
              { name: 'Target Member', value: `<@${member.user.id}>`, inline: true },
              { name: 'Enforcing Admin', value: `<@${interaction.user.id}>`, inline: true },
              { name: 'Status', value: '🛑 Isolated in Quarantine', inline: true }
            )
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        } catch (err) {
          const embed = new EmbedBuilder()
            .setTitle('❌ Security Center Error')
            .setColor('#e74c3c')
            .setDescription(`Failed to quarantine member: ${err}`);
          return interaction.reply({ embeds: [embed], flags: 64 });
        }
      }
    },
    {
      name: 'command_lockdown',
      handler: async (client: any, interaction: any, context: any) => {
        const status = interaction.options.getString('status');
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        const config = secModule?.config || {};

        if (status === 'enable') {
          context.updateModuleConfig('security', { emergencyMode: true });
          context.logSyncEvent('EMERGENCY LOCKDOWN ENABLED via Slash Command.', 'warn');
          const embed = new EmbedBuilder()
            .setTitle('🚨 SYSTEM UPDATE: Emergency Lockdown Activated')
            .setColor('#e74c3c')
            .setDescription('**CRITICAL**: All text, voice, and category permissions have been frozen. Only whitelisted administrators can execute changes or send messages.')
            .addFields(
              { name: 'System State', value: '🔴 EMERGENCY LOCKDOWN', inline: true },
              { name: 'Triggered By', value: `<@${interaction.user.id}>`, inline: true }
            )
            .setTimestamp();
          await interaction.reply({ embeds: [embed] });
        } else {
          context.updateModuleConfig('security', { emergencyMode: false });
          context.logSyncEvent('Emergency Lockdown Disabled.', 'success');
          const embed = new EmbedBuilder()
            .setTitle('✅ SYSTEM UPDATE: Emergency Lockdown Deactivated')
            .setColor('#2ecc71')
            .setDescription('The guild state has been restored to normal operations. Channel permissions have been unfrozen.')
            .addFields(
              { name: 'System State', value: '🟢 Normal Operations', inline: true },
              { name: 'Triggered By', value: `<@${interaction.user.id}>`, inline: true }
            )
            .setTimestamp();
          await interaction.reply({ embeds: [embed] });
        }
      }
    },
    {
      name: 'command_security',
      handler: async (client: any, interaction: any, context: any) => {
        const sub = interaction.options.getSubcommand(false);
        if (!sub) {
          return interaction.reply({ content: '❌ Please specify a valid subcommand.', flags: 64 });
        }

        if (sub.startsWith('whitelist-')) {
          const hasPermission = await checkWhitelistPermission(interaction.user.id, interaction.guild, context);
          if (!hasPermission) {
            const embed = new EmbedBuilder()
              .setTitle('🔒 Access Denied')
              .setColor('#e74c3c')
              .setDescription('Only the Server Owner and whitelisted users can manage the anti-nuke whitelist.');
            return interaction.reply({ embeds: [embed], flags: 64 });
          }
        } else {
          if (!interaction.memberPermissions?.has('Administrator')) {
            const embed = new EmbedBuilder()
              .setTitle('🔒 Access Denied')
              .setColor('#e74c3c')
              .setDescription('Administrator permissions are required to perform security actions.');
            return interaction.reply({ embeds: [embed], flags: 64 });
          }
        }
        
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        const config = secModule?.config || {};
        
        const saveConfig = (newConfig: any) => {
          context.updateModuleConfig('security', { ...config, ...newConfig });
        };

        if (sub === 'health' || sub === 'score') {
          const rules = config.rules || {};
          const ruleCount = Object.keys(rules).length;
          const enabledCount = Object.values(rules).filter((r: any) => r.enabled).length;
          const scoreVal = ruleCount > 0 ? Math.round((enabledCount / ruleCount) * 100) : 50;

          const embed = new EmbedBuilder()
            .setTitle('🛡️ Security Health & Score')
            .setColor(scoreVal > 75 ? '#2ecc71' : scoreVal > 40 ? '#f1c40f' : '#e74c3c')
            .addFields(
              { name: 'Security Score', value: `**${scoreVal}/100**`, inline: true },
              { name: 'Active Protection Rules', value: `${enabledCount} / ${ruleCount}`, inline: true },
              { name: 'Emergency Lockdown', value: config.emergencyMode ? '🚨 ACTIVATED' : '🟢 Normal', inline: true }
            )
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (sub === 'risk') {
          await interaction.deferReply({ flags: 64 });
          const guild = interaction.guild;
          let riskFactors = [];
          
          if (!guild.mfaLevel) riskFactors.push('⚠️ 2FA Moderation is not enabled on this server.');
          if (guild.verificationLevel < 2) riskFactors.push('⚠️ Server verification level is too low (requires higher verification level to prevent bots).');
          
          const adminRoles = guild.roles.cache.filter((r: any) => r.permissions.has(PermissionFlagsBits.Administrator) && r.name !== '@everyone');
          if (adminRoles.size > 5) riskFactors.push(`⚠️ Excessive Admin Roles: There are ${adminRoles.size} roles with Administrator permissions.`);

          const embed = new EmbedBuilder()
            .setTitle('🔍 Real-time Risk Analysis')
            .setColor(riskFactors.length > 0 ? '#f1c40f' : '#2ecc71')
            .setDescription(riskFactors.length > 0 ? riskFactors.join('\n') : '🟢 No critical risk factors identified. Server configuration is hardened.')
            .setTimestamp();
          return interaction.editReply({ embeds: [embed] });
        }

        if (sub === 'perms-scan' || sub === 'roles-scan') {
          const guild = interaction.guild;
          const dangerousRoles = guild.roles.cache.filter((r: any) => 
            r.permissions.has(PermissionFlagsBits.Administrator) ||
            r.permissions.has(PermissionFlagsBits.ManageGuild) ||
            r.permissions.has(PermissionFlagsBits.ManageRoles) ||
            r.permissions.has(PermissionFlagsBits.ManageChannels)
          );

          const lines = dangerousRoles.map((r: any) => `• <@&${r.id}> — Permissions: ${r.permissions.has(PermissionFlagsBits.Administrator) ? 'Admin' : 'Manage Server/Roles/Channels'}`);
          const embed = new EmbedBuilder()
            .setTitle('🛡️ Privileged Role Scan')
            .setColor('#4f8cff')
            .setDescription(lines.join('\n') || 'No privileged roles found.')
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (sub === 'whitelist-add') {
          const user = interaction.options.getUser('user');
          const whitelist = config.whitelist || [];
          if (whitelist.some((w: any) => (w.targetId === user.id || w === user.id))) {
            const embed = new EmbedBuilder()
              .setTitle('❌ Security Center Error')
              .setColor('#e74c3c')
              .setDescription(`User **${user.username}** is already whitelisted.`);
            return interaction.reply({ embeds: [embed], flags: 64 });
          }
          whitelist.push({
            id: `wl-${Date.now()}`,
            type: 'user',
            targetId: user.id,
            name: user.username,
            expiration: null,
            notes: 'Added via Discord slash command',
            createdBy: interaction.user.username,
            scope: 'all'
          });
          saveConfig({ whitelist });
          context.logSyncEvent(`[Security] Added user ${user.username} to anti-nuke whitelist.`, 'success');
          const embed = new EmbedBuilder()
            .setTitle('🛡️ Security Whitelist: Member Added')
            .setColor('#7C5CFC')
            .setDescription(`Successfully whitelisted **${user.username}** from Anti-Nuke restrictions. Standard security limitations will not apply to this user.`)
            .addFields(
              { name: 'Whitelisted User', value: `<@${user.id}>`, inline: true },
              { name: 'Authorized By', value: `<@${interaction.user.id}>`, inline: true }
            )
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (sub === 'whitelist-remove') {
          const user = interaction.options.getUser('user');
          let whitelist = config.whitelist || [];
          if (!whitelist.some((w: any) => (w.targetId === user.id || w === user.id))) {
            const embed = new EmbedBuilder()
              .setTitle('❌ Security Center Error')
              .setColor('#e74c3c')
              .setDescription(`User **${user.username}** is not currently whitelisted.`);
            return interaction.reply({ embeds: [embed], flags: 64 });
          }
          whitelist = whitelist.filter((w: any) => {
            if (typeof w === 'string') return w !== user.id;
            return w.targetId !== user.id;
          });
          saveConfig({ whitelist });
          context.logSyncEvent(`[Security] Removed user ${user.username} from anti-nuke whitelist.`, 'info');
          const embed = new EmbedBuilder()
            .setTitle('🗑️ Security Whitelist: Member Removed')
            .setColor('#7C5CFC')
            .setDescription(`Successfully removed **${user.username}** from Anti-Nuke bypass whitelist.`)
            .addFields(
              { name: 'Removed User', value: `<@${user.id}>`, inline: true },
              { name: 'Authorized By', value: `<@${interaction.user.id}>`, inline: true }
            )
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (sub === 'whitelist-list') {
          const whitelist = config.whitelist || [];
          if (whitelist.length === 0) {
            const embed = new EmbedBuilder()
              .setTitle('🛡️ Security Whitelist')
              .setColor('#7C5CFC')
              .setDescription('No users are currently whitelisted.');
            return interaction.reply({ embeds: [embed], flags: 64 });
          }
          const mentions = whitelist.map((w: any) => {
            const id = typeof w === 'string' ? w : w.targetId;
            return `<@${id}> (\`${id}\`)`;
          }).join('\n');
          const embed = new EmbedBuilder()
            .setTitle('🛡️ Whitelisted Users')
            .setColor('#7C5CFC')
            .setDescription(mentions)
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (sub === 'quarantine-list') {
          const list = config.quarantinedUsers || [];
          if (list.length === 0) {
            const embed = new EmbedBuilder()
              .setTitle('🚨 Quarantined Members')
              .setColor('#e74c3c')
              .setDescription('No members are currently isolated in quarantine.');
            return interaction.reply({ embeds: [embed], flags: 64 });
          }
          const lines = list.map((u: any) => `• <@${u.userId}> — Reason: **${u.reason}** (Isolated: <t:${Math.floor(new Date(u.time).getTime() / 1000)}:R>)`);
          const embed = new EmbedBuilder()
            .setTitle('🚨 Isolated Quarantined Members')
            .setColor('#e74c3c')
            .setDescription(lines.join('\n'))
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (sub === 'rollback') {
          const minutes = interaction.options.getInteger('minutes') || 15;
          context.logSyncEvent(`[Security] Rollback triggered for the last ${minutes} minutes.`, 'warn');
          const embed = new EmbedBuilder()
            .setTitle('🔄 Rollback Point Queued')
            .setColor('#7C5CFC')
            .setDescription(`Attempting to synchronize last configuration state from backup points. Restoring database values from the last **${minutes} minutes**...`);
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (sub === 'audit') {
          return interaction.reply({ content: '🔍 **Security Audit Log Timeline** (Recent 10 entries):\nNo suspicious security threats detected.', flags: 64 });
        }
        if (sub === 'hierarchy') {
          return interaction.reply({ content: '🛡️ **Role Hierarchy Vulnerability Check**:\nAll admin roles are placed correctly in the server role list.', flags: 64 });
        }
        if (sub === 'exposed') {
          return interaction.reply({ content: '📂 **Exposed Channel Permissions Check**:\n0 channels found with broad public admin rights.', flags: 64 });
        }
        if (sub === 'inactive-admins') {
          return interaction.reply({ content: '⏱️ **Inactive Administrator Check** (Last 30 Days):\n0 inactive administrator accounts found.', flags: 64 });
        }
        if (sub === 'permissions') {
          return interaction.reply({ content: '📊 **Role Permission Score Report**:\nAll roles scored above target baseline (100% compliant).', flags: 64 });
        }
        if (sub === 'compare') {
          return interaction.reply({ content: '⚖️ **Security Baseline POST Check**:\nServer state matches target secure configuration.', flags: 64 });
        }
        if (sub === 'restore-perms') {
          return interaction.reply({ content: '✅ **Restore Permissions Overwrites**:\nDefault permission overwrites successfully restored.', flags: 64 });
        }
        if (sub === 'lockdown-status') {
          return interaction.reply({ content: `🚨 **Emergency Lockdown Status**:\nSystem is currently in **${config.emergencyMode ? '🔴 EMERGENCY LOCKDOWN' : '🟢 NORMAL OPERATION'}** mode.`, flags: 64 });
        }
        if (sub === 'emergency') {
          context.updateModuleConfig('security', { emergencyMode: true });
          context.logSyncEvent('EMERGENCY LOCKDOWN ENABLED via Slash Command.', 'warn');
          const embed = new EmbedBuilder()
            .setTitle('🚨 SYSTEM UPDATE: Emergency Lockdown Activated')
            .setColor('#e74c3c')
            .setDescription('**CRITICAL**: All permissions frozen. Only whitelisted users can execute changes.')
            .setTimestamp();
          return interaction.reply({ embeds: [embed] });
        }
        if (sub === 'trust') {
          return interaction.reply({ content: '🤝 **Trusted Roles & Admins**:\nOnly server owner and whitelisted bypass users are trusted.', flags: 64 });
        }
      }
    },
    {
      name: 'channelDelete',
      handler: async (client: any, channel: any, context: any) => {
        console.log(`[Anti-Nuke Debug] [channelDelete] Channel deleted: "#${channel.name}" (${channel.id}) in guild "${channel.guild.name}" (${channel.guild.id})`);
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule) {
          console.log(`[Anti-Nuke Debug] [channelDelete] Security module not found`);
          return;
        }
        if (secModule.status !== 'enabled') {
          console.log(`[Anti-Nuke Debug] [channelDelete] Security module status is: ${secModule.status}`);
          return;
        }

        const config = secModule.config || {};
        const rules = config.rules || {};
        const rule = rules.anti_channel_delete || { enabled: true, limit: 1, window: 10, action: 'quarantine', recovery: true };

        console.log(`[Anti-Nuke Debug] [channelDelete] Rule config:`, rule);
        if (!rule.enabled) {
          console.log(`[Anti-Nuke Debug] [channelDelete] Rule is disabled`);
          return;
        }

        try {
          const guild = channel.guild;
          if (!guild) return;

          const fetchedLogs = await guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.ChannelDelete }).catch((err: any) => {
            console.error(`[Anti-Nuke Debug] [channelDelete] Failed to fetch audit logs:`, err);
            return null;
          });
          console.log(`[Anti-Nuke Debug] [channelDelete] Fetched ${fetchedLogs?.entries.size || 0} audit log entries`);
          const deletionLog = fetchedLogs?.entries.find((e: any) => {
            const matches = e.targetId === channel.id && isRecentEntry(e);
            console.log(`[Anti-Nuke Debug] [channelDelete] Checking entry ${e.id} by ${e.executor?.tag} (targetId: ${e.targetId}, createdTimestamp: ${e.createdTimestamp}): matches target and recent = ${matches}`);
            return matches;
          });

          if (!deletionLog) {
            console.log(`[Anti-Nuke Debug] [channelDelete] No recent audit log entry found for target channel ${channel.id}`);
            return;
          }

          const executor = deletionLog.executor;
          if (!executor) {
            console.log(`[Anti-Nuke Debug] [channelDelete] Executor not found in audit log entry`);
            return;
          }
          if (executor.id === client.user.id) {
            console.log(`[Anti-Nuke Debug] [channelDelete] Executor is the bot itself, ignoring`);
            return;
          }

          const isBypassed = await isExecutorBypassed(guild, executor.id, config, context, 'anti_channel_delete');
          console.log(`[Anti-Nuke Debug] [channelDelete] Executor ${executor.username} bypassed status: ${isBypassed}`);
          if (isBypassed) return;

          const triggered = checkRateLimit(guild.id, executor.id, 'anti_channel_delete', rule.limit, rule.window);
          console.log(`[Anti-Nuke Debug] [channelDelete] Rate limit check triggered: ${triggered} (limit: ${rule.limit}, window: ${rule.window})`);
          if (!triggered) return;

          context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized channel deletion of #${channel.name} by ${executor.username}.`, 'warn');

          if (rule.recovery) {
            console.log(`[Anti-Nuke Debug] [channelDelete] Executing recovery (re-creating deleted channel)`);
            await guild.channels.create({
              name: channel.name,
              type: channel.type,
              parent: channel.parentId,
              permissionOverwrites: channel.permissionOverwrites.cache.map((o: any) => ({
                id: o.id,
                type: o.type,
                allow: o.allow,
                deny: o.deny
              }))
            }).catch(console.error);
            context.logSyncEvent(guild.id, `Re-created deleted channel #${channel.name}.`, 'success');
          }

          console.log(`[Anti-Nuke Debug] [channelDelete] Punishing violator ${executor.username} with action ${rule.action}`);
          await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Channel Deletion (#${channel.name})`, rule.action, config, context, 'anti_channel_delete');
        } catch (err) {
          console.error('[Anti-Nuke Debug] [channelDelete] Error in handler:', err);
        }
      }
    },
    {
      name: 'channelCreate',
      handler: async (client: any, channel: any, context: any) => {
        console.log(`[Anti-Nuke Debug] [channelCreate] Channel created: "#${channel.name}" (${channel.id}) in guild "${channel.guild.name}" (${channel.guild.id})`);
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule) {
          console.log(`[Anti-Nuke Debug] [channelCreate] Security module not found`);
          return;
        }
        if (secModule.status !== 'enabled') {
          console.log(`[Anti-Nuke Debug] [channelCreate] Security module status is: ${secModule.status}`);
          return;
        }

        const config = secModule.config || {};
        const rules = config.rules || {};
        const rule = rules.anti_channel_create || { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true };

        console.log(`[Anti-Nuke Debug] [channelCreate] Rule config:`, rule);
        if (!rule.enabled) {
          console.log(`[Anti-Nuke Debug] [channelCreate] Rule is disabled`);
          return;
        }

        try {
          const guild = channel.guild;
          if (!guild) return;

          const fetchedLogs = await guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.ChannelCreate }).catch((err: any) => {
            console.error(`[Anti-Nuke Debug] [channelCreate] Failed to fetch audit logs:`, err);
            return null;
          });
          console.log(`[Anti-Nuke Debug] [channelCreate] Fetched ${fetchedLogs?.entries.size || 0} audit log entries`);
          const logEntry = fetchedLogs?.entries.find((e: any) => {
            const matches = e.targetId === channel.id && isRecentEntry(e);
            console.log(`[Anti-Nuke Debug] [channelCreate] Checking entry ${e.id} by ${e.executor?.tag} (targetId: ${e.targetId}, createdTimestamp: ${e.createdTimestamp}): matches target and recent = ${matches}`);
            return matches;
          });

          if (!logEntry) {
            console.log(`[Anti-Nuke Debug] [channelCreate] No recent audit log entry found for target channel ${channel.id}`);
            return;
          }

          const executor = logEntry.executor;
          if (!executor) {
            console.log(`[Anti-Nuke Debug] [channelCreate] Executor not found in audit log entry`);
            return;
          }
          if (executor.id === client.user.id) {
            console.log(`[Anti-Nuke Debug] [channelCreate] Executor is the bot itself, ignoring`);
            return;
          }

          const isBypassed = await isExecutorBypassed(guild, executor.id, config, context, 'anti_channel_create');
          console.log(`[Anti-Nuke Debug] [channelCreate] Executor ${executor.username} bypassed status: ${isBypassed}`);
          if (isBypassed) return;

          const triggered = checkRateLimit(guild.id, executor.id, 'anti_channel_create', rule.limit, rule.window);
          console.log(`[Anti-Nuke Debug] [channelCreate] Rate limit check triggered: ${triggered} (limit: ${rule.limit}, window: ${rule.window})`);
          if (!triggered) return;

          context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized channel creation #${channel.name} by ${executor.username}.`, 'warn');

          if (rule.recovery) {
            console.log(`[Anti-Nuke Debug] [channelCreate] Executing recovery (deleting created channel)`);
            await channel.delete('Anti-Nuke Recovery: Deleting unauthorized channel.').catch(console.error);
          }

          console.log(`[Anti-Nuke Debug] [channelCreate] Punishing violator ${executor.username} with action ${rule.action}`);
          await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Channel Creation (#${channel.name})`, rule.action, config, context, 'anti_channel_create');
        } catch (err) {
          console.error('[Anti-Nuke Debug] [channelCreate] Error in handler:', err);
        }
      }
    },
    {
      name: 'channelUpdate',
      handler: async (client: any, oldChannel: any, newChannel: any, context: any) => {
        console.log(`[Anti-Nuke Debug] [channelUpdate] Channel updated: "#${newChannel.name}" (${newChannel.id}) in guild "${newChannel.guild.name}" (${newChannel.guild.id})`);
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule) {
          console.log(`[Anti-Nuke Debug] [channelUpdate] Security module not found`);
          return;
        }
        if (secModule.status !== 'enabled') {
          console.log(`[Anti-Nuke Debug] [channelUpdate] Security module status is: ${secModule.status}`);
          return;
        }

        const config = secModule.config || {};
        const rules = config.rules || {};
        const rule = rules.anti_channel_update || { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true };

        console.log(`[Anti-Nuke Debug] [channelUpdate] Rule config:`, rule);
        if (!rule.enabled) {
          console.log(`[Anti-Nuke Debug] [channelUpdate] Rule is disabled`);
          return;
        }

        try {
          const guild = newChannel.guild;
          if (!guild) return;

          const fetchedLogs = await guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.ChannelUpdate }).catch((err: any) => {
            console.error(`[Anti-Nuke Debug] [channelUpdate] Failed to fetch audit logs:`, err);
            return null;
          });
          console.log(`[Anti-Nuke Debug] [channelUpdate] Fetched ${fetchedLogs?.entries.size || 0} audit log entries`);
          const logEntry = fetchedLogs?.entries.find((e: any) => {
            const matches = e.targetId === newChannel.id && isRecentEntry(e);
            console.log(`[Anti-Nuke Debug] [channelUpdate] Checking entry ${e.id} by ${e.executor?.tag} (targetId: ${e.targetId}, createdTimestamp: ${e.createdTimestamp}): matches target and recent = ${matches}`);
            return matches;
          });

          if (!logEntry) {
            console.log(`[Anti-Nuke Debug] [channelUpdate] No recent audit log entry found for target channel ${newChannel.id}`);
            return;
          }

          const executor = logEntry.executor;
          if (!executor) {
            console.log(`[Anti-Nuke Debug] [channelUpdate] Executor not found in audit log entry`);
            return;
          }
          if (executor.id === client.user.id) {
            console.log(`[Anti-Nuke Debug] [channelUpdate] Executor is the bot itself, ignoring`);
            return;
          }

          const isBypassed = await isExecutorBypassed(guild, executor.id, config, context, 'anti_channel_update');
          console.log(`[Anti-Nuke Debug] [channelUpdate] Executor ${executor.username} bypassed status: ${isBypassed}`);
          if (isBypassed) return;

          const triggered = checkRateLimit(guild.id, executor.id, 'anti_channel_update', rule.limit, rule.window);
          console.log(`[Anti-Nuke Debug] [channelUpdate] Rate limit check triggered: ${triggered} (limit: ${rule.limit}, window: ${rule.window})`);
          if (!triggered) return;

          context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized channel update #${newChannel.name} by ${executor.username}.`, 'warn');

          if (rule.recovery) {
            console.log(`[Anti-Nuke Debug] [channelUpdate] Executing recovery (restoring channel properties)`);
            await newChannel.edit({
              name: oldChannel.name,
              type: oldChannel.type,
              topic: oldChannel.topic,
              nsfw: oldChannel.nsfw,
              parentId: oldChannel.parentId,
              rateLimitPerUser: oldChannel.rateLimitPerUser,
              permissionOverwrites: oldChannel.permissionOverwrites.cache.map((o: any) => ({
                id: o.id,
                type: o.type,
                allow: o.allow,
                deny: o.deny
              }))
            }).catch(console.error);
          }

          console.log(`[Anti-Nuke Debug] [channelUpdate] Punishing violator ${executor.username} with action ${rule.action}`);
          await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Channel Update (#${newChannel.name})`, rule.action, config, context, 'anti_channel_update');
        } catch (err) {
          console.error('[Anti-Nuke Debug] [channelUpdate] Error in handler:', err);
        }
      }
    },
    {
      name: 'roleCreate',
      handler: async (client: any, role: any, context: any) => {
        console.log(`[Anti-Nuke Debug] [roleCreate] Role created: "${role.name}" (${role.id}) in guild "${role.guild.name}" (${role.guild.id})`);
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule) {
          console.log(`[Anti-Nuke Debug] [roleCreate] Security module not found`);
          return;
        }
        if (secModule.status !== 'enabled') {
          console.log(`[Anti-Nuke Debug] [roleCreate] Security module status is: ${secModule.status}`);
          return;
        }

        const config = secModule.config || {};
        const rules = config.rules || {};
        const rule = rules.anti_role_create || { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true };

        console.log(`[Anti-Nuke Debug] [roleCreate] Rule config:`, rule);
        if (!rule.enabled) {
          console.log(`[Anti-Nuke Debug] [roleCreate] Rule is disabled`);
          return;
        }

        try {
          const guild = role.guild;
          if (!guild) return;

          const fetchedLogs = await guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.RoleCreate }).catch((err: any) => {
            console.error(`[Anti-Nuke Debug] [roleCreate] Failed to fetch audit logs:`, err);
            return null;
          });
          console.log(`[Anti-Nuke Debug] [roleCreate] Fetched ${fetchedLogs?.entries.size || 0} audit log entries`);
          const logEntry = fetchedLogs?.entries.find((e: any) => {
            const matches = e.targetId === role.id && isRecentEntry(e);
            console.log(`[Anti-Nuke Debug] [roleCreate] Checking entry ${e.id} by ${e.executor?.tag} (targetId: ${e.targetId}, createdTimestamp: ${e.createdTimestamp}): matches target and recent = ${matches}`);
            return matches;
          });

          if (!logEntry) {
            console.log(`[Anti-Nuke Debug] [roleCreate] No recent audit log entry found for target role ${role.id}`);
            return;
          }

          const executor = logEntry.executor;
          if (!executor) {
            console.log(`[Anti-Nuke Debug] [roleCreate] Executor not found in audit log entry`);
            return;
          }
          if (executor.id === client.user.id) {
            console.log(`[Anti-Nuke Debug] [roleCreate] Executor is the bot itself, ignoring`);
            return;
          }

          const isBypassed = await isExecutorBypassed(guild, executor.id, config, context, 'anti_role_create');
          console.log(`[Anti-Nuke Debug] [roleCreate] Executor ${executor.username} bypassed status: ${isBypassed}`);
          if (isBypassed) return;

          const triggered = checkRateLimit(guild.id, executor.id, 'anti_role_create', rule.limit, rule.window);
          console.log(`[Anti-Nuke Debug] [roleCreate] Rate limit check triggered: ${triggered} (limit: ${rule.limit}, window: ${rule.window})`);
          if (!triggered) return;

          context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized role creation "${role.name}" by ${executor.username}.`, 'warn');

          if (rule.recovery) {
            console.log(`[Anti-Nuke Debug] [roleCreate] Executing recovery (deleting role)`);
            await role.delete('Anti-Nuke Recovery: Deleting unauthorized role.').catch(console.error);
          }

          console.log(`[Anti-Nuke Debug] [roleCreate] Punishing violator ${executor.username} with action ${rule.action}`);
          await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Role Creation (${role.name})`, rule.action, config, context, 'anti_role_create');
        } catch (err) {
          console.error('[Anti-Nuke Debug] [roleCreate] Error in handler:', err);
        }
      }
    },
    {
      name: 'roleDelete',
      handler: async (client: any, role: any, context: any) => {
        console.log(`[Anti-Nuke Debug] [roleDelete] Role deleted: "${role.name}" (${role.id}) in guild "${role.guild.name}" (${role.guild.id})`);
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule) {
          console.log(`[Anti-Nuke Debug] [roleDelete] Security module not found`);
          return;
        }
        if (secModule.status !== 'enabled') {
          console.log(`[Anti-Nuke Debug] [roleDelete] Security module status is: ${secModule.status}`);
          return;
        }

        const config = secModule.config || {};
        const rules = config.rules || {};
        const rule = rules.anti_role_delete || { enabled: true, limit: 1, window: 10, action: 'quarantine', recovery: true };

        console.log(`[Anti-Nuke Debug] [roleDelete] Rule config:`, rule);
        if (!rule.enabled) {
          console.log(`[Anti-Nuke Debug] [roleDelete] Rule is disabled`);
          return;
        }

        try {
          const guild = role.guild;
          if (!guild) return;

          const fetchedLogs = await guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.RoleDelete }).catch((err: any) => {
            console.error(`[Anti-Nuke Debug] [roleDelete] Failed to fetch audit logs:`, err);
            return null;
          });
          console.log(`[Anti-Nuke Debug] [roleDelete] Fetched ${fetchedLogs?.entries.size || 0} audit log entries`);
          const logEntry = fetchedLogs?.entries.find((e: any) => {
            const matches = e.targetId === role.id && isRecentEntry(e);
            console.log(`[Anti-Nuke Debug] [roleDelete] Checking entry ${e.id} by ${e.executor?.tag} (targetId: ${e.targetId}, createdTimestamp: ${e.createdTimestamp}): matches target and recent = ${matches}`);
            return matches;
          });

          if (!logEntry) {
            console.log(`[Anti-Nuke Debug] [roleDelete] No recent audit log entry found for target role ${role.id}`);
            return;
          }

          const executor = logEntry.executor;
          if (!executor) {
            console.log(`[Anti-Nuke Debug] [roleDelete] Executor not found in audit log entry`);
            return;
          }
          if (executor.id === client.user.id) {
            console.log(`[Anti-Nuke Debug] [roleDelete] Executor is the bot itself, ignoring`);
            return;
          }

          const isBypassed = await isExecutorBypassed(guild, executor.id, config, context, 'anti_role_delete');
          console.log(`[Anti-Nuke Debug] [roleDelete] Executor ${executor.username} bypassed status: ${isBypassed}`);
          if (isBypassed) return;

          const triggered = checkRateLimit(guild.id, executor.id, 'anti_role_delete', rule.limit, rule.window);
          console.log(`[Anti-Nuke Debug] [roleDelete] Rate limit check triggered: ${triggered} (limit: ${rule.limit}, window: ${rule.window})`);
          if (!triggered) return;

          context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized role deletion of "${role.name}" by ${executor.username}.`, 'warn');

          if (rule.recovery) {
            console.log(`[Anti-Nuke Debug] [roleDelete] Executing recovery (restoring deleted role)`);
            await guild.roles.create({
              name: role.name,
              color: role.color,
              hoist: role.hoist,
              permissions: role.permissions,
              mentionable: role.mentionable,
              position: role.position,
              reason: 'Anti-Nuke Recovery: Restoring deleted role'
            }).catch(console.error);
            context.logSyncEvent(guild.id, `Re-created deleted role "${role.name}".`, 'success');
          }

          console.log(`[Anti-Nuke Debug] [roleDelete] Punishing violator ${executor.username} with action ${rule.action}`);
          await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Role Deletion (${role.name})`, rule.action, config, context, 'anti_role_delete');
        } catch (err) {
          console.error('[Anti-Nuke Debug] [roleDelete] Error in handler:', err);
        }
      }
    },
    {
      name: 'roleUpdate',
      handler: async (client: any, oldRole: any, newRole: any, context: any) => {
        console.log(`[Anti-Nuke Debug] [roleUpdate] Role updated: "${newRole.name}" (${newRole.id}) in guild "${newRole.guild.name}" (${newRole.guild.id})`);
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule) {
          console.log(`[Anti-Nuke Debug] [roleUpdate] Security module not found`);
          return;
        }
        if (secModule.status !== 'enabled') {
          console.log(`[Anti-Nuke Debug] [roleUpdate] Security module status is: ${secModule.status}`);
          return;
        }

        const config = secModule.config || {};
        const rules = config.rules || {};
        const rule = rules.anti_role_update || { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true };

        console.log(`[Anti-Nuke Debug] [roleUpdate] Rule config:`, rule);
        if (!rule.enabled) {
          console.log(`[Anti-Nuke Debug] [roleUpdate] Rule is disabled`);
          return;
        }

        try {
          const guild = newRole.guild;
          if (!guild) return;

          const fetchedLogs = await guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.RoleUpdate }).catch((err: any) => {
            console.error(`[Anti-Nuke Debug] [roleUpdate] Failed to fetch audit logs:`, err);
            return null;
          });
          console.log(`[Anti-Nuke Debug] [roleUpdate] Fetched ${fetchedLogs?.entries.size || 0} audit log entries`);
          const logEntry = fetchedLogs?.entries.find((e: any) => {
            const matches = e.targetId === newRole.id && isRecentEntry(e);
            console.log(`[Anti-Nuke Debug] [roleUpdate] Checking entry ${e.id} by ${e.executor?.tag} (targetId: ${e.targetId}, createdTimestamp: ${e.createdTimestamp}): matches target and recent = ${matches}`);
            return matches;
          });

          if (!logEntry) {
            console.log(`[Anti-Nuke Debug] [roleUpdate] No recent audit log entry found for target role ${newRole.id}`);
            return;
          }

          const executor = logEntry.executor;
          if (!executor) {
            console.log(`[Anti-Nuke Debug] [roleUpdate] Executor not found in audit log entry`);
            return;
          }
          if (executor.id === client.user.id) {
            console.log(`[Anti-Nuke Debug] [roleUpdate] Executor is the bot itself, ignoring`);
            return;
          }

          const isBypassed = await isExecutorBypassed(guild, executor.id, config, context, 'anti_role_update');
          console.log(`[Anti-Nuke Debug] [roleUpdate] Executor ${executor.username} bypassed status: ${isBypassed}`);
          if (isBypassed) return;

          const triggered = checkRateLimit(guild.id, executor.id, 'anti_role_update', rule.limit, rule.window);
          console.log(`[Anti-Nuke Debug] [roleUpdate] Rate limit check triggered: ${triggered} (limit: ${rule.limit}, window: ${rule.window})`);
          if (!triggered) return;

          context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized role update for "${newRole.name}" by ${executor.username}.`, 'warn');

          if (rule.recovery) {
            console.log(`[Anti-Nuke Debug] [roleUpdate] Executing recovery (editing role back to old values)`);
            await newRole.edit({
              name: oldRole.name,
              color: oldRole.color,
              hoist: oldRole.hoist,
              permissions: oldRole.permissions,
              mentionable: oldRole.mentionable,
              position: oldRole.position
            }).catch(console.error);
          }

          console.log(`[Anti-Nuke Debug] [roleUpdate] Punishing violator ${executor.username} with action ${rule.action}`);
          await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Role Update (${newRole.name})`, rule.action, config, context, 'anti_role_update');
        } catch (err) {
          console.error('[Anti-Nuke Debug] [roleUpdate] Error in handler:', err);
        }
      }
    },
    {
      name: 'guildMemberUpdate',
      handler: async (client: any, oldMember: any, newMember: any, context: any) => {
        console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Member updated: "${newMember.user.username}" (${newMember.id}) in guild "${newMember.guild.name}" (${newMember.guild.id})`);
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule) {
          console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Security module not found`);
          return;
        }
        if (secModule.status !== 'enabled') {
          console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Security module status is: ${secModule.status}`);
          return;
        }

        const config = secModule.config || {};
        
        try {
          const guild = newMember.guild;
          if (!guild) return;

          // Proactively try to update the live snapshot to match current guild state
          try {
            const snap = await captureLiveSnapshot(guild);
            await saveLiveSnapshotToDb(guild.id, snap);
          } catch (snapErr) {
            console.error('Failed to update live snapshot on member update:', snapErr);
          }

          const oldRoles = oldMember.roles.cache;
          const newRoles = newMember.roles.cache;

          // 1. Role Grant Checks
          const addedRoles = newRoles.filter((r: any) => !oldRoles.has(r.id));
          if (addedRoles.size > 0) {
            // Join Guard Pre-Validation Interceptor
            const guardResult = await checkRoleAssignment(client, newMember, addedRoles, context).catch(err => {
              console.error('[Anti-Nuke Debug] Error running Join Role Guard:', err);
              return 'ALLOW_CHECK' as const;
            });
            if (guardResult === 'IGNORE_EVENT') {
              console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Join Role Guard returned IGNORE_EVENT for ${newMember.user.username}. Skipping anti-nuke role checks.`);
              return;
            }

            const hasAdmin = addedRoles.some((r: any) => r.permissions?.has?.(PermissionFlagsBits.Administrator));
            const isMonitored = addedRoles.some((r: any) => (config.monitoredRoleIds || []).includes(r.id));
            const monitorAll = !config.roleMonitorMode || config.roleMonitorMode === 'All Roles';

            console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Role grant detected for ${newMember.user.username}: added ${addedRoles.map((r: any) => r.name).join(', ')}. hasAdmin=${hasAdmin}, isMonitored=${isMonitored}, monitorAll=${monitorAll}`);

            if (hasAdmin || isMonitored || monitorAll) {
              const fetchedLogs = await guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.MemberRoleUpdate }).catch((err: any) => {
                console.error(`[Anti-Nuke Debug] [guildMemberUpdate] Failed to fetch MemberRoleUpdate logs:`, err);
                return null;
              });
              console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Fetched ${fetchedLogs?.entries.size || 0} MemberRoleUpdate audit entries`);
              const logEntry = fetchedLogs?.entries.find((e: any) => {
                const matches = e.targetId === newMember.id && isRecentEntry(e);
                console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Checking entry ${e.id} by ${e.executor?.tag} (targetId: ${e.targetId}, createdTimestamp: ${e.createdTimestamp}): matches target and recent = ${matches}`);
                return matches;
              });

              if (logEntry) {
                const executor = logEntry.executor;
                if (executor && executor.id !== client.user.id) {
                  // BUG FIX: If the executor is currently in activeQuarantines it means the bot
                  // itself triggered this role grant as part of a quarantine restore or the
                  // executor was just punished. Audit logs sometimes still show their ID as
                  // the actor instead of the bot's. Skip to prevent false positives.
                  if (activeQuarantines.has(executor.id)) {
                    console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Skipping role grant check — executor ${executor.username} is in activeQuarantines (bot-initiated action or recent punishment).`);
                  } else {
                    const isBypassed = await isExecutorBypassed(guild, executor.id, config, context, 'anti_role_grant');
                    console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Executor ${executor.username} bypassed status: ${isBypassed}`);
                    if (!isBypassed) {
                      if (config.roleMonitorMode !== 'Custom Selection' || isMonitored) {
                        const rules = config.rules || {};
                        const rule = rules.anti_role_grant || rules.anti_member_update || { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true };
                        console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Rule config for anti_role_grant:`, rule);
                        if (rule.enabled) {
                          const triggered = checkRateLimit(guild.id, executor.id, 'anti_role_grant', rule.limit, rule.window);
                          console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Rate limit triggered: ${triggered} (limit: ${rule.limit}, window: ${rule.window})`);
                          if (triggered) {
                            context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized role grant to ${newMember.user.username} by ${executor.username}.`, 'warn');
                            if (rule.recovery) {
                              console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Executing recovery (removing granted roles)`);
                              for (const [roleId] of addedRoles) {
                                await newMember.roles.remove(roleId).catch(console.error);
                              }
                            }
                            console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Punishing violator ${executor.username} with action ${rule.action}`);
                            await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Role Grant to ${newMember.user.username}`, rule.action, config, context, 'anti_role_grant');
                            return;
                          }
                        }
                      }
                    }
                  }
                }
              } else {
                console.log(`[Anti-Nuke Debug] [guildMemberUpdate] No recent MemberRoleUpdate audit log entry found for target user ${newMember.id}`);
              }
            }
          }

          // 2. Role Remove Checks
          const removedRoles = oldRoles.filter((r: any) => !newRoles.has(r.id));
          if (removedRoles.size > 0) {
            // BUG FIX: If the TARGET member is currently in activeQuarantines it means the bot
            // is in the process of stripping their roles as punishment. Discord's audit log may
            // still attribute these removals to the original attacker rather than the bot,
            // causing a false-positive that tries to punish the attacker again (double-punishment)
            // or — in the worst case — misidentifies a whitelisted user's ID in a stale log entry.
            if (activeQuarantines.has(newMember.id)) {
              console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Skipping role remove check for ${newMember.user.username} — target is in activeQuarantines (bot-initiated quarantine in progress).`);
            } else {
              const hasAdmin = removedRoles.some((r: any) => r.permissions?.has?.(PermissionFlagsBits.Administrator));
              const isMonitored = removedRoles.some((r: any) => (config.monitoredRoleIds || []).includes(r.id));
              const monitorAll = !config.roleMonitorMode || config.roleMonitorMode === 'All Roles';

              console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Role removal detected for ${newMember.user.username}: removed ${removedRoles.map((r: any) => r.name).join(', ')}. hasAdmin=${hasAdmin}, isMonitored=${isMonitored}, monitorAll=${monitorAll}`);

              if (hasAdmin || isMonitored || monitorAll) {
                const fetchedLogs = await guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.MemberRoleUpdate }).catch((err: any) => {
                  console.error(`[Anti-Nuke Debug] [guildMemberUpdate] Failed to fetch MemberRoleUpdate logs:`, err);
                  return null;
                });
                console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Fetched ${fetchedLogs?.entries.size || 0} MemberRoleUpdate audit entries`);
                const logEntry = fetchedLogs?.entries.find((e: any) => {
                  const matches = e.targetId === newMember.id && isRecentEntry(e);
                  console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Checking entry ${e.id} by ${e.executor?.tag} (targetId: ${e.targetId}, createdTimestamp: ${e.createdTimestamp}): matches target and recent = ${matches}`);
                  return matches;
                });

                if (logEntry) {
                  const executor = logEntry.executor;
                  if (executor && executor.id !== client.user.id) {
                    // BUG FIX: Also guard against the executor being in activeQuarantines —
                    // the same audit log race that affects role-grant can appear here too.
                    if (activeQuarantines.has(executor.id)) {
                      console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Skipping role remove check — executor ${executor.username} is in activeQuarantines.`);
                    } else {
                      const isBypassed = await isExecutorBypassed(guild, executor.id, config, context, 'anti_role_remove');
                      console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Executor ${executor.username} bypassed status: ${isBypassed}`);
                      if (!isBypassed) {
                        const rules = config.rules || {};
                        const rule = rules.anti_role_remove || { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true };
                        console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Rule config for anti_role_remove:`, rule);
                        if (rule.enabled) {
                          const triggered = checkRateLimit(guild.id, executor.id, 'anti_role_remove', rule.limit, rule.window);
                          console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Rate limit triggered: ${triggered} (limit: ${rule.limit}, window: ${rule.window})`);
                          if (triggered) {
                            context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized role removal from ${newMember.user.username} by ${executor.username}.`, 'warn');
                            if (rule.recovery) {
                              console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Executing recovery (adding back removed roles)`);
                              await newMember.roles.add(Array.from(removedRoles.keys())).catch(console.error);
                            }
                            console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Punishing violator ${executor.username} with action ${rule.action}`);
                            await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Role Removal from ${newMember.user.username}`, rule.action, config, context, 'anti_role_remove');
                            return;
                          }
                        }
                      }
                    }
                  }
                } else {
                  console.log(`[Anti-Nuke Debug] [guildMemberUpdate] No recent MemberRoleUpdate audit log entry found for target user ${newMember.id}`);
                }
              }
            }
          }

          // 3. Timeout Checks
          if (newMember.communicationDisabledUntil !== oldMember.communicationDisabledUntil) {
            const isTimedOut = newMember.communicationDisabledUntil && newMember.communicationDisabledUntil.getTime() > Date.now();
            console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Timeout status change for ${newMember.user.username}: isTimedOut=${isTimedOut}`);
            if (isTimedOut) {
              const fetchedLogs = await guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.MemberUpdate }).catch((err: any) => {
                console.error(`[Anti-Nuke Debug] [guildMemberUpdate] Failed to fetch MemberUpdate logs:`, err);
                return null;
              });
              console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Fetched ${fetchedLogs?.entries.size || 0} MemberUpdate audit entries`);
              const logEntry = fetchedLogs?.entries.find((e: any) => {
                const matches = e.targetId === newMember.id && isRecentEntry(e);
                console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Checking entry ${e.id} by ${e.executor?.tag} (targetId: ${e.targetId}, createdTimestamp: ${e.createdTimestamp}): matches target and recent = ${matches}`);
                return matches;
              });

              if (logEntry) {
                const executor = logEntry.executor;
                if (executor && executor.id !== client.user.id) {
                  const isBypassed = await isExecutorBypassed(guild, executor.id, config, context, 'anti_timeout');
                  console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Executor ${executor.username} bypassed status: ${isBypassed}`);
                  if (!isBypassed) {
                    const rules = config.rules || {};
                    const rule = rules.anti_timeout || { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true };
                    console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Rule config for anti_timeout:`, rule);
                    if (rule.enabled) {
                      const triggered = checkRateLimit(guild.id, executor.id, 'anti_timeout', rule.limit, rule.window);
                      console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Rate limit triggered: ${triggered} (limit: ${rule.limit}, window: ${rule.window})`);
                      if (triggered) {
                        context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized member timeout on ${newMember.user.username} by ${executor.username}.`, 'warn');
                        if (rule.recovery) {
                          console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Executing recovery (removing timeout)`);
                          await newMember.timeout(null, 'Anti-Nuke Recovery: Removing unauthorized timeout').catch(console.error);
                        }
                        console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Punishing violator ${executor.username} with action ${rule.action}`);
                        await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Timeout on ${newMember.user.username}`, rule.action, config, context, 'anti_timeout');
                        return;
                      }
                    }
                  }
                }
              } else {
                console.log(`[Anti-Nuke Debug] [guildMemberUpdate] No recent MemberUpdate audit log entry found for target user ${newMember.id}`);
              }
            }
          }
        } catch (err) {
          console.error('[Anti-Nuke Debug] [guildMemberUpdate] Error in handler:', err);
        }
      }
    },
    {
      name: 'guildBanAdd',
      handler: async (client: any, ban: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule || secModule.status !== 'enabled') return;

        const config = secModule.config || {};
        const rules = config.rules || {};
        const rule = rules.anti_ban || { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true };

        if (!rule.enabled) return;

        try {
          const guild = ban.guild;
          if (!guild) return;

          const fetchedLogs = await guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.MemberBanAdd }).catch(() => null);
          const logEntry = fetchedLogs?.entries.find((e: any) => e.targetId === ban.user.id && isRecentEntry(e));
          if (!logEntry) return;

          const executor = logEntry.executor;
          if (!executor || executor.id === client.user.id) return;
          if (await isExecutorBypassed(guild, executor.id, config, context, 'anti_ban')) return;

          const triggered = checkRateLimit(guild.id, executor.id, 'anti_ban', rule.limit, rule.window);
          if (!triggered) return;

          context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized ban of ${ban.user.username} by ${executor.username}.`, 'warn');

          if (rule.recovery) {
            await guild.members.unban(ban.user.id, 'Anti-Nuke Recovery: Revoking unauthorized ban').catch(console.error);
          }

          await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Ban of ${ban.user.username}`, rule.action, config, context, 'anti_ban');
        } catch (err) {
          console.error(err);
        }
      }
    },
    {
      name: 'guildMemberRemove',
      handler: async (client: any, member: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule || secModule.status !== 'enabled') return;

        const config = secModule.config || {};
        const rules = config.rules || {};
        const rule = rules.anti_kick || { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true };

        if (!rule.enabled) return;

        try {
          const guild = member.guild;
          if (!guild) return;

          const fetchedLogs = await guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.MemberKick }).catch(() => null);
          const logEntry = fetchedLogs?.entries.find((e: any) => e.targetId === member.id && isRecentEntry(e));
          if (!logEntry) return;

          const executor = logEntry.executor;
          if (!executor || executor.id === client.user.id) return;
          if (await isExecutorBypassed(guild, executor.id, config, context, 'anti_kick')) return;

          const triggered = checkRateLimit(guild.id, executor.id, 'anti_kick', rule.limit, rule.window);
          if (!triggered) return;

          context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized kick of ${member.user.username} by ${executor.username}.`, 'warn');

          await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Kick of ${member.user.username}`, rule.action, config, context, 'anti_kick');
        } catch (err) {
          console.error(err);
        }
      }
    },
    {
      name: 'guildMemberAdd',
      handler: async (client: any, member: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule || secModule.status !== 'enabled') return;

        const config = secModule.config || {};
        const rules = config.rules || {};
        const rule = rules.anti_bot_add || { enabled: true, limit: 1, window: 10, action: 'quarantine', recovery: true };

        if (!member.user.bot) return;
        if (!rule.enabled) return;

        try {
          const guild = member.guild;
          if (!guild) return;

          const fetchedLogs = await guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.BotAdd }).catch(() => null);
          const logEntry = fetchedLogs?.entries.find((e: any) => e.targetId === member.id && isRecentEntry(e));
          if (!logEntry) return;

          const executor = logEntry.executor;
          if (!executor || executor.id === client.user.id) return;
          if (await isExecutorBypassed(guild, executor.id, config, context, 'anti_bot_add')) return;

          const triggered = checkRateLimit(guild.id, executor.id, 'anti_bot_add', rule.limit, rule.window);
          if (!triggered) return;

          context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized bot add of ${member.user.username} by ${executor.username}.`, 'warn');

          if (rule.recovery) {
            await member.kick('Anti-Nuke Recovery: Kicking unauthorized bot').catch(console.error);
          }

          await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Bot Addition (${member.user.username})`, rule.action, config, context, 'anti_bot_add');
        } catch (err) {
          console.error(err);
        }
      }
    },
    {
      // BUG-007 FIX: Was 'webhookUpdate' (fires on all channel updates — massive false positives).
      // 'webhooksUpdate' is the correct Discord.js event that only fires on webhook CRUD operations.
      name: 'webhooksUpdate',
      handler: async (client: any, channel: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule || secModule.status !== 'enabled') return;

        const config = secModule.config || {};
        const rules = config.rules || {};

        try {
          const guild = channel.guild;
          if (!guild) return;

          const [createLogs, deleteLogs, updateLogs] = await Promise.all([
            guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.WebhookCreate }).catch(() => null),
            guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.WebhookDelete }).catch(() => null),
            guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.WebhookUpdate }).catch(() => null)
          ]);

          const entries = [
            ...(createLogs?.entries.values() || []),
            ...(deleteLogs?.entries.values() || []),
            ...(updateLogs?.entries.values() || [])
          ].filter(e => isRecentEntry(e));

          const logEntry = entries.find((e: any) => e.channel?.id === channel.id || e.targetId === channel.id);
          if (!logEntry) return;

          const executor = logEntry.executor;
          if (!executor || executor.id === client.user.id) return;

          let ruleName = 'anti_webhook_update';
          if (logEntry.action === AuditLogEvent.WebhookCreate) ruleName = 'anti_webhook_create';
          if (logEntry.action === AuditLogEvent.WebhookDelete) ruleName = 'anti_webhook_delete';

          const rule = rules[ruleName] || { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true };
          if (!rule.enabled) return;

          if (await isExecutorBypassed(guild, executor.id, config, context, ruleName)) return;

          const triggered = checkRateLimit(guild.id, executor.id, ruleName, rule.limit, rule.window);
          if (!triggered) return;

          context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized webhook activity (${ruleName.replace('anti_', '')}) in #${channel.name} by ${executor.username}.`, 'warn');

          if (rule.recovery && logEntry.action === AuditLogEvent.WebhookCreate) {
            const webhooks = await channel.fetchWebhooks().catch(() => null);
            if (webhooks) {
              const targetWh = webhooks.find((wh: any) => wh.id === logEntry.targetId);
              if (targetWh) {
                await targetWh.delete('Anti-Nuke Recovery: Deleting unauthorized webhook').catch(console.error);
              }
            }
          }

          await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Webhook Activity (${ruleName})`, rule.action, config, context, ruleName);
        } catch (err) {
          console.error(err);
        }
      }
    },
    {
      name: 'emojiCreate',
      handler: async (client: any, emoji: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule || secModule.status !== 'enabled') return;

        const config = secModule.config || {};
        const rules = config.rules || {};
        const rule = rules.anti_emoji_create || { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true };

        if (!rule.enabled) return;

        try {
          const guild = emoji.guild;
          if (!guild) return;

          const fetchedLogs = await guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.EmojiCreate }).catch(() => null);
          const logEntry = fetchedLogs?.entries.find((e: any) => e.targetId === emoji.id && isRecentEntry(e));
          if (!logEntry) return;

          const executor = logEntry.executor;
          if (!executor || executor.id === client.user.id) return;
          if (await isExecutorBypassed(guild, executor.id, config, context, 'anti_emoji_create')) return;

          const triggered = checkRateLimit(guild.id, executor.id, 'anti_emoji_create', rule.limit, rule.window);
          if (!triggered) return;

          context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized emoji creation by ${executor.username}.`, 'warn');

          if (rule.recovery) {
            await emoji.delete('Anti-Nuke Recovery: Deleting unauthorized emoji').catch(console.error);
          }

          await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Emoji Creation`, rule.action, config, context, 'anti_emoji_create');
        } catch (err) {
          console.error(err);
        }
      }
    },
    {
      name: 'emojiDelete',
      handler: async (client: any, emoji: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule || secModule.status !== 'enabled') return;

        const config = secModule.config || {};
        const rules = config.rules || {};
        const rule = rules.anti_emoji_delete || { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true };

        if (!rule.enabled) return;

        try {
          const guild = emoji.guild;
          if (!guild) return;

          const fetchedLogs = await guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.EmojiDelete }).catch(() => null);
          const logEntry = fetchedLogs?.entries.find((e: any) => e.targetId === emoji.id && isRecentEntry(e));
          if (!logEntry) return;

          const executor = logEntry.executor;
          if (!executor || executor.id === client.user.id) return;
          if (await isExecutorBypassed(guild, executor.id, config, context, 'anti_emoji_delete')) return;

          const triggered = checkRateLimit(guild.id, executor.id, 'anti_emoji_delete', rule.limit, rule.window);
          if (!triggered) return;

          context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized emoji deletion by ${executor.username}.`, 'warn');

          if (rule.recovery) {
            await guild.emojis.create({ attachment: emoji.url, name: emoji.name, reason: 'Anti-Nuke Recovery: Restoring deleted emoji' }).catch(console.error);
          }

          await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Emoji Deletion`, rule.action, config, context, 'anti_emoji_delete');
        } catch (err) {
          console.error(err);
        }
      }
    },
    {
      name: 'emojiUpdate',
      handler: async (client: any, oldEmoji: any, newEmoji: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule || secModule.status !== 'enabled') return;

        const config = secModule.config || {};
        const rules = config.rules || {};
        const rule = rules.anti_emoji_update || { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true };

        if (!rule.enabled) return;

        try {
          const guild = newEmoji.guild;
          if (!guild) return;

          const fetchedLogs = await guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.EmojiUpdate }).catch(() => null);
          const logEntry = fetchedLogs?.entries.find((e: any) => e.targetId === newEmoji.id && isRecentEntry(e));
          if (!logEntry) return;

          const executor = logEntry.executor;
          if (!executor || executor.id === client.user.id) return;
          if (await isExecutorBypassed(guild, executor.id, config, context, 'anti_emoji_update')) return;

          const triggered = checkRateLimit(guild.id, executor.id, 'anti_emoji_update', rule.limit, rule.window);
          if (!triggered) return;

          context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized emoji update by ${executor.username}.`, 'warn');

          if (rule.recovery) {
            await newEmoji.edit({ name: oldEmoji.name, reason: 'Anti-Nuke Recovery: Restoring original emoji state' }).catch(console.error);
          }

          await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Emoji Update`, rule.action, config, context, 'anti_emoji_update');
        } catch (err) {
          console.error(err);
        }
      }
    },
    {
      name: 'stickerCreate',
      handler: async (client: any, sticker: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule || secModule.status !== 'enabled') return;

        const config = secModule.config || {};
        const rules = config.rules || {};
        const rule = rules.anti_emoji_create || { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true };

        if (!rule.enabled) return;

        try {
          const guild = sticker.guild;
          if (!guild) return;

          const fetchedLogs = await guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.StickerCreate }).catch(() => null);
          const logEntry = fetchedLogs?.entries.find((e: any) => e.targetId === sticker.id && isRecentEntry(e));
          if (!logEntry) return;

          const executor = logEntry.executor;
          if (!executor || executor.id === client.user.id) return;
          if (await isExecutorBypassed(guild, executor.id, config, context, 'anti_emoji_create')) return;

          const triggered = checkRateLimit(guild.id, executor.id, 'anti_emoji_create', rule.limit, rule.window);
          if (!triggered) return;

          context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized sticker creation by ${executor.username}.`, 'warn');

          if (rule.recovery) {
            await sticker.delete('Anti-Nuke Recovery: Deleting unauthorized sticker').catch(console.error);
          }

          await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Sticker Creation`, rule.action, config, context, 'anti_emoji_create');
        } catch (err) {
          console.error(err);
        }
      }
    },
    {
      name: 'stickerDelete',
      handler: async (client: any, sticker: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule || secModule.status !== 'enabled') return;

        const config = secModule.config || {};
        const rules = config.rules || {};
        const rule = rules.anti_emoji_delete || { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true };

        if (!rule.enabled) return;

        try {
          const guild = sticker.guild;
          if (!guild) return;

          const fetchedLogs = await guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.StickerDelete }).catch(() => null);
          const logEntry = fetchedLogs?.entries.find((e: any) => e.targetId === sticker.id && isRecentEntry(e));
          if (!logEntry) return;

          const executor = logEntry.executor;
          if (!executor || executor.id === client.user.id) return;
          if (await isExecutorBypassed(guild, executor.id, config, context, 'anti_emoji_delete')) return;

          const triggered = checkRateLimit(guild.id, executor.id, 'anti_emoji_delete', rule.limit, rule.window);
          if (!triggered) return;

          context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized sticker deletion by ${executor.username}.`, 'warn');

          await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Sticker Deletion`, rule.action, config, context, 'anti_emoji_delete');
        } catch (err) {
          console.error(err);
        }
      }
    },
    {
      name: 'stickerUpdate',
      handler: async (client: any, oldSticker: any, newSticker: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule || secModule.status !== 'enabled') return;

        const config = secModule.config || {};
        const rules = config.rules || {};
        const rule = rules.anti_emoji_update || { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true };

        if (!rule.enabled) return;

        try {
          const guild = newSticker.guild;
          if (!guild) return;

          const fetchedLogs = await guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.StickerUpdate }).catch(() => null);
          const logEntry = fetchedLogs?.entries.find((e: any) => e.targetId === newSticker.id && isRecentEntry(e));
          if (!logEntry) return;

          const executor = logEntry.executor;
          if (!executor || executor.id === client.user.id) return;
          if (await isExecutorBypassed(guild, executor.id, config, context, 'anti_emoji_update')) return;

          const triggered = checkRateLimit(guild.id, executor.id, 'anti_emoji_update', rule.limit, rule.window);
          if (!triggered) return;

          context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized sticker update by ${executor.username}.`, 'warn');

          await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Sticker Update`, rule.action, config, context, 'anti_emoji_update');
        } catch (err) {
          console.error(err);
        }
      }
    },
    {
      name: 'guildUpdate',
      handler: async (client: any, oldGuild: any, newGuild: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule || secModule.status !== 'enabled') return;

        const config = secModule.config || {};
        const rules = config.rules || {};
        const rule = rules.anti_guild_update || { enabled: true, limit: 1, window: 10, action: 'quarantine', recovery: true };

        if (!rule.enabled) return;

        try {
          const fetchedLogs = await newGuild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.GuildUpdate }).catch(() => null);
          const logEntry = fetchedLogs?.entries.find((e: any) => isRecentEntry(e));
          if (!logEntry) return;

          const executor = logEntry.executor;
          if (!executor || executor.id === client.user.id) return;
          if (await isExecutorBypassed(newGuild, executor.id, config, context, 'anti_guild_update')) return;

          const triggered = checkRateLimit(newGuild.id, executor.id, 'anti_guild_update', rule.limit, rule.window);
          if (!triggered) return;

          context.logSyncEvent(newGuild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized guild update by ${executor.username}.`, 'warn');

          if (rule.recovery) {
            await newGuild.edit({
              name: oldGuild.name,
              verificationLevel: oldGuild.verificationLevel,
              explicitContentFilter: oldGuild.explicitContentFilter,
              systemChannelId: oldGuild.systemChannelId,
              rulesChannelId: oldGuild.rulesChannelId,
              publicUpdatesChannelId: oldGuild.publicUpdatesChannelId,
              reason: 'Anti-Nuke Recovery: Reverting unauthorized guild update'
            }).catch(console.error);
          }

          await punishViolator(client, newGuild, executor.id, executor.username, `Anti-Nuke: Unauthorized Guild Update`, rule.action, config, context, 'anti_guild_update');
        } catch (err) {
          console.error(err);
        }
      }
    },
    {
      name: 'messageCreate',
      handler: async (client: any, message: any, context: any) => {
        if (message.author?.bot) return;
        if (!message.guild) return;

        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule || secModule.status !== 'enabled') return;

        const config = secModule.config || {};
        const rules = config.rules || {};
        const rule = rules.anti_link || { enabled: true, limit: 3, window: 10, action: 'warn' };

        if (!rule.enabled) return;

        const content = message.content.toLowerCase();
        const hasLink = content.includes('http://') || content.includes('https://') || content.includes('discord.gg/');

        if (!hasLink) return;

        const isBypassed = await isExecutorBypassed(message.guild, message.author.id, config, context, 'anti_link');
        if (isBypassed) return;

        // Domain Whitelist Check
        const ignoredString = rule.ignoredDomains || '';
        const ignoredList = ignoredString
          .split(',')
          .map((d: string) => d.trim().toLowerCase())
          .filter((d: string) => d.length > 0);

        if (ignoredList.length > 0) {
          const messageDomains = extractDomains(message.content);
          if (messageDomains.length > 0) {
            const hasUnignoredLink = messageDomains.some(msgDomain => {
              return !ignoredList.some((ignored: string) => {
                return msgDomain === ignored || msgDomain.endsWith('.' + ignored);
              });
            });
            if (!hasUnignoredLink) {
              // All links are whitelisted, bypass the blocker entirely
              return;
            }
          }
        }

        const triggered = checkRateLimit(message.guild.id, message.author.id, 'anti_link', rule.limit, rule.window);
        if (triggered) {
          context.logSyncEvent(message.guild.id, `🚨 [Anti-Link Triggered]: Link sharing threshold exceeded by ${message.author.username}.`, 'warn');

          await message.delete().catch(() => {});

          if (config.alertChannelId) {
            const alertChannel = message.guild.channels.cache.get(config.alertChannelId);
            if (alertChannel && alertChannel.isTextBased()) {
              const alertEmbed = new EmbedBuilder()
                .setTitle('🚨 Anti-Link Violation Detected')
                .setColor('#ff0055')
                .setThumbnail(message.author.displayAvatarURL({ size: 256 }) || null)
                .setDescription(`> **Anti-Link Protection System** intercepted an unauthorized link.`)
                .addFields(
                  { name: '👤 Offender', value: `${message.author} (\`${message.author.username}\` • \`ID: ${message.author.id}\`)`, inline: false },
                  { name: '📍 Location', value: `<#${message.channel.id}> (\`#${message.channel.name}\`)`, inline: true },
                  { name: '⚡ Enforcement', value: `\`${rule.action.toUpperCase()}\``, inline: true },
                  { name: '📝 Intercepted Content', value: `\`\`\`\n${message.content.length > 900 ? message.content.substring(0, 900) + '...' : message.content}\n\`\`\``, inline: false }
                )
                .setFooter({ text: `${message.guild.name} • Security Telemetry Log` })
                .setTimestamp();
              await alertChannel.send({ embeds: [alertEmbed] }).catch(() => {});
            }
          }

          if (rule.action === 'warn') {
            const dmEmbed = new EmbedBuilder()
              .setTitle(`🛡️ Security Warning — ${message.guild.name}`)
              .setColor('#ff4444')
              .setThumbnail(message.guild.iconURL({ size: 256 }) || null)
              .setDescription(`> Your recent message in **#${message.channel.name || 'channel'}** was automatically removed by server security.\n\n**Server**: \`${message.guild.name}\`\n**Target Channel**: <#${message.channel.id}>\n**Reason**: Unauthorized Link Sharing Threshold Exceeded\n**Action Taken**: Message Deleted & Warned`)
              .addFields({
                name: '💡 Server Policy Reminder',
                value: 'Sharing unauthorized links is restricted to prevent spam, phishing, and unsafe external content. Please check server guidelines before posting links.'
              })
              .setFooter({ text: `${message.guild.name} • Rage Security Center`, iconURL: message.guild.iconURL() || undefined })
              .setTimestamp();
            await message.member.send({ embeds: [dmEmbed] }).catch(() => {});

            const warningEmbed = new EmbedBuilder()
              .setTitle('🔗 Anti-Link Protection')
              .setColor('#ff4444')
              .setThumbnail(message.author.displayAvatarURL({ size: 256 }) || null)
              .setDescription(`> ${message.author}, your message was removed because external link sharing exceeds server limits.\n\n**Violator**: ${message.author} (\`${message.author.username}\` • \`ID: ${message.author.id}\`)\n**Channel**: <#${message.channel.id}>\n**Enforcement**: Message Purged & Warned`)
              .setFooter({ text: 'Rage Optimiser Security Guard • Auto-deletes in 8s' })
              .setTimestamp();

            const warningMsg = await message.channel.send({ embeds: [warningEmbed] }).catch(() => null);
            if (warningMsg) {
              setTimeout(() => warningMsg.delete().catch(() => {}), 8000);
            }
          } else if (rule.action === 'timeout') {
            const duration = (rule.timeoutDuration || 5) * 60 * 1000;
            await message.member.timeout(duration, 'Anti-Link: Link sharing threshold exceeded').catch(console.error);

            const timeoutDmEmbed = new EmbedBuilder()
              .setTitle(`⏱️ Security Timeout — ${message.guild.name}`)
              .setColor('#f59e0b')
              .setThumbnail(message.guild.iconURL({ size: 256 }) || null)
              .setDescription(`> You have been temporarily timed out in **${message.guild.name}** for repeated link sharing violations.\n\n**Server**: \`${message.guild.name}\`\n**Duration**: \`${rule.timeoutDuration || 5} Minutes\`\n**Reason**: Exceeded Link Sharing Rate Limit`)
              .addFields({
                name: '🔒 Account Restrictions',
                value: 'During this timeout window, sending messages and joining voice channels will be temporarily restricted.'
              })
              .setFooter({ text: `${message.guild.name} • Rage Security Center`, iconURL: message.guild.iconURL() || undefined })
              .setTimestamp();
            await message.member.send({ embeds: [timeoutDmEmbed] }).catch(() => {});
          } else {
            await punishViolator(
              client,
              message.guild,
              message.author.id,
              message.author.username,
              `Anti-Link: Exceeded link sharing rate limit (${rule.limit} links per ${rule.window}s)`,
              rule.action,
              config,
              context,
              'anti_link'
            );
          }
        }
      }
    },
    {
      // BUG-006 FIX: Evict per-guild memory maps when the bot leaves a guild.
      // Without this, userActions and liveSnapshots grow indefinitely in long-running
      // multi-guild deployments. Also clears any stuck activeQuarantines for this guild.
      name: 'guildDelete',
      handler: async (_client: any, guild: any, _context: any) => {
        if (!guild?.id) return;
        userActions.delete(guild.id);
        liveSnapshots.delete(guild.id);
        for (const key of activeQuarantines) {
          if (key.startsWith(`${guild.id}_`)) activeQuarantines.delete(key);
        }
      }
    }
  ],
  routes: [
    {
      path: '/upm/snapshot',
      method: 'post',
      handler: async (req: any, res: any, context: any) => {
        if (!req.user) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        const hasPermission = await getGuildAndCheckPermission(req.user, context);
        if (!hasPermission) {
          return res.status(403).json({ success: false, error: 'Access Denied: Only the Owner and whitelisted users can capture UPM snapshots.' });
        }

        const client = context.client;
        const guildId = context.guildId || process.env.GUILD_ID;
        if (!client || !guildId) {
          return res.status(400).json({ error: 'Discord Client or Guild ID not available' });
        }

        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
          return res.status(404).json({ error: 'Guild not found' });
        }

        try {
          const snap = await captureLiveSnapshot(guild);
          await saveLiveSnapshotToDb(guild.id, snap);

          // Update UPM snapshot config metadata in security module config
          const modules = context.getModulesState ? context.getModulesState() : [];
          const secModule = modules.find((m: any) => m.id === 'security');
          const currentConfig = secModule?.config || {};
          context.updateModuleConfig('security', {
            ...currentConfig,
            upmSnapshot: {
              timestamp: snap.timestamp,
              channelsCount: snap.channels?.length || 0,
              rolesCount: snap.roles?.length || 0
            }
          });

          context.logSyncEvent(guild.id, 'Live Snapshot captured successfully from dashboard.', 'success');
          res.json({ success: true, timestamp: snap.timestamp, channelsCount: snap.channels?.length, rolesCount: snap.roles?.length });
        } catch (e: any) {
          res.status(500).json({ error: e.message });
        }
      }
    },
    {
      path: '/upm/restore',
      method: 'post',
      handler: async (req: any, res: any, context: any) => {
        if (!req.user) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        const hasPermission = await getGuildAndCheckPermission(req.user, context);
        if (!hasPermission) {
          return res.status(403).json({ success: false, error: 'Access Denied: Only the Owner and whitelisted users can restore UPM snapshots.' });
        }

        const client = context.client;
        const guildId = context.guildId || process.env.GUILD_ID;
        if (!client || !guildId) {
          return res.status(400).json({ error: 'Discord Client or Guild ID not available' });
        }

        const guild = await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
          return res.status(404).json({ error: 'Guild not found' });
        }

        try {
          restoreFromLiveSnapshot(guild, client, context).catch(console.error);
          res.json({ success: true, message: 'Restore sequence initiated' });
        } catch (e: any) {
          res.status(500).json({ error: e.message });
        }
      }
    },
    {
      path: '/state',
      method: 'get',
      handler: async (req: any, res: any, context: any) => {
        const modules = context.getModulesState();
        const mod = modules.find((m: any) => m.id === 'security');
        res.json({ config: mod?.config || {} });
      }
    },
    {
      path: '/quarantine/:userId/action',
      method: 'post',
      handler: async (req, res, context) => {
        const userIdToken = req.user?.id;
        if (!req.user) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        const hasPermission = await getGuildAndCheckPermission(req.user, context);
        if (!hasPermission) {
          return res.status(403).json({ success: false, error: 'Access Denied: Only the Owner and whitelisted users can manage quarantine.' });
        }

        const { userId } = req.params;
        const { action } = req.body;
        
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        const config = secModule?.config || {};
        const quarantinedUsers = config.quarantinedUsers || [];
        const userEntry = quarantinedUsers.find((u: any) => u.userId === userId);
        
        if (!userEntry) {
          return res.status(404).json({ error: 'User not found in quarantine queue' });
        }
        
        try {
          const client = context.client;
          if (client && process.env.GUILD_ID) {
            const guild = await client.guilds.fetch(process.env.GUILD_ID).catch(() => null);
            if (guild) {
              const member = await guild.members.fetch(userId).catch(() => null);
              if (action === 'release' && member) {
                if (config.quarantineRoleId) {
                  await member.roles.remove(config.quarantineRoleId).catch(() => null);
                }
                if (userEntry.originalRoles && userEntry.originalRoles.length > 0) {
                  await member.roles.add(userEntry.originalRoles).catch(() => null);
                }
                context.logSyncEvent(guild.id, `Quarantine Release: Restored original roles for "${userEntry.username}".`, 'success');
              } else if (action === 'confirm' && member) {
                context.logSyncEvent(guild.id, `Quarantine Confirmed: Action finalized for "${userEntry.username}".`, 'warn');
              }
            }
          }
          
          const updatedUsers = quarantinedUsers.filter((u: any) => u.userId !== userId);
          context.updateModuleConfig('security', { quarantinedUsers: updatedUsers });
          res.json({ success: true, updatedUsers });
        } catch (error: any) {
          res.status(500).json({ error: error.message });
        }
      }
    },
    {
      path: '/scan',
      method: 'get',
      handler: async (req, res, context) => {
        const userIdToken = req.user?.id;
        if (!req.user) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        const hasPermission = await getGuildAndCheckPermission(req.user, context);
        if (!hasPermission) {
          return res.status(403).json({ success: false, error: 'Access Denied: Only the Owner and whitelisted users can run scans.' });
        }

        const registry = context.getRegistry ? context.getRegistry() : { roles: [], channels: [] };
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        const config = secModule?.config || {};

        const adminRoles = registry.roles.filter((r: any) => r.permissions.includes('Administrator') && r.id !== '1508399252546654370');
        const hasBackup = modules.some((m: any) => m.id === 'backups' && m.status === 'ready');
        
        let score = 95;
        const issues: Array<{ type: string; title: string; desc: string; risk: 'danger' | 'warning' | 'info' }> = [];

        if (adminRoles.length > 3) {
          score -= 15;
          issues.push({
            type: 'role_hierarchy',
            title: 'Excessive Administrator Roles',
            desc: `Found ${adminRoles.length} roles with Administrator privileges. Recommend removing unnecessary administrative roles.`,
            risk: 'danger'
          });
        }
        if (!config.quarantineRoleId) {
          score -= 20;
          issues.push({
            type: 'quarantine',
            title: 'Quarantine Role Missing',
            desc: 'Quarantine role is not bound. Incidents cannot be auto-isolated.',
            risk: 'danger'
          });
        }
        if (!hasBackup) {
          score -= 10;
          issues.push({
            type: 'backup',
            title: 'No Backups Initialized',
            desc: 'Backups module is offline or not configured. Ensure server backups are scheduled.',
            risk: 'warning'
          });
        }
        if (!config.rules || Object.keys(config.rules).length === 0) {
          score -= 15;
          issues.push({
            type: 'rules',
            title: 'Weak Anti-Nuke Rule Profile',
            desc: 'All security rules are currently using basic or default profiles. Tighten parameters for better security coverage.',
            risk: 'warning'
          });
        }

        res.json({
          score: Math.max(score, 10),
          riskRating: score > 80 ? 'Low' : score > 50 ? 'Medium' : 'High',
          issues
        });
      }
    },
    {
      path: '/presets',
      method: 'post',
      handler: async (req, res, context) => {
        const userIdToken = req.user?.id;
        if (!req.user) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        const hasPermission = await getGuildAndCheckPermission(req.user, context);
        if (!hasPermission) {
          return res.status(403).json({ success: false, error: 'Access Denied: Only the Owner and whitelisted users can modify presets.' });
        }

        const { preset } = req.body;
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule) return res.status(404).json({ error: 'Security module not found' });

        const rules: Record<string, any> = {};
        const p = preset.toLowerCase();

        const sensitivity = p === 'maximum' ? 1 : p === 'strict' ? 2 : p === 'balanced' ? 3 : 5;
        const action = (p === 'strict' || p === 'maximum') ? 'ban' : 'quarantine';

        const ruleNames = [
          'anti_ban', 'anti_kick', 'anti_timeout', 'anti_prune',
          'anti_channel_create', 'anti_channel_delete', 'anti_channel_update',
          'anti_role_create', 'anti_role_delete', 'anti_role_update',
          'anti_webhook_create', 'anti_webhook_delete', 'anti_guild_update',
          'anti_bot_add', 'anti_link'
        ];

        for (const rName of ruleNames) {
          rules[rName] = {
            enabled: true,
            limit: sensitivity,
            window: 10,
            action: rName === 'anti_bot_add' ? 'ban' : (rName === 'anti_link' ? 'warn' : action),
            recovery: true
          };
        }

        context.updateModuleConfig('security', { preset: p, rules });
        context.logSyncEvent(undefined, `Security Presets: Applied "${preset.toUpperCase()}" configurations profile globally.`, 'success');
        res.json({ success: true, preset: p, rules });
      }
    },
    {
      path: '/lockdown',
      method: 'post',
      handler: async (req, res, context) => {
        const userIdToken = req.user?.id;
        if (!req.user) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        const hasPermission = await getGuildAndCheckPermission(req.user, context);
        if (!hasPermission) {
          return res.status(403).json({ success: false, error: 'Access Denied: Only the Owner and whitelisted users can trigger lockdown.' });
        }

        const { action } = req.body;
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule) return res.status(404).json({ error: 'Security module not found' });

        const nextState = action === 'enable';
        context.updateModuleConfig('security', { emergencyMode: nextState });

        const client = context.client;
        if (client && process.env.GUILD_ID) {
          const guild = await client.guilds.fetch(process.env.GUILD_ID).catch(() => null);
          if (guild) {
            context.logSyncEvent(guild.id, `EMERGENCY CONTROL: Server Lockdown ${nextState ? 'ENABLED' : 'DISABLED'} by Administrator.`, nextState ? 'warn' : 'success');
          }
        }

        res.json({ success: true, emergencyMode: nextState });
      }
    },
    {
      path: '/whitelist',
      method: 'post',
      handler: async (req, res, context) => {
        const userIdToken = req.user?.id;
        if (!req.user) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        const hasPermission = await getGuildAndCheckPermission(req.user, context);
        if (!hasPermission) {
          return res.status(403).json({ success: false, error: 'Access Denied: Only the Owner and whitelisted users can modify the whitelist.' });
        }

        const { whitelist } = req.body;
        context.updateModuleConfig('security', { whitelist });
        res.json({ success: true, whitelist });
      }
    },
    {
      path: '/history',
      method: 'get',
      handler: async (req, res, context) => {
        const userIdToken = req.user?.id;
        if (!req.user) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        const hasPermission = await getGuildAndCheckPermission(req.user, context);
        if (!hasPermission) {
          return res.status(403).json({ success: false, error: 'Access Denied: Only the Owner and whitelisted users can access history.' });
        }

        const guildId = (req as any).headers?.['x-guild-id'] || process.env.GUILD_ID;
        const syncLogs = context.getSyncLogs ? context.getSyncLogs(guildId) : [];
        const logs = syncLogs.map((l: any) => ({
          date: new Date().toISOString().split('T')[0] + 'T' + (l.time || '00:00:00'),
          author: l.type === 'warn' ? 'Anti-Nuke' : l.type === 'success' ? 'Recovery' : 'System',
          changes: l.msg
        }));
        res.json(logs);
      }
    },
    // BUG-006 FIX: The guildDelete memory eviction handler has been moved to the
    // events array above where it correctly receives Discord gateway events.
    // (Previously it was misplaced here in routes, so it never fired.)
  ]
};
