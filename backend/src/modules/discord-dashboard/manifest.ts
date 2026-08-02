import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel } from 'discord.js';
import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';

// Helper to get stats
function getServerStats(guild: any, context?: any) {
  const registry = context?.getRegistry ? context.getRegistry() : null;
  const onlineCount = guild.approximatePresenceCount ??
    (registry?.onlineCount !== undefined ? registry.onlineCount : guild.members.cache.filter((m: any) => Boolean(m.presence && m.presence.status !== 'offline')).size);
  return {
    totalMembers: guild.memberCount || registry?.memberCount || 0,
    onlineMembers: onlineCount || 0,
    boosts: guild.premiumSubscriptionCount || 0,
    channels: guild.channels.cache.size || 0
  };
}

// Generate the embed based on the page using Lime GG Reference UI
function generateDashboardEmbed(guild: any, page: string, client: any, context: any) {
  const stats = getServerStats(guild, context);
  const verifiedIcon = '<a:approved:1532390590707142956>';
  const shieldIcon = '<:shield:1532403012751065179>';
  
  const embed = new EmbedBuilder()
    .setColor(0x84cc16)
    .setThumbnail(guild.iconURL({ size: 256 }) || client.user?.displayAvatarURL({ size: 256 }) || null)
    .setFooter({ text: 'Rage Optimiser • Security Engine' })
    .setTimestamp();

  switch (page) {
    case 'home':
      embed.setDescription([
        `> • **SYSTEM OVERVIEW**`,
        `> • **RAGE OPTIMISER CONTROL PANEL**`,
        `> `,
        `> ${verifiedIcon} **Total Members**: \`${stats.totalMembers}\``,
        `> ${verifiedIcon} **Online Members**: \`${stats.onlineMembers}\``,
        `> ${shieldIcon} **Server Boosts**: \`${stats.boosts}\` (Tier: \`Premium\`)`,
        `> ${shieldIcon} **Channels**: \`${stats.channels}\``,
        `> ${shieldIcon} **Bot Ping**: \`${client.ws.ping}ms\``,
        `> `,
        `> ${verifiedIcon} __**System Status: Online & Monitoring**__`
      ].join('\n'));
      break;

    case 'members':
      embed.setDescription([
        `> • **MEMBER ANALYTICS**`,
        `> • **RAGE OPTIMISER CONTROL PANEL**`,
        `> `,
        `> ${verifiedIcon} **Current Population**: \`${stats.totalMembers}\` users`,
        `> ${verifiedIcon} **Online Active**: \`${stats.onlineMembers}\` users`,
        `> ${shieldIcon} **Member Protection**: \`Active\``
      ].join('\n'));
      break;

    case 'messages':
      embed.setDescription([
        `> • **MESSAGE TELEMETRY**`,
        `> • **RAGE OPTIMISER CONTROL PANEL**`,
        `> `,
        `> ${verifiedIcon} **Top Active Channels**:`,
        `> ${verifiedIcon} __**#general-chat**__`,
        `> ${verifiedIcon} __**#commands**__`
      ].join('\n'));
      break;

    case 'voice':
      const voiceCount = guild.members.cache.filter((m: any) => m.voice?.channelId).size;
      embed.setDescription([
        `> • **VOICE COMMS**`,
        `> • **RAGE OPTIMISER CONTROL PANEL**`,
        `> `,
        `> ${verifiedIcon} **Active Voice Connections**: \`${voiceCount}\` users`,
        `> ${shieldIcon} **Voice Guard Status**: \`Protected\``
      ].join('\n'));
      break;

    case 'tickets':
      const modules = context?.getModulesState ? context.getModulesState() : [];
      const ticketsModule = modules.find((m: any) => m.id === 'tickets');
      const catId = ticketsModule?.config?.categoryId;
      const activeTickets = catId ? guild.channels.cache.filter((c: any) => c.parentId === catId && c.name.startsWith('ticket-')).size : 0;
      
      embed.setDescription([
        `> • **SUPPORT DESK**`,
        `> • **RAGE OPTIMISER CONTROL PANEL**`,
        `> `,
        `> ${verifiedIcon} **Open Inquiries**: \`${activeTickets}\` Active`,
        `> ${verifiedIcon} **Resolved Today**: \`0\` Closed`
      ].join('\n'));
      break;

    case 'events':
      embed.setDescription([
        `> • **COMMUNITY EVENTS**`,
        `> • **RAGE OPTIMISER CONTROL PANEL**`,
        `> `,
        `> ${verifiedIcon} **Upcoming Schedule**: \`No active events at this time\``
      ].join('\n'));
      break;

    case 'stats':
      embed.setDescription([
        `> • **DEEP ANALYTICS**`,
        `> • **RAGE OPTIMISER CONTROL PANEL**`,
        `> `,
        `> ${verifiedIcon} **Engagement Index**: \`Gathering real-time telemetry...\``
      ].join('\n'));
      break;

    case 'more':
      embed.setDescription([
        `> • **ADVANCED MODULES**`,
        `> • **RAGE OPTIMISER CONTROL PANEL**`,
        `> `,
        `> ${verifiedIcon} __**Announcements System**__`,
        `> ${verifiedIcon} __**Suggestions Box**__`,
        `> ${verifiedIcon} __**Moderation & Security Logs**__`
      ].join('\n'));
      break;
  }

  return embed;
}

