import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { joinVoiceChannel, getVoiceConnection } from '@discordjs/voice';
import { EmbedBuilder, ChannelType } from 'discord.js';

export const VoiceManifest: ModuleManifest = {
  id: 'voice',
  name: 'Voice Presence',
  version: '2.0.0',
  description: 'Persistent 24/7 voice presence, automatic reconnection, and connection metrics tracking.',
  configSchema: {
    requiredFields: ['channelId'],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      const errors: string[] = [];
      let progress = 0;

      const channelExists = (id: string) => registry.channels.some(c => c.id === id);
      const isVoiceChannel = (id: string) => registry.channels.some(c => c.id === id && (c.type === 'voice' || c.type === 'stage'));

      if (config.channelId) {
        progress += 100;
        if (!channelExists(config.channelId)) {
          errors.push(`Configured voice channel ID (${config.channelId}) was deleted or does not exist!`);
        } else if (!isVoiceChannel(config.channelId)) {
          errors.push(`Configured channel ID (${config.channelId}) is not a Voice/Stage channel!`);
        }
      }

      return { progress, errors };
    }
  },
  commands: [
    {
      name: 'voicepresence',
      description: 'Manage the 24/7 Voice Presence module.',
      options: [
        { name: 'action', type: 3, description: 'Action: status, join, leave', required: true }
      ]
    },
    {
      name: '247',
      description: 'Manage 24/7 bot voice presence — keep the bot alive in a voice channel permanently.',
      aliases: ['24/7', '24-7', 'vc', 'voice', 'vp'],
      usage: 'r!247 <join|leave|status|set> [#channel]',
      examples: [
        'r!247 join #General',
        'r!247 join',
        'r!24/7 leave',
        'r!24/7 status',
        'r!247 set #Voice'
      ],
      options: [
        {
          name: 'join',
          description: 'Make the bot join a voice channel and stay 24/7.',
          type: 1, // SUB_COMMAND
          options: [
            {
              name: 'channel',
              type: 7, // CHANNEL — Discord shows native channel picker
              description: 'The voice channel to join. Only voice channels are shown.',
              required: false,
              channel_types: [2, 13] // GUILD_VOICE and GUILD_STAGE_VOICE
            }
          ]
        },
        {
          name: 'leave',
          description: 'Disconnect the bot from the voice channel and disable 24/7 mode.',
          type: 1 // SUB_COMMAND
        },
        {
          name: 'status',
          description: 'Check the current 24/7 voice presence status.',
          type: 1 // SUB_COMMAND
        },
        {
          name: 'set',
          description: 'Set the 24/7 target channel without immediately joining (takes effect on next cycle).',
          type: 1, // SUB_COMMAND
          options: [
            {
              name: 'channel',
              type: 7, // CHANNEL — Discord shows native channel picker
              description: 'The voice channel to set as the 24/7 target.',
              required: false,
              channel_types: [2, 13] // GUILD_VOICE and GUILD_STAGE_VOICE
            }
          ]
        }
      ]
    }
  ],
  events: [
    {
      name: 'command_voicepresence',
      handler: async (client: any, interaction: any, context: any) => {
        const action = interaction.options.getString('action');
        const isOwner = interaction.guild?.ownerId === interaction.user?.id ||
                        interaction.member?.permissions?.has?.('Administrator');
        if (!isOwner) {
          return interaction.reply({ content: '<a:wrong:1546155193303957504> Voice Presence commands require Administrator permissions.', flags: 64 });
        }
        const guildId = interaction.guildId;
        const modules = (context.getModulesState ? context.getModulesState(guildId) : null) || [];
        const voiceMod = modules.find((m: any) => m.id === 'voice');
        const channelId = voiceMod?.config?.channelId;
        if (action === 'status') {
          const status = voiceMod?.connectionStatus || 'disconnected';
          const channel = channelId ? `<#${channelId}>` : 'Not configured';
          await interaction.reply({
            content: `<:voicechannelgreen:1532425750278438962> **Voice Presence Status**\n- **Status**: \`${status}\`\n- **Channel**: ${channel}\n- **Module**: \`${voiceMod?.status || 'unknown'}\``,
            flags: 64
          });
        } else if (action === 'join') {
          if (!channelId) return interaction.reply({ content: '<a:wrong:1546155193303957504> No voice channel configured. Use `r!247 join #channel` to configure and connect.', flags: 64 });
          if (context.toggleModule) context.toggleModule('voice', true);
          context.logSyncEvent(`Voice command: Owner requested join to channel ${channelId}.`, 'info');
          await interaction.reply({ content: `<:ticks:1532620580266836148> Bot will attempt to join <#${channelId}> on the next check cycle (within 10 seconds).`, flags: 64 });
        } else if (action === 'leave') {
          const existing = getVoiceConnection(guildId);
          if (existing) {
            try {
              (existing as any)._presenceListener = null;
              existing.removeAllListeners();
              existing.destroy();
            } catch (e) {}
          }
          if (context.toggleModule) context.toggleModule('voice', false);
          context.updateModuleConfig('voice', {
            ...(voiceMod?.config || {}),
            channelId: null
          });
          context.logSyncEvent('Voice command: Owner requested voice disconnect.', 'info');
          await interaction.reply({ content: '<:ticks:1532620580266836148> 24/7 Voice Presence disabled. Bot disconnected.', flags: 64 });
        } else {
          await interaction.reply({ content: '<a:wrong:1546155193303957504> Unknown action. Use: `status`, `join`, or `leave`.', flags: 64 });
        }
      }
    },
    {
      name: 'command_247',
      handler: async (client: any, interaction: any, context: any) => {
        // Permission check: must be Administrator or server owner
        const isAdmin = interaction.guild?.ownerId === interaction.user?.id ||
                        interaction.member?.permissions?.has?.('Administrator');
        if (!isAdmin) {
          const embed = new EmbedBuilder()
            .setTitle('<a:wrong:1546155193303957504> Access Denied')
            .setDescription('Administrator permissions are required to manage the 24/7 Voice Presence system.')
            .setColor(0x99CC00)
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        const sub = interaction.options.getSubcommand(false);
        if (!sub) {
          const embed = new EmbedBuilder()
            .setTitle('<:voicechannelgreen:1532425750278438962> 24/7 Voice Presence Commands')
            .setDescription('Keep the bot alive 24/7 inside a voice channel permanently.')
            .addFields(
              { name: '`join [#channel]`', value: 'Join a voice channel and enable 24/7 auto-reconnect (defaults to your current voice channel).' },
              { name: '`leave`', value: 'Disconnect the bot from the voice channel and turn off 24/7 mode.' },
              { name: '`status`', value: 'Check current 24/7 voice status, latency, and uptime.' },
              { name: '`set <#channel>`', value: 'Set the 24/7 target voice channel without immediately joining.' }
            )
            .setColor(0x99CC00)
            .setFooter({ text: 'Rage Optimiser • Prefix: r!247 or r!24/7' });
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        const guildId = interaction.guildId;
        const modules = (context.getModulesState ? context.getModulesState(guildId) : null) || [];
        const voiceMod = modules.find((m: any) => m.id === 'voice');
        const config = voiceMod?.config || {};

        // Helper: Resolve voice channel from argument, name match, or executor voice state
        const resolveVoiceChannel = (inputChannel: any): any => {
          if (inputChannel && (inputChannel.type === ChannelType.GuildVoice || inputChannel.type === ChannelType.GuildStageVoice)) {
            return inputChannel;
          }
          if (inputChannel?.name && interaction.guild) {
            const cleanName = inputChannel.name.toLowerCase().replace(/^[<#>]*|[>]*$/g, '').trim();
            const voiceMatch = interaction.guild.channels.cache.find(
              (c: any) => (c.name?.toLowerCase() === cleanName || c.name?.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanName.replace(/[^a-z0-9]/g, '')) &&
              (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice)
            );
            if (voiceMatch) return voiceMatch;
          }
          const memberVoice = interaction.member?.voice?.channel;
          if (memberVoice && (memberVoice.type === ChannelType.GuildVoice || memberVoice.type === ChannelType.GuildStageVoice)) {
            return memberVoice;
          }
          return null;
        };

        // ─── /247 join ───────────────────────────────────────────────
        if (sub === 'join') {
          const rawChannel = interaction.options.getChannel('channel');
          const channel = resolveVoiceChannel(rawChannel);

          if (!channel) {
            const embed = new EmbedBuilder()
              .setTitle('<a:wrong:1546155193303957504> Voice Channel Required')
              .setDescription('Please specify a voice channel (e.g. `r!24/7 join #General`) or join a voice channel first.')
              .setColor(0x99CC00)
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
            return interaction.reply({ embeds: [embed], flags: 64 });
          }

          // Check bot permissions in target channel
          const botMember = interaction.guild?.members?.me;
          if (botMember && channel.permissionsFor) {
            const perms = channel.permissionsFor(botMember);
            if (perms && (!perms.has('ViewChannel') || !perms.has('Connect'))) {
              const embed = new EmbedBuilder()
                .setTitle('<a:wrong:1546155193303957504> Missing Permissions')
                .setDescription(`The bot lacks **View Channel** or **Connect** permissions in **${channel.name}**.`)
                .setColor(0x99CC00)
                .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
              return interaction.reply({ embeds: [embed], flags: 64 });
            }
          }

          await interaction.deferReply({ flags: 64 });

          try {
            // Destroy any existing connection first, silencing listeners to avoid false disconnect logs
            const existing = getVoiceConnection(guildId);
            if (existing) {
              try {
                (existing as any)._presenceListener = null;
                existing.removeAllListeners();
                existing.destroy();
              } catch (e) {}
            }

            // Immediately connect
            const connection = joinVoiceChannel({
              channelId: channel.id,
              guildId: guildId,
              adapterCreator: interaction.guild.voiceAdapterCreator,
              selfDeaf: true,
              selfMute: false
            });

            // Ensure voice module is enabled so Gateway doesn't disconnect it on the next cycle
            if (context.toggleModule) {
              context.toggleModule('voice', true);
            }

            // Save channel to config for 24/7 persistence
            context.updateModuleConfig('voice', {
              ...config,
              channelId: channel.id
            });

            context.logSyncEvent(
              guildId,
              `[/247 join] Bot connected to voice channel #${channel.name} by ${interaction.user.globalName ?? interaction.user.username}.`,
              'success'
            );

            const embed = new EmbedBuilder()
              .setTitle('<:voicechannelgreen:1532425750278438962> 24/7 Voice Presence: Active')
              .setDescription(`Successfully joined **${channel.name}** and enabled 24/7 persistence. The bot will automatically reconnect if disconnected.`)
              .addFields(
                { name: '<:voicechannelgreen:1532425750278438962> Connected Channel', value: `<#${channel.id}>`, inline: true },
                { name: '<:config:1532425712844144701> Auto-Reconnect', value: '`Enabled`', inline: true },
                { name: '<a:success_check:1546134620087783526> Mode', value: '`Deafened (Silent)`', inline: true },
                { name: '<:config:1532425712844144701> Configured By', value: `<@${interaction.user.id}>`, inline: true }
              )
              .setColor(0x99CC00)
              .setTimestamp()
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });

            await interaction.editReply({ embeds: [embed] });
          } catch (err: any) {
            const embed = new EmbedBuilder()
              .setTitle('<a:wrong:1546155193303957504> Connection Failed')
              .setDescription(`Failed to join the voice channel. Check that the bot has **Connect** and **View Channel** permissions in **${channel.name}**.`)
              .addFields({ name: 'Error Detail', value: `\`${err?.message || err}\`` })
              .setColor(0x99CC00)
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
            await interaction.editReply({ embeds: [embed] });
          }
        }

        // ─── /247 leave ──────────────────────────────────────────────
        else if (sub === 'leave') {
          const existingConnection = getVoiceConnection(guildId);
          const prevChannelId = config.channelId;

          if (!existingConnection && !prevChannelId) {
            const embed = new EmbedBuilder()
              .setTitle('<a:lovemail:1527647157371535420> Not Connected')
              .setDescription('The bot is not currently in any voice channel and 24/7 mode is not active.')
              .setColor(0x99CC00)
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
            return interaction.reply({ embeds: [embed], flags: 64 });
          }

          // Disconnect cleanly and detach presence listener so Gateway auto-reconnect does not fire
          if (existingConnection) {
            try {
              (existingConnection as any)._presenceListener = null;
              existingConnection.removeAllListeners();
              existingConnection.destroy();
            } catch (e) {}
          }

          // Disable the module and clear the target channel
          if (context.toggleModule) {
            context.toggleModule('voice', false);
          }

          context.updateModuleConfig('voice', {
            ...config,
            channelId: null
          });

          context.logSyncEvent(
            guildId,
            `[/247 leave] 24/7 Voice Presence disabled by ${interaction.user.globalName ?? interaction.user.username}.`,
            'info'
          );

          const embed = new EmbedBuilder()
            .setTitle('<:voicechannelgreen:1532425750278438962> 24/7 Voice Presence: Disabled')
            .setDescription('The bot has been disconnected from the voice channel and 24/7 mode has been turned off. Use `r!247 join` or `/247 join` to re-enable it.')
            .addFields(
              { name: '<:voicechannelgreen:1532425750278438962> Previous Channel', value: prevChannelId ? `<#${prevChannelId}>` : 'Unknown', inline: true },
              { name: '<:config:1532425712844144701> Auto-Reconnect', value: '`Disabled`', inline: true },
              { name: '<:config:1532425712844144701> Disabled By', value: `<@${interaction.user.id}>`, inline: true }
            )
            .setColor(0x99CC00)
            .setTimestamp()
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });

          await interaction.reply({ embeds: [embed], flags: 64 });
        }

        // ─── /247 status ─────────────────────────────────────────────
        else if (sub === 'status') {
          await interaction.deferReply({ flags: 64 });
          let existingConnection = null;
          try {
            existingConnection = getVoiceConnection(guildId);
          } catch (e) {}
          const isConnected = !!existingConnection;
          const channelId = config.channelId;

          const statusText = isConnected ? '<:ticks:1532620580266836148> Connected' : (channelId ? '<:config:1532425712844144701> Configured (Not Connected)' : '<a:wrong:1546155193303957504> Not Configured');

          const connState = voiceMod?.connectionStatus || (isConnected ? 'connected' : 'disconnected');
          const duration = voiceMod?.connectionDuration || '—';
          const reconnectAttempts = voiceMod?.reconnectAttempts ?? 0;

          const embed = new EmbedBuilder()
            .setTitle('<:voicechannelgreen:1532425750278438962> 24/7 Voice Presence Status')
            .addFields(
              { name: '<:stats:1532429110775779459> Status', value: statusText, inline: true },
              { name: '<:voicechannelgreen:1532425750278438962> Configured Channel', value: channelId ? `<#${channelId}>` : '`Not Set`', inline: true },
              { name: '<:link:1532620952087826602> Gateway State', value: `\`${connState}\``, inline: true },
              { name: '<a:loading:1546134304625528882> Connection Duration', value: `\`${duration}\``, inline: true },
              { name: '<:config:1532425712844144701> Reconnect Attempts', value: `\`${reconnectAttempts}\``, inline: true },
              { name: '<a:lovemail:1527647157371535420> Module Status', value: `\`${voiceMod?.status || 'unknown'}\``, inline: true }
            )
            .setColor(0x99CC00)
            .setTimestamp()
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });

          await interaction.editReply({ embeds: [embed] });
        }

        // ─── /247 set ────────────────────────────────────────────────
        else if (sub === 'set') {
          const rawChannel = interaction.options.getChannel('channel');
          const channel = resolveVoiceChannel(rawChannel);

          if (!channel) {
            const embed = new EmbedBuilder()
              .setTitle('<a:wrong:1546155193303957504> Voice Channel Required')
              .setDescription('Please specify a valid Voice or Stage Channel (e.g. `r!24/7 set #General`) or join a voice channel first.')
              .setColor(0x99CC00)
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
            return interaction.reply({ embeds: [embed], flags: 64 });
          }

          await interaction.deferReply({ flags: 64 });

          try {
            if (context.toggleModule) {
              context.toggleModule('voice', true);
            }

            context.updateModuleConfig('voice', {
              ...config,
              channelId: channel.id
            });

            context.logSyncEvent(
              guildId,
              `[/247 set] 24/7 target set to #${channel.name} by ${interaction.user.globalName ?? interaction.user.username}. Will connect on next cycle.`,
              'success'
            );

            const embed = new EmbedBuilder()
              .setTitle('<:config:1532425712844144701> 24/7 Target Channel Updated')
              .setDescription(`The 24/7 voice presence target has been updated. The bot will connect to the new channel within **10 seconds**.`)
              .addFields(
                { name: '<:voicechannelgreen:1532425750278438962> New Target Channel', value: `<#${channel.id}>`, inline: true },
                { name: '<:config:1532425712844144701> Auto-Connect', value: '`On next cycle`', inline: true },
                { name: '<:config:1532425712844144701> Set By', value: `<@${interaction.user.id}>`, inline: true }
              )
              .setColor(0x99CC00)
              .setTimestamp()
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });

            await interaction.editReply({ embeds: [embed] });
          } catch (err: any) {
            await interaction.editReply({
              content: `<a:wrong:1546155193303957504> Failed to update 24/7 target: \`${err?.message || err}\``
            });
          }
        }
      }
    }
  ]
};
