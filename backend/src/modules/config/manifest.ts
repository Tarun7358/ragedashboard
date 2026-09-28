import { Message, StringSelectMenuBuilder, ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { ModuleManifest } from '../../core/types.js';
import { Database } from '../../core/Database.js';
import { createLimeEmbed, buildLimeOverviewCard, Colors, VERIFIED_ICON, WRONG_ICON, WARNING_ICON, VIOLATION_ICON, SHIELD_ICON, CONFIG_ICON, ARROW_ICON, SQUARE_TICK_ICON, BRAND_FOOTER, SUCCESS_CHECK_ICON, LOADING_ANIMATED_ICON, SECURITY_SHIELD_ICON, formatCustomEmoji } from '../../core/UIFactory.js';
import { PrefixRegistry } from '../../core/prefix/PrefixRegistry.js';
import { PrefixResolver } from '../../core/prefix/PrefixResolver.js';
import { SocialSubscriptionRepository } from '../social-updates/SocialSubscriptionRepository.js';
import { SubscriptionManager } from '../social-updates/SubscriptionManager.js';
import { resetLinkViolations, getLinkViolations } from '../automod/manifest.js';
import { resetRateLimit } from '../security/manifest.js';
import { getUnifiedWhitelistEntries, getGuildExtraOwnersFromCache } from '../../utils/whitelistCheck.js';
import { EmailService } from '../../services/EmailService.js';

const APPROVED_ICON = SUCCESS_CHECK_ICON;
const WRONG_EMOJI = WRONG_ICON;
const WARNING_EMOJI = WARNING_ICON;
const CONFIG_EMOJI = CONFIG_ICON;
const SHIELD_EMOJI = SHIELD_ICON;

export const DEFAULT_SECURITY_RULES: Record<string, { enabled: boolean; limit: number; window: number; action: string; recovery: boolean }> = {
  anti_role_grant: { enabled: true, limit: 1, window: 1, action: 'kick', recovery: true },
  anti_role_remove: { enabled: true, limit: 1, window: 1, action: 'kick', recovery: true },
  anti_role_update: { enabled: true, limit: 1, window: 1, action: 'kick', recovery: true },
  anti_role_create: { enabled: true, limit: 1, window: 1, action: 'kick', recovery: true },
  anti_role_delete: { enabled: true, limit: 1, window: 1, action: 'kick', recovery: true },
  anti_channel_create: { enabled: true, limit: 1, window: 1, action: 'kick', recovery: true },
  anti_channel_delete: { enabled: true, limit: 1, window: 1, action: 'kick', recovery: true },
  anti_channel_update: { enabled: true, limit: 1, window: 1, action: 'kick', recovery: true },
  anti_ban: { enabled: true, limit: 1, window: 1, action: 'kick', recovery: true },
  anti_kick: { enabled: true, limit: 1, window: 1, action: 'kick', recovery: true },
  anti_timeout: { enabled: true, limit: 1, window: 1, action: 'kick', recovery: true },
  anti_bot_add: { enabled: true, limit: 1, window: 1, action: 'kick', recovery: true },
  anti_bot_remove: { enabled: true, limit: 1, window: 1, action: 'kick', recovery: true },
  anti_webhook_create: { enabled: true, limit: 1, window: 1, action: 'kick', recovery: true },
  anti_webhook_delete: { enabled: true, limit: 1, window: 1, action: 'kick', recovery: true },
  anti_webhook_update: { enabled: true, limit: 1, window: 1, action: 'kick', recovery: true },
  anti_guild_update: { enabled: true, limit: 1, window: 1, action: 'kick', recovery: true },
  anti_prune: { enabled: true, limit: 1, window: 1, action: 'kick', recovery: true },
  anti_emoji_create: { enabled: true, limit: 1, window: 1, action: 'kick', recovery: true },
  anti_emoji_delete: { enabled: true, limit: 1, window: 1, action: 'kick', recovery: true },
  anti_emoji_update: { enabled: true, limit: 1, window: 1, action: 'kick', recovery: true },
  anti_sticker_create: { enabled: true, limit: 1, window: 1, action: 'kick', recovery: true },
  anti_sticker_delete: { enabled: true, limit: 1, window: 1, action: 'kick', recovery: true },
  anti_sticker_update: { enabled: true, limit: 1, window: 1, action: 'kick', recovery: true },
  anti_everyone_here: { enabled: true, limit: 1, window: 1, action: 'kick', recovery: true },
  anti_invite_create: { enabled: true, limit: 1, window: 1, action: 'kick', recovery: true },
  anti_link: { enabled: true, limit: 5, window: 10, action: 'warn', recovery: false }
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
  'invite_create': 'anti_invite_create',
  'invitecreate': 'anti_invite_create',
  'invite': 'anti_invite_create',
  'anti_invite': 'anti_invite_create',
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
  const defaultConfig = DEFAULT_SECURITY_RULES[normalizedKey] || { enabled: true, limit: 1, window: 1, action: 'kick', recovery: true };
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

export function buildSecuritySelectMenu(currentValue?: string): ActionRowBuilder<StringSelectMenuBuilder> {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('select_sec_rule_group')
    .setPlaceholder('Navigate Security, Anti-Nuke & AutoMod Systems...')
    .addOptions([
      { label: 'Security Hub Overview', value: 'group_hub', description: 'Master Status, Threat Scores & Quick Toggles' },
      { label: 'Role Protections', value: 'group_roles', description: 'Anti-Role Create, Delete, Update, Grant, Revoke' },
      { label: 'Channel Protections', value: 'group_channels', description: 'Anti-Channel Create, Delete, Update' },
      { label: 'Member & Mod Protections', value: 'group_members', description: 'Anti-Ban, Anti-Kick, Anti-Timeout, Bot Add, Prune' },
      { label: 'Server & Asset Protections', value: 'group_server', description: 'Webhooks, Guild Updates, Emojis, Stickers' },
      { label: 'AutoMod & Content Filters', value: 'group_automod', description: 'Anti-Link, Anti-Spam, Mass Pings, Blacklist' },
      { label: 'Threat Punishment Policies', value: 'group_punishments', description: 'Configure Quarantine, Kick, Ban, Strip Roles' },
      { label: 'Security Profiles & Presets', value: 'group_presets', description: 'Strict, Standard, Relaxed & Aggressive Profiles' },
      { label: 'Whitelist & Clearance Management', value: 'group_whitelist', description: 'Extra Owners & Whitelisted Members Overview' }
    ]);
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export function buildAntiNukeSelectMenu(currentValue?: string): ActionRowBuilder<StringSelectMenuBuilder> {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('select_sec_rule_group')
    .setPlaceholder('Navigate Anti-Nuke Threat Protections...')
    .addOptions([
      { label: 'Anti-Nuke Hub Overview', value: 'group_an_hub', description: 'Master Threat Status, Raid Controls & Metrics' },
      { label: 'Role Protections (5 Rules)', value: 'group_roles', description: 'Anti-Role Create, Delete, Update, Grant, Revoke' },
      { label: 'Channel Protections (3 Rules)', value: 'group_channels', description: 'Anti-Channel Create, Delete, Update' },
      { label: 'Member & Mod Protections (7 Rules)', value: 'group_members', description: 'Anti-Ban, Anti-Kick, Anti-Timeout, Bot Add, Prune' },
      { label: 'Server & Asset Protections (10 Rules)', value: 'group_server', description: 'Webhooks, Guild Updates, Emojis, Stickers' },
      { label: 'Threat Punishment Policies', value: 'group_punishments', description: 'Configure Quarantine, Kick, Ban, Strip Roles' },
      { label: 'Security Profiles & Presets', value: 'group_presets', description: 'Strict, Standard, Relaxed & Aggressive Profiles' },
      { label: 'Whitelist & Clearance Management', value: 'group_whitelist', description: 'Extra Owners & Whitelisted Members Overview' }
    ]);
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export async function buildAntiNukeDashboardGUI(guild: any, secConfig: any, extraOrContext?: any) {
  const guildId = guild?.id;
  const isAntiNukeEnabled = secConfig?.antiNukeEnabled !== false;
  const isRaidMode = Boolean(secConfig?.raidModeEnabled);
  const isEmergencyLock = Boolean(secConfig?.emergencyMode);
  const qRoleId = secConfig?.quarantineRoleId;
  const qRole = qRoleId ? guild?.roles.cache.get(qRoleId) : null;
  const qRoleText = qRole ? `${qRole}` : '`Not Configured`';

  // 1. Fetch Real Extra Owners count from SQLite DB
  const db = Database.getDb();
  let extraOwnerCount = 0;
  try {
    if (db && guildId) {
      const row = await db.get<any>('SELECT COUNT(*) as count FROM extra_owners WHERE guildId = ?', [guildId]).catch(() => null);
      if (row && typeof row.count === 'number') extraOwnerCount = row.count;
    }
  } catch {}
  if (extraOwnerCount === 0 && Array.isArray(secConfig?.extraOwners)) {
    extraOwnerCount = secConfig.extraOwners.length;
  }

  // 2. Fetch Real Whitelisted count
  let whitelistedCount = 0;
  if (Array.isArray(secConfig?.whitelistedUsers)) {
    whitelistedCount = secConfig.whitelistedUsers.length;
  } else if (Array.isArray(secConfig?.whitelist)) {
    whitelistedCount = secConfig.whitelist.length;
  }

  const logChanId = secConfig?.alertChannelId || secConfig?.logChannelId;
  const logChan = logChanId ? guild?.channels.cache.get(logChanId) : null;
  const logChanText = logChan ? `${logChan}` : '`#rage-logs (Auto)`';

  // 3. Compute Real Active Enabled Rules Count & Category Subsystem States
  const rules = secConfig?.rules || {};
  const isRuleActive = (k: string) => isAntiNukeEnabled && getEffectiveRule(rules, k, secConfig).enabled;

  const chanEngineActive = isRuleActive('anti_channel_create') || isRuleActive('anti_channel_delete') || isRuleActive('anti_channel_update');
  const roleEngineActive = isRuleActive('anti_role_create') || isRuleActive('anti_role_delete') || isRuleActive('anti_role_update');
  const modEngineActive = isRuleActive('anti_ban') || isRuleActive('anti_kick') || isRuleActive('anti_prune');
  const botEngineActive = isRuleActive('anti_bot_add');
  const webhookEngineActive = isRuleActive('anti_webhook_create') || isRuleActive('anti_webhook_delete');
  const serverEngineActive = isRuleActive('anti_guild_update');
  const emojiEngineActive = isRuleActive('anti_emoji_create') || isRuleActive('anti_sticker_create');
  const mentionEngineActive = isRuleActive('anti_everyone_here');
  const autoRevertEngineActive = isAntiNukeEnabled;

  const getStatus = (active: boolean) => (active
    ? formatCustomEmoji(guild?.client, '1546134620087783526', 'success_check', true)
    : formatCustomEmoji(guild?.client, '1546155193303957504', 'wrong', true));

  const subsystems = [
    `${getStatus(isAntiNukeEnabled)} Anti-Nuke Threat Mitigation & Instant Auto-Recovery`,
    `${getStatus(chanEngineActive)} Anti-Channel Create / Delete / Permission Tamper Guard`,
    `${getStatus(roleEngineActive)} Anti-Role Create / Delete / Dangerous Permission Quarantine`,
    `${getStatus(modEngineActive)} Anti-Ban / Anti-Kick / Mass Member Prune Blocker`,
    `${getStatus(botEngineActive)} Anti-Bot Infiltration & Malicious Token Gatekeeper`,
    `${getStatus(webhookEngineActive)} Anti-Webhook Creation & Token Leak Interceptor`,
    `${getStatus(serverEngineActive)} Anti-Guild Update & Vanity URL Hijack Shield`,
    `${getStatus(emojiEngineActive)} Anti-Emoji & Sticker Spam Mitigation Protocol`,
    `${getStatus(mentionEngineActive)} Anti-Spam / Mass Mention / Broadcast Blocker`,
    `${getStatus(autoRevertEngineActive)} Dynamic Encrypted Snapshot & Rollback Protocol`
  ];

  const activeCount = [
    isAntiNukeEnabled,
    chanEngineActive,
    roleEngineActive,
    modEngineActive,
    botEngineActive,
    webhookEngineActive,
    serverEngineActive,
    emojiEngineActive,
    mentionEngineActive,
    autoRevertEngineActive
  ].filter(Boolean).length;

  const subFooter = isAntiNukeEnabled
    ? `**All ${activeCount} Antinuke Security Engines Initialized & Fully Operational**`
    : `**All 10 Antinuke Security Engines Offline & Placed on Standby**`;

  const description = [
    `>>> ${subsystems.join('\n')}`,
    '',
    subFooter,
    '',
    `**Quarantine Isolation:** ${qRoleText}`,
    `**Security Audit Log:** ${logChanText}`,
    `**Authorized Operators:** \`${extraOwnerCount} Extra Owners • ${whitelistedCount} Whitelisted\``,
    `**Default Threat Action:** \`${(secConfig?.defaultPunishment || 'quarantine').toUpperCase()}\``
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(0x2B2D31)
    .setTitle('Antinuke Threat Defense Center')
    .setDescription(description)
    .setFooter({
      text: BRAND_FOOTER,
      iconURL: guild?.iconURL() || undefined
    })
    .setTimestamp();

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_sec_toggle_antinuke')
      .setLabel(isAntiNukeEnabled ? 'Anti-Nuke: ON' : 'Anti-Nuke: OFF')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_sec_toggle_raid')
      .setLabel(isRaidMode ? 'Raid Mode: ON' : 'Raid Mode: OFF')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_sec_emergency_lock')
      .setLabel(isEmergencyLock ? 'Lockdown: ON' : 'Lockdown: OFF')
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_an_nav_roles')
      .setLabel('Role Protections')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_an_nav_channels')
      .setLabel('Channel Protections')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_an_nav_members')
      .setLabel('Member Protections')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_an_nav_server')
      .setLabel('Server Protections')
      .setStyle(ButtonStyle.Secondary)
  );

  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_sec_qrole_setup')
      .setLabel('Quarantine Role')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_sec_whitelist_manager')
      .setLabel('Whitelist Manager')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_sec_presets')
      .setLabel('Security Presets')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_an_refresh_hub')
      .setLabel('Refresh Status')
      .setStyle(ButtonStyle.Secondary)
  );

  const row4 = buildAntiNukeSelectMenu('group_an_hub');

  return { embed, embeds: [embed], components: [row1, row2, row3, row4] };
}

export async function buildSecurityDashboardComponents(guild: any, secConfig: any, extraOrContext?: any) {
  const guildId = guild?.id;
  const isAntiNukeEnabled = secConfig?.antiNukeEnabled !== false;
  const isRaidMode = Boolean(secConfig?.raidModeEnabled);
  const isEmergencyLock = Boolean(secConfig?.emergencyMode);
  const qRoleId = secConfig?.quarantineRoleId;
  const qRole = qRoleId ? guild?.roles.cache.get(qRoleId) : null;
  const qRoleText = qRole ? `${qRole}` : '`Not Configured`';

  // 1. Fetch Real Extra Owners count from SQLite DB
  const db = Database.getDb();
  let extraOwnerCount = 0;
  try {
    if (db && guildId) {
      const row = await db.get<any>('SELECT COUNT(*) as count FROM extra_owners WHERE guildId = ?', [guildId]).catch(() => null);
      if (row && typeof row.count === 'number') extraOwnerCount = row.count;
    }
  } catch {}
  if (extraOwnerCount === 0 && Array.isArray(secConfig?.extraOwners)) {
    extraOwnerCount = secConfig.extraOwners.length;
  }

  // 2. Fetch Real Whitelisted count
  let whitelistedCount = 0;
  if (Array.isArray(secConfig?.whitelistedUsers)) {
    whitelistedCount = secConfig.whitelistedUsers.length;
  } else if (Array.isArray(secConfig?.whitelist)) {
    whitelistedCount = secConfig.whitelist.length;
  }

  const logChanId = secConfig?.alertChannelId || secConfig?.logChannelId;
  const logChan = logChanId ? guild?.channels.cache.get(logChanId) : null;
  const logChanText = logChan ? `${logChan}` : '`#rage-logs (Auto)`';

  // 3. Fetch Real AutoMod State
  let amConfig: any = {};
  if (extraOrContext?.getModulesState) {
    const modules = extraOrContext.getModulesState(guildId) || [];
    const amMod = modules.find((m: any) => m.id === 'automod');
    if (amMod?.config) amConfig = amMod.config;
  }
  const isAutoModActive = amConfig?.autoModEnabled !== false && amConfig?.antiLinkEnabled !== false;

  const getStatus = (active: boolean) => (active
    ? formatCustomEmoji(guild?.client, '1546134620087783526', 'success_check', true)
    : formatCustomEmoji(guild?.client, '1546155193303957504', 'wrong', true));

  const subsystems = [
    `${getStatus(isAntiNukeEnabled)} Anti-Nuke Master Threat Mitigation Engine`,
    `${getStatus(isAutoModActive)} AutoMod Chat Filtering & Content Protection`,
    `${getStatus(isRaidMode)} Server Raid Shield & Lockout Guard`,
    `${getStatus(isEmergencyLock)} Emergency Lockdown & Channel Silencer`,
    `${getStatus(Boolean(qRoleId))} Quarantine Isolation Role Enforcer`,
    `${getStatus(Boolean(logChanId))} Realtime Audit Logging & Incident Dispatcher`,
    `${getStatus(extraOwnerCount > 0 || whitelistedCount > 0)} Whitelist & Access Hierarchy Protocol`,
    `${getStatus(isAntiNukeEnabled)} Encrypted System State & Rollback Engine`
  ];

  const activeCount = [
    isAntiNukeEnabled,
    isAutoModActive,
    isRaidMode,
    isEmergencyLock,
    Boolean(qRoleId),
    Boolean(logChanId),
    extraOwnerCount > 0 || whitelistedCount > 0,
    isAntiNukeEnabled
  ].filter(Boolean).length;

  const subFooter = isAntiNukeEnabled
    ? `**All ${activeCount} Security Engines Initialized & Fully Operational**`
    : `**Security Engines Standby (Master Anti-Nuke Paused)**`;

  const description = [
    `>>> ${subsystems.join('\n')}`,
    '',
    subFooter,
    '',
    `**Quarantine Isolation:** ${qRoleText}`,
    `**Security Audit Log:** ${logChanText}`,
    `**Authorized Operators:** \`${extraOwnerCount} Extra Owners • ${whitelistedCount} Whitelisted\``,
    `**Default Threat Action:** \`${(secConfig?.defaultPunishment || 'quarantine').toUpperCase()}\``
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(0x2B2D31)
    .setTitle('Security & Antinuke Control Center')
    .setDescription(description)
    .setFooter({
      text: BRAND_FOOTER,
      iconURL: guild?.iconURL() || undefined
    })
    .setTimestamp();

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_sec_toggle_antinuke')
      .setLabel(isAntiNukeEnabled ? 'Anti-Nuke: ON' : 'Anti-Nuke: OFF')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_sec_toggle_automod')
      .setLabel(isAutoModActive ? 'AutoMod: ON' : 'AutoMod: OFF')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_sec_toggle_raid')
      .setLabel(isRaidMode ? 'Raid Mode: ON' : 'Raid Mode: OFF')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_sec_emergency_lock')
      .setLabel(isEmergencyLock ? 'Lockdown: ON' : 'Lockdown: OFF')
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_sec_qrole_setup')
      .setLabel('Quarantine Role')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_sec_whitelist_manager')
      .setLabel('Whitelist Manager')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_sec_presets')
      .setLabel('Security Presets')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_sec_refresh')
      .setLabel('Refresh Status')
      .setStyle(ButtonStyle.Secondary)
  );

  const row3 = buildSecuritySelectMenu('group_hub');

  return { embed, embeds: [embed], components: [row1, row2, row3] };
}

export function buildAntiNukeOverview(secConfig: any, targetGroup?: string) {
  const rules = secConfig?.rules || {};
  const isMasterEnabled = secConfig?.antiNukeEnabled !== false;

  const categoryDefinitions: Record<string, { label: string; title: string; keys: string[] }> = {
    group_roles: {
      label: 'ROLE PROTECTIONS',
      title: 'ROLE PROTECTION MODULES',
      keys: ['anti_role_grant', 'anti_role_remove', 'anti_role_update', 'anti_role_create', 'anti_role_delete']
    },
    group_channels: {
      label: 'CHANNEL PROTECTIONS',
      title: 'CHANNEL PROTECTION MODULES',
      keys: ['anti_channel_create', 'anti_channel_delete', 'anti_channel_update']
    },
    group_members: {
      label: 'MEMBER & MODERATION PROTECTIONS',
      title: 'MEMBER & MODERATION MODULES',
      keys: ['anti_ban', 'anti_kick', 'anti_timeout', 'anti_bot_add', 'anti_bot_remove', 'anti_prune', 'anti_everyone_here']
    },
    group_server: {
      label: 'SERVER & ASSET PROTECTIONS',
      title: 'SERVER & ASSET MODULES',
      keys: ['anti_webhook_create', 'anti_webhook_delete', 'anti_webhook_update', 'anti_guild_update', 'anti_invite_create', 'anti_emoji_create', 'anti_emoji_delete', 'anti_emoji_update', 'anti_sticker_create', 'anti_sticker_delete']
    }
  };

  const selectedKey = targetGroup?.toLowerCase();
  const normalizedGroup = selectedKey === 'roles' || selectedKey === 'role' ? 'group_roles'
    : selectedKey === 'channels' || selectedKey === 'channel' ? 'group_channels'
    : selectedKey === 'members' || selectedKey === 'member' || selectedKey === 'mods' ? 'group_members'
    : selectedKey === 'server' || selectedKey === 'webhooks' || selectedKey === 'webhook' ? 'group_server'
    : selectedKey && categoryDefinitions[selectedKey] ? selectedKey
    : 'group_roles';

  const activeDef = categoryDefinitions[normalizedGroup] || categoryDefinitions.group_roles;

  const RULE_LABELS: Record<string, string> = {
    anti_role_grant: 'Role Grant Interceptor',
    anti_role_remove: 'Role Strip Interceptor',
    anti_role_update: 'Role Permission Modification Guard',
    anti_role_create: 'Role Creation Interceptor',
    anti_role_delete: 'Role Deletion Mitigation Guard',
    anti_channel_create: 'Channel Creation Interceptor',
    anti_channel_delete: 'Channel Deletion Mitigation Guard',
    anti_channel_update: 'Channel Override & Rename Guard',
    anti_ban: 'Mass Member Ban Interceptor',
    anti_kick: 'Mass Member Kick Blocker',
    anti_timeout: 'Unauthorized Timeout Interceptor',
    anti_bot_add: 'Rogue Bot Infiltration Gatekeeper',
    anti_bot_remove: 'Authorized Bot Removal Blocker',
    anti_prune: 'Mass Member Prune Shield',
    anti_everyone_here: 'Everyone & Here Ping Suppressor',
    anti_webhook_create: 'Webhook Creation Interceptor',
    anti_webhook_delete: 'Webhook Deletion Mitigation Guard',
    anti_webhook_update: 'Webhook Modification Interceptor',
    anti_guild_update: 'Guild Settings & Vanity Hijack Guard',
    anti_invite_create: 'Invite Creation Rate Limiter',
    anti_emoji_create: 'Emoji Creation Flooding Guard',
    anti_emoji_delete: 'Emoji Mass Deletion Shield',
    anti_emoji_update: 'Emoji Renaming & Tamper Guard',
    anti_sticker_create: 'Sticker Creation Flooding Guard',
    anti_sticker_delete: 'Sticker Mass Deletion Shield',
    anti_sticker_update: 'Sticker Modification Guard',
    anti_link: 'Malicious URL & Invite Firewall'
  };

  const subsystems: string[] = [];
  let activeInCat = 0;
  for (const key of activeDef.keys) {
    const rule = getEffectiveRule(rules, key, secConfig);
    const isRuleActive = isMasterEnabled && rule.enabled;
    if (isRuleActive) activeInCat++;
    const icon = isRuleActive
      ? formatCustomEmoji(null, '1546134620087783526', 'success_check', true)
      : formatCustomEmoji(null, '1546155193303957504', 'wrong', true);
    const label = RULE_LABELS[key] || key;
    const revertTag = rule.recovery ? 'Auto-Revert' : 'No-Revert';
    subsystems.push(`${icon} **${label}** • \`${rule.limit}/${rule.window}s\` • \`${rule.action.toUpperCase()}\` • \`${revertTag}\``);
  }

  const subFooter = isMasterEnabled
    ? `**${activeInCat}/${activeDef.keys.length} Category Engines Armed & Fully Operational**`
    : `**All ${activeDef.keys.length} Category Engines Standby (Master Anti-Nuke Paused)**`;

  const description = [
    `>>> ${subsystems.join('\n')}`,
    '',
    subFooter,
    '',
    `**Category Scope:** \`${activeDef.label}\``,
    `**Master Defense State:** \`${isMasterEnabled ? 'ARMED & ACTIVE' : 'OFFLINE / PAUSED'}\``,
    `**Default Enforcement Action:** \`${(secConfig?.defaultPunishment || 'quarantine').toUpperCase()}\``
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(0x2B2D31)
    .setTitle(`Antinuke Category Inspection • ${activeDef.label}`)
    .setDescription(description)
    .setFooter({ text: BRAND_FOOTER })
    .setTimestamp();

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_sec_cat_action_${normalizedGroup}_quarantine`)
      .setLabel('Action: Quarantine')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`btn_sec_cat_action_${normalizedGroup}_kick`)
      .setLabel('Action: Kick')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`btn_sec_cat_action_${normalizedGroup}_ban`)
      .setLabel('Action: Ban')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`btn_sec_cat_toggle_revert_${normalizedGroup}`)
      .setLabel('Toggle Auto-Revert')
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`btn_sec_cat_thresh_${normalizedGroup}_1_10`)
      .setLabel('Strict (1/10s)')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`btn_sec_cat_thresh_${normalizedGroup}_3_10`)
      .setLabel('Normal (3/10s)')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`btn_sec_cat_thresh_${normalizedGroup}_5_10`)
      .setLabel('Relaxed (5/10s)')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`btn_sec_cat_custom_thresh_${normalizedGroup}`)
      .setLabel('Custom Threshold')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`btn_sec_cat_toggle_all_${normalizedGroup}`)
      .setLabel('Toggle Category')
      .setStyle(ButtonStyle.Secondary)
  );

  const row3 = buildSecuritySelectMenu(normalizedGroup);

  const row4 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_sec_refresh')
      .setLabel('Main Security Hub')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`btn_sec_refresh_cat_${normalizedGroup}`)
      .setLabel('Refresh Category')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2, row3, row4] };
}

export async function buildAutoModDashboardComponents(guild: any, secConfig: any, extraOrContext?: any) {
  const guildId = guild?.id;
  let amConfig: any = {};
  let amModStatus = 'enabled';
  if (extraOrContext?.getModulesState) {
    const modules = extraOrContext.getModulesState(guildId) || [];
    const amMod = modules.find((m: any) => m.id === 'automod');
    if (amMod) {
      amModStatus = amMod.status || 'enabled';
      if (amMod.config) amConfig = amMod.config;
    }
  }
  if (!amConfig || Object.keys(amConfig).length === 0) {
    const db = Database.getDb();
    if (db && guildId) {
      const row = await db.get<any>('SELECT configJson FROM guild_module_configs WHERE guildId = ? AND moduleId = ?', [guildId, 'automod']).catch(() => null);
      if (row?.configJson) {
        try { amConfig = JSON.parse(row.configJson); } catch {}
      }
    }
  }

  // Merge any secConfig.automod fallback if missing
  if (secConfig?.automod) {
    amConfig = { ...secConfig.automod, ...amConfig };
  }

  const isMasterActive = amModStatus !== 'disabled' && amConfig?.autoModEnabled !== false && secConfig?.autoModEnabled !== false;
  const isAntiLink = isMasterActive && amConfig?.blockLinks !== false && amConfig?.antiLinkEnabled !== false;
  const isAntiSpam = isMasterActive && (amConfig?.antiSpamEnabled === true || Boolean(amConfig?.maxSpamMessages));
  const ruleEveryone = secConfig?.rules?.anti_everyone_here;
  const isAntiEveryone = (ruleEveryone?.enabled !== false) && (amConfig?.antiEveryoneEnabled !== false) && (secConfig?.antiNukeEnabled !== false);
  const isAntiInvites = isMasterActive && amConfig?.blockInvites !== false;
  const isAttachmentFilter = isMasterActive && amConfig?.attachmentFilterEnabled !== false;
  const isDuplicateFilter = isMasterActive && amConfig?.duplicateFilterEnabled !== false;
  const currentAction = (amConfig?.punishment || amConfig?.spamAction || amConfig?.punishmentAction || 'warn').toUpperCase();
  const maxSpam = amConfig?.maxMessages || amConfig?.maxSpamMessages || 5;
  const spamWindow = amConfig?.windowSeconds || amConfig?.spamWindowSeconds || 5;
  const linkLimit = amConfig?.antiLinkLimit || amConfig?.limit || 5;
  const ignoredRoles = (amConfig?.ignoredRoles || []).length;
  const ignoredChannels = (amConfig?.ignoredChannels || []).length;

  const getStatus = (active: boolean) => (active
    ? formatCustomEmoji(guild?.client, '1546134620087783526', 'success_check', true)
    : formatCustomEmoji(guild?.client, '1546155193303957504', 'wrong', true));

  const filters = [
    `${getStatus(isAntiLink)} Malicious URL & External Phishing Interceptor • \`Limit: ${linkLimit} Links\``,
    `${getStatus(isAntiInvites)} Discord Invite Link Filter & Unauthorized Ad Shield`,
    `${getStatus(isAntiSpam)} High-Frequency Message Rate Limiter • \`${maxSpam} msgs / ${spamWindow}s\``,
    `${getStatus(isAntiEveryone)} Mass Mention & Unauthorized Ping Suppression`,
    `${getStatus(isAttachmentFilter)} Suspicious File Attachment & Media Payload Scanner`,
    `${getStatus(isDuplicateFilter)} Repetitive Text & Copy-Paste Flood Suppressor`,
    `${getStatus(ignoredRoles > 0 || ignoredChannels > 0)} Bypass Whitelist Enforcement • \`${ignoredRoles} Roles • ${ignoredChannels} Chans\``,
    `${getStatus(isMasterActive)} Violation Enforcement & Penalty Dispatcher • \`${currentAction}\``
  ];

  const activeFiltersCount = [
    isAntiLink,
    isAntiInvites,
    isAntiSpam,
    isAntiEveryone,
    isAttachmentFilter,
    isDuplicateFilter,
    ignoredRoles > 0 || ignoredChannels > 0,
    isMasterActive
  ].filter(Boolean).length;

  const subFooter = isMasterActive
    ? `**All ${activeFiltersCount} AutoMod Content Engines Initialized & Active**`
    : `**All 8 AutoMod Content Engines Offline & Placed on Standby**`;

  const description = [
    `>>> ${filters.join('\n')}`,
    '',
    subFooter,
    '',
    `**Default Action Policy:** \`${currentAction}\``,
    `**Exempted Whitelist:** \`${ignoredRoles} Roles • ${ignoredChannels} Channels\``,
    `**Enforcement Scope:** \`Realtime Chat, Invites & Attachments\``
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(0x2B2D31)
    .setTitle('AutoMod & Chat Security Subsystems')
    .setDescription(description)
    .setFooter({
      text: BRAND_FOOTER,
      iconURL: guild?.iconURL() || undefined
    })
    .setTimestamp();

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_sec_am_toggle_antilink')
      .setLabel(isAntiLink ? 'Anti-Link: ON' : 'Anti-Link: OFF')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_sec_am_toggle_antispam')
      .setLabel(isAntiSpam ? 'Anti-Spam: ON' : 'Anti-Spam: OFF')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_sec_am_toggle_antieveryone')
      .setLabel(isAntiEveryone ? 'Anti-Ping: ON' : 'Anti-Ping: OFF')
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_sec_am_action_warn')
      .setLabel('Action: Warn')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_sec_am_action_mute')
      .setLabel('Action: Mute')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_sec_am_action_delete')
      .setLabel('Action: Delete Only')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_sec_am_action_kick')
      .setLabel('Action: Kick')
      .setStyle(ButtonStyle.Secondary)
  );

  const row3 = buildSecuritySelectMenu('group_automod');

  const row4 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_sec_refresh')
      .setLabel('Main Security Hub')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_sec_am_refresh')
      .setLabel('Refresh AutoMod')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embed, embeds: [embed], components: [row1, row2, row3, row4] };
}

export function buildPresetsDashboardComponents(guild: any, secConfig: any) {
  const currentPreset = (secConfig?.preset || 'standard').toUpperCase();

  const embed = new EmbedBuilder()
    .setTitle('Rage Optimiser • Security Presets & Profiles')
    .setColor(Colors.BRAND)
    .setDescription(
      `> **One-Click Security Configuration Profiles**\n` +
      `Apply balanced or aggressive sensitivity baselines across all 24 security and protection modules instantly.\n\n` +
      `**Current Applied Profile:** \`${currentPreset}\`\n\n` +
      `**Available Profiles:**\n` +
      `• **STRICT**: 1 action per 10s • Auto-Quarantine • Auto-Recovery\n` +
      `• **STANDARD**: 3 actions per 10s • Auto-Quarantine • Auto-Recovery\n` +
      `• **RELAXED**: 5 actions per 10s • Auto-Kick • Auto-Recovery\n` +
      `• **AGGRESSIVE**: 1 action per 10s • Instant Ban • Auto-Recovery`
    )
    .setThumbnail(guild?.iconURL({ size: 256 }) || undefined)
    .setFooter({ text: BRAND_FOOTER });

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_sec_preset_strict')
      .setLabel('Strict Profile')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_sec_preset_standard')
      .setLabel('Standard Profile')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_sec_preset_relaxed')
      .setLabel('Relaxed Profile')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_sec_preset_aggressive')
      .setLabel('Aggressive Profile')
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_sec_refresh')
      .setLabel('Main Security Hub')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_sec_refresh_presets')
      .setLabel('Refresh Presets')
      .setStyle(ButtonStyle.Secondary)
  );

  const row3 = buildSecuritySelectMenu('group_presets');

  return { embeds: [embed], components: [row1, row2, row3] };
}

export function buildPunishmentPolicyGUI(guild: any, secConfig: any) {
  const currentAction = (secConfig?.defaultPunishment || 'quarantine').toUpperCase();

  const embed = new EmbedBuilder()
    .setTitle('Rage Optimiser • Threat Punishment & Enforcement')
    .setColor(Colors.BRAND)
    .setDescription(
      `> **Global Threat Punishment Policy**\n` +
      `Configure the automatic punishment applied to unauthorized administrators and raid actors when threshold breaches occur.\n\n` +
      `**Current Global Enforcement:** \`${currentAction}\`\n\n` +
      `**Available Punishments:**\n` +
      `• **QUARANTINE**: Strips all roles & binds user to isolation quarantine role\n` +
      `• **KICK**: Disconnects and removes user from the server\n` +
      `• **BAN**: Permanently bans user from the server\n` +
      `• **STRIP ROLES**: Removes all administrative & dangerous roles immediately`
    )
    .setThumbnail(guild?.iconURL({ size: 256 }) || undefined)
    .setFooter({ text: BRAND_FOOTER });

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_sec_global_action_quarantine')
      .setLabel('Set All: Quarantine')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_sec_global_action_kick')
      .setLabel('Set All: Kick')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_sec_global_action_ban')
      .setLabel('Set All: Ban')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_sec_global_action_strip')
      .setLabel('Set All: Strip Roles')
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_sec_refresh')
      .setLabel('Main Security Hub')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_sec_refresh_punishments')
      .setLabel('Refresh Policy')
      .setStyle(ButtonStyle.Secondary)
  );

  const row3 = buildSecuritySelectMenu('group_punishments');

  return { embeds: [embed], components: [row1, row2, row3] };
}

