import { ALL_MANIFESTS } from '../src/index.js';
import { PrefixRegistry } from '../src/core/prefix/PrefixRegistry.js';

PrefixRegistry.initialize(ALL_MANIFESTS);

console.log('Testing JTC Command Resolution:');
const jtcCmd = PrefixRegistry.get('jtc');
console.log('PrefixRegistry.get("jtc"):', jtcCmd ? `FOUND (${jtcCmd.name}, moduleOwner: ${jtcCmd.moduleOwnerId})` : 'NOT FOUND');

const jointocreateCmd = PrefixRegistry.get('jointocreate');
console.log('PrefixRegistry.get("jointocreate"):', jointocreateCmd ? `FOUND (${jointocreateCmd.name}, moduleOwner: ${jointocreateCmd.moduleOwnerId})` : 'NOT FOUND');

const j2cCmd = PrefixRegistry.get('j2c');
console.log('PrefixRegistry.get("j2c"):', j2cCmd ? `FOUND (${j2cCmd.name}, moduleOwner: ${j2cCmd.moduleOwnerId})` : 'NOT FOUND');

if (jtcCmd && jtcCmd.name === 'jtc') {
  console.log('✅ JTC command resolution test PASSED!');
} else {
  console.error('❌ JTC command resolution test FAILED!');
  process.exit(1);
}
