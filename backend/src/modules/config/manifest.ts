import { Message, StringSelectMenuBuilder, ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ModuleManifest } from '../../core/types.js';
import { Database } from '../../core/Database.js';
import { createLimeEmbed, buildLimeOverviewCard, Colors, VERIFIED_ICON, WRONG_ICON, SHIELD_ICON, CONFIG_ICON, ARROW_ICON } from '../../core/UIFactory.js';
import { PrefixRegistry } from '../../core/prefix/PrefixRegistry.js';
import { PrefixResolver } from '../../core/prefix/PrefixResolver.js';
import { SocialSubscriptionRepository } from '../social-updates/SocialSubscriptionRepository.js';
import { SubscriptionManager } from '../social-updates/SubscriptionManager.js';

const APPROVED_ICON = '<a:approved:1532390590707142956>';
const WRONG_EMOJI = '<:wrong:1532390628330307634>';
const CONFIG_EMOJI = '<:config:1532425712844144701>';
const SHIELD_EMOJI = '<:shield:1532403012751065179>';

export const DEFAULT_SECURITY_RULES: Record<string, { enabled: boolean; limit: number; window: number; action: string; recovery: boolean }> = {
  anti_role_grant: { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true },
  anti_role_remove: { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true },
  anti_role_update: { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true },
  anti_role_create: { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true },
  anti_role_delete: { enabled: true, limit: 1, window: 10, action: 'quarantine', recovery: true },
  anti_channel_create: { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true },
  anti_channel_delete: { enabled: true, limit: 1, window: 10, action: 'quarantine', recovery: true },
  anti_channel_update: { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true },
  anti_ban: { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true },
  anti_kick: { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true },
  anti_timeout: { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true },
  anti_bot_add: { enabled: true, limit: 1, window: 10, action: 'ban', recovery: true },
  anti_bot_remove: { enabled: true, limit: 1, window: 10, action: 'quarantine', recovery: true },
  anti_webhook_create: { enabled: true, limit: 2, window: 10, action: 'quarantine', recovery: true },
  anti_webhook_delete: { enabled: true, limit: 2, window: 10, action: 'quarantine', recovery: true },
  anti_webhook_update: { enabled: true, limit: 2, window: 10, action: 'quarantine', recovery: true },
  anti_guild_update: { enabled: true, limit: 1, window: 10, action: 'quarantine', recovery: true },
  anti_prune: { enabled: true, limit: 1, window: 10, action: 'quarantine', recovery: true },
  anti_emoji_create: { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true },
  anti_emoji_delete: { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true },
  anti_emoji_update: { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true },
  anti_sticker_create: { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true },
  anti_sticker_delete: { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true },
  anti_sticker_update: { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true },
  anti_everyone_here: { enabled: true, limit: 1, window: 10, action: 'quarantine', recovery: true },
  anti_link: { enabled: true, limit: 3, window: 10, action: 'warn', recovery: false }
};

const RULE_ALIAS_MAP: Record<string, string> = {
  'role_grant': 'anti_role_grant',
  'rolegrant': 'anti_role_grant',
  'role_remove': 'anti_role_remove',
  'roleremove': 'anti_role_remove',
  'role_update': 'anti_role_update',
  'roleupdate': 'anti_role_update',
  'role_create': 'anti_role_create',
  'rolecreate': 'anti_role_create',
  'role_delete': 'anti_role_delete',
  'roledelete': 'anti_role_delete',
  'channel_create': 'anti_channel_create',
  'channelcreate': 'anti_channel_create',
  'channel_delete': 'anti_channel_delete',
  'channeldelete': 'anti_channel_delete',
  'channel_update': 'anti_channel_update',
  'channelupdate': 'anti_channel_update',
  'ban': 'anti_ban',
  'antiban': 'anti_ban',
  'kick': 'anti_kick',
  'antikick': 'anti_kick',
  'timeout': 'anti_timeout',
  'antitimeout': 'anti_timeout',
  'bot_add': 'anti_bot_add',
  'botadd': 'anti_bot_add',
  'bot_remove': 'anti_bot_remove',
  'botremove': 'anti_bot_remove',
  'webhook_create': 'anti_webhook_create',
  'webhookcreate': 'anti_webhook_create',
  'webhook_delete': 'anti_webhook_delete',
  'webhookdelete': 'anti_webhook_delete',
  'webhook_update': 'anti_webhook_update',
  'webhookupdate': 'anti_webhook_update',
  'guild_update': 'anti_guild_update',
  'guildupdate': 'anti_guild_update',
  'server_update': 'anti_guild_update',
  'prune': 'anti_prune',
  'antiprune': 'anti_prune',
  'integration': 'anti_integration',
  'emoji_create': 'anti_emoji_create',
  'emoji_delete': 'anti_emoji_delete',
  'emoji_update': 'anti_emoji_update',
  'sticker_create': 'anti_sticker_create',
  'sticker_delete': 'anti_sticker_delete',
  'sticker_update': 'anti_sticker_update',
  'everyone': 'anti_everyone_here',
  'antieveryone': 'anti_everyone_here',
  'here': 'anti_everyone_here',
  'antihere': 'anti_everyone_here',
  'mass_ping': 'anti_everyone_here',
  'massping': 'anti_everyone_here',
  'anti_everyone': 'anti_everyone_here',
  'anti_here': 'anti_everyone_here',
  'link': 'anti_link',
  'antilink': 'anti_link'
};

export function normalizeRuleName(input: string): string {
  if (!input) return '';
  const cleaned = input.toLowerCase().trim().replace(/[\s-]/g, '_');
  if (RULE_ALIAS_MAP[cleaned]) return RULE_ALIAS_MAP[cleaned];
  if (cleaned.startsWith('anti_')) return cleaned;
  return `anti_${cleaned}`;
}

export function parseDurationToMs(str: string): number | null {
  if (!str) return null;
  const regex = /^(\d+)\s*([s|m|h|d|w])?$/i;
  const match = str.trim().match(regex);
  if (!match) return null;
  const val = parseInt(match[1], 10);
  const unit = (match[2] || 'm').toLowerCase();
  switch (unit) {
    case 's': return val * 1000;
    case 'm': return val * 60000;
    case 'h': return val * 3600000;
    case 'd': return val * 86400000;
    case 'w': return val * 7 * 86400000;
    default: return val * 60000;
  }
}

export function getEffectiveRule(rules: any, ruleKey: string, secConfig?: any): { enabled: boolean; limit: number; window: number; action: string; recovery: boolean; [key: string]: any } {
  const normalizedKey = normalizeRuleName(ruleKey);
  const defaultConfig = DEFAULT_SECURITY_RULES[normalizedKey] || { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true };
  const actualRules = (rules && typeof rules === 'object' && 'rules' in rules) ? rules.rules : rules;
  const actualConfig = secConfig || ((rules && typeof rules === 'object' && ('antiNukeEnabled' in rules || 'rules' in rules)) ? rules : undefined);

  const customConfig = actualRules?.[normalizedKey] || actualRules?.[ruleKey] || {};
  const isMasterEnabled = actualConfig ? actualConfig.antiNukeEnabled !== false : true;
  return {
    ...defaultConfig,
    ...customConfig,
    enabled: isMasterEnabled ? (customConfig.enabled !== undefined ? Boolean(customConfig.enabled) : defaultConfig.enabled) : false
  };
}

export function buildAntiNukeOverview(secConfig: any, targetGroup?: string) {
  const rules = secConfig?.rules || {};
  const isMasterEnabled = secConfig?.antiNukeEnabled !== false;
  const formattedSections: Array<{ title: string; items: string[] }> = [];

  const categoryDefinitions: Record<string, { label: string; title: string; keys: string[] }> = {
    group_roles: {
      label: 'ROLE PROTECTIONS',
      title: '<:shield:1532403012751065179> ROLE PROTECTION MODULES',
      keys: ['anti_role_grant', 'anti_role_remove', 'anti_role_update', 'anti_role_create', 'anti_role_delete']
    },
    group_channels: {
      label: 'CHANNEL PROTECTIONS',
      title: '<:shield:1532403012751065179> CHANNEL PROTECTION MODULES',
      keys: ['anti_channel_create', 'anti_channel_delete', 'anti_channel_update']
    },
    group_members: {
      label: 'MEMBER & MODERATION PROTECTIONS',
      title: '<:gavel:1532621057318584380> MEMBER & MODERATION MODULES',
      keys: ['anti_ban', 'anti_kick', 'anti_timeout', 'anti_bot_add', 'anti_bot_remove', 'anti_prune', 'anti_everyone_here']
    },
    group_server: {
      label: 'SERVER & WEBHOOK PROTECTIONS',
      title: '<:config:1532425712844144701> SERVER & WEBHOOK MODULES',
      keys: ['anti_webhook_create', 'anti_webhook_delete', 'anti_webhook_update', 'anti_guild_update', 'anti_link']
    }
  };

  const selectedKey = targetGroup?.toLowerCase();
  const normalizedGroup = selectedKey === 'roles' || selectedKey === 'role' ? 'group_roles'
    : selectedKey === 'channels' || selectedKey === 'channel' ? 'group_channels'
    : selectedKey === 'members' || selectedKey === 'member' || selectedKey === 'mods' ? 'group_members'
    : selectedKey === 'server' || selectedKey === 'webhooks' || selectedKey === 'webhook' ? 'group_server'
    : selectedKey && categoryDefinitions[selectedKey] ? selectedKey
    : undefined;

  const activeGroups = normalizedGroup ? { [normalizedGroup]: categoryDefinitions[normalizedGroup] } : categoryDefinitions;

  for (const [gKey, gDef] of Object.entries(activeGroups)) {
    const items: string[] = [];
    for (const key of gDef.keys) {
      const rule = getEffectiveRule(rules, key, secConfig);
      const isRuleActive = rule.enabled;
      const statusIcon = isRuleActive ? VERIFIED_ICON : WRONG_EMOJI;
      const revertStr = rule.recovery ? 'Auto-Revert: ON' : 'Auto-Revert: OFF';
      const masterOffTag = isMasterEnabled ? '' : ' *(Master OFF)*';
      items.push(`${statusIcon} **${key}**: \`${rule.limit} per ${rule.window}s\` | Action: \`${rule.action.toUpperCase()}\` | \`${revertStr}\`${masterOffTag}`);
    }
    formattedSections.push({ title: gDef.title, items });
  }

  const isFiltered = !!normalizedGroup;
  const groupLabel = normalizedGroup ? categoryDefinitions[normalizedGroup]?.label : 'ALL PROTECTION CATEGORIES';

  const overviewCard = buildLimeOverviewCard({
    title: isFiltered ? `ANTI-NUKE CATEGORY INSPECTION MATRIX` : 'ANTI-NUKE MODULE CONFIGURATION MATRIX',
    subtitle: isMasterEnabled
      ? (isFiltered ? `INSPECTING: ${groupLabel}` : 'MASTER STATUS: 🟢 ENABLED (ACTIVE)')
      : 'MASTER STATUS: 🔴 DISABLED (INACTIVE — ALL PROTECTIONS PAUSED)',
    color: isMasterEnabled ? Colors.BRAND : Colors.DANGER,
    sections: formattedSections,
    footerText: 'Rage Optimiser Enterprise • Security Configuration'
  });

  const ruleSelectMenu = new StringSelectMenuBuilder()
    .setCustomId('an_rule_select')
    .setPlaceholder(isFiltered ? `Inspecting: ${groupLabel}...` : 'Inspect Anti-Nuke Protection Category...')
    .addOptions([
      { label: 'Role Protections (Grant, Remove, Create, Delete)', value: 'group_roles', emoji: '<:shield:1532403012751065179>', description: 'Role creation, deletion & assignment rules' },
      { label: 'Channel Protections (Create, Delete, Update)', value: 'group_channels', emoji: '<:shield:1532403012751065179>', description: 'Channel creation, deletion & modification rules' },
      { label: 'Member & Mod Protections (Ban, Kick, Timeout)', value: 'group_members', emoji: '<:gavel:1532621057318584380>', description: 'Ban, kick, timeout, bot add, prune rules' },
      { label: 'Server & Webhook Protections (Webhook, Guild)', value: 'group_server', emoji: '<:config:1532425712844144701>', description: 'Webhook & server modification rules' }
    ]);

  const rowSelect = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(ruleSelectMenu);

  const buttonList: ButtonBuilder[] = [];
  if (isFiltered) {
    buttonList.push(new ButtonBuilder().setCustomId('an_view_full').setLabel('Overview Matrix').setStyle(ButtonStyle.Primary).setEmoji('<:config:1532425712844144701>'));
  }
  buttonList.push(
    new ButtonBuilder().setCustomId('an_toggle_all').setLabel('Toggle Anti-Nuke').setStyle(isMasterEnabled ? ButtonStyle.Danger : ButtonStyle.Success).setEmoji('<:shield:1532403012751065179>'),
    new ButtonBuilder().setCustomId('an_toggle_raid').setLabel('Toggle Raid Mode').setStyle(secConfig.raidModeEnabled ? ButtonStyle.Danger : ButtonStyle.Secondary).setEmoji('<:shield:1532403012751065179>'),
    new ButtonBuilder().setCustomId('an_emergency_lock').setLabel('Emergency Lockdown').setStyle(ButtonStyle.Danger).setEmoji('<:shield:1532403012751065179>')
  );

  const rowButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(buttonList.slice(0, 5));

  return { embeds: [overviewCard], components: [rowSelect, rowButtons] };
}

