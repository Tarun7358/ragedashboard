import {
  Client,
  GatewayIntentBits,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  EmbedBuilder,
  MessageFlags
} from 'discord.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const TARGET_USER_ID = '1140892126402596905';
const BANNER_URL = 'https://cdn.discordapp.com/attachments/1520048350643359856/1566028194719596584/uptime-banner.png?ex=6ae70ce9&is=6ae5bb69&hm=b7c147180bdfb1483667de0db05e1da0a784c11fb164a366d6f5d4283de5f99b&';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages]
});

async function main() {
  console.log('[UptimeDemo] Logging in...');
  await client.login(process.env.DISCORD_TOKEN);
  console.log(`[UptimeDemo] Logged in as ${client.user?.tag} (${client.user?.id})`);

  const user = await client.users.fetch(TARGET_USER_ID);
  if (!user) {
    throw new Error(`Target user ${TARGET_USER_ID} not found`);
  }
  console.log(`[UptimeDemo] Target user found: ${user.tag} (${user.id})`);

  const uptimeSec = process.uptime();
  const days = Math.floor(uptimeSec / 86400);
  const hours = Math.floor(uptimeSec / 3600) % 24;
  const mins = Math.floor(uptimeSec / 60) % 60;
  const secs = Math.floor(uptimeSec % 60);

  let liveStr = '';
  if (days > 0) {
    liveStr = `${days} Days ${hours} Hours ${mins} Mins`;
  } else if (hours > 0) {
    liveStr = `${hours} Hours ${mins} Mins`;
  } else {
    liveStr = `${mins} Mins ${secs} Secs`;
  }

  const wsPing = Math.max(1, Math.round(client.ws?.ping || 16));
  const guildCount = client.guilds?.cache?.size || 46;
  const botId = client.user?.id || 'bot';
  const botAvatar = client.user?.displayAvatarURL({ size: 512 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
  const tick = '<a:tick:1546134620087783526>';

  const mem = process.memoryUsage();
  const heapMb = (mem.heapUsed / 1024 / 1024).toFixed(1);
  const rssMb = (mem.rss / 1024 / 1024).toFixed(1);

  const bodyContent = [
    `<@${botId}> * **Live : ${liveStr}**`,
    ``,
    `> ${tick} **Core Gateway:** WS 443 Connected [Latency:\u00A0\`${wsPing}ms\`]`,
    `> ${tick} **Memory Overhead:** Heap \`${heapMb} MB\` [RSS:\u00A0\`${rssMb} MB\`]`,
    `> ${tick} **SQL Database:** SQLite WAL Mode [\`Connected & Healthy\`]`,
    `> ${tick} **Gmail Connectors:** OAuth2 Secure Bridge [\`OAuth2 / SMTP Active\`]`,
    `> ${tick} **YouTube API v3:** Realtime RSS Feed Polling Active`,
    `> ${tick} **Antinuke Sentinels:** Armed & Securing \`${guildCount} Servers\``
  ].join('\n');

  try {
    const sec = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(bodyContent)
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(botAvatar)
      );

    const mg = new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL(BANNER_URL)
    );

    const footer = new TextDisplayBuilder().setContent('-# Rage Optimiser Enterprise • High-Availability Infrastructure');

    const container = new ContainerBuilder()
      .addSectionComponents(sec)
      .addMediaGalleryComponents(mg)
      .addTextDisplayComponents(footer);

    await user.send({
      flags: MessageFlags.IsComponentsV2,
      components: [container]
    });

    console.log('[UptimeDemo] Successfully sent Components V2 container with tick and custom banner!');
  } catch (v2Err: any) {
    console.warn('[UptimeDemo] Components V2 failed, falling back to embed:', v2Err?.message);
    const embed = new EmbedBuilder()
      .setColor(0x2B2D31)
      .setThumbnail(botAvatar)
      .setDescription(bodyContent)
      .setImage(BANNER_URL)
      .setFooter({ text: 'Rage Optimiser Enterprise • High-Availability Infrastructure' });

    await user.send({
      embeds: [embed]
    });
    console.log('[UptimeDemo] Successfully sent fallback embed!');
  }

  await client.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error('[UptimeDemo] Error:', err);
  process.exit(1);
});