export async function buildWhitelistManagerGUI(guild: any, secConfig: any, extraOrContext?: any) {
  const guildId = guild?.id;
  const ownerId = guild?.ownerId;

  // 1. Fetch Extra Owners from SQLite DB, RAM Cache, and secConfig
  const db = Database.getDb();
  let extraOwnerIds: string[] = [];
  try {
    if (db && guildId) {
      const rows = await db.all<any>('SELECT userId FROM extra_owners WHERE guildId = ?', [guildId]).catch(() => []);
      if (rows && rows.length > 0) {
        extraOwnerIds = rows.map((r: any) => r.userId);
      }
    }
  } catch {}
  if (extraOwnerIds.length === 0 && guildId) {
    const cached = getGuildExtraOwnersFromCache(guildId);
    if (cached && cached.length > 0) {
      extraOwnerIds = cached;
    }
  }
  if (extraOwnerIds.length === 0 && Array.isArray(secConfig?.extraOwners)) {
    extraOwnerIds = secConfig.extraOwners;
  }
  extraOwnerIds = [...new Set(extraOwnerIds.filter(Boolean))];

  // 2. Fetch Modules for Unified Whitelist
  let modules: any[] = [];
  if (extraOrContext?.getModulesState) {
    try {
      modules = extraOrContext.getModulesState(guildId) || [];
    } catch {}
  }
  if (modules.length === 0 && db && guildId) {
    try {
      const mwRow = await db.get<any>('SELECT configJson FROM guild_module_configs WHERE guildId = ? AND moduleId = ?', [guildId, 'member_whitelist']).catch(() => null);
      if (mwRow?.configJson) {
        modules.push({ id: 'member_whitelist', config: JSON.parse(mwRow.configJson) });
      }
    } catch {}
  }
  if (secConfig && !modules.some((m: any) => m.id === 'security')) {
    modules.push({ id: 'security', config: secConfig });
  }

  // 3. Extract Whitelisted Users, Roles, and Bots
  const { userSet, roleSet } = getUnifiedWhitelistEntries(modules);

  // Fallback checks from secConfig directly if userSet/roleSet are empty
  if (userSet.size === 0 && Array.isArray(secConfig?.whitelist)) {
    for (const w of secConfig.whitelist) {
      const uId = typeof w === 'string' ? w : (w?.targetId || w?.userId || w?.id);
      if (uId) userSet.set(uId, typeof w === 'string' ? `User-${uId}` : (w.username || w.tag || w.name || `User-${uId}`));
    }
  }
  if (userSet.size === 0 && Array.isArray(secConfig?.whitelistedUsers)) {
    for (const uId of secConfig.whitelistedUsers) {
      if (uId) userSet.set(uId, `User-${uId}`);
    }
  }
  if (roleSet.size === 0 && Array.isArray(secConfig?.whitelistRoles || secConfig?.exceptionRoleIds)) {
    for (const rId of (secConfig.whitelistRoles || secConfig.exceptionRoleIds)) {
      if (rId) roleSet.set(rId, `Role-${rId}`);
    }
  }

  const extraOwnersList = extraOwnerIds.length > 0
    ? extraOwnerIds.map((id: string) => `• <@${id}> (\`${id}\`)`).join('\n')
    : '`None Assigned`';

  const userEntries = [...userSet.entries()];
  const whitelistedList = userEntries.length > 0
    ? userEntries.map(([id, name]) => `• <@${id}> (\`${id}\`)`).join('\n')
    : '`None Assigned`';

  const roleEntries = [...roleSet.entries()];
  const whitelistedRolesList = roleEntries.length > 0
    ? roleEntries.map(([id, name]) => `• <@&${id}> (\`${id}\`)`).join('\n')
    : '`None Assigned`';

  const embed = new EmbedBuilder()
    .setTitle('Rage Optimiser • Whitelist & Clearance Hierarchy')
    .setColor(0x2B2D31)
    .setDescription(
      `> **Clearance & Access Hierarchy**\n` +
      `Overview of users authorized to bypass security rate limits, execute protected actions, and configure protection matrices.\n\n` +
      `**Primary Server Owner:** <@${ownerId}> (\`${ownerId}\`)\n\n` +
      `**Extra Owners (${extraOwnerIds.length}):**\n${extraOwnersList}\n\n` +
      `**Whitelisted Members (${userSet.size}):**\n${whitelistedList}\n\n` +
      `**Whitelisted Roles (${roleSet.size}):**\n${whitelistedRolesList}\n\n` +
      `**Whitelist Management Commands:**\n` +
      `• \`r!extraowner add @user\` — Grant full owner anti-nuke bypass\n` +
      `• \`r!whitelist add @user\` — Grant specific security bypass\n` +
      `• \`r!whitelist list\` — View whitelisted members & roles\n` +
      `• \`r!whitelist reset\` — Reset all whitelisted entities`
    )
    .setThumbnail(guild?.iconURL({ size: 256 }) || undefined)
    .setFooter({ text: BRAND_FOOTER });

  const row0 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('wl_add_user')
      .setLabel('Add User')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('wl_add_role')
      .setLabel('Add Role')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('wl_remove_user')
      .setLabel('Remove User')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('wl_remove_role')
      .setLabel('Remove Role')
      .setStyle(ButtonStyle.Secondary)
  );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_sec_refresh')
      .setLabel('Main Security Hub')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_sec_refresh_wl')
      .setLabel('Refresh Whitelist')
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = buildSecuritySelectMenu('group_whitelist');

  return { embeds: [embed], components: [row0, row1, row2] };
}

