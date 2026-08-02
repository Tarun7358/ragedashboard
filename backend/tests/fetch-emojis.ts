import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildEmojisAndStickers]
});

const TARGET_GUILD_ID = '1266048940101599293';

client.once('ready', async () => {
  console.log(`[Script] Logged in as ${client.user?.tag}`);
  console.log(`--- FETCHING EMOJIS FROM GUILD ${TARGET_GUILD_ID} ---`);

  try {
    const guild = await client.guilds.fetch(TARGET_GUILD_ID).catch(() => null);
    if (!guild) {
      console.error(`Bot is not in target guild ${TARGET_GUILD_ID} or guild cannot be fetched.`);
      process.exit(1);
    }

    console.log(`Target Guild Name: "${guild.name}"`);
    const emojis = await guild.emojis.fetch();
    console.log(`Total emojis in guild: ${emojis.size}`);

    emojis.forEach(e => {
      const syntax = e.animated ? `<a:${e.name}:${e.id}>` : `<:${e.name}:${e.id}>`;
      console.log(`NAME: "${e.name}" | ID: "${e.id}" | SYNTAX: "${syntax}"`);
    });
  } catch (err: any) {
    console.error('Error fetching emojis:', err.message);
  }

  console.log('--- EMOJIS LIST END ---');
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('Failed to log in:', err.message);
  process.exit(1);
});