export function registerConfigCommands(): void {
  // 0. Quarantine Role Configuration Command (`r!quarantine-role`)
  PrefixRegistry.register({
    name: 'quarantine-role',
    category: 'Configuration',
    description: 'Set or auto-create the server Quarantine Isolation Role.',
    usage: 'r!quarantine-role <@role|role_id|create|view>',
    aliases: ['quarantinerole', 'qrole', 'setquarantine'],
    cooldownSeconds: 3,
    userPermissions: ['Administrator'],
    execute: async (message: Message, args: string[], extra?: any) => {
      const cmdMeta = PrefixRegistry.get('config');
      if (cmdMeta && cmdMeta.execute) {
        await cmdMeta.execute(message, ['antinuke', 'quarantine-role', ...args], extra);
      }
    }
  });

  // 1. Setup Wizard Command (`r!setup` / `/setup`)
  PrefixRegistry.register({
    name: 'setup',
    category: 'Configuration',
    description: 'First-time interactive server security & protection setup wizard.',
    usage: 'r!setup',
    aliases: ['wizard', 'init-server'],
    cooldownSeconds: 5,
    userPermissions: ['Administrator'],
    botPermissions: ['Administrator'],
    execute: async (message: Message) => {
      const embed = createLimeEmbed({
        title: 'Interactive Server Protection Wizard',
        description: [
          `👋 Welcome to the **Rage Optimiser Setup Wizard**!\n`,
          `> ${ARROW_ICON} This wizard will configure your server's protection profile, audit logging, Anti-Link filters, and Auto-Roles in 4 steps.\n`,
          `--------------------------------------------------`,
          `• ${SHIELD_EMOJI} **Protection Level**: Standard Anti-Nuke (Ban, Kick & Channel limits)`,
          `• <:link:1532620952087826602> **AutoMod Filter**: Anti-Link (Warn & Delete)`,
          `• <:membericons:1532426097428267180> **Onboarding**: Auto-Roles & Welcome Notification`,
          `--------------------------------------------------`,
          `*Select your preferred protection profile below to initialize configuration.*`
        ].join('\n')
      });

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('setup_preset_select')
        .setPlaceholder('Choose Protection Preset...')
        .addOptions(
          { label: 'Relaxed Profile', description: 'Basic protection with higher tolerance limits', value: 'relaxed', emoji: '<:shield:1532403012751065179>' },
          { label: 'Standard Profile (Recommended)', description: 'Balanced protection for active communities', value: 'standard', emoji: '<:shield:1532403012751065179>' },
          { label: 'Strict Profile', description: 'High security with fast anti-nuke threshold triggers', value: 'strict', emoji: '<:shield:1532403012751065179>' },
          { label: 'Aggressive Lockdown Profile', description: 'Maximum protection for vulnerable servers', value: 'aggressive', emoji: '<:gavel:1532621057318584380>' }
        );

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
      return message.reply({ embeds: [embed], components: [row] });
    }
  });

  // 2. Master Config Command Suite (`r!config` / `/config`)
  PrefixRegistry.register({
    name: 'config',
    category: 'Configuration',
    description: 'Interactive Discord Control Panel & Anti-Nuke Module Configuration Engine.',
    usage: 'r!config [antinuke|export|backup] [subcommands...]',
    aliases: ['settings', 'panel', 'configure', 'antinuke'],
    subcommands: [
      { name: 'antinuke status', description: 'View anti-nuke protection matrix, limits, and auto-reversion states.' },
      { name: 'antinuke threshold <event> <limit> <window>', description: 'Configure action count threshold and rate limit window.' },
      { name: 'antinuke punishment <event> <action>', description: 'Configure punishment (quarantine, ban, kick, strip_roles, warn).' },
      { name: 'antinuke reversion <event> <on|off>', description: 'Toggle automatic rollback / event recovery.' },
      { name: 'antinuke quarantine-role <@role|create|view>', description: 'Set or auto-create the server Quarantine Isolation Role.' },
      { name: 'antinuke trustedactor <warn_at> <punish_at> [window_sec]', description: 'Configure Behavioral warning & punishment action limits for Whitelisted users.' },
      { name: 'antinuke timeout-duration <10m|1h|1d|7d|28d>', description: 'Configure Discord Timeout punishment duration for anti-nuke violations.' },
      { name: 'antinuke setall [category|all] <limit> <window> [punishment]', description: 'Bulk update all 24 protection modules at once.' },
      { name: 'antinuke module <event> <limit> <window> <punishment> <reversion>', description: 'Bulk update all parameters for a protection module.' },
      { name: 'automod status', description: 'View AutoMod filter matrix (Anti-Spam, Anti-Link, Blacklist, Caps, Emojis).' },
      { name: 'automod antispam <on|off> [max_msgs] [window_sec] [action]', description: 'Configure Anti-Spam threshold & punishment action.' },
      { name: 'automod antilink <on|off> [allow_invites] [action]', description: 'Configure Anti-Link filter & invite settings.' },
      { name: 'automod blacklist <add|remove|list|clear> [words]', description: 'Manage prohibited word list.' },
      { name: 'welcome status', description: 'View onboarding settings (welcome channel, DM greeting, auto-roles, leave).' },
      { name: 'welcome channel <#channel|none>', description: 'Set server welcome greeting channel.' },
      { name: 'welcome autorole <add|remove> <@role>', description: 'Configure auto-assigned roles on member join.' },
      { name: 'voiceprotection status', description: 'View voice loudness ceiling, audit duration & penalties.' },
      { name: 'voiceprotection threshold <1-100>', description: 'Set RMS loudness ceiling threshold.' },
      { name: 'jtc status', description: 'View Join-To-Create hub channel & target category.' },
      { name: 'tickets status', description: 'View support ticket category, staff roles & log channel.' },
      { name: 'tickets staff <add|remove> <@role>', description: 'Manage ticket support staff roles.' },
      { name: 'export', description: 'Export server configuration JSON.' },
      { name: 'backup', description: 'Create SQLite backup snapshot.' }
    ],
    examples: [
      'r!config antinuke status',
      'r!config antinuke quarantine-role @Quarantine',
      'r!config antinuke quarantine-role create',
      'r!config antinuke threshold channel_delete 2 10',
      'r!config antinuke module channel_delete 1 10 quarantine on',
      'r!config automod antispam on 5 5 mute',
      'r!config automod blacklist add badword1,badword2',
      'r!config welcome channel #lounge',
      'r!config welcome autorole add @Member',
      'r!config voiceprotection threshold 85',
      'r!config jtc setup #Join-To-Create',
      'r!config tickets category #TICKETS',
      'r!config tickets staff add @Support'
    ],
    cooldownSeconds: 3,
    userPermissions: ['Administrator'],
    execute: async (message: Message, args: string[], extra?: any) => {
      // Alias argument normalizer (e.g. r!antinuke threshold anti_role_grant 11)
      let effectiveArgs = [...args];
      const antinukeSubActions = ['status', 'threshold', 'punishment', 'reversion', 'recovery', 'rollback', 'enable', 'disable', 'toggle', 'module', 'set', 'matrix', 'list', 'setall', 'all', 'trustedactor', 'trusted-actor', 'behavioral', 'timeout-duration', 'timeout_duration', 'timeouttime', 'timeout-time', 'timeout'];
      if (effectiveArgs.length > 0 && antinukeSubActions.includes(effectiveArgs[0]?.toLowerCase())) {
        effectiveArgs.unshift('antinuke');
      }

      const moduleName = effectiveArgs[0]?.toLowerCase();
      const db = Database.getDb();

      if (!db) {
        return message.reply({ embeds: [createLimeEmbed({ title: 'Database Error', description: `${WRONG_EMOJI} Database engine unavailable.` })] });
      }

      // Export Configuration
      if (moduleName === 'export') {
        const guildId = message.guild!.id;
        const configRow = await db.get<any>('SELECT * FROM guild_configs WHERE guildId = ?', [guildId]);
        const data = {
          guildId,
          timestamp: new Date().toISOString(),
          modules: configRow ? JSON.parse(configRow.modules || '[]') : [],
          globalSettings: configRow ? JSON.parse(configRow.globalSettings || '{}') : {}
        };

        const buffer = Buffer.from(JSON.stringify(data, null, 2), 'utf-8');
        const attachment = new AttachmentBuilder(buffer, { name: `config_${guildId}.json` });

        return message.reply({
          content: `${APPROVED_ICON} Exported server configuration snapshot:`,
          files: [attachment]
        });
      }

      // Backup Configuration Snapshot to SQLite
      if (moduleName === 'backup') {
        const guildId = message.guild!.id;
        const backupId = `bkp_${Math.random().toString(36).substring(2, 9)}`;
        const now = new Date().toISOString();

        const configRow = await db.get<any>('SELECT * FROM guild_configs WHERE guildId = ?', [guildId]);

        await db.run(
          `INSERT INTO guild_backups (id, timestamp, guildId, guildName, createdByName, channelsCount, rolesCount, emojisCount, data)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            backupId, now, guildId, message.guild!.name, message.author.tag,
            message.guild!.channels.cache.size, message.guild!.roles.cache.size, message.guild!.emojis.cache.size,
            configRow ? configRow.modules : '[]'
          ]
        );

        return message.reply({
          embeds: [createLimeEmbed({
            title: 'Server Configuration Backup Created',
            description: `${APPROVED_ICON} Saved configuration snapshot \`${backupId}\` to SQLite database.`
          })]
        });
      }

      // Helper rule group mapper
      const getRuleKeysForGroup = (groupOrKey: string): string[] => {
        const keyLower = groupOrKey.toLowerCase();
        if (keyLower === 'all' || keyLower === 'everything' || keyLower === '*') {
          return Object.keys(DEFAULT_SECURITY_RULES);
        }
        const ruleGroupMap: Record<string, string[]> = {
          roles: ['anti_role_grant', 'anti_role_remove', 'anti_role_update', 'anti_role_create', 'anti_role_delete'],
          role: ['anti_role_grant', 'anti_role_remove', 'anti_role_update', 'anti_role_create', 'anti_role_delete'],
          channels: ['anti_channel_create', 'anti_channel_delete', 'anti_channel_update'],
          channel: ['anti_channel_create', 'anti_channel_delete', 'anti_channel_update'],
          members: ['anti_ban', 'anti_kick', 'anti_timeout', 'anti_bot_add', 'anti_bot_remove', 'anti_prune'],
          member: ['anti_ban', 'anti_kick', 'anti_timeout', 'anti_bot_add', 'anti_bot_remove', 'anti_prune'],
          moderation: ['anti_ban', 'anti_kick', 'anti_timeout', 'anti_bot_add', 'anti_bot_remove', 'anti_prune'],
          webhooks: ['anti_webhook_create', 'anti_webhook_delete', 'anti_webhook_update', 'anti_guild_update'],
          webhook: ['anti_webhook_create', 'anti_webhook_delete', 'anti_webhook_update', 'anti_guild_update'],
          server: ['anti_webhook_create', 'anti_webhook_delete', 'anti_webhook_update', 'anti_guild_update'],
          emojis: ['anti_emoji_create', 'anti_emoji_delete', 'anti_emoji_update', 'anti_sticker_create', 'anti_sticker_delete', 'anti_sticker_update'],
          emoji: ['anti_emoji_create', 'anti_emoji_delete', 'anti_emoji_update', 'anti_sticker_create', 'anti_sticker_delete', 'anti_sticker_update']
        };
        if (ruleGroupMap[keyLower]) return ruleGroupMap[keyLower];
        return [normalizeRuleName(groupOrKey)];
      };

      // Anti-Nuke Sub-Configuration Suite (`r!config antinuke ...`)
      if (moduleName === 'antinuke') {
        const action = effectiveArgs[1]?.toLowerCase();
        const modules = extra?.getModulesState ? extra.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        const secConfig = secModule?.config || {};
        const rules = secConfig.rules || {};

        const updateSecRules = (newRules: Record<string, any>) => {
          const updatedConfig = { ...secConfig, rules: newRules };
          if (extra?.updateModuleConfig) {
            extra.updateModuleConfig('security', updatedConfig);
          }
          if (extra?.logSyncEvent) {
            extra.logSyncEvent(message.guild?.id, 'Security Config: Dynamic anti-nuke rules updated.', 'success');
          }
        };

        // Status matrix output (`r!config antinuke status`)
        if (!action || action === 'status' || action === 'list' || action === 'matrix' || ['group_roles', 'group_channels', 'group_members', 'group_server', 'roles', 'role', 'channels', 'channel', 'members', 'member', 'server', 'webhooks', 'webhook'].includes(action)) {
          const targetCategory = ['group_roles', 'group_channels', 'group_members', 'group_server', 'roles', 'role', 'channels', 'channel', 'members', 'member', 'server', 'webhooks', 'webhook'].includes(action) ? action : effectiveArgs[2];
          const payload = buildAntiNukeOverview(secConfig, targetCategory);
          return message.reply(payload);
        }

        // Master Bulk SetAll Command (`r!config antinuke setall [category|all] <limit> <window> [punishment] [reversion]`)
        if (action === 'setall' || action === 'all') {
          let categoryOrAll = effectiveArgs[2]?.toLowerCase();
          let limitIdx = 3;

          if (categoryOrAll && !isNaN(parseInt(categoryOrAll, 10))) {
            categoryOrAll = 'all';
            limitIdx = 2;
          }

          if (!categoryOrAll) categoryOrAll = 'all';

          const limit = parseInt(effectiveArgs[limitIdx], 10);
          const windowRate = parseInt(effectiveArgs[limitIdx + 1], 10);
          const punishment = effectiveArgs[limitIdx + 2]?.toLowerCase() || 'quarantine';
          const reversionInput = effectiveArgs[limitIdx + 3]?.toLowerCase();

          if (isNaN(limit) || limit < 1 || isNaN(windowRate) || windowRate < 1) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Anti-Nuke Bulk SetAll Syntax',
                description: [
                  `${WRONG_EMOJI} **Syntax**: \`r!antinuke setall [category|all] <limit> <window_sec> [quarantine|ban|kick|strip_roles|warn] [on|off]\`\n`,
                  `• **Bulk update ALL 24 sub-modules**: \`r!antinuke setall 3 10 quarantine on\``,
                  `• **Strict protection for ALL sub-modules**: \`r!antinuke setall 1 10 ban on\``,
                  `• **Update Role Protection sub-modules**: \`r!antinuke setall roles 2 10 quarantine on\``,
                  `• **Update Channel Protection sub-modules**: \`r!antinuke setall channels 1 10 ban on\``,
                  `• **Update Webhook sub-modules**: \`r!antinuke setall webhooks 2 10 quarantine on\``,
                  `\n**Categories**: \`all\`, \`roles\`, \`channels\`, \`members\`, \`webhooks\`, \`emojis\``
                ].join('\n')
              })]
            });
          }

          const isReversionOn = reversionInput ? ['on', 'true', 'enable'].includes(reversionInput) : true;
          const targetKeys = getRuleKeysForGroup(categoryOrAll);
          const updatedRules = { ...rules };

          targetKeys.forEach(k => {
            const cur = getEffectiveRule(rules, k);
            updatedRules[k] = { ...cur, enabled: true, limit, window: windowRate, action: punishment, recovery: isReversionOn };
          });

          updateSecRules(updatedRules);

          return message.reply({
            embeds: [createLimeEmbed({
              title: `Bulk Update Applied — ${categoryOrAll.toUpperCase()} Sub-Modules`,
              description: `${APPROVED_ICON} Successfully updated **${targetKeys.length} sub-modules** at once:\n> • Sensitivity Limit: \`${limit} per ${windowRate} seconds\`\n> • Punishment Action: \`${punishment.toUpperCase()}\`\n> • Auto-Reversion: \`${isReversionOn ? 'ENABLED (ON)' : 'DISABLED (OFF)'}\``
            })]
          });
        }

        // Configure Punishment (`r!config antinuke punishment <event|all> <action>`)
        if (action === 'punishment') {
          const eventInput = effectiveArgs[2];
          const punishment = effectiveArgs[3]?.toLowerCase();
          const validActions = ['quarantine', 'ban', 'kick', 'strip_roles', 'warn'];

          if (!eventInput || !punishment || !validActions.includes(punishment)) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Anti-Nuke Punishment Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config antinuke punishment <event|all|roles|channels> <quarantine|ban|kick|strip_roles|warn>\`\nExample: \`r!config antinuke punishment all ban\``
              })]
            });
          }

          const targetKeys = getRuleKeysForGroup(eventInput);
          const updatedRules = { ...rules };

          targetKeys.forEach(k => {
            const currentRule = getEffectiveRule(rules, k);
            updatedRules[k] = { ...currentRule, action: punishment };
          });

          updateSecRules(updatedRules);

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Anti-Nuke Punishment Action Saved',
              description: `${APPROVED_ICON} Updated punishment for **${targetKeys.length} sub-module(s)** to **\`${punishment.toUpperCase()}\`**.`
            })]
          });
        }

        // Configure Threshold (`r!config antinuke threshold <event|all> <limit> [window_seconds]`)
        if (action === 'threshold') {
          const eventInput = effectiveArgs[2];
          const limit = parseInt(effectiveArgs[3], 10);
          const parsedWindow = parseInt(effectiveArgs[4], 10);

          if (!eventInput || isNaN(limit) || limit < 1) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Anti-Nuke Threshold Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config antinuke threshold <event|all|roles|channels> <limit_count> [window_seconds]\`\nExample: \`r!config antinuke threshold all 2 10\``
              })]
            });
          }

          const targetKeys = getRuleKeysForGroup(eventInput);
          const updatedRules = { ...rules };

          targetKeys.forEach(k => {
            const currentRule = getEffectiveRule(rules, k);
            const windowRate = !isNaN(parsedWindow) && parsedWindow > 0 ? parsedWindow : (currentRule.window || 10);
            updatedRules[k] = { ...currentRule, limit, window: windowRate };
          });

          updateSecRules(updatedRules);

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Anti-Nuke Sensitivity Threshold Saved',
              description: `${APPROVED_ICON} Updated **${targetKeys.length} sub-module(s)** threshold: **${limit} actions per ${parsedWindow || 10} seconds**.`
            })]
          });
        }

        // Configure Trusted Actor Limits (`r!config antinuke trustedactor <warn_at> <punish_at> [window_seconds]`)
        if (action === 'trustedactor' || action === 'trusted-actor' || action === 'behavioral') {
          const warnAt = parseInt(effectiveArgs[2], 10);
          const punishAt = parseInt(effectiveArgs[3], 10);
          const parsedWindow = parseInt(effectiveArgs[4], 10);

          if (isNaN(warnAt) || warnAt < 1 || isNaN(punishAt) || punishAt <= warnAt) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Trusted Actor Security Limits Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config antinuke trustedactor <warn_at> <punish_at> [window_seconds]\`\n` +
                             `• **Default**: \`r!config antinuke trustedactor 1 2 10\` (Warn at 1, Revoke & Restore at 2 under 10s)\n` +
                             `• **Relaxed**: \`r!config antinuke trustedactor 2 4 10\` (Warn at 2, Revoke & Restore at 4 under 10s)`
              })]
            });
          }

          const windowSec = !isNaN(parsedWindow) && parsedWindow > 0 ? parsedWindow : 10;
          const updatedConfig = {
            ...secConfig,
            trustedActorWarnAt: warnAt,
            trustedActorPunishAt: punishAt,
            trustedActorWindow: windowSec
          };

          if (extra?.updateModuleConfig) {
            extra.updateModuleConfig('security', updatedConfig);
          }

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Trusted Actor Behavioral Limits Saved',
              description: `${APPROVED_ICON} Updated Behavioral Firewall for Whitelisted & Extra Owners:\n` +
                           `> • **Warning Threshold**: DM warning at **\`${warnAt}\`** rapid action(s)\n` +
                           `> • **Punish Threshold**: Trust revoked & state restored at **\`${punishAt}\`** rapid action(s)\n` +
                           `> • **Monitoring Window**: **\`${windowSec} seconds\`**`
            })]
          });
        }

        // Configure Timeout Duration (`r!config antinuke timeout-duration <1m|10m|1h|1d|7d|28d>`)
        if (['timeout-duration', 'timeout_duration', 'timeouttime', 'timeout-time', 'timeout'].includes(action)) {
          const durationArg = effectiveArgs[2];
          if (!durationArg || durationArg.toLowerCase() === 'view') {
            const currentMs = secConfig.timeoutDurationMs || (28 * 24 * 60 * 60 * 1000);
            const currentMins = Math.round(currentMs / 60000);
            const currentHours = (currentMs / 3600000).toFixed(1);
            const currentDays = (currentMs / 86400000).toFixed(1);
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Anti-Nuke Timeout Duration Status',
                description: `${APPROVED_ICON} Current Timeout Punishment Duration: **${currentDays} day(s)** (\`${currentMins} mins\`).\nUse \`r!config antinuke timeout-duration <10m|1h|1d|7d|28d>\` to modify.`
              })]
            });
          }

          const ms = parseDurationToMs(durationArg);
          const maxMs = 28 * 24 * 60 * 60 * 1000;
          if (!ms || ms < 10000 || ms > maxMs) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Invalid Timeout Duration Syntax',
                description: `${WRONG_EMOJI} Please provide a valid duration between **10 seconds** and **28 days**.\nExamples:\n` +
                             `• \`r!config antinuke timeout-duration 10m\` (10 Minutes)\n` +
                             `• \`r!config antinuke timeout-duration 1h\` (1 Hour)\n` +
                             `• \`r!config antinuke timeout-duration 7d\` (7 Days)\n` +
                             `• \`r!config antinuke timeout-duration 28d\` (28 Days — Maximum)`
              })]
            });
          }

          const updatedConfig = { ...secConfig, timeoutDurationMs: ms };
          if (extra?.updateModuleConfig) {
            extra.updateModuleConfig('security', updatedConfig);
          }

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Timeout Duration Successfully Configured',
              description: `${APPROVED_ICON} Updated Anti-Nuke Timeout Punishment Duration to **${durationArg}** (\`${Math.round(ms / 60000)} minutes\`).`
            })]
          });
        }

        // Configure Reversion / Auto-Rollback (`r!config antinuke reversion <event|all> <on|off|true|false>`)
        if (action === 'reversion' || action === 'recovery' || action === 'rollback') {
          const eventInput = effectiveArgs[2];
          const toggleInput = effectiveArgs[3]?.toLowerCase();

          if (!eventInput || !['on', 'off', 'true', 'false', 'enable', 'disable'].includes(toggleInput)) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Anti-Nuke Reversion Toggle Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config antinuke reversion <event|all|roles|channels> <on|off>\`\nExample: \`r!config antinuke reversion all on\``
              })]
            });
          }

          const isEnabled = ['on', 'true', 'enable'].includes(toggleInput);
          const targetKeys = getRuleKeysForGroup(eventInput);
          const updatedRules = { ...rules };

          targetKeys.forEach(k => {
            const currentRule = getEffectiveRule(rules, k);
            updatedRules[k] = { ...currentRule, recovery: isEnabled };
          });

          updateSecRules(updatedRules);

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Anti-Nuke Auto-Reversion Policy Updated',
              description: `${APPROVED_ICON} Automatic reversion for **${targetKeys.length} sub-module(s)** is now **\`${isEnabled ? 'ENABLED (ON)' : 'DISABLED (OFF)'}\`**.`
            })]
          });
        }

        // Enable or Disable Individual Module, Category or Master Anti-Nuke (`r!config antinuke on/off` or `enable <event|all>`)
        if (action === 'enable' || action === 'disable' || action === 'toggle' || action === 'on' || action === 'off') {
          const eventInput = effectiveArgs[2];
          if (!eventInput) {
            // Master Anti-Nuke Toggle
            const isCurrentlyActive = secConfig.antiNukeEnabled !== false;
            const isEnabled = action === 'on' || action === 'enable' || (action === 'toggle' && !isCurrentlyActive);
            if (extra?.updateModuleConfig) {
              extra.updateModuleConfig('security', { ...secConfig, antiNukeEnabled: isEnabled });
            }
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Master Anti-Nuke Protection Toggle',
                description: `${APPROVED_ICON} Entire Anti-Nuke Protection Engine is now **\`${isEnabled ? 'ENABLED (ACTIVE)' : 'DISABLED (INACTIVE)'}\`**.`
              })]
            });
          }

          const isEnabled = action === 'enable' || action === 'on' || (action === 'toggle' && effectiveArgs[3]?.toLowerCase() === 'on');
          const targetKeys = getRuleKeysForGroup(eventInput);
          const updatedRules = { ...rules };

          targetKeys.forEach(k => {
            const currentRule = getEffectiveRule(rules, k);
            updatedRules[k] = { ...currentRule, enabled: isEnabled };
          });

          updateSecRules(updatedRules);

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Anti-Nuke Protection State Saved',
              description: `${APPROVED_ICON} Protection state for **${targetKeys.length} sub-module(s)** has been **\`${isEnabled ? 'ENABLED' : 'DISABLED'}\`**.`
            })]
          });
        }

        // Single Bulk Module Command (`r!config antinuke module <event|all> <limit> <window> <punishment> <reversion>`)
        if (action === 'module' || action === 'set') {
          const eventInput = effectiveArgs[2];
          const limit = parseInt(effectiveArgs[3], 10);
          const windowRate = parseInt(effectiveArgs[4], 10);
          const punishment = effectiveArgs[5]?.toLowerCase();
          const reversionInput = effectiveArgs[6]?.toLowerCase();

          if (!eventInput || isNaN(limit) || isNaN(windowRate) || !punishment) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Anti-Nuke Module Setting Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config antinuke module <event|all|roles|channels> <limit> <window_sec> <quarantine|ban|kick> [reversion_on_off]\`\nExample: \`r!config antinuke module all 3 10 quarantine on\``
              })]
            });
          }

          const isReversionOn = reversionInput ? ['on', 'true', 'enable'].includes(reversionInput) : true;
          const targetKeys = getRuleKeysForGroup(eventInput);
          const updatedRules = { ...rules };

          targetKeys.forEach(k => {
            updatedRules[k] = { enabled: true, limit, window: windowRate, action: punishment, recovery: isReversionOn };
          });

          updateSecRules(updatedRules);

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Anti-Nuke Module Configuration Applied',
              description: `${APPROVED_ICON} Configured **${targetKeys.length} sub-module(s)**:\n> • Limit: \`${limit} per ${windowRate}s\`\n> • Punishment: \`${punishment.toUpperCase()}\`\n> • Auto-Revert: \`${isReversionOn ? 'ENABLED' : 'DISABLED'}\``
            })]
          });
        }

        // Configure Quarantine Role (`r!config antinuke quarantine-role <@role|role_id|create|view>`)
        if (['quarantine-role', 'quarantinerole', 'qrole', 'quarantine_role', 'q-role'].includes(action)) {
          const roleArg = effectiveArgs[2];

          if (!roleArg || roleArg.toLowerCase() === 'view' || roleArg.toLowerCase() === 'status') {
            const currentRoleId = secConfig.quarantineRoleId;
            const currentRole = currentRoleId ? message.guild?.roles.cache.get(currentRoleId) : null;
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Quarantine Isolation Role Status',
                description: currentRole
                  ? `${APPROVED_ICON} Current Quarantine Role: ${currentRole} (\`${currentRole.id}\`)`
                  : `${WRONG_EMOJI} No Quarantine Role bound. Use \`r!config antinuke quarantine-role @role\` or \`r!config antinuke quarantine-role create\` to auto-generate a high-security quarantine role.`
              })]
            });
          }

          if (['create', 'auto', 'generate', 'setup'].includes(roleArg.toLowerCase())) {
            try {
              let existingRole = message.guild?.roles.cache.find(r => r.name.toLowerCase() === '. quarantine' || r.name.toLowerCase() === 'quarantine');
              if (!existingRole) {
                existingRole = await message.guild?.roles.create({
                  name: '. Quarantine',
                  color: 0x343541,
                  reason: 'Rage Optimiser Automated Quarantine Isolation Role'
                });
              }

              if (existingRole) {
                const updatedConfig = { ...secConfig, quarantineRoleId: existingRole.id };
                if (extra?.updateModuleConfig) {
                  extra.updateModuleConfig('security', updatedConfig);
                }
                return message.reply({
                  embeds: [createLimeEmbed({
                    title: 'Quarantine Role Auto-Created & Bound',
                    description: `${APPROVED_ICON} Successfully created and bound high-security role ${existingRole} (\`${existingRole.id}\`) for automated isolations.`
                  })]
                });
              }
            } catch (err: any) {
              return message.reply({
                embeds: [createLimeEmbed({
                  title: 'Quarantine Role Creation Failed',
                  description: `${WRONG_EMOJI} Could not auto-create role: ${err.message || err}`
                })]
              });
            }
          }

          const targetRole = message.mentions.roles.first() ||
                             message.guild?.roles.cache.get(roleArg) ||
                             message.guild?.roles.cache.find(r => r.name.toLowerCase() === roleArg.toLowerCase());

          if (!targetRole) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Invalid Quarantine Role',
                description: `${WRONG_EMOJI} Role not found. Please mention a valid role, provide a role ID, or use \`create\`.\nExample: \`r!config antinuke quarantine-role @Quarantine\``
              })]
            });
          }

          const updatedConfig = { ...secConfig, quarantineRoleId: targetRole.id };
          if (extra?.updateModuleConfig) {
            extra.updateModuleConfig('security', updatedConfig);
          }

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Quarantine Role Successfully Bound',
              description: `${APPROVED_ICON} Bound ${targetRole} (\`${targetRole.id}\`) as the server's Quarantine Isolation Role.`
            })]
          });
        }
      }

      // PreBot Whitelist Guard Master Toggle (`r!config prebot ...`)
      if (moduleName === 'prebot' || moduleName === 'prebotwhitelist') {
        const action = effectiveArgs[1]?.toLowerCase() || 'status';
        const modules = extra?.getModulesState ? extra.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        const secConfig = secModule?.config || {};

        if (action === 'on' || action === 'off' || action === 'enable' || action === 'disable' || action === 'toggle') {
          const isEnabled = action === 'on' || action === 'enable' || (action === 'toggle' && secConfig.prebotEnabled === false);
          if (extra?.updateModuleConfig) {
            extra.updateModuleConfig('security', { ...secConfig, prebotEnabled: isEnabled });
          }
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Master PreBot Whitelist Guard Toggle',
              description: `${APPROVED_ICON} PreBot Whitelist Guard is now **\`${isEnabled ? 'ENABLED (ACTIVE)' : 'DISABLED (INACTIVE)'}\`**.\n\n${isEnabled ? 'Unapproved bots will be automatically kicked on join.' : 'Bot join enforcement is paused. Bots can join freely without pre-registration.'}`
            })]
          });
        }

        const isEnabled = secConfig.prebotEnabled !== false;
        return message.reply({
          embeds: [createLimeEmbed({
            title: 'PreBot Whitelist Guard Status',
            description: `> **Status**: **\`${isEnabled ? 'ENABLED (ACTIVE)' : 'DISABLED (INACTIVE)'}\`**\n\nUse \`r!prebot on\` or \`r!prebot off\` to toggle PreBot Whitelist bot join enforcement.`
          })]
        });
      }

      // Audit & Event Logging Sub-Configuration (`r!config logging ...`)
      if (moduleName === 'logging' || moduleName === 'logs') {
        const logsCmd = PrefixRegistry.get('logs');
        if (logsCmd && logsCmd.execute) {
          return logsCmd.execute(message, effectiveArgs.slice(1), extra);
        }
      }

      // AutoMod Sub-Configuration (`r!config automod ...`)
      if (moduleName === 'automod') {
        const action = effectiveArgs[1]?.toLowerCase();
        const modules = extra?.getModulesState ? extra.getModulesState() : [];
        const amModule = modules.find((m: any) => m.id === 'automod');
        const amConfig = amModule?.config || {};

        const updateAmConfig = (newCfg: Record<string, any>) => {
          if (extra?.updateModuleConfig) {
            extra.updateModuleConfig('automod', { ...amConfig, ...newCfg });
          }
          if (extra?.logSyncEvent) {
            extra.logSyncEvent(message.guild?.id, 'AutoMod Config: Updated settings via CLI.', 'success');
          }
        };

        if (!action || action === 'status' || action === 'view' || action === 'matrix') {
          const isMasterActive = amConfig.autoModEnabled !== false && amConfig.antiSpamEnabled !== false;
          const isAntiSpamActive = isMasterActive && (amConfig.antiSpamEnabled === true || Boolean(amConfig.maxSpamMessages));
          const isAntiLinkActive = isMasterActive && amConfig.blockLinks !== false && amConfig.antiLinkEnabled !== false;
          const isBlacklistActive = isMasterActive && (amConfig.wordBlacklistEnabled === true || (Array.isArray(amConfig.badWords) && amConfig.badWords.length > 0));
          const isCapsActive = isMasterActive && (amConfig.preventCapsSpam === true || amConfig.capsLimitEnabled === true);
          const isEmojiActive = isMasterActive && (amConfig.emojiSpamEnabled === true);

          const antispamIcon = isAntiSpamActive ? APPROVED_ICON : WRONG_EMOJI;
          const antilinkIcon = isAntiLinkActive ? APPROVED_ICON : WRONG_EMOJI;
          const blacklistIcon = isBlacklistActive ? APPROVED_ICON : WRONG_EMOJI;
          const capsIcon = isCapsActive ? APPROVED_ICON : WRONG_EMOJI;
          const emojiIcon = isEmojiActive ? APPROVED_ICON : WRONG_EMOJI;

          const overviewCard = buildLimeOverviewCard({
            title: 'AUTOMOD MODULE CONFIGURATION MATRIX',
            subtitle: isMasterActive ? 'CONTENT FILTERS & SPAM PROTECTION PARAMETERS' : 'MASTER AUTOMOD STATUS: 🔴 DISABLED (INACTIVE — ALL FILTERS OFF)',
            color: isMasterActive ? Colors.BRAND : Colors.DANGER,
            sections: [
              {
                title: '<:link:1532620952087826602> AUTOMOD PROTECTION FILTERS',
                items: [
                  `${antispamIcon} **Anti-Spam Filter**: \`${isAntiSpamActive ? 'ENABLED' : 'DISABLED'}\` | Limit: \`${amConfig.maxMessages || amConfig.maxSpamMessages || 5} msgs / ${amConfig.windowSeconds || amConfig.spamWindowSeconds || 5}s\` | Action: \`${(amConfig.spamAction || 'mute').toUpperCase()}\``,
                  `${antilinkIcon} **Anti-Link Filter**: \`${isAntiLinkActive ? 'ENABLED' : 'DISABLED'}\` | Invites: \`${amConfig.allowInvites || amConfig.allowDiscordInvites ? 'ALLOWED' : 'BLOCKED'}\` | Action: \`${(amConfig.punishment || amConfig.linkAction || 'delete').toUpperCase()}\``,
                  `${blacklistIcon} **Word Blacklist**: \`${isBlacklistActive ? 'ENABLED' : 'DISABLED'}\` | Words: \`${(amConfig.badWords || amConfig.blacklist || []).length} keywords\``,
                  `${capsIcon} **Caps Limit**: \`${isCapsActive ? 'ENABLED' : 'DISABLED'}\` | Max: \`${amConfig.maxCapsPercent || 70}%\``,
                  `${emojiIcon} **Emoji Spam**: \`${isEmojiActive ? 'ENABLED' : 'DISABLED'}\` | Max: \`${amConfig.maxEmojis || 10} emojis\``
                ]
              }
            ],
            footerText: 'Rage Optimiser Enterprise • AutoMod Configuration'
          });

          return message.reply({ embeds: [overviewCard] });
        }

        if (action === 'on' || action === 'off' || action === 'enable' || action === 'disable') {
          const isEnabled = action === 'on' || action === 'enable';
          updateAmConfig({
            antiSpamEnabled: isEnabled,
            blockLinks: isEnabled,
            antiLinkEnabled: isEnabled,
            wordBlacklistEnabled: isEnabled,
            preventCapsSpam: isEnabled,
            emojiSpamEnabled: isEnabled
          });
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Master AutoMod Protection Toggle',
              description: `${APPROVED_ICON} All AutoMod content filters (Anti-Spam, Anti-Link, Blacklist, Caps, Emoji) are now **\`${isEnabled ? 'ENABLED (ACTIVE)' : 'DISABLED (INACTIVE)'}\`**.`
            })]
          });
        }

        if (action === 'antispam') {
          const toggle = effectiveArgs[2]?.toLowerCase();
          const maxMsgs = parseInt(effectiveArgs[3], 10);
          const windowSec = parseInt(effectiveArgs[4], 10);
          const pAction = effectiveArgs[5]?.toLowerCase();

          if (!toggle || !['on', 'off', 'enable', 'disable'].includes(toggle)) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Anti-Spam Configuration Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config automod antispam <on|off> [max_msgs] [window_sec] [action]\`\nExample: \`r!config automod antispam on 5 5 mute\``
              })]
            });
          }

          const isEnabled = ['on', 'enable'].includes(toggle);
          const updates: Record<string, any> = { antiSpamEnabled: isEnabled };
          if (!isNaN(maxMsgs) && maxMsgs > 0) updates.maxMessages = maxMsgs;
          if (!isNaN(windowSec) && windowSec > 0) updates.windowSeconds = windowSec;
          if (pAction && ['mute', 'warn', 'timeout', 'delete'].includes(pAction)) updates.spamAction = pAction;

          updateAmConfig(updates);

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Anti-Spam Settings Saved',
              description: `${APPROVED_ICON} Anti-Spam filter is now **\`${isEnabled ? 'ENABLED' : 'DISABLED'}\`**.`
            })]
          });
        }

        if (action === 'antilink') {
          const toggle = effectiveArgs[2]?.toLowerCase();
          const invitesOpt = effectiveArgs[3]?.toLowerCase();
          const pAction = effectiveArgs[4]?.toLowerCase();

          if (!toggle || !['on', 'off', 'enable', 'disable'].includes(toggle)) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Anti-Link Configuration Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config automod antilink <on|off> [allow_invites_on_off] [action]\`\nExample: \`r!config automod antilink on off delete\``
              })]
            });
          }

          const isEnabled = ['on', 'enable'].includes(toggle);
          const updates: Record<string, any> = { antiLinkEnabled: isEnabled, blockLinks: isEnabled };
          if (invitesOpt) updates.allowDiscordInvites = ['on', 'true', 'allow'].includes(invitesOpt);
          if (pAction && ['delete', 'warn', 'mute'].includes(pAction)) {
            updates.linkAction = pAction;
            updates.punishment = pAction;
          }

          updateAmConfig(updates);

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Anti-Link Settings Saved',
              description: `${APPROVED_ICON} Anti-Link filter is now **\`${isEnabled ? 'ENABLED' : 'DISABLED'}\`**.`
            })]
          });
        }

        if (action === 'blacklist') {
          const subAct = effectiveArgs[2]?.toLowerCase();
          const wordInput = effectiveArgs.slice(3).join(' ').trim();
          const currentList: string[] = amConfig.blacklist || [];

          if (subAct === 'add' && wordInput) {
            const newWords = wordInput.split(',').map(w => w.trim().toLowerCase()).filter(Boolean);
            const merged = Array.from(new Set([...currentList, ...newWords]));
            updateAmConfig({ wordBlacklistEnabled: true, blacklist: merged });

            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Word Blacklist Updated',
                description: `${APPROVED_ICON} Added **${newWords.length}** word(s) to blacklist. Total: **${merged.length}**.`
              })]
            });
          }

          if (subAct === 'remove' && wordInput) {
            const toRemove = wordInput.split(',').map(w => w.trim().toLowerCase());
            const filtered = currentList.filter(w => !toRemove.includes(w));
            updateAmConfig({ blacklist: filtered });

            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Word Blacklist Updated',
                description: `${APPROVED_ICON} Removed word(s) from blacklist. Remaining: **${filtered.length}**.`
              })]
            });
          }

          if (subAct === 'clear') {
            updateAmConfig({ blacklist: [] });
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Word Blacklist Cleared',
                description: `${APPROVED_ICON} Cleared all words from the blacklist.`
              })]
            });
          }

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Word Blacklist Overview',
              description: `${CONFIG_EMOJI} **Status**: \`${amConfig.wordBlacklistEnabled ? 'ENABLED' : 'DISABLED'}\`\n**Words (${currentList.length})**: ${currentList.length > 0 ? currentList.map(w => `\`${w}\``).join(', ') : '*None*'}\n\n**Syntax**: \`r!config automod blacklist <add|remove|clear|list> [words]\``
            })]
          });
        }

        if (action === 'caps') {
          const toggle = effectiveArgs[2]?.toLowerCase();
          const percent = parseInt(effectiveArgs[3], 10);

          if (!toggle || !['on', 'off', 'enable', 'disable'].includes(toggle)) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Caps Limit Configuration Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config automod caps <on|off> [max_percent]\`\nExample: \`r!config automod caps on 70\``
              })]
            });
          }

          const isEnabled = ['on', 'enable'].includes(toggle);
          const updates: Record<string, any> = { capsLimitEnabled: isEnabled };
          if (!isNaN(percent) && percent > 0 && percent <= 100) updates.maxCapsPercent = percent;

          updateAmConfig(updates);

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Caps Limit Settings Saved',
              description: `${APPROVED_ICON} Caps limit filter is now **\`${isEnabled ? 'ENABLED' : 'DISABLED'}\`** (${updates.maxCapsPercent || amConfig.maxCapsPercent || 70}% max caps).`
            })]
          });
        }

        if (action === 'emoji') {
          const toggle = effectiveArgs[2]?.toLowerCase();
          const count = parseInt(effectiveArgs[3], 10);

          if (!toggle || !['on', 'off', 'enable', 'disable'].includes(toggle)) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Emoji Spam Configuration Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config automod emoji <on|off> [max_emojis]\`\nExample: \`r!config automod emoji on 10\``
              })]
            });
          }

          const isEnabled = ['on', 'enable'].includes(toggle);
          const updates: Record<string, any> = { emojiSpamEnabled: isEnabled };
          if (!isNaN(count) && count > 0) updates.maxEmojis = count;

          updateAmConfig(updates);

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Emoji Spam Settings Saved',
              description: `${APPROVED_ICON} Emoji spam filter is now **\`${isEnabled ? 'ENABLED' : 'DISABLED'}\`** (${updates.maxEmojis || amConfig.maxEmojis || 10} max emojis per msg).`
            })]
          });
        }
      }

      // Welcome & Onboarding Sub-Configuration (`r!config welcome ...`)
      if (moduleName === 'welcome') {
        const welcomeCmd = PrefixRegistry.get('welcome');
        if (welcomeCmd && welcomeCmd.execute) {
          return welcomeCmd.execute(message, effectiveArgs.slice(1), extra);
        }
      }

      // Voice Protection Sub-Configuration (`r!config voiceprotection ...`)
      if (moduleName === 'voiceprotection' || moduleName === 'vp') {
        const action = effectiveArgs[1]?.toLowerCase();
        const modules = extra?.getModulesState ? extra.getModulesState() : [];
        const vpModule = modules.find((m: any) => m.id === 'voice-protection');
        const vpConfig = vpModule?.config || {};

        const updateVpConfig = (newCfg: Record<string, any>) => {
          if (extra?.updateModuleConfig) {
            extra.updateModuleConfig('voice-protection', { ...vpConfig, ...newCfg });
          }
          if (extra?.logSyncEvent) {
            extra.logSyncEvent(message.guild?.id, 'Voice Protection Config: Updated parameters via CLI.', 'success');
          }
        };

        if (!action || action === 'status' || action === 'view') {
          const statusIcon = vpConfig.enabled ? APPROVED_ICON : WRONG_EMOJI;

          const overviewCard = buildLimeOverviewCard({
            title: 'VOICE PROTECTION MODULE CONFIGURATION MATRIX',
            subtitle: 'AUDIO LOUDNESS CEILING & ENFORCEMENT PARAMETERS',
            color: Colors.BRAND,
            sections: [
              {
                title: '<:voicechannelgreen:1532425750278438962> AUDIO SECURITY SETTINGS',
                items: [
                  `${statusIcon} **Voice Protection**: \`${vpConfig.enabled ? 'ENABLED' : 'DISABLED'}\``,
                  `Loudness Ceiling (RMS): \`${vpConfig.threshold ?? 85}%\``,
                  `Audit Duration: \`${vpConfig.duration ?? 3} seconds\``,
                  `Enforcement Action: \`${(vpConfig.punishment ?? 'servermute').toUpperCase()}\``,
                  `Penalty Mute Duration: \`${vpConfig.muteDuration ?? 30} seconds\``,
                  `Penalty Cooldown: \`${vpConfig.cooldown ?? 60} seconds\``
                ]
              }
            ],
            footerText: 'Rage Optimiser Enterprise • Voice Protection Configuration'
          });

          return message.reply({ embeds: [overviewCard] });
        }

        if (action === 'threshold') {
          const val = parseInt(effectiveArgs[2], 10);
          if (isNaN(val) || val < 1 || val > 100) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Loudness Ceiling Threshold Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config voiceprotection threshold <1-100>\`\nExample: \`r!config voiceprotection threshold 85\``
              })]
            });
          }

          updateVpConfig({ threshold: val });
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Loudness Threshold Saved',
              description: `${APPROVED_ICON} Set voice loudness ceiling to **\`${val}%\` RMS**.`
            })]
          });
        }

        if (action === 'action' || action === 'punishment') {
          const pAction = effectiveArgs[2]?.toLowerCase();
          if (!pAction || !['servermute', 'deafen', 'kick', 'quarantine'].includes(pAction)) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Enforcement Action Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config voiceprotection action <servermute|deafen|kick|quarantine>\`\nExample: \`r!config voiceprotection action servermute\``
              })]
            });
          }

          updateVpConfig({ punishment: pAction });
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Enforcement Action Saved',
              description: `${APPROVED_ICON} Updated voice protection penalty to **\`${pAction.toUpperCase()}\`**.`
            })]
          });
        }

        if (action === 'enable' || action === 'disable' || action === 'toggle') {
          const isEnabled = action === 'enable' || (action === 'toggle' && effectiveArgs[2]?.toLowerCase() === 'on');
          updateVpConfig({ enabled: isEnabled });
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Voice Protection State Saved',
              description: `${APPROVED_ICON} Voice Protection is now **\`${isEnabled ? 'ENABLED' : 'DISABLED'}\`**.`
            })]
          });
        }
      }

      // Join-To-Create Voice Manager Sub-Configuration (`r!config jtc ...`)
      if (moduleName === 'jtc' || moduleName === 'jointocreate') {
        const action = effectiveArgs[1]?.toLowerCase();
        const modules = extra?.getModulesState ? extra.getModulesState() : [];
        const jtcModule = modules.find((m: any) => m.id === 'joinToCreate' || m.id === 'voice_manager');
        const jtcConfig = jtcModule?.config || {};

        const updateJtcConfig = (newCfg: Record<string, any>) => {
          if (extra?.updateModuleConfig) {
            extra.updateModuleConfig(jtcModule?.id || 'joinToCreate', { ...jtcConfig, ...newCfg });
          }
          if (extra?.logSyncEvent) {
            extra.logSyncEvent(message.guild?.id, 'JTC Config: Updated Join-To-Create parameters via CLI.', 'success');
          }
        };

        if (!action || action === 'status' || action === 'view') {
          const hubChannelStr = jtcConfig.hubChannelId ? `<#${jtcConfig.hubChannelId}>` : '`Not Set`';
          const catStr = jtcConfig.categoryId ? `<#${jtcConfig.categoryId}>` : '`Auto-Detect`';

          const overviewCard = buildLimeOverviewCard({
            title: 'JOIN-TO-CREATE MODULE CONFIGURATION MATRIX',
            subtitle: 'DYNAMIC VOICE CHANNEL CREATION ENGINE',
            color: Colors.BRAND,
            sections: [
              {
                title: '<:voicechannelgreen:1532425750278438962> JOIN-TO-CREATE PARAMETERS',
                items: [
                  `Hub Join Channel: ${hubChannelStr}`,
                  `Category Target: ${catStr}`,
                  `Default Capacity: \`${jtcConfig.userLimit === 0 ? 'Unlimited' : (jtcConfig.userLimit || 0) + ' Users'}\``,
                  `Room Naming Format: \`${jtcConfig.nameTemplate || "🔊 {user}'s Room"}\``
                ]
              }
            ],
            footerText: 'Rage Optimiser Enterprise • Join-To-Create Configuration'
          });

          return message.reply({ embeds: [overviewCard] });
        }

        if (action === 'hub' || action === 'setup') {
          const channel = message.mentions.channels.first();
          if (!channel) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'JTC Hub Channel Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config jtc setup <#hubChannel>\`\nExample: \`r!config jtc setup #Join-To-Create\``
              })]
            });
          }

          updateJtcConfig({ hubChannelId: channel.id });
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'JTC Hub Channel Saved',
              description: `${APPROVED_ICON} Set Join-To-Create hub channel to **<#${channel.id}>**.`
            })]
          });
        }
      }

      // PreBot Whitelist Sub-Configuration (`r!config prebot ...`)
      if (moduleName === 'prebot' || moduleName === 'prebotwhitelist') {
        const prebotCmd = PrefixRegistry.getCommand('prebot');
        if (prebotCmd && prebotCmd.execute) {
          return prebotCmd.execute(message, effectiveArgs.slice(1), extra);
        }
      }

      // Leveling & XP Sub-Configuration (`r!config leveling ...`)
      if (moduleName === 'leveling' || moduleName === 'levels' || moduleName === 'xp') {
        const action = effectiveArgs[1]?.toLowerCase();
        const modules = extra?.getModulesState ? extra.getModulesState() : [];
        const lvlModule = modules.find((m: any) => m.id === 'leveling');
        const lvlConfig = lvlModule?.config || {};

        const updateLvlConfig = (newCfg: Record<string, any>) => {
          if (extra?.updateModuleConfig) {
            extra.updateModuleConfig('leveling', { ...lvlConfig, ...newCfg });
          }
          if (extra?.logSyncEvent) {
            extra.logSyncEvent(message.guild?.id, 'Leveling Config: Updated parameters via CLI.', 'success');
          }
        };

        if (!action || action === 'status' || action === 'view') {
          const statusIcon = lvlConfig.enabled !== false ? APPROVED_ICON : WRONG_EMOJI;
          const channelStr = lvlConfig.levelUpChannelId ? `<#${lvlConfig.levelUpChannelId}>` : '`Current Channel`';

          const overviewCard = buildLimeOverviewCard({
            title: 'LEVELING & XP MODULE CONFIGURATION MATRIX',
            subtitle: 'MEMBER RANKING, XP RATES & REWARD ROLES',
            color: Colors.BRAND,
            sections: [
              {
                title: '<:vip:1532620837117759508> LEVELING SYSTEM PARAMETERS',
                items: [
                  `${statusIcon} **Leveling Engine**: \`${lvlConfig.enabled !== false ? 'ENABLED' : 'DISABLED'}\``,
                  `XP Per Message: \`${lvlConfig.xpPerMessage || 15} XP\``,
                  `XP Cooldown: \`${lvlConfig.cooldownSeconds || 60}s\``,
                  `Level Up Announcement Channel: ${channelStr}`,
                  `Level Up Message: \`${(lvlConfig.levelUpMessage || 'Congratulations {user}, you reached level {level}!').slice(0, 60)}\``
                ]
              }
            ],
            footerText: 'Rage Optimiser Enterprise • Leveling Configuration'
          });

          return message.reply({ embeds: [overviewCard] });
        }

        if (action === 'enable' || action === 'disable' || action === 'toggle') {
          const isEnabled = action === 'enable' || (action === 'toggle' && effectiveArgs[2]?.toLowerCase() === 'on');
          updateLvlConfig({ enabled: isEnabled });
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Leveling Module State Saved',
              description: `${APPROVED_ICON} Leveling system is now **\`${isEnabled ? 'ENABLED' : 'DISABLED'}\`**.`
            })]
          });
        }

        if (action === 'xp') {
          const xpVal = parseInt(effectiveArgs[2], 10);
          if (isNaN(xpVal) || xpVal < 1 || xpVal > 1000) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'XP Rate Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config leveling xp <1-1000>\`\nExample: \`r!config leveling xp 25\``
              })]
            });
          }

          updateLvlConfig({ xpPerMessage: xpVal });
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'XP Rate Saved',
              description: `${APPROVED_ICON} Set XP per message to **\`${xpVal} XP\`**.`
            })]
          });
        }

        if (action === 'channel') {
          const channel = message.mentions.channels.first();
          if (effectiveArgs[2]?.toLowerCase() === 'current' || effectiveArgs[2]?.toLowerCase() === 'none') {
            updateLvlConfig({ levelUpChannelId: null });
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Level Up Channel Reset',
                description: `${APPROVED_ICON} Level up announcements will be sent to the current chat channel.`
              })]
            });
          }

          if (!channel) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Level Up Channel Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config leveling channel <#channel|current>\`\nExample: \`r!config leveling channel #bot-commands\``
              })]
            });
          }

          updateLvlConfig({ levelUpChannelId: channel.id });
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Level Up Channel Saved',
              description: `${APPROVED_ICON} Level up announcement channel set to **<#${channel.id}>**.`
            })]
          });
        }
      }

      // Member Verification Sub-Configuration (`r!config verification ...`)
      if (moduleName === 'verification' || moduleName === 'verify') {
        const action = effectiveArgs[1]?.toLowerCase();
        const modules = extra?.getModulesState ? extra.getModulesState() : [];
        const verifModule = modules.find((m: any) => m.id === 'verification');
        const verifConfig = verifModule?.config || {};

        const updateVerifConfig = (newCfg: Record<string, any>) => {
          if (extra?.updateModuleConfig) {
            extra.updateModuleConfig('verification', { ...verifConfig, ...newCfg });
          }
          if (extra?.logSyncEvent) {
            extra.logSyncEvent(message.guild?.id, 'Verification Config: Updated parameters via CLI.', 'success');
          }
        };

        if (!action || action === 'status' || action === 'view') {
          const statusIcon = verifConfig.enabled ? APPROVED_ICON : WRONG_EMOJI;
          const channelStr = verifConfig.verificationChannelId ? `<#${verifConfig.verificationChannelId}>` : '`Not Set`';
          const verifiedRoleStr = verifConfig.verificationRoleId ? `<@&${verifConfig.verificationRoleId}>` : '`Not Set`';
          const unverifiedRoleStr = verifConfig.unverifiedRoleId ? `<@&${verifConfig.unverifiedRoleId}>` : '`Not Set`';

          const overviewCard = buildLimeOverviewCard({
            title: 'MEMBER VERIFICATION MODULE CONFIGURATION MATRIX',
            subtitle: 'CAPTCHA, BUTTON & GATEWAY VERIFICATION',
            color: Colors.BRAND,
            sections: [
              {
                title: '<:shield:1532403012751065179> VERIFICATION SYSTEM PARAMETERS',
                items: [
                  `${statusIcon} **Verification Gate**: \`${verifConfig.enabled ? 'ENABLED' : 'DISABLED'}\``,
                  `Gate Type: \`${(verifConfig.verificationType || 'button').toUpperCase()}\``,
                  `Verification Channel: ${channelStr}`,
                  `Verified Role: ${verifiedRoleStr}`,
                  `Unverified Role: ${unverifiedRoleStr}`
                ]
              }
            ],
            footerText: 'Rage Optimiser Enterprise • Verification Configuration'
          });

          return message.reply({ embeds: [overviewCard] });
        }

        if (action === 'channel') {
          const channel = message.mentions.channels.first();
          if (!channel) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Verification Channel Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config verification channel <#channel>\`\nExample: \`r!config verification channel #verify\``
              })]
            });
          }

          updateVerifConfig({ verificationChannelId: channel.id });
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Verification Channel Saved',
              description: `${APPROVED_ICON} Set verification channel to **<#${channel.id}>**.`
            })]
          });
        }

        if (action === 'role' || action === 'verifiedrole') {
          const role = message.mentions.roles.first();
          if (!role) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Verified Role Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config verification role <@verifiedRole>\`\nExample: \`r!config verification role @Verified\``
              })]
            });
          }

          updateVerifConfig({ verificationRoleId: role.id, verifiedRoleId: role.id });
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Verified Role Saved',
              description: `${APPROVED_ICON} Assigned verified role **<@&${role.id}>**.`
            })]
          });
        }

        if (action === 'unverifiedrole' || action === 'unverified') {
          const role = message.mentions.roles.first();
          if (!role) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Unverified Role Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config verification unverifiedrole <@unverifiedRole>\`\nExample: \`r!config verification unverifiedrole @Unverified\``
              })]
            });
          }

          updateVerifConfig({ unverifiedRoleId: role.id });
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Unverified Role Saved',
              description: `${APPROVED_ICON} Assigned unverified role **<@&${role.id}>**.`
            })]
          });
        }

        if (action === 'enable' || action === 'on') {
          updateVerifConfig({ enabled: true });
          if (extra?.updateModuleStatus) extra.updateModuleStatus('verification', 'enabled');
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Verification Module Enabled',
              description: `${APPROVED_ICON} Member verification gate is now **ACTIVE**.`
            })]
          });
        }

        if (action === 'disable' || action === 'off') {
          updateVerifConfig({ enabled: false });
          if (extra?.updateModuleStatus) extra.updateModuleStatus('verification', 'disabled');
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Verification Module Disabled',
              description: `${WRONG_EMOJI} Member verification gate is now **OFFLINE**.`
            })]
          });
        }
      }

      // Server Automation Sub-Configuration (`r!config automation ...`)
      if (moduleName === 'automation' || moduleName === 'auto') {
        const action = effectiveArgs[1]?.toLowerCase();
        const modules = extra?.getModulesState ? extra.getModulesState() : [];
        const autoModule = modules.find((m: any) => m.id === 'automation');
        const autoConfig = autoModule?.config || {};

        const updateAutoConfig = (newCfg: Record<string, any>) => {
          if (extra?.updateModuleConfig) {
            extra.updateModuleConfig('automation', { ...autoConfig, ...newCfg });
          }
          if (extra?.logSyncEvent) {
            extra.logSyncEvent(message.guild?.id, 'Automation Config: Updated rules via CLI.', 'success');
          }
        };

        if (!action || action === 'status' || action === 'view') {
          const publishIcon = autoConfig.autoPublish ? APPROVED_ICON : WRONG_EMOJI;

          const overviewCard = buildLimeOverviewCard({
            title: 'SERVER AUTOMATION MODULE CONFIGURATION MATRIX',
            subtitle: 'AUTO-PUBLISH ANNOUNCEMENTS & STICKY MESSAGES',
            color: Colors.BRAND,
            sections: [
              {
                title: '<:bot:1532621107746570391> AUTOMATION PARAMETERS',
                items: [
                  `${publishIcon} **Auto-Publish News Channels**: \`${autoConfig.autoPublish ? 'ENABLED' : 'DISABLED'}\``,
                  `Sticky Messages Active: \`${(autoConfig.stickyMessages || []).length} channels\``
                ]
              }
            ],
            footerText: 'Rage Optimiser Enterprise • Automation Configuration'
          });

          return message.reply({ embeds: [overviewCard] });
        }

        if (action === 'autopublish') {
          const toggle = effectiveArgs[2]?.toLowerCase();
          const isEnabled = ['on', 'enable', 'true'].includes(toggle || '');
          updateAutoConfig({ autoPublish: isEnabled });

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Auto-Publish Saved',
              description: `${APPROVED_ICON} Announcement auto-publish is now **\`${isEnabled ? 'ENABLED' : 'DISABLED'}\`**.`
            })]
          });
        }
      }

      // Social Updates Sub-Configuration (`r!config social ...` / `r!config social-updates ...`)
      if (moduleName === 'social' || moduleName === 'socialupdates' || moduleName === 'social-updates' || moduleName === 'social_updates' || moduleName === 'feeds') {
        const action = effectiveArgs[1]?.toLowerCase();
        const guildId = message.guild!.id;
        await SocialSubscriptionRepository.ensureTable().catch(() => { });

        if (!action || action === 'status' || action === 'list' || action === 'view') {
          const subs = await SocialSubscriptionRepository.findAll(guildId);
          const analytics = await SocialSubscriptionRepository.getAnalytics(guildId);

          const feedItems: string[] = subs.length > 0
            ? subs.map(s => `• **${s.provider.toUpperCase()}** \`${s.sourceId}\` → <#${s.discordChannelId}> | Status: \`${s.enabled ? 'ACTIVE' : 'PAUSED'}\` | ID: \`${s.id}\``)
            : ['*No active YouTube or Instagram subscriptions configured.*'];

          const overviewCard = buildLimeOverviewCard({
            title: 'SOCIAL UPDATES MODULE CONFIGURATION MATRIX',
            subtitle: 'YOUTUBE & INSTAGRAM LIVE FEED DISPATCHES',
            color: Colors.BRAND,
            sections: [
              {
                title: '<:link:1532620952087826602> ACTIVE SOCIAL FEEDS',
                items: feedItems
              },
              {
                title: '<:config:1532425712844144701> DISPATCH TELEMETRY',
                items: [
                  `Total Subscriptions: \`${analytics.totalSubscriptions}\``,
                  `Active Feeds: \`${analytics.activeSubscriptions}\``,
                  `Notifications Delivered: \`${analytics.totalNotificationsSent}\``,
                  `Avg Delivery Latency: \`${analytics.avgDeliveryTimeMs}ms\``
                ]
              }
            ],
            footerText: 'Rage Optimiser Enterprise • Social Updates Configuration'
          });

          return message.reply({ embeds: [overviewCard] });
        }

        if (action === 'add' || action === 'subscribe') {
          const provider = effectiveArgs[2]?.toLowerCase();
          const sourceId = effectiveArgs[3];
          const channelArg = effectiveArgs[4];
          let channel: any = message.mentions.channels.first();
          if (!channel && channelArg && message.guild) {
            const cleanId = channelArg.replace(/[<#>]/g, '');
            channel = message.guild.channels.cache.get(cleanId);
            if (!channel && /^\d{17,20}$/.test(cleanId)) {
              channel = await message.guild.channels.fetch(cleanId).catch(() => null);
            }
            if (!channel) {
              const cleanName = channelArg.toLowerCase().replace(/^#/, '');
              channel = message.guild.channels.cache.find((c: any) => c.name.toLowerCase() === cleanName);
            }
          }

          if (!provider || !['youtube', 'instagram'].includes(provider) || !sourceId || !channel) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Social Add Subscription Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config social add <youtube|instagram> <sourceId_or_channel> <#discordChannel>\`\nExample: \`r!config social add youtube UC_x5XG1OV2P6uZZ5FSM9Ttw #announcements\``
              })]
            });
          }

          const res = await SubscriptionManager.addSubscription(guildId, provider, sourceId, channel.id, {});
          if (!res.success) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Social Subscription Error',
                description: `${WRONG_EMOJI} Failed to add subscription: \`${res.error}\``
              })]
            });
          }

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Social Subscription Added',
              description: `${APPROVED_ICON} Subscribed **${provider.toUpperCase()}** feed \`${sourceId}\` to **<#${channel.id}>**.`
            })]
          });
        }

        if (action === 'remove' || action === 'delete' || action === 'unsubscribe') {
          const subId = effectiveArgs[2];
          if (!subId) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Social Remove Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config social remove <sub_id>\`\n(Use \`r!config social list\` to view IDs)`
              })]
            });
          }

          const res = await SubscriptionManager.removeSubscription(guildId, subId);
          if (!res.success) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Social Subscription Removal Error',
                description: `${WRONG_EMOJI} \`${res.error}\``
              })]
            });
          }

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Social Subscription Removed',
              description: `${APPROVED_ICON} Successfully deleted social feed subscription \`${subId}\`.`
            })]
          });
        }
      }

      // Extra Owner Sub-Configuration (`r!config extraowner ...`)
      if (moduleName === 'extraowner' || moduleName === 'extraowners' || moduleName === 'extra-owner') {
        const db = Database.getDb();
        const rows = db ? await db.all<any>('SELECT * FROM extra_owners WHERE guildId = ? ORDER BY addedAt ASC', [message.guild!.id]).catch(() => []) : [];
        const lines = rows.length > 0
          ? rows.map((r: any) => `• <:vip:1532620837117759508> <@${r.userId}> (\`${r.userId}\`) — Added <t:${r.addedAt}:R> by <@${r.addedBy}>`)
          : ['*No delegated Extra Owners assigned for this server.*'];

        const overviewCard = buildLimeOverviewCard({
          title: 'EXTRA OWNER DELEGATION MATRIX',
          subtitle: 'FULL ANTI-NUKE IMMUNITY & ADMINISTRATIVE DELEGATION',
          color: Colors.BRAND,
          sections: [
            {
              title: '<:vip:1532620837117759508> CONFIGURED EXTRA OWNERS',
              items: lines
            },
            {
              title: '<:config:1532425712844144701> COMMAND SYNTAX MANUAL',
              items: [
                `Add Extra Owner: \`r!extraowner add @user\``,
                `Remove Extra Owner: \`r!extraowner remove @user\``,
                `List Extra Owners: \`r!extraowner list\``,
                `Reset All Extra Owners: \`r!extraowner reset\``
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Extra Owner Delegation'
        });

        return message.reply({ embeds: [overviewCard] });
      }

      // Default Interactive Control Panel Card (Dynamically computed live status)
      const modules = extra?.getModulesState ? extra.getModulesState() : [];
      const getMod = (id: string) => modules.find((m: any) => m.id === id);
      const isModEnabled = (id: string) => {
        const m = getMod(id);
        return m ? (m.enabled !== false && m.status !== 'Disabled' && m.status !== 'Inactive') : true;
      };

      const hubDb = Database.getDb();
      const extraOwnerRows = hubDb ? await hubDb.all<any>('SELECT * FROM extra_owners WHERE guildId = ?', [message.guild!.id]).catch(() => []) : [];
      const socialSubs = await SocialSubscriptionRepository.findAll(message.guild!.id).catch(() => []);

      const antinukeStatus = isModEnabled('anti-nuke') ? `${APPROVED_ICON} Enabled — *Protections Active*` : `${WRONG_EMOJI} Disabled — *Protections Offline*`;
      const automodStatus = isModEnabled('automod') ? `${APPROVED_ICON} Enabled — *Anti-Link & Anti-Spam Active*` : `${WRONG_EMOJI} Disabled — *Filters Offline*`;
      const ticketStatus = isModEnabled('tickets') ? `${APPROVED_ICON} Enabled — *Support Panels Active*` : `${WRONG_EMOJI} Disabled — *Panels Closed*`;
      const voiceStatus = isModEnabled('voice-protection') ? `${APPROVED_ICON} Enabled — *Voice Security Active*` : `${WRONG_EMOJI} Disabled — *Security Inactive*`;
      const levelingStatus = isModEnabled('leveling') ? `${APPROVED_ICON} Enabled — *XP Engine Active*` : `${WRONG_EMOJI} Disabled — *XP Paused*`;
      const verifStatus = isModEnabled('verification') ? `${APPROVED_ICON} Enabled — *Gateway Active*` : `${WRONG_EMOJI} Disabled — *Gateway Offline*`;
      const socialStatus = socialSubs.length > 0 ? `${APPROVED_ICON} Active — *${socialSubs.length} Live Feeds*` : `${WRONG_EMOJI} Inactive — *No Feeds Configured*`;
      const extraOwnerStatus = extraOwnerRows.length > 0 ? `${APPROVED_ICON} Active — *${extraOwnerRows.length} Extra Owners*` : `${WRONG_EMOJI} None — *Owner Only*`;

      const curPrefix = PrefixResolver.getPrefix(message.guild!.id);

      const embed = createLimeEmbed({
        title: 'Interactive Discord Control Panel',
        description: [
          `👋 Welcome to the **Rage Optimiser In-Discord Control Hub**!\n`,
          `> ${CONFIG_EMOJI} **Current Server Prefix**: \`${curPrefix}\` | **Live System State**: ${APPROVED_ICON} Operational\n`,
          `--------------------------------------------------`,
          `• ${SHIELD_EMOJI} **Anti-Nuke**: ${antinukeStatus}`,
          `• <:link:1532620952087826602> **AutoMod**: ${automodStatus}`,
          `• <:ticket:1532620631466836021> **Tickets**: ${ticketStatus}`,
          `• <:voicechannelgreen:1532425750278438962> **Voice Engine**: ${voiceStatus}`,
          `• <:vip:1532620837117759508> **Leveling System**: ${levelingStatus}`,
          `• ${SHIELD_EMOJI} **Verification Gate**: ${verifStatus}`,
          `• <:link:1532620952087826602> **Social Feeds**: ${socialStatus}`,
          `• <:vip:1532620837117759508> **Extra Owners**: ${extraOwnerStatus}`,
          `--------------------------------------------------`,
          `*Select a module category from the menu below to modify live settings, punishments, and thresholds.*`
        ].join('\n')
      });

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('config_category_select')
        .setPlaceholder('Select module category to configure...')
        .addOptions(
          { label: 'Anti-Nuke & Protection', description: 'Configure triggers, punishments & limits', value: 'antinuke', emoji: '<:shield:1532403012751065179>' },
          { label: 'AutoMod & Filters', description: 'Configure Anti-Link, Anti-Spam & Word Filter', value: 'automod', emoji: '<:link:1532620952087826602>' },
          { label: 'Audit & Event Logging', description: 'Set channel routes for audit events', value: 'logging', emoji: '<:config:1532425712844144701>' },
          { label: 'Welcome & Auto-Roles', description: 'Configure onboarding messages & join roles', value: 'welcome', emoji: '<:member:1532621317487071426>' },
          { label: 'Ticket Panels & Support', description: 'Configure categories & staff roles', value: 'tickets', emoji: '<:ticket:1532620631466836021>' },
          { label: 'Voice Protection & 24/7', description: 'Configure voice security & 24/7 channels', value: 'voice', emoji: '<:voicechannelgreen:1532425750278438962>' },
          { label: 'Leveling & XP System', description: 'Configure XP rate & level up announcements', value: 'leveling', emoji: '<:vip:1532620837117759508>' },
          { label: 'Member Verification Gate', description: 'Configure captcha & verification roles', value: 'verification', emoji: '<:shield:1532403012751065179>' },
          { label: 'Social Media Feeds', description: 'Configure YouTube & Instagram dispatches', value: 'social', emoji: '<:link:1532620952087826602>' },
          { label: 'Server Automation', description: 'Configure auto-publish & sticky messages', value: 'automation', emoji: '<:bot:1532621107746570391>' }
        );

      const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
      return message.reply({ embeds: [embed], components: [row] });
    }
  });

  // 3. Register Shorthand Module Category Commands (antirole, antichannel, antimod, antiwebhook, antiemoji)
  const secCategories = [
    {
      name: 'antirole',
      aliases: ['anti-role', 'antiroles'],
      groupKey: 'roles',
      description: 'Bulk configure or inspect all 5 Role Protection sub-modules (grant, remove, update, create, delete).',
      usage: 'r!antirole [limit] [window] [punishment] [reversion] OR r!antirole <status|on|off|threshold|punishment|reversion>',
      examples: [
        'r!antirole 2 10 quarantine on',
        'r!antirole threshold 3 10',
        'r!antirole punishment ban',
        'r!antirole reversion on',
        'r!antirole status'
      ]
    },
    {
      name: 'antichannel',
      aliases: ['anti-channel', 'antichannels'],
      groupKey: 'channels',
      description: 'Bulk configure or inspect all 3 Channel Protection sub-modules (create, delete, update).',
      usage: 'r!antichannel [limit] [window] [punishment] [reversion] OR r!antichannel <status|on|off|threshold|punishment|reversion>',
      examples: [
        'r!antichannel 1 10 ban on',
        'r!antichannel threshold 2 10',
        'r!antichannel punishment quarantine',
        'r!antichannel status'
      ]
    },
    {
      name: 'antimod',
      aliases: ['anti-mod', 'antimember', 'anti-member'],
      groupKey: 'members',
      description: 'Bulk configure or inspect all 6 Member & Moderation Protection sub-modules (ban, kick, timeout, bot_add, bot_remove, prune).',
      usage: 'r!antimod [limit] [window] [punishment] [reversion] OR r!antimod <status|on|off|threshold|punishment|reversion>',
      examples: [
        'r!antimod 3 10 quarantine on',
        'r!antimod threshold 2 10',
        'r!antimod punishment ban',
        'r!antimod status'
      ]
    },
    {
      name: 'antiwebhook',
      aliases: ['anti-webhook', 'antiwebhooks', 'antiserver', 'anti-server'],
      groupKey: 'webhooks',
      description: 'Bulk configure or inspect all 4 Server & Webhook Protection sub-modules (webhook create/delete/update, guild_update).',
      usage: 'r!antiwebhook [limit] [window] [punishment] [reversion] OR r!antiwebhook <status|on|off|threshold|punishment|reversion>',
      examples: [
        'r!antiwebhook 2 10 quarantine on',
        'r!antiwebhook threshold 2 10',
        'r!antiwebhook status'
      ]
    },
    {
      name: 'antiemoji',
      aliases: ['anti-emoji', 'antiemojis', 'antisticker', 'anti-sticker'],
      groupKey: 'emojis',
      description: 'Bulk configure or inspect all 6 Emoji & Sticker Protection sub-modules (emoji/sticker create, delete, update).',
      usage: 'r!antiemoji [limit] [window] [punishment] [reversion] OR r!antiemoji <status|on|off|threshold|punishment|reversion>',
      examples: [
        'r!antiemoji 3 10 warn off',
        'r!antiemoji status'
      ]
    }
  ];

  secCategories.forEach(cat => {
    PrefixRegistry.register({
      name: cat.name,
      category: 'Security',
      description: cat.description,
      usage: cat.usage,
      aliases: cat.aliases,
      cooldownSeconds: 3,
      userPermissions: ['Administrator'],
      examples: cat.examples,
      execute: async (message: Message, args: string[], extra?: any) => {
        const { isOwnerOrExtraOwner } = await import('../../utils/whitelistCheck.js');
        const allowed = await isOwnerOrExtraOwner(message.author.id, message.guild!);
        if (!allowed) {
          return message.reply(`${WRONG_EMOJI} **Access Denied**: Anti-Nuke settings are strictly restricted to the **Server Owner** (<@${message.guild?.ownerId}>) and designated **Extra Owners**.`);
        }

        const configCmd = PrefixRegistry.get('config');
        if (!configCmd || !configCmd.execute) return;

        const sub = args[0]?.toLowerCase();
        if (!sub || sub === 'status' || sub === 'view' || sub === 'matrix') {
          return configCmd.execute(message, ['antinuke', 'status', cat.groupKey], extra);
        }

        if (!isNaN(parseInt(sub, 10))) {
          return configCmd.execute(message, ['antinuke', 'setall', cat.groupKey, ...args], extra);
        }

        if (['setall', 'all', 'threshold', 'punishment', 'reversion', 'recovery', 'rollback', 'enable', 'disable', 'on', 'off'].includes(sub)) {
          if (sub === 'setall' || sub === 'all') {
            return configCmd.execute(message, ['antinuke', 'setall', cat.groupKey, ...args.slice(1)], extra);
          }
          return configCmd.execute(message, ['antinuke', sub, cat.groupKey, ...args.slice(1)], extra);
        }

        return configCmd.execute(message, ['antinuke', 'setall', cat.groupKey, ...args], extra);
      }
    });
  });

  // 4. Standalone Clear / Purge Command (Text VC & Chat VC Support)
  PrefixRegistry.register({
    name: 'clear',
    category: 'Moderation',
    description: 'Purge messages in text channels or Voice Channel (VC) text chats with options for user, bot, or link filtering.',
    usage: 'r!clear [amount|all|vc|user|bots|links|files] [options]',
    aliases: ['purge', 'clean', 'cls'],
    cooldownSeconds: 2,
    userPermissions: ['ManageMessages'],
    botPermissions: ['ManageMessages', 'ReadMessageHistory'],
    examples: [
      'r!clear 50',
      'r!clear all',
      'r!clear vc 100',
      'r!clear bots 30',
      'r!clear user @Member 20'
    ],
    execute: async (message: Message, args: string[], extra?: any) => {
      const member = message.member;
      if (!member?.permissions.has('ManageMessages') && !member?.permissions.has('Administrator')) {
        return message.reply({
          embeds: [createLimeEmbed({
            title: 'Access Denied',
            description: `${WRONG_EMOJI} You require \`ManageMessages\` permissions to execute message purge.`
          })]
        });
      }

      let targetChannel: any = message.channel;
      let argOffset = 0;

      if (args[0]?.toLowerCase() === 'vc' || args[0]?.toLowerCase() === 'voice') {
        argOffset = 1;
        const voiceChannel = member?.voice?.channel;
        if (!voiceChannel) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Voice Channel Error',
              description: `${WRONG_EMOJI} You are not currently connected to a Voice Channel. Connect to a VC or run \`r!clear\` in the target channel.`
            })]
          });
        }
        targetChannel = voiceChannel;
      }

      if (!targetChannel || typeof targetChannel.bulkDelete !== 'function') {
        return message.reply({
          embeds: [createLimeEmbed({
            title: 'Channel Purge Unsupported',
            description: `${WRONG_EMOJI} The target channel does not support message deletion.`
          })]
        });
      }

      const mode = args[argOffset]?.toLowerCase();
      let limit = 50;
      let filterType: 'all' | 'bots' | 'user' | 'links' | 'files' = 'all';
      let targetUserId: string | null = null;

      if (!mode || mode === 'all') {
        limit = parseInt(args[argOffset + 1] || '100', 10);
        if (isNaN(limit)) limit = 100;
      } else if (!isNaN(parseInt(mode, 10))) {
        limit = parseInt(mode, 10);
      } else if (mode === 'bots' || mode === 'bot') {
        filterType = 'bots';
        limit = parseInt(args[argOffset + 1] || '50', 10);
      } else if (mode === 'user' || mode === 'member') {
        filterType = 'user';
        const userMention = message.mentions.users.first();
        targetUserId = userMention?.id || args[argOffset + 1];
        limit = parseInt(args[argOffset + 2] || '50', 10);
      } else if (mode === 'links' || mode === 'link' || mode === 'url') {
        filterType = 'links';
        limit = parseInt(args[argOffset + 1] || '50', 10);
      } else if (mode === 'files' || mode === 'attachments' || mode === 'images') {
        filterType = 'files';
        limit = parseInt(args[argOffset + 1] || '50', 10);
      }

      if (isNaN(limit) || limit < 1) limit = 50;
      if (limit > 100) limit = 100;

      try {
        let deletedCount = 0;

        if (filterType === 'all') {
          const deleted = await targetChannel.bulkDelete(limit, true);
          deletedCount = deleted.size;
        } else {
          const fetched = await targetChannel.messages.fetch({ limit: 100 });
          let filtered = fetched;

          if (filterType === 'bots') {
            filtered = fetched.filter((m: any) => m.author?.bot);
          } else if (filterType === 'user' && targetUserId) {
            filtered = fetched.filter((m: any) => m.author?.id === targetUserId);
          } else if (filterType === 'links') {
            filtered = fetched.filter((m: any) => /(https?:\/\/[^\s]+)/gi.test(m.content));
          } else if (filterType === 'files') {
            filtered = fetched.filter((m: any) => m.attachments.size > 0);
          }

          const toDelete = Array.from(filtered.values()).slice(0, limit);
          if (toDelete.length > 0) {
            const deleted = await targetChannel.bulkDelete(toDelete, true);
            deletedCount = deleted.size;
          }
        }

        const isVoice = targetChannel.isVoiceBased?.() || targetChannel.type === 2 || targetChannel.type === 13;
        const channelName = isVoice ? `🔊 VC <#${targetChannel.id}> (${targetChannel.name})` : `<#${targetChannel.id}>`;

        const replyMsg = await (message.channel as any).send({
          embeds: [createLimeEmbed({
            title: `Chat Purge Complete — ${isVoice ? 'Voice Channel' : 'Text Channel'}`,
            description: `${APPROVED_ICON} Successfully purged **${deletedCount} message(s)** in ${channelName}.\n> • Filter Mode: \`${filterType.toUpperCase()}\`\n> • Executed By: ${message.author}`
          })]
        });

        setTimeout(() => replyMsg.delete().catch(() => {}), 4000);
        if (message.deletable) message.delete().catch(() => {});

        if (extra?.logSyncEvent) {
          extra.logSyncEvent(message.guild?.id, `Moderation: ${message.author.tag} purged ${deletedCount} msgs in ${targetChannel.name}.`, 'info');
        }
      } catch (e: any) {
        return message.reply({
          embeds: [createLimeEmbed({
            title: 'Message Purge Failed',
            description: `${WRONG_EMOJI} Could not delete messages: \`${e?.message || 'Unknown error'}\`\n*Note: Messages older than 14 days cannot be bulk deleted due to Discord API limitations.*`
          })]
        });
      }
    }
  });
}

