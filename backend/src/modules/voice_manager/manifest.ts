import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { PermissionFlagsBits, ChannelType, MessageFlags } from 'discord.js';
import { Colors, buildRichCard, buildListCard, buildStatusCard, buildSuccessCard, buildErrorCard, buildPermCard, MEMBER_ICON } from '../../core/UIFactory.js';

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
          description: 'Server-mute all members in a voice channel',
          type: 1,
          options: [{ name: 'channel', type: 7, description: 'Voice channel', required: true, channel_types: [2, 13] }]
        },
        {
          name: 'mass-unmute',
          description: 'Server-unmute all members in a voice channel',
          type: 1,
          options: [{ name: 'channel', type: 7, description: 'Voice channel', required: true, channel_types: [2, 13] }]
        },
        {
          name: 'mass-deafen',
          description: 'Server-deafen all members in a voice channel',
          type: 1,
          options: [{ name: 'channel', type: 7, description: 'Voice channel', required: true, channel_types: [2, 13] }]
        },
        {
          name: 'mass-undeafen',
          description: 'Server-undeafen all members in a voice channel',
          type: 1,
          options: [{ name: 'channel', type: 7, description: 'Voice channel', required: true, channel_types: [2, 13] }]
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
    }
  ],
  events: [
    {
      name: 'command_voice',
      handler: async (client: any, interaction: any, context: any) => {
        const sub = interaction.options.getSubcommand(false);
        const guild = interaction.guild;

        if (sub === 'move') {
          const { handleVoiceProtectionMoveCommand } = await import('../voice-protection/commands.js');
          return handleVoiceProtectionMoveCommand(client, interaction, context);
        }

        if (!interaction.memberPermissions?.has(PermissionFlagsBits.MoveMembers)) {
          return interaction.reply(buildPermCard('Move Members'));
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
          return interaction.editReply({ content: `<a:approved:1532390590707142956> Disconnected **${count}** members from ${channel}.` });
        }

        // MASS MUTE
        if (sub === 'mass-mute') {
          const channel = interaction.options.getChannel('channel');
          await interaction.deferReply({ flags: 64 });
          let count = 0;
          for (const [, member] of channel.members) {
            await member.voice.setMute(true, 'Mass mute').catch(() => {});
            count++;
          }
          logVoiceAction('Mass Mute', `${count} members in #${channel.name}`);
          return interaction.editReply({ content: `<a:approved:1532390590707142956> Server-muted **${count}** members in ${channel}.` });
        }

        // MASS UNMUTE
        if (sub === 'mass-unmute') {
          const channel = interaction.options.getChannel('channel');
          await interaction.deferReply({ flags: 64 });
          let count = 0;
          for (const [, member] of channel.members) {
            await member.voice.setMute(false, 'Mass unmute').catch(() => {});
            count++;
          }
          logVoiceAction('Mass Unmute', `${count} members in #${channel.name}`);
          return interaction.editReply({ content: `<a:approved:1532390590707142956> Server-unmuted **${count}** members in ${channel}.` });
        }

        // MASS DEAFEN
        if (sub === 'mass-deafen') {
          const channel = interaction.options.getChannel('channel');
          await interaction.deferReply({ flags: 64 });
          let count = 0;
          for (const [, member] of channel.members) {
            await member.voice.setDeaf(true, 'Mass deafen').catch(() => {});
            count++;
          }
          logVoiceAction('Mass Deafen', `${count} members in #${channel.name}`);
          return interaction.editReply({ content: `<a:approved:1532390590707142956> Server-deafened **${count}** members in ${channel}.` });
        }

        // MASS UNDEAFEN
        if (sub === 'mass-undeafen') {
          const channel = interaction.options.getChannel('channel');
          await interaction.deferReply({ flags: 64 });
          let count = 0;
          for (const [, member] of channel.members) {
            await member.voice.setDeaf(false, 'Mass undeafen').catch(() => {});
            count++;
          }
          logVoiceAction('Mass Undeafen', `${count} members in #${channel.name}`);
          return interaction.editReply({ content: `<a:approved:1532390590707142956> Server-undeafened **${count}** members in ${channel}.` });
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
          return interaction.editReply({ content: `<a:approved:1532390590707142956> Moved **${count}** members from ${from} → ${to}.` });
        }

        // FREEZE
        if (sub === 'freeze') {
          const channel = interaction.options.getChannel('channel');
          await channel.permissionOverwrites.edit(guild.id, { Connect: false });
          logVoiceAction('Freeze', `#${channel.name}`);
          return interaction.reply({ content: `<a:approved:1532390590707142956> Frozen ${channel}. No new users can join.`, flags: 64 });
        }

        // UNFREEZE
        if (sub === 'unfreeze') {
          const channel = interaction.options.getChannel('channel');
          await channel.permissionOverwrites.edit(guild.id, { Connect: null });
          logVoiceAction('Unfreeze', `#${channel.name}`);
          return interaction.reply({ content: `<a:approved:1532390590707142956> Unfrozen ${channel}. Users can now join.`, flags: 64 });
        }

        // LOCK
        if (sub === 'lock') {
          const channel = interaction.options.getChannel('channel');
          await channel.permissionOverwrites.edit(guild.id, { Connect: false });
          logVoiceAction('Lock', `#${channel.name}`);
          return interaction.reply({ content: `<:shield:1532403012751065179> Locked ${channel}.`, flags: 64 });
        }

        // UNLOCK
        if (sub === 'unlock') {
          const channel = interaction.options.getChannel('channel');
          await channel.permissionOverwrites.edit(guild.id, { Connect: null });
          logVoiceAction('Unlock', `#${channel.name}`);
          return interaction.reply({ content: `<a:approved:1532390590707142956> Unlocked ${channel}.`, flags: 64 });
        }

        // RENAME
        if (sub === 'rename') {
          const channel = interaction.options.getChannel('channel');
          const name = interaction.options.getString('name');
          await channel.setName(name);
          logVoiceAction('Rename', `#${channel.name} → ${name}`);
          return interaction.reply({ content: `<a:approved:1532390590707142956> Renamed channel to **${name}**.`, flags: 64 });
        }

        // LIMIT
        if (sub === 'limit') {
          const channel = interaction.options.getChannel('channel');
          const limit = interaction.options.getInteger('limit');
          if (channel.type !== ChannelType.GuildVoice) return interaction.reply({ content: '<:wrong:1532390628330307634> Not a voice channel.', flags: 64 });
          await channel.setUserLimit(limit);
          return interaction.reply({ content: `<a:approved:1532390590707142956> Set user limit to **${limit === 0 ? 'unlimited' : limit}** for ${channel}.`, flags: 64 });
        }

        // CLEANUP
        if (sub === 'cleanup') {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.reply({ content: '<:shield:1532403012751065179> Manage Channels permission required.', flags: 64 });
          }
          await interaction.deferReply({ flags: 64 });
          const voiceChannels = guild.channels.cache.filter((c: any) => c.type === ChannelType.GuildVoice && c.members.size === 0);
          let count = 0;
          for (const [, channel] of voiceChannels) {
            if (channel.id !== guild.afkChannelId) {
              await channel.delete('Voice Cleanup').catch(() => {});
              count++;
            }
          }
          logVoiceAction('Cleanup', `Deleted ${count} empty voice channels`);
          return interaction.editReply({ content: `<a:approved:1532390590707142956> Cleaned up **${count}** empty voice channels.` });
        }

        // PULL
        if (sub === 'pull') {
          const user = interaction.options.getUser('user');
          const member = guild.members.cache.get(user.id);
          if (!member) return interaction.reply({ content: '<:wrong:1532390628330307634> Member not found.', flags: 64 });
          if (!interaction.member.voice?.channel) return interaction.reply({ content: '<:wrong:1532390628330307634> You must be in a voice channel.', flags: 64 });
          if (!member.voice?.channel) return interaction.reply({ content: `<:wrong:1532390628330307634> ${user.username} is not in a voice channel.`, flags: 64 });
          await member.voice.setChannel(interaction.member.voice.channel);
          logVoiceAction('Pull', `${user.username} → #${interaction.member.voice.channel.name}`);
          return interaction.reply({ content: `<a:approved:1532390590707142956> Pulled ${user} to your channel.`, flags: 64 });
        }

        // INFO
        if (sub === 'info') {
          const channel = interaction.options.getChannel('channel') || interaction.member.voice?.channel;
          if (!channel) return interaction.reply({ content: '<:wrong:1532390628330307634> No voice channel specified or you\'re not in one.', flags: 64 });

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
          if (voiceChannels.size === 0) return interaction.reply({ content: '<:information:1532621274092929124> No active voice channels right now.', flags: 64 });

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
          return interaction.editReply({ content: `<a:approved:1532390590707142956> Split **${moved}** members: **${half}** → ${group1}, **${members.length - half}** → ${group2}.` });
        }

        // DRAG
        if (sub === 'drag') {
          const user = interaction.options.getUser('user');
          const channel = interaction.options.getChannel('channel');
          const member = guild.members.cache.get(user.id);
          if (!member || !member.voice?.channel) {
            return interaction.reply({ content: '<:wrong:1532390628330307634> User is not currently in a voice channel.', flags: 64 });
          }
          await member.voice.setChannel(channel);
          logVoiceAction('Drag', `Moved ${user.username} to #${channel.name}`);
          return interaction.reply({ content: `<a:approved:1532390590707142956> Successfully dragged ${user} to ${channel}.`, flags: 64 });
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
          return interaction.editReply({ content: `<a:approved:1532390590707142956> Successfully mass-dragged **${count}** members from ${from} to ${to}.` });
        }

        // PULLALL
        if (sub === 'pullall') {
          const from = interaction.options.getChannel('from');
          const to = interaction.member.voice?.channel;
          if (!to) return interaction.reply({ content: '<:wrong:1532390628330307634> You must be in a voice channel to pull members.', flags: 64 });
          await interaction.deferReply({ flags: 64 });
          let count = 0;
          for (const [, member] of from.members) {
            await member.voice.setChannel(to).catch(() => {});
            count++;
            await new Promise(r => setTimeout(r, 150));
          }
          logVoiceAction('Pull All', `Pulled ${count} members to #${to.name}`);
          return interaction.editReply({ content: `<a:approved:1532390590707142956> Pulled **${count}** members from ${from} to your channel.` });
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
          return interaction.editReply({ content: `<a:approved:1532390590707142956> Swapped **${count}** members between ${channel1} and ${channel2}.` });
        }

        // DISCONNECT
        if (sub === 'disconnect') {
          const user = interaction.options.getUser('user');
          const reason = interaction.options.getString('reason') || 'Voice disconnect';
          const member = guild.members.cache.get(user.id);
          if (!member || !member.voice?.channel) {
            return interaction.reply({ content: '<:wrong:1532390628330307634> User is not currently in a voice channel.', flags: 64 });
          }
          await member.voice.disconnect(reason).catch(() => {});
          logVoiceAction('Disconnect', `Disconnected ${user.username} from voice`);
          return interaction.editReply({ content: `<a:approved:1532390590707142956> Disconnected ${user} from voice.` });
        }

        // CLEAN
        if (sub === 'clean') {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.reply({ content: '<:shield:1532403012751065179> Manage Channels permission required.', flags: 64 });
          }
          await interaction.deferReply({ flags: 64 });
          const voiceChannels = guild.channels.cache.filter((c: any) => c.type === ChannelType.GuildVoice && c.members.size === 0);
          let count = 0;
          for (const [, channel] of voiceChannels) {
            if (channel.id !== guild.afkChannelId) {
              await channel.delete('Voice Cleanup').catch(() => {});
              count++;
            }
          }
          logVoiceAction('Cleanup', `Deleted ${count} empty VCs`);
          return interaction.editReply({ content: `<a:approved:1532390590707142956> Cleaned up **${count}** empty voice channels.` });
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
          return interaction.reply({ content: '<:information:1532621274092929124> **Voice Connections History**:\nNo historical connection data has been recorded in the local log stream.', flags: 64 });
        }
      }
    }
  ]
};
