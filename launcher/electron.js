const {
  app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage, dialog, screen, globalShortcut
} = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

// ─── CONFIG ────────────────────────────────────────────────────────────────────
const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Base path = parent of launcher/ = project root
const BASE_PATH = path.resolve(__dirname, '..');

// ─── MODULES ───────────────────────────────────────────────────────────────────
const Logger = require('./Logger');
const ProcessManager = require('./ProcessManager');
const HealthMonitor = require('./HealthMonitor');

// Create logs directory
const logsDir = path.resolve(BASE_PATH, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const logger = new Logger(logsDir);

// Forward process events to renderer
const onProcessEvent = (name, data) => {
  if (splashWin && !splashWin.isDestroyed()) {
    splashWin.webContents.send('process:event', { name, data });
  }
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('process:event', { name, data });
  }
};

const pm = new ProcessManager(config, logger, onProcessEvent);
const hm = new HealthMonitor(config, logger, pm, (status) => {
  // Broadcast health to main window
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('health:status', status);
  }
});

// ─── WINDOW REFERENCES ─────────────────────────────────────────────────────────
let splashWin = null;
let mainWin = null;
let tray = null;
let isQuitting = false;
let actualDashboardPort = null;

// ─── ICON SETUP ────────────────────────────────────────────────────────────────
function getIcon() {
  const icoPath = path.join(__dirname, 'assets', 'icon.ico');
  const pngPath = path.join(__dirname, 'assets', 'icon.png');
  const publicPng = path.resolve(BASE_PATH, config.paths.dashboard || 'frontend', 'public', 'cn-logo.png');

  if (fs.existsSync(icoPath)) return nativeImage.createFromPath(icoPath);
  if (fs.existsSync(pngPath)) return nativeImage.createFromPath(pngPath);
  if (fs.existsSync(publicPng)) return nativeImage.createFromPath(publicPng);
  return nativeImage.createEmpty();
}

