const fs = require('fs');
const p = 'backend/src/modules/security/enable.ts';
let s = fs.readFileSync(p, 'utf8');
const lines = s.split('\n');
for (let i = 0; i < lines.length; i++) {
  let l = lines[i];
  if (!/\b27 (Anti-Nuke|Protection|Rules|threat)/.test(l)) continue;
  l = l.replace(/\b27 (Anti-Nuke|Protection|Rules|threat)/, '${RULE_COUNT} $1');
  // convert single-quoted string literal containing the placeholder into a template literal
  l = l.replace(/'([^'\r\n]*\$\{RULE_COUNT\}[^'\r\n]*)'/, '`$1`');
  lines[i] = l;
}
s = lines.join('\n');
s = s.replace(/(import \{ DEFAULT_SECURITY_RULES[^\n]*\n)/, '$1\nconst RULE_COUNT = Object.keys(DEFAULT_SECURITY_RULES).length;\n');
fs.writeFileSync(p, s);
console.log((s.match(/RULE_COUNT/g) || []).length);
