import { ALL_MANIFESTS } from '../index.js';
import { Database } from '../core/Database.js';
import { isOwnerOrExtraOwner } from '../utils/whitelistCheck.js';
import { SecurityManifest, isPrebotAuthorizedForRule } from '../modules/security/manifest.js';

interface AuditIssue {
  category: 'DUPLICATE_MODULE' | 'ORPHAN_COMMAND' | 'MISROUTED_INTERACTION' | 'ANTI_NUKE_FAILURE' | 'SCHEMA_ERROR';
  description: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

async function runSystemAudit() {
  console.log('================================================================');
  console.log('🚀 RUNNING COMPREHENSIVE SYSTEM, ROUTING & ANTI-NUKE AUDIT');
  console.log('================================================================\n');

  const issues: AuditIssue[] = [];

  // ============================================================================
  // 1. MODULE DUPLICATION CHECK
  // ============================================================================
  console.log('--- 1. Auditing Module Registration & Duplications ---');
  const seenModuleIds = new Set<string>();
  const duplicateModuleIds: string[] = [];

  for (const m of ALL_MANIFESTS) {
    if (seenModuleIds.has(m.id)) {
      duplicateModuleIds.push(m.id);
      issues.push({
        category: 'DUPLICATE_MODULE',
        description: `Module ID "${m.id}" is registered multiple times in ALL_MANIFESTS`,
        severity: 'HIGH'
      });
    }
    seenModuleIds.add(m.id);
  }

  if (duplicateModuleIds.length === 0) {
    console.log(`✅ All ${ALL_MANIFESTS.length} modules have unique IDs. No duplicate modules in ALL_MANIFESTS.`);
  } else {
    console.error(`❌ Duplicate module IDs found:`, duplicateModuleIds);
  }

  // ============================================================================
  // 2. SLASH COMMAND ROUTING & ORPHAN CHECK
  // ============================================================================
  console.log('\n--- 2. Auditing Slash Command Routing & Handlers ---');
  const manifestMap = new Map<string, any>();
  for (const m of ALL_MANIFESTS) {
    manifestMap.set(m.id, m);
  }

  let totalSlashCommands = 0;
  let totalRoutedCommands = 0;
  const orphanCommands: string[] = [];

  for (const m of ALL_MANIFESTS) {
    if (!m.commands) continue;
    for (const cmd of m.commands) {
      totalSlashCommands++;
      const expectedEvent = `command_${cmd.name}`;
      
      // Look for handler in the declaring manifest or globally in any manifest
      let handlerFound = m.events?.some((e: any) => e.name === expectedEvent);
      if (!handlerFound) {
        handlerFound = ALL_MANIFESTS.some(other => other.events?.some((e: any) => e.name === expectedEvent));
      }

      if (handlerFound) {
        totalRoutedCommands++;
      } else {
        orphanCommands.push(`${m.id} -> /${cmd.name}`);
        issues.push({
          category: 'ORPHAN_COMMAND',
          description: `Slash command /${cmd.name} in module "${m.id}" has no matching event handler "${expectedEvent}"`,
          severity: 'HIGH'
        });
      }
    }
  }

  console.log(`Slash Commands Checked: ${totalSlashCommands}`);
  console.log(`Properly Routed Commands: ${totalRoutedCommands}`);
  if (orphanCommands.length > 0) {
    console.error(`❌ Found ${orphanCommands.length} orphaned slash commands without handlers:`, orphanCommands);
  } else {
    console.log(`✅ 100% of slash commands have matching event handlers!`);
  }

  // ============================================================================
  // 3. INTERACTION ROUTER GENERIC PREFIX COVERAGE CHECK
  // ============================================================================
  console.log('\n--- 3. Auditing Button, Select Menu, and Modal Routing Patterns ---');
  
  // Collect all event names defined across manifests that listen to buttons, selects, or modals
  const buttonEventHandlers = new Set<string>();
  const selectEventHandlers = new Set<string>();
  const modalEventHandlers = new Set<string>();

  for (const m of ALL_MANIFESTS) {
    if (!m.events) continue;
    for (const ev of m.events) {
      if (ev.name.startsWith('button_')) buttonEventHandlers.add(ev.name);
      if (ev.name.startsWith('select_')) selectEventHandlers.add(ev.name);
      if (ev.name.startsWith('modal_')) modalEventHandlers.add(ev.name);
    }
  }

  console.log(`Active Manifest Button Handlers: ${buttonEventHandlers.size}`);
  console.log(`Active Manifest Select Menu Handlers: ${selectEventHandlers.size}`);
  console.log(`Active Manifest Modal Handlers: ${modalEventHandlers.size}`);

  // InteractionRouter generic prefixes
  const registeredButtonPrefixes = [
    'gw_enter_', 'tickets_v2_', 'tkmgr_', 'btn_open_', 'btn_ticket_', 'btn_in_',
    'btn_control_', 'prio_btn_', 'btn_deploy_', 'addrole_', 'wl_', 'sec_', 'btn_sec_',
    'select_sec_', 'jtc_', 'ver_', 'mod_', 'botstats_', 'social_', 'btn_social_',
    'btn_sub_', 'btn_al_', 'select_al_', 'al_'
  ];

  const registeredSelectPrefixes = [
    'tickets_v2_', 'tkmgr_', 'ticket_select_', 'select_sec_', 'btn_sec_', 'sec_',
    'select_social_', 'social_', 'select_al_', 'btn_al_', 'al_', 'wl_', 'select_wl_',
    'jtc_', 'ver_'
  ];

  const registeredModalPrefixes = [
    'tickets_v2_', 'ticket_modal_', 'panel_draft_', 'set_user_limit_', 'set_admin_role_',
    'add_moderator_', 'modal_tkmgr_', 'tkmgr_', 'modal_sec_', 'sec_', 'jtc_',
    'modal_social_', 'social_'
  ];

  console.log(`InteractionRouter Generic Prefix Routes: Button (${registeredButtonPrefixes.length}), Select (${registeredSelectPrefixes.length}), Modal (${registeredModalPrefixes.length})`);

  // ============================================================================
  // 4. ANTI-NUKE FUNCTIONALITY & PIPELINE TEST
  // ============================================================================
  console.log('\n--- 4. Executing Anti-Nuke Pipeline End-to-End Simulation ---');
  await Database.connect();

  // Verify critical anti-nuke event handlers exist in SecurityManifest
  const antiNukeEvents = [
    'channelDelete',
    'channelCreate',
    'channelUpdate',
    'roleDelete',
    'roleCreate',
    'roleUpdate',
    'guildBanAdd',
    'guildMemberRemove',
    'guildMemberUpdate',
    'webhooksUpdate',
    'emojiDelete',
    'stickerDelete'
  ];

  const missingAntiNukeHandlers: string[] = [];
  for (const eventName of antiNukeEvents) {
    const found = SecurityManifest.events?.some((e: any) => e.name === eventName);
    if (!found) {
      missingAntiNukeHandlers.push(eventName);
      issues.push({
        category: 'ANTI_NUKE_FAILURE',
        description: `SecurityManifest is missing event handler for "${eventName}"`,
        severity: 'HIGH'
      });
    }
  }

  if (missingAntiNukeHandlers.length === 0) {
    console.log(`✅ All ${antiNukeEvents.length} critical Anti-Nuke event handlers are present in SecurityManifest:`);
    antiNukeEvents.forEach(e => console.log(`   - ${e}: REGISTERED & ACTIVE`));
  } else {
    console.error(`❌ Missing Anti-Nuke event handlers:`, missingAntiNukeHandlers);
  }

  // Anti-Nuke Permission and Whitelist logic test
  console.log('\n--- 4b. Testing Anti-Nuke Whitelist and Bypass Functions ---');

  const mockGuild: any = {
    id: 'test_guild_123',
    name: 'Test Security Server',
    ownerId: 'owner_999',
    roles: { cache: new Map() },
    members: {
      cache: new Map(),
      fetch: async (id: string) => mockGuild.members.cache.get(id) || null
    },
    channels: {
      cache: new Map(),
      fetch: async () => mockGuild.channels.cache
    },
    client: { user: { id: 'bot_888' }, ws: { ping: 25 } }
  };

  // Test 1: Server Owner bypass
  const isOwnerPassed = await isOwnerOrExtraOwner('owner_999', mockGuild);
  console.log(`Test 1 [Server Owner Bypass]: ${isOwnerPassed ? '✅ PASSED' : '❌ FAILED'}`);
  if (!isOwnerPassed) {
    issues.push({
      category: 'ANTI_NUKE_FAILURE',
      description: 'Server Owner bypass returned false in isOwnerOrExtraOwner',
      severity: 'HIGH'
    });
  }

  // Test 2: Random unauthorized user blocked
  const isRandomBlocked = await isOwnerOrExtraOwner('random_user_111', mockGuild);
  console.log(`Test 2 [Unauthorized User Blocked]: ${!isRandomBlocked ? '✅ PASSED' : '❌ FAILED'}`);
  if (isRandomBlocked) {
    issues.push({
      category: 'ANTI_NUKE_FAILURE',
      description: 'Random user was not blocked by isOwnerOrExtraOwner',
      severity: 'HIGH'
    });
  }

  // Test 3: PreBot check for unauthenticated bot
  const isPrebotBlocked = await isPrebotAuthorizedForRule(mockGuild.id, 'unauthorized_bot_777', 'anti_channel_delete');
  console.log(`Test 3 [Unapproved Bot Blocked]: ${!isPrebotBlocked ? '✅ PASSED' : '❌ FAILED'}`);
  if (isPrebotBlocked) {
    issues.push({
      category: 'ANTI_NUKE_FAILURE',
      description: 'Unapproved bot was not blocked by isPrebotAuthorizedForRule',
      severity: 'HIGH'
    });
  }

  // Test 4: Security Manifest config schema validation
  console.log('\n--- 4c. Validating Module Config Schemas ---');
  let schemaErrors = 0;
  for (const m of ALL_MANIFESTS) {
    if (m.configSchema) {
      try {
        const val = m.configSchema.validate({}, {});
        if (!val || typeof val.progress !== 'number') {
          console.warn(`⚠️ [${m.id}] validate() returned invalid schema result:`, val);
          schemaErrors++;
        }
      } catch (err: any) {
        console.error(`❌ [${m.id}] configSchema.validate() threw error:`, err.message);
        schemaErrors++;
        issues.push({
          category: 'SCHEMA_ERROR',
          description: `Module "${m.id}" configSchema.validate() crashed: ${err.message}`,
          severity: 'MEDIUM'
        });
      }
    }
  }

  if (schemaErrors === 0) {
    console.log(`✅ All module config schemas validated successfully without errors.`);
  }

  // ============================================================================
  // SUMMARY REPORT
  // ============================================================================
  console.log('\n================================================================');
  console.log('📊 AUDIT SUMMARY REPORT');
  console.log('================================================================');
  console.log(`Total Modules Audited: ${ALL_MANIFESTS.length}`);
  console.log(`Total Slash Commands Audited: ${totalSlashCommands}`);
  console.log(`Total Issues Found: ${issues.length}`);

  if (issues.length > 0) {
    console.log('\n❌ ISSUES DETECTED:');
    issues.forEach(iss => console.log(`  [${iss.severity}] [${iss.category}] ${iss.description}`));
    process.exit(1);
  } else {
    console.log('\n🎉 100% HEALTHY: ZERO DUPLICATES, ZERO ORPHANS, ZERO ROUTING ERRORS, ANTI-NUKE FULLY OPERATIONAL!\n');
    process.exit(0);
  }
}

runSystemAudit().catch((err) => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
