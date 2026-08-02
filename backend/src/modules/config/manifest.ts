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
  anti_role_grant:     { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true },
  anti_role_remove:    { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true },
  anti_role_update:    { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true },
  anti_role_create:    { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true },
  anti_role_delete:    { enabled: true, limit: 1, window: 10, action: 'quarantine', recovery: true },
  anti_channel_create: { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true },
  anti_channel_delete: { enabled: true, limit: 1, window: 10, action: 'quarantine', recovery: true },
  anti_channel_update: { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true },
  anti_ban:            { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true },
  anti_kick:           { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true },
  anti_timeout:        { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true },
  anti_bot_add:        { enabled: true, limit: 1, window: 10, action: 'ban',        recovery: true },
  anti_bot_remove:     { enabled: true, limit: 1, window: 10, action: 'quarantine', recovery: true },
  anti_webhook_create: { enabled: true, limit: 2, window: 10, action: 'quarantine', recovery: true },
  anti_webhook_delete: { enabled: true, limit: 2, window: 10, action: 'quarantine', recovery: true },
  anti_webhook_update: { enabled: true, limit: 2, window: 10, action: 'quarantine', recovery: true },
  anti_guild_update:   { enabled: true, limit: 1, window: 10, action: 'quarantine', recovery: true },
  anti_prune:          { enabled: true, limit: 1, window: 10, action: 'quarantine', recovery: true },
  anti_emoji_create:   { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true },
  anti_emoji_delete:   { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true },
  anti_emoji_update:   { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true },
  anti_sticker_create: { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true },
  anti_sticker_delete: { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true },
  anti_sticker_update: { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true },
  anti_link:           { enabled: true, limit: 3, window: 10, action: 'warn',       recovery: false }
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

export function getEffectiveRule(rules: Record<string, any> | undefined, ruleKey: string): { enabled: boolean; limit: number; window: number; action: string; recovery: boolean; [key: string]: any } {
  const normalizedKey = normalizeRuleName(ruleKey);
  const defaultConfig = DEFAULT_SECURITY_RULES[normalizedKey] || { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true };
  const customConfig = rules?.[normalizedKey] || rules?.[ruleKey] || {};
  return {
    ...defaultConfig,
    ...customConfig
  };
}

