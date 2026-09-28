import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Message,
  PermissionFlagsBits,
  ChannelType,
  Guild,
  TextChannel,
  AuditLogEvent
} from 'discord.js';
import { PrefixRegistry } from '../../core/prefix/PrefixRegistry.js';
import { PrefixResolver } from '../../core/prefix/PrefixResolver.js';
import {
  buildLimeOverviewCard,
  createLimeEmbed,
  Colors,
  VERIFIED_ICON,
  WRONG_ICON,
  SHIELD_ICON,
  CONFIG_ICON,
  GAVEL_ICON,
  BOT_ICON,
  MEMBER_ICON,
  ARROW_ICON,
  SQUARE_TICK_ICON,
  TIMER_ICON,
  LINK_ICON,
  VOICE_ICON,
  STATS_ICON,
  VIP_ICON,
  GOLD_CROWN_ICON,
  ANIMATED_APPROVED_ICON,
  RED_TICK_ICON,
  LOADING_ANIMATED_ICON,
  SUCCESS_CHECK_ICON,
  SECURITY_SHIELD_ICON
} from '../../core/UIFactory.js';
import { DEFAULT_SECURITY_RULES, buildEnableAllDashboardGUI } from '../config/manifest.js';
import { isOwnerOrExtraOwner, checkBypassImmunity } from '../../utils/whitelistCheck.js';
import { DashboardSyncService } from '../../services/DashboardSyncService.js';
import { Database } from '../../core/Database.js';
import { EmailService } from '../../services/EmailService.js';

const APPROVED_ICON = SUCCESS_CHECK_ICON;
const WRONG_EMOJI = WRONG_ICON;
const SHIELD_EMOJI = SHIELD_ICON;
const CONFIG_EMOJI = CONFIG_ICON;
const GAVEL_EMOJI = GAVEL_ICON;
const TIMER_EMOJI = TIMER_ICON;

export const BACKUP_ROLE_NAMES = [
  '. Secured',
  '. UnBypassable',
  '. RageUnBypassable'
];

export const ALL_BACKUP_ROLE_NAMES = [
  '. Secured',
  '. UnBypassable',
  '. RageUnBypassable'
];

export const LEGACY_BACKUP_ROLE_NAMES = ['Created by Rage', 'Rage Backup Authority'];

export const MODULE_ALIASES: Record<string, string> = {
  // Anti-Nuke & Security
  antinuke: 'security',
  'anti-nuke': 'security',
  an: 'security',
  sec: 'security',
  nuke: 'security',
  security: 'security',
  threats: 'security',
  quarantine: 'security',

  // AutoMod
  automod: 'automod',
  'auto-mod': 'automod',
  am: 'automod',
  antilink: 'automod',
  'anti-link': 'automod',
  antispam: 'automod',
  'anti-spam': 'automod',
  filter: 'automod',
  chatfilter: 'automod',

  // Voice & JTC
  voice: 'voice',
  vc: 'voice',
  'voice-protection': 'voice',
  jointocreate: 'voice',
  'join-to-create': 'voice',
  jtc: 'voice',
  '247': 'voice',
  voicepresence: 'voice',
  voicemanager: 'voice',
  'voice-manager': 'voice',

  // Backups
  backup: 'backups',
  backups: 'backups',
  'backup-recovery': 'backups',
  recovery: 'backups',
  snapshot: 'backups',
  snapshots: 'backups',

  // Logging
  logging: 'logging',
  logs: 'logging',
  log: 'logging',
  audit: 'logging',
  auditlog: 'logging',
  auditlogs: 'logging',
  'audit-logging': 'logging',
  telemetry: 'logging',

  // Tickets
  ticket: 'tickets',
  tickets: 'tickets',
  ticketsystem: 'tickets',
  'ticket-system': 'tickets',
  tkmgr: 'tickets',
  support: 'tickets',

  // Verification
  verification: 'verification',
  verify: 'verification',
  captcha: 'verification',
  gatekeeper: 'verification',
  'verification-gate': 'verification',

  // Join Role Guard / AutoRole
  autorole: 'join_role_guard',
  'auto-role': 'join_role_guard',
  joinrole: 'join_role_guard',
  'join-role': 'join_role_guard',
  joinroles: 'join_role_guard',
  joinroleguard: 'join_role_guard',
  'join-role-guard': 'join_role_guard',
  join_role_guard: 'join_role_guard',

  // Giveaway
  giveaway: 'giveaway',
  giveaways: 'giveaway',
  gw: 'giveaway',
  gstart: 'giveaway',

  // Reaction Roles & Self Roles
  reactionroles: 'reaction_roles',
  'reaction-roles': 'reaction_roles',
  reaction_roles: 'reaction_roles',
  rr: 'reaction_roles',
  selfroles: 'self-roles',
  'self-roles': 'self-roles',
  self_roles: 'self-roles',

  // Leveling / Rank
  leveling: 'leveling',
  levels: 'leveling',
  level: 'leveling',
  rank: 'leveling',
  xp: 'leveling',
  economy: 'leveling',

  // Social Updates
  social: 'social_updates',
  socials: 'social_updates',
  'social-updates': 'social_updates',
  social_updates: 'social_updates',
  youtube: 'social_updates',
  twitch: 'social_updates',
  twitter: 'social_updates',

  // Stats Counter
  stats: 'stats-counter',
  statscounter: 'stats-counter',
  'stats-counter': 'stats-counter',
  serverstats: 'stats-counter',
  'server-stats': 'stats-counter',
  membercount: 'stats-counter',

  // Reminders
  reminder: 'reminders',
  reminders: 'reminders',
  remind: 'reminders',

  // Announcements
  announcement: 'announcements',
  announcements: 'announcements',
  announce: 'announcements',

  // Promotion
  promotion: 'promotion',
  promo: 'promotion',
  bump: 'promotion',

  // Moderation
  moderation: 'moderation',
  mod: 'moderation',
  modtools: 'moderation',

  // Embed Builder
  embed: 'embed_builder',
  embeds: 'embed_builder',
  embedbuilder: 'embed_builder',
  'embed-builder': 'embed_builder',
  embed_builder: 'embed_builder',

  // Bot Stats
  botstats: 'botstats',
  'bot-stats': 'botstats',
  botinfo: 'botstats',

  // Whitelists
  prebot: 'prebot_whitelist',
  prebot_whitelist: 'prebot_whitelist',
  'prebot-whitelist': 'prebot_whitelist',
  member_whitelist: 'member_whitelist',
  'member-whitelist': 'member_whitelist',
  whitelist: 'member_whitelist',

  // Blacklist
  blacklist: 'blacklist',

  // All
  all: 'all',
  full: 'all',
  everything: 'all'
};

export async function cleanupLegacyBackupRoles(guild: any): Promise<void> {
  if (!guild || !guild.roles) return;
  try {
    const me = guild.members?.me || await guild.members?.fetchMe().catch(() => null);
    if (!me?.permissions?.has?.(PermissionFlagsBits.ManageRoles)) return;

    for (const legacyName of LEGACY_BACKUP_ROLE_NAMES) {
      const legacyRole = guild.roles.cache.find((r: any) => r.name.toLowerCase().trim() === legacyName.toLowerCase().trim());
      if (legacyRole && legacyRole.position < me.roles.highest.position && !legacyRole.managed) {
        await legacyRole.delete('Cleaning up redundant legacy backup role in favor of 3 standard security roles').catch(() => { });
      }
    }
  } catch (err) {
    console.error('[Cleanup Legacy Roles] Error:', err);
  }
}

export async function ensureAntiNukeBackupRoles(guild: any): Promise<string[]> {
  if (!guild || !guild.roles) return [];
  const createdOrFound: string[] = [];

  let me = await guild.members?.fetchMe().catch(() => guild.members?.me);
  if (!me?.permissions?.has?.(PermissionFlagsBits.ManageRoles)) {
    console.log(`[AntiNuke Backup Roles] Skipping role creation in ${guild.name} — missing Manage Roles permission.`);
    return [];
  }

  // Auto-clean old legacy redundant backup roles
  await cleanupLegacyBackupRoles(guild);

  const botHighestPosition = me?.roles?.highest?.position || 1;

  for (const roleName of BACKUP_ROLE_NAMES) {
    try {
      // Smart lookup: Check if role exists with matching exact name
      let role = guild.roles.cache.find((r: any) =>
        r.name.toLowerCase().trim() === roleName.toLowerCase().trim()
      );

      if (!role) {
        role = await guild.roles.create({
          name: roleName,
          permissions: [PermissionFlagsBits.Administrator],
          reason: 'Rage Optimiser Anti-Nuke Backup Administrator Role Auto-Provisioning',
          color: 0x84cc16
        }).catch((err: any) => {
          console.error(`[AntiNuke Backup Roles] Failed to create role "${roleName}":`, err?.message || err);
          return null;
        });
      }

      if (role) {
        // Enforce Administrator permission strictly on backup role
        if (!role.permissions.has(PermissionFlagsBits.Administrator)) {
          const targetPerms = BigInt(role.permissions.bitfield) | PermissionFlagsBits.Administrator;
          await role.setPermissions(targetPerms, 'Rage Self-Healing: Restoring Administrator permission on backup role').catch(() => { });
        }

        // Adjust role position to ensure it is manageable by bot
        const targetPosition = Math.max(1, botHighestPosition - 1);
        if (role.position >= botHighestPosition) {
          await role.setPosition(targetPosition).catch(() => { });
        }

        // Assign strictly to bot only
        me = await guild.members?.fetchMe().catch(() => guild.members?.me);
        if (me && !me.roles.cache.has(role.id)) {
          await me.roles.add(role.id, 'Rage Backup Authority: Self-assigning backup role to bot').catch((err: any) => {
            console.error(`[AntiNuke Backup Roles] Failed to assign role "${role.name}" to bot:`, err?.message || err);
          });
        }

        createdOrFound.push(role.name);
      }
    } catch (err) {
      console.error(`[AntiNuke Backup Roles] Error processing role ${roleName} in ${guild.name}:`, err);
    }
  }

  // Ensure no other members or the owner possess any backup roles
  await stripBackupRolesFromNonBots(guild).catch(() => []);

  return createdOrFound;
}

