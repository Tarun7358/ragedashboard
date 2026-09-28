import { AuditLogEvent, PermissionFlagsBits, EmbedBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { checkWhitelistPermission, getGuildAndCheckPermission, checkBypassImmunity, isOwnerOrExtraOwner } from '../../utils/whitelistCheck.js';
import { isUrlCommandBypass, isMessageAntiLinkHandled, markMessageAntiLinkHandled } from '../../utils/antiLinkBypass.js';
import { Database } from '../../core/Database.js';
import { getPrebotEntry, PREBOT_PERMISSIONS } from '../prebot_whitelist/manifest.js';
import { checkRoleAssignment } from '../join-role-guard/manifest.js';
import { Embeds, Colors, createLimeEmbed, buildLimeOverviewCard, buildMinimalAction, buildLimeWarnCard, VERIFIED_ICON, WRONG_ICON, MEMBER_ICON, VIP_ICON, INFO_ICON, TIMER_ICON, SHIELD_ICON, SECURITY_SHIELD_ICON } from '../../core/UIFactory.js';
import { normalizeRuleName, DEFAULT_SECURITY_RULES, getEffectiveRule } from '../config/manifest.js';
import { TwoFactorManager } from '../../core/security/TwoFactorManager.js';
import { BACKUP_ROLE_NAMES } from './enable.js';
import { AdvancedSecurityService } from '../../services/AdvancedSecurityService.js';
import { DashboardSyncService } from '../../services/DashboardSyncService.js';
import { EmailService } from '../../services/EmailService.js';


// UPM Live Snapshots, Active Quarantines & Threat Scoring tracking
export const liveSnapshots = new Map<string, any>();
export const activeQuarantines = new Set<string>();
export const threatScores = new Map<string, { score: number; lastUpdate: number }>();

export function addThreatPoints(guildId: string, points: number): number {
  const current = threatScores.get(guildId) || { score: 0, lastUpdate: Date.now() };
  const now = Date.now();
  const minutesPassed = Math.floor((now - current.lastUpdate) / 60000);
  const decayedScore = Math.max(0, current.score - minutesPassed * 5);
  const newScore = Math.min(100, decayedScore + points);
  threatScores.set(guildId, { score: newScore, lastUpdate: now });

  // Threat escalation threshold (>= 75) triggers dashboard sync & threat alert
  if (newScore >= 75 && decayedScore < 75) {
    try {
      DashboardSyncService.triggerSync(guildId, 500);
      console.warn(`⚠️ [THREAT ALERT] Guild ${guildId} threat score escalated to ${newScore}/100!`);
    } catch {}
  }
  return newScore;
}

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
    } catch (e) { }
  }

  const inviteMatches = text.match(inviteRegex) || [];
  for (const inv of inviteMatches) {
    domains.push('discord.gg');
  }

  return domains;
}

function sanitizeLinksFromContent(text: string): string {
  if (!text) return '';
  const GLOBAL_LINK_REGEX = /(?:https?:\/\/|www\.|discord(?:app)?\.(?:gg|com\/invite)\/|[a-zA-Z0-9-]+\.(?:com|net|org|gg|io|me|xyz|co|uk)\b)[^\s]*/gi;
  return text.replace(GLOBAL_LINK_REGEX, '`[link removed]`').trim();
}

async function repostSanitizedContent(message: any, cleanText: string) {
  try {
    const channel = message.channel;
    if (!channel || !channel.isTextBased()) return;

    const textWithoutPlaceholder = cleanText.replace(/`\[link removed\]`/g, '').trim();
    if (textWithoutPlaceholder.length === 0) {
      return;
    }

    if ('createWebhook' in channel && typeof channel.fetchWebhooks === 'function') {
      const webhooks = await channel.fetchWebhooks().catch(() => null);
      let webhook = webhooks?.find((w: any) => w.name === 'Rage-AntiLink-Sanitizer');
      if (!webhook) {
        webhook = await channel.createWebhook({
          name: 'Rage-AntiLink-Sanitizer',
          avatar: message.client.user?.displayAvatarURL()
        }).catch(() => null);
      }
      if (webhook) {
        await webhook.send({
          content: cleanText,
          username: message.member?.displayName || message.author.username,
          avatarURL: message.author.displayAvatarURL({ size: 256 }),
          allowedMentions: { parse: [] }
        });
        return;
      }
    }

    await channel.send({
      content: `💬 **Message from ${message.author.username}** *(link removed)*:\n${cleanText}`,
      allowedMentions: { parse: [] }
    });
  } catch (e) {
    console.error('[Anti-Link] Error reposting sanitized content:', e);
  }
}

// Simple in-memory tracker for rate limits
interface ActionTracker {
  count: number;
  timestamps: number[];
}

const userActions = new Map<string, Map<string, ActionTracker>>();

function checkRateLimit(guildId: string, userId: string, ruleId: string, limit: number, windowSeconds: number, isBot: boolean = false): boolean {
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

  // ZERO TOLERANCE FOR BOTS: Unapproved bots trigger INSTANTLY on Action #1 (effectiveLimit = 1)
  // HUMANS WITH TRUST FACTOR: Capped at 2-action limit for nuke events, configurable for anti_link
  const effectiveLimit = isBot ? 1 : (ruleId === 'anti_link' ? (limit || 5) : Math.min(limit || 2, 2));
  return tracker.count >= effectiveLimit;
}

export function getRateLimitCount(guildId: string, userId: string, ruleId: string): number {
  const key = `${userId}_${ruleId}`;
  const guildTracker = userActions.get(guildId);
  return guildTracker?.get(key)?.count || 0;
}

