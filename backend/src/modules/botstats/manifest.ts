import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Message } from 'discord.js';
import os from 'os';
import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { Database } from '../../core/Database.js';
import { PrefixRegistry } from '../../core/prefix/PrefixRegistry.js';
import {
  Colors, buildLimeOverviewCard, VERIFIED_ICON, WRONG_ICON, BOT_ICON,
  MEMBER_ICON, INFO_ICON, TIMER_ICON, CONFIG_ICON, SHIELD_ICON, fmt
} from '../../core/UIFactory.js';

export interface BotStatsMetrics {
  guildCount: number;
  totalMembers: number;
  cachedUsers: number;
  channelCount: number;
  textChannels: number;
  voiceChannels: number;
  uptimeFormatted: string;
  startUnix: number;
  nodeVersion: string;
  djsVersion: string;
  platform: string;
  arch: string;
  heapUsedMb: string;
  heapTotalMb: string;
  rssMb: string;
  cpuModel: string;
  cpuCores: number;
  wsPing: number;
  dbLatencyMs: number;
  whitelistedBotsCount: number;
  twoFactorServersCount: number;
  extraOwnerGuildsCount: number;
}

/**
 * Gather live global metrics across Discord client, SQLite database, and OS process.
 */
export async function computeBotStatsMetrics(client: any): Promise<BotStatsMetrics> {
  const uptimeSec = process.uptime();
  const days = Math.floor(uptimeSec / 86400);
  const hours = Math.floor(uptimeSec / 3600) % 24;
  const minutes = Math.floor(uptimeSec / 60) % 60;
  const seconds = Math.floor(uptimeSec % 60);
  const uptimeFormatted = `${days}d ${hours}h ${minutes}m ${seconds}s`;
  const startUnix = Math.floor((Date.now() - uptimeSec * 1000) / 1000);

  const guilds = client.guilds?.cache || new Map();
  const channels = client.channels?.cache || new Map();
  
  const guildCount = guilds.size || 0;
  const totalMembers = Array.from(guilds.values()).reduce((acc: number, g: any) => acc + (g.memberCount || 0), 0);
  const cachedUsers = client.users?.cache?.size || 0;
  
  const channelCount = channels.size || 0;
  const textChannels = Array.from(channels.values()).filter((c: any) => c.type === 0).length;
  const voiceChannels = Array.from(channels.values()).filter((c: any) => c.type === 2).length;

  const mem = process.memoryUsage();
  const heapUsedMb = (mem.heapUsed / 1024 / 1024).toFixed(1);
  const heapTotalMb = (mem.heapTotal / 1024 / 1024).toFixed(1);
  const rssMb = (mem.rss / 1024 / 1024).toFixed(1);

  const cpus = os.cpus();
  const cpuModel = cpus && cpus[0] ? cpus[0].model.trim() : 'Standard CPU';
  const cpuCores = cpus ? cpus.length : 1;

  const wsPing = Math.max(1, Math.round(client.ws?.ping || 0));

  // Measure database latency
  let dbLatencyMs = 0;
  let whitelistedBotsCount = 0;
  let twoFactorServersCount = 0;
  let extraOwnerGuildsCount = 0;

  const db = Database.getDb();
  if (db) {
    const t0 = performance.now();
    await db.get('SELECT 1').catch(() => {});
    dbLatencyMs = Math.max(0.1, Number((performance.now() - t0).toFixed(2)));

    const pbRow = await db.get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM prebot_whitelist').catch(() => null);
    if (pbRow) whitelistedBotsCount = pbRow.cnt;

    const tfaRow = await db.get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM prebot_2fa_config WHERE isEnabled = 1').catch(() => null);
    if (tfaRow) twoFactorServersCount = tfaRow.cnt;

    const eoRow = await db.get<{ cnt: number }>('SELECT COUNT(DISTINCT guildId) as cnt FROM guild_extra_owners').catch(() => null);
    if (eoRow) extraOwnerGuildsCount = eoRow.cnt;
  }

  return {
    guildCount,
    totalMembers,
    cachedUsers,
    channelCount,
    textChannels,
    voiceChannels,
    uptimeFormatted,
    startUnix,
    nodeVersion: process.version,
    djsVersion: 'v14.18.0',
    platform: process.platform,
    arch: process.arch,
    heapUsedMb,
    heapTotalMb,
    rssMb,
    cpuModel,
    cpuCores,
    wsPing,
    dbLatencyMs,
    whitelistedBotsCount,
    twoFactorServersCount,
    extraOwnerGuildsCount
  };
}