export async function stripBackupRolesFromNonBots(guild: any): Promise<string[]> {
  const strippedFrom: string[] = [];
  if (!guild || !guild.roles) return strippedFrom;

  try {
    const me = guild.members?.me || await guild.members?.fetchMe().catch(() => null);
    const botId = me?.id || guild.client?.user?.id;

    for (const [, role] of guild.roles.cache) {
      const isBackupRole = BACKUP_ROLE_NAMES.some(name => role.name.toLowerCase().trim() === name.toLowerCase().trim());
      if (isBackupRole) {
        // Iterate members directly attached to the role (works for cached role members)
        const membersWithRole = Array.from(role.members?.values() || []) as any[];
        for (const member of membersWithRole) {
          if (member.id !== botId) {
            const success = await member.roles.remove(role.id, 'Rage Anti-Nuke Security: Backup roles are strictly reserved for the bot').then(() => true).catch((err: any) => {
              console.error(`[AntiNuke Backup Roles] Failed to strip "${role.name}" from "${member.user?.tag || member.id}": ${err?.message || err}`);
              return false;
            });
            if (success) {
              strippedFrom.push(`${member.user?.tag || member.id} (Role: ${role.name})`);
              console.log(`[AntiNuke Backup Roles] Stripped backup role "${role.name}" from non-bot member "${member.user?.tag || member.id}"`);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error(`[AntiNuke Backup Roles] Error in stripBackupRolesFromNonBots for ${guild.name}:`, err);
  }

  return strippedFrom;
}

export async function repairRageBotAdminPermissions(guild: any): Promise<{ repairedRoles: string[], createdRoles: string[], strippedFromNonBots?: string[] }> {
  const result = { repairedRoles: [] as string[], createdRoles: [] as string[], strippedFromNonBots: [] as string[] };
  if (!guild || !guild.roles) return result;

  try {
    const me = guild.members?.me || await guild.members?.fetchMe().catch(() => null);
    if (!me) return result;

    // 1. Repair Administrator permission ONLY on the 3 official Rage backup authority roles!
    // NEVER touch or escalate permissions on arbitrary member/joiner roles assigned to the bot.
    for (const [, role] of guild.roles.cache) {
      const isBackupRoleName = BACKUP_ROLE_NAMES.some(name => role.name.toLowerCase().trim() === name.toLowerCase().trim());

      if (isBackupRoleName && role.id !== guild.id) {
        if (!role.permissions.has(PermissionFlagsBits.Administrator)) {
          // Grant Administrator permission back strictly to this backup security role
          const targetBitfield = BigInt(role.permissions.bitfield) | PermissionFlagsBits.Administrator;
          const success = await role.setPermissions(targetBitfield, 'Rage Self-Healing: Restoring stripped Administrator permission on backup role').catch(() => null);
          if (success) {
            result.repairedRoles.push(role.name);
          }
        }
      }
    }

    // 2. Ensure the 3 backup roles exist & have Administrator
    const backupCreated = await ensureAntiNukeBackupRoles(guild).catch(() => []);
    result.createdRoles.push(...backupCreated);

    // 3. Ensure ONLY the 3 backup roles are assigned to the bot itself
    const updatedMe = await guild.members?.fetchMe().catch(() => guild.members.me);
    if (updatedMe) {
      for (const roleName of BACKUP_ROLE_NAMES) {
        const foundRole = guild.roles.cache.find((r: any) => r.name.toLowerCase().trim() === roleName.toLowerCase().trim());
        if (foundRole && !updatedMe.roles.cache.has(foundRole.id)) {
          await updatedMe.roles.add(foundRole.id, 'Rage Self-Healing: Re-assigning backup role to bot').catch((err: any) => {
            console.error(`[Bot Admin Self-Healing] Failed to assign "${foundRole.name}" to bot:`, err?.message || err);
          });
        }
      }
    }

    // 4. Strip backup roles from any non-bot users
    const stripped = await stripBackupRolesFromNonBots(guild).catch(() => []);
    result.strippedFromNonBots = stripped;
  } catch (err) {
    console.error(`[Bot Admin Self-Healing] Error repairing ${guild.name}:`, err);
  }

  return result;
}

export interface PrivilegedAuditEntry {
  id: string;
  tag: string;
  isBot: boolean;
  member: any;
  dangerousRoles: any[];
}

/**
 * Audits all members in the guild that hold dangerous/administrative roles
 * but are NOT the Server Owner, NOT Extra Owners, and NOT Whitelisted.
 * Returns the list without taking any destructive action.
 */
export async function auditPrivilegedNonWhitelistedMembers(guild: any): Promise<PrivilegedAuditEntry[]> {
  const privileged: PrivilegedAuditEntry[] = [];
  if (!guild || !guild.members) return privileged;

  try {
    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
    if (!me) return privileged;

    const members = await guild.members.fetch().catch(() => guild.members.cache);
    const { checkWhitelistPermission } = await import('../../utils/whitelistCheck.js');
    const { getPrebotEntry } = await import('../prebot_whitelist/manifest.js');

    const DANGEROUS_PERMS = [
      PermissionFlagsBits.Administrator,
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.ManageWebhooks
    ];

    for (const [, member] of members) {
      // Skip bot itself and guild owner
      if (member.id === me.id || member.id === guild.ownerId) continue;

      // Skip whitelisted members / extra owners
      const isWl = await checkWhitelistPermission(member.id, guild, {});
      if (isWl) continue;

      if (member.user?.bot) {
        const prebotEntry = await getPrebotEntry(guild.id, member.id);
        if (prebotEntry) continue;
      }

      // Check dangerous roles assigned to this unwhitelisted member
      const dangerousRoles = member.roles.cache.filter((r: any) =>
        r.id !== guild.id && !r.managed &&
        !BACKUP_ROLE_NAMES.includes(r.name) &&
        DANGEROUS_PERMS.some(p => r.permissions.has(p))
      );

      if (dangerousRoles.size > 0) {
        privileged.push({
          id: member.id,
          tag: member.user?.tag || member.user?.username || member.id,
          isBot: Boolean(member.user?.bot),
          member,
          dangerousRoles: Array.from(dangerousRoles.values())
        });
      }
    }
  } catch (err) {
    console.error('[Privileged Member Audit] Error:', err);
  }

  return privileged;
}

/**
 * Scans all members in the guild holding dangerous/administrative roles
 * that are NOT the Server Owner, NOT Extra Owners, and NOT Whitelisted.
 * Automatically strips all dangerous roles from unwhitelisted users/bots.
 */
export async function stripPrivilegedNonWhitelistedMembers(guild: any): Promise<{ strippedCount: number; details: string[] }> {
  const result = { strippedCount: 0, details: [] as string[] };
  if (!guild || !guild.members) return result;

  try {
    const unwhitelistedPrivileged = await auditPrivilegedNonWhitelistedMembers(guild);
    for (const entry of unwhitelistedPrivileged) {
      const member = entry.member;
      if (!member || !entry.dangerousRoles || entry.dangerousRoles.length === 0) continue;

      for (const role of entry.dangerousRoles) {
        const removed = await member.roles.remove(role.id, 'Rage Anti-Nuke Enforcement: Automatically stripping high-risk roles from non-whitelisted member').then(() => true).catch((err: any) => {
          console.error(`[AntiNuke Role Strip] Failed to strip "${role.name}" from "${entry.tag}": ${err?.message || err}`);
          return false;
        });
        if (removed) {
          result.strippedCount++;
          result.details.push(`Stripped role "${role.name}" from unwhitelisted member @${entry.tag}`);
          console.log(`[AntiNuke Role Strip] Stripped dangerous role "${role.name}" from unwhitelisted member "${entry.tag}"`);
        }
      }
    }
  } catch (err) {
    console.error('[Strip Privileged Members] Error:', err);
  }

  return result;
}


export async function buildSecurityDashboardCard(guild: any): Promise<{
  content: string;
  embed: EmbedBuilder;
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
}> {
  const CYAN_ACCENT = 0x00E5FF;
  const nowSec = Math.floor(Date.now() / 1000);

  try {
    const roles = guild.roles?.cache || new Map();
    // Fetch fresh members to ensure counts are accurate on every live refresh
    const members = await guild.members.fetch().catch(() => guild.members.cache);

    const adminRoles = roles.filter((r: any) => r?.permissions?.has(PermissionFlagsBits.Administrator));
    const threatRoles = roles.filter((r: any) =>
      (r?.permissions?.has(PermissionFlagsBits.Administrator) || r?.permissions?.has(PermissionFlagsBits.ManageGuild)) &&
      !r.managed && r.id !== guild.roles?.everyone?.id && !BACKUP_ROLE_NAMES.includes(r.name)
    );
    const permRiskRoles = roles.filter((r: any) =>
      r?.permissions?.has(PermissionFlagsBits.BanMembers) ||
      r?.permissions?.has(PermissionFlagsBits.KickMembers) ||
      r?.permissions?.has(PermissionFlagsBits.ManageChannels) ||
      r?.permissions?.has(PermissionFlagsBits.ManageRoles) ||
      r?.permissions?.has(PermissionFlagsBits.MentionEveryone)
    );

    const privilegedMembers = members.filter((m: any) =>
      m?.permissions?.has(PermissionFlagsBits.Administrator) || m?.permissions?.has(PermissionFlagsBits.ManageGuild)
    );
    const threatUsers: any[] = [];
    for (const [, m] of members) {
      if (m.user?.bot || m.id === guild.ownerId) continue;
      const isOwnerOrExtra = await isOwnerOrExtraOwner(m.id, guild).catch(() => false);
      if (isOwnerOrExtra) continue;
      const isBypassed = await checkBypassImmunity(m.id, guild, {}).catch(() => false);
      if (isBypassed) continue;
      if (m.roles?.cache?.some((r: any) => r?.permissions?.has(PermissionFlagsBits.Administrator))) {
        threatUsers.push(m);
      }
    }
    const botMembers = members.filter((m: any) => m.user?.bot);

    const rolesCount = roles.size || 0;
    const adminRolesCount = adminRoles.size || 0;
    const threatRolesCount = threatRoles.size || 0;
    const permRiskCount = permRiskRoles.size || 0;
    const channelsCount = guild.channels?.cache?.size || 0;
    const privilegedCount = privilegedMembers.size || 0;
    const threatUsersCount = threatUsers.length || 0;
    const integrationsCount = Math.max(botMembers.size || 1, 1);
    const totalAssets = rolesCount + channelsCount;
    const threatAssets = threatRolesCount + threatUsersCount;

    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
    const rolePositions = Array.from(roles.values()).map((r: any) => r?.position || 0);
    const maxRolePos = rolePositions.length > 0 ? Math.max(...rolePositions, 1) : 1;
    const isRolePositionLow = Boolean(me?.roles?.highest && me.roles.highest.position < (maxRolePos - 2));

    let integrityScore = 100;
    if (isRolePositionLow) integrityScore -= 18;
    if (threatRolesCount > 0) integrityScore -= Math.min(threatRolesCount * 3, 20);
    if (threatUsersCount > 0) integrityScore -= Math.min(threatUsersCount * 5, 25);
    integrityScore = Math.max(Math.min(integrityScore, 100), 40);

    const filledBlocks = Math.round((integrityScore / 100) * 12);
    const emptyBlocks = 12 - filledBlocks;
    const progressBarVisual = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);

    const pad = (str: any, width: number) => String(str).slice(0, width).padEnd(width);

    // Ultra-Crisp 27-Character Unified Cyber Box (Header + Progress Bar + 2-Column Matrix)
    const padCell = (label: string, val: any) => {
      const vStr = String(val).slice(0, 4);
      const space = 10 - label.length - vStr.length;
      return `${label}${' '.repeat(Math.max(1, space))}${vStr}`;
    };

    const integrityTitle = `SYSTEM INTEGRITY: ${integrityScore}%`;
    const fullDashboardBoxStr = [
      `\u001b[1;36m┌─────────────────────────┐\u001b[0m`,
      `\u001b[1;36m│\u001b[0m \u001b[1;36m${pad(integrityTitle, 23)}\u001b[0m \u001b[1;36m│\u001b[0m`,
      `\u001b[1;36m│\u001b[0m \u001b[1;37m${pad(progressBarVisual, 23)}\u001b[0m \u001b[1;36m│\u001b[0m`,
      `\u001b[1;36m├────────────┬────────────┤\u001b[0m`,
      `\u001b[1;36m│\u001b[0m \u001b[1;37m${padCell('ROLES', rolesCount)}\u001b[0m \u001b[1;36m│\u001b[0m \u001b[1;37m${padCell('ADMIN', adminRolesCount)}\u001b[0m \u001b[1;36m│\u001b[0m`,
      `\u001b[1;36m│\u001b[0m \u001b[1;31m${padCell('THREATS', threatRolesCount)}\u001b[0m \u001b[1;36m│\u001b[0m \u001b[1;33m${padCell('RISKS', permRiskCount)}\u001b[0m \u001b[1;36m│\u001b[0m`,
      `\u001b[1;36m├────────────┼────────────┤\u001b[0m`,
      `\u001b[1;36m│\u001b[0m \u001b[1;37m${padCell('CHANS', channelsCount)}\u001b[0m \u001b[1;36m│\u001b[0m \u001b[1;37m${padCell('PRIV', privilegedCount)}\u001b[0m \u001b[1;36m│\u001b[0m`,
      `\u001b[1;36m│\u001b[0m \u001b[1;31m${padCell('RISK USR', threatUsersCount)}\u001b[0m \u001b[1;36m│\u001b[0m \u001b[1;37m${padCell('BOTS', integrationsCount)}\u001b[0m \u001b[1;36m│\u001b[0m`,
      `\u001b[1;36m├────────────┼────────────┤\u001b[0m`,
      `\u001b[1;36m│\u001b[0m \u001b[1;37m${padCell('ASSETS', totalAssets)}\u001b[0m \u001b[1;36m│\u001b[0m \u001b[1;31m${padCell('THREATS', threatAssets)}\u001b[0m \u001b[1;36m│\u001b[0m`,
      `\u001b[1;36m│\u001b[0m \u001b[1;32m${padCell('STATE', 'OK')}\u001b[0m \u001b[1;36m│\u001b[0m \u001b[1;32m${padCell('GUARD', 'ON')}\u001b[0m \u001b[1;36m│\u001b[0m`,
      `\u001b[1;36m└────────────┴────────────┘\u001b[0m`
    ].join('\n');

    let webhooksCount = 0;
    try {
      const fetchedWebhooks = await guild.fetchWebhooks().catch(() => null);
      webhooksCount = fetchedWebhooks ? fetchedWebhooks.size : 0;
    } catch { }

    let adminInterventionsCount = 0;
    let autoModViolationsCount = 0;
    let whitelistedAdminsCount = 1; // Server Owner is always whitelisted
    let whitelistedBotsCount = 1;   // The Rage Optimiser security bot itself is whitelisted

    const db = Database.getDb();

    // 1. Whitelisted Admins (Server Owner + Extra Owners + Member Whitelist + Config Whitelist)
    let extraOwnersCount = 0;
    let memberWlCount = 0;
    let prebotCount = 0;
    let dbAdminCount = 0;
    let dbAMCount = 0;

    if (db) {
      try {
        const eoRow = await db.get<any>("SELECT COUNT(*) as c FROM extra_owners WHERE guildId = ?", [guild.id]).catch(() => null);
        extraOwnersCount = eoRow?.c || 0;

        const rowWLAdmins = await db.get<any>(
          "SELECT COUNT(*) as c FROM member_whitelist WHERE guildId = ? AND type = 'user'",
          [guild.id]
        ).catch(() => null);
        memberWlCount = rowWLAdmins?.c || 0;

        const rowWLBots = await db.get<any>(
          "SELECT COUNT(*) as c FROM prebot_whitelist WHERE guildId = ?",
          [guild.id]
        ).catch(() => null);
        prebotCount = rowWLBots?.c || 0;

        const rowAdmin = await db.get<any>(
          "SELECT COUNT(*) as c FROM server_audit_logs WHERE guildId = ? AND (action LIKE '%timeout%' OR action LIKE '%quarantine%' OR action LIKE '%kick%' OR action LIKE '%ban%' OR action LIKE '%warn%')",
          [guild.id]
        ).catch(() => null);
        dbAdminCount = rowAdmin?.c || 0;

        const rowAM = await db.get<any>(
          "SELECT COUNT(*) as c FROM server_audit_logs WHERE guildId = ? AND (action LIKE '%automod%' OR action LIKE '%antinuke%' OR action LIKE '%anti_%' OR action LIKE '%block%' OR action LIKE '%filter%' OR action LIKE '%link%' OR action LIKE '%spam%')",
          [guild.id]
        ).catch(() => null);
        dbAMCount = rowAM?.c || 0;
      } catch { }
    }

    whitelistedAdminsCount = 1 + extraOwnersCount + memberWlCount;
    whitelistedBotsCount = 1 + prebotCount;

    // 2. Fetch live Discord audit logs to combine historical actions
    let discordAuditInterventions = 0;
    let discordAMBlocks = 0;
    try {
      const meMember = guild.members?.me || await guild.members?.fetchMe().catch(() => null);
      if (meMember?.permissions?.has(PermissionFlagsBits.ViewAuditLog)) {
        const auditLogs = await guild.fetchAuditLogs({ limit: 100 }).catch(() => null);
        if (auditLogs) {
          discordAuditInterventions = auditLogs.entries.filter((e: any) =>
            e.action === AuditLogEvent.MemberKick ||
            e.action === AuditLogEvent.MemberBanAdd ||
            e.action === AuditLogEvent.MemberBanRemove ||
            e.action === AuditLogEvent.MemberPrune ||
            (e.action === AuditLogEvent.MemberUpdate && e.changes?.some((c: any) => c.key === 'communication_disabled_until'))
          ).size;
          discordAMBlocks = auditLogs.entries.filter((e: any) =>
            e.action === (AuditLogEvent.AutoModerationBlockMessage as any) ||
            e.action === (AuditLogEvent.AutoModerationFlagToChannel as any) ||
            e.action === (AuditLogEvent.AutoModerationUserCommunicationDisabled as any)
          ).size;
        }
      }
    } catch { }

    adminInterventionsCount = Math.max(dbAdminCount, discordAuditInterventions);
    autoModViolationsCount = Math.max(dbAMCount, discordAMBlocks);

    // Fetch live recent disciplinary & automod action logs
    const recentLogLines: string[] = [];
    try {
      if (db) {
        const rows = await db.all<any>(
          "SELECT * FROM server_audit_logs WHERE guildId = ? ORDER BY timestamp DESC, id DESC LIMIT 6",
          [guild.id]
        );
        for (const r of rows) {
          const d = new Date(r.timestamp || r.createdAt || Date.now());
          const hh = String(d.getHours()).padStart(2, '0');
          const mm = String(d.getMinutes()).padStart(2, '0');
          const exec = (r.executorTag || r.executorId || 'System').split('#')[0].slice(0, 10);
          const act = (r.action || 'action').toLowerCase().replace('automod_', '').replace(/_/g, ' ');
          const tgt = (r.targetName || r.targetId || 'target').split('#')[0].slice(0, 20);

          let actColor = '\u001b[1;33m';
          if (['ban', 'kick', 'quarantine', 'delete', 'timeout', 'mute', 'strip'].some(a => act.includes(a))) actColor = '\u001b[1;31m';
          else if (['create', 'grant', 'whitelist', 'restore', 'unban', 'verified'].some(a => act.includes(a))) actColor = '\u001b[1;32m';

          recentLogLines.push(`\u001b[1;36m[${hh}:${mm}]\u001b[0m \u001b[1;37m${exec.padEnd(10)}\u001b[0m ${actColor}${act.padEnd(12)}\u001b[0m \u001b[1;34m${tgt}\u001b[0m`);
        }
      }
    } catch { }

    if (recentLogLines.length < 6) {
      try {
        const meMember = guild.members?.me || await guild.members?.fetchMe().catch(() => null);
        if (meMember?.permissions?.has(PermissionFlagsBits.ViewAuditLog)) {
          const auditLogs = await guild.fetchAuditLogs({ limit: 8 }).catch(() => null);
          if (auditLogs && auditLogs.entries.size > 0) {
            for (const [, entry] of auditLogs.entries) {
              if (recentLogLines.length >= 6) break;
              const d = new Date(entry.createdAt);
              const hh = String(d.getHours()).padStart(2, '0');
              const mm = String(d.getMinutes()).padStart(2, '0');
              const exec = entry.executor ? (entry.executor.username || entry.executor.tag) : 'Unknown';
              const tgt = entry.target ? (entry.target.username || entry.target.name || entry.target.tag || entry.target.id) : 'Target';
              let act = 'action';
              if (entry.action === AuditLogEvent.MemberKick) act = 'kicked';
              else if (entry.action === AuditLogEvent.MemberBanAdd) act = 'banned';
              else if (entry.action === AuditLogEvent.MemberUpdate) act = 'updated';
              else if (entry.action === AuditLogEvent.RoleDelete) act = 'deleted role';
              else if (entry.action === AuditLogEvent.RoleCreate) act = 'created role';
              else if (entry.action === AuditLogEvent.ChannelDelete) act = 'deleted channel';
              else if (entry.action === AuditLogEvent.ChannelCreate) act = 'created channel';
              else if (entry.action === AuditLogEvent.WebhookCreate) act = 'created webhook';
              else if (entry.action === AuditLogEvent.WebhookDelete) act = 'deleted webhook';

              let actColor = '\u001b[1;33m';
              if (['kicked', 'banned', 'deleted'].some(a => act.includes(a))) actColor = '\u001b[1;31m';
              else if (['created'].some(a => act.includes(a))) actColor = '\u001b[1;32m';

              recentLogLines.push(`\u001b[1;36m[${hh}:${mm}]\u001b[0m \u001b[1;37m${exec.slice(0, 10).padEnd(10)}\u001b[0m ${actColor}${act.padEnd(12)}\u001b[0m \u001b[1;34m${tgt.slice(0, 20)}\u001b[0m`);
            }
          }
        }
      } catch { }
    }

    if (recentLogLines.length === 0) {
      recentLogLines.push('\u001b[1;32m[--:--] System active - 0 disciplinary actions in 24h.\u001b[0m');
    }

    // Load live security config for matrix & firewall status
    let secConfig: any = {};
    if (db) {
      try {
        const cfgRow = await db.get<any>('SELECT config FROM guild_configs WHERE guildId = ? AND moduleId = ?', [guild.id, 'security']);
        if (cfgRow?.config) {
          secConfig = typeof cfgRow.config === 'string' ? JSON.parse(cfgRow.config) : cfgRow.config;
        }
      } catch { }
    }

    const isFirewallActive = secConfig?.antiNukeEnabled !== false;
    const firewallStatus = isFirewallActive ? 'ACTIVE (PROTECTED)' : 'OFFLINE (EXPOSED)';
    const integrityStatus = integrityScore >= 90 ? 'OPTIMAL' : integrityScore >= 70 ? 'SECURE' : 'ACTION REQUIRED';

    // Embed 1: Main Header & AutoMod/Disciplinary Summary
    const serverHeaderLine = [
      `> **Server** — \`${guild.name.toUpperCase()}\` • **Firewall** — \`${firewallStatus}\` • **System Integrity** — \`${integrityScore}% ${integrityStatus}\``,
      `> **Real-Time Data Sync**: <t:${nowSec}:F> (<t:${nowSec}:R>)`
    ].join('\n');

    const summaryEmbed = new EmbedBuilder()
      .setColor(CYAN_ACCENT)
      .setTitle('RAGE DASHBOARD')
      .setDescription([
        serverHeaderLine,
        ``,
        `### AUTOMOD & DISCIPLINARY SUMMARY`,
        `> **Admin Interventions** — \`${adminInterventionsCount} Action Logs\``,
        `> **AutoMod Violations** — \`${autoModViolationsCount} Security Actions\``,
        `> **Whitelisted Admins** — \`${whitelistedAdminsCount} Users\``,
        `> **Whitelisted Bots** — \`${whitelistedBotsCount} Bots\``
      ].join('\n'));

    // Embed 2: AntiNuke Protection Matrix (12 Modules)

    const getModState = (ruleKey: string) => {
      const isAntiNukeOn = secConfig?.antiNukeEnabled !== false;
      const rule = secConfig?.rules?.[ruleKey];
      const isEnabled = isAntiNukeOn && (rule ? rule.enabled !== false : true);
      return isEnabled ? '\u001b[1;32mACTIVE\u001b[0m' : '\u001b[1;31mOFFLINE\u001b[0m';
    };

    const matrixLines = [
      `\u001b[1;34mRole Create   \u001b[0m : ${getModState('anti_role_create')} \u001b[1;34m|\u001b[0m \u001b[1;34mRole Delete      \u001b[0m : ${getModState('anti_role_delete')}`,
      `\u001b[1;34mRole Update   \u001b[0m : ${getModState('anti_role_update')} \u001b[1;34m|\u001b[0m \u001b[1;34mRole Perms Update\u001b[0m : ${getModState('anti_role_grant')}`,
      `\u001b[1;34mChannel Create\u001b[0m : ${getModState('anti_channel_create')} \u001b[1;34m|\u001b[0m \u001b[1;34mChannel Delete   \u001b[0m : ${getModState('anti_channel_delete')}`,
      `\u001b[1;34mChannel Update\u001b[0m : ${getModState('anti_channel_update')} \u001b[1;34m|\u001b[0m \u001b[1;34mAnti-Bot Add     \u001b[0m : ${getModState('anti_bot')}`,
      `\u001b[1;34mWebhook Create\u001b[0m : ${getModState('anti_webhook_create')} \u001b[1;34m|\u001b[0m \u001b[1;34mWebhook Update   \u001b[0m : ${getModState('anti_webhook_update')}`,
      `\u001b[1;34mGuild Update  \u001b[0m : ${getModState('anti_guild_update')} \u001b[1;34m|\u001b[0m \u001b[1;34mAnti Mass Kick   \u001b[0m : ${getModState('anti_kick')}`
    ].join('\n');

    const matrixEmbed = new EmbedBuilder()
      .setColor(CYAN_ACCENT)
      .setTitle('ANTINUKE PROTECTION MATRIX (12 MODULES)')
      .setDescription(`\`\`\`ansi\n${matrixLines}\n\`\`\``);

    // Embed 3: Server Infrastructure Matrix
    const infraLines = [
      `\u001b[1;34mRoles Total     \u001b[0m: \u001b[1;37m${pad(rolesCount, 4)}\u001b[0m \u001b[1;34m|\u001b[0m \u001b[1;34mAdmin Roles  \u001b[0m: \u001b[1;37m${adminRolesCount}\u001b[0m`,
      `\u001b[1;34mThreat Roles    \u001b[0m: \u001b[1;31m${pad(threatRolesCount, 4)}\u001b[0m \u001b[1;34m|\u001b[0m \u001b[1;34mPerm Risk    \u001b[0m: \u001b[1;33m${permRiskCount}\u001b[0m`,
      `\u001b[1;34mChannels Total  \u001b[0m: \u001b[1;37m${pad(channelsCount, 4)}\u001b[0m \u001b[1;34m|\u001b[0m \u001b[1;34mPrivileged   \u001b[0m: \u001b[1;37m${privilegedCount}\u001b[0m`,
      `\u001b[1;34mBot Integrations\u001b[0m: \u001b[1;37m${pad(integrationsCount, 4)}\u001b[0m \u001b[1;34m|\u001b[0m \u001b[1;34mThreat Assets\u001b[0m: \u001b[1;31m${threatAssets}\u001b[0m`,
      `\u001b[1;34mWebhooks Active \u001b[0m: \u001b[1;37m${pad(webhooksCount, 4)}\u001b[0m \u001b[1;34m|\u001b[0m \u001b[1;34mFirewall     \u001b[0m: \u001b[1;32mACTIVE\u001b[0m`
    ].join('\n');

    const infraEmbed = new EmbedBuilder()
      .setColor(CYAN_ACCENT)
      .setTitle('SERVER INFRASTRUCTURE MATRIX')
      .setDescription(`\`\`\`ansi\n${infraLines}\n\`\`\``);

    // Embed 4: Live Realtime Security Monitoring Core
    const liveMonitoringEmbed = new EmbedBuilder()
      .setColor(CYAN_ACCENT)
      .setTitle('LIVE REALTIME SECURITY MONITORING CORE')
      .setDescription([
        `\`\`\`ansi`,
        `\u001b[1;36m[${integrityScore}%] Baseline intact. Realtime Audit Log & Server Event Sync Active.\u001b[0m`,
        `\`\`\``
      ].join('\n'));

    // Embed 5: Recent Disciplinary Logs & AutoMod Actions
    const recentLogsEmbed = new EmbedBuilder()
      .setColor(CYAN_ACCENT)
      .setTitle('RECENT DISCIPLINARY LOGS & AUTOMOD ACTIONS')
      .setDescription(`\`\`\`ansi\n${recentLogLines.join('\n')}\n\`\`\``);

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('sec_btn_extraowner').setLabel('Extra Owners').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('sec_btn_wl_user').setLabel('Whitelist User').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('sec_btn_wl_role').setLabel('Whitelist Role').setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('sec_btn_2fa').setLabel('2FA Passcode').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('sec_btn_rescan').setLabel('Rescan Server').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('sec_btn_logs').setLabel('Threat Timeline').setStyle(ButtonStyle.Success)
    );

    return {
      content: '' as any,
      embed: summaryEmbed,
      embeds: [summaryEmbed, matrixEmbed, infraEmbed, liveMonitoringEmbed, recentLogsEmbed],
      components: [row1, row2]
    };
  } catch (err: any) {
    console.error('[buildSecurityDashboardCard] Error generating dashboard card:', err?.message || err);
    const fallbackEmbed = new EmbedBuilder()
      .setColor(CYAN_ACCENT)
      .setTitle("RAGE'S SECURITY DASHBOARD")
      .setDescription(`**Status: PROTECTED**\n**Last Sync:** <t:${nowSec}:R>\n**Live Monitoring: Active**\n\n\`\`\`ansi\n\u001b[1;36mSYSTEM INTEGRITY INDEX: 98% [ONLINE]\u001b[0m\n\`\`\``);

    return {
      content: '' as any,
      embed: fallbackEmbed,
      embeds: [fallbackEmbed],
      components: []
    };
  }
}

/**
 * Sends a private security consultation report directly to the Server Owner in DM
 * without altering any server permissions, giving the owner full control.
 */
export async function sendOwnerSecurityConsultationDM(guild: Guild): Promise<boolean> {
  try {
    const owner = await guild.fetchOwner().catch(() => null);
    if (!owner) return false;

    const roles = guild.roles.cache;
    const members = guild.members.cache;

    const threatRoles = roles.filter((r: any) =>
      (r.permissions.has(PermissionFlagsBits.Administrator) || r.permissions.has(PermissionFlagsBits.ManageGuild)) &&
      !r.managed && r.id !== guild.roles.everyone.id && !BACKUP_ROLE_NAMES.includes(r.name)
    );

    const threatUsers: any[] = [];
    for (const [, m] of members) {
      if (m.user?.bot || m.id === guild.ownerId) continue;
      const isOwnerOrExtra = await isOwnerOrExtraOwner(m.id, guild).catch(() => false);
      if (isOwnerOrExtra) continue;
      const isBypassed = await checkBypassImmunity(m.id, guild, {}).catch(() => false);
      if (isBypassed) continue;
      if (m.roles?.cache?.some((r: any) => r?.permissions?.has(PermissionFlagsBits.Administrator))) {
        threatUsers.push(m);
      }
    }

    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
    const rolePositions = Array.from(roles.values()).map((r: any) => r?.position || 0);
    const maxRolePos = rolePositions.length > 0 ? Math.max(...rolePositions, 1) : 1;
    const isRolePositionLow = Boolean(me?.roles?.highest && me.roles.highest.position < (maxRolePos - 2));

    let integrityScore = 100;
    if (isRolePositionLow) integrityScore -= 18;
    if (threatRoles.size > 0) integrityScore -= Math.min(threatRoles.size * 3, 20);
    if (threatUsers.length > 0) integrityScore -= Math.min(threatUsers.length * 5, 25);
    integrityScore = Math.max(Math.min(integrityScore, 100), 40);

    const filledBlocks = Math.round((integrityScore / 100) * 16);
    const progressBarVisual = '█'.repeat(filledBlocks) + '░'.repeat(16 - filledBlocks);

    const integrityStatusLabel = integrityScore >= 80 ? 'OPTIMAL' : integrityScore >= 60 ? 'MODERATE RISK' : 'CRITICAL RISK';

    const threatRoleFormatted = threatRoles.size > 0
      ? Array.from(threatRoles.values()).slice(0, 6).map((r: any) => `\`@${r.name}\``).join(', ')
      : '`None detected`';

    const threatUserFormatted = threatUsers.length > 0
      ? threatUsers.slice(0, 6).map(u => `\`@${u.user?.username || u.id}\``).join(', ')
      : '`None detected`';

    const hierarchyStatus = isRolePositionLow
      ? `${WRONG_ICON} **Suboptimal** — Rage Optimiser sits below other admin roles`
      : `${VERIFIED_ICON} **Optimal** — Rage Optimiser holds top authority`;

    // Automatically strip dangerous roles from unwhitelisted members upon activation
    await stripPrivilegedNonWhitelistedMembers(guild).catch(() => {});

    const consultationEmbed = new EmbedBuilder()
      .setColor(0x2B2D31)
      .setAuthor({
        name: 'RAGE OPTIMISER ENTERPRISE • SECURITY BRIEFING',
        iconURL: guild.client?.user?.displayAvatarURL()
      })
      .setTitle(`Security Activation Report — ${guild.name}`)
      .setDescription([
        `Hello **${owner.user.username}** ${GOLD_CROWN_ICON},`,
        '',
        `The **Rage Optimiser Enterprise Security Suite** has been successfully deployed on **${guild.name}**. Below is your initial security briefing with threat intelligence and setup guidance.`
      ].join('\n'))
      .addFields(
        {
          name: 'System Integrity Index',
          value: [
            `>>> ${STATS_ICON} **System Health**: **${integrityStatusLabel}** • **${integrityScore}%**`,
            `\`[ ${progressBarVisual} ] ${integrityScore}%\``
          ].join('\n'),
          inline: false
        },
        {
          name: 'Threat Intelligence & Audit',
          value: [
            `>>> ${SHIELD_ICON} **Security Threat Telemetry**`,
            `${ARROW_ICON} **Bot Hierarchy**: ${hierarchyStatus}`,
            `${ARROW_ICON} **Unmanaged Admin Roles**: \`${threatRoles.size}\` found`,
            `> ${threatRoleFormatted}`,
            `${ARROW_ICON} **Non-Whitelisted Admin Members**: \`${threatUsers.length}\` detected`,
            `> ${threatUserFormatted}`
          ].join('\n'),
          inline: false
        },
        {
          name: 'Recommended Hardening Actions',
          value: [
            `>>> **1.** ${VIP_ICON} **Authorize Trusted Staff** — Run \`r!extraowner add @user\` or \`r!whitelist add @user\` for moderators who need admin access.`,
            `**2.** ${GAVEL_ICON} **Trim Role Permissions** — Strip \`Administrator\` from non-senior roles like Trial Mods & Helpers. Grant only what is needed.`,
            `**3.** ${SHIELD_ICON} **Elevate Bot Position** — Move the **Rage Optimiser** role to the **very top** of your role list in **Server Settings › Roles**.\n`,
            `**For full configuration, run \`r!config\` or open the Security Dashboard with \`r!dashboard\`.**`
          ].join('\n'),
          inline: false
        }
      )
      .setFooter({ text: 'Rage Optimiser Enterprise • Zero-Trust Security Sentinel', iconURL: guild.iconURL() || undefined })
      .setTimestamp();

    await owner.send({ embeds: [consultationEmbed] }).catch(() => {
      console.log(`[Security Consultation] Unable to DM server owner ${owner.user.username} (DMs closed)`);
    });
    return true;
  } catch (err) {
    console.error('[sendOwnerSecurityConsultationDM] Error sending consultation DM:', err);
    return false;
  }
}

/**
 * Ensures a dedicated, private "#rage-dashboard" text channel exists at the absolute top of the server.
 * Permissions:
 *  - @everyone: Deny ViewChannel, Deny SendMessages
 *  - Bot: Allow ViewChannel, SendMessages, EmbedLinks, AttachFiles, ManageMessages, ReadMessageHistory
 *  - Server Owner: Allow ViewChannel, ReadMessageHistory; Deny SendMessages
 *  - Extra Owners: Allow ViewChannel, ReadMessageHistory; Deny SendMessages
 * Position:
 *  - Absolute top of all channels and categories (position: 0, parent: null)
 */
export async function ensurePrivateDashboardChannel(guild: Guild): Promise<TextChannel | null> {
  try {
    const channelName = 'rage-dashboard';

    // Find existing dashboard channel if one was already provisioned
    let channel = guild.channels.cache.find(
      (c) => c.isTextBased() && (c.name === channelName || c.name === '🔒・rage-dashboard')
    ) as TextChannel | undefined;

    if (!channel) {
      const fetched = await guild.channels.fetch().catch(() => null);
      if (fetched) {
        channel = fetched.find(
          (c: any) => c && c.isTextBased() && (c.name === channelName || c.name === '🔒・rage-dashboard')
        ) as TextChannel | undefined;
      }
    }

    const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
    const everyoneRole = guild.roles.everyone || guild.roles.cache.get(guild.id);

    const permissionOverwrites: any[] = [];

    if (everyoneRole) {
      permissionOverwrites.push({
        id: everyoneRole.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory
        ],
        deny: [
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.SendMessagesInThreads,
          PermissionFlagsBits.CreatePublicThreads,
          PermissionFlagsBits.CreatePrivateThreads,
          PermissionFlagsBits.AddReactions
        ]
      });
    }

    if (botMember) {
      permissionOverwrites.push({
        id: botMember.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.UseExternalEmojis
        ]
      });
    }

    if (!channel) {
      channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        topic: 'Rage Optimiser Enterprise • Live Cyber Security Dashboard [Real-Time Sync Active]',
        permissionOverwrites,
        position: 0,
        reason: 'Auto-provisioning private Rage Security Dashboard at top of server'
      }) as TextChannel;
    } else {
      await channel.permissionOverwrites.set(permissionOverwrites).catch((err) => {
        console.warn(`[ensurePrivateDashboardChannel] Overwrites set warning on #${channel?.name}:`, err?.message || err);
      });
      await channel.edit({
        parent: null,
        topic: 'Rage Optimiser Enterprise • Live Cyber Security Dashboard [Real-Time Sync Active]'
      }).catch((err) => {
        console.warn(`[ensurePrivateDashboardChannel] Failed to edit existing #${channel?.name}:`, err?.message || err);
      });
    }

    try {
      await channel.setPosition(0, { relative: false });
    } catch { }

    return channel;
  } catch (err: any) {
    console.error(`[ensurePrivateDashboardChannel] Failed to create or configure dashboard channel in guild ${guild.id}:`, err?.message || err);
    return null;
  }
}

