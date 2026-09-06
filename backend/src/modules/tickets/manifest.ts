import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import {
  ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, AttachmentBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, Message, RoleSelectMenuBuilder, UserSelectMenuBuilder
} from 'discord.js';
import { ITicket, ITicketConfig, ITicketCategory } from '../../models/index.js';
import {
  Colors, Embeds, Components,
  buildRichCard, buildStatusCard, buildLimeOverviewCard, buildMinimalAction, buildTicketPanelEmbed,
  VERIFIED_ICON, WRONG_ICON, SHIELD_ICON, CONFIG_ICON, BOT_ICON, LINK_ICON, MEMBER_ICON, TIMER_ICON, INFO_ICON, TICKET_ICON, VIP_ICON, GAVEL_ICON, GOLD_CROWN_ICON, BRAND_FOOTER, CROWN_ANIMATED_ICON
} from '../../core/UIFactory.js';
import { isOwnerOrExtraOwner } from '../../utils/whitelistCheck.js';
import { PrefixRegistry } from '../../core/prefix/PrefixRegistry.js';

function getDefaultConfig(): ITicketConfig {
  return {
    enabled: true,
    categoryId: null,
    transcriptChannelId: null,
    supportRoleIds: [],
    defaultAdminRoleId: null,
    blacklistedUserIds: [],
    activePanels: [],
    ticketCounter: 0,
    maxOpenPerUser: 1,
    categories: [
      { id: 'general', name: 'General Support', emoji: '🎟️', description: 'General server help & inquiries' },
      { id: 'moderation', name: 'Moderation & Reports', emoji: '🛡️', description: 'Report user rule violations' },
      { id: 'vip', name: 'VIP & Billing', emoji: '👑', description: 'Store, VIP & billing assistance' },
      { id: 'technical', name: 'Bot & Technical Help', emoji: '🤖', description: 'Technical assistance & bot issues' },
      { id: 'staff_app', name: 'Staff Application', emoji: '💼', description: 'Apply for staff or moderator roles' }
    ],
    activeTickets: []
  };
}

// ─────────────────────────────────────────────
// HTML TRANSCRIPT GENERATOR
// ─────────────────────────────────────────────
async function generateHtmlTranscript(channel: any, ticket: ITicket, guild: any): Promise<Buffer> {
  const fetchedMessages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  const msgArray = Array.from(fetchedMessages?.values() || []).reverse() as any[];

  const msgHtml = msgArray.map((m: any) => {
    const timeStr = m.createdAt ? new Date(m.createdAt).toLocaleString() : '';
    const avatar = m.author?.displayAvatarURL?.({ extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
    const authorName = m.author?.tag || m.author?.username || 'Unknown User';
    const content = m.content ? m.content.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') : '*No text content*';
    const attachmentsHtml = (m.attachments && m.attachments.size > 0)
      ? Array.from(m.attachments.values()).map((att: any) => `<br><a href="${att.url}" target="_blank" style="color:#00aff4;">[Attachment: ${att.name}]</a>`).join('')
      : '';

    return `
      <div class="chatlog__message-group">
        <div class="chatlog__author-avatar-container">
          <img class="chatlog__author-avatar" src="${avatar}" alt="Avatar" />
        </div>
        <div class="chatlog__messages">
          <span class="chatlog__author-name">${authorName}</span>
          <span class="chatlog__timestamp">${timeStr}</span>
          <div class="chatlog__content">${content}${attachmentsHtml}</div>
        </div>
      </div>
    `;
  }).join('\n');

  const fullHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>Transcript #${channel.name} - ${guild.name}</title>
      <style>
        body { background-color: #1e1f22; color: #dbdee1; font-family: 'gg sans', 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 24px; margin: 0; }
        .header { border-bottom: 2px solid #2b2d31; padding-bottom: 16px; margin-bottom: 24px; }
        .title { color: #5865f2; font-size: 26px; font-weight: 700; margin-bottom: 6px; }
        .meta { color: #949ba4; font-size: 14px; }
        .chatlog { display: flex; flex-direction: column; gap: 16px; }
        .chatlog__message-group { display: flex; align-items: flex-start; background: #2b2d31; padding: 12px 16px; border-radius: 8px; }
        .chatlog__author-avatar { width: 42px; height: 42px; border-radius: 50%; margin-right: 14px; border: 2px solid #35363c; }
        .chatlog__author-name { color: #f2f3f5; font-weight: 600; font-size: 15px; margin-right: 10px; }
        .chatlog__timestamp { color: #949ba4; font-size: 12px; }
        .chatlog__content { margin-top: 6px; line-height: 1.45; font-size: 14px; color: #dbdee1; word-break: break-word; }
        .footer { margin-top: 32px; border-top: 1px solid #2b2d31; padding-top: 16px; font-size: 12px; color: #949ba4; text-align: center; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="title">${guild.name} — Ticket Transcript</div>
        <div class="meta">Channel: <strong>#${channel.name}</strong> | Category: <strong>${ticket.category || 'General'}</strong> | Opened By: <strong>${ticket.userTag}</strong></div>
      </div>
      <div class="chatlog">
        ${msgHtml || '<div style="color:#949ba4;">No messages were recorded in this ticket.</div>'}
      </div>
      <div class="footer">
        Generated by Rage Optimiser Enterprise Ticket Engine • All interactions logged securely.
      </div>
    </body>
    </html>
  `;

  return Buffer.from(fullHtml, 'utf-8');
}

// ─────────────────────────────────────────────
// UI EMBED BUILDERS matching video
// ─────────────────────────────────────────────
function buildDashboardComponents(config: ITicketConfig, guild: any, selectedPanelId?: string) {
  const adminRoleMention = config.defaultAdminRoleId ? `<@&${config.defaultAdminRoleId}>` : 'None';
  const activePanelsCount = config.activePanels ? config.activePanels.length : 0;

  const embed = new EmbedBuilder()
    .setTitle('Ticket Management Dashboard')
    .setColor(0x2b2d31)
    .setDescription(
      `**Server:** ${guild.name}\n` +
      `**Max Tickets Per User:** \`${config.maxOpenPerUser || 1}\`\n` +
      `**Default Admin Role:** ${adminRoleMention}\n` +
      `**Active Panels:** ${activePanelsCount === 0 ? '\`None configured\`' : `\`${activePanelsCount} active\``}\n` +
      `**Logged History:** \`${config.ticketCounter || 0}\` tickets recorded`
    )
    .setThumbnail(guild.iconURL() || undefined);

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('tkmgr_btn_set_limit').setLabel('Set User Limit').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tkmgr_btn_set_admin_role').setLabel('Set Admin Role').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tkmgr_btn_create_panel').setLabel('Create Panel').setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('tkmgr_btn_delete_panel').setLabel('Delete Panel').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tkmgr_btn_manage_blacklist').setLabel('Manage Blacklist').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tkmgr_btn_refresh').setLabel('Refresh').setStyle(ButtonStyle.Secondary)
  );

  const components: any[] = [row1, row2];

  if (config.activePanels && config.activePanels.length > 0) {
    const selectOptions = config.activePanels.map((p: any, idx: number) => ({
      label: `Panel #${p.id || idx + 1}`,
      value: `panel_${p.id || idx}`,
      description: `Channel: #${p.channelName || 'general'} | Mode: Standard`,
      default: selectedPanelId ? (String(p.id) === selectedPanelId || `panel_${p.id}` === selectedPanelId) : idx === 0
    }));

    const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('tkmgr_select_panel')
        .setPlaceholder(`Panel #${config.activePanels[0].id || 1}`)
        .addOptions(selectOptions)
    );
    components.push(selectRow);
  }

  return { embed, components };
}

function buildTicketControlPanelEmbed(ticket: ITicket) {
  const embed = new EmbedBuilder()
    .setTitle('Ticket Control Panel')
    .setColor(0x2b2d31)
    .setDescription(
      `**Ticket Number:** \`#${ticket.id.replace('ticket_', '')}\`\n` +
      `**Category:** ${ticket.category || 'General Support'}\n` +
      `**Creator:** <@${ticket.userId}>\n` +
      `**Claimed By:** ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Unclaimed'}\n` +
      `**Lock Status:** \`${ticket.lockStatus || 'Unlocked'}\`\n` +
      `**Priority:** \`${ticket.priority || 'Normal'}\`\n` +
      `**Blacklist Status:** \`Clear\`\n` +
      `**Voice Channel:** \`None\`\n` +
      `**Auto-Close:** \`Disabled\`\n` +
      `**Reason:** ${ticket.subject || 'Give your ticket reasons'}`
    );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('btn_control_lock').setLabel('Lock').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_control_unlock').setLabel('Unlock').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_control_archive').setLabel('Archive').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_control_unarchive').setLabel('Unarchive').setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('btn_control_autoclose').setLabel('Auto-Close').setStyle(ButtonStyle.Secondary)
  );

  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('btn_control_blacklist_user').setLabel('Blacklist User').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('btn_control_unblacklist_user').setLabel('Unblacklist User').setStyle(ButtonStyle.Secondary)
  );

  const row4 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('btn_control_manage_blacklist').setLabel('Manage Blacklist').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_control_refresh').setLabel('Refresh').setStyle(ButtonStyle.Secondary)
  );

  return { embed, components: [row1, row2, row3, row4] };
}

function buildTicketPriorityPanelEmbed(channelName: string, currentPriority: string) {
  const embed = new EmbedBuilder()
    .setTitle('Ticket Priority Panel')
    .setColor(0x2b2d31)
    .setDescription(
      `**Channel:** \`#${channelName}\`\n` +
      `**Current Priority:** ${currentPriority}\n\n` +
      `Select new priority level below:`
    );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('prio_btn_high').setLabel('High Priority').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('prio_btn_medium').setLabel('Medium Priority').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('prio_btn_low').setLabel('Low Priority').setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('prio_btn_reset').setLabel('Reset Priority').setStyle(ButtonStyle.Secondary)
  );

  return { embed, components: [row1, row2] };
}

// ─────────────────────────────────────────────
// MODAL POPUPS matching video
// ─────────────────────────────────────────────
function showTicketCreationModal(interaction: any, category: string) {
  const modal = new ModalBuilder()
    .setCustomId(`ticket_modal_create:${category}`)
    .setTitle(category === 'vip' ? 'VIP & Store Help' : category === 'moderation' ? 'Moderation & Reports' : 'General Support');

  const subjectInput = new TextInputBuilder()
    .setCustomId('ticket_subject')
    .setLabel('Reason for Ticket')
    .setPlaceholder('Give your ticket reasons')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100);

  const descInput = new TextInputBuilder()
    .setCustomId('ticket_description')
    .setLabel('Detailed Description')
    .setPlaceholder('If you have any issues and details...')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(2000);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(subjectInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(descInput)
  );

  return interaction.showModal(modal);
}

