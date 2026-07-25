import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.resolve('../database.sqlite');
console.log('Checking database path:', dbPath);
console.log('Exists:', fs.existsSync(dbPath));

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to open database:', err.message);
    process.exit(1);
  }
  
  db.all("SELECT name FROM sqlite_master WHERE type='table'", [], async (err, rows) => {
    if (err) {
      console.error('Failed to list tables:', err.message);
      process.exit(1);
    }
    
    console.log(`Found ${rows.length} tables in database:`);
    for (const row of rows as any[]) {
      await new Promise<void>((resolve) => {
        // BUG-013 FIX: Validate that the table name is a safe SQL identifier
        // before interpolating it into the COUNT query. sqlite_master.name comes
        // from the schema (not user input), but this matches the defensive standard
        // used everywhere else in the codebase. SQLite does not support parameterised
        // identifiers, so we use an allowlist regex instead.
        const safeName = /^[a-zA-Z0-9_]+$/.test(row.name) ? row.name : null;
        if (!safeName) {
          console.log(`  - ${row.name}: Skipped (unsafe identifier)`);
          return resolve();
        }
        db.get(`SELECT COUNT(*) as count FROM ${safeName}`, [], (err, countRow: any) => {
          if (err) {
            console.error(`  - ${row.name}: Error - ${err.message}`);
          } else {
            console.log(`  - ${row.name}: ${countRow.count} rows`);
          }
          resolve();
        });
      });
    }
    db.close();
  });
});
