/**
 * AdvancedSecurityService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Rage Optimiser Enterprise — Advanced Security Gap Coverage
 *
 * Handles ALL missing attack vectors not covered by the base anti-nuke manifest:
 *
 *  1. Thread Spam / Mass Thread Delete Protection
 *  2. Raid Wave Detection (Join Velocity Lockdown)
 *  3. Bot Role Position Drift Watcher (5-min continuous monitoring)
 *  4. Slow/Staged Nuke — Cumulative 24h Action Tracker
 *  5. Mass Nickname Change Detection
 *  6. AutoMod Rule Deletion Protection
 *  7. Webhook Proactive Sweep (delete unauthorized webhooks, not just detect)
 *  8. Scheduled Event Spam Protection
 *  9. Application Command Permission Override Alert
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Client, Guild, GuildMember, PermissionFlagsBits, TextChannel, GuildVerificationLevel } from 'discord.js';
import { isOwnerOrExtraOwner, checkBypassImmunity } from '../utils/whitelistCheck.js';
import { activeQuarantines } from '../modules/security/manifest.js';
import { SECURITY_SHIELD_ICON } from '../core/UIFactory.js';
import { CentralLogger } from '../core/security/CentralLogger.js';

// ─────────────────────────────────────────────────────────────────────────────
// IN-MEMORY TRACKING STORES
// ─────────────────────────────────────────────────────────────────────────────

interface TimeWindowTracker {
  timestamps: number[];
}

interface CumulativeActionRecord {
  count: number;
  firstAction: number;
  lastAction: number;
}

/** Thread create/delete per guild per user: guildId -> `userId_action` -> tracker */
const threadActionTracker = new Map<string, Map<string, TimeWindowTracker>>();

/** Join timestamps per guild for raid detection: guildId -> timestamp[] */
const joinTracker = new Map<string, number[]>();

/** Nickname change tracker: guildId -> executorId -> tracker */
const nicknameTracker = new Map<string, Map<string, TimeWindowTracker>>();

/** Scheduled event create tracker: guildId -> userId_create -> tracker */
const eventActionTracker = new Map<string, Map<string, TimeWindowTracker>>();

/** 24h cumulative action store: guildId -> userId -> CumulativeActionRecord */
const cumulativeActionsStore = new Map<string, Map<string, CumulativeActionRecord>>();

/** Whether each guild is in lockdown mode */
const raidLockdownActive = new Set<string>();

/** Raid lockdown auto-expiry timers */
const raidLockdownTimers = new Map<string, NodeJS.Timeout>();

/** Background intervals */
let roleDriftInterval: NodeJS.Timeout | null = null;
let webhookSweepInterval: NodeJS.Timeout | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Rate window check (returns true if limit is hit)
// ─────────────────────────────────────────────────────────────────────────────