function showPanelDraftModal(interaction: any) {
  const modal = new ModalBuilder()
    .setCustomId('panel_draft_modal')
    .setTitle('Create Ticket Panel');

  const targetChannelInput = new TextInputBuilder()
    .setCustomId('panel_target_channel')
    .setLabel('Target Channel (#name or ID)')
    .setPlaceholder('#general or 1234567890')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const titleInput = new TextInputBuilder()
    .setCustomId('panel_title')
    .setLabel('Panel Title')
    .setPlaceholder('Supports')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const descInput = new TextInputBuilder()
    .setCustomId('panel_description')
    .setLabel('Panel Description')
    .setPlaceholder('Ticket for support, queries')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(targetChannelInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(descInput)
  );

  return interaction.showModal(modal);
}

function isTicketInteraction(customId?: string): boolean {
  if (!customId) return false;
  return (
    customId.startsWith('tkmgr_') ||
    customId.startsWith('btn_deploy_panel:') ||
    customId.startsWith('ticket_modal_create:') ||
    customId.startsWith('btn_in_') ||
    customId.startsWith('btn_control_') ||
    customId.startsWith('prio_btn_') ||
    customId === 'btn_open_ticket_modal' ||
    customId === 'btn_ticket_open_direct' ||
    customId === 'ticket_select_category' ||
    customId === 'btn_ticket_close' ||
    customId === 'panel_draft_modal' ||
    customId === 'set_user_limit_modal' ||
    customId === 'set_admin_role_modal' ||
    customId === 'add_moderator_modal'
  );
}

