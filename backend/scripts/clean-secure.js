import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

const dbPaths = [
  path.resolve(process.cwd(), '..', 'database.sqlite'),
  path.resolve(process.cwd(), 'database.sqlite')
];

for (const p of dbPaths) {
  if (!fs.existsSync(p)) continue;
  console.log(`Checking ${p}...`);
  const db = new sqlite3.Database(p);

  db.all('SELECT guildId, modules FROM guild_configs', (err, rows) => {
    if (err) {
      console.log(`No guild_configs in ${p} (${err.message})`);
      db.close();
      return;
    }

    let updated = 0;
    for (const row of rows) {
      if (row.modules && (row.modules.includes('secure') || row.modules.includes('Secure'))) {
        try {
          const modules = JSON.parse(row.modules);
          let modChanged = false;
          for (const m of modules) {
            if (m.id === 'tickets' && m.config) {
              if (m.config.panelDescription && /secure/i.test(m.config.panelDescription)) {
                console.log(`Old panelDescription in guild ${row.guildId}:`, m.config.panelDescription);
                m.config.panelDescription = m.config.panelDescription.replace(/secure/gi, 'rage');
                modChanged = true;
              }
              if (m.config.panelGuidelines && /secure/i.test(m.config.panelGuidelines)) {
                console.log(`Old panelGuidelines in guild ${row.guildId}:`, m.config.panelGuidelines);
                m.config.panelGuidelines = m.config.panelGuidelines.replace(/secure/gi, 'rage');
                modChanged = true;
              }
            }
          }
          if (modChanged) {
            const newJson = JSON.stringify(modules);
            db.run('UPDATE guild_configs SET modules = ? WHERE guildId = ?', [newJson, row.guildId], (uErr) => {
              if (uErr) console.error('Failed to update guild:', row.guildId, uErr);
              else console.log(`Successfully updated guild ${row.guildId} in database!`);
            });
            updated++;
          }
        } catch (e) {
          console.error('JSON parse error for guild', row.guildId, e);
        }
      }
    }
    console.log(`Total guilds updated in ${p}: ${updated}`);
  });
}
