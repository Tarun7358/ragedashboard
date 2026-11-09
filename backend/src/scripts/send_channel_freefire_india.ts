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
// Direct high-res image URL from DeviantArt Free Fire India Logo
const THUMBNAIL_URL = 'https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/c96aa165-d3ec-4a36-95fc-9b58e890ee86/dg9ofvh-9aef9881-cdc2-4d55-a152-1542b30cc7e0.jpg/v1/fit/w_512,h_512,q_70,strp/garena_free_fire_india_logo_by_freefireindiaapk_dg9ofvh-375w-2x.jpg?token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1cm46YXBwOjdlMGQxODg5ODIyNjQzNzNhNWYwZDQxNWVhMGQyNmUwIiwiaXNzIjoidXJuOmFwcDo3ZTBkMTg4OTgyMjY0MzczYTVmMGQ0MTVlYTBkMjZlMCIsIm9iaiI6W1t7ImhlaWdodCI6Ijw9NTEyIiwicGF0aCI6Ii9mL2M5NmFhMTY1LWQzZWMtNGEzNi05NWZjLTliNThlODkwZWU4Ni9kZzlvZnZoLTlhZWY5ODgxLWNkYzItNGQ1NS1hMTUyLTE1NDJiMzBjYzdlMC5qcGciLCJ3aWR0aCI6Ijw9NTEyIn1dXSwiYXVkIjpbInVybjpzZXJ2aWNlOmltYWdlLm9wZXJhdGlvbnMiXX0.AIH8VpsMSYm-LQ4OaY1gzmYpFmMplm1FiGb2QjvPQiM';
const DIRECT_DOWNLOAD_URL = 'https://www.mediafire.com/file/uqzu3pjv7zzbk6a/Free%252BFire%252BIndia_1.134.1.xapk/file';
const PLAYSTORE_URL = 'https://play.google.com/store/apps/details?id=com.garena.game.ffi';

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

async function main() {
  console.log('[FreeFireIndia] Logging in...');
  await client.login(process.env.DISCORD_TOKEN);
  console.log(`[FreeFireIndia] Logged in as ${client.user?.tag} (${client.user?.id})`);

  const guild = await client.guilds.fetch(GUILD_ID);
  const channel = (await guild.channels.fetch(CHANNEL_ID)) as TextChannel;
  if (!channel || !channel.isTextBased()) {
    throw new Error(`Channel ${CHANNEL_ID} not found or is not a text channel.`);
  }

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
      new TextDisplayBuilder().setContent('# **Rage Notification : Free Fire India**')
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder().setURL(THUMBNAIL_URL)
    );

  const sep = new SeparatorBuilder().setDivider(true);

  const body = new TextDisplayBuilder().setContent(
    `# **Update Available: Free Fire India**\n` +
    `**Version:** \`Latest Official Release\`\n` +
    `**Package:** \`com.garena.game.ffi\`\n` +
    `**File:** \`Free_Fire_India_Latest.xapk\`\n` +
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

  console.log('[FreeFireIndia] Successfully updated message with new DeviantArt logo!');
  await client.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error('[FreeFireIndia] Error:', err);
  process.exit(1);
});
