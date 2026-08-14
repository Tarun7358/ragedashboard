import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper for starting a process with log prefixing
function startSubprocess(name, cmd, args, cwd) {
  console.log(`[Orchestrator] Starting ${name} in ${cwd}...`);
  const proc = spawn(cmd, args, { cwd });

  proc.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        console.log(`[${name}] ${line}`);
      }
    });
  });

  proc.stderr.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
      if (line.trim()) {
        console.error(`[${name}-ERROR] ${line}`);
      }
    });
  });

  proc.on('close', (code) => {
    console.log(`[Orchestrator] Process ${name} exited with code ${code}`);
  });

  return proc;
}

async function bootSystem() {
  console.log('======================================================');
  // 0. Reset any local container file modifications to match GitHub HEAD cleanly
  try {
    const { execSync } = await import('child_process');
    execSync('git checkout HEAD -- .', { stdio: 'ignore' });
  } catch (e) {}

  // 0. Ensure Native SQLite3 Bindings for Current OS/Architecture
  try {
    const { createRequire } = await import('module');
    const req = createRequire(import.meta.url);
    req('sqlite3');
  } catch (err) {
    console.log('[Orchestrator] 🛠️ Native sqlite3 bindings missing for host architecture. Downloading prebuilt binary...');
    const sqlite3Dir = path.resolve(process.cwd(), 'node_modules', 'sqlite3');
    const prebuildProc = spawn('npx', ['prebuild-install', '-r', 'napi'], { cwd: sqlite3Dir, stdio: 'inherit', shell: true });
    await new Promise((resolve) => prebuildProc.on('close', resolve));
  }

  // 1. Run Health Check Validation
  console.log('[Orchestrator] Running health validation...');
  const healthCheck = spawn('node', ['health.js'], { stdio: 'inherit' });
  
  const healthCode = await new Promise((resolve) => {
    healthCheck.on('close', resolve);
  });

  if (healthCode !== 0) {
    console.error('❌ [Orchestrator] Startup validation failed. Boot sequence aborted.');
    process.exit(1);
  }

  // 2. Ensure Backend dist/index.js exists (auto-build if missing after git pull)
  const backendDir = path.resolve(process.cwd(), 'backend');
  const backendDistPath = path.resolve(backendDir, 'dist', 'index.js');
  if (!fs.existsSync(backendDistPath)) {
    console.log('[Orchestrator] 🔨 backend/dist/index.js not found. Running automatic build...');
    const buildProc = spawn('npm', ['run', 'build', '--workspace=backend'], { stdio: 'inherit', shell: true });
    const buildCode = await new Promise((resolve) => buildProc.on('close', resolve));
    if (buildCode !== 0) {
      console.error('❌ [Orchestrator] Backend build failed. Boot sequence aborted.');
      process.exit(1);
    }
  }

  // 3. Start Core Backend & WebServer
  const backendProc = startSubprocess(
    'CORE', 
    'node', 
    ['dist/index.js'], 
    backendDir
  );

  backendProc.on('close', (code) => {
    console.error(`❌ [Orchestrator] Core backend exited with code ${code}.`);
    process.exit(code || 1);
  });

  // 4. Handle Shutdown Signals
  const handleShutdown = (signal) => {
    console.log(`\n[Orchestrator] Received ${signal}. Terminating child processes...`);
    
    let killedCount = 0;
    
    if (backendProc) {
      backendProc.kill(signal);
      killedCount++;
    }

    console.log(`[Orchestrator] Terminated ${killedCount} sub-processes. Shutting down.`);
    process.exit(0);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  // Keep event loop alive
  await new Promise(() => {});
}

bootSystem().catch(err => {
  console.error('[Orchestrator] Critical error during boot:', err);
  process.exit(1);
});
