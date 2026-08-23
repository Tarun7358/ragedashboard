import { Database } from '../core/Database.js';

async function checkBans1508() {
  const TARGET_GUILD = '1508399161798819840';
  console.log(`=======================================================`);
  console.log(`🔍 AUDITING LOGS & BAN EVENTS FOR GUILD: ${TARGET_GUILD}`);
  console.log(`=======================================================\n`);

  await Database.connect();
  const db = Database.getDb();

  if (!db) {
    console.error('❌ Database connection failed');
    process.exit(1);
  }

  // Query recent sync logs for this guild or global logs
  const logs = await db.all<any>(
    `SELECT * FROM sync_logs WHERE guildId = ? OR msg LIKE '%1508%' OR msg LIKE '%ban%' ORDER BY id DESC LIMIT 50`,
    [TARGET_GUILD]
  );

  console.log(`📋 Found ${logs.length} recent security/audit log entries:\n`);

  for (const log of logs) {
    console.log(`[${log.time || log.createdAt}] [${log.type?.toUpperCase() || 'INFO'}] (Guild: ${log.guildId || 'Global'}): ${log.msg}`);
  }

  // Also query moderation cases
  const modCases = await db.all<any>(
    `SELECT * FROM moderation_cases WHERE guildId = ? ORDER BY caseId DESC LIMIT 20`,
    [TARGET_GUILD]
  );

  console.log(`\n⚖️ Moderation Cases (${modCases.length} total):\n`);
  for (const c of modCases) {
    console.log(`Case #${c.caseId}: Target=${c.targetTag} (${c.targetId}) | Mod=${c.moderatorTag} (${c.moderatorId}) | Action=${c.action} | Reason=${c.reason}`);
  }

  process.exit(0);
}

checkBans1508().catch((err) => {
  console.error('❌ Error checking logs:', err);
  process.exit(1);
});