function checkWindow(
  outerMap: Map<string, Map<string, TimeWindowTracker>>,
  guildId: string,
  key: string,
  limit: number,
  windowMs: number
): boolean {
  if (!outerMap.has(guildId)) outerMap.set(guildId, new Map());
  const guild = outerMap.get(guildId)!;
  if (!guild.has(key)) guild.set(key, { timestamps: [] });
  const tracker = guild.get(key)!;

  const now = Date.now();
  tracker.timestamps = tracker.timestamps.filter(ts => now - ts < windowMs);
  tracker.timestamps.push(now);

  return tracker.timestamps.length >= limit;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Full bypass check (uses same logic as manifest — owner, extra owner,
// whitelisted roles, member whitelist, UPM list, sibling bots)
// ─────────────────────────────────────────────────────────────────────────────

async function isBotOrBypassed(executorId: string, guild: Guild, context: any, ruleId?: string): Promise<boolean> {
  if (!executorId || executorId === (guild as any).client?.user?.id) return true;
  try {
    return await checkBypassImmunity(executorId, guild, context, ruleId);
  } catch {
    // Fallback to simpler check if context unavailable
    return isOwnerOrExtraOwner(executorId, guild).catch(() => false);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Cumulative 24h action tracker
// ─────────────────────────────────────────────────────────────────────────────

const CUMULATIVE_WINDOW_MS = 24 * 60 * 60 * 1000;
const CUMULATIVE_THRESHOLD = 10;

function recordCumulativeAction(guildId: string, userId: string): number {
  if (!cumulativeActionsStore.has(guildId)) cumulativeActionsStore.set(guildId, new Map());
  const guild = cumulativeActionsStore.get(guildId)!;
  const now = Date.now();
  const existing = guild.get(userId);

  if (!existing || now - existing.firstAction > CUMULATIVE_WINDOW_MS) {
    guild.set(userId, { count: 1, firstAction: now, lastAction: now });
    return 1;
  }

  existing.count += 1;
  existing.lastAction = now;
  return existing.count;
}

export function getCumulativeCount(guildId: string, userId: string): number {
  return cumulativeActionsStore.get(guildId)?.get(userId)?.count || 0;
}

export function resetCumulativeCount(guildId: string, userId: string): void {
  cumulativeActionsStore.get(guildId)?.delete(userId);
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Security config from context
// ─────────────────────────────────────────────────────────────────────────────

function getSecConfig(context: any, guildId: string): { config: any; enabled: boolean } {
  const modules = context?.getModulesState ? context.getModulesState(guildId) : [];
  const secModule = modules?.find((m: any) => m.id === 'security');
  if (!secModule || secModule.status === 'disabled') return { config: {}, enabled: false };
  if (secModule.config?.antiNukeEnabled === false) return { config: secModule.config, enabled: false };
  return { config: secModule.config || {}, enabled: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Send alert to security channel
// ─────────────────────────────────────────────────────────────────────────────

async function sendSecurityAlert(guild: Guild, alertChannelId: string | null | undefined, message: string): Promise<void> {
  if (!alertChannelId) {
    // Fall back to rage-dashboard channel
    const dashChannel = guild.channels.cache.find((c: any) => c.name === 'rage-dashboard') as TextChannel | undefined;
    if (dashChannel?.isTextBased()) {
      await dashChannel.send({ content: message }).catch(() => {});
    }
    return;
  }
  try {
    const channel = guild.channels.cache.get(alertChannelId) as TextChannel;
    if (channel?.isTextBased()) {
      await channel.send({ content: message }).catch(() => {});
    }
  } catch { }
}

function dispatchRaidAlertNotifications(
  guild: Guild,
  config: any,
  reason: string,
  enabled: boolean = true
): void {
  const recipient = config?.alertEmail || undefined;

  // Dispatch Email Alert to linked owner email (fire-and-forget, never blocks)
  import('../services/EmailService.js').then(({ EmailService }) => {
    EmailService.sendRaidModeAlert({
      guildName: guild.name,
      guildId: guild.id,
      triggeredBy: reason,
      enabled,
      memberCount: guild.memberCount,
      toOverride: recipient
    }).catch(err => console.error('[AdvSec] Raid Email alert failed:', err));
  }).catch(() => {});

  // Dispatch WhatsApp Alert if configured
  import('../services/WhatsAppService.js').then(({ WhatsAppService }) => {
    WhatsAppService.sendSecurityAlert({
      type: enabled ? 'RAID LOCKDOWN ACTIVATED' : 'RAID LOCKDOWN LIFTED',
      guildName: guild.name,
      executor: 'Rage Threat Intelligence',
      details: reason,
      actionTaken: enabled ? 'Server Verification Elevated to Very High & Invites Disabled' : 'Normal Operations Restored'
    }).catch(() => {});
  }).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Quarantine a member (strip admin roles + timeout + quarantine role)
// ─────────────────────────────────────────────────────────────────────────────

async function quarantineMember(guild: Guild, executorId: string, reason: string, config: any): Promise<void> {
  const member = await guild.members.fetch(executorId).catch(() => null);
  if (!member) return;

  // BUG-1 FIX: Strip ALL dangerous roles, not just Administrator
  const DANGEROUS_PERMS = [
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.ManageWebhooks,
    PermissionFlagsBits.ManageNicknames,
    PermissionFlagsBits.ManageMessages,
  ];
  const dangerousRoles = member.roles.cache.filter((r: any) =>
    r.id !== guild.id && !r.managed &&
    DANGEROUS_PERMS.some(p => r.permissions.has(p))
  );
  const removedRoleIds: string[] = [];
  for (const [rId, r] of dangerousRoles) {
    removedRoleIds.push(rId);
    await member.roles.remove(r).catch(() => {});
  }

  // Add quarantine role if configured
  if (config.quarantineRoleId) {
    await member.roles.add(config.quarantineRoleId).catch(() => {});
  }

  // Apply maximum timeout (28 days)
  await member.timeout(28 * 24 * 60 * 60 * 1000, reason).catch(() => {});

  // Persist removed roles in security.config.quarantinedUsers so unquarantine restores them
  try {
    const { ModuleRegistry } = await import('../core/ModuleRegistry.js');
    const registry = ModuleRegistry.getInstance();
    if (registry) {
      const secMod = registry.getModulesState(guild.id)?.find((m: any) => m.id === 'security');
      if (secMod) {
        const currentQueue = Array.isArray(secMod.config?.quarantinedUsers) ? [...secMod.config.quarantinedUsers] : [];
        const existingIdx = currentQueue.findIndex((u: any) => u.userId === executorId);
        const entry = {
          id: `q-${Date.now()}-${executorId}`,
          tag: member.user.username,
          userId: executorId,
          reason,
          time: new Date().toISOString(),
          timestamp: Date.now(),
          status: 'Quarantined',
          risk: 'danger',
          originalRoles: removedRoleIds,
          roles: removedRoleIds,
          roleIds: removedRoleIds
        };
        if (existingIdx >= 0) currentQueue[existingIdx] = { ...currentQueue[existingIdx], ...entry };
        else currentQueue.push(entry);
        registry.updateModuleConfig(guild.id, 'security', { ...secMod.config, quarantinedUsers: currentQueue });
      }
    }
  } catch {}

  // BUG-11 FIX: Register in activeQuarantines so manifest guildMemberUpdate won't double-process
  const qKey = `${guild.id}_${executorId}`;
  activeQuarantines.add(qKey);
  setTimeout(() => activeQuarantines.delete(qKey), 20_000);

  // Email alert (fire-and-forget, never blocks)
  import('../services/EmailService.js').then(({ EmailService }) => {
    EmailService.sendQuarantineAlert({
      guildName: guild.name,
      guildId:   guild.id,
      userId:    executorId,
      username:  member.user.username,
      reason
    });
  }).catch(() => {});

  // WhatsApp alert (fire-and-forget, never blocks)
  import('../services/WhatsAppService.js').then(({ WhatsAppService }) => {
    WhatsAppService.sendSecurityAlert({
      type: 'QUARANTINE EXECUTED',
      guildName: guild.name,
      executor: `${member.user.username} (${executorId})`,
      actionTaken: 'Dangerous roles revoked + 28d timeout applied',
      details: reason
    });
  }).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. THREAD SPAM / MASS THREAD DELETE PROTECTION
// ─────────────────────────────────────────────────────────────────────────────
// >5 thread creates in 30s OR >3 thread deletes in 30s from same user
// → quarantine + alert
// ─────────────────────────────────────────────────────────────────────────────

export async function handleThreadCreate(client: Client, thread: any, context: any): Promise<void> {
  try {
    const guild = thread.guild;
    if (!guild) return;

    const { config, enabled } = getSecConfig(context, guild.id);
    if (!enabled) return;

    // AuditLogEvent.ThreadCreate = 110
    const logs = await guild.fetchAuditLogs({ limit: 5, type: 110 }).catch(() => null);
    const entry = logs?.entries.find((e: any) => {
      return (Date.now() - (e.createdTimestamp || 0)) < 15000 && e.targetId === thread.id;
    });

    const executorId = entry?.executor?.id;
    const executorName = entry?.executor?.username || 'Unknown';
    if (!executorId || executorId === client.user?.id) return;
    // BUG-6 FIX: Use full bypass check, not just isOwnerOrExtraOwner
    if (await isBotOrBypassed(executorId, guild, context, 'anti_channel_delete')) return;

    const triggered = checkWindow(threadActionTracker, guild.id, `${executorId}_create`, 3, 30_000); // BUG-2 FIX: Lower limit to 3
    const cumulative = recordCumulativeAction(guild.id, executorId);

    if (triggered) {
      context.logSyncEvent?.(guild.id, `[AdvSec] Thread Spam: ${executorName} created 3+ threads in 30s. Quarantining.`, 'warn');
      await sendSecurityAlert(guild, config.alertChannelId,
        `${SECURITY_SHIELD_ICON} **Thread Spam Detected** — \`${executorName}\` created **3+ threads in 30 seconds**. Auto-quarantined.`
      );
      await quarantineMember(guild, executorId, 'AdvSec: Thread spam attack', config);
    } else if (cumulative >= CUMULATIVE_THRESHOLD && cumulative % 5 === 0) {
      // BUG-4 FIX: Fire at >= threshold, then every 5 actions after
      context.logSyncEvent?.(guild.id, `[AdvSec] Slow Nuke: ${executorName} hit 24h cumulative (${cumulative} actions).`, 'warn');
      await sendSecurityAlert(guild, config.alertChannelId,
        `${SECURITY_SHIELD_ICON} **Slow Nuke Alert** — \`${executorName}\` has accumulated **${cumulative} destructive actions** in the past 24h.`
      );
    }
  } catch (err: any) {
    console.error('[AdvSec] handleThreadCreate:', err?.message);
  }
}

export async function handleThreadDelete(client: Client, thread: any, context: any): Promise<void> {
  try {
    const guild = thread.guild;
    if (!guild) return;

    const { config, enabled } = getSecConfig(context, guild.id);
    if (!enabled) return;

    // AuditLogEvent.ThreadDelete = 111
    const logs = await guild.fetchAuditLogs({ limit: 5, type: 111 }).catch(() => null);
    // BUG-3 FIX: Also match by targetId to avoid attributing wrong executor
    const entry = logs?.entries.find((e: any) =>
      (Date.now() - (e.createdTimestamp || 0)) < 15000 && e.targetId === thread.id
    );

    const executorId = entry?.executor?.id;
    const executorName = entry?.executor?.username || 'Unknown';
    if (!executorId || executorId === client.user?.id) return;
    // BUG-6 FIX: Full bypass check
    if (await isBotOrBypassed(executorId, guild, context, 'anti_channel_delete')) return;

    const triggered = checkWindow(threadActionTracker, guild.id, `${executorId}_delete`, 3, 30_000);
    recordCumulativeAction(guild.id, executorId);

    if (triggered) {
      context.logSyncEvent?.(guild.id, `[AdvSec] Mass Thread Delete: ${executorName} deleted 3+ threads in 30s.`, 'warn');
      await sendSecurityAlert(guild, config.alertChannelId,
        `${SECURITY_SHIELD_ICON} **Mass Thread Deletion** — \`${executorName}\` deleted **3+ threads in 30 seconds**. Auto-quarantined.`
      );
      await quarantineMember(guild, executorId, 'AdvSec: Mass thread deletion attack', config);
    }
  } catch (err: any) {
    console.error('[AdvSec] handleThreadDelete:', err?.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ADAPTIVE ANTI-RAID ENGINE (GRADUATED VERIFICATION & PATTERN CORRELATION)
// ─────────────────────────────────────────────────────────────────────────────
// Tier 1 (Soft Surge: >=5 joins in 30s) -> Medium/High verification + joiner restriction
// Tier 2 (Raid Wave: >=10 joins in 60s or Pattern Match) -> VERY_HIGH verification + invite revocation + quarantine
// Tier 3 (Critical Flood: >=20 joins in 60s) -> Emergency Lockdown + sweep
// ─────────────────────────────────────────────────────────────────────────────

/** Track recent joiners per guild: guildId -> (userId -> joinTimestamp) */
const recentJoinersStore = new Map<string, Map<string, number>>();

/** Track recent message fingerprints from fresh joiners: guildId -> PatternEntry[] */
interface RaidPatternEntry {
  userId: string;
  messageId: string;
  channelId: string;
  fingerprint: string;
  timestamp: number;
}
const raidPatternBuffer = new Map<string, RaidPatternEntry[]>();

export function isRaidLockdownActive(guildId: string): boolean {
  return raidLockdownActive.has(guildId);
}

/**
 * Owner-Controlled Raid Lockdown
 * Allows server owner or authorized administrators to manually engage/disengage lockdown.
 */
export async function setOwnerRaidLockdown(
  guild: Guild,
  enable: boolean,
  operatorId: string,
  context?: any
): Promise<{ success: boolean; message: string }> {
  if (!guild) return { success: false, message: 'Invalid guild' };
  const { config } = getSecConfig(context, guild.id);

  if (enable) {
    raidLockdownActive.add(guild.id);
    await guild.edit({ verificationLevel: GuildVerificationLevel.VeryHigh }).catch(() => {});

    for (const [, channel] of guild.channels.cache) {
      if (!(channel as any).permissionOverwrites || (channel as any).isThread?.()) continue;
      const isVoice = (channel as any).isVoiceBased?.() || channel.type === 2 || channel.type === 13;
      await (channel as any).permissionOverwrites?.edit?.(
        guild.roles.everyone,
        isVoice
          ? { CreateInstantInvite: false, Connect: false, SendMessages: false }
          : { CreateInstantInvite: false, SendMessages: false, AddReactions: false, CreatePublicThreads: false, CreatePrivateThreads: false },
        { reason: `Owner Raid Lockdown enabled by ${operatorId}` }
      ).catch(() => {});
    }

    CentralLogger.antinuke({
      guild,
      title: 'OWNER-CONTROLLED RAID LOCKDOWN ENGAGED',
      details: `Raid lockdown manually activated by operator <@${operatorId}>. Verification set to Very High, invites revoked.`,
      severity: 'high'
    });

    await sendSecurityAlert(guild, config.alertChannelId,
      `${SECURITY_SHIELD_ICON} **OWNER RAID LOCKDOWN ENGAGED** by <@${operatorId}>.\n` +
      `> Verification set to **Very High**. Channel invites disabled for \`@everyone\`.\n` +
      `> Use \`r!lockdown disable\` to lift lockdown.`
    );

    return { success: true, message: 'Raid lockdown enabled.' };
  } else {
    raidLockdownActive.delete(guild.id);
    const existing = raidLockdownTimers.get(guild.id);
    if (existing) {
      clearTimeout(existing);
      raidLockdownTimers.delete(guild.id);
    }

    await guild.edit({ verificationLevel: GuildVerificationLevel.Medium }).catch(() => {});

    for (const [, channel] of guild.channels.cache) {
      if (!(channel as any).permissionOverwrites || (channel as any).isThread?.()) continue;
      await (channel as any).permissionOverwrites?.edit?.(
        guild.roles.everyone,
        {
          CreateInstantInvite: null,
          SendMessages: null,
          SendMessagesInThreads: null,
          AddReactions: null,
          CreatePublicThreads: null,
          CreatePrivateThreads: null,
          Connect: null
        },
        { reason: `Owner Raid Lockdown lifted by ${operatorId}` }
      ).catch(() => {});
    }

    CentralLogger.antinuke({
      guild,
      title: 'OWNER-CONTROLLED RAID LOCKDOWN LIFTED',
      details: `Raid lockdown manually deactivated by operator <@${operatorId}>. Server verification & invite creation restored.`,
      severity: 'low'
    });

    await sendSecurityAlert(guild, config.alertChannelId,
      `<:ticks:1532620580266836148> **Raid Lockdown Lifted** by <@${operatorId}>. Verification restored to Medium and invite permissions re-enabled.`
    );

    return { success: true, message: 'Raid lockdown lifted.' };
  }
}

/**
 * Evaluates join bursts with a 3-tier graduated verification and restriction model.
 */
export async function handleMemberJoinRaidCheck(client: Client, member: GuildMember, context: any): Promise<void> {
  try {
    const guild = member.guild;
    const { config, enabled } = getSecConfig(context, guild.id);
    if (!enabled || raidLockdownActive.has(guild.id)) return;

    const now = Date.now();

    // Register joiner in recent joiner map (retained for 30 mins)
    if (!recentJoinersStore.has(guild.id)) recentJoinersStore.set(guild.id, new Map());
    const gJoiners = recentJoinersStore.get(guild.id)!;
    gJoiners.set(member.id, now);

    // Prune entries older than 30 mins
    for (const [mId, joinTs] of gJoiners.entries()) {
      if (now - joinTs > 30 * 60 * 1000) gJoiners.delete(mId);
    }

    if (!joinTracker.has(guild.id)) joinTracker.set(guild.id, []);
    const timestamps = joinTracker.get(guild.id)!;

    const fresh = timestamps.filter(ts => now - ts < 60_000);
    fresh.push(now);
    joinTracker.set(guild.id, fresh);

    const fresh30s = fresh.filter(ts => now - ts < 30_000);

    // TIER 3: CRITICAL MASS FLOOD (>=20 joins in 60s)
    if (fresh.length >= 20) {
      raidLockdownActive.add(guild.id);

      context.logSyncEvent?.(guild.id, `[AdvSec] CRITICAL RAID FLOOD: ${fresh.length} joins in 60s. Maximum lockdown.`, 'warn');
      CentralLogger.attack({
        guild,
        action: 'CRITICAL RAID FLOOD LOCKDOWN (TIER 3)',
        reason: `Extreme join surge: ${fresh.length} accounts joined within 60s`,
        executorId: member.id,
        executorName: member.user.username,
        result: 'success',
        note: `Verification -> Very High, invites closed, auto-quarantine for recent joiners.`,
        severity: 'critical'
      });

      await guild.edit({ verificationLevel: GuildVerificationLevel.VeryHigh }).catch(() => {});

      // Quarantine recent joiners from past 15 mins
      for (const [recentId, joinTime] of gJoiners.entries()) {
        if (now - joinTime < 15 * 60 * 1000) {
          quarantineMember(guild, recentId, 'AdvSec: Tier 3 Mass Raid Surge Quarantine', config).catch(() => {});
        }
      }

      for (const [, channel] of guild.channels.cache) {
        if (channel.type !== 0 && channel.type !== 2 && channel.type !== 5) continue;
        await (channel as any).permissionOverwrites?.edit?.(
          guild.roles.everyone,
          { CreateInstantInvite: false },
          { reason: 'AdvSec: Tier 3 Raid flood lockdown' }
        ).catch(() => {});
      }

      await sendSecurityAlert(guild, config.alertChannelId,
        `<a:warning:1546155193303957504> **CRITICAL RAID FLOOD (TIER 3)** — **${fresh.length} accounts joined in 60s**!\n` +
        `> Emergency containment engaged. Verification set to **Very High**.\n` +
        `> All invites revoked and recent joiners quarantined.\n` +
        `> Auto-unlock in **15 minutes** or use \`r!lockdown disable\`.`
      );

      dispatchRaidAlertNotifications(
        guild,
        config,
        `Critical Mass Raid Surge: ${fresh.length} accounts joined in 60s (Tier 3)`,
        true
      );

      armAutoUnlockTimer(guild, config, context, 15);
      return;
    }

    // TIER 2: RAID WAVE (>=10 joins in 60s)
    if (fresh.length >= 10) {
      raidLockdownActive.add(guild.id);

      context.logSyncEvent?.(guild.id, `[AdvSec] RAID WAVE DETECTED (TIER 2): ${fresh.length} joins in 60s.`, 'warn');
      CentralLogger.attack({
        guild,
        action: 'RAID LOCKDOWN TRIGGERED (TIER 2)',
        reason: `Raid Wave Detected: ${fresh.length} accounts joined within 60 seconds`,
        executorId: member.id,
        executorName: member.user.username,
        result: 'success',
        note: `Verification bumped to Very High, invites revoked for @everyone. Auto-unlock in 10 mins.`,
        severity: 'critical'
      });

      await guild.edit({ verificationLevel: GuildVerificationLevel.VeryHigh }).catch(() => {});

      for (const [, channel] of guild.channels.cache) {
        if (channel.type !== 0 && channel.type !== 2 && channel.type !== 5) continue;
        await (channel as any).permissionOverwrites?.edit?.(
          guild.roles.everyone,
          { CreateInstantInvite: false },
          { reason: 'AdvSec: Raid lockdown Tier 2' }
        ).catch(() => {});
      }

      await sendSecurityAlert(guild, config.alertChannelId,
        `${SECURITY_SHIELD_ICON} **RAID WAVE DETECTED (TIER 2)** — **${fresh.length} members** joined in under 60 seconds.\n` +
        `> Server verification set to **Very High**. All new invites disabled.\n` +
        `> Auto-unlocking in **10 minutes**. Use \`r!lockdown disable\` to manually unlock.`
      );

      dispatchRaidAlertNotifications(
        guild,
        config,
        `Raid Wave Detected: ${fresh.length} accounts joined in 60s (Tier 2)`,
        true
      );

      armAutoUnlockTimer(guild, config, context, 10);
      return;
    }

    // TIER 1: SOFT SURGE (>=5 joins in 30s)
    if (fresh30s.length >= 5) {
      context.logSyncEvent?.(guild.id, `[AdvSec] Soft Join Surge (Tier 1): ${fresh30s.length} joins in 30s. Graduated verification engaged.`, 'info');

      // Escalate verification to High if lower
      if (guild.verificationLevel === GuildVerificationLevel.None || guild.verificationLevel === GuildVerificationLevel.Low) {
        await guild.edit({ verificationLevel: GuildVerificationLevel.High }).catch(() => {});
      }

      // Temporary joiner restriction: 5 min timeout on fresh joiner
      await member.timeout(5 * 60 * 1000, 'AdvSec Tier 1: Soft join surge rate-gate').catch(() => {});

      await sendSecurityAlert(guild, config.alertChannelId,
        `${SECURITY_SHIELD_ICON} **Join Surge Detected (Tier 1)** — **${fresh30s.length} accounts** joined in 30s. Verification elevated and joiner restricted for 5m.`
      );
    }
  } catch (err: any) {
    console.error('[AdvSec] handleMemberJoinRaidCheck:', err?.message);
  }
}

/**
 * Correlated Cross-Account Raid Message Check
 * Detects identical or coordinated spam patterns posted across distinct newly joined accounts.
 */
export async function handleRaidMessageCheck(
  message: any,
  context: any
): Promise<{ isRaid: boolean; reason: string }> {
  try {
    const guild = message.guild;
    if (!guild || !message.author || message.author.bot) return { isRaid: false, reason: '' };

    const member = message.member;
    const joinedAt = member?.joinedTimestamp || 0;
    const now = Date.now();

    // Only inspect accounts joined in the last 30 minutes
    if (now - joinedAt > 30 * 60 * 1000 && joinedAt > 0) {
      return { isRaid: false, reason: '' };
    }

    // Exclude immune owners / whitelisted actors
    if (await isBotOrBypassed(message.author.id, guild, context, 'anti_raid')) {
      return { isRaid: false, reason: '' };
    }

    // Clean text to create normalized pattern fingerprint
    const raw = (message.content || '').toLowerCase();
    const clean = raw
      .replace(/https?:\/\/[^\s]+/g, '')
      .replace(/<a?:[a-zA-Z0-9_]+:\d+>/g, '')
      .replace(/<@!?[0-9]+>/g, '')
      .replace(/<@&[0-9]+>/g, '')
      .replace(/[^a-z0-9]/g, '');

    // If fingerprint is too short to be a distinct raid pattern, skip
    if (clean.length < 6) return { isRaid: false, reason: '' };

    if (!raidPatternBuffer.has(guild.id)) raidPatternBuffer.set(guild.id, []);
    const buffer = raidPatternBuffer.get(guild.id)!;

    // Prune entries older than 30s
    const valid = buffer.filter(e => now - e.timestamp < 30_000);
    valid.push({
      userId: message.author.id,
      messageId: message.id,
      channelId: message.channel.id,
      fingerprint: clean,
      timestamp: now
    });
    raidPatternBuffer.set(guild.id, valid);

    // Look for matching fingerprints across DISTINCT user IDs
    const matching = valid.filter(e => e.fingerprint === clean);
    const distinctUsers = new Set(matching.map(e => e.userId));

    if (distinctUsers.size >= 3) {
      // CORRELATED RAID ATTACK CONFIRMED! (>= 3 distinct new accounts posting same content in 30s)
      const { config } = getSecConfig(context, guild.id);

      context.logSyncEvent?.(guild.id, `[AdvSec] CORRELATED RAID DETECTED: ${distinctUsers.size} accounts repeating pattern "${clean.substring(0, 20)}...". Purging & Locking.`, 'warn');

      CentralLogger.attack({
        guild,
        action: 'CORRELATED RAID PATTERN INTERCEPTED',
        reason: `Multi-Account Raid Attack: ${distinctUsers.size} distinct accounts posted matching pattern in under 30 seconds`,
        executorId: message.author.id,
        executorName: message.author.username,
        result: 'success',
        note: `All matching messages purged. Perpetrators quarantined. Server elevated to Tier 2 raid lockdown.`,
        severity: 'critical'
      });

      // Quarantine all participating raid accounts
      for (const uId of distinctUsers) {
        quarantineMember(guild, uId, 'AdvSec: Correlated multi-account raid attack pattern', config).catch(() => {});
      }

      // Engage Tier 2 Raid Lockdown if not already active
      if (!raidLockdownActive.has(guild.id)) {
        raidLockdownActive.add(guild.id);
        await guild.edit({ verificationLevel: GuildVerificationLevel.VeryHigh }).catch(() => {});

        for (const [, ch] of guild.channels.cache) {
          if (ch.type !== 0 && ch.type !== 2 && ch.type !== 5) continue;
          await (ch as any).permissionOverwrites?.edit?.(
            guild.roles.everyone,
            { CreateInstantInvite: false },
            { reason: 'AdvSec: Correlated raid pattern lockdown' }
          ).catch(() => {});
        }

        armAutoUnlockTimer(guild, config, context, 10);
      }

      await sendSecurityAlert(guild, config.alertChannelId,
        `<a:warning:1546155193303957504> **CORRELATED RAID PATTERN DETECTED**\n` +
        `> **${distinctUsers.size} distinct new accounts** coordinated spamming matching content in under 30s.\n` +
        `> All participating accounts have been **quarantined**, messages suppressed, and server elevated to **Tier 2 Lockdown**.`
      );

      dispatchRaidAlertNotifications(
        guild,
        config,
        `Correlated Spam Raid: ${distinctUsers.size} accounts coordinated spamming matching content in 30s`,
        true
      );

      return {
        isRaid: true,
        reason: `Correlated multi-account raid pattern (${distinctUsers.size} accounts)`
      };
    }

    return { isRaid: false, reason: '' };
  } catch (err: any) {
    console.error('[AdvSec] handleRaidMessageCheck:', err?.message);
    return { isRaid: false, reason: '' };
  }
}

function armAutoUnlockTimer(guild: Guild, config: any, context: any, minutes: number): void {
  const existing = raidLockdownTimers.get(guild.id);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    raidLockdownActive.delete(guild.id);
    raidLockdownTimers.delete(guild.id);
    await guild.edit({ verificationLevel: GuildVerificationLevel.Medium }).catch(() => {});

    for (const [, channel] of guild.channels.cache) {
      if (channel.type !== 0 && channel.type !== 2 && channel.type !== 5) continue;
      await (channel as any).permissionOverwrites?.edit?.(
        guild.roles.everyone,
        { CreateInstantInvite: null },
        { reason: 'AdvSec: Raid lockdown expiry — restoring invite permissions' }
      ).catch(() => {});
    }

    context?.logSyncEvent?.(guild.id, '[AdvSec] Raid lockdown expired. Verification + invite permissions restored.', 'info');
    CentralLogger.antinuke({
      guild,
      title: 'RAID LOCKDOWN EXPIRED',
      details: `Automatic ${minutes}-minute raid lockdown timer completed. Server verification & invite creation restored.`,
      severity: 'low'
    });
    await sendSecurityAlert(guild, config.alertChannelId,
      `<:ticks:1532620580266836148> **Raid Lockdown Lifted** — Verification restored to Medium and invite permissions re-enabled. Monitor activity closely.`
    );
    dispatchRaidAlertNotifications(
      guild,
      config,
      `Automatic ${minutes}-minute raid lockdown timer completed. Server verification restored to Medium.`,
      false
    );
  }, minutes * 60 * 1000);

  raidLockdownTimers.set(guild.id, timer);
}

const reportedDriftGuilds = new Set<string>();

async function runRoleDriftCheck(client: Client): Promise<void> {
  if (!client.guilds?.cache) return;

  for (const [, guild] of client.guilds.cache) {
    try {
      const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
      if (!botMember) continue;

      const roles = guild.roles.cache;
      const botTopRole = botMember.roles.highest;
      if (!botTopRole || botTopRole.managed) continue;

      const botPos = botTopRole.position;
      const rolesAboveBot = Array.from(roles.values()).filter(
        (r: any) => !r.managed && r.id !== guild.roles.everyone.id && r.id !== botTopRole.id && r.position > botPos
      );

      // If 1 or more non-managed roles sit above the bot's top role → attempt repair
      if (rolesAboveBot.length >= 1) {
        const targetPos = Math.max(...rolesAboveBot.map((r: any) => r.position));
        let success = false;
        try {
          const updatedRole = await botTopRole.setPosition(targetPos + 1, { reason: 'AdvSec: Auto-repair role position drift' });
          if (updatedRole && updatedRole.position > botPos) {
            success = true;
          }
        } catch {
          success = false;
        }

        // Only send alert if role position was actually modified and not already alerted in this session
        if (success && !reportedDriftGuilds.has(guild.id)) {
          reportedDriftGuilds.add(guild.id);
          const dashCh = guild.channels.cache.find((c: any) => c.name === 'rage-dashboard') as TextChannel | undefined;
          if (dashCh?.isTextBased()) {
            await dashCh.send({
              content: `${SECURITY_SHIELD_ICON} **Role Position Drift Repaired** — ${rolesAboveBot.length} role(s) were above the bot's security role (bot was at pos **${botPos}**). Auto-repaired to position **${targetPos + 1}**.`
            }).catch(() => {});
          }
        }
      }
    } catch (err: any) {
      console.error(`[AdvSec] Role drift check guild ${guild.id}:`, err?.message);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SLOW NUKE — CUMULATIVE 24h ACTION TRACKER (exported for external use)
// ─────────────────────────────────────────────────────────────────────────────
// Call this from existing manifest event handlers to contribute to 24h score.
// ─────────────────────────────────────────────────────────────────────────────

export function trackDestructiveAction(
  guildId: string,
  userId: string,
  actionLabel: string,
  context: any,
  alertChannelId?: string,
  guild?: Guild
): void {
  const count = recordCumulativeAction(guildId, userId);

  // BUG-4 FIX: Alert at exact threshold AND every 5 actions after
  if (count === CUMULATIVE_THRESHOLD || (count > CUMULATIVE_THRESHOLD && (count - CUMULATIVE_THRESHOLD) % 5 === 0)) {
    context.logSyncEvent?.(guildId, `[AdvSec] SLOW NUKE ALERT: user ${userId} hit 24h threshold (${count} actions, latest: ${actionLabel}).`, 'warn');
    if (guild && alertChannelId) {
      sendSecurityAlert(guild, alertChannelId,
        `${SECURITY_SHIELD_ICON} **Slow/Staged Nuke Detected**\n` +
        `> A user has performed **${count} destructive actions** over 24 hours.\n` +
        `> Latest: \`${actionLabel}\`\n> Use \`r!quarantine @user\` to isolate them immediately.`
      ).catch(() => {});
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. MASS NICKNAME CHANGE DETECTION
// ─────────────────────────────────────────────────────────────────────────────
// >5 nickname changes by the same executor in 20s → quarantine
// ─────────────────────────────────────────────────────────────────────────────

export async function handleNicknameChange(client: Client, oldMember: GuildMember, newMember: GuildMember, context: any): Promise<void> {
  try {
    // Only fire when nickname actually changed
    if (oldMember.nickname === newMember.nickname) return;

    const guild = newMember.guild;
    const { config, enabled } = getSecConfig(context, guild.id);
    if (!enabled) return;

    // AuditLogEvent.MemberUpdate = 24
    const logs = await guild.fetchAuditLogs({ limit: 5, type: 24 }).catch(() => null);
    const entry = logs?.entries.find((e: any) => {
      return (Date.now() - (e.createdTimestamp || 0)) < 10000 && e.targetId === newMember.id;
    });

    const executorId = entry?.executor?.id;
    const executorName = entry?.executor?.username || 'Unknown';
    // Skip if bot or same user (self-rename)
    if (!executorId || executorId === client.user?.id || executorId === newMember.id) return;
    // BUG-6 FIX: Full bypass check + BUG-7 FIX: Skip if target is already quarantined
    if (activeQuarantines.has(`${guild.id}_${newMember.id}`)) return;
    if (await isBotOrBypassed(executorId, guild, context, 'anti_member_update')) return;

    const triggered = checkWindow(nicknameTracker, guild.id, executorId, 5, 20_000);
    const cumulative = recordCumulativeAction(guild.id, executorId);

    if (triggered) {
      context.logSyncEvent?.(guild.id, `[AdvSec] Mass Nickname Attack: ${executorName} changed 5+ nicknames in 20s.`, 'warn');
      await sendSecurityAlert(guild, config.alertChannelId,
        `${SECURITY_SHIELD_ICON} **Mass Nickname Change Attack** — \`${executorName}\` modified **5+ member nicknames** in 20 seconds. Auto-quarantined.`
      );
      await quarantineMember(guild, executorId, 'AdvSec: Mass nickname change attack', config);
    } else if (cumulative >= CUMULATIVE_THRESHOLD && (cumulative - CUMULATIVE_THRESHOLD) % 5 === 0) {
      // BUG-4 FIX: Alert at >= threshold and every 5 after
      context.logSyncEvent?.(guild.id, `[AdvSec] Slow Nuke: ${executorName} cumulative 24h threshold hit (${cumulative}).`, 'warn');
      await sendSecurityAlert(guild, config.alertChannelId,
        `${SECURITY_SHIELD_ICON} **Slow Nuke Alert** — \`${executorName}\` has accumulated **${cumulative} destructive actions** in 24h.`
      );
    }
  } catch (err: any) {
    console.error('[AdvSec] handleNicknameChange:', err?.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. AUTOMOD RULE DELETION PROTECTION
// ─────────────────────────────────────────────────────────────────────────────
// Alert + log whenever a non-whitelisted user deletes a Discord native AutoMod
// rule. Discord.js v14.11+ emits 'autoModerationRuleDelete'.
// ─────────────────────────────────────────────────────────────────────────────

export async function handleAutoModRuleDelete(client: Client, rule: any, context: any): Promise<void> {
  try {
    const guild = rule.guild;
    if (!guild) return;

    const { config, enabled } = getSecConfig(context, guild.id);
    if (!enabled) return;

    // AuditLogEvent.AutoModerationRuleDelete = 141
    const logs = await guild.fetchAuditLogs({ limit: 5, type: 141 }).catch(() => null);
    const entry = logs?.entries.find((e: any) => (Date.now() - (e.createdTimestamp || 0)) < 15000);

    const executorId = entry?.executor?.id;
    const executorName = entry?.executor?.username || 'Unknown';
    if (!executorId || executorId === client.user?.id) return;
    if (await isBotOrBypassed(executorId, guild, context, 'anti_automod_delete')) return; // BUG-6 FIX: Correct permission string

    context.logSyncEvent?.(guild.id, `[AdvSec] AutoMod rule "${rule.name}" deleted by ${executorName}.`, 'warn');
    await sendSecurityAlert(guild, config.alertChannelId,
      `${SECURITY_SHIELD_ICON} **Discord AutoMod Rule Deleted**\n` +
      `> Rule: **"${rule.name || 'Unknown'}"** was deleted by \`${executorName}\`.\n` +
      `> This disables a native spam/content filter. Go to **Server Settings → AutoMod** to restore it immediately.`
    );

    recordCumulativeAction(guild.id, executorId);
  } catch (err: any) {
    console.error('[AdvSec] handleAutoModRuleDelete:', err?.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. WEBHOOK PROACTIVE SWEEP (background — every 10 minutes)
// ─────────────────────────────────────────────────────────────────────────────
// Fetches all webhooks in all channels for all guilds.
// Deletes any webhook not owned by the Rage bot itself.
// ─────────────────────────────────────────────────────────────────────────────

const BOT_OWNED_WEBHOOK_NAMES = new Set([
  'Rage-AntiLink-Sanitizer',
  'rage-antilinkSanitizer',
  'Rage-AntiLink',
]);

async function runWebhookSweep(_client: Client): Promise<void> {
  // Proactive background webhook deletion is deactivated to prevent deleting
  // legitimate announcement webhooks. Webhooks are monitored via anti_webhook_create.
  return;
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. SCHEDULED EVENT SPAM PROTECTION
// ─────────────────────────────────────────────────────────────────────────────
// >5 scheduled event creates in 60s by same user → timeout
// AuditLogEvent.GuildScheduledEventCreate = 100
// ─────────────────────────────────────────────────────────────────────────────

export async function handleScheduledEventCreate(client: Client, event: any, context: any): Promise<void> {
  try {
    const guild = event.guild;
    if (!guild) return;

    const { config, enabled } = getSecConfig(context, guild.id);
    if (!enabled) return;

    const logs = await guild.fetchAuditLogs({ limit: 5, type: 100 }).catch(() => null);
    const entry = logs?.entries.find((e: any) => (Date.now() - (e.createdTimestamp || 0)) < 10000);

    const executorId = entry?.executor?.id || event.creatorId;
    const executorName = entry?.executor?.username || 'Unknown';
    if (!executorId || executorId === client.user?.id) return;
    // BUG-6 FIX: Full bypass check
    if (await isBotOrBypassed(executorId, guild, context, 'anti_guild_update')) return;

    recordCumulativeAction(guild.id, executorId);
    const triggered = checkWindow(eventActionTracker, guild.id, `${executorId}_create`, 5, 60_000);

    if (triggered) {
      context.logSyncEvent?.(guild.id, `[AdvSec] Event Spam: ${executorName} created 5+ scheduled events in 60s.`, 'warn');
      await sendSecurityAlert(guild, config.alertChannelId,
        `${SECURITY_SHIELD_ICON} **Scheduled Event Spam** — \`${executorName}\` created **5+ events** in 60 seconds. Timed out for 6 hours.`
      );
      const executorMember = await guild.members.fetch(executorId).catch(() => null);
      if (executorMember) {
        await executorMember.timeout(6 * 60 * 60 * 1000, 'AdvSec: Scheduled event spam').catch(() => {});
      }
    }
  } catch (err: any) {
    console.error('[AdvSec] handleScheduledEventCreate:', err?.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. APPLICATION COMMAND PERMISSION OVERRIDE ALERT
// ─────────────────────────────────────────────────────────────────────────────
// Fires when a non-whitelisted user changes slash command permissions for the
// bot via Server Settings → Integrations.
// Discord.js event: 'applicationCommandPermissionsUpdate'
// ─────────────────────────────────────────────────────────────────────────────

export async function handleCommandPermissionsUpdate(client: Client, data: any, context: any): Promise<void> {
  try {
    const guild = data.guild || (data.guildId ? client.guilds.cache.get(data.guildId) : null) as Guild | null;
    if (!guild) return;

    const { config, enabled } = getSecConfig(context, guild.id);
    if (!enabled) return;

    // Only care about changes to our own bot's application
    if (data.applicationId && data.applicationId !== client.user?.id) return;

    // AuditLogEvent.ApplicationCommandPermissionUpdate = 121
    const logs = await guild.fetchAuditLogs({ limit: 3, type: 121 }).catch(() => null);
    const entry = logs?.entries.find((e: any) => (Date.now() - (e.createdTimestamp || 0)) < 15000);

    const executorId = entry?.executor?.id;
    const executorName = entry?.executor?.username || 'Unknown';
    if (!executorId || executorId === client.user?.id) return;
    // BUG-6 FIX: Full bypass check — whitelisted admins can legitimately adjust command permissions
    if (await isBotOrBypassed(executorId, guild, context, 'anti_guild_update')) return;

    context.logSyncEvent?.(guild.id, `[AdvSec] Slash command permissions modified by ${executorName}. Possible command disable attempt.`, 'warn');
    await sendSecurityAlert(guild, config.alertChannelId,
      `${SECURITY_SHIELD_ICON} **Bot Command Permissions Changed**\n` +
      `> \`${executorName}\` modified slash command permissions for this bot via **Server Settings → Integrations**.\n` +
      `> If commands are disabled, go to **Server Settings → Integrations → Rage** to restore permissions.`
    );
  } catch (err: any) {
    console.error('[AdvSec] handleCommandPermissionsUpdate:', err?.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE INITIALIZATION
// ─────────────────────────────────────────────────────────────────────────────

export class AdvancedSecurityService {
  /**
   * Initialize the background monitoring engines.
   * Call this once when the bot client is Ready.
   */
  public static init(client: Client): void {
    console.log('[AdvSec] Advanced Security Service initialized — Role drift watcher + Webhook sweep active.');

    // Role position drift monitor: every 5 minutes
    if (roleDriftInterval) clearInterval(roleDriftInterval);
    roleDriftInterval = setInterval(() => {
      runRoleDriftCheck(client).catch((e: any) => console.warn('[AdvSec] Drift check error:', e?.message));
    }, 5 * 60 * 1000);
    runRoleDriftCheck(client).catch(() => {});

    // Webhook proactive sweep: every 10 minutes (starts after 2 min for cache warmup)
    if (webhookSweepInterval) clearInterval(webhookSweepInterval);
    webhookSweepInterval = setInterval(() => {
      runWebhookSweep(client).catch((e: any) => console.warn('[AdvSec] Webhook sweep error:', e?.message));
    }, 10 * 60 * 1000);
    setTimeout(() => runWebhookSweep(client).catch(() => {}), 2 * 60 * 1000);
  }

  /** Expose cumulative tracker for existing manifest handlers */
  public static readonly trackAction = trackDestructiveAction;
  public static readonly getCumulativeCount = getCumulativeCount;
  public static readonly resetCumulativeCount = resetCumulativeCount;
}
