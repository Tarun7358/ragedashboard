import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ChannelType } from 'discord.js';
import { createBackupData, executeRestoration, activeBackupRestorations } from '../src/modules/backups/manifest.js';
import { TrustedActorRateLimiter } from '../src/core/security/TrustedActorRateLimiter.js';

describe('Backup Create and Load: Exact Order, Permission Overwrites & Cross-Server Restoration', () => {
  const sourceGuildId = 'source_guild_99999999';
  const targetGuildId = 'target_guild_88888888';

  beforeEach(() => {
    activeBackupRestorations.clear();
    TrustedActorRateLimiter.setRestoring(sourceGuildId, false);
    TrustedActorRateLimiter.setRestoring(targetGuildId, false);
  });

  it('1. createBackupData preserves channel order positions and permission overwrites including @everyone', async () => {
    const mockRolesCollection = new Map([
      [sourceGuildId, { id: sourceGuildId, name: '@everyone', permissions: { bitfield: 104324161n } }],
      ['role_admin_1', { id: 'role_admin_1', name: 'Admin', color: 0xff0000, hoist: true, position: 10, permissions: { bitfield: 8n } }],
      ['role_mod_2', { id: 'role_mod_2', name: 'Moderator', color: 0x00ff00, hoist: false, position: 5, permissions: { bitfield: 268435456n } }]
    ]);

    const mockCategory = {
      id: 'cat_staff_10',
      name: 'STAFF ONLY',
      type: ChannelType.GuildCategory,
      position: 0,
      rawPosition: 0,
      parent: null,
      permissionOverwrites: {
        cache: new Map([
          [sourceGuildId, { id: sourceGuildId, type: 0, allow: { bitfield: 0n }, deny: { bitfield: 1024n } }], // Deny ViewChannel to @everyone
          ['role_admin_1', { id: 'role_admin_1', type: 0, allow: { bitfield: 1024n }, deny: { bitfield: 0n } }]
        ])
      }
    };

    const mockStaffChat = {
      id: 'chan_staff_chat',
      name: 'staff-chat',
      type: ChannelType.GuildText,
      position: 0,
      rawPosition: 1,
      parent: mockCategory,
      permissionOverwrites: {
        cache: new Map([
          ['role_admin_1', { id: 'role_admin_1', type: 0, allow: { bitfield: 3072n }, deny: { bitfield: 0n } }]
        ])
      }
    };

    const mockGeneral = {
      id: 'chan_general',
      name: 'general',
      type: ChannelType.GuildText,
      position: 1,
      rawPosition: 2,
      parent: null,
      permissionOverwrites: {
        cache: new Map([
          [sourceGuildId, { id: sourceGuildId, type: 0, allow: { bitfield: 2048n }, deny: { bitfield: 0n } }]
        ])
      }
    };

    const mockSourceGuild: any = {
      id: sourceGuildId,
      name: 'Original Gaming Community',
      verificationLevel: 1,
      defaultMessageNotifications: 0,
      explicitContentFilter: 1,
      roles: {
        cache: mockRolesCollection,
        everyone: mockRolesCollection.get(sourceGuildId),
        fetch: async () => mockRolesCollection
      },
      channels: {
        fetch: async () => new Map([
          [mockCategory.id, mockCategory],
          [mockStaffChat.id, mockStaffChat],
          [mockGeneral.id, mockGeneral]
        ])
      },
      emojis: {
        fetch: async () => new Map()
      },
      members: {
        fetchMe: async () => null,
        cache: new Map()
      }
    };

    const snapshot = await createBackupData(mockSourceGuild, 'AdminTester');

    expect(snapshot.guildId).toBe(sourceGuildId);
    expect(snapshot.data.channels.length).toBe(3);

    // Verify categories and channels stored exact positions
    const savedCategory = snapshot.data.channels.find((c: any) => c.name === 'STAFF ONLY');
    expect(savedCategory).toBeDefined();
    expect(savedCategory.position).toBe(0);
    expect(savedCategory.rawPosition).toBe(0);
    expect(savedCategory.permissionOverwrites.length).toBe(2);

    // Verify @everyone permission overwrite mapping
    const everyoneOv = savedCategory.permissionOverwrites.find((o: any) => o.name === '@everyone');
    expect(everyoneOv).toBeDefined();
    expect(everyoneOv.type).toBe(0);
    expect(everyoneOv.deny).toBe('1024');

    // Verify role overwrite mapping
    const adminOv = savedCategory.permissionOverwrites.find((o: any) => o.name === 'Admin');
    expect(adminOv).toBeDefined();
    expect(adminOv.allow).toBe('1024');

    // Verify child channel has parentName recorded
    const savedChild = snapshot.data.channels.find((c: any) => c.name === 'staff-chat');
    expect(savedChild.parentName).toBe('STAFF ONLY');
    expect(savedChild.position).toBe(0);
  });

  it('2. executeRestoration loads channels into other server with exact order and permission overwrites', async () => {
    // Destination guild setup (different guild ID and different role IDs)
    const targetRoles = new Map<string, any>([
      [targetGuildId, { id: targetGuildId, name: '@everyone', permissions: { bitfield: 0n }, setPermissions: jest.fn<any>().mockResolvedValue({}) }]
    ]);

    const createdRoles: any[] = [];
    const createdChannels: any[] = [];
    const setPositionsCalls: any[] = [];

    const mockTargetGuild: any = {
      id: targetGuildId,
      name: 'Target New Server',
      roles: {
        everyone: targetRoles.get(targetGuildId),
        cache: targetRoles,
        fetch: async () => targetRoles,
        create: jest.fn<any>().mockImplementation(async (opts: any) => {
          const newRole = {
            id: `target_role_${opts.name.toLowerCase()}_${Date.now()}`,
            name: opts.name,
            color: opts.color,
            position: createdRoles.length + 1
          };
          createdRoles.push(newRole);
          targetRoles.set(newRole.id, newRole);
          return newRole;
        })
      },
      channels: {
        fetch: async () => new Map(),
        create: jest.fn<any>().mockImplementation(async (opts: any) => {
          const newChan: any = {
            id: `target_chan_${opts.name}_${Date.now()}`,
            name: opts.name,
            type: opts.type,
            parentId: opts.parent || null,
            position: opts.position ?? 0,
            permissionOverwrites: {
              set: jest.fn<any>().mockResolvedValue({})
            },
            delete: jest.fn<any>().mockResolvedValue({})
          };
          createdChannels.push(newChan);
          return newChan;
        }),
        setPositions: jest.fn<any>().mockImplementation(async (positions: any[]) => {
          setPositionsCalls.push(...positions);
          return mockTargetGuild;
        })
      },
      members: {
        me: { roles: { highest: { position: 100 } } },
        fetchMe: async () => null,
        fetch: async () => new Map(),
        cache: new Map()
      },
      edit: jest.fn<any>().mockResolvedValue({})
    };

    const snapshotToLoad = {
      id: 'BP-TEST-1234',
      guildId: sourceGuildId,
      guildName: 'Source Guild',
      createdByName: 'BackupAdmin',
      channelsCount: 3,
      rolesCount: 1,
      emojisCount: 0,
      data: {
        roles: [
          { name: 'Admin', color: 0xff0000, hoist: true, position: 2, permissions: '8' }
        ],
        channels: [
          // Notice channels are listed in non-sorted order in template to test ordering enforcement
          {
            name: 'general',
            type: ChannelType.GuildText,
            position: 1,
            parentName: null,
            permissionOverwrites: [
              { name: '@everyone', type: 0, allow: '2048', deny: '0' }
            ]
          },
          {
            name: 'STAFF ONLY',
            type: ChannelType.GuildCategory,
            position: 0,
            parentName: null,
            permissionOverwrites: [
              { name: '@everyone', type: 0, allow: '0', deny: '1024' },
              { name: 'Admin', type: 0, allow: '1024', deny: '0' }
            ]
          },
          {
            name: 'staff-chat',
            type: ChannelType.GuildText,
            position: 0,
            parentName: 'STAFF ONLY',
            permissionOverwrites: [
              { name: 'Admin', type: 0, allow: '3072', deny: '0' }
            ]
          }
        ],
        emojis: [],
        settings: { verificationLevel: 1 }
      }
    };

    const context = {
      logSyncEvent: jest.fn()
    };

    await executeRestoration(mockTargetGuild, snapshotToLoad, { roles: true, channels: true, settings: true, expressions: false }, context);

    // 1. Verify Category & Channels were created
    const createdCat = createdChannels.find(c => c.name === 'STAFF ONLY');
    const createdStaffChat = createdChannels.find(c => c.name === 'staff-chat');
    const createdGeneral = createdChannels.find(c => c.name === 'general');

    expect(createdCat).toBeDefined();
    expect(createdStaffChat).toBeDefined();
    expect(createdGeneral).toBeDefined();

    // 2. Verify staff-chat was assigned the created category parent
    expect(createdStaffChat.parentId).toBe(createdCat.id);

    // 3. Verify Category permission overwrites were synchronized
    expect(createdCat.permissionOverwrites.set).toHaveBeenCalledTimes(1);
    const catOverwritesArg = (createdCat.permissionOverwrites.set as jest.Mock).mock.calls[0][0] as any[];
    expect(catOverwritesArg.length).toBe(2);

    // Verify @everyone mapped to the target guild's everyone ID
    const catEveryoneOv = catOverwritesArg.find((o: any) => o.id === targetGuildId);
    expect(catEveryoneOv).toBeDefined();
    expect(catEveryoneOv.deny).toBe(1024n);

    // Verify Admin role mapped to the newly created Admin role on the target guild
    const createdAdminRole = createdRoles.find(r => r.name === 'Admin');
    expect(createdAdminRole).toBeDefined();
    const catAdminOv = catOverwritesArg.find((o: any) => o.id === createdAdminRole.id);
    expect(catAdminOv).toBeDefined();
    expect(catAdminOv.allow).toBe(1024n);

    // 4. Verify channel permission overwrites were synchronized
    expect(createdStaffChat.permissionOverwrites.set).toHaveBeenCalledTimes(1);
    const staffChatOverwritesArg = (createdStaffChat.permissionOverwrites.set as jest.Mock).mock.calls[0][0] as any[];
    const staffChatAdminOv = staffChatOverwritesArg.find((o: any) => o.id === createdAdminRole.id);
    expect(staffChatAdminOv).toBeDefined();
    expect(staffChatAdminOv.allow).toBe(3072n);

    // 5. Verify exact positions were enforced via setPositions
    expect(mockTargetGuild.channels.setPositions).toHaveBeenCalled();
    expect(setPositionsCalls.length).toBe(3);

    const catPos = setPositionsCalls.find(p => p.channel === createdCat.id);
    expect(catPos).toBeDefined();
    expect(catPos.position).toBe(0);

    const staffChatPos = setPositionsCalls.find(p => p.channel === createdStaffChat.id);
    expect(staffChatPos).toBeDefined();
    expect(staffChatPos.position).toBe(0);
    expect(staffChatPos.parent).toBe(createdCat.id);

    const generalPos = setPositionsCalls.find(p => p.channel === createdGeneral.id);
    expect(generalPos).toBeDefined();
    expect(generalPos.position).toBe(1);
  });
});
