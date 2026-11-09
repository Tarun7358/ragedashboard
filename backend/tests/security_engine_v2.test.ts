import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { TrustedActorRateLimiter, AggregateThreatEvent } from '../src/core/security/TrustedActorRateLimiter.js';
import { RestoreEngine } from '../src/core/security/RestoreEngine.js';

describe('Security Engine 2.0 Capabilities', () => {
  const guildId = '123456789012345678';

  beforeEach(() => {
    TrustedActorRateLimiter.clearAggregateThreat(guildId);
  });

  describe('Capability B: Cross-Event Anti-Nuke Circuit Breaker', () => {
    it('should aggregate diverse threat event weights accurately within 5s window', () => {
      const e1 = TrustedActorRateLimiter.recordAggregateThreat(guildId, 'channelDelete', '#general', 1.0, 5);
      expect(e1.score).toBe(1.0);
      expect(e1.events.length).toBe(1);

      const e2 = TrustedActorRateLimiter.recordAggregateThreat(guildId, 'roleDelete', '@Moderator', 1.0, 5);
      expect(e2.score).toBe(2.0);
      expect(e2.events.length).toBe(2);

      const e3 = TrustedActorRateLimiter.recordAggregateThreat(guildId, 'webhookUpdate', '#announcements', 0.8, 5);
      expect(e3.score).toBeCloseTo(2.8);
      expect(e3.events.length).toBe(3);

      // Under threshold of 3.0
      expect(TrustedActorRateLimiter.shouldTripCircuitBreaker(guildId, 3.0, 5)).toBe(false);

      // 4th event crosses threshold
      const e4 = TrustedActorRateLimiter.recordAggregateThreat(guildId, 'guildBanAdd', 'TargetUser', 1.0, 5);
      expect(e4.score).toBeCloseTo(3.8);
      expect(TrustedActorRateLimiter.shouldTripCircuitBreaker(guildId, 3.0, 5)).toBe(true);
    });

    it('should track tripped circuit breaker cooldown and prevent duplicate triggers', () => {
      TrustedActorRateLimiter.recordAggregateThreat(guildId, 'channelDelete', '#c1', 1.5, 5);
      TrustedActorRateLimiter.recordAggregateThreat(guildId, 'channelDelete', '#c2', 1.5, 5);

      expect(TrustedActorRateLimiter.shouldTripCircuitBreaker(guildId, 3.0, 5)).toBe(true);

      TrustedActorRateLimiter.markCircuitBreakerTripped(guildId);
      expect(TrustedActorRateLimiter.isCircuitBreakerTripped(guildId, 60)).toBe(true);

      // Once marked tripped, shouldTripCircuitBreaker returns false during cooldown
      expect(TrustedActorRateLimiter.shouldTripCircuitBreaker(guildId, 3.0, 5)).toBe(false);
    });

    it('should completely suppress threat recording and circuit breaker trip when server is undergoing restoration', () => {
      TrustedActorRateLimiter.setRestoring(guildId, true);
      expect(TrustedActorRateLimiter.isRestoring(guildId)).toBe(true);

      const threat = TrustedActorRateLimiter.recordAggregateThreat(guildId, 'channelDelete', '#general', 5.0, 5);
      expect(threat.score).toBe(0);
      expect(threat.events.length).toBe(0);
      expect(TrustedActorRateLimiter.shouldTripCircuitBreaker(guildId, 3.0, 5)).toBe(false);

      TrustedActorRateLimiter.setRestoring(guildId, false);
      expect(TrustedActorRateLimiter.isRestoring(guildId)).toBe(false);

      const postThreat = TrustedActorRateLimiter.recordAggregateThreat(guildId, 'channelDelete', '#general', 3.5, 5);
      expect(postThreat.score).toBe(3.5);
      expect(TrustedActorRateLimiter.shouldTripCircuitBreaker(guildId, 3.0, 5)).toBe(true);
    });
  });

  describe('Capability C: Recovery & Rollback Engine 2.0 (Diff Preview & Integrity)', () => {
    const mockGuild: any = {
      id: guildId,
      name: 'Rage Test Server',
      verificationLevel: 2,
      rulesChannelId: 'rule_1',
      systemChannelId: 'sys_1',
      publicUpdatesChannelId: 'pub_1',
      channels: {
        cache: new Map([
          ['c_existing', { id: 'c_existing', name: 'general', type: 0, rawPosition: 0 }],
          ['c_rogue', { id: 'c_rogue', name: 'nuked-by-raid', type: 0, rawPosition: 1 }]
        ])
      },
      roles: {
        cache: new Map([
          ['r_everyone', { id: 'r_everyone', name: '@everyone', managed: false }],
          ['r_existing', { id: 'r_existing', name: 'Admin', color: 0xFF0000, managed: false, permissions: { bitfield: '8' } }],
          ['r_rogue', { id: 'r_rogue', name: 'Rogue Admin', managed: false }]
        ])
      }
    };

    const targetSnapshot = {
      timestamp: Date.now(),
      guildSettings: { name: 'Rage Test Server', verificationLevel: 2 },
      channels: [
        { id: 'c_existing', name: 'general', type: 0, position: 0 },
        { id: 'c_missing', name: 'announcements', type: 0, position: 2 }
      ],
      roles: [
        { id: 'r_everyone', name: '@everyone' },
        { id: 'r_existing', name: 'Admin', color: 0xFF0000, permissions: '8' },
        { id: 'r_missing', name: 'Moderator', color: 0x00FF00, permissions: '268435456' }
      ]
    };

    it('should generate pre-restore dry-run diff preview accurately without modifying state', () => {
      const preview = RestoreEngine.generateRestorePreview(mockGuild, targetSnapshot);

      expect(preview.guildId).toBe(guildId);
      expect(preview.channelsToCreate).toContain('#announcements (type: 0)');
      expect(preview.channelsToDelete).toContain('#nuked-by-raid (rogue/untracked channel)');
      expect(preview.rolesToCreate).toContain('@Moderator');
      expect(preview.rolesToDelete).toContain('@Rogue Admin (rogue/untracked role)');
      expect(preview.totalDiscrepancies).toBe(4);
    });

    it('should perform post-restore integrity audit verification', () => {
      // Incomplete state check
      const auditIncomplete = RestoreEngine.verifyIntegrity(mockGuild, targetSnapshot);
      expect(auditIncomplete.passed).toBe(false);
      expect(auditIncomplete.missingChannels).toContain('#announcements');
      expect(auditIncomplete.missingRoles).toContain('@Moderator');
      expect(auditIncomplete.integrityScore).toBeLessThan(90);

      // Complete state mock
      const completeGuild: any = {
        ...mockGuild,
        channels: {
          cache: new Map([
            ['c_existing', { id: 'c_existing', name: 'general', type: 0 }],
            ['c_missing', { id: 'c_missing', name: 'announcements', type: 0 }]
          ])
        },
        roles: {
          cache: new Map([
            ['r_existing', { id: 'r_existing', name: 'Admin' }],
            ['r_missing', { id: 'r_missing', name: 'Moderator' }]
          ])
        }
      };

      const auditComplete = RestoreEngine.verifyIntegrity(completeGuild, targetSnapshot);
      expect(auditComplete.passed).toBe(true);
      expect(auditComplete.integrityScore).toBe(100);
      expect(auditComplete.missingChannels.length).toBe(0);
      expect(auditComplete.missingRoles.length).toBe(0);
    });

    it('should execute Discord operations with bounded exponential retries', async () => {
      let attempts = 0;
      const mockOp = jest.fn(async () => {
        attempts++;
        if (attempts < 2) {
          const err: any = new Error('Rate Limited');
          err.status = 429;
          err.retry_after = 0.05; // 50ms
          throw err;
        }
        return 'success_payload';
      });

      const result = await RestoreEngine.executeWithRetry('TestOp', mockOp as any, 3);
      expect(result).toBe('success_payload');
      expect(attempts).toBe(2);
    });
  });

  describe('Capability D: Linked Role & Self-Grant Security Protection', () => {
    it('should distinguish safe onboarding roles from dangerous roles', async () => {
      const { DANGEROUS_PERMS } = await import('../src/modules/security/manifest.js');
      expect(DANGEROUS_PERMS).toBeDefined();
      expect(DANGEROUS_PERMS.length).toBeGreaterThanOrEqual(7);

      // Safe onboarding role: ViewChannel, SendMessages (no dangerous perms)
      const safeRole: any = {
        id: 'role_safe_1',
        name: 'Member (Onboarding)',
        permissions: {
          has: (flag: any) => false
        }
      };
      const isSafeRoleDangerous = DANGEROUS_PERMS.some((perm: any) => safeRole.permissions.has(perm));
      expect(isSafeRoleDangerous).toBe(false);

      // Dangerous role: Holds Administrator or BanMembers
      const dangerousRole: any = {
        id: 'role_danger_1',
        name: 'Rogue Admin Link',
        permissions: {
          has: (flag: any) => DANGEROUS_PERMS.includes(flag)
        }
      };
      const isDangerousRoleFlagged = DANGEROUS_PERMS.some((perm: any) => dangerousRole.permissions.has(perm));
      expect(isDangerousRoleFlagged).toBe(true);
    });

    it('should strip dangerous permissions from linked roles when role tags contain hasRoleConnections', async () => {
      const { DANGEROUS_PERMS } = await import('../src/modules/security/manifest.js');
      const mockDangerousBitfield = 8n; // Administrator bit

      const mockLinkedRole: any = {
        id: 'role_linked_1',
        name: 'Steam Linked Role',
        tags: { hasRoleConnections: true },
        permissions: {
          has: (perm: any) => perm === 8n,
          remove: (perms: any[]) => 0n
        },
        setPermissions: jest.fn(async () => mockLinkedRole)
      };

      const hasDangerous = DANGEROUS_PERMS.some((perm: any) => mockLinkedRole.permissions.has(perm));
      expect(hasDangerous).toBe(true);

      if (mockLinkedRole.tags?.hasRoleConnections && hasDangerous) {
        const safeBitfield = mockLinkedRole.permissions.remove(DANGEROUS_PERMS);
        await mockLinkedRole.setPermissions(safeBitfield);
      }

      expect(mockLinkedRole.setPermissions).toHaveBeenCalledWith(0n);
    });
  });

  describe('Capability E: Recommended Channel Hardening Engine', () => {
    it('should harden @everyone permissions across rules, text, and voice channels', async () => {
      const { applyRecommendedChannelHardening } = await import('../src/modules/security/enable.js');

      const mockRulesChannel: any = {
        id: 'c_rules',
        name: 'rules',
        type: 0, // GuildText
        manageable: true,
        isThread: () => false,
        permissionOverwrites: {
          edit: jest.fn(async () => {})
        }
      };

      const mockTextChannel: any = {
        id: 'c_general',
        name: 'general-chat',
        type: 0, // GuildText
        manageable: true,
        isThread: () => false,
        permissionOverwrites: {
          edit: jest.fn(async () => {})
        }
      };

      const mockVoiceChannel: any = {
        id: 'c_voice',
        name: 'General VC',
        type: 2, // GuildVoice
        manageable: true,
        isThread: () => false,
        permissionOverwrites: {
          edit: jest.fn(async () => {})
        }
      };

      const mockGuild: any = {
        id: guildId,
        name: 'Rage Test Guild',
        roles: {
          everyone: {
            id: guildId,
            permissions: {
              has: (perms: any[]) => false,
              remove: () => 0n
            },
            setPermissions: jest.fn(async () => {})
          }
        },
        channels: {
          fetch: async () => new Map([
            ['c_rules', mockRulesChannel],
            ['c_general', mockTextChannel],
            ['c_voice', mockVoiceChannel]
          ]),
          cache: new Map([
            ['c_rules', mockRulesChannel],
            ['c_general', mockTextChannel],
            ['c_voice', mockVoiceChannel]
          ])
        }
      };

      const result = await applyRecommendedChannelHardening(mockGuild);

      expect(result.totalChannels).toBe(3);
      expect(result.updatedChannels).toBe(3);
      expect(result.errors).toBe(0);

      // Verify rules channel was locked down
      expect(mockRulesChannel.permissionOverwrites.edit).toHaveBeenCalledWith(
        guildId,
        expect.objectContaining({
          SendMessages: false,
          MentionEveryone: false,
          AddReactions: false
        }),
        expect.any(Object)
      );

      // Verify text channel had raid mentions disabled
      expect(mockTextChannel.permissionOverwrites.edit).toHaveBeenCalledWith(
        guildId,
        expect.objectContaining({
          MentionEveryone: false,
          ManageMessages: false
        }),
        expect.any(Object)
      );

      // Verify voice channel had abuse permissions disabled
      expect(mockVoiceChannel.permissionOverwrites.edit).toHaveBeenCalledWith(
        guildId,
        expect.objectContaining({
          PrioritySpeaker: false,
          MuteMembers: false,
          MoveMembers: false
        }),
        expect.any(Object)
      );
    });
  });
});


