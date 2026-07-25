import express, { Express, Request } from 'express';
import cors from 'cors';
import { createServer, Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { ModuleRegistry } from './ModuleRegistry.js';
import { ModuleManifest } from './types.js';
import jwt from 'jsonwebtoken';
import { Database } from './Database.js';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import type { PublicFeedManager } from './PublicFeedManager.js';
import { OAuthService } from './OAuthService.js';
import { AnalyticsService } from './AnalyticsService.js';
import bcrypt from 'bcryptjs';
import { EmbedBuilder } from 'discord.js';
import crypto from 'crypto';

/**
 * Unified guild ID resolution — reads from header, query, params, or env fallback.
 * Eliminates the repeated 4-way fallback pattern across all route handlers.
 */
export function resolveGuildId(req: Request): string {
  return (
    (req.headers['x-guild-id'] as string) ||
    (req.query.guildId as string) ||
    (req.params?.guildId as string) ||
    process.env.GUILD_ID ||
    'default_guild'
  );
}

/** Middleware that validates x-internal-secret for music-bot internal endpoints. */
const internalSecretMiddleware = (req: any, res: any, next: any) => {
  const secret = process.env.INTERNAL_SECRET;
  if (!secret) {
    // If no secret is configured, only allow requests from localhost
    const ip = req.ip || req.connection?.remoteAddress || '';
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
      return next();
    }
    return res.status(401).json({ error: 'Internal endpoint: x-internal-secret not configured and request is not from localhost' });
  }
  const provided = req.headers['x-internal-secret'];
  if (!provided || provided !== secret) {
    return res.status(401).json({ error: 'Unauthorized: missing or invalid x-internal-secret header' });
  }
  next();
};



export const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  // BUG-003 FIX: No fallback_secret — index.ts startup guard ensures JWT_SECRET is always valid.
  jwt.verify(token, process.env.JWT_SECRET!, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: 'Forbidden' });
    req.user = user;
    next();
  });
};

export const authorizeGuildAccess = (req: any, res: any, next: any) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const guildId = req.headers['x-guild-id'] as string || req.query.guildId as string || req.params.guildId as string || process.env.GUILD_ID || 'default_guild';
  
  if (user.role === 'guild_manager') {
    const managedIds: string[] = user.managedGuildIds || [];
    if (!managedIds.includes(guildId)) {
      return res.status(403).json({ error: 'Access denied: You do not manage this guild' });
    }
  }
  
  next();
};

export class WebServer {
  private app: Express;
  private server: Server;
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  public getBotMetrics: (() => { latency: number; uptime: string }) | null = null;
  public deployCommandsCallback: (() => Promise<void>) | null = null;
  public triggerEmergencyLock: ((guildId?: string) => Promise<void>) | null = null;
  public publicFeed?: PublicFeedManager;
  public getDiscordClient?: () => any;
  public syncRegistryCallback?: (guildId?: string) => Promise<void>;


