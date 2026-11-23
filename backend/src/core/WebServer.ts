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
  // Wired by index.ts after gateway is initialized — triggers a live Discord registry sync
  public syncRegistryCallback: ((guildId?: string) => void) | null = null;
  private moduleRouter: express.Router = express.Router();

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
    const isProd = process.env.NODE_ENV === 'production';
    const devOrigins = 'http://localhost:3000,http://localhost:5173,http://localhost:5000';
    const rawOrigins = [
      process.env.CORS_ORIGIN || (isProd ? '' : devOrigins),
      'https://ragesecuredashboard.netlify.app',
      process.env.FRONTEND_URL || '',
      process.env.DASHBOARD_URL || ''
    ].filter(Boolean).join(',');
    const allowedOrigins = rawOrigins
      .split(',')
      .map(o => o.trim())
      .filter(Boolean);
    if (allowedOrigins.includes('*') && isProd) {
      console.warn('[WebServer] SECURITY WARNING: CORS_ORIGIN contains "*" in production. With credentials enabled this is unsafe; set explicit origins.');
    }
    this.app.use(cors({
      origin: (origin, callback) => {
        // No Origin header (server-to-server, curl) is allowed; browsers must match the allowlist.
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        if (allowedOrigins.includes('*')) return callback(null, true);
        callback(null, false);
      },
      credentials: true
    }));

    this.app.use(express.json({ limit: '2mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '2mb' }));

    // ── Block Sensitive File Probes (.env, .git, .sqlite, package.json, etc.) ──
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const p = req.path.toLowerCase();
      if (p.includes('.env') || p.includes('.git') || p.includes('.sqlite') || p.includes('.bak') || p.includes('package.json')) {
        return res.status(404).json({ error: 'Endpoint not found.' });
      }
      next();
    });

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
              const reqGuildId = (req.headers['x-guild-id'] as string) || (req.query.guildId as string) || (req.body?.guildId as string) || undefined;
              await route.handler(req, res, {
                registry: this.registry,
                guildId: reqGuildId,
                client: this.getDiscordClient ? this.getDiscordClient() : null,
                broadcast: this.broadcast.bind(this),
                getModulesState: () => this.registry ? this.registry.getModulesState(reqGuildId) : [],
                updateModuleConfig: (id: string, config: Record<string, any>) => {
                  if (this.registry) this.registry.updateModuleConfig(reqGuildId, id, config);
                },
                logSyncEvent: (msg: string, type: 'info' | 'warn' | 'success') => {
                  if (this.registry) this.registry.logSyncEvent(reqGuildId, msg, type);
                }
              });
            } catch (err) {
              console.error(`Error in module route ${routePath}:`, err);
              res.status(500).json({ error: 'Internal module router error' });
            }
          };

          const subPath = `/${manifest.id}${route.path}`;
          if (route.method === 'post') {
            this.moduleRouter.post(subPath, ...authMiddleware, handler);
            this.app.post(routePath, ...authMiddleware, handler);
          } else {
            this.moduleRouter.get(subPath, ...authMiddleware, handler);
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

        const targetGuildId = urlObj.searchParams.get('guildId') || (req.headers['x-guild-id'] as string) || undefined;
        const metrics = this.getBotMetrics ? this.getBotMetrics() : { latency: 0, uptime: '0s' };
        const payload = {
          type: 'INIT',
          modules: this.registry ? this.registry.getModulesState(targetGuildId) : [],
          registry: this.registry ? this.registry.getRegistry(targetGuildId) : {},
          syncLogs: this.registry ? this.registry.getSyncLogs(targetGuildId) : [],
          globalSettings: this.registry ? this.registry.getGlobalSettings(targetGuildId) : {},
          latency: metrics.latency,
          uptime: metrics.uptime,
          guildId: targetGuildId
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

    // Free Fire MAX Download Endpoint
    this.app.get('/api/download/free-fire-max', (req: Request, res: Response) => {
      const candidates = [
        'C:\\\\Users\\\\rdxyz\\\\Downloads\\\\Free+Fire+MAX+x+NARUTO_2.133.1_APKPure.xapk',
        path.join(process.cwd(), 'downloads', 'Free+Fire+MAX+x+NARUTO_2.133.1_APKPure.xapk')
      ];
      const targetFile = candidates.find(p => fs.existsSync(p));
      if (!targetFile) {
        return res.status(404).json({ error: 'Free Fire update file not found on host machine.' });
      }
      return res.download(targetFile, 'Free+Fire+MAX+x+NARUTO_2.133.1_APKPure.xapk');
    });

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
      const totalMembers = client ? client.guilds?.cache?.reduce((acc: number, g: any) => acc + (g.memberCount || 0), 0) : 0;

      res.json({
        activeModules: activeModulesCount,
        protectedServers: client ? client.guilds?.cache?.size || 0 : 0,
        totalMembers,
        bot: { status: client && client.ws.status === 0 ? 'Online' : 'Offline', latency: metrics.latency, uptime: metrics.uptime },
        database: { status: 'Connected' },
        api: { status: 'Healthy' },
        latency: metrics.latency,
        uptime: metrics.uptime
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

    // Mount dedicated dynamic module router early so module endpoints always match before any fallback
    this.app.use('/api/modules', this.moduleRouter);

    // State endpoint (BUG-05 fix: require authentication)
    this.app.get('/api/state', authenticateToken, (req: Request, res: Response) => {
      const targetGuildId = (req.headers['x-guild-id'] as string) || (req.query.guildId as string) || undefined;
      const metrics = this.getBotMetrics ? this.getBotMetrics() : { latency: 0, uptime: '0s' };
      res.json({
        modules: this.registry ? this.registry.getModulesState(targetGuildId) : [],
        registry: this.registry ? this.registry.getRegistry(targetGuildId) : {},
        syncLogs: this.registry ? this.registry.getSyncLogs(targetGuildId) : [],
        globalSettings: this.registry ? this.registry.getGlobalSettings(targetGuildId) : {},
        latency: metrics.latency,
        uptime: metrics.uptime,
        guildId: targetGuildId
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
      const clientIp = req.ip || req.socket?.remoteAddress || '';
      const isLoopback = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1';
      if (localLauncher && isLoopback) {
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
      const targetGuildId = (req.headers['x-guild-id'] as string) || (req.query.guildId as string) || (req.body?.guildId as string) || undefined;
      const mod = this.registry.updateModuleConfig(targetGuildId, req.params.id, req.body);
      if (!mod) return res.status(404).json({ error: 'Module not found' });
      res.json(mod);
    });

    this.app.post('/api/modules/:id/toggle', authenticateToken, (req: Request, res: Response) => {
      if (!this.registry) return res.status(530).json({ error: 'Registry not initialized' });
      const targetGuildId = (req.headers['x-guild-id'] as string) || (req.query.guildId as string) || (req.body?.guildId as string) || undefined;
      const { enabledOverride } = req.body;
      const mod = this.registry.toggleModule(targetGuildId, req.params.id, enabledOverride);
      if (!mod) return res.status(400).json({ error: 'Module validation failed. Cannot toggle.' });
      res.json(mod);
    });

    // Settings endpoint
    this.app.post('/api/settings', authenticateToken, (req: Request, res: Response) => {
      if (!this.registry) return res.status(503).json({ error: 'Registry not initialized' });
      const targetGuildId = (req.headers['x-guild-id'] as string) || (req.query.guildId as string) || (req.body?.guildId as string) || undefined;
      const data = req.body;
      this.registry.setGlobalSettings(targetGuildId, data);
      const currentReg = this.registry.getRegistry(targetGuildId);
      const newReg = {
        ...currentReg,
        globalSettings: {
          ...(currentReg.globalSettings || {}),
          ...data
        }
      };
      this.registry.setRegistry(targetGuildId, newReg);
      this.registry.logSyncEvent(targetGuildId, 'Global settings updated from dashboard.', 'success');
      res.json({ success: true, globalSettings: this.registry.getGlobalSettings(targetGuildId) });
    });

    // ── WhatsApp Hotline Status, Web QR & Session Reset (Server Deployment Support) ────────
    this.app.get('/api/whatsapp/status', async (_req: Request, res: Response) => {
      try {
        const { WhatsAppService } = await import('../services/WhatsAppService.js');
        res.json(WhatsAppService.getStatus());
      } catch (err: any) {
        res.status(500).json({ error: err?.message || 'Failed to get WhatsApp status' });
      }
    });

    this.app.all('/api/whatsapp/reset', async (_req: Request, res: Response) => {
      try {
        const { WhatsAppService } = await import('../services/WhatsAppService.js');
        await WhatsAppService.resetSession();
        res.setHeader('Content-Type', 'text/html');
        return res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>WhatsApp Session Reset — Rage Optimiser</title>
            <meta http-equiv="refresh" content="3; url=/api/whatsapp/qr">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0B0E14; color: #E6EDF3; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
              .card { background: #161B22; border: 1px solid #30363D; border-radius: 14px; padding: 32px; max-width: 440px; width: 100%; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.6); }
              .badge { display: inline-block; background: rgba(56, 139, 253, 0.15); color: #58A6FF; padding: 4px 14px; border-radius: 20px; font-weight: 600; font-size: 13px; margin-bottom: 14px; border: 1px solid rgba(56, 139, 253, 0.4); }
              h2 { margin: 0 0 10px; font-size: 20px; color: #FFF; }
              p { color: #8B949E; font-size: 14px; line-height: 1.5; margin: 0 0 14px; }
              .hint { font-size: 12px; color: #6E7681; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="badge">SESSION RESET</div>
              <h2>Session Reset Successfully</h2>
              <p>Stale encryption keys, pre-keys, and ratchet sessions have been cleared.</p>
              <p style="color: #F0883E; font-weight: 500;">Make sure you unlinked "Rage Optimiser" in WhatsApp on your phone (Linked Devices).</p>
              <div class="hint">Redirecting to fresh QR code in 3 seconds...</div>
            </div>
          </body>
          </html>
        `);
      } catch (err: any) {
        res.status(500).json({ error: err?.message || 'Failed to reset WhatsApp session' });
      }
    });

    this.app.all('/api/whatsapp/fix-sessions', async (_req: Request, res: Response) => {
      try {
        const { WhatsAppService } = await import('../services/WhatsAppService.js');
        const count = await WhatsAppService.healBadMacSessions();
        res.setHeader('Content-Type', 'text/html');
        return res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>WhatsApp Sessions Healed — Rage Optimiser</title>
            <meta http-equiv="refresh" content="3; url=/api/whatsapp/qr">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0B0E14; color: #E6EDF3; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
              .card { background: #161B22; border: 1px solid #30363D; border-radius: 14px; padding: 32px; max-width: 440px; width: 100%; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.6); }
              .badge { display: inline-block; background: rgba(35, 134, 54, 0.15); color: #3FB950; padding: 4px 14px; border-radius: 20px; font-weight: 600; font-size: 13px; margin-bottom: 14px; border: 1px solid rgba(63, 185, 80, 0.4); }
              h2 { margin: 0 0 10px; font-size: 20px; color: #FFF; }
              p { color: #8B949E; font-size: 14px; line-height: 1.5; margin: 0 0 14px; }
              .hint { font-size: 12px; color: #6E7681; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="badge">SESSIONS HEALED</div>
              <h2>Corrupted Ratchets Purged</h2>
              <p>Purged <strong>${count}</strong> stale session and sender-key files from disk.</p>
              <p style="color: #3FB950; font-weight: 500;">Master login (creds.json) preserved. No QR re-scan required.</p>
              <p style="color: #8B949E; font-size: 13px;">Send a message from WhatsApp now to establish a fresh cryptographic handshake.</p>
              <div class="hint">Returning to status in 3 seconds...</div>
            </div>
          </body>
          </html>
        `);
      } catch (err: any) {
        res.status(500).json({ error: err?.message || 'Failed to heal WhatsApp sessions' });
      }
    });

    this.app.get('/api/whatsapp/qr', async (_req: Request, res: Response) => {
      try {
        const { WhatsAppService } = await import('../services/WhatsAppService.js');
        const status = WhatsAppService.getStatus();

        if (status.connected) {
          res.setHeader('Content-Type', 'text/html');
          return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>WhatsApp Hotline — Connected</title>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0B0E14; color: #E6EDF3; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
                .card { background: #161B22; border: 1px solid #30363D; border-radius: 14px; padding: 32px; max-width: 440px; width: 100%; text-align: center; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
                .status-badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(35, 134, 54, 0.2); color: #3FB950; padding: 6px 14px; border-radius: 20px; font-weight: 600; font-size: 14px; margin-bottom: 16px; border: 1px solid rgba(63, 185, 80, 0.4); }
                h2 { margin: 0 0 10px; font-size: 22px; }
                p { color: #8B949E; font-size: 14px; line-height: 1.5; margin: 0; }
                .group-box { background: #0D1117; border: 1px solid #30363D; border-radius: 8px; padding: 12px; margin-top: 16px; text-align: left; }
                .group-title { font-size: 12px; font-weight: bold; color: #58A6FF; margin-bottom: 4px; }
                .group-val { font-size: 13px; color: #C9D1D9; word-break: break-all; }
                .btn-heal { display: inline-block; background: #238636; border: 1px solid #2ea043; color: #FFF; font-weight: 600; font-size: 13px; padding: 8px 16px; border-radius: 6px; text-decoration: none; transition: background 0.2s; }
                .btn-heal:hover { background: #2ea043; }
                .btn-reset { display: inline-block; background: #21262D; border: 1px solid #30363D; color: #F85149; font-weight: 600; font-size: 13px; padding: 8px 16px; border-radius: 6px; text-decoration: none; transition: background 0.2s; }
                .btn-reset:hover { background: #30363D; color: #FF7B72; }
              </style>
            </head>
            <body>
              <div class="card">
                <div class="status-badge">● HOTLINE ONLINE</div>
                <h2>WhatsApp Connected</h2>
                <p>Linked to Owner: <strong>${status.ownerNumber}</strong></p>
                <div class="group-box">
                  <div class="group-title">💬 Alert Destination</div>
                  <div class="group-val">${status.groupJid}</div>
                </div>
                <p style="margin-top: 14px; font-size: 13px;">💡 <em>Tip: For 100% reliable command execution immune to self-chat whisper desync, use a private WhatsApp group and send <strong>!setgroup</strong>!</em></p>
                <div style="margin-top: 18px; display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
                  <a href="/api/whatsapp/fix-sessions" class="btn-heal">Fix Encryption (Bad MAC)</a>
                  <a href="/api/whatsapp/reset" class="btn-reset" onclick="return confirm('Disconnect & reset WhatsApp keys? You will need to re-scan the QR code.');">Reset / Re-link Session</a>
                </div>
              </div>
            </body>
            </html>
          `);
        }

        const rawQr = WhatsAppService.getLatestQr();
        const pairingCode = WhatsAppService.getLatestPairingCode();

        if (!rawQr) {
          res.setHeader('Content-Type', 'text/html');
          return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>WhatsApp Hotline — Initializing</title>
              <meta http-equiv="refresh" content="3">
              <style>
                body { font-family: -apple-system, sans-serif; background: #0B0E14; color: #E6EDF3; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
                .card { background: #161B22; border: 1px solid #30363D; border-radius: 12px; padding: 32px; text-align: center; }
              </style>
            </head>
            <body>
              <div class="card">
                <h2>Generating WhatsApp QR...</h2>
                <p style="color: #8B949E;">Initializing session. Page will auto-refresh in 3 seconds.</p>
                <div style="margin-top: 16px;"><a href="/api/whatsapp/reset" style="color: #58A6FF; font-size: 12px; text-decoration: none;">Force Reset Session</a></div>
              </div>
            </body>
            </html>
          `);
        }

        const QRCode = (await import('qrcode')).default;
        const qrDataUrl = await QRCode.toDataURL(rawQr, { width: 320, margin: 2, color: { dark: '#000000', light: '#ffffff' } });

        const pairingHtml = pairingCode
          ? '<div class="code-box"><div class="code-label">Or link with pairing code</div><div class="code-val">' + pairingCode + '</div></div>'
          : '';

        const html = '<!DOCTYPE html>' +
          '<html><head><title>Link WhatsApp Hotline — Rage Optimiser</title>' +
          '<meta name="viewport" content="width=device-width, initial-scale=1">' +
          '<meta http-equiv="refresh" content="20">' +
          '<style>' +
          'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0B0E14; color: #E6EDF3; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }' +
          '.card { background: #161B22; border: 1px solid #30363D; border-radius: 16px; padding: 32px; max-width: 420px; width: 100%; text-align: center; box-shadow: 0 12px 32px rgba(0,0,0,0.6); }' +
          'h1 { font-size: 20px; margin: 0 0 8px; color: #FFF; }' +
          '.desc { font-size: 13px; color: #8B949E; margin-bottom: 20px; }' +
          '.qr-box { background: #FFF; padding: 14px; border-radius: 12px; display: inline-block; margin-bottom: 20px; }' +
          '.qr-box img { display: block; max-width: 100%; height: auto; }' +
          '.code-box { background: #0D1117; border: 1px dashed #30363D; border-radius: 8px; padding: 12px; margin-bottom: 20px; }' +
          '.code-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #8B949E; margin-bottom: 4px; }' +
          '.code-val { font-family: monospace; font-size: 20px; font-weight: bold; color: #58A6FF; letter-spacing: 2px; }' +
          'ol { text-align: left; font-size: 13px; color: #8B949E; line-height: 1.6; padding-left: 20px; margin: 0; }' +
          '.refresh-hint { margin-top: 16px; font-size: 11px; color: #6E7681; }' +
          '.reset-link { margin-top: 14px; font-size: 12px; color: #F85149; text-decoration: none; display: inline-block; }' +
          '.reset-link:hover { text-decoration: underline; }' +
          '</style></head><body>' +
          '<div class="card">' +
          '<h1>Link WhatsApp Hotline</h1>' +
          '<div class="desc">Scan with your phone to connect the server alert hotline.</div>' +
          '<div class="qr-box"><img src="' + qrDataUrl + '" alt="WhatsApp QR Code" /></div>' +
          pairingHtml +
          '<ol>' +
          '<li>Open <strong>WhatsApp</strong> on your phone</li>' +
          '<li>Tap <strong>Settings / Menu (⋮) > Linked Devices</strong></li>' +
          '<li>Tap <strong>Link a Device</strong> and point at the QR code above</li>' +
          '</ol>' +
          '<div class="refresh-hint">Page refreshes every 20s for security.</div>' +
          '<div><a href="/api/whatsapp/reset" class="reset-link" onclick="return confirm(\'Clear current session files?\')">🔄 Reset Session & Generate Fresh QR</a></div>' +
          '</div></body></html>';

        res.setHeader('Content-Type', 'text/html');
        return res.send(html);
      } catch (err: any) {
        res.status(500).send('Failed to generate WhatsApp QR: ' + (err?.message || err));
      }
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
    this.app.get('/api/public/events', async (req: Request, res: Response) => {
      if (!this.publicFeed) {
        return res.json({ events: [], total: 0 });
      }
      const category = req.query.category as string;
      const timeFilter = req.query.timeFilter ? parseInt(req.query.timeFilter as string) : undefined;
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      
      const result = await this.publicFeed.getEvents(category, timeFilter, page, 10);
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

    // Refresh sync endpoint — also triggers a live Discord registry pull (roles/channels)
    this.app.post('/api/sync/refresh', authenticateToken, (req: Request, res: Response) => {
      const targetGuildId = (req.headers['x-guild-id'] as string) || (req.query.guildId as string) || undefined;
      if (this.registry) this.registry.reevaluateAllModules(targetGuildId);
      // Trigger a live Discord data pull so roles/channels populate in dropdowns
      if (this.syncRegistryCallback) {
        this.syncRegistryCallback(targetGuildId);
      }
      res.json({ success: true });
    });

    // Simulate endpoint
    this.app.post('/api/simulate', authenticateToken, (req: Request, res: Response) => {
      res.json({ success: true });
    });

    // ── OWNER ADMIN PANEL ROUTES ──────────────────────────────────────────────
    // Middleware: only allow the OWNER_ID Discord user or legacy 'owner' role
    const requireOwner = (req: any, res: Response, next: NextFunction) => {
      const u = req.user;
      if (!u) return res.status(401).json({ error: 'Authentication required.' });
      const ownerIds = (process.env.OWNER_ID || '').split(',').map(s => s.trim()).filter(Boolean);
      if (u.role === 'owner' || u.discordId === '1140892126402596905' || (ownerIds.length > 0 && ownerIds.includes(u.discordId))) return next();
      return res.status(403).json({ error: 'Admin access denied. Owner only.' });
    };

    // GET /api/admin/overview — all guilds summary
    this.app.get('/api/admin/overview', authenticateToken, requireOwner, async (_req: Request, res: Response) => {
      try {
        const client = this.getDiscordClient ? this.getDiscordClient() : null;
        const mem = process.memoryUsage();
        const metrics = this.getBotMetrics ? this.getBotMetrics() : { latency: 0, uptime: '0s' };
        const db = Database.getDb();

        const guilds: any[] = [];
        if (client && client.guilds?.cache) {
          for (const [id, guild] of client.guilds.cache) {
            const modules = this.registry ? this.registry.getModulesState(id) : [];
            const enabledCount = modules.filter((m: any) => m.status === 'ready' || m.status === 'enabled').length;
            const errorCount = modules.filter((m: any) => m.status === 'validation_failed').length;
            let memberCount = guild.memberCount || 0;
            let approvalStatus = 'Unknown';
            try {
              if (db) {
                const row = await db.get<any>('SELECT status FROM approvals WHERE guildId = ?', [id]);
                if (row) approvalStatus = row.status;
              }
            } catch {}
            guilds.push({
              id,
              name: guild.name,
              icon: guild.icon ? `https://cdn.discordapp.com/icons/${id}/${guild.icon}.png` : null,
              memberCount,
              enabledModules: enabledCount,
              errorModules: errorCount,
              totalModules: modules.length,
              approvalStatus,
              securityScore: Math.max(0, Math.round(100 - (errorCount / Math.max(modules.length, 1)) * 100))
            });
          }
        }

        // Recent audit log entries across all guilds
        let recentLogs: any[] = [];
        try {
          if (db) {
            recentLogs = await db.all<any>(
              `SELECT * FROM server_audit_logs ORDER BY timestamp DESC LIMIT 100`
            );
          }
        } catch {}

        res.json({
          guilds,
          system: {
            botOnline: client ? client.ws.status === 0 : false,
            latencyMs: metrics.latency,
            uptime: metrics.uptime,
            memoryMb: Math.round(mem.heapUsed / 1024 / 1024),
            totalMemMb: Math.round(mem.heapTotal / 1024 / 1024),
            guildCount: guilds.length,
            pid: process.pid,
            nodeVersion: process.version,
            startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString()
          },
          recentLogs
        });
      } catch (e: any) {
        console.error('[Admin] /api/admin/overview error:', e);
        res.status(500).json({ error: e.message });
      }
    });

    // GET /api/admin/guild/:guildId/logs — per-guild audit log stream
    this.app.get('/api/admin/guild/:guildId/logs', authenticateToken, requireOwner, async (req: Request, res: Response) => {
      try {
        const { guildId } = req.params;
        const limit = Math.min(parseInt(req.query.limit as string) || 200, 500);
        const db = Database.getDb();
        let logs: any[] = [];
        if (db) {
          try {
            logs = await db.all<any>(
              `SELECT * FROM server_audit_logs WHERE guildId = ? ORDER BY timestamp DESC LIMIT ?`,
              [guildId, limit]
            );
          } catch {
            // table may not exist yet
          }
        }
        // Also include in-memory sync logs from registry
        const syncLogs = this.registry ? this.registry.getSyncLogs(guildId) : [];
        res.json({ guildId, logs, syncLogs });
      } catch (e: any) {
        res.status(500).json({ error: e.message });
      }
    });

    // GET /api/admin/guild/:guildId/modules — per-guild module state
    this.app.get('/api/admin/guild/:guildId/modules', authenticateToken, requireOwner, (req: Request, res: Response) => {
      const { guildId } = req.params;
      const modules = this.registry ? this.registry.getModulesState(guildId) : [];
      res.json({ guildId, modules });
    });

    // POST /api/admin/action — owner global admin actions
    this.app.post('/api/admin/action', authenticateToken, requireOwner, async (req: Request, res: Response) => {
      const { action, guildId, payload } = req.body;
      try {
        const client = this.getDiscordClient ? this.getDiscordClient() : null;
        if (action === 'emergency_lock_all') {
          if (this.triggerEmergencyLock) await this.triggerEmergencyLock();
          this.broadcast({ type: 'ADMIN_ACTION', action: 'emergency_lock_all', ts: Date.now() });
          return res.json({ success: true, action });
        }
        if (action === 'sync_all') {
          if (this.syncRegistryCallback) this.syncRegistryCallback();
          return res.json({ success: true, action });
        }
        if (action === 'broadcast_message' && client && guildId && payload?.message) {
          const guild = client.guilds.cache.get(guildId);
          if (!guild) return res.status(404).json({ error: 'Guild not found' });
          const channels = guild.channels.cache.filter((c: any) => c.type === 0 && c.permissionsFor(client.user)?.has('SendMessages'));
          const channel = channels.first();
          if (channel) await (channel as any).send(payload.message);
          return res.json({ success: true, action, channelId: channel?.id });
        }
        if (action === 'approve_guild' && guildId) {
          if (this.onApprovalAction) await this.onApprovalAction(guildId, 'approve');
          return res.json({ success: true });
        }
        if (action === 'reject_guild' && guildId) {
          if (this.onApprovalAction) await this.onApprovalAction(guildId, 'reject', payload?.reason);
          return res.json({ success: true });
        }
        if (action === 'kick_guild' && guildId && client) {
          const guild = client.guilds.cache.get(guildId);
          if (guild) await guild.leave();
          return res.json({ success: true });
        }
        res.status(400).json({ error: 'Unknown or unsupported admin action.' });
      } catch (e: any) {
        console.error('[Admin] action error:', e);
        res.status(500).json({ error: e.message });
      }
    });
    // ─────────────────────────────────────────────────────────────────────────
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

