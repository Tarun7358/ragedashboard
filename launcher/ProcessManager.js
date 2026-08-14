const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

class ProcessManager {
  constructor(config, logger, onEvent) {
    this.config = config;
    this.logger = logger;
    this.onEvent = onEvent || (() => {});

    this.processes = {
      backend: null,
      musicBot: null,
      dashboard: null
    };

    this.restartCounts = {
      backend: [],
      musicBot: [],
      dashboard: []
    };

    this.shuttingDown = false;
  }



  _resolveCliScript(basePath, subDirName, relativeCliPath) {
    const subPath = path.resolve(basePath, subDirName, relativeCliPath);
    if (fs.existsSync(subPath)) return subPath;

    const rootPath = path.resolve(basePath, relativeCliPath);
    if (fs.existsSync(rootPath)) return rootPath;

    return relativeCliPath;
  }

  // ─── BACKEND ─────────────────────────────────────────────────────────────────

  async spawnBackend(basePath) {
    const backendPath = path.resolve(basePath, this.config.paths.backend);
    this.logger.info(`Starting backend from: ${backendPath}`);

    return new Promise((resolve, reject) => {
      // Check .env exists
      const envFile = path.join(backendPath, '.env');
      if (!fs.existsSync(envFile)) {
        return reject(new Error(`Backend .env not found at: ${envFile}`));
      }

      const tsxCli = this._resolveCliScript(basePath, this.config.paths.backend, 'node_modules/tsx/dist/cli.mjs');

      const proc = spawn('node', [tsxCli, 'src/index.ts'], {
        cwd: backendPath,
        env: { ...process.env, FORCE_COLOR: '0' },
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      this.processes.backend = proc;
      let resolved = false;

      const onData = (data) => {
        const text = data.toString();
        this.logger.info(`[BACKEND] ${text.trim()}`);
        this.onEvent('backend:log', text.trim());

        // Detect successful startup
        if (!resolved && (text.includes('listening on port') || text.includes('Backend API running') || text.includes('WebServer started'))) {
          resolved = true;
          resolve(proc);
        }
      };

      proc.stdout.on('data', onData);
      proc.stderr.on('data', (data) => {
        const text = data.toString();
        // tsx outputs normal info to stderr, filter real errors
        if (!text.includes('[tsx]') && !resolved && (text.includes('listening') || text.includes('started'))) {
          resolved = true;
          resolve(proc);
        }
        this.logger.debug(`[BACKEND:STDERR] ${text.trim()}`);
        this.onEvent('backend:log', text.trim());
      });

      proc.on('error', (err) => {
        this.logger.error(`Backend spawn error: ${err.message}`);
        if (!resolved) reject(err);
      });

      proc.on('exit', (code, signal) => {
        this.logger.warn(`Backend exited (code=${code}, signal=${signal})`);
        this.processes.backend = null;
        this.onEvent('backend:crashed', { code, signal });
        if (!this.shuttingDown) {
          this._handleCrash('backend', basePath);
        }
      });

      // Poll HTTP endpoint as secondary startup detection
      const startTime = Date.now();
      const timeout = this.config.health.startupTimeoutMs || 60000;
      const poll = setInterval(async () => {
        if (resolved || this.shuttingDown) { clearInterval(poll); return; }
        if (Date.now() - startTime > timeout) {
          clearInterval(poll);
          if (!resolved) {
            resolved = true;
            // Try anyway — backend may have started without the expected log line
            resolve(proc);
          }
          return;
        }
        try {
          await this._ping(`http://localhost:${this.config.ports.backend}/api/health`);
          if (!resolved) {
            resolved = true;
            clearInterval(poll);
            resolve(proc);
          }
        } catch (e) {
          // still starting
        }
      }, 1000);
    });
  }

  // ─── DASHBOARD (Vite dev server) ─────────────────────────────────────────────

  async spawnDashboard(basePath) {
    const dashPath = path.resolve(basePath, this.config.paths.dashboard);
    const port = this.config.ports.dashboard;
    this.logger.info(`Starting dashboard (port ${port}) from: ${dashPath}`);

    return new Promise((resolve, reject) => {
      const viteCli = this._resolveCliScript(basePath, this.config.paths.dashboard, 'node_modules/vite/bin/vite.js');

      const proc = spawn('node', [viteCli, '--port', String(port), '--host', '0.0.0.0'], {
        cwd: dashPath,
        env: { ...process.env, FORCE_COLOR: '0' },
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      this.processes.dashboard = proc;
      let resolved = false;

      const onData = (data) => {
        const text = data.toString();
        this.logger.info(`[DASHBOARD] ${text.trim()}`);
        this.onEvent('dashboard:log', text.trim());

        const portMatch = text.match(/http:\/\/localhost:(\d+)\/?/);
        if (portMatch) {
          proc.actualPort = parseInt(portMatch[1], 10);
        }

        if (!resolved && (text.includes('Local:') || text.includes(`localhost:${port}`) || text.includes('ready in'))) {
          resolved = true;
          resolve({ proc, actualPort: proc.actualPort || port });
        }
      };

      proc.stdout.on('data', onData);
      proc.stderr.on('data', onData);

      proc.on('error', (err) => {
        this.logger.error(`Dashboard spawn error: ${err.message}`);
        if (!resolved) reject(err);
      });

      proc.on('exit', (code, signal) => {
        this.logger.warn(`Dashboard exited (code=${code}, signal=${signal})`);
        this.processes.dashboard = null;
        this.onEvent('dashboard:crashed', { code, signal });
        if (!this.shuttingDown) {
          this._handleCrash('dashboard', basePath);
        }
      });

      // Fallback poll
      const startTime = Date.now();
      const timeout = this.config.health.startupTimeoutMs || 60000;
      const poll = setInterval(async () => {
        if (resolved || this.shuttingDown) { clearInterval(poll); return; }
        if (Date.now() - startTime > timeout) {
          clearInterval(poll);
          if (!resolved) { resolved = true; resolve({ proc, actualPort: port }); }
          return;
        }
        try {
          await this._ping(`http://localhost:${port}`);
          if (!resolved) {
            resolved = true;
            clearInterval(poll);
            resolve({ proc, actualPort: port });
          }
        } catch (e) { /* still starting */ }
      }, 1000);
    });
  }

  // ─── CRASH RECOVERY ──────────────────────────────────────────────────────────

  _handleCrash(name, basePath) {
    const now = Date.now();
    const window = this.config.process.restartWindowMs || 60000;
    const maxRestarts = this.config.process.maxRestarts || 3;

    // Remove old timestamps outside the window
    this.restartCounts[name] = (this.restartCounts[name] || []).filter(t => now - t < window);

    if (this.restartCounts[name].length >= maxRestarts) {
      const msg = `${name} crashed ${maxRestarts} times in ${window/1000}s. Not restarting.`;
      this.logger.error(msg);
      this.onEvent('crash:limit', { name, msg });
      return;
    }

    this.restartCounts[name].push(now);
    const attempt = this.restartCounts[name].length;
    this.logger.warn(`Auto-restarting ${name} (attempt ${attempt}/${maxRestarts})...`);
    this.onEvent('process:restarting', { name, attempt });

    setTimeout(async () => {
      try {
        if (name === 'backend') await this.spawnBackend(basePath);
        if (name === 'musicBot') await this.spawnMusicBot(basePath);
        if (name === 'dashboard') await this.spawnDashboard(basePath);
        this.logger.success(`${name} restarted successfully.`);
        this.onEvent('process:restarted', { name });
      } catch (e) {
        this.logger.error(`Failed to restart ${name}: ${e.message}`);
        this.onEvent('process:restart_failed', { name, error: e.message });
      }
    }, 3000);
  }

  // ─── MANUAL RESTART ──────────────────────────────────────────────────────────

  async restartProcess(name, basePath) {
    this.logger.info(`Manual restart requested for: ${name}`);
    const proc = this.processes[name];
    if (proc) {
      if (process.platform === 'win32') {
        require('child_process').exec(`taskkill /pid ${proc.pid} /T /F`);
      } else {
        proc.kill('SIGTERM');
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    this.restartCounts[name] = []; // Reset crash counter for manual restart
    if (name === 'backend') return this.spawnBackend(basePath);
    if (name === 'musicBot') return this.spawnMusicBot(basePath);
    if (name === 'dashboard') return this.spawnDashboard(basePath);
  }

  // ─── SHUTDOWN ─────────────────────────────────────────────────────────────────

  async shutdown() {
    this.shuttingDown = true;
    this.logger.section('SHUTDOWN SEQUENCE INITIATED');

    const shutdownProcess = (name, timeout) => {
      return new Promise((resolve) => {
        const proc = this.processes[name];
        if (!proc) { resolve(); return; }

        this.logger.info(`Stopping ${name}...`);
        if (process.platform === 'win32') {
          require('child_process').exec(`taskkill /pid ${proc.pid} /T /F`);
        } else {
          proc.kill('SIGTERM');
        }

        const forceKill = setTimeout(() => {
          this.logger.warn(`Force killing ${name}...`);
          try { 
            if (process.platform !== 'win32') proc.kill('SIGKILL'); 
          } catch (e) {}
          resolve();
        }, timeout);

        proc.on('exit', () => {
          clearTimeout(forceKill);
          this.logger.success(`${name} stopped cleanly.`);
          resolve();
        });
      });
    };

    const tout = this.config.process.shutdownTimeoutMs || 5000;
    await shutdownProcess('dashboard', tout);
    await shutdownProcess('musicBot', tout);
    await shutdownProcess('backend', tout);
    this.logger.success('All processes stopped. Launcher exiting.');
  }

  // ─── UTILITIES ────────────────────────────────────────────────────────────────

  _ping(url) {
    return new Promise((resolve, reject) => {
      const req = http.get(url, (res) => {
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')); });
    });
  }

  getStatus() {
    return {
      backend: !!this.processes.backend,
      musicBot: !!this.processes.musicBot,
      dashboard: !!this.processes.dashboard,
      backendPid: this.processes.backend?.pid || null,
      musicBotPid: this.processes.musicBot?.pid || null,
      dashboardPid: this.processes.dashboard?.pid || null
    };
  }
}

module.exports = ProcessManager;
