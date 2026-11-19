import dotenv from 'dotenv';
import { REST, Routes } from 'discord.js';

dotenv.config({ path: 'backend/.env' });
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
const channelId = '1566445501929357312';

try {
  const msgs = await rest.get(Routes.channelMessages(channelId), { query: new URLSearchParams({ limit: '50' }) });
  console.log('count', msgs.length);
  for (const m of msgs.reverse()) {
    const texts = [];
    const walk = (c) => {
      if (!c) return;
      if (typeof c.content === 'string') texts.push(c.content);
      (c.components || []).forEach(walk);
      if (c.accessory) walk(c.accessory);
    };
    (m.components || []).forEach(walk);
    const embeds = (m.embeds || []).map(e => [e.title, e.description].filter(Boolean).join(' | ')).join(' || ');
    console.log(`--- ${m.timestamp} ${m.author.username}${m.author.bot ? '[bot]' : ''}`);
    console.log((m.content || '') + ' ' + embeds + ' ' + texts.join(' / ').slice(0, 700));
  }
} catch (e) {
  console.error('ERR', e.status || '', e.message);
}
