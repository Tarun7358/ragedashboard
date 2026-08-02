import { PermissionFlagsBits, MessageFlags, EmbedBuilder } from 'discord.js';
import { updateVoiceChannelConnection } from './detector.js';
import { checkWhitelistPermission } from '../../utils/whitelistCheck.js';
import { joinVoiceChannel, getVoiceConnection } from '@discordjs/voice';
import { stopMonitoringAllInGuild, startMonitoringUser } from './analyzer.js';
import { Embeds, Colors, buildRichCard, buildStatusCard, buildSuccessCard, buildErrorCard, buildPermCard, buildWarnCard } from '../../core/UIFactory.js';

export const VoiceProtectionCommands = [
  {
    name: 'voiceprotection',
    description: '🎙️ Manage the Voice Protection (Auto Server Mute) system.',
    options: [
      {
        name: 'enable',
        description: 'Enable the Voice Protection module',
        type: 1
      },
      {
        name: 'disable',
        description: 'Disable the Voice Protection module',
        type: 1
      },
      {
        name: 'status',
        description: 'Show current status and configuration',
        type: 1
      },
      {
        name: 'config',
        description: 'Configure Voice Protection settings',
        type: 1,
        options: [
          {
            name: 'threshold',
            description: 'Loudness threshold (0-100, default 85)',
            type: 4,
            required: false
          },
          {
            name: 'duration',
            description: 'Duration in seconds exceeding threshold (default 3)',
            type: 4,
            required: false
          },
          {
            name: 'punishment',
            description: 'Action to take when triggered',
            type: 3,
            required: false,
            choices: [
              { name: 'Warn Only (DM)', value: 'warn' },
              { name: 'Server Mute', value: 'servermute' },
              { name: 'Temp Server Mute', value: 'tempmute' },
              { name: 'Disconnect', value: 'disconnect' },
              { name: 'Timeout', value: 'timeout' },
              { name: 'Quarantine Role', value: 'quarantine' },
              { name: 'Ban Member', value: 'ban' },
              { name: 'Escalate Automatically', value: 'escalate' }
            ]
          },
          {
            name: 'mute-duration',
            description: 'Duration in seconds for temporary mute (default 30)',
            type: 4,
            required: false
          },
          {
            name: 'cooldown',
            description: 'Action cooldown in seconds per user (default 60)',
            type: 4,
            required: false
          },
          {
            name: 'log-channel',
            description: 'Channel to send incident logs to',
            type: 7,
            required: false,
            channel_types: [0]
          }
        ]
      },
      {
        name: 'ignore',
        description: 'Manage ignored channels and roles',
        type: 1,
        options: [
          {
            name: 'type',
            description: 'Ignore type (channel or role)',
            type: 3,
            required: true,
            choices: [
              { name: 'Channel', value: 'channel' },
              { name: 'Role', value: 'role' }
            ]
          },
          {
            name: 'action',
            description: 'Add or remove from ignore list',
            type: 3,
            required: true,
            choices: [
              { name: 'Add', value: 'add' },
              { name: 'Remove', value: 'remove' },
              { name: 'List', value: 'list' }
            ]
          },
          {
            name: 'channel',
            description: 'The target channel (if channel selected)',
            type: 7,
            required: false
          },
          {
            name: 'role',
            description: 'The target role (if role selected)',
            type: 8,
            required: false
          }
        ]
      },
      {
        name: 'whitelist',
        description: 'Manage whitelisted immune users and roles',
        type: 1,
        options: [
          {
            name: 'type',
            description: 'Whitelist type (user or role)',
            type: 3,
            required: true,
            choices: [
              { name: 'User', value: 'user' },
              { name: 'Role', value: 'role' }
            ]
          },
          {
            name: 'action',
            description: 'Add or remove from whitelist',
            type: 3,
            required: true,
            choices: [
              { name: 'Add', value: 'add' },
              { name: 'Remove', value: 'remove' },
              { name: 'List', value: 'list' }
            ]
          },
          {
            name: 'user',
            description: 'The target user (if user selected)',
            type: 6,
            required: false
          },
          {
            name: 'role',
            description: 'The target role (if role selected)',
            type: 8,
            required: false
          }
        ]
      },
      {
        name: 'stats',
        description: 'Show or reset Voice Protection metrics',
        type: 1,
        options: [
          {
            name: 'action',
            description: 'View or reset statistics',
            type: 3,
            required: true,
            choices: [
              { name: 'View', value: 'view' },
              { name: 'Reset', value: 'reset' }
            ]
          }
        ]
      }
    ]
  }
];

