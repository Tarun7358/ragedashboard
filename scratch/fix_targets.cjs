const fs = require('fs');
const p = 'backend/src/modules/security/enable.ts';
let s = fs.readFileSync(p, 'utf8');
const helper = `
/**
 * Command-level target resolution: canonical ID, then fold voice sub-systems into the
 * 'voice' suite and audit aliases into 'logging' (preserves pre-refactor enable/disable UX).
 */
function resolveCommandTarget(raw: string): string {
  const t = resolveCanonicalModuleId(raw);
  if (t === 'join_to_create' || t === 'voice_manager' || t === 'voice-protection') return 'voice';
  if (t === 'audit') return 'logging';
  return t;
}
`;
const nl = s.includes('\r\n') ? '\r\n' : '\n';
const marker = 'export const MODULE_ALIASES: Record<string, string> = MODULE_ALIAS_MAP;';
if (!s.includes(marker)) throw new Error('marker missing');
s = s.replace(marker, marker + nl + helper.replace(/\n/g, nl));
const before = (s.match(/const target = resolveCanonicalModuleId\(rawTarget\);/g) || []).length;
s = s.replace(/const target = resolveCanonicalModuleId\(rawTarget\);/g, 'const target = resolveCommandTarget(rawTarget);');
fs.writeFileSync(p, s);
console.log('replaced', before);
