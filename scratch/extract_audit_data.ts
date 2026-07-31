import fs from 'fs';
import path from 'path';

const modulesDir = path.resolve('backend/src/modules');
const files = fs.readdirSync(modulesDir);

console.log(`Found ${files.length} module directories in backend/src/modules.`);

const moduleDetails: any[] = [];

for (const dir of files) {
  const manifestPath = path.join(modulesDir, dir, 'manifest.ts');
  const commandsPath = path.join(modulesDir, dir, 'commands.ts');
  const servicePath = path.join(modulesDir, dir, 'service.ts');

  const hasManifest = fs.existsSync(manifestPath);
  const hasCommands = fs.existsSync(commandsPath);
  const hasService = fs.existsSync(servicePath);

  let manifestContent = hasManifest ? fs.readFileSync(manifestPath, 'utf8') : '';
  let commandsContent = hasCommands ? fs.readFileSync(commandsPath, 'utf8') : '';

  // Extract commands
  const slashCmds: string[] = [];
  const matches = (manifestContent + '\n' + commandsContent).matchAll(/name:\s*['"]([a-zA-Z0-9_-]+)['"]/g);
  for (const m of matches) {
    if (!slashCmds.includes(m[1]) && !['tick', 'messageDelete', 'messageUpdate', 'voiceStateUpdate', 'guildMemberAdd', 'guildMemberRemove', 'guildBanAdd', 'guildBanRemove', 'roleCreate', 'roleDelete', 'channelCreate', 'channelDelete'].includes(m[1])) {
      slashCmds.push(m[1]);
    }
  }

  // Extract events
  const events: string[] = [];
  const eventMatches = manifestContent.matchAll(/name:\s*['"]([a-zA-Z0-9_-]+)['"],\s*handler:/g);
  for (const em of eventMatches) {
    events.push(em[1]);
  }

  // Extract buttons / customIds
  const customIds: string[] = [];
  const btnMatches = (manifestContent + '\n' + commandsContent).matchAll(/custom_?Id:\s*['"]([a-zA-Z0-9_-]+)['"]/gi);
  for (const bm of btnMatches) {
    if (!customIds.includes(bm[1])) customIds.push(bm[1]);
  }

  moduleDetails.push({
    id: dir,
    hasManifest,
    hasCommands,
    hasService,
    slashCmds,
    events,
    customIds
  });
}

fs.writeFileSync('scratch/module_audit.json', JSON.stringify(moduleDetails, null, 2));
console.log('Wrote scratch/module_audit.json');
