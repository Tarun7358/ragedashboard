import { resolveCanonicalModuleId, CANONICAL_MODULE_IDS, MODULE_ALIAS_MAP } from '../src/core/ModuleIdResolver';

describe('ModuleIdResolver', () => {
  it('resolves exact canonical names', () => {
    expect(resolveCanonicalModuleId('security')).toBe('security');
    expect(resolveCanonicalModuleId('automod')).toBe('automod');
    expect(resolveCanonicalModuleId('voice')).toBe('voice');
    expect(resolveCanonicalModuleId('tickets')).toBe('tickets');
  });

  it('resolves aliases and abbreviations', () => {
    expect(resolveCanonicalModuleId('an')).toBe('security');
    expect(resolveCanonicalModuleId('antinuke')).toBe('security');
    expect(resolveCanonicalModuleId('am')).toBe('automod');
    expect(resolveCanonicalModuleId('antilink')).toBe('automod');
    expect(resolveCanonicalModuleId('antispam')).toBe('automod');
    expect(resolveCanonicalModuleId('jtc')).toBe('join_to_create');
    expect(resolveCanonicalModuleId('jointocreate')).toBe('join_to_create');
    expect(resolveCanonicalModuleId('tkmgr')).toBe('tickets');
    expect(resolveCanonicalModuleId('ticket')).toBe('tickets');
    expect(resolveCanonicalModuleId('verify')).toBe('verification');
    expect(resolveCanonicalModuleId('autorole')).toBe('join_role_guard');
    expect(resolveCanonicalModuleId('gw')).toBe('giveaway');
    expect(resolveCanonicalModuleId('rr')).toBe('reaction_roles');
  });

  it('handles hyphen vs underscore variations seamlessly', () => {
    expect(resolveCanonicalModuleId('reaction-roles')).toBe('reaction_roles');
    expect(resolveCanonicalModuleId('reaction_roles')).toBe('reaction_roles');
    expect(resolveCanonicalModuleId('join-to-create')).toBe('join_to_create');
    expect(resolveCanonicalModuleId('join_to_create')).toBe('join_to_create');
    expect(resolveCanonicalModuleId('voice-manager')).toBe('voice_manager');
    expect(resolveCanonicalModuleId('voice_manager')).toBe('voice_manager');
    expect(resolveCanonicalModuleId('social-updates')).toBe('social_updates');
    expect(resolveCanonicalModuleId('social_updates')).toBe('social_updates');
    expect(resolveCanonicalModuleId('stats-counter')).toBe('stats-counter');
    expect(resolveCanonicalModuleId('statscounter')).toBe('stats-counter');
    expect(resolveCanonicalModuleId('stats_counter')).toBe('stats-counter');
    expect(resolveCanonicalModuleId('embed-builder')).toBe('embed_builder');
    expect(resolveCanonicalModuleId('embed_builder')).toBe('embed_builder');
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(resolveCanonicalModuleId('  AntiNuke  ')).toBe('security');
    expect(resolveCanonicalModuleId('AUTOMOD')).toBe('automod');
    expect(resolveCanonicalModuleId('JtC')).toBe('join_to_create');
    expect(resolveCanonicalModuleId('Tickets ')).toBe('tickets');
  });

  it('preserves unknown IDs safely without throwing', () => {
    expect(resolveCanonicalModuleId('some_custom_plugin')).toBe('some_custom_plugin');
    expect(resolveCanonicalModuleId('')).toBe('');
    expect(resolveCanonicalModuleId(null as any)).toBe('');
    expect(resolveCanonicalModuleId(undefined as any)).toBe('');
  });

  it('contains all 36 canonical module IDs in the catalog', () => {
    expect(CANONICAL_MODULE_IDS.length).toBe(36);
    expect(CANONICAL_MODULE_IDS).toContain('security');
    expect(CANONICAL_MODULE_IDS).toContain('automod');
    expect(CANONICAL_MODULE_IDS).toContain('voice-protection');
    expect(CANONICAL_MODULE_IDS).toContain('tickets');
    expect(CANONICAL_MODULE_IDS).toContain('backups');
  });
});
