import { AuditLogEvent, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { checkBypassImmunity } from '../../utils/whitelistCheck.js';

export async function checkRoleAssignment(
  client: any,
  newMember: any,
  addedRoles: any,
  context: any
): Promise<'ALLOW_CHECK' | 'IGNORE_EVENT'> {
  const modules = context.getModulesState ? context.getModulesState() : [];
  const guardModule = modules.find((m: any) => m.id === 'join_role_guard');

  if (!guardModule || guardModule.status !== 'enabled' || guardModule.config?.enableJoinGuard === false) {
    return 'ALLOW_CHECK';
  }

  const config = guardModule.config || {};
  const gracePeriodSeconds = config.joinGracePeriod ?? 20;
  const ignoreOnboarding = config.ignoreOnboarding !== false;
  const ignoreScreening = config.ignoreScreening !== false;
  const ignoreTrustedBots = config.ignoreTrustedBots !== false;
  const debugMode = config.debugMode === true;

  const joinedAt = newMember.joinedTimestamp;
  if (!joinedAt) {
    if (debugMode) {
      console.log(`[JoinGuard Debug] [Guild ${newMember.guild.id}] Member ${newMember.user.username} does not have a joined timestamp. Allowing check.`);
    }
    return 'ALLOW_CHECK';
  }

  const elapsedMs = Date.now() - joinedAt;
  const gracePeriodMs = gracePeriodSeconds * 1000;
  const recentlyJoined = elapsedMs <= gracePeriodMs;

  if (!recentlyJoined) {
    if (debugMode) {
      console.log(`[JoinGuard Debug] [Guild ${newMember.guild.id}] Member ${newMember.user.username} is outside the join grace period (${Math.round(elapsedMs / 1000)}s > ${gracePeriodSeconds}s). Allowing check.`);
    }
    return 'ALLOW_CHECK';
  }

  // Check for dangerous permissions
  const hasDangerousPerms = addedRoles.some((r: any) => {
    if (!r.permissions) return false;
    const bitfield = BigInt(r.permissions.bitfield ?? r.permissions);
    return (
      (bitfield & BigInt(PermissionFlagsBits.Administrator)) !== 0n ||
      (bitfield & BigInt(PermissionFlagsBits.ManageGuild)) !== 0n ||
      (bitfield & BigInt(PermissionFlagsBits.ManageRoles)) !== 0n ||
      (bitfield & BigInt(PermissionFlagsBits.ManageChannels)) !== 0n ||
      (bitfield & BigInt(PermissionFlagsBits.KickMembers)) !== 0n ||
      (bitfield & BigInt(PermissionFlagsBits.BanMembers)) !== 0n ||
      (bitfield & BigInt(PermissionFlagsBits.ManageWebhooks)) !== 0n
    );
  });

  const guild = newMember.guild;
  const fetchedLogs = await guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.MemberRoleUpdate }).catch((err: any) => {
    if (debugMode) {
      console.error(`[JoinGuard Debug] [Guild ${guild.id}] Failed to fetch audit logs:`, err);
    }
    return null;
  });

  const isRecentAuditEntry = (entry: any, maxAgeMs = 15000) => {
    if (!entry) return false;
    const now = Date.now();
    const created = entry.createdTimestamp;
    const age = now - created;
    return age < maxAgeMs && age > -10000;
  };

  const logEntry = fetchedLogs?.entries.find((e: any) => e.targetId === newMember.id && isRecentAuditEntry(e));

  if (!logEntry) {
    // If we have dangerous permissions, we MUST NOT ignore even if there is no audit log entry
    if (hasDangerousPerms) {
      if (debugMode) {
        console.log(`[JoinGuard Debug] [Guild ${guild.id}] No audit log entry, but dangerous permissions are being granted to ${newMember.user.username}. Allowing check.`);
      }
      return 'ALLOW_CHECK';
    }

    if (ignoreOnboarding || ignoreScreening) {
      if (debugMode) {
        console.log(`[JoinGuard Debug] [Guild ${guild.id}] No matching recent audit log found for ${newMember.user.username} (inside grace period). Assuming onboarding/auto-role. Ignoring event.`);
      }
      return 'IGNORE_EVENT';
    }

    return 'ALLOW_CHECK';
  }

  const executor = logEntry.executor;
  if (!executor) {
    if (debugMode) {
      console.log(`[JoinGuard Debug] [Guild ${guild.id}] Audit log entry found but no executor present for ${newMember.user.username}. Allowing check.`);
    }
    return 'ALLOW_CHECK';
  }

  // 3 & 5. Rage Optimiser Assigned the Role
  if (executor.id === client.user.id) {
    if (hasDangerousPerms) {
      if (debugMode) {
        console.log(`[JoinGuard Debug] [Guild ${guild.id}] Rage Optimiser assigned a role with dangerous permissions to ${newMember.user.username}. Allowing check.`);
      }
      return 'ALLOW_CHECK';
    }
    if (debugMode) {
      console.log(`[JoinGuard Debug] [Guild ${guild.id}] Executor is Rage Optimiser bot itself. Ignoring event.`);
    }
    return 'IGNORE_EVENT';
  }

  // 4. Trusted Bot check
  if (executor.bot) {
    const isTrusted = await checkBypassImmunity(executor.id, guild, context, 'anti_role_grant');
    if (isTrusted && ignoreTrustedBots) {
      if (hasDangerousPerms) {
        if (debugMode) {
          console.log(`[JoinGuard Debug] [Guild ${guild.id}] Trusted bot ${executor.username} assigned a role with dangerous permissions to ${newMember.user.username}. Allowing check.`);
        }
        return 'ALLOW_CHECK';
      }
      if (debugMode) {
        console.log(`[JoinGuard Debug] [Guild ${guild.id}] Executor is trusted bot ${executor.username}. Ignoring event.`);
      }
      return 'IGNORE_EVENT';
    } else {
      if (debugMode) {
        console.log(`[JoinGuard Debug] [Guild ${guild.id}] Executor is untrusted bot ${executor.username}. Allowing check.`);
      }
      return 'ALLOW_CHECK';
    }
  }

  // 6. Whitelisted Executor
  // Whitelisted executors are humans here, we return ALLOW_CHECK so existing anti-nuke whitelisting handles it.
  const isWhitelisted = await checkBypassImmunity(executor.id, guild, context, 'anti_role_grant');
  if (isWhitelisted) {
    if (debugMode) {
      console.log(`[JoinGuard Debug] [Guild ${guild.id}] Executor is whitelisted user ${executor.username}. Allowing check.`);
    }
    return 'ALLOW_CHECK';
  }

  if (debugMode) {
    console.log(`[JoinGuard Debug] [Guild ${guild.id}] Executor is unknown/untrusted user ${executor.username}. Allowing check.`);
  }
  return 'ALLOW_CHECK';
}