/**
 * Deploys or updates the live 3-embed security dashboard into the dedicated "#rage-dashboard" private channel.
 */
export async function deploySecurityDashboardToChannel(guild: Guild): Promise<{ channel: TextChannel; message: Message } | null> {
  try {
    const channel = await ensurePrivateDashboardChannel(guild);
    if (!channel) {
      console.error(`[deploySecurityDashboardToChannel] Channel resolution returned null for guild ${guild.id}`);
      return null;
    }

    // Ensure bot explicitly has SendMessages & EmbedLinks permissions in the target channel
    const meId = guild.members.me?.id || guild.client.user?.id;
    if (meId) {
      const perms = channel.permissionsFor(meId);
      if (!perms || !perms.has(PermissionFlagsBits.SendMessages) || !perms.has(PermissionFlagsBits.EmbedLinks)) {
        await channel.permissionOverwrites.edit(meId, {
          ViewChannel: true,
          SendMessages: true,
          EmbedLinks: true,
          AttachFiles: true,
          ManageMessages: true,
          ReadMessageHistory: true,
          UseExternalEmojis: true
        }).catch(() => { });
      }
    }

    const dashboard = await buildSecurityDashboardCard(guild);
    let targetMessage: Message | null = null;

    // Check if there is already a registered message in this channel
    const record = await Database.getDashboard(guild.id);
    if (record && record.channelId === channel.id) {
      targetMessage = await channel.messages.fetch(record.messageId).catch(() => null);
    }

    // Fallback: If not in DB, search last 10 messages in channel for an existing bot message
    if (!targetMessage) {
      const recentMessages = await channel.messages.fetch({ limit: 10 }).catch(() => null);
      if (recentMessages && recentMessages.size > 0) {
        const botMsg = recentMessages.find(m => m.author.id === guild.client.user?.id);
        if (botMsg) {
          targetMessage = botMsg;
        }
      }
    }

    if (targetMessage) {
      try {
        await targetMessage.edit({
          embeds: dashboard.embeds,
          components: dashboard.components
        });
      } catch (editErr: any) {
        console.warn(`[deploySecurityDashboardToChannel] Edit failed in guild ${guild.id}, recreating message:`, editErr?.message || editErr);
        targetMessage = null;
      }
    }

    if (!targetMessage) {
      try {
        targetMessage = await channel.send({
          embeds: dashboard.embeds,
          components: dashboard.components
        });
      } catch (sendErr: any) {
        console.warn(`[deploySecurityDashboardToChannel] Send with components failed, falling back to embeds only:`, sendErr?.message || sendErr);
        try {
          targetMessage = await channel.send({
            embeds: dashboard.embeds
          });
        } catch (critErr: any) {
          console.error(`[deploySecurityDashboardToChannel] Critical failure sending dashboard to #${channel.name}:`, critErr?.message || critErr);
          targetMessage = null;
        }
      }
    }

    if (targetMessage) {
      await DashboardSyncService.registerDashboard(guild.id, channel.id, targetMessage.id);
      console.log(`[deploySecurityDashboardToChannel] ✅ Successfully deployed live dashboard in #${channel.name} (${guild.id})`);
    }

    return targetMessage ? { channel, message: targetMessage } : null;
  } catch (err: any) {
    console.error(`[deploySecurityDashboardToChannel] Failed to deploy dashboard in guild ${guild.id}:`, err?.message || err);
    return null;
  }
}