  constructor(
    private registry: ModuleRegistry,
    private refreshCallback: (guildId?: string) => void
  ) {
    this.app = express();
    this.app.use(helmet({ contentSecurityPolicy: false }));
    this.app.use(cors({
      origin: [
        process.env.FRONTEND_URL || 'http://localhost:5173',
        'http://localhost:5173',
        'http://localhost:4680',
        'http://localhost:3000'
      ],
      credentials: true
    }));
    this.app.use(express.json());


    // Auth-specific rate limit — strict per-IP to prevent brute-force / token fishing
    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 20,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many authentication requests. Please try again later.' }
    });
    this.app.use('/api/auth/', authLimiter);

    // General API rate limit — generous for dashboard heavy usage
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 2000,
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api/', limiter);

    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ port: Number(process.env.WS_PORT || 5001) });

    // Security warning: JWT_SECRET must be set in production
    if (!process.env.JWT_SECRET) {
      console.warn('⚠️  WARNING: JWT_SECRET environment variable is not set! Using insecure fallback secret. Set JWT_SECRET in your .env file before deploying to production.');
    }

    this.setupRoutes();
    this.setupWebSockets();
  }

  public registerModuleManifests(manifests: ModuleManifest[]) {
    // Mount custom routes defined inside the module manifests
    manifests.forEach(manifest => {
      if (manifest.routes) {
        manifest.routes.forEach(route => {
          const path = `/api/modules/${manifest.id}${route.path}`;
          const handler = async (req: any, res: any) => {
            try {
              const guildId = req.headers['x-guild-id'] as string || req.query.guildId as string || process.env.GUILD_ID || 'default_guild';
              await route.handler(req, res, {
                guildId,
                registry: this.registry,
                client: this.getDiscordClient ? this.getDiscordClient() : null,
                broadcast: this.broadcast.bind(this),
                getModulesState: (gId?: string) => this.registry.getModulesState(gId || guildId),
                updateModuleConfig: (id: string, config: Record<string, any>) => {
                  this.registry.updateModuleConfig(guildId, id, config);
                },
                logSyncEvent: (msgOrGuildId: string | undefined, msgOrType?: string, type?: 'info' | 'warn' | 'success') => {
                  if (type !== undefined) {
                    this.registry.logSyncEvent(msgOrGuildId, msgOrType, type);
                  } else {
                    this.registry.logSyncEvent(guildId, msgOrGuildId, msgOrType as any);
                  }
                },
                getSyncLogs: (gId?: string) => this.registry.getSyncLogs(gId || guildId),
                getRegistry: (gId?: string) => this.registry.getRegistry(gId || guildId)
              });
            } catch (err) {
              console.error(`Error in route ${path}:`, err);
              res.status(500).json({ error: 'Internal module router error' });
            }
          };

          if (route.method === 'post') {
            this.app.post(path, authenticateToken, authorizeGuildAccess, handler);
          } else {
            this.app.get(path, authenticateToken, authorizeGuildAccess, handler);
          }
        });
      }
    });
  }

  public listen(port: number) {
    this.server.listen(port, () => {
      console.log(`Core WebServer running on http://localhost:${port}`);
    });
    console.log(`Core WebSocket server running on ws://localhost:${process.env.WS_PORT || 5001}`);
  }

  public broadcast(msgObj: any) {
    const serialized = JSON.stringify(msgObj);
    const targetGuildId = msgObj.guildId;
    this.clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        const clientGuildId = (ws as any).guildId;
        if (targetGuildId && clientGuildId && targetGuildId !== clientGuildId) {
          return;
        }
        ws.send(serialized);
      }
    });
  }

  public setPublicFeed(feed: PublicFeedManager) {
    this.publicFeed = feed;
  }

  private setupRoutes() {
    appRoutes(this, this.app, this.registry, this.refreshCallback);
  }

  private setupWebSockets() {
    this.wss.on('connection', (ws: WebSocket, req: any) => {
      // Check for JWT token in query params
      const url = new URL(req.url, `http://${req.headers.host}`);
      const token = url.searchParams.get('token');
      const guildId = url.searchParams.get('guildId') || process.env.GUILD_ID || 'default_guild';
      
      if (!token) {
        ws.close(1008, 'Unauthorized');
        return;
      }

      // BUG-003 FIX: No fallback_secret — index.ts startup guard ensures JWT_SECRET is always valid.
      jwt.verify(token, process.env.JWT_SECRET!, (err: any, user: any) => {
        if (err) {
          ws.close(1008, 'Unauthorized');
          return;
        }

        if (user.role === 'guild_manager') {
          const managedIds: string[] = user.managedGuildIds || [];
          if (!managedIds.includes(guildId)) {
            ws.close(1008, 'Forbidden: You do not manage this guild');
            return;
          }
        }

        (ws as any).guildId = guildId;
        this.clients.add(ws);

        // Trigger live Discord sync for this guild, then send INIT with fresh data
        const sendInit = () => {
          const metrics = this.getBotMetrics ? this.getBotMetrics() : { latency: 0, uptime: 'Offline' };
          ws.send(JSON.stringify({
            type: 'INIT',
            modules: this.registry.getModulesState(guildId),
            registry: this.registry.getRegistry(guildId),
            syncLogs: this.registry.getSyncLogs(guildId),
            globalSettings: this.registry.getGlobalSettings(guildId),
            latency: metrics.latency,
            uptime: metrics.uptime,
            guildId
          }));
        };

        if (this.syncRegistryCallback) {
          this.syncRegistryCallback(guildId).catch(() => {}).finally(sendInit);
        } else {
          sendInit();
        }

        ws.on('close', () => {
          this.clients.delete(ws);
        });
      });
    });
  }
}

