import fs from 'fs';
import path from 'path';

console.log('=== RAGE OPTIMISER UI & EMOJI CONSTRAINT AUDIT ===');

const backendSrc = path.join(process.cwd(), 'src');

function getAllTsFiles(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllTsFiles(fullPath));
    } else if (file.endsWith('.ts')) {
      results.push(fullPath);
    }
  });
  return results;
}

const files = getAllTsFiles(backendSrc);
let malformedEmojiCount = 0;
let emojiMap = new Map<string, number>();

// Match custom emojis: <:name:id> or <a:name:id>
const customEmojiRegex = /<a?:([a-zA-Z0-9_]+):(\d+)>/g;
const brokenEmojiRegex = /<a?:[a-zA-Z0-9_]+:>/g;

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  
  // Check broken emojis
  let match;
  while ((match = brokenEmojiRegex.exec(content)) !== null) {
    console.error(`[BROKEN EMOJI] File: ${path.relative(process.cwd(), file)}: ${match[0]}`);
    malformedEmojiCount++;
  }

  // Collect valid custom emojis
  while ((match = customEmojiRegex.exec(content)) !== null) {
    const fullEmoji = match[0];
    emojiMap.set(fullEmoji, (emojiMap.get(fullEmoji) || 0) + 1);
  }
});

console.log(`\n--- EMOJI AUDIT SUMMARY ---`);
console.log(`Total Unique Custom Emojis Used: ${emojiMap.size}`);
emojiMap.forEach((count, emoji) => {
  console.log(`  ${emoji} -> used ${count} times`);
});
if (malformedEmojiCount === 0) {
  console.log(`✅ EMOJI SANITY CHECK PASSED: 0 broken custom emojis found.`);
} else {
  console.log(`❌ EMOJI SANITY CHECK FAILED: ${malformedEmojiCount} broken custom emojis found.`);
}

console.log(`\n--- UI DISCORD LIMITS SUMMARY ---`);
console.log(`- Embed Title Limit: 256 characters`);
console.log(`- Embed Description Limit: 4096 characters`);
console.log(`- Embed Field Name Limit: 256 characters`);
console.log(`- Embed Field Value Limit: 1024 characters`);
console.log(`- Embed Fields Limit: 25 fields`);
console.log(`- Total Embed Character Limit: 6000 characters`);
console.log(`- ActionRow Button Limit: 5 buttons per row`);
console.log(`- ActionRow SelectMenu Limit: 1 select menu per row`);
console.log(`- ActionRows per Message: Max 5 rows`);
console.log(`- StringSelectMenu Options Limit: 25 options`);
console.log(`- CustomID Limit: 100 characters`);
