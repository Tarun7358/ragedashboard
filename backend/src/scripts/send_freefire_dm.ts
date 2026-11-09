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
  EmbedBuilder,
  MessageFlags
} from 'discord.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const TARGET_USER_ID = '1140892126402596905';
const THUMBNAIL_URL = 'https://upload.wikimedia.org/wikipedia/ar/thumb/3/39/Garena_Free_Fire_MAX%28wikiar%29.png/250px-Garena_Free_Fire_MAX%28wikiar%29.png';
const DIRECT_DOWNLOAD_URL = 'https://d.apkpure.net/b/XAPK/com.dts.freefiremax?version=latest';
const PLAYSTORE_URL = 'https://play.google.com/store/apps/details?id=com.dts.freefiremax';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages]
});

async function sendFreeFireNotification() {
  console.log('[FreeFireDM] Logging in...');
  await client.login(process.env.DISCORD_TOKEN);
  console.log(`[FreeFireDM] Logged in as ${client.user?.tag} (${client.user?.id})`);

  const user = await client.users.fetch(TARGET_USER_ID);
  if (!user) {
    throw new Error(`User with ID ${TARGET_USER_ID} not found.`);
  }
  console.log(`[FreeFireDM] Found target user: ${user.tag} (${user.id})`);

  // Action row with buttons: Download apk & Google Play Store
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

  // Send via Discord Components V2 Container (matching the exact UI)
  try {
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
      `**Recipient:** <@${TARGET_USER_ID}>\n` +
      `**Status:** Verified APKPure Package`
    );

    const footer = new TextDisplayBuilder().setContent('-# Rage Secure Dm');

    const container = new ContainerBuilder()
      .addSectionComponents(sec)
      .addSeparatorComponents(sep)
      .addTextDisplayComponents(body)
      .addActionRowComponents(actionRow)
      .addTextDisplayComponents(footer);

    await user.send({
      flags: MessageFlags.IsComponentsV2,
      components: [container]
    });
    console.log('[FreeFireDM] Successfully sent via Components V2 container!');
  } catch (v2Err: any) {
    console.warn('[FreeFireDM] Components V2 failed, trying fallback embed:', v2Err?.message);
    const divider = '──────────────────────────────────────────';
    const dmEmbed = new EmbedBuilder()
      .setColor(0x0a0a0c)
      .setThumbnail(THUMBNAIL_URL)
      .setDescription([
        `# **Rage Notification : Free Fire MAX**`,
        `\u200B`,
        `${divider}`,
        `# **Update Available: Free Fire MAX x NARUTO**`,
        `**Version:** \`2.133.1 (Latest Collaboration)\``,
        `**File:** \`Free+Fire+MAX+x+NARUTO_2.133.1.xapk\``,
        `**Size:** \`407.72 MB (XAPK Package)\``,
        `**Recipient:** <@${TARGET_USER_ID}>`,
        `**Status:** Verified APKPure Package`
      ].join('\n'))
      .setFooter({ text: 'Rage Secure Dm' });

    await user.send({ embeds: [dmEmbed], components: [actionRow] });
    console.log('[FreeFireDM] Successfully sent via fallback embed!');
  }

  await client.destroy();
  console.log('[FreeFireDM] Done!');
}

sendFreeFireNotification().catch((err) => {
  console.error('[FreeFireDM] Fatal error:', err);
  process.exit(1);
});
