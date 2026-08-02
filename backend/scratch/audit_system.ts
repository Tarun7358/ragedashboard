import { ALL_MANIFESTS } from '../src/index.js';
import fs from 'fs';
import path from 'path';

console.log('=== SYSTEM WIDE COMPREHENSIVE SCAN ===\n');

// 1. Slash command audit
let totalCommands = 0;
let missingCommandHandlers = 0;
let totalEvents = 0;
const allEventNames = new Set<string>();

for (const manifest of ALL_MANIFESTS) {
  const cmds = manifest.commands || [];
  const events = manifest.events || [];
  
  totalCommands += cmds.length;
  totalEvents += events.length;
  
  for (const e of events) {
    allEventNames.add(e.name);
  }
  
  for (const cmd of cmds) {
    const handlerName = `command_${cmd.name}`;
    const hasHandler = events.some((e: any) => e.name === handlerName);
    
    if (!hasHandler) {
      console.warn(`❌ [MISSING COMMAND HANDLER] Module "${manifest.id}" has command "/${cmd.name}" but no event "${handlerName}"!`);
      missingCommandHandlers++;
    }
  }
}

console.log(`--- SLASH COMMAND AUDIT ---`);
console.log(`Modules Audited: ${ALL_MANIFESTS.length}`);
console.log(`Total Slash Commands: ${totalCommands}`);
console.log(`Total Event Handlers: ${totalEvents}`);
console.log(`Missing Command Handlers: ${missingCommandHandlers}`);

// 2. CustomId audit
console.log(`\n--- INTERACTIVE UI AUDIT ---`);

function getFiles(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(fullPath));
    } else if (fullPath.endsWith('.ts')) {
      results.push(fullPath);
    }
  });
  return results;
}

const allTsFiles = getFiles(path.resolve('src/modules'));
const customIdsFound = new Set<string>();

const setCustomIdRegex = /\.setCustomId\(['"]([^'"]+)['"]\)/g;

for (const file of allTsFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  let match;
  while ((match = setCustomIdRegex.exec(content)) !== null) {
    customIdsFound.add(match[1]);
  }
}

console.log(`Discovered ${customIdsFound.size} static UI customIds across modules.`);

// Generic prefixes handled in Gateway.ts
const genericPrefixes = [
  'tickets_v2_', 'payment_', 'addrole_', 'wl_', 'sec_', 'mod_', 'help_btn_', 'gw_enter_', 'purge_', 'wizard_', 'ticket_btn_'
];

let unhandledButtons = 0;
for (const cid of customIdsFound) {
  const directEvent = `button_${cid}`;
  const directSelectEvent = `select_${cid}`;
  const isDirectHandled = allEventNames.has(directEvent) || allEventNames.has(directSelectEvent);
  const isGenericHandled = genericPrefixes.some(p => cid.startsWith(p));
  
  if (!isDirectHandled && !isGenericHandled) {
    console.warn(`⚠️ [POTENTIALLY UNHANDLED CUSTOM ID] customId "${cid}" has no direct event and no generic prefix match.`);
    unhandledButtons++;
  }
}

if (unhandledButtons === 0) {
  console.log('✅ ALL UI customIds are wired to active direct or generic handlers!');
} else {
  console.log(`Found ${unhandledButtons} potentially unhandled customIds.`);
}

// 3. Raw Unicode Emoji audit
console.log(`\n--- ZERO-UNICODE DESIGN SYSTEM AUDIT ---`);
const rawUnicodeRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
let unicodeMatches = 0;

for (const file of allTsFiles) {
  // Skip comments or test files
  const content = fs.readFileSync(file, 'utf-8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('//') && !line.includes('setEmoji') && !line.includes('setTitle') && !line.includes('setDescription')) return;
    const matches = line.match(rawUnicodeRegex);
    if (matches && (line.includes('setEmoji') || line.includes('setTitle') || line.includes('setDescription') || line.includes('addFields'))) {
      console.warn(`⚠️ [LEGACY UNICODE DEMO] ${path.basename(file)}:${idx+1}: ${matches.join(', ')} in line: ${line.trim().substring(0, 70)}`);
      unicodeMatches++;
    }
  });
}

if (unicodeMatches === 0) {
  console.log('✅ ZERO legacy Unicode emojis in active user-facing embeds/buttons!');
} else {
  console.log(`Found ${unicodeMatches} legacy Unicode occurrences in UI elements.`);
}
