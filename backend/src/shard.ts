import { ShardingManager } from 'discord.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const _require = createRequire(import.meta.url);
const _dotenv = _require('dotenv');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Environment Configuration
const possibleEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend', '.env'),
  path.resolve(__dirname, '..', '.env'),
  path.resolve(__dirname, '..', '..', '.env'),
];

for (const envPath of possibleEnvPaths) {
  if (fs.existsSync(envPath)) {
    _dotenv.config({ path: envPath });
    break;
  }
}

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error('❌ [ShardingManager Error]: DISCORD_TOKEN is missing in environment variables.');
  process.exit(1);
}

// TOTAL_SHARDS environment variable or 'auto' (Discord API auto-detect)
const totalShardsEnv = process.env.TOTAL_SHARDS || 'auto';
const totalShards: number | 'auto' = totalShardsEnv === 'auto'
  ? 'auto'
  : parseInt(totalShardsEnv, 10);

// Resolve compiled entry script index.js
const indexPath = path.join(__dirname, 'index.js');

console.log(`⚡ [ShardingManager]: Initializing Rage Optimiser Shard Cluster...`);
console.log(`⚡ [ShardingManager]: Target Shards: ${totalShardsEnv.toUpperCase()}`);

const manager = new ShardingManager(indexPath, {
  token: token,
  totalShards: totalShards,
  respawn: true
});

manager.on('shardCreate', shard => {
  console.log(`<:security:1546142576984203336> [ShardingManager] Successfully spawned Shard #${shard.id}`);

  shard.on('ready', () => {
    console.log(`<a:approved:1532390590707142956> [Shard #${shard.id}] Gateway Connection Ready & Online.`);
  });

  shard.on('disconnect', () => {
    console.warn(`⚠️ [Shard #${shard.id}] Disconnected from Discord Gateway.`);
  });

  shard.on('reconnecting', () => {
    console.log(`🔄 [Shard #${shard.id}] Reconnecting to Gateway...`);
  });

  shard.on('death', (proc: any) => {
    console.error(`🔥 [Shard #${shard.id}] Process died unexpectedly with exit code ${proc?.exitCode ?? 'unknown'}. Respawning...`);
  });
});

manager.spawn().catch(err => {
  console.error('❌ [ShardingManager Error] Failed to spawn shard processes:', err);
});