function safeEmoji(client: any, target: string, fallback: string): string {
  if (!target) return fallback;
  if (target.startsWith('<') && target.endsWith('>')) return target;
  if (!target.startsWith(':')) return target;

  const rawName = target.replace(/^:|:$/g, '').replace(/~.*$/, '').trim();
  if (client?.emojis?.cache) {
    const matched = client.emojis.cache.find((e: any) => e.name.toLowerCase() === rawName.toLowerCase());
    if (matched) {
      return matched.animated ? `<a:${matched.name}:${matched.id}>` : `<:${matched.name}:${matched.id}>`;
    }
  }
  return fallback;
}

function generateDashboardComponents(config: any = {}, activePage: string = 'home', client?: any) {
  const enabledPages = config.enabledPages || {
    home: true,
    members: true,
    messages: true,
    voice: true,
    tickets: true,
    events: true,
    stats: true,
    more: true
  };

  const allButtons = [
    { id: 'dbn_home', label: 'Home', emoji: safeEmoji(client, ':50738home:', '🏠'), page: 'home' },
    { id: 'dbn_members', label: 'Members', emoji: safeEmoji(client, ':membericons:', '👥'), page: 'members' },
    { id: 'dbn_messages', label: 'Messages', emoji: safeEmoji(client, ':paperplane:', '💬'), page: 'messages' },
    { id: 'dbn_voice', label: 'Voice', emoji: safeEmoji(client, ':voicechannellimitedgreen:', '🎙️'), page: 'voice' },
    { id: 'dbn_tickets', label: 'Tickets', emoji: '<:ticket:1532620631466836021>', page: 'tickets' },
    { id: 'dbn_events', label: 'Events', emoji: safeEmoji(client, ':announcements~3:', '🎉'), page: 'events' },
    { id: 'dbn_stats', label: 'Statistics', emoji: safeEmoji(client, ':stats:', '<:stats:1532429110775779459>'), page: 'stats' },
    { id: 'dbn_more', label: 'More', emoji: '<:config:1532425712844144701>', page: 'more' }
  ];

  // Filter only enabled pages
  const enabledButtons = allButtons.filter(b => enabledPages[b.page] !== false);

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let currentRow = new ActionRowBuilder<ButtonBuilder>();

  for (const b of enabledButtons) {
    if (currentRow.components.length >= 5) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder<ButtonBuilder>();
    }
    const style = b.page === activePage ? ButtonStyle.Success : ButtonStyle.Secondary;
    currentRow.addComponents(
      new ButtonBuilder()
        .setCustomId(b.id)
        .setLabel(b.label)
        .setEmoji(b.emoji)
        .setStyle(style)
    );
  }

  if (currentRow.components.length > 0) {
    rows.push(currentRow);
  }

  // Utility row (always enabled, single Auto-Refresh status button)
  const utilityRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('dbn_refresh').setLabel('Auto-Refreshing (5s)').setEmoji('🔄').setStyle(ButtonStyle.Success)
  );
  rows.push(utilityRow);

  return rows;
}

