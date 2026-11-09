import { describe, it, expect, beforeAll } from '@jest/globals';
import { NoPrefixManager } from '../src/core/prefix/NoPrefixManager.js';
import { PrefixResolver } from '../src/core/prefix/PrefixResolver.js';
import { PrefixRegistry } from '../src/core/prefix/PrefixRegistry.js';
import { Message, PermissionFlagsBits } from 'discord.js';

describe('No-Prefix System & Permission Engine', () => {
  beforeAll(async () => {
    // Register test commands once
    PrefixRegistry.register({
      name: 'jtc',
      description: 'Join to create controller',
      category: 'Voice',
      usage: 'r!jtc',
      aliases: ['jointocreate'],
      moduleOwnerId: 'join_to_create'
    });
    PrefixRegistry.register({
      name: 'ping',
      description: 'Ping latency',
      category: 'System',
      usage: 'r!ping',
      aliases: [],
      moduleOwnerId: 'core'
    });
  });

  describe('PrefixResolver matching', () => {
    it('matches registered command without prefix as isNoPrefix: true', () => {
      const mockMsg = {
        content: 'jtc setup',
        guild: { id: 'guild123' },
        guildId: 'guild123'
      } as unknown as Message;

      const res = PrefixResolver.resolvePrefix(mockMsg);
      expect(res.matched).toBe(true);
      expect(res.isNoPrefix).toBe(true);
      expect(res.commandString).toBe('jtc setup');
    });

    it('does NOT match normal chat message', () => {
      const mockMsg = {
        content: 'hello everyone how are you today?',
        guild: { id: 'guild123' },
        guildId: 'guild123'
      } as unknown as Message;

      const res = PrefixResolver.resolvePrefix(mockMsg);
      expect(res.matched).toBe(false);
      expect(res.isNoPrefix).toBeUndefined();
    });

    it('preserves standard prefix matching when prefix is present', () => {
      const mockMsg = {
        content: 'r!jtc setup',
        guild: { id: 'guild123' },
        guildId: 'guild123'
      } as unknown as Message;

      const res = PrefixResolver.resolvePrefix(mockMsg);
      expect(res.matched).toBe(true);
      expect(res.isNoPrefix).toBe(false);
      expect(res.commandString).toBe('jtc setup');
    });
  });

  describe('NoPrefixManager permissions', () => {
    it('always allows the Server Owner even if noprefix is disabled', async () => {
      const mockMsg = {
        guild: {
          id: 'guild123',
          ownerId: 'owner999'
        },
        author: {
          id: 'owner999'
        }
      } as unknown as Message;

      await NoPrefixManager.setEnabled('guild123', false);
      const allowed = await NoPrefixManager.isAllowed(mockMsg);
      expect(allowed).toBe(true);
    });

    it('allows administrators when system is enabled', async () => {
      const mockMsg = {
        guild: {
          id: 'guild_admin_test',
          ownerId: 'owner1'
        },
        author: {
          id: 'admin2'
        },
        channelId: 'channel1',
        member: {
          permissions: {
            has: (perm: bigint) => perm === PermissionFlagsBits.Administrator
          },
          roles: {
            cache: new Map()
          }
        }
      } as unknown as Message;

      await NoPrefixManager.setEnabled('guild_admin_test', true);
      const allowed = await NoPrefixManager.isAllowed(mockMsg);
      expect(allowed).toBe(true);
    });

    it('allows any general member inside a whitelisted channel', async () => {
      const mockMsg = {
        guild: {
          id: 'guild_channel_test',
          ownerId: 'owner1'
        },
        author: {
          id: 'snow_user'
        },
        channelId: 'bot_cmd_channel',
        member: {
          permissions: {
            has: () => false
          },
          roles: {
            cache: new Map()
          }
        }
      } as unknown as Message;

      await NoPrefixManager.setEnabled('guild_channel_test', true);
      await NoPrefixManager.toggleChannel('guild_channel_test', 'bot_cmd_channel');

      // Inside whitelisted channel -> allowed!
      const allowedInside = await NoPrefixManager.isAllowed(mockMsg);
      expect(allowedInside).toBe(true);

      // Outside whitelisted channel -> denied!
      const mockMsgOutside = { ...mockMsg, channelId: 'general_chat' } as unknown as Message;
      const allowedOutside = await NoPrefixManager.isAllowed(mockMsgOutside);
      expect(allowedOutside).toBe(false);
    });

    it('denies general members outside whitelisted roles when role restrictions are set', async () => {
      const mockMsg = {
        guild: {
          id: 'guild_general_test',
          ownerId: 'owner1'
        },
        author: {
          id: 'user99'
        },
        channelId: 'channel1',
        member: {
          permissions: {
            has: () => false
          },
          roles: {
            cache: new Map()
          }
        }
      } as unknown as Message;

      await NoPrefixManager.setEnabled('guild_general_test', true);
      await NoPrefixManager.toggleRole('guild_general_test', 'mod_role_123');
      const allowed = await NoPrefixManager.isAllowed(mockMsg);
      expect(allowed).toBe(false);
    });

    it('allows member when explicitly whitelisted by user ID', async () => {
      const mockMsg = {
        guild: {
          id: 'guild_user_wl',
          ownerId: 'owner1'
        },
        author: {
          id: 'vip_user_777'
        },
        channelId: 'channel1',
        member: {
          permissions: {
            has: () => false
          },
          roles: {
            cache: new Map()
          }
        }
      } as unknown as Message;

      await NoPrefixManager.setEnabled('guild_user_wl', true);
      await NoPrefixManager.toggleUser('guild_user_wl', 'vip_user_777');
      const allowed = await NoPrefixManager.isAllowed(mockMsg);
      expect(allowed).toBe(true);
    });

    it('allows general members server-wide when no restrictive roles/channels are configured', async () => {
      const mockMsg = {
        guild: {
          id: 'guild_open_noprefix',
          ownerId: 'owner1'
        },
        author: {
          id: 'general_user_123'
        },
        channelId: 'general_chat',
        member: {
          permissions: {
            has: () => false
          },
          roles: {
            cache: new Map()
          }
        }
      } as unknown as Message;

      await NoPrefixManager.setEnabled('guild_open_noprefix', true);
      const allowed = await NoPrefixManager.isAllowed(mockMsg);
      expect(allowed).toBe(true);
    });
  });
});
