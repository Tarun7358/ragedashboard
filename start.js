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
  console.log('🚀 BOOTING RAGE OPTIMISER MULTI-BOT SYSTEM');
  console.log('======================================================\n');

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

  // 2. Start Core Backend & WebServer
  const backendDir = path.resolve(process.cwd(), 'backend');
  const backendProc = startSubprocess(
    'CORE', 
    'node', 
    ['dist/index.js'], 
    backendDir
  );

  // 3. Start Music Backend
  const musicDir = path.resolve(process.cwd(), 'clutch-music');
  const musicProc = startSubprocess(
    'MUSIC', 
    'node', 
    ['dist/index.js'], 
    musicDir
  );

  // 4. Handle Shutdown Signals
  const handleShutdown = (signal) => {
    console.log(`\n[Orchestrator] Received ${signal}. Terminating child processes...`);
    
    let killedCount = 0;
    
    if (backendProc) {
      backendProc.kill(signal);
      killedCount++;
    }
    
    if (musicProc) {
      musicProc.kill(signal);
      killedCount++;
    }

    console.log(`[Orchestrator] Terminated ${killedCount} sub-processes. Shutting down.`);
    process.exit(0);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
}

bootSystem().catch(err => {
  console.error('[Orchestrator] Critical error during boot:', err);
  process.exit(1);
});