export const DiscordDashboardManifest: ModuleManifest = {
  id: 'discord-dashboard',
  name: 'Discord Dashboard',
  version: '1.0.0',
  description: 'Interactive single-message Discord control panel for server statistics and logs.',
  configSchema: {
    requiredFields: [],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      const errors: string[] = [];
      let progress = 0;
      
      if (config.channelId) {
        progress += 100;
        const channelExists = registry.channels.some(c => c.id === config.channelId);
        if (!channelExists) errors.push(`Configured dashboard channel (${config.channelId}) does not exist.`);
      }

      return { progress, errors };
    }
  },
  commands: [
    {
      name: 'setup-discord-dashboard',
      description: 'Force spawn the Discord dashboard message in the current channel.'
    },
    {
      name: 'dashboard',
      description: 'Spawn the interactive Discord server control panel.'
    }
  ],
  events: [
    {
      name: 'tick',
      handler: async (client: any, context: any) => {
        if (!client || !client.isReady || !client.isReady() || !client.token) return;
        const modules = context.getModulesState ? context.getModulesState() : [];
        const dashModule = modules.find((m: any) => m.id === 'discord-dashboard');
        if (dashModule && dashModule.status === 'disabled') return;

        const config = dashModule?.config || {};
        if (!config.channelId || !config.messageId) return;

        // Auto-refresh interval (5 seconds)
        const interval = config.refreshInterval || 5000;
        const now = Date.now();
        if (!dashModule._lastRefresh) dashModule._lastRefresh = 0;
        if (now - dashModule._lastRefresh < interval) return;

        dashModule._lastRefresh = now;

        try {
          const guildId = context.guildId || process.env.GUILD_ID;
          if (!guildId) return;
          const guild = client.guilds.cache.get(guildId);
          if (!guild) return;

          const channel = guild.channels.cache.get(config.channelId) as TextChannel;
          if (!channel) return;

          const message = await channel.messages.fetch(config.messageId).catch(() => null);
          if (!message) return;

          const embed = generateDashboardEmbed(guild, 'home', client, context);
          const components = generateDashboardComponents(config, 'home', client);
          await message.edit({ embeds: [embed], components });
        } catch (err: any) {
          if (!err?.message?.includes('Expected token to be set')) {
            console.error('[Discord Dashboard] Background refresh failed:', err);
          }
        }
      }
    },
    {
      name: 'command_setup-discord-dashboard',
      handler: async (client: any, interaction: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const dashModule = modules.find((m: any) => m.id === 'discord-dashboard');
        
        if (dashModule && dashModule.status === 'disabled') {
          return interaction.reply({ content: '❌ Discord Dashboard module is currently disabled.', flags: 64 });
        }

        try {
          const embed = generateDashboardEmbed(interaction.guild, 'home', client, context);
          const components = generateDashboardComponents(dashModule?.config || {}, 'home', client);

          const message = await interaction.reply({ embeds: [embed], components, fetchReply: true });
          
          // Save message ID to backend config
          if (context.updateModuleConfig) {
            context.updateModuleConfig('discord-dashboard', {
              ...(dashModule?.config || {}),
              channelId: interaction.channelId,
              messageId: message.id
            });
          }

          context.logSyncEvent('Discord Dashboard initialized and pinned.', 'success');
        } catch (err) {
          console.error(err);
          await interaction.reply({ content: '❌ Failed to setup dashboard.', flags: 64 });
        }
      }
    },
    {
      name: 'command_dashboard',
      handler: async (client: any, interaction: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const dashModule = modules.find((m: any) => m.id === 'discord-dashboard');
        
        if (dashModule && dashModule.status === 'disabled') {
          return interaction.reply({ content: '❌ Discord Dashboard module is currently disabled.', flags: 64 });
        }

        try {
          const embed = generateDashboardEmbed(interaction.guild, 'home', client, context);
          const components = generateDashboardComponents(dashModule?.config || {}, 'home', client);

          await interaction.reply({ embeds: [embed], components });
        } catch (err) {
          console.error(err);
          await interaction.reply({ content: '❌ Failed to display dashboard.', flags: 64 });
        }
      }
    },
    ...['home', 'members', 'messages', 'voice', 'tickets', 'events', 'stats', 'more'].map(page => ({
      name: `button_dbn_${page}`,
      handler: async (client: any, interaction: any, context: any) => {
        try {
          const modules = context.getModulesState ? context.getModulesState() : [];
          const dashModule = modules.find((m: any) => m.id === 'discord-dashboard');
          const config = dashModule?.config || {};

          const embed = generateDashboardEmbed(interaction.guild, page, client, context);
          const components = generateDashboardComponents(config, page, client);
          await interaction.update({ embeds: [embed], components });
        } catch (err) {
          console.error(err);
        }
      }
    })),
    {
      name: 'button_dbn_refresh',
      handler: async (client: any, interaction: any, context: any) => {
        try {
          const modules = context.getModulesState ? context.getModulesState() : [];
          const dashModule = modules.find((m: any) => m.id === 'discord-dashboard');
          const config = dashModule?.config || {};

          const embed = generateDashboardEmbed(interaction.guild, 'home', client, context);
          const components = generateDashboardComponents(config, 'home', client);
          await interaction.update({ embeds: [embed], components });
        } catch (err) {
          console.error(err);
        }
      }
    },
    {
      name: 'button_dbn_config',
      handler: async (client: any, interaction: any, context: any) => {
        if (!interaction.memberPermissions?.has('Administrator')) {
          return interaction.reply({ content: '🔒 Only Administrators can access dashboard config.' });
        }
        const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:4680';
        await interaction.reply({ 
          content: `🛠️ **Dashboard Configuration**\nManage appearance, intervals, and pages directly from the Web Dashboard at: \`${dashboardUrl}/dashboard\``
        });
      }
    }
  ]
};
