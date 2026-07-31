// C-1 FIX: dotenv MUST be configured before any ES module-level code
// that reads process.env. Using createRequire so it runs synchronously
// at the very top before any other imports resolve their env reads.
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

// TODO:
// Dashboard currently disabled.
// Planned for Enterprise Web Panel.
// UI should follow Lime.gg inspiration.
const isDashboardEnabled = process.env.DASHBOARD_ENABLED === 'true';

if (isDashboardEnabled) {
  // BUG-003 FIX: Refuse to start if JWT_SECRET is missing or too short when Dashboard is enabled.
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error('');
    console.error('╔══════════════════════════════════════════════════════════════╗');
    console.error('║  FATAL STARTUP ERROR — JWT_SECRET not configured correctly   ║');
    console.error('╠══════════════════════════════════════════════════════════════╣');
    console.error('║  JWT_SECRET must be set to a string of at least 32 chars     ║');
    console.error('║  in your .env file before starting in production mode.        ║');
    console.error('║                                                                ║');
    console.error('║  Example:  JWT_SECRET=your-32-char-secure-random-secret-here  ║');
    console.error('║                                                                ║');
    console.error('║  Refusing to start to prevent insecure JWT token forgery.     ║');
    console.error('╚══════════════════════════════════════════════════════════════╝');
    console.error('');
    process.exit(1);
  }
} else {
  console.log('ℹ️ Web Dashboard Disabled (DASHBOARD_ENABLED=false). Native Discord Management active.');
}

if (process.stdout && (process.stdout as any)._handle && typeof (process.stdout as any)._handle.setBlocking === 'function') {
  (process.stdout as any)._handle.setBlocking(true);
}
if (process.stderr && (process.stderr as any)._handle && typeof (process.stderr as any)._handle.setBlocking === 'function') {
  (process.stderr as any)._handle.setBlocking(true);
}

import { EventEmitter } from 'events';
EventEmitter.defaultMaxListeners = 100;

import dotenv from 'dotenv';
import { ModuleRegistry } from './core/ModuleRegistry.js';
import { WebServer } from './core/WebServer.js';
import { Gateway } from './core/Gateway.js';
import { Database } from './core/Database.js';
import { PublicFeedManager } from './core/PublicFeedManager.js';


// ---- Existing Feature Module Manifests ----
import { SecurityManifest } from './modules/security/manifest.js';
import { LoggingManifest } from './modules/logging/manifest.js';
import { BackupsManifest } from './modules/backups/manifest.js';
import { AutomationManifest } from './modules/automation/manifest.js';
import { VoiceManifest } from './modules/voice/manifest.js';
import { MemberWhitelistManifest } from './modules/member_whitelist/manifest.js';
import { ReactionRolesManifest } from './modules/reaction-roles/manifest.js';
import { LevelingManifest } from './modules/leveling/manifest.js';
import { AutomodManifest } from './modules/automod/manifest.js';
import { DiscordDashboardManifest } from './modules/discord-dashboard/manifest.js';
import { MusicManifest } from './modules/music/manifest.js';

import { QueueManager } from './modules/music/QueueManager.js';

// ---- NEW Feature Module Manifests ----
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
import { PaymentManifest } from './modules/payment/manifest.js';
import { RageEnterpriseManifest } from './modules/rage-enterprise/manifest.js';



// All manifests in one place for easy iteration
export const ALL_MANIFESTS = [
  // Existing
  SecurityManifest,
  LoggingManifest,
  BackupsManifest,
  AutomationManifest,
  VoiceManifest,
  MemberWhitelistManifest,
  ReactionRolesManifest,
  LevelingManifest,
  AutomodManifest,
  DiscordDashboardManifest,
  MusicManifest,

  // New
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
  PaymentManifest,
  RageEnterpriseManifest,
];

// Web-server excluded manifests (no routes needed for some)
const WEB_MANIFESTS = ALL_MANIFESTS.filter(m =>
  m.id !== 'diagnostics' && m.id !== 'bulk_ops' && m.id !== 'voice_manager'
);

let registry: ModuleRegistry;
let webServer: WebServer;
let gateway: Gateway;

async function bootstrap() {
  try {
    // 0. Connect Database
    await Database.connect();

    // 1. Initialize Module Registry
    registry = new ModuleRegistry((msgObj) => {
      if (webServer) webServer.broadcast(msgObj);
    });
    QueueManager.registry = registry;

    // 2. Register Feature Modules
    for (const manifest of ALL_MANIFESTS) {
      registry.registerModule(manifest);
    }

    // Load configurations from SQLite
    await registry.loadAllGuilds();

    // Run initial evaluation across all registered configurations
    registry.reevaluateAllModules();

    // 3. Initialize Express Web Server & WebSockets Gateway
    webServer = new WebServer(registry, (guildId) => {
      if (gateway) gateway.syncRegistry(guildId);
    });

    const publicFeed = new PublicFeedManager((msgObj) => webServer.broadcast(msgObj));
    webServer.setPublicFeed(publicFeed);

    webServer.registerModuleManifests(WEB_MANIFESTS);

    const PORT = Number(process.env.PORT || 5000);
    webServer.listen(PORT);

    // 4. Initialize Discord Bot Gateway Client
    gateway = new Gateway(
      (guildId, msg, type) => registry.logSyncEvent(guildId, msg, type),
      (guildId) => registry.getRegistry(guildId),
      (guildId, reg) => registry.setRegistry(guildId, reg),
      (guildId) => registry.reevaluateAllModules(guildId),
      (msgObj) => webServer.broadcast(msgObj),
      (guildId) => registry.getModulesState(guildId),
      (guildId) => registry.getGlobalSettings(guildId),
      publicFeed,
      (guildId, id, config) => registry.updateModuleConfig(guildId, id, config)
    );
    registry.client = gateway.client;

    // Hook for auto-syncing quarantine when security config changes
    const originalUpdate = registry.updateModuleConfig.bind(registry);
    registry.updateModuleConfig = (guildId, id, config) => {
      const mod = originalUpdate(guildId, id, config);
      if (id === 'security' && gateway) {
        gateway.syncQuarantineQueue(guildId);
      }
      return mod;
    };

    webServer.getBotMetrics = () => gateway.getMetrics();
    webServer.deployCommandsCallback = () => gateway.forceDeployCommands();
    webServer.triggerEmergencyLock = async (guildId?) => gateway.triggerEmergencyLock(guildId);
    webServer.getDiscordClient = () => gateway.client;
    webServer.syncRegistryCallback = (guildId?) => gateway.syncRegistry(guildId);

    gateway.registerModuleManifests(ALL_MANIFESTS);

    gateway.connect();
    console.log(`✅ Rage Optimiser booted with ${ALL_MANIFESTS.length} modules registered.`);


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
    // Disconnect Gateway if it exists
    if (gateway) {
      console.log('[Shutdown] Disconnecting Discord client...');
      gateway.client?.destroy();
    }
  } catch (e: any) {
    console.error('Error disconnecting Discord client:', e.message);
  }
  
  try {
    // Close Database
    console.log('[Shutdown] Closing SQLite database...');
    await Database.close();
  } catch (e: any) {
    console.error('Error closing SQLite database:', e.message);
  }

  try {
    // Close Logger
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