export const JoinRoleAssignmentGuardManifest: ModuleManifest = {
  id: 'join_role_guard',
  name: 'Join Role Guard',
  version: '1.0.0',
  description: 'Prevents false anti-nuke triggers from Discord Onboarding, Membership Screening, Auto Roles, or Verification.',
  configSchema: {
    requiredFields: [],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      const errors: string[] = [];
      // Set default values if not present
      if (config.joinGracePeriod === undefined) config.joinGracePeriod = 20;
      if (config.enableJoinGuard === undefined) config.enableJoinGuard = true;
      if (config.ignoreOnboarding === undefined) config.ignoreOnboarding = true;
      if (config.ignoreScreening === undefined) config.ignoreScreening = true;
      if (config.ignoreTrustedBots === undefined) config.ignoreTrustedBots = true;
      if (config.debugMode === undefined) config.debugMode = false;

      return { progress: 100, errors };
    }
  },
  commands: [
    {
      name: 'joinguard',
      description: 'Configure the Join Role Assignment Guard',
      options: [
        {
          name: 'status',
          description: 'Enable or disable the Join Guard',
          type: 1, // SUB_COMMAND
          options: [
            {
              name: 'enabled',
              type: 5, // BOOLEAN
              description: 'Whether to enable the guard',
              required: true
            }
          ]
        },
        {
          name: 'config',
          description: 'Configure Join Guard settings',
          type: 1, // SUB_COMMAND
          options: [
            {
              name: 'grace_period',
              type: 4, // INTEGER
              description: 'Join grace period in seconds (default: 20)',
              required: false
            },
            {
              name: 'ignore_onboarding',
              type: 5, // BOOLEAN
              description: 'Ignore roles assigned by Discord Onboarding',
              required: false
            },
            {
              name: 'ignore_screening',
              type: 5, // BOOLEAN
              description: 'Ignore roles assigned by Membership Screening',
              required: false
            },
            {
              name: 'ignore_trusted_bots',
              type: 5, // BOOLEAN
              description: 'Ignore roles assigned by trusted bots',
              required: false
            },
            {
              name: 'debug_mode',
              type: 5, // BOOLEAN
              description: 'Enable or disable debug logging',
              required: false
            }
          ]
        },
        {
          name: 'view',
          description: 'View current Join Guard configuration',
          type: 1 // SUB_COMMAND
        }
      ]
    }
  ],
  events: [
    {
      name: 'command_joinguard',
      handler: async (client: any, interaction: any, context: any) => {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '<:shield:1532403012751065179> Administrator permissions required.', flags: 64 });
        }

        const modules = context.getModulesState ? context.getModulesState() : [];
        const mod = modules.find((m: any) => m.id === 'join_role_guard');
        if (!mod) {
          return interaction.reply({ content: '<:wrong:1532390628330307634> Join Guard module not found.', flags: 64 });
        }

        const sub = interaction.options.getSubcommand(false);
        if (!sub) {
          return interaction.reply({ content: '<:wrong:1532390628330307634> Please specify a subcommand (status, config, or view).', flags: 64 });
        }
        const config = mod.config || {};

        if (sub === 'status') {
          const enabled = interaction.options.getBoolean('enabled');
          config.enableJoinGuard = enabled;
          context.updateModuleConfig('join_role_guard', config);
          return interaction.reply({
            content: `<a:approved:1532390590707142956> Join Guard has been **${enabled ? 'enabled' : 'disabled'}**.`,
            flags: 64
          });
        }

        if (sub === 'config') {
          const gracePeriod = interaction.options.getInteger('grace_period');
          const ignoreOnboarding = interaction.options.getBoolean('ignore_onboarding');
          const ignoreScreening = interaction.options.getBoolean('ignore_screening');
          const ignoreTrustedBots = interaction.options.getBoolean('ignore_trusted_bots');
          const debugMode = interaction.options.getBoolean('debug_mode');

          if (gracePeriod !== null) config.joinGracePeriod = gracePeriod;
          if (ignoreOnboarding !== null) config.ignoreOnboarding = ignoreOnboarding;
          if (ignoreScreening !== null) config.ignoreScreening = ignoreScreening;
          if (ignoreTrustedBots !== null) config.ignoreTrustedBots = ignoreTrustedBots;
          if (debugMode !== null) config.debugMode = debugMode;

          context.updateModuleConfig('join_role_guard', config);
          return interaction.reply({
            content: '<a:approved:1532390590707142956> Join Guard configuration updated successfully.',
            flags: 64
          });
        }

        if (sub === 'view') {
          const embed = new EmbedBuilder()
            .setTitle('<:shield:1532403012751065179> Join Role Guard Configuration')
            .setColor(0x99CC00)
            .addFields(
              { name: 'Status', value: config.enableJoinGuard !== false ? '<a:approved:1532390590707142956> Enabled' : '<:wrong:1532390628330307634> Disabled', inline: true },
              { name: 'Grace Period', value: `\`${config.joinGracePeriod ?? 20} seconds\``, inline: true },
              { name: 'Ignore Onboarding', value: config.ignoreOnboarding !== false ? '<a:approved:1532390590707142956> Yes' : '<:wrong:1532390628330307634> No', inline: true },
              { name: 'Ignore Screening', value: config.ignoreScreening !== false ? '<a:approved:1532390590707142956> Yes' : '<:wrong:1532390628330307634> No', inline: true },
              { name: 'Ignore Trusted Bots', value: config.ignoreTrustedBots !== false ? '<a:approved:1532390590707142956> Yes' : '<:wrong:1532390628330307634> No', inline: true },
              { name: 'Debug Mode', value: config.debugMode ? '<a:approved:1532390590707142956> Enabled' : '<:wrong:1532390628330307634> Disabled', inline: true }
            )
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        }
      }
    }
  ]
};