/**
 * Build the main Overview Card
 */
export function buildBotStatsOverviewEmbed(m: BotStatsMetrics) {
  return buildLimeOverviewCard({
    title: 'RAGE OPTIMISER • GLOBAL TELEMETRY MATRIX',
    subtitle: 'REAL-TIME PLATFORM STATISTICS & SYSTEM METRICS',
    color: Colors.BRAND,
    sections: [
      {
        title: '<:stats:1532429110775779459> NETWORK REACH & SCALE',
        items: [
          `Connected Servers: \`${fmt(m.guildCount)}\` Guilds`,
          `Total Served Members: \`${fmt(m.totalMembers)}\` Users (\`${fmt(m.cachedUsers)}\` Cached)`,
          `Monitored Channels: \`${fmt(m.channelCount)}\` (\`${m.textChannels}\` Text, \`${m.voiceChannels}\` VC)`
        ]
      },
      {
        title: '<:shield:1532403012751065179> ZERO-TRUST SECURITY ENGINE',
        items: [
          `Whitelisted Bots: \`${fmt(m.whitelistedBotsCount)}\` Pre-approved Entries`,
          `Google 2FA Protection: \`${m.twoFactorServersCount}\` Servers Active`,
          `Extra Owner Networks: \`${m.extraOwnerGuildsCount}\` Configured Servers`
        ]
      },
      {
        title: '<:config:1532425712844144701> INFRASTRUCTURE & RUNTIME',
        items: [
          `System Uptime: \`${m.uptimeFormatted}\` (Launched <t:${m.startUnix}:R>)`,
          `RAM Allocation: \`${m.heapUsedMb} MB\` Heap / \`${m.rssMb} MB\` RSS`,
          `WebSocket Latency: \`${m.wsPing}ms\` | DB Latency: \`${m.dbLatencyMs}ms\``,
          `Host Engine: Node.js \`${m.nodeVersion}\` on \`${m.platform} (${m.arch})\` (\`${m.cpuCores} Cores\`)`
        ]
      }
    ],
    footerText: 'Rage Optimiser Enterprise • Global Stats Telemetry'
  });
}

/**
 * Build Category-Specific Embeds
 */
