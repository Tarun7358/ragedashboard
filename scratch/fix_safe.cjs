const fs = require('fs');
const p = 'backend/src/modules/security/enable.ts';
let s = fs.readFileSync(p, 'utf8');
const rep = [
  ["await repairRageBotAdminPermissions(guild).catch(() => { });", "await safe('pipeline:repairRageBotAdminPermissions', repairRageBotAdminPermissions(guild));"],
  ["await ensureRageRoleAtTop(guild).catch(() => { });", "await safe('pipeline:ensureRageRoleAtTop', ensureRageRoleAtTop(guild));"],
  ["await stripPrivilegedNonWhitelistedMembers(guild).catch(() => { });", "await safe('pipeline:stripPrivilegedNonWhitelistedMembers', stripPrivilegedNonWhitelistedMembers(guild));"],
  ["await deploySecurityDashboardToChannel(guild).catch(() => null);", "await safe('pipeline:deploySecurityDashboardToChannel', deploySecurityDashboardToChannel(guild));"],
];
for (const [a, b] of rep) {
  if (!s.includes(a)) console.log('MISSING', a);
  s = s.split(a).join(b);
}
s = s.replace("import { isOwnerOrExtraOwner, checkBypassImmunity } from '../../utils/whitelistCheck.js';", "import { isOwnerOrExtraOwner, checkBypassImmunity } from '../../utils/whitelistCheck.js';\nimport { safe } from '../../utils/safe.js';");
fs.writeFileSync(p, s);

const q = 'backend/src/core/prefix/CommandPipeline.ts';
let c = fs.readFileSync(q, 'utf8');
c = c.replace(/'🔒 \*\*Access Denied\*\*/g, "'**Access Denied**").replace("'🔒 Access Denied:", "'Access Denied:");
fs.writeFileSync(q, c);
console.log('done');
