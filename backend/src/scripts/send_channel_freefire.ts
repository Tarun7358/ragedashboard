import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ThumbnailBuilder,
  MessageFlags,
  TextChannel
} from 'discord.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const GUILD_ID = '1266048940101599293';
const CHANNEL_ID = '1511414285312721096';
const THUMBNAIL_URL = 'https://upload.wikimedia.org/wikipedia/ar/thumb/3/39/Garena_Free_Fire_MAX%28wikiar%29.png/250px-Garena_Free_Fire_MAX%28wikiar%29.png';
const DIRECT_DOWNLOAD_URL = 'https://www.mediafire.com/file/za50i2wj8bw7cfa/Free%252BFire%252BMAX%252Bx%252BNARUTO_2.133.1.xapk/file';
const PLAYSTORE_URL = 'https://play.google.com/store/apps/details?id=com.dts.freefiremax';

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

async function main() {
  await client.login(process.env.DISCORD_TOKEN);
  const guild = await client.guilds.fetch(GUILD_ID);
  const channel = (await guild.channels.fetch(CHANNEL_ID)) as TextChannel;

  // Action row with buttons
  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('Download apk')
      .setURL(DIRECT_DOWNLOAD_URL)
      .setStyle(ButtonStyle.Link),
    new ButtonBuilder()
      .setLabel('Google Play Store')
      .setURL(PLAYSTORE_URL)
      .setStyle(ButtonStyle.Link)
  );

  const sec = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('# **Rage Notification : Free Fire MAX**')
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder().setURL(THUMBNAIL_URL)
    );

  const sep = new SeparatorBuilder().setDivider(true);

  const body = new TextDisplayBuilder().setContent(
    `# **Update Available: Free Fire MAX x NARUTO**\n` +
    `**Version:** \`2.133.1 (Latest Collaboration)\`\n` +
    `**File:** \`Free+Fire+MAX+x+NARUTO_2.133.1.xapk\`\n` +
    `**Size:** \`407.72 MB (XAPK Package)\`\n` +
    `**Recipient:** @everyone @here\n` +
    `**Status:** Verified APKPure Package`
  );

  const footer = new TextDisplayBuilder().setContent('-# Rage Secure Update');

  const container = new ContainerBuilder()
    .addSectionComponents(sec)
    .addSeparatorComponents(sep)
    .addTextDisplayComponents(body)
    .addActionRowComponents(actionRow)
    .addTextDisplayComponents(footer);

  await channel.send({
    allowedMentions: { parse: ['everyone'] },
    flags: MessageFlags.IsComponentsV2,
    components: [container]
  });

  console.log('[ChannelFF] Successfully sent exact Components V2 container box UI!');
  await client.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error('[ChannelFF] Error:', err);
  process.exit(1);
});