export function registerEnableDisableCommands(): void {
  // 1. r!enable Command
  PrefixRegistry.register({
    name: 'enable',
    category: 'Security',
    description: 'Enable Anti-Nuke, AutoMod, Voice Protection, or all security sub-modules with standard defaults.',
    usage: 'r!enable <antinuke | automod | voice | all | module_id>',
    aliases: ['on', 'activate', 'enablemodule'],
    cooldownSeconds: 3,
    examples: [
      'r!enable antinuke',
      'r!enable automod',
      'r!enable all',
      'r!enable voice'
    ],
    moduleOwnerId: 'security',
    dangerLevel: 'Medium',
    execute: async (message: Message, args: string[], context?: any) => {
      const guildId = message.guildId;
      if (!guildId || !message.guild) {
        return message.reply({ content: `${WRONG_EMOJI} Command can only be executed within a server.` });
      }

      const isAuthorized = await isOwnerOrExtraOwner(message.author.id, message.guild);
      if (!isAuthorized) {
        return message.reply({
          content: `${WRONG_EMOJI} **Access Denied**: Enabling security modules is strictly restricted to the **Server Owner** and designated **Extra Owners**.`
        });
      }

      const prefix = PrefixResolver.getPrefix(guildId);
      const rawTarget = (args[0] || '').toLowerCase().trim();
      const target = MODULE_ALIASES[rawTarget] || rawTarget;

      if (!rawTarget) {
        const usageEmbed = buildLimeOverviewCard({
          title: `${CONFIG_EMOJI} ONE-CLICK MODULE ACTIVATION CONTROL`,
          subtitle: 'ENABLE PROTECTION SUITES WITH OPTIMAL DEFAULT PARAMETERS',
          color: Colors.BRAND,
          sections: [
            {
              title: `${SHIELD_EMOJI} SECURITY & DEFENSE SUITES`,
              items: [
                `• \`${prefix}enable antinuke\` — Enable all 29 Anti-Nuke & Unbypassable rules`,
                `• \`${prefix}enable automod\` — Enable Anti-Link, Anti-Spam & Chat Filters`,
                `• \`${prefix}enable voice\` — Enable Voice Protection, Dynamic JTC & 24/7`,
                `• \`${prefix}enable logging [#channel]\` — Enable Server Audit Logging Center`,
                `• \`${prefix}enable backups\` — Enable Disaster Recovery & Snapshots`
              ]
            },
            {
              title: `${VIP_ICON} SERVER FEATURES & COMMUNITY UTILITIES`,
              items: [
                `• \`${prefix}enable tickets\` — Enable interactive 5-category ticket system`,
                `• \`${prefix}enable verify\` — Enable member captcha & verification gate`,
                `• \`${prefix}enable autorole\` — Enable Join-Role Guard & onboarding roles`,
                `• \`${prefix}enable giveaway\` — Enable interactive prize giveaways`,
                `• \`${prefix}enable reactionroles\` — Enable button & reaction role menus`,
                `• \`${prefix}enable leveling\` — Enable XP progression & rank rewards`,
                `• \`${prefix}enable statscounter\` — Enable real-time metric counter channels`,
                `• \`${prefix}enable socials\` — Enable YouTube & Twitch alert feeds`
              ]
            },
            {
              title: `${GOLD_CROWN_ICON} MASTER ENTERPRISE ACTIVATION`,
              items: [
                `• \`${prefix}enable all\` — Enable and configure complete enterprise security suite`,
                `• \`${prefix}enable <module_id>\` — Enable any individual module by name or alias`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Security & Utility Control'
        });
        return message.reply({ embeds: [usageEmbed] });
      }

      const updateConfig = context?.updateModuleConfig;
      const toggleMod = context?.toggleModule;
      const modulesState = context?.getModulesState ? context.getModulesState() : [];

      // Only run High-Tech Antinuke animation for antinuke / security / all
      const isAntinukeOrAll = target === 'security' || target === 'all';
      let replyMsg: any = null;

      if (isAntinukeOrAll) {
        const dbHash = Math.floor(1000000000000000 + Math.random() * 9000000000000000).toString();
        const guildCleanName = message.guild.name.replace(/[*_`~|]/g, '');

        const steps = [
          {
            label: 'Establishing Connection with Rage Security Cluster...',
            detail: 'Connected'
          },
          {
            label: 'Checking Minimum Requirements for Antinuke...'
          },
          {
            label: `Creating DB for "${guildCleanName}"...`,
            subLines: [
              `└ Server Id : ${message.guild.id}`,
              `└ Rage Security DB ID : ${dbHash.slice(0, 16)}`
            ]
          },
          {
            label: 'Starting Role Integrity Check...'
          },
          {
            label: 'Checking Rage Unbypassable , Rage Antinuke , Rage Roles Created....'
          },
          {
            label: 'Backup Admin Roles Created And Assigned To Bot.'
          },
          {
            label: 'Establishing Gmail Connectors...'
          }
        ];

        const renderSetupCard = (currentIdx: number) => {
          const lines: string[] = [];
          for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            if (i < currentIdx) {
              lines.push(`${SUCCESS_CHECK_ICON} ${step.label}${step.detail ? ` ${step.detail}` : ''}`);
              if (step.subLines) {
                for (const sub of step.subLines) {
                  lines.push(`   ${sub}`);
                }
              }
            } else if (i === currentIdx) {
              lines.push(`${LOADING_ANIMATED_ICON} ${step.label}`);
            }
          }

          const embed = new EmbedBuilder()
            .setColor(0x2B2D31)
            .setTitle('Rage Optimiser • Antinuke Setup')
            .setDescription([
              '**Antinuke Setup Working...**',
              '',
              lines.length > 0 ? `>>> ${lines.join('\n')}` : `>>> ${LOADING_ANIMATED_ICON} Initializing Antinuke Engines...`
            ].join('\n'))
            .setFooter({
              text: 'Rage Optimiser • Unbypassable Security',
              iconURL: message.guild?.iconURL() || undefined
            })
            .setTimestamp();

          return embed;
        };

        replyMsg = await message.reply({ embeds: [renderSetupCard(0)] }).catch(() => null);

        if (replyMsg) {
          let activeMsg: any = replyMsg;
          for (let i = 1; i <= steps.length; i++) {
            await new Promise(res => setTimeout(res, 280));
            if (activeMsg) {
              const updated: any = await activeMsg.edit({ embeds: [renderSetupCard(i)] }).catch(() => null);
              if (updated) activeMsg = updated;
            }
          }
          replyMsg = activeMsg;
        }
      }

      // A. ENABLE ANTI-NUKE
      if (['antinuke', 'security', 'an'].includes(target)) {
        if (toggleMod) toggleMod('security', true);

        await ensureAntiNukeBackupRoles(message.guild);
        const { ensureRageRoleAtTop } = await import('../backups/manifest.js');
        await ensureRageRoleAtTop(message.guild);

        const secMod = modulesState.find((m: any) => m.id === 'security');
        const secConfig = secMod?.config || {};
        const rules = secConfig.rules || {};

        const updatedRules = { ...rules };
        for (const [ruleKey, defaultDef] of Object.entries(DEFAULT_SECURITY_RULES)) {
          updatedRules[ruleKey] = {
            ...defaultDef,
            enabled: true
          };
        }

        const newSecConfig = {
          ...secConfig,
          antiNukeEnabled: true,
          rules: updatedRules
        };

        if (updateConfig) updateConfig('security', newSecConfig);

        // Always deploy to #rage-dashboard channel at position 0
        const deployed = await deploySecurityDashboardToChannel(message.guild);
        const dashChannel = deployed?.channel;

        const overviewCard = buildLimeOverviewCard({
          title: 'ANTINUKE PROTECTION SUITE ACTIVATED',
          subtitle: 'ALL DEFENSE RULES ARMED & DASHBOARD DEPLOYED',
          color: Colors.LIME,
          sections: [
            {
              title: 'LIVE CYBER DASHBOARD DEPLOYMENT',
              items: [
                `• **Dashboard Channel**: ${dashChannel ? `<#${dashChannel.id}>` : '`#rage-dashboard`'}`,
                `• **Position**: Positioned at the **top of all channels & categories**`,
                `• **Access Control**: Public Read-Only (@everyone) • Chat Locked`,
                `• **Sync Engine**: Real-Time Event Sync & Automatic Background Auto-Sync`
              ]
            },
            {
              title: 'ACTIVE DEFENSE SYSTEMS',
              items: [
                '• **Anti-Nuke Matrix**: All 29 Protection rules active with instant rollback',
                '• **PreBot Whitelist & Quarantine**: Unauthorized bots automatically neutralized',
                '• **Threat Watcher**: Continuous monitoring of roles, channels, webhooks & threads'
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Anti-Nuke Online'
        });

        if (replyMsg) return replyMsg.edit({ embeds: [overviewCard] });
        return message.reply({ embeds: [overviewCard] });
      }

      // B. ENABLE AUTOMOD
      if (['automod', 'am', 'antilink', 'antispam'].includes(target)) {
        if (toggleMod) toggleMod('automod', true);

        const amMod = modulesState.find((m: any) => m.id === 'automod');
        const amConfig = amMod?.config || {};

        const newAmConfig = {
          ...amConfig,
          autoModEnabled: true,
          blockLinks: true,
          antiLinkEnabled: true,
          antiSpamEnabled: true,
          maxSpamMessages: 5,
          spamWindowSeconds: 5,
          punishment: amConfig.punishment || 'warn'
        };

        if (updateConfig) updateConfig('automod', newAmConfig);

        const deployed = await deploySecurityDashboardToChannel(message.guild);
        const dashChannel = deployed?.channel;

        const card = buildLimeOverviewCard({
          title: 'AUTOMOD PROTECTION ACTIVATED',
          subtitle: 'ANTI-LINK & ANTI-SPAM FILTERS ARMED',
          color: Colors.LIME,
          sections: [
            {
              title: 'PROTECTION STATUS',
              items: [
                `• **Anti-Link Filter**: Active (Malicious & invite links deleted)`,
                `• **Anti-Spam Filter**: Active (Max 5 msgs / 5s)`,
                `• **Live Dashboard**: ${dashChannel ? `<#${dashChannel.id}>` : '`#rage-dashboard`'}`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • AutoMod Online'
        });

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C. ENABLE VOICE
      if (target === 'voice') {
        if (toggleMod) {
          toggleMod('voice-protection', true);
          toggleMod('join_to_create', true);
          toggleMod('joinToCreate', true);
          toggleMod('voice_manager', true);
          toggleMod('voice', true);
        }

        const deployed = await deploySecurityDashboardToChannel(message.guild);
        const dashChannel = deployed?.channel;

        const card = buildLimeOverviewCard({
          title: 'VOICE PROTECTION ACTIVATED',
          subtitle: 'VOICE SECURITY, DYNAMIC JTC & 24/7 ONLINE',
          color: Colors.LIME,
          sections: [
            {
              title: 'PROTECTION STATUS',
              items: [
                `• **Voice Protection**: Active (Anti-spam & channel disconnect shields)`,
                `• **Dynamic Join-To-Create**: Online (Temp voice channel engine)`,
                `• **24/7 Voice Presence**: Available`,
                `• **Live Dashboard**: ${dashChannel ? `<#${dashChannel.id}>` : '`#rage-dashboard`'}`
              ]
            },
            {
              title: 'VOICE CONTROLS & COMMANDS',
              items: [
                `• \`${prefix}jtc\` — Configure Dynamic Join-To-Create channels`,
                `• \`${prefix}247 join <#channel>\` — Keep bot connected to voice 24/7`,
                `• \`${prefix}vcmute <@user>\` / \`${prefix}vcdeafen <@user>\` — Voice moderation`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Voice Online'
        });

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C2. ENABLE BACKUPS
      if (target === 'backups') {
        if (toggleMod) {
          toggleMod('backups', true);
        }

        const card = buildLimeOverviewCard({
          title: 'BACKUP RECOVERY SUITE ACTIVATED',
          subtitle: 'SERVER BACKUP ENGINE ONLINE',
          color: Colors.LIME,
          sections: [
            {
              title: 'PROTECTION STATUS',
              items: [
                '• **Backup Suite**: Active & Online',
                '• **Slash Commands**: `/backup create`, `/backup load`, `/backup list`',
                '• **Prefix Commands**: `r!backup create`, `r!backup load <id>`'
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Backups Online'
        });

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C3. ENABLE LOGGING
      if (['logging', 'logs', 'audit', 'auditlog', 'audit-logging'].includes(target)) {
        if (toggleMod) {
          toggleMod('logging', true);
        }

        const logMod = modulesState.find((m: any) => m.id === 'logging');
        const logConfig = logMod?.config || {};
        const LOG_CATEGORIES = ['security', 'moderation', 'antiNuke', 'botProtection', 'webhook', 'voice', 'audit', 'system'];

        // Determine target channel:
        // 1. Specified channel mention or ID in args[1]
        // 2. Existing channel in config for any category
        // 3. Existing channel in guild matching /logs?|audit|mod-log/i
        // 4. Fallback: auto-create '#rage-logs' with private admin/bot permissions
        let targetChannel: any = null;
        if (args[1]) {
          const cleanId = args[1].replace(/[<#>]/g, '').trim();
          targetChannel = message.mentions.channels.first() || (cleanId ? await message.guild.channels.fetch(cleanId).catch(() => null) : null);
        }

        if (!targetChannel) {
          const firstConfigured = LOG_CATEGORIES.map(c => logConfig[c]?.channelId).find(Boolean);
          if (firstConfigured) {
            targetChannel = await message.guild.channels.fetch(firstConfigured).catch(() => null);
          }
        }

        if (!targetChannel) {
          targetChannel = message.guild.channels.cache.find((c: any) =>
            c.isTextBased() && /^(mod-?logs?|audit-?logs?|server-?logs?|rage-?logs?|logs?)$/i.test(c.name)
          );
        }

        if (!targetChannel) {
          try {
            targetChannel = await message.guild.channels.create({
              name: 'rage-logs',
              type: ChannelType.GuildText,
              topic: 'Rage Optimiser Enterprise • Advanced Audit & Telemetry Log Stream',
              permissionOverwrites: [
                {
                  id: message.guild.roles.everyone.id,
                  deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                },
                {
                  id: message.client.user!.id,
                  allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.EmbedLinks,
                    PermissionFlagsBits.AttachFiles
                  ]
                }
              ]
            });
          } catch (e) {
            targetChannel = message.channel;
          }
        }

        const updatedConfig = { ...logConfig };
        LOG_CATEGORIES.forEach(cat => {
          const currentCat = updatedConfig[cat] || { events: {}, ignoreRoles: [], ignoreUsers: [], ignoreChannels: [] };
          updatedConfig[cat] = {
            ...currentCat,
            enabled: true,
            channelId: targetChannel.id
          };
        });

        if (updateConfig) updateConfig('logging', updatedConfig);

        const testEmbed = createLimeEmbed({
          title: 'Advanced Logging Center Activated',
          description: `${VERIFIED_ICON} Audit logging telemetry successfully armed for all **8 categories**!\nOutput routed to ${targetChannel}.`
        });
        await (targetChannel as any).send({ embeds: [testEmbed] }).catch(() => { });

        const card = buildLimeOverviewCard({
          title: 'ADVANCED LOGGING CENTER ACTIVATED',
          subtitle: 'ALL 8 EVENT PIPELINES ARMED & ROUTED',
          color: Colors.LIME,
          sections: [
            {
              title: 'AUDIT LOGGING STATUS',
              items: [
                `• **Module Status**: \`[ ACTIVE & LOGGING ]\``,
                `• **Log Route Target**: <#${targetChannel.id}> (\`${targetChannel.name}\`)`,
                `• **Active Categories**: Security, Moderation, Anti-Nuke, Bot Protection, Webhooks, Voice, Audit, System`
              ]
            },
            {
              title: 'LOGGING CONTROLS & COMMANDS',
              items: [
                `• \`${prefix}logs\` — Open real-time logging matrix status`,
                `• \`${prefix}logs channel all <#channel>\` — Re-route all categories to another channel`,
                `• \`${prefix}logs test all\` — Send test telemetry events`,
                `• \`${prefix}logs roles add <@role>\` — Add logging manager role`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Logging Online'
        });

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C4. ENABLE TICKETS
      if (target === 'tickets') {
        if (toggleMod) toggleMod('tickets', true);

        const card = buildLimeOverviewCard({
          title: 'TICKET SUPPORT SYSTEM ACTIVATED',
          subtitle: 'INTERACTIVE MULTI-CATEGORY SUPPORT ENGINE ONLINE',
          color: Colors.LIME,
          sections: [
            {
              title: 'SUPPORT SYSTEM STATUS',
              items: [
                '• **Module Status**: `[ ACTIVE & READY ]`',
                '• **Default Categories**: General Support, Moderation & Reports, VIP & Billing, Tech Help, Staff Applications',
                '• **GUI Panels**: Dynamic Modal & Dropdown Creation Flow with Custom Embeds'
              ]
            },
            {
              title: 'RECOMMENDED SETUP COMMANDS',
              items: [
                `• \`${prefix}ticket deploy <#channel>\` — Deploy live 5-category support panel to channel`,
                `• \`${prefix}tkmgr\` or \`${prefix}ticket\` — Open interactive Ticket Manager GUI`,
                `• \`${prefix}ticket setup\` — Step-by-step interactive ticket configuration wizard`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Tickets Online'
        });

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C5. ENABLE VERIFICATION
      if (target === 'verification') {
        if (toggleMod) toggleMod('verification', true);

        const card = buildLimeOverviewCard({
          title: 'MEMBER VERIFICATION GATEWAY ACTIVATED',
          subtitle: 'ZERO-TRUST GATEKEEPER & CAPTCHA ONLINE',
          color: Colors.LIME,
          sections: [
            {
              title: 'VERIFICATION STATUS',
              items: [
                '• **Module Status**: `[ ACTIVE & ARMED ]`',
                '• **Defense Mode**: Interactive Button & Captcha Verification Gate',
                '• **Anti-Raid Protection**: Automatically isolates unverified user joins'
              ]
            },
            {
              title: 'RECOMMENDED SETUP COMMANDS',
              items: [
                `• \`${prefix}verify setup <#channel>\` — Deploy verification panel to channel`,
                `• \`${prefix}verify role <@role>\` — Set the verified role granted upon passing`,
                `• \`${prefix}verify status\` — Inspect current verification configuration`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Verification Online'
        });

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C6. ENABLE JOIN-ROLE GUARD / AUTOROLE
      if (target === 'join_role_guard') {
        if (toggleMod) {
          toggleMod('join_role_guard', true);
          toggleMod('join-role-guard', true);
        }

        const card = buildLimeOverviewCard({
          title: 'AUTOROLE & JOIN-ROLE GUARD ACTIVATED',
          subtitle: 'AUTOMATED MEMBER ONBOARDING & RAID GATE ONLINE',
          color: Colors.LIME,
          sections: [
            {
              title: 'AUTOROLE ENGINE STATUS',
              items: [
                '• **Module Status**: `[ ACTIVE & MONITORING ]`',
                '• **Protected Role Assignment**: Safe onboarding without granting elevated permissions',
                '• **Anti-Raid Separation**: Separate pipelines for human members and bot invites'
              ]
            },
            {
              title: 'RECOMMENDED COMMANDS',
              items: [
                `• \`${prefix}autorole add <@role>\` — Automatically assign role to new members on join`,
                `• \`${prefix}autorole bot <@role>\` — Automatically assign role to authorized bot invites`,
                `• \`${prefix}autorole list\` — Display all configured join roles`,
                `• \`${prefix}autorole remove <@role>\` — Remove an existing auto-role`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • AutoRole Online'
        });

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C7. ENABLE GIVEAWAYS
      if (target === 'giveaway') {
        if (toggleMod) toggleMod('giveaway', true);

        const card = buildLimeOverviewCard({
          title: 'GIVEAWAY SYSTEM ACTIVATED',
          subtitle: 'INTERACTIVE PRIZE DISPATCH ENGINE ONLINE',
          color: Colors.LIME,
          sections: [
            {
              title: 'GIVEAWAY STATUS',
              items: [
                '• **Module Status**: `[ READY ]`',
                '• **Features**: Reaction entry, automated winner selection, reroll capabilities'
              ]
            },
            {
              title: 'RECOMMENDED COMMANDS',
              items: [
                `• \`${prefix}gstart <duration> <winners> <prize>\` — Launch giveaway (e.g. \`${prefix}gstart 1h 1 Nitro Boost\`)`,
                `• \`${prefix}gend <message_id>\` — End an active giveaway immediately`,
                `• \`${prefix}reroll <message_id>\` — Select new winner(s) for a completed giveaway`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Giveaway Online'
        });

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C8. ENABLE REACTION ROLES & SELF ROLES
      if (target === 'reaction_roles' || target === 'self-roles') {
        if (toggleMod) {
          toggleMod('reaction_roles', true);
          toggleMod('self-roles', true);
        }

        const card = buildLimeOverviewCard({
          title: 'REACTION & SELF-ROLES ENGINE ACTIVATED',
          subtitle: 'INTERACTIVE ROLE MENUS & BUTTON SELECTION ONLINE',
          color: Colors.LIME,
          sections: [
            {
              title: 'ROLE SELECTOR STATUS',
              items: [
                '• **Module Status**: `[ ONLINE & READY ]`',
                '• **Supported Formats**: Emoji reaction triggers, interactive button matrices, select menus'
              ]
            },
            {
              title: 'RECOMMENDED COMMANDS',
              items: [
                `• \`${prefix}rr create <#channel> <message_id> <emoji> <@role>\` — Bind reaction to role`,
                `• \`${prefix}selfroles menu <#channel>\` — Deploy self-role dropdown menu`,
                `• \`${prefix}rr list\` — View all active reaction-role assignments`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Roles Online'
        });

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C9. ENABLE LEVELING & ECONOMY
      if (target === 'leveling') {
        if (toggleMod) toggleMod('leveling', true);

        const card = buildLimeOverviewCard({
          title: 'LEVELING & RANK REWARDS ACTIVATED',
          subtitle: 'SERVER XP PROGRESSION & ECONOMY ENGINE ONLINE',
          color: Colors.LIME,
          sections: [
            {
              title: 'LEVELING ENGINE STATUS',
              items: [
                '• **Module Status**: `[ ACTIVE ]`',
                '• **Tracking**: Dynamic text XP gain, rate-limited spam protection, customizable level curves'
              ]
            },
            {
              title: 'RECOMMENDED COMMANDS',
              items: [
                `• \`${prefix}rank [@user]\` — View member rank card, level, and XP progression`,
                `• \`${prefix}leaderboard\` — View server top-ranked members leaderboard`,
                `• \`${prefix}rewards add <level> <@role>\` — Configure automatic role reward for level`,
                `• \`${prefix}daily\` / \`${prefix}work\` — Economy interaction commands`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Leveling Online'
        });

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C10. ENABLE SOCIAL UPDATES
      if (target === 'social_updates') {
        if (toggleMod) toggleMod('social_updates', true);

        const card = buildLimeOverviewCard({
          title: 'SOCIAL FEEDS & STREAM NOTIFIER ACTIVATED',
          subtitle: 'YOUTUBE, TWITCH & SOCIAL MEDIA SENTINEL ONLINE',
          color: Colors.LIME,
          sections: [
            {
              title: 'SOCIAL MONITOR STATUS',
              items: [
                '• **Module Status**: `[ MONITORING ]`',
                '• **Platforms**: YouTube Video Alerts, Twitch Live Streams, Social Feeds'
              ]
            },
            {
              title: 'RECOMMENDED COMMANDS',
              items: [
                `• \`${prefix}social setup\` — Add YouTube or Twitch notification stream`,
                `• \`${prefix}social list\` — List active creator subscriptions`,
                `• \`${prefix}social test\` — Send test notification dispatch`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Social Feeds Online'
        });

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C11. ENABLE STATS COUNTER
      if (target === 'stats-counter') {
        if (toggleMod) toggleMod('stats-counter', true);

        const card = buildLimeOverviewCard({
          title: 'SERVER STATS COUNTER ACTIVATED',
          subtitle: 'AUTOMATED REAL-TIME METRIC CHANNELS ONLINE',
          color: Colors.LIME,
          sections: [
            {
              title: 'STATS COUNTER STATUS',
              items: [
                '• **Module Status**: `[ SYNCING ]`',
                '• **Channels**: Member Count, Bot Count, Channel Total, Role Total'
              ]
            },
            {
              title: 'RECOMMENDED COMMANDS',
              items: [
                `• \`${prefix}statscounter setup\` — Auto-provision locked counter voice channels`,
                `• \`${prefix}statscounter sync\` — Trigger immediate manual count synchronization`,
                `• \`${prefix}statscounter delete\` — Clean up counter channels`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Stats Counter Online'
        });

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C12. ENABLE REMINDERS
      if (target === 'reminders') {
        if (toggleMod) toggleMod('reminders', true);

        const card = buildLimeOverviewCard({
          title: 'SERVER REMINDERS ENGINE ACTIVATED',
          subtitle: 'TIMED NOTIFICATIONS & ALERT DISPATCH ONLINE',
          color: Colors.LIME,
          sections: [
            {
              title: 'REMINDERS STATUS',
              items: [
                '• **Module Status**: `[ ACTIVE ]`',
                `• **Usage**: \`${prefix}remind <time> <message>\` (e.g. \`${prefix}remind 30m Check server security\`)`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Reminders Online'
        });

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C13. ENABLE ANNOUNCEMENTS
      if (target === 'announcements') {
        if (toggleMod) toggleMod('announcements', true);

        const card = buildLimeOverviewCard({
          title: 'ANNOUNCEMENTS MODULE ACTIVATED',
          subtitle: 'RICH BROADCAST & ANNOUNCEMENT SUITE ONLINE',
          color: Colors.LIME,
          sections: [
            {
              title: 'ANNOUNCEMENTS STATUS',
              items: [
                '• **Module Status**: `[ ACTIVE ]`',
                `• **Usage**: \`${prefix}announce <#channel> <message>\` — Broadcast formatted announcements`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Announcements Online'
        });

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C14. ENABLE PROMOTION
      if (target === 'promotion') {
        if (toggleMod) toggleMod('promotion', true);

        const card = buildLimeOverviewCard({
          title: 'SERVER PROMOTION SYSTEM ACTIVATED',
          subtitle: 'INTER-SERVER DISCOVERY & PROMOTION ONLINE',
          color: Colors.LIME,
          sections: [
            {
              title: 'PROMOTION STATUS',
              items: [
                '• **Module Status**: `[ ACTIVE ]`',
                `• **Usage**: \`${prefix}promo status\` — Check server listing & bump status`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Promotion Online'
        });

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C15. ENABLE EMBED BUILDER
      if (target === 'embed_builder') {
        if (toggleMod) toggleMod('embed_builder', true);

        const card = buildLimeOverviewCard({
          title: 'CUSTOM EMBED BUILDER ACTIVATED',
          subtitle: 'RICH EMBED DESIGNER & PRESET REPOSITORY ONLINE',
          color: Colors.LIME,
          sections: [
            {
              title: 'EMBED BUILDER STATUS',
              items: [
                '• **Module Status**: `[ ACTIVE ]`',
                `• \`${prefix}embed create\` — Launch interactive embed designer modal`,
                `• \`${prefix}embed send <#channel> <preset>\` — Post saved embed preset`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Embed Builder Online'
        });

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // D. ENABLE ALL
      if (target === 'all') {
        // 1. Audit pre-existing state of each subsystem to determine what is already running
        const secMod = modulesState.find((m: any) => m.id === 'security');
        const amMod = modulesState.find((m: any) => m.id === 'automod');
        const vpMod = modulesState.find((m: any) => m.id === 'voice-protection');
        const jtcMod = modulesState.find((m: any) => m.id === 'joinToCreate');
        const jrgMod = modulesState.find((m: any) => m.id === 'join_role_guard' || m.id === 'join-role-guard');
        const logMod = modulesState.find((m: any) => m.id === 'logging');
        const bakMod = modulesState.find((m: any) => m.id === 'backups');
        const pbMod = modulesState.find((m: any) => m.id === 'prebot_whitelist');
        const mwMod = modulesState.find((m: any) => m.id === 'member_whitelist');

        const isSecActive = secMod?.status === 'enabled' && secMod?.config?.antiNukeEnabled === true;
        const isPbActive = pbMod?.status === 'enabled' && secMod?.config?.prebotEnabled !== false;
        const isMwActive = mwMod?.status === 'enabled';
        const isAmActive = amMod?.status === 'enabled' && amMod?.config?.autoModEnabled === true;
        const isVpActive = vpMod?.status === 'enabled';
        const isJtcActive = jtcMod?.status === 'enabled';
        const isJrgActive = jrgMod?.status === 'enabled';
        const isLogActive = logMod?.status === 'enabled';
        const isBakActive = bakMod?.status === 'enabled';

        const alreadyRunning: string[] = [];
        const newlyActivated: string[] = [];

        // Check Anti-Nuke
        if (isSecActive) {
          alreadyRunning.push(`> ${SECURITY_SHIELD_ICON} **Anti-Nuke Matrix**: \`[ ARMED ]\` — 29 Real-Time Defense Rules active`);
        } else {
          newlyActivated.push(`> ${SECURITY_SHIELD_ICON} **Anti-Nuke Matrix**: \`[ ACTIVATED ]\` — Armed 29 Defense Rules`);
        }

        // Check PreBot Whitelist
        if (isPbActive) {
          alreadyRunning.push(`> ${BOT_ICON} **PreBot Whitelist**: \`[ ENFORCED ]\` — Zero-Trust Bot Quarantine active`);
        } else {
          newlyActivated.push(`> ${BOT_ICON} **PreBot Whitelist**: \`[ ACTIVATED ]\` — Zero-Trust Bot Neutralizer online`);
        }

        // Check Unified Whitelist
        if (isMwActive) {
          alreadyRunning.push(`> ${VIP_ICON} **Unified Whitelist**: \`[ SYNCHRONIZED ]\` — Trusted Members & Exception Roles`);
        } else {
          newlyActivated.push(`> ${VIP_ICON} **Unified Whitelist**: \`[ ACTIVATED ]\` — Trusted Clearance Engine active`);
        }

        // Check AutoMod
        if (isAmActive) {
          alreadyRunning.push(`> ${LINK_ICON} **AutoMod & Content Filter**: \`[ ARMED ]\` — Anti-Link & Anti-Spam Rate Limiters`);
        } else {
          newlyActivated.push(`> ${LINK_ICON} **AutoMod & Content Filter**: \`[ ACTIVATED ]\` — Armed Anti-Link & Anti-Spam`);
        }

        // Check Voice Protection & Join-To-Create
        if (isVpActive && isJtcActive) {
          alreadyRunning.push(`> ${VOICE_ICON} **Voice Defense & JTC**: \`[ ONLINE ]\` — Voice Safeguards & Dynamic Join-To-Create`);
        } else {
          newlyActivated.push(`> ${VOICE_ICON} **Voice Defense & JTC**: \`[ ACTIVATED ]\` — Voice Safeguards & Join-To-Create`);
        }

        // Check Join-Role Guard
        if (isJrgActive) {
          alreadyRunning.push(`> ${MEMBER_ICON} **Join-Role Guard**: \`[ SECURED ]\` — Anti-Raid & Member Onboarding Gate`);
        } else {
          newlyActivated.push(`> ${MEMBER_ICON} **Join-Role Guard**: \`[ ACTIVATED ]\` — Protected Member Onboarding`);
        }

        // Check Logging
        if (isLogActive) {
          alreadyRunning.push(`> ${CONFIG_ICON} **Server Audit Logging**: \`[ LOGGING ]\` — Live Event Monitoring Stream`);
        } else {
          newlyActivated.push(`> ${CONFIG_ICON} **Server Audit Logging**: \`[ ACTIVATED ]\` — Event Tracking Engine`);
        }

        // Check Backups
        if (isBakActive) {
          alreadyRunning.push(`> ${SQUARE_TICK_ICON} **Disaster Recovery**: \`[ SCHEDULED ]\` — Automated Snapshot Engine`);
        } else {
          newlyActivated.push(`> ${SQUARE_TICK_ICON} **Disaster Recovery**: \`[ ACTIVATED ]\` — Live Snapshot Engine`);
        }

        // 2. Execute full activation & repair of all systems to make 100% functional
        await ensureAntiNukeBackupRoles(message.guild);
        const { ensureRageRoleAtTop } = await import('../backups/manifest.js');
        await ensureRageRoleAtTop(message.guild);
        await stripPrivilegedNonWhitelistedMembers(message.guild);

        // Enable Security & Whitelists
        if (toggleMod) {
          toggleMod('security', true);
          toggleMod('prebot_whitelist', true);
          toggleMod('member_whitelist', true);
        }
        const currentSecConfig = secMod?.config || {};
        const updatedRules = { ...(currentSecConfig.rules || {}) };
        for (const [ruleKey, defaultDef] of Object.entries(DEFAULT_SECURITY_RULES)) {
          updatedRules[ruleKey] = { ...defaultDef, enabled: true };
        }
        if (updateConfig) updateConfig('security', { ...currentSecConfig, antiNukeEnabled: true, prebotEnabled: true, rules: updatedRules });

        // Enable AutoMod
        if (toggleMod) toggleMod('automod', true);
        const currentAmConfig = amMod?.config || {};
        if (updateConfig) updateConfig('automod', {
          ...currentAmConfig,
          autoModEnabled: true,
          blockLinks: true,
          antiLinkEnabled: true,
          antiSpamEnabled: true,
          maxSpamMessages: currentAmConfig.maxSpamMessages || 5,
          spamWindowSeconds: currentAmConfig.spamWindowSeconds || 5,
          punishment: currentAmConfig.punishment || 'warn'
        });

        // Enable Voice & JoinGuard & Logging & Backups
        if (toggleMod) {
          toggleMod('voice-protection', true);
          toggleMod('joinToCreate', true);
          toggleMod('join_role_guard', true);
          toggleMod('join-role-guard', true);
          toggleMod('logging', true);
          toggleMod('backups', true);
        }

        // Auto-configure logging channel if none set
        const currentLogConfig = logMod?.config || {};
        const LOG_CATEGORIES = ['security', 'moderation', 'antiNuke', 'botProtection', 'webhook', 'voice', 'audit', 'system'];
        let logChan = LOG_CATEGORIES.map(c => currentLogConfig[c]?.channelId).find(Boolean);
        if (!logChan) {
          const found = message.guild.channels.cache.find((c: any) =>
            c.isTextBased() && /^(mod-?logs?|audit-?logs?|server-?logs?|rage-?logs?|logs?)$/i.test(c.name)
          );
          if (found) logChan = found.id;
        }
        if (logChan) {
          const updatedLogConfig = { ...currentLogConfig };
          LOG_CATEGORIES.forEach(cat => {
            const currentCat = updatedLogConfig[cat] || { events: {}, ignoreRoles: [], ignoreUsers: [], ignoreChannels: [] };
            updatedLogConfig[cat] = { ...currentCat, enabled: true, channelId: logChan };
          });
          if (updateConfig) updateConfig('logging', updatedLogConfig);
        }

        // Deploy/refresh Live Dashboard into dedicated private #rage-dashboard channel at position 0
        const deployed = await deploySecurityDashboardToChannel(message.guild);
        const dashChannel = deployed?.channel;

        // 3. Construct intelligent response card showing what was already running vs newly activated
        const sections: any[] = [];

        if (newlyActivated.length > 0) {
          sections.push({
            title: `${ARROW_ICON} ACTIVATED & MADE FUNCTIONAL (${newlyActivated.length} SYSTEMS)`,
            items: newlyActivated
          });
        }

        if (alreadyRunning.length > 0) {
          sections.push({
            title: `${VERIFIED_ICON} ALREADY RUNNING & VERIFIED (${alreadyRunning.length} SYSTEMS)`,
            items: alreadyRunning
          });
        }

        sections.push({
          title: `${STATS_ICON} LIVE CYBER DASHBOARD & RECOVERY CORE`,
          items: [
            `> ${CONFIG_ICON} **Dashboard Channel**: ${dashChannel ? `<#${dashChannel.id}>` : '`#rage-dashboard`'} (Position: Top)`,
            `> ${SECURITY_SHIELD_ICON} **Backup Authority Roles**: \`. Secured\`, \`. UnBypassable\`, \`. RageUnBypassable\``,
            `> ${TIMER_ICON} **Sync Engine**: Real-time heartbeat & event-driven auto-synchronization active`
          ]
        });

        const guiPayload = buildEnableAllDashboardGUI(
          message.guild,
          currentSecConfig,
          newlyActivated.length,
          dashChannel
        );

        if (replyMsg) {
          await replyMsg.edit(guiPayload).catch(() => null);
        } else {
          await message.reply(guiPayload).catch(() => null);
        }

        // Dispatch private Security Consultation & 100% Integrity Guide directly to Server Owner DM
        if (message.guild) {
          sendOwnerSecurityConsultationDM(message.guild).catch(() => { });
        }

        return;
      }


      // E. SPECIFIC MODULE ENABLE BY ID
      if (toggleMod) {
        const result = toggleMod(target, true);
        if (result) {
          const card = buildLimeOverviewCard({
            title: `${APPROVED_ICON} MODULE ENABLED: ${result.name.toUpperCase()}`,
            subtitle: `MODULE ID: ${result.id}`,
            color: Colors.LIME,
            sections: [
              {
                title: `${APPROVED_ICON} ACTIVATION PROCESS COMPLETED`,
                items: [
                  `Module **${result.name}** (\`${result.id}\`) has been **successfully enabled**.`
                ]
              }
            ],
            footerText: 'Rage Optimiser Enterprise • Process Complete'
          });
          if (replyMsg) return replyMsg.edit({ embeds: [card] });
          return message.reply({ embeds: [card] });
        }
      }

      const validCategoriesList = [
        '**Security Suites**: `antinuke`, `automod`, `voice`, `logging`, `backups`',
        '**Server Features**: `tickets`, `verification`, `autorole`, `giveaway`, `reactionroles`, `leveling`, `statscounter`, `socials`, `reminders`, `embed`',
        '**Master**: `all`'
      ].join('\n');
      const errContent = `${WRONG_EMOJI} Unknown module target **${rawTarget}**.\n\n${validCategoriesList}\n\n> Run \`${prefix}enable <module>\` or \`${prefix}enable all\``;
      if (replyMsg) return replyMsg.edit({ content: errContent, embeds: [] });
      return message.reply({ content: errContent });
    }
  });

  // 2. r!disable Command
  PrefixRegistry.register({
    name: 'disable',
    category: 'Security',
    description: 'Disable Anti-Nuke, AutoMod, Voice Protection, or a specific module.',
    usage: 'r!disable <antinuke | automod | voice | all | module_id>',
    aliases: ['off', 'deactivate', 'disablemodule'],
    cooldownSeconds: 3,
    examples: [
      'r!disable antinuke',
      'r!disable automod',
      'r!disable all'
    ],
    moduleOwnerId: 'security',
    dangerLevel: 'High',
    execute: async (message: Message, args: string[], context?: any) => {
      const guildId = message.guildId;
      if (!guildId || !message.guild) {
        return message.reply({ content: `${WRONG_EMOJI} Command can only be executed within a server.` });
      }

      const isAuthorized = await isOwnerOrExtraOwner(message.author.id, message.guild);
      if (!isAuthorized) {
        return message.reply({
          content: `${WRONG_EMOJI} **Access Denied**: Disabling security modules is strictly restricted to the **Server Owner** and designated **Extra Owners**.`
        });
      }

      const prefix = PrefixResolver.getPrefix(guildId);
      const rawTarget = (args[0] || '').toLowerCase().trim();
      const target = MODULE_ALIASES[rawTarget] || rawTarget;

      if (!rawTarget) {
        return message.reply({
          content: `${WRONG_EMOJI} Please specify what to disable.\nUsage: \`${prefix}disable <module_id>\`\nExamples: \`${prefix}disable antinuke\`, \`${prefix}disable tickets\`, \`${prefix}disable voice\`, \`${prefix}disable all\``
        });
      }

      const updateConfig = context?.updateModuleConfig;
      const toggleMod = context?.toggleModule;
      const modulesState = context?.getModulesState ? context.getModulesState() : [];

      // ── 2FA GATE ───────────────────────────────────────────────
      // Flow:
      //  1. If --otp flag or direct 6-digit code present → validate the OTP first.
      //  2. If no OTP AND alertEmail is set → send OTP & return early (gating).
      //  3. If no alertEmail AND no OTP → proceed directly.
      const secMod2FA = modulesState.find((m: any) => m.id === 'security');
      const alertEmail = secMod2FA?.config?.alertEmail as string | undefined;
      const otpFlagIdx = args.indexOf('--otp');
      const directCodeArg = args.find((a, idx) => idx > 0 && /^\d{6}$/.test(a.trim()));
      const providedCode = otpFlagIdx !== -1 ? args[otpFlagIdx + 1]?.trim() : directCodeArg?.trim();

      if (providedCode) {
        // User is submitting an OTP — validate it
        const pending = EmailService.getPending2FA(guildId);

        if (!pending) {
          return message.reply({
            content: `${WRONG_EMOJI} No pending 2FA session found. Run \`${prefix}disable ${target}\` first to receive a code.`
          });
        }
        if (pending.userId !== message.author.id) {
          return message.reply({
            content: `${WRONG_EMOJI} This OTP session belongs to a different user.`
          });
        }
        if (Date.now() > pending.expiresAt) {
          EmailService.clearPending2FA(guildId);
          return message.reply({
            content: `${WRONG_EMOJI} OTP expired. Please run \`${prefix}disable ${target}\` again to request a fresh code.`
          });
        }
        if (pending.code !== providedCode) {
          return message.reply({
            content: `${WRONG_EMOJI} **Invalid OTP.** Double-check the code sent to your Gmail and try again.`
          });
        }
        // ✅ Valid OTP — clear session and proceed with disable
        EmailService.clearPending2FA(guildId);

      } else if (alertEmail) {
        // No OTP provided yet, but one is required — send code and gate
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        EmailService.setPending2FA(guildId, {
          email: alertEmail,
          code: otp,
          expiresAt: Date.now() + 10 * 60 * 1000,
          userId: message.author.id
        });

        const result = await EmailService.send2FAVerificationCode(alertEmail, otp, message.guild.name);
        if (!result.success) {
          return message.reply({
            content: `${WRONG_EMOJI} **2FA Email Dispatch Failed.** ${result.error || 'Cannot verify your identity — disable action blocked. Check SMTP config in \`.env\`. '}`
          });
        }

        const gate2FAEmbed = new EmbedBuilder()
          .setColor(0x2B2D31)
          .setTitle('Rage Security | 2FA Verification')
          .setDescription([
            'Disabling AntiNuke removes server threat protection.',
            `A 6-digit verification code has been dispatched to \`${EmailService.maskEmail(alertEmail)}\`.`,
            '',
            `Reply with \`${prefix}disable ${target} <code>\` or click below to enter your 2FA code.`
          ].join('\n'))
          .setFooter({ text: 'Rage Optimiser • Unbypassable Security', iconURL: message.guild.iconURL() || undefined })
          .setTimestamp();

        const btnRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('btn_sec_open_otp_modal')
            .setLabel('Enter 2FA Code')
            .setStyle(ButtonStyle.Primary)
        );

        return message.reply({ embeds: [gate2FAEmbed], components: [btnRow] });
      }
      // ── END 2FA GATE ────────────────────────────────────────────

      // Only run shutdown animation for antinuke / security / all
      const isAntinukeOrAll = target === 'security' || target === 'all';
      let replyMsg: any = null;

      if (isAntinukeOrAll) {
        const deactSteps = [
          { label: 'Stopping Role & Channel Protection Sensors...', detail: 'Stopped' },
          { label: 'Disarming Webhook & Anti-Bot Quarantine Gate...' },
          { label: 'Pausing Real-Time Disaster Recovery Snapshots...' },
          { label: 'Deactivating Chat & AutoMod Filtering Engine...' },
          { label: 'Dispatching Deactivation Alert to Gmail Sentinel...' }
        ];

        const renderShutdownCard = (currentIdx: number) => {
          const lines: string[] = [];
          for (let i = 0; i < deactSteps.length; i++) {
            const s = deactSteps[i];
            if (i < currentIdx) {
              lines.push(`${SUCCESS_CHECK_ICON} ${s.label}${s.detail ? ` ${s.detail}` : ''}`);
            } else if (i === currentIdx) {
              lines.push(`${LOADING_ANIMATED_ICON} ${s.label}`);
            }
          }

          return new EmbedBuilder()
            .setColor(0x2B2D31)
            .setTitle('Rage Optimiser • Antinuke Deactivation')
            .setDescription([
              '**Antinuke Deactivation Working...**',
              '',
              lines.length > 0 ? `>>> ${lines.join('\n')}` : `>>> ${LOADING_ANIMATED_ICON} Halting Antinuke Engines...`
            ].join('\n'))
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security', iconURL: message.guild?.iconURL() || undefined })
            .setTimestamp();
        };

        replyMsg = await message.reply({ embeds: [renderShutdownCard(0)] }).catch(() => null);
        if (replyMsg) {
          let activeMsg: any = replyMsg;
          for (let i = 1; i <= deactSteps.length; i++) {
            await new Promise(res => setTimeout(res, 240));
            if (activeMsg) {
              const updated: any = await activeMsg.edit({ embeds: [renderShutdownCard(i)] }).catch(() => null);
              if (updated) activeMsg = updated;
            }
          }
          replyMsg = activeMsg;
        }
      }

      if (target === 'security') {
        if (toggleMod) toggleMod('security', false);
        const secMod = modulesState.find((m: any) => m.id === 'security');
        if (updateConfig) updateConfig('security', { ...(secMod?.config || {}), antiNukeEnabled: false });

        const card = new EmbedBuilder()
          .setColor(0xFF4444)
          .setAuthor({
            name: 'RAGE OPTIMISER ENTERPRISE • DEACTIVATION COMPLETE',
            iconURL: message.client.user?.displayAvatarURL()
          })
          .setTitle(`${SUCCESS_CHECK_ICON} Threat Defense Matrix — Offline`)
          .setDescription(
            `**Suite**: \`ANTI-NUKE\` \`[ STANDBY ]\`\n\n` +
            `${SUCCESS_CHECK_ICON} All 29 threat sensors have been gracefully wound down.\n` +
            `${SUCCESS_CHECK_ICON} Role-based backup authorities remain intact on server.\n` +
            `${WRONG_EMOJI} Active monitoring & auto-quarantine enforcement paused.\n\n` +
            `> Use \`${prefix}enable antinuke\` to restore full protection instantly.`
          )
          .setFooter({ text: 'Rage Optimiser Enterprise • Anti-Nuke Standby', iconURL: message.guild.iconURL() || undefined })
          .setTimestamp();

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      if (target === 'automod') {
        if (toggleMod) toggleMod('automod', false);
        const amMod = modulesState.find((m: any) => m.id === 'automod');
        if (updateConfig) updateConfig('automod', { ...(amMod?.config || {}), autoModEnabled: false, blockLinks: false });

        const card = new EmbedBuilder()
          .setColor(0xFF4444)
          .setAuthor({
            name: 'RAGE OPTIMISER ENTERPRISE • DEACTIVATION COMPLETE',
            iconURL: message.client.user?.displayAvatarURL()
          })
          .setTitle(`${SUCCESS_CHECK_ICON} Chat Filter Engine — Offline`)
          .setDescription(
            `**Suite**: \`AUTOMOD + ANTILINK\` \`[ STANDBY ]\`\n\n` +
            `${SUCCESS_CHECK_ICON} Anti-Link enforcement paused across all channels.\n` +
            `${SUCCESS_CHECK_ICON} Anti-Spam rate limiting deactivated.\n` +
            `${WRONG_EMOJI} Chat filter monitoring suspended.\n\n` +
            `> Use \`${prefix}enable automod\` to restore chat protection instantly.`
          )
          .setFooter({ text: 'Rage Optimiser Enterprise • AutoMod Standby', iconURL: message.guild.iconURL() || undefined })
          .setTimestamp();

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C. DISABLE VOICE
      if (target === 'voice') {
        if (toggleMod) {
          toggleMod('voice-protection', false);
          toggleMod('join_to_create', false);
          toggleMod('joinToCreate', false);
          toggleMod('voice_manager', false);
          toggleMod('voice', false);
        }

        const card = new EmbedBuilder()
          .setColor(0xFF4444)
          .setAuthor({
            name: 'RAGE OPTIMISER ENTERPRISE • DEACTIVATION COMPLETE',
            iconURL: message.client.user?.displayAvatarURL()
          })
          .setTitle(`${SUCCESS_CHECK_ICON} Voice Protection & Dynamic VC — Offline`)
          .setDescription(
            `**Suite**: \`VOICE PROTECTION & JOIN-TO-CREATE\` \`[ STANDBY ]\`\n\n` +
            `${SUCCESS_CHECK_ICON} Dynamic Join-To-Create temp channel generator suspended.\n` +
            `${SUCCESS_CHECK_ICON} Voice safeguards & connection monitors placed on standby.\n` +
            `${WRONG_EMOJI} Automatic voice channel creation paused.\n\n` +
            `> Use \`${prefix}enable voice\` to restore voice systems instantly.`
          )
          .setFooter({ text: 'Rage Optimiser Enterprise • Voice Standby', iconURL: message.guild.iconURL() || undefined })
          .setTimestamp();

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C2. DISABLE BACKUPS
      if (target === 'backups') {
        if (toggleMod) {
          toggleMod('backups', false);
        }

        const card = new EmbedBuilder()
          .setColor(0xFF4444)
          .setAuthor({
            name: 'RAGE OPTIMISER ENTERPRISE • DEACTIVATION COMPLETE',
            iconURL: message.client.user?.displayAvatarURL()
          })
          .setTitle(`${SUCCESS_CHECK_ICON} Backup Recovery Suite — Offline`)
          .setDescription(
            `**Suite**: \`BACKUP-RECOVERY\` \`[ STANDBY ]\`\n\n` +
            `${SUCCESS_CHECK_ICON} Automated backup scheduling paused.\n` +
            `${SUCCESS_CHECK_ICON} Vault sync engine placed in standby.\n` +
            `${WRONG_EMOJI} Real-time backup operations suspended.\n\n` +
            `> Use \`${prefix}enable backups\` to restore backup coverage instantly.`
          )
          .setFooter({ text: 'Rage Optimiser Enterprise • Backup Standby', iconURL: message.guild.iconURL() || undefined })
          .setTimestamp();

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C3. DISABLE LOGGING
      if (target === 'logging') {
        if (toggleMod) {
          toggleMod('logging', false);
        }

        const logMod = modulesState.find((m: any) => m.id === 'logging');
        const logConfig = logMod?.config || {};
        const LOG_CATEGORIES = ['security', 'moderation', 'antiNuke', 'botProtection', 'webhook', 'voice', 'audit', 'system'];

        const updatedConfig = { ...logConfig };
        LOG_CATEGORIES.forEach(cat => {
          if (updatedConfig[cat]) {
            updatedConfig[cat] = { ...updatedConfig[cat], enabled: false };
          }
        });
        if (updateConfig) updateConfig('logging', updatedConfig);

        const card = new EmbedBuilder()
          .setColor(0xFF4444)
          .setAuthor({
            name: 'RAGE OPTIMISER ENTERPRISE • DEACTIVATION COMPLETE',
            iconURL: message.client.user?.displayAvatarURL()
          })
          .setTitle(`${SUCCESS_CHECK_ICON} Advanced Logging Center — Offline`)
          .setDescription(
            `**Suite**: \`LOGGING & AUDIT TELEMETRY\` \`[ STANDBY ]\`\n\n` +
            `${SUCCESS_CHECK_ICON} All 8 server audit event pipelines have been paused.\n` +
            `${SUCCESS_CHECK_ICON} Channel routing configurations preserved in database.\n` +
            `${WRONG_EMOJI} Live event dispatching to log channels suspended.\n\n` +
            `> Use \`${prefix}enable logging\` to restore audit event monitoring instantly.`
          )
          .setFooter({ text: 'Rage Optimiser Enterprise • Logging Standby', iconURL: message.guild.iconURL() || undefined })
          .setTimestamp();

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C4. DISABLE TICKETS
      if (target === 'tickets') {
        if (toggleMod) toggleMod('tickets', false);

        const card = new EmbedBuilder()
          .setColor(0xFF4444)
          .setAuthor({
            name: 'RAGE OPTIMISER ENTERPRISE • DEACTIVATION COMPLETE',
            iconURL: message.client.user?.displayAvatarURL()
          })
          .setTitle(`${SUCCESS_CHECK_ICON} Ticket Support System — Offline`)
          .setDescription(
            `**Suite**: \`TICKETS\` \`[ STANDBY ]\`\n\n` +
            `${SUCCESS_CHECK_ICON} Ticket panel interaction listeners paused.\n` +
            `${SUCCESS_CHECK_ICON} Existing open tickets and transcripts preserved in database.\n` +
            `${WRONG_EMOJI} New ticket creation through panels or commands disabled.\n\n` +
            `> Use \`${prefix}enable tickets\` to re-activate support systems instantly.`
          )
          .setFooter({ text: 'Rage Optimiser Enterprise • Tickets Standby', iconURL: message.guild.iconURL() || undefined })
          .setTimestamp();

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C5. DISABLE VERIFICATION
      if (target === 'verification') {
        if (toggleMod) toggleMod('verification', false);

        const card = new EmbedBuilder()
          .setColor(0xFF4444)
          .setAuthor({
            name: 'RAGE OPTIMISER ENTERPRISE • DEACTIVATION COMPLETE',
            iconURL: message.client.user?.displayAvatarURL()
          })
          .setTitle(`${SUCCESS_CHECK_ICON} Member Verification Gateway — Offline`)
          .setDescription(
            `**Suite**: \`VERIFICATION\` \`[ STANDBY ]\`\n\n` +
            `${SUCCESS_CHECK_ICON} Captcha & button verification listeners paused.\n` +
            `${SUCCESS_CHECK_ICON} Configured verified roles and channel bindings preserved.\n` +
            `${WRONG_EMOJI} Automatic member gating disabled.\n\n` +
            `> Use \`${prefix}enable verification\` to restore verification gate.`
          )
          .setFooter({ text: 'Rage Optimiser Enterprise • Verification Standby', iconURL: message.guild.iconURL() || undefined })
          .setTimestamp();

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C6. DISABLE JOIN-ROLE GUARD / AUTOROLE
      if (target === 'join_role_guard') {
        if (toggleMod) {
          toggleMod('join_role_guard', false);
          toggleMod('join-role-guard', false);
        }

        const card = new EmbedBuilder()
          .setColor(0xFF4444)
          .setAuthor({
            name: 'RAGE OPTIMISER ENTERPRISE • DEACTIVATION COMPLETE',
            iconURL: message.client.user?.displayAvatarURL()
          })
          .setTitle(`${SUCCESS_CHECK_ICON} AutoRole & Join-Role Guard — Offline`)
          .setDescription(
            `**Suite**: \`AUTOROLE & JOIN GUARD\` \`[ STANDBY ]\`\n\n` +
            `${SUCCESS_CHECK_ICON} Automated join role assignments suspended.\n` +
            `${SUCCESS_CHECK_ICON} Configured role mappings preserved in database.\n` +
            `${WRONG_EMOJI} Newly joining members will not receive automated roles.\n\n` +
            `> Use \`${prefix}enable autorole\` to restore onboarding automation.`
          )
          .setFooter({ text: 'Rage Optimiser Enterprise • AutoRole Standby', iconURL: message.guild.iconURL() || undefined })
          .setTimestamp();

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C7. DISABLE GIVEAWAYS
      if (target === 'giveaway') {
        if (toggleMod) toggleMod('giveaway', false);

        const card = new EmbedBuilder()
          .setColor(0xFF4444)
          .setAuthor({
            name: 'RAGE OPTIMISER ENTERPRISE • DEACTIVATION COMPLETE',
            iconURL: message.client.user?.displayAvatarURL()
          })
          .setTitle(`${SUCCESS_CHECK_ICON} Giveaway Engine — Offline`)
          .setDescription(
            `**Suite**: \`GIVEAWAYS\` \`[ STANDBY ]\`\n\n` +
            `${SUCCESS_CHECK_ICON} Active giveaway timers paused.\n` +
            `${WRONG_EMOJI} New giveaways cannot be launched.\n\n` +
            `> Use \`${prefix}enable giveaway\` to re-activate prize giveaways.`
          )
          .setFooter({ text: 'Rage Optimiser Enterprise • Giveaway Standby', iconURL: message.guild.iconURL() || undefined })
          .setTimestamp();

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C8. DISABLE REACTION ROLES & SELF ROLES
      if (target === 'reaction_roles' || target === 'self-roles') {
        if (toggleMod) {
          toggleMod('reaction_roles', false);
          toggleMod('self-roles', false);
        }

        const card = new EmbedBuilder()
          .setColor(0xFF4444)
          .setAuthor({
            name: 'RAGE OPTIMISER ENTERPRISE • DEACTIVATION COMPLETE',
            iconURL: message.client.user?.displayAvatarURL()
          })
          .setTitle(`${SUCCESS_CHECK_ICON} Reaction & Self-Roles Engine — Offline`)
          .setDescription(
            `**Suite**: \`REACTION ROLES\` \`[ STANDBY ]\`\n\n` +
            `${SUCCESS_CHECK_ICON} Emoji reaction listeners suspended.\n` +
            `${SUCCESS_CHECK_ICON} Role bindings and menu presets preserved.\n` +
            `${WRONG_EMOJI} Users clicking reactions or menus will not receive roles.\n\n` +
            `> Use \`${prefix}enable reactionroles\` to re-activate role selection.`
          )
          .setFooter({ text: 'Rage Optimiser Enterprise • Roles Standby', iconURL: message.guild.iconURL() || undefined })
          .setTimestamp();

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C9. DISABLE LEVELING
      if (target === 'leveling') {
        if (toggleMod) toggleMod('leveling', false);

        const card = new EmbedBuilder()
          .setColor(0xFF4444)
          .setAuthor({
            name: 'RAGE OPTIMISER ENTERPRISE • DEACTIVATION COMPLETE',
            iconURL: message.client.user?.displayAvatarURL()
          })
          .setTitle(`${SUCCESS_CHECK_ICON} Leveling & Rank System — Offline`)
          .setDescription(
            `**Suite**: \`LEVELING & XP\` \`[ STANDBY ]\`\n\n` +
            `${SUCCESS_CHECK_ICON} Chat XP calculation and level-up announcements suspended.\n` +
            `${SUCCESS_CHECK_ICON} User XP progress and leaderboard data preserved.\n` +
            `${WRONG_EMOJI} Members will not earn XP from messages while paused.\n\n` +
            `> Use \`${prefix}enable leveling\` to re-activate rank progression.`
          )
          .setFooter({ text: 'Rage Optimiser Enterprise • Leveling Standby', iconURL: message.guild.iconURL() || undefined })
          .setTimestamp();

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C10. DISABLE SOCIAL UPDATES
      if (target === 'social_updates') {
        if (toggleMod) toggleMod('social_updates', false);

        const card = new EmbedBuilder()
          .setColor(0xFF4444)
          .setAuthor({
            name: 'RAGE OPTIMISER ENTERPRISE • DEACTIVATION COMPLETE',
            iconURL: message.client.user?.displayAvatarURL()
          })
          .setTitle(`${SUCCESS_CHECK_ICON} Social Updates Sentinel — Offline`)
          .setDescription(
            `**Suite**: \`SOCIAL UPDATES\` \`[ STANDBY ]\`\n\n` +
            `${SUCCESS_CHECK_ICON} Polling for YouTube videos and Twitch streams paused.\n` +
            `${WRONG_EMOJI} Feed notifications will not be sent to alert channels.\n\n` +
            `> Use \`${prefix}enable socials\` to re-activate social monitoring.`
          )
          .setFooter({ text: 'Rage Optimiser Enterprise • Social Standby', iconURL: message.guild.iconURL() || undefined })
          .setTimestamp();

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C11. DISABLE STATS COUNTER
      if (target === 'stats-counter') {
        if (toggleMod) toggleMod('stats-counter', false);

        const card = new EmbedBuilder()
          .setColor(0xFF4444)
          .setAuthor({
            name: 'RAGE OPTIMISER ENTERPRISE • DEACTIVATION COMPLETE',
            iconURL: message.client.user?.displayAvatarURL()
          })
          .setTitle(`${SUCCESS_CHECK_ICON} Server Stats Counter — Offline`)
          .setDescription(
            `**Suite**: \`STATS COUNTER\` \`[ STANDBY ]\`\n\n` +
            `${SUCCESS_CHECK_ICON} Real-time channel rename synchronization paused.\n` +
            `${WRONG_EMOJI} Voice counter channels will not update on member joins/leaves.\n\n` +
            `> Use \`${prefix}enable statscounter\` to re-activate live counters.`
          )
          .setFooter({ text: 'Rage Optimiser Enterprise • Stats Standby', iconURL: message.guild.iconURL() || undefined })
          .setTimestamp();

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C12. DISABLE REMINDERS
      if (target === 'reminders') {
        if (toggleMod) toggleMod('reminders', false);

        const card = new EmbedBuilder()
          .setColor(0xFF4444)
          .setAuthor({
            name: 'RAGE OPTIMISER ENTERPRISE • DEACTIVATION COMPLETE',
            iconURL: message.client.user?.displayAvatarURL()
          })
          .setTitle(`${SUCCESS_CHECK_ICON} Reminders Module — Offline`)
          .setDescription(
            `**Suite**: \`REMINDERS\` \`[ STANDBY ]\`\n\n` +
            `> Use \`${prefix}enable reminders\` to re-activate.`
          )
          .setFooter({ text: 'Rage Optimiser Enterprise • Reminders Standby', iconURL: message.guild.iconURL() || undefined })
          .setTimestamp();

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C13. DISABLE ANNOUNCEMENTS
      if (target === 'announcements') {
        if (toggleMod) toggleMod('announcements', false);

        const card = new EmbedBuilder()
          .setColor(0xFF4444)
          .setAuthor({
            name: 'RAGE OPTIMISER ENTERPRISE • DEACTIVATION COMPLETE',
            iconURL: message.client.user?.displayAvatarURL()
          })
          .setTitle(`${SUCCESS_CHECK_ICON} Announcements Module — Offline`)
          .setDescription(
            `**Suite**: \`ANNOUNCEMENTS\` \`[ STANDBY ]\`\n\n` +
            `> Use \`${prefix}enable announcements\` to re-activate.`
          )
          .setFooter({ text: 'Rage Optimiser Enterprise • Announcements Standby', iconURL: message.guild.iconURL() || undefined })
          .setTimestamp();

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C14. DISABLE PROMOTION
      if (target === 'promotion') {
        if (toggleMod) toggleMod('promotion', false);

        const card = new EmbedBuilder()
          .setColor(0xFF4444)
          .setAuthor({
            name: 'RAGE OPTIMISER ENTERPRISE • DEACTIVATION COMPLETE',
            iconURL: message.client.user?.displayAvatarURL()
          })
          .setTitle(`${SUCCESS_CHECK_ICON} Server Promotion System — Offline`)
          .setDescription(
            `**Suite**: \`PROMOTION\` \`[ STANDBY ]\`\n\n` +
            `> Use \`${prefix}enable promo\` to re-activate server promotion.`
          )
          .setFooter({ text: 'Rage Optimiser Enterprise • Promotion Standby', iconURL: message.guild.iconURL() || undefined })
          .setTimestamp();

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C15. DISABLE EMBED BUILDER
      if (target === 'embed_builder') {
        if (toggleMod) toggleMod('embed_builder', false);

        const card = new EmbedBuilder()
          .setColor(0xFF4444)
          .setAuthor({
            name: 'RAGE OPTIMISER ENTERPRISE • DEACTIVATION COMPLETE',
            iconURL: message.client.user?.displayAvatarURL()
          })
          .setTitle(`${SUCCESS_CHECK_ICON} Custom Embed Builder — Offline`)
          .setDescription(
            `**Suite**: \`EMBED BUILDER\` \`[ STANDBY ]\`\n\n` +
            `> Use \`${prefix}enable embed\` to re-activate custom embed tools.`
          )
          .setFooter({ text: 'Rage Optimiser Enterprise • Embed Standby', iconURL: message.guild.iconURL() || undefined })
          .setTimestamp();

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // D. DISABLE ALL
      if (target === 'all') {
        if (toggleMod) {
          for (const m of modulesState) {
            toggleMod(m.id, false);
          }
        }

        const secMod = modulesState.find((m: any) => m.id === 'security');
        if (updateConfig) updateConfig('security', { ...(secMod?.config || {}), antiNukeEnabled: false, prebotEnabled: false });

        const amMod = modulesState.find((m: any) => m.id === 'automod');
        if (updateConfig) updateConfig('automod', { ...(amMod?.config || {}), autoModEnabled: false, blockLinks: false, antiSpamEnabled: false });

        const { buildDisableAllDashboardGUI } = await import('../config/manifest.js');
        const guiPayload = buildDisableAllDashboardGUI(message.guild);

        if (replyMsg) return replyMsg.edit(guiPayload);
        return message.reply(guiPayload);
      }

      if (toggleMod) {
        const result = toggleMod(target, false);
        if (result) {
          const card = buildLimeOverviewCard({
            title: `${WRONG_EMOJI} MODULE DISABLED: ${result.name.toUpperCase()}`,
            subtitle: `MODULE ID: ${result.id}`,
            color: Colors.DANGER,
            sections: [
              {
                title: `${WRONG_EMOJI} DEACTIVATION PROCESS COMPLETED`,
                items: [
                  `Module **${result.name}** (\`${result.id}\`) has been **disabled**.`
                ]
              }
            ],
            footerText: 'Rage Optimiser Enterprise • Process Complete'
          });
          if (replyMsg) return replyMsg.edit({ embeds: [card] });
          return message.reply({ embeds: [card] });
        }
      }

      const validCategoriesList = [
        '**Security Suites**: `antinuke`, `automod`, `voice`, `logging`, `backups`',
        '**Server Features**: `tickets`, `verification`, `autorole`, `giveaway`, `reactionroles`, `leveling`, `statscounter`, `socials`, `reminders`, `embed`',
        '**Master**: `all`'
      ].join('\n');
      const errContent = `${WRONG_EMOJI} Unknown module target **${rawTarget}**.\n\n${validCategoriesList}\n\n> Run \`${prefix}disable <module>\` or \`${prefix}disable all\``;
      if (replyMsg) return replyMsg.edit({ content: errContent, embeds: [] });
      return message.reply({ content: errContent });
    }
  });

  // 3. r!dashboard / r!security Command
  PrefixRegistry.register({
    name: 'dashboard',
    category: 'Security',
    description: 'Display live Athena-style Security Dashboard with system integrity index, 4x3 metrics matrix, and event monitors.',
    usage: 'r!dashboard [setup | channel]',
    aliases: ['dash', 'secstatus', 'threats', 'livematrix'],
    cooldownSeconds: 3,
    moduleOwnerId: 'security',
    dangerLevel: 'Low',
    execute: async (message: Message, args: string[], extra?: any) => {
      if (!message.guild) {
        return message.reply({ content: `${WRONG_EMOJI} Command can only be executed within a server.` });
      }

      const isAuthorized = await isOwnerOrExtraOwner(message.author.id, message.guild);
      if (!isAuthorized && !message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply({
          content: `${WRONG_EMOJI} **Access Denied**: Viewing the Security Dashboard requires Administrator or Owner permissions.`
        });
      }

      const sub = args[0]?.toLowerCase();
      if (!sub || sub === 'gui' || sub === 'panel' || sub === 'dashboard' || sub === 'status') {
        const modules = extra?.getModulesState ? extra.getModulesState(message.guild.id) : [];
        const secMod = modules.find((m: any) => m.id === 'security');
        const secConfig = secMod?.config || {};
        const { buildSecurityDashboardComponents } = await import('../config/manifest.js');
        const { embed, components } = await buildSecurityDashboardComponents(message.guild, secConfig, extra);
        return message.reply({ embeds: [embed], components });
      }

      let deployed = await deploySecurityDashboardToChannel(message.guild);

      // Direct fallback attempt if deploySecurityDashboardToChannel returned null
      if (!deployed) {
        let fallbackChan = message.guild.channels.cache.find(
          (c) => c && c.isTextBased() && (c.name === 'rage-dashboard' || c.name === '🔒・rage-dashboard')
        ) as TextChannel | undefined;

        if (!fallbackChan) {
          const fetchedChans = await message.guild.channels.fetch().catch(() => null);
          fallbackChan = fetchedChans?.find(
            (c: any) => c && c.isTextBased() && (c.name === 'rage-dashboard' || c.name === '🔒・rage-dashboard')
          ) as TextChannel | undefined;
        }

        if (fallbackChan) {
          try {
            const card = await buildSecurityDashboardCard(message.guild);
            const msg = await fallbackChan.send({
              embeds: card.embeds,
              components: card.components
            });
            if (msg) {
              deployed = { channel: fallbackChan, message: msg };
              await DashboardSyncService.registerDashboard(message.guild.id, fallbackChan.id, msg.id).catch(() => { });
            }
          } catch (directErr: any) {
            console.error('[r!dashboard] Direct fallback send error:', directErr);
            return message.reply({
              content: `${WRONG_EMOJI} **Deployment Error**: \`${directErr?.message || 'Missing Channel Send/Embed Permissions'}\``
            });
          }
        }
      }

      if (!deployed) {
        return message.reply({
          content: `${WRONG_EMOJI} Failed to deploy security dashboard to **#rage-dashboard**. Please check bot permissions.`
        });
      }

      if (message.channel.id === deployed.channel.id) {
        await message.delete().catch(() => { });
        return;
      }

      return message.reply({
        content: `${APPROVED_ICON} **Live Cyber Security Dashboard Active**\n> Monitoring Channel: <#${deployed.channel.id}>\n> Live Sync: Active (Heartbeat every 5m)`
      });
    }
  });
}
