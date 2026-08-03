import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const _require = createRequire(import.meta.url);
const _dotenv = _require('dotenv');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { Logger } from './utils/logger.js';

console.log = (...args) => {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
  Logger.info(msg, 'console');
};
console.warn = (...args) => {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
  Logger.warn(msg, 'console');
};
console.error = (...args) => {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
  Logger.error(msg, 'console');
};

// Find first existing .env file
const possibleEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend', '.env'),
  path.resolve(__dirname, '..', '.env'),
  path.resolve(__dirname, '..', '..', '.env'),
];

let loadedPath = '';
for (const envPath of possibleEnvPaths) {
  if (fs.existsSync(envPath)) {
    _dotenv.config({ path: envPath });
    loadedPath = envPath;
    break;
  }
}

if (loadedPath) {
  console.log(`Environment Loaded`);
  console.log(`Loaded environment from: ${loadedPath}`);
} else {
  console.warn('⚠️ No .env file could be resolved.');
}

if (process.stdout && (process.stdout as any)._handle && typeof (process.stdout as any)._handle.setBlocking === 'function') {
  (process.stdout as any)._handle.setBlocking(true);
}
if (process.stderr && (process.stderr as any)._handle && typeof (process.stderr as any)._handle.setBlocking === 'function') {
  (process.stderr as any)._handle.setBlocking(true);
}

import { EventEmitter } from 'events';
EventEmitter.defaultMaxListeners = 100;

import { ModuleRegistry } from './core/ModuleRegistry.js';
import { WebServer } from './core/WebServer.js';
import { Gateway } from './core/Gateway.js';
import { Database } from './core/Database.js';

// ---- Feature Module Manifests ----
import { SecurityManifest } from './modules/security/manifest.js';
import { LoggingManifest } from './modules/logging/manifest.js';
import { BackupsManifest } from './modules/backups/manifest.js';
import { AutomationManifest } from './modules/automation/manifest.js';
import { VoiceManifest } from './modules/voice/manifest.js';
import { MemberWhitelistManifest } from './modules/member_whitelist/manifest.js';
import { ReactionRolesManifest } from './modules/reaction-roles/manifest.js';
import { LevelingManifest } from './modules/leveling/manifest.js';
import { AutomodManifest } from './modules/automod/manifest.js';
import { MusicManifest } from './modules/music/manifest.js';
import { QueueManager } from './modules/music/QueueManager.js';

import { GiveawayManifest } from './modules/giveaway/manifest.js';
import { RemindersManifest } from './modules/reminders/manifest.js';
import { AnnouncementsManifest } from './modules/announcements/manifest.js';
import { JoinToCreateManifest } from './modules/joinToCreate/manifest.js';
import { VoiceManagerManifest } from './modules/voice_manager/manifest.js';
import { BulkOpsManifest } from './modules/bulk_ops/manifest.js';
import { DiagnosticsManifest } from './modules/diagnostics/manifest.js';
import { VoiceProtectionManifest } from './modules/voice-protection/index.js';
import { JoinRoleAssignmentGuardManifest } from './modules/join-role-guard/manifest.js';
import { SocialUpdatesManifest } from './modules/social-updates/manifest.js';
import { WelcomeV2Manifest } from './modules/welcome-v2/manifest.js';
import { TicketsV2Manifest } from './modules/tickets-v2/manifest.js';
import { AnalyticsManifest } from './modules/analytics/manifest.js';
import { AuditManifest } from './modules/audit/manifest.js';
import { ModerationManifest } from './modules/moderation/manifest.js';
import { BlacklistManifest } from './modules/blacklist/manifest.js';
import { CommunityManifest } from './modules/community/manifest.js';
import { DiscordDashboardManifest } from './modules/discord-dashboard/manifest.js';
import { VerificationManifest } from './modules/verification/manifest.js';
import { RageEnterpriseManifest } from './modules/rage-enterprise/manifest.js';
import { PrebotWhitelistManifest, registerPrebotCommands } from './modules/prebot_whitelist/manifest.js';
import { BotStatsManifest, registerBotStatsCommands } from './modules/botstats/manifest.js';

import { registerTempRoleCommands, checkExpiredTempRoles } from './modules/security/temprole.js';
import { registerExtraOwnerCommands } from './modules/security/extraowner.js';
import { registerConfigCommands, ConfigManifest } from './modules/config/manifest.js';

