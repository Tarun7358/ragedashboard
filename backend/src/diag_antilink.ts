/**
 * DIAGNOSTIC: Anti-Link Config Checker
 * Run: npx tsx src/diag_antilink.ts
 * This reads the SQLite DB and dumps automod + security configs to show why anti-link may be bypassed.
 */

import { Database } from './core/Database.js';

async function main() {
  await Database.connect();

  const rows = await Database.all(
    'SELECT guildId, modules FROM guild_configs'
  );

  if (!rows || rows.length === 0) {
    console.log('[DIAG] No guild_configs rows found in database!');
    process.exit(0);
  }

  for (const row of rows) {
    console.log(`\n==========================================`);
    console.log(`GUILD ID: ${row.guildId}`);
    const modules = JSON.parse(row.modules || '[]');
    for (const m of modules) {
      if (['automod', 'security'].includes(m.id)) {
        console.log(`\n  MODULE: ${m.id} | STATUS: ${m.status}`);
        const cfg = m.config || {};

        if (m.id === 'automod') {
          console.log('    blockLinks:', cfg.blockLinks === undefined ? '⚠️ NOT SET (undefined → defaults to TRUE)' : cfg.blockLinks);
          console.log('    ignoredChannels:', JSON.stringify(cfg.ignoredChannels || []));
          console.log('    ignoredRoles:', JSON.stringify(cfg.ignoredRoles || []));
          console.log('    punishment:', cfg.punishment || 'NOT SET');
        } else if (m.id === 'security') {
          const rules = cfg.rules || {};
          const antiLink = rules.anti_link;
          console.log('    anti_link rule:', antiLink ? JSON.stringify(antiLink) : '⚠️ NOT SET (defaults to enabled=true, limit=3, window=10)');
          console.log('    alertChannelId:', cfg.alertChannelId || '⚠️ NOT SET');
          console.log('    whitelist entries:', (cfg.whitelist || []).length);
        }
      }
    }
  }

  console.log('\n==========================================');
  console.log('DONE. If blockLinks is not false and automod status is enabled, anti-link SHOULD be active.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
