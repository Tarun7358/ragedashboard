import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { NotificationService, EmbedConfig } from '../modules/social-updates/NotificationService.js';
import { YouTubeProvider } from '../modules/social-updates/providers/YouTubeProvider.js';
import { PayloadFormatter } from '../core/PayloadFormatter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const TARGET_USER_ID = '1140892126402596905';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages]
});

async function main() {
  console.log('[SampleYTAlert] Connecting to Discord...');
  await client.login(process.env.DISCORD_TOKEN);
  console.log(`[SampleYTAlert] Logged in as ${client.user?.tag} (${client.user?.id})`);

  const user = await client.users.fetch(TARGET_USER_ID);
  if (!user) {
    throw new Error(`Target user ${TARGET_USER_ID} not found.`);
  }
  console.log(`[SampleYTAlert] Found target user: ${user.tag} (${user.id})`);

  const channelMeta = {
    sourceId: 'UCDN8bthVDpfVsxpx8N6IuIA',
    sourceName: 'CLASHER LIVE',
    sourceAvatar: 'https://yt3.googleusercontent.com/eQLweDmYCn8i4E7SusxnjtKhjs_Zl1Qa8aNVU5hymfmh3x6R4Dzu9Ip7y1Y_uh-J7HLKOeAR=s176'
  };

  const provider = new YouTubeProvider();

  // 1. Latest Video
  const videoItem = {
    id: '5YwBadvReyw',
    title: 'FREE FIRE INDIA SENSITIVITY REVEALED 🤔 FREE FIRE NO RECOIL TIPS & TRICKS',
    url: 'https://www.youtube.com/watch?v=5YwBadvReyw',
    thumbnailUrl: 'https://i.ytimg.com/vi/5YwBadvReyw/hqdefault.jpg',
    description: 'Free Fire India Sensitivity settings revealed with no recoil tips and tricks!',
    publishedAt: new Date().toISOString(),
    isLive: false,
    isShort: false,
    isPremiere: false,
    extra: {
      provider: 'youtube',
      sourceId: channelMeta.sourceId,
      contentType: 'video'
    }
  };

  // 2. Latest Short
  const shortItem = {
    id: 'WB9IuzkCRaw',
    title: 'Free Fire India 🇮🇳 Sensi Revealed ✅ #freefire',
    url: 'https://www.youtube.com/shorts/WB9IuzkCRaw',
    thumbnailUrl: 'https://i.ytimg.com/vi/WB9IuzkCRaw/hqdefault.jpg',
    description: 'Free Fire India Sensi Revealed #shorts #freefire',
    publishedAt: new Date().toISOString(),
    isLive: false,
    isShort: true,
    isPremiere: false,
    extra: {
      provider: 'youtube',
      sourceId: channelMeta.sourceId,
      contentType: 'short'
    }
  };

  // 3. Latest Live Stream
  const liveItem = {
    id: '81QO8Rd4_9c',
    title: 'PEACE OP LIVE CHECKING – EVERYTHING REVEALED | FINAL CHECKING !',
    url: 'https://www.youtube.com/watch?v=81QO8Rd4_9c',
    thumbnailUrl: 'https://i.ytimg.com/vi/81QO8Rd4_9c/hqdefault.jpg',
    description: 'Live Stream Started! Come join the stream and say hi.',
    publishedAt: new Date().toISOString(),
    isLive: true,
    isShort: false,
    isPremiere: false,
    extra: {
      provider: 'youtube',
      sourceId: channelMeta.sourceId,
      contentType: 'live'
    }
  };

  const alertConfigs = [
    {
      typeLabel: 'LATEST VIDEO ALERT',
      item: videoItem,
      messagePrefix: `**${channelMeta.sourceName}** uploaded a new video!\n${videoItem.url}`,
      buttons: [
        { label: '▶ Watch Video', url: videoItem.url },
        { label: 'Visit Channel', url: `https://www.youtube.com/@clasherliveop` }
      ]
    },
    {
      typeLabel: 'LATEST SHORTS ALERT',
      item: shortItem,
      messagePrefix: `**${channelMeta.sourceName}** has released a new short!\n${shortItem.url}`,
      buttons: [
        { label: '▶ Watch Short', url: shortItem.url },
        { label: 'Visit Channel', url: `https://www.youtube.com/@clasherliveop` }
      ]
    },
    {
      typeLabel: 'LIVE STREAM ALERT',
      item: liveItem,
      messagePrefix: `🔴 **${channelMeta.sourceName}** is now **LIVE** on YouTube!\n${liveItem.url}`,
      buttons: [
        { label: '🔴 Watch Live Stream', url: liveItem.url },
        { label: 'Visit Channel', url: `https://www.youtube.com/@clasherliveop` }
      ]
    }
  ];

  for (const alert of alertConfigs) {
    console.log(`\n[SampleYTAlert] Dispatching ${alert.typeLabel} to ${user.tag}...`);

    const templateData = {
      ...provider.prepareTemplateData(alert.item as any, channelMeta),
      'discord.channel': '#alerts',
      'discord.guild': 'Clutch Nation',
      'server.name': 'Clutch Nation',
      'role.mention': '@everyone'
    };

    const embedConfig: EmbedConfig = {
      buttons: alert.buttons
    };

    const embed = NotificationService.buildEmbed(embedConfig, templateData);
    const components = NotificationService.buildComponents(alert.buttons, templateData);

    const payload = PayloadFormatter.normalize({
      content: alert.messagePrefix,
      embeds: [embed],
      components: components.length > 0 ? components : undefined
    });

    const sent = await user.send(payload);
    console.log(`[SampleYTAlert] ✅ ${alert.typeLabel} sent! (Message ID: ${sent.id})`);
    await new Promise(r => setTimeout(r, 1200));
  }

  console.log('\n[SampleYTAlert] All 3 sample alerts dispatched successfully!');
  process.exit(0);
}

main().catch(err => {
  console.error('[SampleYTAlert] Error:', err);
  process.exit(1);
});

