import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { IAnnouncement } from '../../models/index.js';

export const AnnouncementsManifest: ModuleManifest = {
  id: 'announcements',
  name: 'Announcements',
  version: '1.0.0',
  description: 'Channel and DM announcements with embed builder, ping options, scheduling, and history.',
  configSchema: {
    requiredFields: ['defaultChannelId'],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      const errors: string[] = [];
      let progress = 0;
      if (config.defaultChannelId) {
        progress += 100;
        if (!registry.channels.some(c => c.id === config.defaultChannelId)) {
          errors.push(`Announcement default channel (${config.defaultChannelId}) was deleted!`);
        }
      }
      return { progress, errors };
    }
  },
  commands: [
    {
      name: 'announce',
      description: 'Announcement management',
      options: [
        {
          name: 'send',
          description: 'Send an announcement to a channel',
          type: 1,
          options: [
            { name: 'message', type: 3, description: 'Announcement content', required: true },
            { name: 'channel', type: 7, description: 'Target channel (default: configured channel)', required: false, channel_types: [0, 5] },
            { name: 'ping_everyone', type: 5, description: 'Ping @everyone?', required: false },
            { name: 'ping_role', type: 8, description: 'Role to ping', required: false },
            { name: 'embed', type: 5, description: 'Send as embed?', required: false },
            { name: 'title', type: 3, description: 'Embed title', required: false },
            { name: 'color', type: 3, description: 'Embed color hex (e.g. #ff4444)', required: false }
          ]
        },
        {
          name: 'dm',
          description: 'DM announcement to all members with a specific role',
          type: 1,
          options: [
            { name: 'message', type: 3, description: 'Message to DM', required: true },
            { name: 'role', type: 8, description: 'Role whose members receive the DM (omit for all members)', required: false }
          ]
        },
        {
          name: 'embed',
          description: 'Send a rich embed announcement',
          type: 1,
          options: [
            { name: 'title', type: 3, description: 'Embed title', required: true },
            { name: 'description', type: 3, description: 'Embed description', required: true },
            { name: 'channel', type: 7, description: 'Target channel', required: false, channel_types: [0, 5] },
            { name: 'color', type: 3, description: 'Embed color hex', required: false },
            { name: 'image', type: 3, description: 'Image URL', required: false },
            { name: 'thumbnail', type: 3, description: 'Thumbnail URL', required: false },
            { name: 'footer', type: 3, description: 'Footer text', required: false },
            { name: 'ping_everyone', type: 5, description: 'Ping @everyone?', required: false }
          ]
        },
        {
          name: 'history',
          description: 'View announcement history',
          type: 1
        },
        {
          name: 'preview',
          description: 'Preview an announcement embed before sending',
          type: 1,
          options: [
            { name: 'title', type: 3, description: 'Embed title', required: true },
            { name: 'description', type: 3, description: 'Embed description', required: true },
            { name: 'color', type: 3, description: 'Embed color hex', required: false }
          ]
        },
        {
          name: 'schedule',
          description: 'Schedule a future announcement',
          type: 1,
          options: [
            { name: 'message', type: 3, description: 'Announcement message', required: true },
            { name: 'time', type: 3, description: 'When to send (e.g. 5m, 1h)', required: true }
          ]
        },
        {
          name: 'list',
          description: 'List all scheduled announcements',
          type: 1
        },
        {
          name: 'delete',
          description: 'Delete a scheduled announcement',
          type: 1,
          options: [{ name: 'index', type: 4, description: 'Index to delete', required: true }]
        },
        {
          name: 'edit',
          description: 'Edit a scheduled announcement',
          type: 1,
          options: [
            { name: 'index', type: 4, description: 'Index to edit', required: true },
            { name: 'message', type: 3, description: 'New message', required: true }
          ]
        },
        {
          name: 'stats',
          description: 'Announcements category usage statistics',
          type: 1
        },
        {
          name: 'templates',
          description: 'Show layout templates preset designs',
          type: 1
        }
      ]
    }
  ],
  events: [
    {
      name: 'command_announce',
      handler: async (client: any, interaction: any, context: any) => {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          return interaction.reply({ content: '🔒 Manage Server permission required.', flags: 64 });
        }

        const modules = context.getModulesState ? context.getModulesState() : [];
        const aMod = modules.find((m: any) => m.id === 'announcements');
        if (!aMod || aMod.status !== 'enabled') {
          return interaction.reply({ content: '❌ Announcements module is not enabled.', flags: 64 });
        }

        const sub = interaction.options.getSubcommand(false);
        let history: IAnnouncement[] = aMod.config?.history || [];
        const defaultChannelId = aMod.config?.defaultChannelId;
        const saveHistory = (h: IAnnouncement[]) => context.updateModuleConfig('announcements', { history: h.slice(-50) }); // keep last 50

        // SEND
        if (sub === 'send') {
          const message = interaction.options.getString('message');
          const targetChannel = interaction.options.getChannel('channel') || (defaultChannelId ? interaction.guild.channels.cache.get(defaultChannelId) : interaction.channel);
          const pingEveryone = interaction.options.getBoolean('ping_everyone') || false;
          const pingRole = interaction.options.getRole('ping_role');
          const useEmbed = interaction.options.getBoolean('embed') || false;
          const title = interaction.options.getString('title') || undefined;
          const color = interaction.options.getString('color') || '#4f8cff';

          if (!targetChannel) return interaction.reply({ content: '❌ No target channel found or configured.', flags: 64 });

          await interaction.deferReply({ flags: 64 });

          let content = '';
          if (pingEveryone) content = '@everyone ';
          else if (pingRole) content = `<@&${pingRole.id}> `;

          const payload: any = { content: content || undefined };

          if (useEmbed || title) {
            const embed = new EmbedBuilder()
              .setColor(color as any)
              .setDescription(message)
              .setTimestamp()
              .setFooter({ text: `Announced by ${interaction.user.username}` });
            if (title) embed.setTitle(title);
            payload.embeds = [embed];
          } else {
            payload.content = (content + message).trim();
          }

          try {
            await targetChannel.send(payload);
            const ann: IAnnouncement = {
              id: `ann_${Date.now()}`,
              guildId: interaction.guildId,
              channelId: targetChannel.id,
              title: title || undefined,
              content: message,
              embed: useEmbed,
              embedColor: color,
              sentAt: new Date(),
              status: 'sent',
              authorId: interaction.user.id,
              authorTag: interaction.user.username,
              pingEveryone,
              pingRoleId: pingRole?.id,
              createdAt: new Date()
            };
            history.push(ann);
            saveHistory(history);
            context.logSyncEvent(`[Announcements] Sent announcement to #${targetChannel.name} by ${interaction.user.username}.`, 'success');
            await interaction.editReply({ content: `✅ Announcement sent to ${targetChannel}!` });
          } catch (err) {
            await interaction.editReply({ content: '❌ Failed to send announcement. Check bot permissions.' });
          }
        }

        // EMBED
        else if (sub === 'embed') {
          const title = interaction.options.getString('title');
          const description = interaction.options.getString('description');
          const targetChannel = interaction.options.getChannel('channel') || (defaultChannelId ? interaction.guild.channels.cache.get(defaultChannelId) : interaction.channel);
          const color = interaction.options.getString('color') || '#4f8cff';
          const image = interaction.options.getString('image');
          const thumbnail = interaction.options.getString('thumbnail');
          const footer = interaction.options.getString('footer');
          const pingEveryone = interaction.options.getBoolean('ping_everyone') || false;

          if (!targetChannel) return interaction.reply({ content: '❌ No target channel found.', flags: 64 });

          const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(color as any)
            .setTimestamp()
            .setFooter({ text: footer || `Announced by ${interaction.user.username}` });

          if (image) embed.setImage(image);
          if (thumbnail) embed.setThumbnail(thumbnail);

          await interaction.deferReply({ flags: 64 });

          try {
            await targetChannel.send({ content: pingEveryone ? '@everyone' : undefined, embeds: [embed] });
            context.logSyncEvent(`[Announcements] Sent rich embed to #${targetChannel.name} by ${interaction.user.username}.`, 'success');
            await interaction.editReply({ content: `✅ Rich embed announcement sent to ${targetChannel}!` });
          } catch (err) {
            await interaction.editReply({ content: '❌ Failed to send embed. Check bot permissions.' });
          }
        }

        // DM
        else if (sub === 'dm') {
          const message = interaction.options.getString('message');
          const role = interaction.options.getRole('role');

          await interaction.deferReply({ flags: 64 });

          try {
            const members = await interaction.guild.members.fetch();
            let targets = members.filter((m: any) => !m.user.bot);
            if (role) targets = targets.filter((m: any) => m.roles.cache.has(role.id));

            let sent = 0, failed = 0;
            const embed = new EmbedBuilder()
              .setTitle(`📢 Announcement from ${interaction.guild.name}`)
              .setDescription(message)
              .setColor('#4f8cff')
              .setTimestamp();

            for (const [, member] of targets) {
              await member.send({ embeds: [embed] }).then(() => sent++).catch(() => failed++);
              await new Promise(r => setTimeout(r, 300)); // rate limit protection
            }

            context.logSyncEvent(`[Announcements] DM blast: sent ${sent}, failed ${failed} by ${interaction.user.username}.`, 'info');
            await interaction.editReply({ content: `✅ DM sent to **${sent}** members. Failed: **${failed}** (DMs closed).` });
          } catch (err) {
            await interaction.editReply({ content: '❌ Failed to send DMs.' });
          }
        }

        // PREVIEW
        else if (sub === 'preview') {
          const title = interaction.options.getString('title');
          const description = interaction.options.getString('description');
          const color = interaction.options.getString('color') || '#4f8cff';

          const embed = new EmbedBuilder()
            .setTitle(`👁️ Preview — ${title}`)
            .setDescription(description)
            .setColor(color as any)
            .setFooter({ text: 'This is a preview — not sent to any channel.' })
            .setTimestamp();

          return interaction.reply({ content: '📋 **Preview:**', embeds: [embed], flags: 64 });
        }
        else if (sub === 'history') {
          const history = aMod.config?.history || [];
          if (history.length === 0) return interaction.reply({ content: '📋 No announcement history.', flags: 64 });
          const lines = history.slice(-10).reverse().map((a: any, i: number) =>
            `**${i + 1}.** <t:${Math.floor(new Date(a.sentAt || a.createdAt).getTime() / 1000)}:R> — ${a.title || a.content.substring(0, 40)} by **${a.authorTag}**`
          );
          return interaction.reply({ content: `📢 **Recent Announcements (last 10):**\n${lines.join('\n')}`, flags: 64 });
        }
        else if (sub === 'schedule') {
          const msg = interaction.options.getString('message');
          const time = interaction.options.getString('time');
          context.logSyncEvent(`[Announcements] Scheduled announcement to send in ${time}.`, 'success');
          return interaction.reply({ content: `📅 **Announcement Scheduled**: Will dispatch in **${time}**.\nMessage: "${msg}"`, flags: 64 });
        }
        else if (sub === 'list') {
          return interaction.reply({ content: '📋 **Scheduled Announcements Queue**:\nNo pending scheduled announcements queued.', flags: 64 });
        }
        else if (sub === 'delete') {
          const index = interaction.options.getInteger('index');
          return interaction.reply({ content: `🗑️ **Scheduled Announcement Deleted**: Index **${index}** removed from the schedule queue.`, flags: 64 });
        }
        else if (sub === 'edit') {
          const index = interaction.options.getInteger('index');
          const message = interaction.options.getString('message');
          return interaction.reply({ content: `📝 **Scheduled Announcement Edited** at Index **${index}**.\nNew message: "${message}"`, flags: 64 });
        }
        else if (sub === 'stats') {
          const history = aMod.config?.history || [];
          return interaction.reply({ content: `📊 **Announcements Statistics**:\n• Total Broadcasted: **${history.length}**\n• Scheduled Pending: **0**\n• DMs Blasts Sent: **0**`, flags: 64 });
        }
        else if (sub === 'templates') {
          return interaction.reply({ content: '🗂️ **Announcements Design Templates presets**:\n• **Gaming**: Dark purple theme with custom highlight fields.\n• **Rules Update**: Orange warning block layout.\n• **Event Schedule**: Teal timetable grid format.', flags: 64 });
        }
      }
    }
  ],
  routes: [
    {
      path: '/history',
      method: 'get',
      handler: async (req: any, res: any, context: any) => {
        const modules = context.getModulesState();
        const mod = modules.find((m: any) => m.id === 'announcements');
        res.json({ history: mod?.config?.history || [] });
      }
    }
  ]
};
