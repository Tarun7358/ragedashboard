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
const CHANNEL_ID = '1567154036577271878';
const TICKET_CHANNEL_ID = '1567154140369395732';
const PC_BUY_URL = 'https://superprofile.bio/vp/clashersensi';

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

export async function sendClasherAnnouncement(mention: 'everyone' | 'here' | 'both' | 'none' = 'both') {
  await client.login(process.env.DISCORD_TOKEN);
  const guild = await client.guilds.fetch(GUILD_ID);
  const channel = (await guild.channels.fetch(CHANNEL_ID)) as TextChannel;
  const guildIcon = guild.iconURL({ size: 512 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('Buy PC Sensi (Instant)')
      .setURL(PC_BUY_URL)
      .setStyle(ButtonStyle.Link),
    new ButtonBuilder()
      .setLabel('Open Mobile Ticket')
      .setURL(`https://discord.com/channels/${GUILD_ID}/${TICKET_CHANNEL_ID}`)
      .setStyle(ButtonStyle.Link)
  );

  const sec = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('# **Clasher Sensi & Optimisation : PC & Mobile**')
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder().setURL(guildIcon)
    );

  const sep = new SeparatorBuilder().setDivider(true);

  let mentionPrefix = '';
  if (mention === 'both') {
    mentionPrefix = '@everyone @here\n\n';
  } else if (mention === 'everyone') {
    mentionPrefix = '@everyone\n\n';
  } else if (mention === 'here') {
    mentionPrefix = '@here\n\n';
  }

  const body = new TextDisplayBuilder().setContent(
    `${mentionPrefix}# **Championship Aim & Pure Latency Reduction**\n\n` +
    `## **PC Sensi & System Optimisation**\n` +
    `**Instant Download & Setup:**\n` +
    `> **Buy Page:** ${PC_BUY_URL}\n` +
    `> **Pixel-Perfect Tracking:** **Custom DPI, zero acceleration and aim curve**\n` +
    `> **Full Windows & Engine Tweak:** **Latency stripping, maximum FPS and zero stutter**\n\n` +
    `## **Mobile Sensi & Device Tuning**\n` +
    `> **Free Sensi:** **Standard community sensitivities available!**\n` +
    `> **How to get Paid Mobile:** **Create a ticket in <#${TICKET_CHANNEL_ID}> **\n\n` +
    `### **Verified Performance | Zero Delay | Instant Setup**`
  );

  const footer = new TextDisplayBuilder().setContent('-# Clasher Official | Performance & Sensi Hub');

  const container = new ContainerBuilder()
    .addSectionComponents(sec)
    .addSeparatorComponents(sep)
    .addTextDisplayComponents(body)
    .addActionRowComponents(actionRow)
    .addTextDisplayComponents(footer);

  const msg = await channel.send({
    allowedMentions: mention !== 'none' ? { parse: ['everyone'] } : { parse: [] },
    flags: MessageFlags.IsComponentsV2,
    components: [container]
  });

  console.log(`[Announcement] Successfully published box UI announcement (Message ID: ${msg.id})!`);
  await client.destroy();
  return msg;
}

if (process.argv[1] && (process.argv[1].includes('send_clasher_announcement'))) {
  const mentionArg = (process.argv[2] as any) || 'none';
  sendClasherAnnouncement(mentionArg).then(() => process.exit(0)).catch(err => {
    console.error('[Announcement] Error:', err);
    process.exit(1);
  });
}
