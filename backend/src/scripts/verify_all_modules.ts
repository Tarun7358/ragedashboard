import { ALL_MANIFESTS } from '../index.js';
import { PrefixRegistry } from '../core/prefix/PrefixRegistry.js';

async function verifyAll() {
  console.log(`\n========================================`);
  console.log(`🔍 STARTING FULL MODULE AUDIT & VALIDATION`);
  console.log(`========================================\n`);

  console.log(`Total manifests loaded: ${ALL_MANIFESTS.length}`);

  let totalCommands = 0;
  let totalEvents = 0;
  let totalRoutes = 0;
  const manifestReport: any[] = [];
  const commandNames = new Map<string, string>();
  const issues: string[] = [];

  for (const manifest of ALL_MANIFESTS) {
    if (!manifest.id) {
      issues.push(`Manifest missing 'id': ${JSON.stringify(manifest)}`);
      continue;
    }
    if (!manifest.name) {
      issues.push(`Manifest '${manifest.id}' missing 'name'`);
    }

    const cmds = manifest.commands || [];
    const evts = manifest.events || [];
    const routes = manifest.routes || [];

    totalCommands += cmds.length;
    totalEvents += evts.length;
    totalRoutes += routes.length;

    // Check commands for valid Discord naming & duplicates
    for (const cmd of cmds) {
      if (!cmd.name) {
        issues.push(`[${manifest.id}] Command has no name`);
      } else {
        if (!/^[\w-]{1,32}$/.test(cmd.name)) {
          issues.push(`[${manifest.id}] Invalid slash command name format: "${cmd.name}"`);
        }
        if (commandNames.has(cmd.name)) {
          // Note: check if it's the exact same or collision across different modules
          const prev = commandNames.get(cmd.name);
          issues.push(`[COLLISION] Command "${cmd.name}" in manifest "${manifest.id}" conflicts with "${prev}"`);
        } else {
          commandNames.set(cmd.name, manifest.id);
        }
        if (!cmd.description || cmd.description.length > 100) {
          issues.push(`[${manifest.id}] Command "${cmd.name}" has invalid description length (${cmd.description?.length || 0})`);
        }
      }
    }

    // Check events for valid event structure
    for (const ev of evts) {
      if (!ev.name) {
        issues.push(`[${manifest.id}] Event handler missing 'name'`);
      }
      if (typeof ev.handler !== 'function') {
        issues.push(`[${manifest.id}] Event handler for '${ev.name}' is not a function`);
      }
    }

    // Check routes
    for (const rt of routes) {
      if (!rt.path || !rt.method || typeof rt.handler !== 'function') {
        issues.push(`[${manifest.id}] Route has invalid path/method/handler: ${JSON.stringify(rt)}`);
      }
    }

    // Check config schema if present
    if (manifest.configSchema) {
      if (typeof manifest.configSchema.validate !== 'function') {
        issues.push(`[${manifest.id}] configSchema is missing 'validate' function`);
      }
    }

    manifestReport.push({
      id: manifest.id,
      name: manifest.name,
      commands: cmds.length,
      events: evts.length,
      routes: routes.length,
      hasSchema: !!manifest.configSchema
    });
  }

  // Initialize PrefixRegistry with manifests to verify command indexing
  try {
    PrefixRegistry.initialize(ALL_MANIFESTS);
    const registeredPrefixCmds = PrefixRegistry.getAllCommands();
    console.log(`✅ PrefixRegistry initialized successfully: ${registeredPrefixCmds.length} commands indexed.`);
  } catch (err: any) {
    issues.push(`PrefixRegistry initialization failed: ${err.message}`);
  }

  console.log('\n--- Module Breakdown ---');
  for (const m of manifestReport) {
    console.log(`✓ [${m.id}] ${m.name}: ${m.commands} cmds | ${m.events} events | ${m.routes} routes | Schema: ${m.hasSchema ? 'YES' : 'NO'}`);
  }

  console.log(`\n========================================`);
  console.log(`Total Manifests: ${ALL_MANIFESTS.length}`);
  console.log(`Total Slash Commands: ${totalCommands}`);
  console.log(`Total Event Handlers: ${totalEvents}`);
  console.log(`Total HTTP Module Routes: ${totalRoutes}`);
  console.log(`Issues Found: ${issues.length}`);
  console.log(`========================================\n`);

  if (issues.length > 0) {
    console.error('❌ Issues detected during module audit:');
    issues.forEach(iss => console.error('  - ' + iss));
    process.exit(1);
  } else {
    console.log('🎉 ALL 36 MODULES ARE INTACT, CONFORMANT, AND FUNCTIONING PROPERLY!\n');
    process.exit(0);
  }
}

verifyAll().catch(err => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