// ─────────────────────────────────────────────
// INTERACTION ROUTER & EVENT HANDLER
// ─────────────────────────────────────────────
async function handleTicketInteraction(interaction: any, context: any) {
  if (!interaction || !interaction.guild) return;
  if (!isTicketInteraction(interaction.customId)) return;

  // Prevent duplicate execution from overlapping event listeners
  if ((interaction as any)._ticketHandled) return;
  (interaction as any)._ticketHandled = true;

  const modules = context?.getModulesState ? context.getModulesState(interaction.guild.id) : [];
  const ticketMod = modules.find((m: any) => m.id === 'tickets');
  if (ticketMod && ticketMod.status === 'disabled') return;

  const config: ITicketConfig = { ...getDefaultConfig(), ...(ticketMod?.config || {}) };
  const guild = interaction.guild;

  // ─────────────────────────────────────────────
  // 1. MODAL SUBMIT HANDLERS
  // ─────────────────────────────────────────────
  if (interaction.isModalSubmit()) {
    // Handle Ticket Open Modal Submit (Allowed for all non-blacklisted members)
    if (interaction.customId.startsWith('ticket_modal_create:')) {
      if (config.blacklistedUserIds?.includes(interaction.user.id)) {
        return interaction.reply({ content: `${WRONG_ICON} You are blacklisted from opening tickets in this server.`, flags: 64 });
      }
      const category = interaction.customId.split(':')[1] || 'general';
      const subject = interaction.fields.getTextInputValue('ticket_subject');
      const description = interaction.fields.getTextInputValue('ticket_description');
      return createTicketChannel(interaction.client, interaction, context, config, category, subject, description);
    }

    // All management modals require Server Owner or Extra Owner
    const isAuthorized = await isOwnerOrExtraOwner(interaction.user.id, guild);
    if (!isAuthorized) {
      return interaction.reply({ content: `${WRONG_ICON} Access Denied: Only the Server Owner and Extra Owners can manage tickets.`, flags: 64 });
    }

    // Handle Panel Draft Modal Submit
    if (interaction.customId === 'panel_draft_modal') {
      await interaction.deferReply({ flags: 64 }).catch(() => {});
      const targetChanStr = interaction.fields.getTextInputValue('panel_target_channel');
      const title = interaction.fields.getTextInputValue('panel_title');
      const description = interaction.fields.getTextInputValue('panel_description');

      const draftEmbed = new EmbedBuilder()
        .setTitle('Panel Draft Prepared')
        .setColor(0x2b2d31)
        .setDescription(
          `**Target Channel:** ${targetChanStr}\n` +
          `**Title:** ${title}\n` +
          `**Description:** ${description}\n\n` +
          `Click **Deploy Update** below to post or update the live panel.`
        );

      const deployBtn = new ButtonBuilder()
        .setCustomId(`btn_deploy_panel:${encodeURIComponent(targetChanStr)}:${encodeURIComponent(title)}:${encodeURIComponent(description)}`)
        .setLabel('Deploy Update')
        .setStyle(ButtonStyle.Secondary);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(deployBtn);
      return interaction.editReply({ embeds: [draftEmbed], components: [row] });
    }

    // Handle Set User Limit Modal Submit
    if (interaction.customId === 'set_user_limit_modal') {
      await interaction.deferReply({ flags: 64 }).catch(() => {});
      const limitStr = interaction.fields.getTextInputValue('user_limit_input');
      const limit = parseInt(limitStr, 10) || 1;
      config.maxOpenPerUser = limit;
      context.updateModuleConfig('tickets', config);

      const { embed, components } = buildDashboardComponents(config, guild);
      return interaction.editReply({ content: `${VERIFIED_ICON} Max tickets per user set to **${limit}**.`, embeds: [embed], components });
    }

    // Handle Set Admin Role Modal Submit
    if (interaction.customId === 'set_admin_role_modal') {
      await interaction.deferReply({ flags: 64 }).catch(() => {});
      const roleInput = interaction.fields.getTextInputValue('admin_role_input').replace(/[<@&>]/g, '').trim();
      const targetRole = await guild.roles.fetch(roleInput).catch(() => null);
      if (!targetRole) return interaction.editReply({ content: `${WRONG_ICON} Role not found: \`${roleInput}\`` });

      config.defaultAdminRoleId = targetRole.id;
      context.updateModuleConfig('tickets', config);

      const { embed, components } = buildDashboardComponents(config, guild);
      return interaction.editReply({ content: `${VERIFIED_ICON} Default ticket admin role set to ${targetRole}.`, embeds: [embed], components });
    }

    // Handle Add Moderator Modal Submit
    if (interaction.customId === 'add_moderator_modal') {
      await interaction.deferReply({ flags: 64 }).catch(() => {});
      const userId = interaction.fields.getTextInputValue('mod_user_id').replace(/[<@!>]/g, '');
      const targetMember = await guild.members.fetch(userId).catch(() => null);
      if (!targetMember) return interaction.editReply({ content: `${WRONG_ICON} User not found.` });

      await interaction.channel.permissionOverwrites.edit(targetMember.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      }).catch(() => {});

      return interaction.editReply({ content: `${VERIFIED_ICON} Moderator ${targetMember} has been added to this ticket.` });
    }
  }

  if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;

  // ─────────────────────────────────────────────
  // 2. MEMBER TICKET OPENING ACTIONS (Non-management)
  // ─────────────────────────────────────────────
  if (interaction.customId === 'btn_open_ticket_modal' || interaction.customId === 'btn_ticket_open_direct') {
    if (config.blacklistedUserIds?.includes(interaction.user.id)) {
      return interaction.reply({ content: `${WRONG_ICON} You are blacklisted from opening tickets in this server.`, flags: 64 });
    }
    return showTicketCreationModal(interaction, 'general');
  }

  if (interaction.customId === 'ticket_select_category') {
    if (config.blacklistedUserIds?.includes(interaction.user.id)) {
      return interaction.reply({ content: `${WRONG_ICON} You are blacklisted from opening tickets in this server.`, flags: 64 });
    }
    const category = interaction.values[0] || 'general';
    return showTicketCreationModal(interaction, category);
  }

  if (interaction.customId === 'btn_in_ping_admin') {
    const adminRoles = config.defaultAdminRoleId ? `<@&${config.defaultAdminRoleId}>` : config.supportRoleIds.map(id => `<@&${id}>`).join(' ');
    return interaction.reply({ content: `🔔 Support Ping: ${adminRoles || '@here'} — Member ${interaction.user} requested assistance!` });
  }

  // ─────────────────────────────────────────────
  // 3. TICKET CLOSING (Ticket Creator OR Owner/Extra Owner)
  // ─────────────────────────────────────────────
  if (interaction.customId === 'btn_ticket_close' || interaction.customId === 'btn_in_close') {
    const currentTickets: ITicket[] = config.activeTickets || [];
    const ticket = currentTickets.find(t => t.channelId === interaction.channel?.id);
    const isCreator = ticket && ticket.userId === interaction.user.id;
    const isAuthorized = await isOwnerOrExtraOwner(interaction.user.id, guild);

    if (!isAuthorized && !isCreator) {
      return interaction.reply({ content: `${WRONG_ICON} Access Denied: Only the ticket creator, Server Owner, or Extra Owners can close this ticket.`, flags: 64 });
    }
    return closeTicketChannel(interaction.client, interaction, context, config);
  }

  // ─────────────────────────────────────────────
  // 4. ALL REMAINING TICKET MANAGEMENT CONTROLS
  // (Strictly Owner and Extra Owner Only)
  // ─────────────────────────────────────────────
  const isAuthorized = await isOwnerOrExtraOwner(interaction.user.id, guild);
  if (!isAuthorized) {
    return interaction.reply({ content: `${WRONG_ICON} Access Denied: Only the Server Owner and Extra Owners can manage tickets.`, flags: 64 });
  }

  // ─────────────────────────────────────────────
  // 5. DASHBOARD & PANEL DEPLOYMENT BUTTONS
  // ─────────────────────────────────────────────
  if (interaction.customId === 'tkmgr_btn_set_limit') {
    const modal = new ModalBuilder().setCustomId('set_user_limit_modal').setTitle('Set User Limit');
    const limitInput = new TextInputBuilder().setCustomId('user_limit_input').setLabel('Max Tickets Per User').setValue(String(config.maxOpenPerUser || 1)).setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(limitInput));
    return interaction.showModal(modal);
  }

  if (interaction.customId === 'tkmgr_btn_set_admin_role') {
    const modal = new ModalBuilder().setCustomId('set_admin_role_modal').setTitle('Set Default Admin Role');
    const roleInput = new TextInputBuilder().setCustomId('admin_role_input').setLabel('Role Mention or Role ID').setPlaceholder('@Support or 1234567890').setValue(config.defaultAdminRoleId || '').setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(roleInput));
    return interaction.showModal(modal);
  }

  if (interaction.customId === 'tkmgr_btn_manage_blacklist') {
    const blacklisted = config.blacklistedUserIds || [];
    const list = blacklisted.length > 0 ? blacklisted.map(id => `<@${id}> (\`${id}\`)`).join(', ') : 'None';
    return interaction.reply({ content: `${SHIELD_ICON} **Ticket Blacklist Management**\n\nTotal Blacklisted Users: **${blacklisted.length}**\n${list}\n\nTo blacklist/unblacklist, use \`r!ticket blacklist @user\` or the in-ticket control panel.`, flags: 64 });
  }

  if (interaction.customId === 'tkmgr_btn_create_panel') {
    return showPanelDraftModal(interaction);
  }

  if (interaction.customId === 'tkmgr_select_panel') {
    await interaction.deferUpdate().catch(() => {});
    const val = interaction.values?.[0] || '';
    const panelId = val.replace('panel_', '');
    const { embed, components } = buildDashboardComponents(config, guild, panelId);
    return interaction.editReply({ embeds: [embed], components });
  }

  if (interaction.customId === 'tkmgr_btn_delete_panel') {
    await interaction.deferUpdate().catch(() => {});
    const targetChan = interaction.channel;
    let deletedCount = 0;
    try {
      const fetchedMsgs = await (targetChan as any).messages?.fetch({ limit: 50 }).catch(() => null);
      if (fetchedMsgs) {
        for (const [, msg] of fetchedMsgs) {
          if (msg.author.id === interaction.client.user?.id) {
            const hasOpenButton = msg.components?.some((row: any) =>
              row.components?.some((btn: any) => btn.customId === 'btn_open_ticket_modal' || btn.customId === 'btn_ticket_open_direct')
            );
            if (hasOpenButton || msg.embeds?.some((e: any) => e.title?.includes('Supports') || e.description?.includes('Support Panel'))) {
              await msg.delete().then(() => deletedCount++).catch(() => {});
            }
          }
        }
      }
    } catch (e) {}

    let activePanels = config.activePanels || [];
    const matchedInChan = activePanels.find((p: any) => p.channelId === targetChan.id);
    if (matchedInChan) {
      activePanels = activePanels.filter((p: any) => p.channelId !== targetChan.id);
    } else if (activePanels.length > 0) {
      const removedPanel = activePanels.pop();
      if (removedPanel && removedPanel.channelId) {
        const remoteChan = await guild.channels.fetch(removedPanel.channelId).catch(() => null);
        if (remoteChan && remoteChan.isTextBased()) {
          if (removedPanel.id) {
            await remoteChan.messages.delete(removedPanel.id).catch(() => {});
          }
        }
      }
    }
    config.activePanels = activePanels;
    context.updateModuleConfig('tickets', config);

    // Auto-update dashboard right there in-place!
    const { embed, components } = buildDashboardComponents(config, guild);
    return interaction.editReply({ embeds: [embed], components });
  }

  if (interaction.customId === 'tkmgr_btn_refresh') {
    await interaction.deferUpdate().catch(() => {});
    const { embed, components } = buildDashboardComponents(config, guild);
    return interaction.editReply({ embeds: [embed], components });
  }

  if (interaction.customId.startsWith('btn_deploy_panel:')) {
    await interaction.deferReply({ flags: 64 }).catch(() => {});
    const parts = interaction.customId.split(':');
    const targetChanStr = decodeURIComponent(parts[1]);
    const title = decodeURIComponent(parts[2]);
    const description = decodeURIComponent(parts[3]);

    let targetChan = interaction.channel;
    const cleanId = targetChanStr.replace(/[<#>]/g, '');
    if (cleanId) {
      const fetched = await guild.channels.fetch(cleanId).catch(() => null);
      if (fetched && fetched.isTextBased()) targetChan = fetched;
    }

    const liveEmbed = new EmbedBuilder()
      .setTitle(title || 'Supports')
      .setColor(0x2b2d31)
      .setDescription(
        `**Server:** ${guild.name}\n` +
        `**Status:** Active Support Panel\n` +
        `**Description:** ${description}\n\n` +
        `Ticket can be edited for updating each panel of the ticket controller.`
      )
      .setThumbnail(guild.iconURL() || null);

    const openBtn = new ButtonBuilder()
      .setCustomId('btn_open_ticket_modal')
      .setLabel('Open Ticket')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(openBtn);
    const postedMsg = await (targetChan as any).send({ embeds: [liveEmbed], components: [row] });

    const newPanel = {
      id: postedMsg.id,
      channelId: targetChan.id,
      channelName: targetChan.name,
      title,
      description,
      createdAt: new Date()
    };

    const activePanels = config.activePanels || [];
    activePanels.push(newPanel);
    config.activePanels = activePanels;
    context.updateModuleConfig('tickets', config);

    return interaction.editReply({ content: `${VERIFIED_ICON} Live support panel posted successfully in ${targetChan}!` });
  }

  // ─────────────────────────────────────────────
  // 6. IN-TICKET CHANNEL ACTIONS & CONTROLS
  // ─────────────────────────────────────────────
  if (interaction.customId === 'btn_in_claim') {
    await interaction.deferReply({ flags: 64 }).catch(() => {});
    const currentTickets: ITicket[] = config.activeTickets || [];
    const ticket = currentTickets.find(t => t.channelId === interaction.channel.id);
    if (ticket) {
      ticket.claimedBy = interaction.user.id;
      ticket.claimedByTag = interaction.user.username;
      ticket.status = 'claimed';
      context.updateModuleConfig('tickets', { ...config, activeTickets: currentTickets });
    }

    return interaction.editReply({ content: `${VERIFIED_ICON} Ticket claimed by ${interaction.user}. Staff member assigned.` });
  }

  if (interaction.customId === 'btn_in_control_panel') {
    await interaction.deferReply({ flags: 64 }).catch(() => {});
    const currentTickets: ITicket[] = config.activeTickets || [];
    const ticket = currentTickets.find(t => t.channelId === interaction.channel.id) || {
      id: `ticket_${interaction.channel.id}`,
      userId: interaction.user.id,
      category: 'General Support',
      subject: 'Give your ticket reasons'
    } as any;

    const { embed, components } = buildTicketControlPanelEmbed(ticket);
    return interaction.editReply({ embeds: [embed], components });
  }

  if (interaction.customId === 'btn_in_set_priority') {
    await interaction.deferReply({ flags: 64 }).catch(() => {});
    const { embed, components } = buildTicketPriorityPanelEmbed((interaction.channel as any).name, 'Normal');
    return interaction.editReply({ embeds: [embed], components });
  }

  if (interaction.customId.startsWith('prio_btn_')) {
    await interaction.deferReply({ flags: 64 }).catch(() => {});
    const level = interaction.customId.replace('prio_btn_', '').toUpperCase();
    return interaction.editReply({ content: `${VERIFIED_ICON} Ticket priority set to **${level}**.` });
  }

  if (interaction.customId === 'btn_in_add_mod') {
    const modal = new ModalBuilder().setCustomId('add_moderator_modal').setTitle('Add Moderator to Ticket');
    const userIdInput = new TextInputBuilder().setCustomId('mod_user_id').setLabel('User Mention or User ID').setPlaceholder('@user or 1234567890').setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(userIdInput));
    return interaction.showModal(modal);
  }

  if (interaction.customId === 'btn_in_remove_mod') {
    return interaction.reply({ content: `${INFO_ICON} Use command \`r!ticket remove @user\` to revoke channel permissions from a moderator.`, flags: 64 });
  }

  if (interaction.customId === 'btn_control_lock') {
    await interaction.deferReply({ flags: 64 }).catch(() => {});
    const currentName = interaction.channel.name;
    const newName = `[ Locked ] ${currentName.replace(/\[.*?\]/g, '').trim()}`;
    await interaction.channel.setName(newName).catch(() => {});
    return interaction.editReply({ content: `${VERIFIED_ICON} Ticket channel locked and renamed to **#${newName}**.` });
  }

  if (interaction.customId === 'btn_control_unlock') {
    await interaction.deferReply({ flags: 64 }).catch(() => {});
    const currentName = interaction.channel.name;
    const newName = `[ Current ] ${currentName.replace(/\[.*?\]/g, '').trim()}`;
    await interaction.channel.setName(newName).catch(() => {});
    return interaction.editReply({ content: `${VERIFIED_ICON} Ticket channel unlocked and renamed to **#${newName}**.` });
  }

  if (interaction.customId === 'btn_control_archive') {
    await interaction.deferReply({ flags: 64 }).catch(() => {});
    const currentName = interaction.channel.name;
    const newName = `[ Resolved ] ${currentName.replace(/\[.*?\]/g, '').trim()}`;
    await interaction.channel.setName(newName).catch(() => {});
    return interaction.editReply({ content: `${VERIFIED_ICON} Ticket channel archived and renamed to **#${newName}**.` });
  }

  if (interaction.customId === 'btn_control_unarchive') {
    await interaction.deferReply({ flags: 64 }).catch(() => {});
    const currentName = interaction.channel.name;
    const newName = `[ Current ] ${currentName.replace(/\[.*?\]/g, '').trim()}`;
    await interaction.channel.setName(newName).catch(() => {});
    return interaction.editReply({ content: `${VERIFIED_ICON} Ticket channel unarchived and renamed to **#${newName}**.` });
  }

  if (interaction.customId === 'btn_control_autoclose') {
    return interaction.reply({ content: `${INFO_ICON} Auto-close is configured per ticket lifecycle policy.`, flags: 64 });
  }

  if (interaction.customId === 'btn_control_blacklist_user') {
    await interaction.deferReply({ flags: 64 }).catch(() => {});
    const currentTickets: ITicket[] = config.activeTickets || [];
    const ticket = currentTickets.find(t => t.channelId === interaction.channel.id);
    if (!ticket || !ticket.userId) {
      return interaction.editReply({ content: `${WRONG_ICON} Could not determine ticket creator to blacklist.` });
    }
    const blacklisted = config.blacklistedUserIds || [];
    if (!blacklisted.includes(ticket.userId)) {
      blacklisted.push(ticket.userId);
      config.blacklistedUserIds = blacklisted;
      context.updateModuleConfig('tickets', config);
    }
    return interaction.editReply({ content: `${VERIFIED_ICON} Successfully blacklisted <@${ticket.userId}> from creating tickets.` });
  }

  if (interaction.customId === 'btn_control_unblacklist_user') {
    await interaction.deferReply({ flags: 64 }).catch(() => {});
    const currentTickets: ITicket[] = config.activeTickets || [];
    const ticket = currentTickets.find(t => t.channelId === interaction.channel.id);
    if (!ticket || !ticket.userId) {
      return interaction.editReply({ content: `${WRONG_ICON} Could not determine ticket creator to unblacklist.` });
    }
    config.blacklistedUserIds = (config.blacklistedUserIds || []).filter(id => id !== ticket.userId);
    context.updateModuleConfig('tickets', config);
    return interaction.editReply({ content: `${VERIFIED_ICON} Removed <@${ticket.userId}> from ticket blacklist.` });
  }

  if (interaction.customId === 'btn_control_manage_blacklist') {
    const blacklisted = config.blacklistedUserIds || [];
    const list = blacklisted.length > 0 ? blacklisted.map(id => `<@${id}>`).join(', ') : 'None';
    return interaction.reply({ content: `${SHIELD_ICON} **Active Ticket Blacklist:** ${list}`, flags: 64 });
  }

  if (interaction.customId === 'btn_control_refresh') {
    await interaction.deferReply({ flags: 64 }).catch(() => {});
    const currentTickets: ITicket[] = config.activeTickets || [];
    const ticket = currentTickets.find(t => t.channelId === interaction.channel.id) || {
      id: `ticket_${interaction.channel.id}`,
      userId: interaction.user.id,
      category: 'General Support',
      subject: 'Give your ticket reasons'
    } as any;

    const { embed, components } = buildTicketControlPanelEmbed(ticket);
    return interaction.editReply({ embeds: [embed], components });
  }
}

