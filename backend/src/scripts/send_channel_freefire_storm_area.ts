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
  TextChannel,
  EmbedBuilder
} from 'discord.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const GUILD_ID = '1266048940101599293';
const CHANNEL_ID = '1511414285312721096';
const THUMBNAIL_URL = 'https://upload.wikimedia.org/wikipedia/ar/thumb/3/39/Garena_Free_Fire_MAX%28wikiar%29.png/250px-Garena_Free_Fire_MAX%28wikiar%29.png';
const DIRECT_DOWNLOAD_URL = 'https://d.apkpure.net/b/XAPK/com.dts.freefireth?version=latest';

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

async function main() {
  console.log('[FreeFireStormArea] Logging in...');
  await client.login(process.env.DISCORD_TOKEN);
  console.log(`[FreeFireStormArea] Logged in as ${client.user?.tag} (${client.user?.id})`);

  const guild = await client.guilds.fetch(GUILD_ID);
  const channel = (await guild.channels.fetch(CHANNEL_ID)) as TextChannel;
  if (!channel || !channel.isTextBased()) {
    throw new Error(`Channel ${CHANNEL_ID} not found or is not a text channel.`);
  }

  // Action row with single Direct Download button (not available on Google Play Store)
  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('Download apk')
      .setURL(DIRECT_DOWNLOAD_URL)
      .setStyle(ButtonStyle.Link)
  );

  const sec = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('# **Rage Notification : Free Fire**')
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder().setURL(THUMBNAIL_URL)
    );

  const sep = new SeparatorBuilder().setDivider(true);

  const body = new TextDisplayBuilder().setContent(
    `# **Update Available: Free Fire : Storm Area**\n` +
    `**Version:** \`Latest Official (Storm Area)\`\n` +
    `**File:** \`Free_Fire_Storm_Area_com.dts.freefireth.xapk\`\n` +
    `**Size:** \`~450 MB (XAPK Package)\`\n` +
    `**Availability:** \`Not available on Google Play Store (Direct Install Only)\`\n` +
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

  try {
    await channel.send({
      allowedMentions: { parse: ['everyone'] },
      flags: MessageFlags.IsComponentsV2,
      components: [container]
    });
    console.log('[FreeFireStormArea] Successfully dispatched Components V2 Box UI announcement to channel!');
  } catch (err: any) {
    console.warn('[FreeFireStormArea] Components V2 failed, sending Embed fallback:', err.message);
    const embed = new EmbedBuilder()
      .setTitle('Rage Notification : Free Fire')
      .setColor(0x84cc16)
      .setThumbnail(THUMBNAIL_URL)
      .setDescription(
        `# **Update Available: Free Fire : Storm Area**\n\n` +
        `**Version:** \`Latest Official (Storm Area)\`\n` +
        `**File:** \`Free_Fire_Storm_Area_com.dts.freefireth.xapk\`\n` +
        `**Size:** \`~450 MB (XAPK Package)\`\n` +
        `**Availability:** \`Not available on Google Play Store (Direct Install Only)\`\n` +
        `**Recipient:** @everyone @here\n` +
        `**Status:** Verified APKPure Package`
      )
      .setFooter({ text: 'Rage Secure Update' });

    await channel.send({
      content: '@everyone @here',
      allowedMentions: { parse: ['everyone'] },
      embeds: [embed],
      components: [actionRow]
    });
    console.log('[FreeFireStormArea] Successfully sent fallback embed with download button!');
  }

  await client.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error('[FreeFireStormArea] Error:', err);
  process.exit(1);
});