export async function handleVoiceProtectionSlashCommand(
  client: any,
  interaction: any,
  context: any
) {
  // Check authorization
  const hasPermission = (await checkWhitelistPermission(interaction.user.id, interaction.guild, context)) || 
                        interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
                        interaction.user.id === interaction.guild?.ownerId;
  if (!hasPermission) {
    return interaction.reply(buildPermCard('Manage Server'));
  }

  const sub = interaction.options.getSubcommand(true);
  const modules = context.getModulesState ? context.getModulesState() : [];
  const vpMod = modules.find((m: any) => m.id === 'voice-protection');

  if (!vpMod) {
    return interaction.reply({ ...buildErrorCard('Voice Protection module is not registered on this server.'), flags: 64 });
  }

  const config = vpMod.config || {};

  // 1. ENABLE
  if (sub === 'enable') {
    if (config.enabled) {
      return interaction.reply(buildStatusCard({ emoji: '<:shield:1532403012751065179>', title: 'Voice Protection Active', body: 'Voice Protection Engine is already online and monitoring.', accentColor: Colors.BRAND }));
    }
    await context.updateModuleConfig('voice-protection', { enabled: true });
    
    // Attempt auto-join
    const guild = interaction.guild;
    if (guild) {
      const updatedModules = context.getModulesState ? context.getModulesState() : [];
      const updatedConfig = updatedModules.find((m: any) => m.id === 'voice-protection')?.config || {};
      await updateVoiceChannelConnection(guild, updatedConfig, context);
    }

    const { embeds, components } = buildRichCard({
      emoji: '<:shield:1532403012751065179>',
      title: 'Voice Protection Suite Initialized',
      description: 'Acoustic shield initialized successfully. Real-time decibel analysis and automated spike suppression are now online.',
      accentColor: Colors.BRAND,
      footerNote: 'Rage Optimiser • Unbypassable Security',
    });

    return interaction.reply({ embeds, components });
  }

  // 2. DISABLE
  if (sub === 'disable') {
    if (!config.enabled) {
      return interaction.reply(buildStatusCard({ emoji: '<:shield:1532403012751065179>', title: 'Voice Protection Offline', body: 'Voice Protection Engine is currently offline.', accentColor: Colors.MUTED }));
    }
    await context.updateModuleConfig('voice-protection', { enabled: false });

    // Force disconnect
    const guild = interaction.guild;
    if (guild) {
      const updatedModules = context.getModulesState ? context.getModulesState() : [];
      const updatedConfig = updatedModules.find((m: any) => m.id === 'voice-protection')?.config || {};
      await updateVoiceChannelConnection(guild, updatedConfig, context);
    }

    const { embeds, components, flags } = buildRichCard({
      emoji: '<:shield:1532403012751065179>',
      title: 'Voice Protection Suite Disabled',
      description: 'Acoustic shield offline. Voice auditing has been suspended, and connection loops are terminated.',
      accentColor: Colors.MUTED,
      footerNote: 'Rage Optimiser • Unbypassable Security',
    });

    return interaction.reply({ embeds, components, flags });
  }

  // 3. STATUS
  if (sub === 'status') {
    const { embeds, components, flags } = buildRichCard({
      emoji: '<:shield:1532403012751065179>',
      title: 'Voice Protection — Operational Registry',
      description: 'Live auditory screening engine parameters and shielding matrix status.',
      accentColor: config.enabled ? Colors.SUCCESS : Colors.MUTED,
      fields: [
        { label: '<:shield:1532403012751065179> System Status',        value: config.enabled ? '<a:approved:1532390590707142956> **SHIELD ACTIVE**' : '<:wrong:1532390628330307634> **SHIELD OFFLINE**' },
        { label: '<:voicechannelgreen:1532425750278438962> Loudness Ceiling',     value: `\`${config.threshold ?? 85}%\` RMS` },
        { label: '<:timer:1532620491662037123> Audit Duration',       value: `\`${config.duration ?? 3}s\`` },
        { label: '<:gavel:1532621057318584380> Enforcement Action',   value: `\`${(config.punishment ?? 'servermute').toUpperCase()}\`` },
        { label: '<:config:1532425712844144701> Mute Duration',        value: `\`${config.muteDuration ?? 30}s\`` },
        { label: '<:config:1532425712844144701> Penalty Cooldown',     value: `\`${config.cooldown ?? 60}s\`` },
        { label: '<:config:1532425712844144701> Audit Log Channel',    value: config.logChannel ? `<#${config.logChannel}>` : '`Not Configured`' },
      ],
      footerNote: 'Rage Optimiser • Unbypassable Security',
    });

    return interaction.reply({ embeds, components, flags });
  }

  // 4. CONFIG
  if (sub === 'config') {
    const threshold = interaction.options.getInteger('threshold');
    const duration = interaction.options.getInteger('duration');
    const punishment = interaction.options.getString('punishment');
    const muteDuration = interaction.options.getInteger('mute-duration');
    const cooldown = interaction.options.getInteger('cooldown');
    const logChannel = interaction.options.getChannel('log-channel');

    const updates: Record<string, any> = {};
    if (threshold !== null) updates.threshold = threshold;
    if (duration !== null) updates.duration = duration;
    if (punishment !== null) updates.punishment = punishment;
    if (muteDuration !== null) updates.muteDuration = muteDuration;
    if (cooldown !== null) updates.cooldown = cooldown;
    if (logChannel !== null) updates.logChannel = logChannel.id;

    if (Object.keys(updates).length === 0) {
      return interaction.reply({ content: '<:wrong:1532390628330307634> You must specify at least one configuration option to update.', flags: 64 });
    }

    await context.updateModuleConfig('voice-protection', updates);

    const embed = new EmbedBuilder()
      .setTitle('<:config:1532425712844144701> Configuration Synced')
      .setDescription('Successfully updated Voice Protection settings parameters:')
      .setColor(0x99CC00)
      .addFields(
        Object.keys(updates).map(k => ({ 
          name: k.replace(/([A-Z])/g, ' $1').toUpperCase(), 
          value: `\`${updates[k]}\``, 
          inline: true 
        }))
      )
      .setTimestamp()
      .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });

    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  // 5. IGNORE
  if (sub === 'ignore') {
    const type = interaction.options.getString('type', true);
    const action = interaction.options.getString('action', true);
    const targetChannel = interaction.options.getChannel('channel');
    const targetRole = interaction.options.getRole('role');

    if (action === 'list') {
      const list = type === 'channel' 
        ? (config.ignoredChannels || []).map((id: string) => `<#${id}>`).join('\n') || '*No channels currently ignored.*'
        : (config.ignoredRoles || []).map((id: string) => `<@&${id}>`).join('\n') || '*No roles currently ignored.*';

      const embed = new EmbedBuilder()
        .setTitle(`<:voicechannelgreen:1532425750278438962> Ignored ${type === 'channel' ? 'Channels' : 'Roles'} Registry`)
        .setColor(0x99CC00)
        .setDescription(list)
        .setTimestamp()
        .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });

      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    if (type === 'channel') {
      if (!targetChannel) return interaction.reply({ content: '<:wrong:1532390628330307634> You must specify a target channel.', flags: 64 });
      let channels = config.ignoredChannels || [];
      if (action === 'add') {
        if (channels.includes(targetChannel.id)) return interaction.reply({ content: '<:wrong:1532390628330307634> Channel is already ignored.', flags: 64 });
        channels.push(targetChannel.id);
      } else {
        if (!channels.includes(targetChannel.id)) return interaction.reply({ content: '<:wrong:1532390628330307634> Channel is not ignored.', flags: 64 });
        channels = channels.filter((id: string) => id !== targetChannel.id);
      }
      await context.updateModuleConfig('voice-protection', { ignoredChannels: channels });
    } else {
      if (!targetRole) return interaction.reply({ content: '<:wrong:1532390628330307634> You must specify a target role.', flags: 64 });
      let roles = config.ignoredRoles || [];
      if (action === 'add') {
        if (roles.includes(targetRole.id)) return interaction.reply({ content: '<:wrong:1532390628330307634> Role is already ignored.', flags: 64 });
        roles.push(targetRole.id);
      } else {
        if (!roles.includes(targetRole.id)) return interaction.reply({ content: '<:wrong:1532390628330307634> Role is not ignored.', flags: 64 });
        roles = roles.filter((id: string) => id !== targetRole.id);
      }
      await context.updateModuleConfig('voice-protection', { ignoredRoles: roles });
    }

    const embed = new EmbedBuilder()
      .setTitle('<:config:1532425712844144701> Exemption List Updated')
      .setDescription(`Successfully **${action === 'add' ? 'added' : 'removed'}** the target ${type} from the ignore list.`)
      .setColor(0x99CC00)
      .setTimestamp()
      .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });

    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  // 6. WHITELIST
  if (sub === 'whitelist') {
    const type = interaction.options.getString('type', true);
    const action = interaction.options.getString('action', true);
    const targetUser = interaction.options.getUser('user');
    const targetRole = interaction.options.getRole('role');

    if (action === 'list') {
      const list = type === 'user' 
        ? (config.whitelistedUsers || []).map((id: string) => `<@${id}>`).join('\n') || '*No users currently whitelisted.*'
        : (config.whitelistedRoles || []).map((id: string) => `<@&${id}>`).join('\n') || '*No roles currently whitelisted.*';

      const embed = new EmbedBuilder()
        .setTitle(`<:shield:1532403012751065179> Whitelisted Immune ${type === 'user' ? 'Users' : 'Roles'} Registry`)
        .setColor(0x99CC00)
        .setDescription(list)
        .setTimestamp()
        .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });

      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    if (type === 'user') {
      if (!targetUser) return interaction.reply({ content: '<:wrong:1532390628330307634> You must specify a target user.', flags: 64 });
      let users = config.whitelistedUsers || [];
      if (action === 'add') {
        if (users.includes(targetUser.id)) return interaction.reply({ content: '<:wrong:1532390628330307634> User is already whitelisted.', flags: 64 });
        users.push(targetUser.id);
      } else {
        if (!users.includes(targetUser.id)) return interaction.reply({ content: '<:wrong:1532390628330307634> User is not whitelisted.', flags: 64 });
        users = users.filter((id: string) => id !== targetUser.id);
      }
      await context.updateModuleConfig('voice-protection', { whitelistedUsers: users });
    } else {
      if (!targetRole) return interaction.reply({ content: '<:wrong:1532390628330307634> You must specify a target role.', flags: 64 });
      let roles = config.whitelistedRoles || [];
      if (action === 'add') {
        if (roles.includes(targetRole.id)) return interaction.reply({ content: '<:wrong:1532390628330307634> Role is already whitelisted.', flags: 64 });
        roles.push(targetRole.id);
      } else {
        if (!roles.includes(targetRole.id)) return interaction.reply({ content: '<:wrong:1532390628330307634> Role is not whitelisted.', flags: 64 });
        roles = roles.filter((id: string) => id !== targetRole.id);
      }
      await context.updateModuleConfig('voice-protection', { whitelistedRoles: roles });
    }

    const embed = new EmbedBuilder()
      .setTitle('<:shield:1532403012751065179> Immunity List Updated')
      .setDescription(`Successfully **${action === 'add' ? 'added' : 'removed'}** the target ${type} from the whitelist immunity registry.`)
      .setColor(0x99CC00)
      .setTimestamp()
      .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });

    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  // 7. STATS
  if (sub === 'stats') {
    const action = interaction.options.getString('action', true);

    if (action === 'reset') {
      const emptyStats = {
        totalDetections: 0,
        totalMutes: 0,
        avgLoudness: 0,
        peakLoudness: 0,
        mostDetectedUsers: {},
        history: []
      };
      await context.updateModuleConfig('voice-protection', { stats: emptyStats });
      
      const embed = new EmbedBuilder()
        .setTitle('<:information:1532621274092929124> Metrics Registry Purged')
        .setDescription('Voice Protection telemetry and detection frequency statistics have been reset to zero.')
        .setColor(0x99CC00)
        .setTimestamp()
        .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });

      return interaction.reply({ embeds: [embed], flags: 64 });
    }

    const stats = config.stats || {};
    const embed = new EmbedBuilder()
      .setTitle('<:information:1532621274092929124> Voice Protection — Auditing Telemetry')
      .setDescription('Telemetry data and loudness spikes logged by the active audio analysis engine.')
      .setColor(0x99CC00)
      .addFields(
        { name: '<:wrong:1532390628330307634> Total Violations', value: `\`${stats.totalDetections || 0}\` times`, inline: true },
        { name: '<:shield:1532403012751065179> Enforced Penalties', value: `\`${stats.totalMutes || 0}\` mutes`, inline: true },
        { name: '<:voicechannelgreen:1532425750278438962> Mean Level (RMS)', value: `\`${stats.avgLoudness || 0}%\``, inline: true },
        { name: '<:information:1532621274092929124> Peak Audio Surge', value: `\`${stats.peakLoudness || 0}%\``, inline: true }
      )
      .setTimestamp()
      .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });

    // Add top offenders
    const topUsers = Object.entries(stats.mostDetectedUsers || {})
      .sort((a: any, b: any) => b[1].count - a[1].count)
      .slice(0, 5);

    if (topUsers.length > 0) {
      const offenderList = topUsers
        .map(([id, userObj]: any) => `• <@${id}> — **${userObj.count}** violations logged`)
        .join('\n');
      embed.addFields({ name: '<:wrong:1532390628330307634> Highest Frequency Offenders', value: offenderList });
    }

    return interaction.reply({ embeds: [embed], flags: 64 });
  }
}

