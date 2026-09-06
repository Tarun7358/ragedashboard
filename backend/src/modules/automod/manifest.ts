import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import {
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  ButtonStyle
} from 'discord.js';
import { Database } from '../../core/Database.js';
import { DashboardSyncService } from '../../services/DashboardSyncService.js';
import {
  Embeds, Colors, buildStatusCard, createLimeEmbed, buildLimeOverviewCard, buildMinimalAction, buildLimeWarnCard,
  VERIFIED_ICON, WRONG_ICON, SHIELD_ICON, GAVEL_ICON, LINK_ICON, INFO_ICON, CONFIG_ICON, VIP_ICON, BOT_ICON
} from '../../core/UIFactory.js';
import { checkWhitelistPermission, isOwnerOrExtraOwner } from '../../utils/whitelistCheck.js';
import { isUrlCommandBypass, isMessageAntiLinkHandled, markMessageAntiLinkHandled } from '../../utils/antiLinkBypass.js';
import { resetRateLimit } from '../security/manifest.js';

function userTag(user: any): string {
  return user?.globalName ?? user?.username ?? user?.tag ?? user?.id ?? 'Unknown';
}

function sanitizeLinksFromContent(text: string): string {
  if (!text) return '';
  const GLOBAL_LINK_REGEX = /(?:https?:\/\/|www\.|discord(?:app)?\.(?:gg|com\/invite)\/|[a-zA-Z0-9-]+\.(?:com|net|org|gg|io|me|xyz|co|uk)\b)[^\s]*/gi;
  return text.replace(GLOBAL_LINK_REGEX, '`[link removed]`').trim();
}

import crypto from 'crypto';

interface UserMessageLog {
  timestamp: number;
  contentHash: string;
  channelId: string;
}

export class SlidingWindowSpamDetector {
  private static userWindows = new Map<string, UserMessageLog[]>();
  private static cleanupTimer: NodeJS.Timeout | null = null;

  public static init() {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => this.pruneOldLogs(), 5000);
  }

  private static pruneOldLogs() {
    const now = Date.now();
    for (const [key, logs] of this.userWindows.entries()) {
      const valid = logs.filter(l => now - l.timestamp < 10000);
      if (valid.length === 0) {
        this.userWindows.delete(key);
      } else {
        this.userWindows.set(key, valid);
      }
    }
  }

  public static checkSpam(guildId: string, userId: string, channelId: string, content: string): { isSpam: boolean; reason: string } {
    this.init();
    const key = `${guildId}_${userId}`;
    const now = Date.now();
    const hash = crypto.createHash('md5').update(content.trim().toLowerCase()).digest('hex');

    if (!this.userWindows.has(key)) {
      this.userWindows.set(key, []);
    }

    const logs = this.userWindows.get(key)!;
    logs.push({ timestamp: now, contentHash: hash, channelId });

    const recentLogs = logs.filter(l => now - l.timestamp < 5000);

    const burstLogs = recentLogs.filter(l => now - l.timestamp < 3000);
    if (burstLogs.length >= 5) {
      return { isSpam: true, reason: `Rapid message burst (${burstLogs.length} msgs / 3s)` };
    }

    const sameContentLogs = recentLogs.filter(l => l.contentHash === hash);
    if (sameContentLogs.length >= 3 && content.length > 5) {
      return { isSpam: true, reason: `Repeated duplicate message (${sameContentLogs.length}x / 5s)` };
    }

    const distinctChannels = new Set(recentLogs.filter(l => l.contentHash === hash).map(l => l.channelId));
    if (distinctChannels.size >= 3) {
      return { isSpam: true, reason: `Cross-channel spam raid (${distinctChannels.size} channels / 5s)` };
    }

    return { isSpam: false, reason: '' };
  }
}

// ── In-Memory Link Violation Tracker ──────────────────────────────────────────
const userLinkViolations = new Map<string, Map<string, { count: number; lastTime: number }>>();

export function incrementLinkViolations(guildId: string, userId: string): number {
  const now = Date.now();
  if (!userLinkViolations.has(guildId)) {
    userLinkViolations.set(guildId, new Map());
  }
  const guildMap = userLinkViolations.get(guildId)!;
  const userRecord = guildMap.get(userId) || { count: 0, lastTime: now };

  if (now - userRecord.lastTime > 24 * 60 * 60 * 1000) {
    userRecord.count = 0;
  }

  userRecord.count += 1;
  userRecord.lastTime = now;
  guildMap.set(userId, userRecord);
  return userRecord.count;
}

export function resetLinkViolations(guildId: string, userId: string): void {
  const guildMap = userLinkViolations.get(guildId);
  if (guildMap) {
    guildMap.delete(userId);
  }
}

export function resetAllLinkViolationsForGuild(guildId: string): void {
  userLinkViolations.delete(guildId);
}

export function getLinkViolations(guildId: string, userId: string): number {
  const guildMap = userLinkViolations.get(guildId);
  return guildMap?.get(userId)?.count || 0;
}

// ── Default AntiLink Configuration ───────────────────────────────────────────
export function getDefaultAntiLinkConfig() {
  return {
    autoModEnabled: true,
    blockLinks: true,
    antiLinkEnabled: true,
    antiLinkLimit: 5,
    limit: 5,
    punishment: 'warn', // Default action: warn on 1-4, enforce on 5
    allowInvites: false,
    ignoredChannels: [] as string[],
    ignoredRoles: [] as string[],
    ignoredDomains: [] as string[], // No default domains — strictly controlled by user
    antiEveryoneEnabled: true,
    antiSpamEnabled: false,
    maxSpamMessages: 5,
    spamWindowSeconds: 5,
    spamAction: 'mute',
    badWords: [] as string[],
    preventCapsSpam: false,
    maxMentions: 0,
    maxEmojis: 0
  };
}