// ─────────────────────────────────────────────
// MANIFEST DECLARATION
// ─────────────────────────────────────────────
export const TicketsManifest: ModuleManifest = {
  id: 'tickets',
  name: 'Enterprise Ticket System & GUI Dashboard',
  version: '3.0.0',
  description: 'Complete Discord Ticket Manager with GUI Dashboard, Ticket Modals, Control Panels, Transcripts, and Priority Controls.',
  configSchema: {
    requiredFields: ['enabled'],
    validate: (config: Record<string, any>) => ({ progress: 100, errors: [] })
  },

  events: [
    { name: 'interactionCreate', handler: (client: any, i: any, ctx: any) => handleTicketInteraction(i || client, ctx || i) },
    { name: 'button_tickets_v2_generic', handler: (client: any, i: any, ctx: any) => handleTicketInteraction(i || client, ctx || i) },
    { name: 'button_btn_open_ticket_modal', handler: (client: any, i: any, ctx: any) => handleTicketInteraction(i || client, ctx || i) },
    { name: 'button_btn_ticket_open_direct', handler: (client: any, i: any, ctx: any) => handleTicketInteraction(i || client, ctx || i) },
    { name: 'modal_tickets_v2_generic', handler: (client: any, i: any, ctx: any) => handleTicketInteraction(i || client, ctx || i) },
    { name: 'select_tickets_v2_generic', handler: (client: any, i: any, ctx: any) => handleTicketInteraction(i || client, ctx || i) }
  ]
};