export function buildCategoryEmbed(category: string, m: BotStatsMetrics) {
  if (category === 'network') {
    return buildLimeOverviewCard({
      title: 'NETWORK REACH & GUILD METRICS',
      subtitle: 'DISCORD SERVER DISTRIBUTION & AUDIENCE COVERAGE',
      color: Colors.SUCCESS,
      sections: [
        {
          title: '<:stats:1532429110775779459> GUILD NETWORK SUMMARY',
          items: [
            `Total Discord Servers: \`${fmt(m.guildCount)}\` Guilds`,
            `Total Audience Reached: \`${fmt(m.totalMembers)}\` Members`,
            `Cached User Profiles: \`${fmt(m.cachedUsers)}\` Accounts`
          ]
        },
        {
          title: '💬 DISCORD CHANNELS BREAKDOWN',
          items: [
            `Total Channels Managed: \`${fmt(m.channelCount)}\``,
            `Text Communication Channels: \`${fmt(m.textChannels)}\``,
            `Voice Channels: \`${fmt(m.voiceChannels)}\``
          ]
        }
      ],
      footerText: 'Rage Optimiser Enterprise • Network Telemetry'
    });
  }

  if (category === 'system') {
    return buildLimeOverviewCard({
      title: 'HOST SYSTEM & INFRASTRUCTURE SPECS',
      subtitle: 'PROCESS MEMORY ALLOCATION & HARDWARE ENVIRONMENT',
      color: Colors.INFO,
      sections: [
        {
          title: '<:config:1532425712844144701> PROCESS MEMORY BREAKDOWN',
          items: [
            `Active Heap Memory: \`${m.heapUsedMb} MB\``,
            `Allocated Heap Total: \`${m.heapTotalMb} MB\``,
            `Resident Set Size (RSS): \`${m.rssMb} MB\``
          ]
        },
        {
          title: '💻 HARDWARE & RUNTIME ENVIRONMENT',
          items: [
            `CPU Model: \`${m.cpuModel}\``,
            `CPU Core Count: \`${m.cpuCores} Logical Threads\``,
            `Node.js Version: \`${m.nodeVersion}\``,
            `Discord.js Library: \`${m.djsVersion}\``,
            `OS Platform: \`${m.platform}\` (\`${m.arch}\`)`
          ]
        }
      ],
      footerText: 'Rage Optimiser Enterprise • Hardware Telemetry'
    });
  }

  if (category === 'security') {
    return buildLimeOverviewCard({
      title: 'ZERO-TRUST SECURITY METRICS',
      subtitle: 'PREBOT WHITELIST, 2FA ENFORCEMENT & HARDENING DATA',
      color: Colors.BRAND,
      sections: [
        {
          title: '<:shield:1532403012751065179> PREBOT WHITELIST REGISTRY',
          items: [
            `Total Whitelisted Bots: \`${fmt(m.whitelistedBotsCount)}\` Pre-approved Applications`,
            `Google 2FA Active Servers: \`${fmt(m.twoFactorServersCount)}\` Protected Guilds`,
            `Extra Owner Delegations: \`${fmt(m.extraOwnerGuildsCount)}\` Guild Configurations`
          ]
        },
        {
          title: '🔐 SECURITY CAPABILITIES ACTIVE',
          items: [
            `• Anti-Nuke Rule Engine: \`ACTIVE\``,
            `• Zero-Trust Permission Drift Monitor: \`ACTIVE\``,
            `• Server Owner 2FA Gatekeeper: \`ENABLED\``
          ]
        }
      ],
      footerText: 'Rage Optimiser Enterprise • Security Suite Telemetry'
    });
  }

  if (category === 'performance') {
    return buildLimeOverviewCard({
      title: 'SPEED, LATENCY & BENCHMARKS',
      subtitle: 'GATEWAY PING & PERSISTENCE ENGINE THROUGHPUT',
      color: m.wsPing < 150 ? Colors.SUCCESS : Colors.WARN,
      sections: [
        {
          title: '<:link:1532620952087826602> CONNECTION LATENCY',
          items: [
            `Discord Gateway WebSocket Ping: \`${m.wsPing}ms\` ${m.wsPing < 100 ? `${VERIFIED_ICON} Optimal` : `${INFO_ICON} Normal`}`,
            `SQLite WAL Query Latency: \`${m.dbLatencyMs}ms\` ${VERIFIED_ICON} Ultra Fast`
          ]
        },
        {
          title: '⏱️ RUNTIME STABILITY',
          items: [
            `Total Continuous Uptime: \`${m.uptimeFormatted}\``,
            `Process Launch Date: <t:${m.startUnix}:F>`
          ]
        }
      ],
      footerText: 'Rage Optimiser Enterprise • Speed Telemetry'
    });
  }

  return buildBotStatsOverviewEmbed(m);
}

/**
 * Construct Navigation Action Row Buttons
 */
export function buildBotStatsComponents(userId: string, currentCategory: string = 'overview') {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`botstats_cat_overview_${userId}`)
      .setLabel('Overview')
      .setEmoji(BOT_ICON)
      .setStyle(currentCategory === 'overview' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`botstats_cat_network_${userId}`)
      .setLabel('Network')
      .setEmoji(MEMBER_ICON)
      .setStyle(currentCategory === 'network' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`botstats_cat_system_${userId}`)
      .setLabel('System')
      .setEmoji(CONFIG_ICON)
      .setStyle(currentCategory === 'system' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`botstats_cat_security_${userId}`)
      .setLabel('Security')
      .setEmoji(SHIELD_ICON)
      .setStyle(currentCategory === 'security' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`botstats_refresh_${userId}`)
      .setLabel('Refresh')
      .setEmoji(VERIFIED_ICON)
      .setStyle(ButtonStyle.Primary)
  );

  return [row];
}