// ─── SPLASH WINDOW ─────────────────────────────────────────────────────────────
function createSplashWindow() {
  splashWin = new BrowserWindow({
    width: 500,
    height: 520,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    center: true,
    icon: getIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  splashWin.loadFile(path.join(__dirname, 'splash.html'));
  splashWin.on('closed', () => { splashWin = null; });

  // Shadow effect
  splashWin.setHasShadow(true);
}

// ─── MAIN WINDOW ───────────────────────────────────────────────────────────────
function createMainWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWin = new BrowserWindow({
    width: Math.min(1440, width - 100),
    height: Math.min(900, height - 100),
    minWidth: 1100,
    minHeight: 700,
    center: true,
    frame: true,
    title: `Rage Optimiser v${config.version}`,
    icon: getIcon(),
    show: false,
    backgroundColor: '#050508',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const portToUse = actualDashboardPort || config.ports.dashboard;
  const dashUrl = config.dashboard.url ? config.dashboard.url.replace(config.ports.dashboard.toString(), portToUse.toString()) : `http://localhost:${portToUse}`;
  mainWin.loadURL(dashUrl);

  mainWin.once('ready-to-show', () => {
    // Close splash and show main
    setTimeout(() => {
      if (splashWin && !splashWin.isDestroyed()) splashWin.close();
      mainWin.show();
      mainWin.focus();
    }, 600);
  });

  // Minimize to tray instead of closing
  mainWin.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWin.hide();
      if (tray) {
        tray.displayBalloon({
          iconType: 'info',
          title: 'Rage Optimiser',
          content: 'Running in the background. Right-click the tray icon to open or exit.'
        });
      }
    }
  });

  mainWin.on('closed', () => { mainWin = null; });

  // Open external links in browser
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ─── SYSTEM TRAY ───────────────────────────────────────────────────────────────
function createTray() {
  const icon = getIcon();
  tray = new Tray(icon.isEmpty() ? nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==') : icon);
  tray.setToolTip(`Rage Optimiser v${config.version}`);

  const buildMenu = () => Menu.buildFromTemplate([
    {
      label: `Rage Optimiser v${config.version}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: '🖥  Open Dashboard',
      click: () => {
        if (mainWin) {
          mainWin.show();
          mainWin.focus();
        } else {
          createMainWindow();
        }
      }
    },
    { type: 'separator' },

    {
      label: '🔄  Restart Music Bot',
      click: async () => {
        logger.info('Tray: Restart Music Bot requested');
        try {
          await pm.restartProcess('musicBot', BASE_PATH);
          logger.success('Music Bot restarted from tray.');
        } catch (e) {
          logger.error(`Failed to restart music bot: ${e.message}`);
          dialog.showErrorBox('Restart Failed', `Could not restart music bot:\n${e.message}`);
        }
      }
    },
    {
      label: '🔄  Restart Backend',
      click: async () => {
        logger.info('Tray: Restart Backend requested');
        try {
          await pm.restartProcess('backend', BASE_PATH);
        } catch (e) {
          dialog.showErrorBox('Restart Failed', e.message);
        }
      }
    },
    {
      label: '🔄  Restart Dashboard',
      click: async () => {
        logger.info('Tray: Restart Dashboard requested');
        try {
          await pm.restartProcess('dashboard', BASE_PATH);
          if (mainWin) mainWin.reload();
        } catch (e) {
          dialog.showErrorBox('Restart Failed', e.message);
        }
      }
    },
    { type: 'separator' },
    {
      label: '📋  View Logs',
      click: () => shell.openPath(logsDir)
    },
    {
      label: '⚙  Settings',
      click: () => {
        if (mainWin) {
          mainWin.show();
          mainWin.webContents.executeJavaScript("window.location.href = 'http://localhost:" + config.ports.dashboard + "/settings'");
        }
      }
    },
    {
      label: '🔍  Check Updates',
      click: () => shell.openExternal('https://github.com/rageoptimiser')
    },
    { type: 'separator' },
    {
      label: '✕  Exit Rage Optimiser',
      click: () => gracefulShutdown()
    }
  ]);

  tray.setContextMenu(buildMenu());

  tray.on('double-click', () => {
    if (mainWin) {
      mainWin.show();
      mainWin.focus();
    } else {
      createMainWindow();
    }
  });
}

// ─── STARTUP SEQUENCE ──────────────────────────────────────────────────────────
const STEPS = [
  { label: 'Verifying required files' },
  { label: 'Loading configuration' },
  { label: 'Initializing logging system' },
  { label: 'Starting backend API' },
  { label: 'Connecting WebSocket server' },
  { label: 'Connecting Discord bot & Prefix Engine' },
  { label: 'Starting Rage Music bot' },
  { label: 'Starting dashboard server' },
  { label: 'Verifying all connections' },
  { label: 'Opening dashboard' },
  { label: 'Launch complete' }
];

function sendStep(index, prevLabel) {
  if (!splashWin || splashWin.isDestroyed()) return;
  const step = STEPS[index] || { label: 'Working...' };
  splashWin.webContents.send('startup:step', {
    step: step.label,
    label: step.label,
    index,
    total: STEPS.length,
    prev: prevLabel || null
  });
  splashWin.webContents.send('startup:progress', Math.round((index / STEPS.length) * 100));
}

function sendError(stepLabel, error) {
  if (!splashWin || splashWin.isDestroyed()) return;
  logger.error(`Startup failed at "${stepLabel}": ${error}`);
  splashWin.webContents.send('startup:error', { step: stepLabel, error: String(error) });
}

async function runStartupSequence() {
  logger.section('RAGE OPTIMISER STARTUP');
  logger.info(`Version: ${config.version}`);
  logger.info(`Base path: ${BASE_PATH}`);

  let prevLabel = null;
  let stepIdx = 0;

  // ── Step 0: Verify files
  sendStep(stepIdx, prevLabel);
  prevLabel = STEPS[stepIdx].label;
  stepIdx++;
  await sleep(300);
  const backendEnv = path.join(BASE_PATH, 'backend', '.env');
  const backendPkg = path.join(BASE_PATH, 'backend', 'package.json');
  const dashPkg = path.join(BASE_PATH, config.paths.dashboard || 'frontend', 'package.json');

  if (!fs.existsSync(backendEnv)) {
    return sendError(STEPS[0].label, `Missing: backend/.env\n\nPlease create the .env file with your Discord token and other required variables.`);
  }
  if (!fs.existsSync(backendPkg) || !fs.existsSync(dashPkg)) {
    return sendError(STEPS[0].label, 'Missing required package.json files. Ensure the project structure is intact.');
  }
  logger.success('Required files verified.');

  // Create runtime directories
  const dirs = [
    path.join(BASE_PATH, 'logs'),
    path.join(BASE_PATH, 'backups'),
    path.join(BASE_PATH, 'config'),
    path.join(BASE_PATH, 'temp'),
    path.join(BASE_PATH, 'cache'),
    path.join(BASE_PATH, 'database'),
    path.join(BASE_PATH, 'updates'),
    path.join(BASE_PATH, 'runtime')
  ];
  dirs.forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
  logger.info('Runtime directories created.');

  // ── Step 1: Load config
  sendStep(stepIdx, prevLabel);
  prevLabel = STEPS[stepIdx].label;
  stepIdx++;
  await sleep(200);
  logger.success(`Config loaded: dashboard=${config.ports.dashboard}, backend=${config.ports.backend}`);

  // ── Step 2: Init logging
  sendStep(stepIdx, prevLabel);
  prevLabel = STEPS[stepIdx].label;
  stepIdx++;
  await sleep(200);
  logger.success(`Log file: ${logger.getLogPath()}`);

  // ── Step 3: Start backend
  sendStep(stepIdx, prevLabel);
  prevLabel = STEPS[stepIdx].label;
  stepIdx++;
  logger.info('Spawning backend process...');
  try {
    await pm.spawnBackend(BASE_PATH);
    logger.success('Backend API started.');
  } catch (e) {
    return sendError(STEPS[stepIdx - 1].label, e.message);
  }

  // ── Step 4: WebSocket (part of backend, verify port)
  sendStep(stepIdx, prevLabel);
  prevLabel = STEPS[stepIdx].label;
  stepIdx++;
  await sleep(1000);
  logger.success(`WebSocket server on port ${config.ports.websocket} (managed by backend).`);

  // ── Step 5: Discord Bot & Prefix Engine
  sendStep(stepIdx, prevLabel);
  prevLabel = STEPS[stepIdx].label;
  stepIdx++;
  await sleep(3000); // Give Discord bot a moment to connect
  logger.info('Discord bot & Prefix Command System initialized.');

  // ── Step 6: Start Rage Music
  sendStep(stepIdx, prevLabel);
  prevLabel = STEPS[stepIdx].label;
  stepIdx++;
  logger.info('Spawning Rage Music...');
  try {
    await pm.spawnMusicBot(BASE_PATH);
    logger.success('Rage Music started.');
  } catch (e) {
    logger.warn(`Rage Music failed to start: ${e.message}`);
  }

  // ── Step 7: Start dashboard
  sendStep(stepIdx, prevLabel);
  prevLabel = STEPS[stepIdx].label;
  stepIdx++;
  logger.info('Spawning Vite dashboard...');
  try {
    const dashInfo = await pm.spawnDashboard(BASE_PATH);
    actualDashboardPort = dashInfo.actualPort;
    config.ports.dashboard = actualDashboardPort; // Also update config object in memory for tray menu URLs
    logger.success(`Dashboard server started on port ${actualDashboardPort}.`);
  } catch (e) {
    return sendError(STEPS[stepIdx - 1].label, e.message);
  }

  // ── Step 8: Verify connections
  sendStep(stepIdx, prevLabel);
  prevLabel = STEPS[stepIdx].label;
  stepIdx++;
  await sleep(1500);
  let backendOk = false;
  for (let i = 0; i < 10; i++) {
    try {
      await ping(`http://localhost:${config.ports.backend}/api/health`);
      backendOk = true;
      break;
    } catch (_) {
      await sleep(1000);
    }
  }
  if (!backendOk) {
    logger.warn('Backend health check did not respond in time, continuing anyway...');
  }
  logger.success('Connection verification complete.');

  // ── Step 9: Open window
  sendStep(stepIdx, prevLabel);
  prevLabel = STEPS[stepIdx].label;
  stepIdx++;
  await sleep(500);
  createMainWindow();
  logger.success(`Opening dashboard at ${config.dashboard.url}`);

  // ── Step 10: Complete
  sendStep(stepIdx, prevLabel);
  if (splashWin && !splashWin.isDestroyed()) {
    splashWin.webContents.send('startup:complete', {});
  }
  logger.section('RAGE OPTIMISER READY');

  // Start health monitor
  hm.start(BASE_PATH);
}

function registerMediaKeys() {
  logger.info('Registering desktop media keys...');
  
  globalShortcut.register('MediaPlayPause', () => {
    logger.info('MediaPlayPause key pressed');
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('media-key', 'play-pause');
    }
  });

  globalShortcut.register('MediaNextTrack', () => {
    logger.info('MediaNextTrack key pressed');
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('media-key', 'next');
    }
  });

  globalShortcut.register('MediaPreviousTrack', () => {
    logger.info('MediaPreviousTrack key pressed');
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('media-key', 'prev');
    }
  });

  globalShortcut.register('MediaStop', () => {
    logger.info('MediaStop key pressed');
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('media-key', 'stop');
    }
  });
}

