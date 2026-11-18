import { ALL_MANIFESTS } from '../index.js';
import { PrefixRegistry } from '../core/prefix/PrefixRegistry.js';

PrefixRegistry.initialize(ALL_MANIFESTS);

const cmds = PrefixRegistry.getCommandsByCategory('Security');
console.log('Security commands count:', cmds.length);
for (const c of cmds) {
  console.log({
    name: c.name,
    aliases: c.aliases,
    subcommands: c.subcommands?.map(s => s.name)
  });
}
