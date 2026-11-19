import { PermissionFlagsBits } from 'discord.js';
import { CommandGuard, resolvePermissionFlag } from '../src/core/security/CommandGuard';

describe('CommandGuard', () => {
  describe('isGuarded', () => {
    it('guards dangerous moderation commands', () => {
      expect(CommandGuard.isGuarded('ban', 'moderation')).toBe(true);
      expect(CommandGuard.isGuarded('kick', 'moderation')).toBe(true);
      expect(CommandGuard.isGuarded('timeout', 'moderation')).toBe(true);
      expect(CommandGuard.isGuarded('purge', 'moderation')).toBe(true);
      expect(CommandGuard.isGuarded('lock', 'moderation')).toBe(true);
    });

    it('rejects commands outside guarded modules', () => {
      expect(CommandGuard.isGuarded('ban', 'fun')).toBe(false);
      expect(CommandGuard.isGuarded('clear', 'music')).toBe(false);
      expect(CommandGuard.isGuarded('ping', 'moderation')).toBe(false);
      expect(CommandGuard.isGuarded('', 'moderation')).toBe(false);
    });
  });

  describe('getRequiredPerms', () => {
    it('returns exact permission flags for dangerous commands', () => {
      const banPerms = CommandGuard.getRequiredPerms('ban');
      expect(banPerms).toContain(PermissionFlagsBits.BanMembers);

      const kickPerms = CommandGuard.getRequiredPerms('kick');
      expect(kickPerms).toContain(PermissionFlagsBits.KickMembers);

      const timeoutPerms = CommandGuard.getRequiredPerms('timeout');
      expect(timeoutPerms).toContain(PermissionFlagsBits.ModerateMembers);

      const purgePerms = CommandGuard.getRequiredPerms('purge');
      expect(purgePerms).toContain(PermissionFlagsBits.ManageMessages);
    });

    it('returns empty array for unknown or safe commands', () => {
      expect(CommandGuard.getRequiredPerms('unknown_command')).toEqual([]);
    });
  });

  describe('resolvePermissionFlag', () => {
    it('resolves direct Discord flag names', () => {
      expect(resolvePermissionFlag('BanMembers')).toBe(PermissionFlagsBits.BanMembers);
      expect(resolvePermissionFlag('Administrator')).toBe(PermissionFlagsBits.Administrator);
    });

    it('resolves normalized variations and snake_case', () => {
      expect(resolvePermissionFlag('ban_members')).toBe(PermissionFlagsBits.BanMembers);
      expect(resolvePermissionFlag('kick_members')).toBe(PermissionFlagsBits.KickMembers);
      expect(resolvePermissionFlag('manage_guild')).toBe(PermissionFlagsBits.ManageGuild);
    });

    it('resolves aliases like manageserver and manageemojis', () => {
      expect(resolvePermissionFlag('manageserver')).toBe(PermissionFlagsBits.ManageGuild);
      expect(resolvePermissionFlag('manageemojis')).toBe(PermissionFlagsBits.ManageGuildExpressions);
    });

    it('returns null for nonexistent permission names', () => {
      expect(resolvePermissionFlag('NotARealPermission')).toBeNull();
      expect(resolvePermissionFlag('')).toBeNull();
    });
  });

  describe('targetsFromMessage', () => {
    it('extracts snowflakes from user mentions and raw IDs', () => {
      const mockMsg = {
        mentions: {
          users: new Map([['111111111111111111', { id: '111111111111111111' }]])
        }
      };
      const args = ['222222222222222222', 'someReason'];
      const targets = CommandGuard.targetsFromMessage(mockMsg, args);

      expect(targets).toContain('111111111111111111');
      expect(targets).toContain('222222222222222222');
      expect(targets).not.toContain('someReason');
    });
  });
});

