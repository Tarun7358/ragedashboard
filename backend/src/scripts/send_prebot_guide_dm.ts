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

const TARGET_USER_IDS = ['1140892126402596905', process.env.OWNER_ID].filter(Boolean) as string[];
const GUILD_ICON = 'https://cdn.discordapp.com/icons/1266048940101599293/a17d3c7a86fff32084748ff94be35325.png?size=512';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages]
});

async function main() {
  console.log('[PreBotGuideDM] Logging in...');
  await client.login(process.env.DISCORD_TOKEN);
  console.log(`[PreBotGuideDM] Logged in as ${client.user?.tag} (${client.user?.id})`);

  // Target CLASHER
  const targetId = '1140892126402596905';
  const user = await client.users.fetch(targetId);
  if (!user) {
    throw new Error(`Target user ${targetId} not found`);
  }
  console.log(`[PreBotGuideDM] Target user found: ${user.tag} (${user.id})`);

  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('Support Server')
      .setURL('https://discord.gg/mK8HVJGzYt')
      .setStyle(ButtonStyle.Link),
    new ButtonBuilder()
      .setLabel('Dashboard')
      .setURL('https://apirageoptimisercom.altvr.in')
      .setStyle(ButtonStyle.Link)
  );

  const guideContent = [
    `### **What is PreBot?**`,
    `> **PreBot is pre-approving a bot by its ID so Rage Optimiser's Anti-Nuke doesn't automatically kick or ban it the moment it joins your server.**`,
    ``,
    `<a:warning:1546155193303957504> **Why You Need It:**`,
    `> Rage Optimiser blocks all unknown bots by default to stop server nukers and raid bots. Adding a bot to **PreBot** verifies it as trusted before inviting it.`,
    ``,
    `<:member:1532621317487071426> **Step 1: Copy the Bot ID**`,
    `> Right-click the bot you want to invite (or check its invite link) and click **Copy User ID**.`,
    ``,
    `<:config:1532620719878574160> **Step 2: Pre-Approve in Server**`,
    `> Type \`r!prebot add <BOT_ID>\` in any channel where the bot has access.`,
    `> *(Example: \`r!prebot add 1520323151928623125\`)*`,
    ``,
    `<:ticks:1532620580266836148> **Step 3: Choose Permissions**`,
    `> Select the exact permissions the bot is allowed to have, and click **Save**.`,
    ``,
    `<a:success_check:1546134620087783526> **Step 4: Invite the Bot**`,
    `> Open the bot's regular invite link and invite it. It will join safely with full protection!`,
    ``,
    `<:vip:1532620837117759508> **Quick Commands:**`,
    `• \`r!prebot add <BOT_ID>\` — Pre-approve a new bot`,
    `• \`r!prebot list\` — View all approved bots`,
    `• \`r!prebot remove <BOT_ID>\` — Revoke a bot's pre-approval`,
    `• \`r!prebot on\` / \`r!prebot off\` — Toggle PreBot enforcement`
  ].join('\n');

  const botAvatar = client.user?.displayAvatarURL({ size: 512 }) || GUILD_ICON;

  try {
    const sec = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('# **Rage Security • PreBot Whitelist Guide**')
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(botAvatar)
      );

    const sep = new SeparatorBuilder().setDivider(true);
    const body = new TextDisplayBuilder().setContent(guideContent);
    const footer = new TextDisplayBuilder().setContent('-# Rage Optimiser Enterprise • Unbypassable Security');

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

    console.log('[PreBotGuideDM] Successfully sent Components V2 Box UI to user DM!');
  } catch (err: any) {
    console.warn('[PreBotGuideDM] Components V2 failed, sending Embed fallback:', err.message);
    const embed = new EmbedBuilder()
      .setTitle('Rage Security • PreBot Whitelist Guide')
      .setColor(0x84cc16)
      .setThumbnail(botAvatar)
      .setDescription(guideContent)
      .setFooter({ text: 'Rage Optimiser Enterprise • Unbypassable Security' })
      .setTimestamp();

    await user.send({
      embeds: [embed],
      components: [actionRow]
    });
    console.log('[PreBotGuideDM] Sent fallback embed to user DM!');
  }

  await client.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error('[PreBotGuideDM] Error:', err);
  process.exit(1);
});
