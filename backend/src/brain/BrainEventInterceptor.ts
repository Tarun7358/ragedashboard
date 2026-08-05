/**
 * BrainEventInterceptor — Rage Brain
 *
 * Silent observer that hooks into Gateway.dispatchEvent().
 * This is the ONLY point of contact between the Brain and the existing bot.
 *
 * Rules:
 * - NEVER throws — all errors are caught and suppressed
 * - NEVER awaits in the hot path — always fire-and-forget
 * - NEVER modifies any args or context passed to it
 * - NEVER calls any existing bot module or security function
 * - Bot dispatch pipeline is NOT affected regardless of Brain state
 */

import { FeatureExtractor } from './FeatureExtractor.js';
import { BrainStore } from './BrainStore.js';
import { BrainLabeler } from './BrainLabeler.js';

// Bot action patterns — when the bot itself takes moderation actions,
// we mark those events as benign so the model doesn't mislabel them
const BOT_ACTION_OUTCOMES = new Set([
  'antinuke_ban', 'antinuke_kick', 'antinuke_quarantine',
  'antinuke_role_strip', 'antinuke_lockdown'
]);

// Rate limiter — don't overwhelm DB if a guild sends a flood of events
// Max 200 writes per 10-second window per guild
const WRITE_RATE_TRACKER = new Map<string, { count: number; resetAt: number }>();
const MAX_WRITES_PER_10S = 200;

function isRateLimited(guildId: string): boolean {
  const now = Date.now();
  const entry = WRITE_RATE_TRACKER.get(guildId);

  if (!entry || now > entry.resetAt) {
    WRITE_RATE_TRACKER.set(guildId, { count: 1, resetAt: now + 10_000 });
    return false;
  }

  entry.count++;
  if (entry.count > MAX_WRITES_PER_10S) {
    return true;  // silently skip — brain doesn't need every single event in a flood
  }

  return false;
}

// Track bot's own user ID (set during init)
let BOT_USER_ID: string | null = null;

export class BrainEventInterceptor {

  private static _initialized = false;

  public static init(botUserId: string): void {
    BOT_USER_ID = botUserId;
    this._initialized = true;
    console.log(`[BrainEventInterceptor] Initialized — observing all guild events (bot: ${botUserId})`);

    // Schedule nightly retention purge at 3:00 AM UTC
    this._scheduleRetentionPurge();
  }

  /**
   * Main tap point — called from Gateway.dispatchEvent() for every event.
   * Always fire-and-forget: `BrainEventInterceptor.observe(...).catch(() => {})`.
   */
  public static async observe(
    eventName: string,
    args: any[],
    context: {
      getModulesState?: (guildId?: string) => any[];
      getGlobalSettings?: (guildId?: string) => Record<string, any>;
    }
  ): Promise<void> {
    if (!this._initialized) return;

    try {
      // Extract structured feature record
      const row = await FeatureExtractor.extract(eventName, args, context);
      if (!row) return;

      // Rate limit per guild
      if (isRateLimited(row.guildId)) return;

      // Skip bot's own actions to avoid false positives
      // (e.g. bot banning an attacker shouldn't be labeled 'attack')
      if (BOT_USER_ID && row.actorId === BOT_USER_ID) {
        return;  // Bot's own actions are benign — not stored to keep dataset clean
      }

      // Insert feature record into brain_events
      await BrainStore.insertEvent(row);

      // Update actor profile (increment event count, update lastSeen)
      await BrainStore.upsertActorProfile(row.guildId, row.actorId, {
        totalEvents: 1,
        lastSeen: row.timestamp
      });

      // ── Auto-suspicious detection (heuristics until model is ready) ─────────
      // These are lightweight checks that flag obviously unusual patterns.
      // They are NOT replacing the existing anti-nuke — just data labeling hints.
      await this._checkHeuristicSuspicion(row);

    } catch (err: any) {
      // MUST NEVER PROPAGATE — Brain is a silent passenger
      console.debug('[BrainEventInterceptor] observe error (suppressed):', err?.message);
    }
  }

  /**
   * Called by BrainLabeler integration point when existing anti-nuke fires.
   * This is how the Brain gets confirmed ground truth labels.
   */
  public static async onSecurityAction(
    guildId: string,
    actorId: string,
    actionType: 'quarantine' | 'kick' | 'ban' | 'role_strip' | 'lockdown' | 'unknown'
  ): Promise<void> {
    if (!this._initialized) return;
    // Fire-and-forget
    BrainLabeler.onAntiNukeTrigger(guildId, actorId, actionType).catch(() => {});
  }

  // ── Heuristic Suspicion Checks ──────────────────────────────────────────────
  // These are fast, rule-based checks on the computed feature record.
  // When triggered, they label events as 'suspicious' with medium confidence.
  // The future model will replace these with learned decisions.

  private static async _checkHeuristicSuspicion(row: any): Promise<void> {
    const flags: string[] = [];

    // Rapid role deletions from a non-owner, non-whitelisted actor
    if (row.eventType === 'roleDelete' && row.actorRoleDeleteRate >= 3 && !row.actorIsOwner && !row.actorWhitelisted) {
      flags.push('rapid_role_delete');
    }

    // Rapid channel deletions
    if (row.eventType === 'channelDelete' && row.actorChannelDeleteRate >= 3 && !row.actorIsOwner && !row.actorWhitelisted) {
      flags.push('rapid_channel_delete');
    }

    // Mass ban velocity
    if (row.eventType === 'guildBanAdd' && row.actorBanRate >= 4 && !row.actorIsOwner && !row.actorWhitelisted) {
      flags.push('rapid_mass_ban');
    }

    // New account performing high-impact actions (joined < 1 day ago)
    if (row.actorJoinedGuildDays < 1 && row.actorEventRate_10s >= 3 && !row.actorIsOwner) {
      flags.push('new_actor_high_velocity');
    }

    // Extremely high event rate regardless of type
    if (row.actorEventRate_10s >= 8 && !row.actorIsOwner && !row.actorWhitelisted) {
      flags.push('extreme_event_velocity');
    }

    if (flags.length > 0) {
      const confidence = Math.min(0.6 + (flags.length * 0.1), 0.79);  // max 0.79 (below attack threshold)
      await BrainLabeler.onSuspiciousPattern(
        row.guildId,
        row.actorId,
        flags.join('+'),
        confidence,
        10_000
      ).catch(() => {});
    }
  }

  // ── Nightly Data Retention ──────────────────────────────────────────────────

  private static _scheduleRetentionPurge(): void {
    const scheduleNext = () => {
      const now = new Date();
      const next3am = new Date();
      next3am.setUTCHours(3, 0, 0, 0);
      if (next3am <= now) {
        next3am.setUTCDate(next3am.getUTCDate() + 1);
      }
      const msUntil = next3am.getTime() - now.getTime();

      setTimeout(async () => {
        try {
          const deleted = await BrainStore.runRetentionPurge(90);  // Keep 90 days
          console.log(`[BrainEventInterceptor] Nightly retention purge: deleted ${deleted} events older than 90 days.`);
        } catch {
          // Non-fatal
        }
        scheduleNext();  // Reschedule for tomorrow
      }, msUntil);
    };

    scheduleNext();
    console.log('[BrainEventInterceptor] Retention purge scheduled (daily @ 03:00 UTC, 90-day window).');
  }
}
