import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('[build-netlify] Starting dashboard build...');

// 1. Build frontend
try {
  execSync('npm run build --workspace=frontend', { stdio: 'inherit' });
} catch (err) {
  console.warn('[build-netlify] Workspace build failed, falling back to direct vite build...');
  execSync('cd frontend && npx vite build', { stdio: 'inherit' });
}

// 2. Ensure root dist exists and contains frontend dist
const sourceDir = path.resolve('frontend', 'dist');
const targetDir = path.resolve('dist');

if (fs.existsSync(sourceDir)) {
  console.log(`[build-netlify] Copying ${sourceDir} -> ${targetDir}...`);
  fs.cpSync(sourceDir, targetDir, { recursive: true });
  console.log('[build-netlify] Successfully synced frontend/dist to root dist!');
} else {
  console.error('[build-netlify] ERROR: frontend/dist was not found!');
  process.exit(1);
}
