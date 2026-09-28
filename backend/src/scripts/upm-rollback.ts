import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { Client, GatewayIntentBits } from 'discord.js';
import { Database } from '../core/Database.js';

dotenv.config();

const guildId = (process.argv[2] || process.env.GUILD_ID) as string;
const userId = process.argv[3];
if (!guildId || !userId) {
  console.error("❌ Error: Please provide both Guild ID and User ID as arguments. Example: npm run upm:rollback <guildId> <userId>");
  process.exit(1);
}

const PORT = process.env.PORT || 5000;
if (!process.env.JWT_SECRET) {
  console.error("❌ Error: JWT_SECRET environment variable is missing. Please configure it in your .env file.");
  process.exit(1);
}
const JWT_SECRET: string = process.env.JWT_SECRET;

async function updateSecurityConfigInDb(guildId: string, updates: Record<string, any>) {
  const db = Database.getDb();
  if (!db) return;
  try {
    const row = await db.get<any>('SELECT modules, globalSettings FROM guild_configs WHERE guildId = ?', [guildId]);
    let modules = [];
    let globalSettings = {};
    if (row) {
      modules = typeof row.modules === 'string' ? JSON.parse(row.modules) : (row.modules || []);
      globalSettings = typeof row.globalSettings === 'string' ? JSON.parse(row.globalSettings) : (row.globalSettings || {});
    }
    let secModule = modules.find((m: any) => m.id === 'security');
    if (!secModule) {
      secModule = { id: 'security', name: 'Security Hardening', status: 'enabled', config: {} };
      modules.push(secModule);
    }
    secModule.config = { ...(secModule.config || {}), ...updates };
    await db.run(
      'INSERT OR REPLACE INTO guild_configs (guildId, modules, globalSettings) VALUES (?, ?, ?)',
      [guildId, JSON.stringify(modules), JSON.stringify(globalSettings)]
    );
  } catch (err) {
    console.error('Failed to update security config in SQLite:', err);
  }
}

async function logSyncEventInDb(guildId: string, msg: string, type: 'info' | 'warn' | 'success') {
  console.log(`[Sync Event] [${type.toUpperCase()}] ${msg}`);
}

async function run() {
  // Generate System JWT token
  const token = jwt.sign(
    { id: 'system', username: 'System CLI', role: 'admin' },
    JWT_SECRET,
    { expiresIn: '5m' }
  );

  console.log(`[UPM CLI] Attempting to connect to running WebServer...`);
  try {
    const response = await fetch(`http://localhost:${PORT}/api/modules/security/upm/rollback/${userId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Guild-Id': guildId
      } as Record<string, string>
    });

    if (response.ok) {
      console.log(`✅ Success (via API): Rollback executed successfully.`);
      process.exit(0);
    } else {
      const errText = await response.text();
      console.warn(`⚠️ WebServer returned error status ${response.status}: ${errText}. Falling back to standalone execution...`);
    }
  } catch (err: any) {
    console.log(`ℹ️ WebServer is not reachable (${err.message}). Falling back to standalone execution...`);
  }

  // Standalone Fallback
  console.log(`[UPM CLI] Connecting to Database...`);
  await Database.connect();

  const db = Database.getDb();
  if (!db) {
    console.error("❌ Database connection failed.");
    process.exit(1);
  }

  // Fetch rollback document
  const rollbackRow = await db.get<any>('SELECT roles FROM upm_rollbacks WHERE id = ?', [`${guildId}_${userId}`]).catch(() => null);
  if (!rollbackRow) {
    console.error(`❌ Error: No rollback data found in SQLite for user ${userId}.`);
    process.exit(1);
  }

  const rollbackRoles = typeof rollbackRow.roles === 'string' ? JSON.parse(rollbackRow.roles) : (rollbackRow.roles || []);

  console.log(`[UPM CLI] Connecting to Discord Gateway...`);
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers
    ]
  });

  await client.login(process.env.DISCORD_TOKEN);
  console.log(`[UPM CLI] Logged in as bot user ${client.user?.tag}`);

  try {
    const guild = await client.guilds.fetch(guildId);
    if (!guild) {
      console.error(`❌ Error: Guild ${guildId} not found.`);
      client.destroy();
      process.exit(1);
    }

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      console.error(`❌ Error: Member ${userId} not found in guild.`);
      client.destroy();
      process.exit(1);
    }

    const row = await db.get<any>('SELECT modules FROM guild_configs WHERE guildId = ?', [guildId]).catch(() => null);
    let modules = [];
    if (row) {
      modules = typeof row.modules === 'string' ? JSON.parse(row.modules) : (row.modules || []);
    }
    const secModule = modules.find((m: any) => m.id === 'security') || { config: {} };
    const config = secModule.config || {};
    const upm = config.upm || {};

    console.log(`[UPM CLI] Executing rollback for ${member.user.username}...`);

    if (upm.quarantineRole && member.roles.cache.has(upm.quarantineRole)) {
      await member.roles.remove(upm.quarantineRole).catch(() => {});
    }

    for (const rId of rollbackRoles) {
      await member.roles.add(rId).catch(() => {});
    }

    await db.run('DELETE FROM upm_rollbacks WHERE id = ?', [`${guildId}_${userId}`]).catch(() => {});

    let quarantinedUsers = config.quarantinedUsers || [];
    quarantinedUsers = quarantinedUsers.filter((u: any) => u.userId !== userId);
    await updateSecurityConfigInDb(guildId, { quarantinedUsers });

    await logSyncEventInDb(guildId, `Rollback executed via CLI script: Restored original roles to ${member.user.username}.`, 'success');

    console.log(`✅ Success (standalone): Rollback executed for ${member.user.username}.`);
  } catch (e: any) {
    console.error(`❌ Standalone Execution Failed:`, e.message || e);
  } finally {
    client.destroy();
    process.exit(0);
  }
}

run().catch(err => {
  console.error(`❌ Critical Script Error:`, err);
  process.exit(1);
});
