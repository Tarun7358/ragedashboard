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
import sqlite3 from 'sqlite3';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DB_PATH = 'D:/RAGE OPTIMISER V3/CLUTCH NATION/database.sqlite';
const GUILD_ICON = 'https://cdn.discordapp.com/icons/1266048940101599293/a17d3c7a86fff32084748ff94be35325.png?size=512';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages]
});

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function getUniqueOwners(): Promise<string[]> {
  const owners = new Set<string>();

  // 1. Live Bot Guilds
  console.log('[Broadcast] Fetching live guild owners...');
  const guilds = await client.guilds.fetch();
  for (const [gId, gBase] of guilds) {
    try {
      const g = await gBase.fetch();
      if (g && g.ownerId) {
        owners.add(g.ownerId);
      }
    } catch (e: any) {
      console.warn(`[Broadcast] Could not fetch guild ${gId}: ${e.message}`);
    }
  }

  // 2. Extra Owners table (addedBy is the Server Owner)
  await new Promise<void>((resolve) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.warn(`[Broadcast] SQLite open failed: ${err.message}`);
        return resolve();
      }
      db.all<{ addedBy: string }>('SELECT addedBy FROM extra_owners', (qErr, rows) => {
        if (!qErr && rows) {
          for (const r of rows) {
            if (r.addedBy) owners.add(r.addedBy);
          }
        }
        db.close();
        resolve();
      });
    });
  });

  return Array.from(owners);
}

function buildPreBotMessage(botAvatar: string) {
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

  const fallbackEmbed = new EmbedBuilder()
    .setTitle('Rage Security • PreBot Whitelist Guide')
    .setColor(0x84cc16)
    .setThumbnail(botAvatar)
    .setDescription(guideContent)
    .setFooter({ text: 'Rage Optimiser Enterprise • Unbypassable Security' })
    .setTimestamp();

  return { container, fallbackEmbed, actionRow };
}

async function main() {
  console.log('[Broadcast] Connecting to Discord...');
  await client.login(process.env.DISCORD_TOKEN);
  console.log(`[Broadcast] Logged in as ${client.user?.tag} (${client.user?.id})`);

  const ownerIds = await getUniqueOwners();
  console.log(`[Broadcast] Found ${ownerIds.length} unique server owners to notify.`);

  const botAvatar = client.user?.displayAvatarURL({ size: 512 }) || GUILD_ICON;
  const { container, fallbackEmbed, actionRow } = buildPreBotMessage(botAvatar);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < ownerIds.length; i++) {
    const ownerId = ownerIds[i];
    try {
      const user = await client.users.fetch(ownerId).catch(() => null);
      if (!user) {
        console.warn(`[Broadcast] [${i + 1}/${ownerIds.length}] User ${ownerId} not found.`);
        failCount++;
        continue;
      }

      // Send Components V2 Box UI with Embed fallback
      try {
        await user.send({
          flags: MessageFlags.IsComponentsV2,
          components: [container]
        });
        console.log(`[Broadcast] [${i + 1}/${ownerIds.length}] ✅ Delivered to ${user.tag} (${user.id})`);
        successCount++;
      } catch (v2Err: any) {
        // Fallback embed if Components V2 unsupported
        try {
          await user.send({
            embeds: [fallbackEmbed],
            components: [actionRow]
          });
          console.log(`[Broadcast] [${i + 1}/${ownerIds.length}] ✅ Delivered (fallback embed) to ${user.tag} (${user.id})`);
          successCount++;
        } catch (fbErr: any) {
          console.warn(`[Broadcast] [${i + 1}/${ownerIds.length}] ❌ Failed to send DM to ${user.tag} (${user.id}): ${fbErr.message}`);
          failCount++;
        }
      }
    } catch (err: any) {
      console.error(`[Broadcast] [${i + 1}/${ownerIds.length}] Unexpected error for ${ownerId}: ${err.message}`);
      failCount++;
    }

    // Rate-limit buffer (1.2s between DMs)
    await sleep(1200);
  }

  console.log('==============================================');
  console.log(`[Broadcast Complete]`);
  console.log(`Total Target Owners: ${ownerIds.length}`);
  console.log(`Successfully Sent:   ${successCount}`);
  console.log(`Failed / DMs Closed: ${failCount}`);
  console.log('==============================================');

  await client.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error('[Broadcast] Fatal Error:', err);
  process.exit(1);
});
