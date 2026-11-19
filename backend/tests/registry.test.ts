import { jest } from '@jest/globals';
import { ModuleRegistry } from '../src/core/ModuleRegistry';

describe('ModuleRegistry', () => {
  let registry: ModuleRegistry;
  let broadcast: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    broadcast = jest.fn();
    registry = new ModuleRegistry(broadcast as any);
    registry.registerModule({ id: 'tickets', name: 'Tickets', configSchema: { validate: () => ({ progress: 100, errors: [] }) } } as any);
    registry.registerModule({ id: 'leveling', name: 'Leveling', configSchema: { validate: () => ({ progress: 100, errors: [] }) } } as any);
  });

  afterEach(() => {
    registry.flushPending();
    jest.useRealTimers();
  });

  it('should instantiate successfully', () => {
    expect(registry).toBeDefined();
  });

  it('does not create phantom modules for unknown ids', () => {
    const before = registry.getModulesState('g1').length;
    expect(registry.toggleModule('g1', 'definitely-not-a-module', true)).toBeNull();
    expect(registry.getModulesState('g1').length).toBe(before);
  });

  it('enables a known module and batches the broadcast', () => {
    registry.getModulesState('g1');
    broadcast.mockClear();
    registry.toggleModule('g1', 'tickets', true);
    registry.toggleModule('g1', 'leveling', true);
    registry.toggleModule('g1', 'tickets', true);
    expect(registry.getModulesState('g1').find(m => m.id === 'tickets')?.status).toBe('enabled');
    jest.advanceTimersByTime(200);
    const stateUpdates = broadcast.mock.calls.filter(c => (c[0] as any)?.type === 'STATE_UPDATE');
    expect(stateUpdates.length).toBe(1);
  });

  it('setModulesEnabled mutates all listed modules in one pass', () => {
    const changed = registry.setModulesEnabled('g1', ['tickets', 'leveling', 'tickets', 'nope'], true);
    expect(changed).toBe(2);
    const mods = registry.getModulesState('g1');
    expect(mods.find(m => m.id === 'leveling')?.status).toBe('enabled');
  });
});
