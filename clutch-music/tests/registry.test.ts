import { ModuleRegistry } from '../src/core/ModuleRegistry';

describe('ModuleRegistry', () => {
  it('should instantiate successfully', () => {
    const registry = new ModuleRegistry(() => {});
    expect(registry).toBeDefined();
  });
});