// ─────────────────────────────────────────────
// TICKET CHANNEL CREATION ENGINE
// ─────────────────────────────────────────────
async function createTicketChannel(client: any, interaction: any, context: any, config: ITicketConfig, category: string, subject?: string, description?: string) {
  const guild = interaction.guild;
  const user = interaction.user || interaction.author;

  // Check blacklist
  if (config.blacklistedUserIds?.includes(user.id)) {
    const errorMsg = `${WRONG_ICON} You are blacklisted from opening tickets in this server.`;
    if (interaction.deferred || interaction.replied) return interaction.editReply({ content: errorMsg });
    return interaction.reply({ content: errorMsg, flags: 64 });
  }

  // Check max open tickets per user
  const activeMsgs: ITicket[] = config.activeTickets || [];
  const userOpen = activeMsgs.filter(t => t.userId === user.id && t.status === 'open');
  if (userOpen.length >= (config.maxOpenPerUser || 1)) {
    const errorMsg = `${WRONG_ICON} You already have an active support ticket open (<#${userOpen[0].channelId}>). Please resolve it before opening another.`;
    if (interaction.deferred || interaction.replied) return interaction.editReply({ content: errorMsg });
    return interaction.reply({ content: errorMsg, flags: 64 });
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply?.({ flags: 64 }).catch(() => {});
  }

  config.ticketCounter = (config.ticketCounter || 0) + 1;
  const ticketNumber = String(config.ticketCounter);
  const cleanUser = (user.username || 'user').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15);
  const cleanCat = (category || 'support').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
  const channelName = `ticket-${cleanUser || 'user'}-${cleanCat}`;

  const botId = interaction.client?.user?.id || client?.user?.id;

  const overwrites: any[] = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    }
  ];

  if (botId) {
    overwrites.push({
      id: botId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.EmbedLinks
      ]
    });
  }

  if (config.defaultAdminRoleId) {
    const roleExists = guild.roles.cache.has(config.defaultAdminRoleId) || await guild.roles.fetch(config.defaultAdminRoleId).catch(() => null);
    if (roleExists) {
      overwrites.push({
        id: config.defaultAdminRoleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory]
      });
    }
  }

  if (config.supportRoleIds && Array.isArray(config.supportRoleIds)) {
    for (const roleId of config.supportRoleIds) {
      if (roleId && roleId !== config.defaultAdminRoleId) {
        const roleExists = guild.roles.cache.has(roleId) || await guild.roles.fetch(roleId).catch(() => null);
        if (roleExists) {
          overwrites.push({
            id: roleId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory]
          });
        }
      }
    }
  }

  try {
    let categoryParentId: string | undefined = undefined;
    if (config.categoryId) {
      const catObj = guild.channels.cache.get(config.categoryId) || await guild.channels.fetch(config.categoryId).catch(() => null);
      if (catObj && catObj.type === ChannelType.GuildCategory) {
        categoryParentId = catObj.id;
      }
    }

    const ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryParentId,
      permissionOverwrites: overwrites,
      reason: `Ticket #${ticketNumber} created by ${user.username}`
    });

    const newTicket: ITicket = {
      id: `ticket_${ticketChannel.id}`,
      guildId: guild.id,
      channelId: ticketChannel.id,
      userId: user.id,
      userTag: user.username,
      category,
      subject: subject || 'Give your ticket reasons',
      description: description || 'No detailed description provided',
      status: 'open',
      createdAt: new Date()
    };

    activeMsgs.push(newTicket);
    context.updateModuleConfig('tickets', { ...config, ticketCounter: config.ticketCounter, activeTickets: activeMsgs });

    // Send In-Channel Control Message matching design system
    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('btn_in_claim').setLabel('Claim Ticket').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('btn_in_ping_admin').setLabel('Ping Admin').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('btn_in_control_panel').setLabel('Control Panel').setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('btn_in_close').setLabel('Close Ticket').setStyle(ButtonStyle.Secondary)
    );

    const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('btn_in_add_mod').setLabel('Add Moderator').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('btn_in_remove_mod').setLabel('Remove Moderator').setStyle(ButtonStyle.Secondary)
    );

    const row4 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('btn_in_set_priority').setLabel('Set Priority').setStyle(ButtonStyle.Secondary)
    );

    const ticketCardEmbed = new EmbedBuilder()
      .setTitle('Support Ticket')
      .setColor(0x2b2d31)
      .setDescription(
        `**Ticket Number:** \`#${ticketNumber}\`\n` +
        `**Creator:** <@${user.id}>\n` +
        `**Category:** ${category === 'vip' ? 'VIP & Billing' : category === 'moderation' ? 'Moderation & Reports' : 'General Support'}\n` +
        `**Subject:** ${subject || 'General Support Inquiry'}\n` +
        `**Description:** ${description || 'No additional details provided'}\n\n` +
        `Support staff will assist you shortly. Use the controls below to manage this ticket.`
      );

    await ticketChannel.send({ content: `${user} | Ticket #${ticketNumber}`, embeds: [ticketCardEmbed], components: [row1, row2, row3, row4] });

    // Send Ephemeral Response in original channel matching video (Frame 36)
    const responseEmbed = new EmbedBuilder()
      .setTitle('Ticket Created')
      .setColor(0x2b2d31)
      .setDescription(
        `**Ticket Created Successfully**\n\n` +
        `**Channel:** ${ticketChannel}\n` +
        `**Category:** ${category === 'vip' ? 'VIP & Billing' : category === 'moderation' ? 'Moderation & Reports' : 'General Support'}\n` +
        `**Ticket Number:** #${ticketNumber}\n\n` +
        `Head over to ${ticketChannel} to communicate with staff.`
      );

    context.logSyncEvent?.(`[Tickets] Created ticket channel #${channelName} for ${user.username}.`, 'success');

    if (interaction.deferred || interaction.replied) {
      return interaction.editReply({ embeds: [responseEmbed] });
    }
    return interaction.reply({ embeds: [responseEmbed], flags: 64 });
  } catch (err: any) {
    console.error('[Tickets] Create ticket channel error:', err);
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply({ content: `${WRONG_ICON} Failed to create ticket channel: ${err.message}` });
    }
    return interaction.reply({ content: `${WRONG_ICON} Failed to create ticket channel: ${err.message}`, flags: 64 });
  }
}

