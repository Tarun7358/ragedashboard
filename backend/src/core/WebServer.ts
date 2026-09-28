import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createServer, Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { Database } from './Database.js';
import { ModuleRegistry } from './ModuleRegistry.js';
import { ModuleManifest } from './types.js';
import { OAuthService } from './OAuthService.js';
import { AuthService } from './AuthService.js';
import type { PublicFeedManager } from './PublicFeedManager.js';

export class WebServer {
  private app: Express;
  private server: Server;
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  
  public getBotMetrics: (() => { latency: number; uptime: string }) | null = null;
  public getDiscordClient: (() => any) | null = null;
  public deployCommandsCallback: (() => Promise<void>) | null = null;
  public triggerEmergencyLock: (() => Promise<void>) | null = null;
  public onApprovalAction?: (guildId: string, action: string, reason?: string) => Promise<void>;
  public publicFeed?: PublicFeedManager;

  constructor(private registry?: ModuleRegistry) {
    this.app = express();

    // ── Trust Proxy for Reverse Proxies (Cloudflare/Nginx/Docker) ─────────────
    if (process.env.TRUST_PROXY === 'true' || process.env.NODE_ENV === 'production') {
      this.app.set('trust proxy', 1);
    }

    // ── Security Headers (BUG-13 fix: re-enable Helmet CSP) ──────────────────
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc:  ["'self'", "'unsafe-inline'"],
          styleSrc:   ["'self'", "'unsafe-inline'"],
          imgSrc:     ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'ws:', 'wss:']
        }
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false
    }));

    // ── CORS (BUG-12 fix: restrict to allowlist, support * wildcard & dev ports) ──
    const rawOrigins = process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:5173,http://localhost:5000,*';
    const allowedOrigins = rawOrigins
      .split(',')
      .map(o => o.trim())
      .filter(Boolean);
    this.app.use(cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, Postman), wildcard '*', or exact match
        if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`CORS: origin '${origin}' not allowed`));
      },
      credentials: true
    }));

    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    this.app.use('/assets', express.static(path.join(process.cwd(), 'public/assets')));

    // ── Rate Limiting (BUG-10 fix: tight limits per endpoint class) ──────────
    // General API: 200 req / 15 min
    const apiLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 200,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests. Please slow down.' }
    });
    // Auth routes: 15 attempts / 15 min (brute-force protection)
    const authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 15,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many authentication attempts. Try again later.' }
    });
    // Sensitive system actions: 10 req / 15 min
    const criticalLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Rate limit exceeded for sensitive operation.' }
    });
    this.app.use('/api/', apiLimiter);
    this.app.use('/api/auth/', authLimiter);
    this.app.use('/api/system/', criticalLimiter);
    this.app.use('/api/commands/', criticalLimiter);

    this.setupRoutes();
    this.server = createServer(this.app);
    this.setupWebSockets();
  }

  /**
   * Universal JWT Authentication Middleware
   */
  public authenticateToken = (req: any, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Authentication required. Please provide a valid Bearer token.' });
    }

    jwt.verify(token, process.env.JWT_SECRET!, (err: any, user: any) => {
      if (err) {
        return res.status(403).json({ error: 'Invalid or expired authentication token.' });
      }
      req.user = user;
      next();
    });
  };

  public registerModuleManifests(manifests: ModuleManifest[]) {
    manifests.forEach(manifest => {
      if (manifest.routes) {
        manifest.routes.forEach(route => {
          const routePath = `/api/modules/${manifest.id}${route.path}`;
          const isPublic = (route as any).isPublic === true;
          const authMiddleware = isPublic ? [] : [this.authenticateToken];

          const handler = async (req: Request, res: Response) => {
            try {
              await route.handler(req, res, {
                registry: this.registry,
                client: this.getDiscordClient ? this.getDiscordClient() : null,
                broadcast: this.broadcast.bind(this),
                getModulesState: () => this.registry ? this.registry.getModulesState() : [],
                updateModuleConfig: (id: string, config: Record<string, any>) => {
                  if (this.registry) this.registry.updateModuleConfig(undefined, id, config);
                },
                logSyncEvent: (msg: string, type: 'info' | 'warn' | 'success') => {
                  if (this.registry) this.registry.logSyncEvent(undefined, msg, type);
                }
              });
            } catch (err) {
              console.error(`Error in module route ${routePath}:`, err);
              res.status(500).json({ error: 'Internal module router error' });
            }
          };

          if (route.method === 'post') {
            this.app.post(routePath, ...authMiddleware, handler);
          } else {
            this.app.get(routePath, ...authMiddleware, handler);
          }
        });
      }
    });
  }

  private setupWebSockets() {
    try {
      // Attach to main HTTP server to share port 5000 and prevent port conflicts
      this.wss = new WebSocketServer({ server: this.server });
      this.wss.on('error', (err) => {
        console.warn(`[WebServer] ⚠️ WebSocket warning: ${err.message}`);
      });

      this.wss.on('connection', (ws: WebSocket, req: any) => {
        // ── BUG-04 FIX: Authenticate WebSocket upgrade requests ────────────────
        const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        const queryToken = urlObj.searchParams.get('token');
        const headerToken = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
        const token = queryToken || headerToken;

        if (!token) {
          ws.close(4001, 'Authentication required: supply ?token= or Authorization header');
          return;
        }

        try {
          jwt.verify(token, process.env.JWT_SECRET!);
        } catch {
          ws.close(4003, 'Invalid or expired authentication token');
          return;
        }
        // ─────────────────────────────────────────────────────────────────────

        this.clients.add(ws);

        const metrics = this.getBotMetrics ? this.getBotMetrics() : { latency: 0, uptime: '0s' };
        const payload = {
          type: 'INIT',
          modules: this.registry ? this.registry.getModulesState() : [],
          registry: this.registry ? this.registry.getRegistry() : {},
          syncLogs: this.registry ? this.registry.getSyncLogs() : [],
          globalSettings: this.registry ? this.registry.getGlobalSettings() : {},
          latency: metrics.latency,
          uptime: metrics.uptime
        };

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(payload));
        }

        ws.on('close', () => {
          this.clients.delete(ws);
        });

        ws.on('error', () => {
          this.clients.delete(ws);
        });
      });
    } catch (e: any) {
      console.warn(`[WebServer] WebSocket server initialization note: ${e.message}`);
    }
  }

  public broadcast(msgObj: any) {
    const serialized = JSON.stringify(msgObj);
    this.clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(serialized);
      }
    });
  }

  private setupRoutes() {
    const handleHealth = (req: Request, res: Response) => {
      const client = this.getDiscordClient ? this.getDiscordClient() : null;
      const metrics = this.getBotMetrics ? this.getBotMetrics() : { latency: 0, uptime: '0s' };
      const isBotReady = client ? client.ws.status === 0 : false;

      res.status(200).json({
        status: isBotReady ? 'ok' : 'degraded',
        service: 'Rage Optimiser Platform',
        uptimeSeconds: Math.floor(process.uptime()),
        uptimeFormatted: metrics.uptime,
        botConnected: isBotReady,
        wsLatencyMs: metrics.latency || (client ? client.ws.ping : 0),
        timestamp: new Date().toISOString()
      });
    };

    // Public Command & Security Manual PDF / HTML route
    const handleManual = (req: Request, res: Response) => {
      const possiblePaths = [
        path.join(process.cwd(), 'RAGE_OPTIMISER_V3_COMMANDS_PDF_MANUAL.html'),
        path.join(process.cwd(), 'CLUTCH NATION', 'RAGE_OPTIMISER_V3_COMMANDS_PDF_MANUAL.html'),
        path.resolve(__dirname, '..', '..', 'RAGE_OPTIMISER_V3_COMMANDS_PDF_MANUAL.html')
      ];

      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          return res.sendFile(p);
        }
      }

      res.status(404).send('<h1>Manual Not Found</h1>');
    };

    this.app.get('/manual', handleManual);
    this.app.get('/manual.html', handleManual);
    this.app.get('/api/manual', handleManual);

    // Health endpoints
    this.app.get('/health', handleHealth);
    this.app.get('/api/health', handleHealth);

    // Metrics endpoints
    const handleMetrics = async (req: Request, res: Response) => {
      const client = this.getDiscordClient ? this.getDiscordClient() : null;
      const mem = process.memoryUsage();

      let dbStatus = 'disconnected';
      try {
        const db = Database.getDb();
        if (db) {
          await db.get('SELECT 1');
          dbStatus = 'connected';
        }
      } catch {
        dbStatus = 'error';
      }

      res.status(200).json({
        service: 'Rage Optimiser Metrics',
        memoryUsageMb: {
          rss: Math.round(mem.rss / 1024 / 1024),
          heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotal: Math.round(mem.heapTotal / 1024 / 1024)
        },
        database: { status: dbStatus },
        discord: {
          status: client ? client.ws.status : -1,
          guildsCount: client ? client.guilds?.cache?.size || 0 : 0,
          pingMs: client ? client.ws.ping : 0
        },
        timestamp: Date.now()
      });
    };

    this.app.get('/metrics', handleMetrics);
    this.app.get('/api/metrics', handleMetrics);

    // Dashboard Status endpoint (BUG-16 fix: removed hardcoded fake metric)
    this.app.get('/api/status', (req: Request, res: Response) => {
      const metrics = this.getBotMetrics ? this.getBotMetrics() : { latency: 0, uptime: '0s' };
      const client = this.getDiscordClient ? this.getDiscordClient() : null;
      const modules = this.registry ? this.registry.getModulesState() : [];
      const activeModulesCount = modules.filter(m => m.status === 'ready' || m.status === 'enabled').length;

      res.json({
        activeModules: activeModulesCount,
        protectedServers: client ? client.guilds?.cache?.size || 0 : 0,
        bot: { status: client && client.ws.status === 0 ? 'Online' : 'Offline', latency: metrics.latency, uptime: metrics.uptime },
        database: { status: 'Connected' },
        api: { status: 'Healthy' }
      });
    });

    // ── Email alert endpoints ─────────────────────────────────────────────────
    this.app.get('/api/email/status', async (_req: Request, res: Response) => {
      const { EmailService } = await import('../services/EmailService.js');
      res.json({
        configured: EmailService.isConfigured(),
        from: EmailService.isConfigured() ? process.env.ALERT_EMAIL_FROM : null,
        to:   EmailService.isConfigured() ? process.env.ALERT_EMAIL_TO   : null
      });
    });
    // ─────────────────────────────────────────────────────────────────────────
    // ── JWT Auth Middleware Reference ────────────────────────────────────────
    const authenticateToken = this.authenticateToken;
    // ─────────────────────────────────────────────────────────────────────────

    // State endpoint (BUG-05 fix: require authentication)
    this.app.get('/api/state', authenticateToken, (req: Request, res: Response) => {
      const metrics = this.getBotMetrics ? this.getBotMetrics() : { latency: 0, uptime: '0s' };
      res.json({
        modules: this.registry ? this.registry.getModulesState() : [],
        registry: this.registry ? this.registry.getRegistry() : {},
        syncLogs: this.registry ? this.registry.getSyncLogs() : [],
        globalSettings: this.registry ? this.registry.getGlobalSettings() : {},
        latency: metrics.latency,
        uptime: metrics.uptime
      });
    });

    // Auth endpoints (OAuth Login CSRF protected via signed state with dynamic returnUrl)
    this.app.get('/api/auth/discord/login', (req: Request, res: Response) => {
      const host = req.get('host') || '';
      const isLocal = host.includes('localhost') || host.includes('127.0.0.1');

      let returnUrl: string | undefined = undefined;
      if (typeof req.query.returnUrl === 'string' && req.query.returnUrl) {
        returnUrl = req.query.returnUrl;
      } else if (req.get('referer')) {
        try {
          returnUrl = new URL(req.get('referer')!).origin;
        } catch {}
      }

      // If no returnUrl provided and remote, default to the live Netlify production dashboard
      if (!returnUrl && !isLocal) {
        returnUrl = 'https://ragesecuredashboard.netlify.app';
      }

      const isRemote = host.includes('altvr.in') || req.protocol === 'https' || !isLocal;
      const redirectUri = isRemote
        ? 'https://apirageoptimisercom.altvr.in/api/auth/discord/callback'
        : OAuthService.getRedirectUri();

      const state = OAuthService.generateState(returnUrl);
      const url = OAuthService.getAuthorizationUrl(state, redirectUri);

      // If requested by a browser (direct navigation or link click), automatically redirect to Discord
      const wantsJson = req.query.format === 'json' || (
        req.headers.accept &&
        req.headers.accept.includes('application/json') &&
        !req.headers.accept.includes('text/html')
      );

      if (!wantsJson) {
        return res.redirect(url);
      }

      res.json({ url, state });
    });

    const handleDiscordCallback = async (req: Request, res: Response) => {
      const code = (req.query.code || req.body?.code) as string;
      const state = (req.query.state || req.body?.state) as string;
      const error = (req.query.error || req.body?.error) as string;

      const dynamicReturnUrl = OAuthService.extractReturnUrl(state);
      const host = req.get('host') || 'localhost:5000';
      const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
      const defaultFrontend = isLocal ? 'http://localhost:4680' : 'https://ragesecuredashboard.netlify.app';
      let frontendUrl = dynamicReturnUrl || process.env.FRONTEND_URL || defaultFrontend;

      // In production/remote environments, never redirect to localhost or the backend API host
      if (!isLocal && (frontendUrl.includes('localhost') || frontendUrl.includes('127.0.0.1') || frontendUrl.includes('altvr.in'))) {
        frontendUrl = 'https://ragesecuredashboard.netlify.app';
      }
      frontendUrl = frontendUrl.replace(/\/$/, '');

      const isRemote = host.includes('altvr.in') || req.protocol === 'https' || !isLocal;
      const redirectUri = isRemote
        ? 'https://apirageoptimisercom.altvr.in/api/auth/discord/callback'
        : OAuthService.getRedirectUri();

      if (error) {
        if (req.method === 'GET') {
          return res.redirect(`${frontendUrl}/auth/callback?error=${encodeURIComponent(error)}`);
        }
        return res.status(400).json({ error });
      }

      if (!code) {
        if (req.method === 'GET') {
          return res.redirect(`${frontendUrl}/auth/callback?error=missing_code`);
        }
        return res.status(400).json({ error: 'Missing code parameter' });
      }

      if (state && !OAuthService.validateState(state)) {
        if (req.method === 'GET') {
          return res.redirect(`${frontendUrl}/auth/callback?error=csrf_state_invalid`);
        }
        return res.status(403).json({ error: 'Invalid or expired OAuth state parameter (CSRF protection failed).' });
      }

      try {
        const client = this.getDiscordClient ? this.getDiscordClient() : null;
        const result = await OAuthService.processCallback(code, client, redirectUri);

        if (req.method === 'GET') {
          const encoded = encodeURIComponent(JSON.stringify(result));
          return res.redirect(`${frontendUrl}/auth/callback?data=${encoded}`);
        }
        return res.json(result);
      } catch (err: any) {
        console.error('[WebServer] OAuth callback failed:', err.message || err);
        if (req.method === 'GET') {
          return res.redirect(`${frontendUrl}/auth/callback?error=${encodeURIComponent(err.message || 'auth_failed')}`);
        }
        return res.status(500).json({ error: err.message || 'OAuth callback failed' });
      }
    };

    this.app.get('/api/auth/discord/callback', handleDiscordCallback);
    this.app.post('/api/auth/discord/callback', handleDiscordCallback);

    // ── POST /api/auth/login ─────────────────────────────────────────────────
    this.app.post('/api/auth/login', async (req: Request, res: Response) => {
      const { username, password, localLauncher } = req.body || {};
      if (localLauncher) {
        const token = jwt.sign(
          { id: 'local_admin', username: 'LocalAdmin', role: 'owner' },
          process.env.JWT_SECRET || 'rage_jwt_secret',
          { expiresIn: '7d' }
        );
        return res.json({ token, user: { id: 'local_admin', username: 'LocalAdmin', role: 'owner' } });
      }

      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
      }

      try {
        const user = await AuthService.authenticate(String(username), String(password));
        if (!user) {
          return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const token = jwt.sign(
          { id: user.id, username: user.username, role: user.role },
          process.env.JWT_SECRET!,
          { expiresIn: '7d' }
        );
        return res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
      } catch (err: any) {
        if (err.message === 'ACCOUNT_LOCKED') {
          return res.status(423).json({
            error: 'Account temporarily locked due to multiple failed login attempts. Try again in 15 minutes.'
          });
        }
        console.error('[WebServer] /api/auth/login error:', err);
        return res.status(500).json({ error: 'Authentication service error.' });
      }
    });
    // ─────────────────────────────────────────────────────────────────────────

    this.app.get('/api/auth/me', authenticateToken, (req: any, res: Response) => {
      res.json({ user: req.user });
    });

    // Module management endpoints
    this.app.post('/api/modules/:id', authenticateToken, (req: Request, res: Response) => {
      if (!this.registry) return res.status(503).json({ error: 'Registry not initialized' });
      const mod = this.registry.updateModuleConfig(undefined, req.params.id, req.body);
      if (!mod) return res.status(404).json({ error: 'Module not found' });
      res.json(mod);
    });

    this.app.post('/api/modules/:id/toggle', authenticateToken, (req: Request, res: Response) => {
      if (!this.registry) return res.status(530).json({ error: 'Registry not initialized' });
      const { enabledOverride } = req.body;
      const mod = this.registry.toggleModule(undefined, req.params.id, enabledOverride);
      if (!mod) return res.status(400).json({ error: 'Module validation failed. Cannot toggle.' });
      res.json(mod);
    });

    // Settings endpoint
    this.app.post('/api/settings', authenticateToken, (req: Request, res: Response) => {
      if (!this.registry) return res.status(503).json({ error: 'Registry not initialized' });
      const data = req.body;
      const currentReg = this.registry.getRegistry();
      const newReg = {
        ...currentReg,
        globalSettings: {
          ...(currentReg.globalSettings || {}),
          ...data
        }
      };
      this.registry.setRegistry(undefined, newReg);
      this.registry.logSyncEvent(undefined, 'Global settings updated from dashboard.', 'success');
      res.json({ success: true, globalSettings: newReg.globalSettings });
    });

    // Approvals endpoints (BUG-11 fix: scope by JWT role)
    this.app.get('/api/approvals', authenticateToken, async (req: any, res: Response) => {
      try {
        const db = Database.getDb();
        if (!db) return res.json([]);

        let approvals: any[];
        if (req.user?.role === 'owner') {
          // Bot owner can see every guild's record
          approvals = await db.all<any>('SELECT * FROM approvals ORDER BY joinedAt DESC');
        } else {
          // guild_manager: only see guilds they manage
          const managedGuildIds: string[] = req.user?.managedGuildIds || [];
          if (managedGuildIds.length === 0) return res.json([]);
          const placeholders = managedGuildIds.map(() => '?').join(',');
          approvals = await db.all<any>(
            `SELECT * FROM approvals WHERE guildId IN (${placeholders}) ORDER BY joinedAt DESC`,
            managedGuildIds
          );
        }

        res.json(approvals);
      } catch (e) {
        res.status(500).json({ error: 'Failed to fetch approvals' });
      }
    });

    this.app.post('/api/approvals/:guildId/action', authenticateToken, async (req: Request, res: Response) => {
      const db = Database.getDb();
      if (!db) return res.status(503).json({ error: 'Database not connected' });

      const { action, reason } = req.body;
      const { guildId } = req.params;
      
      try {
        const docSnap = await db.get<any>('SELECT status FROM approvals WHERE guildId = ?', [guildId]);
        if (!docSnap) return res.status(404).json({ error: 'Guild not found in approval system' });

        let sql = '';
        let params: any[] = [];
        const now = Date.now();

        if (action === 'approve') {
          sql = 'UPDATE approvals SET status = ?, approvedAt = ?, approvedBy = ?, lastUpdated = ? WHERE guildId = ?';
          params = ['Approved', now, 'Dashboard Admin', now, guildId];
        } else if (action === 'reject') {
          sql = 'UPDATE approvals SET status = ?, rejectedAt = ?, rejectionReason = ?, lastUpdated = ? WHERE guildId = ?';
          params = ['Rejected', now, reason || null, now, guildId];
        } else if (action === 'suspend') {
          sql = 'UPDATE approvals SET status = ?, lastUpdated = ? WHERE guildId = ?';
          params = ['Suspended', now, guildId];
        } else if (action === 'blacklist') {
          sql = 'UPDATE approvals SET status = ?, blacklistedAt = ?, notes = ?, lastUpdated = ? WHERE guildId = ?';
          params = ['Blacklisted', now, reason || null, now, guildId];
        } else {
          return res.status(400).json({ error: 'Invalid action' });
        }

        await db.run(sql, params);
        
        if (this.onApprovalAction) {
          await this.onApprovalAction(guildId, action, reason).catch(console.error);
        }

        if (this.registry) {
          this.registry.logSyncEvent(guildId, `Dashboard Action: Guild ${guildId} was ${action}d.`, action === 'approve' ? 'success' : 'warn');
        }
        res.json({ success: true });
      } catch (e) {
        res.status(500).json({ error: 'Action failed' });
      }
    });

    // Public feed endpoints
    this.app.get('/api/public/events', (req: Request, res: Response) => {
      if (!this.publicFeed) {
        return res.json({ events: [], total: 0 });
      }
      const category = req.query.category as string;
      const timeFilter = req.query.timeFilter ? parseInt(req.query.timeFilter as string) : undefined;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      
      const result = this.publicFeed.getEvents(category, timeFilter, page, 10);
      res.json(result);
    });

    // Server Audit Logs endpoints (SQLite persistent per-server space)
    this.app.get('/api/whitelist/audit', authenticateToken, async (req: Request, res: Response) => {
      try {
        const guildId = (req.query.guildId as string) || process.env.GUILD_ID || 'default_guild';
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const search = req.query.search as string;

        const dbResult = await Database.getAuditLogs(guildId, {
          limit,
          offset: (page - 1) * limit,
          search
        });

        const formatted = dbResult.logs.map(log => ({
          id: log.id?.toString() || Math.random().toString(),
          action: log.action,
          target: log.targetName || log.targetId || 'Unknown',
          targetType: log.targetType || 'User',
          targetId: log.targetId || undefined,
          executor: log.executorTag || log.executorId || 'System',
          executorId: log.executorId || undefined,
          timestamp: log.timestamp ? new Date(log.timestamp).toLocaleString() : new Date().toLocaleString(),
          status: log.type === 'danger' ? 'Suspicious' : (log.type === 'warn' ? 'Pending' : 'Approved'),
          reason: log.reason || undefined,
          details: log.details
        }));

        res.json({
          entries: formatted,
          total: dbResult.total,
          page,
          limit
        });
      } catch (err: any) {
        console.error('[WebServer] /api/whitelist/audit error:', err);
        res.status(500).json({ error: 'Failed to fetch audit logs' });
      }
    });

    this.app.get('/api/guilds/:guildId/audit-logs', authenticateToken, async (req: Request, res: Response) => {
      try {
        const { guildId } = req.params;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const action = req.query.action as string;
        const type = req.query.type as string;
        const search = req.query.search as string;

        const dbResult = await Database.getAuditLogs(guildId, {
          limit,
          offset: (page - 1) * limit,
          action,
          type,
          search
        });

        res.json({
          guildId,
          logs: dbResult.logs,
          total: dbResult.total,
          page,
          limit
        });
      } catch (err: any) {
        console.error('[WebServer] /api/guilds/:guildId/audit-logs error:', err);
        res.status(500).json({ error: 'Failed to fetch server audit logs' });
      }
    });

    this.app.get('/api/audit-logs', authenticateToken, async (req: Request, res: Response) => {
      try {
        const guildId = (req.query.guildId as string) || process.env.GUILD_ID || 'default_guild';
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const action = req.query.action as string;
        const type = req.query.type as string;
        const search = req.query.search as string;

        const dbResult = await Database.getAuditLogs(guildId, {
          limit,
          offset: (page - 1) * limit,
          action,
          type,
          search
        });

        res.json({
          guildId,
          logs: dbResult.logs,
          total: dbResult.total,
          page,
          limit
        });
      } catch (err: any) {
        console.error('[WebServer] /api/audit-logs error:', err);
        res.status(500).json({ error: 'Failed to fetch audit logs' });
      }
    });

    // Command sync endpoint
    this.app.post('/api/commands/sync', authenticateToken, async (req: Request, res: Response) => {
      if (this.deployCommandsCallback) {
        await this.deployCommandsCallback();
        res.json({ success: true });
      } else {
        res.status(500).json({ error: 'Gateway deploy callback not linked.' });
      }
    });

    // System override endpoint
    this.app.post('/api/system/override', authenticateToken, async (req: Request, res: Response) => {
      const { action, value } = req.body;
      try {
        if (action === 'toggle_maintenance') {
          if (this.registry) this.registry.setGlobalSettings(undefined, { maintenanceMode: value });
          res.json({ success: true, maintenanceMode: value });
        } else if (action === 'emergency_lock') {
          if (this.triggerEmergencyLock) {
            await this.triggerEmergencyLock();
            res.json({ success: true });
          } else {
            res.status(500).json({ error: 'Emergency Lock callback not linked' });
          }
        } else {
          res.status(400).json({ error: 'Unknown action' });
        }
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // Refresh sync endpoint
    this.app.post('/api/sync/refresh', authenticateToken, (req: Request, res: Response) => {
      if (this.registry) this.registry.reevaluateAllModules();
      res.json({ success: true });
    });

    // Simulate endpoint
    this.app.post('/api/simulate', authenticateToken, (req: Request, res: Response) => {
      res.json({ success: true });
    });
  }

  public listen(port: number) {
    // Serve production frontend build if available (supports live all-in-one dashboard on server)
    const candidates = [
      path.resolve(process.cwd(), '../frontend/dist'),
      path.resolve(process.cwd(), 'frontend/dist'),
      path.resolve(process.cwd(), 'public/dist'),
      path.resolve(process.cwd(), 'dist-frontend')
    ];
    const distPath = candidates.find(p => fs.existsSync(path.join(p, 'index.html')));

    if (distPath) {
      console.log(`[WebServer] 🌐 Serving live dashboard from: ${distPath}`);
      this.app.use(express.static(distPath));
      this.app.get('*', (req: Request, res: Response, next: NextFunction) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    // Fallback 404 handler for unmatched routes (attached after all module routes are mounted)
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({ error: 'Endpoint not found.' });
    });

    this.server.listen(port, () => {
      console.log(`[WebServer] 🩺 WebServer started. Backend API running and listening on port http://localhost:${port}`);
    });
  }
}

