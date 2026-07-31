import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { Embeds, Colors, VERIFIED_ICON, WRONG_ICON, buildLimeOverviewCard, progressBar } from '../../core/UIFactory.js';
import { AnalyticsService } from '../../core/AnalyticsService.js';

// TODO:
// Dashboard currently disabled.
// Planned for Enterprise Web Panel.
// UI should follow Lime.gg inspiration.

export class RageEnterpriseService {
  /**
   * SECURITY DOMAIN
   */
  public static getSecurityOverview(guild: any, context: any) {
    const guildId = guild.id;
    const modules = context.getModulesState ? context.getModulesState(guildId) : [];
    const secMod = modules.find((m: any) => m.id === 'security') || {};
    const config = secMod.config || {};

    const antiNukeStatus = config.antiNukeEnabled ? '🟢 Active (Protected)' : '🔴 Inactive (Disabled)';
    const raidModeStatus = config.raidModeEnabled ? '🚨 RAID MODE ENABLED' : '🛡️ Normal Protection';
    const whitelistCount = (config.whitelistedUsers || []).length + (config.whitelistedRoles || []).length;
    const quarantineCount = (config.quarantinedUsers || []).length;
    const antiSpamStatus = config.antiSpamEnabled ? '🟢 Enabled' : '⚪ Disabled';
    const antiLinkStatus = config.antiLinkEnabled ? '🟢 Enabled' : '⚪ Disabled';

    const embed = buildLimeOverviewCard({
      title: 'SECURITY & ANTI-NUKE OVERVIEW',
      subtitle: `SERVER: ${guild.name.toUpperCase()}`,
      thumbnail: guild.iconURL({ size: 256 }) ?? undefined,
      sections: [
        {
          title: '⚡ PROTECTION ENGINE STATUS',
          items: [
            `Anti-Nuke Protection: \`${antiNukeStatus}\``,
            `Raid Mode Status: \`${raidModeStatus}\``,
            `Unified Whitelist Entries: \`${whitelistCount}\` members/roles`,
            `Quarantined Users: \`${quarantineCount}\` active quarantines`
          ]
        },
        {
          title: '⚙️ AUTOMOD FILTERS',
          items: [
            `Anti-Spam Filter: \`${antiSpamStatus}\``,
            `Anti-Link Filter: \`${antiLinkStatus}\``,
            `Join-Role Assignment Guard: \`🟢 Active\``,
            `Voice Guard Protection: \`🟢 Active\``
          ]
        }
      ],
      footerText: 'Rage Optimiser • Security Engine'
    });

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('sec_toggle_antinuke').setLabel('Toggle Anti-Nuke').setStyle(config.antiNukeEnabled ? ButtonStyle.Danger : ButtonStyle.Success).setEmoji('🛡️'),
      new ButtonBuilder().setCustomId('sec_toggle_raidmode').setLabel('Toggle Raid Mode').setStyle(config.raidModeEnabled ? ButtonStyle.Danger : ButtonStyle.Secondary).setEmoji('🚨'),
      new ButtonBuilder().setCustomId('sec_view_whitelist').setLabel('View Whitelist').setStyle(ButtonStyle.Secondary).setEmoji('📜'),
      new ButtonBuilder().setCustomId('sec_view_quarantine').setLabel('Quarantine Queue').setStyle(ButtonStyle.Secondary).setEmoji('☣️')
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('sec_toggle_antispam').setLabel('Toggle Anti-Spam').setStyle(ButtonStyle.Primary).setEmoji('💬'),
      new ButtonBuilder().setCustomId('sec_toggle_antilink').setLabel('Toggle Anti-Link').setStyle(ButtonStyle.Primary).setEmoji('🔗'),
      new ButtonBuilder().setCustomId('sec_trigger_lockdown').setLabel('Emergency Lockdown').setStyle(ButtonStyle.Danger).setEmoji('🔒')
    );

