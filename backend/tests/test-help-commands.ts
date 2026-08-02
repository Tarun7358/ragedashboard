import { ALL_MANIFESTS } from '../src/index.js';
import { PrefixRegistry } from '../src/core/prefix/PrefixRegistry.js';
import { PrefixHelpCenter } from '../src/core/prefix/PrefixHelpCenter.js';

PrefixRegistry.initialize(ALL_MANIFESTS);

const allCmds = PrefixRegistry.getAllCommands();
const categories = PrefixRegistry.getCategories();

console.log('====================================================');
console.log('📚 HELP CENTER FULL COMMAND MATRIX AUDIT');
console.log('====================================================\n');

console.log(`Total Registered Modules: ${ALL_MANIFESTS.length}`);
console.log(`Total Categories in Help: ${categories.length}`);
console.log(`Total Commands in Registry: ${allCmds.length}\n`);

let grandTotalWithSubcommands = 0;

categories.forEach(cat => {
  const cmds = PrefixRegistry.getCommandsByCategory(cat);
  console.log(`📁 Category: "${cat}" (${cmds.length} top-level commands)`);
  
  cmds.forEach(c => {
    const subCount = c.subcommands ? c.subcommands.length : 0;
    const totalForCmd = 1 + subCount;
    grandTotalWithSubcommands += totalForCmd;
    console.log(`  └─ r!${c.name} ${c.aliases.length > 0 ? `(aliases: ${c.aliases.join(', ')})` : ''} [${subCount} subcommands]`);
  });
  console.log('');
});

console.log('----------------------------------------------------');
console.log(`Top-Level Commands Count:  ${allCmds.length}`);
console.log(`Grand Total (Cmds + Subcmds): ${grandTotalWithSubcommands}`);
console.log('----------------------------------------------------');
