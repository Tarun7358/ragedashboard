import { Database } from '../core/Database.js';

async function armServer1508() {
  const TARGET_GUILD = '1508399161798819840';
  console.log(`=======================================================`);
  console.log(`🛡️ RAGE OPTIMISER V3: DIRECT DATABASE SECURITY ARMING`);
  console.log(`TARGET GUILD ID: ${TARGET_GUILD}`);
  console.log(`=======================================================\n`);

  await Database.connect();
  const db = Database.getDb();

  if (!db) {
    console.error('❌ Database connection failed');
    process.exit(1);
  }

  // Fetch current config for target guild
  let configRow = await db.get<any>('SELECT * FROM guild_configs WHERE guildId = ?', [TARGET_GUILD]);

  let modules: any[] = [];
  let globalSettings = {};

  if (configRow) {
    try { modules = JSON.parse(configRow.modules || '[]'); } catch {}
    try { globalSettings = JSON.parse(configRow.globalSettings || '{}'); } catch {}
  }

  // Define essential security modules to arm
  const essentialModules = ['security', 'prebot_whitelist', 'automod', 'voice-protection', 'join-role-guard', 'verification', 'logging', 'automation'];

  for (const modId of essentialModules) {
    let mod = modules.find((m: any) => m.id === modId);
    if (!mod) {
      mod = { id: modId, status: 'enabled', config: {} };
      modules.push(mod);
    } else {
      mod.status = 'enabled';
    }

    if (modId === 'security') {
      mod.config = {
        ...mod.config,
        antiNukeEnabled: true,
        prebotEnabled: true,
        emergencyMode: false,
        preset: 'MAXIMUM_LOCKDOWN',
        rules: {
          ...(mod.config?.rules || {}),
          anti_ban: { enabled: true, limit: 2, window: 10, action: 'ban' },
          anti_bot_add: { enabled: true, limit: 1, window: 10, action: 'ban' },
          anti_role_grant: { enabled: true, limit: 1, window: 10, action: 'ban' },
          anti_role_delete: { enabled: true, limit: 1, window: 10, action: 'ban' },
          anti_channel_delete: { enabled: true, limit: 1, window: 10, action: 'ban' },
          anti_webhook_create: { enabled: true, limit: 1, window: 10, action: 'ban' }
        }
      };
    }
  }

  const modulesJson = JSON.stringify(modules);
  const globalJson = JSON.stringify(globalSettings);

  await db.run(
    `INSERT INTO guild_configs (guildId, modules, globalSettings)
     VALUES (?, ?, ?)
     ON CONFLICT(guildId) DO UPDATE SET modules = excluded.modules, globalSettings = excluded.globalSettings`,
    [TARGET_GUILD, modulesJson, globalJson]
  );

  // Log sync entry in SQLite
  await db.run(
    `INSERT INTO sync_logs (guildId, time, msg, type) VALUES (?, ?, ?, ?)`,
    [
      TARGET_GUILD,
      new Date().toISOString(),
      '🛡️ [Database Hardening]: Guild 1508399161798819840 successfully armed with Maximum Lockdown Zero-Trust Security configuration directly in SQLite.',
      'success'
    ]
  );

  console.log(`✅ Guild ${TARGET_GUILD} successfully ARMED in Database!`);
  console.log(`   - Modules Enabled: ${modules.map((m: any) => `${m.id} (${m.status})`).join(', ')}`);
  console.log(`   - Security Preset: MAXIMUM_LOCKDOWN`);
  console.log(`   - Anti-Nuke: 🟢 ENABLED`);
  console.log(`   - PreBot Whitelist: 🟢 ENABLED`);
  console.log(`   - Anti-Role-Grant: 🟢 ENABLED (Ban on unauthorized grant)`);
  console.log(`-------------------------------------------------------\n`);

  process.exit(0);
}

armServer1508().catch((err) => {
  console.error('❌ Script execution error:', err);
  process.exit(1);
});
