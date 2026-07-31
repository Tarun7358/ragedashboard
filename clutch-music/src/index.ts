import dotenv from 'dotenv';
import { ModuleRegistry } from './core/ModuleRegistry.js';
import { Gateway } from './core/Gateway.js';
import { Database } from './core/Database.js';
import { PublicFeedManager } from './core/PublicFeedManager.js';
import { AuthService } from './core/AuthService.js';
import { Logger } from './utils/logger.js';

// Feature Module Manifests
import { MusicManifest } from './modules/music/manifest.js';

dotenv.config();

// Redirect console to centralized Logger
console.log = (...args) => {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  Logger.info(msg, 'console');
};
console.warn = (...args) => {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  Logger.warn(msg, 'console');
};
console.error = (...args) => {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  Logger.error(msg, 'console');
};

let registry: ModuleRegistry;
let gateway: Gateway;

async function bootstrap() {
  try {
    Logger.startup('Rage Music Bot: bootstrap sequence initiated.', 'index');

    // 0. Connect Database
    await Database.connect();
    await AuthService.provisionDefaultOwner();

    // 1. Initialize Module Registry
    registry = new ModuleRegistry((_msgObj) => {
      // music bot doesn't broadcast internally
    });

    // 2. Register Feature Modules
    registry.registerModule(MusicManifest);
    registry.reevaluateAllModules();

    // 3. (Skipped WebServer initialization for Music Bot)

    // Internal API base + shared secret header for secure cross-service communication
    const CORE_API = `http://localhost:${process.env.PORT || 5000}`;
    const internalHeaders = {
      'Content-Type': 'application/json',
      'x-internal-secret': process.env.INTERNAL_SECRET || ''
    };

    // 4. Initialize Discord Bot Gateway Client
    gateway = new Gateway(
      (guildId, msg, type) => {
        Logger.info(`[MUSIC:${type}] ${msg}`, 'gateway');
        // Push log to Core backend to appear in shared dashboard
        fetch(`${CORE_API}/api/internal/music/logs`, {
          method: 'POST',
          headers: internalHeaders,
          body: JSON.stringify({ guildId, msg, type, source: 'MUSIC' })
        }).catch(() => {}); // ignore if core is down
      },
      () => registry.getRegistry(),
      (reg) => registry.setRegistry(reg),
      () => registry.reevaluateAllModules(),
      (msgObj) => {
        if (msgObj.type === 'METRICS_UPDATE' || msgObj.type === 'STATE_UPDATE') {
          fetch(`${CORE_API}/api/internal/music/state`, {
            method: 'POST',
            headers: internalHeaders,
            body: JSON.stringify(msgObj)
          }).catch(() => {});
        }
      },
      () => registry.getModulesState(),
      () => registry.getGlobalSettings(),
      null as any,
      (id, config) => registry.updateModuleConfig(id, config)
    );

    (gateway.client as any).registry = registry;
    (gateway.client as any).gatewayInstance = gateway;

    const originalUpdate = registry.updateModuleConfig.bind(registry);
    registry.updateModuleConfig = (id, config) => {
      const mod = originalUpdate(id, config);
      if (id === 'security' && gateway) {
        gateway.syncQuarantineQueue();
      }
      return mod;
    };

    gateway.registerModuleManifests([MusicManifest]);

    await gateway.connect();
    await gateway.forceDeployCommands();
    Logger.startup('✅ Rage Music Bot fully booted.', 'index');
  } catch (error: any) {
    Logger.error(`❌ Critical music bot bootstrap error: ${error?.message || error}`, 'index');
    process.exit(1);
  }
}

// ─── Global Error Handlers ────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  Logger.error(`🔥 Uncaught Exception: ${err?.message || err}\nStack: ${err?.stack || 'N/A'}`, 'uncaught');
});

process.on('unhandledRejection', (reason) => {
  Logger.error(`🔥 Unhandled Rejection: ${reason instanceof Error ? reason.message : reason}`, 'unhandled');
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
const handleShutdown = async (signal: string) => {
  Logger.info(`[Process] Received ${signal}. Initiating clean shutdown...`, 'index');
  try {
    gateway?.client?.destroy();
  } catch (e: any) {
    Logger.error(`Error destroying Discord client: ${e.message}`, 'index');
  }
  try {
    await Database.close();
  } catch (e: any) {
    Logger.error(`Error closing Music DB: ${e.message}`, 'index');
  }
  Logger.close();
  process.exit(0);
};

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

bootstrap();

export { registry, gateway };
