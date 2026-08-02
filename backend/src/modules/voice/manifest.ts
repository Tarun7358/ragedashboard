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
              required: true,
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
              required: true,
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
          return interaction.reply({ content: '<:shield:1532403012751065179> Voice Presence commands require Administrator permissions.', flags: 64 });
        }
        const modules = context.getModulesState();
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
          if (!channelId) return interaction.reply({ content: '<:wrong:1532390628330307634> No voice channel configured. Set it in the Dashboard → Voice Presence.', flags: 64 });
          context.logSyncEvent(`Voice command: Owner requested join to channel ${channelId}.`, 'info');
          await interaction.reply({ content: `<a:approved:1532390590707142956> Bot will attempt to join <#${channelId}> on the next check cycle (within 10 seconds).`, flags: 64 });
        } else if (action === 'leave') {
          context.logSyncEvent('Voice command: Owner requested voice disconnect.', 'info');
          await interaction.reply({ content: '<a:approved:1532390590707142956> Voice disconnection queued. Bot will leave its current voice channel.', flags: 64 });
        } else {
          await interaction.reply({ content: '<:wrong:1532390628330307634> Unknown action. Use: `status`, `join`, or `leave`.', flags: 64 });
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
            .setTitle('<:wrong:1532390628330307634> Access Denied')
            .setDescription('Administrator permissions are required to manage the 24/7 Voice Presence system.')
            .setColor(0x99CC00)
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        const sub = interaction.options.getSubcommand(false);
        if (!sub) {
          return interaction.reply({ content: '<:wrong:1532390628330307634> Please use a subcommand: `join`, `leave`, `status`, or `set`.', flags: 64 });
        }
        const modules = context.getModulesState();
        const voiceMod = modules.find((m: any) => m.id === 'voice');
        const config = voiceMod?.config || {};

        // ─── /247 join ───────────────────────────────────────────────
        if (sub === 'join') {
          const channel = interaction.options.getChannel('channel');

          // Validate it's actually a voice or stage channel
          if (!channel || (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice)) {
            const embed = new EmbedBuilder()
              .setTitle('<:wrong:1532390628330307634> Invalid Channel')
              .setDescription('The selected channel must be a **Voice or Stage Channel**. Please try again and pick a voice/stage channel from the list.')
              .setColor(0x99CC00)
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
            return interaction.reply({ embeds: [embed], flags: 64 });
          }

          await interaction.deferReply({ flags: 64 });

          try {
            // Destroy any existing connection first
            const existing = getVoiceConnection(interaction.guildId);
            if (existing) {
              try { existing.destroy(); } catch (e) {}
            }

            // Immediately connect
            const connection = joinVoiceChannel({
              channelId: channel.id,
              guildId: interaction.guildId,
              adapterCreator: interaction.guild.voiceAdapterCreator,
              selfDeaf: true,
              selfMute: false
            });

            // Save channel to config for 24/7 persistence
            context.updateModuleConfig('voice', {
              ...config,
              channelId: channel.id
            });

            context.logSyncEvent(
              interaction.guildId,
              `[/247 join] Bot connected to voice channel #${channel.name} by ${interaction.user.globalName ?? interaction.user.username}.`,
              'success'
            );

            const embed = new EmbedBuilder()
              .setTitle('<:voicechannelgreen:1532425750278438962> 24/7 Voice Presence: Active')
              .setDescription(`Successfully joined **${channel.name}** and enabled 24/7 persistence. The bot will automatically reconnect if disconnected.`)
              .addFields(
                { name: '<:voicechannelgreen:1532425750278438962> Connected Channel', value: `<#${channel.id}>`, inline: true },
                { name: '<:config:1532425712844144701> Auto-Reconnect', value: '`Enabled`', inline: true },
                { name: '<:shield:1532403012751065179> Mode', value: '`Deafened (Silent)`', inline: true },
                { name: '<:config:1532425712844144701> Configured By', value: `<@${interaction.user.id}>`, inline: true }
              )
              .setColor(0x99CC00)
              .setTimestamp()
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });

            await interaction.editReply({ embeds: [embed] });
          } catch (err: any) {
            const embed = new EmbedBuilder()
              .setTitle('<:wrong:1532390628330307634> Connection Failed')
              .setDescription(`Failed to join the voice channel. Check that the bot has **Connect** and **View Channel** permissions in **${channel.name}**.`)
              .addFields({ name: 'Error Detail', value: `\`${err?.message || err}\`` })
              .setColor(0x99CC00)
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
            await interaction.editReply({ embeds: [embed] });
          }
        }

        // ─── /247 leave ──────────────────────────────────────────────
        else if (sub === 'leave') {
          const guildId = interaction.guildId;
          const existingConnection = getVoiceConnection(guildId);
          const prevChannelId = config.channelId;

          if (!existingConnection && !prevChannelId) {
            const embed = new EmbedBuilder()
              .setTitle('<:information:1532621274092929124> Not Connected')
              .setDescription('The bot is not currently in any voice channel and 24/7 mode is not active.')
              .setColor(0x99CC00)
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
            return interaction.reply({ embeds: [embed], flags: 64 });
          }

          // Disconnect and clear config
          if (existingConnection) {
            try { existingConnection.destroy(); } catch (e) {}
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
            .setDescription('The bot has been disconnected from the voice channel and 24/7 mode has been turned off. Use `/247 join` to re-enable it.')
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
          const guildId = interaction.guildId;
          const existingConnection = getVoiceConnection(guildId);
          const isConnected = !!existingConnection;
          const channelId = config.channelId;

          const statusText = isConnected ? '<a:approved:1532390590707142956> Connected' : (channelId ? '<:config:1532425712844144701> Configured (Not Connected)' : '<:wrong:1532390628330307634> Not Configured');

          const connState = voiceMod?.connectionStatus || (isConnected ? 'connected' : 'disconnected');
          const duration = voiceMod?.connectionDuration || '—';
          const reconnectAttempts = voiceMod?.reconnectAttempts ?? 0;

          const embed = new EmbedBuilder()
            .setTitle('<:voicechannelgreen:1532425750278438962> 24/7 Voice Presence Status')
            .addFields(
              { name: '<:stats:1532429110775779459> Status', value: statusText, inline: true },
              { name: '<:voicechannelgreen:1532425750278438962> Configured Channel', value: channelId ? `<#${channelId}>` : '`Not Set`', inline: true },
              { name: '<:link:1532620952087826602> Gateway State', value: `\`${connState}\``, inline: true },
              { name: '<:timer:1532620491662037123> Connection Duration', value: `\`${duration}\``, inline: true },
              { name: '<:config:1532425712844144701> Reconnect Attempts', value: `\`${reconnectAttempts}\``, inline: true },
              { name: '<:information:1532621274092929124> Module Status', value: `\`${voiceMod?.status || 'unknown'}\``, inline: true }
            )
            .setColor(0x99CC00)
            .setTimestamp()
            .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });

          await interaction.reply({ embeds: [embed], flags: 64 });
        }

        // ─── /247 set ────────────────────────────────────────────────
        else if (sub === 'set') {
          const channel = interaction.options.getChannel('channel');

          if (!channel || (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice)) {
            const embed = new EmbedBuilder()
              .setTitle('<:wrong:1532390628330307634> Invalid Channel')
              .setDescription('The selected channel must be a **Voice or Stage Channel**. Please pick a voice/stage channel from the list.')
              .setColor(0x99CC00)
              .setFooter({ text: 'Rage Optimiser • Unbypassable Security' });
            return interaction.reply({ embeds: [embed], flags: 64 });
          }

          context.updateModuleConfig('voice', {
            ...config,
            channelId: channel.id
          });

          context.logSyncEvent(
            interaction.guildId,
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

          await interaction.reply({ embeds: [embed], flags: 64 });
        }
      }
    }
  ]
};
