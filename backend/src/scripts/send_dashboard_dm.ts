import {
  Client,
  GatewayIntentBits,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} from 'discord.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { buildSecurityDashboardCard } from '../modules/security/enable.js';

const TARGET_USER_ID = '1140892126402596905'; // XT | CLASHER
const GUILD_ID = '1266048940101599293'; // Aura Xtremez

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMembers]
});

async function main() {
  console.log('[DashboardDM] Logging in...');
  await client.login(process.env.DISCORD_TOKEN);

  const guild = client.guilds.cache.get(GUILD_ID) || await client.guilds.fetch(GUILD_ID);
  if (!guild) {
    throw new Error(`Guild ${GUILD_ID} not found`);
  }
  console.log(`[DashboardDM] Found guild: ${guild.name} (${guild.id})`);

  const user = await client.users.fetch(TARGET_USER_ID);
  if (!user) {
    throw new Error(`Target user ${TARGET_USER_ID} not found`);
  }
  console.log(`[DashboardDM] Found target user: ${user.tag} (${user.id})`);

  // Build the dashboard data using the real live guild metrics
  const dashboard = await buildSecurityDashboardCard(guild);
  console.log('[DashboardDM] Dashboard card generated with', dashboard.embeds?.length, 'embeds');

  const embeds = dashboard.embeds || [];
  const desc0 = (embeds[0]?.data?.description || '').replace(/•/g, '-').replace(/—/g, '-');
  const desc1 = embeds[1]?.data?.description || '';
  const desc2 = embeds[2]?.data?.description || '';
  const desc3 = embeds[3]?.data?.description || '';
  const desc4 = embeds[4]?.data?.description || '';

  // Convert to Discord Components V2 Box UI containers
  const c1 = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# **RAGE DASHBOARD**'))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(desc0));

  const c2 = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('### **ANTINUKE PROTECTION MATRIX (12 MODULES)**'))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(desc1));

  const c3 = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('### **SERVER INFRASTRUCTURE MATRIX**'))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(desc2));

  const c4 = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('### **LIVE REALTIME SECURITY MONITORING CORE**'))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(desc3));

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('sec_btn_extraowner').setLabel('Extra Owners').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('sec_btn_wl_user').setLabel('Whitelist User').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('sec_btn_wl_role').setLabel('Whitelist Role').setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('sec_btn_2fa').setLabel('2FA Passcode').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('sec_btn_rescan').setLabel('Rescan Server').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('sec_btn_logs').setLabel('Threat Timeline').setStyle(ButtonStyle.Secondary)
  );

  const c5 = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('### **RECENT DISCIPLINARY LOGS & AUTOMOD ACTIONS**'))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(desc4))
    .addActionRowComponents(row1)
    .addActionRowComponents(row2)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Rage Optimiser - Unbypassable Security'));

  const containers = [c1, c2, c3, c4, c5];

  console.log('[DashboardDM] Sending Components V2 Box UI to user DM...');
  const msg = await user.send({
    flags: MessageFlags.IsComponentsV2,
    components: containers
  });

  console.log(`[DashboardDM] ✅ Sent successfully! Message ID: ${msg.id}`);
  process.exit(0);
}

main().catch(err => {
  console.error('[DashboardDM] Error:', err);
  process.exit(1);
});
