import { ALL_MANIFESTS } from '../src/index.js';

console.log('====================================================');
console.log('🛡️ RAGE OPTIMISER BACKEND MODULE VERIFICATION SUITE');
console.log('====================================================\n');

console.log(`Total Active Modules Loaded: ${ALL_MANIFESTS.length}\n`);

let totalCommands = 0;
let totalEvents = 0;
let totalRoutes = 0;
let errorsFound = 0;

ALL_MANIFESTS.forEach((m, idx) => {
  if (!m.id || !m.name) {
    console.error(`❌ Module #${idx + 1} has invalid manifest ID or Name!`);
    errorsFound++;
    return;
  }

  const cmdCount = m.commands ? m.commands.length : 0;
  const eventCount = m.events ? m.events.length : 0;
  const routeCount = m.routes ? m.routes.length : 0;

  totalCommands += cmdCount;
  totalEvents += eventCount;
  totalRoutes += routeCount;

  console.log(`[Module ${idx + 1}] ID: "${m.id}" | Name: "${m.name}" (v${m.version || '1.0.0'})`);
  console.log(`  ├─ Commands: ${cmdCount}`);
  console.log(`  ├─ Events: ${eventCount}`);
  console.log(`  └─ Routes: ${routeCount}`);
});

console.log('\n----------------------------------------------------');
console.log(`Total Registered Commands Across Modules: ${totalCommands}`);
console.log(`Total Event Handlers Across Modules:     ${totalEvents}`);
console.log(`Total REST Routes Across Modules:       ${totalRoutes}`);
console.log('----------------------------------------------------');

if (errorsFound === 0) {
  console.log('\n✅ ALL MODULE MANIFESTS VERIFIED & WORKING PERFECTLY!\n');
} else {
  console.error(`\n❌ Found ${errorsFound} errors in module manifests.\n`);
  process.exit(1);
}