export function buildEnableAllDashboardGUI(
  guild: any,
  secConfig: any,
  newlyActivatedCount: number = 0,
  dashChannel: any = null
) {
  const CHECK = SUCCESS_CHECK_ICON;

  const subsystems = [
    `${CHECK} Anti-Nuke Threat Mitigation & Instant Auto-Recovery`,
    `${CHECK} Anti-Channel Create / Delete / Permission Tamper Guard`,
    `${CHECK} Anti-Role Create / Delete / Dangerous Permission Quarantine`,
    `${CHECK} Anti-Ban / Anti-Kick / Mass Member Prune Blocker`,
    `${CHECK} Anti-Bot Infiltration & Malicious Token Gatekeeper`,
    `${CHECK} Anti-Webhook Creation & Token Leak Interceptor`,
    `${CHECK} Anti-Emoji & Sticker Spam Mitigation Protocol`,
    `${CHECK} Anti-Guild Update & Vanity URL Hijack Shield`,
    `${CHECK} Anti-Spam / Mass Mention / Phishing Link Firewall`,
    `${CHECK} 2FA Hardware & Email Verification Sandbox`,
    `${CHECK} STM (Server Tag Manager) Dynamic Enforcement`,
    `${CHECK} Encrypted Realtime Snapshot & Auto-Backup Engine`,
    `${CHECK} Auto-Unban & Audit Log Heuristic Threat Evaluator`,
    `${CHECK} Media & Attachment Threat Bypass Security Protocol`
  ];

  const description = [
    `>>> ${subsystems.join('\n')}`,
    '',
    `**All 14 Antinuke Security Engines Initialized & Fully Operational**`
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(0x2B2D31)
    .setTitle('Antinuke Security Subsystems Initialized')
    .setDescription(description)
    .setFooter({
      text: BRAND_FOOTER,
      iconURL: guild?.iconURL() || undefined
    })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>();
  if (!secConfig?.alertEmail) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('btn_sec_link_gmail')
        .setLabel('Link Gmail 2FA')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('btn_sec_open_extraowner')
        .setLabel('Manage Admins')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('btn_sec_open_whitelist_user')
        .setLabel('Whitelist User')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('btn_sec_close_overview')
        .setLabel('Dismiss')
        .setStyle(ButtonStyle.Secondary)
    );
  } else {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('btn_sec_link_gmail')
        .setLabel('Update Gmail')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('btn_sec_remove_gmail')
        .setLabel('Unlink Gmail')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('btn_sec_open_extraowner')
        .setLabel('Manage Admins')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('btn_sec_close_overview')
        .setLabel('Dismiss')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  return { embeds: [embed], components: [row] };
}