// All manifests in one place
export const ALL_MANIFESTS = [
  ConfigManifest,
  SecurityManifest,
  ModerationManifest,
  BlacklistManifest,
  CommunityManifest,
  DiscordDashboardManifest,
  VerificationManifest,
  LoggingManifest,
  BackupsManifest,
  AutomationManifest,
  VoiceManifest,
  MemberWhitelistManifest,
  PrebotWhitelistManifest,
  BotStatsManifest,
  ReactionRolesManifest,
  LevelingManifest,
  AutomodManifest,
  MusicManifest,
  GiveawayManifest,
  RemindersManifest,
  AnnouncementsManifest,
  JoinToCreateManifest,
  VoiceManagerManifest,
  BulkOpsManifest,
  DiagnosticsManifest,
  VoiceProtectionManifest,
  JoinRoleAssignmentGuardManifest,
  SocialUpdatesManifest,
  WelcomeV2Manifest,
  TicketsV2Manifest,
  AnalyticsManifest,
  AuditManifest,
  RageEnterpriseManifest,
];

let registry: ModuleRegistry;
let webServer: WebServer;
let gateway: Gateway;

async function bootstrap() {
  try {
    // 0. Connect Database
    await Database.connect();

    // 1. Initialize Module Registry
    registry = new ModuleRegistry(() => {});
    QueueManager.registry = registry;

    // 2. Register Feature Modules
    for (const manifest of ALL_MANIFESTS) {
      registry.registerModule(manifest);
    }

    // Load configurations from SQLite
    await registry.loadAllGuilds();

    // Run initial evaluation across all registered configurations
    registry.reevaluateAllModules();

    // 3. Initialize Minimal Express Web Server for Uptime Monitors (/health & /metrics)
    webServer = new WebServer();

    const PORT = Number(process.env.PORT || 5000);
    webServer.listen(PORT);

    // 4. Initialize Discord Bot Gateway Client
    gateway = new Gateway(
      (guildId, msg, type) => registry.logSyncEvent(guildId, msg, type),
      (guildId) => registry.getRegistry(guildId),
      (guildId, reg) => registry.setRegistry(guildId, reg),
      (guildId) => registry.reevaluateAllModules(guildId),
      () => {},
      (guildId) => registry.getModulesState(guildId),
      (guildId) => registry.getGlobalSettings(guildId),
      null as any,
      (guildId, id, config) => registry.updateModuleConfig(guildId, id, config)
    );
    registry.client = gateway.client;

    webServer.getBotMetrics = () => gateway ? gateway.getMetrics() : { latency: 0, uptime: '0s' };
    webServer.getDiscordClient = () => gateway ? gateway.client : null;

    gateway.registerModuleManifests(ALL_MANIFESTS);

    // Register Prefix & Slash Control Suites (must be invoked after initialize to avoid map clear)
    registerTempRoleCommands();
    registerExtraOwnerCommands();
    registerConfigCommands();
    registerPrebotCommands();
    registerBotStatsCommands();

    await gateway.connect();
    console.log(`✅ Rage Optimiser booted with ${ALL_MANIFESTS.length} modules registered.`);

    // 5. Start 30-Second Temporary Role Auto-Revocation Ticker
    setInterval(async () => {
      if (gateway && gateway.client && gateway.client.isReady()) {
        await checkExpiredTempRoles(gateway.client);
      }
    }, 30 * 1000);

  } catch (error) {
    console.error('❌ Critical bootstrap error:', error);
    process.exit(1);
  }
}

process.on('uncaughtException', (err) => {
  Logger.error(`🔥 CRITICAL: Uncaught Exception: ${err?.message || err}\nStack: ${err?.stack || 'N/A'}`, 'uncaught');
});

process.on('unhandledRejection', (reason) => {
  Logger.error(`🔥 CRITICAL: Unhandled Rejection: ${reason instanceof Error ? reason.message : reason}\nStack: ${reason instanceof Error ? reason.stack : 'N/A'}`, 'unhandled');
});

const handleGracefulShutdown = async (signal: string) => {
  console.log(`\n[Process] Received ${signal}. Initiating clean shutdown...`);
  try {
    if (gateway) {
      console.log('[Shutdown] Disconnecting Discord client...');
      gateway.client?.destroy();
    }
  } catch (e: any) {
    console.error('Error disconnecting Discord client:', e.message);
  }
  
  try {
    console.log('[Shutdown] Closing SQLite database...');
    await Database.close();
  } catch (e: any) {
    console.error('Error closing SQLite database:', e.message);
  }

  try {
    console.log('[Shutdown] Flushing log streams...');
    Logger.close();
  } catch (e) {}

  console.log('[Shutdown] Shutdown sequence completed.');
  process.exit(0);
};

process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));

const isMainFile = () => {
  try {
    if (!process.argv[1]) return false;
    const mainPath = path.resolve(process.argv[1]);
    const currentPath = path.resolve(fileURLToPath(import.meta.url));
    return mainPath === currentPath;
  } catch {
    return false;
  }
};

if (isMainFile()) {
  bootstrap();
}

export { registry, webServer, gateway };
