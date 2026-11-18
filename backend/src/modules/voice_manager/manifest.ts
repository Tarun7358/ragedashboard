import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { PermissionFlagsBits, ChannelType, MessageFlags, Message, EmbedBuilder } from 'discord.js';
import { Colors, buildRichCard, buildListCard, buildStatusCard, buildSuccessCard, buildErrorCard, buildPermCard, MEMBER_ICON, SHIELD_ICON, VERIFIED_ICON, WRONG_ICON, INFO_ICON, VOICE_ICON, ARROW_ICON, BRAND_FOOTER } from '../../core/UIFactory.js';
import { isOwnerOrExtraOwner } from '../../utils/whitelistCheck.js';
import { VCLockControllerService, VCLockSession } from './VCLockControllerService.js';
import {
  VoiceStatusState,
  getVoiceStatusConfig,
  saveVoiceStatusConfig,
  setVoiceChannelStatus,
  getHumanMemberCount,
  processVoiceStateUpdate,
  processVoiceChannelStatusUpdate,
  startupVoiceStatusSweep,
  IVoiceStatusTarget
} from './VoiceStatusManager.js';

export const VoiceManagerManifest: ModuleManifest = {
  id: 'voice_manager',
  name: 'Voice Manager',
  version: '1.0.0',
  description: 'Mass voice operations: drag, move, disconnect, mute, unmute, deafen, undeafen, freeze, rename, cleanup, transfer, merge, split.',
  configSchema: {
    requiredFields: [],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      return { progress: 100, errors: [] };
    }
  },
  commands: [
    {
      name: 'voice',
      description: 'Voice channel management',
      options: [
        {
          name: 'move',
          description: 'Move Voice Protection monitoring to a new voice channel',
          type: 1,
          options: [
            { name: 'channel', type: 7, description: 'Voice channel to monitor', required: true, channel_types: [2, 13] }
          ]
        },
        {
          name: 'mass-disconnect',
          description: 'Disconnect all members from a voice channel',
          type: 1,
          options: [
            { name: 'channel', type: 7, description: 'Voice channel to disconnect', required: true, channel_types: [2, 13] },
            { name: 'reason', type: 3, description: 'Reason', required: false }
          ]
        },
        {
          name: 'mass-mute',
          description: 'Server-mute all members in your current or specified voice channel',
          type: 1,
          options: [{ name: 'channel', type: 7, description: 'Voice channel (defaults to your active VC)', required: false, channel_types: [2, 13] }]
        },
        {
          name: 'mass-unmute',
          description: 'Server-unmute all members in your current or specified voice channel',
          type: 1,
          options: [{ name: 'channel', type: 7, description: 'Voice channel (defaults to your active VC)', required: false, channel_types: [2, 13] }]
        },
        {
          name: 'mass-deafen',
          description: 'Server-deafen all members in your current or specified voice channel',
          type: 1,
          options: [{ name: 'channel', type: 7, description: 'Voice channel (defaults to your active VC)', required: false, channel_types: [2, 13] }]
        },
        {
          name: 'mass-undeafen',
          description: 'Server-undeafen all members in your current or specified voice channel',
          type: 1,
          options: [{ name: 'channel', type: 7, description: 'Voice channel (defaults to your active VC)', required: false, channel_types: [2, 13] }]
        },
        {
          name: 'mass-drag',
          description: 'Move all members from one channel to another',
          type: 1,
          options: [
            { name: 'from', type: 7, description: 'Source voice channel', required: true, channel_types: [2, 13] },
            { name: 'to', type: 7, description: 'Destination voice channel', required: true, channel_types: [2, 13] }
          ]
        },
        {
          name: 'freeze',
          description: 'Prevent anyone from joining a voice channel',
          type: 1,
          options: [{ name: 'channel', type: 7, description: 'Voice channel to freeze', required: true, channel_types: [2, 13] }]
        },
        {
          name: 'unfreeze',
          description: 'Allow users to join a previously frozen voice channel',
          type: 1,
          options: [{ name: 'channel', type: 7, description: 'Voice channel to unfreeze', required: true, channel_types: [2, 13] }]
        },
        {
          name: 'lock',
          description: 'Lock a voice channel (no new joins)',
          type: 1,
          options: [{ name: 'channel', type: 7, description: 'Voice channel to lock', required: true, channel_types: [2, 13] }]
        },
        {
          name: 'unlock',
          description: 'Unlock a voice channel',
          type: 1,
          options: [{ name: 'channel', type: 7, description: 'Voice channel to unlock', required: true, channel_types: [2, 13] }]
        },
        {
          name: 'rename',
          description: 'Rename a voice channel',
          type: 1,
          options: [
            { name: 'channel', type: 7, description: 'Voice channel to rename', required: true, channel_types: [2, 13] },
            { name: 'name', type: 3, description: 'New channel name', required: true }
          ]
        },
        {
          name: 'limit',
          description: 'Set user limit for a voice channel',
          type: 1,
          options: [
            { name: 'channel', type: 7, description: 'Voice channel', required: true, channel_types: [2, 13] },
            { name: 'limit', type: 4, description: 'User limit (0 = unlimited)', required: true }
          ]
        },
        {
          name: 'cleanup',
          description: 'Delete empty temporary voice channels',
          type: 1
        },
        {
          name: 'pull',
          description: 'Pull a specific user from their current voice channel to yours',
          type: 1,
          options: [{ name: 'user', type: 6, description: 'User to pull', required: true }]
        },
        {
          name: 'info',
          description: 'Get info about a voice channel',
          type: 1,
          options: [{ name: 'channel', type: 7, description: 'Voice channel', required: false, channel_types: [2, 13] }]
        },
        {
          name: 'status',
          description: 'View all active voice channels',
          type: 1
        },
        {
          name: 'splitgroup',
          description: 'Split members in a voice channel into two groups',
          type: 1,
          options: [
            { name: 'channel', type: 7, description: 'Source channel', required: true, channel_types: [2, 13] },
            { name: 'group1', type: 7, description: 'Destination channel 1', required: true, channel_types: [2, 13] },
            { name: 'group2', type: 7, description: 'Destination channel 2', required: true, channel_types: [2, 13] }
          ]
        },
        {
          name: 'drag',
          description: 'Drag a user to another voice channel',
          type: 1,
          options: [
            { name: 'user', type: 6, description: 'Target user', required: true },
            { name: 'channel', type: 7, description: 'Destination channel', required: true, channel_types: [2, 13] }
          ]
        },
        {
          name: 'swap',
          description: 'Swap users of two voice channels',
          type: 1,
          options: [
            { name: 'channel1', type: 7, description: 'First channel', required: true, channel_types: [2, 13] },
            { name: 'channel2', type: 7, description: 'Second channel', required: true, channel_types: [2, 13] }
          ]
        },
        {
          name: 'disconnect',
          description: 'Disconnect a user from voice',
          type: 1,
          options: [
            { name: 'user', type: 6, description: 'User to disconnect', required: true },
            { name: 'reason', type: 3, description: 'Reason for disconnect', required: false }
          ]
        },
        {
          name: 'sessions',
          description: 'Get list of active VC sessions',
          type: 1
        },
        {
          name: 'history',
          description: 'Show voice event history statistics',
          type: 1
        }
      ]
    },
    {
      name: 'vcstatus',
      description: 'Configure automated Voice Channel status when empty',
      options: [
        {
          name: 'set',
          description: 'Set default voice channel status applied when empty',
          type: 1,
          options: [
            { name: 'channel', type: 7, description: 'Target voice channel', required: true, channel_types: [2, 13] },
            { name: 'status', type: 3, description: 'Status message to set when empty (e.g. ✨ Playing Under Stars 🦋)', required: true }
          ]
        },
        {
          name: 'remove',
          description: 'Remove auto-status monitoring from a voice channel',
          type: 1,
          options: [
            { name: 'channel', type: 7, description: 'Voice channel to remove', required: true, channel_types: [2, 13] }
          ]
        },
        {
          name: 'list',
          description: 'List all voice channels configured with auto-status',
          type: 1
        },
        {
          name: 'reset',
          description: 'Force reset a voice channel status (to clean/empty or default)',
          type: 1,
          options: [
            { name: 'channel', type: 7, description: 'Voice channel to reset', required: true, channel_types: [2, 13] },
            {
              name: 'mode',
              type: 3,
              description: 'Reset mode: clean (removes status completely) or default (re-applies default text)',
              required: false,
              choices: [
                { name: 'Clean (Removes status completely so it never shows)', value: 'clean' },
                { name: 'Default (Re-apply configured default status)', value: 'default' }
              ]
            }
          ]
        },
        {
          name: 'clear',
          description: 'Clear voice channel status immediately and stop auto-status monitoring',
          type: 1,
          options: [
            { name: 'channel', type: 7, description: 'Voice channel to clear', required: true, channel_types: [2, 13] }
          ]
        }
      ]
    }
  ],
  events: [
    {
      name: 'command_voice',
      handler: async (client: any, interaction: any, context: any) => {
        const sub = interaction.options.getSubcommand(false);
        const guild = interaction.guild;

        if (!guild) return;
        if (sub === 'move') {
          const { handleVoiceProtectionMoveCommand } = await import('../voice-protection/commands.js');
          return handleVoiceProtectionMoveCommand(client, interaction, context);
        }

        const executorId = interaction.user?.id || interaction.author?.id;
        const memberObj = interaction.member || (executorId ? await guild.members.fetch(executorId).catch(() => null) : null);
        const isGuildOwner = executorId === guild.ownerId;
        const hasMovePerm = isGuildOwner ||
          Boolean(interaction.memberPermissions?.has?.(PermissionFlagsBits.MoveMembers)) ||
          Boolean(interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator)) ||
          Boolean(memberObj?.permissions?.has?.(PermissionFlagsBits.MoveMembers)) ||
          Boolean(memberObj?.permissions?.has?.(PermissionFlagsBits.Administrator));

        if (!hasMovePerm) {
          return interaction.reply(buildPermCard('Move Members'));
        }

        if (['lock', 'unlock', 'rename', 'limit', 'clean', 'cleanup'].includes(sub)) {
          const hasManageChan = isGuildOwner ||
            Boolean(interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageChannels)) ||
            Boolean(interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator)) ||
            Boolean(memberObj?.permissions?.has?.(PermissionFlagsBits.ManageChannels)) ||
            Boolean(memberObj?.permissions?.has?.(PermissionFlagsBits.Administrator));
          if (!hasManageChan) {
            return interaction.reply(buildPermCard('Manage Channels'));
          }
        }

        const logVoiceAction = (action: string, details: string) => {
          context.logSyncEvent(`[Voice Manager] ${interaction.user.username} — ${action}: ${details}`, 'info');
        };

        // MASS DISCONNECT
        if (sub === 'mass-disconnect') {
          const channel = interaction.options.getChannel('from') || interaction.options.getChannel('channel');
          const reason = interaction.options.getString('reason') || 'Mass disconnect';
          await interaction.deferReply({ flags: 64 });

          const members = channel.members;
          let count = 0;
          for (const [, member] of members) {
            await member.voice.disconnect(reason).catch(() => {});
            count++;
            await new Promise(r => setTimeout(r, 100));
          }
          logVoiceAction('Mass Disconnect', `${count} members from #${channel.name}`);
          return interaction.editReply({ content: `<:ticks:1532620580266836148> Disconnected **${count}** members from ${channel}.` });
        }

        // MASS MUTE
        if (sub === 'mass-mute') {
          const channel = interaction.options.getChannel('channel') || interaction.member?.voice?.channel;
          if (!channel) {
            return interaction.reply({ content: '<a:warning:1546155193303957504> You are not currently connected to a voice channel. Please join a voice channel or select one.', flags: 64 });
          }
          await interaction.deferReply({ flags: 64 });
          let count = 0;
          for (const [, member] of channel.members) {
            await member.voice.setMute(true, 'Mass mute').catch(() => {});
            count++;
          }
          logVoiceAction('Mass Mute', `${count} members in #${channel.name}`);
          return interaction.editReply({ content: `<:ticks:1532620580266836148> Server-muted **${count}** members in ${channel}.` });
        }

        // MASS UNMUTE
        if (sub === 'mass-unmute') {
          const channel = interaction.options.getChannel('channel') || interaction.member?.voice?.channel;
          if (!channel) {
            return interaction.reply({ content: '<a:warning:1546155193303957504> You are not currently connected to a voice channel. Please join a voice channel or select one.', flags: 64 });
          }
          await interaction.deferReply({ flags: 64 });
          let count = 0;
          for (const [, member] of channel.members) {
            await member.voice.setMute(false, 'Mass unmute').catch(() => {});
            count++;
          }
          logVoiceAction('Mass Unmute', `${count} members in #${channel.name}`);
          return interaction.editReply({ content: `<:ticks:1532620580266836148> Server-unmuted **${count}** members in ${channel}.` });
        }

        // MASS DEAFEN
        if (sub === 'mass-deafen') {
          const channel = interaction.options.getChannel('channel') || interaction.member?.voice?.channel;
          if (!channel) {
            return interaction.reply({ content: '<a:warning:1546155193303957504> You are not currently connected to a voice channel. Please join a voice channel or select one.', flags: 64 });
          }
          await interaction.deferReply({ flags: 64 });
          let count = 0;
          for (const [, member] of channel.members) {
            await member.voice.setDeaf(true, 'Mass deafen').catch(() => {});
            count++;
          }
          logVoiceAction('Mass Deafen', `${count} members in #${channel.name}`);
          return interaction.editReply({ content: `<:ticks:1532620580266836148> Server-deafened **${count}** members in ${channel}.` });
        }

        // MASS UNDEAFEN
        if (sub === 'mass-undeafen') {
          const channel = interaction.options.getChannel('channel') || interaction.member?.voice?.channel;
          if (!channel) {
            return interaction.reply({ content: '<a:warning:1546155193303957504> You are not currently connected to a voice channel. Please join a voice channel or select one.', flags: 64 });
          }
          await interaction.deferReply({ flags: 64 });
          let count = 0;
          for (const [, member] of channel.members) {
            await member.voice.setDeaf(false, 'Mass undeafen').catch(() => {});
            count++;
          }
          logVoiceAction('Mass Undeafen', `${count} members in #${channel.name}`);
          return interaction.editReply({ content: `<:ticks:1532620580266836148> Server-undeafened **${count}** members in ${channel}.` });
        }

        // MASS DRAG / MASS MOVE (same logic)
        if (sub === 'mass-drag' || sub === 'mass-move') {
          const from = interaction.options.getChannel('from');
          const to = interaction.options.getChannel('to');
          await interaction.deferReply({ flags: 64 });
          let count = 0;
          const members = [...from.members.values()];
          for (const member of members) {
            await member.voice.setChannel(to).catch(() => {});
            count++;
            await new Promise(r => setTimeout(r, 150));
          }
          logVoiceAction('Mass Move', `${count} members from #${from.name} → #${to.name}`);
          return interaction.editReply({ content: `<:ticks:1532620580266836148> Moved **${count}** members from ${from} → ${to}.` });
        }

        // FREEZE
        if (sub === 'freeze') {
          const channel = interaction.options.getChannel('channel');
          await channel.permissionOverwrites.edit(guild.id, { Connect: false }).catch(() => {});
          logVoiceAction('Freeze', `#${channel.name}`);
          return interaction.reply({ content: `<:ticks:1532620580266836148> Frozen ${channel}. No new users can join.`, flags: 64 });
        }

        // UNFREEZE
        if (sub === 'unfreeze') {
          const channel = interaction.options.getChannel('channel');
          await channel.permissionOverwrites.edit(guild.id, { Connect: null }).catch(() => {});
          logVoiceAction('Unfreeze', `#${channel.name}`);
          return interaction.reply({ content: `<:ticks:1532620580266836148> Unfrozen ${channel}. Users can now join.`, flags: 64 });
        }

        // LOCK
        if (sub === 'lock') {
          const channel = interaction.options.getChannel('channel');
          await channel.permissionOverwrites.edit(guild.id, {
            ViewChannel: true,
            Connect: false,
            SendMessages: false
          }).catch(() => {});
          
          // Grant lock executor full connect + chat permissions
          await channel.permissionOverwrites.edit(interaction.user.id, {
            Connect: true,
            SendMessages: true,
            ViewChannel: true
          }).catch(() => {});

          const session: VCLockSession = {
            channelId: channel.id,
            guildId: guild.id,
            ownerId: interaction.user.id,
            lockedAt: Date.now(),
            addedUserIds: [],
            chatPermittedUserIds: [interaction.user.id]
          };
          VCLockControllerService.setSession(channel.id, session);

          const botAvatar = client.user?.displayAvatarURL?.({ size: 512 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
          const guiPayload = VCLockControllerService.buildLockControllerPayload({
            channel,
            session,
            guild,
            botAvatarUrl: botAvatar
          });

          const panelMsg = await (channel as any).send(guiPayload).catch(() => null);
          if (panelMsg) session.panelMessageId = panelMsg.id;

          logVoiceAction('Lock', `#${channel.name}`);
          return interaction.reply({ content: `<a:success_check:1546134620087783526> Locked ${channel} and spawned Voice Controller in chat.`, flags: 64 });
        }

        // UNLOCK
        if (sub === 'unlock') {
          const channel = interaction.options.getChannel('channel');
          const existingSession = VCLockControllerService.getSession(channel.id);
          if (existingSession) {
            await VCLockControllerService.cleanupSessionOverwrites(channel, existingSession);
            VCLockControllerService.deleteSession(channel.id);
          }

          await channel.permissionOverwrites.edit(guild.id, {
            ViewChannel: true,
            Connect: true,
            SendMessages: true,
          }).catch(() => {});
          logVoiceAction('Unlock', `#${channel.name}`);
          return interaction.reply({ content: `<:ticks:1532620580266836148> Unlocked ${channel} (Public access restored).`, flags: 64 });
        }

        // RENAME
        if (sub === 'rename') {
          const channel = interaction.options.getChannel('channel');
          const name = interaction.options.getString('name');
          await channel.setName(name).catch(() => {});
          logVoiceAction('Rename', `#${channel.name} → ${name}`);
          return interaction.reply({ content: `<:ticks:1532620580266836148> Renamed channel to **${name}**.`, flags: 64 });
        }

        // LIMIT
        if (sub === 'limit') {
          const channel = interaction.options.getChannel('channel');
          const limit = interaction.options.getInteger('limit');
          if (channel.type !== ChannelType.GuildVoice) return interaction.reply({ content: '<a:warning:1546155193303957504> Not a voice channel.', flags: 64 });
          await channel.setUserLimit(limit).catch(() => {});
          return interaction.reply({ content: `<:ticks:1532620580266836148> Set user limit to **${limit === 0 ? 'unlimited' : limit}** for ${channel}.`, flags: 64 });
        }

        // CLEANUP / CLEAN
        if (sub === 'cleanup' || sub === 'clean') {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) && !isGuildOwner) {
            return interaction.reply({ content: '<a:success_check:1546134620087783526> Manage Channels permission required.', flags: 64 });
          }
          await interaction.deferReply({ flags: 64 });
          const modules = context.getModulesState ? context.getModulesState(guild.id) : [];
          const jtcMod = modules.find((m: any) => m.id === 'join_to_create');
          const jtcConfig = jtcMod?.config || {};
          const activeChannels: any[] = jtcConfig.activeChannels || [];
          const activeIds = new Set(activeChannels.map((ac: any) => ac.channelId));
          const triggerIds = new Set([
            ...(jtcConfig.triggers || []).map((t: any) => t.triggerChannelId),
            jtcConfig.triggerChannelId,
            jtcConfig.hubChannelId
          ].filter(Boolean));

          const voiceChannels = guild.channels.cache.filter((c: any) => {
            if (c.type !== ChannelType.GuildVoice) return false;
            const nonBots = c.members?.filter ? c.members.filter((m: any) => !m.user?.bot).size : c.members?.size || 0;
            if (nonBots > 0) return false;
            if (c.id === guild.afkChannelId || triggerIds.has(c.id)) return false;
            if (activeIds.has(c.id)) return true;
            return /'s (channel|room)$/i.test(c.name);
          });

          let count = 0;
          const deletedIds = new Set<string>();
          for (const [, channel] of voiceChannels) {
            await channel.delete('Voice Cleanup').then(() => {
              count++;
              deletedIds.add(channel.id);
            }).catch(() => {});
          }
          if (deletedIds.size > 0 && jtcMod && context.updateModuleConfig) {
            const remainingActive = activeChannels.filter((ac: any) => !deletedIds.has(ac.channelId));
            context.updateModuleConfig('join_to_create', { ...jtcConfig, activeChannels: remainingActive });
          }
          logVoiceAction('Cleanup', `Deleted ${count} empty temporary voice channels`);
          return interaction.editReply({ content: `<:ticks:1532620580266836148> Cleaned up **${count}** empty temporary voice channels.` });
        }

        // PULL
        if (sub === 'pull') {
          const user = interaction.options.getUser('user');
          const member = guild.members.cache.get(user.id) || await guild.members.fetch(user.id).catch(() => null);
          if (!member) return interaction.reply({ content: '<a:warning:1546155193303957504> Member not found.', flags: 64 });
          if (!interaction.member?.voice?.channel) return interaction.reply({ content: '<a:warning:1546155193303957504> You must be in a voice channel.', flags: 64 });
          if (!member.voice?.channel) return interaction.reply({ content: `<a:warning:1546155193303957504> ${user.username} is not in a voice channel.`, flags: 64 });
          await member.voice.setChannel(interaction.member.voice.channel).catch(() => {});
          logVoiceAction('Pull', `${user.username} → #${interaction.member.voice.channel.name}`);
          return interaction.reply({ content: `<:ticks:1532620580266836148> Pulled ${user} to your channel.`, flags: 64 });
        }

        // INFO
        if (sub === 'info') {
          const channel = interaction.options.getChannel('channel') || interaction.member.voice?.channel;
          if (!channel) return interaction.reply({ content: '<a:warning:1546155193303957504> No voice channel specified or you\'re not in one.', flags: 64 });

          const memberList = channel.members.size > 0
            ? [...channel.members.values()].map((m: any) => `• ${m.user.username}`).join('\n').substring(0, 900)
            : '*No members currently in channel.*';

          const { embeds, components, flags } = buildRichCard({
            emoji: '<:voicechannelgreen:1532425750278438962>',
            title: `Voice Channel — ${channel.name}`,
            accentColor: Colors.VOICE,
            fields: [
              { label: `${MEMBER_ICON} Members`,  value: `**${channel.members.size}**${channel.userLimit ? ` / ${channel.userLimit}` : ''}` },
              { label: '<:stats:1532429110775779459> Bitrate',  value: `**${channel.bitrate ? Math.round(channel.bitrate / 1000) : '?'} kbps**` },
              { label: '🆔 ID',       value: `\`${channel.id}\`` },
              { label: '<:member:1532621317487071426> Users',    value: memberList },
            ],
            footerNote: 'Rage Optimiser • Unbypassable Security',
          });
          return interaction.reply({ embeds, components, flags });
        }

        // STATUS
        if (sub === 'status') {
          const voiceChannels = guild.channels.cache.filter((c: any) => c.type === ChannelType.GuildVoice && c.members.size > 0);
          if (voiceChannels.size === 0) return interaction.reply({ content: '<a:lovemail:1527647157371535420> No active voice channels right now.', flags: 64 });

          const lines = voiceChannels.map((c: any) =>
            `<:voicechannelgreen:1532425750278438962> **${c.name}** — ${c.members.size} member${c.members.size !== 1 ? 's' : ''}`
          );

          const { embeds, components } = buildListCard({
            emoji: '<:voicechannelgreen:1532425750278438962>',
            title: 'Active Voice Channels',
            subtitle: `${voiceChannels.size} channel(s) with active members`,
            entries: [...lines],
            accentColor: Colors.VOICE,
          });
          return interaction.reply({ embeds, components });
        }

        // SPLIT GROUP
        if (sub === 'splitgroup') {
          const source = interaction.options.getChannel('channel');
          const group1 = interaction.options.getChannel('group1');
          const group2 = interaction.options.getChannel('group2');
          await interaction.deferReply({ flags: 64 });

          const members = [...source.members.values()];
          const half = Math.ceil(members.length / 2);
          let moved = 0;

          for (let i = 0; i < members.length; i++) {
            const target = i < half ? group1 : group2;
            await members[i].voice.setChannel(target).catch(() => {});
            moved++;
            await new Promise(r => setTimeout(r, 150));
          }

          logVoiceAction('Split Group', `${members.length} members from #${source.name} into #${group1.name} and #${group2.name}`);
          return interaction.editReply({ content: `<:ticks:1532620580266836148> Split **${moved}** members: **${half}** → ${group1}, **${members.length - half}** → ${group2}.` });
        }

        // DRAG
        if (sub === 'drag') {
          const user = interaction.options.getUser('user');
          const channel = interaction.options.getChannel('channel');
          const member = guild.members.cache.get(user.id) || await guild.members.fetch(user.id).catch(() => null);
          if (!member || !member.voice?.channel) {
            return interaction.reply({ content: '<a:warning:1546155193303957504> User is not currently in a voice channel.', flags: 64 });
          }
          await member.voice.setChannel(channel).catch(() => {});
          logVoiceAction('Drag', `Moved ${user.username} to #${channel.name}`);
          return interaction.reply({ content: `<:ticks:1532620580266836148> Successfully dragged ${user} to ${channel}.`, flags: 64 });
        }

        // MASSDRAG
        if (sub === 'massdrag') {
          const from = interaction.options.getChannel('from');
          const to = interaction.options.getChannel('to');
          await interaction.deferReply({ flags: 64 });
          let count = 0;
          const members = [...from.members.values()];
          for (const member of members) {
            await member.voice.setChannel(to).catch(() => {});
            count++;
            await new Promise(r => setTimeout(r, 150));
          }
          logVoiceAction('Mass Drag', `${count} members from #${from.name} → #${to.name}`);
          return interaction.editReply({ content: `<:ticks:1532620580266836148> Successfully mass-dragged **${count}** members from ${from} to ${to}.` });
        }

        // PULLALL
        if (sub === 'pullall') {
          const from = interaction.options.getChannel('from');
          const to = interaction.member.voice?.channel;
          if (!to) return interaction.reply({ content: '<a:warning:1546155193303957504> You must be in a voice channel to pull members.', flags: 64 });
          await interaction.deferReply({ flags: 64 });
          let count = 0;
          for (const [, member] of from.members) {
            await member.voice.setChannel(to).catch(() => {});
            count++;
            await new Promise(r => setTimeout(r, 150));
          }
          logVoiceAction('Pull All', `Pulled ${count} members to #${to.name}`);
          return interaction.editReply({ content: `<:ticks:1532620580266836148> Pulled **${count}** members from ${from} to your channel.` });
        }

        // SWAP
        if (sub === 'swap') {
          const channel1 = interaction.options.getChannel('channel1');
          const channel2 = interaction.options.getChannel('channel2');
          await interaction.deferReply({ flags: 64 });
          const members1 = [...channel1.members.values()];
          const members2 = [...channel2.members.values()];
          let count = 0;
          for (const member of members1) {
            await member.voice.setChannel(channel2).catch(() => {});
            count++;
            await new Promise(r => setTimeout(r, 100));
          }
          for (const member of members2) {
            await member.voice.setChannel(channel1).catch(() => {});
            count++;
            await new Promise(r => setTimeout(r, 100));
          }
          logVoiceAction('VC Swap', `Swapped members of #${channel1.name} and #${channel2.name}`);
          return interaction.editReply({ content: `<:ticks:1532620580266836148> Swapped **${count}** members between ${channel1} and ${channel2}.` });
        }

        // DISCONNECT
        if (sub === 'disconnect') {
          const user = interaction.options.getUser('user');
          const reason = interaction.options.getString('reason') || 'Voice disconnect';
          const member = guild.members.cache.get(user.id) || await guild.members.fetch(user.id).catch(() => null);
          if (!member || !member.voice?.channel) {
            return interaction.reply({ content: '<a:warning:1546155193303957504> User is not currently in a voice channel.', flags: 64 });
          }
          await member.voice.disconnect(reason).catch(() => {});
          logVoiceAction('Disconnect', `Disconnected ${user.username} from voice`);
          return interaction.reply({ content: `<:ticks:1532620580266836148> Disconnected ${user} from voice.`, flags: 64 });
        }

        // SESSIONS
        if (sub === 'sessions') {
          const voiceStates = guild.voiceStates.cache;
          const activeSessions = voiceStates.filter((v: any) => v.channelId).size;
          const { embeds, components } = buildStatusCard({
            emoji: '<:voicechannelgreen:1532425750278438962>',
            title: 'Live Voice Sessions',
            body: `There are currently **${activeSessions}** active voice session${activeSessions !== 1 ? 's' : ''} across all channels.`,
            accentColor: Colors.VOICE,
          });
          return interaction.reply({ embeds, components });
        }

        // HISTORY
        if (sub === 'history') {
          return interaction.reply({ content: '<a:lovemail:1527647157371535420> **Voice Connections History**:\nNo historical connection data has been recorded in the local log stream.', flags: 64 });
        }

        // DEFAULT FALLBACK
        return interaction.reply({
          content: `<:config:1532425712844144701> **Voice Management Hub**\nUse \`r!voice status\`, \`r!voice info\`, \`r!voice cleanup\`, \`r!voice lock\`, or \`r!voice mass-drag\`.`,
          flags: 64
        });
      }
    },
    {
      name: 'command_vcstatus',
      handler: async (client: any, interaction: any, context: any) => {
        if (!interaction.guild) return;
        const authorMember = interaction.member || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        const hasPerm = authorMember?.permissions?.has(PermissionFlagsBits.ManageChannels) ||
                        authorMember?.permissions?.has(PermissionFlagsBits.Administrator) ||
                        interaction.user.id === interaction.guild.ownerId;
        if (!hasPerm) {
          const permEmbed = new EmbedBuilder()
            .setColor(Colors.DANGER)
            .setTitle(`${SHIELD_ICON} Permission Denied`)
            .setDescription(`You require \`Manage Channels\` or \`Administrator\` permission to configure automated Voice Channel statuses.`)
            .setFooter({ text: BRAND_FOOTER });
          return interaction.reply({ embeds: [permEmbed], flags: 64 });
        }

        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guildId;
        const config = getVoiceStatusConfig(context, guildId);

        if (sub === 'set') {
          const targetChannel = interaction.options.getChannel('channel');
          const statusText = interaction.options.getString('status');

          if (!targetChannel || (!targetChannel.isVoiceBased?.() && targetChannel.type !== ChannelType.GuildVoice && targetChannel.type !== ChannelType.GuildStageVoice)) {
            return interaction.reply({ content: `${WRONG_ICON} Please select a valid voice or stage channel.`, flags: 64 });
          }

          const existingIndex = config.channels.findIndex(c => c.channelId === targetChannel.id);
          const channelObj: IVoiceStatusTarget = {
            channelId: targetChannel.id,
            defaultStatus: statusText,
            enabled: true,
            createdAt: existingIndex >= 0 ? config.channels[existingIndex].createdAt : Date.now(),
            lastUpdated: Date.now()
          };

          if (existingIndex >= 0) {
            config.channels[existingIndex] = channelObj;
          } else {
            config.channels.push(channelObj);
          }

          await saveVoiceStatusConfig(context, guildId, config);

          const humanCount = getHumanMemberCount(targetChannel);
          let appliedNow = false;
          let applyError = '';

          if (humanCount === 0) {
            const res = await setVoiceChannelStatus(targetChannel, statusText);
            appliedNow = res.success;
            if (!res.success) applyError = res.error || '';
          }

          const embed = new EmbedBuilder()
            .setColor(Colors.LIME)
            .setTitle(`${VERIFIED_ICON} Voice Channel Auto-Status Configured`)
            .setDescription([
              `> **Voice Channel**: ${targetChannel} (\`#${targetChannel.name}\`)`,
              `> **Default Status**: \`${statusText}\``,
              `> **Current Occupants**: \`${humanCount} human members\``,
              `> **Status Applied**: ${appliedNow ? '`Applied Immediately (Channel Empty)`' : humanCount > 0 ? '`Saved (Will apply once channel empties)`' : '`Saved`'}`
            ].join('\n'))
            .setFooter({ text: BRAND_FOOTER })
            .setTimestamp();

          if (applyError) {
            embed.addFields({ name: '⚠️ Notice', value: `Could not apply immediately: \`${applyError}\`.\nEnsure bot has \`Set Voice Channel Status\` permission.` });
          }

          return interaction.reply({ embeds: [embed] });
        }

        if (sub === 'remove') {
          const targetChannel = interaction.options.getChannel('channel');
          const index = config.channels.findIndex(c => c.channelId === targetChannel.id);
          if (index !== -1) {
            config.channels.splice(index, 1);
            await saveVoiceStatusConfig(context, guildId, config);
          }

          // Clear voice status in Discord immediately and clear in-memory timers
          await setVoiceChannelStatus(targetChannel, '');
          VoiceStatusState.clearPendingTimer(targetChannel.id);
          VoiceStatusState.setCurrentStatus(targetChannel.id, '');
          VoiceStatusState.setManualOverride(targetChannel.id, false);

          const embed = new EmbedBuilder()
            .setColor(Colors.LIME)
            .setTitle(`${VERIFIED_ICON} Auto-Status Removed & Cleared`)
            .setDescription(`Successfully removed auto-status monitoring and cleared the voice status from ${targetChannel}.\n\n> This channel will **not show that voice status anymore**.`)
            .setFooter({ text: BRAND_FOOTER })
            .setTimestamp();

          return interaction.reply({ embeds: [embed] });
        }

        if (sub === 'list') {
          if (config.channels.length === 0) {
            const emptyEmbed = new EmbedBuilder()
              .setColor(Colors.WARN)
              .setTitle(`${VOICE_ICON} Voice Channel Auto-Statuses`)
              .setDescription(`No voice channels are currently configured with auto-status.\n\n> ${ARROW_ICON} **Set One**: \`/vcstatus set channel:#vc status:Your Status\``)
              .setFooter({ text: BRAND_FOOTER });
            return interaction.reply({ embeds: [emptyEmbed] });
          }

          const lines = config.channels.map((c, i) => {
            const ch = interaction.guild.channels.cache.get(c.channelId);
            const name = ch ? `#${ch.name}` : `ID: ${c.channelId}`;
            const occupants = ch ? getHumanMemberCount(ch) : '?';
            return `**${i + 1}.** <#${c.channelId}> (\`${name}\`)\n> **Default Status**: \`${c.defaultStatus}\`\n> **Live Members**: \`${occupants} occupants\` • **Enabled**: \`${c.enabled}\``;
          });

          const embed = new EmbedBuilder()
            .setColor(Colors.BRAND)
            .setTitle(`${VOICE_ICON} Configured Voice Channel Auto-Statuses`)
            .setDescription(lines.join('\n\n'))
            .setFooter({ text: BRAND_FOOTER })
            .setTimestamp();

          return interaction.reply({ embeds: [embed] });
        }

        if (sub === 'reset') {
          const targetChannel = interaction.options.getChannel('channel');
          const mode = interaction.options.getString('mode') || 'clean';

          if (mode === 'clean') {
            const index = config.channels.findIndex(c => c.channelId === targetChannel.id);
            if (index !== -1) {
              config.channels.splice(index, 1);
              await saveVoiceStatusConfig(context, guildId, config);
            }

            await setVoiceChannelStatus(targetChannel, '');
            VoiceStatusState.clearPendingTimer(targetChannel.id);
            VoiceStatusState.setCurrentStatus(targetChannel.id, '');
            VoiceStatusState.setManualOverride(targetChannel.id, false);

            const embed = new EmbedBuilder()
              .setColor(Colors.LIME)
              .setTitle(`${VERIFIED_ICON} Voice Status Cleaned & Reset`)
              .setDescription(`Successfully reset and cleared voice status for ${targetChannel}.\n\n> Auto-status monitoring has been stopped. The channel will **not show that voice status anymore**.`)
              .setFooter({ text: BRAND_FOOTER })
              .setTimestamp();

            return interaction.reply({ embeds: [embed] });
          }

          const targetConfig = config.channels.find(c => c.channelId === targetChannel.id);
          if (!targetConfig) {
            await setVoiceChannelStatus(targetChannel, '');
            VoiceStatusState.clearPendingTimer(targetChannel.id);
            VoiceStatusState.setCurrentStatus(targetChannel.id, '');
            VoiceStatusState.setManualOverride(targetChannel.id, false);

            return interaction.reply({
              embeds: [
                new EmbedBuilder()
                  .setColor(Colors.LIME)
                  .setTitle(`${VERIFIED_ICON} Voice Status Cleared`)
                  .setDescription(`${targetChannel} was not configured for auto-status, so any residual voice status text has been completely cleared.`)
                  .setFooter({ text: BRAND_FOOTER })
                  .setTimestamp()
              ]
            });
          }

          const res = await setVoiceChannelStatus(targetChannel, targetConfig.defaultStatus);
          if (!res.success) {
            return interaction.reply({ content: `${WRONG_ICON} Failed to set voice status: \`${res.error}\``, flags: 64 });
          }

          VoiceStatusState.setManualOverride(targetChannel.id, false);

          const embed = new EmbedBuilder()
            .setColor(Colors.LIME)
            .setTitle(`${VERIFIED_ICON} Voice Status Re-Applied`)
            .setDescription([
              `Successfully re-applied default status for ${targetChannel}:`,
              `> \`${targetConfig.defaultStatus}\``,
              '',
              `💡 **To remove status permanently so it NEVER shows again**:`,
              `> Use \`/vcstatus clear\` or \`/vcstatus remove\``
            ].join('\n'))
            .setFooter({ text: BRAND_FOOTER })
            .setTimestamp();

          return interaction.reply({ embeds: [embed] });
        }

        if (sub === 'clear') {
          const targetChannel = interaction.options.getChannel('channel');

          // 1. Remove from config so auto-status never re-applies it
          const index = config.channels.findIndex(c => c.channelId === targetChannel.id);
          if (index !== -1) {
            config.channels.splice(index, 1);
            await saveVoiceStatusConfig(context, guildId, config);
          }

          // 2. Clear from Discord
          const res = await setVoiceChannelStatus(targetChannel, '');
          VoiceStatusState.clearPendingTimer(targetChannel.id);
          VoiceStatusState.setCurrentStatus(targetChannel.id, '');
          VoiceStatusState.setManualOverride(targetChannel.id, false);

          if (!res.success) {
            return interaction.reply({ content: `${WRONG_ICON} Failed to clear voice status: \`${res.error}\``, flags: 64 });
          }

          const embed = new EmbedBuilder()
            .setColor(Colors.LIME)
            .setTitle(`${VERIFIED_ICON} Voice Status Cleared`)
            .setDescription(`Successfully cleared voice status for ${targetChannel} and removed auto-status monitoring.\n\n> This channel will **not show that voice status anymore**.`)
            .setFooter({ text: BRAND_FOOTER })
            .setTimestamp();

          return interaction.reply({ embeds: [embed] });
        }
      }
    },
    {
      name: 'voiceStateUpdate',
      handler: async (client: any, data: any, context: any) => {
        const { oldState, newState } = data || {};
        await processVoiceStateUpdate(client, oldState, newState, context);

        // Auto-Unlock on Empty Voice Channel
        const oldChannel = oldState?.channel;
        if (oldChannel && oldChannel.isVoiceBased()) {
          const humanCount = oldChannel.members?.filter((m: any) => !m.user.bot).size ?? 0;
          if (humanCount === 0) {
            const session = VCLockControllerService.getSession(oldChannel.id);
            if (session) {
              await VCLockControllerService.cleanupSessionOverwrites(oldChannel, session);
              VCLockControllerService.deleteSession(oldChannel.id);

              await oldChannel.permissionOverwrites.edit(oldChannel.guild.id, {
                ViewChannel: true,
                Connect: true,
                SendMessages: true
              }).catch(() => {});

              context?.logSyncEvent?.(`[Voice Manager] Auto-unlocked empty voice channel #${oldChannel.name}`, 'info');
            }
          }
        }
      }
    },
    {
      name: 'button_vclock_generic',
      handler: async (client: any, interaction: any, context: any) => {
        const customId = interaction.customId || '';
        const guild = interaction.guild;
        if (!guild) return;

        const [actionKey, channelId] = customId.split(':');
        if (!channelId) return;

        const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
        if (!channel || !channel.isVoiceBased()) {
          return interaction.reply({ content: `${WRONG_ICON} Voice channel not found or deleted.`, flags: 64 });
        }

        const session = VCLockControllerService.getSession(channel.id)
          || await VCLockControllerService.getOrRecoverSession(channel, interaction.user.id);
        if (!session) {
          return interaction.reply({ content: `${WRONG_ICON} No active lock session found for this channel.`, flags: 64 });
        }

        const member = interaction.member || await guild.members.fetch(interaction.user.id).catch(() => null);
        const authorized = await VCLockControllerService.isAuthorized(member, guild, session);
        if (!authorized) {
          return interaction.reply({
            content: `${WRONG_ICON} **Access Denied**: Only the Lock Executor (<@${session.ownerId}>), Extra Owners, or Server Owner can manage this voice channel.`,
            flags: 64
          });
        }

        const botAvatar = client.user?.displayAvatarURL?.({ size: 512 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

        // 1. UNLOCK VC
        if (actionKey === 'vclock_btn_unlock') {
          await VCLockControllerService.cleanupSessionOverwrites(channel, session);
          VCLockControllerService.deleteSession(channel.id);

          await channel.permissionOverwrites.edit(guild.id, {
            ViewChannel: true,
            Connect: true,
            SendMessages: true
          }).catch(() => {});

          await interaction.reply({
            content: `<:ticks:1532620580266836148> <#${channel.id}> has been **unlocked** (Public access restored).`,
            flags: 64
          });

          // Delete or update controller
          if (session.panelMessageId) {
            const panelMsg = await (channel as any).messages.fetch(session.panelMessageId).catch(() => null);
            if (panelMsg) await panelMsg.delete().catch(() => {});
          }
          return;
        }

        // 2. GRANT CHAT TO ALL IN VC
        if (actionKey === 'vclock_btn_chat_all') {
          await interaction.deferUpdate().catch(() => {});
          const currentHumans = channel.members.filter((m: any) => !m.user.bot);
          for (const [mId] of currentHumans) {
            await channel.permissionOverwrites.edit(mId, {
              SendMessages: true,
              ViewChannel: true
            }).catch(() => {});
            if (!session.chatPermittedUserIds.includes(mId)) {
              session.chatPermittedUserIds.push(mId);
            }
          }

          const updatedPayload = VCLockControllerService.buildLockControllerPayload({
            channel,
            session,
            guild,
            botAvatarUrl: botAvatar
          });

          return interaction.editReply(updatedPayload).catch(() => {});
        }

        // 3. REMOVE EXTRA CHAT (Only owner keeps chat)
        if (actionKey === 'vclock_btn_chat_none') {
          await interaction.deferUpdate().catch(() => {});
          for (const uid of session.chatPermittedUserIds) {
            if (uid !== session.ownerId && !session.addedUserIds.includes(uid)) {
              await channel.permissionOverwrites.delete(uid).catch(() => {});
            } else if (uid !== session.ownerId && session.addedUserIds.includes(uid)) {
              await channel.permissionOverwrites.edit(uid, {
                Connect: true,
                SendMessages: false
              }).catch(() => {});
            }
          }
          session.chatPermittedUserIds = [session.ownerId];

          const updatedPayload = VCLockControllerService.buildLockControllerPayload({
            channel,
            session,
            guild,
            botAvatarUrl: botAvatar
          });

          return interaction.editReply(updatedPayload).catch(() => {});
        }

        // 4. REFRESH GUI
        if (actionKey === 'vclock_btn_refresh') {
          await interaction.deferUpdate().catch(() => {});
          const updatedPayload = VCLockControllerService.buildLockControllerPayload({
            channel,
            session,
            guild,
            botAvatarUrl: botAvatar
          });
          return interaction.editReply(updatedPayload).catch(() => {});
        }

        // 5. USER SELECT MENU: ADD MEMBER
        if (actionKey === 'vclock_select_add') {
          const selectedUserId = interaction.values?.[0];
          if (!selectedUserId) {
            return interaction.reply({ content: `${WRONG_ICON} No member selected.`, flags: 64 });
          }

          if (session.addedUserIds.length >= 15) {
            return interaction.reply({ content: `${WRONG_ICON} Maximum limit of 15 added members reached for this room.`, flags: 64 });
          }

          await interaction.deferUpdate().catch(() => {});
          await channel.permissionOverwrites.edit(selectedUserId, {
            Connect: true,
            SendMessages: true,
            ViewChannel: true
          }).catch(() => {});

          if (!session.addedUserIds.includes(selectedUserId)) {
            session.addedUserIds.push(selectedUserId);
          }
          if (!session.chatPermittedUserIds.includes(selectedUserId)) {
            session.chatPermittedUserIds.push(selectedUserId);
          }

          const updatedPayload = VCLockControllerService.buildLockControllerPayload({
            channel,
            session,
            guild,
            botAvatarUrl: botAvatar
          });

          return interaction.editReply(updatedPayload).catch(() => {});
        }

        // 6. USER SELECT MENU: REMOVE MEMBER
        if (actionKey === 'vclock_select_remove') {
          const selectedUserId = interaction.values?.[0];
          if (!selectedUserId) {
            return interaction.reply({ content: `${WRONG_ICON} No member selected.`, flags: 64 });
          }

          await interaction.deferUpdate().catch(() => {});
          await channel.permissionOverwrites.delete(selectedUserId).catch(() => {});

          session.addedUserIds = session.addedUserIds.filter(id => id !== selectedUserId);
          session.chatPermittedUserIds = session.chatPermittedUserIds.filter(id => id !== selectedUserId);

          // Disconnect member if they are currently inside this locked channel
          const targetMember = channel.members.get(selectedUserId);
          if (targetMember && targetMember.id !== session.ownerId) {
            await targetMember.voice.disconnect('Removed from locked voice room').catch(() => {});
          }

          const updatedPayload = VCLockControllerService.buildLockControllerPayload({
            channel,
            session,
            guild,
            botAvatarUrl: botAvatar
          });

          return interaction.editReply(updatedPayload).catch(() => {});
        }
      }
    },
    {
      name: 'voiceChannelStatusUpdate',
      handler: async (client: any, data: any, context: any) => {
        processVoiceChannelStatusUpdate(client, data, context);
      }
    },
    {
      name: 'ready',
      handler: async (client: any, _data: any, context: any) => {
        await startupVoiceStatusSweep(client, context);
      }
    }
  ]
};

