import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backendDir = path.resolve(__dirname, '..');
const backendSrcIndex = path.resolve(backendDir, 'src', 'index.ts');

// 1. Check if backend/src/index.ts has been corrupted with stray imports
if (fs.existsSync(backendSrcIndex)) {
  const content = fs.readFileSync(backendSrcIndex, 'utf8');
  if (content.includes('SocialSubscriptionRepository') || content.includes('../../core/types.js')) {
    console.log('[Prebuild Clean] ⚠️ Detected corrupted backend/src/index.ts on host server. Resetting to git HEAD...');
    try {
      execSync('git checkout HEAD -- src/index.ts', { cwd: backendDir });
    } catch (e) {
      console.error('[Prebuild Clean] Failed to git checkout src/index.ts:', e);
    }
  }
}

// 2. Remove any untracked stray module index files
const backendSrcModules = path.resolve(backendDir, 'src', 'modules');
if (fs.existsSync(backendSrcModules)) {
  const dirs = fs.readdirSync(backendSrcModules);
  for (const dir of dirs) {
    const modDir = path.join(backendSrcModules, dir);
    if (fs.statSync(modDir).isDirectory()) {
      // voice-protection legitimately uses index.ts
      if (dir !== 'voice-protection') {
        const strayIndexTs = path.join(modDir, 'index.ts');
        const strayIndexJs = path.join(modDir, 'index.js');
        const straySrcDir = path.join(modDir, 'src');

        if (fs.existsSync(strayIndexTs)) {
          try {
            fs.rmSync(strayIndexTs, { force: true });
            console.log(`[Prebuild Clean] Removed stray file: ${strayIndexTs}`);
          } catch (e) {}
        }
        if (fs.existsSync(strayIndexJs)) {
          try {
            fs.rmSync(strayIndexJs, { force: true });
            console.log(`[Prebuild Clean] Removed stray file: ${strayIndexJs}`);
          } catch (e) {}
        }
        if (fs.existsSync(straySrcDir)) {
          try {
            fs.rmSync(straySrcDir, { recursive: true, force: true });
            console.log(`[Prebuild Clean] Removed stray directory: ${straySrcDir}`);
          } catch (e) {}
        }
      }
    }
  }
}
