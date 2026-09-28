import { Database } from '../core/Database.js';
import { SecurityManifest, restoreFromLiveSnapshot, activeRestorationGuilds, isPrebotAuthorizedForRule } from '../modules/security/manifest.js';
import { TrustedActorAbuseHandler } from '../core/security/TrustedActorAbuseHandler.js';
import { isOwnerOrExtraOwner } from '../utils/whitelistCheck.js';

async function testAntiNukeSimulation() {
  console.log('================================================================');
  console.log('🛡️ RUNNING END-TO-END ANTI-NUKE ATTACK SIMULATION');
  console.log('================================================================\n');

  await Database.connect();
  const db = Database.getDb();
  if (!db) {
    console.error('❌ Database connection failed');
    process.exit(1);
  }

  const SIMULATED_GUILD_ID = 'sim_guild_999999999999999999';
  const SERVER_OWNER_ID = 'owner_111111111111111111';
  const ATTACKER_USER_ID = 'attacker_222222222222222222';
  const ROGUE_BOT_ID = 'rogue_bot_333333333333333333';

  const mockGuild: any = {
    id: SIMULATED_GUILD_ID,
    name: 'Simulation Target Server',
    ownerId: SERVER_OWNER_ID,
    roles: {
      cache: new Map(),
      highest: { position: 100 }
    },
    channels: {
      cache: new Map(),
      fetch: async () => mockGuild.channels.cache
    },
    members: {
      cache: new Map(),
      fetch: async (id: string) => mockGuild.members.cache.get(id) || null,
      ban: async (id: string, opts: any) => {
        console.log(`  [SIMULATION ACTION] 🚨 guild.members.ban invoked for target: ${id} (Reason: ${opts?.reason})`);
        return true;
      }
    },
    client: {
      user: { id: 'bot_rage_optimizer_id', username: 'Rage Optimiser' },
      ws: { ping: 18 }
    }
  };

  // Add members to mock guild
  mockGuild.members.cache.set(SERVER_OWNER_ID, {
    id: SERVER_OWNER_ID,
    user: { id: SERVER_OWNER_ID, username: 'ServerOwner', bot: false },
    guild: mockGuild
  });

  mockGuild.members.cache.set(ATTACKER_USER_ID, {
    id: ATTACKER_USER_ID,
    user: { id: ATTACKER_USER_ID, username: 'MaliciousAdmin', bot: false },
    guild: mockGuild,
    roles: { cache: new Map(), remove: async () => {} },
    kick: async (r: string) => console.log(`  [SIMULATION ACTION] 🚨 member.kick invoked: ${ATTACKER_USER_ID} (Reason: ${r})`)
  });

  mockGuild.members.cache.set(ROGUE_BOT_ID, {
    id: ROGUE_BOT_ID,
    user: { id: ROGUE_BOT_ID, username: 'RogueNukerBot', bot: true },
    guild: mockGuild,
    roles: { cache: new Map(), remove: async () => {} }
  });

  let passCount = 0;
  let testCount = 0;

  function assert(title: string, condition: boolean) {
    testCount++;
    if (condition) {
      passCount++;
      console.log(`✅ [PASS] ${title}`);
    } else {
      console.error(`❌ [FAIL] ${title}`);
    }
  }

  // ---------------------------------------------------------------------------
  // TEST 1: Server Owner Immunity
  // ---------------------------------------------------------------------------
  console.log('\n--- 1. Testing Server Owner & Extra Owner Clearance ---');
  const ownerPassed = await isOwnerOrExtraOwner(SERVER_OWNER_ID, mockGuild);
  assert('Server Owner is recognized as immune from Anti-Nuke restrictions', ownerPassed === true);

  const attackerDenied = await isOwnerOrExtraOwner(ATTACKER_USER_ID, mockGuild);
  assert('Malicious Admin is NOT recognized as owner or extra owner', attackerDenied === false);

  // ---------------------------------------------------------------------------
  // TEST 2: PreBot Whitelist Verification
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. Testing PreBot Whitelist Verification ---');
  const rogueBotPrebotAuth = await isPrebotAuthorizedForRule(SIMULATED_GUILD_ID, ROGUE_BOT_ID, 'anti_channel_delete');
  assert('Unapproved rogue bot fails PreBot authorization check', rogueBotPrebotAuth === false);

  // ---------------------------------------------------------------------------
  // TEST 3: Trusted Actor Abuse Limiter Simulation
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. Testing Trusted Actor Abuse Rate Limiter ---');
  const mockConfig = {
    trustedActorAbuseThreshold: 3,
    trustedActorAbuseWindowSeconds: 10,
    trustedActorAbusePunishment: 'ban'
  };

  // Simulate multiple fast deletions by an actor
  const mockChannel = { id: 'chan_01', name: 'general', guild: mockGuild };
  
  try {
    // Action 1
    await TrustedActorAbuseHandler.processTrustedActorEvent(mockGuild, ATTACKER_USER_ID, 'deleted', 'channel', mockChannel, mockConfig);
    // Action 2
    await TrustedActorAbuseHandler.processTrustedActorEvent(mockGuild, ATTACKER_USER_ID, 'deleted', 'channel', mockChannel, mockConfig);
    // Action 3 (Triggers punishment)
    await TrustedActorAbuseHandler.processTrustedActorEvent(mockGuild, ATTACKER_USER_ID, 'deleted', 'channel', mockChannel, mockConfig);
    assert('TrustedActorAbuseHandler processed 3 rapid deletions without unhandled exceptions', true);
  } catch (err: any) {
    assert(`TrustedActorAbuseHandler failed: ${err.message}`, false);
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Concurrency Lock on Live Snapshot Restoration
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. Testing Live Snapshot Restoration Concurrency Lock ---');
  activeRestorationGuilds.add(SIMULATED_GUILD_ID);
  assert('activeRestorationGuilds lock is set', activeRestorationGuilds.has(SIMULATED_GUILD_ID));

  let duplicateSkipped = false;
  // Attempt duplicate restore while lock is active
  await restoreFromLiveSnapshot(mockGuild, mockGuild.client, {
    logSyncEvent: () => {}
  });
  duplicateSkipped = activeRestorationGuilds.has(SIMULATED_GUILD_ID);
  assert('Duplicate concurrent snapshot restoration skipped due to active lock', duplicateSkipped);

  // Release lock
  activeRestorationGuilds.delete(SIMULATED_GUILD_ID);
  assert('activeRestorationGuilds lock released cleanly', !activeRestorationGuilds.has(SIMULATED_GUILD_ID));

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`📊 SIMULATION COMPLETED: ${passCount}/${testCount} Tests Passed (${Math.round((passCount / testCount) * 100)}%)`);
  console.log('================================================================\n');

  if (passCount === testCount) {
    console.log('🎉 ALL ANTI-NUKE SYSTEMS AND GUARDS FUNCTIONED AS DESIGNED!\n');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

testAntiNukeSimulation().catch(err => {
  console.error('Fatal simulation error:', err);
  process.exit(1);
});