// ── Interactive Anti-Link Configurable GUI Builder ────────────────────────────
export function buildAntiLinkDashboardGUI(guild: any, config: any) {
  const isEnabled = config.blockLinks !== false && config.antiLinkEnabled !== false;
  const limit = typeof config.antiLinkLimit === 'number' && config.antiLinkLimit > 0
    ? config.antiLinkLimit
    : (typeof config.limit === 'number' && config.limit > 0 ? config.limit : 5);

  const action = (config.punishment || 'warn').toLowerCase();
  const allowInvites = Boolean(config.allowInvites);
  const ignoredChannels: string[] = config.ignoredChannels || [];
  const ignoredRoles: string[] = config.ignoredRoles || [];
  const ignoredDomains: string[] = config.ignoredDomains || [];

  const channelsDisplay = ignoredChannels.length > 0
    ? ignoredChannels.slice(0, 4).map(id => `<#${id}>`).join(', ') + (ignoredChannels.length > 4 ? ` **(+${ignoredChannels.length - 4} more)**` : '')
    : '**None (All channels protected)**';

  const rolesDisplay = ignoredRoles.length > 0
    ? ignoredRoles.slice(0, 4).map(id => `<@&${id}>`).join(', ') + (ignoredRoles.length > 4 ? ` **(+${ignoredRoles.length - 4} more)**` : '')
    : '**None (All roles filtered)**';

  const domainsDisplay = ignoredDomains.length > 0
    ? ignoredDomains.map(d => `\`${d}\``).join(', ')
    : '**None (Strict full URL filter)**';

  const actionLabels: Record<string, string> = {
    warn: '<a:warning:1546155457981452441> WARN & PURGE MESSAGE (DEFAULT)',
    mute: '🔇 MUTE / TIMEOUT (10 MINUTES)',
    kick: '👢 KICK MEMBER',
    ban: '🔨 BAN MEMBER PERMANENTLY',
    delete: '🗑️ DELETE MESSAGE ONLY'
  };

  const actionLabel = actionLabels[action] || action.toUpperCase();

  const embed = new EmbedBuilder()
    .setTitle('<:link:1532620952087826602> Rage Optimiser • Anti-Link Control Center')
    .setColor(0x2B2D31)
    .setDescription([
      `>>> ${[
        `${isEnabled ? VERIFIED_ICON : WRONG_ICON} Anti-Link Interceptor & Threat Neutralizer • \`${isEnabled ? 'ACTIVE' : 'DISABLED'}\``,
        `${allowInvites ? VERIFIED_ICON : WRONG_ICON} Discord Invites Filter • \`${allowInvites ? 'ALLOWED' : 'BLOCKED'}\``,
        `<:security:1546142576984203336> Violation Enforcement Threshold • \`${limit} Violations\``,
        `<:gavel:1532621057318584380> Threat Mitigation Policy • \`${actionLabel}\``
      ].join('\n')}`,
      '',
      `**Autonomous Anti-Link Interceptor & Threat Neutralizer • Zero-Trust Baseline**`,
      '',
      `**Exemptions & Whitelists:**`,
      `• **Ignored Channels (${ignoredChannels.length}):** ${channelsDisplay}`,
      `• **Ignored Roles (${ignoredRoles.length}):** ${rolesDisplay}`,
      `• **Allowed Domains (${ignoredDomains.length}):** ${domainsDisplay}`
    ].join('\n'))
    .setThumbnail(guild?.iconURL({ size: 256 }) || undefined)
    .setFooter({ text: 'Rage Optimiser Enterprise • Anti-Link Sentinel' })
    .setTimestamp();

  // Row 1: Core Toggles & Limit Adjuster
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_al_toggle')
      .setLabel(isEnabled ? 'Disable Anti-Link' : 'Enable Anti-Link')
      .setStyle(isEnabled ? ButtonStyle.Danger : ButtonStyle.Secondary)
      .setEmoji(isEnabled ? '1546155193303957504' : '1546142576984203336'),
    new ButtonBuilder()
      .setCustomId('btn_al_action_cycle')
      .setLabel(`Action: ${action.toUpperCase()}`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('1532621057318584380'),
    new ButtonBuilder()
      .setCustomId('btn_al_limit_cycle')
      .setLabel(`Limit: ${limit} Violations`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('1546142576984203336'),
    new ButtonBuilder()
      .setCustomId('btn_al_toggle_invites')
      .setLabel(allowInvites ? 'Block Invites' : 'Allow Invites')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(allowInvites ? '1546155193303957504' : '1546142576984203336')
  );

  // Row 2: Management & Reset Actions
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_al_channels')
      .setLabel(`Channels (${ignoredChannels.length})`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('1527647157371535420'),
    new ButtonBuilder()
      .setCustomId('btn_al_roles')
      .setLabel(`Roles (${ignoredRoles.length})`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('1532425712844144701'),
    new ButtonBuilder()
      .setCustomId('btn_al_clearwarns')
      .setLabel('Reset Warnings')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('1532429110775779459'),
    new ButtonBuilder()
      .setCustomId('btn_al_refresh')
      .setLabel('Refresh GUI')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('1546142576984203336')
  );

  // Row 3: Action Dropdown Selector
  const row3 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('select_al_action')
      .setPlaceholder(`⚡ Select Punishment Action (Current: ${action.toUpperCase()})`)
      .addOptions([
        {
          label: 'Warn & Delete Message (Default)',
          value: 'warn',
          description: 'Purges message & sends temporary warning card + DM notice',
          emoji: '⚠️',
          default: action === 'warn'
        },
        {
          label: 'Mute / Timeout Member (10 Minutes)',
          value: 'mute',
          description: 'Purges message & applies 10-minute server timeout',
          emoji: '🔇',
          default: action === 'mute' || action === 'timeout'
        },
        {
          label: 'Kick Member from Server',
          value: 'kick',
          description: 'Purges message & kicks the violator immediately',
          emoji: '👢',
          default: action === 'kick'
        },
        {
          label: 'Ban Member Permanently',
          value: 'ban',
          description: 'Purges message & issues permanent server ban',
          emoji: '🔨',
          default: action === 'ban'
        },
        {
          label: 'Delete Message Only (Silent Purge)',
          value: 'delete',
          description: 'Silently purges link without warning notifications',
          emoji: '🗑️',
          default: action === 'delete'
        }
      ])
  );

  // Row 4: Limit Dropdown Selector
  const row4 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('select_al_limit')
      .setPlaceholder(`🎯 Select Violation Limit Threshold (Current: ${limit} Violations)`)
      .addOptions([
        {
          label: '1 Violation (Instant Action on 1st Link)',
          value: '1',
          description: 'Enforces punishment on the very first unauthorized link',
          emoji: '⚡',
          default: limit === 1
        },
        {
          label: '2 Violations (1 Warning, Punish on 2nd)',
          value: '2',
          description: 'Allows 1 warning before enforcing punishment',
          emoji: '2️⃣',
          default: limit === 2
        },
        {
          label: '3 Violations (2 Warnings, Punish on 3rd)',
          value: '3',
          description: 'Allows 2 warnings before enforcing punishment',
          emoji: '3️⃣',
          default: limit === 3
        },
        {
          label: '5 Violations (Default — 4 Warnings, Punish on 5th)',
          value: '5',
          description: 'Recommended standard: 4 warnings, punishment on 5th',
          emoji: '5️⃣',
          default: limit === 5
        },
        {
          label: '10 Violations (Lenient — 9 Warnings)',
          value: '10',
          description: 'Lenient threshold for active community servers',
          emoji: '🔟',
          default: limit === 10
        }
      ])
  );

  return {
    embeds: [embed],
    components: [row1, row2, row3, row4]
  };
}

// ── Master AutoMod Manifest ───────────────────────────────────────────────────
export const AutomodManifest: ModuleManifest = {
  id: 'automod',
  name: 'AI Automod',
  version: '2.0.0',
  description: 'Enterprise Anti-Link Protection Engine, AutoMod spam filtering, bad words, and configurable interactive GUI dashboard.',
  configSchema: {
    requiredFields: [],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      const errors: string[] = [];
      let progress = 0;

      const channelExists = (id: string) => registry.channels.some(c => c.id === id);

      if (config.logChannelId) {
        progress += 40;
        if (!channelExists(config.logChannelId)) errors.push(`Mod logs channel ID (${config.logChannelId}) was deleted!`);
      }

      if (config.badWords && config.badWords.length > 0) progress += 20;
      if (config.blockLinks) progress += 20;
      if (config.punishment) progress += 20;

      return { progress: Math.min(100, progress || 50), errors };
    }
  },
  commands: [
    {
      name: 'antilink',
      description: 'Enterprise Anti-Link filter configuration & interactive control dashboard',
      options: [
        {
          name: 'gui',
          description: 'Open interactive Anti-Link configuration control dashboard',
          type: 1
        },
        {
          name: 'enable',
          description: 'Enable Anti-Link filter',
          type: 1
        },
        {
          name: 'disable',
          description: 'Disable Anti-Link filter',
          type: 1
        },
        {
          name: 'limit',
          description: 'Set number of link violations before punishment (default: 5)',
          type: 1,
          options: [
            {
              name: 'count',
              type: 4,
              description: 'Violation count threshold (1-100, default: 5)',
              required: true
            }
          ]
        },
        {
          name: 'action',
          description: 'Set punishment action when limit is reached (default: warn)',
          type: 1,
          options: [
            {
              name: 'type',
              type: 3,
              description: 'Punishment action',
              required: true,
              choices: [
                { name: 'Warn & Delete Message (Default)', value: 'warn' },
                { name: 'Mute Member (10m Timeout)', value: 'mute' },
                { name: 'Kick Member', value: 'kick' },
                { name: 'Ban Member', value: 'ban' },
                { name: 'Delete Message Only', value: 'delete' }
              ]
            }
          ]
        },
        {
          name: 'allow_invites',
          description: 'Allow or block Discord invite links (discord.gg / discord.com/invite)',
          type: 1,
          options: [
            {
              name: 'allow',
              type: 5,
              description: 'True to allow invites, False to block (default: False)',
              required: true
            }
          ]
        },
        {
          name: 'clearwarns',
          description: 'Clear/reset Anti-Link violation warnings for a member',
          type: 1,
          options: [
            {
              name: 'user',
              type: 6,
              description: 'Target member to clear violation warnings for',
              required: true
            }
          ]
        },
        {
          name: 'warnings',
          description: 'View active Anti-Link violation count for a member',
          type: 1,
          options: [
            {
              name: 'user',
              type: 6,
              description: 'Target member to check warnings for (defaults to yourself)',
              required: false
            }
          ]
        },
        {
          name: 'ignore-channel',
          description: 'Manage ignored channels for AntiLink bypass',
          type: 1,
          options: [
            {
              name: 'action',
              type: 3,
              description: 'Action (add / remove / list)',
              required: true,
              choices: [
                { name: 'Add Ignored Channel', value: 'add' },
                { name: 'Remove Ignored Channel', value: 'remove' },
                { name: 'List Ignored Channels', value: 'list' }
              ]
            },
            {
              name: 'channel',
              type: 7,
              description: 'Target text channel to ignore',
              required: false
            }
          ]
        },
        {
          name: 'ignore-role',
          description: 'Manage ignored roles for AntiLink bypass',
          type: 1,
          options: [
            {
              name: 'action',
              type: 3,
              description: 'Action (add / remove / list)',
              required: true,
              choices: [
                { name: 'Add Ignored Role', value: 'add' },
                { name: 'Remove Ignored Role', value: 'remove' },
                { name: 'List Ignored Roles', value: 'list' }
              ]
            },
            {
              name: 'role',
              type: 8,
              description: 'Target role allowed to post links',
              required: false
            }
          ]
        }
      ]
    },
    {
      name: 'automod',
      description: 'Enterprise AutoMod spam & content filtering engine',
      options: [
        {
          name: 'status',
          description: 'View complete AutoMod status matrix, rules & bypasses',
          type: 1
        },
        {
          name: 'antilink',
          description: 'Open or configure Anti-Link filter settings',
          type: 1
        },
        {
          name: 'antispam',
          description: 'Configure Anti-Spam rate limiter & punishment',
          type: 1,
          options: [
            {
              name: 'enable',
              type: 5,
              description: 'Enable or disable Anti-Spam rate limiter',
              required: false
            },
            {
              name: 'max_messages',
              type: 4,
              description: 'Maximum messages allowed within time window (e.g. 5)',
              required: false
            },
            {
              name: 'window_seconds',
              type: 4,
              description: 'Time window duration in seconds (e.g. 5)',
              required: false
            },
            {
              name: 'action',
              type: 3,
              description: 'Punishment action on spam trigger',
              required: false,
              choices: [
                { name: 'Delete Message Only', value: 'delete' },
                { name: 'Warn & Delete Message', value: 'warn' },
                { name: 'Mute Member (Timeout)', value: 'mute' },
                { name: 'Kick Member', value: 'kick' },
                { name: 'Ban Member', value: 'ban' }
              ]
            }
          ]
        }
      ]
    }
  ],
  events: [
    // ─── COMMAND: ANTILINK ────────────────────────────────────────────────────
    {
      name: 'command_antilink',
      handler: async (client: any, interaction: any, context: any) => {
        const guild = interaction.guild;
        if (!guild) return interaction.reply({ content: '<a:wrong:1546155193303957504> AntiLink commands must be run inside a server.', flags: 64 });

        const isOwnerOrExtra = await isOwnerOrExtraOwner(interaction.user.id, guild);
        if (!isOwnerOrExtra) {
          return interaction.reply({
            content: '<a:wrong:1546155193303957504> **Access Denied**: Only the **Server Owner** and **Extra Owners** can configure Anti-Link settings.',
            flags: 64
          });
        }

        const modules = context.getModulesState ? context.getModulesState(guild.id) : [];
        const amMod = modules.find((m: any) => m.id === 'automod');
        const config = { ...getDefaultAntiLinkConfig(), ...(amMod?.config || {}) };
        const saveConfig = (newCfg: any) => context.updateModuleConfig('automod', { ...config, ...newCfg });

        const sub = interaction.options?.getSubcommand?.(false) || interaction.parsed?.args?.[0]?.toLowerCase();
        const rawArgs = interaction.parsed?.args || [];

        // 1. ENABLE / ON
        if (sub === 'enable' || sub === 'on') {
          config.blockLinks = true;
          config.antiLinkEnabled = true;
          saveConfig(config);
          context.logSyncEvent(`AntiLink: Enabled filter by ${interaction.user.tag}`, 'success');
          return interaction.reply({
            content: `<a:approved:1532390590707142956> **Anti-Link Protection Enabled**\n• Default Limit: \`${config.antiLinkLimit || 5} Violations\`\n• Punishment Action: \`${(config.punishment || 'warn').toUpperCase()}\``,
            flags: 64
          });
        }

        // 2. DISABLE / OFF
        if (sub === 'disable' || sub === 'off') {
          config.blockLinks = false;
          config.antiLinkEnabled = false;
          saveConfig(config);
          context.logSyncEvent(`AntiLink: Disabled filter by ${interaction.user.tag}`, 'warn');
          return interaction.reply({
            content: `<a:wrong:1546155193303957504> **Anti-Link Protection Disabled**. Links will no longer be intercepted.`,
            flags: 64
          });
        }

        // 3. LIMIT
        if (sub === 'limit' || (!isNaN(parseInt(sub, 10)) && parseInt(sub, 10) > 0)) {
          let count = interaction.options?.getInteger?.('count');
          if (!count) {
            const parsedNum = parseInt(sub, 10) || parseInt(rawArgs[1], 10);
            if (!isNaN(parsedNum) && parsedNum > 0 && parsedNum <= 100) {
              count = parsedNum;
            }
          }

          if (!count) {
            return interaction.reply({
              content: `<a:wrong:1546155193303957504> Please specify a valid violation limit between 1 and 100. Example: \`r!antilink limit 5\``,
              flags: 64
            });
          }

          config.antiLinkLimit = count;
          config.limit = count;
          saveConfig(config);
          context.logSyncEvent(`AntiLink: Violation threshold updated to ${count} by ${interaction.user.tag}`, 'info');
          return interaction.reply({
            content: `<a:approved:1532390590707142956> **Anti-Link Violation Limit Set**\n• Users will receive warnings on violations 1 to ${count - 1}.\n• Violation #${count} will trigger **\`${(config.punishment || 'warn').toUpperCase()}\`**.`,
            flags: 64
          });
        }

        // 4. ACTION
        if (sub === 'action') {
          const actionOpt = interaction.options?.getString?.('type') || rawArgs[1]?.toLowerCase();
          if (!actionOpt || !['warn', 'mute', 'kick', 'ban', 'delete', 'timeout'].includes(actionOpt)) {
            return interaction.reply({
              content: `<a:wrong:1546155193303957504> Please specify a valid action: \`warn\`, \`mute\`, \`kick\`, \`ban\`, or \`delete\`. Example: \`r!antilink action warn\``,
              flags: 64
            });
          }

          config.punishment = actionOpt === 'timeout' ? 'mute' : actionOpt;
          saveConfig(config);
          context.logSyncEvent(`AntiLink: Punishment updated to ${config.punishment} by ${interaction.user.tag}`, 'info');
          return interaction.reply({
            content: `<a:approved:1532390590707142956> **Anti-Link Punishment Action Set**\n• Punishment on limit reach (**${config.antiLinkLimit || 5} violations**): **\`${config.punishment.toUpperCase()}\`**`,
            flags: 64
          });
        }

        // 5. ALLOW INVITES
        if (sub === 'allow_invites' || sub === 'invites') {
          let allow = interaction.options?.getBoolean?.('allow');
          if (allow === null || allow === undefined) {
            const str = rawArgs[1]?.toLowerCase();
            allow = str === 'true' || str === 'allow' || str === 'on' || str === 'yes';
          }

          config.allowInvites = allow;
          saveConfig(config);
          context.logSyncEvent(`AntiLink: Discord invites set to ${allow ? 'ALLOWED' : 'BLOCKED'} by ${interaction.user.tag}`, 'info');
          return interaction.reply({
            content: `<a:approved:1532390590707142956> **Discord Invite Links**: ${allow ? '<a:approved:1532390590707142956> **Allowed**' : '<a:wrong:1546155193303957504> **Blocked (Deleted)**'}`,
            flags: 64
          });
        }

        // 6. CLEAR WARNS
        if (sub === 'clearwarns' || sub === 'clearwarn' || sub === 'resetwarns') {
          const targetUser = interaction.options?.getUser?.('user') || interaction.parsed?.mentions?.users?.first?.() || (interaction as any)?.message?.mentions?.users?.first?.();
          if (!targetUser) {
            return interaction.reply({
              content: `<a:wrong:1546155193303957504> Please mention a target user to reset warnings for. Example: \`r!antilink clearwarns @user\``,
              flags: 64
            });
          }

          resetLinkViolations(guild.id, targetUser.id);
          resetRateLimit(guild.id, targetUser.id, 'anti_link');
          context.logSyncEvent(`AntiLink: Cleared link warnings for ${targetUser.tag}`, 'info');
          return interaction.reply({
            content: `<a:approved:1532390590707142956> Cleared all Anti-Link violations for ${targetUser} (\`${targetUser.id}\`). Current violations: \`0/${config.antiLinkLimit || 5}\``,
            flags: 64
          });
        }

        // 7. VIEW WARNINGS
        if (sub === 'warnings' || sub === 'warns') {
          const targetUser = interaction.options?.getUser?.('user') || interaction.parsed?.mentions?.users?.first?.() || (interaction as any)?.message?.mentions?.users?.first?.() || interaction.user;
          const currentCount = getLinkViolations(guild.id, targetUser.id);
          const maxLimit = config.antiLinkLimit || 5;
          return interaction.reply({
            embeds: [createLimeEmbed({
              title: `<:link:1532620952087826602> Anti-Link Violations Status`,
              description: [
                `> **Member**: ${targetUser} (\`${userTag(targetUser)}\` • \`ID: ${targetUser.id}\`)`,
                ``,
                `• **Violations Logged**: \`${currentCount} / ${maxLimit}\``,
                `• **Threshold Status**: ${currentCount > 0 ? `<a:wrong:1546155193303957504> **${currentCount} Active Violation(s)**` : '<a:approved:1532390590707142956> **No Violations (Clean)**'}`,
                `• **Punishment on Limit**: **\`${(config.punishment || 'warn').toUpperCase()}\`**`
              ].join('\n')
            })],
            flags: 64
          });
        }

        // 8. IGNORE CHANNEL
        if (['ignore-channel', 'ignorechannel', 'channel'].includes(sub)) {
          const action = interaction.options?.getString?.('action') || rawArgs[1]?.toLowerCase();
          let targetChannel: any = interaction.options?.getChannel?.('channel') || interaction.message?.mentions?.channels?.first();
          if (!targetChannel && rawArgs[2]) {
            const cleanId = rawArgs[2].replace(/[<#>]/g, '').trim();
            targetChannel = guild.channels.cache.get(cleanId);
          }

          let ignoredChannels: string[] = config.ignoredChannels || [];

          if (action === 'add') {
            if (!targetChannel) return interaction.reply({ content: '<a:wrong:1546155193303957504> Please mention a text channel to ignore. Example: `r!antilink ignore-channel add #general`', flags: 64 });
            if (!ignoredChannels.includes(targetChannel.id)) {
              ignoredChannels.push(targetChannel.id);
              saveConfig({ ignoredChannels });
            }
            return interaction.reply({ content: `<a:approved:1532390590707142956> Added ${targetChannel} to AntiLink **ignored channels**. Links posted here are bypassed.`, flags: 64 });
          }

          if (action === 'remove') {
            if (!targetChannel) return interaction.reply({ content: '<a:wrong:1546155193303957504> Please mention a text channel to remove.', flags: 64 });
            ignoredChannels = ignoredChannels.filter((id: string) => id !== targetChannel.id);
            saveConfig({ ignoredChannels });
            return interaction.reply({ content: `<a:approved:1532390590707142956> Removed ${targetChannel} from AntiLink **ignored channels**.`, flags: 64 });
          }

          // list
          const list = ignoredChannels.map((id: string) => `<#${id}>`).join(', ') || '**No ignored channels.**';
          return interaction.reply({ content: `<:link:1532620952087826602> **AntiLink Ignored Channels**:\n${list}`, flags: 64 });
        }

        // 9. IGNORE ROLE
        if (['ignore-role', 'ignorerole', 'role'].includes(sub)) {
          const action = interaction.options?.getString?.('action') || rawArgs[1]?.toLowerCase();
          let targetRole: any = interaction.options?.getRole?.('role') || interaction.message?.mentions?.roles?.first();
          if (!targetRole && rawArgs[2]) {
            const cleanId = rawArgs[2].replace(/[<@&>]/g, '').trim();
            targetRole = guild.roles.cache.get(cleanId);
          }

          let ignoredRoles: string[] = config.ignoredRoles || [];

          if (action === 'add') {
            if (!targetRole) return interaction.reply({ content: '<a:wrong:1546155193303957504> Please mention a role to ignore. Example: `r!antilink ignore-role add @Staff`', flags: 64 });
            if (!ignoredRoles.includes(targetRole.id)) {
              ignoredRoles.push(targetRole.id);
              saveConfig({ ignoredRoles });
            }
            return interaction.reply({ content: `<a:security:1546142576984203336> Added ${targetRole} to AntiLink **ignored roles**. Members with this role can post links.`, flags: 64 });
          }

          if (action === 'remove') {
            if (!targetRole) return interaction.reply({ content: '<a:wrong:1546155193303957504> Please mention a role to remove.', flags: 64 });
            ignoredRoles = ignoredRoles.filter((id: string) => id !== targetRole.id);
            saveConfig({ ignoredRoles });
            return interaction.reply({ content: `<a:security:1546142576984203336> Removed ${targetRole} from AntiLink **ignored roles**.`, flags: 64 });
          }

          const list = ignoredRoles.map((id: string) => `<@&${id}>`).join(', ') || '**No ignored roles.**';
          return interaction.reply({ content: `<a:security:1546142576984203336> **AntiLink Ignored Roles**:\n${list}`, flags: 64 });
        }

        // DEFAULT: OPEN CONFIGURABLE GUI DASHBOARD
        const gui = buildAntiLinkDashboardGUI(guild, config);
        return interaction.reply({ embeds: gui.embeds, components: gui.components });
      }
    },

    // ─── COMMAND: AUTOMOD ─────────────────────────────────────────────────────
    {
      name: 'command_automod',
      handler: async (client: any, interaction: any, context: any) => {
        const guild = interaction.guild;
        if (!guild) return interaction.reply({ content: '<a:wrong:1546155193303957504> AutoMod commands must be run inside a server.', flags: 64 });

        const isOwnerOrExtra = await isOwnerOrExtraOwner(interaction.user.id, guild);
        if (!isOwnerOrExtra) {
          return interaction.reply({
            content: '<a:wrong:1546155193303957504> Access Denied: Only the Guild Owner and Extra Owners can configure AutoMod.',
            flags: 64
          });
        }

        const modules = context.getModulesState ? context.getModulesState(guild.id) : [];
        const amMod = modules.find((m: any) => m.id === 'automod');
        const config = { ...getDefaultAntiLinkConfig(), ...(amMod?.config || {}) };

        const sub = interaction.options?.getSubcommand?.(false) || interaction.parsed?.args?.[0]?.toLowerCase() || 'status';

        // Redirect antilink subcommand to antilink GUI
        if (sub === 'antilink' || sub === 'al') {
          const gui = buildAntiLinkDashboardGUI(guild, config);
          return interaction.reply({ embeds: gui.embeds, components: gui.components });
        }

        // ── Subcommand: Anti-Spam Rate Limiter ─────────────────────────
        if (sub === 'antispam' || sub === 'spam') {
          const rawArgs = interaction.parsed?.args || [];
          const enableOpt = interaction.options?.getBoolean?.('enable');
          const maxOpt = interaction.options?.getInteger?.('max_messages');
          const winOpt = interaction.options?.getInteger?.('window_seconds');
          const actOpt = interaction.options?.getString?.('action');

          let updated = false;
          if (enableOpt !== null && enableOpt !== undefined) {
            config.antiSpamEnabled = enableOpt;
            updated = true;
          } else if (rawArgs[1] === 'enable' || rawArgs[1] === 'on') {
            config.antiSpamEnabled = true;
            updated = true;
          } else if (rawArgs[1] === 'disable' || rawArgs[1] === 'off') {
            config.antiSpamEnabled = false;
            updated = true;
          }

          if (maxOpt) { config.maxSpamMessages = maxOpt; updated = true; }
          if (winOpt) { config.spamWindowSeconds = winOpt; updated = true; }
          if (actOpt) { config.spamAction = actOpt; updated = true; }

          if (updated) {
            context.updateModuleConfig('automod', config);
            context.logSyncEvent(`AutoMod: Updated AntiSpam config by ${interaction.user.tag}`, 'info');
          }

          const spamEmbed = new EmbedBuilder()
            .setColor(0x2B2D31)
            .setTitle('Anti-Spam Rate Limiter Configuration')
            .setDescription([
              `>>> ${[
                `• **Status**: ${config.antiSpamEnabled !== false ? '<a:security:1546142576984203336> **Enabled**' : '<a:wrong:1546155193303957504> **Disabled**'}`,
                `• **Max Message Burst**: \`${config.maxSpamMessages || 5} messages\``,
                `• **Time Window**: \`${config.spamWindowSeconds || 5} seconds\``,
                `• **Punishment Action**: \`${(config.spamAction || 'mute').toUpperCase()}\``
              ].join('\n')}`
            ].join('\n'))
            .setFooter({ text: 'Rage Optimiser Enterprise • Anti-Spam' })
            .setTimestamp();

          return interaction.reply({
            embeds: [spamEmbed],
            flags: 64
          });
        }

        // ── Subcommand: Bad Words / Blacklist ───────────────────────────
        if (['badwords', 'badword', 'blacklist', 'words', 'word'].includes(sub)) {
          const rawArgs = interaction.parsed?.args || [];
          const action = rawArgs[1]?.toLowerCase();
          const targetWord = rawArgs.slice(2).join(' ').trim().toLowerCase();

          let badWords: string[] = config.badWords || [];

          if (action === 'add') {
            if (!targetWord) return interaction.reply({ content: '<a:wrong:1546155193303957504> Please specify a word or phrase to blacklist. Example: `r!automod badwords add badword`', flags: 64 });
            if (!badWords.includes(targetWord)) {
              badWords.push(targetWord);
              config.badWords = badWords;
              context.updateModuleConfig('automod', config);
            }
            return interaction.reply({ content: `<a:security:1546142576984203336> Added \`${targetWord}\` to AutoMod blacklisted words.`, flags: 64 });
          }

          if (action === 'remove' || action === 'del') {
            if (!targetWord) return interaction.reply({ content: '<a:wrong:1546155193303957504> Please specify a word to remove.', flags: 64 });
            badWords = badWords.filter((w: string) => w.toLowerCase() !== targetWord);
            config.badWords = badWords;
            context.updateModuleConfig('automod', config);
            return interaction.reply({ content: `<a:security:1546142576984203336> Removed \`${targetWord}\` from AutoMod blacklisted words.`, flags: 64 });
          }

          // list
          const list = badWords.map((w: string) => `\`${w}\``).join(', ') || '**No blacklisted words configured.**';
          const badWordsEmbed = new EmbedBuilder()
            .setColor(0x2B2D31)
            .setTitle('AutoMod Blacklisted Words')
            .setDescription(`>>> ${list}`)
            .setFooter({ text: 'Rage Optimiser Enterprise • AutoMod Badwords' })
            .setTimestamp();

          return interaction.reply({
            embeds: [badWordsEmbed],
            flags: 64
          });
        }

        // ── Subcommand: Caps Spam Filter ────────────────────────────────
        if (['caps', 'capsspam', 'anticaps'].includes(sub)) {
          const rawArgs = interaction.parsed?.args || [];
          const state = rawArgs[1]?.toLowerCase();

          if (state === 'enable' || state === 'on') {
            config.preventCapsSpam = true;
          } else if (state === 'disable' || state === 'off') {
            config.preventCapsSpam = false;
          } else {
            config.preventCapsSpam = !config.preventCapsSpam;
          }

          context.updateModuleConfig('automod', config);
          return interaction.reply({
            content: `<a:security:1546142576984203336> Caps Spam Filter is now **${config.preventCapsSpam ? 'ENABLED' : 'DISABLED'}**.`,
            flags: 64
          });
        }

        // ── Subcommand: Max Mentions Filter ─────────────────────────────
        if (['mentions', 'maxmentions', 'antimention'].includes(sub)) {
          const rawArgs = interaction.parsed?.args || [];
          const count = parseInt(rawArgs[1], 10);

          if (!isNaN(count) && count >= 0) {
            config.maxMentions = count;
            context.updateModuleConfig('automod', config);
            return interaction.reply({
              content: `<a:security:1546142576984203336> Max allowed mentions set to **${count === 0 ? 'Disabled (No limit)' : `${count} mentions`}**.`,
              flags: 64
            });
          }

          return interaction.reply({
            content: `<a:security:1546142576984203336> Current Max Mentions threshold: **\`${config.maxMentions || 0}\`** **(0 = disabled)**. Set with \`r!automod mentions <number>\``,
            flags: 64
          });
        }

        // ── Subcommand: Max Emojis Filter ───────────────────────────────
        if (['emojis', 'maxemojis', 'antiemoji'].includes(sub)) {
          const rawArgs = interaction.parsed?.args || [];
          const count = parseInt(rawArgs[1], 10);

          if (!isNaN(count) && count >= 0) {
            config.maxEmojis = count;
            context.updateModuleConfig('automod', config);
            return interaction.reply({
              content: `<a:security:1546142576984203336> Max allowed emojis per message set to **${count === 0 ? 'Disabled (No limit)' : `${count} emojis`}**.`,
              flags: 64
            });
          }

          return interaction.reply({
            content: `<a:security:1546142576984203336> Current Max Emojis threshold: **\`${config.maxEmojis || 0}\`** **(0 = disabled)**. Set with \`r!automod emojis <number>\``,
            flags: 64
          });
        }

        // ── Subcommand: Block Attachments / Files / Media Filter ────────
        if (['attachments', 'attachment', 'files', 'file', 'images', 'image', 'media', 'antiattachment', 'antiattachments'].includes(sub)) {
          const rawArgs = interaction.parsed?.args || [];
          const state = rawArgs[1]?.toLowerCase();
          const targetChannel = interaction.mentions?.channels?.first?.() || (rawArgs[2] ? interaction.guild.channels.cache.get(rawArgs[2].replace(/[<#>]/g, '')) : (rawArgs[1]?.startsWith('<#') ? interaction.guild.channels.cache.get(rawArgs[1].replace(/[<#>]/g, '')) : null));

          if (targetChannel) {
            config.blockedAttachmentChannels = config.blockedAttachmentChannels || [];
            const channelId = targetChannel.id;
            const exists = config.blockedAttachmentChannels.includes(channelId);

            if (state === 'enable' || state === 'on' || state === 'add' || (!exists && state !== 'disable' && state !== 'off' && state !== 'remove')) {
              if (!exists) config.blockedAttachmentChannels.push(channelId);
              context.updateModuleConfig('automod', config);
              return interaction.reply({
                content: `<a:security:1546142576984203336> File & Image attachments are now **BLOCKED** in <#${channelId}>.`,
                flags: 64
              });
            } else {
              config.blockedAttachmentChannels = config.blockedAttachmentChannels.filter((id: string) => id !== channelId);
              context.updateModuleConfig('automod', config);
              return interaction.reply({
                content: `<a:security:1546142576984203336> File & Image attachments are now **ALLOWED** in <#${channelId}>.`,
                flags: 64
              });
            }
          } else {
            if (state === 'enable' || state === 'on') {
              config.blockAttachments = true;
            } else if (state === 'disable' || state === 'off') {
              config.blockAttachments = false;
            } else {
              config.blockAttachments = !config.blockAttachments;
            }

            context.updateModuleConfig('automod', config);
            return interaction.reply({
              content: `<a:security:1546142576984203336> Server-wide File & Image attachments filter is now **${config.blockAttachments ? 'ENABLED (Files/Images Blocked)' : 'DISABLED (Files Allowed)'}**.`,
              flags: 64
            });
          }
        }

        // AutoMod Status Overview
        const isBlockLinks = config.blockLinks !== false && config.antiLinkEnabled !== false;
        const statusIcon = (amMod?.status || 'enabled') === 'enabled' ? VERIFIED_ICON : WRONG_ICON;
        const antilinkIcon = isBlockLinks ? VERIFIED_ICON : WRONG_ICON;
        const isBlockFiles = Boolean(config.blockAttachments || (config.blockedAttachmentChannels && config.blockedAttachmentChannels.length > 0));

        const overviewEmbed = new EmbedBuilder()
          .setColor(0x2B2D31)
          .setTitle(`${GAVEL_ICON} AutoMod & Chat Defense Control Center`)
          .setDescription([
            `>>> ${[
              `${statusIcon} **AutoMod Engine**: \`${amMod?.status || 'enabled'}\``,
              `${antilinkIcon} **Anti-Link Filter**: ${isBlockLinks ? '**Enabled**' : '**Disabled**'} (Limit: \`${config.antiLinkLimit || 5}\`, Action: \`${(config.punishment || 'warn').toUpperCase()}\`)`,
              `${VERIFIED_ICON} **Anti-Spam Limiter**: ${config.antiSpamEnabled !== false ? '**Enabled**' : '**Disabled**'} (\`${config.maxSpamMessages || 5} msgs / ${config.spamWindowSeconds || 5}s\`)`,
              `${isBlockFiles ? VERIFIED_ICON : WRONG_ICON} **Attachment & Image Blocker**: ${config.blockAttachments ? '**Server-wide Blocked**' : (config.blockedAttachmentChannels?.length ? `**${config.blockedAttachmentChannels.length} Channels Protected**` : '**Disabled**')}`,
              `${config.preventCapsSpam ? VERIFIED_ICON : WRONG_ICON} **Caps Spam Filter**: ${config.preventCapsSpam ? '**Enabled**' : '**Disabled**'}`,
              `${config.maxMentions ? VERIFIED_ICON : WRONG_ICON} **Mention Limit**: ${config.maxMentions ? `**${config.maxMentions} Max**` : '**Disabled**'}`,
              `${config.maxEmojis ? VERIFIED_ICON : WRONG_ICON} **Emoji Limit**: ${config.maxEmojis ? `**${config.maxEmojis} Max**` : '**Disabled**'}`,
              `${config.badWords?.length ? VERIFIED_ICON : WRONG_ICON} **Blacklisted Words**: \`${config.badWords?.length || 0} active\``
            ].join('\n')}`,
            '',
            `**Automated Content Filtering & Intelligence Matrix • Realtime Shield**`,
            '',
            `**Quick Commands:**`,
            `• \`r!automod attachments <on|off> [#channel]\` — Block file & image uploads`,
            `• \`r!antilink\` — Open interactive Anti-Link Dashboard GUI`,
            `• \`r!automod antispam [on|off] [max] [window]\` — Configure Anti-Spam`,
            `• \`r!automod badwords <add|remove|list> <word>\` — Manage blacklisted words`,
            `• \`r!automod caps <on|off>\` — Toggle caps spam filter`,
            `• \`r!automod mentions <count>\` — Set maximum mentions per message`,
            `• \`r!automod emojis <count>\` — Set maximum emojis per message`
          ].join('\n'))
          .setFooter({ text: 'Rage Optimiser Enterprise • AutoMod Protection' })
          .setTimestamp();

        return interaction.reply({ embeds: [overviewEmbed] });
      }
    },

    // ─── INTERACTION: ANTILINK GUI BUTTONS & SELECT MENUS ─────────────────────
    {
      name: 'button_al_generic',
      handler: async (client: any, interaction: any, context: any) => {
        try {
          const guild = interaction.guild;
          if (!guild) return;

          const isAuthorized = await isOwnerOrExtraOwner(interaction.user.id, guild);
          if (!isAuthorized) {
            return interaction.reply({
              content: `${WRONG_ICON} **Access Denied**: Anti-Link controls are restricted to the **Server Owner** and **Extra Owners**.`,
              flags: 64,
              ephemeral: true
            }).catch(() => { });
          }

          const modules = context.getModulesState ? context.getModulesState(guild.id) : [];
          const amMod = modules.find((m: any) => m.id === 'automod');
          const config = { ...getDefaultAntiLinkConfig(), ...(amMod?.config || {}) };
          const saveConfig = (newCfg: any) => context.updateModuleConfig('automod', { ...config, ...newCfg });

          const customId = interaction.customId;

          // 1. TOGGLE FILTER ENABLE / DISABLE
          if (customId === 'btn_al_toggle') {
            const current = config.blockLinks !== false && config.antiLinkEnabled !== false;
            const nextState = !current;
            config.blockLinks = nextState;
            config.antiLinkEnabled = nextState;
            saveConfig(config);
            context.logSyncEvent(`AntiLink: Toggled filter to ${nextState ? 'ENABLED' : 'DISABLED'} by ${interaction.user.tag}`, 'info');

            const updatedGui = buildAntiLinkDashboardGUI(guild, config);
            return interaction.update({ embeds: updatedGui.embeds, components: updatedGui.components }).catch(() => { });
          }

          // 2. CYCLE PUNISHMENT ACTION
          if (customId === 'btn_al_action_cycle') {
            const actions = ['warn', 'mute', 'kick', 'ban', 'delete'];
            const currentAction = (config.punishment || 'warn').toLowerCase();
            const nextIdx = (actions.indexOf(currentAction) + 1) % actions.length;
            config.punishment = actions[nextIdx];
            saveConfig(config);
            context.logSyncEvent(`AntiLink: Cycled punishment action to ${config.punishment} by ${interaction.user.tag}`, 'info');

            const updatedGui = buildAntiLinkDashboardGUI(guild, config);
            return interaction.update({ embeds: updatedGui.embeds, components: updatedGui.components }).catch(() => { });
          }

          // 3. CYCLE LIMIT THRESHOLD
          if (customId === 'btn_al_limit_cycle') {
            const limits = [1, 2, 3, 5, 10];
            const currentLimit = typeof config.antiLinkLimit === 'number' ? config.antiLinkLimit : 5;
            const nextIdx = (limits.indexOf(currentLimit) + 1) % limits.length;
            config.antiLinkLimit = limits[nextIdx];
            config.limit = limits[nextIdx];
            saveConfig(config);
            context.logSyncEvent(`AntiLink: Cycled violation limit to ${config.antiLinkLimit} by ${interaction.user.tag}`, 'info');

            const updatedGui = buildAntiLinkDashboardGUI(guild, config);
            return interaction.update({ embeds: updatedGui.embeds, components: updatedGui.components }).catch(() => { });
          }

          // 4. TOGGLE DISCORD INVITES FILTER
          if (customId === 'btn_al_toggle_invites') {
            config.allowInvites = !config.allowInvites;
            saveConfig(config);
            context.logSyncEvent(`AntiLink: Toggled allowInvites to ${config.allowInvites} by ${interaction.user.tag}`, 'info');

            const updatedGui = buildAntiLinkDashboardGUI(guild, config);
            return interaction.update({ embeds: updatedGui.embeds, components: updatedGui.components }).catch(() => { });
          }

          // 5. MANAGE CHANNELS INFO
          if (customId === 'btn_al_channels') {
            const list = (config.ignoredChannels || []).map((id: string) => `<#${id}>`).join(', ') || '**No ignored channels.**';
            return interaction.reply({
              content: `<:link:1532620952087826602> **AntiLink Ignored Channels**:\n${list}\n\n> **To Add**: \`r!antilink ignore-channel add #channel\`\n> **To Remove**: \`r!antilink ignore-channel remove #channel\``,
              flags: 64,
              ephemeral: true
            }).catch(() => { });
          }

          // 6. MANAGE ROLES INFO
          if (customId === 'btn_al_roles') {
            const list = (config.ignoredRoles || []).map((id: string) => `<@&${id}>`).join(', ') || '**No ignored roles.**';
            return interaction.reply({
              content: `<:security:1546142576984203336> **AntiLink Ignored Roles**:\n${list}\n\n> **To Add**: \`r!antilink ignore-role add @Role\`\n> **To Remove**: \`r!antilink ignore-role remove @Role\``,
              flags: 64,
              ephemeral: true
            }).catch(() => { });
          }

          // 7. CLEAR ALL WARNINGS
          if (customId === 'btn_al_clearwarns') {
            resetAllLinkViolationsForGuild(guild.id);
            context.logSyncEvent(`AntiLink: Reset all active user link violation records in ${guild.name}`, 'info');
            return interaction.reply({
              content: `<a:approved:1532390590707142956> **All User Violation Records Reset!** All members in **${guild.name}** now have 0 active link violation warnings.`,
              flags: 64,
              ephemeral: true
            }).catch(() => { });
          }

          // 8. REFRESH DASHBOARD
          if (customId === 'btn_al_refresh') {
            const updatedGui = buildAntiLinkDashboardGUI(guild, config);
            return interaction.update({ embeds: updatedGui.embeds, components: updatedGui.components }).catch(() => { });
          }

          // 9. SELECT ACTION MENU
          if (customId === 'select_al_action' && interaction.isStringSelectMenu && interaction.isStringSelectMenu()) {
            const selectedAction = interaction.values?.[0];
            if (selectedAction) {
              config.punishment = selectedAction;
              saveConfig(config);
              context.logSyncEvent(`AntiLink: Selected punishment ${selectedAction} via GUI menu by ${interaction.user.tag}`, 'info');
              const updatedGui = buildAntiLinkDashboardGUI(guild, config);
              return interaction.update({ embeds: updatedGui.embeds, components: updatedGui.components }).catch(() => { });
            }
          }

          // 10. SELECT LIMIT MENU
          if (customId === 'select_al_limit' && interaction.isStringSelectMenu && interaction.isStringSelectMenu()) {
            const selectedLimit = parseInt(interaction.values?.[0], 10);
            if (!isNaN(selectedLimit) && selectedLimit > 0) {
              config.antiLinkLimit = selectedLimit;
              config.limit = selectedLimit;
              saveConfig(config);
              context.logSyncEvent(`AntiLink: Selected violation limit ${selectedLimit} via GUI menu by ${interaction.user.tag}`, 'info');
              const updatedGui = buildAntiLinkDashboardGUI(guild, config);
              return interaction.update({ embeds: updatedGui.embeds, components: updatedGui.components }).catch(() => { });
            }
          }
        } catch (err) {
          console.error('[AntiLink GUI Interaction Error]:', err);
        }
      }
    },

    // ─── MESSAGE CREATE: REAL-TIME INTERCEPTION PIPELINE ──────────────────────
    {
      name: 'messageCreate',
      handler: async (client: any, message: any, context: any) => {
        if (message.author.bot) return;
        if (!message.guild) return;

        const modules = context.getModulesState ? context.getModulesState(message.guild.id) : [];
        const amMod = modules.find((m: any) => m.id === 'automod');
        if (!amMod || amMod.status !== 'enabled') return;

        const config = { ...getDefaultAntiLinkConfig(), ...(amMod.config || {}) };
        if (config.autoModEnabled === false) return;

        const content = message.content.toLowerCase();
        let deleted = false;
        let reason = '';

        // 1. AntiLink Filter with Ignored Channels & Ignored Roles Bypass
        const blockLinks = config.blockLinks !== false && config.antiLinkEnabled !== false;

        // Strip Discord custom/animated emojis (<:name:id>, <a:name:id>), mentions, channels and timestamp tags so emojis NEVER get flagged as links
        const contentForLinkCheck = content
          .replace(/<a?:[a-zA-Z0-9_]+:\d+>/g, ' ')
          .replace(/<@!?[0-9]+>/g, ' ')
          .replace(/<@&[0-9]+>/g, ' ')
          .replace(/<#[0-9]+>/g, ' ')
          .replace(/<t:\d+(:[tTdDfFR])?>/g, ' ')
          .trim();

        const LINK_REGEX = /(?:https?:\/\/|ftps?:\/\/|www\.|discord(?:app)?\.(?:gg|com\/invite)\/|[a-zA-Z0-9-]+\.(?:com|net|org|gg|io|me|xyz|co|uk|in|info|online|site|app|tech|store|top|live|shop|vip|fun|club|pro|link|bot|ai|dev|[a-zA-Z]{2,})\b)/i;
        const hasLink = LINK_REGEX.test(contentForLinkCheck) ||
          contentForLinkCheck.includes('http://') ||
          contentForLinkCheck.includes('https://') ||
          contentForLinkCheck.includes('www.') ||
          contentForLinkCheck.includes('discord.gg/') ||
          contentForLinkCheck.includes('discord.com/invite/') ||
          contentForLinkCheck.includes('dsc.gg/');

        if (blockLinks && hasLink) {
          if ((message as any)._antiLinkHandled || isMessageAntiLinkHandled(message.id)) return;

          // Check Discord Invite bypass rule
          const isOnlyDiscordInvite = (contentForLinkCheck.includes('discord.gg/') || contentForLinkCheck.includes('discord.com/invite/')) && !contentForLinkCheck.includes('http://') && !contentForLinkCheck.includes('https://');
          if (isOnlyDiscordInvite && config.allowInvites) {
            return;
          }

          // Check User-Configured Domain Whitelist Bypass (only if explicitly set by admin)
          const ignoredDomains: string[] = config.ignoredDomains || [];
          if (ignoredDomains.length > 0) {
            const isDomainWhitelisted = ignoredDomains.some((d: string) => d && contentForLinkCheck.includes(d.toLowerCase()));
            if (isDomainWhitelisted) {
              return;
            }
          }

          const ignoredChannels: string[] = config.ignoredChannels || [];
          const ignoredRoles: string[] = config.ignoredRoles || [];

          const isChannelIgnored = ignoredChannels.includes(message.channel.id);
          const hasIgnoredRole = message.member?.roles?.cache?.some((r: any) => ignoredRoles.includes(r.id));
          const isOwnerOrExtra = await isOwnerOrExtraOwner(message.author.id, message.guild);
          const isWhitelisted = await checkWhitelistPermission(message.author.id, message.guild, context, 'anti_link');
          const isUrlCmd = isUrlCommandBypass(message, client?.user?.id);

          if (!isChannelIgnored && !hasIgnoredRole && !isOwnerOrExtra && !isWhitelisted && !isUrlCmd) {
            (message as any)._antiLinkHandled = true;
            markMessageAntiLinkHandled(message.id);
            deleted = true;
            reason = 'Posting unauthorized links';
          }
        }

        // 2. Bad Words Filter
        if (!deleted && config.badWords && config.badWords.length > 0) {
          for (const word of config.badWords) {
            const trimmed = (typeof word === 'string' ? word : '').trim().toLowerCase();
            if (trimmed.length > 0 && content.includes(trimmed)) {
              deleted = true;
              reason = 'Using blacklisted words';
              break;
            }
          }
        }

        // 3. Caps Spam Filter
        if (!deleted && config.preventCapsSpam && message.content.length > 10) {
          const capsCount = message.content.replace(/[^A-Z]/g, '').length;
          if (capsCount / message.content.length > 0.7) {
            deleted = true;
            reason = 'Excessive capital letters';
          }
        }

        // 4. Mention Spam Filter
        if (!deleted && config.maxMentions && config.maxMentions > 0) {
          const mentionCount = message.mentions.users.size + message.mentions.roles.size;
          if (mentionCount > config.maxMentions) {
            deleted = true;
            reason = `Excessive mentions (${mentionCount}/${config.maxMentions})`;
          }
        }

        // 5. Sliding Window Anti-Spam & Cross-Channel Raid Protection
        if (!deleted && message.guild) {
          const isOwnerOrExtra = await isOwnerOrExtraOwner(message.author.id, message.guild);
          if (!isOwnerOrExtra) {
            const spamCheck = SlidingWindowSpamDetector.checkSpam(
              message.guild.id,
              message.author.id,
              message.channel.id,
              message.content
            );
            if (spamCheck.isSpam) {
              deleted = true;
              reason = spamCheck.reason;
            }
          }
        }

        // 6. Attachment / Image / File Upload Filter
        if (!deleted && (config.blockAttachments || (config.blockedAttachmentChannels && config.blockedAttachmentChannels.includes(message.channel.id)))) {
          const isOwnerOrExtra = await isOwnerOrExtraOwner(message.author.id, message.guild);
          const isWhitelisted = await checkWhitelistPermission(message.author.id, message.guild, context, 'anti_attachment');
          const hasIgnoredRole = message.member?.roles?.cache?.some((r: any) => (config.ignoredRoles || []).includes(r.id));
          const isIgnoredChannel = (config.ignoredChannels || []).includes(message.channel.id);

          if (!isOwnerOrExtra && !isWhitelisted && !hasIgnoredRole && !isIgnoredChannel) {
            const hasAttachment = message.attachments && message.attachments.size > 0;
            if (hasAttachment) {
              deleted = true;
              reason = 'Posting unauthorized files/images/attachments';
            }
          }
        }

        // ── EXECUTE ENFORCEMENT & DELETION ────────────────────────────────────
        if (deleted) {
          try {
            await message.delete().catch(() => { });

            if (reason === 'Posting unauthorized links') {
              const maxLimit = typeof config.antiLinkLimit === 'number' && config.antiLinkLimit > 0
                ? config.antiLinkLimit
                : (typeof config.limit === 'number' && config.limit > 0 ? config.limit : 5);

              const currentCount = incrementLinkViolations(message.guild.id, message.author.id);
              const punishAction = (config.punishment || 'warn').toLowerCase();

              if (currentCount < maxLimit) {
                // WARNING PHASE (Violations 1 to limit-1)
                const warnCard = buildLimeWarnCard({
                  category: 'Unauthorized Link',
                  user: message.author,
                  reason: 'Posting unauthorized links',
                  currentLimit: currentCount,
                  maxLimit: maxLimit,
                  thumbnailUrl: message.author.displayAvatarURL?.()
                });
                await message.channel.send({ embeds: [warnCard] })
                  .then((m: any) => setTimeout(() => m.delete().catch(() => { }), 6000))
                  .catch(() => { });

                // Send DM warning notification
                const dmEmbed = Embeds.warn(
                  `<a:warning:1546155457981452441> Anti-Link Warning (${currentCount}/${maxLimit}) — ${message.guild.name}`,
                  `Your message in **#${message.channel.name || 'channel'}** was **deleted** because external link sharing is restricted.\n\n**Violation Count**: **${currentCount}/${maxLimit}**\nReaching **${maxLimit} violations** will trigger **${punishAction.toUpperCase()}** enforcement.`,
                  { module: 'automod', footer: `${message.guild.name} • Anti-Link Protection` }
                );
                await message.member?.send({ embeds: [dmEmbed] }).catch(() => { });
              } else {
                // THRESHOLD REACHED (Violation limit hit!)
                const punishEmbed = createLimeEmbed({
                  title: `<:security:1546142576984203336> Anti-Link Punishment Enforced (${currentCount}/${maxLimit})`,
                  description: [
                    `> ${message.author} has reached the maximum Anti-Link violation limit (**${currentCount}/${maxLimit}**).`,
                    ``,
                    `• **Offender**: ${userTag(message.author)} (\`${message.author.id}\`)`,
                    `• **Channel**: <#${message.channel.id}>`,
                    `• **Action Enforced**: \`${punishAction.toUpperCase()}\``
                  ].join('\n'),
                  color: Colors.DANGER
                });

                await message.channel.send({ embeds: [punishEmbed] })
                  .then((m: any) => setTimeout(() => m.delete().catch(() => { }), 8000))
                  .catch(() => { });

                // Execute configured action
                if (punishAction === 'mute' || punishAction === 'timeout') {
                  await message.member?.timeout(10 * 60 * 1000, 'Anti-Link: Maximum link violation limit exceeded').catch(() => { });
                } else if (punishAction === 'kick') {
                  await message.member?.kick('Anti-Link: Maximum link violation limit exceeded').catch(() => { });
                } else if (punishAction === 'ban') {
                  await message.member?.ban({ reason: 'Anti-Link: Maximum link violation limit exceeded' }).catch(() => { });
                }

                // Send DM notification of punishment
                const dmEmbed = Embeds.error(
                  `<:gavel:1532621057318584380> Anti-Link Limit Reached — ${message.guild.name}`,
                  `You have reached the maximum Anti-Link violation limit (**${currentCount}/${maxLimit}**) in **${message.guild.name}**.\n\n**Action Enforced**: ${punishAction.toUpperCase()}\n**Reason**: Repeated unauthorized link sharing.`,
                  { module: 'automod', footer: `${message.guild.name} • Anti-Link Enforcement` }
                );
                await message.member?.send({ embeds: [dmEmbed] }).catch(() => { });

                // Reset violation counter after enforcement
                resetLinkViolations(message.guild.id, message.author.id);
              }
            } else {
              // Non-link violation warning
              const warnCard = buildLimeWarnCard({
                category: reason.includes('words') ? 'Swear Words' : (reason.includes('caps') ? 'Caps' : 'Spam'),
                user: message.author,
                reason: reason,
                currentLimit: 1,
                maxLimit: 5,
                thumbnailUrl: message.author.displayAvatarURL?.()
              });
              await message.channel.send({ embeds: [warnCard] })
                .then((m: any) => setTimeout(() => m.delete().catch(() => { }), 6000))
                .catch(() => { });
            }

            context.logSyncEvent(`AutoMod: Removed message from ${userTag(message.author)} in #${message.channel.name} (${reason})`, 'warn');

            // Persist to audit log & sync live dashboard
            Database.saveAuditLog({
              guildId: message.guild.id,
              action: reason === 'Posting unauthorized links' ? 'AUTOMOD_LINK' : 'AUTOMOD_FILTER',
              targetId: message.author.id,
              targetType: 'User',
              targetName: userTag(message.author),
              executorId: client?.user?.id || 'bot',
              executorTag: 'AutoMod Core',
              reason: reason || 'AutoMod Policy Violation',
              details: { channel: message.channel.id, content: message.content.slice(0, 100) },
              type: 'warn',
              timestamp: Date.now()
            }).catch(() => { });

            DashboardSyncService.triggerSync(message.guild.id);
          } catch (e) {
            console.error('[AutoMod Message Enforcement Error]:', e);
          }
        }
      }
    }
  ]
};