export async function handleVoiceProtectionMoveCommand(client: any, interaction: any, context: any) {
  const guild = interaction.guild;
  if (!guild) return;

  const guildId = guild.id;

  // Check permissions: Administrator, Server Owner, or whitelisted for voice_protection
  const hasPermission = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
                        interaction.user.id === guild.ownerId ||
                        await checkWhitelistPermission(interaction.user.id, guild, context, 'voice_protection');
  if (!hasPermission) {
    return interaction.reply({
      content: '<:wrong:1532390628330307634> You do not have permission to change the Voice Protection monitoring channel.',
      flags: 64
    });
  }

  const modules = context.getModulesState ? context.getModulesState() : [];
  const vpMod = modules.find((m: any) => m.id === 'voice-protection');
  const config = vpMod?.config || {};

  // Step 1: Validate Voice Protection module is enabled
  if (!vpMod || vpMod.status !== 'enabled') {
    return interaction.reply({
      content: '<:wrong:1532390628330307634> Voice Protection is currently disabled.',
      flags: 64
    });
  }

  const channel = interaction.options.getChannel('channel', true);

  // Check that the selected channel is a voice channel
  const isVoice = channel.isVoiceBased?.() || channel.type === 2 || channel.type === 13;
  if (!isVoice) {
    return interaction.reply({
      content: '<:wrong:1532390628330307634> Selected channel is not a Voice Channel.',
      flags: 64
    });
  }

  // Check bot permissions: ViewChannel, Connect, MuteMembers
  const me = guild.members.me || (await guild.members.fetch(client.user.id).catch(() => null));
  if (!me) {
    return interaction.reply({
      content: '<:wrong:1532390628330307634> Unknown error: Could not fetch bot member in guild.',
      flags: 64
    });
  }

  const permissions = channel.permissionsFor(me);
  if (!permissions?.has(PermissionFlagsBits.ViewChannel) || 
      !permissions?.has(PermissionFlagsBits.Connect) || 
      !permissions?.has(PermissionFlagsBits.MuteMembers)) {
    return interaction.reply({
      content: '<:wrong:1532390628330307634> I don\'t have the required permissions to monitor that voice channel.',
      flags: 64
    });
  }

  // Step 3: Prevent Duplicate Switch
  if (config.currentVoiceChannelId === channel.id) {
    const conn = getVoiceConnection(guildId);
    if (conn && conn.joinConfig.channelId === channel.id) {
      return interaction.reply({
        content: '<:wrong:1532390628330307634> Voice Protection is already monitoring this voice channel.',
        flags: 64
      });
    }
  }

  // Defer reply for channel swapping operation
  await interaction.deferReply({ flags: 64 });

  const previousChannelId = config.currentVoiceChannelId;
  const previousChannel = previousChannelId ? guild.channels.cache.get(previousChannelId) : null;

  try {
    // Step 4 & 5: Gracefully Stop Current Monitoring & Leave Previous Voice Channel
    stopMonitoringAllInGuild(guildId);
    const currentConnection = getVoiceConnection(guildId);
    if (currentConnection) {
      currentConnection.destroy();
    }

    // Step 6: Join New Voice Channel
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guildId,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: true
    });

    // Wait until connection state is ready (up to 2.5 seconds)
    let isReady = false;
    for (let i = 0; i < 5; i++) {
      if (connection.state.status === 'ready') {
        isReady = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    if (!isReady && connection.state.status !== 'ready') {
      console.log(`[Voice Protection] Connection state is ${connection.state.status}, starting monitoring anyway.`);
    }

    // Initialize monitoring for members currently in the channel
    for (const member of channel.members.values()) {
      if (!member.user.bot && !member.voice.serverMute) {
        startMonitoringUser(connection, guildId, member.id, channel.id, config, context);
      }
    }

    // Step 7: Update Runtime Configuration & Persist
    const now = Date.now();
    const updatedConfig = {
      ...config,
      currentVoiceChannelId: channel.id,
      monitoringStatus: 'monitoring',
      connectedSince: now,
      lastSwitched: now,
      switchedBy: interaction.user.username
    };

    await context.updateModuleConfig('voice-protection', updatedConfig);

    // Step 8: Success Embed
    const embed = new EmbedBuilder()
      .setTitle('<:shield:1532403012751065179> Voice Protection Moved')
      .setColor(0x99CC00)
      .addFields(
        { name: 'Previous Channel', value: previousChannel ? `<:voicechannelgreen:1532425750278438962> ${previousChannel.name}` : '<:voicechannelgreen:1532425750278438962> None', inline: true },
        { name: 'Current Channel', value: `<:voicechannelgreen:1532425750278438962> ${channel.name}`, inline: true },
        { name: 'Status', value: '<a:approved:1532390590707142956> Monitoring', inline: true },
        { name: 'Changed By', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Time', value: `<t:${Math.floor(now / 1000)}:F>`, inline: true }
      )
      .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    // Audit Log Entry
    if (context.logSyncEvent) {
      context.logSyncEvent(
        guildId,
        `Voice Protection Channel Updated\n\nAction:\nMove Monitoring\n\nPrevious Channel:\n${previousChannel ? previousChannel.name : 'None'}\n\nCurrent Channel:\n${channel.name}\n\nChanged By:\n${interaction.user.username}\n\nTime:\n${new Date(now).toISOString()}`,
        'info'
      );
    }

  } catch (err: any) {
    console.error('[Voice Protection] Failed to switch voice channel:', err);
    await interaction.editReply({
      content: `<:wrong:1532390628330307634> Failed to switch Voice Protection. Please check the logs. Error: ${err.message || err}`
    });
  }
}

