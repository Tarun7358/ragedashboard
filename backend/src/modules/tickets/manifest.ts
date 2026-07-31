import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, PermissionFlagsBits, ChannelType } from 'discord.js';
import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';

export const TicketsManifest: ModuleManifest = {
  id: 'tickets',
  name: 'Ticket Support',
  version: '1.0.0',
  description: 'Interactive staff ticket boards, transcript captures, and department dispatching.',
  configSchema: {
    requiredFields: ['categoryId', 'staffRoleIds'],
    validate: (config: Record<string, any>, registry: DiscordResourceRegistry) => {
      const errors: string[] = [];
      let progress = 0;

      const roleExists = (id: string) => registry.roles.some(r => r.id === id);
      const channelExists = (id: string) => registry.channels.some(c => c.id === id);

      if (config.categoryId) {
        progress += 50;
        if (!channelExists(config.categoryId)) errors.push(`Ticket category ID (${config.categoryId}) was deleted!`);
      }
      if (config.staffRoleIds && config.staffRoleIds.length > 0) {
        progress += 50;
        config.staffRoleIds.forEach((id: string) => {
          if (!roleExists(id)) errors.push(`Support Staff role ID (${id}) was deleted!`);
        });
      }

      return { progress, errors };
    }
  },
  commands: [
    {
      name: 'setup-tickets',
      description: 'Post the interactive Support Ticket board button.'
    }
  ],
  events: [
    {
      name: 'command_setup-tickets',
      handler: async (client: any, interaction: any, context: any) => {
        const globalSettings = context.getGlobalSettings ? context.getGlobalSettings() : {};
        if (globalSettings.useV2Tickets) return;
        const modules = context.getModulesState ? context.getModulesState() : [];
        const tickModule = modules.find((m: any) => m.id === 'tickets');
        if (!tickModule || tickModule.status !== 'enabled') {
          return interaction.reply({ content: '❌ Ticket Support module is not enabled.', flags: 64 });
        }

        try {
          const embed = new EmbedBuilder()
            .setTitle('✉️ Customer Support Ticket')
            .setDescription('Need assistance from our staff? Click the button below to open a private support ticket.')
            .setColor('#4f8cff')
            .setTimestamp();

          const btn = new ButtonBuilder()
            .setCustomId('ticket_btn_create')
            .setLabel('Create Ticket')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✉️');

          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btn);

          await interaction.reply({ embeds: [embed], components: [row] });
          context.logSyncEvent('Ticket Support: Posted interactive ticket board.', 'info');
        } catch (err) {
          console.error(err);
          await interaction.reply({ content: '❌ Failed to post ticket board.', flags: 64 });
        }
      }
    },
    {
      name: 'button_ticket_btn_create',
      handler: async (client: any, interaction: any, context: any) => {
        const globalSettings = context.getGlobalSettings ? context.getGlobalSettings() : {};
        if (globalSettings.useV2Tickets) return;
        const modules = context.getModulesState ? context.getModulesState() : [];
        const tickModule = modules.find((m: any) => m.id === 'tickets');
        if (!tickModule || tickModule.status !== 'enabled') {
          return interaction.reply({ content: '❌ Ticket Support module is not enabled.', flags: 64 });
        }

        const config = tickModule.config;
        const categoryId = config.categoryId;
        const staffRoleIds = config.staffRoleIds || [];

        if (!categoryId) {
          return interaction.reply({ content: '❌ Ticket category is not configured.', flags: 64 });
        }

        const guild = interaction.guild;
        if (!guild) return;

        try {
          // Defer response to handle channel creation overhead
          await interaction.deferReply({ flags: 64 });

          const username = interaction.user.username.toLowerCase();
          const channelName = `ticket-${username}`;

          // Check if channel already exists for user
          const existingChannel = guild.channels.cache.find((c: any) => c.name === channelName);
          if (existingChannel) {
            return interaction.editReply({ content: `❌ You already have an active ticket: ${existingChannel}` });
          }

          // Build permission overwrites
          const permissionOverwrites = [
            {
              id: guild.id, // @everyone
              deny: [PermissionFlagsBits.ViewChannel]
            },
            {
              id: interaction.user.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
            }
          ];

          // Add staff permissions
          staffRoleIds.forEach((roleId: string) => {
            permissionOverwrites.push({
              id: roleId,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
            });
          });

          // Create text channel
          const ticketChannel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: categoryId,
            permissionOverwrites
          });

          // Send welcome message in ticket channel
          const welcomeEmbed = new EmbedBuilder()
            .setTitle(`🎫 Ticket Opened - #${ticketChannel.name}`)
            .setDescription(`Welcome ${interaction.user}! Please describe your issue or question here. Our support team will respond shortly.`)
            .setColor('#4f8cff')
            .setFooter({ text: 'To close this ticket, click the button below.' });

          const closeBtn = new ButtonBuilder()
            .setCustomId('ticket_btn_close')
            .setLabel('Close Ticket')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔒');

          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(closeBtn);

          await ticketChannel.send({ content: `${interaction.user} | Staff Notification`, embeds: [welcomeEmbed], components: [row] });
          await interaction.editReply({ content: `✅ Ticket opened successfully: ${ticketChannel}` });
          context.logSyncEvent(`Ticket Support: Opened ticket channel #${ticketChannel.name} for user "${interaction.user.username}".`, 'success');
        } catch (err) {
          console.error(err);
          await interaction.editReply({ content: '❌ Failed to create support ticket channel. Verify bot permissions.' });
        }
      }
    },
    {
      name: 'button_ticket_btn_close',
      handler: async (client: any, interaction: any, context: any) => {
        const globalSettings = context.getGlobalSettings ? context.getGlobalSettings() : {};
        if (globalSettings.useV2Tickets) return;
        const modules = context.getModulesState ? context.getModulesState() : [];
        const tickModule = modules.find((m: any) => m.id === 'tickets');
        if (!tickModule || tickModule.status !== 'enabled') {
          return interaction.reply({ content: '❌ Ticket Support module is not enabled.', flags: 64 });
        }

        const channel = interaction.channel;
        if (!channel) return;

        try {
          await interaction.reply({ content: '🔒 **Closing ticket...** Channel will be removed in 5 seconds.', ephemeral: false });
          
          context.logSyncEvent(`Ticket Support: User "${interaction.user.username}" closed ticket channel #${channel.name}.`, 'info');
          
          setTimeout(async () => {
            try {
              await channel.delete();
            } catch (err) {
              console.error('Failed to delete ticket channel:', err);
            }
          }, 5000);
        } catch (err) {
          console.error(err);
          await interaction.reply({ content: '❌ Failed to close ticket.', flags: 64 });
        }
      }
    }
  ]
};