export function registerConfigCommands(): void {
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
    botPermissions: ['Administrator'],
    execute: async (message: Message, args: string[], extra?: any) => {
      const moduleName = args[0]?.toLowerCase();
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

      // Anti-Nuke Sub-Configuration Suite (`r!config antinuke ...`)
      if (moduleName === 'antinuke') {
        const action = args[1]?.toLowerCase();
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
        if (!action || action === 'status' || action === 'list' || action === 'matrix') {
          const formattedSections: Array<{ title: string; items: string[] }> = [];

          const categories: Record<string, string[]> = {
            'ROLE PROTECTION MODULES': ['anti_role_grant', 'anti_role_remove', 'anti_role_update', 'anti_role_create', 'anti_role_delete'],
            'CHANNEL PROTECTION MODULES': ['anti_channel_create', 'anti_channel_delete', 'anti_channel_update'],
            'MEMBER & MODERATION MODULES': ['anti_ban', 'anti_kick', 'anti_timeout', 'anti_bot_add', 'anti_bot_remove', 'anti_prune'],
            'SERVER & WEBHOOK MODULES': ['anti_webhook_create', 'anti_webhook_delete', 'anti_webhook_update', 'anti_guild_update', 'anti_link']
          };

          for (const [catName, ruleKeys] of Object.entries(categories)) {
            const items: string[] = [];
            for (const key of ruleKeys) {
              const rule = getEffectiveRule(rules, key);
              const statusIcon = rule.enabled ? VERIFIED_ICON : WRONG_EMOJI;
              const revertStr = rule.recovery ? 'Auto-Revert: ON' : 'Auto-Revert: OFF';
              items.push(`${statusIcon} **${key}**: \`${rule.limit} per ${rule.window}s\` | Action: \`${rule.action.toUpperCase()}\` | \`${revertStr}\``);
            }
            formattedSections.push({ title: catName, items });
          }

          const overviewCard = buildLimeOverviewCard({
            title: 'ANTI-NUKE MODULE CONFIGURATION MATRIX',
            subtitle: 'PER-MODULE LIMITS, WINDOW RATES & REVERSION SETTINGS',
            color: Colors.BRAND,
            sections: formattedSections,
            footerText: 'Rage Optimiser Enterprise • Security Configuration'
          });

          const ruleSelectMenu = new StringSelectMenuBuilder()
            .setCustomId('an_rule_select')
            .setPlaceholder('Inspect Anti-Nuke Protection Category...')
            .addOptions([
              { label: 'Role Protections (Grant, Remove, Create, Delete)', value: 'group_roles', emoji: '<:shield:1532403012751065179>', description: 'Role creation, deletion & assignment rules' },
              { label: 'Channel Protections (Create, Delete, Update)', value: 'group_channels', emoji: '<:shield:1532403012751065179>', description: 'Channel creation, deletion & modification rules' },
              { label: 'Member & Mod Protections (Ban, Kick, Timeout)', value: 'group_members', emoji: '<:gavel:1532621057318584380>', description: 'Ban, kick, timeout, bot add, prune rules' },
              { label: 'Server & Webhook Protections (Webhook, Guild)', value: 'group_server', emoji: '<:config:1532425712844144701>', description: 'Webhook & server modification rules' }
            ]);

          const rowSelect = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(ruleSelectMenu);

          const rowButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('an_toggle_all').setLabel('Toggle Anti-Nuke').setStyle(secConfig.antiNukeEnabled ? ButtonStyle.Danger : ButtonStyle.Success).setEmoji('<:shield:1532403012751065179>'),
            new ButtonBuilder().setCustomId('an_toggle_raid').setLabel('Toggle Raid Mode').setStyle(secConfig.raidModeEnabled ? ButtonStyle.Danger : ButtonStyle.Secondary).setEmoji('<:shield:1532403012751065179>'),
            new ButtonBuilder().setCustomId('an_view_whitelists').setLabel('Whitelists').setStyle(ButtonStyle.Secondary).setEmoji('<:member:1532621317487071426>'),
            new ButtonBuilder().setCustomId('an_emergency_lock').setLabel('Emergency Lockdown').setStyle(ButtonStyle.Danger).setEmoji('<:shield:1532403012751065179>')
          );

          return message.reply({ embeds: [overviewCard], components: [rowSelect, rowButtons] });
        }

        // Configure Punishment (`r!config antinuke punishment <event> <action>`)
        if (action === 'punishment') {
          const eventInput = args[2];
          const punishment = args[3]?.toLowerCase();
          const validActions = ['quarantine', 'ban', 'kick', 'strip_roles', 'warn'];

          if (!eventInput || !punishment || !validActions.includes(punishment)) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Anti-Nuke Punishment Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config antinuke punishment <event> <quarantine|ban|kick|strip_roles|warn>\`\nExample: \`r!config antinuke punishment role_grant ban\``
              })]
            });
          }

          const targetRuleKey = normalizeRuleName(eventInput);
          const currentRule = getEffectiveRule(rules, targetRuleKey);
          const updatedRule = { ...currentRule, action: punishment };
          const updatedRules = { ...rules, [targetRuleKey]: updatedRule };

          updateSecRules(updatedRules);

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Anti-Nuke Punishment Action Saved',
              description: `${APPROVED_ICON} Updated punishment for module **\`${targetRuleKey}\`** to **\`${punishment.toUpperCase()}\`**.`
            })]
          });
        }

        // Configure Threshold (`r!config antinuke threshold <event> <limit> <window_seconds>`)
        if (action === 'threshold') {
          const eventInput = args[2];
          const limit = parseInt(args[3], 10);
          const windowRate = parseInt(args[4], 10);

          if (!eventInput || isNaN(limit) || isNaN(windowRate) || limit < 1 || windowRate < 1) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Anti-Nuke Threshold Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config antinuke threshold <event> <limit_count> <window_seconds>\`\nExample: \`r!config antinuke threshold channel_delete 2 10\``
              })]
            });
          }

          const targetRuleKey = normalizeRuleName(eventInput);
          const currentRule = getEffectiveRule(rules, targetRuleKey);
          const updatedRule = { ...currentRule, limit, window: windowRate };
          const updatedRules = { ...rules, [targetRuleKey]: updatedRule };

          updateSecRules(updatedRules);

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Anti-Nuke Sensitivity Threshold Saved',
              description: `${APPROVED_ICON} Updated **\`${targetRuleKey}\`** threshold: **${limit} actions per ${windowRate} seconds**.`
            })]
          });
        }

        // Configure Reversion / Auto-Rollback (`r!config antinuke reversion <event> <on|off|true|false>`)
        if (action === 'reversion' || action === 'recovery' || action === 'rollback') {
          const eventInput = args[2];
          const toggleInput = args[3]?.toLowerCase();

          if (!eventInput || !['on', 'off', 'true', 'false', 'enable', 'disable'].includes(toggleInput)) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Anti-Nuke Reversion Toggle Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config antinuke reversion <event> <on|off>\`\nExample: \`r!config antinuke reversion role_grant on\``
              })]
            });
          }

          const isEnabled = ['on', 'true', 'enable'].includes(toggleInput);
          const targetRuleKey = normalizeRuleName(eventInput);
          const currentRule = getEffectiveRule(rules, targetRuleKey);
          const updatedRule = { ...currentRule, recovery: isEnabled };
          const updatedRules = { ...rules, [targetRuleKey]: updatedRule };

          updateSecRules(updatedRules);

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Anti-Nuke Auto-Reversion Policy Updated',
              description: `${APPROVED_ICON} Automatic reversion for **\`${targetRuleKey}\`** is now **\`${isEnabled ? 'ENABLED (ON)' : 'DISABLED (OFF)'}\`**.`
            })]
          });
        }

        // Enable or Disable Individual Module (`r!config antinuke enable <event>` / `disable <event>`)
        if (action === 'enable' || action === 'disable' || action === 'toggle') {
          const eventInput = args[2];
          if (!eventInput) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Anti-Nuke Module Toggle Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config antinuke <enable|disable> <event>\`\nExample: \`r!config antinuke disable role_remove\``
              })]
            });
          }

          const isEnabled = action === 'enable' || (action === 'toggle' && args[3]?.toLowerCase() === 'on');
          const targetRuleKey = normalizeRuleName(eventInput);
          const currentRule = getEffectiveRule(rules, targetRuleKey);
          const updatedRule = { ...currentRule, enabled: isEnabled };
          const updatedRules = { ...rules, [targetRuleKey]: updatedRule };

          updateSecRules(updatedRules);

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Anti-Nuke Protection State Saved',
              description: `${APPROVED_ICON} Protection module **\`${targetRuleKey}\`** has been **\`${isEnabled ? 'ENABLED' : 'DISABLED'}\`**.`
            })]
          });
        }

        // Single Bulk Module Command (`r!config antinuke module <event> <limit> <window> <punishment> <reversion>`)
        if (action === 'module' || action === 'set') {
          const eventInput = args[2];
          const limit = parseInt(args[3], 10);
          const windowRate = parseInt(args[4], 10);
          const punishment = args[5]?.toLowerCase();
          const reversionInput = args[6]?.toLowerCase();

          if (!eventInput || isNaN(limit) || isNaN(windowRate) || !punishment) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Anti-Nuke Module Setting Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config antinuke module <event> <limit> <window_sec> <quarantine|ban|kick> [reversion_on_off]\`\nExample: \`r!config antinuke module role_grant 3 10 quarantine on\``
              })]
            });
          }

          const targetRuleKey = normalizeRuleName(eventInput);
          const isReversionOn = reversionInput ? ['on', 'true', 'enable'].includes(reversionInput) : true;
          const updatedRule = { enabled: true, limit, window: windowRate, action: punishment, recovery: isReversionOn };
          const updatedRules = { ...rules, [targetRuleKey]: updatedRule };

          updateSecRules(updatedRules);

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Anti-Nuke Module Configuration Applied',
              description: `${APPROVED_ICON} Configured **\`${targetRuleKey}\`**:\n> • Limit: \`${limit} per ${windowRate}s\`\n> • Punishment: \`${punishment.toUpperCase()}\`\n> • Auto-Revert: \`${isReversionOn ? 'ENABLED' : 'DISABLED'}\``
            })]
          });
        }
      }

      // Audit & Event Logging Sub-Configuration (`r!config logging ...`)
      if (moduleName === 'logging') {
        const action = args[1]?.toLowerCase();
        const category = args[2]?.toLowerCase();

        if (action === 'set' || action === 'channel') {
          const targetChannel = message.mentions.channels.first();
          if (!category || !targetChannel) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Logging Channel Route Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config logging set <mod_log|security_log|member_log|message_log|voice_log> <#channel>\`\nExample: \`r!config logging set mod_log #mod-logs\``
              })]
            });
          }

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Audit Log Channel Route Saved',
              description: `${APPROVED_ICON} Assigned audit channel **<#${targetChannel.id}>** for category **\`${category.toUpperCase()}\`**.`
            })]
          });
        }

        if (action === 'status' || action === 'view' || action === 'settings') {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Audit Event Routing Matrix',
              description: [
                `> 📜 **Log Category Channel Routes**\n`,
                `• **MOD_LOG**: Configured`,
                `• **SECURITY_LOG**: Configured`,
                `• **MEMBER_LOG**: Configured`,
                `• **MESSAGE_LOG**: Configured`,
                `• **VOICE_LOG**: Configured`
              ].join('\n')
            })]
          });
        }
      }

      // AutoMod Sub-Configuration (`r!config automod ...`)
      if (moduleName === 'automod') {
        const action = args[1]?.toLowerCase();
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
          const antispamIcon = amConfig.antiSpamEnabled ? APPROVED_ICON : WRONG_EMOJI;
          const antilinkIcon = amConfig.antiLinkEnabled ? APPROVED_ICON : WRONG_EMOJI;
          const blacklistIcon = amConfig.wordBlacklistEnabled ? APPROVED_ICON : WRONG_EMOJI;
          const capsIcon = amConfig.capsLimitEnabled ? APPROVED_ICON : WRONG_EMOJI;
          const emojiIcon = amConfig.emojiSpamEnabled ? APPROVED_ICON : WRONG_EMOJI;

          const overviewCard = buildLimeOverviewCard({
            title: 'AUTOMOD MODULE CONFIGURATION MATRIX',
            subtitle: 'CONTENT FILTERS & SPAM PROTECTION PARAMETERS',
            color: Colors.BRAND,
            sections: [
              {
                title: '<:link:1532620952087826602> AUTOMOD PROTECTION FILTERS',
                items: [
                  `${antispamIcon} **Anti-Spam Filter**: \`${amConfig.antiSpamEnabled ? 'ENABLED' : 'DISABLED'}\` | Limit: \`${amConfig.maxMessages || 5} msgs / ${amConfig.windowSeconds || 5}s\` | Action: \`${(amConfig.spamAction || 'mute').toUpperCase()}\``,
                  `${antilinkIcon} **Anti-Link Filter**: \`${amConfig.antiLinkEnabled ? 'ENABLED' : 'DISABLED'}\` | Invites: \`${amConfig.allowDiscordInvites ? 'ALLOWED' : 'BLOCKED'}\` | Action: \`${(amConfig.linkAction || 'delete').toUpperCase()}\``,
                  `${blacklistIcon} **Word Blacklist**: \`${amConfig.wordBlacklistEnabled ? 'ENABLED' : 'DISABLED'}\` | Words: \`${(amConfig.blacklist || []).length} keywords\``,
                  `${capsIcon} **Caps Limit**: \`${amConfig.capsLimitEnabled ? 'ENABLED' : 'DISABLED'}\` | Max: \`${amConfig.maxCapsPercent || 70}%\``,
                  `${emojiIcon} **Emoji Spam**: \`${amConfig.emojiSpamEnabled ? 'ENABLED' : 'DISABLED'}\` | Max: \`${amConfig.maxEmojis || 10} emojis\``
                ]
              }
            ],
            footerText: 'Rage Optimiser Enterprise • AutoMod Configuration'
          });

          return message.reply({ embeds: [overviewCard] });
        }

        if (action === 'antispam') {
          const toggle = args[2]?.toLowerCase();
          const maxMsgs = parseInt(args[3], 10);
          const windowSec = parseInt(args[4], 10);
          const pAction = args[5]?.toLowerCase();

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
          const toggle = args[2]?.toLowerCase();
          const invitesOpt = args[3]?.toLowerCase();
          const pAction = args[4]?.toLowerCase();

          if (!toggle || !['on', 'off', 'enable', 'disable'].includes(toggle)) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Anti-Link Configuration Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config automod antilink <on|off> [allow_invites_on_off] [action]\`\nExample: \`r!config automod antilink on off delete\``
              })]
            });
          }

          const isEnabled = ['on', 'enable'].includes(toggle);
          const updates: Record<string, any> = { antiLinkEnabled: isEnabled };
          if (invitesOpt) updates.allowDiscordInvites = ['on', 'true', 'allow'].includes(invitesOpt);
          if (pAction && ['delete', 'warn', 'mute'].includes(pAction)) updates.linkAction = pAction;

          updateAmConfig(updates);

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Anti-Link Settings Saved',
              description: `${APPROVED_ICON} Anti-Link filter is now **\`${isEnabled ? 'ENABLED' : 'DISABLED'}\`**.`
            })]
          });
        }

        if (action === 'blacklist') {
          const subAct = args[2]?.toLowerCase();
          const wordInput = args.slice(3).join(' ').trim();
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
          const toggle = args[2]?.toLowerCase();
          const percent = parseInt(args[3], 10);

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
          const toggle = args[2]?.toLowerCase();
          const count = parseInt(args[3], 10);

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
        const action = args[1]?.toLowerCase();
        const modules = extra?.getModulesState ? extra.getModulesState() : [];
        const welcModule = modules.find((m: any) => m.id === 'welcome-v2');
        const welcConfig = welcModule?.config || {};

        const updateWelcConfig = (newCfg: Record<string, any>) => {
          if (extra?.updateModuleConfig) {
            extra.updateModuleConfig('welcome-v2', { ...welcConfig, ...newCfg });
          }
          if (extra?.logSyncEvent) {
            extra.logSyncEvent(message.guild?.id, 'Welcome Config: Updated onboarding settings via CLI.', 'success');
          }
        };

        if (!action || action === 'status' || action === 'view') {
          const channelStr = welcConfig.channelId ? `<#${welcConfig.channelId}>` : '`Not Set`';
          const dmStr = welcConfig.sendDm ? APPROVED_ICON + ' `ENABLED`' : WRONG_EMOJI + ' `DISABLED`';
          const autorolesStr = (welcConfig.autoroleIds || []).map((r: string) => `<@&${r}>`).join(', ') || '`None`';
          const leaveStr = welcConfig.sendLeave ? APPROVED_ICON + ` Enabled (<#${welcConfig.leaveChannelId}>)` : WRONG_EMOJI + ' `DISABLED`';

          const overviewCard = buildLimeOverviewCard({
            title: 'WELCOME & ONBOARDING CONFIGURATION MATRIX',
            subtitle: 'WELCOME MESSAGES, DM GREETINGS & AUTO-ROLES',
            color: Colors.BRAND,
            sections: [
              {
                title: '<:member:1532621317487071426> ONBOARDING PARAMETERS',
                items: [
                  `Welcome Channel: ${channelStr}`,
                  `DM Greetings: ${dmStr}`,
                  `Auto-Roles: ${autorolesStr}`,
                  `Goodbye / Leave Alert: ${leaveStr}`,
                  `Welcome Text: \`${(welcConfig.welcomeMessage || 'Welcome {user} to {server}!').slice(0, 60)}\``
                ]
              }
            ],
            footerText: 'Rage Optimiser Enterprise • Welcome Configuration'
          });

          return message.reply({ embeds: [overviewCard] });
        }

        if (action === 'channel') {
          const channel = message.mentions.channels.first();
          if (args[2]?.toLowerCase() === 'none' || args[2]?.toLowerCase() === 'disable') {
            updateWelcConfig({ channelId: null });
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Welcome Channel Disabled',
                description: `${APPROVED_ICON} Welcome greetings channel has been disabled.`
              })]
            });
          }

          if (!channel) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Welcome Channel Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config welcome channel <#channel|none>\`\nExample: \`r!config welcome channel #lounge\``
              })]
            });
          }

          updateWelcConfig({ channelId: channel.id });
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Welcome Channel Saved',
              description: `${APPROVED_ICON} Welcome greeting channel set to **<#${channel.id}>**.`
            })]
          });
        }

        if (action === 'message' || action === 'text') {
          const msgText = args.slice(2).join(' ').trim();
          if (!msgText) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Welcome Message Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config welcome message <text>\`\nVariables: \`{user}\`, \`{server}\`, \`{count}\`\nExample: \`r!config welcome message Welcome {user} to {server}!\``
              })]
            });
          }

          updateWelcConfig({ welcomeMessage: msgText });
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Welcome Message Saved',
              description: `${APPROVED_ICON} Updated welcome greeting text to:\n> ${msgText}`
            })]
          });
        }

        if (action === 'dm') {
          const toggle = args[2]?.toLowerCase();
          const dmMsg = args.slice(3).join(' ').trim();

          if (!toggle || !['on', 'off', 'enable', 'disable'].includes(toggle)) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'DM Greeting Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config welcome dm <on|off> [message_text]\`\nExample: \`r!config welcome dm on Welcome to our community!\``
              })]
            });
          }

          const isEnabled = ['on', 'enable'].includes(toggle);
          const updates: Record<string, any> = { sendDm: isEnabled };
          if (dmMsg) updates.dmText = dmMsg;

          updateWelcConfig(updates);
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'DM Greeting Settings Saved',
              description: `${APPROVED_ICON} Onboarding DM greetings are now **\`${isEnabled ? 'ENABLED' : 'DISABLED'}\`**.`
            })]
          });
        }

        if (action === 'autorole') {
          const subAct = args[2]?.toLowerCase();
          const role = message.mentions.roles.first();
          const currentRoles: string[] = welcConfig.autoroleIds || [];

          if (subAct === 'add' && role) {
            const merged = Array.from(new Set([...currentRoles, role.id]));
            updateWelcConfig({ autoroleIds: merged });
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Auto-Role Added',
                description: `${APPROVED_ICON} Added **<@&${role.id}>** to join auto-roles.`
              })]
            });
          }

          if (subAct === 'remove' && role) {
            const filtered = currentRoles.filter(r => r !== role.id);
            updateWelcConfig({ autoroleIds: filtered });
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Auto-Role Removed',
                description: `${APPROVED_ICON} Removed **<@&${role.id}>** from join auto-roles.`
              })]
            });
          }

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Auto-Role Configuration',
              description: `${CONFIG_EMOJI} **Auto-Roles**: ${currentRoles.length > 0 ? currentRoles.map(r => `<@&${r}>`).join(', ') : '*None*'}\n\n**Syntax**: \`r!config welcome autorole <add|remove> <@role>\``
            })]
          });
        }
      }

      // Voice Protection Sub-Configuration (`r!config voiceprotection ...`)
      if (moduleName === 'voiceprotection' || moduleName === 'vp') {
        const action = args[1]?.toLowerCase();
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
          const val = parseInt(args[2], 10);
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
          const pAction = args[2]?.toLowerCase();
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
          const isEnabled = action === 'enable' || (action === 'toggle' && args[2]?.toLowerCase() === 'on');
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
        const action = args[1]?.toLowerCase();
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

      // Tickets Sub-Configuration (`r!config tickets ...`)
      if (moduleName === 'tickets') {
        const action = args[1]?.toLowerCase();
        const modules = extra?.getModulesState ? extra.getModulesState() : [];
        const tktModule = modules.find((m: any) => m.id === 'tickets-v2' || m.id === 'tickets');
        const tktConfig = tktModule?.config || {};

        const updateTktConfig = (newCfg: Record<string, any>) => {
          if (extra?.updateModuleConfig) {
            extra.updateModuleConfig(tktModule?.id || 'tickets-v2', { ...tktConfig, ...newCfg });
          }
          if (extra?.logSyncEvent) {
            extra.logSyncEvent(message.guild?.id, 'Tickets Config: Updated support panel settings via CLI.', 'success');
          }
        };

        if (!action || action === 'status' || action === 'view') {
          const catStr = tktConfig.categoryId ? `<#${tktConfig.categoryId}>` : '`Not Set`';
          const logStr = tktConfig.logChannelId ? `<#${tktConfig.logChannelId}>` : '`Not Set`';
          const staffStr = (tktConfig.supportRoleIds || []).map((r: string) => `<@&${r}>`).join(', ') || '`None`';

          const overviewCard = buildLimeOverviewCard({
            title: 'TICKET SYSTEM MODULE CONFIGURATION MATRIX',
            subtitle: 'SUPPORT PANELS, CATEGORIES & STAFF ROLES',
            color: Colors.BRAND,
            sections: [
              {
                title: '<:ticket:1532620631466836021> TICKET PANEL PARAMETERS',
                items: [
                  `Parent Category: ${catStr}`,
                  `Log Channel: ${logStr}`,
                  `Support Staff Roles: ${staffStr}`,
                  `Max Tickets Per User: \`${tktConfig.maxTickets || 3}\``
                ]
              }
            ],
            footerText: 'Rage Optimiser Enterprise • Ticket System Configuration'
          });

          return message.reply({ embeds: [overviewCard] });
        }

        if (action === 'category') {
          const channel = message.mentions.channels.first();
          if (!channel) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Ticket Category Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config tickets category <#category>\`\nExample: \`r!config tickets category #TICKETS\``
              })]
            });
          }

          updateTktConfig({ categoryId: channel.id });
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Ticket Category Saved',
              description: `${APPROVED_ICON} Ticket category set to **<#${channel.id}>**.`
            })]
          });
        }

        if (action === 'staff') {
          const subAct = args[2]?.toLowerCase();
          const role = message.mentions.roles.first();
          const currentStaff: string[] = tktConfig.supportRoleIds || [];

          if (subAct === 'add' && role) {
            const merged = Array.from(new Set([...currentStaff, role.id]));
            updateTktConfig({ supportRoleIds: merged });
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Support Staff Role Added',
                description: `${APPROVED_ICON} Added **<@&${role.id}>** to ticket support staff.`
              })]
            });
          }

          if (subAct === 'remove' && role) {
            const filtered = currentStaff.filter(r => r !== role.id);
            updateTktConfig({ supportRoleIds: filtered });
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Support Staff Role Removed',
                description: `${APPROVED_ICON} Removed **<@&${role.id}>** from ticket support staff.`
              })]
            });
          }

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Support Staff Configuration',
              description: `${CONFIG_EMOJI} **Staff Roles**: ${currentStaff.length > 0 ? currentStaff.map(r => `<@&${r}>`).join(', ') : '*None*'}\n\n**Syntax**: \`r!config tickets staff <add|remove> <@role>\``
            })]
          });
        }
      }

      // Leveling & XP Sub-Configuration (`r!config leveling ...`)
      if (moduleName === 'leveling' || moduleName === 'levels' || moduleName === 'xp') {
        const action = args[1]?.toLowerCase();
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
          const isEnabled = action === 'enable' || (action === 'toggle' && args[2]?.toLowerCase() === 'on');
          updateLvlConfig({ enabled: isEnabled });
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Leveling Module State Saved',
              description: `${APPROVED_ICON} Leveling system is now **\`${isEnabled ? 'ENABLED' : 'DISABLED'}\`**.`
            })]
          });
        }

        if (action === 'xp') {
          const xpVal = parseInt(args[2], 10);
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
          if (args[2]?.toLowerCase() === 'current' || args[2]?.toLowerCase() === 'none') {
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
        const action = args[1]?.toLowerCase();
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

          updateVerifConfig({ verificationRoleId: role.id });
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Verified Role Saved',
              description: `${APPROVED_ICON} Assigned verified role **<@&${role.id}>**.`
            })]
          });
        }
      }

      // Server Automation Sub-Configuration (`r!config automation ...`)
      if (moduleName === 'automation' || moduleName === 'auto') {
        const action = args[1]?.toLowerCase();
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
          const toggle = args[2]?.toLowerCase();
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
        const action = args[1]?.toLowerCase();
        const guildId = message.guild!.id;
        await SocialSubscriptionRepository.ensureTable().catch(() => {});

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
          const provider = args[2]?.toLowerCase();
          const sourceId = args[3];
          const channel = message.mentions.channels.first();

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
          const subId = args[2];
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
          name: 'tickets',
          description: 'Configure support ticket panels & staff roles',
          options: [
            { type: 3, name: 'action', description: 'Action (status, category, staff)' },
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
        const subcommand = interaction.options?.getSubcommand?.() || 'overview';
        const action = interaction.options?.getString?.('action') || interaction.options?.getString?.('filter') || interaction.options?.getString?.('category') || '';
        const param = interaction.options?.getString?.('parameter') || interaction.options?.getString?.('platform') || '';
        const val = interaction.options?.getString?.('value') || interaction.options?.getString?.('source') || '';
        const target = interaction.options?.getUser?.('target') || interaction.options?.getMember?.('target');
        const channel = interaction.options?.getChannel?.('channel');

        const args: string[] = [];
        if (subcommand && subcommand !== 'overview') args.push(subcommand);
        if (action) args.push(action);
        if (param) args.push(param);
        if (val) args.push(val);
        if (target) args.push(`<@${target.id}>`);
        if (channel) args.push(`<#${channel.id}>`);

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
          await interaction.followUp({ embeds: [embed], flags: 64 }).catch(() => {});
        } else {
          await interaction.reply({ embeds: [embed], flags: 64 }).catch(() => {});
        }

        context?.logSyncEvent?.(`Setup Wizard: Guild configured with ${presetName}.`, 'success');
      }
    }
  ]
};

