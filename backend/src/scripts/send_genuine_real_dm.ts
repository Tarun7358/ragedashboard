import {
  Client,
  GatewayIntentBits,
  AttachmentBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags
} from 'discord.js';
import dotenv from 'dotenv';
import sharp from 'sharp';
import { ALL_MANIFESTS } from '../index.js';
import { PrefixRegistry } from '../core/prefix/PrefixRegistry.js';

dotenv.config({ path: 'backend/.env' });

const token = process.env.DISCORD_TOKEN;
const targetUserId = '1140892126402596905';

// Initialize our bot's real registered commands
PrefixRegistry.initialize(ALL_MANIFESTS);

async function generateHelpBanner(title: string, badgeText: string | null) {
  const width = 760;
  const height = 86;

  let badgeSvg = '';
  if (badgeText) {
    const pillWidth = 148;
    const pillHeight = 36;
    const pillX = width - pillWidth - 24;
    const pillY = (height - pillHeight) / 2;
    const textX = pillX + (pillWidth / 2);
    const textY = pillY + 23;

    badgeSvg = `
      <rect x="${pillX}" y="${pillY}" width="${pillWidth}" height="${pillHeight}" rx="18" ry="18" fill="#F4EDE8" />
      <text x="${textX}" y="${textY}" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="14" font-weight="800" fill="#141519" text-anchor="middle">${badgeText}</text>
    `;
  }

  const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="${width - 4}" height="${height - 4}" rx="16" ry="16" fill="#15161A" stroke="#25272F" stroke-width="2"/>
    <text x="28" y="52" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="24" font-weight="800" fill="#FFFFFF">${title}</text>
    ${badgeSvg}
  </svg>
  `;

  return await sharp(Buffer.from(svg)).png().toBuffer();
}

async function main() {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages]
  });

  client.once('clientReady', async () => {
    console.log(`[Bot] Connected as ${client.user?.tag}`);
    try {
      const user = await client.users.fetch(targetUserId);
      console.log(`[Bot] Target user: ${user.tag} (${user.id})`);

      const categories = PrefixRegistry.getCategories();
      const allCommands = PrefixRegistry.getAllCommands();
      const realGuildCount = client.guilds.cache.size;
      let realTotalMembers = 0;
      client.guilds.cache.forEach(g => {
        realTotalMembers += (g.memberCount || 0);
      });

      let totalCommandsWithSubs = 0;
      allCommands.forEach(c => {
        totalCommandsWithSubs += 1 + (c.subcommands?.length || 0);
      });

      console.log(`[Bot] Real Stats: ${realGuildCount} servers, ${realTotalMembers} members, ${totalCommandsWithSubs} total commands across ${categories.length} modules.`);

      // ─────────────────────────────────────────────────────────────
      // 1. ROOT HELP — REAL STATS, ALL MODULES IN DROPDOWN, NO EMOJIS
      // ─────────────────────────────────────────────────────────────
      const homeBannerBuf = await generateHelpBanner('Help', null);
      const homeAttachment = new AttachmentBuilder(homeBannerBuf, { name: 'help-box-home.png' });

      const homeContainer = new ContainerBuilder();

      homeContainer.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL('attachment://help-box-home.png')
        )
      );

      const previewPills = categories.slice(0, 8).map(c => `\`${c}\``).join(' ') + ` \`+${categories.length - 8} more\``;

      homeContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `\`R A G E   O P T I M I S E R\`\n\n` +
          `**${totalCommandsWithSubs} commands · ${categories.length} modules · Maintained by @RageTeam**\n\n` +
          `Welcome to **@${client.user?.username}**, an enterprise security and community management bot trusted by **${realGuildCount} servers** and **${realTotalMembers.toLocaleString()} users**, with **${totalCommandsWithSubs} commands** configured. Hosted on **High-Speed Infrastructure**, with guides and updates on the **Rage Official Support** channel.\n\n` +
          `${previewPills}\n\n` +
          `Use **Select Category** below or \`.help <command>\`.\n`
        )
      );

      // Category select menu listing ALL our bot's real categories (NO emojis)
      const homeCatOptions = categories.slice(0, 25).map(cat => {
        const count = PrefixRegistry.getCommandsByCategory(cat).length;
        return {
          label: cat,
          value: `help_cat_${cat.toLowerCase().replace(/[\s&]+/g, '_')}`,
          description: `${count} registered commands in ${cat}`
        };
      });

      homeContainer.addActionRowComponents(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('demo_cat_select')
            .setPlaceholder('Select Category')
            .addOptions(homeCatOptions)
        )
      );

      // Buttons (NO emojis)
      homeContainer.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('nav_prev').setLabel('|<').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('nav_select').setLabel('Select Category').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('nav_next').setLabel('>|').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setLabel('Dashboard').setStyle(ButtonStyle.Link).setURL('https://ragesecuredashboard.netlify.app'),
          new ButtonBuilder().setCustomId('nav_refresh').setLabel('Refresh').setStyle(ButtonStyle.Secondary)
        )
      );

      homeContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`*Requested by ${user.username}*`)
      );

      await user.send({
        flags: MessageFlags.IsComponentsV2 || (1 << 15),
        components: [homeContainer],
        files: [homeAttachment]
      });
      console.log(`[Bot] Real Root Help sent to ${user.tag}`);

      // ─────────────────────────────────────────────────────────────
      // 2. SECURITY MODULE — 100% OUR BOT'S ACTUAL COMMANDS (NO 'ss', NO TEMPLATE)
      // ─────────────────────────────────────────────────────────────
      const secCmds = PrefixRegistry.getCommandsByCategory('Security');

      let secTotalCmdCount = 0;
      secCmds.forEach(c => {
        const allNames = [c.name, ...(c.aliases || []), ...(c.subcommands?.map(s => s.name.split(' ')[0]) || [])];
        secTotalCmdCount += [...new Set(allNames)].length;
      });

      const catBannerBuf = await generateHelpBanner('Help > Security', `${secTotalCmdCount} commands`);
      const catAttachment = new AttachmentBuilder(catBannerBuf, { name: 'help-box-security.png' });

      const catContainer = new ContainerBuilder();

      catContainer.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL('attachment://help-box-security.png')
        )
      );

      // Build pill blocks for our bot's real security commands
      // Core Defense
      const anCmd = secCmds.find(c => c.name === 'antinuke');
      const anNames = anCmd ? [anCmd.name, ...(anCmd.aliases || []), ...(anCmd.subcommands?.map(s => s.name.split(' ')[0]) || [])] : [];
      const anPills = [...new Set(anNames)].map(n => `\`${n}\``).join(' ');

      const secMaster = secCmds.find(c => c.name === 'security');
      const secNames = secMaster ? [secMaster.name, ...(secMaster.aliases || []), ...(secMaster.subcommands?.map(s => s.name.split(' ')[0]) || [])] : [];
      const secPills = [...new Set(secNames)].map(n => `\`${n}\``).join(' ');

      const wlCmd = secCmds.find(c => c.name === 'whitelist');
      const wlNames = wlCmd ? [wlCmd.name, ...(wlCmd.aliases || []), ...(wlCmd.subcommands?.map(s => s.name.split(' ')[0]) || [])] : [];
      const wlPills = [...new Set(wlNames)].map(n => `\`${n}\``).join(' ');

      const blCmd = secCmds.find(c => c.name === 'blacklist');
      const blNames = blCmd ? [blCmd.name, ...(blCmd.aliases || []), ...(blCmd.subcommands?.map(s => s.name.split(' ')[0]) || [])] : [];
      const blPills = [...new Set(blNames)].map(n => `\`${n}\``).join(' ');

      const jgCmd = secCmds.find(c => c.name === 'joinguard');
      const jgNames = jgCmd ? [jgCmd.name, ...(jgCmd.aliases || []), ...(jgCmd.subcommands?.map(s => s.name.split(' ')[0]) || [])] : [];
      const jgPills = [...new Set(jgNames)].map(n => `\`${n}\``).join(' ');

      // Isolation & Quarantine
      const isoPills = ['quarantine', 'unquarantine', 'lockdown', 'emergency', 'temprole', 'tr'].map(n => `\`${n}\``).join(' ');

      // Moderation Suite under Security
      const modPills = ['ban', 'unban', 'softban', 'tempban', 'kick', 'mute', 'unmute', 'timeout', 'untimeout', 'warn', 'warnings', 'clearwarnings', 'purge', 'lock', 'unlock', 'slowmode', 'nick', 'cases', 'history'].map(n => `\`${n}\``).join(' ');

      const secBody = [
        `\`R A G E   O P T I M I S E R\`\n`,
        `**Anti-Nuke Threat Defense [${[...new Set(anNames)].length}]**`,
        `${anPills}\n`,
        `**Security Health & Risk Assessment [${[...new Set(secNames)].length}]**`,
        `${secPills}\n`,
        `**Smart Whitelist & Immunity Manager [${[...new Set(wlNames)].length}]**`,
        `${wlPills}\n`,
        `**Blacklist & Anti-Raid Isolation [${[...new Set(blNames)].length}]**`,
        `${blPills}\n`,
        `**Join Guard Verification Gate [${[...new Set(jgNames)].length}]**`,
        `${jgPills}\n`,
        `**Emergency Lockdown & Quarantine [6]**`,
        `${isoPills}\n`,
        `**Moderation & Enforcement [19]**`,
        `${modPills}\n`,
        `*open a module from the sub module menu below, then pick a command to see its full explanation, or use .help <cmd name>*\n`
      ].join('\n');

      catContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(secBody)
      );

      // Primary Category Menu
      catContainer.addActionRowComponents(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('demo_cat_menu_sec')
            .setPlaceholder('Security')
            .addOptions([
              { label: 'Security', value: 'help_cat_security', default: true },
              { label: 'AutoMod', value: 'help_cat_automod' },
              { label: 'Voice', value: 'help_cat_voice' },
              { label: 'Community', value: 'help_cat_community' },
              { label: 'Leveling & Economy', value: 'help_cat_leveling' },
              { label: 'Tickets', value: 'help_cat_tickets' },
              { label: 'Giveaways', value: 'help_cat_giveaways' },
              { label: 'Backups', value: 'help_cat_backups' },
              { label: 'Bulk Operations', value: 'help_cat_bulk' },
              { label: 'Reaction Roles', value: 'help_cat_reaction_roles' },
              { label: 'Reminders', value: 'help_cat_reminders' },
              { label: 'Social Updates', value: 'help_cat_social_updates' },
              { label: 'Announcements', value: 'help_cat_announcements' },
              { label: 'Audit & Logging', value: 'help_cat_audit' },
              { label: 'Analytics', value: 'help_cat_analytics' },
              { label: 'Configuration', value: 'help_cat_config' },
              { label: 'Diagnostics', value: 'help_cat_diagnostics' },
              { label: 'System', value: 'help_cat_system' }
            ])
        )
      );

      // Sub-module select menu
      catContainer.addActionRowComponents(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('demo_sub_menu_sec')
            .setPlaceholder('Select a sub module or command...')
            .addOptions([
              { label: '.antinuke', value: 'cmd_antinuke', description: 'Configure 29 anti-nuke rules, limits and punishments' },
              { label: '.security', value: 'cmd_security', description: 'Master security score, risk scan, and audit' },
              { label: '.whitelist', value: 'cmd_whitelist', description: 'Manage trusted users, bots, and roles' },
              { label: '.blacklist', value: 'cmd_blacklist', description: 'Manage blacklisted users and raid defense' },
              { label: '.joinguard', value: 'cmd_joinguard', description: 'Join gate limits and verification thresholds' },
              { label: '.quarantine', value: 'cmd_quarantine', description: 'Isolate suspicious actors from server channels' },
              { label: '.lockdown', value: 'cmd_lockdown', description: 'Emergency server-wide text & voice lockdown' }
            ])
        )
      );

      catContainer.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('btn_cat_prev').setLabel('|<').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('btn_cat_menu').setLabel('Select Category').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('btn_cat_next').setLabel('>|').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setLabel('Dashboard').setStyle(ButtonStyle.Link).setURL('https://ragesecuredashboard.netlify.app'),
          new ButtonBuilder().setCustomId('btn_cat_refresh').setLabel('Refresh').setStyle(ButtonStyle.Secondary)
        )
      );

      catContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`*Requested by ${user.username}*`)
      );

      await user.send({
        flags: MessageFlags.IsComponentsV2 || (1 << 15),
        components: [catContainer],
        files: [catAttachment]
      });
      console.log(`[Bot] Real Security Category Help sent to ${user.tag}`);

      // ─────────────────────────────────────────────────────────────
      // 3. VOICE & AUTOMOD MODULE PREVIEW — SHOWING OTHER MODULES
      // ─────────────────────────────────────────────────────────────
      const voiceCmds = PrefixRegistry.getCommandsByCategory('Voice');
      let voiceTotalCmdCount = 0;
      voiceCmds.forEach(c => {
        const allNames = [c.name, ...(c.aliases || []), ...(c.subcommands?.map(s => s.name.split(' ')[0]) || [])];
        voiceTotalCmdCount += [...new Set(allNames)].length;
      });

      const voiceBannerBuf = await generateHelpBanner('Help > Voice', `${voiceTotalCmdCount} commands`);
      const voiceAttachment = new AttachmentBuilder(voiceBannerBuf, { name: 'help-box-voice.png' });

      const voiceContainer = new ContainerBuilder();

      voiceContainer.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL('attachment://help-box-voice.png')
        )
      );

      const voiceSections = voiceCmds.map(c => {
        const allNames = [c.name, ...(c.aliases || []), ...(c.subcommands?.map(s => s.name.split(' ')[0]) || [])];
        const uniqueNames = [...new Set(allNames)];
        const pillList = uniqueNames.map(n => `\`${n}\``).join(' ');
        return `**${c.name.toUpperCase()} [${uniqueNames.length}]**\n${pillList}`;
      });

      voiceContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `\`R A G E   O P T I M I S E R\`\n\n` +
          voiceSections.join('\n\n') +
          `\n\n*open a module from the sub module menu below, then pick a command to see its full explanation, or use .help <cmd name>*\n`
        )
      );

      voiceContainer.addActionRowComponents(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('demo_cat_menu_voice')
            .setPlaceholder('Voice')
            .addOptions([
              { label: 'Voice', value: 'help_cat_voice', default: true },
              { label: 'Security', value: 'help_cat_security' },
              { label: 'AutoMod', value: 'help_cat_automod' },
              { label: 'Community', value: 'help_cat_community' },
              { label: 'Leveling & Economy', value: 'help_cat_leveling' }
            ])
        )
      );

      voiceContainer.addActionRowComponents(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('demo_sub_menu_voice')
            .setPlaceholder('Select a sub module or command...')
            .addOptions(
              voiceCmds.map(c => ({
                label: `.${c.name}`,
                value: `cmd_${c.name}`,
                description: `${c.description.slice(0, 50)}`
              }))
            )
        )
      );

      voiceContainer.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('btn_v_prev').setLabel('|<').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('btn_v_menu').setLabel('Select Category').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('btn_v_next').setLabel('>|').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setLabel('Dashboard').setStyle(ButtonStyle.Link).setURL('https://ragesecuredashboard.netlify.app'),
          new ButtonBuilder().setCustomId('btn_v_refresh').setLabel('Refresh').setStyle(ButtonStyle.Secondary)
        )
      );

      voiceContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`*Requested by ${user.username}*`)
      );

      await user.send({
        flags: MessageFlags.IsComponentsV2 || (1 << 15),
        components: [voiceContainer],
        files: [voiceAttachment]
      });
      console.log(`[Bot] Real Voice Category Help sent to ${user.tag}`);

      console.log('[Bot] ALL GENUINE REAL COMMAND DEMOS SENT TO', user.id);
      setTimeout(() => process.exit(0), 1000);
    } catch (err) {
      console.error('[Bot Error]:', err);
      process.exit(1);
    }
  });

  await client.login(token);
}

main().catch(err => {
  console.error('[Fatal Error]:', err);
  process.exit(1);
});

