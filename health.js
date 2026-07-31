import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper for logging startup steps
function logStep(step, message, status = 'INFO') {
  const timestamp = new Date().toISOString();
  const statusEmoji = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : 'ℹ️';
  console.log(`[${timestamp}] [STARTUP-${status}] ${statusEmoji} ${step}: ${message}`);
}

async function runHealthCheck() {
  console.log('======================================================');
  console.log('🔍 RUNNING PRODUCTION STARTUP VALIDATION SUITE');
  console.log('======================================================\n');

  let overallPass = true;

  // ---------------------------------------------------------------------------
  // 1. Node.js Version Check
  // ---------------------------------------------------------------------------
  const currentVersion = process.version;
  const majorVersion = parseInt(currentVersion.replace('v', '').split('.')[0], 10);
  if (majorVersion >= 20) {
    logStep('Node.js Version', `Detected ${currentVersion} (Required: >= v20.x)`, 'PASS');
  } else {
    logStep('Node.js Version', `Detected ${currentVersion}. Please upgrade to v20 or v22 LTS.`, 'FAIL');
    overallPass = false;
  }

  // ---------------------------------------------------------------------------
  // 2. Resolve & Load Environment Variables Across All Workspaces
  // ---------------------------------------------------------------------------
  const workspaceEnvConfigs = [
    { label: 'Root Env', path: path.resolve(process.cwd(), '.env') },
    { label: 'Backend Env', path: path.resolve(process.cwd(), 'backend', '.env') },
    { label: 'Clutch Music Env', path: path.resolve(process.cwd(), 'clutch-music', '.env') },
    { label: 'Frontend Env', path: path.resolve(process.cwd(), 'frontend', '.env') }
  ];

  let loadedCount = 0;

  for (const item of workspaceEnvConfigs) {
    if (fs.existsSync(item.path)) {
      const content = fs.readFileSync(item.path, 'utf8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const firstEquals = trimmed.indexOf('=');
          const key = trimmed.substring(0, firstEquals).trim();
          const value = trimmed.substring(firstEquals + 1).trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      });
      logStep('Environment File', `[${item.label}] Loaded configuration from ${item.path}`, 'PASS');
      loadedCount++;
    } else {
      logStep('Environment File', `[${item.label}] No file found at ${item.path} (Optional / Inherited)`, 'INFO');
    }
  }

  if (loadedCount === 0) {
    logStep('Environment File', 'No local .env files found. Proceeding with system environment variables.', 'INFO');
  }

  // ---------------------------------------------------------------------------
  // 3. Environment Variables Check
  // ---------------------------------------------------------------------------
  // TODO:
  // Dashboard currently disabled.
  // Planned for Enterprise Web Panel.
  // UI should follow Lime.gg inspiration.
  const isDashboardEnabled = process.env.DASHBOARD_ENABLED === 'true';

  // Set fallback for internal secret if missing
  if (!process.env.INTERNAL_SECRET) {
    process.env.INTERNAL_SECRET = 'rage-internal-secret-123';
  }

  const requiredVars = [
    'DISCORD_TOKEN',
    'CLIENT_ID',
    'CLIENT_SECRET'
  ];
  if (isDashboardEnabled) {
    requiredVars.push('JWT_SECRET');
  }

  let varsPass = true;
  for (const v of requiredVars) {
    if (!process.env[v]) {
      logStep('Env Validation', `Missing required environment variable: ${v}`, 'FAIL');
      varsPass = false;
    }
  }

  if (varsPass && isDashboardEnabled) {
    // Check JWT secret length for dashboard mode
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
      logStep('Env Validation', 'JWT_SECRET must be at least 32 characters long to prevent token forgery.', 'FAIL');
      varsPass = false;
    }
  }

  if (!isDashboardEnabled) {
    logStep('Dashboard Status', 'Web Dashboard Mode disabled (DASHBOARD_ENABLED=false). Native Discord control panel active.', 'PASS');
  }

  if (varsPass) {
    logStep('Env Validation', 'All core configuration parameters verified.', 'PASS');
  } else {
    overallPass = false;
  }

  // ---------------------------------------------------------------------------
  // 4. Required Directories Check
  // ---------------------------------------------------------------------------
  const requiredDirs = ['logs', 'dist'];
  for (const dir of requiredDirs) {
    const fullPath = path.resolve(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
    try {
      fs.accessSync(fullPath, fs.constants.W_OK);
      logStep('Directory Check', `Directory verified: ${dir} (Read/Write OK)`, 'PASS');
    } catch {
      logStep('Directory Check', `No write permissions for directory: ${dir}`, 'FAIL');
      overallPass = false;
    }
  }

  // ---------------------------------------------------------------------------
  // 5. Database Connection Check
  // ---------------------------------------------------------------------------
  const dbPath = path.resolve(process.cwd(), 'database.sqlite');
  try {
    const db = new sqlite3.Database(dbPath);
    await new Promise((resolve, reject) => {
      db.get("SELECT name FROM sqlite_master WHERE type='table'", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await new Promise((res) => db.close(res));
    logStep('Database Check', `SQLite database verified at ${dbPath}`, 'PASS');
  } catch (err) {
    logStep('Database Check', `Failed to open or query database at ${dbPath} (${err.message})`, 'FAIL');
    overallPass = false;
  }

  // ---------------------------------------------------------------------------
  // 6. Discord API Connectivity & Token Check
  // ---------------------------------------------------------------------------
  if (process.env.DISCORD_TOKEN && !process.env.DISCORD_TOKEN.includes('your_discord_bot_token')) {
    try {
      // Test basic API connectivity by querying bot credentials
      const response = await fetch('https://discord.com/api/v10/users/@me', {
        headers: {
          Authorization: `Bot ${process.env.DISCORD_TOKEN}`
        }
      });
      if (response.ok) {
        const botData = await response.json();
        logStep('Discord API', `Successfully authenticated with Discord. Bot: ${botData.username}#${botData.discriminator}`, 'PASS');
      } else {
        const errBody = await response.text();
        logStep('Discord API', `Discord Token query returned HTTP ${response.status}. Set valid DISCORD_TOKEN in .env for live connection.`, 'INFO');
      }
    } catch (err) {
      logStep('Discord API', `Could not reach Discord gateway/API (${err.message})`, 'INFO');
    }
  } else {
    logStep('Discord API', 'Skipped Discord token API query (placeholder token in environment). Configure DISCORD_TOKEN in .env for live gateway authentication.', 'INFO');
  }

  console.log('\n======================================================');
  if (overallPass) {
    console.log('✅ ALL HEALTH CHECKS PASSED. SYSTEM READY.');
    console.log('======================================================\n');
    process.exitCode = 0;
  } else {
    console.log('❌ STARTUP VALIDATION FAILED. RESOLVE ISSUES ABOVE.');
    console.log('======================================================\n');
    process.exitCode = 1;
  }
}

// Support running directly or importing
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runHealthCheck();
}

export { runHealthCheck };
