/**
 * BrainLabeler — Rage Brain
 *
 * Listens for confirmed anti-nuke enforcement events and retroactively
 * labels preceding brain_events from the same actor as 'attack'.
 *
 * This creates free, high-quality ground truth labels from your existing
 * rule-engine triggers — no human annotation needed.
 *
 * Usage: Call BrainLabeler.onAntiNukeTrigger() from the anti-nuke module
 * (or from BrainEventInterceptor when it detects a quarantine/kick/ban action
 * by the bot itself).
 */

import { BrainStore } from './BrainStore.js';

export class BrainLabeler {

  /**
   * Called when the existing anti-nuke system confirmed an attack and took action.
   * Retroactively labels all preceding events from this actor in the past lookback window.
   *
   * @param guildId      - guild where the attack occurred
   * @param actorId      - the attacker's Discord ID
   * @param actionType   - what the anti-nuke did (quarantine, kick, ban, role_strip)
   * @param lookbackMs   - how far back to scan for related events (default: 30 seconds)
   */
  public static async onAntiNukeTrigger(
    guildId: string,
    actorId: string,
    actionType: 'quarantine' | 'kick' | 'ban' | 'role_strip' | 'lockdown' | 'unknown',
    lookbackMs = 30_000
  ): Promise<void> {
    try {
      const sinceTs = Date.now() - lookbackMs;
      const sessionId = `sess_${guildId}_${actorId}_${Date.now()}`;

      // Confidence based on action severity
      const confidenceMap: Record<string, number> = {
        quarantine: 0.99,
        ban: 0.97,
        kick: 0.92,
        role_strip: 0.95,
        lockdown: 0.85,
        unknown: 0.75
      };
      const confidence = confidenceMap[actionType] ?? 0.75;

      // Label all preceding unlabeled events from this actor as 'attack'
      const labeledCount = await BrainStore.labelEventsByActor(
        guildId,
        actorId,
        sinceTs,
        'attack',
        confidence,
        sessionId,
        'antinuke_trigger'
      );

      if (labeledCount > 0) {
        // Create an attack session record
        await BrainStore.createAttackSession({
          id: sessionId,
          guildId,
          startedAt: sinceTs,
          endedAt: Date.now(),
          attackerIds: JSON.stringify([actorId]),
          eventTypes: '[]',  // will be populated by future version querying labeled events
          outcome: `blocked_${actionType}`,
          eventCount: labeledCount,
          severity: actionType === 'quarantine' || actionType === 'lockdown' ? 'critical' : 'high'
        });

        // Update actor profile — increment flags + confirmed attacks
        await BrainStore.upsertActorProfile(guildId, actorId, {
          totalFlags: 1,
          totalConfirmedAttacks: 1,
          lastSeen: Date.now(),
          riskScore: 1.0
        });

        console.log(
          `[BrainLabeler] Anti-nuke trigger: labeled ${labeledCount} events as ATTACK ` +
          `for actor ${actorId} in guild ${guildId} (action: ${actionType}, session: ${sessionId})`
        );
      }
    } catch (err: any) {
      // Never propagate
      console.debug('[BrainLabeler] onAntiNukeTrigger error (suppressed):', err?.message);
    }
  }

  /**
   * Called when a suspicious pattern is detected but not confirmed as an attack.
   * Labels events as 'suspicious' with lower confidence.
   */
  public static async onSuspiciousPattern(
    guildId: string,
    actorId: string,
    patternType: string,
    confidence: number,
    lookbackMs = 15_000
  ): Promise<void> {
    try {
      const sinceTs = Date.now() - lookbackMs;
      const sessionId = `susp_${guildId}_${actorId}_${Date.now()}`;

      const labeledCount = await BrainStore.labelEventsByActor(
        guildId, actorId, sinceTs, 'suspicious', Math.min(confidence, 0.79), sessionId, 'auto'
      );

      if (labeledCount > 0) {
        await BrainStore.upsertActorProfile(guildId, actorId, {
          totalFlags: 1,
          lastSeen: Date.now(),
          riskScore: confidence
        });

        console.log(
          `[BrainLabeler] Suspicious pattern "${patternType}": labeled ${labeledCount} events for actor ${actorId}`
        );
      }
    } catch (err: any) {
      console.debug('[BrainLabeler] onSuspiciousPattern error (suppressed):', err?.message);
    }
  }

  /**
   * Called when the bot's own actions (banning, kicking) are observed in the event stream.
   * These should be labeled as 'benign' so the model doesn't learn bot actions as attacks.
   */
  public static async markBotActionAsBenign(
    guildId: string,
    botId: string,
    lookbackMs = 5_000
  ): Promise<void> {
    try {
      const sinceTs = Date.now() - lookbackMs;
      await BrainStore.labelEventsByActor(
        guildId, botId, sinceTs, 'benign', 1.0,
        `bot_action_${Date.now()}`, 'auto'
      );
    } catch {
      // suppress
    }
  }
}
