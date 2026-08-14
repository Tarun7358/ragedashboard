import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backendSrcModules = path.resolve(__dirname, '..', 'src', 'modules');

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
          } catch (e) {
            console.error(`[Prebuild Clean] Failed to remove ${strayIndexTs}:`, e);
          }
        }
        if (fs.existsSync(strayIndexJs)) {
          try {
            fs.rmSync(strayIndexJs, { force: true });
            console.log(`[Prebuild Clean] Removed stray file: ${strayIndexJs}`);
          } catch (e) {
            console.error(`[Prebuild Clean] Failed to remove ${strayIndexJs}:`, e);
          }
        }
        if (fs.existsSync(straySrcDir)) {
          try {
            fs.rmSync(straySrcDir, { recursive: true, force: true });
            console.log(`[Prebuild Clean] Removed stray directory: ${straySrcDir}`);
          } catch (e) {
            console.error(`[Prebuild Clean] Failed to remove ${straySrcDir}:`, e);
          }
        }
      }
    }
  }
}