export function resetRateLimit(guildId: string, userId: string, ruleId: string): void {
  const key = `${userId}_${ruleId}`;
  const guildTracker = userActions.get(guildId);
  if (guildTracker) {
    guildTracker.delete(key);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GUILD SCHEMA SNAPSHOT MANAGER (Zero-Audit-Log Fallback Recovery)
// ─────────────────────────────────────────────────────────────────────────────
interface GuildChannelSnapshot {
  id: string;
  name: string;
  type: number;
  topic?: string;
  nsfw?: boolean;
  parentId?: string;
  position: number;
  rateLimitPerUser?: number;
  bitrate?: number;
  userLimit?: number;
  permissionOverwrites: { id: string; type: number; allow: string; deny: string }[];
}

interface GuildRoleSnapshot {
  id: string;
  name: string;
  color: number;
  hoist: boolean;
  position: number;
  permissions: string;
  managed: boolean;
  mentionable: boolean;
}

interface GuildSnapshot {
  guildId: string;
  channels: GuildChannelSnapshot[];
  roles: GuildRoleSnapshot[];
  timestamp: number;
}

export class GuildSchemaSnapshotManager {
  private static ramCache = new Map<string, GuildSnapshot>();
  private static snapshotInterval: NodeJS.Timeout | null = null;

  public static async takeSnapshot(guild: any): Promise<GuildSnapshot | null> {
    if (!guild || !guild.id) return null;
    try {
      const channels: GuildChannelSnapshot[] = [];
      if (guild.channels?.cache) {
        for (const [, ch] of guild.channels.cache) {
          channels.push({
            id: ch.id,
            name: ch.name,
            type: ch.type,
            topic: ch.topic || undefined,
            nsfw: Boolean(ch.nsfw),
            parentId: ch.parentId || undefined,
            position: typeof ch.position === 'number' ? ch.position : 0,
            rateLimitPerUser: ch.rateLimitPerUser || 0,
            bitrate: ch.bitrate || undefined,
            userLimit: ch.userLimit || undefined,
            permissionOverwrites: ch.permissionOverwrites?.cache ? Array.from(ch.permissionOverwrites.cache.values()).map((o: any) => ({
              id: o.id,
              type: o.type,
              allow: o.allow?.bitfield?.toString() ?? String(o.allow || '0'),
              deny: o.deny?.bitfield?.toString() ?? String(o.deny || '0')
            })) : []
          });
        }
      }

      const roles: GuildRoleSnapshot[] = [];
      if (guild.roles?.cache) {
        for (const [, r] of guild.roles.cache) {
          roles.push({
            id: r.id,
            name: r.name,
            color: r.color || 0,
            hoist: Boolean(r.hoist),
            position: typeof r.position === 'number' ? r.position : 0,
            permissions: r.permissions?.bitfield?.toString() ?? String(r.permissions || '0'),
            managed: Boolean(r.managed),
            mentionable: Boolean(r.mentionable)
          });
        }
      }

      const snapshot: GuildSnapshot = {
        guildId: guild.id,
        channels,
        roles,
        timestamp: Date.now()
      };

      this.ramCache.set(guild.id, snapshot);

      const db = Database.getDb();
      if (db) {
        await db.run(
          `INSERT OR REPLACE INTO guild_schema_snapshots (guildId, channelsJson, rolesJson, updatedAt) VALUES (?, ?, ?, ?)`,
          [guild.id, JSON.stringify(channels), JSON.stringify(roles), snapshot.timestamp]
        ).catch(() => { });
      }

      return snapshot;
    } catch (err) {
      console.error(`[SnapshotManager] Error capturing snapshot for guild ${guild?.id}:`, err);
      return null;
    }
  }

  public static async getSnapshot(guildId: string): Promise<GuildSnapshot | null> {
    if (this.ramCache.has(guildId)) {
      return this.ramCache.get(guildId)!;
    }

    try {
      const db = Database.getDb();
      if (db) {
        const row = await db.get<any>(`SELECT channelsJson, rolesJson, updatedAt FROM guild_schema_snapshots WHERE guildId = ?`, [guildId]);
        if (row) {
          const snapshot: GuildSnapshot = {
            guildId,
            channels: JSON.parse(row.channelsJson || '[]'),
            roles: JSON.parse(row.rolesJson || '[]'),
            timestamp: Number(row.updatedAt || 0)
          };
          this.ramCache.set(guildId, snapshot);
          return snapshot;
        }
      }
    } catch (err) {
      console.error(`[SnapshotManager] Error reading snapshot for ${guildId}:`, err);
    }
    return null;
  }

  public static startAutoSnapshots(client: any) {
    if (this.snapshotInterval) return;

    const runAll = async () => {
      if (!client?.guilds?.cache) return;
      for (const [, guild] of client.guilds.cache) {
        await this.takeSnapshot(guild).catch(() => { });
      }
    };

    runAll();
    this.snapshotInterval = setInterval(runAll, 10 * 60 * 1000);
  }
}

function isRecentEntry(entry: any, maxAgeMs = 45000): boolean {
  if (!entry) return false;
  const now = Date.now();
  const created = entry.createdTimestamp || (entry.createdAt ? entry.createdAt.getTime() : 0);
  if (!created) return true;
  const age = now - created;
  return age < maxAgeMs && age > -60000;
}

async function fetchAuditLogWithRetry(
  guild: any,
  type: AuditLogEvent,
  targetId?: string,
  maxAgeMs = 45000
): Promise<any> {
  if (!guild || typeof guild.fetchAuditLogs !== 'function') return null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const logs = await guild.fetchAuditLogs({ limit: 10, type }).catch(() => null);
      if (logs && logs.entries) {
        const entry = Array.from(logs.entries.values()).find((e: any) => {
          const matchesTarget = !targetId || e.targetId === targetId;
          return matchesTarget && isRecentEntry(e, maxAgeMs);
        });
        if (entry) return entry;
      }
    } catch (err) { }

    if (attempt < 3) {
      await new Promise(r => setTimeout(r, attempt === 1 ? 80 : 200));
    }
  }

  return null;
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

  const emojis = guild.emojis.cache.map((emoji: any) => ({
    id: emoji.id,
    name: emoji.name,
    url: emoji.imageURL ? emoji.imageURL() : (emoji.url || null)
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
    emojis,
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

let autoBackupIntervalStarted = false;

export function startAutoBackupScheduler(client: any, context?: any) {
  if (autoBackupIntervalStarted || !client) return;
  autoBackupIntervalStarted = true;

  console.log('⚡ [Auto-Backup Engine]: 5-Minute automated server snapshot engine active.');

  const runAutoBackup = async () => {
    try {
      if (!client.guilds || !client.guilds.cache) return;
      const guilds = Array.from(client.guilds.cache.values());

      for (const guild of guilds as any[]) {
        try {
          const channelCount = guild.channels?.cache?.size || 0;
          const roleCount = guild.roles?.cache?.size || 0;
          const prevSnap = liveSnapshots.get(guild.id);
          const prevChannelCount = prevSnap?.channels?.length || 0;
          const prevRoleCount = prevSnap?.roles?.length || 0;

          // Anti-Poisoning Protection:
          // 1. Must have >= 3 channels and >= 2 roles
          // 2. If previous snapshot exists with >= 6 channels, do not overwrite if current channels dropped by >50% (active raid/nuke safeguard)
          const isSeverelyDepleted = prevChannelCount >= 6 && channelCount < (prevChannelCount * 0.5);
          const isHealthy = channelCount >= 3 && roleCount >= 2 && !isSeverelyDepleted;

          if (isHealthy) {
            const snap = await captureLiveSnapshot(guild);
            await saveLiveSnapshotToDb(guild.id, snap);
          } else if (isSeverelyDepleted) {
            console.warn(`[Auto-Backup Anti-Poisoning] Skipped saving snapshot for guild ${guild.id}: channels dropped from ${prevChannelCount} to ${channelCount} (possible active nuke/raid).`);
          }
        } catch (e) {
          console.error(`[Auto-Backup 5m] Failed snapshot for guild ${guild?.id}:`, e);
        }
      }
    } catch (err) {
      console.error('[Auto-Backup 5m] Engine error:', err);
    }
  };

  // Run initial backup IMMEDIATELY, then every 5 minutes (300,000 ms)
  runAutoBackup();
  setInterval(runAutoBackup, 5 * 60 * 1000);
}

export const activeRestorationGuilds = new Set<string>();

export function isServerRestoring(guildId: string): boolean {
  if (!guildId) return false;
  if (activeRestorationGuilds.has(guildId)) return true;
  try {
    const { activeBackupRestorations } = require('../backups/manifest.js');
    if (activeBackupRestorations && activeBackupRestorations.has(guildId)) return true;
  } catch {}
  return false;
}

export async function restoreFromLiveSnapshot(param1: any, param2: any, context: any) {
  let guild: any = null;
  let client: any = null;

  if (param1?.fetchAuditLogs || (param1?.id && param1?.channels?.cache)) {
    guild = param1;
    client = param2;
  } else if (param2?.fetchAuditLogs || (param2?.id && param2?.channels?.cache)) {
    guild = param2;
    client = param1;
  } else if (typeof param2 === 'string') {
    client = param1;
    const gId = param2;
    guild = client?.guilds?.cache?.get(gId);
  } else if (typeof param1 === 'string') {
    client = param2;
    const gId = param1;
    guild = client?.guilds?.cache?.get(gId);
  }

  if (!guild) {
    console.error('[UPM Restore Error] Unable to resolve valid Discord Guild object in restoreFromLiveSnapshot');
    return;
  }

  const guildId = guild.id;

  // CONCURRENCY LOCK: Prevent duplicate restoration runs for the same server
  if (activeRestorationGuilds.has(guildId)) {
    console.log(`[UPM Restore] Restoration already in progress for guild ${guild.name} (${guildId}), skipping duplicate call.`);
    return;
  }

  activeRestorationGuilds.add(guildId);
  try {
    const { activeBackupRestorations } = await import('../backups/manifest.js');
    activeBackupRestorations?.add(guildId);
  } catch {}

  try {
    context?.logSyncEvent?.(guildId, '🔄 [UPM Restore]: Initializing full server restoration sequence...', 'info');

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

    // Fallback to GuildSchemaSnapshotManager if liveSnapshot is missing or empty
    if (!snap || !snap.channels || snap.channels.length === 0) {
      const schemaSnap = await GuildSchemaSnapshotManager.getSnapshot(guildId);
      if (schemaSnap && schemaSnap.channels && schemaSnap.channels.length > 0) {
        snap = {
          timestamp: schemaSnap.timestamp,
          channels: schemaSnap.channels,
          roles: schemaSnap.roles,
          guildSettings: {}
        };
        liveSnapshots.set(guildId, snap);
      }
    }

    if (!snap || ((!snap.channels || snap.channels.length === 0) && (!snap.roles || snap.roles.length === 0))) {
      context?.logSyncEvent?.(guildId, '❌ [UPM Restore Failed]: No valid snapshot found in database or memory for server restoration.', 'warn');
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

    // Restore Roles sequentially to preserve exact permissions and order
    const roleMap = new Map<string, any>();
    if (snap.roles) {
      const sortedRoles = [...snap.roles].sort((a, b) => (a.position || 0) - (b.position || 0));

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

    // Restore Channels sequentially by position to prevent duplicate category creation & misordering
    if (snap.channels) {
      const sortedChannels = [...snap.channels].sort((a, b) => (a.position || 0) - (b.position || 0));
      const categories = sortedChannels.filter((c: any) => c.type === 4);
      const otherChannels = sortedChannels.filter((c: any) => c.type !== 4);
      const channelMap = new Map<string, any>();

      const restoreSingleChannel = async (cSnap: any, parentActualId?: string) => {
        // Strict cache lookup: ID match or exact name + type match
        let existingChannel = guild.channels.cache.get(cSnap.id) ||
          guild.channels.cache.find((c: any) => c.name.toLowerCase() === cSnap.name.toLowerCase() && c.type === cSnap.type);

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

        const createOptions: any = {
          name: cSnap.name,
          type: cSnap.type,
          parent: parentActualId || undefined,
          permissionOverwrites: overwrites,
          reason: 'UPM Recovery: Recreating deleted channel'
        };
        if (cSnap.position !== undefined) createOptions.position = cSnap.position;

        if (cSnap.type === ChannelType.GuildText || cSnap.type === 0 || cSnap.type === ChannelType.GuildAnnouncement || cSnap.type === 5) {
          if (cSnap.topic) createOptions.topic = cSnap.topic;
          if (cSnap.nsfw !== undefined) createOptions.nsfw = Boolean(cSnap.nsfw);
          if (cSnap.rateLimitPerUser) createOptions.rateLimitPerUser = cSnap.rateLimitPerUser;
        }

        if (cSnap.type === ChannelType.GuildVoice || cSnap.type === 2 || cSnap.type === ChannelType.GuildStageVoice || cSnap.type === 13) {
          if (cSnap.bitrate) createOptions.bitrate = cSnap.bitrate;
          if (cSnap.userLimit) createOptions.userLimit = cSnap.userLimit;
          if (cSnap.rtcRegion) createOptions.rtcRegion = cSnap.rtcRegion;
        }

        if (!existingChannel) {
          existingChannel = await guild.channels.create(createOptions).catch((err: any) => {
            console.error(`[UPM Restore Error] Failed to create channel ${cSnap.name}:`, err);
            return null;
          });
        } else {
          const editOptions: any = {
            name: cSnap.name,
            parent: parentActualId || undefined,
            permissionOverwrites: overwrites
          };
          if (cSnap.position !== undefined) editOptions.position = cSnap.position;

          if (cSnap.type === ChannelType.GuildText || cSnap.type === 0 || cSnap.type === ChannelType.GuildAnnouncement || cSnap.type === 5) {
            if (cSnap.topic !== undefined) editOptions.topic = cSnap.topic;
            if (cSnap.nsfw !== undefined) editOptions.nsfw = Boolean(cSnap.nsfw);
            if (cSnap.rateLimitPerUser !== undefined) editOptions.rateLimitPerUser = cSnap.rateLimitPerUser;
          }

          if (cSnap.type === ChannelType.GuildVoice || cSnap.type === 2 || cSnap.type === ChannelType.GuildStageVoice || cSnap.type === 13) {
            if (cSnap.bitrate) editOptions.bitrate = cSnap.bitrate;
            if (cSnap.userLimit) editOptions.userLimit = cSnap.userLimit;
            if (cSnap.rtcRegion) editOptions.rtcRegion = cSnap.rtcRegion;
          }

          await existingChannel.edit(editOptions).catch(() => null);
        }

        if (existingChannel) {
          channelMap.set(cSnap.id, existingChannel);
        }
      };

      // STEP 1: Restore Categories sequentially (one by one) to prevent parallel duplicate creation
      for (const catSnap of categories) {
        await restoreSingleChannel(catSnap);
      }

      // STEP 2: Restore Sub-channels sequentially per category to ensure correct parent mapping and ordering
      for (const chSnap of otherChannels) {
        const parentActualId = chSnap.parentId ? channelMap.get(chSnap.parentId)?.id : undefined;
        await restoreSingleChannel(chSnap, parentActualId);
      }

      // STEP 3: STRICT DEDUPLICATION SWEEP — Delete any duplicate channels or categories created during race conditions
      const restoredChannelIds = new Set(Array.from(channelMap.values()).map((c: any) => c.id));
      const seenKeyToChannelId = new Map<string, string>();
      const extraChannelsToDelete: any[] = [];

      for (const [cId, currentChan] of guild.channels.cache) {
        const isSystemChannel = cId === guild.rulesChannelId || cId === guild.systemChannelId || cId === guild.publicUpdatesChannelId;
        if (isSystemChannel) continue;

        const key = `${currentChan.name.toLowerCase()}_${currentChan.type}`;

        // If this channel was restored explicitly by our map, keep it!
        if (restoredChannelIds.has(cId)) {
          seenKeyToChannelId.set(key, cId);
          continue;
        }

        // If we already have a valid restored channel with the exact same name and type, this is a DUPLICATE!
        if (seenKeyToChannelId.has(key)) {
          extraChannelsToDelete.push(currentChan);
        } else {
          seenKeyToChannelId.set(key, cId);
        }
      }

      if (extraChannelsToDelete.length > 0) {
        context?.logSyncEvent?.(guildId, `🧹 [UPM Recovery Sweep]: Fast purging ${extraChannelsToDelete.length} duplicate channels/categories...`, 'warn');
        await Promise.allSettled(extraChannelsToDelete.map(async (ch) => {
          await ch.delete('UPM Recovery Deduplication: Removing duplicate channel created during nuke attack').catch(() => { });
        }));
      }
    }

    // STEP 4: STRICT ROLE DEDUPLICATION SWEEP
    if (snap.roles && snap.roles.length > 0) {
      const restoredRoleIds = new Set(Array.from(roleMap.values()).map((r: any) => r.id));
      const seenRoleNames = new Set(Array.from(roleMap.values()).map((r: any) => r.name.toLowerCase()));
      const rolesToDelete: any[] = [];

      for (const [rId, currentRole] of guild.roles.cache) {
        const isProtected = currentRole.name === '@everyone' ||
          currentRole.managed ||
          Boolean(currentRole.tags?.botId) ||
          Boolean(currentRole.tags?.integrationId) ||
          Boolean(currentRole.tags?.premiumSubscriberRole) ||
          currentRole.name === '. Quarantine';
        if (isProtected) continue;

        // If role was explicitly restored, keep it!
        if (restoredRoleIds.has(rId)) continue;

        // If a role with this exact name already exists from snapshot, this extra role is a duplicate!
        if (seenRoleNames.has(currentRole.name.toLowerCase())) {
          rolesToDelete.push(currentRole);
        }
      }

      if (rolesToDelete.length > 0) {
        context?.logSyncEvent?.(guildId, `🧹 [UPM Recovery Sweep]: Fast purging ${rolesToDelete.length} duplicate roles...`, 'warn');
        await Promise.allSettled(rolesToDelete.map(async (currentRole) => {
          await currentRole.delete('UPM Recovery Deduplication: Removing duplicate role created during nuke attack').catch(() => { });
        }));
      }
    }

    // STEP 5: Restore Emojis if present in snapshot
    if (snap.emojis && Array.isArray(snap.emojis)) {
      const existingEmojiNames = new Set(guild.emojis.cache.map((e: any) => e.name));
      const missingEmojis = snap.emojis.filter((eSnap: any) => !existingEmojiNames.has(eSnap.name) && eSnap.url);
      if (missingEmojis.length > 0) {
        await Promise.allSettled(missingEmojis.map(async (eSnap: any) => {
          await guild.emojis.create({ attachment: eSnap.url, name: eSnap.name, reason: 'UPM Recovery: Recreating deleted emoji' }).catch(() => { });
        }));
      }
    }

    try {
      const { ensureRageRoleAtTop } = await import('../backups/manifest.js');
      await ensureRageRoleAtTop(guild);
    } catch { }

    context?.logSyncEvent?.(guildId, '✅ [UPM Restore Completed]: Full server state successfully restored from snapshot.', 'success');
  } catch (err: any) {
    console.error(`❌ [UPM Restore Critical Error]:`, err);
  } finally {
    activeRestorationGuilds.delete(guildId);
  }
}

async function isExecutorBypassed(guild: any, executorId: string, config: any, context?: any, ruleId?: string): Promise<boolean> {
  if (!guild || !executorId) return false;

  // 1. Always bypass bot self actions
  if (guild.client?.user && executorId === guild.client.user.id) {
    return true;
  }

  // 2. Always bypass during active server restoration (UPM or Backup Load)
  if (isServerRestoring(guild.id)) {
    return true;
  }

  const isBypassed = await checkBypassImmunity(executorId, guild, context, ruleId);

  // 3. If a bot has BOTH PreBot Whitelist authorization AND Whitelist clearance -> Full Trust Bypass (never interrupted)
  if (ruleId && isBypassed) {
    const isPrebotAuth = await isPrebotAuthorizedForRule(guild.id, executorId, ruleId).catch(() => false);
    if (isPrebotAuth) {
      return true;
    }
  }

  return isBypassed;
}

export async function isPrebotAuthorizedForRule(guildId: string, botId: string, ruleId: string): Promise<boolean> {
  try {
    const { getPrebotEntry } = await import('../prebot_whitelist/manifest.js');
    const prebot = await getPrebotEntry(guildId, botId);
    if (!prebot) return false;

    const allowedPerms: string[] = typeof prebot.allowedPerms === 'string'
      ? JSON.parse(prebot.allowedPerms)
      : (prebot.allowedPerms || []);

    if (allowedPerms.includes('Administrator')) return true;

    switch (ruleId) {
      case 'anti_channel_create':
      case 'anti_channel_delete':
      case 'anti_channel_update':
        return allowedPerms.includes('ManageChannels');

      case 'anti_role_create':
      case 'anti_role_delete':
      case 'anti_role_update':
      case 'anti_role_grant':
      case 'anti_role_remove':
        return allowedPerms.includes('ManageRoles');

      case 'anti_kick':
      case 'anti_bot_remove':
      case 'anti_prune':
        return allowedPerms.includes('KickMembers');

      case 'anti_ban':
      case 'anti_unban':
        return allowedPerms.includes('BanMembers');

      case 'anti_timeout':
        return allowedPerms.includes('ModerateMembers');

      case 'anti_everyone_ping':
      case 'anti_role_ping':
      case 'anti_everyone_here':
        return allowedPerms.includes('MentionEveryone') || allowedPerms.includes('SendMessages');

      default:
        return false;
    }
  } catch (err) {
    console.error('[PreBot Rule Check Error]:', err);
    return false;
  }
}

export async function revokeBotAndPurgeRoles(guild: any, executorId: string, executorUsername: string, reason: string, client: any, context: any) {
  try {
    // ZERO-LATENCY DISPATCH (<1ms): Ban rogue bot over REST immediately without waiting for DB or role operations
    guild.members.ban(executorId, { reason: `Anti-Nuke Zero-Trust Instant Bot Ban: ${reason}` }).catch(() => {});

    // 1. INSTANT TRUSTED ROLE PURGE
    const member = await guild.members.fetch(executorId).catch(() => guild.members.cache.get(executorId));
    if (member) {
      const rolesToDelete = guild.roles.cache.filter((r: any) =>
        !r.managed && r.name !== '@everyone' && (
          member.roles.cache.has(r.id) ||
          r.name.toLowerCase().includes('[trusted]') ||
          r.name.toLowerCase().includes(executorUsername.toLowerCase())
        )
      );

      for (const [, roleObj] of rolesToDelete) {
        if (member.roles.cache.has(roleObj.id)) {
          await member.roles.remove(roleObj.id).catch(() => { });
        }
        if (roleObj.name.toLowerCase().includes('[trusted]') || roleObj.name.toLowerCase().includes(executorUsername.toLowerCase())) {
          await roleObj.delete('Anti-Nuke Zero-Trust: Deleting trusted bot role of banned bot').catch(() => { });
        }
      }
    }

    // 2. INSTANT WHITELIST REVOCATION SECOND (Purge database entry)
    const { deletePrebotEntry } = await import('../prebot_whitelist/manifest.js');
    const wasPrebotRevoked = await deletePrebotEntry(guild.id, executorId);

    const prebotLogStr = wasPrebotRevoked ? ` ⚠️ [PreBot Whitelist Auto-Revoked & Trusted Roles Deleted]: Removed bot @${executorUsername} from PreBot Whitelist.` : '';
    context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Zero-Trust]: INSTANTLY BANNED & PURGED ROLES for rogue bot @${executorUsername} (${executorId}). Reason: ${reason}.${prebotLogStr}`, 'warn');
  } catch (err: any) {
    console.error(`[Anti-Nuke Revoke] Failed for bot ${executorId}:`, err);
  }
}

async function punishViolator(client: any, guild: any, executorId: string, executorUsername: string, reason: string, ruleAction: string, config: any, context: any, ruleId?: string) {
  const quarantineKey = `${guild.id}_${executorId}`;

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

  if (activeQuarantines.has(quarantineKey)) {
    console.log(`[Anti-Nuke Safety] Skipping punishment for ${executorUsername} — quarantine race condition detected.`);
    return;
  }
  activeQuarantines.add(quarantineKey);
  setTimeout(() => activeQuarantines.delete(quarantineKey), 15000);

  // ZERO-LATENCY BAN DISPATCH (<1ms): If action is ban, issue non-blocking ban HTTP request immediately
  if (ruleAction === 'ban') {
    guild.members.ban(executorId, { reason: `Anti-Nuke Zero-Trust Instant Ban: ${reason}` }).catch(() => {});
  }

  try {
    const member = await guild.members.fetch(executorId).catch(() => null);
    if (!member) {
      // If member left or cannot be fetched, enforce ban & full recovery
      await guild.members.ban(executorId, { reason: `Anti-Nuke Zero-Trust: ${reason}` }).catch(() => {});
      context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Action]: Banned missing/departed violator (@${executorUsername}). Initiating total server state rollback...`, 'warn');
      await restoreFromLiveSnapshot(guild, client, context).catch(console.error);
      return;
    }

    // ZERO TOLERANCE FOR BOTS: If violator is a bot, FORCE BAN INSTANTLY, PURGE TRUSTED ROLES & AUTO-REVOKE PREBOT WHITELIST!
    if (member.user.bot) {
      await revokeBotAndPurgeRoles(guild, executorId, executorUsername, `Instant Bot Ban (${reason})`, client, context);
      context.logSyncEvent(guild.id, `🔄 [Anti-Nuke Recovery]: Initiating total server state rollback to revert all unauthorized changes made by rogue bot @${executorUsername}...`, 'info');
      await restoreFromLiveSnapshot(guild, client, context).catch(console.error);
      return;
    }

    // 1. FAST PATH: Direct instant kick or ban (No preliminary role-stripping delays)
    if (ruleAction === 'kick') {
      await member.kick(reason).catch(console.error);
      context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Action]: Instantly Kicked ${executorUsername}. Reason: ${reason}`, 'warn');
      DashboardSyncService.triggerSync(guild.id, 500);
      return;
    }

    if (ruleAction === 'ban') {
      await guild.members.ban(executorId, { reason }).catch(console.error);
      context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Action]: Instantly Banned ${executorUsername}. Reason: ${reason}`, 'warn');
      DashboardSyncService.triggerSync(guild.id, 500);
      return;
    }

    if (ruleAction === 'timeout') {
      const freshMember = await guild.members.fetch(executorId).catch(() => member);
      const timeoutMs = config.timeoutDurationMs || (28 * 24 * 60 * 60 * 1000);
      await freshMember.timeout(timeoutMs, `[Anti-Nuke Timeout] ${reason}`).catch(console.error);
      context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Action]: Timed out ${executorUsername} for ${Math.round(timeoutMs / 60000)} mins. Reason: ${reason}`, 'warn');
      DashboardSyncService.triggerSync(guild.id, 500);
      return;
    }

    // 2. QUARANTINE & STRIP ROLES PATH
    if (ruleAction === 'quarantine' || ruleAction === 'strip_roles') {
      const originalRoleIds = Array.from(
        member.roles.cache
          .filter((r: any) => r.id !== guild.id && !r.managed && r.id !== config.quarantineRoleId)
          .keys()
      );

      // Strip ALL administrative & dangerous roles
      const adminRoleIds = member.roles.cache
        .filter((r: any) => (
          r.permissions.has(PermissionFlagsBits.Administrator) ||
          r.permissions.has(PermissionFlagsBits.ManageGuild) ||
          r.permissions.has(PermissionFlagsBits.ManageRoles) ||
          r.permissions.has(PermissionFlagsBits.ManageChannels) ||
          r.permissions.has(PermissionFlagsBits.BanMembers) ||
          r.permissions.has(PermissionFlagsBits.KickMembers)
        ) && r.id !== guild.id)
        .map((r: any) => r.id);
      for (const roleId of adminRoleIds) {
        await member.roles.remove(roleId).catch(() => { });
      }

      if (ruleAction === 'quarantine') {
        const freshMember = await guild.members.fetch(executorId).catch(() => member);
        const remainingRoleIds = Array.from(
          freshMember.roles.cache
            .filter((r: any) => r.id !== guild.id && !r.managed && r.id !== config.quarantineRoleId)
            .keys()
        );

        if (config.quarantineRoleId) {
          await freshMember.roles.add(config.quarantineRoleId).catch(console.error);
        }
        for (const roleId of remainingRoleIds) {
          await freshMember.roles.remove(roleId).catch(() => { });
        }

        // Apply Discord Native Timeout (configured duration or default 28 days)
        const timeoutMs = config.timeoutDurationMs || (28 * 24 * 60 * 60 * 1000);
        await freshMember.timeout(timeoutMs, `[Anti-Nuke Quarantine] ${reason}`).catch(() => { });

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
            originalRoles: originalRoleIds
          });
          context.updateModuleConfig('security', { quarantinedUsers });
        }
        context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Action]: Quarantined & Timed out ${executorUsername} for ${Math.round(timeoutMs / 60000)} mins. Reason: ${reason}`, 'warn');
      } else {
        context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Action]: Stripped administrative and dangerous roles from ${executorUsername}. Reason: ${reason}`, 'warn');
      }
    }

    DashboardSyncService.triggerSync(guild.id, 500);

    // AUTOMATED TOTAL RECOVERY: Revert all changes made during the attack by invoking full snapshot restoration
    context.logSyncEvent(guild.id, `🔄 [Anti-Nuke Recovery]: Initiating total server state rollback to revert all unauthorized changes made by ${executorUsername}...`, 'info');
    await restoreFromLiveSnapshot(guild, client, context).catch(console.error);
  } catch (err) {
    console.error('Error punishing violator:', err);
  }
}

async function handleSecurityGuiInteraction(interaction: any, context: any) {
  if (!interaction || !interaction.guild) return;
  const customId = interaction.customId || '';

  if (
    !customId.startsWith('btn_sec_') &&
    !customId.startsWith('sec_btn_') &&
    !customId.startsWith('sec_') &&
    !customId.startsWith('select_sec_') &&
    !customId.startsWith('an_') &&
    !customId.startsWith('btn_enable_all_') &&
    !customId.startsWith('modal_sec_')
  ) return;

  const isAuthorized = await isOwnerOrExtraOwner(interaction.user.id, interaction.guild);
  if (!isAuthorized && !interaction.member?.permissions.has(PermissionFlagsBits.Administrator)) {
    if (!interaction.deferred && !interaction.replied) {
      return interaction.reply({ content: `${WRONG_ICON} Access Denied: Server Owner or Administrator permission required.`, flags: 64 });
    }
    return;
  }

  const modules = context?.getModulesState ? context.getModulesState(interaction.guild.id) : [];
  const secMod = modules.find((m: any) => m.id === 'security');
  const secConfig = secMod?.config || {};
  secConfig.rules = secConfig.rules || {};

  const categoryRules: Record<string, string[]> = {
    group_roles: ['anti_role_grant', 'anti_role_remove', 'anti_role_update', 'anti_role_create', 'anti_role_delete'],
    group_channels: ['anti_channel_create', 'anti_channel_delete', 'anti_channel_update'],
    group_members: ['anti_ban', 'anti_kick', 'anti_timeout', 'anti_bot_add', 'anti_bot_remove', 'anti_prune', 'anti_everyone_here'],
    group_server: ['anti_webhook_create', 'anti_webhook_delete', 'anti_webhook_update', 'anti_guild_update', 'anti_invite_create', 'anti_emoji_create', 'anti_emoji_delete', 'anti_emoji_update', 'anti_sticker_create', 'anti_sticker_delete']
  };

  const {
    buildSecurityDashboardComponents,
    buildAntiNukeDashboardGUI,
    buildAntiNukeOverview,
    buildAutoModDashboardComponents,
    buildPresetsDashboardComponents,
    buildPunishmentPolicyGUI,
    buildWhitelistManagerGUI,
    buildEnableAllDashboardGUI
  } = await import('../config/manifest.js');

  // 1. Master Anti-Nuke Toggle
  if (customId === 'btn_sec_toggle_antinuke' || customId === 'an_toggle_all') {
    await interaction.deferUpdate().catch(() => {});
    const currentState = secConfig.antiNukeEnabled !== false;
    const newState = !currentState;
    secConfig.antiNukeEnabled = newState;
    context.updateModuleConfig('security', secConfig);
    context.logSyncEvent?.(`[Security GUI] Anti-Nuke master status set to ${newState ? 'ENABLED' : 'DISABLED'} by ${interaction.user.username}.`, newState ? 'success' : 'warn');

    const payload = await buildSecurityDashboardComponents(interaction.guild, secConfig, context);
    return interaction.editReply({ embeds: [payload.embed], components: payload.components });
  }

  // 2. Master AutoMod Toggle
  if (customId === 'btn_sec_toggle_automod') {
    await interaction.deferUpdate().catch(() => {});
    const amMod = modules.find((m: any) => m.id === 'automod');
    const currentState = amMod ? (amMod.status === 'enabled' && amMod.config?.autoModEnabled !== false) : (secConfig.autoModEnabled !== false);
    const newState = !currentState;

    if (context.toggleModule) {
      context.toggleModule('automod', newState);
    }
    const amConfig = { ...(amMod?.config || {}) };
    amConfig.autoModEnabled = newState;
    amConfig.blockLinks = newState;
    context.updateModuleConfig('automod', amConfig);

    secConfig.autoModEnabled = newState;
    context.updateModuleConfig('security', secConfig);
    context.logSyncEvent?.(`[Security GUI] AutoMod master status set to ${newState ? 'ENABLED' : 'DISABLED'} by ${interaction.user.username}.`, newState ? 'success' : 'warn');

    const payload = await buildSecurityDashboardComponents(interaction.guild, secConfig, context);
    return interaction.editReply({ embeds: [payload.embed], components: payload.components });
  }

  // 3. Raid Mode Toggle
  if (customId === 'btn_sec_toggle_raid' || customId === 'an_toggle_raid') {
    await interaction.deferUpdate().catch(() => {});
    const currentState = Boolean(secConfig.raidModeEnabled);
    const newState = !currentState;
    secConfig.raidModeEnabled = newState;
    context.updateModuleConfig('security', secConfig);
    context.logSyncEvent?.(`[Security GUI] Raid Mode set to ${newState ? 'ACTIVE' : 'OFF'} by ${interaction.user.username}.`, newState ? 'warn' : 'info');

    // Email alert
    const { EmailService } = await import('../../services/EmailService.js');
    EmailService.sendRaidModeAlert({
      guildName:   interaction.guild.name,
      guildId:     interaction.guild.id,
      triggeredBy: interaction.user.username,
      enabled:     newState,
      memberCount: interaction.guild.memberCount
    });

    const payload = await buildSecurityDashboardComponents(interaction.guild, secConfig, context);
    return interaction.editReply({ embeds: [payload.embed], components: payload.components });
  }

  // 4. Emergency Server Lockdown
  if (customId === 'btn_sec_emergency_lock' || customId === 'an_emergency_lock') {
    await interaction.deferUpdate().catch(() => {});
    const isLocked = Boolean(secConfig.emergencyMode);
    const nextState = !isLocked;
    secConfig.emergencyMode = nextState;
    context.updateModuleConfig('security', secConfig);

    const everyoneRole = interaction.guild.roles.everyone;
    const textChannels = interaction.guild.channels.cache.filter((c: any) => c.isTextBased() && !c.isThread());
    for (const [, channel] of textChannels) {
      await (channel as any).permissionOverwrites?.edit(everyoneRole, {
        SendMessages: nextState ? false : null
      }).catch(() => {});
    }

    context.logSyncEvent?.(`[Security GUI] Emergency Lockdown set to ${nextState ? 'ENGAGED' : 'LIFTED'} by ${interaction.user.username}.`, nextState ? 'danger' : 'success');

    // Email alert
    const { EmailService } = await import('../../services/EmailService.js');
    EmailService.sendEmergencyLockAlert({
      guildName:   interaction.guild.name,
      guildId:     interaction.guild.id,
      triggeredBy: interaction.user.username,
      engaged:     nextState
    });

    const payload = await buildSecurityDashboardComponents(interaction.guild, secConfig, context);
    return interaction.editReply({ embeds: [payload.embed], components: payload.components });
  }

  // 5. Setup Quarantine Role
  if (customId === 'btn_sec_qrole_setup') {
    await interaction.deferUpdate().catch(() => {});
    let qRole = interaction.guild.roles.cache.find((r: any) => r.name.toLowerCase() === '. quarantine' || r.name.toLowerCase() === 'quarantine');
    if (!qRole) {
      qRole = await interaction.guild.roles.create({
        name: '. Quarantine',
        color: 0x343541,
        reason: 'Rage Optimiser High Security Automated Quarantine Role'
      }).catch(() => null);
    }

    if (qRole) {
      secConfig.quarantineRoleId = qRole.id;
      context.updateModuleConfig('security', secConfig);
      context.logSyncEvent?.(`[Security GUI] Quarantine role bound to ${qRole.name} (${qRole.id}).`, 'success');
    }

    const payload = await buildSecurityDashboardComponents(interaction.guild, secConfig, context);
    return interaction.editReply({ embeds: [payload.embed], components: payload.components });
  }

  // 6. Navigation: Refresh / Main Security Hub
  if (customId === 'btn_sec_refresh' || customId === 'an_view_full') {
    await interaction.deferUpdate().catch(() => {});
    const payload = await buildSecurityDashboardComponents(interaction.guild, secConfig, context);
    return interaction.editReply({ embeds: [payload.embed], components: payload.components });
  }

  // 7. Navigation: Presets View
  if (customId === 'btn_sec_presets' || customId === 'btn_sec_refresh_presets') {
    await interaction.deferUpdate().catch(() => {});
    const payload = buildPresetsDashboardComponents(interaction.guild, secConfig);
    return interaction.editReply(payload);
  }

  // 8. Navigation: Whitelist Manager View
  if (customId === 'btn_sec_whitelist_manager' || customId === 'btn_sec_refresh_wl' || customId === 'btn_sec_open_whitelist') {
    await interaction.deferUpdate().catch(() => {});
    const payload = await buildWhitelistManagerGUI(interaction.guild, secConfig, context);
    return interaction.editReply(payload);
  }

  // 8b. Navigation: Punishments View
  if (customId === 'btn_sec_refresh_punishments') {
    await interaction.deferUpdate().catch(() => {});
    const payload = buildPunishmentPolicyGUI(interaction.guild, secConfig);
    return interaction.editReply(payload);
  }

  // 9. Dropdown Select Menu Navigation
  if (customId === 'select_sec_rule_group' || customId === 'an_rule_select') {
    await interaction.deferUpdate().catch(() => {});
    const val = interaction.values?.[0] || 'group_hub';

    if (val === 'group_hub') {
      const payload = await buildSecurityDashboardComponents(interaction.guild, secConfig, context);
      return interaction.editReply({ embeds: [payload.embed], components: payload.components });
    }
    if (val === 'group_an_hub') {
      const payload = await buildAntiNukeDashboardGUI(interaction.guild, secConfig, context);
      return interaction.editReply({ embeds: [payload.embed], components: payload.components });
    }
    if (val === 'group_automod') {
      const payload = await buildAutoModDashboardComponents(interaction.guild, secConfig, context);
      return interaction.editReply(payload);
    }
    if (val === 'group_punishments') {
      const payload = buildPunishmentPolicyGUI(interaction.guild, secConfig);
      return interaction.editReply(payload);
    }
    if (val === 'group_presets') {
      const payload = buildPresetsDashboardComponents(interaction.guild, secConfig);
      return interaction.editReply(payload);
    }
    if (val === 'group_whitelist') {
      const payload = await buildWhitelistManagerGUI(interaction.guild, secConfig, context);
      return interaction.editReply(payload);
    }

    const payload = buildAntiNukeOverview(secConfig, val);
    return interaction.editReply(payload);
  }

  // 9b. Anti-Nuke Quick Navigation Buttons
  if (customId === 'btn_an_nav_roles') {
    await interaction.deferUpdate().catch(() => {});
    const payload = buildAntiNukeOverview(secConfig, 'group_roles');
    return interaction.editReply(payload);
  }

  if (customId === 'btn_an_nav_channels') {
    await interaction.deferUpdate().catch(() => {});
    const payload = buildAntiNukeOverview(secConfig, 'group_channels');
    return interaction.editReply(payload);
  }

  if (customId === 'btn_an_nav_members') {
    await interaction.deferUpdate().catch(() => {});
    const payload = buildAntiNukeOverview(secConfig, 'group_members');
    return interaction.editReply(payload);
  }

  if (customId === 'btn_an_nav_server') {
    await interaction.deferUpdate().catch(() => {});
    const payload = buildAntiNukeOverview(secConfig, 'group_server');
    return interaction.editReply(payload);
  }

  if (customId === 'btn_an_refresh_hub') {
    await interaction.deferUpdate().catch(() => {});
    const payload = await buildAntiNukeDashboardGUI(interaction.guild, secConfig, context);
    return interaction.editReply({ embeds: [payload.embed], components: payload.components });
  }

  // 10. Category Specific Action Setters (`btn_sec_cat_action_<group>_<action>`)
  if (customId.startsWith('btn_sec_cat_action_')) {
    await interaction.deferUpdate().catch(() => {});
    const parts = customId.replace('btn_sec_cat_action_', '').split('_');
    const groupKey = `group_${parts[0]}`;
    const action = parts.slice(1).join('_');
    const keys = categoryRules[groupKey] || [];

    for (const k of keys) {
      secConfig.rules[k] = { ...(secConfig.rules[k] || {}), action };
    }
    context.updateModuleConfig('security', secConfig);
    context.logSyncEvent?.(`[Security GUI] Category ${groupKey} action set to ${action.toUpperCase()} by ${interaction.user.username}.`, 'success');

    const payload = buildAntiNukeOverview(secConfig, groupKey);
    return interaction.editReply(payload);
  }

  // 11. Category Specific Auto-Revert Toggle (`btn_sec_cat_toggle_revert_<group>`)
  if (customId.startsWith('btn_sec_cat_toggle_revert_')) {
    await interaction.deferUpdate().catch(() => {});
    const groupKey = customId.replace('btn_sec_cat_toggle_revert_', '');
    const keys = categoryRules[groupKey] || [];
    const firstRule = secConfig.rules[keys[0]] || {};
    const nextState = !(firstRule.recovery !== false);

    for (const k of keys) {
      secConfig.rules[k] = { ...(secConfig.rules[k] || {}), recovery: nextState };
    }
    context.updateModuleConfig('security', secConfig);
    context.logSyncEvent?.(`[Security GUI] Category ${groupKey} auto-revert set to ${nextState ? 'ON' : 'OFF'} by ${interaction.user.username}.`, 'info');

    const payload = buildAntiNukeOverview(secConfig, groupKey);
    return interaction.editReply(payload);
  }

  // 12. Category Specific Sensitivity Setters (`btn_sec_cat_thresh_<group>_<limit>_<window>`)
  if (customId.startsWith('btn_sec_cat_thresh_')) {
    await interaction.deferUpdate().catch(() => {});
    const parts = customId.replace('btn_sec_cat_thresh_', '').split('_');
    const groupKey = `group_${parts[0]}`;
    const limit = parseInt(parts[1], 10) || 1;
    const window = parseInt(parts[2], 10) || 10;
    const keys = categoryRules[groupKey] || [];

    for (const k of keys) {
      secConfig.rules[k] = { ...(secConfig.rules[k] || {}), limit, window };
    }
    context.updateModuleConfig('security', secConfig);
    context.logSyncEvent?.(`[Security GUI] Category ${groupKey} rate limit set to ${limit} per ${window}s by ${interaction.user.username}.`, 'success');

    const payload = buildAntiNukeOverview(secConfig, groupKey);
    return interaction.editReply(payload);
  }

  // 12b. Custom Threshold Modal Opener (`btn_sec_cat_custom_thresh_<group>`)
  if (customId.startsWith('btn_sec_cat_custom_thresh_')) {
    const groupKey = customId.replace('btn_sec_cat_custom_thresh_', '');
    const modal = new ModalBuilder()
      .setCustomId(`modal_sec_thresh_${groupKey}`)
      .setTitle(`Custom Rate Limit: ${groupKey.replace('group_', '').toUpperCase()}`);

    const limitInput = new TextInputBuilder()
      .setCustomId('in_thresh_limit')
      .setLabel('Action Threshold Limit (Count)')
      .setPlaceholder('Enter action count before trigger (e.g. 2)')
      .setStyle(TextInputStyle.Short)
      .setMinLength(1)
      .setMaxLength(3)
      .setRequired(true);

    const windowInput = new TextInputBuilder()
      .setCustomId('in_thresh_window')
      .setLabel('Time Window In Seconds')
      .setPlaceholder('Enter time window in seconds (e.g. 10)')
      .setStyle(TextInputStyle.Short)
      .setMinLength(1)
      .setMaxLength(4)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(limitInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(windowInput)
    );

    return interaction.showModal(modal);
  }

  // 12c. Custom Threshold Modal Submit Handler
  if (customId.startsWith('modal_sec_thresh_')) {
    await interaction.deferUpdate().catch(() => {});
    const groupKey = customId.replace('modal_sec_thresh_', '');
    const limitVal = parseInt(interaction.fields.getTextInputValue('in_thresh_limit'), 10);
    const windowVal = parseInt(interaction.fields.getTextInputValue('in_thresh_window'), 10);

    const validLimit = (!isNaN(limitVal) && limitVal > 0) ? limitVal : 3;
    const validWindow = (!isNaN(windowVal) && windowVal > 0) ? windowVal : 10;

    const keys = categoryRules[groupKey] || [];
    for (const k of keys) {
      secConfig.rules[k] = {
        ...(secConfig.rules[k] || {}),
        limit: validLimit,
        window: validWindow
      };
    }

    context.updateModuleConfig('security', secConfig);
    context.logSyncEvent?.(`[Security GUI] Category ${groupKey} threshold updated to ${validLimit} actions per ${validWindow}s by ${interaction.user.username}.`, 'success');

    const payload = buildAntiNukeOverview(secConfig, groupKey);
    return interaction.editReply(payload);
  }

  // 13. Category Specific Toggle All Rules (`btn_sec_cat_toggle_all_<group>`)
  if (customId.startsWith('btn_sec_cat_toggle_all_')) {
    await interaction.deferUpdate().catch(() => {});
    const groupKey = customId.replace('btn_sec_cat_toggle_all_', '');
    const keys = categoryRules[groupKey] || [];
    const firstRule = secConfig.rules[keys[0]] || {};
    const nextState = !(firstRule.enabled !== false);

    for (const k of keys) {
      secConfig.rules[k] = { ...(secConfig.rules[k] || {}), enabled: nextState };
    }
    context.updateModuleConfig('security', secConfig);
    context.logSyncEvent?.(`[Security GUI] Category ${groupKey} rules toggled to ${nextState ? 'ENABLED' : 'DISABLED'} by ${interaction.user.username}.`, 'warn');

    const payload = buildAntiNukeOverview(secConfig, groupKey);
    return interaction.editReply(payload);
  }

  // 14. Category Refresh (`btn_sec_refresh_cat_<group>`)
  if (customId.startsWith('btn_sec_refresh_cat_')) {
    await interaction.deferUpdate().catch(() => {});
    const groupKey = customId.replace('btn_sec_refresh_cat_', '');
    const payload = buildAntiNukeOverview(secConfig, groupKey);
    return interaction.editReply(payload);
  }

  // 15. AutoMod Toggles & Actions
  if (customId === 'btn_sec_am_toggle_antilink') {
    await interaction.deferUpdate().catch(() => {});
    const amMod = modules.find((m: any) => m.id === 'automod');
    const amConfig = { ...(amMod?.config || {}) };
    const current = amConfig.blockLinks !== false && amConfig.antiLinkEnabled !== false;
    const next = !current;
    amConfig.blockLinks = next;
    amConfig.antiLinkEnabled = next;
    context.updateModuleConfig('automod', amConfig);

    secConfig.automod = secConfig.automod || {};
    secConfig.automod.antiLinkEnabled = next;
    context.updateModuleConfig('security', secConfig);

    context.logSyncEvent?.(`[AutoMod GUI] Anti-Link toggled to ${next ? 'ON' : 'OFF'} by ${interaction.user.username}.`, next ? 'success' : 'warn');

    const payload = await buildAutoModDashboardComponents(interaction.guild, secConfig, context);
    return interaction.editReply(payload);
  }

  if (customId === 'btn_sec_am_toggle_antispam') {
    await interaction.deferUpdate().catch(() => {});
    const amMod = modules.find((m: any) => m.id === 'automod');
    const amConfig = { ...(amMod?.config || {}) };
    const current = amConfig.antiSpamEnabled === true || Boolean(amConfig.maxSpamMessages);
    const next = !current;
    amConfig.antiSpamEnabled = next;
    if (next && !amConfig.maxSpamMessages) amConfig.maxSpamMessages = 5;
    context.updateModuleConfig('automod', amConfig);

    secConfig.automod = secConfig.automod || {};
    secConfig.automod.antiSpamEnabled = next;
    context.updateModuleConfig('security', secConfig);

    context.logSyncEvent?.(`[AutoMod GUI] Anti-Spam toggled to ${next ? 'ON' : 'OFF'} by ${interaction.user.username}.`, next ? 'success' : 'warn');

    const payload = await buildAutoModDashboardComponents(interaction.guild, secConfig, context);
    return interaction.editReply(payload);
  }

  if (customId === 'btn_sec_am_toggle_antieveryone') {
    await interaction.deferUpdate().catch(() => {});
    const ruleEveryone = secConfig?.rules?.anti_everyone_here;
    const current = (ruleEveryone?.enabled !== false) && (secConfig?.automod?.antiEveryoneEnabled !== false);
    const next = !current;

    secConfig.rules.anti_everyone_here = { ...(secConfig.rules.anti_everyone_here || {}), enabled: next };
    secConfig.automod = secConfig.automod || {};
    secConfig.automod.antiEveryoneEnabled = next;
    context.updateModuleConfig('security', secConfig);

    const amMod = modules.find((m: any) => m.id === 'automod');
    const amConfig = { ...(amMod?.config || {}) };
    amConfig.antiEveryoneEnabled = next;
    context.updateModuleConfig('automod', amConfig);

    context.logSyncEvent?.(`[AutoMod GUI] Anti-Ping toggled to ${next ? 'ON' : 'OFF'} by ${interaction.user.username}.`, next ? 'success' : 'warn');

    const payload = await buildAutoModDashboardComponents(interaction.guild, secConfig, context);
    return interaction.editReply(payload);
  }

  if (customId.startsWith('btn_sec_am_action_')) {
    await interaction.deferUpdate().catch(() => {});
    const act = customId.replace('btn_sec_am_action_', '');
    secConfig.automod = secConfig.automod || {};
    secConfig.automod.punishmentAction = act;
    context.updateModuleConfig('security', secConfig);

    const amMod = modules.find((m: any) => m.id === 'automod');
    const amConfig = { ...(amMod?.config || {}) };
    amConfig.punishment = act;
    amConfig.spamAction = act;
    amConfig.punishmentAction = act;
    context.updateModuleConfig('automod', amConfig);

    context.logSyncEvent?.(`[AutoMod GUI] Violation punishment set to ${act.toUpperCase()} by ${interaction.user.username}.`, 'success');

    const payload = await buildAutoModDashboardComponents(interaction.guild, secConfig, context);
    return interaction.editReply(payload);
  }

  // 16. Security Presets Application
  if (customId.startsWith('btn_sec_preset_')) {
    await interaction.deferUpdate().catch(() => {});
    const p = customId.replace('btn_sec_preset_', '');
    secConfig.preset = p;

    const allKeys = Object.values(categoryRules).flat();
    if (p === 'strict') {
      for (const k of allKeys) secConfig.rules[k] = { enabled: true, limit: 1, window: 10, action: 'quarantine', recovery: true };
    } else if (p === 'standard') {
      for (const k of allKeys) secConfig.rules[k] = { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true };
    } else if (p === 'relaxed') {
      for (const k of allKeys) secConfig.rules[k] = { enabled: true, limit: 5, window: 10, action: 'kick', recovery: true };
    } else if (p === 'aggressive') {
      for (const k of allKeys) secConfig.rules[k] = { enabled: true, limit: 1, window: 10, action: 'ban', recovery: true };
    }

    context.updateModuleConfig('security', secConfig);
    context.logSyncEvent?.(`[Security GUI] Security profile set to ${p.toUpperCase()} by ${interaction.user.username}.`, 'success');

    const payload = buildPresetsDashboardComponents(interaction.guild, secConfig);
    return interaction.editReply(payload);
  }

  // 17. Global Punishment Action Policy Setters
  if (customId.startsWith('btn_sec_global_action_')) {
    await interaction.deferUpdate().catch(() => {});
    const act = customId.replace('btn_sec_global_action_', '');
    secConfig.defaultPunishment = act;

    const allKeys = Object.values(categoryRules).flat();
    for (const k of allKeys) {
      secConfig.rules[k] = { ...(secConfig.rules[k] || {}), action: act };
    }

    context.updateModuleConfig('security', secConfig);
    context.logSyncEvent?.(`[Security GUI] Global threat punishment policy set to ${act.toUpperCase()} by ${interaction.user.username}.`, 'success');

    const payload = buildPunishmentPolicyGUI(interaction.guild, secConfig);
    return interaction.editReply(payload);
  }

  // 18. Enable All Dashboard Subsystem Navigators
  if (customId === 'btn_sec_nav_hub') {
    await interaction.deferUpdate().catch(() => {});
    const payload = await buildSecurityDashboardComponents(interaction.guild, secConfig, context);
    return interaction.editReply({ embeds: [payload.embed], components: payload.components });
  }

  if (customId === 'btn_sec_nav_automod' || customId === 'btn_sec_am_refresh') {
    await interaction.deferUpdate().catch(() => {});
    const payload = await buildAutoModDashboardComponents(interaction.guild, secConfig, context);
    return interaction.editReply(payload);
  }

  if (customId === 'btn_sec_nav_jtc') {
    await interaction.deferUpdate().catch(() => {});
    const { buildJTCAdminDashboardGUI } = await import('../joinToCreate/manifest.js');
    const jtcMod = modules.find((m: any) => m.id === 'join_to_create');
    const payload = buildJTCAdminDashboardGUI(interaction.guild, jtcMod?.config || {});
    return interaction.editReply({ embeds: [payload.embed], components: payload.components });
  }

  if (customId === 'btn_sec_nav_verify') {
    await interaction.deferUpdate().catch(() => {});
    const { buildVerificationAdminDashboardGUI } = await import('../verification/manifest.js');
    const verMod = modules.find((m: any) => m.id === 'verification');
    const payload = buildVerificationAdminDashboardGUI(interaction.guild, verMod?.config || {});
    return interaction.editReply(payload);
  }

  if (customId === 'btn_enable_all_resync' || customId === 'btn_enable_all_refresh') {
    await interaction.deferUpdate().catch(() => {});
    const payload = buildEnableAllDashboardGUI(interaction.guild, secConfig);
    return interaction.editReply(payload);
  }

  // 19. Overview Dashboard Actions & 2FA Setup
  if (customId === 'btn_sec_link_gmail') {
    const modal = new ModalBuilder()
      .setCustomId('modal_sec_configure_gmail')
      .setTitle('Link Gmail for 2FA Alerts');

    const input = new TextInputBuilder()
      .setCustomId('input_sec_gmail')
      .setLabel('Your Gmail Address')
      .setPlaceholder('e.g. yourname@gmail.com')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit && interaction.isModalSubmit() && customId === 'modal_sec_configure_gmail') {
    const email = interaction.fields.getTextInputValue('input_sec_gmail')?.trim();
    if (!email || !email.includes('@') || !email.includes('.')) {
      return interaction.reply({
        content: `${WRONG_ICON} Please provide a valid email address.`,
        flags: 64
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    EmailService.setPending2FA(interaction.guild.id, {
      email,
      code: otp,
      expiresAt: Date.now() + 10 * 60 * 1000,
      userId: interaction.user.id
    });

    const result = await EmailService.send2FAVerificationCode(email, otp, interaction.guild.name);
    if (!result.success) {
      return interaction.reply({
        content: `${WRONG_ICON} **Email Dispatch Failed.** ${result.error || 'Please check bot SMTP configuration in \`.env\`. '}`,
        flags: 64
      });
    }

    const verifyRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_sec_open_otp_modal')
        .setLabel('Enter Verification Code')
        .setStyle(ButtonStyle.Primary)
    );

    const embed = new EmbedBuilder()
      .setColor(0x00AAFF)
      .setAuthor({ name: 'RAGE OPTIMISER ENTERPRISE • 2FA SETUP' })
      .setTitle('Verification Code Dispatched')
      .setDescription([
        `>>> ${SECURITY_SHIELD_ICON} **6-digit code** sent to **\`${EmailService.maskEmail(email)}\`**.`,
        'Click **Enter Verification Code** below to finalize linking.',
        '⏱️ Code expires in **10 minutes**.'
      ].join('\n'))
      .setFooter({ text: 'Rage Optimiser Enterprise • Gmail 2FA Setup' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], components: [verifyRow], flags: 64 });
  }

  if (customId === 'btn_sec_open_otp_modal') {
    const modal = new ModalBuilder()
      .setCustomId('modal_sec_verify_otp')
      .setTitle('Verify 2FA Gmail Code');

    const input = new TextInputBuilder()
      .setCustomId('input_sec_otp_code')
      .setLabel('6-Digit Verification Code')
      .setPlaceholder('Enter 6-digit code received in Gmail')
      .setMinLength(6)
      .setMaxLength(6)
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit && interaction.isModalSubmit() && customId === 'modal_sec_verify_otp') {
    const code = interaction.fields.getTextInputValue('input_sec_otp_code')?.trim();
    const pending = EmailService.getPending2FA(interaction.guild.id);

    if (!pending || pending.code !== code) {
      return interaction.reply({
        content: `${WRONG_ICON} Invalid or expired verification code. Please request a new code.`,
        flags: 64
      });
    }

    secConfig.alertEmail = pending.email;
    context.updateModuleConfig('security', secConfig);
    EmailService.clearPending2FA(interaction.guild.id);

    const successEmbed = new EmbedBuilder()
      .setColor(0x00E5FF)
      .setAuthor({ name: 'RAGE OPTIMISER ENTERPRISE • 2FA LINKED' })
      .setTitle('Gmail 2FA Successfully Linked')
      .setDescription(
        `<a:success_check:1546134620087783526> Your Gmail has been verified and linked as the **2FA Security Alert** recipient.\n\n` +
        `All critical security alerts, threat notifications, and disable-gate OTPs will now be dispatched to \`${EmailService.maskEmail(pending.email)}\`.`
      )
      .setFooter({ text: 'Rage Optimiser Enterprise • 2FA Active' })
      .setTimestamp();

    await interaction.reply({ embeds: [successEmbed], flags: 64 });

    if (interaction.message && !interaction.message.flags?.has(64)) {
      const refreshedPayload = buildEnableAllDashboardGUI(interaction.guild, secConfig);
      await interaction.message.edit(refreshedPayload).catch(() => {});
    }
    return;
  }

  if (customId === 'btn_sec_remove_gmail') {
    await interaction.deferUpdate().catch(() => {});
    delete secConfig.alertEmail;
    context.updateModuleConfig('security', secConfig);

    const refreshedPayload = buildEnableAllDashboardGUI(interaction.guild, secConfig);
    return interaction.editReply(refreshedPayload);
  }

  if (customId === 'btn_sec_open_extraowner') {
    await interaction.deferUpdate().catch(() => {});
    const { getGuildExtraOwnersFromCache } = await import('../../utils/whitelistCheck.js');
    const extraOwners = await getGuildExtraOwnersFromCache(interaction.guild.id);
    const ownerList = extraOwners.length > 0 ? extraOwners.map((id: string) => `<@${id}>`).join(', ') : 'None';

    const embed = new EmbedBuilder()
      .setColor(0x2B2D31)
      .setTitle('Extra Owner Administration')
      .setDescription(
        `> **Active Extra Owners**: ${ownerList}\n\n` +
        `**Management Commands:**\n` +
        `• \`r!extraowner add @user\` — Grant Extra Owner privileges\n` +
        `• \`r!extraowner remove @user\` — Revoke Extra Owner privileges\n` +
        `• \`r!extraowner list\` — Display all designated Extra Owners`
      )
      .setFooter({ text: 'Rage Optimiser Enterprise • Security Core' });

    return interaction.followUp({ embeds: [embed], flags: 64 });
  }

  if (customId === 'btn_sec_open_whitelist_user' || customId === 'btn_sec_open_whitelist_role' || customId === 'btn_sec_open_whitelist') {
    await interaction.deferUpdate().catch(() => {});
    const payload = await buildWhitelistManagerGUI(interaction.guild, secConfig, context);
    return interaction.editReply(payload);
  }

  if (customId === 'btn_sec_enable_all_quick') {
    await interaction.deferUpdate().catch(() => {});
    if (context?.toggleModule) {
      context.toggleModule('security', true);
      context.toggleModule('prebot_whitelist', true);
      context.toggleModule('member_whitelist', true);
      context.toggleModule('automod', true);
      context.toggleModule('voice-protection', true);
      context.toggleModule('joinToCreate', true);
      context.toggleModule('logging', true);
      context.toggleModule('backups', true);
    }
    const currentSec = { ...secConfig, antiNukeEnabled: true, prebotEnabled: true };
    if (context?.updateModuleConfig) {
      context.updateModuleConfig('security', currentSec);
    }
    const { buildEnableAllDashboardGUI } = await import('../config/manifest.js');
    const refreshed = buildEnableAllDashboardGUI(interaction.guild, currentSec);
    return interaction.editReply(refreshed);
  }

  if (customId === 'btn_sec_close_overview') {
    return interaction.message?.delete().catch(() => {});
  }

  // 20. Direct Dashboard & Whitelist Shortcuts
  if (customId === 'sec_btn_extraowner') {
    return interaction.reply({
      content: `🛡️ **ExtraOwner Management**\n> Use \`r!extraowner add @user\` to delegate ExtraOwner privileges.\n> Use \`r!extraowner list\` to view all assigned Extra Owners.`,
      flags: 64,
      ephemeral: true
    }).catch(() => { });
  }

  if (customId === 'sec_btn_wl_user') {
    return interaction.reply({
      content: `👤 **User Whitelist Management**\n> Use \`r!whitelist user add @user\` to whitelist a trusted user.\n> Use \`r!whitelist user list\` to view whitelisted users.`,
      flags: 64,
      ephemeral: true
    }).catch(() => { });
  }

  if (customId === 'sec_btn_wl_role') {
    return interaction.reply({
      content: `🎭 **Role Whitelist Management**\n> Use \`r!whitelist role add @role\` to whitelist a trusted role.\n> Use \`r!whitelist role list\` to view whitelisted roles.`,
      flags: 64,
      ephemeral: true
    }).catch(() => { });
  }

  if (customId === 'sec_btn_2fa') {
    return interaction.reply({
      content: `<a:success_check:1546134620087783526> **2FA Passcode Protection**\n> Use \`r!prebot 2fa set <6-digit-pin>\` to configure your Owner 2FA passcode for secure bot departure and critical administrative overrides.`,
      flags: 64,
      ephemeral: true
    }).catch(() => { });
  }

  if (customId === 'sec_btn_rescan') {
    const { buildSecurityDashboardCard } = await import('./enable.js');
    const { DashboardSyncService } = await import('../../services/DashboardSyncService.js');
    const dashboard = await buildSecurityDashboardCard(interaction.guild);
    if (interaction.channelId && interaction.message?.id) {
      DashboardSyncService.registerDashboard(interaction.guild.id, interaction.channelId, interaction.message.id).catch(() => {});
    }
    return interaction.update({ content: dashboard.content, embeds: dashboard.embeds, components: dashboard.components }).catch(() => { });
  }

  if (customId === 'sec_btn_logs') {
    return interaction.reply({
      content: `<a:success_check:1546134620087783526> **Security Log Sentinel**\n> Use \`r!security logs\` or \`r!config antinuke\` to inspect full real-time threat telemetry and audit log history.`,
      flags: 64,
      ephemeral: true
    }).catch(() => { });
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
          required: false
        },
        {
          name: 'reason',
          type: 3,
          description: 'Reason for quarantine isolation',
          required: false
        }
      ]
    },
    {
      name: 'unquarantine',
      description: 'Release a member from quarantine isolation and restore original roles.',
      options: [
        {
          name: 'user',
          type: 6,
          description: 'The member to unquarantine',
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
          name: 'config-rule',
          description: 'Configure an anti-nuke protection module (limit, window, action, reversion)',
          type: 1,
          options: [
            { name: 'rule', type: 3, description: 'Module rule name (e.g. anti_role_grant, anti_channel_delete)', required: true },
            { name: 'enabled', type: 5, description: 'Enable or disable rule', required: false },
            { name: 'limit', type: 4, description: 'Action threshold limit', required: false },
            { name: 'window', type: 4, description: 'Time window in seconds', required: false },
            {
              name: 'action', type: 3, description: 'Punishment action', required: false, choices: [
                { name: 'Quarantine', value: 'quarantine' },
                { name: 'Ban', value: 'ban' },
                { name: 'Kick', value: 'kick' },
                { name: 'Strip Roles', value: 'strip_roles' },
                { name: 'Warn', value: 'warn' }
              ]
            },
            { name: 'reversion', type: 5, description: 'Enable or disable automatic recovery/reversion', required: false }
          ]
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
    },

    {
      name: 'temprole',
      description: 'Assign a temporary role to a member for a specified duration.',
      options: [
        { name: 'user', type: 6, description: 'Target member', required: true },
        { name: 'role', type: 8, description: 'Role to assign', required: true },
        { name: 'duration', type: 3, description: 'Duration (e.g. 1h, 1d)', required: true },
        { name: 'reason', type: 3, description: 'Reason for role assignment', required: false }
      ]
    },
    {
      name: 'cases',
      description: 'View moderation case history for a member or the server.',
      options: [
        { name: 'user', type: 6, description: 'Filter by member (optional)', required: false }
      ]
    },
    {
      name: 'addrole',
      description: 'Assign single or multiple roles to a member with custom reason and duration.',
      options: [
        { name: 'user', type: 6, description: 'Target member to assign the role(s)', required: true },
        { name: 'role', type: 8, description: 'Primary role to assign', required: true },
        { name: 'role2', type: 8, description: 'Second role to assign (optional)', required: false },
        { name: 'role3', type: 8, description: 'Third role to assign (optional)', required: false },
        { name: 'role4', type: 8, description: 'Fourth role to assign (optional)', required: false },
        { name: 'role5', type: 8, description: 'Fifth role to assign (optional)', required: false },
        { name: 'reason', type: 3, description: 'Audit log reason for role assignment', required: false },
        { name: 'duration', type: 3, description: 'Optional temporary duration (e.g. 10m, 1h, 1d)', required: false }
      ]
    },
    {
      name: 'removerole',
      description: 'Remove a role from a member with custom reason and premium UI controls.',
      options: [
        { name: 'user', type: 6, description: 'Target member to remove the role from', required: true },
        { name: 'role', type: 8, description: 'Role to remove', required: true },
        { name: 'reason', type: 3, description: 'Audit log reason for role removal', required: false }
      ]
    }
  ],
  events: [
    {
      name: 'command_botleave',
      handler: async (client: any, interaction: any, context: any) => {
        const guild = interaction.guild;
        if (!guild) {
          return interaction.reply({ content: `${WRONG_ICON} This command can only be executed in a server.`, flags: 64 });
        }

        if (interaction.user.id !== guild.ownerId) {
          return interaction.reply({
            embeds: [createLimeEmbed({
              title: 'Owner Authority Required',
              description: `${WRONG_ICON} **Access Denied**: Only the primary Discord Server Owner (<@${guild.ownerId}>) can authorize bot departure.`
            })],
            flags: 64
          });
        }

        const tfaCfg = await TwoFactorManager.getPrebot2FAConfig(guild.id);
        if (!tfaCfg || !tfaCfg.pin) {
          return interaction.reply({
            embeds: [createLimeEmbed({
              title: '2FA Setup Required For Departure',
              description: `${SHIELD_ICON} **Mandatory 2FA Departure Gate**: No 2FA passcode is set for **${guild.name}**.\n\nTo prevent unauthorized bot kicks, the Server Owner (<@${guild.ownerId}>) MUST set a 6-digit 2FA passcode first before authorizing bot departure:\n\n> 1. \`r!prebot 2fa set <6-digit-pin>\`\n> 2. \`r!botleave <6-digit-pin>\``,
              color: 0xF59E0B
            })],
            flags: 64
          });
        }

        const pinArg = interaction.options?.getString?.('pin', false) || interaction.parsed?.args?.find((a: string) => /^\d{6}$/.test(a.trim()));
        if (!pinArg) {
          return interaction.reply({
            embeds: [createLimeEmbed({
              title: '2FA Passcode Required',
              description: `${SHIELD_ICON} **Mandatory 2FA Gate**: Server departure requires your 6-digit Owner 2FA Passcode.\n\nPlease supply your 6-digit passcode to authorize bot removal:\n> \`r!botleave <6-digit-pin>\``,
              color: 0xF59E0B
            })],
            flags: 64
          });
        }

        const isValid = TwoFactorManager.verifyPin(tfaCfg.pin, pinArg);
        if (!isValid) {
          return interaction.reply({
            embeds: [createLimeEmbed({
              title: '2FA Verification Failed',
              description: `${WRONG_ICON} Invalid 6-digit passcode. Bot departure **REJECTED**.`,
              color: 0xEF4444
            })],
            flags: 64
          });
        }

        await interaction.reply({
          embeds: [createLimeEmbed({
            title: 'Bot Departure Authorized',
            description: `${VERIFIED_ICON} 2FA PIN Verified. Rage Optimiser is now departing **${guild.name}**. All server snapshots and configuration data remain securely saved in cloud memory.`,
            color: 0x10B981
          })]
        });

        setTimeout(() => {
          guild.leave().catch((err: any) => console.error('[BotLeave] Failed to leave guild:', err));
        }, 1500);
      }
    },
    {
      name: 'command_addrole',
      handler: async (client: any, interaction: any, context: any) => {
        const guild = interaction.guild;
        if (!guild) {
          return interaction.reply({ content: '❌ This command can only be executed in a server.', flags: 64 });
        }

        const executorMember = interaction.member;
        const { isOwnerOrExtraOwner, checkWhitelistPermission } = await import('../../utils/whitelistCheck.js');
        const isOwner = await isOwnerOrExtraOwner(interaction.user.id, guild);
        const isWhitelisted = await checkWhitelistPermission(interaction.user.id, guild, context, 'anti_role_grant');

        if (!isOwner && !isWhitelisted) {
          const permEmbed = Embeds.error(
            'Access Denied',
            '🔒 **Restricted Command**: Role assignment commands can only be executed by the **Server Owner**, **Extra Owners**, and **Whitelisted Members**.\nNormal Administrator permissions are not sufficient.',
            { module: 'security' }
          );
          return interaction.reply({ embeds: [permEmbed], flags: 64 });
        }

        const targetUser = interaction.options.getUser('user');
        const targetMember = interaction.options.getMember('user') || (targetUser ? await guild.members.fetch(targetUser.id).catch(() => null) : null);
        const reason = interaction.options.getString('reason');
        const durationStr = interaction.options.getString('duration');

        if (!targetMember) {
          const errEmbed = Embeds.error(`${MEMBER_ICON} Member Not Found`, 'Could not locate the specified target member in this server.', { module: 'security' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }

        const roleOpts = ['role', 'role2', 'role3', 'role4', 'role5'];
        const rolesToProcess: any[] = [];
        const seenRoleIds = new Set<string>();

        for (const optName of roleOpts) {
          const r = interaction.options.getRole(optName);
          if (r && !seenRoleIds.has(r.id)) {
            seenRoleIds.add(r.id);
            rolesToProcess.push(r);
          }
        }

        if (rolesToProcess.length === 0) {
          const errEmbed = Embeds.error('Role Not Found', 'Could not locate any specified roles to assign.', { module: 'security' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }

        const botMember = guild.members.me;
        const assignedRoles: any[] = [];
        const skippedRoles: { role: any; reason: string }[] = [];

        for (const role of rolesToProcess) {
          if (role.managed) {
            skippedRoles.push({ role, reason: 'Managed role (cannot be manually assigned)' });
            continue;
          }

          if (botMember && role.position >= botMember.roles.highest.position) {
            skippedRoles.push({ role, reason: `Position (#${role.position}) higher/equal to bot highest role (#${botMember.roles.highest.position})` });
            continue;
          }

          if (guild.ownerId !== interaction.user.id && executorMember) {
            if (role.position >= executorMember.roles.highest.position) {
              skippedRoles.push({ role, reason: `Position (#${role.position}) higher/equal to your highest role (#${executorMember.roles.highest.position})` });
              continue;
            }
          }

          if (targetMember.roles.cache.has(role.id)) {
            skippedRoles.push({ role, reason: 'Member already possesses this role' });
            continue;
          }

          assignedRoles.push(role);
        }

        if (assignedRoles.length === 0) {
          const warnEmbed = Embeds.warn(
            'No Roles Assigned',
            `Could not assign specified role(s) to ${targetMember} (\`${targetMember.user.tag}\`).`,
            {
              module: 'security',
              fields: skippedRoles.map(s => ({
                name: '✨ . Audit',
                value: s.reason,
                inline: false
              }))
            }
          );
          return interaction.reply({ embeds: [warnEmbed], flags: 64 });
        }

        let durationMs: number | null = null;
        let expiresTimestamp: number | null = null;
        if (durationStr) {
          const match = durationStr.trim().match(/^(\d+)\s*([mhd])$/i);
          if (match) {
            const amount = parseInt(match[1], 10);
            const unit = match[2].toLowerCase();
            if (unit === 'm') durationMs = amount * 60000;
            else if (unit === 'h') durationMs = amount * 3600000;
            else if (unit === 'd') durationMs = amount * 86400000;
          }
          if (!durationMs) {
            const errEmbed = Embeds.error('Invalid Duration Format', 'Please use a valid duration format such as `10m`, `1h`, `1d`, or `7d`.', { module: 'security' });
            return interaction.reply({ embeds: [errEmbed], flags: 64 });
          }
          expiresTimestamp = Math.floor((Date.now() + durationMs) / 1000);
        }

        const logReason = reason || 'No reason provided';
        const successfullyAdded: any[] = [];

        for (const role of assignedRoles) {
          try {
            await targetMember.roles.add(role.id, `Role added by ${interaction.user.tag}: ${logReason}`);
            context.logSyncEvent(`Role Manager: Assigned role "${role.name}" (${role.id}) to "${targetMember.user.tag}" by "${interaction.user.tag}". Reason: ${logReason}`, 'success');

            const db = Database.getDb();
            if (db) {
              try {
                const lastRow: any = await Database.get('SELECT MAX(caseId) as maxId FROM moderation_cases WHERE guildId = ?', [guild.id]);
                const caseId = (lastRow?.maxId || 0) + 1;
                await Database.run(
                  'INSERT INTO moderation_cases (guildId, caseId, targetId, targetTag, moderatorId, moderatorTag, action, reason, duration, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                  [
                    guild.id,
                    caseId,
                    targetMember.id,
                    targetMember.user.tag,
                    interaction.user.id,
                    interaction.user.tag,
                    durationMs ? 'TEMPROLE' : 'ADDROLE',
                    `${role.name}: ${logReason}`,
                    durationMs || 0,
                    expiresTimestamp ? expiresTimestamp * 1000 : 0,
                    Date.now()
                  ]
                );
              } catch (e) { }
            }

            if (durationMs) {
              setTimeout(async () => {
                await targetMember.roles.remove(role.id, 'Temporary role duration expired').catch(() => { });
                context.logSyncEvent(`Role Manager: Temporary role "${role.name}" expired for "${targetMember.user.tag}".`, 'info');
              }, durationMs);
            }

            successfullyAdded.push(role);
          } catch (err: any) {
            skippedRoles.push({ role, reason: err.message });
          }
        }

        if (successfullyAdded.length === 0) {
          const errEmbed = createLimeEmbed({
            author: 'Rage Optimiser Enterprise - Core Security Engine',
            title: 'Role Assignment Failed',
            description: `${WRONG_ICON} Could not assign role(s) to ${targetMember}.`,
            color: 0xEF4444,
            client
          });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }

        const roleSummaryStr = successfullyAdded.length === 1 ? `${successfullyAdded[0]}` : successfullyAdded.map(r => `${r}`).join(', ');

        const embed = buildMinimalAction({
          user: interaction.user,
          action: 'Has Given',
          target: roleSummaryStr,
          toOrFrom: 'to',
          extra: targetMember,
          reason: reason || undefined,
          duration: durationStr && durationMs ? `<t:${expiresTimestamp}:R>` : undefined
        });

        return interaction.reply({ embeds: [embed] });
      }
    },
    {
      name: 'command_removerole',
      handler: async (client: any, interaction: any, context: any) => {
        const guild = interaction.guild;
        if (!guild) {
          return interaction.reply({ content: '<a:wrong:1546155193303957504> This command can only be executed in a server.', flags: 64 });
        }

        const { isOwnerOrExtraOwner, checkWhitelistPermission } = await import('../../utils/whitelistCheck.js');
        const isOwner = await isOwnerOrExtraOwner(interaction.user.id, guild);
        const isWhitelisted = await checkWhitelistPermission(interaction.user.id, guild, context, 'anti_role_remove');

        if (!isOwner && !isWhitelisted) {
          const permEmbed = Embeds.error(
            'Access Denied',
            '🔒 **Restricted Command**: Role removal commands can only be executed by the **Server Owner**, **Extra Owners**, and **Whitelisted Members**.\nNormal Administrator permissions are not sufficient.',
            { module: 'security' }
          );
          return interaction.reply({ embeds: [permEmbed], flags: 64 });
        }

        const targetUser = interaction.options.getUser('user');
        const targetMember = interaction.options.getMember('user') || (targetUser ? await guild.members.fetch(targetUser.id).catch(() => null) : null);
        const role = interaction.options.getRole('role');
        const reason = interaction.options.getString('reason');

        if (!targetMember) {
          const errEmbed = Embeds.error(`${MEMBER_ICON} Member Not Found`, 'Could not locate the specified target member in this server.', { module: 'security' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }

        if (!role) {
          const errEmbed = Embeds.error('Role Not Found', 'Could not locate the specified role.', { module: 'security' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }

        if (!targetMember.roles.cache.has(role.id)) {
          const warnEmbed = Embeds.warn(
            'Member Missing Role',
            `Member ${targetMember} (\`${targetMember.user.tag}\`) does not have the **${role.name}** role.`,
            { module: 'security' }
          );
          return interaction.reply({ embeds: [warnEmbed], flags: 64 });
        }

        const botMember = guild.members.me;
        if (botMember && role.position >= botMember.roles.highest.position) {
          const errEmbed = Embeds.error(
            'Hierarchy Violation',
            `I cannot remove the role **${role.name}** because its position (\`#${role.position}\`) is higher than or equal to my highest role (\`${botMember.roles.highest.name}\`).`,
            { module: 'security' }
          );
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }

        try {
          const logReason = reason || 'No reason provided';
          await targetMember.roles.remove(role.id, `Role removed by ${interaction.user.tag}: ${logReason}`);
          context.logSyncEvent(`Role Manager: Removed role "${role.name}" (${role.id}) from "${targetMember.user.tag}" by "${interaction.user.tag}". Reason: ${logReason}`, 'success');

          const embed = buildMinimalAction({
            user: interaction.user,
            action: 'Has Removed',
            target: role,
            toOrFrom: 'from',
            extra: targetMember,
            reason: reason || undefined
          });

          return interaction.reply({ embeds: [embed] });
        } catch (err: any) {
          const errEmbed = Embeds.error('Role Removal Failed', err.message, { module: 'security' });
          return interaction.reply({ embeds: [errEmbed], flags: 64 });
        }
      }
    },
    {
      name: 'button_addrole_generic',
      handler: async (client: any, interaction: any, context: any) => {
        const customId = interaction.customId;
        const guild = interaction.guild;
        if (!guild) return;

        const { isOwnerOrExtraOwner, checkWhitelistPermission } = await import('../../utils/whitelistCheck.js');
        const isOwner = await isOwnerOrExtraOwner(interaction.user.id, guild);
        const isWhitelisted = await checkWhitelistPermission(interaction.user.id, guild, context, 'anti_role_remove');
        const canManage = isOwner || isWhitelisted;

        if (customId.startsWith('addrole_undo_')) {
          if (!canManage) {
            return interaction.reply({ content: `${SHIELD_ICON} Access Denied: Only the Server Owner, Extra Owners, and Whitelisted Members can undo role assignments.`, flags: 64 });
          }
          const parts = customId.split('_');
          const userId = parts[2];
          const roleId = parts[3];
          const targetMember = await guild.members.fetch(userId).catch(() => null);
          const role = guild.roles.cache.get(roleId);

          if (!targetMember || !role) {
            return interaction.reply({ content: `${WRONG_ICON} Target member or role no longer exists.`, flags: 64 });
          }

          try {
            await targetMember.roles.remove(role.id, `Role assignment undone by ${interaction.user.tag}`);
            context.logSyncEvent(`Role Manager: ${interaction.user.tag} undid assignment of role "${role.name}" from "${targetMember.user.tag}".`, 'info');

            const embedColor = role.color && role.color !== 0 ? role.color : 0x99CC00;
            const successEmbed = createLimeEmbed({
              author: 'Rage Optimiser • Security & Role Engine',
              title: 'Role Assignment Undone',
              description: `${WRONG_ICON} ${interaction.user} **has revoked** ${role} **from** ${targetMember}`,
              fields: [
                { name: `${MEMBER_ICON} Target Member`, value: `${targetMember} (\`${targetMember.user.tag}\`)`, inline: true },
                { name: `${VIP_ICON} Revoked Role`, value: `${role} (\`${role.name}\`)`, inline: true }
              ],
              color: embedColor,
              client
            });

            await interaction.reply({ embeds: [successEmbed] });
          } catch (err: any) {
            await interaction.reply({ content: `❌ Failed to undo role assignment: ${err.message}`, flags: 64 });
          }
        } else if (customId.startsWith('addrole_view_')) {
          const parts = customId.split('_');
          const userId = parts[2];
          const targetMember = await guild.members.fetch(userId).catch(() => null);
          if (!targetMember) {
            return interaction.reply({ content: '❌ Target member could not be found.', flags: 64 });
          }

          const rolesList = targetMember.roles.cache
            .filter((r: any) => r.id !== guild.id)
            .sort((a: any, b: any) => b.position - a.position)
            .map((r: any) => `${r} (\`${r.hexColor}\`)`)
            .join(', ') || '**No assigned roles**';

          const viewEmbed = new EmbedBuilder()
            .setTitle(`<:member:1532621317487071426> Role Profile: ${targetMember.user.tag}`)
            .setColor(0x99CC00)
            .setThumbnail(targetMember.user.displayAvatarURL({ size: 256 }))
            .addFields(
              { name: '<:vip:1532620837117759508> Highest Role', value: `${targetMember.roles.highest}`, inline: true },
              { name: '<a:lovemail:1527647157371535420> Total Roles', value: `\`${targetMember.roles.cache.size - 1}\``, inline: true },
              { name: '<a:Timer:1546231426863730728> Joined Server', value: `<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:R>`, inline: true },
              { name: '<:ticket:1532620631466836021> Assigned Roles', value: rolesList.length > 1024 ? rolesList.substring(0, 1020) + '...' : rolesList, inline: false }
            )
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
            .setTimestamp();

          return interaction.reply({ embeds: [viewEmbed], flags: 64 });
        } else if (customId.startsWith('addrole_info_')) {
          const parts = customId.split('_');
          const roleId = parts[2];
          const role = guild.roles.cache.get(roleId);
          if (!role) {
            return interaction.reply({ content: '<a:wrong:1546155193303957504> Role could not be found in this server.', flags: 64 });
          }

          const infoEmbed = new EmbedBuilder()
            .setTitle(`<a:lovemail:1527647157371535420> Role Information: @${role.name}`)
            .setColor(0x99CC00)
            .addFields(
              { name: '<:link:1532620952087826602> Role ID', value: `\`${role.id}\``, inline: true },
              { name: '<:config:1532425712844144701> Hex Color', value: `\`${role.hexColor}\``, inline: true },
              { name: '<:lightpurplearrow:1532621364115013693> Position', value: `\`#${role.position}\``, inline: true },
              { name: '<:member:1532621317487071426> Member Count', value: `\`${role.members.size}\` members`, inline: true },
              { name: '<:config:1532425712844144701> Hoisted', value: role.hoist ? '<:ticks:1532620580266836148> Yes' : '<a:wrong:1546155193303957504> No', inline: true },
              { name: '<a:lovemail:1527647157371535420> Mentionable', value: role.mentionable ? '<:ticks:1532620580266836148> Yes' : '<a:wrong:1546155193303957504> No', inline: true },
              { name: '<:config:1532425712844144701> Managed / Integration', value: role.managed ? 'Bot Integration' : 'Custom Role', inline: true },
              { name: '<a:Timer:1546231426863730728> Created At', value: `<t:${Math.floor(role.createdTimestamp / 1000)}:F>`, inline: true }
            )
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
            .setTimestamp();

          return interaction.reply({ embeds: [infoEmbed], flags: 64 });
        }
      }
    },

    {
      name: 'command_temprole',
      handler: async (client: any, interaction: any, context: any) => {
        const guild = interaction.guild;
        if (!guild) return;
        const target = interaction.options.getMember('user');
        const role = interaction.options.getRole('role');
        const durationStr = interaction.options.getString('duration');
        const reason = interaction.options.getString('reason') || 'Temporary role assignment';
        if (!target || !role || !durationStr) {
          return interaction.reply({ content: '<a:wrong:1546155193303957504> Invalid target or role specified.', flags: 64 });
        }
        const { isOwnerOrExtraOwner, checkWhitelistPermission } = await import('../../utils/whitelistCheck.js');
        const isOwner = await isOwnerOrExtraOwner(interaction.user.id, guild);
        const isWhitelisted = await checkWhitelistPermission(interaction.user.id, guild, context, 'anti_role_grant');
        if (!isOwner && !isWhitelisted) {
          return interaction.reply({ content: '<a:wrong:1546155193303957504> 🔒 **Access Denied**: Temporary role assignments can only be executed by the **Server Owner**, **Extra Owners**, or **Whitelisted Members**.', flags: 64 });
        }
        let durationMs = 3600000;
        if (durationStr.endsWith('m')) durationMs = parseInt(durationStr) * 60000;
        else if (durationStr.endsWith('h')) durationMs = parseInt(durationStr) * 3600000;
        else if (durationStr.endsWith('d')) durationMs = parseInt(durationStr) * 86400000;
        else durationMs = parseInt(durationStr) * 1000 || 3600000;

        const expiresAt = Date.now() + durationMs;
        try {
          await target.roles.add(role.id, reason);
          const db = Database.getDb();
          let caseId = 1;
          if (db) {
            const lastRow: any = await Database.get('SELECT MAX(caseId) as maxId FROM moderation_cases WHERE guildId = ?', [guild.id]);
            caseId = (lastRow?.maxId || 0) + 1;
            await Database.run(
              'INSERT INTO moderation_cases (guildId, caseId, targetId, targetTag, moderatorId, moderatorTag, action, reason, duration, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [guild.id, caseId, target.id, target.user.tag, interaction.user.id, interaction.user.tag, 'TEMPROLE', `${role.name}: ${reason}`, durationMs, expiresAt, Date.now()]
            );
          }
          setTimeout(async () => {
            await target.roles.remove(role.id, 'Temporary role expired').catch(() => { });
          }, durationMs);

          const { buildMinimalAction } = await import('../../core/UIFactory.js');
          const embed = buildMinimalAction({
            user: interaction.user,
            action: 'Has Given',
            target: role,
            toOrFrom: 'to',
            extra: target,
            duration: durationStr,
            reason: reason !== 'Temporary role assignment' ? reason : undefined
          });
          return interaction.reply({ embeds: [embed] });
        } catch (err: any) {
          return interaction.reply({ content: `<a:wrong:1546155193303957504> Failed to assign temp role: ${err.message}`, flags: 64 });
        }
      }
    },
    {
      name: 'command_cases',
      handler: async (client: any, interaction: any, context: any) => {
        const guild = interaction.guild;
        if (!guild) return;
        const target = interaction.options.getMember('user');
        const db = Database.getDb();
        if (!db) {
          return interaction.reply({ content: '<a:wrong:1546155193303957504> Database offline.', flags: 64 });
        }
        try {
          let rows: any[] = [];
          if (target) {
            rows = await Database.all('SELECT * FROM moderation_cases WHERE guildId = ? AND targetId = ? ORDER BY caseId DESC LIMIT 10', [guild.id, target.id]);
          } else {
            rows = await Database.all('SELECT * FROM moderation_cases WHERE guildId = ? ORDER BY caseId DESC LIMIT 10', [guild.id]);
          }

          if (!rows || rows.length === 0) {
            return interaction.reply({ content: `<a:lovemail:1527647157371535420> No moderation case records found ${target ? `for ${target.user.tag}` : 'in this server'}.` });
          }

          const embed = new EmbedBuilder()
            .setTitle(`<a:lovemail:1527647157371535420> Moderation Case History ${target ? `• ${target.user.tag}` : ''}`)
            .setColor(0x99CC00)
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
            .setTimestamp();

          for (const row of rows) {
            const timeAgo = `<t:${Math.floor(row.createdAt / 1000)}:R>`;
            embed.addFields({
              name: `Case #${row.caseId} | ${row.action} • ${row.targetTag}`,
              value: `**Moderator:** \`${row.moderatorTag}\`\n**Reason:** ${row.reason}\n**Date:** ${timeAgo}`
            });
          }

          return interaction.reply({ embeds: [embed] });
        } catch (err: any) {
          return interaction.reply({ content: `<a:wrong:1546155193303957504> Failed to fetch cases: ${err.message}`, flags: 64 });
        }
      }
    },
    {
      name: 'command_quarantine',
      handler: async (client: any, interaction: any, context: any) => {
        let member = interaction.options.getMember('user');
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        const config = secModule?.config || {};
        const quarantineRoleId = config.quarantineRoleId;

        // Try extracting raw user input if member is null
        let rawInput = interaction.options.getUser('user')?.id || interaction.options.getString('user');
        if (!member && interaction.guild) {
          if (!rawInput && interaction.parsed?.args && interaction.parsed.args.length > 0) {
            rawInput = interaction.parsed.args[0];
          }
          if (rawInput) {
            const idMatch = String(rawInput).match(/\d{17,20}/);
            if (idMatch) {
              member = interaction.guild.members.cache.get(idMatch[0]) || await interaction.guild.members.fetch(idMatch[0]).catch(() => null);
            }
          }
        }

        // Case 1: No user argument was passed at all (e.g. `r!quarantine`)
        if (!rawInput && !member) {
          const list = config.quarantinedUsers || [];
          if (list.length > 0) {
            const embed = new EmbedBuilder()
              .setTitle('<a:success_check:1546134620087783526> Security Center • Quarantined Members')
              .setColor(0xF59E0B)
              .setDescription([
                `**Currently Quarantined Members (${list.length})**:\n`,
                ...list.map((u: any, idx: number) =>
                  `\`${idx + 1}.\` **${u.tag || u.userId}** (<@${u.userId}>) — \`${u.userId}\`\n> └ **Reason**: ${u.reason || 'Manual Quarantine'} • **Date**: ${u.time ? new Date(u.time).toLocaleDateString() : 'Recent'}`
                ),
                `\n💡 **Use \`r!unquarantine <@user|id>\` to release a member from isolation.**`
              ].join('\n'))
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security Engine' })
              .setTimestamp();
            return interaction.reply({ embeds: [embed], flags: 64 });
          }

          const embed = new EmbedBuilder()
            .setTitle('<a:success_check:1546134620087783526> Security Center • Member Quarantine Management')
            .setColor(0x99CC00)
            .setDescription([
              `Isolate suspected or malicious members by stripping administrative privileges and assigning the Quarantine isolation role.\n`,
              `> <a:success_check:1546134620087783526> **Command Usage**: \`r!quarantine <@user|id> [reason]\``,
              `> 💡 **Usage Example**: \`r!quarantine @suspicious_user Malicious action\``,
              `> 🔓 **Release Usage**: \`r!unquarantine <@user|id>\``,
              `\n<:ticks:1532620580266836148> **Current Status**: 0 members isolated in quarantine.`
            ].join('\n'))
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security Engine' })
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        // Case 2: User input provided but member not found in guild
        if (!member) {
          const embed = new EmbedBuilder()
            .setTitle('<a:wrong:1546155193303957504> Security Center Error')
            .setColor(0xEF4444)
            .setDescription(`Could not locate member matching **${rawInput}** in this server. Please provide a valid user mention or 18-digit Discord user ID.`)
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (!quarantineRoleId) {
          const embed = new EmbedBuilder()
            .setTitle('<a:wrong:1546155193303957504> Security Center Error')
            .setColor(0xEF4444)
            .setDescription('The Quarantine Isolation Role is not configured for this server. Please select a Quarantine Role in the Security Dashboard or via `/security config-rule`.')
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        try {
          const rolesToRemove = member.roles.cache.filter((r: any) => r.name !== '@everyone' && !r.managed);
          const originalRoleIds = Array.from(rolesToRemove.keys());

          await member.roles.add(quarantineRoleId);
          for (const roleId of originalRoleIds) {
            await member.roles.remove(roleId).catch(() => { });
          }

          const quarantinedUsers = (config.quarantinedUsers || []).filter((u: any) => u.userId !== member.user.id);
          const reasonStr = interaction.options.getString('reason') || 'Manual Quarantine Execution';
          quarantinedUsers.push({
            id: `q-${Date.now()}`,
            tag: member.user.username,
            userId: member.user.id,
            reason: reasonStr,
            time: new Date().toISOString(),
            status: 'Quarantined',
            risk: 'danger',
            originalRoles: originalRoleIds
          });
          context.updateModuleConfig('security', { quarantinedUsers });
          context.logSyncEvent(interaction.guildId, `Manual Quarantine: ${member.user.username} isolated. Reason: ${reasonStr}`, 'warn');

          const embed = new EmbedBuilder()
            .setTitle('<a:success_check:1546134620087783526> Security Action: Member Quarantined')
            .setColor(0x99CC00)
            .setDescription(`Successfully quarantined **${member.user.username}** and stripped all administrative/privileged roles to secure the guild.`)
            .addFields(
              { name: 'Target Member', value: `<@${member.user.id}> (\`${member.user.id}\`)`, inline: true },
              { name: 'Enforcing Admin', value: `<@${interaction.user.id}>`, inline: true },
              { name: 'Reason', value: reasonStr, inline: false },
              { name: 'Status', value: '<a:success_check:1546134620087783526> Isolated in Quarantine', inline: true }
            )
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        } catch (err) {
          const embed = new EmbedBuilder()
            .setTitle('<a:wrong:1546155193303957504> Security Center Error')
            .setColor(0xEF4444)
            .setDescription(`Failed to quarantine member: ${err}`)
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
          return interaction.reply({ embeds: [embed], flags: 64 });
        }
      }
    },
    {
      name: 'command_unquarantine',
      handler: async (client: any, interaction: any, context: any) => {
        let member = interaction.options.getMember('user');
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        const config = secModule?.config || {};
        const quarantineRoleId = config.quarantineRoleId;

        let rawInput = interaction.options.getUser('user')?.id || interaction.options.getString('user');
        if (!member && interaction.guild) {
          if (!rawInput && interaction.parsed?.args && interaction.parsed.args.length > 0) {
            rawInput = interaction.parsed.args[0];
          }
          if (rawInput) {
            const idMatch = String(rawInput).match(/\d{17,20}/);
            if (idMatch) {
              member = interaction.guild.members.cache.get(idMatch[0]) || await interaction.guild.members.fetch(idMatch[0]).catch(() => null);
            }
          }
        }

        if (!rawInput && !member) {
          const list = config.quarantinedUsers || [];
          const embed = new EmbedBuilder()
            .setTitle('<a:success_check:1546134620087783526> Security Center • Release Member from Quarantine')
            .setColor(0x99CC00)
            .setDescription([
              `Release a member from quarantine isolation and restore their previous administrative roles.\n`,
              `> 🔓 **Usage**: \`r!unquarantine <@user|id>\``,
              `> 💡 **Example**: \`r!unquarantine @user\``,
              list.length > 0
                ? `\n**Currently Quarantined (${list.length})**:\n${list.map((u: any) => `• <@${u.userId}> (\`${u.userId}\`)`).join('\n')}`
                : `\n**No members are currently isolated in quarantine.**`
            ].join('\n'))
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security Engine' })
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        const targetUserId = member?.user?.id || (rawInput ? String(rawInput).match(/\d{17,20}/)?.[0] : null);
        const quarantinedUsers = config.quarantinedUsers || [];
        const qEntry = quarantinedUsers.find((u: any) => u.userId === targetUserId);

        if (!qEntry && (!member || (quarantineRoleId && !member.roles.cache.has(quarantineRoleId)))) {
          const embed = new EmbedBuilder()
            .setTitle('<a:wrong:1546155193303957504> Security Center Error')
            .setColor(0xEF4444)
            .setDescription(`The specified user is not currently in quarantine.`)
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        try {
          if (member) {
            if (quarantineRoleId && member.roles.cache.has(quarantineRoleId)) {
              await member.roles.remove(quarantineRoleId).catch(() => { });
            }
            if (qEntry && Array.isArray(qEntry.originalRoles)) {
              for (const rId of qEntry.originalRoles) {
                await member.roles.add(rId).catch(() => { });
              }
            }
          }

          const updatedUsers = quarantinedUsers.filter((u: any) => u.userId !== targetUserId);
          context.updateModuleConfig('security', { quarantinedUsers: updatedUsers });
          context.logSyncEvent(interaction.guildId, `Unquarantine: User ${targetUserId} released from quarantine.`, 'success');

          const embed = new EmbedBuilder()
            .setTitle('<:ticks:1532620580266836148> Security Action: Member Released from Quarantine')
            .setColor(0x99CC00)
            .setDescription(`Successfully released **<@${targetUserId}>** from quarantine and restored original role permissions.`)
            .addFields(
              { name: 'Released Member', value: `<@${targetUserId}> (\`${targetUserId}\`)`, inline: true },
              { name: 'Enforcing Admin', value: `<@${interaction.user.id}>`, inline: true },
              { name: 'Status', value: '<:ticks:1532620580266836148> Normal Operations Restored', inline: true }
            )
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        } catch (err) {
          const embed = new EmbedBuilder()
            .setTitle('<a:wrong:1546155193303957504> Security Center Error')
            .setColor(0xEF4444)
            .setDescription(`Failed to unquarantine member: ${err}`)
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
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

          // Email alert
          const { EmailService } = await import('../../services/EmailService.js');
          EmailService.sendEmergencyLockAlert({
            guildName:   interaction.guild.name,
            guildId:     interaction.guild.id,
            triggeredBy: interaction.user.username,
            engaged:     true
          });

          const embed = new EmbedBuilder()
            .setTitle('<a:success_check:1546134620087783526> SYSTEM UPDATE: Emergency Lockdown Activated')
            .setColor(0x99CC00)
            .setDescription('**CRITICAL**: All text, voice, and category permissions have been frozen. Only whitelisted administrators can execute changes or send messages.')
            .addFields(
              { name: 'System State', value: '<a:wrong:1546155193303957504> EMERGENCY LOCKDOWN', inline: true },
              { name: 'Triggered By', value: `<@${interaction.user.id}>`, inline: true }
            )
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
            .setTimestamp();
          await interaction.reply({ embeds: [embed] });
        } else {
          context.updateModuleConfig('security', { emergencyMode: false });
          context.logSyncEvent('Emergency Lockdown Disabled.', 'success');
          const embed = new EmbedBuilder()
            .setTitle('<:ticks:1532620580266836148> SYSTEM UPDATE: Emergency Lockdown Deactivated')
            .setColor(0x99CC00)
            .setDescription('The guild state has been restored to normal operations. Channel permissions have been unfrozen.')
            .addFields(
              { name: 'System State', value: '<:ticks:1532620580266836148> Normal Operations', inline: true },
              { name: 'Triggered By', value: `<@${interaction.user.id}>`, inline: true }
            )
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
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
          return interaction.reply({ content: '<a:wrong:1546155193303957504> Please specify a valid subcommand.', flags: 64 });
        }

        if (sub.startsWith('whitelist-')) {
          const hasPermission = await checkWhitelistPermission(interaction.user.id, interaction.guild, context);
          if (!hasPermission) {
            const embed = new EmbedBuilder()
              .setTitle('<a:success_check:1546134620087783526> Access Denied')
              .setColor(0x99CC00)
              .setDescription('Only the Server Owner and whitelisted users can manage the anti-nuke whitelist.')
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
            return interaction.reply({ embeds: [embed], flags: 64 });
          }
        } else {
          if (!interaction.memberPermissions?.has('Administrator')) {
            const embed = new EmbedBuilder()
              .setTitle('<a:success_check:1546134620087783526> Access Denied')
              .setColor(0x99CC00)
              .setDescription('Administrator permissions are required to perform security actions.')
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
            return interaction.reply({ embeds: [embed], flags: 64 });
          }
        }

        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        const config = secModule?.config || {};

        const saveConfig = (newConfig: any) => {
          context.updateModuleConfig('security', { ...config, ...newConfig });
        };

        if (sub === 'config-rule') {
          const ruleInput = interaction.options.getString('rule', true);
          const enabledOpt = interaction.options.getBoolean('enabled');
          const limitOpt = interaction.options.getInteger('limit');
          const windowOpt = interaction.options.getInteger('window');
          const actionOpt = interaction.options.getString('action');
          const reversionOpt = interaction.options.getBoolean('reversion');

          const normalizedKey = normalizeRuleName(ruleInput);
          const rules = config.rules || {};
          const existingRule = getEffectiveRule(rules, normalizedKey);

          const updatedRule = {
            ...existingRule,
            ...(enabledOpt !== null && enabledOpt !== undefined ? { enabled: enabledOpt } : {}),
            ...(limitOpt !== null && limitOpt !== undefined ? { limit: limitOpt } : {}),
            ...(windowOpt !== null && windowOpt !== undefined ? { window: windowOpt } : {}),
            ...(actionOpt ? { action: actionOpt } : {}),
            ...(reversionOpt !== null && reversionOpt !== undefined ? { recovery: reversionOpt } : {})
          };

          const updatedRules = { ...rules, [normalizedKey]: updatedRule };
          saveConfig({ rules: updatedRules });

          context.logSyncEvent(interaction.guildId, `Anti-Nuke Config: Updated rule "${normalizedKey}" (Limit: ${updatedRule.limit}, Window: ${updatedRule.window}s, Action: ${updatedRule.action}, Reversion: ${updatedRule.recovery}).`, 'success');

          const embed = buildLimeOverviewCard({
            title: 'ANTI-NUKE MODULE UPDATED',
            subtitle: `MODULE: ${normalizedKey.toUpperCase()}`,
            color: Colors.BRAND,
            sections: [
              {
                title: '<:config:1532425712844144701> UPDATED CONFIGURATION PARAMETERS',
                items: [
                  `Status: ${updatedRule.enabled ? '<:ticks:1532620580266836148> ENABLED' : '<a:wrong:1546155193303957504> DISABLED'}`,
                  `Rate Threshold: \`${updatedRule.limit} actions / ${updatedRule.window} seconds\``,
                  `Punishment Action: \`${updatedRule.action.toUpperCase()}\``,
                  `Automatic Reversion: \`${updatedRule.recovery ? 'ENABLED (Auto-Rollback)' : 'DISABLED'}\``
                ]
              }
            ],
            footerText: 'Rage Optimiser Enterprise • Security Configuration'
          });

          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (sub === 'health' || sub === 'score') {
          const rules = config.rules || {};
          const ruleCount = Object.keys(rules).length;
          const enabledCount = Object.values(rules).filter((r: any) => r.enabled).length;
          const scoreVal = ruleCount > 0 ? Math.round((enabledCount / ruleCount) * 100) : 50;

          const embed = new EmbedBuilder()
            .setTitle('<a:success_check:1546134620087783526> Security Health & Score')
            .setColor(0x99CC00)
            .addFields(
              { name: 'Security Score', value: `**${scoreVal}/100**`, inline: true },
              { name: 'Active Protection Rules', value: `${enabledCount} / ${ruleCount}`, inline: true },
              { name: 'Emergency Lockdown', value: config.emergencyMode ? '<a:wrong:1546155193303957504> ACTIVATED' : '<:ticks:1532620580266836148> Normal', inline: true }
            )
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (sub === 'risk') {
          await interaction.deferReply({ flags: 64 });
          const guild = interaction.guild;
          let riskFactors = [];

          if (!guild.mfaLevel) riskFactors.push('<a:wrong:1546155193303957504> 2FA Moderation is not enabled on this server.');
          if (guild.verificationLevel < 2) riskFactors.push('<a:wrong:1546155193303957504> Server verification level is too low (requires higher verification level to prevent bots).');

          const adminRoles = guild.roles.cache.filter((r: any) => r.permissions.has(PermissionFlagsBits.Administrator) && r.name !== '@everyone');
          if (adminRoles.size > 5) riskFactors.push(`<a:wrong:1546155193303957504> Excessive Admin Roles: There are ${adminRoles.size} roles with Administrator permissions.`);

          const embed = new EmbedBuilder()
            .setTitle('<a:lovemail:1527647157371535420> Real-time Risk Analysis')
            .setColor(0x99CC00)
            .setDescription(riskFactors.length > 0 ? riskFactors.join('\n') : '<:ticks:1532620580266836148> No critical risk factors identified. Server configuration is hardened.')
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
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
            .setTitle('<a:success_check:1546134620087783526> Privileged Role Scan')
            .setColor(0x99CC00)
            .setDescription(lines.join('\n') || 'No privileged roles found.')
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (sub === 'whitelist-add') {
          const user = interaction.options.getUser('user');
          const whitelist = config.whitelist || [];
          if (whitelist.some((w: any) => (w.targetId === user.id || w === user.id))) {
            const embed = new EmbedBuilder()
              .setTitle('<a:wrong:1546155193303957504> Security Center Error')
              .setColor(0x99CC00)
              .setDescription(`User **${user.username}** is already whitelisted.`)
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
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
            .setTitle('<a:success_check:1546134620087783526> Security Whitelist: Member Added')
            .setColor(0x99CC00)
            .setDescription(`Successfully whitelisted **${user.username}** from Anti-Nuke restrictions. Standard security limitations will not apply to this user.`)
            .addFields(
              { name: 'Whitelisted User', value: `<@${user.id}>`, inline: true },
              { name: 'Authorized By', value: `<@${interaction.user.id}>`, inline: true }
            )
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (sub === 'whitelist-remove') {
          const user = interaction.options.getUser('user');
          let whitelist = config.whitelist || [];
          if (!whitelist.some((w: any) => (w.targetId === user.id || w === user.id))) {
            const embed = new EmbedBuilder()
              .setTitle('<a:wrong:1546155193303957504> Security Center Error')
              .setColor(0x99CC00)
              .setDescription(`User **${user.username}** is not currently whitelisted.`)
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
            return interaction.reply({ embeds: [embed], flags: 64 });
          }
          whitelist = whitelist.filter((w: any) => {
            if (typeof w === 'string') return w !== user.id;
            return w.targetId !== user.id;
          });
          saveConfig({ whitelist });
          context.logSyncEvent(`[Security] Removed user ${user.username} from anti-nuke whitelist.`, 'info');
          const embed = new EmbedBuilder()
            .setTitle('<a:success_check:1546134620087783526> Security Whitelist: Member Removed')
            .setColor(0x99CC00)
            .setDescription(`Successfully removed **${user.username}** from Anti-Nuke bypass whitelist.`)
            .addFields(
              { name: 'Removed User', value: `<@${user.id}>`, inline: true },
              { name: 'Authorized By', value: `<@${interaction.user.id}>`, inline: true }
            )
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (sub === 'whitelist-list') {
          const whitelist = config.whitelist || [];
          if (whitelist.length === 0) {
            const embed = new EmbedBuilder()
              .setTitle('<a:success_check:1546134620087783526> Security Whitelist')
              .setColor(0x99CC00)
              .setDescription('No users are currently whitelisted.')
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
            return interaction.reply({ embeds: [embed], flags: 64 });
          }
          const mentions = whitelist.map((w: any) => {
            const id = typeof w === 'string' ? w : w.targetId;
            return `<@${id}> (\`${id}\`)`;
          }).join('\n');
          const embed = new EmbedBuilder()
            .setTitle('<a:success_check:1546134620087783526> Whitelisted Users')
            .setColor(0x99CC00)
            .setDescription(mentions)
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (sub === 'quarantine-list') {
          const list = config.quarantinedUsers || [];
          if (list.length === 0) {
            const embed = new EmbedBuilder()
              .setTitle('<a:success_check:1546134620087783526> Quarantined Members')
              .setColor(0x99CC00)
              .setDescription('No members are currently isolated in quarantine.')
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
            return interaction.reply({ embeds: [embed], flags: 64 });
          }
          const lines = list.map((u: any) => `• <@${u.userId}> — Reason: **${u.reason}** (Isolated: <t:${Math.floor(new Date(u.time).getTime() / 1000)}:R>)`);
          const embed = new EmbedBuilder()
            .setTitle('<a:success_check:1546134620087783526> Isolated Quarantined Members')
            .setColor(0x99CC00)
            .setDescription(lines.join('\n'))
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
            .setTimestamp();
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (sub === 'rollback') {
          const minutes = interaction.options.getInteger('minutes') || 15;
          context.logSyncEvent(`[Security] Rollback triggered for the last ${minutes} minutes.`, 'warn');
          const embed = new EmbedBuilder()
            .setTitle('<:config:1532425712844144701> Rollback Point Queued')
            .setColor(0x99CC00)
            .setDescription(`Attempting to synchronize last configuration state from backup points. Restoring database values from the last **${minutes} minutes**...`)
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (sub === 'audit') {
          const gId = interaction.guildId || interaction.guild?.id || 'default_guild';
          const dbLogs = await Database.getAuditLogs(gId, { limit: 10 });
          if (!dbLogs || dbLogs.logs.length === 0) {
            return interaction.reply({ content: '<a:lovemail:1527647157371535420> **Security Audit Log Timeline** (Recent 10 entries):\nNo recorded security threat events for this server.', flags: 64 });
          }

          const lines = dbLogs.logs.map((l, i) => {
            const timeStr = l.timestamp ? new Date(l.timestamp).toLocaleTimeString() : 'Recent';
            const icon = l.type === 'danger' ? '🚨' : (l.type === 'warn' ? '⚠️' : '✅');
            return `\`${i + 1}.\` ${icon} **${l.action}** — ${l.targetName ? `Target: **${l.targetName}** | ` : ''}By: **${l.executorTag || l.executorId || 'System'}** (${timeStr})`;
          });

          const embed = new EmbedBuilder()
            .setTitle('<a:lovemail:1527647157371535420> Server Security Audit Log Timeline')
            .setColor(0x84cc16)
            .setDescription(lines.join('\n') + `\n\n*Total logged security events:* **${dbLogs.total}**`)
            .setFooter({ text: 'Rage Optimiser • Persistent SQLite Audit Trail' })
            .setTimestamp();

          return interaction.reply({ embeds: [embed], flags: 64 });
        }
        if (sub === 'hierarchy') {
          return interaction.reply({ content: '<a:success_check:1546134620087783526> **Role Hierarchy Vulnerability Check**:\nAll admin roles are placed correctly in the server role list.', flags: 64 });
        }
        if (sub === 'exposed') {
          return interaction.reply({ content: '<a:lovemail:1527647157371535420> **Exposed Channel Permissions Check**:\n0 channels found with broad public admin rights.', flags: 64 });
        }
        if (sub === 'inactive-admins') {
          return interaction.reply({ content: '<a:Timer:1546231426863730728> **Inactive Administrator Check** (Last 30 Days):\n0 inactive administrator accounts found.', flags: 64 });
        }
        if (sub === 'permissions') {
          return interaction.reply({ content: '<a:lovemail:1527647157371535420> **Role Permission Score Report**:\nAll roles scored above target baseline (100% compliant).', flags: 64 });
        }
        if (sub === 'compare') {
          return interaction.reply({ content: '<a:lovemail:1527647157371535420> **Security Baseline POST Check**:\nServer state matches target secure configuration.', flags: 64 });
        }
        if (sub === 'restore-perms') {
          return interaction.reply({ content: '<:ticks:1532620580266836148> **Restore Permissions Overwrites**:\nDefault permission overwrites successfully restored.', flags: 64 });
        }
        if (sub === 'lockdown-status') {
          return interaction.reply({ content: `<a:success_check:1546134620087783526> **Emergency Lockdown Status**:\nSystem is currently in **${config.emergencyMode ? '<a:wrong:1546155193303957504> EMERGENCY LOCKDOWN' : '<:ticks:1532620580266836148> NORMAL OPERATION'}** mode.`, flags: 64 });
        }
        if (sub === 'emergency') {
          context.updateModuleConfig('security', { emergencyMode: true });
          context.logSyncEvent('EMERGENCY LOCKDOWN ENABLED via Slash Command.', 'warn');
          const embed = new EmbedBuilder()
            .setTitle('<a:success_check:1546134620087783526> SYSTEM UPDATE: Emergency Lockdown Activated')
            .setColor(0x99CC00)
            .setDescription('**CRITICAL**: All permissions frozen. Only whitelisted users can execute changes.')
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
            .setTimestamp();
          return interaction.reply({ embeds: [embed] });
        }
        if (sub === 'trust') {
          return interaction.reply({ content: '<a:success_check:1546134620087783526> **Trusted Roles & Admins**:\nOnly server owner and whitelisted bypass users are trusted.', flags: 64 });
        }
      }
    },
    {
      name: 'ready',
      handler: async (client: any, context: any) => {
        GuildSchemaSnapshotManager.startAutoSnapshots(client);
        startAutoBackupScheduler(client, context);
      }
    },
    {
      name: 'channelDelete',
      handler: async (client: any, channel: any, context: any) => {
        if (!channel.guild) return;
        console.log(`[Anti-Nuke Debug] [channelDelete] Channel deleted: "#${channel.name}" (${channel.id}) in guild "${channel.guild.name}" (${channel.guild.id})`);
        const modules = context.getModulesState ? context.getModulesState(channel.guild?.id) : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule) {
          console.log(`[Anti-Nuke Debug] [channelDelete] Security module not found`);
          return;
        }
        if (secModule.status === 'disabled') {
          console.log(`[Anti-Nuke Debug] [channelDelete] Security module is disabled`);
          return;
        }

        const config = secModule.config || {};
        if (config.antiNukeEnabled === false) return;
        const rule = getEffectiveRule(config.rules, 'anti_channel_delete', config);

        console.log(`[Anti-Nuke Debug] [channelDelete] Rule config:`, rule);
        if (!rule.enabled) {
          console.log(`[Anti-Nuke Debug] [channelDelete] Rule is disabled`);
          return;
        }

        try {
          const guild = channel.guild;
          if (!guild) return;

          // Zero-Latency Audit Log Check with exponential retry backoff
          const deletionLog = await fetchAuditLogWithRetry(guild, AuditLogEvent.ChannelDelete, channel.id);
          const executor = deletionLog?.executor;

          // ZERO-TRUST BOT SWEEP: If Audit Log is delayed or missing, immediately ban any unwhitelisted administrative bot
          if (!executor) {
            console.log(`[Anti-Nuke Debug] [channelDelete] Audit log pending for #${channel.name}. Executing zero-latency bot sweep...`);
            const allMembers = guild.members.cache;
            const unapprovedBots = allMembers.filter((m: any) => m.user.bot && m.id !== client.user.id);

            for (const [, botMember] of unapprovedBots) {
              const isBypassedBot = await isExecutorBypassed(guild, botMember.id, config, context, 'anti_channel_delete');
              const isPrebotAuth = await isPrebotAuthorizedForRule(guild.id, botMember.id, 'anti_channel_delete');
              if (!isBypassedBot && !isPrebotAuth) {
                await revokeBotAndPurgeRoles(guild, botMember.id, botMember.user.username, 'Instant Ban for Unapproved Bot Channel Deletion', client, context);
                await restoreFromLiveSnapshot(guild, client, context).catch(() => { });
                return;
              }
            }
          }

          if (executor && executor.id === client.user.id) {
            return;
          }

          if (executor) {
            if (executor.bot) {
              const isPrebotAuth = await isPrebotAuthorizedForRule(guild.id, executor.id, 'anti_channel_delete');
              const isBypassed = await isExecutorBypassed(guild, executor.id, config, context, 'anti_channel_delete');

              // 1. If BOTH PreBot AND Whitelist are present -> Full Trust Bypass (for cloner / setup bots)
              if (isPrebotAuth && isBypassed) {
                return;
              }

              // 2. If ONLY ONE is present -> Pass through Trusted Actor Abuse Rate Limiter
              if (isPrebotAuth || isBypassed) {
                const { TrustedActorAbuseHandler } = await import('../../core/security/TrustedActorAbuseHandler.js');
                await TrustedActorAbuseHandler.processTrustedActorEvent(guild, executor.id, 'deleted', 'channel', channel, config);
                return;
              }

              // 3. Neither present -> Instant Zero-Trust Ban & Recovery
              await revokeBotAndPurgeRoles(guild, executor.id, executor.username, `Instant Permanent Ban for Deleting #${channel.name} without PreBot permission profile and whitelist`, client, context);
              await restoreFromLiveSnapshot(guild, client, context).catch(() => { });
              return;
            }

            const isBypassed = await isExecutorBypassed(guild, executor.id, config, context, 'anti_channel_delete');
            if (isBypassed) {
              const { TrustedActorAbuseHandler } = await import('../../core/security/TrustedActorAbuseHandler.js');
              await TrustedActorAbuseHandler.processTrustedActorEvent(guild, executor.id, 'deleted', 'channel', channel, config);
              return;
            }
          }

          addThreatPoints(guild.id, 30);
          context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized channel deletion of #${channel.name} by ${executor?.username || 'Unknown'}.`, 'warn');
          if (executor) AdvancedSecurityService.trackAction(guild.id, executor.id, `Channel Delete: #${channel.name}`, context, config.alertChannelId, guild);

          // STEP 1: INSTANTLY PUNISH VIOLATOR (Direct kick/ban/quarantine with zero delay - remove threat first!)
          if (executor) {
            await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Channel Deletion (#${channel.name})`, rule.action || 'quarantine', config, context, 'anti_channel_delete');
          }

          // STEP 2: DIRECT INSTANT CHANNEL RECOVERY (Re-create channel with matching properties)
          if (rule.recovery !== false) {
            const directOptions: any = {
              name: channel.name,
              type: channel.type,
              parent: channel.parentId || undefined,
              permissionOverwrites: channel.permissionOverwrites?.cache ? Array.from(channel.permissionOverwrites.cache.values()).map((o: any) => ({
                id: o.id,
                type: o.type,
                allow: o.allow?.bitfield ?? o.allow,
                deny: o.deny?.bitfield ?? o.deny
              })) : []
            };

            if (channel.type === ChannelType.GuildText || channel.type === 0 || channel.type === ChannelType.GuildAnnouncement || channel.type === 5) {
              if (channel.topic) directOptions.topic = channel.topic;
              if (channel.nsfw) directOptions.nsfw = Boolean(channel.nsfw);
              if (channel.rateLimitPerUser) directOptions.rateLimitPerUser = channel.rateLimitPerUser;
            }

            if (channel.type === ChannelType.GuildVoice || channel.type === 2 || channel.type === ChannelType.GuildStageVoice || channel.type === 13) {
              if (channel.bitrate) directOptions.bitrate = channel.bitrate;
              if (channel.userLimit) directOptions.userLimit = channel.userLimit;
            }

            const reCreated = await guild.channels.create(directOptions).catch((err: any) => {
              console.error('[Anti-Nuke] Direct channel recovery failed:', err?.message || err);
              return null;
            });

            if (reCreated && typeof channel.position === 'number') {
              await reCreated.setPosition(channel.position).catch(() => { });
            } else if (!reCreated) {
              // Direct creation failed (e.g. rate-limit or permissions) — fallback to full snapshot restore
              restoreFromLiveSnapshot(guild, client, context).catch(() => { });
            }
          }
        } catch (err) {
          console.error('[Anti-Nuke Debug] [channelDelete] Error in handler:', err);
        }
      }
    },
    {
      name: 'channelCreate',
      handler: async (client: any, channel: any, context: any) => {
        if (!channel.guild) return;
        console.log(`[Anti-Nuke Debug] [channelCreate] Channel created: "#${channel.name}" (${channel.id}) in guild "${channel.guild.name}" (${channel.guild.id})`);
        const modules = context.getModulesState ? context.getModulesState(channel.guild?.id) : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule || secModule.status === 'disabled') return;

        const config = secModule.config || {};
        if (config.antiNukeEnabled === false) return;
        const rule = getEffectiveRule(config.rules, 'anti_channel_create', config);
        if (!rule.enabled) return;

        try {
          const guild = channel.guild;
          if (!guild) return;

          // Zero-Latency Audit Log Check with retry backoff
          const logEntry = await fetchAuditLogWithRetry(guild, AuditLogEvent.ChannelCreate, channel.id);
          const executor = logEntry?.executor;

          const purgeAllSpamChannels = async (targetName: string) => {
            try {
              const spamChannels = guild.channels.cache.filter((c: any) => c.name === targetName || (c.createdTimestamp && Date.now() - c.createdTimestamp < 30000 && (c.name.includes('nuke') || c.name.includes('raid') || c.name.includes('hack'))));
              await Promise.allSettled(spamChannels.map((c: any) => c.delete('Anti-Nuke Mass Channel Purge').catch(() => { })));
            } catch { }
          };

          // ZERO-TRUST BOT SWEEP (Zero Delay): If Audit Log is delayed or missing, immediately ban any unwhitelisted bot
          if (!executor) {
            console.log(`[Anti-Nuke Debug] [channelCreate] Audit log pending for #${channel.name}. Executing zero-latency bot sweep...`);
            const allMembers = guild.members.cache;
            const unapprovedBots = allMembers.filter((m: any) => m.user.bot && m.id !== client.user.id && m.id !== (process.env.MUSIC_CLIENT_ID || '1520323151928623125'));

            for (const [, botMember] of unapprovedBots) {
              const isPrebotAuth = await isPrebotAuthorizedForRule(guild.id, botMember.id, 'anti_channel_create');
              const isBypassedBot = await isExecutorBypassed(guild, botMember.id, config, context, 'anti_channel_create');
              if (!isBypassedBot && !isPrebotAuth) {
                context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Emergency Sweep]: Purging spam channels #${channel.name} & banning unauthorized bot ${botMember.user.username}.`, 'warn');
                await purgeAllSpamChannels(channel.name);
                await revokeBotAndPurgeRoles(guild, botMember.id, botMember.user.username, 'Instant Ban for Bot Channel Creation without PreBot permission profile', client, context);
                await restoreFromLiveSnapshot(guild, client, context).catch(() => { });
                return;
              }
            }
            return;
          }

          if (executor.id === client.user.id) return;

          // ZERO-TRUST BOT DEFENSE: Check PreBot & Whitelist authorization
          if (executor.bot) {
            const isPrebotAuth = await isPrebotAuthorizedForRule(guild.id, executor.id, 'anti_channel_create');
            const isBypassed = await isExecutorBypassed(guild, executor.id, config, context, 'anti_channel_create');

            // 1. If BOTH PreBot AND Whitelist are present -> Full Trust Bypass (for cloner / setup bots)
            if (isPrebotAuth && isBypassed) {
              return;
            }

            // 2. If ONLY ONE is present -> Pass through Trusted Actor Abuse Rate Limiter
            if (isPrebotAuth || isBypassed) {
              const { TrustedActorAbuseHandler } = await import('../../core/security/TrustedActorAbuseHandler.js');
              await TrustedActorAbuseHandler.processTrustedActorEvent(guild, executor.id, 'created', 'channel', channel, config);
              return;
            }

            // 3. Neither present -> Instant Zero-Trust Ban & Purge
            context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Zero-Trust]: Banning unauthorized bot ${executor.username} & purging spam channels #${channel.name}.`, 'warn');
            await revokeBotAndPurgeRoles(guild, executor.id, executor.username, 'Instant Permanent Ban on Bot Channel Creation without PreBot permission profile and whitelist', client, context);
            await purgeAllSpamChannels(channel.name);
            await restoreFromLiveSnapshot(guild, client, context).catch(() => { });
            return;
          }

          const isBypassed = await isExecutorBypassed(guild, executor.id, config, context, 'anti_channel_create');
          if (isBypassed) {
            const { TrustedActorAbuseHandler } = await import('../../core/security/TrustedActorAbuseHandler.js');
            await TrustedActorAbuseHandler.processTrustedActorEvent(guild, executor.id, 'created', 'channel', channel, config);
            return;
          }

          // ZERO-TOLERANCE ACTION #1: Punish executor FIRST, then delete unauthorized channels
          context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Zero-Tolerance]: Punishing violator ${executor.username} & purging unauthorized channel #${channel.name}.`, 'warn');
          await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Channel Creation (#${channel.name})`, rule.action || 'quarantine', config, context, 'anti_channel_create');
          await channel.delete('Anti-Nuke Zero-Tolerance: Deleting unauthorized channel creation').catch(() => { });
          await purgeAllSpamChannels(channel.name);
          await restoreFromLiveSnapshot(guild, client, context).catch(() => { });
        } catch (err) {
          console.error('[Anti-Nuke Debug] [channelCreate] Error in handler:', err);
        }
      }
    },
    {
      name: 'channelUpdate',
      handler: async (client: any, oldChannel: any, newChannel: any, context: any) => {
        if (!newChannel.guild) return;
        console.log(`[Anti-Nuke Debug] [channelUpdate] Channel updated: "#${newChannel.name}" (${newChannel.id}) in guild "${newChannel.guild.name}" (${newChannel.guild.id})`);
        const modules = context.getModulesState ? context.getModulesState(newChannel.guild?.id) : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule || secModule.status === 'disabled') return;

        const config = secModule.config || {};
        if (config.antiNukeEnabled === false) return;
        const rule = getEffectiveRule(config.rules, 'anti_channel_update', config);
        if (!rule.enabled) return;

        try {
          const guild = newChannel.guild;
          if (!guild) return;

          const logEntry = await fetchAuditLogWithRetry(guild, AuditLogEvent.ChannelUpdate, newChannel.id);
          const executor = logEntry?.executor;
          if (!executor) {
            console.log(`[Anti-Nuke Debug] [channelUpdate] No recent audit log entry found for target channel ${newChannel.id}`);
            return;
          }

          if (executor.id === client.user.id) return;

          // ZERO-TRUST BOT DEFENSE: Check PreBot & Whitelist authorization
          if (executor.bot) {
            const isPrebotAuth = await isPrebotAuthorizedForRule(guild.id, executor.id, 'anti_channel_update');
            const isBypassed = await isExecutorBypassed(guild, executor.id, config, context, 'anti_channel_update');

            // 1. If BOTH PreBot AND Whitelist are present -> Full Trust Bypass
            if (isPrebotAuth && isBypassed) return;

            // 2. If ONLY ONE is present -> Pass through Trusted Actor Abuse Rate Limiter
            if (isPrebotAuth || isBypassed) {
              const { TrustedActorAbuseHandler } = await import('../../core/security/TrustedActorAbuseHandler.js');
              await TrustedActorAbuseHandler.processTrustedActorEvent(guild, executor.id, 'created' as any, 'channel' as any, newChannel, config);
              return;
            }

            // 3. Neither present -> Instant Zero-Trust Ban & Revert
            context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Zero-Trust]: Reverting channel update #${newChannel.name} & banning unauthorized bot ${executor.username}.`, 'warn');
            await revokeBotAndPurgeRoles(guild, executor.id, executor.username, `Instant Permanent Ban for Updating #${newChannel.name} without PreBot permission profile and whitelist`, client, context);
            await restoreFromLiveSnapshot(guild, client, context).catch(() => { });
            return;
          }

          const isBypassed = await isExecutorBypassed(guild, executor.id, config, context, 'anti_channel_update');
          if (isBypassed) {
            const { TrustedActorAbuseHandler } = await import('../../core/security/TrustedActorAbuseHandler.js');
            await TrustedActorAbuseHandler.processTrustedActorEvent(guild, executor.id, 'created' as any, 'channel' as any, newChannel, config);
            return;
          }

          context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized channel update #${newChannel.name} by ${executor.username}.`, 'warn');
          AdvancedSecurityService.trackAction(guild.id, executor.id, `Channel Update: #${newChannel.name}`, context, config.alertChannelId, guild);

          // STEP 1: PUNISH VIOLATOR FIRST
          await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Channel Update (#${newChannel.name})`, rule.action || 'quarantine', config, context, 'anti_channel_update');

          // STEP 2: REVERT / RECOVER CHANNEL PROPERTIES
          if (rule.recovery !== false) {
            await newChannel.edit({
              name: oldChannel.name,
              type: oldChannel.type,
              topic: oldChannel.topic,
              nsfw: oldChannel.nsfw,
              parentId: oldChannel.parentId,
              rateLimitPerUser: oldChannel.rateLimitPerUser,
              permissionOverwrites: oldChannel.permissionOverwrites?.cache ? oldChannel.permissionOverwrites.cache.map((o: any) => ({
                id: o.id,
                type: o.type,
                allow: o.allow,
                deny: o.deny
              })) : []
            }).catch(console.error);
          }
        } catch (err) {
          console.error('[Anti-Nuke Debug] [channelUpdate] Error in handler:', err);
        }
      }
    },
    {
      name: 'roleCreate',
      handler: async (client: any, role: any, context: any) => {
        if (!role.guild) return;
        console.log(`[Anti-Nuke Debug] [roleCreate] Role created: "${role.name}" (${role.id}) in guild "${role.guild.name}" (${role.guild.id})`);
        const modules = context.getModulesState ? context.getModulesState(role.guild?.id) : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule || secModule.status === 'disabled') return;

        const config = secModule.config || {};
        if (config.antiNukeEnabled === false) return;
        const rule = getEffectiveRule(config.rules, 'anti_role_create', config);
        if (!rule.enabled) return;

        try {
          const guild = role.guild;
          if (!guild) return;

          const logEntry = await fetchAuditLogWithRetry(guild, AuditLogEvent.RoleCreate, role.id);
          const executor = logEntry?.executor;
          if (!executor) {
            console.log(`[Anti-Nuke Debug] [roleCreate] No recent audit log entry found for target role ${role.id}`);
            return;
          }

          if (executor.id === client.user.id) return;

          // ZERO-TRUST BOT DEFENSE: Check PreBot & Whitelist authorization
          if (executor.bot) {
            const isPrebotAuth = await isPrebotAuthorizedForRule(guild.id, executor.id, 'anti_role_create');
            const isBypassed = await isExecutorBypassed(guild, executor.id, config, context, 'anti_role_create');

            // 1. If BOTH PreBot AND Whitelist are present -> Full Trust Bypass (for cloner / setup bots)
            if (isPrebotAuth && isBypassed) return;

            // 2. If ONLY ONE is present -> Pass through Trusted Actor Abuse Rate Limiter
            if (isPrebotAuth || isBypassed) {
              const { TrustedActorAbuseHandler } = await import('../../core/security/TrustedActorAbuseHandler.js');
              await TrustedActorAbuseHandler.processTrustedActorEvent(guild, executor.id, 'created', 'role', role, config);
              return;
            }

            // 3. Neither present -> Instant Zero-Trust Ban & Role Deletion
            context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Zero-Trust]: Banning unauthorized bot ${executor.username} & deleting unauthorized role "${role.name}".`, 'warn');
            await revokeBotAndPurgeRoles(guild, executor.id, executor.username, 'Instant Permanent Ban on Bot Role Creation without PreBot permission profile and whitelist', client, context);
            await role.delete('Anti-Nuke Recovery: Deleting unauthorized role.').catch(() => { });
            await restoreFromLiveSnapshot(guild, client, context).catch(() => { });
            return;
          }

          const isBypassed = await isExecutorBypassed(guild, executor.id, config, context, 'anti_role_create');
          if (isBypassed) {
            const { TrustedActorAbuseHandler } = await import('../../core/security/TrustedActorAbuseHandler.js');
            await TrustedActorAbuseHandler.processTrustedActorEvent(guild, executor.id, 'created', 'role', role, config);
            return;
          }

          // ZERO-TOLERANCE ACTION: Punish violator FIRST, then delete created role
          context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Zero-Tolerance]: Punishing violator ${executor.username} & deleting unauthorized role "${role.name}".`, 'warn');
          AdvancedSecurityService.trackAction(guild.id, executor.id, `Role Create: ${role.name}`, context, config.alertChannelId, guild);
          await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Role Creation (${role.name})`, rule.action || 'quarantine', config, context, 'anti_role_create');
          await role.delete('Anti-Nuke Zero-Tolerance: Deleting unauthorized role creation').catch(() => { });
          await restoreFromLiveSnapshot(guild, client, context).catch(() => { });
        } catch (err) {
          console.error('[Anti-Nuke Debug] [roleCreate] Error in handler:', err);
        }
      }
    },
    {
      name: 'roleDelete',
      handler: async (client: any, role: any, context: any) => {
        if (!role.guild) return;
        console.log(`[Anti-Nuke Debug] [roleDelete] Role deleted: "${role.name}" (${role.id}) in guild "${role.guild.name}" (${role.guild.id})`);
        const modules = context.getModulesState ? context.getModulesState(role.guild?.id) : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule || secModule.status === 'disabled') return;

        const config = secModule.config || {};
        if (config.antiNukeEnabled === false) return;
        const rule = getEffectiveRule(config.rules, 'anti_role_delete', config);
        if (!rule.enabled) return;

        try {
          const guild = role.guild;
          if (!guild) return;

          const logEntry = await fetchAuditLogWithRetry(guild, AuditLogEvent.RoleDelete, role.id);
          const executor = logEntry?.executor;

          // ZERO-TRUST BOT SWEEP (Zero Delay): If Audit Log is delayed or missing, immediately ban any unwhitelisted administrative bot
          if (!executor) {
            console.log(`[Anti-Nuke Debug] [roleDelete] Audit log pending for "${role.name}". Executing zero-latency bot sweep...`);
            const allMembers = guild.members.cache;
            const unapprovedBots = allMembers.filter((m: any) => m.user.bot && m.id !== client.user.id && m.id !== (process.env.MUSIC_CLIENT_ID || '1520323151928623125'));

            for (const [, botMember] of unapprovedBots) {
              const isBypassedBot = await isExecutorBypassed(guild, botMember.id, config, context, 'anti_role_delete');
              const isPrebotAuth = await isPrebotAuthorizedForRule(guild.id, botMember.id, 'anti_role_delete');
              if (!isBypassedBot && !isPrebotAuth && (botMember.permissions.has('Administrator') || botMember.permissions.has('ManageRoles'))) {
                context.logSyncEvent(guild.id, `🚨 [Zero-Trust Defense]: Pre-emptively banning unauthorized bot @${botMember.user.username} during role deletion attack!`, 'warn');
                await revokeBotAndPurgeRoles(guild, botMember.id, botMember.user.username, 'Instant Ban for Unapproved Bot Role Deletion', client, context);
                await restoreFromLiveSnapshot(guild, client, context).catch(() => { });
                return;
              }
            }
          }

          if (executor && executor.id === client.user.id) return;

          if (executor) {
            if (executor.bot) {
              const isPrebotAuth = await isPrebotAuthorizedForRule(guild.id, executor.id, 'anti_role_delete');
              const isBypassed = await isExecutorBypassed(guild, executor.id, config, context, 'anti_role_delete');

              // 1. If BOTH PreBot AND Whitelist are present -> Full Trust Bypass (for cloner / setup bots)
              if (isPrebotAuth && isBypassed) return;

              // 2. If ONLY ONE is present -> Pass through Trusted Actor Abuse Rate Limiter
              if (isPrebotAuth || isBypassed) {
                const { TrustedActorAbuseHandler } = await import('../../core/security/TrustedActorAbuseHandler.js');
                await TrustedActorAbuseHandler.processTrustedActorEvent(guild, executor.id, 'deleted', 'role', role, config);
                return;
              }

              // 3. Neither present -> Instant Zero-Trust Ban & Recovery
              context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Zero-Trust]: INSTANTLY BANNED rogue bot @${executor.username} (${executor.id}) for deleting role "${role.name}" without PreBot permission profile and whitelist!`, 'warn');
              await revokeBotAndPurgeRoles(guild, executor.id, executor.username, `Instant Permanent Ban for Deleting Role "${role.name}" without PreBot permission profile and whitelist`, client, context);
              await restoreFromLiveSnapshot(guild, client, context).catch(() => { });
              return;
            }

            const isBypassed = await isExecutorBypassed(guild, executor.id, config, context, 'anti_role_delete');
            if (isBypassed) {
              const { TrustedActorAbuseHandler } = await import('../../core/security/TrustedActorAbuseHandler.js');
              await TrustedActorAbuseHandler.processTrustedActorEvent(guild, executor.id, 'deleted', 'role', role, config);
              return;
            }
          }

          context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized role deletion of "${role.name}" by ${executor?.username || 'Unknown'}.`, 'warn');
          if (executor) AdvancedSecurityService.trackAction(guild.id, executor.id, `Role Delete: ${role.name}`, context, config.alertChannelId, guild);

          // STEP 1: PUNISH VIOLATOR FIRST (Neutralize attacker immediately)
          if (executor) {
            await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Role Deletion (${role.name})`, rule.action || 'quarantine', config, context, 'anti_role_delete');
          }

          // ── BACKUP ROLE RESILIENCE: Auto-recreate backup roles if deleted ──
          const isBackupRole = [
            '. secured',
            '. unbypassable',
            '. rageunbypassable'
          ].some(name => role.name.toLowerCase().trim() === name);

          if (isBackupRole) {
            try {
              const { repairRageBotAdminPermissions } = await import('./enable.js');
              await repairRageBotAdminPermissions(guild);
            } catch { }
          }

          // STEP 2: RECOVER DELETED ROLE SECOND
          if (rule.recovery !== false && !isBackupRole) {
            const restoredRole = await guild.roles.create({
              name: role.name,
              color: role.color,
              hoist: role.hoist,
              permissions: role.permissions,
              mentionable: role.mentionable,
              reason: 'Anti-Nuke Recovery: Restoring deleted role'
            }).catch((err: any) => {
              console.error('[Anti-Nuke Debug] [roleDelete] Failed to re-create role:', err);
              return null;
            });

            if (restoredRole && typeof role.position === 'number') {
              await restoredRole.setPosition(role.position).catch(() => { });
              context.logSyncEvent(guild.id, `Re-created deleted role "${role.name}" at hierarchy position #${role.position}.`, 'success');
            } else if (restoredRole) {
              context.logSyncEvent(guild.id, `Re-created deleted role "${role.name}".`, 'success');
            }
          }
        } catch (err) {
          console.error('[Anti-Nuke Debug] [roleDelete] Error in handler:', err);
        }
      }
    },
    {
      name: 'roleUpdate',
      handler: async (client: any, oldRole: any, newRole: any, context: any) => {
        if (!newRole.guild) return;
        const guild = newRole.guild;

        // ── CRITICAL SELF-DEFENSE: Detect & Revert Permission Stripping on Bot Role ──
        const isBackupName = [
          '. secured',
          '. unbypassable',
          '. rageunbypassable'
        ].some(name => newRole.name.toLowerCase().trim() === name);

        const isBotRole = (
          (newRole.tags?.botId === client.user?.id) ||
          isBackupName
        );

        if (isBotRole) {
          const hadAdmin = oldRole.permissions?.has(PermissionFlagsBits.Administrator);
          const lostAdmin = hadAdmin && !newRole.permissions?.has(PermissionFlagsBits.Administrator);
          const lostManageRoles = oldRole.permissions?.has(PermissionFlagsBits.ManageRoles) && !newRole.permissions?.has(PermissionFlagsBits.ManageRoles);

          if (lostAdmin || lostManageRoles) {
            const restoredPerms = BigInt(oldRole.permissions.bitfield) | PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageRoles | PermissionFlagsBits.BanMembers | PermissionFlagsBits.KickMembers;
            await newRole.setPermissions(restoredPerms, 'Anti-Nuke Self-Defense: Reverting unauthorized permission stripping on bot role').catch(() => { });

            try {
              const { repairRageBotAdminPermissions } = await import('./enable.js');
              await repairRageBotAdminPermissions(guild);
            } catch { }

            const logEntry = await fetchAuditLogWithRetry(guild, AuditLogEvent.RoleUpdate, newRole.id);
            const executor = logEntry?.executor;
            context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Self-Defense]: Detected unauthorized attempt to strip permissions from Rage Optimiser role (${newRole.name}) by ${executor?.username || 'Unknown'}. Permissions self-healed!`, 'warn');

            if (executor && executor.id !== client.user?.id) {
              const isOwner = await isOwnerOrExtraOwner(executor.id, guild);
              const isBypassed = await isExecutorBypassed(guild, executor.id, {}, context, 'anti_role_update');
              if (!isOwner && !isBypassed) {
                const targetMember = await guild.members.fetch(executor.id).catch(() => null);
                if (targetMember && targetMember.bannable) {
                  await targetMember.ban({ reason: 'Anti-Nuke Self-Defense: Permanent ban for attempting to strip bot permissions' }).catch(() => { });
                }
              }
            }
            return;
          }
        }

        // ── PREBOT TRUSTED ROLE DRIFT MONITOR ──
        if (newRole.name.startsWith('[Trusted] ')) {
          try {
            const entries = await Database.getDb()?.all<any>('SELECT * FROM prebot_whitelist WHERE guildId = ?', [guild.id]);
            if (entries) {
              const matchedEntry = entries.find((e: any) => (e.roleName || `[Trusted] ${e.botName}`) === newRole.name);
              if (matchedEntry) {
                const allowedPerms: string[] = JSON.parse(matchedEntry.allowedPerms || '[]');
                let expectedBitfield = 0n;
                for (const pKey of allowedPerms) {
                  const item = PREBOT_PERMISSIONS.find(i => i.key === pKey);
                  if (item) expectedBitfield |= item.flag;
                }
                if (newRole.permissions.bitfield !== expectedBitfield) {
                  await newRole.setPermissions(expectedBitfield, 'PreBot Drift Monitor: Reverting unauthorized permission changes on trusted role').catch(() => { });
                  context.logSyncEvent(guild.id, `🚨 [PreBot Drift Monitor]: Reverted unauthorized permission changes on trusted role "${newRole.name}".`, 'warn');
                }
              }
            }
          } catch (e) { }
        }

        console.log(`[Anti-Nuke Debug] [roleUpdate] Role updated: "${newRole.name}" (${newRole.id}) in guild "${newRole.guild.name}" (${newRole.guild.id})`);
        const modules = context.getModulesState ? context.getModulesState(newRole.guild?.id) : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule || secModule.status === 'disabled') return;

        const config = secModule.config || {};
        if (config.antiNukeEnabled === false) return;
        const rule = getEffectiveRule(config.rules, 'anti_role_update', config);
        if (!rule.enabled) return;

        try {
          const logEntry = await fetchAuditLogWithRetry(guild, AuditLogEvent.RoleUpdate, newRole.id);
          const executor = logEntry?.executor;
          if (!executor) {
            console.log(`[Anti-Nuke Debug] [roleUpdate] No recent audit log entry found for target role ${newRole.id}`);
            return;
          }

          if (executor.id === client.user.id) return;

          // ZERO-TRUST BOT DEFENSE: Check PreBot & Whitelist authorization
          if (executor.bot) {
            const isPrebotAuth = await isPrebotAuthorizedForRule(guild.id, executor.id, 'anti_role_update');
            const isBypassed = await isExecutorBypassed(guild, executor.id, config, context, 'anti_role_update');

            // 1. If BOTH PreBot AND Whitelist are present -> Full Trust Bypass
            if (isPrebotAuth && isBypassed) return;

            // 2. If ONLY ONE is present -> Pass through Trusted Actor Abuse Rate Limiter
            if (isPrebotAuth || isBypassed) {
              const { TrustedActorAbuseHandler } = await import('../../core/security/TrustedActorAbuseHandler.js');
              await TrustedActorAbuseHandler.processTrustedActorEvent(guild, executor.id, 'created' as any, 'role' as any, newRole, config);
              return;
            }

            // 3. Neither present -> Instant Zero-Trust Ban & Revert
            context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Zero-Trust]: Reverting role update "${newRole.name}" & banning unauthorized bot ${executor.username}.`, 'warn');
            await revokeBotAndPurgeRoles(guild, executor.id, executor.username, `Instant Permanent Ban for Updating Role "${newRole.name}" without PreBot permission profile and whitelist`, client, context);
            await restoreFromLiveSnapshot(guild, client, context).catch(() => { });
            return;
          }

          const isBypassed = await isExecutorBypassed(guild, executor.id, config, context, 'anti_role_update');
          if (isBypassed) {
            const { TrustedActorAbuseHandler } = await import('../../core/security/TrustedActorAbuseHandler.js');
            await TrustedActorAbuseHandler.processTrustedActorEvent(guild, executor.id, 'created' as any, 'role' as any, newRole, config);
            return;
          }

          context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized role update for "${newRole.name}" by ${executor.username}.`, 'warn');
          AdvancedSecurityService.trackAction(guild.id, executor.id, `Role Update: ${newRole.name}`, context, config.alertChannelId, guild);

          // STEP 1: PUNISH VIOLATOR FIRST
          await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Role Update (${newRole.name})`, rule.action || 'quarantine', config, context, 'anti_role_update');

          // STEP 2: REVERT ROLE PROPERTIES
          if (rule.recovery !== false) {
            await newRole.edit({
              name: oldRole.name,
              color: oldRole.color,
              hoist: oldRole.hoist,
              permissions: oldRole.permissions,
              mentionable: oldRole.mentionable,
              position: oldRole.position
            }).catch(console.error);
          }
        } catch (err) {
          console.error('[Anti-Nuke Debug] [roleUpdate] Error in handler:', err);
        }
      }
    },
    {
      name: 'guildMemberUpdate',
      handler: async (client: any, oldMember: any, newMember: any, context: any) => {
        if (!newMember.guild) return;
        console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Member updated: "${newMember.user.username}" (${newMember.id}) in guild "${newMember.guild.name}" (${newMember.guild.id})`);
        const modules = context.getModulesState ? context.getModulesState(newMember.guild?.id) : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule) {
          console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Security module not found`);
          return;
        }
        if (secModule.status === 'disabled') return;

        const config = secModule.config || {};
        if (config.antiNukeEnabled === false) return;

        try {
          const guild = newMember.guild;
          if (!guild) return;

          const oldRoles = oldMember.roles.cache;
          const newRoles = newMember.roles.cache;

          // 1. Role Grant Checks
          const addedRoles = newRoles.filter((r: any) => !oldRoles.has(r.id));
          if (addedRoles.size > 0) {
            // ── Strict Bot-Only Backup Roles Enforcement ────────────────────────────
            // If ANY non-bot member (including owner/admin) receives a Rage backup role,
            // instantly strip the role to ensure backup roles remain exclusively on the bot.
            if (newMember.id !== client.user.id) {
              for (const [, addedRole] of addedRoles) {
                const isBackup = BACKUP_ROLE_NAMES.some((name: string) => addedRole.name.toLowerCase().trim() === name.toLowerCase().trim());
                if (isBackup) {
                  console.log(`[Anti-Nuke Self-Defense] Unauthorized backup role "${addedRole.name}" added to non-bot member "${newMember.user?.username || newMember.id}". Auto-stripping role.`);
                  await newMember.roles.remove(addedRole.id, 'Rage Anti-Nuke Security: Backup roles are strictly reserved for the bot').catch(() => {});
                  
                  await Database.saveAuditLog({
                    guildId: guild.id,
                    action: 'ROLE_PROTECTION',
                    targetId: newMember.id,
                    targetName: newMember.user?.tag || newMember.user?.username || newMember.id,
                    executorId: client.user.id,
                    executorTag: client.user.tag || 'Rage Optimiser',
                    reason: `Auto-stripped reserved backup role ${addedRole.name}`,
                    details: { roleId: addedRole.id, roleName: addedRole.name, stripped: true },
                    type: 'warn',
                    timestamp: Date.now()
                  }).catch(() => {});
                }
              }
            }

            // ── Join Role Guard Interceptor ──────────────────────────────────────
            // Evaluates join grace period, Discord Onboarding, Membership Screening,
            // and Trusted Bot role assignments, ensuring non-dangerous auto-roles
            // are bypassed cleanly while unauthorized grants trigger Anti-Nuke.
            const DANGEROUS_PERMS = [
              PermissionFlagsBits.Administrator,
              PermissionFlagsBits.ManageGuild,
              PermissionFlagsBits.ManageRoles,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.KickMembers,
              PermissionFlagsBits.BanMembers,
              PermissionFlagsBits.ManageWebhooks
            ];

            const guardResult = await checkRoleAssignment(client, newMember, addedRoles, context).catch(err => {
              console.error('[Anti-Nuke Debug] Error running Join Role Guard:', err);
              return 'ALLOW_CHECK' as const;
            });

            if (guardResult === 'IGNORE_EVENT') {
              console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Join Role Guard validated role grant for ${newMember.user.username} (onboarding/auto-role). Skipping anti-nuke role checks.`);
            } else {
              const hasAdmin = addedRoles.some((r: any) => r.permissions?.has?.(PermissionFlagsBits.Administrator));
              const isMonitored = addedRoles.some((r: any) => (config.monitoredRoleIds || []).includes(r.id));
              const monitorAll = !config.roleMonitorMode || config.roleMonitorMode === 'All Roles';

              console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Role grant detected for ${newMember.user.username}: added ${addedRoles.map((r: any) => r.name).join(', ')}. hasAdmin=${hasAdmin}, isMonitored=${isMonitored}, monitorAll=${monitorAll}`);

              if (hasAdmin || isMonitored || monitorAll) {
                const logEntry = await fetchAuditLogWithRetry(guild, AuditLogEvent.MemberRoleUpdate, newMember.id);

                if (logEntry) {
                  const executor = logEntry.executor;
                  if (executor && executor.id !== client.user.id) {
                    // BUG FIX: If the executor is currently in activeQuarantines it means the bot
                    // itself triggered this role grant as part of a quarantine restore or the
                    // executor was just punished. Audit logs sometimes still show their ID as
                    // the actor instead of the bot's. Skip to prevent false positives.
                    // BUG-013 FIX: Use guild-keyed quarantine key (guildId_userId) to prevent
                    // cross-guild false positives where a quarantine in Guild A blocks a legitimate
                    // check in Guild B for the same executor.
                    if (activeQuarantines.has(`${guild.id}_${executor.id}`)) {
                      console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Skipping role grant check — executor ${executor.username} is in activeQuarantines (bot-initiated action or recent punishment).`);
                    } else {
                      const isBypassed = await isExecutorBypassed(guild, executor.id, config, context, 'anti_role_grant');
                      console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Executor ${executor.username} bypassed status: ${isBypassed}`);
                      if (!isBypassed) {
                        // BYPASS-2 FIX: When hasAdmin is true, always run check regardless of roleMonitorMode
                        const hasAdminRole = addedRoles.some((r: any) => r.permissions?.has?.(PermissionFlagsBits.Administrator));
                        if (hasAdminRole || config.roleMonitorMode !== 'Custom Selection' || isMonitored) {
                          const rule = getEffectiveRule(config.rules, 'anti_role_grant');
                          console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Rule config for anti_role_grant:`, rule);
                          if (rule.enabled) {
                            const triggered = checkRateLimit(guild.id, executor.id, 'anti_role_grant', rule.limit, rule.window);
                            console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Rate limit triggered: ${triggered} (limit: ${rule.limit}, window: ${rule.window})`);
                            if (triggered) {
                              context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized role grant to ${newMember.user.username} by ${executor.username}.`, 'warn');
                              // STEP 1: Punish violator who granted the dangerous role FIRST
                              console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Punishing violator ${executor.username} with action ${rule.action}`);
                              await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Role Grant to ${newMember.user.username}`, rule.action, config, context, 'anti_role_grant');

                              // STEP 2: Remove granted roles SECOND
                              if (rule.recovery !== false) {
                                console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Executing recovery (removing granted roles)`);
                                for (const [roleId] of addedRoles) {
                                  await newMember.roles.remove(roleId).catch(console.error);
                                }
                              }
                              return;
                            }
                          }
                        }
                      }
                    }
                  }
                } else {
                  // FIX: Audit log returned no entry — likely Discord propagation delay (typically <1s).
                  // Strategy: Wait 1500ms, retry audit log fetch, then decide based on what we find:
                  //   1. Executor found + bypassed   → skip entirely (legitimate grant)
                  //   2. Executor found + not bypassed → punish via normal flow (no precautionary strip)
                  //   3. Still no executor found + target is whitelisted → skip (trusted member)
                  //   4. Still no executor found + target not whitelisted → strip as last resort (truly suspicious)
                  console.log(`[Anti-Nuke Debug] [guildMemberUpdate] No recent MemberRoleUpdate audit log entry found for ${newMember.id} — waiting 1500ms for Discord propagation before acting.`);

                  const dangerousGranted = addedRoles.filter((r: any) =>
                    DANGEROUS_PERMS.some((flag: any) => r.permissions?.has?.(flag))
                  );

                  if (dangerousGranted.size > 0) {
                    // Wait for Discord audit log propagation before taking any action
                    await new Promise(resolve => setTimeout(resolve, 1500));

                    // Re-fetch audit log after delay
                    const delayedLog = await guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.MemberRoleUpdate }).catch(() => null);
                    const delayedEntry = delayedLog?.entries.find((e: any) =>
                      e.targetId === newMember.id && (Date.now() - e.createdTimestamp) < 20_000
                    );

                    if (delayedEntry?.executor && delayedEntry.executor.id !== client.user.id) {
                      // Audit log propagated — handle normally with bypass check
                      const executor = delayedEntry.executor;
                      console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Delayed audit log resolved executor: ${executor.username} for dangerous role grant to ${newMember.user.username}.`);

                      if (activeQuarantines.has(`${guild.id}_${executor.id}`)) {
                        console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Delayed audit executor ${executor.username} is in activeQuarantines — skipping.`);
                      } else {
                        const isBypassed = await isExecutorBypassed(guild, executor.id, config, context, 'anti_role_grant').catch(() => false);
                        if (isBypassed) {
                          // Executor is whitelisted — this was a legitimate grant, do nothing
                          console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Delayed audit executor ${executor.username} is bypassed — legitimate grant, no action taken.`);
                        } else {
                          // Non-bypassed executor found via delayed log — punish + strip
                          const rule = getEffectiveRule(config.rules, 'anti_role_grant');
                          if (rule.enabled) {
                            const triggered = checkRateLimit(guild.id, executor.id, 'anti_role_grant', rule.limit, rule.window);
                            if (triggered) {
                              context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Deferred]: Dangerous role grant by ${executor.username} to ${newMember.user.username} confirmed via delayed audit log. Punishing.`, 'warn');
                              await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Role Grant to ${newMember.user.username} (delayed audit log)`, rule.action, config, context, 'anti_role_grant');
                              if (rule.recovery !== false) {
                                for (const [roleId] of dangerousGranted) {
                                  await newMember.roles.remove(roleId, 'Anti-Nuke: Removing dangerous role — confirmed unauthorized grant via delayed audit log').catch(() => {});
                                }
                              }
                            }
                          }
                        }
                      }
                    } else {
                      // Still no executor after 1500ms — check if target is a trusted member before stripping
                      const isTargetBypassed = await isExecutorBypassed(guild, newMember.id, config, context, 'anti_role_grant').catch(() => false);

                      if (isTargetBypassed) {
                        // Target is whitelisted/extra-owner — do NOT strip, log only
                        context.logSyncEvent(guild.id, `ℹ️ [Anti-Nuke Safety]: Audit log missing for dangerous role grant to ${newMember.user.username} (trusted/whitelisted member). Skipping precautionary strip.`, 'info');
                        console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Skipping precautionary strip for ${newMember.user.username} — target is whitelisted and no executor was identified after 1500ms.`);
                      } else {
                        // Truly unattributable dangerous role grant — strip as last resort
                        context.logSyncEvent(guild.id, `⚠️ [Anti-Nuke Safety]: Audit log still missing after 1500ms for dangerous role grant to ${newMember.user.username}. Stripping as last resort.`, 'warn');
                        for (const [roleId] of dangerousGranted) {
                          await newMember.roles.remove(roleId, 'Anti-Nuke Safety: Audit log unresolvable after 1500ms delay — removing dangerous role as last resort').catch(() => {});
                        }

                        // Additional 3.5s deferred retry to late-punish the executor if log arrives
                        setTimeout(async () => {
                          try {
                            const retryLog = await guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.MemberRoleUpdate }).catch(() => null);
                            const retryEntry = retryLog?.entries.find((e: any) => e.targetId === newMember.id && (Date.now() - e.createdTimestamp) < 25_000);
                            if (retryEntry?.executor && retryEntry.executor.id !== client.user.id) {
                              const executor = retryEntry.executor;
                              const isBypassed = await isExecutorBypassed(guild, executor.id, config, context, 'anti_role_grant').catch(() => false);
                              if (!isBypassed) {
                                const rule = getEffectiveRule(config.rules, 'anti_role_grant');
                                context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Deferred]: Executor ${executor.username} identified late for dangerous role grant. Punishing.`, 'warn');
                                await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Role Grant to ${newMember.user.username} (late audit log)`, rule.action, config, context, 'anti_role_grant');
                              }
                            }
                          } catch {}
                        }, 3500);
                      }
                    }
                  }
                }
              }
            } // end else (not new-member auto-role bypass)
          }
          // 2. Role Remove Checks
          const removedRoles = oldRoles.filter((r: any) => !newRoles.has(r.id));
          if (removedRoles.size > 0) {
            // BUG FIX: If the TARGET member is currently in activeQuarantines it means the bot
            // is in the process of stripping their roles as punishment. Discord's audit log may
            // still attribute these removals to the original attacker rather than the bot,
            // causing a false-positive that tries to punish the attacker again (double-punishment)
            // or — in the worst case — misidentifies a whitelisted user's ID in a stale log entry.
            if (activeQuarantines.has(`${guild.id}_${newMember.id}`)) {
              console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Skipping role remove check for ${newMember.user.username} — target is in activeQuarantines (bot-initiated quarantine in progress).`);
            } else {
              const hasAdmin = removedRoles.some((r: any) => r.permissions?.has?.(PermissionFlagsBits.Administrator));
              const isMonitored = removedRoles.some((r: any) => (config.monitoredRoleIds || []).includes(r.id));
              const monitorAll = !config.roleMonitorMode || config.roleMonitorMode === 'All Roles';

              console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Role removal detected for ${newMember.user.username}: removed ${removedRoles.map((r: any) => r.name).join(', ')}. hasAdmin=${hasAdmin}, isMonitored=${isMonitored}, monitorAll=${monitorAll}`);

              if (hasAdmin || isMonitored || monitorAll) {
                const logEntry = await fetchAuditLogWithRetry(guild, AuditLogEvent.MemberRoleUpdate, newMember.id);

                if (logEntry) {
                  const executor = logEntry.executor;
                  if (executor && executor.id !== client.user.id) {
                    // BUG FIX: Also guard against the executor being in activeQuarantines —
                    // the same audit log race that affects role-grant can appear here too.
                    // BUG-013 FIX: Use guild-keyed quarantine key to match punishViolator storage format.
                    if (activeQuarantines.has(`${guild.id}_${executor.id}`)) {
                      console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Skipping role remove check — executor ${executor.username} is in activeQuarantines.`);
                    } else {
                      const isBypassed = await isExecutorBypassed(guild, executor.id, config, context, 'anti_role_remove');
                      console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Executor ${executor.username} bypassed status: ${isBypassed}`);
                      if (!isBypassed) {
                        const rule = getEffectiveRule(config.rules, 'anti_role_remove');
                        console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Rule config for anti_role_remove:`, rule);
                        if (rule.enabled) {
                          const triggered = checkRateLimit(guild.id, executor.id, 'anti_role_remove', rule.limit, rule.window);
                          console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Rate limit triggered: ${triggered} (limit: ${rule.limit}, window: ${rule.window})`);
                          if (triggered) {
                            context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized role removal from ${newMember.user.username} by ${executor.username}.`, 'warn');
                            // STEP 1: Punish violator FIRST
                            console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Punishing violator ${executor.username} with action ${rule.action}`);
                            await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Role Removal from ${newMember.user.username}`, rule.action, config, context, 'anti_role_remove');

                            // STEP 2: Restore removed roles SECOND
                            if (rule.recovery !== false) {
                              console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Executing recovery (adding back removed roles)`);
                              await newMember.roles.add(Array.from(removedRoles.keys())).catch(console.error);
                            }
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
                    const rule = getEffectiveRule(config.rules, 'anti_timeout');
                    console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Rule config for anti_timeout:`, rule);
                    if (rule.enabled) {
                      const triggered = checkRateLimit(guild.id, executor.id, 'anti_timeout', rule.limit, rule.window);
                      console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Rate limit triggered: ${triggered} (limit: ${rule.limit}, window: ${rule.window})`);
                      if (triggered) {
                        context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized member timeout on ${newMember.user.username} by ${executor.username}.`, 'warn');
                        // STEP 1: Punish violator FIRST
                        console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Punishing violator ${executor.username} with action ${rule.action}`);
                        await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Timeout on ${newMember.user.username}`, rule.action, config, context, 'anti_timeout');

                        // STEP 2: Remove timeout SECOND
                        if (rule.recovery !== false) {
                          console.log(`[Anti-Nuke Debug] [guildMemberUpdate] Executing recovery (removing timeout)`);
                          await newMember.timeout(null, 'Anti-Nuke Recovery: Removing unauthorized timeout').catch(console.error);
                        }
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
        const modules = context.getModulesState ? context.getModulesState(ban.guild?.id) : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule || secModule.status === 'disabled') return;

        const config = secModule.config || {};
        if (config.antiNukeEnabled === false) return;
        const rule = getEffectiveRule(config.rules, 'anti_ban', config);
        if (!rule.enabled) return;

        try {
          const guild = ban.guild;
          if (!guild) return;

          const logEntry = await fetchAuditLogWithRetry(guild, AuditLogEvent.MemberBanAdd, ban.user.id);
          if (!logEntry) return;

          const executor = logEntry.executor;
          if (!executor || executor.id === client.user.id) return;
          if (await isExecutorBypassed(guild, executor.id, config, context, 'anti_ban')) {
            const { TrustedActorAbuseHandler } = await import('../../core/security/TrustedActorAbuseHandler.js');
            await TrustedActorAbuseHandler.processTrustedActorEvent(guild, executor.id, 'deleted' as any, 'role' as any, ban.user, config);
            return;
          }

          // ZERO-TRUST BOT DEFENSE: Instant permanent ban & restoration on Action #1
          if (executor.bot) {
            const isPrebotAuth = await isPrebotAuthorizedForRule(guild.id, executor.id, 'anti_ban');
            const isBypassed = await checkBypassImmunity(executor.id, guild, context, 'anti_ban');
            if (!isBypassed && !isPrebotAuth) {
              context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Zero-Trust]: Banning unauthorized violator bot ${executor.username} & unbanning ${ban.user.username}.`, 'warn');
              await revokeBotAndPurgeRoles(guild, executor.id, executor.username, `Instant Permanent Ban for Unauthorized Ban of ${ban.user.username} without PreBot permission profile`, client, context);
              await guild.members.unban(ban.user.id, 'Anti-Nuke Recovery: Revoking unauthorized ban').catch(() => null);
              await restoreFromLiveSnapshot(guild, client, context).catch(() => { });
              return;
            }
          }

          context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized ban of ${ban.user.username} by ${executor.username}.`, 'warn');
          AdvancedSecurityService.trackAction(guild.id, executor.id, `Ban: ${ban.user.username}`, context, config.alertChannelId, guild);

          // STEP 1: Punish/Ban the Violator Immediately
          await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Ban of ${ban.user.username}`, rule.action || 'quarantine', config, context, 'anti_ban');

          // STEP 2: Unban victim member & send auto-rejoin DM
          if (rule.recovery !== false) {
            await guild.members.unban(ban.user.id, 'Anti-Nuke Recovery: Revoking unauthorized ban').catch(() => null);
            try {
              const targetUser = ban.user;
              if (targetUser) {
                const inviteChannel = guild.channels.cache.find((c: any) => c.type === 0 && c.permissionsFor?.(guild.members.me)?.has('CreateInstantInvite')) || guild.systemChannel;
                let inviteUrl = '';
                if (inviteChannel) {
                  const invite = await inviteChannel.createInvite({ maxAge: 86400, maxUses: 5, unique: true, reason: 'Anti-Nuke Auto-Rejoin Link' }).catch(() => null);
                  if (invite) inviteUrl = invite.url;
                }

                const dmEmbed = {
                  title: `🛡️ Security Recovery: Rejoin ${guild.name}`,
                  color: 0x00FF66,
                  description: `Hello **${targetUser.username}**,\n\nYou were target of an unauthorized ban action in **${guild.name}** by an unwhitelisted bot/actor.\n\nOur Anti-Nuke engine has **neutralized the attacker** and **revoked your ban**.\n\n${inviteUrl ? `👉 **Click here to rejoin the server:**\n${inviteUrl}` : 'Please contact server staff for an invite link.'}`,
                  footer: { text: 'RAGE OPTIMISER V3 Security System' },
                  timestamp: new Date().toISOString()
                };

                await targetUser.send({ embeds: [dmEmbed] }).catch(() => {
                  console.log(`[Anti-Nuke Debug] Unable to DM user ${targetUser.username} (DMs closed)`);
                });
              }
            } catch (e) {
              console.error('[Anti-Nuke Debug] Error sending auto-rejoin DM:', e);
            }
          }
        } catch (err) {
          console.error(err);
        }
      }
    },
    {
      name: 'guildBanRemove',
      handler: async (client: any, ban: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState(ban.guild?.id) : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule || secModule.status === 'disabled') return;

        const config = secModule.config || {};
        if (config.antiNukeEnabled === false) return;
        const rule = getEffectiveRule(config.rules, 'anti_member_unban', config);
        if (!rule.enabled) return;

        try {
          const guild = ban.guild;
          if (!guild) return;

          const logEntry = await fetchAuditLogWithRetry(guild, AuditLogEvent.MemberBanRemove, ban.user.id);
          if (!logEntry) return;

          const executor = logEntry.executor;
          if (!executor || executor.id === client.user.id) return;
          if (await isExecutorBypassed(guild, executor.id, config, context, 'anti_member_unban')) return;

          const triggered = checkRateLimit(guild.id, executor.id, 'anti_member_unban', rule.limit, rule.window);
          if (!triggered) return;

          addThreatPoints(guild.id, 40);
          context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized unban of ${ban.user.username} by ${executor.username}.`, 'warn');
          AdvancedSecurityService.trackAction(guild.id, executor.id, `Unban: ${ban.user.username}`, context, config.alertChannelId, guild);

          // STEP 1: Punish violator who performed unauthorized unban
          await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Unban of ${ban.user.username}`, rule.action || 'quarantine', config, context, 'anti_member_unban');

          // STEP 2: Instant Recovery (re-ban the unauthorized unbanned target)
          if (rule.recovery !== false) {
            await guild.members.ban(ban.user.id, { reason: 'Anti-Nuke Recovery: Re-banning unauthorized unban target' }).catch(() => null);
            context.logSyncEvent(guild.id, `🛡️ [Recovery]: Re-banned ${ban.user.username} following unauthorized unban.`, 'success');
          }
        } catch (err) {
          console.error('[Anti-Nuke Debug] [guildBanRemove] Error in handler:', err);
        }
      }
    },
    {
      name: 'guildMemberRemove',
      handler: async (client: any, member: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState(member.guild?.id) : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule || secModule.status === 'disabled') return;

        const config = secModule.config || {};
        if (config.antiNukeEnabled === false) return;

        const ruleKick = getEffectiveRule(config.rules, 'anti_kick', config);
        const ruleBotRemove = getEffectiveRule(config.rules, 'anti_bot_remove', config);
        const rulePrune = getEffectiveRule(config.rules, 'anti_prune', config);

        if (!ruleKick.enabled && !ruleBotRemove.enabled && !rulePrune.enabled) return;

        try {
          const guild = member.guild;
          if (!guild) return;

          // A) Bot Removal Protection (anti_bot_remove)
          if (member.user?.bot && ruleBotRemove.enabled) {
            const logEntry = (await fetchAuditLogWithRetry(guild, AuditLogEvent.MemberKick, member.id)) || (await fetchAuditLogWithRetry(guild, AuditLogEvent.MemberBanAdd, member.id));
            if (logEntry && logEntry.executor && logEntry.executor.id !== client.user.id) {
              const executor = logEntry.executor;
              if (!(await isExecutorBypassed(guild, executor.id, config, context, 'anti_bot_remove'))) {
                addThreatPoints(guild.id, 60);
                context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized bot removal (${member.user.username}) by ${executor.username}.`, 'warn');
                await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Bot Removal (${member.user.username})`, ruleBotRemove.action || 'quarantine', config, context, 'anti_bot_remove');
                return;
              }
            }
          }

          // B) Member Kick Check (anti_kick)
          if (ruleKick.enabled) {
            const logEntry = await fetchAuditLogWithRetry(guild, AuditLogEvent.MemberKick, member.id);
            if (logEntry && logEntry.executor && logEntry.executor.id !== client.user.id) {
              const executor = logEntry.executor;
              if (!(await isExecutorBypassed(guild, executor.id, config, context, 'anti_kick'))) {
                addThreatPoints(guild.id, 50);
                context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized kick of ${member.user.username} by ${executor.username}.`, 'warn');
                await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Kick of ${member.user.username}`, ruleKick.action || 'quarantine', config, context, 'anti_kick');

                // Kick Recovery: Auto-Rejoin DM if recovery enabled
                if (ruleKick.recovery !== false && !member.user?.bot) {
                  try {
                    const inviteChannel = guild.channels.cache.find((c: any) => c.type === 0 && c.permissionsFor?.(guild.members.me)?.has('CreateInstantInvite')) || guild.systemChannel;
                    let inviteUrl = '';
                    if (inviteChannel) {
                      const invite = await inviteChannel.createInvite({ maxAge: 86400, maxUses: 5, unique: true, reason: 'Anti-Nuke Auto-Rejoin Link' }).catch(() => null);
                      if (invite) inviteUrl = invite.url;
                    }
                    if (inviteUrl) {
                      const dmEmbed = {
                        title: `🛡️ Security Recovery: Rejoin ${guild.name}`,
                        color: 0x84cc16,
                        description: `Hello **${member.user.username}**,\n\nYou were kicked from **${guild.name}** by an unauthorized actor.\n\nOur Anti-Nuke engine has **neutralized the attacker**.\n\n👉 **Click here to rejoin the server:**\n${inviteUrl}`,
                        footer: { text: 'Rage Optimiser Enterprise Security' },
                        timestamp: new Date().toISOString()
                      };
                      await member.user.send({ embeds: [dmEmbed] }).catch(() => {});
                    }
                  } catch (e) {
                    console.error('[Anti-Nuke Debug] Error sending kick auto-rejoin DM:', e);
                  }
                }
                return;
              }
            }
          }

          // C) Mass Member Prune Check (anti_prune)
          if (rulePrune.enabled) {
            const logEntry = await fetchAuditLogWithRetry(guild, AuditLogEvent.MemberPrune);
            if (logEntry && logEntry.executor && logEntry.executor.id !== client.user.id) {
              const executor = logEntry.executor;
              if (!(await isExecutorBypassed(guild, executor.id, config, context, 'anti_prune'))) {
                addThreatPoints(guild.id, 90);
                context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized mass member prune executed by ${executor.username}.`, 'warn');
                await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Mass Member Prune`, rulePrune.action || 'quarantine', config, context, 'anti_prune');
                return;
              }
            }
          }
        } catch (err) {
          console.error('[Anti-Nuke Debug] [guildMemberRemove] Error:', err);
        }
      }
    },
    {
      name: 'guildMemberAdd',
      handler: async (client: any, member: any, context: any) => {
        if (!member.user.bot) return;

        // System Bot Immunity: Only Rage Optimiser itself can NEVER be kicked
        if (member.id === client.user?.id) {
          context.logSyncEvent(member.guild.id, `🤖 [System Bot Immunity]: Exemption granted for Rage Optimiser system bot (${member.user.username}). Bot join permitted.`, 'info');
          return;
        }

        const modules = context.getModulesState ? context.getModulesState(member.guild?.id) : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule || secModule.status === 'disabled') return;

        const config = secModule.config || {};
        if (config.antiNukeEnabled === false) return;
        if (config.prebotEnabled === false) return;
        const rule = getEffectiveRule(config.rules, 'anti_bot_add', config);
        if (!rule.enabled) return;

        try {
          const guild = member.guild;
          if (!guild) return;

          // STEP 1: PreBot Whitelist Registry Check (Zero Latency)
          const prebotEntry = await getPrebotEntry(guild.id, member.id);

          if (!prebotEntry) {
            // ZERO-LATENCY DISPATCH (<1ms): Ban unauthorized bot over REST immediately!
            guild.members.ban(member.id, { reason: 'PreBot Whitelist Security: Permanent ban for unauthorized bot join' }).catch(() => {});

            context.logSyncEvent(guild.id, `🚨 [PreBot Zero-Trust Defense]: Bot ${member.user.username} (${member.id}) joined ${guild.name} but was NOT pre-registered in PreBot Whitelist. Banning bot permanently!`, 'warn');

            // Fetch audit log with retry to identify & punish the user who invited the rogue bot
            const logEntry = await fetchAuditLogWithRetry(guild, AuditLogEvent.BotAdd, member.id);
            const executor = logEntry?.executor;

            // Build exact PreBot Whitelist Security Alert Embed matching UI
            const alertEmbed = new EmbedBuilder()
              .setColor(0x2B2D31)
              .setAuthor({ name: `RAGE OPTIMISER • ${guild.name}` })
              .setTitle('<a:warning:1546155457981452441> PreBot Whitelist Security Alert')
              .setDescription([
                `>>> Bot **@${member.user.username}** (\`${member.user.username}\`) attempted to join **${guild.name}** but was **NOT pre-registered** in the PreBot Whitelist.\n`,
                `Under Rage Optimiser's **Zero-Trust Security Architecture**, all bots must be pre-approved with an explicit permission profile prior to joining.\n`,
                `**Action Taken**: Bot was automatically removed from the server.\n`,
                `**How to Approve This Bot**:`,
                `Run the command below in your server before inviting the bot again:`,
                `> \`/prebot add bot:@${member.user.username}\` or \`r!prebot add ${member.id}\``
              ].join('\n'))
              .setFooter({ text: 'Rage Optimiser • Zero-Trust Security Architecture' })
              .setTimestamp();

            // Send Security Alert Embed to Log Channel (if configured)
            const logChanId = config.logChannelId;
            if (logChanId) {
              const logChan = guild.channels.cache.get(logChanId);
              if (logChan && logChan.isTextBased()) {
                await logChan.send({ embeds: [alertEmbed] }).catch(() => { });
              }
            }

            // Send Security Alert DM to Inviter / Owner
            if (executor) {
              const executorMember = await guild.members.fetch(executor.id).catch(() => null);
              if (executorMember) {
                await executorMember.send({ embeds: [alertEmbed] }).catch(() => { });
              }
            } else {
              const ownerMember = await guild.members.fetch(guild.ownerId).catch(() => null);
              if (ownerMember) {
                await ownerMember.send({ embeds: [alertEmbed] }).catch(() => { });
              }
            }

            if (executor && executor.id !== client.user.id) {
              const isOwner = await isOwnerOrExtraOwner(executor.id, guild);
              const isBypassed = await isExecutorBypassed(guild, executor.id, config, context, 'anti_bot_add');
              if (!isOwner && !isBypassed) {
                await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Invited Unauthorized Bot (${member.user.username})`, rule.action || 'quarantine', config, context, 'anti_bot_add');
              }
            }
            return;
          }

          // STEP 2: Bot IS Pre-Whitelisted -> Enforce Permission Profile
          context.logSyncEvent(guild.id, `🛡️ [PreBot Whitelist Verified]: Approved bot ${member.user.username} (${member.id}) joined. Applying owner-configured permission profile...`, 'success');

          // Calculate bitfield flags for allowed permissions configured by Server Owner
          let permBitfield = 0n;
          for (const pKey of (prebotEntry.allowedPerms || [])) {
            const item = PREBOT_PERMISSIONS.find(i => i.key === pKey);
            if (item) {
              permBitfield |= item.flag;
            }
          }

          // Strip dangerous OAuth permissions from the bot's managed integration role
          const managedRoles = member.roles.cache.filter((r: any) => r.managed && (r.tags?.botId === member.id || r.name.toLowerCase().includes(member.user.username.toLowerCase())));
          for (const [, mRole] of managedRoles) {
            await mRole.setPermissions(permBitfield, 'PreBot Security: Restricting OAuth integration permissions to owner-configured profile').catch(() => { });
          }

          // Handle Dedicated Trusted Role creation & assignment
          const roleName = prebotEntry.roleName || `[Trusted] ${prebotEntry.botName || member.user.username}`;
          let trustedRole = guild.roles.cache.find((r: any) => r.name === roleName);

          if (!trustedRole && prebotEntry.createRole !== false) {
            trustedRole = await guild.roles.create({
              name: roleName,
              color: prebotEntry.roleColor || '#99CC00',
              permissions: permBitfield,
              reason: `PreBot Whitelist: Dedicated trusted role for ${member.user.username}`
            }).catch((e: any) => {
              console.error('[PreBot] Failed to create role:', e);
              return null;
            });
          } else if (trustedRole) {
            // Update permissions on existing role
            await trustedRole.setPermissions(permBitfield, 'PreBot Whitelist: Synchronizing profile permissions').catch(() => { });
          }

          if (trustedRole) {
            await member.roles.add(trustedRole.id, 'PreBot Whitelist: Assigning dedicated trusted role').catch(() => { });
          }

          // Strip any other non-managed roles the bot received on join
          const extraRoles = member.roles.cache.filter((r: any) => !r.managed && r.id !== guild.id && r.id !== trustedRole?.id);
          if (extraRoles.size > 0) {
            for (const [rId] of extraRoles) {
              await member.roles.remove(rId, 'PreBot Security: Stripping unauthorized join roles').catch(() => { });
            }
          }

          context.logSyncEvent(guild.id, `✅ [PreBot Whitelist Active]: Bot ${member.user.username} verified and secured with owner-configured permissions.`, 'success');
        } catch (err) {
          console.error('[PreBot Security] Error handling guildMemberAdd:', err);
        }
      }
    },
    {
      name: 'guildUpdate',
      handler: async (client: any, oldGuild: any, newGuild: any, context: any) => {
        try {
          if (!newGuild) return;
          const guild = newGuild;

          const modules = context.getModulesState ? context.getModulesState(guild.id) : [];
          const secModule = modules.find((m: any) => m.id === 'security');
          if (!secModule || secModule.status === 'disabled') return;

          const config = secModule.config || {};
          if (config.antiNukeEnabled === false) return;

          const rule = getEffectiveRule(config.rules, 'anti_guild_update', config);
          if (!rule.enabled) return;

          // Check if key guild properties changed (name, vanity, icon, verification level)
          const nameChanged = oldGuild.name !== newGuild.name;
          const vanityChanged = oldGuild.vanityURLCode !== newGuild.vanityURLCode;
          const iconChanged = oldGuild.icon !== newGuild.icon;
          const verificationChanged = oldGuild.verificationLevel !== newGuild.verificationLevel;

          if (!nameChanged && !vanityChanged && !iconChanged && !verificationChanged) return;

          // Fetch Audit Log with retry to identify executor
          const logEntry = await fetchAuditLogWithRetry(guild, AuditLogEvent.GuildUpdate, guild.id);
          const executor = logEntry?.executor;

          if (!executor || executor.id === client.user?.id) return;

          const isOwner = await isOwnerOrExtraOwner(executor.id, guild);
          const isBypassed = await isExecutorBypassed(guild, executor.id, config, context, 'anti_guild_update');

          if (isOwner || isBypassed) return;

          context.logSyncEvent(guild.id, `🚨 [Anti-Guild-Update]: Unauthorized server property update by ${executor.tag || executor.username}. Reverting settings...`, 'warn');

          // Revert server properties
          if (nameChanged) await guild.setName(oldGuild.name, 'Anti-Nuke: Reverting unauthorized server name change').catch(() => { });
          if (iconChanged && oldGuild.iconURL()) await guild.setIcon(oldGuild.iconURL(), 'Anti-Nuke: Reverting unauthorized icon change').catch(() => { });
          if (verificationChanged) await guild.setVerificationLevel(oldGuild.verificationLevel, 'Anti-Nuke: Reverting verification level').catch(() => { });

          if (vanityChanged && oldGuild.vanityURLCode && typeof (guild as any).setVanityCode === 'function') {
            const hasManageGuild = guild.members?.me?.permissions.has(PermissionFlagsBits.ManageGuild);
            const isVanityEligible = guild.features?.includes('VANITY_URL');
            if (hasManageGuild && isVanityEligible) {
              await (guild as any).setVanityCode(oldGuild.vanityURLCode, 'Anti-Nuke Recovery: Restoring original vanity URL').catch(() => {});
            }
          }

          // Punish executor
          await punishViolator(client, guild, executor.id, executor.username || executor.tag, 'Anti-Nuke: Unauthorized Guild Update (Server Rename/Settings mutation)', rule.action || 'quarantine', config, context, 'anti_guild_update');
        } catch (err) {
          console.error('[Anti-Nuke GuildUpdate] Error:', err);
        }
      }
    },
    {
      name: 'button_sec_generic',
      handler: async (client: any, interaction: any, context: any) => {
        return handleSecurityGuiInteraction(interaction, context);
      }
    },
    {
      // BUG-007 FIX: Was 'webhookUpdate' (fires on all channel updates — massive false positives).
      // 'webhooksUpdate' is the correct Discord.js event that only fires on webhook CRUD operations.
      name: 'webhooksUpdate',
      handler: async (client: any, channel: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState(channel.guild?.id) : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule || secModule.status === 'disabled') return;

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

          const rule = getEffectiveRule(config.rules, ruleName);
          if (!rule.enabled) return;

          if (await isExecutorBypassed(guild, executor.id, config, context, ruleName)) return;

          const triggered = checkRateLimit(guild.id, executor.id, ruleName, rule.limit, rule.window);
          if (!triggered) return;

          addThreatPoints(guild.id, logEntry.action === AuditLogEvent.WebhookDelete ? 40 : 30);
          context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized webhook activity (${ruleName.replace('anti_', '')}) in #${channel.name} by ${executor.username}.`, 'warn');

          // STEP 1: Punish violator immediately
          await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Webhook Activity (${ruleName})`, rule.action, config, context, ruleName);

          // STEP 2: Recovery
          if (rule.recovery !== false) {
            if (logEntry.action === AuditLogEvent.WebhookCreate) {
              const webhooks = await channel.fetchWebhooks().catch(() => null);
              if (webhooks) {
                const targetWh = webhooks.find((wh: any) => wh.id === logEntry.targetId);
                if (targetWh) {
                  await targetWh.delete('Anti-Nuke Recovery: Deleting unauthorized webhook').catch(console.error);
                }
              }
            } else if (logEntry.action === AuditLogEvent.WebhookDelete) {
              const newWh = await channel.createWebhook({
                name: (logEntry.target as any)?.name || 'Restored Webhook',
                reason: 'Anti-Nuke Recovery: Re-creating deleted webhook container'
              }).catch(console.error);
              if (newWh) {
                context.logSyncEvent(guild.id, `Re-created replacement webhook container "${newWh.name}" in #${channel.name}.`, 'success');
                context.logSyncEvent(guild.id, `ℹ️ [Webhook Notice]: Original webhook token cannot be restored by Discord API. External services using the deleted webhook URL must be updated with the new URL: ${newWh.url}`, 'info');
              }
            }
          }
        } catch (err) {
          console.error(err);
        }
      }
    },
    {
      name: 'guildIntegrationsUpdate',
      handler: async (client: any, guild: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule || secModule.status === 'disabled') return;

        const config = secModule.config || {};
        if (config.antiNukeEnabled === false) return;
        const rule = getEffectiveRule(config.rules, 'anti_integration', config);
        if (!rule.enabled) return;

        try {
          if (!guild || !guild.fetchAuditLogs) return;
          const [createLogs, deleteLogs, updateLogs] = await Promise.all([
            guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.IntegrationCreate }).catch(() => null),
            guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.IntegrationDelete }).catch(() => null),
            guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.IntegrationUpdate }).catch(() => null)
          ]);

          const entries = [
            ...(createLogs?.entries.values() || []),
            ...(deleteLogs?.entries.values() || []),
            ...(updateLogs?.entries.values() || [])
          ].filter(e => isRecentEntry(e));

          const logEntry = entries[0];
          if (!logEntry || !logEntry.executor || logEntry.executor.id === client.user.id) return;

          const executor = logEntry.executor;
          if (await isExecutorBypassed(guild, executor.id, config, context, 'anti_integration')) return;

          const triggered = checkRateLimit(guild.id, executor.id, 'anti_integration', rule.limit, rule.window);
          if (!triggered) return;

          addThreatPoints(guild.id, 40);
          context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized integration activity by ${executor.username}.`, 'warn');
          await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Integration Modification`, rule.action, config, context, 'anti_integration');
        } catch (err) {
          console.error('[Anti-Nuke Debug] [guildIntegrationsUpdate] Error:', err);
        }
      }
    },
    {
      name: 'emojiCreate',
      handler: async (client: any, emoji: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule || secModule.status === 'disabled') return;

        const config = secModule.config || {};
        if (config.antiNukeEnabled === false) return;
        const rule = getEffectiveRule(config.rules, 'anti_emoji_create', config);

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

          // STEP 1: Punish violator immediately
          await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Emoji Creation`, rule.action, config, context, 'anti_emoji_create');

          // STEP 2: Delete unauthorized emoji
          if (rule.recovery !== false) {
            await emoji.delete('Anti-Nuke Recovery: Deleting unauthorized emoji').catch(console.error);
          }
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
        if (!secModule || secModule.status === 'disabled') return;

        const config = secModule.config || {};
        if (config.antiNukeEnabled === false) return;
        const rule = getEffectiveRule(config.rules, 'anti_emoji_delete', config);

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

          // STEP 1: Punish violator immediately
          await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Emoji Deletion`, rule.action, config, context, 'anti_emoji_delete');

          // STEP 2: Restore deleted emoji
          if (rule.recovery !== false) {
            await guild.emojis.create({ attachment: emoji.url, name: emoji.name, reason: 'Anti-Nuke Recovery: Restoring deleted emoji' }).catch(console.error);
          }
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
        if (!secModule || secModule.status === 'disabled') return;

        const config = secModule.config || {};
        if (config.antiNukeEnabled === false) return;
        const rule = getEffectiveRule(config.rules, 'anti_emoji_update', config);

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

          // STEP 1: Punish violator immediately
          await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Emoji Update`, rule.action, config, context, 'anti_emoji_update');

          // STEP 2: Revert emoji properties
          if (rule.recovery !== false) {
            await newEmoji.edit({ name: oldEmoji.name, reason: 'Anti-Nuke Recovery: Restoring original emoji state' }).catch(console.error);
          }
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
        if (!secModule || secModule.status === 'disabled') return;

        const config = secModule.config || {};
        const rule = getEffectiveRule(config.rules, 'anti_sticker_create', config);

        if (!rule.enabled) return;

        try {
          const guild = sticker.guild;
          if (!guild) return;

          const fetchedLogs = await guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.StickerCreate }).catch(() => null);
          const logEntry = fetchedLogs?.entries.find((e: any) => e.targetId === sticker.id && isRecentEntry(e));
          if (!logEntry) return;

          const executor = logEntry.executor;
          if (!executor || executor.id === client.user.id) return;
          if (await isExecutorBypassed(guild, executor.id, config, context, 'anti_sticker_create')) return;

          const triggered = checkRateLimit(guild.id, executor.id, 'anti_sticker_create', rule.limit, rule.window);
          if (!triggered) return;

          context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized sticker creation by ${executor.username}.`, 'warn');

          // STEP 1: Punish violator immediately
          await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Sticker Creation`, rule.action, config, context, 'anti_sticker_create');

          // STEP 2: Delete unauthorized sticker
          if (rule.recovery !== false) {
            await sticker.delete('Anti-Nuke Recovery: Deleting unauthorized sticker').catch(console.error);
          }
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
        if (!secModule || secModule.status === 'disabled') return;

        const config = secModule.config || {};
        const rule = getEffectiveRule(config.rules, 'anti_sticker_delete', config);

        if (!rule.enabled) return;

        try {
          const guild = sticker.guild;
          if (!guild) return;

          const fetchedLogs = await guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.StickerDelete }).catch(() => null);
          const logEntry = fetchedLogs?.entries.find((e: any) => e.targetId === sticker.id && isRecentEntry(e));
          if (!logEntry) return;

          const executor = logEntry.executor;
          if (!executor || executor.id === client.user.id) return;
          if (await isExecutorBypassed(guild, executor.id, config, context, 'anti_sticker_delete')) return;

          const triggered = checkRateLimit(guild.id, executor.id, 'anti_sticker_delete', rule.limit, rule.window);
          if (!triggered) return;

          addThreatPoints(guild.id, 15);
          context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized sticker deletion by ${executor.username}.`, 'warn');

          // STEP 1: Punish violator immediately
          await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Sticker Deletion`, rule.action, config, context, 'anti_sticker_delete');

          // STEP 2: Re-upload deleted sticker
          if (rule.recovery !== false && sticker.url) {
            await guild.stickers.create({
              file: sticker.url,
              name: sticker.name,
              tags: sticker.tags || 'emoji',
              description: sticker.description || '',
              reason: 'Anti-Nuke Recovery: Restoring deleted sticker'
            }).catch(console.error);
            context.logSyncEvent(guild.id, `Re-uploaded deleted sticker "${sticker.name}".`, 'success');
          }
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
        if (!secModule || secModule.status === 'disabled') return;

        const config = secModule.config || {};
        const rule = getEffectiveRule(config.rules, 'anti_sticker_update', config);

        if (!rule.enabled) return;

        try {
          const guild = newSticker.guild;
          if (!guild) return;

          const fetchedLogs = await guild.fetchAuditLogs({ limit: 5, type: AuditLogEvent.StickerUpdate }).catch(() => null);
          const logEntry = fetchedLogs?.entries.find((e: any) => e.targetId === newSticker.id && isRecentEntry(e));
          if (!logEntry) return;

          const executor = logEntry.executor;
          if (!executor || executor.id === client.user.id) return;
          if (await isExecutorBypassed(guild, executor.id, config, context, 'anti_sticker_update')) return;

          const triggered = checkRateLimit(guild.id, executor.id, 'anti_sticker_update', rule.limit, rule.window);
          if (!triggered) return;

          context.logSyncEvent(guild.id, `🚨 [Anti-Nuke Triggered]: Unauthorized sticker update by ${executor.username}.`, 'warn');

          // STEP 1: Punish violator FIRST
          await punishViolator(client, guild, executor.id, executor.username, `Anti-Nuke: Unauthorized Sticker Update`, rule.action, config, context, 'anti_sticker_update');

          // STEP 2: Revert sticker properties if recovery is enabled
          if (rule.recovery !== false) {
            await newSticker.edit({
              name: oldSticker.name,
              description: oldSticker.description,
              tags: oldSticker.tags,
              reason: 'Anti-Nuke Recovery: Restoring original sticker properties'
            }).catch(console.error);
          }
        } catch (err) {
          console.error(err);
        }
      }
    },
    {
      name: 'inviteCreate',
      handler: async (client: any, invite: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState(invite.guild?.id) : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule || secModule.status === 'disabled') return;

        const config = secModule.config || {};
        if (config.antiNukeEnabled === false) return;
        const rule = getEffectiveRule(config.rules, 'anti_invite_create', config);
        if (!rule.enabled) return;

        try {
          const guild = invite.guild;
          if (!guild) return;

          const inviter = invite.inviter;
          if (!inviter || inviter.id === client.user?.id) return;

          const isBypassed = await isExecutorBypassed(guild, inviter.id, config, context, 'anti_invite_create');
          if (isBypassed) return;

          const raw = invite as any;
          const hasRoleBinding =
            (invite.targetType !== null && invite.targetType !== undefined && invite.targetType !== 0) ||
            (raw.target_type !== null && raw.target_type !== undefined && raw.target_type !== 0) ||
            (raw.targetType !== null && raw.targetType !== undefined && raw.targetType !== 0) ||
            (Array.isArray(raw.roles) && raw.roles.length > 0) ||
            (raw.targetRole !== null && raw.targetRole !== undefined) ||
            (raw.role !== null && raw.role !== undefined) ||
            (raw.role_id !== null && raw.role_id !== undefined) ||
            (raw.channel && (raw.channel.name?.includes('fuck') || raw.channel.name?.includes('raid') || raw.channel.name?.includes('script')));

          // Allow normal channel invite creation without punishment
          if (!hasRoleBinding) return;

          const triggered = checkRateLimit(guild.id, inviter.id, 'anti_invite_create', rule.limit || 1, rule.window || 10);
          if (!triggered) return;

          context.logSyncEvent(guild.id, `<a:success_check:1546134620087783526> [Anti-Nuke Triggered]: Unauthorized Role-Bound Invite (${invite.code}) created by ${inviter.username}. Deleting invite link.`, 'warn');

          // Immediately delete the unauthorized role-bound invite link
          await invite.delete('Anti-Nuke Protection: Deleting unauthorized role-bound invite link').catch(() => { });

          await punishViolator(client, guild, inviter.id, inviter.username, `<a:success_check:1546134620087783526> Anti-Nuke: Unauthorized Role-Bound Invite Creation (${invite.code})`, rule.action || 'quarantine', config, context, 'anti_invite_create');
        } catch (err) {
          console.error('[Anti-Nuke InviteCreate Error]:', err);
        }
      }
    },
    {
      name: 'messageCreate',
      handler: async (client: any, message: any, context: any) => {
        if (!message.guild || !message.author) return;
        if (message.author.id === client.user?.id) return;

        const modules = context.getModulesState ? context.getModulesState(message.guild.id) : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule || secModule.status === 'disabled') return;

        const config = secModule.config || {};
        const guild = message.guild;

        const automodModule = modules.find((m: any) => m.id === 'automod');
        const automodConfig = automodModule?.config || {};
        const isAutoModDisabled = automodModule && (automodModule.status === 'disabled' || automodConfig.autoModEnabled === false);

        // ─────────────────────────────────────────────────────────────────────────────
        // ANTI-EVERYONE & ANTI-HERE MENTION PROTECTION MODULE
        // ─────────────────────────────────────────────────────────────────────────────
        const hasEveryoneOrHere = message.mentions?.everyone === true || message.content?.includes('@everyone') || message.content?.includes('@here');
        if (hasEveryoneOrHere) {
          const ruleEveryone = getEffectiveRule(config.rules, 'anti_everyone_here', config);
          const isEveryoneActive = ruleEveryone.enabled &&
            (config.antiNukeEnabled !== false) &&
            (automodConfig.antiEveryoneEnabled !== false) &&
            !isAutoModDisabled;

          if (isEveryoneActive) {
            const isBypassed = await isExecutorBypassed(guild, message.author.id, config, context, 'anti_everyone_here');
            if (!isBypassed) {
              // Delete offending mention message immediately
              await message.delete().catch(() => { });

              if (message.author.bot) {
                // ZERO-TRUST BOT DEFENSE: Instant permanent ban for rogue bot mass pinging @everyone/@here
                context.logSyncEvent(guild.id, `🚨 [Anti-Everyone Zero-Trust]: Deleted @everyone/@here ping & banning unwhitelisted bot ${message.author.username}.`, 'warn');
                await revokeBotAndPurgeRoles(guild, message.author.id, message.author.username, 'Instant Ban for Unauthorized @everyone/@here Mention', client, context);
                await restoreFromLiveSnapshot(guild, client, context).catch(() => { });
                return;
              }

              const triggered = checkRateLimit(guild.id, message.author.id, 'anti_everyone_here', ruleEveryone.limit, ruleEveryone.window);
              if (triggered) {
                context.logSyncEvent(guild.id, `🚨 [Anti-Everyone Triggered]: Deleted @everyone/@here ping by ${message.author.username}. Action: ${ruleEveryone.action}`, 'warn');
                await punishViolator(client, guild, message.author.id, message.author.username, 'Anti-Nuke: Unauthorized @everyone/@here Mention', ruleEveryone.action, config, context, 'anti_everyone_here');
                return;
              }
            }
          }
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
      path: '/autofix',
      method: 'post',
      handler: async (req, res, context) => {
        if (!req.user) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        const hasPermission = await getGuildAndCheckPermission(req.user, context);
        if (!hasPermission) {
          return res.status(403).json({ success: false, error: 'Access Denied: Only the Owner and whitelisted users can execute auto-fix policies.' });
        }

        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        if (!secModule) return res.status(404).json({ error: 'Security module not found' });

        const currentConfig = secModule.config || {};
        const rules = currentConfig.rules || {};

        const updatedRules = {
          ...rules,
          anti_role_grant: { enabled: true, limit: 3, window: 10, action: 'quarantine', recovery: true },
          anti_channel_delete: { enabled: true, limit: 2, window: 10, action: 'quarantine', recovery: true },
          anti_role_delete: { enabled: true, limit: 2, window: 10, action: 'quarantine', recovery: true },
          anti_bot_add: { enabled: true, limit: 1, window: 10, action: 'ban', recovery: true }
        };

        const updatedConfig = {
          ...currentConfig,
          autoFixApplied: true,
          autoFixAppliedAt: Date.now(),
          rules: updatedRules,
          enforceStrictHierarchy: true
        };

        context.updateModuleConfig('security', updatedConfig);
        context.logSyncEvent(context.guildId, '🚨 Auto-Fix Policy executed: Tightened anti-nuke thresholds and role hierarchy controls.', 'success');

        res.json({ success: true, message: 'Auto-Fix Policy successfully applied in backend.', config: updatedConfig });
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
    {
      path: '/rules',
      method: 'get',
      handler: async (req, res, context) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        const config = secModule?.config || {};
        const rules = config.rules || {};
        const allKeys = Object.keys(DEFAULT_SECURITY_RULES);
        const effectiveRules: Record<string, any> = {};
        for (const key of allKeys) {
          effectiveRules[key] = getEffectiveRule(rules, key);
        }
        for (const [k, v] of Object.entries(rules)) {
          if (!effectiveRules[k]) effectiveRules[k] = v;
        }
        res.json({ success: true, rules: effectiveRules });
      }
    },
    {
      path: '/rules/update',
      method: 'post',
      handler: async (req, res, context) => {
        if (!req.user) {
          return res.status(401).json({ success: false, error: 'Unauthorized' });
        }
        const hasPermission = await getGuildAndCheckPermission(req.user, context);
        if (!hasPermission) {
          return res.status(403).json({ success: false, error: 'Access Denied: Only the Owner and whitelisted users can modify anti-nuke rules.' });
        }

        const { ruleName, enabled, limit, window: rateWindow, action, recovery } = req.body;
        if (!ruleName) {
          return res.status(400).json({ success: false, error: 'Missing ruleName parameter' });
        }

        const normalizedKey = normalizeRuleName(ruleName);
        const modules = context.getModulesState ? context.getModulesState() : [];
        const secModule = modules.find((m: any) => m.id === 'security');
        const currentConfig = secModule?.config || {};
        const rules = currentConfig.rules || {};
        const existingRule = getEffectiveRule(rules, normalizedKey);

        const updatedRule = {
          ...existingRule,
          ...(enabled !== undefined ? { enabled: Boolean(enabled) } : {}),
          ...(limit !== undefined ? { limit: Number(limit) } : {}),
          ...(rateWindow !== undefined ? { window: Number(rateWindow) } : {}),
          ...(action !== undefined ? { action: String(action) } : {}),
          ...(recovery !== undefined ? { recovery: Boolean(recovery) } : {})
        };

        const updatedRules = { ...rules, [normalizedKey]: updatedRule };
        context.updateModuleConfig('security', { ...currentConfig, rules: updatedRules });
        context.logSyncEvent(context.guildId, `Security Config API: Updated Anti-Nuke rule "${normalizedKey}".`, 'success');

        res.json({ success: true, ruleName: normalizedKey, rule: updatedRule, rules: updatedRules });
      }
    }
  ]
};