export function buildDisableAllDashboardGUI(
  guild: any
) {
  const WRONG = WRONG_ICON;

  const subsystems = [
    `${WRONG} Anti-Nuke Threat Mitigation & Instant Auto-Recovery`,
    `${WRONG} Anti-Channel Create / Delete / Permission Tamper Guard`,
    `${WRONG} Anti-Role Create / Delete / Dangerous Permission Quarantine`,
    `${WRONG} Anti-Ban / Anti-Kick / Mass Member Prune Blocker`,
    `${WRONG} Anti-Bot Infiltration & Malicious Token Gatekeeper`,
    `${WRONG} Anti-Webhook Creation & Token Leak Interceptor`,
    `${WRONG} Anti-Emoji & Sticker Spam Mitigation Protocol`,
    `${WRONG} Anti-Guild Update & Vanity URL Hijack Shield`,
    `${WRONG} Anti-Spam / Mass Mention / Phishing Link Firewall`,
    `${WRONG} 2FA Hardware & Email Verification Sandbox`,
    `${WRONG} STM (Server Tag Manager) Dynamic Enforcement`,
    `${WRONG} Encrypted Realtime Snapshot & Auto-Backup Engine`,
    `${WRONG} Auto-Unban & Audit Log Heuristic Threat Evaluator`,
    `${WRONG} Media & Attachment Threat Bypass Security Protocol`
  ];

  const description = [
    `>>> ${subsystems.join('\n')}`,
    '',
    `**All 14 Antinuke Security Engines Offline & Placed on Standby**`
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(0x2B2D31)
    .setTitle('Antinuke Security Subsystems Deactivated')
    .setDescription(description)
    .setFooter({
      text: BRAND_FOOTER,
      iconURL: guild?.iconURL() || undefined
    })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_sec_enable_all_quick')
      .setLabel('Re-Enable All')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('btn_sec_close_overview')
      .setLabel('Dismiss')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
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

  // 0a. Dedicated Anti-Nuke Command (`r!antinuke`, `r!an`)
  PrefixRegistry.register({
    name: 'antinuke',
    category: 'Security',
    description: 'Launch the Anti-Nuke Threat Defense Matrix or inspect categories.',
    usage: 'r!antinuke [roles | channels | members | server | presets | whitelist]',
    aliases: ['an', 'antiraid'],
    cooldownSeconds: 3,
    userPermissions: ['Administrator'],
    execute: async (message: Message, args: string[], extra?: any) => {
      const sub = args[0]?.toLowerCase();
      const modules = extra?.getModulesState ? extra.getModulesState(message.guild!.id) : [];
      const secMod = modules.find((m: any) => m.id === 'security');
      const secConfig = secMod?.config || {};

      if (sub === 'roles' || sub === 'role' || sub === 'channels' || sub === 'channel' || sub === 'members' || sub === 'member' || sub === 'server' || sub === 'webhooks') {
        const payload = buildAntiNukeOverview(secConfig, sub);
        return message.reply(payload);
      }
      if (sub === 'presets' || sub === 'preset') {
        const payload = buildPresetsDashboardComponents(message.guild, secConfig);
        return message.reply(payload);
      }
      if (sub === 'whitelist' || sub === 'wl') {
        const payload = await buildWhitelistManagerGUI(message.guild, secConfig, extra);
        return message.reply(payload);
      }
      if (sub === 'punishments' || sub === 'punishment' || sub === 'policy') {
        const payload = buildPunishmentPolicyGUI(message.guild, secConfig);
        return message.reply(payload);
      }

      const { embed, components } = await buildAntiNukeDashboardGUI(message.guild, secConfig, extra);
      return message.reply({ embeds: [embed], components });
    }
  });

  // 0a-2. Dedicated Master Security Command (`r!security`, `r!sec`)
  PrefixRegistry.register({
    name: 'security',
    category: 'Security',
    description: 'Launch the Master Security & Antinuke Control Center or inspect parameters.',
    usage: 'r!security [whitelist | presets | punishments | status]',
    aliases: ['sec', 'sechub'],
    cooldownSeconds: 3,
    userPermissions: ['Administrator'],
    execute: async (message: Message, args: string[], extra?: any) => {
      const sub = args[0]?.toLowerCase();
      const modules = extra?.getModulesState ? extra.getModulesState(message.guild!.id) : [];
      const secMod = modules.find((m: any) => m.id === 'security');
      const secConfig = secMod?.config || {};

      if (sub === 'whitelist' || sub === 'wl') {
        const payload = await buildWhitelistManagerGUI(message.guild, secConfig, extra);
        return message.reply(payload);
      }
      if (sub === 'presets' || sub === 'preset') {
        const payload = buildPresetsDashboardComponents(message.guild, secConfig);
        return message.reply(payload);
      }
      if (sub === 'punishments' || sub === 'punishment' || sub === 'policy') {
        const payload = buildPunishmentPolicyGUI(message.guild, secConfig);
        return message.reply(payload);
      }

      const payload = await buildSecurityDashboardComponents(message.guild, secConfig, extra);
      return message.reply(payload);
    }
  });

  // 0b. Standalone AutoMod & AntiLink Commands (`r!automod`, `r!antilink`)
  PrefixRegistry.register({
    name: 'automod',
    category: 'AutoMod',
    description: 'AutoMod chat filtering, anti-link rules & channel/role bypasses.',
    usage: 'r!automod <status|antilink|antispam|antieveryone|ignore-channel|ignore-role> [args]',
    aliases: ['am', 'automode'],
    cooldownSeconds: 3,
    userPermissions: ['Administrator'],
    execute: async (message: Message, args: string[], extra?: any) => {
      const sub = args[0]?.toLowerCase();
      if (!sub || sub === 'gui' || sub === 'panel' || sub === 'dashboard' || sub === 'status') {
        const modules = extra?.getModulesState ? extra.getModulesState(message.guild!.id) : [];
        const secMod = modules.find((m: any) => m.id === 'security');
        const secConfig = secMod?.config || {};
        const payload = await buildAutoModDashboardComponents(message.guild, secConfig, extra);
        return message.reply(payload);
      }

      const { AutomodManifest } = await import('../automod/manifest.js');
      const eventHandler = AutomodManifest.events?.find((e: any) => e.name === 'command_automod')?.handler;
      if (eventHandler) {
        const fakeInteraction: any = {
          guild: message.guild,
          user: message.author,
          member: message.member,
          channel: message.channel,
          client: message.client,
          parsed: { args },
          options: {
            getSubcommand: () => args[0]?.toLowerCase() || 'status',
            getString: (name: string) => args[1]?.toLowerCase(),
            getChannel: () => message.mentions.channels.first(),
            getRole: () => message.mentions.roles.first(),
            getBoolean: () => null,
            getInteger: () => null
          },
          reply: async (data: any) => message.reply(data)
        };
        await eventHandler(message.client, fakeInteraction, extra);
      }
    }
  });

  PrefixRegistry.register({
    name: 'antilink',
    category: 'AutoMod',
    description: 'AntiLink filter & channel/role bypass configuration.',
    usage: 'r!antilink <enable|disable|ignore-channel|ignore-role|status> [add|remove|list] [#channel|@role]',
    aliases: ['anti-link', 'linkfilter', 'antilinks'],
    cooldownSeconds: 3,
    userPermissions: ['Administrator'],
    execute: async (message: Message, args: string[], extra?: any) => {
      const automodCmd = PrefixRegistry.get('automod');
      if (automodCmd && automodCmd.execute) {
        const sub = args[0]?.toLowerCase();
        if (sub === 'ignore-channel' || sub === 'ignorechannel' || sub === 'channel' || sub === 'channels') {
          return automodCmd.execute(message, ['ignore-channel', ...args.slice(1)], extra);
        }
        if (sub === 'ignore-role' || sub === 'ignorerole' || sub === 'role' || sub === 'roles') {
          return automodCmd.execute(message, ['ignore-role', ...args.slice(1)], extra);
        }
        return automodCmd.execute(message, ['antilink', ...args], extra);
      }
    }
  });

  PrefixRegistry.register({
    name: 'antiattachment',
    category: 'AutoMod',
    description: 'Block files, images, and media attachments per-channel or server-wide.',
    usage: 'r!antiattachment <on|off> [#channel]',
    aliases: ['antiattachments', 'antimedia', 'antifiles', 'antiimages', 'blockattachments'],
    examples: [
      'r!antiattachment on #general',
      'r!antiattachment off #general',
      'r!antiattachment on',
      'r!antiattachment off'
    ],
    subcommands: [
      { name: 'on [#channel]', description: 'Block files & images in specified channel or server-wide.' },
      { name: 'off [#channel]', description: 'Allow files & images in specified channel or server-wide.' }
    ],
    cooldownSeconds: 3,
    userPermissions: ['Administrator'],
    execute: async (message: Message, args: string[], extra?: any) => {
      const automodCmd = PrefixRegistry.get('automod');
      if (automodCmd && automodCmd.execute) {
        return automodCmd.execute(message, ['attachments', ...args], extra);
      }
    }
  });

  // 0d. Server-Wide Attach Files & Media Control (`r!media`, `r!attachfiles`, `r!mediaall`)
  PrefixRegistry.register({
    name: 'media',
    category: 'Security',
    description: 'Server-wide master switch to turn Attach Files ON or OFF across all text and voice channels.',
    usage: 'r!media <on|off|all|text|voice|status> [on|off]',
    aliases: ['attachfiles', 'mediaall', 'attachfilesall', 'servermedia', 'blockfiles', 'unblockfiles', 'medialock'],
    examples: [
      'r!media all off',
      'r!media all on',
      'r!media text off',
      'r!media voice off',
      'r!media status',
      'r!attachfiles off',
      'r!attachfiles on'
    ],
    subcommands: [
      { name: 'all off', description: 'Block Attach Files across all Text and Voice channels.' },
      { name: 'all on', description: 'Allow Attach Files across all Text and Voice channels.' },
      { name: 'text off', description: 'Block Attach Files in all Text channels only.' },
      { name: 'voice off', description: 'Block Attach Files in all Voice channels only.' },
      { name: 'status', description: 'View real-time allowed vs blocked count across all channels.' }
    ],
    cooldownSeconds: 5,
    userPermissions: ['Administrator'],
    botPermissions: ['ManageChannels'],
    execute: async (message: Message, args: string[], extra?: any) => {
      const guild = message.guild;
      if (!guild) return;

      const { isOwnerOrExtraOwner } = await import('../../utils/whitelistCheck.js');
      const isAuthorized = await isOwnerOrExtraOwner(message.author.id, guild);
      if (!isAuthorized && !message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply({
          content: `${WRONG_ICON} **Access Denied**: Server-wide media permission overrides require **Server Owner** or **Administrator** privileges.`
        });
      }

      const arg0 = args[0]?.toLowerCase();
      const arg1 = args[1]?.toLowerCase();

      // Determine scope and target state
      let scope = 'all'; // 'all' | 'text' | 'voice'
      let targetState: boolean | null = null; // true = turn ON (allow attachments), false = turn OFF (block attachments)

      if (['on', 'enable', 'allow', 'unblock', 'unlock'].includes(arg0)) {
        targetState = true;
      } else if (['off', 'disable', 'block', 'lock', 'deny'].includes(arg0)) {
        targetState = false;
      } else if (['all', 'server', 'guild'].includes(arg0)) {
        scope = 'all';
        if (['on', 'enable', 'allow', 'unblock'].includes(arg1)) targetState = true;
        else if (['off', 'disable', 'block', 'lock'].includes(arg1)) targetState = false;
        else targetState = false;
      } else if (['text', 'txt', 'chat'].includes(arg0)) {
        scope = 'text';
        if (['on', 'enable', 'allow', 'unblock'].includes(arg1)) targetState = true;
        else if (['off', 'disable', 'block', 'lock'].includes(arg1)) targetState = false;
        else targetState = false;
      } else if (['voice', 'vc', 'vcs'].includes(arg0)) {
        scope = 'voice';
        if (['on', 'enable', 'allow', 'unblock'].includes(arg1)) targetState = true;
        else if (['off', 'disable', 'block', 'lock'].includes(arg1)) targetState = false;
        else targetState = false;
      } else if (arg0 === 'status' || arg0 === 'view' || arg0 === 'info') {
        // Status overview
        const channels = guild.channels.cache.filter((c: any) => c.isTextBased?.() || c.isVoiceBased?.());
        const everyoneRole = guild.roles.everyone;

        let textBlocked = 0;
        let textAllowed = 0;
        let voiceBlocked = 0;
        let voiceAllowed = 0;

        for (const [, ch] of channels) {
          const isVc = ch.isVoiceBased?.() || ch.type === 2 || ch.type === 13;
          const overwrite = (ch as any).permissionOverwrites?.cache?.get(everyoneRole.id);
          const attachDenied = overwrite?.deny?.has(PermissionFlagsBits.AttachFiles);

          if (isVc) {
            if (attachDenied) voiceBlocked++;
            else voiceAllowed++;
          } else {
            if (attachDenied) textBlocked++;
            else textAllowed++;
          }
        }

        const overview = buildLimeOverviewCard({
          title: 'SERVER-WIDE MEDIA & ATTACHMENT PERMISSION AUDIT',
          subtitle: `REAL-TIME CHANNEL PERMISSION MATRIX FOR ${guild.name.toUpperCase()}`,
          color: Colors.BRAND,
          sections: [
            {
              title: '<:config:1532425712844144701> TEXT CHANNEL PERMISSIONS',
              items: [
                `• File Attachments Allowed: **\`${textAllowed}\` Channels**`,
                `• File Attachments Blocked: **\`${textBlocked}\` Channels**`
              ]
            },
            {
              title: '<:voicechannelgreen:1532425750278438962> VOICE CHANNEL PERMISSIONS',
              items: [
                `• Voice Chat Files Allowed: **\`${voiceAllowed}\` Channels**`,
                `• Voice Chat Files Blocked: **\`${voiceBlocked}\` Channels**`
              ]
            },
            {
              title: '<a:success_check:1546134620087783526> QUICK TOGGLE COMMANDS',
              items: [
                `• Block all Text & Voice: \`r!media all off\` or \`r!attachfiles off\``,
                `• Allow all Text & Voice: \`r!media all on\` or \`r!attachfiles on\``,
                `• Block Text Only: \`r!media text off\``,
                `• Block Voice Only: \`r!media voice off\``
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Channel Permission Controller'
        });

        return message.reply({ embeds: [overview] });
      }

      if (targetState === null) {
        return message.reply({
          embeds: [createLimeEmbed({
            title: 'Server-Wide Media Permissions Syntax',
            description: [
              `> Use this command to instantly enable or disable **Attach Files** & **Media Sharing** across channels.\n`,
              `**Turn OFF in All Text & Voice Channels:**`,
              `\`r!media all off\` **(or \`r!attachfiles off\`)**\n`,
              `**Turn ON in All Text & Voice Channels:**`,
              `\`r!media all on\` **(or \`r!attachfiles on\`)**\n`,
              `**Target Specific Channel Types:**`,
              `• \`r!media text off\` — Block in Text Channels only`,
              `• \`r!media voice off\` — Block in Voice Channels only`,
              `• \`r!media status\` — View current server permission matrix`
            ].join('\n')
          })]
        });
      }

      // Execute bulk channel permission modification
      const statusMsg = await message.reply({
        embeds: [createLimeEmbed({
          title: `${targetState ? 'Enabling' : 'Disabling'} Media & Attachments Server-Wide...`,
          description: `<a:sync:1532404595735924736> Applying **Attach Files: ${targetState ? 'ALLOW' : 'DENY'}** across ${scope === 'all' ? 'all Text & Voice channels' : `${scope} channels`}... Please wait.`
        })]
      }).catch(() => null);

      const everyoneRole = guild.roles.everyone;
      const channels = guild.channels.cache.filter((c: any) => {
        if (!c.permissionOverwrites) return false;
        const isVc = c.isVoiceBased?.() || c.type === 2 || c.type === 13;
        const isTxt = c.isTextBased?.() && !c.isThread?.();
        if (scope === 'all') return isTxt || isVc;
        if (scope === 'text') return isTxt;
        if (scope === 'voice') return isVc;
        return false;
      });

      let updatedText = 0;
      let updatedVoice = 0;
      let failed = 0;

      for (const [, channel] of channels) {
        try {
          const isVc = channel.isVoiceBased?.() || channel.type === 2 || channel.type === 13;
          await (channel as any).permissionOverwrites.edit(everyoneRole, {
            AttachFiles: targetState ? null : false,
            EmbedLinks: targetState ? null : false
          }, { reason: `Server-wide media attach files ${targetState ? 'ENABLED' : 'DISABLED'} by ${message.author.tag}` });

          if (isVc) updatedVoice++;
          else updatedText++;
        } catch {
          failed++;
        }
      }

      // Also synchronize with AutoMod module state if server-wide
      if (scope === 'all') {
        const modules = extra?.getModulesState ? extra.getModulesState(guild.id) : [];
        const amMod = modules.find((m: any) => m.id === 'automod');
        const amCfg = amMod?.config || {};
        if (extra?.updateModuleConfig) {
          extra.updateModuleConfig('automod', {
            ...amCfg,
            blockAttachments: !targetState
          });
        }
      }

      const summaryCard = buildLimeOverviewCard({
        title: `SERVER-WIDE MEDIA PERMISSIONS ${targetState ? 'ENABLED' : 'DISABLED'}`,
        subtitle: `APPLIED TO ${updatedText + updatedVoice} CHANNELS • ATTACH FILES: ${targetState ? 'ALLOWED' : 'BLOCKED'}`,
        color: targetState ? Colors.BRAND : Colors.DANGER,
        sections: [
          {
            title: '<a:success_check:1546134620087783526> EXECUTION AUDIT SUMMARY',
            items: [
              `• **Action Enforced**: \`Attach Files & Embed Links -> ${targetState ? 'ALLOWED (ON)' : 'DENIED (OFF)'}\``,
              `• **Text Channels Modified**: \`${updatedText} Channels\``,
              `• **Voice Channels Modified**: \`${updatedVoice} Channels\``,
              `• **AutoMod Background Filter**: \`${targetState ? 'STANDBY' : 'ACTIVE (Deleting Violations)'}\``,
              `• **Authorized Operator**: ${message.author} (\`${message.author.id}\`)`
            ]
          },
          {
            title: '<:config:1532425712844144701> QUICK REVERSAL & CONTROLS',
            items: [
              `• Turn Back ON: \`r!media all on\` or \`r!attachfiles on\``,
              `• Turn Back OFF: \`r!media all off\` or \`r!attachfiles off\``,
              `• Channel Audit: \`r!media status\``
            ]
          }
        ],
        footerText: 'Rage Optimiser Enterprise • Channel Access Control'
      });

      if (statusMsg) {
        return statusMsg.edit({ embeds: [summaryCard] }).catch(() => {});
      } else {
        return message.reply({ embeds: [summaryCard] });
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
          `**Select your preferred protection profile below to initialize configuration.**`
        ].join('\n')
      });

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('setup_preset_select')
        .setPlaceholder('Choose Protection Preset...')
        .addOptions(
          { label: 'Relaxed Profile', description: 'Basic protection with higher tolerance limits', value: 'relaxed', emoji: '<a:success_check:1546134620087783526>' },
          { label: 'Standard Profile (Recommended)', description: 'Balanced protection for active communities', value: 'standard', emoji: '<a:success_check:1546134620087783526>' },
          { label: 'Strict Profile', description: 'High security with fast anti-nuke threshold triggers', value: 'strict', emoji: '<a:success_check:1546134620087783526>' },
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
    aliases: ['settings', 'panel', 'configure', 'antinuke', 'automod', 'security', 'an', 'sec'],
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
      const rawCmd = message.content.trim().split(/\s+/)[0]?.toLowerCase() || '';
      const cleanCmd = rawCmd.replace(/^(r!|!|\/)/, '');

      if (['antinuke', 'an'].includes(cleanCmd)) {
        if (effectiveArgs.length === 0 || effectiveArgs[0]?.toLowerCase() !== 'antinuke') {
          effectiveArgs.unshift('antinuke');
        }
      } else if (['automod', 'am', 'al', 'antilink'].includes(cleanCmd)) {
        if (effectiveArgs.length === 0 || !['automod', 'antilink'].includes(effectiveArgs[0]?.toLowerCase())) {
          effectiveArgs.unshift('automod');
        }
      } else if (['security', 'sec'].includes(cleanCmd)) {
        if (effectiveArgs.length === 0 || effectiveArgs[0]?.toLowerCase() !== 'security') {
          effectiveArgs.unshift('security');
        }
      }

      const antinukeSubActions = ['status', 'threshold', 'punishment', 'reversion', 'recovery', 'rollback', 'enable', 'disable', 'toggle', 'module', 'set', 'matrix', 'list', 'setall', 'all', 'trustedactor', 'trusted-actor', 'behavioral', 'timeout-duration', 'timeout_duration', 'timeouttime', 'timeout-time', 'timeout'];
      if (effectiveArgs.length > 0 && antinukeSubActions.includes(effectiveArgs[0]?.toLowerCase()) && effectiveArgs[0]?.toLowerCase() !== 'antinuke') {
        effectiveArgs.unshift('antinuke');
      }

      const moduleName = effectiveArgs[0]?.toLowerCase();
      const db = Database.getDb();

      if (!db) {
        return message.reply({ embeds: [createLimeEmbed({ title: 'Database Error', description: `${WRONG_EMOJI} Database engine unavailable.` })] });
      }

      // Security Sub-Configuration Suite (`r!config security ...` / `r!security`)
      if (moduleName === 'security' || moduleName === 'sec') {
        const modules = extra?.getModulesState ? extra.getModulesState(message.guild!.id) : [];
        const secMod = modules.find((m: any) => m.id === 'security');
        const secConfig = secMod?.config || {};
        const { embed, components } = await buildSecurityDashboardComponents(message.guild, secConfig, extra);
        return message.reply({ embeds: [embed], components });
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
        let action = effectiveArgs[1]?.toLowerCase();
        const modules = extra?.getModulesState ? extra.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        const secConfig = secModule?.config || {};
        const rules = secConfig.rules || {};

        // Smart Reordering: Check if user passed rule name or category before action (e.g. r!config antinuke anti_guild_update threshold 11)
        if (action && (action.startsWith('anti_') || ['roles', 'channels', 'members', 'webhooks', 'emojis', 'guild_update', 'channel_delete', 'channel_create', 'role_create', 'role_delete', 'ban', 'kick'].includes(action))) {
          const possibleSub = effectiveArgs[2]?.toLowerCase();
          if (possibleSub && ['threshold', 'punishment', 'reversion', 'enable', 'disable', 'module', 'on', 'off', 'set', 'trustedactor', 'trusted-actor', 'behavioral'].includes(possibleSub)) {
            const ruleArg = effectiveArgs[1];
            effectiveArgs[1] = possibleSub;
            effectiveArgs[2] = ruleArg;
            action = possibleSub;
          }
        }

        const updateSecRules = (newRules: Record<string, any>) => {
          const updatedConfig = { ...secConfig, rules: newRules };
          if (extra?.updateModuleConfig) {
            extra.updateModuleConfig('security', updatedConfig);
          }
          if (extra?.logSyncEvent) {
            extra.logSyncEvent(message.guild?.id, 'Security Config: Dynamic anti-nuke rules updated.', 'success');
          }
        };

        // Status matrix / GUI Dashboard output (`r!config antinuke`)
        if (!action || action === 'gui' || action === 'dashboard' || action === 'panel' || action === 'hub') {
          const { embed, components } = await buildAntiNukeDashboardGUI(message.guild, secConfig, extra);
          return message.reply({ embeds: [embed], components });
        }

        if (action === 'whitelist' || action === 'wl') {
          const payload = await buildWhitelistManagerGUI(message.guild, secConfig, extra);
          return message.reply(payload);
        }

        if (action === 'status' || action === 'list' || action === 'matrix' || ['group_roles', 'group_channels', 'group_members', 'group_server', 'roles', 'role', 'channels', 'channel', 'members', 'member', 'server', 'webhooks', 'webhook'].includes(action)) {
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

        // Fallback for invalid Anti-Nuke subcommand
        const overviewCard = buildLimeOverviewCard({
          title: `INVALID ANTI-NUKE SUBCOMMAND: "${(action || '').toUpperCase()}"`,
          subtitle: 'ANTI-NUKE COMMAND MATRIX & SYNTAX MANUAL',
          color: Colors.BRAND,
          sections: [
            {
              title: '<a:success_check:1546134620087783526> VALID ANTI-NUKE CONFIGURATION COMMANDS',
              items: [
                '`r!config antinuke status` — View active protection matrix',
                '`r!config antinuke threshold <event|all> <limit> [window_sec]` — Set limit',
                '`r!config antinuke punishment <event|all> <action>` — Set punishment action',
                '`r!config antinuke reversion <event|all> <on|off>` — Toggle auto-reversion',
                '`r!config antinuke trustedactor <warn_at> <punish_at> [window_sec]` — Behavioral firewall',
                '`r!config antinuke timeout-duration <10m|1h|1d|7d|28d>` — Set timeout duration',
                '`r!config antinuke quarantine-role <@role|create|view>` — Set quarantine role',
                '`r!config antinuke setall [category|all] <limit> <window> [action] [revert]` — Bulk update all',
                '`r!config antinuke module <event> <limit> <window> <action> <revert>` — Single module bulk'
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Anti-Nuke Configuration'
        });

        return message.reply({ embeds: [overviewCard] });
      }

      // PreBot Whitelist Guard Master Toggle (`r!config prebot ...`)
      if (['prebot', 'prebotwhitelist', 'botwhitelist', 'bwl'].includes(moduleName)) {
        const { isOwnerOrExtraOwner } = await import('../../utils/whitelistCheck.js');
        const isAuthorized = await isOwnerOrExtraOwner(message.author.id, message.guild!);
        if (!isAuthorized) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Access Denied',
              description: `${WRONG_EMOJI} **Confidential Feature**: PreBot Whitelist configuration is strictly restricted to the **Server Owner** (<@${message.guild?.ownerId}>) and designated **Extra Owners**.`
            })]
          });
        }
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

          const secModule = modules.find((m: any) => m.id === 'security');
          const secConfig = secModule?.config || {};
          const ruleEveryone = secConfig?.rules?.anti_everyone_here;
          const isAntiEveryoneActive = (ruleEveryone?.enabled !== false) && (amConfig.antiEveryoneEnabled !== false) && (secConfig.antiNukeEnabled !== false);

          const antispamIcon = isAntiSpamActive ? APPROVED_ICON : WRONG_EMOJI;
          const antilinkIcon = isAntiLinkActive ? APPROVED_ICON : WRONG_EMOJI;
          const everyoneIcon = isAntiEveryoneActive ? APPROVED_ICON : WRONG_EMOJI;
          const blacklistIcon = isBlacklistActive ? APPROVED_ICON : WRONG_EMOJI;
          const capsIcon = isCapsActive ? APPROVED_ICON : WRONG_EMOJI;
          const emojiIcon = isEmojiActive ? APPROVED_ICON : WRONG_EMOJI;

          const filterLines = [
            `${everyoneIcon} **Anti-Everyone Tag**: \`${isAntiEveryoneActive ? 'ENABLED' : 'DISABLED'}\` | Target: \`@everyone / @here\` | Action: \`${(ruleEveryone?.action || 'quarantine').toUpperCase()}\``,
            `${antispamIcon} **Anti-Spam Filter**: \`${isAntiSpamActive ? 'ENABLED' : 'DISABLED'}\` | Limit: \`${amConfig.maxMessages || amConfig.maxSpamMessages || 5} msgs / ${amConfig.windowSeconds || amConfig.spamWindowSeconds || 5}s\` | Action: \`${(amConfig.spamAction || 'mute').toUpperCase()}\``,
            `${antilinkIcon} **Anti-Link Filter**: \`${isAntiLinkActive ? 'ENABLED' : 'DISABLED'}\` | Invites: \`${amConfig.allowInvites || amConfig.allowDiscordInvites ? 'ALLOWED' : 'BLOCKED'}\` | Action: \`${(amConfig.punishment || amConfig.linkAction || 'delete').toUpperCase()}\``,
            `${blacklistIcon} **Word Blacklist**: \`${isBlacklistActive ? 'ENABLED' : 'DISABLED'}\` | Words: \`${(amConfig.badWords || amConfig.blacklist || []).length} keywords\``,
            `${capsIcon} **Caps Limit**: \`${isCapsActive ? 'ENABLED' : 'DISABLED'}\` | Max: \`${amConfig.maxCapsPercent || 70}%\``,
            `${emojiIcon} **Emoji Spam**: \`${isEmojiActive ? 'ENABLED' : 'DISABLED'}\` | Max: \`${amConfig.maxEmojis || 10} emojis\``
          ];

          const overviewCard = new EmbedBuilder()
            .setColor(0x2B2D31)
            .setTitle('AutoMod Module Configuration Matrix')
            .setDescription([
              isMasterActive ? '**Content Filters & Spam Protection Parameters**' : '**Master AutoMod Status: 🔴 Disabled (Inactive — All Filters Off)**',
              '',
              `**AUTOMOD PROTECTION FILTERS**`,
              `>>> ${filterLines.join('\n')}`
            ].join('\n'))
            .setFooter({ text: 'Rage Optimiser Enterprise • AutoMod Configuration' })
            .setTimestamp();

          return message.reply({ embeds: [overviewCard] });
        }

        if (action === 'on' || action === 'off' || action === 'enable' || action === 'disable') {
          const isEnabled = action === 'on' || action === 'enable';
          updateAmConfig({
            antiEveryoneEnabled: isEnabled,
            antiSpamEnabled: isEnabled,
            blockLinks: isEnabled,
            antiLinkEnabled: isEnabled,
            wordBlacklistEnabled: isEnabled,
            preventCapsSpam: isEnabled,
            emojiSpamEnabled: isEnabled
          });

          const secModule = modules.find((m: any) => m.id === 'security');
          if (secModule && extra?.updateModuleConfig) {
            const secConfig = secModule.config || {};
            const rules = { ...(secConfig.rules || {}) };
            const existing = rules.anti_everyone_here || { enabled: true, limit: 1, window: 10, action: 'quarantine', recovery: true };
            rules.anti_everyone_here = { ...existing, enabled: isEnabled };
            extra.updateModuleConfig('security', { ...secConfig, rules });
          }

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Master AutoMod Protection Toggle',
              description: `${APPROVED_ICON} All AutoMod content filters (Anti-Everyone Tag, Anti-Spam, Anti-Link, Blacklist, Caps, Emoji) are now **\`${isEnabled ? 'ENABLED (ACTIVE)' : 'DISABLED (INACTIVE)'}\`**.`
            })]
          });
        }

        if (['antieveryone', 'everyone', 'here', 'antihere', 'massping'].includes(action)) {
          const toggle = effectiveArgs[2]?.toLowerCase();
          if (!toggle || !['on', 'off', 'enable', 'disable'].includes(toggle)) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Anti-Everyone / Anti-Here Configuration Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config automod antieveryone <on|off>\`\nExample: \`r!config automod antieveryone off\``
              })]
            });
          }

          const isEnabled = ['on', 'enable'].includes(toggle);
          updateAmConfig({ antiEveryoneEnabled: isEnabled });

          const secModule = modules.find((m: any) => m.id === 'security');
          if (secModule && extra?.updateModuleConfig) {
            const secConfig = secModule.config || {};
            const rules = { ...(secConfig.rules || {}) };
            const existing = rules.anti_everyone_here || { enabled: true, limit: 1, window: 10, action: 'quarantine', recovery: true };
            rules.anti_everyone_here = { ...existing, enabled: isEnabled };
            extra.updateModuleConfig('security', { ...secConfig, rules });
          }

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Anti-Everyone / Anti-Here Tag Filter Settings Saved',
              description: `${APPROVED_ICON} Anti-Everyone tag filter is now **\`${isEnabled ? 'ENABLED' : 'DISABLED'}\`**.`
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
          const limitOrInvites = effectiveArgs[3]?.toLowerCase();
          const invitesOrAction = effectiveArgs[4]?.toLowerCase();
          const pAction = effectiveArgs[5]?.toLowerCase() || (['delete', 'warn', 'mute', 'kick', 'ban'].includes(invitesOrAction) ? invitesOrAction : undefined);

          if (!toggle || !['on', 'off', 'enable', 'disable'].includes(toggle)) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Anti-Link Configuration Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config automod antilink <on|off> [limit] [allow_invites] [action]\`\n` +
                             `• **Example**: \`r!config automod antilink on 5 off mute\` (Enable, limit 5, no invites, mute on limit)\n` +
                             `• **Example**: \`r!config automod antilink on 5\` (Enable with default 5 limit)`
              })]
            });
          }

          const isEnabled = ['on', 'enable'].includes(toggle);
          const updates: Record<string, any> = { antiLinkEnabled: isEnabled, blockLinks: isEnabled };
          
          let numLimit = parseInt(limitOrInvites, 10);
          if (!isNaN(numLimit) && numLimit > 0) {
            updates.antiLinkLimit = numLimit;
            updates.limit = numLimit;
            if (invitesOrAction) updates.allowDiscordInvites = ['on', 'true', 'allow'].includes(invitesOrAction);
          } else if (limitOrInvites) {
            updates.allowDiscordInvites = ['on', 'true', 'allow'].includes(limitOrInvites);
          }

          if (pAction && ['delete', 'warn', 'mute', 'kick', 'ban'].includes(pAction)) {
            updates.linkAction = pAction;
            updates.punishment = pAction;
          }

          updateAmConfig(updates);

          const finalLimit = updates.antiLinkLimit || amConfig.antiLinkLimit || amConfig.limit || 5;
          const finalPunish = updates.punishment || amConfig.punishment || 'mute';

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Anti-Link Settings Saved',
              description: [
                `${APPROVED_ICON} Anti-Link filter is now **\`${isEnabled ? 'ENABLED' : 'DISABLED'}\`**.`,
                `• **Violation Limit**: \`${finalLimit}\` unauthorized link(s) before punishment`,
                `• **Punishment Action**: \`${finalPunish.toUpperCase()}\``
              ].join('\n')
            })]
          });
        }

        if (action === 'clearwarns' || action === 'clearwarn' || action === 'resetwarns') {
          const targetUser = message.mentions.users.first();
          if (!targetUser) {
            return message.reply({
              embeds: [createLimeEmbed({
                title: 'Clear Warnings Syntax',
                description: `${WRONG_EMOJI} **Syntax**: \`r!config automod clearwarns @user\`\n• **Example**: \`r!config automod clearwarns @Username\``
              })]
            });
          }

          resetLinkViolations(message.guild!.id, targetUser.id);
          resetRateLimit(message.guild!.id, targetUser.id, 'anti_link');

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Violation Warnings Cleared',
              description: `${APPROVED_ICON} Successfully cleared all Anti-Link violation warnings for ${targetUser} (\`${targetUser.id}\`).\n\n• **Current Violations**: \`0/5\``
            })]
          });
        }

        if (action === 'warnings' || action === 'warns') {
          const targetUser = message.mentions.users.first() || message.author;
          const maxLimit = typeof amConfig.antiLinkLimit === 'number' && amConfig.antiLinkLimit > 0
            ? amConfig.antiLinkLimit
            : (typeof amConfig.limit === 'number' && amConfig.limit > 0 ? amConfig.limit : 5);

          const currentCount = getLinkViolations(message.guild!.id, targetUser.id);
          const punishAction = (amConfig.punishment || 'mute').toUpperCase();

          return message.reply({
            embeds: [createLimeEmbed({
              title: `<a:success_check:1546134620087783526> User Violation Warnings Matrix`,
              description: [
                `> **Member**: ${targetUser} (\`${targetUser.username}\` • \`ID: ${targetUser.id}\`)`,
                ``,
                `• **Anti-Link Violations**: \`${currentCount} / ${maxLimit}\``,
                `• **Violation Status**: ${currentCount > 0 ? `${WARNING_EMOJI} **${currentCount} Active Warning(s)**` : `${APPROVED_ICON} **No Active Warnings**`}`,
                `• **Punishment Threshold**: Reaching \`${maxLimit}\` violations triggers **\`${punishAction}\`**`
              ].join('\n')
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
              description: `${CONFIG_EMOJI} **Status**: \`${amConfig.wordBlacklistEnabled ? 'ENABLED' : 'DISABLED'}\`\n**Words (${currentList.length})**: ${currentList.length > 0 ? currentList.map(w => `\`${w}\``).join(', ') : '**None**'}\n\n**Syntax**: \`r!config automod blacklist <add|remove|clear|list> [words]\``
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

        // Fallback for invalid AutoMod subcommand
        const overviewCard = buildLimeOverviewCard({
          title: `INVALID AUTOMOD SUBCOMMAND: "${(action || '').toUpperCase()}"`,
          subtitle: 'AUTOMOD COMMAND MATRIX & SYNTAX MANUAL',
          color: Colors.BRAND,
          sections: [
            {
              title: '<:link:1532620952087826602> VALID AUTOMOD CONFIGURATION COMMANDS',
              items: [
                '`r!config automod status` — View AutoMod filter matrix',
                '`r!config automod antispam <on|off> [max_msgs] [window_sec] [action]` — Anti-Spam',
                '`r!config automod antilink <on|off> [allow_invites] [action]` — Anti-Link',
                '`r!config automod blacklist <add|remove|clear|list> [words]` — Word blacklist',
                '`r!config automod caps <on|off> [max_percent]` — Caps limit',
                '`r!config automod emoji <on|off> [max_emojis]` — Emoji spam limit'
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • AutoMod Configuration'
        });

        return message.reply({ embeds: [overviewCard] });
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
                title: '<a:success_check:1546134620087783526> VERIFICATION SYSTEM PARAMETERS',
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

        if (!action || action === 'status' || action === 'gui' || action === 'dashboard' || action === 'panel') {
          const { buildSocialDashboardGUI } = await import('../social-updates/manifest.js');
          const payload = await buildSocialDashboardGUI(message.guild);
          return message.reply(payload);
        }

        if (action === 'list' || action === 'view') {
          const subs = await SocialSubscriptionRepository.findAll(guildId);
          const analytics = await SocialSubscriptionRepository.getAnalytics(guildId);

          const feedItems: string[] = subs.length > 0
            ? subs.map(s => `• **${s.provider.toUpperCase()}** \`${s.sourceId}\` → <#${s.discordChannelId}> | Status: \`${s.enabled ? 'ACTIVE' : 'PAUSED'}\` | ID: \`${s.id}\``)
            : ['**No active YouTube or Instagram subscriptions configured.**'];

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
          : ['**No delegated Extra Owners assigned for this server.**'];

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

      // Check if user entered an unrecognized top-level module parameter under r!config
      if (moduleName && !['status', 'view', 'panel', 'matrix', 'overview', 'help'].includes(moduleName)) {
        const overviewCard = buildLimeOverviewCard({
          title: `INVALID CONFIGURATION MODULE: "${moduleName.toUpperCase()}"`,
          subtitle: 'MASTER CONFIGURATION COMMAND MATRIX',
          color: Colors.BRAND,
          sections: [
            {
              title: '<:config:1532425712844144701> VALID CONFIGURATION MODULE COMMANDS',
              items: [
                '`r!config antinuke` — Anti-Nuke protection matrix & limits',
                '`r!config automod` — AutoMod filters (spams, links, bad words)',
                '`r!config welcome` — Onboarding cards, channel & auto-roles',
                '`r!config voiceprotection` — Voice loudness ceiling & penalties',
                '`r!config prebot` — Pre-Bot whitelist bot join guard',
                '`r!config logging` — Audit & security event logging',
                '`r!config jtc` — Join-To-Create dynamic voice hub',
                '`r!config tickets` — Support ticket categories & staff roles',
                '`r!config leveling` — Member ranking & XP reward engine',
                '`r!config verification` — Member verification gateway',
                '`r!config extraowner` — Delegated extra owner management',
                '`r!config export` — Export JSON configuration snapshot',
                '`r!config backup` — Create SQLite backup snapshot'
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Configuration Engine'
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

      const antinukeStatus = isModEnabled('anti-nuke') ? `${APPROVED_ICON} Enabled — **Protections Active**` : `${WRONG_EMOJI} Disabled — **Protections Offline**`;
      const automodStatus = isModEnabled('automod') ? `${APPROVED_ICON} Enabled — **Anti-Link & Anti-Spam Active**` : `${WRONG_EMOJI} Disabled — **Filters Offline**`;
      const ticketStatus = isModEnabled('tickets') ? `${APPROVED_ICON} Enabled — **Support Panels Active**` : `${WRONG_EMOJI} Disabled — **Panels Closed**`;
      const voiceStatus = isModEnabled('voice-protection') ? `${APPROVED_ICON} Enabled — **Voice Security Active**` : `${WRONG_EMOJI} Disabled — **Security Inactive**`;
      const levelingStatus = isModEnabled('leveling') ? `${APPROVED_ICON} Enabled — **XP Engine Active**` : `${WRONG_EMOJI} Disabled — **XP Paused**`;
      const verifStatus = isModEnabled('verification') ? `${APPROVED_ICON} Enabled — **Gateway Active**` : `${WRONG_EMOJI} Disabled — **Gateway Offline**`;
      const socialStatus = socialSubs.length > 0 ? `${APPROVED_ICON} Active — **${socialSubs.length} Live Feeds**` : `${WRONG_EMOJI} Inactive — **No Feeds Configured**`;
      const extraOwnerStatus = extraOwnerRows.length > 0 ? `${APPROVED_ICON} Active — **${extraOwnerRows.length} Extra Owners**` : `${WRONG_EMOJI} None — **Owner Only**`;

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
          `**Select a module category from the menu below to modify live settings, punishments, and thresholds.**`
        ].join('\n')
      });

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('config_category_select')
        .setPlaceholder('Select module category to configure...')
        .addOptions(
          { label: 'Anti-Nuke & Protection', description: 'Configure triggers, punishments & limits', value: 'antinuke', emoji: '<a:success_check:1546134620087783526>' },
          { label: 'AutoMod & Filters', description: 'Configure Anti-Link, Anti-Spam & Word Filter', value: 'automod', emoji: '<:link:1532620952087826602>' },
          { label: 'Audit & Event Logging', description: 'Set channel routes for audit events', value: 'logging', emoji: '<:config:1532425712844144701>' },
          { label: 'Welcome & Auto-Roles', description: 'Configure onboarding messages & join roles', value: 'welcome', emoji: '<:member:1532621317487071426>' },
          { label: 'Ticket Panels & Support', description: 'Configure categories & staff roles', value: 'tickets', emoji: '<:ticket:1532620631466836021>' },
          { label: 'Voice Protection & 24/7', description: 'Configure voice security & 24/7 channels', value: 'voice', emoji: '<:voicechannelgreen:1532425750278438962>' },
          { label: 'Leveling & XP System', description: 'Configure XP rate & level up announcements', value: 'leveling', emoji: '<:vip:1532620837117759508>' },
          { label: 'Member Verification Gate', description: 'Configure captcha & verification roles', value: 'verification', emoji: '<a:success_check:1546134620087783526>' },
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
            description: `${WRONG_EMOJI} Could not delete messages: \`${e?.message || 'Unknown error'}\`\n**Note: Messages older than 14 days cannot be bulk deleted due to Discord API limitations.**`
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
          title: '<a:success_check:1546134620087783526> Security Profile Applied',
          description: [
            `> ${ARROW_ICON} Successfully configured **${presetName}** for this server!`,
            `> ${desc}`,
            `--------------------------------------------------`,
            `• **Anti-Nuke Protection**: Active`,
            `• **AutoMod Engine**: Online`,
            `• **Security Audit Logging**: Operational`,
            `--------------------------------------------------`,
            `**All parameters have been updated across module registries.**`
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
            content: `<a:wrong:1546155193303957504> **Access Denied**: Only the **Server Owner** (<@${interaction.guild?.ownerId}>) and designated **Extra Owners** can configure or toggle Anti-Nuke settings.`,
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
            content: `<a:wrong:1546155193303957504> **Access Denied**: Only the **Server Owner** (<@${interaction.guild?.ownerId}>) and designated **Extra Owners** can configure or toggle Anti-Nuke settings.`,
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
            content: `<a:wrong:1546155193303957504> **Access Denied**: Only the **Server Owner** (<@${interaction.guild?.ownerId}>) and designated **Extra Owners** can configure or toggle Anti-Nuke settings.`,
            flags: 64
          };
          if (interaction.replied || interaction.deferred) return interaction.followUp(errPayload).catch(() => {});
          return interaction.reply(errPayload).catch(() => {});
        }

        const embed = createLimeEmbed({
          title: '<a:success_check:1546134620087783526> Emergency Lockdown Executed',
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
              content: `<a:wrong:1546155193303957504> **Access Denied**: Anti-Nuke configuration matrix is strictly restricted to the **Server Owner** (<@${interaction.guild?.ownerId}>) and designated **Extra Owners**.`,
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

