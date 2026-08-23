import { PermissionFlagsBits } from 'discord.js';
import { BACKUP_ROLE_NAMES, repairRageBotAdminPermissions } from '../src/modules/security/enable.js';
import { Database } from '../src/core/Database.js';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 VERIFYING ROLE PERMISSION HEALING & AUDIT LOGS DB');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  // ── TEST 1: Verify BACKUP_ROLE_NAMES count and names ──
  console.log('Test 1: Verifying 3 standard security roles configuration...');
  if (BACKUP_ROLE_NAMES.length === 3 &&
      BACKUP_ROLE_NAMES.includes('. Secured') &&
      BACKUP_ROLE_NAMES.includes('. UnBypassable') &&
      BACKUP_ROLE_NAMES.includes('. RageUnBypassable')) {
    console.log('  ✅ Exactly 3 security roles defined: . Secured, . UnBypassable, . RageUnBypassable');
    passed++;
  } else {
    console.error('  ❌ BACKUP_ROLE_NAMES does not contain exact 3 roles:', BACKUP_ROLE_NAMES);
    failed++;
  }

  // ── TEST 2: Role Permission Healing Test (Ensuring non-backup roles are NEVER modified) ──
  console.log('\nTest 2: Testing repairRageBotAdminPermissions with mock roles...');
  
  let memberRoleModified = false;
  let securedRoleModified = false;
  let unbypassableRoleModified = false;
  let rageUnbypassableRoleModified = false;

  const mockRoles = new Map<string, any>([
    ['role_member', {
      id: 'role_member',
      name: 'Member',
      permissions: {
        bitfield: 0n,
        has: (flag: bigint) => (0n & flag) === flag
      },
      setPermissions: async (bitfield: bigint, reason: string) => {
        memberRoleModified = true;
        console.error(`  🚨 CRITICAL ERROR: Non-backup role "Member" was modified! Reason: ${reason}`);
      }
    }],
    ['role_verified', {
      id: 'role_verified',
      name: 'Verified Joiner',
      permissions: {
        bitfield: 0n,
        has: (flag: bigint) => (0n & flag) === flag
      },
      setPermissions: async (bitfield: bigint, reason: string) => {
        memberRoleModified = true;
        console.error(`  🚨 CRITICAL ERROR: Non-backup role "Verified Joiner" was modified! Reason: ${reason}`);
      }
    }],
    ['role_sec', {
      id: 'role_sec',
      name: '. Secured',
      permissions: {
        bitfield: 0n,
        has: (flag: bigint) => false
      },
      setPermissions: async (bitfield: bigint) => {
        securedRoleModified = true;
        return true;
      }
    }],
    ['role_unb', {
      id: 'role_unb',
      name: '. UnBypassable',
      permissions: {
        bitfield: 0n,
        has: (flag: bigint) => false
      },
      setPermissions: async (bitfield: bigint) => {
        unbypassableRoleModified = true;
        return true;
      }
    }],
    ['role_rageunb', {
      id: 'role_rageunb',
      name: '. RageUnBypassable',
      permissions: {
        bitfield: 0n,
        has: (flag: bigint) => false
      },
      setPermissions: async (bitfield: bigint) => {
        rageUnbypassableRoleModified = true;
        return true;
      }
    }]
  ]);

  const mockBotRoles = new Map<string, any>([
    ['role_member', mockRoles.get('role_member')], // Bot has the member auto-role!
    ['role_verified', mockRoles.get('role_verified')],
    ['role_sec', mockRoles.get('role_sec')],
    ['role_unb', mockRoles.get('role_unb')],
    ['role_rageunb', mockRoles.get('role_rageunb')]
  ]);

  const mockGuild = {
    id: 'test_guild_123',
    name: 'Test Guild',
    roles: {
      cache: mockRoles,
      create: async () => null
    },
    members: {
      me: {
        id: 'bot_id',
        permissions: { has: (p: any) => true },
        roles: {
          cache: mockBotRoles,
          highest: { position: 50 },
          add: async () => {}
        }
      }
    }
  };

  const repairResult = await repairRageBotAdminPermissions(mockGuild);

  if (!memberRoleModified && securedRoleModified && unbypassableRoleModified && rageUnbypassableRoleModified) {
    console.log('  ✅ SUCCESS: Default member/joiner roles were NOT modified!');
    console.log(`  ✅ Successfully repaired only the 3 backup roles: ${repairResult.repairedRoles.join(', ')}`);
    passed++;
  } else {
    console.error('  ❌ Role test failed! memberRoleModified:', memberRoleModified);
    failed++;
  }

  // ── TEST 3: Database Server Audit Logs ──
  console.log('\nTest 3: Testing SQLite server_audit_logs space...');
  try {
    await Database.connect();
    const testGuildId = 'test_guild_audit_999';

    // Insert sample audit log
    await Database.saveAuditLog({
      guildId: testGuildId,
      action: 'ROLE_PROTECTION',
      targetId: 'role_sec',
      targetName: '. Secured',
      executorId: 'attacker_123',
      executorTag: 'MaliciousUser#0001',
      reason: 'Anti-Nuke Self-Defense',
      details: { permission: 'Administrator', restored: true },
      type: 'warn',
      timestamp: Date.now()
    });

    await Database.saveAuditLog({
      guildId: testGuildId,
      action: 'WHITELIST_ADD',
      targetId: 'user_456',
      targetName: 'TrustedAdmin',
      executorId: 'owner_789',
      executorTag: 'ServerOwner#0001',
      reason: 'Added to anti-nuke whitelist',
      type: 'success',
      timestamp: Date.now()
    });

    const logs = await Database.getAuditLogs(testGuildId, { limit: 10 });
    if (logs.total >= 2 && logs.logs.length >= 2) {
      console.log(`  ✅ Successfully saved & retrieved ${logs.total} audit logs from database.`);
      console.log(`  ✅ Latest action: "${logs.logs[0].action}" | Target: "${logs.logs[0].targetName}"`);
      passed++;
    } else {
      console.error('  ❌ Failed to retrieve expected audit logs:', logs);
      failed++;
    }

    // Clean up test data
    const db = Database.getDb();
    if (db) {
      await db.run('DELETE FROM server_audit_logs WHERE guildId = ?', [testGuildId]);
    }
  } catch (err: any) {
    console.error('  ❌ Database audit log test error:', err.message);
    failed++;
  }

  // ── TEST 4: Strict Bot-Only Backup Role Stripping Test ──
  console.log('\nTest 4: Verifying backup roles are stripped from non-bot accounts and NOT given to owner...');
  try {
    let ownerRoleAdded = false;
    let nonBotRoleStripped = false;

    const mockOwnerRoles = new Map<string, any>();
    const mockAttackerRoles = new Map<string, any>([
      ['role_sec', { id: 'role_sec', name: '. Secured' }]
    ]);

    const testMembers = new Map<string, any>([
      ['bot_123', {
        id: 'bot_123',
        roles: { cache: new Map() }
      }],
      ['owner_456', {
        id: 'owner_456',
        user: { tag: 'Owner#0001' },
        roles: {
          cache: mockOwnerRoles,
          add: async () => { ownerRoleAdded = true; }
        }
      }],
      ['attacker_789', {
        id: 'attacker_789',
        user: { tag: 'Attacker#0001' },
        roles: {
          cache: mockAttackerRoles,
          remove: async (roleId: string) => {
            if (roleId === 'role_sec') {
              nonBotRoleStripped = true;
              mockAttackerRoles.delete('role_sec');
            }
          }
        }
      }]
    ]);

    const testGuildObj = {
      id: 'test_guild_strip_123',
      name: 'Test Strip Guild',
      ownerId: 'owner_456',
      roles: {
        cache: new Map<string, any>([
          ['role_sec', { id: 'role_sec', name: '. Secured' }],
          ['role_unb', { id: 'role_unb', name: '. UnBypassable' }],
          ['role_rageunb', { id: 'role_rageunb', name: '. RageUnBypassable' }]
        ])
      },
      members: {
        me: { id: 'bot_123', roles: { cache: new Map(), add: async () => {} } },
        cache: testMembers
      }
    };

    const repairRes = await repairRageBotAdminPermissions(testGuildObj);

    if (!ownerRoleAdded && nonBotRoleStripped && (repairRes.strippedFromNonBots?.length || 0) > 0) {
      console.log('  ✅ SUCCESS: Backup roles are strictly reserved for bot!');
      console.log('  ✅ Owner was NOT assigned any backup roles.');
      console.log(`  ✅ Non-bot member had backup role auto-stripped: ${repairRes.strippedFromNonBots?.join(', ')}`);
      passed++;
    } else {
      console.error('  ❌ Test 4 failed! ownerRoleAdded:', ownerRoleAdded, 'nonBotRoleStripped:', nonBotRoleStripped);
      failed++;
    }
  } catch (err: any) {
    console.error('  ❌ Test 4 error:', err);
    failed++;
  }

  console.log('\n====================================================');
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
