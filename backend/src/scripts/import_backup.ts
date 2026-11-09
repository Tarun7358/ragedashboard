import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';
import { Database } from '../core/Database.js';
import { saveBackup } from '../modules/backups/manifest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function run() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error('Usage: tsx backend/src/scripts/import_backup.ts <path-to-backup.json>');
    process.exit(1);
  }

  const resolvedPath = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  console.log(`Connecting to database at ${process.env.DB_PATH || 'default SQLite path'}...`);
  await Database.connect();

  const raw = fs.readFileSync(resolvedPath, 'utf8');
  const snapshot = JSON.parse(raw);

  if (!snapshot.id || !snapshot.guildId || !snapshot.data) {
    console.error('Invalid backup JSON structure. Missing id, guildId, or data.');
    process.exit(1);
  }

  console.log(`Importing backup "${snapshot.id}" for guild "${snapshot.guildName}" (${snapshot.guildId})...`);
  await saveBackup(snapshot);

  console.log('----------------------------------------------------');
  console.log('✅ BACKUP IMPORTED SUCCESSFULLY INTO TARGET DATABASE!');
  console.log(`Backup ID:     ${snapshot.id}`);
  console.log(`Guild Name:    ${snapshot.guildName}`);
  console.log(`Guild ID:      ${snapshot.guildId}`);
  console.log(`Roles Count:   ${snapshot.rolesCount}`);
  console.log(`Channels Count:${snapshot.channelsCount}`);
  console.log(`Restore Cmd:   r!backup load ${snapshot.id}`);
  console.log('----------------------------------------------------');

  process.exit(0);
}

run().catch(err => {
  console.error('Fatal import error:', err);
  process.exit(1);
});