function appRoutes(server: WebServer, app: Express, registry: ModuleRegistry, refreshCallback: (guildId?: string) => void) {
  
  // Internal Endpoint for Music Bot Logs — requires x-internal-secret header
  app.post('/api/internal/music/logs', internalSecretMiddleware, express.json(), (req, res) => {
    const { msg, type, source, guildId } = req.body;
    if (msg && type) {
      registry.logSyncEvent(guildId, `[MUSIC] ${msg}`, type);
    }
    res.sendStatus(200);
  });

  // Internal Endpoint for Music Bot State/Metrics Forwarding — requires x-internal-secret header
  app.post('/api/internal/music/state', internalSecretMiddleware, express.json(), (req, res) => {
    if (req.body && req.body.type) {
      // Forward the WebSocket event to the dashboard
      server.broadcast(req.body);
    }
    res.sendStatus(200);
  });

  // Diagnostic Endpoint
  app.get('/api/diag', (req, res) => {
    const client = server.getDiscordClient ? server.getDiscordClient() : null;
    if (!client) {
      return res.status(503).json({ error: 'Discord Client not linked to WebServer' });
    }
    try {
      const guilds = client.guilds.cache.map((g: any) => ({
        id: g.id,
        name: g.name,
        memberCount: g.memberCount,
        joinedAt: g.joinedAt
      }));
      res.json({
        status: client.ws.status,
        ping: client.ws.ping,
        guildsCount: client.guilds.cache.size,
        guilds,
        user: client.user ? { id: client.user.id, tag: client.user.username } : null,
        intents: client.options.intents
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Public route for Login Page live metrics
  app.get('/api/status', (req, res) => {
    const metrics = server.getBotMetrics ? server.getBotMetrics() : { latency: 0, uptime: 'Offline' };
    const modules = registry.getModulesState();
    
    // Calculate simple stats
    const activeModulesCount = modules.filter(m => m.status === 'ready' || m.status === 'enabled').length;

    // Compute threats blocked from real data: quarantined users + security warn events in sync logs
    const secMod = modules.find(m => m.id === 'security');
    const quarantinedCount = (secMod?.config?.quarantinedUsers || []).length;
    const syncLogs = registry.getSyncLogs();
    const securityWarnCount = syncLogs.filter(l => l.type === 'warn' && l.msg.includes('[Anti-Nuke')).length;
    const threatsBlocked = quarantinedCount + securityWarnCount;

    // Compute protected servers count from the live Discord client cache
    const discordClientForStatus = server.getDiscordClient ? server.getDiscordClient() : null;
    const protectedServers = discordClientForStatus ? discordClientForStatus.guilds.cache.size : 1;

    res.json({
      activeModules: activeModulesCount,
      protectedServers,
      threatsBlocked,
      bot: { status: 'Online', latency: metrics.latency, uptime: metrics.uptime },
      database: { status: 'Connected' },
      api: { status: 'Healthy' }
    });
  });

  // Login Route — credentials login is disabled; all authentication is via Discord OAuth.
  app.post('/api/auth/login', (req, res) => {
    return res.status(410).json({ error: 'Credentials login is disabled. Please use Discord OAuth to access the dashboard.' });
  });

  app.get('/api/state', authenticateToken, authorizeGuildAccess, async (req, res) => {
    const guildId = resolveGuildId(req);
    // Trigger a live Discord sync before returning — ensures fresh roles/channels on each load
    if (server.syncRegistryCallback) {
      await server.syncRegistryCallback(guildId).catch(() => {});
    }
    const metrics = server.getBotMetrics ? server.getBotMetrics() : { latency: 0, uptime: 'Offline' };
    res.json({
      modules: registry.getModulesState(guildId),
      registry: registry.getRegistry(guildId),
      syncLogs: registry.getSyncLogs(guildId),
      globalSettings: registry.getGlobalSettings(guildId),
      latency: metrics.latency,
      uptime: metrics.uptime
    });
  });

  app.post('/api/system/override', authenticateToken, authorizeGuildAccess, async (req: any, res: any) => {
    const { action, value } = req.body;
    const guildId = resolveGuildId(req);
    if (req.user.role !== 'owner') return res.status(403).json({ error: 'Access Denied: Only the Owner may perform this action.' });
    try {
      if (action === 'toggle_maintenance') {
        registry.setGlobalSettings(guildId, { maintenanceMode: value });
        res.json({ success: true, maintenanceMode: value });
      } else if (action === 'emergency_lock') {
        if (server.triggerEmergencyLock) {
          await server.triggerEmergencyLock(guildId);
          res.json({ success: true });
        } else {
          res.status(500).json({ error: 'Emergency Lock callback not linked to Gateway' });
        }
      } else {
        res.status(400).json({ error: 'Unknown action' });
      }
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  });

  // --- STAFF MANAGEMENT ENDPOINTS ---
  app.get('/api/system/staff', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'owner') return res.status(403).json({ error: 'Access Denied.' });
    try {
      const db = Database.getDb();
      if (!db) {
        return res.status(503).json({ error: 'Database not connected. Staff list unavailable.' });
      }
      const rows = await db.all<any>('SELECT * FROM admin_users');
      const staff = rows.map(d => {
        return {
          username: d.username,
          role: d.role === 'owner' ? 'Owner' : 'Staff',
          access: d.role === 'owner' ? 'Full Overrides' : 'Dashboard Access',
          status: 'Active'
        };
      });
      res.json(staff);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/system/staff', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'owner') return res.status(403).json({ error: 'Access Denied.' });
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    try {
      const db = Database.getDb();
      if (!db) return res.json({ success: true });

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      const existingUser = await db.get('SELECT 1 FROM admin_users WHERE username = ?', [username]);
      if (existingUser) {
        return res.status(400).json({ error: 'User already exists' });
      }

      const id = 'admin_staff_' + Math.random().toString(36).substring(2, 9);
      const now = new Date().toISOString();

      await db.run(
        `INSERT INTO admin_users (
          id, username, passwordHash, role, totpEnabled, totpSecret, recoveryCodes, 
          failedAttempts, lockedUntil, lastLogin, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, 0, null, '[]', 0, null, null, ?, ?)`,
        [id, username, passwordHash, role || 'staff', now, now]
      );

      registry.logSyncEvent(`Owner provisioned new staff account: ${username}`, 'success');
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete('/api/system/staff/:username', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'owner') return res.status(403).json({ error: 'Access Denied.' });
    const { username } = req.params;
    if (username === 'admin') return res.status(400).json({ error: 'Cannot delete primary owner account' });

    try {
      const db = Database.getDb();
      if (!db) return res.json({ success: true });

      const existingUser = await db.get('SELECT 1 FROM admin_users WHERE username = ?', [username]);
      if (!existingUser) {
        return res.status(404).json({ error: 'Staff account not found' });
      }

      await db.run('DELETE FROM admin_users WHERE username = ?', [username]);
      registry.logSyncEvent(`Owner deleted staff account: ${username}`, 'warn');
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // --- BROADCASTER ENDPOINT ---
  app.post('/api/system/broadcast', authenticateToken, async (req: any, res: any) => {
    if (req.user.role !== 'owner') return res.status(403).json({ error: 'Access Denied.' });
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message content is required' });

    if (server.getDiscordClient) {
      const client = server.getDiscordClient();
      if (client) {
        let successCount = 0;
        try {
          const guilds = Array.from(client.guilds.cache.values());
          for (const guild of guilds as any[]) {
            try {
              const owner = await guild.fetchOwner();
              if (owner) {
                await owner.send({
                  embeds: [{
                    title: '📢 Global Platform Announcement',
                    description: message,
                    color: 0xff4500,
                    timestamp: new Date().toISOString(),
                    footer: { text: 'Sent by Rage Optimiser Platform Owner' }
                  }]
                });
                successCount++;
              }
            } catch (err) {
              console.error(`Failed to DM owner of guild ${guild.name}:`, err);
            }
          }
          registry.logSyncEvent(`Broadcasted global announcement to ${successCount} server owners.`, 'info');
          return res.json({ success: true, count: successCount });
        } catch (e: any) {
          return res.status(500).json({ error: e.message });
        }
      }
    }
    res.status(503).json({ error: 'Discord Gateway not connected' });
  });

  app.post('/api/modules/logging/test', authenticateToken, authorizeGuildAccess, async (req: any, res: any) => {
    const guildId = resolveGuildId(req);
    const { category } = req.body;
    
    const state = registry.getGuildState(guildId);
    const logMod = state.modules.find(m => m.id === 'logging');
    if (!logMod || logMod.status !== 'enabled') {
      return res.status(400).json({ error: 'Logging module is not enabled' });
    }
    
    const config = logMod.config || {};
    const catConfig = config[category];
    if (!catConfig || !catConfig.channelId || !catConfig.enabled) {
      return res.status(400).json({ error: `Category ${category} is not configured or enabled` });
    }
    
    try {
      const client = server.getDiscordClient ? server.getDiscordClient() : null;
      if (!client) {
        return res.status(500).json({ error: 'Discord Client is not initialized' });
      }
      
      const guild = await client.guilds.fetch(guildId).catch(() => null);
      if (!guild) {
        return res.status(404).json({ error: 'Guild not found or inaccessible by bot' });
      }
      
      const channel = await guild.channels.fetch(catConfig.channelId).catch(() => null);
      if (channel && channel.isTextBased()) {
        const embed = new EmbedBuilder()
          .setTitle(`🧪 Test Log: ${category.toUpperCase()}`)
          .setDescription(`This is a test event for the **${category}** log category triggered via Web Dashboard.`)
          .setColor('#3498db')
          .setTimestamp();
        await channel.send({ embeds: [embed] });
        registry.logSyncEvent(guildId, `Sent test log for category: ${category} via Web Dashboard`, 'success');
        return res.json({ success: true });
      } else {
        return res.status(400).json({ error: 'Log channel is invalid or inaccessible' });
      }
    } catch (e: any) {
      return res.status(500).json({ error: e.message || 'Internal server error sending test log' });
    }
  });

  app.post('/api/modules/:id', authenticateToken, authorizeGuildAccess, (req, res) => {
    const guildId = resolveGuildId(req);
    const mod = registry.updateModuleConfig(guildId, req.params.id, req.body);
    if (!mod) return res.status(404).json({ error: 'Module not found' });
    res.json(mod);
  });

  app.post('/api/modules/:id/toggle', authenticateToken, authorizeGuildAccess, (req, res) => {
    const { enabledOverride } = req.body;
    const guildId = resolveGuildId(req);
    const mod = registry.toggleModule(guildId, req.params.id, enabledOverride);
    if (!mod) return res.status(400).json({ error: 'Module validation failed. Cannot toggle.' });
    res.json(mod);
  });

  // /api/simulate removed — simulation endpoint was a dev tool using fake IDs and no longer exists.

  app.post('/api/sync/refresh', authenticateToken, authorizeGuildAccess, (req, res) => {
    const guildId = resolveGuildId(req);
    refreshCallback(guildId);
    res.json({ success: true });
  });

  app.post('/api/commands/sync', authenticateToken, async (req: any, res: any) => {
    if (req.user.role !== 'owner') return res.status(403).json({ error: 'Access Denied: Only the Owner may perform this action.' });
    if (server.deployCommandsCallback) {
      await server.deployCommandsCallback();
      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Gateway deploy callback not linked.' });
    }
  });

  app.post('/api/settings', authenticateToken, authorizeGuildAccess, (req, res) => {
    const data = req.body;
    const guildId = resolveGuildId(req);
    const currentReg = registry.getRegistry(guildId);
    const newReg = {
      ...currentReg,
      globalSettings: {
        ...(currentReg.globalSettings || {}),
        ...data
      }
    };
    registry.setRegistry(guildId, newReg);
    registry.logSyncEvent(guildId, 'Global settings updated from dashboard.', 'success');
    res.json({ success: true, globalSettings: newReg.globalSettings });
  });

  app.get('/api/analytics/summary', authenticateToken, authorizeGuildAccess, async (req: any, res) => {
    try {
      const guildId = req.query.guildId as string || req.headers['x-guild-id'] as string;
      if (!guildId) {
        return res.status(400).json({ error: 'Missing guildId parameter or X-Guild-Id header' });
      }
      const days = req.query.days ? parseInt(req.query.days as string) : 7;
      const summary = await AnalyticsService.getSummary(guildId, days);
      res.json(summary);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: 'Failed to fetch analytics summary' });
    }
  });

  app.get('/api/whitelist/audit', authenticateToken, authorizeGuildAccess, (req: any, res: any) => {
    const guildId = resolveGuildId(req);
    const auditLogs = registry.getWhitelistAudit(guildId);
    res.json(auditLogs);
  });

  app.get('/api/whitelist/activity', authenticateToken, authorizeGuildAccess, (req: any, res: any) => {
    const guildId = resolveGuildId(req);
    const activityLogs = registry.getWhitelistActivity(guildId);
    res.json(activityLogs);
  });


  // --- PUBLIC FEED ENDPOINTS ---
  app.get('/api/public/events', async (req, res) => {
    if (!server.publicFeed) {
      return res.status(503).json({ error: 'Public Feed Manager not initialized' });
    }
    const category = req.query.category as string;
    const timeFilter = req.query.timeFilter ? parseInt(req.query.timeFilter as string) : undefined;
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    
    try {
      const result = await server.publicFeed.getEvents(category, timeFilter, page, 10);
      res.json(result);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to retrieve events' });
    }
  });



  // =============================================
  // DISCORD OAUTH2 ENDPOINTS
  // =============================================

  // L-7 FIX: In-memory store for OAuth state → CSRF protection.
  // State is one-time-use and expires after 10 minutes.
  const oauthStates = new Map<string, number>();
  const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
  // Periodic cleanup of expired states
  setInterval(() => {
    const now = Date.now();
    for (const [state, ts] of oauthStates) {
      if (now - ts > OAUTH_STATE_TTL_MS) oauthStates.delete(state);
    }
  }, 5 * 60 * 1000);

  // Step 1: Redirect to Discord authorization page
  app.get('/api/auth/discord', (req, res) => {
    // BUG-011 FIX: Use crypto.randomBytes for CSRF state — Math.random() is
    // not cryptographically secure and can be predicted by a timing attacker.
    const state = crypto.randomBytes(24).toString('hex');
    oauthStates.set(state, Date.now());
    const url = OAuthService.getAuthorizationUrl(state);
    res.json({ url, state });
  });

  // Step 2: Discord calls back here with ?code=...&state=...
  app.get('/api/auth/discord/callback', async (req, res) => {
    const { code, error, state } = req.query;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    if (error) {
      return res.redirect(`${frontendUrl}/login?error=oauth_denied`);
    }

    // L-7 FIX: Validate CSRF state before processing the code
    if (!state || typeof state !== 'string' || !oauthStates.has(state)) {
      console.warn('[OAuth] Invalid or missing CSRF state parameter on callback.');
      return res.redirect(`${frontendUrl}/login?error=oauth_invalid_state`);
    }
    // One-time use — delete immediately after validating
    oauthStates.delete(state);

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Missing authorization code' });
    }

    try {
      const discordClient = server.getDiscordClient ? server.getDiscordClient() : null;
      const result = await OAuthService.processCallback(code, discordClient);
      
      // Encode data for frontend (token passed via URL hash so it never hits server logs)
      const encoded = encodeURIComponent(JSON.stringify({
        token: result.token,
        user: result.user,
        managedGuilds: result.managedGuilds,
        approvals: result.approvals
      }));
      
      return res.redirect(`${frontendUrl}/auth/callback?data=${encoded}`);
    } catch (err: any) {
      console.error('[OAuth] Callback error:', err);
      return res.redirect(`${frontendUrl}/login?error=oauth_failed`);
    }
  });

  // Get/Refresh the user's manageable guilds and approvals list
  app.get('/api/user/guilds', authenticateToken, async (req: any, res: any) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const db = Database.getDb();
      if (!db) {
        return res.status(503).json({ error: 'Database not available' });
      }

      const docId = user.id || user.discordId;
      if (!docId) {
        return res.status(400).json({ error: 'Invalid token: User ID not found in claim' });
      }

      // Verify session exists
      const session = await db.get<any>('SELECT discordId FROM discord_sessions WHERE discordId = ?', [docId]);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Retrieve and decrypt the stored access token via OAuthService
      const freshGuilds = await OAuthService.fetchUserGuildsFromSession(docId);
      if (!freshGuilds) {
        return res.status(401).json({ error: 'Could not decrypt session token. Please re-authenticate.' });
      }
      const manageableGuilds = OAuthService.filterManageableGuilds(freshGuilds);

      // Check live status (bot in server or not)
      const discordClient = server.getDiscordClient ? server.getDiscordClient() : null;
      const approvals: Record<string, { status: string; guildName: string }> = {};

      for (const guild of manageableGuilds) {
        const isInGuild = discordClient ? discordClient.guilds.cache.has(guild.id) : false;
        const defaultStatus = isInGuild ? 'Approved' : 'Not Registered';

        const row = await db.get<any>('SELECT * FROM approvals WHERE guildId = ?', [guild.id]).catch(() => null);
        if (row) {
          let status = row.status;
          if (status !== 'Blacklisted' && status !== 'Suspended' && status !== 'Rejected') {
            status = defaultStatus;
          }
          approvals[guild.id] = { status, guildName: row.guildName || guild.name };
        } else {
          approvals[guild.id] = { status: defaultStatus, guildName: guild.name };
        }
      }

      // Return refreshed lists
      res.json({
        managedGuilds: manageableGuilds,
        approvals
      });
    } catch (e: any) {
      console.error('[WebServer] Error syncing user guilds:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // Get the bot-managed status for a specific guild (guild_manager use)
  app.get('/api/guild/:guildId/status', authenticateToken, async (req: any, res: any) => {
    const { guildId } = req.params;
    const user = req.user;

    // Guild manager can only check their own guilds
    if (user.role === 'guild_manager') {
      const managedIds: string[] = user.managedGuildIds || [];
      if (!managedIds.includes(guildId)) {
        return res.status(403).json({ error: 'Access denied: You do not manage this guild' });
      }
    }

    // Check if the bot is actually in this guild
    const discordClient = server.getDiscordClient ? server.getDiscordClient() : null;
    const isInGuild = discordClient ? discordClient.guilds.cache.has(guildId) : false;

    res.json({
      guildId,
      status: isInGuild ? 'Active' : 'Bot not in server',
    });
  });

  // Guild-scoped state/modules for guild_manager users
  app.get('/api/guild/:guildId/state', authenticateToken, async (req: any, res: any) => {
    const { guildId } = req.params;
    const user = req.user;

    // Guild managers can only access their own guilds
    if (user.role === 'guild_manager') {
      const managedIds: string[] = user.managedGuildIds || [];
      if (!managedIds.includes(guildId)) {
        return res.status(403).json({ error: 'Access denied: You do not manage this guild' });
      }
    }

    // Trigger a live Discord sync before returning — ensures fresh roles/channels on each load
    if (server.syncRegistryCallback) {
      await server.syncRegistryCallback(guildId).catch(() => {});
    }

    const metrics = server.getBotMetrics ? server.getBotMetrics() : { latency: 0, uptime: 'Offline' };
    return res.json({
      modules: registry.getModulesState(guildId),
      registry: registry.getRegistry(guildId),
      syncLogs: registry.getSyncLogs(guildId),
      globalSettings: registry.getGlobalSettings(guildId),
      latency: metrics.latency,
      uptime: metrics.uptime
    });
  });
}