// ─── GRACEFUL SHUTDOWN ─────────────────────────────────────────────────────────
async function gracefulShutdown() {
  globalShortcut.unregisterAll();
  if (isQuitting) return;
  isQuitting = true;

  logger.section('SHUTDOWN SEQUENCE');
  hm.stop();

  // Notify dashboard
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.webContents.send('process:event', { name: 'app:shutdown', data: {} });
    await sleep(500);
  }

  await pm.shutdown();
  logger.success('Rage Optimiser shut down cleanly.');

  if (tray) { tray.destroy(); tray = null; }
  app.quit();
}

// ─── IPC HANDLERS ──────────────────────────────────────────────────────────────
ipcMain.on('startup:retry', () => {
  logger.info('Retry requested by user.');
  if (splashWin && !splashWin.isDestroyed()) {
    splashWin.reload();
    setTimeout(() => runStartupSequence(), 500);
  }
});

ipcMain.on('app:exit', () => gracefulShutdown());

// ─── APP LIFECYCLE ─────────────────────────────────────────────────────────────
app.setName('Rage Optimiser');

app.whenReady().then(async () => {
  logger.section('ELECTRON APP READY');

  // Single instance lock
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    logger.warn('Another instance is already running. Exiting.');
    app.quit();
    return;
  }

  app.on('second-instance', () => {
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.show();
      mainWin.focus();
    }
  });

  createSplashWindow();
  createTray();
  registerMediaKeys();

  // Wait for splash to fully load then begin
  splashWin.webContents.once('did-finish-load', () => {
    setTimeout(() => runStartupSequence(), 400);
  });
});

app.on('window-all-closed', (event) => {
  // Don't quit on window close — tray keeps running
  // Only quit via gracefulShutdown()
});

app.on('before-quit', async (event) => {
  if (!isQuitting) {
    event.preventDefault();
    await gracefulShutdown();
  }
});

// ─── UTILITIES ─────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function ping(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => resolve(res.statusCode));
    req.on('error', reject);
    req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}
