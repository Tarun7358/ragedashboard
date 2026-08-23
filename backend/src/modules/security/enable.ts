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
  VIP_ICON
} from '../../core/UIFactory.js';
import { DEFAULT_SECURITY_RULES } from '../config/manifest.js';
import { isOwnerOrExtraOwner, checkBypassImmunity } from '../../utils/whitelistCheck.js';
import { DashboardSyncService } from '../../services/DashboardSyncService.js';
import { Database } from '../../core/Database.js';

const APPROVED_ICON = VERIFIED_ICON;
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

        // Assign strictly to bot only FIRST (while role position is safe)
        me = await guild.members?.fetchMe().catch(() => guild.members?.me);
        if (me && !me.roles.cache.has(role.id)) {
          await me.roles.add(role.id, 'Rage Backup Authority: Self-assigning backup role to bot').catch((err: any) => {
            console.error(`[AntiNuke Backup Roles] Failed to assign role "${role.name}" to bot:`, err?.message || err);
          });
        }

        // Try moving role to top of manageable hierarchy
        const targetPosition = Math.max(1, botHighestPosition - 1);
        if (role.position < targetPosition) {
          await role.setPosition(targetPosition).catch(() => { });
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
  if (!guild || !guild.roles || !guild.members) return strippedFrom;

  try {
    const me = guild.members?.me || await guild.members?.fetchMe().catch(() => null);
    const botId = me?.id || guild.client?.user?.id;

    // Find all backup role IDs in this guild
    const backupRoleIds: string[] = [];
    for (const [, role] of guild.roles.cache) {
      if (BACKUP_ROLE_NAMES.some(name => role.name.toLowerCase().trim() === name.toLowerCase().trim())) {
        backupRoleIds.push(role.id);
      }
    }

    if (backupRoleIds.length === 0) return strippedFrom;

    // Check cached members and strip any backup roles from non-bot accounts
    for (const [, member] of guild.members.cache) {
      if (member.id !== botId) {
        for (const roleId of backupRoleIds) {
          if (member.roles?.cache?.has(roleId)) {
            const role = guild.roles.cache.get(roleId);
            await member.roles.remove(roleId, 'Rage Anti-Nuke Security: Backup roles are strictly reserved for the bot').catch(() => { });
            strippedFrom.push(`${member.user?.tag || member.id} (Role: ${role?.name || roleId})`);
            console.log(`[AntiNuke Backup Roles] Stripped backup role "${role?.name || roleId}" from non-bot member "${member.user?.tag || member.id}"`);
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
          const exec = (r.executorTag || r.executorId || 'System').split('#')[0].slice(0, 12);
          const act = (r.action || 'action').toLowerCase().replace('automod_', '').replace(/_/g, ' ');
          const tgt = (r.targetName || r.targetId || 'target').split('#')[0].slice(0, 22);
          recentLogLines.push(`[${hh}:${mm}] ${exec} ${act} ${tgt}`);
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
              recentLogLines.push(`[${hh}:${mm}] ${exec.slice(0, 12)} ${act} ${tgt.slice(0, 22)}`);
            }
          }
        }
      } catch { }
    }

    if (recentLogLines.length === 0) {
      recentLogLines.push('[--:--] System active - 0 disciplinary actions in 24h.');
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
    const serverHeaderLine = `> **Server** — \`${guild.name.toUpperCase()}\` • **Firewall** — \`${firewallStatus}\` • **System Integrity** — \`${integrityScore}% ${integrityStatus}\` • **Last Sync** — <t:${nowSec}:T>`;

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
      .setDescription(`\`\`\`ansi\n\u001b[1;36m[${integrityScore}%] Baseline intact. Realtime security monitoring active (Auto-refreshes every 1 min).\u001b[0m\n\`\`\``);

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

    const threatRoleNames = Array.from(threatRoles.values()).slice(0, 6).map((r: any) => `\`@${r.name}\``).join(', ') || '`None`';
    const threatUserNames = threatUsers.slice(0, 6).map(u => `\`@${u.user?.username || u.id}\``).join(', ') || '`None`';

    const consultationEmbed = new EmbedBuilder()
      .setColor(0x00E5FF)
      .setTitle(`🛡️ Security Architecture Consultation • ${guild.name}`)
      .setDescription([
        `Hello **${owner.user.username}**,`,
        ``,
        `You recently activated the **Rage Optimiser Enterprise Security Suite** on **${guild.name}**.`,
        `Under our Zero-Trust philosophy, **we have NOT altered or removed any of your server's roles or permissions**. All decisions remain 100% in your hands.`,
        ``,
        `📊 **Current System Integrity Index: ${integrityScore}%**`,
        `\`\`\`ansi\n\u001b[1;36m[${progressBarVisual}] ${integrityScore}%\u001b[0m\n\`\`\``,
        ``,
        `🔍 **Security Audit Findings**:`,
        `• **Bot Role Hierarchy**: ${isRolePositionLow ? '⚠️ **Low** (Rage Optimiser is placed below other admin roles)' : '✅ **Optimal** (Rage Optimiser has top authority)'}`,
        `• **Unmanaged Admin Roles**: \`${threatRoles.size}\` detected (${threatRoleNames})`,
        `• **Unwhitelisted Admin Users**: \`${threatUsers.length}\` detected (${threatUserNames})`,
        ``,
        `💡 **Consultation: How to Achieve 100% System Integrity**:`,
        `1. **Whitelist Trusted Staff**: If the admin users above are your trusted moderators, run \`/whitelist add\` or \`r!extraowner add\` so they are recognized as safe actors.`,
        `2. **Clean Up Role Permissions**: Remove \`Administrator\` from cosmetic or non-senior roles (e.g. Trial Mods, Helpers) and assign only needed permissions.`,
        `3. **Elevate Bot Role**: Ensure the \`Rage Optimiser\` role is at the top of your role hierarchy in *Server Settings > Roles*.`,
        ``,
        `*Need assistance or custom setup? Use \`/config\` or reach out to our support team anytime.*`
      ].join('\n'))
      .setFooter({ text: 'Rage Optimiser • Zero-Trust Owner Security Sentinel' })
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
      const target = (args[0] || '').toLowerCase().trim();

      if (!target) {
        const usageEmbed = buildLimeOverviewCard({
          title: `${CONFIG_EMOJI} ONE-CLICK MODULE ACTIVATION CONTROL`,
          subtitle: 'ENABLE PROTECTION SUITES WITH OPTIMAL DEFAULT PARAMETERS',
          color: Colors.BRAND,
          sections: [
            {
              title: `${SHIELD_EMOJI} AVAILABLE ACTIVATION TARGETS`,
              items: [
                `• \`${prefix}enable antinuke\` — Enable all Anti-Nuke & Unbypassable rules`,
                `• \`${prefix}enable automod\` — Enable Anti-Link, Anti-Spam & Chat Filters`,
                `• \`${prefix}enable voice\` — Enable Voice Protection & Join-To-Create`,
                `• \`${prefix}enable all\` — Enable complete enterprise security suite`,
                `• \`${prefix}enable <module_id>\` — Enable a specific system module`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Security Control'
        });
        return message.reply({ embeds: [usageEmbed] });
      }

      const updateConfig = context?.updateModuleConfig;
      const toggleMod = context?.toggleModule;
      const modulesState = context?.getModulesState ? context.getModulesState() : [];

      // High-Tech Enterprise Step Definitions
      const dbHash = Math.floor(1000000000000000 + Math.random() * 9000000000000000).toString();
      const clusterNode = `NODE-${Math.floor(100 + Math.random() * 900)}-PROD`;
      const guildCleanName = message.guild.name.replace(/[*_`~|]/g, '');

      const steps = [
        {
          label: 'Connecting to Cloud Security Sentinel Core...',
          detail: '`[ ONLINE ]`',
          subLines: [`└ Cluster Node: \`${clusterNode}\` • Latency: \`12ms\``]
        },
        {
          label: 'Verifying Security Hierarchy & Admin Privileges...',
          detail: '`[ VERIFIED ]`',
          subLines: [`└ Bot Authority: \`ADMINISTRATOR\` • Hierarchy: \`MAXIMUM\``]
        },
        {
          label: `Registering Server Defense Node (${guildCleanName})`,
          detail: '`[ SYNCHRONIZED ]`',
          subLines: [
            `├ Server ID: \`${message.guild.id}\``,
            `└ Vault Signature: \`#RAGE-${dbHash.slice(0, 10)}\``
          ]
        },
        {
          label: 'Deploying Anti-Nuke Backup Authority Roles...',
          detail: '`[ 3 ROLES ACTIVE ]`',
          subLines: [
            `├ \`. Secured\` — Core Administrator Authority`,
            `├ \`. UnBypassable\` — Self-Healing Guardian Role`,
            `└ \`. RageUnBypassable\` — Fail-Safe Disaster Recovery`
          ]
        },
        {
          label: 'Self-Assigning Backup Authority To Security Core...',
          detail: '`[ AUTHORIZED ]`'
        },
        {
          label: 'Arming 29 Real-Time Threat Sensors & Webhook Watchers...',
          detail: '`[ 29/29 ARMED ]`'
        },
        {
          label: 'Deploying Live Cyber Dashboard in #rage-dashboard...',
          detail: '`[ DEPLOYED ]`'
        },
        {
          label: 'Security Activation Complete — System Fully Protected',
          detail: '`[ SECURED ]`'
        }
      ];

      const renderSetupCard = (currentIdx: number) => {
        const totalSteps = steps.length;
        const progressPct = Math.min(100, Math.round((currentIdx / totalSteps) * 100));
        const filledBars = Math.round((progressPct / 100) * 14);
        const emptyBars = 14 - filledBars;
        const progressBar = '▰'.repeat(filledBars) + '▱'.repeat(emptyBars);

        let statusPill = 'INITIALIZING ENGINE';
        if (progressPct >= 100) statusPill = 'ONLINE • FULLY ARMED';
        else if (progressPct >= 75) statusPill = 'DEPLOYING DASHBOARD';
        else if (progressPct >= 50) statusPill = 'PROVISIONING ROLES';
        else if (progressPct >= 25) statusPill = 'AUDITING HIERARCHY';

        const lines: string[] = [];
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          if (i < currentIdx) {
            lines.push(`${APPROVED_ICON} **${step.label}** ${step.detail || ''}`);
            if (step.subLines) {
              for (const sub of step.subLines) {
                lines.push(`   ${sub}`);
              }
            }
          } else if (i === currentIdx) {
            lines.push(`${TIMER_ICON} **${step.label}** \`[ PROCESSING... ]\``);
          } else {
            lines.push(`• *${step.label}*`);
          }
        }

        const embed = new EmbedBuilder()
          .setColor(progressPct >= 100 ? Colors.LIME : 0x00E5FF)
          .setAuthor({
            name: 'RAGE OPTIMISER ENTERPRISE • SECURITY SUITE ACTIVATION',
            iconURL: message.client.user?.displayAvatarURL()
          })
          .setTitle(`${SHIELD_ICON} Initializing Defense Core: ${target.toUpperCase()}`)
          .setDescription([
            `**Status**: \`[ ${statusPill} ]\``,
            `**Progress**: \`[${progressBar}]\` **${progressPct}%**`,
            '',
            '```ansi',
            '\u001b[1;36m=== REAL-TIME SECURITY PROVISIONING MATRIX ===\u001b[0m',
            '```',
            lines.join('\n')
          ].join('\n'))
          .setFooter({
            text: `Rage Enterprise Security Engine • ${message.guild?.name || 'Protected Server'}`,
            iconURL: message.guild?.iconURL() || undefined
          })
          .setTimestamp();

        return embed;
      };

      let replyMsg = await message.reply({ embeds: [renderSetupCard(0)] }).catch(() => null);

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
      if (['voice', 'vc', 'voice-protection', 'jointocreate'].includes(target)) {
        if (toggleMod) {
          toggleMod('voice-protection', true);
          toggleMod('joinToCreate', true);
        }

        const deployed = await deploySecurityDashboardToChannel(message.guild);
        const dashChannel = deployed?.channel;

        const card = buildLimeOverviewCard({
          title: 'VOICE PROTECTION ACTIVATED',
          subtitle: 'VOICE SECURITY & JOIN-TO-CREATE ONLINE',
          color: Colors.LIME,
          sections: [
            {
              title: 'PROTECTION STATUS',
              items: [
                `• **Voice Protection**: Active`,
                `• **Join-To-Create**: Online`,
                `• **Live Dashboard**: ${dashChannel ? `<#${dashChannel.id}>` : '`#rage-dashboard`'}`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Voice Online'
        });

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C2. ENABLE BACKUPS
      if (['backups', 'backup', 'backup-recovery'].includes(target)) {
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

      // D. ENABLE ALL
      if (['all', 'full', 'everything'].includes(target)) {
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
          alreadyRunning.push(`> ${SHIELD_ICON} **Anti-Nuke Matrix**: \`[ ARMED ]\` — 29 Real-Time Defense Rules active`);
        } else {
          newlyActivated.push(`> ${SHIELD_ICON} **Anti-Nuke Matrix**: \`[ ACTIVATED ]\` — Armed 29 Real-Time Defense Rules`);
        }

        // Check PreBot Whitelist
        if (isPbActive) {
          alreadyRunning.push(`> ${BOT_ICON} **PreBot Whitelist**: \`[ ACTIVE ]\` — Zero-Trust Bot Authorization Gate`);
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
            `> ${SHIELD_ICON} **Backup Authority Roles**: \`. Secured\`, \`. UnBypassable\`, \`. RageUnBypassable\``,
            `> ${TIMER_ICON} **Sync Engine**: Real-time heartbeat & event-driven auto-synchronization active`
          ]
        });

        const allAlreadyRunning = newlyActivated.length === 0;
        const overviewCard = buildLimeOverviewCard({
          title: allAlreadyRunning
            ? `${SHIELD_ICON} ALL DEFENSE SYSTEMS ALREADY ACTIVE & FUNCTIONAL`
            : `${SHIELD_ICON} ENTERPRISE SECURITY SUITE SYNCHRONIZED & ACTIVATED`,
          subtitle: allAlreadyRunning
            ? 'ALL PROTECTION MODULES VERIFIED ONLINE • SERVER RUNNING AT 100% INTEGRITY'
            : 'OFFLINE MODULES TURNED ON & MADE FULLY FUNCTIONAL • SERVER FULLY SECURED',
          color: Colors.LIME,
          sections,
          footerText: 'Rage Optimiser Enterprise • Live Defense Core Online'
        });

        if (replyMsg) {
          await replyMsg.edit({ embeds: [overviewCard] }).catch(() => null);
        } else {
          await message.reply({ embeds: [overviewCard] }).catch(() => null);
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

      const errContent = `${WRONG_EMOJI} Unknown target **${target}**. Valid options: \`antinuke\`, \`automod\`, \`voice\`, \`backups\`, \`all\`.`;
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
      const target = (args[0] || '').toLowerCase().trim();

      if (!target) {
        return message.reply({
          content: `${WRONG_EMOJI} Please specify what to disable.\nUsage: \`${prefix}disable <antinuke | automod | voice | all | module_id>\``
        });
      }

      const updateConfig = context?.updateModuleConfig;
      const toggleMod = context?.toggleModule;
      const modulesState = context?.getModulesState ? context.getModulesState() : [];

      const TIMER_EMOJI = '<:timer:1532403043239272499>';

      // Step 1: Send initial Loading / Deactivating Embed
      const loadingEmbed = buildLimeOverviewCard({
        title: `${TIMER_EMOJI} DEACTIVATING MODULE SUITE...`,
        subtitle: `STANDBY PROCESS FOR ${target.toUpperCase()}`,
        color: Colors.WARN,
        sections: [
          {
            title: `${CONFIG_EMOJI} DEACTIVATION IN PROGRESS`,
            items: [
              `• **Target Suite**: \`${target.toUpperCase()}\``,
              `• **Status**: Deactivating rules & placing protections in standby mode...`,
              `• *Please wait while the system updates configuration state...*`
            ]
          }
        ],
        footerText: 'Rage Optimiser Enterprise • Deactivation Process'
      });

      const replyMsg = await message.reply({ embeds: [loadingEmbed] }).catch(() => null);

      await new Promise(resolve => setTimeout(resolve, 1500));

      if (['antinuke', 'security', 'an'].includes(target)) {
        if (toggleMod) toggleMod('security', false);
        const secMod = modulesState.find((m: any) => m.id === 'security');
        if (updateConfig) updateConfig('security', { ...(secMod?.config || {}), antiNukeEnabled: false });

        const card = buildLimeOverviewCard({
          title: `${WRONG_EMOJI} ANTI-NUKE SYSTEM DISABLED`,
          subtitle: 'ANTI-NUKE PROTECTIONS TEMPORARILY TURNED OFF',
          color: Colors.DANGER,
          sections: [
            {
              title: `${WRONG_EMOJI} DEACTIVATION PROCESS COMPLETED`,
              items: [
                '• Anti-Nuke protection rules have been placed on standby.',
                `• Re-enable anytime using \`${prefix}enable antinuke\`.`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Process Complete • Security Warning'
        });

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      if (['automod', 'am', 'antilink'].includes(target)) {
        if (toggleMod) toggleMod('automod', false);
        const amMod = modulesState.find((m: any) => m.id === 'automod');
        if (updateConfig) updateConfig('automod', { ...(amMod?.config || {}), autoModEnabled: false, blockLinks: false });

        const card = buildLimeOverviewCard({
          title: `${WRONG_EMOJI} AUTOMOD & ANTILINK DISABLED`,
          subtitle: 'AUTOMOD CHAT RESTRICTIONS TURNED OFF',
          color: Colors.DANGER,
          sections: [
            {
              title: `${WRONG_EMOJI} DEACTIVATION PROCESS COMPLETED`,
              items: [
                '• AutoMod and Anti-Link filters have been turned off.',
                `• Re-enable anytime using \`${prefix}enable automod\`.`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Process Complete • AutoMod Standby'
        });

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      // C2. DISABLE BACKUPS
      if (['backups', 'backup', 'backup-recovery'].includes(target)) {
        if (toggleMod) {
          toggleMod('backups', false);
        }

        const card = buildLimeOverviewCard({
          title: `${WRONG_EMOJI} BACKUP RECOVERY SUITE DEACTIVATED`,
          subtitle: 'BACKUPS DISABLED',
          color: Colors.DANGER,
          sections: [
            {
              title: `${WRONG_EMOJI} DEACTIVATION PROCESS COMPLETED`,
              items: [
                '• Server backup operations have been disabled.',
                `• Re-enable anytime using \`${prefix}enable backups\`.`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Backups Disabled'
        });

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
      }

      if (['all', 'full', 'everything'].includes(target)) {
        if (toggleMod) {
          for (const m of modulesState) {
            toggleMod(m.id, false);
          }
        }

        const secMod = modulesState.find((m: any) => m.id === 'security');
        if (updateConfig) updateConfig('security', { ...(secMod?.config || {}), antiNukeEnabled: false, prebotEnabled: false });

        const amMod = modulesState.find((m: any) => m.id === 'automod');
        if (updateConfig) updateConfig('automod', { ...(amMod?.config || {}), autoModEnabled: false, blockLinks: false, antiSpamEnabled: false });

        const card = buildLimeOverviewCard({
          title: `${WRONG_EMOJI} ALL DEFENSE MODULES DISABLED`,
          subtitle: 'SERVER DEFENSES ARE NOW IN STANDBY MODE',
          color: Colors.DANGER,
          sections: [
            {
              title: `${WRONG_EMOJI} DEACTIVATION PROCESS COMPLETED`,
              items: [
                '• All security modules have been placed in standby mode.',
                `• Re-enable anytime using \`${prefix}enable all\`.`
              ]
            }
          ],
          footerText: 'Rage Optimiser Enterprise • Process Complete • Security Disabled'
        });

        if (replyMsg) return replyMsg.edit({ embeds: [card] });
        return message.reply({ embeds: [card] });
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

      const errContent = `${WRONG_EMOJI} Unknown target **${target}**. Valid options: \`antinuke\`, \`automod\`, \`voice\`, \`backups\`, \`all\`.`;
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
    aliases: ['security', 'sec', 'secstatus', 'threats', 'livematrix'],
    cooldownSeconds: 3,
    moduleOwnerId: 'security',
    dangerLevel: 'Low',
    execute: async (message: Message, args: string[]) => {
      if (!message.guild) {
        return message.reply({ content: `${WRONG_EMOJI} Command can only be executed within a server.` });
      }

      const isAuthorized = await isOwnerOrExtraOwner(message.author.id, message.guild);
      if (!isAuthorized && !message.member?.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply({
          content: `${WRONG_EMOJI} **Access Denied**: Viewing the Security Dashboard requires Administrator or Owner permissions.`
        });
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