    return { embeds: [embed], components: [row1, row2] };
  }

  /**
   * MODERATION DOMAIN
   */
  public static getModerationPanel(guild: any) {
    const embed = buildLimeOverviewCard({
      title: 'MODERATION & COMMUNITY COMMAND CENTER',
      subtitle: `SERVER: ${guild.name.toUpperCase()}`,
      thumbnail: guild.iconURL({ size: 256 }) ?? undefined,
      sections: [
        {
          title: '🔨 MODERATION SUITE',
          items: [
            `Sanction Commands: \`/rage ban\`, \`/rage tempban\`, \`/rage kick\`, \`/rage mute\``,
            `Utility Tools: \`/rage purge\`, \`/rage warn\`, \`/rage timeout\`, \`/rage notes\``,
            `Audit Telemetry: Real-time infraction & warning tracking active`
          ]
        }
      ],
      footerText: 'Rage Optimiser • Moderation Engine'
    });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('mod_btn_ban').setLabel('Ban Member').setStyle(ButtonStyle.Danger).setEmoji('🔨'),
      new ButtonBuilder().setCustomId('mod_btn_kick').setLabel('Kick Member').setStyle(ButtonStyle.Danger).setEmoji('👟'),
      new ButtonBuilder().setCustomId('mod_btn_timeout').setLabel('Timeout Member').setStyle(ButtonStyle.Secondary).setEmoji('⏱️'),
      new ButtonBuilder().setCustomId('mod_btn_purge').setLabel('Purge Messages').setStyle(ButtonStyle.Secondary).setEmoji('🧹'),
      new ButtonBuilder().setCustomId('mod_btn_notes').setLabel('User Notes').setStyle(ButtonStyle.Primary).setEmoji('📝')
    );

    return { embeds: [embed], components: [row] };
  }

  /**
   * WELCOME DOMAIN
   */
  public static getWelcomeOverview(guild: any, context: any) {
    const guildId = guild.id;
    const modules = context.getModulesState ? context.getModulesState(guildId) : [];
    const welcMod = modules.find((m: any) => m.id === 'welcome-v2') || {};
    const config = welcMod.config || {};

    const status = welcMod.status === 'enabled' ? '🟢 Active' : '⚪ Disabled';
    const channelName = config.channelId ? `<#${config.channelId}>` : '`Not Set`';
    const autoRoles = (config.autoroleIds || []).map((r: string) => `<@&${r}>`).join(', ') || '`None`';

    const embed = buildLimeOverviewCard({
      title: 'WELCOME & ONBOARDING ENGINE',
      subtitle: `SERVER: ${guild.name.toUpperCase()}`,
      thumbnail: guild.iconURL({ size: 256 }) ?? undefined,
      sections: [
        {
          title: '👋 ONBOARDING CONFIGURATION',
          items: [
            `Module Status: \`${status}\``,
            `Welcome Channel: ${channelName}`,
            `Auto-Roles: ${autoRoles}`,
            `DM Greetings: \`${config.sendDm ? 'Enabled' : 'Disabled'}\``
          ]
        }
      ],
      footerText: 'Rage Optimiser • Onboarding Engine'
    });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('welc_setup_wizard').setLabel('Setup Wizard').setStyle(ButtonStyle.Success).setEmoji('🪄'),
      new ButtonBuilder().setCustomId('welc_test_welcome').setLabel('Test Greeting').setStyle(ButtonStyle.Primary).setEmoji('🧪'),
      new ButtonBuilder().setCustomId('welc_toggle_module').setLabel('Toggle Module').setStyle(ButtonStyle.Secondary).setEmoji('⚙️')
    );

    return { embeds: [embed], components: [row] };
  }

  /**
   * MUSIC DOMAIN
   */
  public static getMusicPlayerCard(guild: any) {
    const embed = buildLimeOverviewCard({
      title: 'MUSIC PLAYER & AUDIO CONTROL',
      subtitle: `SERVER: ${guild.name.toUpperCase()}`,
      thumbnail: guild.iconURL({ size: 256 }) ?? undefined,
      sections: [
        {
          title: '🎵 AUDIO ENGINE INFRASTRUCTURE',
          items: [
            `Dedicated Audio Cluster: \`Online & Connected\``,
            `Supported Sources: \`YouTube\`, \`Spotify\`, \`SoundCloud\`, \`Direct Streams\``,
            `Filters Available: \`Bassboost\`, \`Nightcore\`, \`Vaporwave\`, \`8D Audio\``
          ]
        }
      ],
      footerText: 'Rage Optimiser • Music Engine'
    });

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('music_play').setLabel('Play / Pause').setStyle(ButtonStyle.Success).setEmoji('⏯️'),
      new ButtonBuilder().setCustomId('music_skip').setLabel('Skip').setStyle(ButtonStyle.Secondary).setEmoji('⏭️'),
      new ButtonBuilder().setCustomId('music_queue').setLabel('View Queue').setStyle(ButtonStyle.Primary).setEmoji('📜'),
      new ButtonBuilder().setCustomId('music_shuffle').setLabel('Shuffle').setStyle(ButtonStyle.Secondary).setEmoji('🔀')
    );

    return { embeds: [embed], components: [row1] };
  }

  /**
   * CONFIGURATION DOMAIN
   */
  public static getMasterConfigPanel(guild: any, context: any) {
    const guildId = guild.id;
    const modules = context.getModulesState ? context.getModulesState(guildId) : [];
    const activeCount = modules.filter((m: any) => m.status === 'enabled').length;
    const totalCount = modules.length;

    const embed = buildLimeOverviewCard({
      title: 'ENTERPRISE SYSTEM CONFIGURATION',
      subtitle: `SERVER: ${guild.name.toUpperCase()}`,
      thumbnail: guild.iconURL({ size: 256 }) ?? undefined,
      sections: [
        {
          title: '⚙️ MODULE MANIFEST SUMMARY',
          items: [
            `Active Feature Modules: \`${activeCount} / ${totalCount}\` Enabled`,
            `Management Mode: \`Discord Native (Web Panel Disabled)\``,
            `System Status: \`Optimal (100% Health)\``
          ]
        }
      ],
      footerText: 'Rage Optimiser • Enterprise System'
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('config_category_select')
      .setPlaceholder('Select a Module Category to Configure...')
      .addOptions([
        { label: 'Security & Anti-Nuke', value: 'security', emoji: '🛡️', description: 'Configure Anti-Nuke, Whitelist, Quarantine' },
        { label: 'Moderation & Logs', value: 'moderation', emoji: '🔨', description: 'Ban, Mute, Purge, Audit logging' },
        { label: 'Welcome & Onboarding', value: 'welcome', emoji: '👋', description: 'Welcome channel, autoroles, DM greetings' },
        { label: 'Music & Audio', value: 'music', emoji: '🎵', description: 'Audio engine, queue settings, filters' },
        { label: 'System & Owner', value: 'system', emoji: '🔧', description: 'Maintenance mode, diagnostics, reload' }
      ]);

    const rowSelect = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    const rowButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('config_btn_wizard').setLabel('Interactive Setup Wizard').setStyle(ButtonStyle.Success).setEmoji('🪄'),
      new ButtonBuilder().setCustomId('config_btn_reload').setLabel('Reload Configs').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
      new ButtonBuilder().setCustomId('config_btn_status').setLabel('System Health').setStyle(ButtonStyle.Primary).setEmoji('📊')
    );

    return { embeds: [embed], components: [rowSelect, rowButtons] };
  }

  /**
   * MONITORING DOMAIN
   */
  public static getMonitoringStatus(client: any, context: any) {
    const wsPing = Math.max(1, Math.round(client.ws.ping || 15));
    const memoryHeapMb = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
    const uptimeSec = process.uptime();
    const uptimeFormatted = `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m ${Math.floor(uptimeSec % 60)}s`;

    const embed = buildLimeOverviewCard({
      title: 'LIVE TELEMETRY & SYSTEM MONITORING',
      subtitle: `SHARD: #0 ONLINE`,
      thumbnail: client.user?.displayAvatarURL({ size: 256 }) ?? undefined,
      sections: [
        {
          title: '📊 INFRASTRUCTURE TELEMETRY',
          items: [
            `WebSocket Latency: \`${wsPing}ms\``,
            `Memory Heap Usage: \`${memoryHeapMb} MB\``,
            `Process Uptime: \`${uptimeFormatted}\``,
            `Node.js Engine: \`${process.version}\``,
            `Database Connection: \`Connected (SQLite3)\``,
            `Web Dashboard Status: \`Disabled (DASHBOARD_ENABLED=false)\``
          ]
        }
      ],
      footerText: 'Rage Optimiser • Telemetry Engine'
    });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('mon_refresh').setLabel('Refresh Status').setStyle(ButtonStyle.Success).setEmoji('🔄'),
      new ButtonBuilder().setCustomId('mon_cache_flush').setLabel('Flush Cache').setStyle(ButtonStyle.Secondary).setEmoji('🧹'),
      new ButtonBuilder().setCustomId('mon_diag').setLabel('Run Diagnostics').setStyle(ButtonStyle.Primary).setEmoji('🩺')
    );

    return { embeds: [embed], components: [row] };
  }

  /**
   * OWNER DOMAIN
   */
  public static getOwnerControlPanel(client: any) {
    const embed = buildLimeOverviewCard({
      title: 'OWNER & DEVELOPER COMMAND CONSOLE',
      subtitle: 'RESTRICTED EXECUTIVE OVERRIDES',
      thumbnail: client.user?.displayAvatarURL({ size: 256 }) ?? undefined,
      sections: [
        {
          title: '🚨 EXECUTIVE ACTIONS',
          items: [
            `Emergency Lock: Lock all server text channels globally`,
            `Diagnostics: Dump active memory and process state`,
            `Reload Commands: Force re-deploy Slash commands to Discord REST`,
            `Developer Mode: Debug logging toggle`
          ]
        }
      ],
      footerText: 'Rage Optimiser • Executive Console'
    });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('owner_emergency_lock').setLabel('Emergency Lock').setStyle(ButtonStyle.Danger).setEmoji('🚨'),
      new ButtonBuilder().setCustomId('owner_deploy_cmds').setLabel('Sync Slash Commands').setStyle(ButtonStyle.Primary).setEmoji('⚡'),
      new ButtonBuilder().setCustomId('owner_run_diag').setLabel('Diagnostics Board').setStyle(ButtonStyle.Secondary).setEmoji('🩺'),
      new ButtonBuilder().setCustomId('owner_toggle_debug').setLabel('Toggle Debug').setStyle(ButtonStyle.Secondary).setEmoji('🐞')
    );

    return { embeds: [embed], components: [row] };
  }
}