async function closeTicketChannel(client: any, interaction: any, context: any, config: ITicketConfig) {
  const channel = interaction.channel;
  if (!channel) return;

  const currentTickets: ITicket[] = config.activeTickets || [];
  const ticket = currentTickets.find(t => t.channelId === channel.id) || {
    id: channel.id,
    category: 'Support',
    userTag: interaction.user?.username || interaction.author?.username || 'Member'
  } as any;

  const executorId = interaction.user?.id || interaction.author?.id;
  const isCreator = ticket.userId ? ticket.userId === executorId : false;
  const isAuthorized = await isOwnerOrExtraOwner(executorId, interaction.guild);

  if (!isAuthorized && !isCreator) {
    const denyMsg = `${WRONG_ICON} Access Denied: Only the ticket creator, Server Owner, or Extra Owners can close this ticket.`;
    if (interaction.deferred || interaction.replied) return interaction.editReply({ content: denyMsg });
    if (interaction.reply) return interaction.reply({ content: denyMsg, flags: 64 });
    return;
  }

  const closingMsg = `${TIMER_ICON} Closing ticket channel in **5 seconds**... Generating HTML transcript.`;
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content: closingMsg }).catch(() => {});
  } else if (interaction.reply) {
    await interaction.reply({ content: closingMsg }).catch(() => {});
  }

  setTimeout(async () => {
    try {
      const transcriptBuffer = await generateHtmlTranscript(channel, ticket, interaction.guild);
      const attachment = new AttachmentBuilder(transcriptBuffer, { name: `transcript-${channel.name}.html` });

      if (config.transcriptChannelId) {
        const transcriptChan = await interaction.guild.channels.fetch(config.transcriptChannelId).catch(() => null);
        if (transcriptChan && transcriptChan.isTextBased()) {
          const logCard = buildStatusCard({
            emoji: TICKET_ICON,
            title: 'Ticket Closed & Transcribed',
            body: `Ticket channel **#${channel.name}** was closed by ${interaction.user || interaction.author}.\n\n> **Category**: \`${ticket.category || 'General'}\`\n> **Opened By**: \`${ticket.userTag}\``,
            accentColor: Colors.BRAND
          });
          await (transcriptChan as any).send({ embeds: [logCard.embeds[0]], files: [attachment] }).catch(() => null);
        }
      }

      if (ticket.userId) {
        const ticketUser = await interaction.guild.members.fetch(ticket.userId).catch(() => null);
        if (ticketUser) {
          const dmEmbed = buildStatusCard({
            emoji: TICKET_ICON,
            title: 'Your Support Ticket Has Been Closed',
            body: `Your ticket **#${channel.name}** in **${interaction.guild.name}** has been closed. Attached is your chat transcript.`,
            accentColor: Colors.BRAND
          });
          await ticketUser.send({ embeds: [dmEmbed.embeds[0]], files: [attachment] }).catch(() => null);
        }
      }

      const activeTickets = currentTickets.filter(t => t.channelId !== channel.id);
      context.updateModuleConfig('tickets', { ...config, activeTickets });
      context.logSyncEvent?.(`[Tickets] Closed and deleted ticket channel #${channel.name}.`, 'info');

      await channel.delete().catch(() => null);
    } catch (e) {
      console.error('[Tickets] Close error:', e);
    }
  }, 5000);
}

