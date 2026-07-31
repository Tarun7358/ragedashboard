import sqlite3 from 'sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'database.sqlite');
const db = await new Promise((res, rej) => {
  const d = new sqlite3.Database(dbPath, (err) => err ? rej(err) : res(d));
});

function run(sql) {
  return new Promise((res, rej) => db.run(sql, (err) => err ? rej(err) : res()));
}
function all(sql) {
  return new Promise((res, rej) => db.all(sql, (err, rows) => err ? rej(err) : res(rows)));
}

console.log('Running REINDEX on all indexes...');
await run('REINDEX;');
console.log('REINDEX complete.');

const results = await all('PRAGMA integrity_check;');
console.log('Integrity check results:', results);

const ok = results.length > 0 && results[0].integrity_check === 'ok';
console.log(ok ? 'PASSED — database is clean.' : 'FAILED — issues remain.');

db.close();
process.exit(ok ? 0 : 1);
