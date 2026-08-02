import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { EmbedBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';

export const BulkOpsManifest: ModuleManifest = {
  id: 'bulk_ops',
  name: 'Bulk Operations',
  version: '1.0.0',
  description: 'Bulk edit, role assignment, channel management, permissions, rename, delete, create, clone, sync, lock, hide, archive.',
  configSchema: {
    requiredFields: [],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      return { progress: 100, errors: [] };
    }
  },
  commands: [
    {
      name: 'bulk',
      description: 'Bulk server operations',
      options: [
        {
          name: 'role-add',
          description: 'Add a role to all members (or members with a specific role)',
          type: 1,
          options: [
            { name: 'role', type: 8, description: 'Role to add', required: true },
            { name: 'filter_role', type: 8, description: 'Only apply to members with this role', required: false }
          ]
        },
        {
          name: 'role-remove',
          description: 'Remove a role from all members',
          type: 1,
          options: [
            { name: 'role', type: 8, description: 'Role to remove', required: true },
            { name: 'filter_role', type: 8, description: 'Only remove from members with this role', required: false }
          ]
        },
        {
          name: 'channel-lock',
          description: 'Lock all channels in a category',
          type: 1,
          options: [{ name: 'category', type: 7, description: 'Category to lock (omit for all text channels)', required: false, channel_types: [4] }]
        },
        {
          name: 'channel-unlock',
          description: 'Unlock all channels in a category',
          type: 1,
          options: [{ name: 'category', type: 7, description: 'Category to unlock', required: false, channel_types: [4] }]
        },
        {
          name: 'channel-hide',
          description: 'Hide all channels in a category',
          type: 1,
          options: [{ name: 'category', type: 7, description: 'Category to hide', required: false, channel_types: [4] }]
        },
        {
          name: 'channel-unhide',
          description: 'Unhide all channels in a category',
          type: 1,
          options: [{ name: 'category', type: 7, description: 'Category to unhide', required: false, channel_types: [4] }]
        },
        {
          name: 'channel-slowmode',
          description: 'Set slowmode for all channels in a category',
          type: 1,
          options: [
            { name: 'seconds', type: 4, description: 'Slowmode duration (0 to disable)', required: true },
            { name: 'category', type: 7, description: 'Category (omit for all text channels)', required: false, channel_types: [4] }
          ]
        },
        {
          name: 'rename-channels',
          description: 'Add a prefix/suffix to all channels in a category',
          type: 1,
          options: [
            { name: 'category', type: 7, description: 'Category', required: true, channel_types: [4] },
            { name: 'prefix', type: 3, description: 'Prefix to add', required: false },
            { name: 'suffix', type: 3, description: 'Suffix to add', required: false }
          ]
        },
        {
          name: 'purge',
          description: 'Bulk delete messages in a channel',
          type: 1,
          options: [
            { name: 'amount', type: 4, description: 'Number of messages to delete', required: true },
            { name: 'channel', type: 7, description: 'Channel (defaults to current)', required: false, channel_types: [0, 5] },
            { name: 'user', type: 6, description: 'Only delete messages from this user', required: false }
          ]
        },
        {
          name: 'ban-list',
          description: 'View all banned users',
          type: 1
        },
        {
          name: 'mass-ban',
          description: 'Ban multiple users by ID (space separated)',
          type: 1,
          options: [
            { name: 'user_ids', type: 3, description: 'User IDs separated by spaces', required: true },
            { name: 'reason', type: 3, description: 'Reason', required: false }
          ]
        },
        {
          name: 'mass-unban',
          description: 'Unban multiple users by ID (space separated)',
          type: 1,
          options: [{ name: 'user_ids', type: 3, description: 'User IDs separated by spaces', required: true }]
        },
        {
          name: 'clone-channel',
          description: 'Clone a channel with all permissions',
          type: 1,
          options: [{ name: 'channel', type: 7, description: 'Channel to clone', required: true }]
        },
        {
          name: 'sync-permissions',
          description: 'Sync channel permissions with its category',
          type: 1,
          options: [
            { name: 'category', type: 7, description: 'Category (omit for all categories)', required: false, channel_types: [4] }
          ]
        },
        {
          name: 'create-channels',
          description: 'Create multiple channels at once',
          type: 1,
          options: [
            { name: 'names', type: 3, description: 'Channel names separated by commas', required: true },
            { name: 'type', type: 3, description: 'Channel type', required: false, choices: [{ name: 'Text', value: 'text' }, { name: 'Voice', value: 'voice' }] },
            { name: 'category', type: 7, description: 'Category to create in', required: false, channel_types: [4] }
          ]
        }
      ]
    }
  ],
  events: [
    {
      name: 'command_bulk',
      handler: async (client: any, interaction: any, context: any) => {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ content: '<:wrong:1532390628330307634> Administrator permission required for bulk operations.', flags: 64 });
        }

        const sub = interaction.options.getSubcommand(false);
        const guild = interaction.guild;
        if (!sub) {
          const embed = new EmbedBuilder()
            .setTitle('<:config:1532425712844144701> Bulk Operations Manager')
            .setDescription('Run bulk server operations across roles, channels, messages, and members.')
            .addFields(
              { name: '<:vip:1532620837117759508> Role Operations', value: '`r!bulk role-add` • `r!bulk role-remove` • `r!bulk role-purge`', inline: false },
              { name: '<:link:1532620952087826602> Channel & Messages', value: '`r!bulk channel-purge` • `r!bulk message-purge`', inline: false },
              { name: '<:member:1532621317487071426> Member Management', value: '`r!bulk nickname-reset` • `r!bulk member-kick` • `r!bulk member-ban`', inline: false }
            )
            .setColor('#7c5cfc')
            .setFooter({ text: 'Rage Optimiser • Bulk Operations Engine' });
          return interaction.reply({ embeds: [embed], flags: 64 });
        }

        await interaction.deferReply({ flags: 64 });

        const logBulk = (action: string, count: number) => {
          context.logSyncEvent(`[Bulk Ops] ${interaction.user.username} — ${action} (${count} items).`, 'warn');
        };

        const verifiedIcon = '<a:approved:1532390590707142956>';
        const buildMinimalCard = (action: string, detail: string) => {
          return new EmbedBuilder()
            .setColor(0x84cc16)
            .setDescription(`${verifiedIcon} ${interaction.user} **Has ${action}** ${detail}`);
        };

        // ROLE ADD
        if (sub === 'role-add') {
          const role = interaction.options.getRole('role');
          const filterRole = interaction.options.getRole('filter_role');
          const members = await guild.members.fetch();
          let targets = members.filter((m: any) => !m.user.bot);
          if (filterRole) targets = targets.filter((m: any) => m.roles.cache.has(filterRole.id));

          let count = 0;
          for (const [, member] of targets) {
            if (!member.roles.cache.has(role.id)) {
              await member.roles.add(role).catch(() => {});
              count++;
              await new Promise(r => setTimeout(r, 200));
            }
          }
          logBulk('Role Add', count);
          return interaction.editReply({ embeds: [buildMinimalCard('Added Role', `${role} **to ${count} members**`)] });
        }

        // ROLE REMOVE
        if (sub === 'role-remove') {
          const role = interaction.options.getRole('role');
          const filterRole = interaction.options.getRole('filter_role');
          const members = await guild.members.fetch();
          let targets = members.filter((m: any) => !m.user.bot && m.roles.cache.has(role.id));
          if (filterRole) targets = targets.filter((m: any) => m.roles.cache.has(filterRole.id));

          let count = 0;
          for (const [, member] of targets) {
            await member.roles.remove(role).catch(() => {});
            count++;
            await new Promise(r => setTimeout(r, 200));
          }
          logBulk('Role Remove', count);
          return interaction.editReply({ embeds: [buildMinimalCard('Removed Role', `${role} **from ${count} members**`)] });
        }

        // CHANNEL LOCK
        if (sub === 'channel-lock') {
          const cat = interaction.options.getChannel('category');
          const channels = cat
            ? guild.channels.cache.filter((c: any) => c.parentId === cat.id && c.type === ChannelType.GuildText)
            : guild.channels.cache.filter((c: any) => c.type === ChannelType.GuildText);
          let count = 0;
          for (const [, ch] of channels) {
            await ch.permissionOverwrites.edit(guild.id, { SendMessages: false }).catch(() => {});
            count++;
          }
          logBulk('Channel Lock', count);
          return interaction.editReply({ embeds: [buildMinimalCard('Locked Channels', `**${count} text channels**`)] });
        }

        // CHANNEL UNLOCK
        if (sub === 'channel-unlock') {
          const cat = interaction.options.getChannel('category');
          const channels = cat
            ? guild.channels.cache.filter((c: any) => c.parentId === cat.id && c.type === ChannelType.GuildText)
            : guild.channels.cache.filter((c: any) => c.type === ChannelType.GuildText);
          let count = 0;
          for (const [, ch] of channels) {
            await ch.permissionOverwrites.edit(guild.id, { SendMessages: null }).catch(() => {});
            count++;
          }
          logBulk('Channel Unlock', count);
          return interaction.editReply({ embeds: [buildMinimalCard('Unlocked Channels', `**${count} text channels**`)] });
        }

        // CHANNEL HIDE
        if (sub === 'channel-hide') {
          const cat = interaction.options.getChannel('category');
          const channels = cat
            ? guild.channels.cache.filter((c: any) => c.parentId === cat.id)
            : guild.channels.cache.filter((c: any) => c.type === ChannelType.GuildText);
          let count = 0;
          for (const [, ch] of channels) {
            await ch.permissionOverwrites.edit(guild.id, { ViewChannel: false }).catch(() => {});
            count++;
          }
          logBulk('Channel Hide', count);
          return interaction.editReply({ embeds: [buildMinimalCard('Hidden Channels', `**${count} channels**`)] });
        }

        // CHANNEL UNHIDE
        if (sub === 'channel-unhide') {
          const cat = interaction.options.getChannel('category');
          const channels = cat
            ? guild.channels.cache.filter((c: any) => c.parentId === cat.id)
            : guild.channels.cache.filter((c: any) => c.type === ChannelType.GuildText);
          let count = 0;
          for (const [, ch] of channels) {
            await ch.permissionOverwrites.edit(guild.id, { ViewChannel: null }).catch(() => {});
            count++;
          }
          logBulk('Channel Unhide', count);
          return interaction.editReply({ embeds: [buildMinimalCard('Unhidden Channels', `**${count} channels**`)] });
        }

        // CHANNEL SLOWMODE
        if (sub === 'channel-slowmode') {
          const seconds = interaction.options.getInteger('seconds');
          const cat = interaction.options.getChannel('category');
          const channels = cat
            ? guild.channels.cache.filter((c: any) => c.parentId === cat.id && c.type === ChannelType.GuildText)
            : guild.channels.cache.filter((c: any) => c.type === ChannelType.GuildText);
          let count = 0;
          for (const [, ch] of channels) {
            await ch.setRateLimitPerUser(seconds).catch(() => {});
            count++;
          }
          logBulk('Channel Slowmode', count);
          return interaction.editReply({ embeds: [buildMinimalCard('Set Slowmode', `**${seconds}s on ${count} channels**`)] });
        }

        // RENAME CHANNELS
        if (sub === 'rename-channels') {
          const cat = interaction.options.getChannel('category');
          const prefix = interaction.options.getString('prefix') || '';
          const suffix = interaction.options.getString('suffix') || '';
          if (!prefix && !suffix) return interaction.editReply({ content: '<:wrong:1532390628330307634> Provide at least a prefix or suffix.' });
          const channels = guild.channels.cache.filter((c: any) => c.parentId === cat.id);
          let count = 0;
          for (const [, ch] of channels) {
            const newName = `${prefix}${ch.name}${suffix}`;
            await ch.setName(newName).catch(() => {});
            count++;
            await new Promise(r => setTimeout(r, 300));
          }
          logBulk('Rename Channels', count);
          return interaction.editReply({ embeds: [buildMinimalCard('Renamed Channels', `**${count} channels**`)] });
        }

        // PURGE
        if (sub === 'purge') {
          const amount = Math.max(interaction.options.getInteger('amount'), 1);
          const target = interaction.options.getChannel('channel') || interaction.channel;
          const user = interaction.options.getUser('user');
          
          let remaining = amount;
          let totalDeleted = 0;
          let beforeId: string | undefined = undefined;

          if (amount > 100) {
            const initEmbed = new EmbedBuilder()
              .setColor(0x84cc16)
              .setDescription(`${verifiedIcon} ${interaction.user} **Has Initialized Purge** **${amount} messages** in ${target}`);
            await interaction.editReply({ embeds: [initEmbed] });
          }

          while (remaining > 0) {
            const fetchLimit = Math.min(remaining, 100);
            const limitToFetch = user ? 100 : fetchLimit;
            
            const fetchOptions: any = { limit: limitToFetch };
            if (beforeId) {
              fetchOptions.before = beforeId;
            }

            const messages = await target.messages.fetch(fetchOptions).catch(() => null);
            if (!messages || messages.size === 0) {
              break;
            }

            beforeId = messages.lastKey();

            let targetMessages = messages;
            if (user) {
              targetMessages = messages.filter((m: any) => m.author.id === user.id);
              if (targetMessages.size > remaining) {
                targetMessages = targetMessages.first(remaining);
              }
            }

            if (targetMessages.size === 0) {
              continue;
            }

            const deleted = await target.bulkDelete(targetMessages, true).catch(() => new Map());
            totalDeleted += deleted.size;

            if (user) {
              remaining -= deleted.size;
            } else {
              remaining -= limitToFetch;
            }

            if (deleted.size === 0) {
              break;
            }

            if (remaining > 0) {
              await new Promise(r => setTimeout(r, 1000));
            }
          }

          logBulk('Purge', totalDeleted);
          return interaction.editReply({ embeds: [buildMinimalCard('Purged Messages', `**${totalDeleted} messages in** ${target}`)] });
        }

        // BAN LIST
        if (sub === 'ban-list') {
          const bans = await guild.bans.fetch();
          if (bans.size === 0) return interaction.editReply({ content: '<:information:1532621274092929124> No banned users.' });
          const lines = [...bans.values()].slice(0, 20).map((b: any, i: number) => `**${i + 1}.** ${b.user.username} (${b.user.id}) — ${b.reason || 'No reason'}`);
          return interaction.editReply({ content: `<:shield:1532403012751065179> **Banned Users (${bans.size}):**\n${lines.join('\n')}` });
        }

        // MASS BAN
        if (sub === 'mass-ban') {
          const idsStr = interaction.options.getString('user_ids');
          const reason = interaction.options.getString('reason') || 'Mass ban by moderator';
          const ids = idsStr.split(/[\s,]+/).filter((id: string) => /^\d+$/.test(id));
          if (ids.length === 0) return interaction.editReply({ content: '<:wrong:1532390628330307634> No valid user IDs provided.' });
          let count = 0;
          for (const id of ids) {
            await guild.members.ban(id, { reason }).catch(() => {});
            count++;
            await new Promise(r => setTimeout(r, 200));
          }
          logBulk('Mass Ban', count);
          return interaction.editReply({ embeds: [buildMinimalCard('Mass Banned', `**${count} users**`)] });
        }

        // MASS UNBAN
        if (sub === 'mass-unban') {
          const idsStr = interaction.options.getString('user_ids');
          const ids = idsStr.split(/[\s,]+/).filter((id: string) => /^\d+$/.test(id));
          if (ids.length === 0) return interaction.editReply({ content: '<:wrong:1532390628330307634> No valid user IDs provided.' });
          let count = 0;
          for (const id of ids) {
            await guild.members.unban(id, 'Mass unban').catch(() => {});
            count++;
            await new Promise(r => setTimeout(r, 200));
          }
          logBulk('Mass Unban', count);
          return interaction.editReply({ embeds: [buildMinimalCard('Mass Unbanned', `**${count} users**`)] });
        }

        // CLONE CHANNEL
        if (sub === 'clone-channel') {
          const source = interaction.options.getChannel('channel');
          const cloned = await source.clone({ reason: `Cloned by ${interaction.user.username}` });
          logBulk('Clone Channel', 1);
          return interaction.editReply({ embeds: [buildMinimalCard('Cloned Channel', `${source} → ${cloned}`)] });
        }

        // SYNC PERMISSIONS
        if (sub === 'sync-permissions') {
          const cat = interaction.options.getChannel('category');
          let count = 0;
          if (cat) {
            const channels = guild.channels.cache.filter((c: any) => c.parentId === cat.id);
            for (const [, ch] of channels) {
              await ch.lockPermissions().catch(() => {});
              count++;
            }
          } else {
            const categories = guild.channels.cache.filter((c: any) => c.type === ChannelType.GuildCategory);
            for (const [catId] of categories) {
              const children = guild.channels.cache.filter((c: any) => c.parentId === catId);
              for (const [, ch] of children) {
                await ch.lockPermissions().catch(() => {});
                count++;
              }
            }
          }
          logBulk('Sync Permissions', count);
          return interaction.editReply({ embeds: [buildMinimalCard('Synced Permissions', `**${count} channels**`)] });
        }

        // CREATE CHANNELS
        if (sub === 'create-channels') {
          const namesStr = interaction.options.getString('names');
          const type = interaction.options.getString('type') || 'text';
          const cat = interaction.options.getChannel('category');
          const names = namesStr.split(',').map((n: string) => n.trim()).filter(Boolean);
          let count = 0;
          for (const name of names) {
            await guild.channels.create({
              name,
              type: type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText,
              parent: cat?.id || null
            }).catch(() => {});
            count++;
            await new Promise(r => setTimeout(r, 300));
          }
          logBulk('Create Channels', count);
          return interaction.editReply({ embeds: [buildMinimalCard('Created Channels', `**${count} channels**`)] });
        }

        return interaction.editReply({ content: '<:wrong:1532390628330307634> Unknown bulk operation.' });
      }
    }
  ]
};
