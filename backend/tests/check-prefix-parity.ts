import { ALL_MANIFESTS } from '../src/index.js';
import { PrefixRegistry } from '../src/core/prefix/PrefixRegistry.js';

// Initialize Prefix Registry with all module manifests
PrefixRegistry.initialize(ALL_MANIFESTS);

const enterpriseShortcuts = [
  'security', 'lockdown', 'quarantine', 'whitelist', 'antinuke', 'antispam', 'antilink', 'verification', 'logs', 'raidmode',
  'ban', 'tempban', 'kick', 'mute', 'timeout', 'purge', 'warn', 'notes',
  'welcome', 'autorole', 'goodbye', 'birthday', 'boost', 'milestones',
  'config', 'setup', 'modules', 'permissions', 'premium', 'analytics',
  'status', 'performance', 'telemetry', 'health', 'uptime', 'cache', 'memory',
  'emergency', 'diagnostics', 'developer', 'reload', 'restart', 'sync', 'debug'
];

console.log('====================================================');
console.log('🔍 PREFIX COMMAND PARITY CHECK');
console.log('====================================================\n');

const missingPrefixCommands: string[] = [];
const availablePrefixCommands: string[] = [];

for (const name of enterpriseShortcuts) {
  const cmd = PrefixRegistry.getCommand(name);
  if (cmd) {
    availablePrefixCommands.push(name);
  } else {
    missingPrefixCommands.push(name);
  }
}

console.log(`Available Prefix Commands: ${availablePrefixCommands.length}/${enterpriseShortcuts.length}`);
console.log(`Missing Prefix Commands:   ${missingPrefixCommands.length}\n`);

if (missingPrefixCommands.length > 0) {
  console.log('⚠️ The following commands do NOT currently exist in PrefixRegistry:');
  missingPrefixCommands.forEach(c => console.log(`  - r!${c}`));
} else {
  console.log('✅ ALL shortcut commands have 100% Prefix Command parity!');
}