/**
 * Register Prefix Commands `r!botstats` and `r!stats`
 */
export function registerBotStatsCommands(): void {
  PrefixRegistry.register({
    name: 'botstats',
    category: 'Diagnostics',
    description: 'Display real-time global bot statistics, system specs, security telemetry, and network reach.',
    usage: 'r!botstats [network|system|security|performance]',
    aliases: ['stats', 'globalstats', 'botinfo'],
    cooldownSeconds: 3,
    examples: ['r!botstats', 'r!stats system'],
    moduleOwnerId: 'botstats',
    dangerLevel: 'Low',
    hidden: false,
    execute: async (message: Message, args: string[], extra?: any) => {
      const client = message.client;
      const metrics = await computeBotStatsMetrics(client);

      const targetCat = args[0]?.toLowerCase() || 'overview';
      const embed = buildCategoryEmbed(targetCat, metrics);
      const components = buildBotStatsComponents(message.author.id, targetCat);

      await message.reply({ embeds: [embed], components }).catch(() => {});
    }
  });
}

/**
 * Global Bot Stats Manifest Definition
 */
export const BotStatsManifest: ModuleManifest = {
  id: 'botstats',
  name: 'Global Bot Statistics',
  version: '1.0.0',
  description: 'Real-time global telemetry, infrastructure diagnostics, security stats, and server network metrics.',
  configSchema: {
    requiredFields: [],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      return { progress: 100, errors: [] };
    }
  },
  commands: [
    {
      name: 'botstats',
      description: 'Display comprehensive global statistics and telemetry for Rage Optimiser',
      options: [
        {
          name: 'category',
          description: 'Specific telemetry section to view',
          type: 3, // String
          required: false,
          choices: [
            { name: '🌐 Network Reach & Servers', value: 'network' },
            { name: '📊 System Specs & Infrastructure', value: 'system' },
            { name: '🛡️ Security & PreBot Metrics', value: 'security' },
            { name: '⚡ Latency & Database Performance', value: 'performance' }
          ]
        }
      ]
    },
    {
      name: 'stats',
      description: 'Alias for /botstats global telemetry overview',
      options: []
    }
  ],
  events: [
    {
      name: 'button_botstats_generic',
      handler: async (client: any, interaction: any) => {
        const parts = interaction.customId.split('_');
        const executorId = parts[parts.length - 1];

        if (/^\d{17,20}$/.test(executorId) && interaction.user.id !== executorId) {
          return interaction.reply({
            content: `${WRONG_ICON} Only the command executor (<@${executorId}>) can interact with these stats controls.`,
            flags: 64
          }).catch(() => {});
        }

        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferUpdate().catch(() => {});
        }

        let category = 'overview';
        if (interaction.customId.includes('cat_network')) category = 'network';
        else if (interaction.customId.includes('cat_system')) category = 'system';
        else if (interaction.customId.includes('cat_security')) category = 'security';
        else if (interaction.customId.includes('cat_overview')) category = 'overview';
        else if (interaction.customId.includes('refresh')) category = 'overview';

        const metrics = await computeBotStatsMetrics(client);
        const embed = buildCategoryEmbed(category, metrics);
        const components = buildBotStatsComponents(executorId, category);

        await interaction.editReply({ embeds: [embed], components }).catch(() => {});
      }
    },
    {
      name: 'command_botstats',
      handler: async (client: any, interaction: any) => {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply().catch(() => {});
        }

        const category = interaction.options.getString('category', false) || 'overview';
        const metrics = await computeBotStatsMetrics(client);

        const embed = buildCategoryEmbed(category, metrics);
        const components = buildBotStatsComponents(interaction.user.id, category);

        await interaction.editReply({ embeds: [embed], components }).catch(() => null);
      }
    },
    {
      name: 'command_stats',
      handler: async (client: any, interaction: any) => {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply().catch(() => {});
        }

        const metrics = await computeBotStatsMetrics(client);
        const embed = buildCategoryEmbed('overview', metrics);
        const components = buildBotStatsComponents(interaction.user.id, 'overview');

        await interaction.editReply({ embeds: [embed], components }).catch(() => null);
      }
    }
  ]
};
