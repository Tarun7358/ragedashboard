import { describe, it, expect, beforeEach } from '@jest/globals';
import { TrustedActorRateLimiter } from '../src/core/security/TrustedActorRateLimiter.js';
import { TrustedActorAbuseHandler } from '../src/core/security/TrustedActorAbuseHandler.js';
import { isServerRestoring, activeRestorationGuilds } from '../src/modules/security/manifest.js';
import { activeBackupRestorations } from '../src/modules/backups/manifest.js';

describe('Backup Load Verification & Circuit Breaker Immunity', () => {
  const guildId = 'backup_test_guild_123456789';

  beforeEach(() => {
    TrustedActorRateLimiter.clear(guildId, 'test_executor');
    TrustedActorRateLimiter.clearAggregateThreat(guildId);
    activeRestorationGuilds.delete(guildId);
    activeBackupRestorations.delete(guildId);
    TrustedActorRateLimiter.setRestoring(guildId, false);
  });

  it('1. Before backup load starts, normal anti-nuke velocity tracking is active', () => {
    expect(isServerRestoring(guildId)).toBe(false);
    expect(TrustedActorRateLimiter.isRestoring(guildId)).toBe(false);

    const t1 = TrustedActorRateLimiter.recordAggregateThreat(guildId, 'channelDelete', '#general', 1.0, 5);
    expect(t1.score).toBe(1.0);
    expect(t1.events.length).toBe(1);
  });

  it('2. When backup load commences, locks are activated and isServerRestoring returns true', () => {
    activeBackupRestorations.add(guildId);
    TrustedActorRateLimiter.setRestoring(guildId, true);
    activeRestorationGuilds.add(guildId);

    expect(isServerRestoring(guildId)).toBe(true);
    expect(TrustedActorRateLimiter.isRestoring(guildId)).toBe(true);
    expect(activeBackupRestorations.has(guildId)).toBe(true);
    expect(activeRestorationGuilds.has(guildId)).toBe(true);
  });

  it('3. During backup load purge (e.g. 50 channels deleted in 1 second), zero threat is recorded and circuit breaker NEVER trips', async () => {
    // Simulate Backup Load active
    activeBackupRestorations.add(guildId);
    TrustedActorRateLimiter.setRestoring(guildId, true);
    activeRestorationGuilds.add(guildId);

    // Simulate 50 channels being purged simultaneously by the bot
    for (let i = 0; i < 50; i++) {
      const threat = TrustedActorRateLimiter.recordAggregateThreat(guildId, 'channelDelete', `#channel-${i}`, 1.0, 5);
      expect(threat.score).toBe(0);
      expect(threat.events.length).toBe(0);
    }

    // Circuit breaker check MUST return false
    expect(TrustedActorRateLimiter.shouldTripCircuitBreaker(guildId, 3.0, 5)).toBe(false);

    // tripCircuitBreaker invocation MUST return empty string and not trip
    const mockGuild: any = {
      id: guildId,
      name: 'Test Server',
      roles: { everyone: { permissions: { has: () => false, remove: () => ({}) } } }
    };
    const incidentId = await TrustedActorAbuseHandler.tripCircuitBreaker(mockGuild, []);
    expect(incidentId).toBe('');
    expect(TrustedActorRateLimiter.isCircuitBreakerTripped(guildId)).toBe(false);
  });

  it('4. After backup load completes, locks are released and normal security defense resumes', () => {
    // Release locks
    activeBackupRestorations.delete(guildId);
    TrustedActorRateLimiter.setRestoring(guildId, false);
    activeRestorationGuilds.delete(guildId);

    expect(isServerRestoring(guildId)).toBe(false);
    expect(TrustedActorRateLimiter.isRestoring(guildId)).toBe(false);

    // Now a legitimate nuke breach will be caught
    TrustedActorRateLimiter.recordAggregateThreat(guildId, 'channelDelete', '#c1', 1.0, 5);
    TrustedActorRateLimiter.recordAggregateThreat(guildId, 'channelDelete', '#c2', 1.0, 5);
    const breach = TrustedActorRateLimiter.recordAggregateThreat(guildId, 'channelDelete', '#c3', 1.0, 5);

    expect(breach.score).toBe(3.0);
    expect(TrustedActorRateLimiter.shouldTripCircuitBreaker(guildId, 3.0, 5)).toBe(true);
  });
});
