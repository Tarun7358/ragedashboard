const http = require('http');
const { exec } = require('child_process');

class HealthMonitor {
  constructor(config, logger, processManager, onStatus) {
    this.config = config;
    this.logger = logger;
    this.pm = processManager;
    this.onStatus = onStatus || (() => {});
    this.interval = null;
    this.lastStatus = {};
    this.basePath = null;

    // Zombie detection: counts consecutive failed HTTP responses while process is "running"
    // If a process has a PID but fails health checks N times in a row, it is killed and respawned.
    const zombieThreshold = (config.health && config.health.zombieThreshold) || 3;
    this.failCounts = { backend: 0, dashboard: 0 };
    this.zombieThreshold = zombieThreshold;
  }

  start(basePath) {
    this.basePath = basePath;
    const ms = this.config.health.checkIntervalMs || 5000;
    this.logger.info(`Health monitor started (interval: ${ms}ms, zombie threshold: ${this.zombieThreshold} consecutive failures)`);
    this.interval = setInterval(() => this._check(), ms);
    // Run once immediately
    this._check();
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      this.logger.info('Health monitor stopped.');
    }
  }

  async _check() {
    const backendPort = this.config.ports.backend;
    const dashPort = this.config.ports.dashboard;

    const [backendOk, dashOk, mem, cpu] = await Promise.all([
      this._pingHttp(`http://localhost:${backendPort}/api/health`),
      this._pingHttp(`http://localhost:${dashPort}`),
      this._getMemUsage(),
      this._getCpuUsage()
    ]);

    const procStatus = this.pm.getStatus();

    const status = {
      timestamp: new Date().toISOString(),
      backend: {
        running: procStatus.backend,
        responding: backendOk,
        pid: procStatus.backendPid
      },
      musicBot: {
        running: procStatus.musicBot,
        responding: procStatus.musicBot, // musicBot runs headless without an HTTP server
        pid: procStatus.musicBotPid
      },
      dashboard: {
        running: procStatus.dashboard,
        responding: dashOk,
        pid: procStatus.dashboardPid
      },
      system: {
        memoryMB: mem,
        cpuPercent: cpu
      }
    };

    this.lastStatus = status;
    this.onStatus(status);

    // ── Zombie Detection ──────────────────────────────────────────────────────
    // A "zombie" process has a live PID but is not responding to HTTP.
    // After N consecutive failures we kill the PID and let ProcessManager respawn it.

    if (procStatus.backend) {
      if (!backendOk) {
        this.failCounts.backend++;
        if (this.failCounts.backend >= this.zombieThreshold) {
          this.logger.warn(`[HealthMonitor] Backend zombie detected (${this.failCounts.backend} consecutive failures). Killing PID ${procStatus.backendPid} and triggering respawn.`);
          this.failCounts.backend = 0;
          await this._killAndRespawn('backend', procStatus.backendPid);
        } else {
          this.logger.warn(`[HealthMonitor] Backend not responding (${this.failCounts.backend}/${this.zombieThreshold}).`);
        }
      } else {
        this.failCounts.backend = 0; // Reset on success
      }
    }



    if (procStatus.dashboard) {
      if (!dashOk) {
        this.failCounts.dashboard++;
        if (this.failCounts.dashboard >= this.zombieThreshold) {
          this.logger.warn(`[HealthMonitor] Dashboard zombie detected (${this.failCounts.dashboard} consecutive failures). Killing PID ${procStatus.dashboardPid} and triggering respawn.`);
          this.failCounts.dashboard = 0;
          await this._killAndRespawn('dashboard', procStatus.dashboardPid);
        } else {
          this.logger.warn(`[HealthMonitor] Dashboard not responding (${this.failCounts.dashboard}/${this.zombieThreshold}).`);
        }
      } else {
        this.failCounts.dashboard = 0;
      }
    }

    if (!procStatus.musicBot) {
      this.logger.warn('Music Bot process is not running.');
    }
  }

  async _killAndRespawn(name, pid) {
    // Force-kill the zombie PID
    try {
      if (process.platform === 'win32') {
        require('child_process').exec(`taskkill /pid ${pid} /T /F`);
      } else {
        process.kill(pid, 'SIGKILL');
      }
    } catch (e) {
      this.logger.warn(`[HealthMonitor] Could not kill PID ${pid}: ${e.message}`);
    }

    // Wait briefly for the OS to release resources
    await new Promise(r => setTimeout(r, 1500));

    // Reset the crash counter so a manual zombie-kill doesn't count against the restart budget
    if (this.pm.restartCounts && this.pm.restartCounts[name]) {
      this.pm.restartCounts[name] = [];
    }

    try {
      if (name === 'backend') await this.pm.spawnBackend(this.basePath);
      if (name === 'dashboard') await this.pm.spawnDashboard(this.basePath);
      this.logger.success(`[HealthMonitor] ${name} respawned successfully after zombie kill.`);
    } catch (e) {
      this.logger.error(`[HealthMonitor] Failed to respawn ${name} after zombie kill: ${e.message}`);
    }
  }

  _pingHttp(url) {
    return new Promise((resolve) => {
      const req = http.get(url, (res) => {
        resolve(res.statusCode < 500);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(2000, () => { req.destroy(); resolve(false); });
    });
  }

  _getMemUsage() {
    return new Promise((resolve) => {
      try {
        const mem = process.memoryUsage();
        // Return total RSS in MB (launcher + approximation)
        resolve(Math.round(mem.rss / 1024 / 1024));
      } catch {
        resolve(0);
      }
    });
  }

  _getCpuUsage() {
    return new Promise((resolve) => {
      if (process.platform !== 'win32') { resolve(0); return; }
      exec('wmic cpu get loadpercentage /value', (err, stdout) => {
        if (err) { resolve(0); return; }
        const match = stdout.match(/LoadPercentage=(\d+)/);
        resolve(match ? parseInt(match[1]) : 0);
      });
    });
  }

  getLastStatus() {
    return this.lastStatus;
  }
}

module.exports = HealthMonitor;
