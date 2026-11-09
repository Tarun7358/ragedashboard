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
const GUILD_ICON = 'https://cdn.discordapp.com/icons/1266048940101599293/a17d3c7a86fff32084748ff94be35325.png?size=512';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages]
});

async function main() {
  console.log('[TicketDemo] Logging in...');
  await client.login(process.env.DISCORD_TOKEN);
  console.log(`[TicketDemo] Logged in as ${client.user?.tag} (${client.user?.id})`);

  const user = await client.users.fetch(TARGET_USER_ID);
  if (!user) {
    throw new Error(`Target user ${TARGET_USER_ID} not found`);
  }
  console.log(`[TicketDemo] Target user found: ${user.tag} (${user.id})`);

  // Action row inside the box UI card
  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('demo_create_ticket')
      .setLabel('Create Ticket')
      .setStyle(ButtonStyle.Secondary)
  );

  const bodyContent = [
    `**Server:** \`Aura Xtremez\``,
    `**Status:** \`Active & Monitored 24/7\``,
    `**Turnaround:** \`Under 24 Hours SLA\``,
    ``,
    `> **"Create a ticket if you face any issues, faq on rage we are ready to support you always."**`,
    ``,
    ``,
    `> ⚠️ **Important Notice:** **Please Don't Create Tickets for Fun!**`,
    `> **Spamming or opening frivolous tickets will result in an immediate support blacklist.**`
  ].join('\n');

  try {
    const sec = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('# **Aura Xtremez • Support Desk**')
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(GUILD_ICON)
      );

    const sep = new SeparatorBuilder().setDivider(true);

    const body = new TextDisplayBuilder().setContent(bodyContent);

    const footer = new TextDisplayBuilder().setContent('-# Rage Secure Support Desk • Aura Xtremez');

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

    console.log('[TicketDemo] Successfully sent ticketing box UI demo to DM!');
  } catch (v2Err: any) {
    console.warn('[TicketDemo] Components V2 failed, sending fallback embed:', v2Err?.message);
    const divider = '──────────────────────────────────────────';
    const embed = new EmbedBuilder()
      .setColor(0x99CC00)
      .setThumbnail(GUILD_ICON)
      .setDescription([
        `# **Aura Xtremez • Support Desk**`,
        `\u200B`,
        `${divider}`,
        bodyContent
      ].join('\n'))
      .setFooter({ text: 'Rage Secure Support Desk • Aura Xtremez' });

    await user.send({
      embeds: [embed],
      components: [actionRow]
    });
    console.log('[TicketDemo] Successfully sent fallback embed!');
  }

  await client.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error('[TicketDemo] Error:', err);
  process.exit(1);
});

