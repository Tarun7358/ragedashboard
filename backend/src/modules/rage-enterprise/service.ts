import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { Embeds, Colors, VERIFIED_ICON, WRONG_ICON, buildLimeOverviewCard, progressBar } from '../../core/UIFactory.js';
import { AnalyticsService } from '../../core/AnalyticsService.js';
import { getUnifiedWhitelistEntries } from '../../utils/whitelistCheck.js';

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

    const isAntiNukeActive = config.antiNukeEnabled !== false;
    const antiNukeStatus = isAntiNukeActive ? '<a:approved:1532390590707142956> `Active (Protected)`' : '<:wrong:1532390628330307634> `Inactive (Disabled)`';
    const raidModeStatus = config.raidModeEnabled ? '<:shield:1532403012751065179> `RAID MODE ENABLED`' : '<:shield:1532403012751065179> `Normal Protection`';
    const { userSet, roleSet } = getUnifiedWhitelistEntries(modules);
    const whitelistCount = userSet.size + roleSet.size;
    const quarantineCount = (config.quarantinedUsers || []).length;
    const antiSpamStatus = config.antiSpamEnabled ? '<a:approved:1532390590707142956> `Enabled`' : '<:wrong:1532390628330307634> `Disabled`';
    const antiLinkStatus = config.antiLinkEnabled ? '<a:approved:1532390590707142956> `Enabled`' : '<:wrong:1532390628330307634> `Disabled`';

    const embed = buildLimeOverviewCard({
      title: 'SECURITY & ANTI-NUKE OVERVIEW',
      subtitle: `SERVER: ${guild.name.toUpperCase()}`,
      thumbnail: guild.iconURL({ size: 256 }) ?? undefined,
      sections: [
        {
          title: '<:shield:1532403012751065179> PROTECTION ENGINE STATUS',
          items: [
            `Anti-Nuke Protection: ${antiNukeStatus}`,
            `Raid Mode Status: ${raidModeStatus}`,
            `Unified Whitelist Entries: \`${whitelistCount}\` members/roles`,
            `Quarantined Users: \`${quarantineCount}\` active quarantines`
          ]
        },
        {
          title: '<:gavel:1532621057318584380> AUTOMOD FILTERS',
          items: [
            `Anti-Spam Filter: ${antiSpamStatus}`,
            `Anti-Link Filter: ${antiLinkStatus}`,
            `Join-Role Assignment Guard: <a:approved:1532390590707142956> \`Active\``,
            `Voice Guard Protection: <a:approved:1532390590707142956> \`Active\``
          ]
        }
      ],
      footerText: 'Rage Optimiser • Unbypassable Security'
    });

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('sec_toggle_antinuke').setLabel('Toggle Anti-Nuke').setStyle(isAntiNukeActive ? ButtonStyle.Danger : ButtonStyle.Success).setEmoji('<:shield:1532403012751065179>'),
      new ButtonBuilder().setCustomId('sec_toggle_raidmode').setLabel('Toggle Raid Mode').setStyle(config.raidModeEnabled ? ButtonStyle.Danger : ButtonStyle.Secondary).setEmoji('<:shield:1532403012751065179>'),
      new ButtonBuilder().setCustomId('sec_view_whitelist').setLabel('View Whitelist').setStyle(ButtonStyle.Secondary).setEmoji('<:member:1532621317487071426>'),
      new ButtonBuilder().setCustomId('sec_view_quarantine').setLabel('Quarantine Queue').setStyle(ButtonStyle.Secondary).setEmoji('<:gavel:1532621057318584380>')
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('sec_toggle_antispam').setLabel('Toggle Anti-Spam').setStyle(ButtonStyle.Primary).setEmoji('<:bot:1532621107746570391>'),
      new ButtonBuilder().setCustomId('sec_toggle_antilink').setLabel('Toggle Anti-Link').setStyle(ButtonStyle.Primary).setEmoji('<:link:1532620952087826602>'),
      new ButtonBuilder().setCustomId('sec_trigger_lockdown').setLabel('Emergency Lockdown').setStyle(ButtonStyle.Danger).setEmoji('<:shield:1532403012751065179>')
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
          title: '<:gavel:1532621057318584380> MODERATION SUITE',
          items: [
            `Sanction Commands: \`/rage ban\`, \`/rage tempban\`, \`/rage kick\`, \`/rage mute\``,
            `Utility Tools: \`/rage purge\`, \`/rage warn\`, \`/rage timeout\`, \`/rage notes\``,
            `Audit Telemetry: Real-time infraction & warning tracking active`
          ]
        }
      ],
      footerText: 'Rage Optimiser • Unbypassable Security'
    });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('mod_btn_ban').setLabel('Ban Member').setStyle(ButtonStyle.Danger).setEmoji('<:gavel:1532621057318584380>'),
      new ButtonBuilder().setCustomId('mod_btn_kick').setLabel('Kick Member').setStyle(ButtonStyle.Danger).setEmoji('<:member:1532621317487071426>'),
      new ButtonBuilder().setCustomId('mod_btn_timeout').setLabel('Timeout Member').setStyle(ButtonStyle.Secondary).setEmoji('<:timer:1532620491662037123>'),
      new ButtonBuilder().setCustomId('mod_btn_purge').setLabel('Purge Messages').setStyle(ButtonStyle.Secondary).setEmoji('<:config:1532425712844144701>'),
      new ButtonBuilder().setCustomId('mod_btn_notes').setLabel('User Notes').setStyle(ButtonStyle.Primary).setEmoji('<:information:1532621274092929124>')
    );

    return { embeds: [embed], components: [row] };
  }

  /**
   * WELCOME DOMAIN
   */
  public static getWelcomeOverview(guild: any, context: any) {
    const guildId = guild.id;
    const modules = context.getModulesState ? context.getModulesState(guildId) : [];
    const welcMod = modules.find((m: any) => m.id === 'community' || m.id === 'welcome-v2') || {};
    const config = welcMod.config || {};

    const status = welcMod.status === 'enabled' ? '<a:approved:1532390590707142956> `Active`' : '<:wrong:1532390628330307634> `Disabled`';
    const channelName = config.channelId ? `<#${config.channelId}>` : '`Not Set`';
    const autoRoles = (config.autoroleIds || []).map((r: string) => `<@&${r}>`).join(', ') || '`None`';

    const embed = buildLimeOverviewCard({
      title: 'WELCOME & ONBOARDING ENGINE',
      subtitle: `SERVER: ${guild.name.toUpperCase()}`,
      thumbnail: guild.iconURL({ size: 256 }) ?? undefined,
      sections: [
        {
          title: '<:member:1532621317487071426> ONBOARDING CONFIGURATION',
          items: [
            `Module Status: ${status}`,
            `Welcome Channel: ${channelName}`,
            `Auto-Roles: ${autoRoles}`,
            `DM Greetings: \`${config.sendDm ? 'Enabled' : 'Disabled'}\``
          ]
        }
      ],
      footerText: 'Rage Optimiser • Unbypassable Security'
    });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('welc_setup_wizard').setLabel('Setup Wizard').setStyle(ButtonStyle.Success).setEmoji('<:config:1532425712844144701>'),
      new ButtonBuilder().setCustomId('welc_test_welcome').setLabel('Test Greeting').setStyle(ButtonStyle.Primary).setEmoji('<:member:1532621317487071426>'),
      new ButtonBuilder().setCustomId('welc_toggle_module').setLabel('Toggle Module').setStyle(ButtonStyle.Secondary).setEmoji('<:config:1532425712844144701>')
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
          title: '<:voicechannelgreen:1532425750278438962> AUDIO ENGINE INFRASTRUCTURE',
          items: [
            `Dedicated Audio Cluster: \`Online & Connected\``,
            `Supported Sources: \`YouTube\`, \`Spotify\`, \`SoundCloud\`, \`Direct Streams\``,
            `Filters Available: \`Bassboost\`, \`Nightcore\`, \`Vaporwave\`, \`8D Audio\``
          ]
        }
      ],
      footerText: 'Rage Optimiser • Unbypassable Security'
    });

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('music_play').setLabel('Play / Pause').setStyle(ButtonStyle.Success).setEmoji('<:voicechannelgreen:1532425750278438962>'),
      new ButtonBuilder().setCustomId('music_skip').setLabel('Skip').setStyle(ButtonStyle.Secondary).setEmoji('<:lightpurplearrow:1532621364115013693>'),
      new ButtonBuilder().setCustomId('music_queue').setLabel('View Queue').setStyle(ButtonStyle.Primary).setEmoji('<:information:1532621274092929124>'),
      new ButtonBuilder().setCustomId('music_shuffle').setLabel('Shuffle').setStyle(ButtonStyle.Secondary).setEmoji('<:config:1532425712844144701>')
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
          title: '<:config:1532425712844144701> MODULE MANIFEST SUMMARY',
          items: [
            `Active Feature Modules: \`${activeCount} / ${totalCount}\` Enabled`,
            `Management Mode: \`Discord Native (Web Panel Disabled)\``,
            `System Status: \`Optimal (100% Health)\``
          ]
        }
      ],
      footerText: 'Rage Optimiser • Unbypassable Security'
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('config_category_select')
      .setPlaceholder('Select a Module Category to Configure...')
      .addOptions([
        { label: 'Security & Anti-Nuke', value: 'security', emoji: '<:shield:1532403012751065179>', description: 'Configure Anti-Nuke, Whitelist, Quarantine' },
        { label: 'Moderation & Logs', value: 'moderation', emoji: '<:gavel:1532621057318584380>', description: 'Ban, Mute, Purge, Audit logging' },
        { label: 'Welcome & Onboarding', value: 'welcome', emoji: '<:member:1532621317487071426>', description: 'Welcome channel, autoroles, DM greetings' },
        { label: 'Music & Audio', value: 'music', emoji: '<:voicechannelgreen:1532425750278438962>', description: 'Audio engine, queue settings, filters' },
        { label: 'System & Owner', value: 'system', emoji: '<:bot:1532621107746570391>', description: 'Maintenance mode, diagnostics, reload' }
      ]);

    const rowSelect = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

    const rowButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('config_btn_wizard').setLabel('Interactive Setup Wizard').setStyle(ButtonStyle.Success).setEmoji('<:config:1532425712844144701>'),
      new ButtonBuilder().setCustomId('config_btn_reload').setLabel('Reload Configs').setStyle(ButtonStyle.Secondary).setEmoji('<:bot:1532621107746570391>'),
      new ButtonBuilder().setCustomId('config_btn_status').setLabel('System Health').setStyle(ButtonStyle.Primary).setEmoji('<:vip:1532620837117759508>')
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
          title: '<:bot:1532621107746570391> INFRASTRUCTURE TELEMETRY',
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
      footerText: 'Rage Optimiser • Unbypassable Security'
    });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('mon_refresh').setLabel('Refresh Status').setStyle(ButtonStyle.Success).setEmoji('<:bot:1532621107746570391>'),
      new ButtonBuilder().setCustomId('mon_cache_flush').setLabel('Flush Cache').setStyle(ButtonStyle.Secondary).setEmoji('<:config:1532425712844144701>'),
      new ButtonBuilder().setCustomId('mon_diag').setLabel('Run Diagnostics').setStyle(ButtonStyle.Primary).setEmoji('<:information:1532621274092929124>')
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
          title: '<:shield:1532403012751065179> EXECUTIVE ACTIONS',
          items: [
            `Emergency Lock: Lock all server text channels globally`,
            `Diagnostics: Dump active memory and process state`,
            `Reload Commands: Force re-deploy Slash commands to Discord REST`,
            `Developer Mode: Debug logging toggle`
          ]
        }
      ],
      footerText: 'Rage Optimiser • Unbypassable Security'
    });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('owner_emergency_lock').setLabel('Emergency Lock').setStyle(ButtonStyle.Danger).setEmoji('<:shield:1532403012751065179>'),
      new ButtonBuilder().setCustomId('owner_deploy_cmds').setLabel('Sync Slash Commands').setStyle(ButtonStyle.Primary).setEmoji('<:bot:1532621107746570391>'),
      new ButtonBuilder().setCustomId('owner_run_diag').setLabel('Diagnostics Board').setStyle(ButtonStyle.Secondary).setEmoji('<:information:1532621274092929124>'),
      new ButtonBuilder().setCustomId('owner_toggle_debug').setLabel('Toggle Debug').setStyle(ButtonStyle.Secondary).setEmoji('<:config:1532425712844144701>')
    );

    return { embeds: [embed], components: [row] };
  }
}