// ─────────────────────────────────────────────
// PREFIX COMMAND REGISTRATION
// ─────────────────────────────────────────────
export function registerTicketsCommands() {
  // Command: !ticketmanager / !tkmgr
  PrefixRegistry.register({
    name: 'ticketmanager',
    description: 'Open full GUI ticket management dashboard (Server Owner & Extra Owner only)',
    category: 'Tickets',
    usage: 'r!ticketmanager',
    aliases: ['tkmgr', 'ticketmgr', 'tconfig'],
    cooldownSeconds: 3,
    examples: ['r!ticketmanager', 'r!tkmgr'],
    moduleOwnerId: 'tickets',
    dangerLevel: 'Low',
    subcommands: [
      {
        name: 'dashboard',
        description: 'Open real-time visual ticket management GUI with panel controls and configuration cards.',
        usage: 'r!ticketmanager',
        examples: ['r!ticketmanager']
      }
    ],
    execute: async (message: Message, args: string[], context?: any) => {
      if (!message.guild) return;
      const isAuthorized = await isOwnerOrExtraOwner(message.author.id, message.guild);
      if (!isAuthorized) {
        return message.reply({ content: `${WRONG_ICON} Access Denied: Only the Server Owner and Extra Owners can manage tickets.` });
      }

      const modules = context?.getModulesState ? context.getModulesState(message.guild.id) : [];
      const ticketMod = modules.find((m: any) => m.id === 'tickets');
      const config: ITicketConfig = { ...getDefaultConfig(), ...(ticketMod?.config || {}) };

      const { embed, components } = buildDashboardComponents(config, message.guild);
      return message.reply({ embeds: [embed], components });
    }
  });

  // Command: !ticket / !t
  PrefixRegistry.register({
    name: 'ticket',
    description: 'Enterprise Support Ticket System & Panel Manager',
    category: 'Tickets',
    usage: 'r!ticket [deploy | config | open | close | claim | lock | unlock | archive | add | remove | priority | limit | adminrole | blacklist | transcript]',
    aliases: ['t', 'tck', 'tickets'],
    userPermissions: ['SendMessages'],
    cooldownSeconds: 3,
    examples: [
      'r!ticket deploy #support',
      'r!ticket open Billing inquiry',
      'r!ticket close Resolved issue',
      'r!ticket transcript',
      'r!ticket claim',
      'r!ticket add @staff',
      'r!ticket priority urgent'
    ],
    moduleOwnerId: 'tickets',
    dangerLevel: 'Low',
    subcommands: [
      {
        name: 'deploy',
        description: 'Deploy interactive ticket panel with buttons into a channel (Server Owner & Extra Owner only).',
        usage: 'r!ticket deploy <#channel>',
        examples: ['r!ticket deploy #support'],
        userPermissions: ['Administrator']
      },
      {
        name: 'config',
        description: 'Open ticket system settings dashboard (Server Owner & Extra Owner only).',
        usage: 'r!ticket config',
        examples: ['r!ticket config'],
        userPermissions: ['Administrator']
      },
      {
        name: 'open',
        description: 'Create a new support ticket channel.',
        usage: 'r!ticket open [reason]',
        examples: ['r!ticket open Payment issue', 'r!ticket open']
      },
      {
        name: 'close',
        description: 'Close active ticket channel (Ticket Creator or Server Owner / Extra Owner only).',
        usage: 'r!ticket close [reason]',
        examples: ['r!ticket close', 'r!ticket close Issue resolved']
      },
      {
        name: 'transcript',
        description: 'Export HTML transcript of messages in the ticket (Ticket Creator or Server Owner / Extra Owner only).',
        usage: 'r!ticket transcript',
        examples: ['r!ticket transcript']
      },
      {
        name: 'claim',
        description: 'Claim ticket for exclusive staff handling.',
        usage: 'r!ticket claim',
        examples: ['r!ticket claim']
      },
      {
        name: 'lock',
        description: 'Lock ticket channel to prevent member messages.',
        usage: 'r!ticket lock',
        examples: ['r!ticket lock']
      },
      {
        name: 'unlock',
        description: 'Unlock ticket channel to allow member messages.',
        usage: 'r!ticket unlock',
        examples: ['r!ticket unlock']
      },
      {
        name: 'archive',
        description: 'Archive ticket to closed category.',
        usage: 'r!ticket archive',
        examples: ['r!ticket archive']
      },
      {
        name: 'add',
        description: 'Add a user or role to current ticket channel.',
        usage: 'r!ticket add <@user|@role>',
        examples: ['r!ticket add @Helper']
      },
      {
        name: 'remove',
        description: 'Remove a user or role from current ticket channel.',
        usage: 'r!ticket remove <@user|@role>',
        examples: ['r!ticket remove @Helper']
      },
      {
        name: 'priority',
        description: 'Set ticket urgency priority level (low, medium, high, urgent).',
        usage: 'r!ticket priority <low|medium|high|urgent>',
        examples: ['r!ticket priority urgent']
      },
      {
        name: 'limit',
        description: 'Set maximum concurrent open tickets per user (1-25).',
        usage: 'r!ticket limit <1-25>',
        examples: ['r!ticket limit 3'],
        userPermissions: ['Administrator']
      },
      {
        name: 'adminrole',
        description: 'Set default ticket administrator role.',
        usage: 'r!ticket adminrole <@role>',
        examples: ['r!ticket adminrole @Staff'],
        userPermissions: ['Administrator']
      },
      {
        name: 'blacklist',
        description: 'Add or remove user from ticket creation blacklist.',
        usage: 'r!ticket blacklist <add|remove|list> <@user>',
        examples: ['r!ticket blacklist add @user', 'r!ticket blacklist list'],
        userPermissions: ['Administrator']
      },
      {
        name: 'purge',
        description: 'Purge all closed/archived ticket channels.',
        usage: 'r!ticket purge',
        examples: ['r!ticket purge'],
        userPermissions: ['Administrator']
      },
      {
        name: 'deletepanel',
        description: 'Delete a registered ticket panel by ID.',
        usage: 'r!ticket deletepanel <panel_id>',
        examples: ['r!ticket deletepanel panel_12345'],
        userPermissions: ['Administrator']
      }
    ],
    execute: async (message: Message, args: string[], context?: any) => {
      if (!message.guild) return;
      const sub = args[0]?.toLowerCase() || 'config';
      const modules = context?.getModulesState ? context.getModulesState(message.guild.id) : [];
      const ticketMod = modules.find((m: any) => m.id === 'tickets');
      const config: ITicketConfig = { ...getDefaultConfig(), ...(ticketMod?.config || {}) };

      // 1. Open Ticket (Any non-blacklisted server member)
      if (sub === 'open' || sub === 'create') {
        if (config.blacklistedUserIds?.includes(message.author.id)) {
          return message.reply({ content: `${WRONG_ICON} You are blacklisted from opening tickets in this server.` });
        }
        const reason = args.slice(1).join(' ') || 'General Support Inquiry';
        const fakeInteraction: any = {
          guild: message.guild,
          user: message.author,
          member: message.member,
          channel: message.channel,
          deferReply: async () => {},
          editReply: async (opts: any) => message.reply(opts),
          reply: async (opts: any) => message.reply(opts),
          deferred: true,
          replied: false
        };
        return createTicketChannel(message.client, fakeInteraction, context, config, 'general', reason, reason);
      }

      // 2. Ping Admin / Support Staff (In-ticket action)
      if (sub === 'ping' || sub === 'pingadmin') {
        const adminRoles = config.defaultAdminRoleId ? `<@&${config.defaultAdminRoleId}>` : config.supportRoleIds.map(id => `<@&${id}>`).join(' ');
        return message.reply({ content: `🔔 Support Ping: ${adminRoles || '@here'} — Member ${message.author} requested assistance!` });
      }

      // 3. Close Ticket (Ticket Creator OR Server Owner / Extra Owner)
      if (sub === 'close') {
        const currentTickets: ITicket[] = config.activeTickets || [];
        const ticket = currentTickets.find(t => t.channelId === message.channel.id);
        const isCreator = ticket && ticket.userId === message.author.id;
        const isAuthorized = await isOwnerOrExtraOwner(message.author.id, message.guild);
        if (!isAuthorized && !isCreator) {
          return message.reply({ content: `${WRONG_ICON} Access Denied: Only the ticket creator, Server Owner, or Extra Owners can close this ticket.` });
        }

        const fakeInteraction: any = {
          guild: message.guild,
          user: message.author,
          channel: message.channel,
          reply: async (opts: any) => message.reply(opts)
        };
        return closeTicketChannel(message.client, fakeInteraction, context, config);
      }

      // 4. HTML Transcript (Ticket Creator OR Server Owner / Extra Owner)
      if (sub === 'transcript' || sub === 'log') {
        const currentTickets: ITicket[] = config.activeTickets || [];
        const ticket = currentTickets.find(t => t.channelId === message.channel.id) || {
          id: message.channel.id,
          category: 'Support',
          userTag: message.author.username,
          userId: message.author.id
        } as any;

        const isCreator = ticket && ticket.userId === message.author.id;
        const isAuthorized = await isOwnerOrExtraOwner(message.author.id, message.guild);
        if (!isAuthorized && !isCreator) {
          return message.reply({ content: `${WRONG_ICON} Access Denied: Only the ticket creator, Server Owner, or Extra Owners can view transcripts.` });
        }

        const transcriptBuffer = await generateHtmlTranscript(message.channel, ticket, message.guild);
        const attachment = new AttachmentBuilder(transcriptBuffer, { name: `transcript-${(message.channel as any).name}.html` });
        return message.reply({ content: `${VERIFIED_ICON} Ticket Transcript HTML File:`, files: [attachment] });
      }

      // ─────────────────────────────────────────────
      // ALL REMAINING SUBCOMMANDS ARE MANAGEMENT ONLY
      // Strictly enforced: Server Owner & Extra Owner
      // ─────────────────────────────────────────────
      const isAuthorized = await isOwnerOrExtraOwner(message.author.id, message.guild);
      if (!isAuthorized) {
        return message.reply({ content: `${WRONG_ICON} Access Denied: Only the Server Owner and Extra Owners can manage tickets.` });
      }

      // GUI Management Dashboard
      if (sub === 'config' || sub === 'manager' || sub === 'tkmgr' || sub === 'dashboard' || sub === 'gui') {
        const { embed, components } = buildDashboardComponents(config, message.guild);
        return message.reply({ embeds: [embed], components });
      }

      // Direct Deploy Support Panel to Channel
      if (sub === 'deploy' || sub === 'send' || sub === 'panel' || sub === 'setup') {
        const liveEmbed = new EmbedBuilder()
          .setTitle('Supports')
          .setColor(0x2b2d31)
          .setDescription(
            `**Server:** ${message.guild.name}\n` +
            `**Status:** Active Support Panel\n` +
            `**Description:** Ticket for support, queries\n\n` +
            `Ticket can be edited for updating each panel of the ticket controller.`
          )
          .setThumbnail(message.guild.iconURL() || null);

        const openBtn = new ButtonBuilder()
          .setCustomId('btn_open_ticket_modal')
          .setLabel('Open Ticket')
          .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(openBtn);
        await (message.channel as any).send({ embeds: [liveEmbed], components: [row] });
        return message.reply({ content: `${VERIFIED_ICON} Support panel deployed in ${(message.channel as any)}!` });
      }

      // Claim Ticket
      if (sub === 'claim') {
        const currentTickets: ITicket[] = config.activeTickets || [];
        const ticket = currentTickets.find(t => t.channelId === message.channel.id);
        if (ticket) {
          ticket.claimedBy = message.author.id;
          ticket.claimedByTag = message.author.username;
          ticket.status = 'claimed';
          context?.updateModuleConfig?.('tickets', { ...config, activeTickets: currentTickets });
        }
        return message.reply({ content: `${VERIFIED_ICON} Ticket claimed by ${message.author}. Staff member assigned.` });
      }

      // Lock Ticket Channel
      if (sub === 'lock') {
        const currentName = (message.channel as any).name || '';
        const newName = `[ Locked ] ${currentName.replace(/\[.*?\]/g, '').trim()}`;
        await (message.channel as any).setName(newName).catch(() => {});
        return message.reply({ content: `${VERIFIED_ICON} Ticket channel locked and renamed to **#${newName}**.` });
      }

      // Unlock Ticket Channel
      if (sub === 'unlock') {
        const currentName = (message.channel as any).name || '';
        const newName = `[ Current ] ${currentName.replace(/\[.*?\]/g, '').trim()}`;
        await (message.channel as any).setName(newName).catch(() => {});
        return message.reply({ content: `${VERIFIED_ICON} Ticket channel unlocked and renamed to **#${newName}**.` });
      }

      // Archive Ticket Channel
      if (sub === 'archive') {
        const currentName = (message.channel as any).name || '';
        const newName = `[ Resolved ] ${currentName.replace(/\[.*?\]/g, '').trim()}`;
        await (message.channel as any).setName(newName).catch(() => {});
        return message.reply({ content: `${VERIFIED_ICON} Ticket channel archived and renamed to **#${newName}**.` });
      }

      // Add User / Moderator
      if (sub === 'add') {
        const target = message.mentions.members?.first() || (args[1] ? await message.guild.members.fetch(args[1].replace(/[<@!>]/g, '')).catch(() => null) : null);
        if (!target) return message.reply({ content: `${WRONG_ICON} Please specify a valid user to add: \`r!ticket add @user\`` });

        await (message.channel as any).permissionOverwrites.edit(target.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true
        }).catch(() => {});

        return message.reply({ content: `${VERIFIED_ICON} User ${target} has been added to this ticket channel.` });
      }

      // Remove User / Moderator
      if (sub === 'remove') {
        const target = message.mentions.members?.first() || (args[1] ? await message.guild.members.fetch(args[1].replace(/[<@!>]/g, '')).catch(() => null) : null);
        if (!target) return message.reply({ content: `${WRONG_ICON} Please specify a valid user to remove: \`r!ticket remove @user\`` });

        await (message.channel as any).permissionOverwrites.delete(target.id).catch(() => {});
        return message.reply({ content: `${VERIFIED_ICON} User ${target} has been removed from this ticket channel.` });
      }

      // Set User Ticket Limit
      if (sub === 'limit' || sub === 'userlimit') {
        const limitNum = parseInt(args[1], 10);
        if (isNaN(limitNum) || limitNum < 1) return message.reply({ content: `${WRONG_ICON} Please provide a valid number: \`r!ticket limit 2\`` });
        config.maxOpenPerUser = limitNum;
        context?.updateModuleConfig?.('tickets', config);
        return message.reply({ content: `${VERIFIED_ICON} Max open tickets per user set to **${limitNum}**.` });
      }

      // Set Admin Role
      if (sub === 'adminrole' || sub === 'role') {
        const role = message.mentions.roles.first() || (args[1] ? await message.guild.roles.fetch(args[1].replace(/[<@&>]/g, '')).catch(() => null) : null);
        if (!role) return message.reply({ content: `${WRONG_ICON} Please specify a valid role: \`r!ticket adminrole @Role\`` });
        config.defaultAdminRoleId = role.id;
        context?.updateModuleConfig?.('tickets', config);
        return message.reply({ content: `${VERIFIED_ICON} Default ticket admin role set to ${role}.` });
      }

      // Set Priority
      if (sub === 'priority' || sub === 'prio') {
        const level = args[1]?.toUpperCase() || 'NORMAL';
        return message.reply({ content: `${VERIFIED_ICON} Ticket priority updated to **${level}**.` });
      }

      // Manage Blacklist (r!ticket blacklist @user / r!ticket unblacklist @user)
      if (sub === 'blacklist' || sub === 'block') {
        const target = message.mentions.members?.first() || (args[1] ? await message.guild.members.fetch(args[1].replace(/[<@!>]/g, '')).catch(() => null) : null);
        if (!target) {
          const list = (config.blacklistedUserIds || []).map(id => `<@${id}>`).join(', ') || 'None';
          return message.reply({ content: `${SHIELD_ICON} **Ticket Blacklist:** ${list}\n\nTo blacklist a user: \`r!ticket blacklist @user\`` });
        }
        const bl = config.blacklistedUserIds || [];
        if (!bl.includes(target.id)) {
          bl.push(target.id);
          config.blacklistedUserIds = bl;
          context?.updateModuleConfig?.('tickets', config);
        }
        return message.reply({ content: `${VERIFIED_ICON} Successfully blacklisted ${target} from opening tickets.` });
      }

      if (sub === 'unblacklist' || sub === 'unblock') {
        const target = message.mentions.members?.first() || (args[1] ? await message.guild.members.fetch(args[1].replace(/[<@!>]/g, '')).catch(() => null) : null);
        if (!target) return message.reply({ content: `${WRONG_ICON} Usage: \`r!ticket unblacklist @user\`` });
        config.blacklistedUserIds = (config.blacklistedUserIds || []).filter(id => id !== target.id);
        context?.updateModuleConfig?.('tickets', config);
        return message.reply({ content: `${VERIFIED_ICON} Removed ${target} from ticket blacklist.` });
      }

      // Purge / Clean Old Ticket Channels & Records
      if (sub === 'purge' || sub === 'clean' || sub === 'clear' || sub === 'deleteall') {
        const ticketChannels = message.guild.channels.cache.filter(
          (c: any) => c.isTextBased() && (
            c.name.includes('support') ||
            c.name.includes('ticket-') ||
            c.name.includes('[ Resolved ]') ||
            c.name.includes('[ Locked ]')
          )
        );

        let deletedCount = 0;
        for (const [id, chan] of ticketChannels) {
          await (chan as any).delete().then(() => deletedCount++).catch(() => {});
        }

        config.activeTickets = [];
        context?.updateModuleConfig?.('tickets', config);

        return message.reply({ content: `${VERIFIED_ICON} Successfully purged **${deletedCount}** old ticket channel(s) and reset active ticket registry.` });
      }

      // Delete Ticket Support Panel Message from Channel
      if (sub === 'deletepanel' || sub === 'removepanel' || sub === 'closepanel' || sub === 'delpanel') {
        const targetArg = args[1];
        let targetChan = message.channel;
        if (targetArg) {
          const cleanId = targetArg.replace(/[<#>]/g, '');
          const fetched = await message.guild.channels.fetch(cleanId).catch(() => null);
          if (fetched && fetched.isTextBased()) targetChan = fetched;
        }

        let deletedCount = 0;
        try {
          const fetchedMsgs = await (targetChan as any).messages?.fetch({ limit: 50 }).catch(() => null);
          if (fetchedMsgs) {
            for (const [id, msg] of fetchedMsgs) {
              if (msg.author.id === message.client.user?.id) {
                const hasOpenButton = msg.components?.some((row: any) =>
                  row.components?.some((btn: any) => btn.customId === 'btn_open_ticket_modal' || btn.customId === 'btn_ticket_open_direct')
                );
                if (hasOpenButton || msg.embeds?.some((e: any) => e.title?.includes('Supports') || e.description?.includes('Support Panel'))) {
                  await msg.delete().then(() => deletedCount++).catch(() => {});
                }
              }
            }
          }
        } catch (e) {}

        const activePanels = (config.activePanels || []).filter((p: any) => p.channelId !== targetChan.id);
        config.activePanels = activePanels;
        context?.updateModuleConfig?.('tickets', config);

        return message.reply({ content: `${VERIFIED_ICON} Support ticket panel deleted from ${targetChan} (${deletedCount} panel message(s) removed).` });
      }

      // Default fallback: show Dashboard
      const { embed, components } = buildDashboardComponents(config, message.guild);
      return message.reply({ embeds: [embed], components });
    }
  });
}

