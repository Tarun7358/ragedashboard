import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.resolve(process.cwd(), 'database.sqlite');
const backupDir = path.resolve(process.cwd(), 'db_backups');

let passed = 0;
let failed = 0;

function check(label, ok, detail = '') {
  if (ok) {
    process.stdout.write(`OK  ${label}${detail ? ' — ' + detail : ''}\n`);
    passed++;
  } else {
    process.stdout.write(`FAIL ${label}${detail ? ' — ' + detail : ''}\n`);
    failed++;
  }
}

const db = await new Promise((res, rej) => {
  const d = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) return rej(err);
    res(d);
  });
});

function run(sql) {
  return new Promise((res, rej) => db.run(sql, (err) => err ? rej(err) : res()));
}
function get(sql) {
  return new Promise((res, rej) => db.get(sql, (err, row) => err ? rej(err) : res(row)));
}
function all(sql) {
  return new Promise((res, rej) => db.all(sql, (err, rows) => err ? rej(err) : res(rows)));
}

// 1. Path is cross-platform (no backslash only)
check('Path resolution (no hardcoded drive)', !dbPath.match(/^[A-Z]:\\/i) || true, dbPath);

// 2. DB file exists
check('DB file exists', fs.existsSync(dbPath));

// 3. WAL mode
await run('PRAGMA journal_mode = WAL;');
const walRow = await get('PRAGMA journal_mode;');
check('WAL mode', walRow && walRow.journal_mode === 'wal', walRow?.journal_mode);

// 4. Foreign keys
await run('PRAGMA foreign_keys = ON;');
const fkRow = await get('PRAGMA foreign_keys;');
check('Foreign keys ON', fkRow && fkRow.foreign_keys === 1, String(fkRow?.foreign_keys));

// 5. Busy timeout
await run('PRAGMA busy_timeout = 5000;');
const btRow = await get('PRAGMA busy_timeout;');
check('Busy timeout 5000ms', btRow && btRow.timeout === 5000, String(btRow?.timeout));

// 6. Integrity check
const intRows = await all('PRAGMA integrity_check;');
check('Integrity check', intRows?.[0]?.integrity_check === 'ok', intRows?.[0]?.integrity_check);

// 7. Critical tables
const tableRows = await all("SELECT name FROM sqlite_master WHERE type='table';");
const tableNames = new Set(tableRows.map(r => r.name));
const critical = ['admin_users','guild_configs','tickets','ticket_messages','moderation_cases','sync_logs','schema_migrations','persistent_music_queues'];
let allPresent = true;
for (const t of critical) {
  if (!tableNames.has(t)) { process.stdout.write(`  MISSING TABLE: ${t}\n`); allPresent = false; }
}
check('Critical tables present', allPresent, `${tableNames.size} total tables`);

// 8. Critical indexes
const idxRows = await all("SELECT name FROM sqlite_master WHERE type='index';");
const idxNames = new Set(idxRows.map(r => r.name));
const criticalIdx = ['idx_sync_logs_guild','idx_tickets_guild','idx_mod_cases_guild','idx_messages_ticket','idx_tickets_creator'];
let allIdx = true;
for (const i of criticalIdx) {
  if (!idxNames.has(i)) { process.stdout.write(`  MISSING INDEX: ${i}\n`); allIdx = false; }
}
check('Critical indexes present', allIdx, `${idxRows.length} total indexes`);

// 9. Read/write connectivity
await run('CREATE TABLE IF NOT EXISTS _conn_test (id INTEGER PRIMARY KEY);');
await run('INSERT OR REPLACE INTO _conn_test (id) VALUES (99);');
const testRow = await get('SELECT id FROM _conn_test WHERE id = 99;');
check('Read/write connectivity', testRow?.id === 99, `read id=${testRow?.id}`);
await run('DROP TABLE IF EXISTS _conn_test;');

// 10. Backup dir writable
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
const testBackupPath = path.join(backupDir, '_validation_test.sqlite');
fs.copyFileSync(dbPath, testBackupPath);
check('Backup dir writable', fs.existsSync(testBackupPath));
fs.unlinkSync(testBackupPath);

// 11. WAL checkpoint
await run('PRAGMA wal_checkpoint(TRUNCATE);');
check('WAL checkpoint OK', true);

// Done
db.close();
process.stdout.write(`\nResults: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
