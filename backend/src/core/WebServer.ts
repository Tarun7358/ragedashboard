import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { createServer, Server } from 'http';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Database } from './Database.js';

export class WebServer {
  private app: Express;
  private server: Server;
  public getBotMetrics: (() => { latency: number; uptime: string }) | null = null;
  public getDiscordClient: (() => any) | null = null;

  constructor() {
    this.app = express();

    // Security Headers & CORS
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(express.json());

    // Basic Rate Limiter
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 500,
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use(limiter);

    this.setupRoutes();
    this.server = createServer(this.app);
  }

  private setupRoutes() {
    // 🩺 Minimal HTTP Health Endpoint for Uptime Monitors & Hosting Deployments
    this.app.get('/health', (req: Request, res: Response) => {
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
    });

    // 📊 Minimal HTTP Metrics Endpoint
    this.app.get('/metrics', async (req: Request, res: Response) => {
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
          guildsCount: client ? client.guilds.cache.size : 0,
          pingMs: client ? client.ws.ping : 0
        },
        timestamp: Date.now()
      });
    });

    // Fallback 404 for removed dashboard routes
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({ error: 'Endpoint not found. Web dashboard has been decommissioned in favor of native Discord control suite.' });
    });
  }

  public listen(port: number) {
    this.server.listen(port, () => {
      console.log(`[WebServer] 🩺 Minimal HTTP Health/Metrics server running on http://localhost:${port}`);
    });
  }
}
