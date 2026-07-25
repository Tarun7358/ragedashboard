import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { EmbedBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { IJoinToCreate } from '../../models/index.js';

// ─── Privacy helper ──────────────────────────────────────────────────────────
// Builds Discord permissionOverwrites for each privacy mode:
//   public    – no restrictions; owner gets ManageChannels
//   private   – visible but Connect denied for @everyone; owner + invites can join
//   locked    – visible but fully locked (Connect denied); only owner
//   invisible – hidden from channel list (ViewChannel denied); only owner sees it
//   stage     – public visibility but Speak denied; owner can unmute (like a stage)
function buildPrivacyOverwrites(privacy: string, guildId: string, memberId: string): any[] {
  const owner = [PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Speak];
  switch (privacy) {
    case 'private':
      return [
        { id: guildId, deny: [PermissionFlagsBits.Connect] },
        { id: memberId, allow: owner }
      ];
    case 'locked':
      return [
        { id: guildId, deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel] },
        { id: memberId, allow: owner }
      ];
    case 'invisible':
      return [
        { id: guildId, deny: [PermissionFlagsBits.ViewChannel] },
        { id: memberId, allow: owner }
      ];
    case 'stage':
      return [
        { id: guildId, deny: [PermissionFlagsBits.Speak], allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel] },
        { id: memberId, allow: [...owner, PermissionFlagsBits.MuteMembers, PermissionFlagsBits.DeafenMembers] }
      ];
    case 'sync':
      return [
        { id: memberId, allow: owner }
      ];
    case 'public':
    default:
      return [
        { id: memberId, allow: [PermissionFlagsBits.ManageChannels] }
      ];
  }
}

