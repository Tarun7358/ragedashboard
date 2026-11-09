import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import { Client, GatewayIntentBits } from 'discord.js';
import { Database } from '../core/Database.js';
import { createBackupData, saveBackup } from '../modules/backups/manifest.js';
import { captureLiveSnapshot, saveLiveSnapshotToDb } from '../modules/security/manifest.js';

async function run() {
  const targetGuildId = process.argv[2] || '1517780409985794138';
  console.log(`Connecting to database...`);
  await Database.connect();

  console.log(`Initializing Discord client...`);
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildEmojisAndStickers
    ]
  });

  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error('DISCORD_TOKEN is missing in environment.');
    process.exit(1);
  }

  await client.login(token);
  console.log(`Logged in as: ${client.user?.tag} (${client.user?.id})`);

  console.log(`Fetching guild ${targetGuildId}...`);
  const guild = await client.guilds.fetch(targetGuildId).catch((err: any) => {
    console.error(`Failed to fetch guild ${targetGuildId}:`, err?.message || err);
    return null;
  });

  if (!guild) {
    console.error(`Guild ${targetGuildId} not found or bot is not in the guild.`);
    await client.destroy();
    process.exit(1);
  }

  console.log(`Found guild: "${guild.name}" (${guild.id})`);
  console.log(`Creating full server configuration backup...`);

  const snapshot = await createBackupData(guild, 'Server Owner (Console CLI)');
  await saveBackup(snapshot);
  console.log(`Backup saved to database with ID: ${snapshot.id}`);

  // Synchronize with Anti-Nuke Live Recovery Snapshot in SQLite
  const liveSnap = await captureLiveSnapshot(guild);
  await saveLiveSnapshotToDb(guild.id, liveSnap);
  console.log(`Anti-Nuke Live Recovery Snapshot updated.`);

  console.log('----------------------------------------------------');
  console.log('BACKUP CREATED SUCCESSFULLY');
  console.log(`Guild Name:     ${snapshot.guildName}`);
  console.log(`Guild ID:       ${snapshot.guildId}`);
  console.log(`Backup Code:    ${snapshot.id}`);
  console.log(`Timestamp:      ${snapshot.timestamp}`);
  console.log(`Roles Count:    ${snapshot.rolesCount}`);
  console.log(`Channels Count: ${snapshot.channelsCount}`);
  console.log(`Emojis Count:   ${snapshot.emojisCount}`);
  console.log(`Restore Cmd:    r!backup load ${snapshot.id}`);
  console.log('----------------------------------------------------');

  await client.destroy();
  process.exit(0);
}

run().catch(err => {
  console.error('Fatal error taking backup:', err);
  process.exit(1);
});