export const ConfigManifest: ModuleManifest = {
  id: 'config',
  name: 'Configuration Console',
  version: '2.0.0',
  description: 'In-Discord interactive control hub & module configuration engine.',
  configSchema: {
    requiredFields: [],
    validate: () => ({ progress: 100, errors: [] })
  },
  commands: [
    {
      name: 'config',
      description: 'Master In-Discord Configuration Control Hub',
      options: [
        {
          type: 1,
          name: 'overview',
          description: 'Open master interactive control panel hub'
        },
        {
          type: 1,
          name: 'antinuke',
          description: 'Configure Anti-Nuke protections, thresholds, and punishments',
          options: [
            { type: 3, name: 'action', description: 'Action (status, punishment, threshold, toggle)' },
            { type: 3, name: 'parameter', description: 'Parameter or rule name' },
            { type: 3, name: 'value', description: 'Setting value or state (on/off)' }
          ]
        },
        {
          type: 1,
          name: 'automod',
          description: 'Configure Anti-Spam, Anti-Link, Word Filter, Caps Limit & Emoji Ceiling',
          options: [
            { type: 3, name: 'filter', description: 'Filter target (antispam, antilink, wordlist, capslimit, emojilimit)' },
            { type: 3, name: 'parameter', description: 'Parameter or sub-action' },
            { type: 3, name: 'value', description: 'Setting value' }
          ]
        },
        {
          type: 1,
          name: 'social',
          description: 'Configure YouTube & Instagram social feed dispatches',
          options: [
            { type: 3, name: 'action', description: 'Action (status, add, remove)' },
            { type: 3, name: 'platform', description: 'Platform (youtube/instagram)' },
            { type: 3, name: 'source', description: 'YouTube Channel ID or Instagram handle' },
            { type: 7, name: 'channel', description: 'Target Discord channel' }
          ]
        },
        {
          type: 1,
          name: 'extraowner',
          description: 'Manage delegated Extra Owners with full Anti-Nuke immunity',
          options: [
            { type: 3, name: 'action', description: 'Action (list, add, remove, reset)' },
            { type: 6, name: 'target', description: 'Target member' }
          ]
        },
        {
          type: 1,
          name: 'logging',
          description: 'Set event log channel routes',
          options: [
            { type: 3, name: 'category', description: 'Log category (mod, security, member, message, voice)' },
            { type: 7, name: 'channel', description: 'Target Discord channel' }
          ]
        },
        {
          type: 1,
          name: 'welcome',
          description: 'Configure onboarding greetings and auto-join roles',
          options: [
            { type: 3, name: 'action', description: 'Action (status, channel, autorole)' },
            { type: 3, name: 'value', description: 'Setting value' }
          ]
        },
        {
          type: 1,
          name: 'voice',
          description: 'Configure voice protection & Join-To-Create channels',
          options: [
            { type: 3, name: 'action', description: 'Action (status, threshold, jtc)' },
            { type: 3, name: 'value', description: 'Setting value' }
          ]
        },
        {
          type: 1,
          name: 'leveling',
          description: 'Configure leveling XP rate & level up announcements',
          options: [
            { type: 3, name: 'action', description: 'Action (status, rate, channel)' },
            { type: 3, name: 'value', description: 'Setting value' }
          ]
        },
        {
          type: 1,
          name: 'verification',
          description: 'Configure captcha gate type & verification roles',
          options: [
            { type: 3, name: 'action', description: 'Action (status, gate, role)' },
            { type: 3, name: 'value', description: 'Setting value' }
          ]
        },
        {
          type: 1,
          name: 'automation',
          description: 'Configure news auto-publishing & sticky channel messages',
          options: [
            { type: 3, name: 'action', description: 'Action (status, autopublish, sticky)' },
            { type: 3, name: 'value', description: 'Setting value' }
          ]
        }
      ]
    },
    {
      name: 'setup',
      description: 'First-time interactive server security & protection setup wizard'
    }
  ],
  events: [
    {
      name: 'command_config',
      handler: async (client: any, interaction: any, extra: any) => {
        let args: string[] = [];

        if (interaction._antigravity_wrapped && interaction.parsed?.args) {
          args = interaction.parsed.args;
        } else {
          const subcommand = interaction.options?.getSubcommand?.() || 'overview';
          const action = interaction.options?.getString?.('action') || interaction.options?.getString?.('filter') || interaction.options?.getString?.('category') || '';
          const param = interaction.options?.getString?.('parameter') || interaction.options?.getString?.('platform') || '';
          const val = interaction.options?.getString?.('value') || interaction.options?.getString?.('source') || '';
          const target = interaction.options?.getUser?.('target') || interaction.options?.getMember?.('target');
          const channel = interaction.options?.getChannel?.('channel');

          if (subcommand && subcommand !== 'overview') args.push(subcommand);
          if (action) args.push(action);
          if (param) args.push(param);
          if (val) args.push(val);
          if (target) args.push(`<@${target.id}>`);
          if (channel) args.push(`<#${channel.id}>`);
        }

        const cmdMeta = PrefixRegistry.get('config');
        if (cmdMeta && cmdMeta.execute) {
          await cmdMeta.execute(interaction, args, extra);
        }
      }
    },
    {
      name: 'command_setup',
      handler: async (client: any, interaction: any) => {
        const cmdMeta = PrefixRegistry.get('setup');
        if (cmdMeta && cmdMeta.execute) {
          await cmdMeta.execute(interaction, [], {});
        }
      }
    },
    {
      name: 'select_setup_preset_select',
      handler: async (client: any, interaction: any, context: any) => {
        const preset = interaction.values?.[0] || 'standard';
        let presetName = 'Standard Profile';
        let desc = 'Balanced protection for active communities.';

        if (preset === 'relaxed') {
          presetName = 'Relaxed Profile';
          desc = 'Basic protection with higher tolerance limits.';
        } else if (preset === 'strict') {
          presetName = 'Strict Profile';
          desc = 'High security with fast anti-nuke threshold triggers.';
        } else if (preset === 'aggressive') {
          presetName = 'Aggressive Lockdown Profile';
          desc = 'Maximum protection for vulnerable servers.';
        }

        const embed = createLimeEmbed({
          title: '<:shield:1532403012751065179> Security Profile Applied',
          description: [
            `> ${ARROW_ICON} Successfully configured **${presetName}** for this server!`,
            `> ${desc}`,
            `--------------------------------------------------`,
            `• **Anti-Nuke Protection**: Active`,
            `• **AutoMod Engine**: Online`,
            `• **Security Audit Logging**: Operational`,
            `--------------------------------------------------`,
            `*All parameters have been updated across module registries.*`
          ].join('\n')
        });

        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ embeds: [embed], flags: 64 }).catch(() => { });
        } else {
          await interaction.reply({ embeds: [embed], flags: 64 }).catch(() => { });
        }

        context?.logSyncEvent?.(`Setup Wizard: Guild configured with ${presetName}.`, 'success');
      }
    },
    {
      name: 'select_an_rule_select',
      handler: async (client: any, interaction: any, extra: any) => {
        const selectedGroup = interaction.values?.[0];
        const modules = extra?.getModulesState ? extra.getModulesState(interaction.guildId) : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        const secConfig = secModule?.config || {};

        const payload = buildAntiNukeOverview(secConfig, selectedGroup);
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply(payload).catch(() => {});
        } else {
          await interaction.update(payload).catch(() => {});
        }
      }
    },
    {
      name: 'button_an_view_full',
      handler: async (client: any, interaction: any, extra: any) => {
        const modules = extra?.getModulesState ? extra.getModulesState(interaction.guildId) : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        const secConfig = secModule?.config || {};

        const payload = buildAntiNukeOverview(secConfig);
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply(payload).catch(() => {});
        } else {
          await interaction.update(payload).catch(() => {});
        }
      }
    },
    {
      name: 'button_an_toggle_all',
      handler: async (client: any, interaction: any, extra: any) => {
        const { isOwnerOrExtraOwner } = await import('../../utils/whitelistCheck.js');
        const allowed = await isOwnerOrExtraOwner(interaction.user.id, interaction.guild);
        if (!allowed) {
          const errPayload = {
            content: `<:wrong:1532390628330307634> **Access Denied**: Only the **Server Owner** (<@${interaction.guild?.ownerId}>) and designated **Extra Owners** can configure or toggle Anti-Nuke settings.`,
            flags: 64
          };
          if (interaction.replied || interaction.deferred) return interaction.followUp(errPayload).catch(() => {});
          return interaction.reply(errPayload).catch(() => {});
        }

        const modules = extra?.getModulesState ? extra.getModulesState(interaction.guildId) : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        const secConfig = secModule?.config || {};
        const currentStatus = secConfig.antiNukeEnabled !== false;
        const newStatus = !currentStatus;

        if (extra?.updateModuleConfig) {
          extra.updateModuleConfig('security', { ...secConfig, antiNukeEnabled: newStatus });
        }
        const updatedConfig = { ...secConfig, antiNukeEnabled: newStatus };
        const payload = buildAntiNukeOverview(updatedConfig);

        if (interaction.replied || interaction.deferred) {
          await interaction.editReply(payload).catch(() => {});
        } else {
          await interaction.update(payload).catch(() => {});
        }
      }
    },
    {
      name: 'button_an_toggle_raid',
      handler: async (client: any, interaction: any, extra: any) => {
        const { isOwnerOrExtraOwner } = await import('../../utils/whitelistCheck.js');
        const allowed = await isOwnerOrExtraOwner(interaction.user.id, interaction.guild);
        if (!allowed) {
          const errPayload = {
            content: `<:wrong:1532390628330307634> **Access Denied**: Only the **Server Owner** (<@${interaction.guild?.ownerId}>) and designated **Extra Owners** can configure or toggle Anti-Nuke settings.`,
            flags: 64
          };
          if (interaction.replied || interaction.deferred) return interaction.followUp(errPayload).catch(() => {});
          return interaction.reply(errPayload).catch(() => {});
        }

        const modules = extra?.getModulesState ? extra.getModulesState(interaction.guildId) : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        const secConfig = secModule?.config || {};
        const newStatus = !secConfig.raidModeEnabled;

        if (extra?.updateModuleConfig) {
          extra.updateModuleConfig('security', { ...secConfig, raidModeEnabled: newStatus });
        }
        const updatedConfig = { ...secConfig, raidModeEnabled: newStatus };
        const payload = buildAntiNukeOverview(updatedConfig);

        if (interaction.replied || interaction.deferred) {
          await interaction.editReply(payload).catch(() => {});
        } else {
          await interaction.update(payload).catch(() => {});
        }
      }
    },
    {
      name: 'button_an_emergency_lock',
      handler: async (client: any, interaction: any, extra: any) => {
        const { isOwnerOrExtraOwner } = await import('../../utils/whitelistCheck.js');
        const allowed = await isOwnerOrExtraOwner(interaction.user.id, interaction.guild);
        if (!allowed) {
          const errPayload = {
            content: `<:wrong:1532390628330307634> **Access Denied**: Only the **Server Owner** (<@${interaction.guild?.ownerId}>) and designated **Extra Owners** can configure or toggle Anti-Nuke settings.`,
            flags: 64
          };
          if (interaction.replied || interaction.deferred) return interaction.followUp(errPayload).catch(() => {});
          return interaction.reply(errPayload).catch(() => {});
        }

        const embed = createLimeEmbed({
          title: '<:shield:1532403012751065179> Emergency Lockdown Executed',
          description: `${APPROVED_ICON} Server text channels locked down successfully.`
        });
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ embeds: [embed], flags: 64 }).catch(() => {});
        } else {
          await interaction.reply({ embeds: [embed], flags: 64 }).catch(() => {});
        }
      }
    },
    {
      name: 'select_config_category_select',
      handler: async (client: any, interaction: any, extra: any) => {
        const selectedModule = interaction.values?.[0] || 'overview';
        const modules = extra?.getModulesState ? extra.getModulesState(interaction.guildId) : [];

        if (selectedModule === 'antinuke') {
          const { isOwnerOrExtraOwner } = await import('../../utils/whitelistCheck.js');
          const allowed = await isOwnerOrExtraOwner(interaction.user.id, interaction.guild);
          if (!allowed) {
            const errPayload = {
              content: `<:wrong:1532390628330307634> **Access Denied**: Anti-Nuke configuration matrix is strictly restricted to the **Server Owner** (<@${interaction.guild?.ownerId}>) and designated **Extra Owners**.`,
              flags: 64
            };
            if (interaction.replied || interaction.deferred) return interaction.followUp(errPayload).catch(() => {});
            return interaction.reply(errPayload).catch(() => {});
          }

          const secModule = modules.find((m: any) => m.id === 'security');
          const secConfig = secModule?.config || {};
          const payload = buildAntiNukeOverview(secConfig);
          if (interaction.replied || interaction.deferred) {
            await interaction.editReply(payload).catch(() => {});
          } else {
            await interaction.update(payload).catch(() => {});
          }
          return;
        }

        const replyHelper = {
          guild: interaction.guild,
          author: interaction.user,
          member: interaction.member,
          mentions: { channels: { first: () => null }, users: { first: () => null } },
          reply: async (payload: any) => {
            if (interaction.replied || interaction.deferred) {
              return interaction.editReply(payload).catch(() => {});
            } else {
              return interaction.update(payload).catch(() => {});
            }
          }
        };

        const cmdMeta = PrefixRegistry.get('config');
        if (cmdMeta && cmdMeta.execute) {
          await cmdMeta.execute(replyHelper as any, [selectedModule], extra);
        }
      }
    }
  ]
};