export const JoinToCreateManifest: ModuleManifest = {
  id: 'join_to_create',
  name: 'Join To Create',
  version: '1.0.0',
  description: 'Auto-create private voice channels when a user joins a trigger channel. Full owner controls.',
  configSchema: {
    requiredFields: [],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      const errors: string[] = [];
      let progress = 0;

      // Support new triggers array + legacy single triggerChannelId
      const triggers: any[] = config.triggers || [];
      const allTriggerIds: string[] = [
        ...triggers.map((t: any) => t.triggerChannelId),
        config.triggerChannelId
      ].filter(Boolean);

      if (allTriggerIds.length > 0) {
        progress += 100;
        if (registry?.channels) {
          for (const tid of allTriggerIds) {
            if (!registry.channels.some(c => c.id === tid)) {
              errors.push(`JTC trigger channel (${tid}) was deleted or is invalid.`);
            }
          }
        }
      } else {
        // Last resort: auto-detect by channel name
        const found = registry?.channels?.find(c => c.type === 'voice' && c.name.toLowerCase().includes('join to create'));
        if (found) { progress += 100; }
        else { errors.push('No JTC trigger channels configured. Add one from the dashboard or run /jtc setup.'); }
      }
      return { progress, errors };
    }
  },
  commands: [
    {
      name: 'jtc',
      description: 'Join To Create management',
      options: [
        {
          name: 'setup',
          description: 'Add or update a JTC trigger channel',
          type: 1,
          options: [
            { name: 'channel', type: 7, description: 'The voice channel users join to create', required: true, channel_types: [2, 13] },
            { name: 'label', type: 3, description: 'Friendly name for this trigger (e.g. Gaming, Chill)', required: false },
            { name: 'category', type: 7, description: 'Category to spawn new channels in', required: false, channel_types: [4] },
            { name: 'default_name', type: 3, description: 'Channel name template ({username}, {user}, {count})', required: false },
            { name: 'default_limit', type: 4, description: 'Default user limit (0 = unlimited)', required: false },
            { name: 'privacy', type: 3, description: 'Default privacy', required: false, choices: [
              { name: 'Public', value: 'public' },
              { name: 'Private', value: 'private' },
              { name: 'Locked', value: 'locked' },
              { name: 'Invisible', value: 'invisible' },
              { name: 'Stage', value: 'stage' },
              { name: 'Sync with Category', value: 'sync' }
            ] }
          ]
        },
        {
          name: 'remove',
          description: 'Remove a JTC trigger channel',
          type: 1,
          options: [{ name: 'channel', type: 7, description: 'The trigger channel to remove', required: true, channel_types: [2, 13] }]
        },
        {
          name: 'name',
          description: 'Rename your JTC channel',
          type: 1,
          options: [{ name: 'name', type: 3, description: 'New channel name', required: true }]
        },
        {
          name: 'limit',
          description: 'Set user limit for your JTC channel',
          type: 1,
          options: [{ name: 'limit', type: 4, description: 'User limit (0 = unlimited)', required: true }]
        },
        {
          name: 'lock',
          description: 'Lock your JTC channel',
          type: 1
        },
        {
          name: 'unlock',
          description: 'Unlock your JTC channel',
          type: 1
        },
        {
          name: 'transfer',
          description: 'Transfer ownership of your JTC channel',
          type: 1,
          options: [{ name: 'user', type: 6, description: 'New owner', required: true }]
        },
        {
          name: 'kick',
          description: 'Kick a user from your JTC channel',
          type: 1,
          options: [{ name: 'user', type: 6, description: 'User to kick', required: true }]
        },
        {
          name: 'invite',
          description: 'Invite a user to your private JTC channel',
          type: 1,
          options: [{ name: 'user', type: 6, description: 'User to invite', required: true }]
        },
        {
          name: 'info',
          description: 'View info about your JTC channel',
          type: 1
        },
        {
          name: 'list',
          description: 'List all active JTC channels',
          type: 1
        },
        {
          name: 'bitrate',
          description: 'Set the bitrate of your JTC channel',
          type: 1,
          options: [{ name: 'bitrate', type: 4, description: 'Bitrate in kbps (e.g. 64)', required: true }]
        },
        {
          name: 'region',
          description: 'Set the voice region for your JTC channel',
          type: 1,
          options: [{ name: 'region', type: 3, description: 'Region (e.g. us-west, europe)', required: true }]
        },
        {
          name: 'reset',
          description: 'Reset your JTC channel to defaults',
          type: 1
        },
        {
          name: 'hide',
          description: 'Hide your voice channel',
          type: 1
        },
        {
          name: 'unhide',
          description: 'Unhide your voice channel',
          type: 1
        },
        {
          name: 'permit',
          description: 'Permit a user to join your locked channel',
          type: 1,
          options: [{ name: 'user', type: 6, description: 'Target user', required: true }]
        },
        {
          name: 'reject',
          description: 'Reject/block a user from joining your channel',
          type: 1,
          options: [{ name: 'user', type: 6, description: 'Target user', required: true }]
        },
        {
          name: 'claim',
          description: 'Claim ownership of the JTC channel if owner left',
          type: 1
        }
      ]
    }
  ],
  events: [
    {
      name: 'command_jtc',
      handler: async (client: any, interaction: any, context: any) => {
        const sub = interaction.options.getSubcommand(false);
        const modules = context.getModulesState ? context.getModulesState() : [];
        const jtcMod = modules.find((m: any) => m.id === 'join_to_create');

        if (!jtcMod || jtcMod.status !== 'enabled') {
          return interaction.reply({ content: '❌ Join To Create module is not enabled.', flags: 64 });
        }

        const config: IJoinToCreate = jtcMod.config || {};
        const activeChannels: IJoinToCreate['activeChannels'] = config.activeChannels || [];
        const saveConfig = (updated: Partial<IJoinToCreate>) => context.updateModuleConfig('join_to_create', { ...config, ...updated });

        if (sub === 'setup') {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '🔒 Administrator permission required.', flags: 64 });
          }
          const channel = interaction.options.getChannel('channel');
          const category = interaction.options.getChannel('category');
          const defaultName = interaction.options.getString('default_name') || "{username}'s Channel";
          const defaultLimit = interaction.options.getInteger('default_limit') ?? 0;
          const privacy = interaction.options.getString('privacy') || 'public';
          const label = interaction.options.getString('label') || (channel as any).name;

          const existingTriggers: any[] = [...(config.triggers || [])];
          const existingIdx = existingTriggers.findIndex((t: any) => t.triggerChannelId === channel.id);
          const newTrigger = { id: `trigger_${channel.id}`, label, triggerChannelId: channel.id, categoryId: category?.id || null, defaultName, defaultLimit, privacy };

          if (existingIdx >= 0) { existingTriggers[existingIdx] = newTrigger; }
          else { existingTriggers.push(newTrigger); }

          saveConfig({
            id: config.id || `jtc_${interaction.guildId}`,
            guildId: interaction.guildId,
            triggers: existingTriggers,
            allowOwnerRename: config.allowOwnerRename ?? true,
            allowOwnerLimit: config.allowOwnerLimit ?? true,
            allowOwnerLock: config.allowOwnerLock ?? true,
            activeChannels: config.activeChannels || [],
            createdAt: config.createdAt || new Date()
          });

          context.logSyncEvent(`[JTC] Trigger ${existingIdx >= 0 ? 'updated' : 'added'}: #${(channel as any).name} (${existingTriggers.length} total).`, 'success');
          return interaction.reply({ content: `✅ **JTC Trigger ${existingIdx >= 0 ? 'Updated' : 'Added'}!**\n- **Channel:** ${channel}\n- **Label:** \`${label}\`\n- **Default Name:** \`${defaultName}\`\n- **Privacy:** \`${privacy}\`\n- **Total Triggers:** ${existingTriggers.length}`, flags: 64 });
        }

        if (sub === 'remove') {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '🔒 Administrator permission required.', flags: 64 });
          }
          const channel = interaction.options.getChannel('channel');
          const existingTriggers: any[] = [...(config.triggers || [])];
          const filtered = existingTriggers.filter((t: any) => t.triggerChannelId !== channel.id);
          if (filtered.length === existingTriggers.length) {
            return interaction.reply({ content: `❌ ${channel} is not a registered JTC trigger channel.`, flags: 64 });
          }
          saveConfig({ triggers: filtered });
          context.logSyncEvent(`[JTC] Trigger removed: #${(channel as any).name} (${filtered.length} remaining).`, 'info');
          return interaction.reply({ content: `✅ Removed **${(channel as any).name}** as a JTC trigger. **${filtered.length}** trigger(s) remaining.`, flags: 64 });
        }

        // Find user's active channel
        const myChannel = activeChannels.find((c: any) => c.ownerId === interaction.user.id);

        if (sub === 'name') {
          if (!myChannel) return interaction.reply({ content: '❌ You don\'t own an active JTC channel.', flags: 64 });
          const name = interaction.options.getString('name');
          const channel = interaction.guild?.channels.cache.get(myChannel.channelId);
          if (!channel) return interaction.reply({ content: '❌ Channel not found.', flags: 64 });
          await channel.setName(name).catch(() => {});
          myChannel.name = name;
          saveConfig({ activeChannels });
          return interaction.reply({ content: `✅ Renamed your channel to **${name}**.`, flags: 64 });
        }

        if (sub === 'limit') {
          if (!myChannel) return interaction.reply({ content: '❌ You don\'t own an active JTC channel.', flags: 64 });
          const limit = interaction.options.getInteger('limit');
          const channel = interaction.guild?.channels.cache.get(myChannel.channelId);
          if (!channel || channel.type !== ChannelType.GuildVoice) return interaction.reply({ content: '❌ Channel not found.', flags: 64 });
          await channel.setUserLimit(limit).catch(() => {});
          return interaction.reply({ content: `✅ Set user limit to **${limit === 0 ? 'unlimited' : limit}**.`, flags: 64 });
        }

        if (sub === 'lock') {
          if (!myChannel) return interaction.reply({ content: '❌ You don\'t own an active JTC channel.', flags: 64 });
          const channel = interaction.guild?.channels.cache.get(myChannel.channelId);
          if (!channel) return interaction.reply({ content: '❌ Channel not found.', flags: 64 });
          // Lock = deny Connect (and ViewChannel for invisible mode) for @everyone
          await channel.permissionOverwrites.edit(interaction.guildId, {
            Connect: false,
            ViewChannel: null // keep visibility as-is, only block connect
          }).catch(() => {});
          myChannel.locked = true;
          saveConfig({ activeChannels });
          return interaction.reply({ content: '🔒 Your channel is now **locked**. Use `/jtc unlock` to reopen.', flags: 64 });
        }

        if (sub === 'unlock') {
          if (!myChannel) return interaction.reply({ content: '❌ You don\'t own an active JTC channel.', flags: 64 });
          const channel = interaction.guild?.channels.cache.get(myChannel.channelId);
          if (!channel) return interaction.reply({ content: '❌ Channel not found.', flags: 64 });
          // Restore privacy mode from the originating trigger
          const originTrigger = (config.triggers || []).find((t: any) => t.id === myChannel.triggerId);
          const originPrivacy = originTrigger?.privacy || 'public';
          // Reset @everyone to original privacy, but keep Connect open (unlocked)
          if (originPrivacy === 'invisible') {
            await channel.permissionOverwrites.edit(interaction.guildId, { Connect: null, ViewChannel: false }).catch(() => {});
          } else if (originPrivacy === 'stage') {
            await channel.permissionOverwrites.edit(interaction.guildId, { Connect: null, ViewChannel: null, Speak: false }).catch(() => {});
          } else {
            // public / private / locked — just open Connect
            await channel.permissionOverwrites.edit(interaction.guildId, { Connect: null }).catch(() => {});
          }
          myChannel.locked = false;
          saveConfig({ activeChannels });
          return interaction.reply({ content: '🔓 Your channel is now **unlocked**.', flags: 64 });
        }

        if (sub === 'transfer') {
          if (!myChannel) return interaction.reply({ content: '❌ You don\'t own an active JTC channel.', flags: 64 });
          const user = interaction.options.getUser('user');
          myChannel.ownerId = user.id;
          myChannel.ownerTag = user.username;
          saveConfig({ activeChannels });
          context.logSyncEvent(`[JTC] ${interaction.user.username} transferred channel to ${user.username}.`, 'info');
          return interaction.reply({ content: `✅ Transferred channel ownership to ${user}.`, flags: 64 });
        }

        if (sub === 'kick') {
          if (!myChannel) return interaction.reply({ content: '❌ You don\'t own an active JTC channel.', flags: 64 });
          const user = interaction.options.getUser('user');
          const member = interaction.guild?.members.cache.get(user.id);
          if (!member) return interaction.reply({ content: '❌ Member not found.', flags: 64 });
          if (member.voice?.channelId === myChannel.channelId) {
            await member.voice.disconnect('Kicked from JTC channel').catch(() => {});
          }
          const channel = interaction.guild?.channels.cache.get(myChannel.channelId);
          if (channel) await channel.permissionOverwrites.edit(user.id, { Connect: false }).catch(() => {});
          return interaction.reply({ content: `✅ Kicked ${user} from your channel.`, flags: 64 });
        }

        if (sub === 'invite') {
          if (!myChannel) return interaction.reply({ content: '❌ You don\'t own an active JTC channel.', flags: 64 });
          const user = interaction.options.getUser('user');
          const channel = interaction.guild?.channels.cache.get(myChannel.channelId);
          if (!channel) return interaction.reply({ content: '❌ Channel not found.', flags: 64 });
          await channel.permissionOverwrites.edit(user.id, { Connect: true, ViewChannel: true }).catch(() => {});
          return interaction.reply({ content: `✅ Invited ${user} to your channel.`, flags: 64 });
        }

        if (sub === 'info') {
          if (!myChannel) return interaction.reply({ content: '❌ You don\'t own an active JTC channel.', flags: 64 });
          const originTrigger = (config.triggers || []).find((t: any) => t.id === myChannel.triggerId);
          const privacyLabel: Record<string, string> = { public: '🌐 Public', private: '🔐 Private', locked: '🔒 Locked', invisible: '👁️ Invisible', stage: '🎙️ Stage', sync: '🔄 Synced' };
          const embed = new EmbedBuilder()
            .setTitle(`🎙️ Your JTC Channel`)
            .setColor('#4f8cff')
            .addFields(
              { name: 'Channel', value: `<#${myChannel.channelId}>`, inline: true },
              { name: 'Name', value: myChannel.name, inline: true },
              { name: 'Status', value: myChannel.locked ? '🔒 Locked' : '🔓 Open', inline: true },
              { name: 'Privacy Mode', value: privacyLabel[originTrigger?.privacy || 'public'] || '🌐 Public', inline: true },
              { name: 'User Limit', value: (myChannel.limit || 0) === 0 ? '∞ Unlimited' : `${myChannel.limit} max`, inline: true },
              { name: 'Trigger', value: originTrigger ? `📌 ${originTrigger.label}` : 'Legacy', inline: true },
              { name: 'Created', value: `<t:${Math.floor(new Date(myChannel.createdAt).getTime() / 1000)}:R>`, inline: true }
            );
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (sub === 'list') {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({ content: '🔒 Manage Server permission required.', flags: 64 });
          }
          if (activeChannels.length === 0) return interaction.reply({ content: '📋 No active JTC channels.', flags: 64 });
          const lines = activeChannels.map((c: any, i: number) => `**${i + 1}.** <#${c.channelId}> — Owner: <@${c.ownerId}> ${c.locked ? '🔒' : '🔓'}`);
          return interaction.reply({ content: `🎙️ **Active JTC Channels (${activeChannels.length}):**\n${lines.join('\n')}`, flags: 64 });
        }

        if (sub === 'bitrate') {
          if (!myChannel) return interaction.reply({ content: '❌ You don\'t own an active JTC channel.', flags: 64 });
          const bitrate = interaction.options.getInteger('bitrate');
          const channel = interaction.guild?.channels.cache.get(myChannel.channelId);
          if (!channel || channel.type !== ChannelType.GuildVoice) return interaction.reply({ content: '❌ Channel not found.', flags: 64 });
          await channel.setBitrate(bitrate * 1000).catch(() => {});
          return interaction.reply({ content: `✅ Set bitrate to **${bitrate}kbps**.`, flags: 64 });
        }

        if (sub === 'region') {
          if (!myChannel) return interaction.reply({ content: '❌ You don\'t own an active JTC channel.', flags: 64 });
          const region = interaction.options.getString('region');
          const channel = interaction.guild?.channels.cache.get(myChannel.channelId);
          if (!channel || channel.type !== ChannelType.GuildVoice) return interaction.reply({ content: '❌ Channel not found.', flags: 64 });
          const rtcRegion = region?.toLowerCase() === 'auto' ? null : (region || null);
          await (channel as any).setRTCRegion(rtcRegion).catch(() => {});
          return interaction.reply({ content: `✅ Set voice region to **${rtcRegion ?? 'Automatic'}**.`, flags: 64 });
        }

        if (sub === 'reset') {
          if (!myChannel) return interaction.reply({ content: '❌ You don\'t own an active JTC channel.', flags: 64 });
          const channel = interaction.guild?.channels.cache.get(myChannel.channelId);
          if (!channel) return interaction.reply({ content: '❌ Channel not found.', flags: 64 });
          // BUG FIX: resolve defaults from originating trigger, not stale root config fields
          const originTrigger = (config.triggers || []).find((t: any) => t.id === myChannel.triggerId);
          const defaultName = ((originTrigger?.defaultName || config.defaultName || "{username}'s Channel"))
            .replace(/{username}/g, interaction.user.username)
            .replace(/{user}/g, (interaction.member as any)?.displayName || interaction.user.username);
          const defaultLimit = originTrigger?.defaultLimit ?? config.defaultLimit ?? 0;
          const defaultPrivacy = originTrigger?.privacy || config.privacy || 'public';
          await channel.setName(defaultName).catch(() => {});
          if (channel.type === ChannelType.GuildVoice) await channel.setUserLimit(defaultLimit).catch(() => {});
          
          if (defaultPrivacy === 'sync') {
            if (channel.parentId) {
              await channel.lockPermissions().catch(() => {});
            }
          }
          // Re-apply the trigger's original privacy overwrite
          const overwrites = buildPrivacyOverwrites(defaultPrivacy, interaction.guildId!, interaction.user.id);
          for (const ow of overwrites) {
            await channel.permissionOverwrites.edit(ow.id, ow).catch(() => {});
          }
          myChannel.name = defaultName;
          myChannel.locked = false;
          saveConfig({ activeChannels });
          return interaction.reply({ content: `✅ Reset your channel to **${defaultPrivacy}** defaults.`, flags: 64 });
        }

        if (sub === 'hide') {
          if (!myChannel) return interaction.reply({ content: '❌ You don\'t own an active JTC channel.', flags: 64 });
          const channel = interaction.guild?.channels.cache.get(myChannel.channelId);
          if (!channel) return interaction.reply({ content: '❌ Channel not found.', flags: 64 });
          await channel.permissionOverwrites.edit(interaction.guild?.roles.everyone.id!, { ViewChannel: false });
          return interaction.reply({ content: '✅ Channel successfully hidden.', flags: 64 });
        }

        if (sub === 'unhide') {
          if (!myChannel) return interaction.reply({ content: '❌ You don\'t own an active JTC channel.', flags: 64 });
          const channel = interaction.guild?.channels.cache.get(myChannel.channelId);
          if (!channel) return interaction.reply({ content: '❌ Channel not found.', flags: 64 });
          await channel.permissionOverwrites.edit(interaction.guild?.roles.everyone.id!, { ViewChannel: true });
          return interaction.reply({ content: '✅ Channel successfully unhidden.', flags: 64 });
        }

        if (sub === 'permit') {
          if (!myChannel) return interaction.reply({ content: '❌ You don\'t own an active JTC channel.', flags: 64 });
          const channel = interaction.guild?.channels.cache.get(myChannel.channelId);
          if (!channel) return interaction.reply({ content: '❌ Channel not found.', flags: 64 });
          const target = interaction.options.getUser('user');
          await channel.permissionOverwrites.edit(target.id, { Connect: true, ViewChannel: true });
          return interaction.reply({ content: `✅ Allowed ${target} to join your channel.`, flags: 64 });
        }

        if (sub === 'reject') {
          if (!myChannel) return interaction.reply({ content: '❌ You don\'t own an active JTC channel.', flags: 64 });
          const channel = interaction.guild?.channels.cache.get(myChannel.channelId);
          if (!channel) return interaction.reply({ content: '❌ Channel not found.', flags: 64 });
          const target = interaction.options.getUser('user');
          await channel.permissionOverwrites.edit(target.id, { Connect: false });
          const member = interaction.guild?.members.cache.get(target.id);
          if (member && member.voice?.channelId === channel.id) {
            await member.voice.disconnect().catch(() => {});
          }
          return interaction.reply({ content: `❌ Blocked ${target} from joining your channel.`, flags: 64 });
        }

        if (sub === 'claim') {
          const currentVoiceChannel = (interaction.member as any)?.voice?.channel;
          if (!currentVoiceChannel) return interaction.reply({ content: '❌ You must be in a JTC voice channel to claim it.', flags: 64 });
          const activeCh = activeChannels.find((c: any) => c.channelId === currentVoiceChannel.id);
          if (!activeCh) return interaction.reply({ content: '❌ This channel is not a managed JTC channel.', flags: 64 });
          const originalOwnerInVc = currentVoiceChannel.members.has(activeCh.ownerId);
          if (originalOwnerInVc && activeCh.ownerId !== interaction.user.id) {
            return interaction.reply({ content: '❌ You cannot claim this channel because the owner is still in the voice channel.', flags: 64 });
          }
          activeCh.ownerId = interaction.user.id;
          activeCh.ownerTag = interaction.user.tag;
          saveConfig({ activeChannels });
          await currentVoiceChannel.permissionOverwrites.edit(interaction.user.id, { ManageChannels: true, Connect: true, ViewChannel: true });
          return interaction.reply({ content: '👑 **You have successfully claimed ownership of this channel!**' });
        }
      }
    },
    // Auto-create channel when user joins any trigger
    {
      name: 'voiceStateUpdate',
      handler: async (client: any, data: any, context: any) => {
        const { oldState, newState } = data;
        const modules = context.getModulesState ? context.getModulesState() : [];
        const jtcMod = modules.find((m: any) => m.id === 'join_to_create');
        if (!jtcMod || jtcMod.status !== 'enabled') return;

        const config: IJoinToCreate = jtcMod.config || {};
        let activeChannels: IJoinToCreate['activeChannels'] = config.activeChannels || [];
        const guild = newState.guild || oldState.guild;
        if (!guild) return;

        // Build effective triggers list: new array + legacy single-trigger compat
        const triggers: any[] = [...(config.triggers || [])];
        if (config.triggerChannelId && !triggers.find((t: any) => t.triggerChannelId === config.triggerChannelId)) {
          triggers.push({
            id: 'legacy',
            label: 'Default',
            triggerChannelId: config.triggerChannelId,
            categoryId: config.categoryId || null,
            defaultName: config.defaultName || "{username}'s Channel",
            defaultLimit: config.defaultLimit || 0,
            privacy: config.privacy || 'public'
          });
        }
        // Auto-detect fallback if no triggers configured
        if (triggers.length === 0) {
          const found = guild.channels.cache.find((c: any) => c.type === ChannelType.GuildVoice && c.name.toLowerCase().includes('join to create'));
          if (found) triggers.push({ id: 'auto', label: 'Auto-Detected', triggerChannelId: found.id, categoryId: null, defaultName: "{username}'s Channel", defaultLimit: 0, privacy: 'public' });
        }

        // 1. Find which trigger (if any) the user just joined
        const matchedTrigger = newState.channelId ? triggers.find((t: any) => t.triggerChannelId === newState.channelId) : null;

        if (matchedTrigger && newState.member) {
          const member = newState.member;

          // Resolve parent category from trigger channel itself, then from trigger config
          let parentId: string | null = null;
          try {
            const triggerCh = guild.channels.cache.get(matchedTrigger.triggerChannelId) || await guild.channels.fetch(matchedTrigger.triggerChannelId).catch(() => null);
            if (triggerCh?.parentId) parentId = triggerCh.parentId;
          } catch (e) { console.error('[JTC] Failed to fetch trigger channel:', e); }
          if (!parentId && matchedTrigger.categoryId) parentId = matchedTrigger.categoryId;

          const channelName = (matchedTrigger.defaultName || "{username}'s Channel")
            .replace(/{username}/g, member.user.username)
            .replace(/{user}/g, member.displayName)
            .replace(/{count}/g, String(activeChannels.length + 1));

          try {
            const isSyncMode = matchedTrigger.privacy === 'sync';
            let initialOverwrites: any[] = [];

            if (isSyncMode) {
              if (parentId) {
                const categoryCh = guild.channels.cache.get(parentId) || await guild.channels.fetch(parentId).catch(() => null);
                if (categoryCh && categoryCh.permissionOverwrites) {
                  initialOverwrites = categoryCh.permissionOverwrites.cache.map((ow: any) => ({
                    id: ow.id,
                    type: ow.type,
                    allow: ow.allow,
                    deny: ow.deny
                  }));
                }
              }
              // Owner gets priority overrides
              initialOverwrites.push({
                id: member.id,
                type: 1, // User type
                allow: [
                  PermissionFlagsBits.ManageChannels,
                  PermissionFlagsBits.Connect,
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.Speak
                ]
              });
            } else {
              initialOverwrites = buildPrivacyOverwrites(matchedTrigger.privacy || 'public', guild.id, member.id);
            }

            const createOptions: any = {
              name: channelName,
              type: ChannelType.GuildVoice,
              parent: parentId,
              userLimit: matchedTrigger.defaultLimit || 0,
              permissionOverwrites: initialOverwrites
            };

            const newChannel = await guild.channels.create(createOptions);

            if (isSyncMode && parentId) {
              await newChannel.lockPermissions().catch(() => {});
              await newChannel.permissionOverwrites.edit(member.id, {
                ManageChannels: true,
                Connect: true,
                ViewChannel: true,
                Speak: true
              }).catch(() => {});
            }

            await member.voice.setChannel(newChannel).catch(() => {});

            activeChannels.push({
              channelId: newChannel.id,
              ownerId: member.id,
              ownerTag: member.user.username,
              name: channelName,
              locked: matchedTrigger.privacy === 'locked',
              limit: matchedTrigger.defaultLimit || 0,
              triggerId: matchedTrigger.id,
              createdAt: new Date()
            });

            context.updateModuleConfig('join_to_create', { activeChannels });
            context.logSyncEvent(`[JTC] Created "${channelName}" for ${member.user.username} via trigger "${matchedTrigger.label}".`, 'success');
          } catch (err) { console.error('[JTC] Create error:', err); }
        }

        // 2. Scan and auto-delete all empty JTC channels
        let configChanged = false;
        for (let i = activeChannels.length - 1; i >= 0; i--) {
          const activeCh = activeChannels[i];
          try {
            let channel = guild.channels.cache.get(activeCh.channelId);
            if (!channel) {
              try {
                channel = await guild.channels.fetch(activeCh.channelId);
              } catch (err: any) {
                // Discord API error codes:
                // 10003: Unknown Channel (deleted)
                // 50001: Missing Access
                if (err.code === 10003 || err.code === 50001) {
                  activeChannels.splice(i, 1);
                  configChanged = true;
                  context.logSyncEvent(`[JTC] Cleared stale tracked channel ID ${activeCh.channelId} (deleted or inaccessible).`, 'info');
                } else {
                  console.error(`[JTC] Transient error fetching channel ${activeCh.channelId}:`, err);
                }
                continue;
              }
            }

            if (!channel) {
              // Should not happen unless fetch returned null/undefined without throwing, but handle it anyway
              activeChannels.splice(i, 1);
              configChanged = true;
              continue;
            }

            const nonBotMembers = channel.members.filter((m: any) => !m.user.bot);
            if (nonBotMembers.size === 0) {
              try {
                await channel.delete('JTC: Channel empty');
                activeChannels.splice(i, 1);
                configChanged = true;
                context.logSyncEvent(`[JTC] Auto-deleted empty channel "${activeCh.name || activeCh.channelId}".`, 'info');
              } catch (deleteErr: any) {
                console.error(`[JTC] Failed to delete empty channel ${activeCh.channelId}:`, deleteErr);
                // Do NOT splice out of activeChannels if delete fails (unless it is missing permissions 50013 or channel was deleted 10003)
                if (deleteErr.code === 10003 || deleteErr.code === 50001 || deleteErr.code === 50013) {
                  activeChannels.splice(i, 1);
                  configChanged = true;
                  context.logSyncEvent(`[JTC] Cleared empty channel ID ${activeCh.channelId} due to permission/delete error (${deleteErr.code}).`, 'warning');
                }
              }
            }
          } catch (outerErr) {
            console.error(`[JTC] Error in cleanup loop for channel ${activeCh.channelId}:`, outerErr);
          }
        }

        if (configChanged) context.updateModuleConfig('join_to_create', { activeChannels });
      }
    },
    // Keep DB synchronized when channel is manually deleted
    {
      name: 'channelDelete',
      handler: async (client: any, channel: any, context: any) => {
        const modules = context.getModulesState ? context.getModulesState() : [];
        const jtcMod = modules.find((m: any) => m.id === 'join_to_create');
        if (!jtcMod || jtcMod.status !== 'enabled') return;

        const config: IJoinToCreate = jtcMod.config || {};
        let activeChannels: IJoinToCreate['activeChannels'] = config.activeChannels || [];
        let triggers = config.triggers || [];
        const originalTriggersLength = triggers.length;

        triggers = triggers.filter((t: any) => t.triggerChannelId !== channel.id);
        const updates: Partial<IJoinToCreate> = {};
        let changed = false;

        const jtcIndex = activeChannels.findIndex((c: any) => c.channelId === channel.id);
        if (jtcIndex !== -1) {
          activeChannels.splice(jtcIndex, 1);
          updates.activeChannels = activeChannels;
          changed = true;
          context.logSyncEvent(`[JTC] Active channel "${channel.name}" was manually deleted; cleared from tracking.`, 'info');
        }

        if (triggers.length !== originalTriggersLength) {
          updates.triggers = triggers;
          changed = true;
          context.logSyncEvent(`[JTC] Trigger channel "${channel.name}" was manually deleted; removed trigger configuration.`, 'info');
        }

        if (changed) {
          context.updateModuleConfig('join_to_create', updates);
        }
      }
    }
  ],
  routes: [
    {
      path: '/state',
      method: 'get',
      handler: async (req: any, res: any, context: any) => {
        const modules = context.getModulesState();
        const mod = modules.find((m: any) => m.id === 'join_to_create');
        res.json({ config: mod?.config || {}, activeChannels: mod?.config?.activeChannels || [] });
      }
    }
  ]
};