import { PrefixRegistry } from '../../core/prefix/PrefixRegistry.js';

export function registerVoiceManagerCommands() {
  // Prefix Command: r!vcmute
  PrefixRegistry.register({
    name: 'vcmute',
    category: 'Voice',
    description: 'Bulk server-mute all members in a specific voice channel.',
    usage: 'r!vcmute [#voice-channel | channel_id]',
    aliases: ['massmute', 'voicemute', 'vcm'],
    cooldownSeconds: 3,
    examples: ['r!vcmute', 'r!vcmute #Gaming-VC', 'r!vcmute 123456789012345678'],
    moduleOwnerId: 'voice_manager',
    dangerLevel: 'Medium',
    execute: async (message: Message, args: string[], context?: any) => {
      if (!message.guild) return;
      const authorMember = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
      if (!authorMember?.permissions.has(PermissionFlagsBits.MuteMembers) && !authorMember?.permissions.has(PermissionFlagsBits.MoveMembers)) {
        const permEmbed = new EmbedBuilder()
          .setColor(Colors.DANGER)
          .setTitle(`${SHIELD_ICON} Permission Denied`)
          .setDescription(`You require \`Mute Members\` or \`Move Members\` permission to execute bulk voice mute.\n\n> ${INFO_ICON} **Required Permissions**: \`MUTE_MEMBERS\` / \`MOVE_MEMBERS\``)
          .setFooter({ text: BRAND_FOOTER });
        return message.reply({ embeds: [permEmbed] });
      }

      let targetChannel: any = null;

      // 1. Prioritize explicit channel argument (mention, ID, or name) if provided
      if (args[0] || message.mentions.channels.size > 0) {
        const channelIdRaw = args[0]?.replace(/[<#>]*/g, '').trim();
        const mentionedChannel = message.mentions.channels.first();
        if (mentionedChannel && mentionedChannel.isVoiceBased()) {
          targetChannel = mentionedChannel;
        } else if (args[0]) {
          const found = message.guild.channels.cache.get(args[0]) || 
                        message.guild.channels.cache.get(channelIdRaw) || 
                        message.guild.channels.cache.find((c: any) => c.isVoiceBased() && c.name.toLowerCase() === args.slice(0).join(' ').toLowerCase());
          if (found && found.isVoiceBased()) targetChannel = found;
        }
      }

      // 2. Fallback to user's active Voice Channel if no target argument was provided
      const authorVoiceState = message.guild.voiceStates?.cache?.get(message.author.id);
      const authorConnectedChannelId = authorMember?.voice?.channelId || authorVoiceState?.channelId;

      // If a specific channel was provided via argument:
      // ONLY Server Owner and Extra Owners can lock a channel they are not currently inside.
      if (args[0] && !args[0].startsWith('--')) {
        const isOwnerOrExtra = await isOwnerOrExtraOwner(message.author.id, message.guild).catch(() => false);
        if (!isOwnerOrExtra) {
          const deniedEmbed = new EmbedBuilder()
            .setColor(Colors.DANGER)
            .setTitle(`${SHIELD_ICON} Access Denied`)
            .setDescription(`Locking a remote voice channel is restricted to the **Server Owner** and **Extra Owners**.\n\n> To lock a channel, connect directly to that voice channel and type \`r!vclock\`.`)
            .setFooter({ text: BRAND_FOOTER });
          return message.reply({ embeds: [deniedEmbed] });
        }
      }

      if (!targetChannel) {
        if (authorConnectedChannelId) {
          targetChannel = message.guild.channels.cache.get(authorConnectedChannelId);
        }
      }

      if (!targetChannel || !targetChannel.isVoiceBased()) {
        const noVcEmbed = new EmbedBuilder()
          .setColor(Colors.WARN)
          .setTitle(`${VOICE_ICON} Voice Channel Required`)
          .setDescription(`You are not currently connected to a voice channel.\n\n> ${ARROW_ICON} **Usage**: Join a voice channel or specify \`r!vcmute [#voice-channel | channel_id]\`.`)
          .setFooter({ text: BRAND_FOOTER });
        return message.reply({ embeds: [noVcEmbed] });
      }

      const members = Array.from(targetChannel.members.values()) as any[];
      if (members.length === 0) {
        const emptyEmbed = new EmbedBuilder()
          .setColor(Colors.INFO)
          .setTitle(`${MEMBER_ICON} Voice Channel Empty`)
          .setDescription(`No connected members were found in ${targetChannel}.\n\n> ${INFO_ICON} Join or move members into the channel first.`)
          .setFooter({ text: BRAND_FOOTER });
        return message.reply({ embeds: [emptyEmbed] });
      }

      let count = 0;
      for (const member of members) {
        await member.voice.setMute(true, `Bulk Voice Mute by @${message.author.tag}`).then(() => count++).catch(() => {});
      }

      context?.logSyncEvent?.(`[Voice Manager] ${message.author.tag} bulk-muted ${count} members in #${targetChannel.name}`, 'info');

      const successEmbed = new EmbedBuilder()
        .setColor(Colors.LIME)
        .setTitle(`${VERIFIED_ICON} Voice Bulk Action Executed`)
        .setDescription([
          `> **Action**: \`Server Muted\``,
          `> **Voice Channel**: ${targetChannel} (\`#${targetChannel.name}\`)`,
          `> **Affected Members**: **${count}** users`,
          `> **Executed By**: <@${message.author.id}>`
        ].join('\n'))
        .setFooter({ text: BRAND_FOOTER })
        .setTimestamp();

      return message.reply({ embeds: [successEmbed] });
    }
  });

  // Prefix Command: r!vcunmute
  PrefixRegistry.register({
    name: 'vcunmute',
    category: 'Voice',
    description: 'Bulk server-unmute all members in a specific voice channel.',
    usage: 'r!vcunmute [#voice-channel | channel_id]',
    aliases: ['massunmute', 'voiceunmute', 'vcum'],
    cooldownSeconds: 3,
    examples: ['r!vcunmute', 'r!vcunmute #Gaming-VC', 'r!vcunmute 123456789012345678'],
    moduleOwnerId: 'voice_manager',
    dangerLevel: 'Low',
    execute: async (message: Message, args: string[], context?: any) => {
      if (!message.guild) return;
      const authorMember = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
      if (!authorMember?.permissions.has(PermissionFlagsBits.MuteMembers) && !authorMember?.permissions.has(PermissionFlagsBits.MoveMembers)) {
        const permEmbed = new EmbedBuilder()
          .setColor(Colors.DANGER)
          .setTitle(`${SHIELD_ICON} Permission Denied`)
          .setDescription(`You require \`Mute Members\` or \`Move Members\` permission to execute bulk voice unmute.\n\n> ${INFO_ICON} **Required Permissions**: \`MUTE_MEMBERS\` / \`MOVE_MEMBERS\``)
          .setFooter({ text: BRAND_FOOTER });
        return message.reply({ embeds: [permEmbed] });
      }

      let targetChannel: any = null;

      if (args[0] || message.mentions.channels.size > 0) {
        const channelIdRaw = args[0]?.replace(/[<#>]*/g, '').trim();
        const mentionedChannel = message.mentions.channels.first();
        if (mentionedChannel && mentionedChannel.isVoiceBased()) {
          targetChannel = mentionedChannel;
        } else if (args[0]) {
          const found = message.guild.channels.cache.get(args[0]) || 
                        message.guild.channels.cache.get(channelIdRaw) || 
                        message.guild.channels.cache.find((c: any) => c.isVoiceBased() && c.name.toLowerCase() === args.slice(0).join(' ').toLowerCase());
          if (found && found.isVoiceBased()) targetChannel = found;
        }
      }

      const authorVoiceState = message.guild.voiceStates?.cache?.get(message.author.id);
      const authorConnectedChannelId = authorMember?.voice?.channelId || authorVoiceState?.channelId;

      // If a specific channel was provided via argument:
      // ONLY Server Owner and Extra Owners can lock a channel they are not currently inside.
      if (args[0] && !args[0].startsWith('--')) {
        const isOwnerOrExtra = await isOwnerOrExtraOwner(message.author.id, message.guild).catch(() => false);
        if (!isOwnerOrExtra) {
          const deniedEmbed = new EmbedBuilder()
            .setColor(Colors.DANGER)
            .setTitle(`${SHIELD_ICON} Access Denied`)
            .setDescription(`Locking a remote voice channel is restricted to the **Server Owner** and **Extra Owners**.\n\n> To lock a channel, connect directly to that voice channel and type \`r!vclock\`.`)
            .setFooter({ text: BRAND_FOOTER });
          return message.reply({ embeds: [deniedEmbed] });
        }
      }

      if (!targetChannel) {
        if (authorConnectedChannelId) {
          targetChannel = message.guild.channels.cache.get(authorConnectedChannelId);
        }
      }

      if (!targetChannel || !targetChannel.isVoiceBased()) {
        const noVcEmbed = new EmbedBuilder()
          .setColor(Colors.WARN)
          .setTitle(`${VOICE_ICON} Voice Channel Required`)
          .setDescription(`You are not currently connected to a voice channel.\n\n> ${ARROW_ICON} **Usage**: Join a voice channel or specify \`r!vcunmute [#voice-channel | channel_id]\`.`)
          .setFooter({ text: BRAND_FOOTER });
        return message.reply({ embeds: [noVcEmbed] });
      }

      const members = Array.from(targetChannel.members.values()) as any[];
      if (members.length === 0) {
        const emptyEmbed = new EmbedBuilder()
          .setColor(Colors.INFO)
          .setTitle(`${MEMBER_ICON} Voice Channel Empty`)
          .setDescription(`No connected members were found in ${targetChannel}.\n\n> ${INFO_ICON} Join or move members into the channel first.`)
          .setFooter({ text: BRAND_FOOTER });
        return message.reply({ embeds: [emptyEmbed] });
      }

      let count = 0;
      for (const member of members) {
        await member.voice.setMute(false, `Bulk Voice Unmute by @${message.author.tag}`).then(() => count++).catch(() => {});
      }

      context?.logSyncEvent?.(`[Voice Manager] ${message.author.tag} bulk-unmuted ${count} members in #${targetChannel.name}`, 'info');

      const successEmbed = new EmbedBuilder()
        .setColor(Colors.LIME)
        .setTitle(`${VERIFIED_ICON} Voice Bulk Action Executed`)
        .setDescription([
          `> **Action**: \`Server Unmuted\``,
          `> **Voice Channel**: ${targetChannel} (\`#${targetChannel.name}\`)`,
          `> **Affected Members**: **${count}** users`,
          `> **Executed By**: <@${message.author.id}>`
        ].join('\n'))
        .setFooter({ text: BRAND_FOOTER })
        .setTimestamp();

      return message.reply({ embeds: [successEmbed] });
    }
  });

  // Prefix Command: r!vcdeafen
  PrefixRegistry.register({
    name: 'vcdeafen',
    category: 'Voice',
    description: 'Bulk server-deafen all members in a specific voice channel.',
    usage: 'r!vcdeafen [#voice-channel | channel_id]',
    aliases: ['massdeafen', 'voicedeafen', 'vcd'],
    cooldownSeconds: 3,
    examples: ['r!vcdeafen', 'r!vcdeafen #Gaming-VC', 'r!vcdeafen 123456789012345678'],
    moduleOwnerId: 'voice_manager',
    dangerLevel: 'Medium',
    execute: async (message: Message, args: string[], context?: any) => {
      if (!message.guild) return;
      const authorMember = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
      if (!authorMember?.permissions.has(PermissionFlagsBits.DeafenMembers) && !authorMember?.permissions.has(PermissionFlagsBits.MoveMembers)) {
        const permEmbed = new EmbedBuilder()
          .setColor(Colors.DANGER)
          .setTitle(`${SHIELD_ICON} Permission Denied`)
          .setDescription(`You require \`Deafen Members\` or \`Move Members\` permission to execute bulk voice deafen.\n\n> ${INFO_ICON} **Required Permissions**: \`DEAFEN_MEMBERS\` / \`MOVE_MEMBERS\``)
          .setFooter({ text: BRAND_FOOTER });
        return message.reply({ embeds: [permEmbed] });
      }

      let targetChannel: any = null;

      if (args[0] || message.mentions.channels.size > 0) {
        const channelIdRaw = args[0]?.replace(/[<#>]*/g, '').trim();
        const mentionedChannel = message.mentions.channels.first();
        if (mentionedChannel && mentionedChannel.isVoiceBased()) {
          targetChannel = mentionedChannel;
        } else if (args[0]) {
          const found = message.guild.channels.cache.get(args[0]) || 
                        message.guild.channels.cache.get(channelIdRaw) || 
                        message.guild.channels.cache.find((c: any) => c.isVoiceBased() && c.name.toLowerCase() === args.slice(0).join(' ').toLowerCase());
          if (found && found.isVoiceBased()) targetChannel = found;
        }
      }

      const authorVoiceState = message.guild.voiceStates?.cache?.get(message.author.id);
      const authorConnectedChannelId = authorMember?.voice?.channelId || authorVoiceState?.channelId;

      // If a specific channel was provided via argument:
      // ONLY Server Owner and Extra Owners can lock a channel they are not currently inside.
      if (args[0] && !args[0].startsWith('--')) {
        const isOwnerOrExtra = await isOwnerOrExtraOwner(message.author.id, message.guild).catch(() => false);
        if (!isOwnerOrExtra) {
          const deniedEmbed = new EmbedBuilder()
            .setColor(Colors.DANGER)
            .setTitle(`${SHIELD_ICON} Access Denied`)
            .setDescription(`Locking a remote voice channel is restricted to the **Server Owner** and **Extra Owners**.\n\n> To lock a channel, connect directly to that voice channel and type \`r!vclock\`.`)
            .setFooter({ text: BRAND_FOOTER });
          return message.reply({ embeds: [deniedEmbed] });
        }
      }

      if (!targetChannel) {
        if (authorConnectedChannelId) {
          targetChannel = message.guild.channels.cache.get(authorConnectedChannelId);
        }
      }

      if (!targetChannel || !targetChannel.isVoiceBased()) {
        const noVcEmbed = new EmbedBuilder()
          .setColor(Colors.WARN)
          .setTitle(`${VOICE_ICON} Voice Channel Required`)
          .setDescription(`You are not currently connected to a voice channel.\n\n> ${ARROW_ICON} **Usage**: Join a voice channel or specify \`r!vcdeafen [#voice-channel | channel_id]\`.`)
          .setFooter({ text: BRAND_FOOTER });
        return message.reply({ embeds: [noVcEmbed] });
      }

      const members = Array.from(targetChannel.members.values()) as any[];
      if (members.length === 0) {
        const emptyEmbed = new EmbedBuilder()
          .setColor(Colors.INFO)
          .setTitle(`${MEMBER_ICON} Voice Channel Empty`)
          .setDescription(`No connected members were found in ${targetChannel}.\n\n> ${INFO_ICON} Join or move members into the channel first.`)
          .setFooter({ text: BRAND_FOOTER });
        return message.reply({ embeds: [emptyEmbed] });
      }

      let count = 0;
      for (const member of members) {
        await member.voice.setDeaf(true, `Bulk Voice Deafen by @${message.author.tag}`).then(() => count++).catch(() => {});
      }

      context?.logSyncEvent?.(`[Voice Manager] ${message.author.tag} bulk-deafened ${count} members in #${targetChannel.name}`, 'info');

      const successEmbed = new EmbedBuilder()
        .setColor(Colors.LIME)
        .setTitle(`${VERIFIED_ICON} Voice Bulk Action Executed`)
        .setDescription([
          `> **Action**: \`Server Deafened\``,
          `> **Voice Channel**: ${targetChannel} (\`#${targetChannel.name}\`)`,
          `> **Affected Members**: **${count}** users`,
          `> **Executed By**: <@${message.author.id}>`
        ].join('\n'))
        .setFooter({ text: BRAND_FOOTER })
        .setTimestamp();

      return message.reply({ embeds: [successEmbed] });
    }
  });

  // Prefix Command: r!vcundeafen
  PrefixRegistry.register({
    name: 'vcundeafen',
    category: 'Voice',
    description: 'Bulk server-undeafen all members in a specific voice channel.',
    usage: 'r!vcundeafen [#voice-channel | channel_id]',
    aliases: ['massundeafen', 'voiceundeafen', 'vcud'],
    cooldownSeconds: 3,
    examples: ['r!vcundeafen', 'r!vcundeafen #Gaming-VC', 'r!vcundeafen 123456789012345678'],
    moduleOwnerId: 'voice_manager',
    dangerLevel: 'Low',
    execute: async (message: Message, args: string[], context?: any) => {
      if (!message.guild) return;
      const authorMember = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
      if (!authorMember?.permissions.has(PermissionFlagsBits.DeafenMembers) && !authorMember?.permissions.has(PermissionFlagsBits.MoveMembers)) {
        const permEmbed = new EmbedBuilder()
          .setColor(Colors.DANGER)
          .setTitle(`${SHIELD_ICON} Permission Denied`)
          .setDescription(`You require \`Deafen Members\` or \`Move Members\` permission to execute bulk voice undeafen.\n\n> ${INFO_ICON} **Required Permissions**: \`DEAFEN_MEMBERS\` / \`MOVE_MEMBERS\``)
          .setFooter({ text: BRAND_FOOTER });
        return message.reply({ embeds: [permEmbed] });
      }

      let targetChannel: any = null;

      if (args[0] || message.mentions.channels.size > 0) {
        const channelIdRaw = args[0]?.replace(/[<#>]*/g, '').trim();
        const mentionedChannel = message.mentions.channels.first();
        if (mentionedChannel && mentionedChannel.isVoiceBased()) {
          targetChannel = mentionedChannel;
        } else if (args[0]) {
          const found = message.guild.channels.cache.get(args[0]) || 
                        message.guild.channels.cache.get(channelIdRaw) || 
                        message.guild.channels.cache.find((c: any) => c.isVoiceBased() && c.name.toLowerCase() === args.slice(0).join(' ').toLowerCase());
          if (found && found.isVoiceBased()) targetChannel = found;
        }
      }

      const authorVoiceState = message.guild.voiceStates?.cache?.get(message.author.id);
      const authorConnectedChannelId = authorMember?.voice?.channelId || authorVoiceState?.channelId;

      // If a specific channel was provided via argument:
      // ONLY Server Owner and Extra Owners can lock a channel they are not currently inside.
      if (args[0] && !args[0].startsWith('--')) {
        const isOwnerOrExtra = await isOwnerOrExtraOwner(message.author.id, message.guild).catch(() => false);
        if (!isOwnerOrExtra) {
          const deniedEmbed = new EmbedBuilder()
            .setColor(Colors.DANGER)
            .setTitle(`${SHIELD_ICON} Access Denied`)
            .setDescription(`Locking a remote voice channel is restricted to the **Server Owner** and **Extra Owners**.\n\n> To lock a channel, connect directly to that voice channel and type \`r!vclock\`.`)
            .setFooter({ text: BRAND_FOOTER });
          return message.reply({ embeds: [deniedEmbed] });
        }
      }

      if (!targetChannel) {
        if (authorConnectedChannelId) {
          targetChannel = message.guild.channels.cache.get(authorConnectedChannelId);
        }
      }

      if (!targetChannel || !targetChannel.isVoiceBased()) {
        const noVcEmbed = new EmbedBuilder()
          .setColor(Colors.WARN)
          .setTitle(`${VOICE_ICON} Voice Channel Required`)
          .setDescription(`You are not currently connected to a voice channel.\n\n> ${ARROW_ICON} **Usage**: Join a voice channel or specify \`r!vcundeafen [#voice-channel | channel_id]\`.`)
          .setFooter({ text: BRAND_FOOTER });
        return message.reply({ embeds: [noVcEmbed] });
      }

      const members = Array.from(targetChannel.members.values()) as any[];
      if (members.length === 0) {
        const emptyEmbed = new EmbedBuilder()
          .setColor(Colors.INFO)
          .setTitle(`${MEMBER_ICON} Voice Channel Empty`)
          .setDescription(`No connected members were found in ${targetChannel}.\n\n> ${INFO_ICON} Join or move members into the channel first.`)
          .setFooter({ text: BRAND_FOOTER });
        return message.reply({ embeds: [emptyEmbed] });
      }

      let count = 0;
      for (const member of members) {
        await member.voice.setDeaf(false, `Bulk Voice Undeafen by @${message.author.tag}`).then(() => count++).catch(() => {});
      }

      context?.logSyncEvent?.(`[Voice Manager] ${message.author.tag} bulk-undeafened ${count} members in #${targetChannel.name}`, 'info');

      const successEmbed = new EmbedBuilder()
        .setColor(Colors.LIME)
        .setTitle(`${VERIFIED_ICON} Voice Bulk Action Executed`)
        .setDescription([
          `> **Action**: \`Server Undeafened\``,
          `> **Voice Channel**: ${targetChannel} (\`#${targetChannel.name}\`)`,
          `> **Affected Members**: **${count}** users`,
          `> **Executed By**: <@${message.author.id}>`
        ].join('\n'))
        .setFooter({ text: BRAND_FOOTER })
        .setTimestamp();

      return message.reply({ embeds: [successEmbed] });
    }
  });

  // Prefix Command: r!vclock
  PrefixRegistry.register({
    name: 'vclock',
    category: 'Voice',
    description: 'Lock a voice channel to prevent new members from connecting.',
    usage: 'r!vclock [#voice-channel | channel_id] [--private]',
    aliases: ['lockvc', 'voicelock', 'vc-lock'],
    cooldownSeconds: 3,
    examples: ['r!vclock', 'r!vclock #Gaming-VC', 'r!vclock --private', 'r!vclock 123456789012345678'],
    moduleOwnerId: 'voice_manager',
    dangerLevel: 'Low',
    execute: async (message: Message, args: string[], context?: any) => {
      if (!message.guild) return;
      const authorMember = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
      const isOwner = message.guild.ownerId === message.author.id;
      const hasPerm = isOwner ||
        Boolean(authorMember?.permissions?.has(PermissionFlagsBits.ManageChannels)) ||
        Boolean(authorMember?.permissions?.has(PermissionFlagsBits.MoveMembers)) ||
        Boolean(authorMember?.permissions?.has(PermissionFlagsBits.Administrator));

      if (!hasPerm) {
        const permEmbed = new EmbedBuilder()
          .setColor(Colors.DANGER)
          .setTitle(`${SHIELD_ICON} Permission Denied`)
          .setDescription(`You require \`Manage Channels\` or \`Move Members\` permission to lock voice channels.\n\n> ${INFO_ICON} **Required Permissions**: \`MANAGE_CHANNELS\` / \`MOVE_MEMBERS\``)
          .setFooter({ text: BRAND_FOOTER });
        return message.reply({ embeds: [permEmbed] });
      }

      let targetChannel: any = null;

      if (args[0] || message.mentions.channels.size > 0) {
        const channelIdRaw = args[0]?.replace(/[<#>]*/g, '').trim();
        const mentionedChannel = message.mentions.channels.first();
        if (mentionedChannel && mentionedChannel.isVoiceBased()) {
          targetChannel = mentionedChannel;
        } else if (args[0] && !args[0].startsWith('--')) {
          const found = message.guild.channels.cache.get(args[0]) || 
                        message.guild.channels.cache.get(channelIdRaw) || 
                        message.guild.channels.cache.find((c: any) => c.isVoiceBased() && c.name.toLowerCase() === args.filter((a: any) => !a.startsWith('--')).join(' ').toLowerCase());
          if (found && found.isVoiceBased()) targetChannel = found;
        }
      }

      const authorVoiceState = message.guild.voiceStates?.cache?.get(message.author.id);
      const authorConnectedChannelId = authorMember?.voice?.channelId || authorVoiceState?.channelId;

      // If a specific channel was provided via argument:
      // ONLY Server Owner and Extra Owners can lock a channel they are not currently inside.
      if (args[0] && !args[0].startsWith('--')) {
        const isOwnerOrExtra = await isOwnerOrExtraOwner(message.author.id, message.guild).catch(() => false);
        if (!isOwnerOrExtra) {
          const deniedEmbed = new EmbedBuilder()
            .setColor(Colors.DANGER)
            .setTitle(`${SHIELD_ICON} Access Denied`)
            .setDescription(`Locking a remote voice channel is restricted to the **Server Owner** and **Extra Owners**.\n\n> To lock a channel, connect directly to that voice channel and type \`r!vclock\`.`)
            .setFooter({ text: BRAND_FOOTER });
          return message.reply({ embeds: [deniedEmbed] });
        }
      }

      if (!targetChannel) {
        if (authorConnectedChannelId) {
          targetChannel = message.guild.channels.cache.get(authorConnectedChannelId);
        }
      }

      if (!targetChannel || !targetChannel.isVoiceBased()) {
        const noVcEmbed = new EmbedBuilder()
          .setColor(Colors.WARN)
          .setTitle(`${VOICE_ICON} Voice Channel Required`)
          .setDescription(`You are not currently connected to a voice channel.\n\n> ${ARROW_ICON} **Usage**: Join a voice channel or specify \`r!vclock [#voice-channel | channel_id]\`.\n`)
          .setFooter({ text: BRAND_FOOTER });
        return message.reply({ embeds: [noVcEmbed] });
      }

      const makePrivate = args.some((a: any) => a.toLowerCase() === '--private' || a.toLowerCase() === '-p');
      const overwrites: any = {
        Connect: false,
        SendMessages: false,
        ViewChannel: makePrivate ? false : true
      };

      await targetChannel.permissionOverwrites.edit(message.guild.id, overwrites).catch(() => {});

      // Grant lock executor full connect + chat permissions
      await targetChannel.permissionOverwrites.edit(message.author.id, {
        Connect: true,
        SendMessages: true,
        ViewChannel: true
      }).catch(() => {});

      const session: VCLockSession = {
        channelId: targetChannel.id,
        guildId: message.guild.id,
        ownerId: message.author.id,
        lockedAt: Date.now(),
        addedUserIds: [],
        chatPermittedUserIds: [message.author.id]
      };
      VCLockControllerService.setSession(targetChannel.id, session);

      const botAvatar = message.client.user?.displayAvatarURL?.({ size: 512 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
      const guiPayload = VCLockControllerService.buildLockControllerPayload({
        channel: targetChannel,
        session,
        guild: message.guild,
        botAvatarUrl: botAvatar
      });

      const panelMsg = await (targetChannel as any).send(guiPayload).catch(() => null);
      if (panelMsg) session.panelMessageId = panelMsg.id;

      context?.logSyncEvent?.(`[Voice Manager] ${message.author.tag} locked voice channel #${targetChannel.name}`, 'warn');

      const successEmbed = new EmbedBuilder()
        .setColor(Colors.LIME)
        .setTitle(`${VERIFIED_ICON} Voice Channel Locked`)
        .setDescription([
          `> **Status**: \`Locked (No new joins permitted)\``,
          `> **Voice Channel**: ${targetChannel} (\`#${targetChannel.name}\`)`,
          `> **Privacy Mode**: ${makePrivate ? '\`Hidden (ViewChannel Denied)\`' : '\`Visible (Connect Denied)\`'}`,
          `> **Executed By**: <@${message.author.id}>`,
          `> **Controller**: Spawned Box UI Controller in VC chat.`
        ].join('\n'))
        .setFooter({ text: BRAND_FOOTER })
        .setTimestamp();

      return message.reply({ embeds: [successEmbed] });
    }
  });

  // Prefix Command: r!vcunlock
  PrefixRegistry.register({
    name: 'vcunlock',
    category: 'Voice',
    description: 'Unlock a voice channel allowing members to connect.',
    usage: 'r!vcunlock [#voice-channel | channel_id]',
    aliases: ['unlockvc', 'voiceunlock', 'vc-unlock'],
    cooldownSeconds: 3,
    examples: ['r!vcunlock', 'r!vcunlock #Gaming-VC', 'r!vcunlock 123456789012345678'],
    moduleOwnerId: 'voice_manager',
    dangerLevel: 'Low',
    execute: async (message: Message, args: string[], context?: any) => {
      if (!message.guild) return;
      const authorMember = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
      const isOwner = message.guild.ownerId === message.author.id;
      const hasPerm = isOwner ||
        Boolean(authorMember?.permissions?.has(PermissionFlagsBits.ManageChannels)) ||
        Boolean(authorMember?.permissions?.has(PermissionFlagsBits.MoveMembers)) ||
        Boolean(authorMember?.permissions?.has(PermissionFlagsBits.Administrator));

      if (!hasPerm) {
        const permEmbed = new EmbedBuilder()
          .setColor(Colors.DANGER)
          .setTitle(`${SHIELD_ICON} Permission Denied`)
          .setDescription(`You require \`Manage Channels\` or \`Move Members\` permission to unlock voice channels.\n\n> ${INFO_ICON} **Required Permissions**: \`MANAGE_CHANNELS\` / \`MOVE_MEMBERS\``)
          .setFooter({ text: BRAND_FOOTER });
        return message.reply({ embeds: [permEmbed] });
      }

      let targetChannel: any = null;

      if (args[0] || message.mentions.channels.size > 0) {
        const channelIdRaw = args[0]?.replace(/[<#>]*/g, '').trim();
        const mentionedChannel = message.mentions.channels.first();
        if (mentionedChannel && mentionedChannel.isVoiceBased()) {
          targetChannel = mentionedChannel;
        } else if (args[0]) {
          const found = message.guild.channels.cache.get(args[0]) || 
                        message.guild.channels.cache.get(channelIdRaw) || 
                        message.guild.channels.cache.find((c: any) => c.isVoiceBased() && c.name.toLowerCase() === args.slice(0).join(' ').toLowerCase());
          if (found && found.isVoiceBased()) targetChannel = found;
        }
      }

      const authorVoiceState = message.guild.voiceStates?.cache?.get(message.author.id);
      const authorConnectedChannelId = authorMember?.voice?.channelId || authorVoiceState?.channelId;

      // If a specific channel was provided via argument:
      // ONLY Server Owner and Extra Owners can lock a channel they are not currently inside.
      if (args[0] && !args[0].startsWith('--')) {
        const isOwnerOrExtra = await isOwnerOrExtraOwner(message.author.id, message.guild).catch(() => false);
        if (!isOwnerOrExtra) {
          const deniedEmbed = new EmbedBuilder()
            .setColor(Colors.DANGER)
            .setTitle(`${SHIELD_ICON} Access Denied`)
            .setDescription(`Locking a remote voice channel is restricted to the **Server Owner** and **Extra Owners**.\n\n> To lock a channel, connect directly to that voice channel and type \`r!vclock\`.`)
            .setFooter({ text: BRAND_FOOTER });
          return message.reply({ embeds: [deniedEmbed] });
        }
      }

      if (!targetChannel) {
        if (authorConnectedChannelId) {
          targetChannel = message.guild.channels.cache.get(authorConnectedChannelId);
        }
      }

      if (!targetChannel || !targetChannel.isVoiceBased()) {
        const noVcEmbed = new EmbedBuilder()
          .setColor(Colors.WARN)
          .setTitle(`${VOICE_ICON} Voice Channel Required`)
          .setDescription(`You are not currently connected to a voice channel.\n\n> ${ARROW_ICON} **Usage**: Join a voice channel or specify \`r!vcunlock [#voice-channel | channel_id]\`.\n`)
          .setFooter({ text: BRAND_FOOTER });
        return message.reply({ embeds: [noVcEmbed] });
      }

      const existingSession = VCLockControllerService.getSession(targetChannel.id);
      if (existingSession) {
        await VCLockControllerService.cleanupSessionOverwrites(targetChannel, existingSession);
        VCLockControllerService.deleteSession(targetChannel.id);
      }

      await targetChannel.permissionOverwrites.edit(message.guild.id, {
        ViewChannel: true,
        Connect: true,
        SendMessages: true
      }).catch(() => {});

      context?.logSyncEvent?.(`[Voice Manager] ${message.author.tag} unlocked voice channel #${targetChannel.name}`, 'info');

      const successEmbed = new EmbedBuilder()
        .setColor(Colors.LIME)
        .setTitle(`${VERIFIED_ICON} Voice Channel Unlocked`)
        .setDescription([
          `> **Status**: \`Unlocked (Public access restored)\``,
          `> **Voice Channel**: ${targetChannel} (\`#${targetChannel.name}\`)`,
          `> **Executed By**: <@${message.author.id}>`
        ].join('\n'))
        .setFooter({ text: BRAND_FOOTER })
        .setTimestamp();

      return message.reply({ embeds: [successEmbed] });
    }
  });

  // Prefix Command: r!vcstatus
  PrefixRegistry.register({
    name: 'vcstatus',
    category: 'Voice',
    description: 'Configure automated voice channel status when empty.',
    usage: 'r!vcstatus <set|remove|list|reset|clear> [#voice-channel] [status text]',
    aliases: ['autovcstatus', 'setvcstatus', 'voicestatus'],
    cooldownSeconds: 3,
    examples: [
      'r!vcstatus set #General ✨ Playing Under Stars 🦋',
      'r!vcstatus set ✨ Playing Under Stars 🦋',
      'r!vcstatus remove #General',
      'r!vcstatus list',
      'r!vcstatus reset #General',
      'r!vcstatus clear #General'
    ],
    moduleOwnerId: 'voice_manager',
    dangerLevel: 'Low',
    execute: async (message: Message, args: string[], context?: any) => {
      if (!message.guild) return;
      const authorMember = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
      const hasPerm = authorMember?.permissions.has(PermissionFlagsBits.ManageChannels) ||
                      authorMember?.permissions.has(PermissionFlagsBits.Administrator) ||
                      message.author.id === message.guild.ownerId;
      if (!hasPerm) {
        const permEmbed = new EmbedBuilder()
          .setColor(Colors.DANGER)
          .setTitle(`${SHIELD_ICON} Permission Denied`)
          .setDescription(`You require \`Manage Channels\` or \`Administrator\` permission to configure automated Voice Channel statuses.\n\n> ${INFO_ICON} **Required Permissions**: \`MANAGE_CHANNELS\` or \`ADMINISTRATOR\``)
          .setFooter({ text: BRAND_FOOTER });
        return message.reply({ embeds: [permEmbed] });
      }

      const guildId = message.guild.id;
      const config = getVoiceStatusConfig(context, guildId);
      const action = (args[0] || '').toLowerCase();

      // HELPER: Resolve channel from args or fallback to author's active VC
      const resolveChannelAndStatus = () => {
        let targetChannel: any = null;
        let statusStartIndex = 1;

        if (args[1] || message.mentions.channels.size > 0) {
          const mentioned = message.mentions.channels.first();
          if (mentioned && mentioned.isVoiceBased()) {
            targetChannel = mentioned;
            statusStartIndex = 2;
          } else if (args[1]) {
            const rawId = args[1].replace(/[<#>]/g, '');
            const found = message.guild!.channels.cache.get(rawId) ||
                          message.guild!.channels.cache.find((c: any) => c.isVoiceBased() && c.name.toLowerCase() === args[1].toLowerCase());
            if (found && found.isVoiceBased()) {
              targetChannel = found;
              statusStartIndex = 2;
            }
          }
        }

        if (!targetChannel) {
          const authorVoiceState = message.guild!.voiceStates?.cache?.get(message.author.id);
          const authorChannelId = authorMember?.voice?.channelId || authorVoiceState?.channelId;
          if (authorChannelId) {
            targetChannel = message.guild!.channels.cache.get(authorChannelId);
            statusStartIndex = 1;
          }
        }

        const statusText = args.slice(statusStartIndex).join(' ').trim();
        return { targetChannel, statusText };
      };

      // ── SUBCOMMAND: SET ──
      if (action === 'set') {
        const { targetChannel, statusText } = resolveChannelAndStatus();

        if (!targetChannel || !targetChannel.isVoiceBased()) {
          const noVcEmbed = new EmbedBuilder()
            .setColor(Colors.WARN)
            .setTitle(`${VOICE_ICON} Voice Channel Required`)
            .setDescription(`Please specify a voice channel or join one.\n\n> ${ARROW_ICON} **Usage**: \`r!vcstatus set [#voice-channel] <status text>\`\n> **Example**: \`r!vcstatus set #General ✨ Playing Under Stars 🦋\``)
            .setFooter({ text: BRAND_FOOTER });
          return message.reply({ embeds: [noVcEmbed] });
        }

        if (!statusText) {
          const noStatusEmbed = new EmbedBuilder()
            .setColor(Colors.WARN)
            .setTitle(`${INFO_ICON} Status Text Required`)
            .setDescription(`Please provide the status message to display when the channel is empty.\n\n> ${ARROW_ICON} **Example**: \`r!vcstatus set ${targetChannel} ✨ Playing Under Stars 🦋\``)
            .setFooter({ text: BRAND_FOOTER });
          return message.reply({ embeds: [noStatusEmbed] });
        }

        const existingIndex = config.channels.findIndex(c => c.channelId === targetChannel.id);
        const channelObj: IVoiceStatusTarget = {
          channelId: targetChannel.id,
          defaultStatus: statusText,
          enabled: true,
          createdAt: existingIndex >= 0 ? config.channels[existingIndex].createdAt : Date.now(),
          lastUpdated: Date.now()
        };

        if (existingIndex >= 0) {
          config.channels[existingIndex] = channelObj;
        } else {
          config.channels.push(channelObj);
        }

        await saveVoiceStatusConfig(context, guildId, config);

        const humanCount = getHumanMemberCount(targetChannel);
        let appliedNow = false;
        let applyError = '';

        if (humanCount === 0) {
          const res = await setVoiceChannelStatus(targetChannel, statusText);
          appliedNow = res.success;
          if (!res.success) applyError = res.error || '';
        }

        const embed = new EmbedBuilder()
          .setColor(Colors.LIME)
          .setTitle(`${VERIFIED_ICON} Voice Channel Auto-Status Configured`)
          .setDescription([
            `> **Status**: \`Configured & Active\``,
            `> **Voice Channel**: ${targetChannel} (\`#${targetChannel.name}\`)`,
            `> **Default Status**: \`${statusText}\``,
            `> **Current Occupants**: \`${humanCount} human member(s)\``,
            `> **Behavior**: ${appliedNow ? '`Applied Immediately (Channel Empty)`' : humanCount > 0 ? '`Saved (Will apply once all members leave)`' : '`Saved`'}`,
            `> **Smart Override**: If users set a custom status while inside, their custom status is preserved until the channel empties out.`
          ].join('\n'))
          .setFooter({ text: BRAND_FOOTER })
          .setTimestamp();

        if (applyError) {
          embed.addFields({
            name: '⚠️ Notice',
            value: `Could not apply status immediately: \`${applyError}\`.\nPlease ensure the bot has \`Set Voice Channel Status\` permission.`
          });
        }

        context?.logSyncEvent?.(`[Voice Manager] ${message.author.tag} configured auto-status for #${targetChannel.name}: "${statusText}"`, 'info');
        return message.reply({ embeds: [embed] });
      }

      // ── SUBCOMMAND: REMOVE / DELETE ──
      if (action === 'remove' || action === 'delete' || action === 'del') {
        const { targetChannel } = resolveChannelAndStatus();
        if (!targetChannel) {
          return message.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(Colors.WARN)
                .setTitle(`${VOICE_ICON} Voice Channel Required`)
                .setDescription(`Specify the channel to remove: \`r!vcstatus remove [#voice-channel]\`.`)
                .setFooter({ text: BRAND_FOOTER })
            ]
          });
        }

        const index = config.channels.findIndex(c => c.channelId === targetChannel.id);
        if (index !== -1) {
          config.channels.splice(index, 1);
          await saveVoiceStatusConfig(context, guildId, config);
        }

        // Clear voice status in Discord immediately and clear in-memory state
        await setVoiceChannelStatus(targetChannel, '');
        VoiceStatusState.clearPendingTimer(targetChannel.id);
        VoiceStatusState.setCurrentStatus(targetChannel.id, '');
        VoiceStatusState.setManualOverride(targetChannel.id, false);

        context?.logSyncEvent?.(`[Voice Manager] ${message.author.tag} removed auto-status for #${targetChannel.name}`, 'info');

        const embed = new EmbedBuilder()
          .setColor(Colors.LIME)
          .setTitle(`${VERIFIED_ICON} Auto-Status Removed & Cleared`)
          .setDescription(`Successfully removed auto-status monitoring and cleared the voice status from ${targetChannel}.\n\n> This channel will **not show that voice status anymore**.`)
          .setFooter({ text: BRAND_FOOTER })
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      }

      // ── SUBCOMMAND: LIST ──
      if (action === 'list') {
        if (config.channels.length === 0) {
          const emptyEmbed = new EmbedBuilder()
            .setColor(Colors.WARN)
            .setTitle(`${VOICE_ICON} Voice Channel Auto-Statuses`)
            .setDescription(`No voice channels are currently configured for auto-status.\n\n> ${ARROW_ICON} **Set One**: \`r!vcstatus set [#voice-channel] <status text>\``)
            .setFooter({ text: BRAND_FOOTER });
          return message.reply({ embeds: [emptyEmbed] });
        }

        const lines = config.channels.map((c, i) => {
          const ch = message.guild!.channels.cache.get(c.channelId);
          const name = ch ? `#${ch.name}` : `ID: ${c.channelId}`;
          const occupants = ch ? getHumanMemberCount(ch) : '?';
          return `**${i + 1}.** <#${c.channelId}> (\`${name}\`)\n> **Default Status**: \`${c.defaultStatus}\`\n> **Live Occupants**: \`${occupants} member(s)\` • **Active**: \`${c.enabled}\``;
        });

        const embed = new EmbedBuilder()
          .setColor(Colors.BRAND)
          .setTitle(`${VOICE_ICON} Configured Voice Channel Auto-Statuses`)
          .setDescription(lines.join('\n\n'))
          .setFooter({ text: BRAND_FOOTER })
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      }

      // ── SUBCOMMAND: RESET ──
      if (action === 'reset') {
        const { targetChannel, statusText } = resolveChannelAndStatus();
        if (!targetChannel) {
          return message.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(Colors.WARN)
                .setTitle(`${VOICE_ICON} Voice Channel Required`)
                .setDescription(`Specify the voice channel to reset: \`r!vcstatus reset [#voice-channel]\`\nTo completely remove and stop voice status: \`r!vcstatus reset [#voice-channel] clean\``)
                .setFooter({ text: BRAND_FOOTER })
            ]
          });
        }

        const isCleanRequest = statusText.toLowerCase() === 'clean' ||
                               statusText.toLowerCase() === 'clear' ||
                               statusText.toLowerCase() === 'none' ||
                               statusText.toLowerCase() === 'off' ||
                               statusText.toLowerCase() === 'remove';

        if (isCleanRequest) {
          const index = config.channels.findIndex(c => c.channelId === targetChannel.id);
          if (index !== -1) {
            config.channels.splice(index, 1);
            await saveVoiceStatusConfig(context, guildId, config);
          }

          await setVoiceChannelStatus(targetChannel, '');
          VoiceStatusState.clearPendingTimer(targetChannel.id);
          VoiceStatusState.setCurrentStatus(targetChannel.id, '');
          VoiceStatusState.setManualOverride(targetChannel.id, false);

          return message.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(Colors.LIME)
                .setTitle(`${VERIFIED_ICON} Voice Status Cleaned & Reset`)
                .setDescription(`Successfully reset and cleared voice status for ${targetChannel}.\n\n> Auto-status monitoring has been stopped. The channel will **not show that voice status anymore**.`)
                .setFooter({ text: BRAND_FOOTER })
                .setTimestamp()
            ]
          });
        }

        const targetConfig = config.channels.find(c => c.channelId === targetChannel.id);
        if (!targetConfig) {
          await setVoiceChannelStatus(targetChannel, '');
          VoiceStatusState.clearPendingTimer(targetChannel.id);
          VoiceStatusState.setCurrentStatus(targetChannel.id, '');
          VoiceStatusState.setManualOverride(targetChannel.id, false);

          return message.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(Colors.LIME)
                .setTitle(`${VERIFIED_ICON} Voice Status Cleared`)
                .setDescription(`${targetChannel} was not configured for auto-status, so any residual voice status text has been completely cleared.`)
                .setFooter({ text: BRAND_FOOTER })
                .setTimestamp()
            ]
          });
        }

        const res = await setVoiceChannelStatus(targetChannel, targetConfig.defaultStatus);
        if (!res.success) {
          return message.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(Colors.DANGER)
                .setTitle(`${WRONG_ICON} Failed to Set Voice Status`)
                .setDescription(`Error: \`${res.error}\`\nEnsure bot has \`Set Voice Channel Status\` permission.`)
                .setFooter({ text: BRAND_FOOTER })
            ]
          });
        }

        VoiceStatusState.setManualOverride(targetChannel.id, false);

        const embed = new EmbedBuilder()
          .setColor(Colors.LIME)
          .setTitle(`${VERIFIED_ICON} Voice Status Re-Applied`)
          .setDescription([
            `Successfully re-applied default status for ${targetChannel}:`,
            `> \`${targetConfig.defaultStatus}\``,
            '',
            `💡 **To remove status permanently so it NEVER shows again**:`,
            `> Run \`r!vcstatus clear ${targetChannel}\` or \`r!vcstatus reset ${targetChannel} clean\``
          ].join('\n'))
          .setFooter({ text: BRAND_FOOTER })
          .setTimestamp();

        return message.reply({ embeds: [embed] });
      }

      // ── SUBCOMMAND: CLEAR ──
      if (action === 'clear') {
        const { targetChannel } = resolveChannelAndStatus();
        if (!targetChannel) {
          return message.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(Colors.WARN)
                .setTitle(`${VOICE_ICON} Voice Channel Required`)
                .setDescription(`Specify the voice channel to clear: \`r!vcstatus clear [#voice-channel]\`.`)
                .setFooter({ text: BRAND_FOOTER })
            ]
          });
        }

        // 1. Remove from config so auto-status never re-applies it
        const index = config.channels.findIndex(c => c.channelId === targetChannel.id);
        if (index !== -1) {
          config.channels.splice(index, 1);
          await saveVoiceStatusConfig(context, guildId, config);
        }

        // 2. Clear from Discord
        const res = await setVoiceChannelStatus(targetChannel, '');
        VoiceStatusState.clearPendingTimer(targetChannel.id);
        VoiceStatusState.setCurrentStatus(targetChannel.id, '');
        VoiceStatusState.setManualOverride(targetChannel.id, false);

        if (!res.success) {
          return message.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(Colors.DANGER)
                .setTitle(`${WRONG_ICON} Failed to Clear Status`)
                .setDescription(`Error: \`${res.error}\``)
                .setFooter({ text: BRAND_FOOTER })
            ]
          });
        }

        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(Colors.LIME)
              .setTitle(`${VERIFIED_ICON} Voice Status Cleared`)
              .setDescription(`Successfully cleared voice status for ${targetChannel} and removed auto-status monitoring.\n\n> This channel will **not show that voice status anymore**.`)
              .setFooter({ text: BRAND_FOOTER })
              .setTimestamp()
          ]
        });
      }

      // ── DEFAULT: HELP & OVERVIEW ──
      const helpEmbed = new EmbedBuilder()
        .setColor(Colors.BRAND)
        .setTitle(`${VOICE_ICON} Voice Channel Auto-Status Management`)
        .setDescription([
          `> Automatically applies a preset status to a voice channel when there is no one inside, and preserves custom user statuses while users are active.`,
          '',
          `**Commands**:`,
          `• \`r!vcstatus set [#channel] <status text>\` — Configure default status applied when empty`,
          `• \`r!vcstatus remove [#channel]\` — Remove channel from auto-status monitoring`,
          `• \`r!vcstatus list\` — View all monitored voice channels & their live statuses`,
          `• \`r!vcstatus reset [#channel]\` — Force reset voice channel status immediately`,
          `• \`r!vcstatus clear [#channel]\` — Clear current voice channel status immediately`,
          '',
          `**Examples**:`,
          `\`r!vcstatus set #General ✨ Playing Under Stars 🦋\``,
          `\`r!vcstatus set Chill & Vibe 24/7\` *(uses your current VC)*`,
          `\`r!vcstatus list\``,
          `\`r!vcstatus reset #General\``,
          '',
          `> ${INFO_ICON} **Note**: The bot requires the \`Set Voice Channel Status\` permission in Discord.`
        ].join('\n'))
        .setFooter({ text: BRAND_FOOTER });

      return message.reply({ embeds: [helpEmbed] });
    }
  });

}

// Auto-register on import
registerVoiceManagerCommands();
