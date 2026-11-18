import { ModuleManifest, DiscordResourceRegistry } from '../../core/types.js';
import {
  ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, AttachmentBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, Message, RoleSelectMenuBuilder, UserSelectMenuBuilder,
  ContainerBuilder, SectionBuilder, TextDisplayBuilder, SeparatorBuilder, ThumbnailBuilder, MessageFlags
} from 'discord.js';
import { ITicket, ITicketConfig, ITicketCategory } from '../../models/index.js';
import {
  Colors, Embeds, Components,
  buildRichCard, buildStatusCard, buildLimeOverviewCard, buildMinimalAction, buildTicketPanelEmbed,
  VERIFIED_ICON, WRONG_ICON, SHIELD_ICON, CONFIG_ICON, BOT_ICON, LINK_ICON, MEMBER_ICON, TIMER_ICON, INFO_ICON, TICKET_ICON, VIP_ICON, GAVEL_ICON, GOLD_CROWN_ICON, BRAND_FOOTER, CROWN_ANIMATED_ICON
} from '../../core/UIFactory.js';
import { isOwnerOrExtraOwner } from '../../utils/whitelistCheck.js';
import { PrefixRegistry } from '../../core/prefix/PrefixRegistry.js';
import { EmailService } from '../../services/EmailService.js';
import { ModuleRegistry } from '../../core/ModuleRegistry.js';

export function getServerOwnerLinkedEmail(guild: any, context?: any): string | undefined {
  if (!guild?.id) return undefined;
  const fromService = EmailService.getGuildAlertEmail(guild.id);
  if (fromService) return fromService;

  try {
    const modules = context?.getModulesState ? context.getModulesState(guild.id) : [];
    const secMod = modules.find((m: any) => m.id === 'security');
    if (secMod?.config?.alertEmail) return secMod.config.alertEmail;
  } catch {}

  try {
    const registry = ModuleRegistry.getInstance();
    const secMod = registry?.getGuildState(guild.id)?.modules?.find((m: any) => m.id === 'security');
    if (secMod?.config?.alertEmail) return secMod.config.alertEmail;
  } catch {}

  return undefined;
}

export async function isTicketStaffOrAdmin(userId: string, guild: any, config: ITicketConfig): Promise<boolean> {
  if (!guild || !userId) return false;
  if (await isOwnerOrExtraOwner(userId, guild)) return true;

  const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
  if (!member) return false;

  if (member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return true;
  }

  if (config.defaultAdminRoleId && member.roles.cache.has(config.defaultAdminRoleId)) {
    return true;
  }

  if (config.supportRoleIds && Array.isArray(config.supportRoleIds)) {
    if (config.supportRoleIds.some((rId: string) => member.roles.cache.has(rId))) {
      return true;
    }
  }

  return false;
}

export const DEFAULT_TICKET_GUIDELINES = [
  '• Give your details when creating a ticket , reasons & questions',
  '• Response time will be within 24 hours & issues will be resolved in 48 hours',
  '• If you face any issues in Antinuke , Automods or Any modules please don\'t hesitate even for 1 minute to our support each and every ticket is 100 % validated',
  '• Don\'t leave the queries and questions blank so that we can\'t address you please consider filling the details',
  '• Ticket data will always be available with us and your dm so any time you can request for getting transcript'
].join('\n');

export const DEFAULT_TICKET_FOOTER_WARNING = 'Please Don\'t Create Tickets for Fun!';

export const panelDrafts = new Map<string, {
  guildId: string;
  targetChanStr: string;
  title: string;
  description: string;
  guidelines?: string;
  footerWarning?: string;
}>();

export function formatGuidelines(raw?: string): string {
  if (!raw || !raw.trim()) return `### Submission Guidelines\n${DEFAULT_TICKET_GUIDELINES}`;
  const trimmed = raw.trim();
  if (trimmed.startsWith('#')) {
    return trimmed;
  }
  return `### Submission Guidelines\n${trimmed}`;
}

export function buildTicketSupportPanelEmbed(opts: {
  guild: any;
  title?: string;
  description?: string;
  guidelines?: string;
  footerWarning?: string;
}): EmbedBuilder {
  const serverName = opts.guild?.name || 'Rage Development Official';
  let title = opts.title || 'Support Ticket';
  title = title.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim() || 'Support Ticket';

  const desc = opts.description || `Create a ticket if you face any issues , faq on rage we are ready to support you always`;
  const cleanDesc = desc.replace(/\s*,\s*/g, ', ').replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
  let footerWarning = (opts.footerWarning && opts.footerWarning.trim().length > 0)
    ? opts.footerWarning.trim()
    : DEFAULT_TICKET_FOOTER_WARNING;
  footerWarning = footerWarning.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();

  const headerBlock = [
    `### ${serverName.toUpperCase()} • SUPPORT PORTAL`,
    `> **Server:** \`${serverName}\``,
    `> **Status:** \`Active & Monitored 24/7\``,
    `> **Turnaround:** \`Under 24 Hours SLA\``,
    '',
    `"${cleanDesc}"`
  ].join('\n');

  const guidelinesBlock = formatGuidelines(opts.guidelines);

  const noticeBlock = [
    `> **Important Notice:** *${footerWarning}*`,
    `> *Spamming or opening frivolous tickets will result in an immediate support blacklist.*`
  ].join('\n');

  const fullDescription = `${headerBlock}\n\n${guidelinesBlock}\n\n${noticeBlock}`;

  return new EmbedBuilder()
    .setAuthor({
      name: `${serverName.toUpperCase()} • SUPPORT DESK`,
      iconURL: opts.guild?.iconURL({ size: 128 }) || undefined
    })
    .setTitle(title)
    .setColor(Colors.BRAND)
    .setDescription(fullDescription)
    .setThumbnail(opts.guild?.iconURL({ size: 256 }) || null)
    .setFooter({
      text: `${BRAND_FOOTER} • Support Center`,
      iconURL: opts.guild?.client?.user?.displayAvatarURL?.({ size: 64 }) || undefined
    })
    .setTimestamp();
}

export function buildTicketSupportPanelComponents(): ActionRowBuilder<ButtonBuilder>[] {
  const openBtn = new ButtonBuilder()
    .setCustomId('btn_open_ticket_modal')
    .setLabel('Create Ticket')
    .setStyle(ButtonStyle.Secondary);

  return [new ActionRowBuilder<ButtonBuilder>().addComponents(openBtn)];
}

export function buildTicketSupportPanelContainer(opts: {
  guild: any;
  title?: string;
  description?: string;
  guidelines?: string;
  footerWarning?: string;
}): ContainerBuilder {
  const serverName = opts.guild?.name || 'Community Server';
  let title = opts.title || 'Support Desk';
  title = title.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim() || 'Support Desk';

  const desc = opts.description || 'Create a ticket if you face any issues, faq on rage we are ready to support you always';
  const cleanDesc = desc.replace(/\s*,\s*/g, ', ').replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();

  let footerWarning = (opts.footerWarning && opts.footerWarning.trim().length > 0)
    ? opts.footerWarning.trim()
    : DEFAULT_TICKET_FOOTER_WARNING;
  footerWarning = footerWarning.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();

  const guildIcon = opts.guild?.iconURL?.({ size: 512 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

  const sec = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# **${serverName} • ${title}**`)
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder().setURL(guildIcon)
    );

  const sep = new SeparatorBuilder().setDivider(true);

  const bodyContent = [
    `**Server:** \`${serverName}\``,
    `**Status:** \`Active & Monitored 24/7\``,
    `**Turnaround:** \`Under 24 Hours SLA\``,
    ``,
    `> **"${cleanDesc}"**`,
    ``,
    `### **Submission Guidelines**`,
    `**Give your details when creating a ticket, reasons & questions:**`,
    `• **Response Time:** Issues acknowledged within \`24 hours\`.`,
    `• **Resolution SLA:** Target resolution within \`48 hours\`.`,
    ``,
    `> ⚠️ **Important Notice:** **${footerWarning}**`,
    `> **Spamming or opening frivolous tickets will result in an immediate support blacklist.**`
  ].join('\n');

  const body = new TextDisplayBuilder().setContent(bodyContent);

  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_open_ticket_modal')
      .setLabel('Create Ticket')
      .setStyle(ButtonStyle.Secondary)
  );

  const footer = new TextDisplayBuilder().setContent(`-# Rage Secure Support Desk • ${serverName}`);

  return new ContainerBuilder()
    .addSectionComponents(sec)
    .addSeparatorComponents(sep)
    .addTextDisplayComponents(body)
    .addActionRowComponents(actionRow)
    .addTextDisplayComponents(footer);
}

export function buildTicketSupportPanelPayload(opts: {
  guild: any;
  title?: string;
  description?: string;
  guidelines?: string;
  footerWarning?: string;
}): any {
  try {
    const container = buildTicketSupportPanelContainer(opts);
    return {
      flags: MessageFlags.IsComponentsV2,
      components: [container]
    };
  } catch {
    const embed = buildTicketSupportPanelEmbed(opts);
    return {
      embeds: [embed],
      components: buildTicketSupportPanelComponents()
    };
  }
}

export async function sendOrEditTicketPanel(target: any, opts: any, isEdit: boolean = false): Promise<any> {
  const payload = buildTicketSupportPanelPayload(opts);
  if (isEdit && target && typeof target.edit === 'function') {
    // If target message is a legacy embed (not Components V2), Discord rejects converting to Components V2.
    // Replace it cleanly with a fresh Components V2 Box UI message!
    if (!target.flags?.has?.(MessageFlags.IsComponentsV2)) {
      try {
        const chan = target.channel;
        await target.delete().catch(() => {});
        return await chan.send(payload);
      } catch {}
    }
    try {
      return await target.edit(payload);
    } catch {
      try {
        const chan = target.channel;
        await target.delete().catch(() => {});
        return await chan.send(payload);
      } catch {}
    }
  }

  // Otherwise send fresh to channel
  if (target && typeof target.send === 'function') {
    return await target.send(payload);
  } else if (target?.channel && typeof target.channel.send === 'function') {
    return await target.channel.send(payload);
  }
}

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
    panelTitle: 'Supports',
    panelDescription: 'Create a ticket if you face any issues , faq on rage we are ready to support you always',
    panelGuidelines: DEFAULT_TICKET_GUIDELINES,
    panelFooterWarning: DEFAULT_TICKET_FOOTER_WARNING,
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
function buildDashboardComponents(config: ITicketConfig, guild: any, selectedPanelId?: string, statusMessage?: string) {
  const adminRoleMention = config.defaultAdminRoleId ? `<@&${config.defaultAdminRoleId}>` : 'None';
  const activePanelsCount = config.activePanels ? config.activePanels.length : 0;
  const guidelinesStatus = config.panelGuidelines ? 'Customized' : 'Official Template (Active)';
  const catObj = config.categoryId ? (guild.channels.cache.get(config.categoryId) || null) : null;
  const categoryDisplay = catObj ? `${catObj.name} (\`${catObj.id}\`)` : (config.categoryId ? `\`${config.categoryId}\`` : '`Auto-Detect / TICKETS`');

  let desc =
    `> **Server:** ${guild.name}\n` +
    `> **Max Tickets Per User:** \`${config.maxOpenPerUser || 1}\`\n` +
    `> **Default Admin Role:** ${adminRoleMention}\n` +
    `> **Ticket Category:** ${categoryDisplay}\n` +
    `> **Panel Guidelines:** \`${guidelinesStatus}\`\n` +
    `> **Active Panels:** ${activePanelsCount === 0 ? '\`None configured\`' : `\`${activePanelsCount} active\``}\n` +
    `> **Logged History:** \`${config.ticketCounter || 0}\` tickets recorded`;

  if (statusMessage) {
    desc = `> **Status:** \`${statusMessage}\`\n\n` + desc;
  }

  const embed = new EmbedBuilder()
    .setTitle('Ticket Management Dashboard')
    .setColor(0x2b2d31)
    .setDescription(desc)
    .setThumbnail(guild.iconURL?.({ size: 512 }) || undefined);

  // All buttons use default Secondary color (no green, no blurple)
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('tkmgr_btn_update_panel').setLabel('Update Panel').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tkmgr_btn_create_panel').setLabel('Create Panel').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tkmgr_btn_set_category').setLabel('Set Category').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tkmgr_btn_edit_guidelines').setLabel('Panel Guidelines').setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('tkmgr_btn_set_limit').setLabel('Set User Limit').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tkmgr_btn_set_admin_role').setLabel('Set Admin Role').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tkmgr_btn_delete_panel').setLabel('Delete Panel').setStyle(ButtonStyle.Secondary),
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

    const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('tkmgr_btn_sync_live_panel').setLabel('Sync Live Panel Embed').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('tkmgr_btn_preview_panel').setLabel('Preview Panel Embed').setStyle(ButtonStyle.Secondary)
    );
    components.push(row3);
  }

  // Discord Components V2 Box UI Container
  const header = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# **Ticket Management Dashboard**`)
    )
    .setThumbnailAccessory(
      new ThumbnailBuilder().setURL(guild.iconURL?.({ size: 512 }) || 'https://cdn.discordapp.com/embed/avatars/0.png')
    );

  const container = new ContainerBuilder()
    .addSectionComponents(header)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(desc));

  for (const r of components) {
    container.addActionRowComponents(r);
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Rage Secure Support Desk • ${guild.name}`)
  );

  return {
    embed,
    components,
    container,
    payload: {
      flags: MessageFlags.IsComponentsV2,
      components: [container]
    } as any
  };
}

function buildTicketControlPanelEmbed(ticket: ITicket, guild?: any) {
  const guildIcon = guild?.iconURL?.({ size: 512 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
  const desc = [
    `> **Ticket Number:** \`#${ticket.id.replace('ticket_', '')}\``,
    `> **Category:** ${ticket.category || 'General Support'}`,
    `> **Creator:** <@${ticket.userId}>`,
    `> **Claimed By:** ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Unclaimed'}`,
    `> **Lock Status:** \`${ticket.lockStatus || 'Unlocked'}\``,
    `> **Priority:** \`${ticket.priority || 'Normal'}\``,
    `> **Blacklist Status:** \`Clear\``,
    `> **Voice Channel:** \`None\``,
    `> **Auto-Close:** \`Disabled\``,
    `> **Reason:** ${ticket.subject || 'Give your ticket reasons'}`
  ].join('\n');

  const embed = new EmbedBuilder()
    .setTitle('Ticket Control Panel (Staff Only)')
    .setColor(0x2b2d31)
    .setDescription(desc)
    .setThumbnail(guildIcon);

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('btn_in_add_mod').setLabel('Add Moderator').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_in_remove_mod').setLabel('Remove Moderator').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_in_set_priority').setLabel('Set Priority').setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('btn_control_lock').setLabel('Lock').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_control_unlock').setLabel('Unlock').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_control_archive').setLabel('Archive').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_control_unarchive').setLabel('Unarchive').setStyle(ButtonStyle.Secondary)
  );

  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('btn_control_autoclose').setLabel('Auto-Close').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_control_blacklist_user').setLabel('Blacklist User').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('btn_control_unblacklist_user').setLabel('Unblacklist User').setStyle(ButtonStyle.Secondary)
  );

  const row4 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('btn_control_manage_blacklist').setLabel('Manage Blacklist').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_control_refresh').setLabel('Refresh').setStyle(ButtonStyle.Secondary)
  );

  const sec = new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# **Ticket Control Panel (Staff Only)**'))
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));

  const container = new ContainerBuilder()
    .addSectionComponents(sec)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(desc))
    .addActionRowComponents(row1)
    .addActionRowComponents(row2)
    .addActionRowComponents(row3)
    .addActionRowComponents(row4)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Rage Secure Support Desk • Staff Control Engine'));

  return {
    embed,
    components: [row1, row2, row3, row4],
    container,
    payload: {
      flags: MessageFlags.IsComponentsV2,
      components: [container]
    } as any
  };
}

function buildTicketPriorityPanelEmbed(channelName: string, currentPriority: string, guild?: any) {
  const guildIcon = guild?.iconURL?.({ size: 512 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
  const desc = [
    `> **Channel:** \`#${channelName}\``,
    `> **Current Priority:** \`${currentPriority}\``,
    ``,
    `Select new priority level below:`
  ].join('\n');

  const embed = new EmbedBuilder()
    .setTitle('Ticket Priority Panel')
    .setColor(0x2b2d31)
    .setDescription(desc)
    .setThumbnail(guildIcon);

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('prio_btn_high').setLabel('High Priority').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('prio_btn_medium').setLabel('Medium Priority').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('prio_btn_low').setLabel('Low Priority').setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('prio_btn_reset').setLabel('Reset Priority').setStyle(ButtonStyle.Secondary)
  );

  const sec = new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# **Ticket Priority Panel**'))
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIcon));

  const container = new ContainerBuilder()
    .addSectionComponents(sec)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(desc))
    .addActionRowComponents(row1)
    .addActionRowComponents(row2)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Rage Secure Support Desk • Priority Control'));

  return {
    embed,
    components: [row1, row2],
    container,
    payload: {
      flags: MessageFlags.IsComponentsV2,
      components: [container]
    } as any
  };
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

function showPanelDraftModal(interaction: any, existingConfig?: ITicketConfig) {
  const modal = new ModalBuilder()
    .setCustomId('panel_draft_modal')
    .setTitle('Create Support Ticket Panel');

  const targetChannelInput = new TextInputBuilder()
    .setCustomId('panel_target_channel')
    .setLabel('Target Channel (#name or ID)')
    .setPlaceholder('#support or 1234567890')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const titleInput = new TextInputBuilder()
    .setCustomId('panel_title')
    .setLabel('Panel Title')
    .setPlaceholder('Supports')
    .setValue(existingConfig?.panelTitle || 'Supports')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const rawDesc = existingConfig?.panelDescription || 'Create a ticket if you face any issues , faq on rage we are ready to support you always';
  const descInput = new TextInputBuilder()
    .setCustomId('panel_description')
    .setLabel('Panel Description')
    .setPlaceholder('Create a ticket if you face any issues...')
    .setValue(rawDesc.replace(/\bsecure\b/gi, 'rage'))
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  const guidelinesInput = new TextInputBuilder()
    .setCustomId('panel_guidelines')
    .setLabel('Guidelines / Rules (Bullet Points)')
    .setPlaceholder('• Point 1...\n(Leave blank to use official template)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(2000);

  if (existingConfig?.panelGuidelines && existingConfig.panelGuidelines !== DEFAULT_TICKET_GUIDELINES) {
    guidelinesInput.setValue(existingConfig.panelGuidelines.replace(/\bsecure\b/gi, 'rage').slice(0, 2000));
  }

  const footerWarningInput = new TextInputBuilder()
    .setCustomId('panel_footer_warning')
    .setLabel('Footer Warning Notice')
    .setPlaceholder('Please Don\'t Create Tickets for Fun!...')
    .setValue(existingConfig?.panelFooterWarning || DEFAULT_TICKET_FOOTER_WARNING)
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(150);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(targetChannelInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(descInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(guidelinesInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(footerWarningInput)
  );

  return interaction.showModal(modal);
}

function showCustomizeGuidelinesModal(interaction: any, config: ITicketConfig) {
  const modal = new ModalBuilder()
    .setCustomId('modal_tkmgr_customize_guidelines')
    .setTitle('Customize Panel Guidelines');

  const titleInput = new TextInputBuilder()
    .setCustomId('panel_title')
    .setLabel('Panel Title')
    .setPlaceholder('Supports')
    .setValue(config.panelTitle || 'Supports')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const rawDesc = config.panelDescription || 'Create a ticket if you face any issues , faq on rage we are ready to support you always';
  const descInput = new TextInputBuilder()
    .setCustomId('panel_description')
    .setLabel('Panel Description')
    .setPlaceholder('Create a ticket if you face any issues...')
    .setValue(rawDesc.replace(/\bsecure\b/gi, 'rage'))
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true);

  const rawGuidelines = config.panelGuidelines || DEFAULT_TICKET_GUIDELINES;
  const guidelinesInput = new TextInputBuilder()
    .setCustomId('panel_guidelines')
    .setLabel('Guidelines / Rules (Bullet Points)')
    .setPlaceholder('• Point 1...\n• Point 2...')
    .setValue(rawGuidelines.replace(/\bsecure\b/gi, 'rage').slice(0, 2000))
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(2000);

  const footerWarningInput = new TextInputBuilder()
    .setCustomId('panel_footer_warning')
    .setLabel('Footer Warning Notice')
    .setPlaceholder('Please Don\'t Create Tickets for Fun!...')
    .setValue(config.panelFooterWarning || DEFAULT_TICKET_FOOTER_WARNING)
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(150);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(descInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(guidelinesInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(footerWarningInput)
  );

  return interaction.showModal(modal);
}

function showCloseTicketModal(interaction: any) {
  const modal = new ModalBuilder()
    .setCustomId('modal_ticket_close')
    .setTitle('Close Ticket & Transcript');

  const emailInput = new TextInputBuilder()
    .setCustomId('close_user_email')
    .setLabel('Email Address (Optional)')
    .setPlaceholder('Enter your email or leave blank / submit to skip')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(100);

  const reasonInput = new TextInputBuilder()
    .setCustomId('close_reason')
    .setLabel('Closing Reason / Note (Optional)')
    .setPlaceholder('Reason for closing this ticket... (Optional)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(500);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(emailInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput)
  );

  return interaction.showModal(modal);
}

function isTicketInteraction(customId?: string): boolean {
  if (!customId) return false;
  return (
    customId.startsWith('tkmgr_') ||
    customId.startsWith('btn_deploy_panel:') ||
    customId.startsWith('btn_deploy_draft:') ||
    customId.startsWith('ticket_modal_create:') ||
    customId.startsWith('btn_in_') ||
    customId.startsWith('btn_control_') ||
    customId.startsWith('prio_btn_') ||
    customId === 'btn_open_ticket_modal' ||
    customId === 'btn_ticket_open_direct' ||
    customId === 'ticket_select_category' ||
    customId === 'btn_ticket_close' ||
    customId === 'btn_ticket_close_skip' ||
    customId === 'modal_ticket_close' ||
    customId === 'panel_draft_modal' ||
    customId === 'modal_tkmgr_customize_guidelines' ||
    customId === 'set_user_limit_modal' ||
    customId === 'set_admin_role_modal' ||
    customId === 'set_category_modal' ||
    customId === 'add_moderator_modal' ||
    customId === 'remove_moderator_modal'
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
  if (config.panelDescription) {
    config.panelDescription = config.panelDescription.replace(/\bsecure\b/gi, 'rage');
  }
  if (config.panelGuidelines) {
    config.panelGuidelines = config.panelGuidelines.replace(/\bsecure\b/gi, 'rage');
  }
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

    // Handle Ticket Close Modal Submit (Allowed for ticket creator or staff/admin)
    if (interaction.customId === 'modal_ticket_close') {
      const currentTickets: ITicket[] = config.activeTickets || [];
      const ticket = currentTickets.find(t => t.channelId === interaction.channel?.id);
      const isCreator = ticket && ticket.userId === interaction.user.id;
      const isStaffOrAdmin = await isTicketStaffOrAdmin(interaction.user.id, guild, config);

      if (!isStaffOrAdmin && !isCreator) {
        return interaction.reply({ content: `${WRONG_ICON} Access Denied: Only the ticket creator or Support Staff can close this ticket.`, flags: 64 });
      }

      await interaction.deferReply().catch(() => {});
      const emailRaw = interaction.fields.getTextInputValue('close_user_email')?.trim() || '';
      const reason = interaction.fields.getTextInputValue('close_reason')?.trim() || '';

      let userEmail: string | undefined = undefined;
      if (emailRaw && emailRaw.includes('@') && emailRaw.includes('.') && !emailRaw.toLowerCase().includes('skip')) {
        userEmail = emailRaw;
      }

      return closeTicketChannel(interaction.client, interaction, context, config, { userEmail, reason });
    }

    // All management modals require Server Owner or Extra Owner
    const isAuthorized = await isOwnerOrExtraOwner(interaction.user.id, guild);
    if (!isAuthorized) {
      return interaction.reply({ content: `${WRONG_ICON} Access Denied: Only the Server Owner and Extra Owners can manage tickets.`, flags: 64 });
    }

    // Handle Panel Draft Modal Submit
    if (interaction.customId === 'panel_draft_modal') {
      await interaction.deferReply({ flags: 64 }).catch(() => { });
      const targetChanStr = interaction.fields.getTextInputValue('panel_target_channel');
      const title = interaction.fields.getTextInputValue('panel_title') || config.panelTitle || 'Supports';
      const rawDesc = interaction.fields.getTextInputValue('panel_description') || config.panelDescription || 'Create a ticket if you face any issues , faq on rage we are ready to support you always';
      const description = rawDesc.replace(/\bsecure\b/gi, 'rage');
      const rawGuide = interaction.fields.getTextInputValue('panel_guidelines') || config.panelGuidelines || DEFAULT_TICKET_GUIDELINES;
      const guidelines = rawGuide.replace(/\bsecure\b/gi, 'rage');
      const footerWarning = interaction.fields.getTextInputValue('panel_footer_warning') || config.panelFooterWarning || DEFAULT_TICKET_FOOTER_WARNING;

      // Update config defaults
      config.panelTitle = title;
      config.panelDescription = description;
      config.panelGuidelines = guidelines;
      config.panelFooterWarning = footerWarning;
      context.updateModuleConfig('tickets', config);

      const draftId = `pd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      panelDrafts.set(draftId, {
        guildId: guild.id,
        targetChanStr,
        title,
        description,
        guidelines,
        footerWarning
      });

      const previewEmbed = buildTicketSupportPanelEmbed({
        guild,
        title,
        description,
        guidelines,
        footerWarning
      });

      const deployBtn = new ButtonBuilder()
        .setCustomId(`btn_deploy_draft:${draftId}`)
        .setLabel('Deploy To Channel')
        .setStyle(ButtonStyle.Success);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(deployBtn);

      return interaction.editReply({
        content: `**Panel Preview Generated** for target: \`${targetChanStr}\`\nClick **Deploy To Channel** below to send this live support panel:`,
        embeds: [previewEmbed],
        components: [row]
      });
    }

    // Handle Guidelines & Panel Content Customization Modal Submit
    if (interaction.customId === 'modal_tkmgr_customize_guidelines') {
      await interaction.deferReply({ flags: 64 }).catch(() => { });
      const title = interaction.fields.getTextInputValue('panel_title') || config.panelTitle || 'Supports';
      const rawDesc = interaction.fields.getTextInputValue('panel_description') || config.panelDescription || 'Create a ticket if you face any issues , faq on rage we are ready to support you always';
      const description = rawDesc.replace(/\bsecure\b/gi, 'rage');
      const rawGuide = interaction.fields.getTextInputValue('panel_guidelines') || config.panelGuidelines || DEFAULT_TICKET_GUIDELINES;
      const guidelines = rawGuide.replace(/\bsecure\b/gi, 'rage');
      const footerWarning = interaction.fields.getTextInputValue('panel_footer_warning') || config.panelFooterWarning || DEFAULT_TICKET_FOOTER_WARNING;

      config.panelTitle = title;
      config.panelDescription = description;
      config.panelGuidelines = guidelines;
      config.panelFooterWarning = footerWarning;
      context.updateModuleConfig('tickets', config);

      // Auto-sync any existing active panels in channels
      let syncedCount = 0;
      if (config.activePanels && config.activePanels.length > 0) {
        for (const panel of config.activePanels) {
          try {
            const chan = await guild.channels.fetch(panel.channelId).catch(() => null);
            if (chan && chan.isTextBased()) {
              const msg = await (chan as any).messages?.fetch(panel.id).catch(() => null);
              if (msg) {
                await sendOrEditTicketPanel(msg, {
                  guild,
                  title,
                  description,
                  guidelines,
                  footerWarning
                }, true).catch(() => { });
                syncedCount++;
              }
            }
          } catch (e) { }
        }
      }

      const statusText = `Panel guidelines and template updated successfully!${syncedCount > 0 ? ` (Auto-synced ${syncedCount} live support panel(s))` : ''}`;
      const { payload, embed, components } = buildDashboardComponents(config, guild, undefined, statusText);
      return interaction.editReply(payload || { embeds: [embed], components });
    }

    // Handle Set User Limit Modal Submit
    if (interaction.customId === 'set_user_limit_modal') {
      await interaction.deferReply({ flags: 64 }).catch(() => { });
      const limitStr = interaction.fields.getTextInputValue('user_limit_input');
      const limit = parseInt(limitStr, 10) || 1;
      config.maxOpenPerUser = limit;
      context.updateModuleConfig('tickets', config);

      const { payload, embed, components } = buildDashboardComponents(config, guild, undefined, `Max tickets per user set to ${limit}.`);
      return interaction.editReply(payload || { embeds: [embed], components });
    }

    // Handle Set Admin Role Modal Submit
    if (interaction.customId === 'set_admin_role_modal') {
      await interaction.deferReply({ flags: 64 }).catch(() => { });
      const roleInput = interaction.fields.getTextInputValue('admin_role_input').replace(/[<@&>]/g, '').trim();
      const targetRole = await guild.roles.fetch(roleInput).catch(() => null);
      if (!targetRole) return interaction.editReply({ content: `${WRONG_ICON} Role not found: \`${roleInput}\`` });

      config.defaultAdminRoleId = targetRole.id;
      context.updateModuleConfig('tickets', config);

      const { payload, embed, components } = buildDashboardComponents(config, guild, undefined, `Default ticket admin role set to ${targetRole.name}.`);
      return interaction.editReply(payload || { embeds: [embed], components });
    }

    // Handle Set Category Modal Submit
    if (interaction.customId === 'set_category_modal') {
      await interaction.deferReply({ flags: 64 }).catch(() => { });
      const catInput = interaction.fields.getTextInputValue('category_input').replace(/[<#>]/g, '').trim();
      let targetCat: any = guild.channels.cache.get(catInput);
      if (!targetCat) {
        targetCat = guild.channels.cache.find((c: any) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === catInput.toLowerCase());
      }
      if (!targetCat) {
        targetCat = await guild.channels.fetch(catInput).catch(() => null);
      }

      if (!targetCat || targetCat.type !== ChannelType.GuildCategory) {
        try {
          targetCat = await guild.channels.create({
            name: catInput,
            type: ChannelType.GuildCategory,
            reason: `Ticket category created by ${interaction.user.tag}`
          });
        } catch (err: any) {
          return interaction.editReply({ content: `${WRONG_ICON} Category \`${catInput}\` was not found and could not be created: ${err.message}` });
        }
      }

      config.categoryId = targetCat.id;
      context.updateModuleConfig('tickets', config);

      const { payload, embed, components } = buildDashboardComponents(config, guild, undefined, `Ticket category configured to ${targetCat.name} (${targetCat.id}).`);
      return interaction.editReply(payload || { embeds: [embed], components });
    }

    // Handle Add Moderator Modal Submit
    if (interaction.customId === 'add_moderator_modal') {
      await interaction.deferReply({ flags: 64 }).catch(() => { });
      const userId = interaction.fields.getTextInputValue('mod_user_id').replace(/[<@!>]/g, '').trim();
      const targetMember = await guild.members.fetch(userId).catch(() => null);
      if (!targetMember) return interaction.editReply({ content: `${WRONG_ICON} User not found: \`${userId}\`` });

      await (interaction.channel as any).permissionOverwrites.edit(targetMember.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
        EmbedLinks: true
      }).catch(() => { });

      return interaction.editReply({ content: `${VERIFIED_ICON} Moderator ${targetMember} has been added to this ticket.` });
    }

    // Handle Remove Moderator Modal Submit
    if (interaction.customId === 'remove_moderator_modal') {
      await interaction.deferReply({ flags: 64 }).catch(() => { });
      const userId = interaction.fields.getTextInputValue('mod_user_id').replace(/[<@!>]/g, '').trim();
      const targetMember = await guild.members.fetch(userId).catch(() => null);
      if (!targetMember) return interaction.editReply({ content: `${WRONG_ICON} User not found: \`${userId}\`` });

      await (interaction.channel as any).permissionOverwrites.delete(targetMember.id).catch(() => { });

      return interaction.editReply({ content: `${VERIFIED_ICON} Moderator ${targetMember} has been removed from this ticket.` });
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
  // 3. TICKET CLOSING (Ticket Creator OR Ticket Staff/Admin)
  // ─────────────────────────────────────────────
  if (interaction.customId === 'btn_ticket_close' || interaction.customId === 'btn_in_close') {
    const currentTickets: ITicket[] = config.activeTickets || [];
    const ticket = currentTickets.find(t => t.channelId === interaction.channel?.id);
    const isCreator = ticket && ticket.userId === interaction.user.id;
    const isAuthorized = await isTicketStaffOrAdmin(interaction.user.id, guild, config);

    if (!isAuthorized && !isCreator) {
      return interaction.reply({ content: `${WRONG_ICON} Access Denied: Only the ticket creator or Support Staff can close this ticket.`, flags: 64 });
    }
    return showCloseTicketModal(interaction);
  }

  if (interaction.customId === 'btn_ticket_close_skip') {
    const currentTickets: ITicket[] = config.activeTickets || [];
    const ticket = currentTickets.find(t => t.channelId === interaction.channel?.id);
    const isCreator = ticket && ticket.userId === interaction.user.id;
    const isAuthorized = await isTicketStaffOrAdmin(interaction.user.id, guild, config);

    if (!isAuthorized && !isCreator) {
      return interaction.reply({ content: `${WRONG_ICON} Access Denied: Only the ticket creator or Support Staff can close this ticket.`, flags: 64 });
    }
    await interaction.deferReply().catch(() => {});
    return closeTicketChannel(interaction.client, interaction, context, config, { userEmail: undefined });
  }

  // ─────────────────────────────────────────────
  // 4. MANAGEMENT PERMISSION GATES
  // In-ticket controls (Claim, Control Panel, Mod, Priority) allow Staff and Admins.
  // Global dashboard buttons (tkmgr_*) require Server Owner or Extra Owners.
  // ─────────────────────────────────────────────
  const isStaffOrAdmin = await isTicketStaffOrAdmin(interaction.user.id, guild, config);
  const isOwner = await isOwnerOrExtraOwner(interaction.user.id, guild);

  if (interaction.customId.startsWith('tkmgr_')) {
    if (!isOwner) {
      return interaction.reply({ content: `${WRONG_ICON} Access Denied: Only the Server Owner and Extra Owners can manage ticket dashboard settings.`, flags: 64 });
    }
  } else {
    if (!isStaffOrAdmin) {
      return interaction.reply({ content: `${WRONG_ICON} Access Denied: Only Administrators and Support Staff can manage tickets.`, flags: 64 });
    }
  }

  // ─────────────────────────────────────────────
  // 5. DASHBOARD & PANEL DEPLOYMENT BUTTONS
  // ─────────────────────────────────────────────
  if (interaction.customId === 'tkmgr_btn_set_category') {
    const modal = new ModalBuilder().setCustomId('set_category_modal').setTitle('Set Ticket Category');
    const catInput = new TextInputBuilder()
      .setCustomId('category_input')
      .setLabel('Category ID or Name')
      .setPlaceholder('e.g. 1234567890 or TICKETS')
      .setValue(config.categoryId || '')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(catInput));
    return interaction.showModal(modal);
  }

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
    await interaction.deferUpdate().catch(() => { });
    const val = interaction.values?.[0] || '';
    const panelId = val.replace('panel_', '');
    const { embed, components, payload } = buildDashboardComponents(config, guild, panelId);
    return interaction.editReply(payload || { embeds: [embed], components });
  }

  if (interaction.customId === 'tkmgr_btn_delete_panel') {
    await interaction.deferUpdate().catch(() => { });
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
              await msg.delete().then(() => deletedCount++).catch(() => { });
            }
          }
        }
      }
    } catch (e) { }

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
            await remoteChan.messages.delete(removedPanel.id).catch(() => { });
          }
        }
      }
    }
    config.activePanels = activePanels;
    context.updateModuleConfig('tickets', config);

    // Auto-update dashboard right there in-place!
    const { embed, components, payload } = buildDashboardComponents(config, guild);
    return interaction.editReply(payload || { embeds: [embed], components });
  }

  if (interaction.customId === 'tkmgr_btn_refresh') {
    await interaction.deferUpdate().catch(() => { });
    const { embed, components, payload } = buildDashboardComponents(config, guild);
    return interaction.editReply(payload || { embeds: [embed], components });
  }

  // Edit Guidelines & Support Panel Content Modal Trigger
  if (interaction.customId === 'tkmgr_btn_edit_guidelines') {
    return showCustomizeGuidelinesModal(interaction, config);
  }

  // Preview Panel Embed / Container
  if (interaction.customId === 'tkmgr_btn_preview_panel') {
    await interaction.deferReply({ flags: 64 }).catch(() => { });
    const payload = buildTicketSupportPanelPayload({
      guild,
      title: config.panelTitle,
      description: config.panelDescription,
      guidelines: config.panelGuidelines,
      footerWarning: config.panelFooterWarning
    });

    return interaction.editReply(payload).catch(async () => {
      const previewEmbed = buildTicketSupportPanelEmbed({
        guild,
        title: config.panelTitle,
        description: config.panelDescription,
        guidelines: config.panelGuidelines,
        footerWarning: config.panelFooterWarning
      });

      return interaction.editReply({
        content: '**Ticket Support Panel Preview:**\n*(This is how members will see your support panel)*',
        embeds: [previewEmbed],
        components: buildTicketSupportPanelComponents()
      });
    });
  }

  // Sync / Update Live Panels in Channels
  if (interaction.customId === 'tkmgr_btn_update_panel' || interaction.customId === 'tkmgr_btn_sync_live_panel') {
    await interaction.deferReply({ flags: 64 }).catch(() => { });
    let activePanels = config.activePanels || [];
    let updatedCount = 0;

    // 1. Update any registered active panels
    for (const panel of activePanels) {
      try {
        const chan = await guild.channels.fetch(panel.channelId).catch(() => null);
        if (chan && chan.isTextBased()) {
          const msg = await (chan as any).messages?.fetch(panel.id).catch(() => null);
          if (msg) {
            await sendOrEditTicketPanel(msg, {
              guild,
              title: config.panelTitle,
              description: config.panelDescription,
              guidelines: config.panelGuidelines,
              footerWarning: config.panelFooterWarning
            }, true).catch(() => { });
            updatedCount++;
          }
        }
      } catch (e) { }
    }

    // 2. Scan current channel for any unindexed support panel messages
    try {
      const fetched = await (interaction.channel as any).messages?.fetch({ limit: 50 }).catch(() => null);
      if (fetched) {
        for (const [id, msg] of fetched) {
          if (msg.author.id === interaction.client.user?.id) {
            const hasOpenBtn = msg.components?.some((r: any) =>
              r.components?.some((b: any) => b.customId === 'btn_open_ticket_modal' || b.customId === 'btn_ticket_open_direct')
            );
            const hasSupportEmbed = msg.embeds?.some((e: any) =>
              e.title?.toLowerCase().includes('support') || e.author?.name?.toLowerCase().includes('support')
            );
            if (hasOpenBtn || hasSupportEmbed) {
              await sendOrEditTicketPanel(msg, {
                guild,
                title: config.panelTitle,
                description: config.panelDescription,
                guidelines: config.panelGuidelines,
                footerWarning: config.panelFooterWarning
              }, true).catch(() => { });
              updatedCount++;
              if (!activePanels.some((p: any) => p.id === msg.id)) {
                activePanels.push({
                  id: msg.id,
                  channelId: interaction.channel.id,
                  channelName: interaction.channel.name,
                  title: config.panelTitle || 'Supports',
                  description: config.panelDescription || 'Support & inquiries',
                  createdAt: new Date()
                });
              }
            }
          }
        }
      }
    } catch (e) { }

    config.activePanels = activePanels;
    context.updateModuleConfig('tickets', config);

    const { embed, components } = buildDashboardComponents(config, guild);

    if (updatedCount > 0) {
      return interaction.editReply({
        content: `${VERIFIED_ICON} Successfully updated **${updatedCount}** live support panel(s) to the redesigned UI!`,
        embeds: [embed],
        components
      });
    } else {
      // If none found to edit, deploy a fresh panel right into current channel
      const postedMsg = await sendOrEditTicketPanel(interaction.channel, {
        guild,
        title: config.panelTitle,
        description: config.panelDescription,
        guidelines: config.panelGuidelines,
        footerWarning: config.panelFooterWarning
      }, false);
      activePanels.push({
        id: postedMsg.id,
        channelId: interaction.channel.id,
        channelName: interaction.channel.name,
        title: config.panelTitle || 'Supports',
        description: config.panelDescription || 'Support & inquiries',
        createdAt: new Date()
      });
      config.activePanels = activePanels;
      context.updateModuleConfig('tickets', config);

      return interaction.editReply({
        content: `${VERIFIED_ICON} No existing panel message was found to edit, so a new redesigned support panel was deployed directly in ${interaction.channel}!`,
        embeds: [embed],
        components
      });
    }
  }

  // Deploy from Draft (Safe from 100-character customId Discord limit)
  if (interaction.customId.startsWith('btn_deploy_draft:')) {
    await interaction.deferReply({ flags: 64 }).catch(() => { });
    const draftId = interaction.customId.replace('btn_deploy_draft:', '');
    const draft = panelDrafts.get(draftId);

    const targetChanStr = draft?.targetChanStr || '';
    const title = draft?.title || config.panelTitle || 'Supports';
    const description = draft?.description || config.panelDescription || 'Create a ticket if you face any issues , faq on rage we are ready to support you always';
    const guidelines = draft?.guidelines || config.panelGuidelines || DEFAULT_TICKET_GUIDELINES;
    const footerWarning = draft?.footerWarning || config.panelFooterWarning || DEFAULT_TICKET_FOOTER_WARNING;

    let targetChan = interaction.channel;
    const cleanId = targetChanStr.replace(/[<#>]/g, '');
    if (cleanId) {
      const fetched = await guild.channels.fetch(cleanId).catch(() => null);
      if (fetched && fetched.isTextBased()) targetChan = fetched;
    }

    const postedMsg = await sendOrEditTicketPanel(targetChan, {
      guild,
      title,
      description,
      guidelines,
      footerWarning
    }, false);

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
    panelDrafts.delete(draftId);

    return interaction.editReply({ content: `${VERIFIED_ICON} Live support panel posted successfully in ${targetChan}!` });
  }

  if (interaction.customId.startsWith('btn_deploy_panel:')) {
    await interaction.deferReply({ flags: 64 }).catch(() => { });
    const parts = interaction.customId.split(':');
    const targetChanStr = decodeURIComponent(parts[1] || '');
    const title = decodeURIComponent(parts[2] || 'Supports');
    const description = decodeURIComponent(parts[3] || 'Create a ticket if you face any issues , faq on rage we are ready to support you always');

    let targetChan = interaction.channel;
    const cleanId = targetChanStr.replace(/[<#>]/g, '');
    if (cleanId) {
      const fetched = await guild.channels.fetch(cleanId).catch(() => null);
      if (fetched && fetched.isTextBased()) targetChan = fetched;
    }

    const postedMsg = await sendOrEditTicketPanel(targetChan, {
      guild,
      title,
      description,
      guidelines: config.panelGuidelines,
      footerWarning: config.panelFooterWarning
    }, false);

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
    await interaction.deferReply({ flags: 64 }).catch(() => { });
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
    await interaction.deferReply({ flags: 64 }).catch(() => { });
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
    await interaction.deferReply({ flags: 64 }).catch(() => { });
    const currentTickets: ITicket[] = config.activeTickets || [];
    const ticket = currentTickets.find(t => t.channelId === interaction.channel.id);
    const { embed, components } = buildTicketPriorityPanelEmbed((interaction.channel as any).name, ticket?.priority || 'Normal');
    return interaction.editReply({ embeds: [embed], components });
  }

  if (interaction.customId.startsWith('prio_btn_')) {
    await interaction.deferReply({ flags: 64 }).catch(() => { });
    const rawLevel = interaction.customId.replace('prio_btn_', '').toUpperCase();
    const level = rawLevel === 'RESET' ? 'NORMAL' : rawLevel;
    const currentTickets: ITicket[] = config.activeTickets || [];
    const ticket = currentTickets.find(t => t.channelId === interaction.channel.id);
    if (ticket) {
      ticket.priority = level;
      config.activeTickets = currentTickets;
      context?.updateModuleConfig?.('tickets', { ...config, activeTickets: config.activeTickets });
    }
    return interaction.editReply({ content: `${VERIFIED_ICON} Ticket priority set to **${level}**.` });
  }

  if (interaction.customId === 'btn_in_add_mod') {
    const modal = new ModalBuilder().setCustomId('add_moderator_modal').setTitle('Add Moderator to Ticket');
    const userIdInput = new TextInputBuilder().setCustomId('mod_user_id').setLabel('User Mention or User ID').setPlaceholder('@user or 1234567890').setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(userIdInput));
    return interaction.showModal(modal);
  }

  if (interaction.customId === 'btn_in_remove_mod') {
    const modal = new ModalBuilder().setCustomId('remove_moderator_modal').setTitle('Remove Moderator from Ticket');
    const userIdInput = new TextInputBuilder().setCustomId('mod_user_id').setLabel('User Mention or User ID').setPlaceholder('@user or 1234567890').setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(userIdInput));
    return interaction.showModal(modal);
  }

  if (interaction.customId === 'btn_control_lock') {
    await interaction.deferReply({ flags: 64 }).catch(() => { });
    const currentTickets: ITicket[] = config.activeTickets || [];
    const ticket = currentTickets.find(t => t.channelId === interaction.channel.id);
    if (ticket) {
      ticket.lockStatus = 'Locked';
      config.activeTickets = currentTickets;
      context?.updateModuleConfig?.('tickets', { ...config, activeTickets: config.activeTickets });
      if (ticket.userId) {
        await interaction.channel.permissionOverwrites?.edit?.(ticket.userId, { SendMessages: false }).catch(() => { });
      }
    }
    const currentName = interaction.channel.name;
    const newName = `[ Locked ] ${currentName.replace(/\[.*?\]/g, '').trim()}`;
    await interaction.channel.setName(newName).catch(() => { });
    return interaction.editReply({ content: `${VERIFIED_ICON} Ticket channel locked and renamed to **#${newName}**.` });
  }

  if (interaction.customId === 'btn_control_unlock') {
    await interaction.deferReply({ flags: 64 }).catch(() => { });
    const currentTickets: ITicket[] = config.activeTickets || [];
    const ticket = currentTickets.find(t => t.channelId === interaction.channel.id);
    if (ticket) {
      ticket.lockStatus = 'Unlocked';
      config.activeTickets = currentTickets;
      context?.updateModuleConfig?.('tickets', { ...config, activeTickets: config.activeTickets });
      if (ticket.userId) {
        await interaction.channel.permissionOverwrites?.edit?.(ticket.userId, { SendMessages: true }).catch(() => { });
      }
    }
    const currentName = interaction.channel.name;
    const newName = `[ Current ] ${currentName.replace(/\[.*?\]/g, '').trim()}`;
    await interaction.channel.setName(newName).catch(() => { });
    return interaction.editReply({ content: `${VERIFIED_ICON} Ticket channel unlocked and renamed to **#${newName}**.` });
  }

  if (interaction.customId === 'btn_control_archive') {
    await interaction.deferReply({ flags: 64 }).catch(() => { });
    const currentName = interaction.channel.name;
    const newName = `[ Resolved ] ${currentName.replace(/\[.*?\]/g, '').trim()}`;
    await interaction.channel.setName(newName).catch(() => { });
    return interaction.editReply({ content: `${VERIFIED_ICON} Ticket channel archived and renamed to **#${newName}**.` });
  }

  if (interaction.customId === 'btn_control_unarchive') {
    await interaction.deferReply({ flags: 64 }).catch(() => { });
    const currentName = interaction.channel.name;
    const newName = `[ Current ] ${currentName.replace(/\[.*?\]/g, '').trim()}`;
    await interaction.channel.setName(newName).catch(() => { });
    return interaction.editReply({ content: `${VERIFIED_ICON} Ticket channel unarchived and renamed to **#${newName}**.` });
  }

  if (interaction.customId === 'btn_control_autoclose') {
    return interaction.reply({ content: `${INFO_ICON} Auto-close is configured per ticket lifecycle policy.`, flags: 64 });
  }

  if (interaction.customId === 'btn_control_blacklist_user') {
    await interaction.deferReply({ flags: 64 }).catch(() => { });
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
    await interaction.deferReply({ flags: 64 }).catch(() => { });
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
    await interaction.deferReply({ flags: 64 }).catch(() => { });
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
    await interaction.deferReply?.({ flags: 64 }).catch(() => { });
  }

  config.ticketCounter = (config.ticketCounter || 0) + 1;
  const ticketNumber = String(config.ticketCounter);
  const cleanUser = (user.username || 'user').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15);
  const cleanCat = (category || 'support').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
  const channelName = `ticket-${cleanUser || 'user'}-${cleanCat}`;

  const botId = interaction.client?.user?.id || client?.user?.id || guild.client?.user?.id;

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

    // Auto-detect existing category if not set or invalid
    if (!categoryParentId) {
      const existingCat = guild.channels.cache.find((c: any) => 
        c.type === ChannelType.GuildCategory && 
        (c.name.toLowerCase().includes('ticket') || c.name.toLowerCase().includes('support'))
      );
      if (existingCat) {
        categoryParentId = existingCat.id;
        config.categoryId = existingCat.id;
        context.updateModuleConfig('tickets', config);
      }
    }

    // Auto-create category if none exists so tickets never spawn loose at root
    if (!categoryParentId) {
      try {
        const autoCat = await guild.channels.create({
          name: 'TICKETS',
          type: ChannelType.GuildCategory,
          reason: 'Auto-created TICKETS category for new support channels'
        });
        if (autoCat) {
          categoryParentId = autoCat.id;
          config.categoryId = autoCat.id;
          context.updateModuleConfig('tickets', config);
        }
      } catch (catErr) {
        console.warn('[Tickets] Could not auto-create category:', catErr);
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

    // Send In-Channel Control Message: user actions only (Close Ticket & Ping Admin)
    const controlRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('btn_in_close').setLabel('Close Ticket').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('btn_in_ping_admin').setLabel('Ping Admin').setStyle(ButtonStyle.Secondary)
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
        `Support staff will assist you shortly. Click **Close Ticket** when resolved or **Ping Admin** to request assistance.`
      );

    try {
      await ticketChannel.send({ content: `${user} | Ticket #${ticketNumber}`, embeds: [ticketCardEmbed], components: [controlRow] });
    } catch (sendErr: any) {
      console.error('[Tickets] Initial ticket card send failed, retrying without embed:', sendErr?.message || sendErr);
      try {
        await ticketChannel.send({
          content:
            `${user} | **Ticket #${ticketNumber}**\n` +
            `**Category:** ${category === 'vip' ? 'VIP & Billing' : category === 'moderation' ? 'Moderation & Reports' : 'General Support'}\n` +
            `**Subject:** ${subject || 'General Support Inquiry'}\n` +
            `Support staff will assist you shortly. Click **Close Ticket** when resolved or **Ping Admin** to request assistance.`,
          components: [controlRow]
        });
      } catch (fallbackErr: any) {
        console.error('[Tickets] Fallback ticket message also failed:', fallbackErr?.message || fallbackErr);
      }
    }

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

    // WhatsApp Owner Alert
    try {
      const { WhatsAppService } = await import('../../services/WhatsAppService.js');
      WhatsAppService.sendTicketAlert({
        id: newTicket.id,
        guildName: guild.name,
        userTag: user.username,
        category: category === 'vip' ? 'VIP & Billing' : category === 'moderation' ? 'Moderation & Reports' : 'General Support',
        subject: subject || 'General Support Inquiry',
        channelName: channelName
      }).catch(() => {});
    } catch {}

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

async function closeTicketChannel(
  client: any,
  interaction: any,
  context: any,
  config: ITicketConfig,
  options?: { userEmail?: string; reason?: string }
) {
  const channel = interaction.channel;
  if (!channel) return;

  const currentTickets: ITicket[] = config.activeTickets || [];
  const matchedTicket = currentTickets.find(t => t.channelId === channel.id);

  if (
    !matchedTicket &&
    !channel.name?.startsWith('ticket-') &&
    !channel.name?.includes('Resolved') &&
    !channel.name?.includes('Locked')
  ) {
    const errMsg = `${WRONG_ICON} This command can only be used inside an active ticket channel.`;
    if (interaction.deferred || interaction.replied) return interaction.editReply({ content: errMsg });
    if (interaction.reply) return interaction.reply({ content: errMsg, flags: 64 });
    return;
  }

  const ticket = matchedTicket || {
    id: channel.id,
    category: 'Support',
    userTag: interaction.user?.username || interaction.author?.username || 'Member'
  } as any;

  const executor = interaction.user || interaction.author;
  const executorId = executor?.id;
  const isCreator = ticket.userId ? ticket.userId === executorId : false;
  const isAuthorized = await isTicketStaffOrAdmin(executorId, interaction.guild, config);

  if (!isAuthorized && !isCreator) {
    const denyMsg = `${WRONG_ICON} Access Denied: Only the ticket creator, Server Owner, or Support Staff can close this ticket.`;
    if (interaction.deferred || interaction.replied) return interaction.editReply({ content: denyMsg });
    if (interaction.reply) return interaction.reply({ content: denyMsg, flags: 64 });
    return;
  }

  const userEmail = options?.userEmail;
  const reason = options?.reason;
  const ownerEmail = getServerOwnerLinkedEmail(interaction.guild, context);

  let dispatchDetails = '';
  if (userEmail) {
    dispatchDetails += `\n• Transcript copy will be emailed to: \`${userEmail}\``;
  }
  if (ownerEmail) {
    dispatchDetails += `\n• Transcript copy will be emailed to Server Owner: \`${EmailService.maskEmail(ownerEmail)}\``;
  }

  const closingMsg = `${TIMER_ICON} Closing ticket channel in **5 seconds**... Generating HTML transcript.${dispatchDetails}`;
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content: closingMsg }).catch(() => { });
  } else if (interaction.reply) {
    await interaction.reply({ content: closingMsg }).catch(() => { });
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
            body: `Ticket channel **#${channel.name}** was closed by ${executor}.\n\n> **Category**: \`${ticket.category || 'General'}\`\n> **Opened By**: \`${ticket.userTag}\`${reason ? `\n> **Reason**: ${reason}` : ''}`,
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
            body: `Your ticket **#${channel.name}** in **${interaction.guild.name}** has been closed. Attached is your chat transcript.${reason ? `\n\n**Closing Reason**: ${reason}` : ''}`,
            accentColor: Colors.BRAND
          });
          await ticketUser.send({ embeds: [dmEmbed.embeds[0]], files: [attachment] }).catch(() => null);
        }
      }

      // Send transcript copy to User email if provided
      if (userEmail) {
        try {
          await EmailService.sendTicketTranscript({
            to: userEmail,
            guildName: interaction.guild.name,
            ticketId: ticket.id,
            channelName: channel.name,
            userTag: ticket.userTag,
            closedByTag: executor?.username || 'Staff',
            reason: reason || undefined,
            transcriptBuffer
          });
        } catch (mailErr) {
          console.error('[Tickets] Failed to send email transcript to user:', mailErr);
        }
      }

      // Send transcript copy to Server Owner if email is linked
      if (ownerEmail) {
        try {
          await EmailService.sendTicketTranscript({
            to: ownerEmail,
            guildName: interaction.guild.name,
            ticketId: ticket.id,
            channelName: channel.name,
            userTag: ticket.userTag,
            closedByTag: executor?.username || 'Staff',
            reason: reason || undefined,
            transcriptBuffer
          });
        } catch (ownerMailErr) {
          console.error('[Tickets] Failed to send email transcript to server owner:', ownerMailErr);
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

      const { embed, components, payload } = buildDashboardComponents(config, message.guild);
      return message.reply(payload || { embeds: [embed], components });
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
      if (config.panelDescription) {
        config.panelDescription = config.panelDescription.replace(/\bsecure\b/gi, 'rage');
      }
      if (config.panelGuidelines) {
        config.panelGuidelines = config.panelGuidelines.replace(/\bsecure\b/gi, 'rage');
      }

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
          deferReply: async () => { },
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

      // 4. HTML Transcript (Ticket Creator OR Support Staff/Admin)
      if (sub === 'transcript' || sub === 'log') {
        const currentTickets: ITicket[] = config.activeTickets || [];
        const ticket = currentTickets.find(t => t.channelId === message.channel.id) || {
          id: message.channel.id,
          category: 'Support',
          userTag: message.author.username,
          userId: message.author.id
        } as any;

        const isCreator = ticket && ticket.userId === message.author.id;
        const isAuthorized = await isTicketStaffOrAdmin(message.author.id, message.guild, config);
        if (!isAuthorized && !isCreator) {
          return message.reply({ content: `${WRONG_ICON} Access Denied: Only the ticket creator or Support Staff can view transcripts.` });
        }

        const transcriptBuffer = await generateHtmlTranscript(message.channel, ticket, message.guild);
        const attachment = new AttachmentBuilder(transcriptBuffer, { name: `transcript-${(message.channel as any).name}.html` });
        return message.reply({ content: `${VERIFIED_ICON} Ticket Transcript HTML File:`, files: [attachment] });
      }

      // 5. Help Command
      if (sub === 'help') {
        const sec = new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('# **Ticket System Commands & Subcommands**'))
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(message.guild.iconURL?.({ size: 512 }) || 'https://cdn.discordapp.com/embed/avatars/0.png'));

        const helpBody = [
          `### **General Member Commands**`,
          `> • \`r!ticket open [reason]\` — Create a new support ticket`,
          `> • \`r!ticket close\` — Close your open ticket with transcript`,
          `> • \`r!ticket ping\` — Ping assigned support staff`,
          `> • \`r!ticket transcript\` — Export HTML transcript of ticket`,
          ``,
          `### **Staff In-Ticket Controls**`,
          `> • \`r!ticket add @user\` — Add moderator/user to this ticket`,
          `> • \`r!ticket remove @user\` — Remove user from this ticket`,
          `> • \`r!ticket claim\` — Claim current ticket ownership`,
          `> • \`r!ticket lock\` / \`r!ticket unlock\` — Lock or unlock ticket channel`,
          `> • \`r!ticket priority <level>\` — Update priority (Low/Normal/High/Urgent)`,
          ``,
          `### **Admin & System Configuration**`,
          `> • \`r!ticket deploy\` — Deploy a live support ticket panel`,
          `> • \`r!ticket category [id]\` — Set or view ticket category`,
          `> • \`r!ticket adminrole @role\` — Configure default admin role`,
          `> • \`r!ticket limit <num>\` — Set maximum tickets per user`,
          `> • \`r!ticket blacklist @user\` — Blacklist user from opening tickets`
        ].join('\n');

        const container = new ContainerBuilder()
          .addSectionComponents(sec)
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(helpBody))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Rage Secure Support Desk • Command Reference'));

        return message.reply({
          flags: MessageFlags.IsComponentsV2,
          components: [container]
        } as any);
      }

      // ─────────────────────────────────────────────
      // ALL REMAINING SUBCOMMANDS ARE MANAGEMENT ONLY
      // Strictly enforced: Staff / Admin permissions
      // ─────────────────────────────────────────────
      const isStaffOrAdmin = await isTicketStaffOrAdmin(message.author.id, message.guild, config);
      const isOwner = await isOwnerOrExtraOwner(message.author.id, message.guild);
      if (!isStaffOrAdmin && !isOwner && sub !== 'close') {
        return message.reply({ content: `${WRONG_ICON} Access Denied: Only Administrators and Support Staff can manage tickets.` });
      }

      // Set / View Ticket Category
      if (sub === 'category' || sub === 'setcategory' || sub === 'cat') {
        const catArg = args.slice(1).join(' ').trim();
        if (!catArg) {
          const currentCat = config.categoryId ? message.guild.channels.cache.get(config.categoryId) : null;
          const display = currentCat ? `**${currentCat.name}** (\`${currentCat.id}\`)` : '`Not configured (Auto-detecting / TICKETS)`';
          return message.reply({ content: `${CONFIG_ICON} **Current Ticket Category:** ${display}\n\nTo configure category: \`r!ticket category <CategoryID or Name>\`` });
        }

        let targetCat: any = message.guild.channels.cache.get(catArg);
        if (!targetCat) {
          targetCat = message.guild.channels.cache.find((c: any) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === catArg.toLowerCase());
        }
        if (!targetCat) {
          targetCat = await message.guild.channels.fetch(catArg).catch(() => null);
        }

        if (!targetCat || targetCat.type !== ChannelType.GuildCategory) {
          try {
            targetCat = await message.guild.channels.create({
              name: catArg,
              type: ChannelType.GuildCategory,
              reason: `Ticket category created by ${message.author.tag}`
            });
          } catch (e: any) {
            return message.reply({ content: `${WRONG_ICON} Category not found and could not be created: ${e.message}` });
          }
        }

        config.categoryId = targetCat.id;
        context?.updateModuleConfig?.('tickets', config);
        return message.reply({ content: `${VERIFIED_ICON} Ticket category configured to **${targetCat.name}** (\`${targetCat.id}\`). All new tickets will spawn here!` });
      }

      // Update / Sync Existing Live Support Panels
      if (sub === 'update' || sub === 'sync' || sub === 'refreshpanel') {
        const statusMsg = await message.reply({ content: `${TIMER_ICON} Updating support panel with the redesigned UI and controls...` });
        let updated = 0;
        let activePanels = config.activePanels || [];

        // 1. Check registered active panels
        for (const p of activePanels) {
          try {
            const ch = await message.guild.channels.fetch(p.channelId).catch(() => null);
            if (ch && ch.isTextBased()) {
              const msg = await (ch as any).messages?.fetch(p.id).catch(() => null);
              if (msg) {
                await sendOrEditTicketPanel(msg, {
                  guild: message.guild,
                  title: config.panelTitle,
                  description: config.panelDescription,
                  guidelines: config.panelGuidelines,
                  footerWarning: config.panelFooterWarning
                }, true).catch(() => {});
                updated++;
              }
            }
          } catch (e) {}
        }

        // 2. Scan current channel for existing bot support messages
        try {
          const fetchedMsgs = await (message.channel as any).messages?.fetch({ limit: 50 }).catch(() => null);
          if (fetchedMsgs) {
            for (const [id, msg] of fetchedMsgs) {
              if (msg.author.id === message.client.user?.id && msg.id !== statusMsg.id) {
                const hasOpenButton = msg.components?.some((r: any) =>
                  r.components?.some((b: any) => b.customId === 'btn_open_ticket_modal' || b.customId === 'btn_ticket_open_direct')
                );
                const hasSupportEmbed = msg.embeds?.some((e: any) =>
                  e.title?.toLowerCase().includes('support') || e.author?.name?.toLowerCase().includes('support')
                );
                if (hasOpenButton || hasSupportEmbed) {
                  await sendOrEditTicketPanel(msg, {
                    guild: message.guild,
                    title: config.panelTitle,
                    description: config.panelDescription,
                    guidelines: config.panelGuidelines,
                    footerWarning: config.panelFooterWarning
                  }, true).catch(() => {});
                  updated++;
                  if (!activePanels.some((p: any) => p.id === msg.id)) {
                    activePanels.push({
                      id: msg.id,
                      channelId: message.channel.id,
                      channelName: (message.channel as any).name,
                      title: config.panelTitle || 'Supports',
                      description: config.panelDescription || 'Support & inquiries',
                      createdAt: new Date()
                    });
                  }
                }
              }
            }
          }
        } catch (e) {}

        config.activePanels = activePanels;
        context?.updateModuleConfig?.('tickets', config);

        if (updated > 0) {
          return statusMsg.edit({ content: `${VERIFIED_ICON} Successfully updated **${updated}** support panel message(s) with the redesigned UI!` });
        } else {
          // If no message found to update, deploy a fresh one in current channel
          const postedMsg = await sendOrEditTicketPanel(message.channel, {
            guild: message.guild,
            title: config.panelTitle,
            description: config.panelDescription,
            guidelines: config.panelGuidelines,
            footerWarning: config.panelFooterWarning
          }, false);
          activePanels.push({
            id: postedMsg.id,
            channelId: message.channel.id,
            channelName: (message.channel as any).name,
            title: config.panelTitle || 'Supports',
            description: config.panelDescription || 'Support & inquiries',
            createdAt: new Date()
          });
          config.activePanels = activePanels;
          context?.updateModuleConfig?.('tickets', config);
          return statusMsg.edit({ content: `${VERIFIED_ICON} No existing panel found to edit, so a new redesigned panel was deployed in ${(message.channel as any)}!` });
        }
      }

      // GUI Management Dashboard
      if (sub === 'config' || sub === 'manager' || sub === 'tkmgr' || sub === 'dashboard' || sub === 'gui') {
        const { embed, components, payload } = buildDashboardComponents(config, message.guild);
        return message.reply(payload || { embeds: [embed], components });
      }

      // Direct Deploy Support Panel to Channel
      if (sub === 'deploy' || sub === 'send' || sub === 'panel' || sub === 'setup') {
        const postedMsg = await sendOrEditTicketPanel(message.channel, {
          guild: message.guild,
          title: config.panelTitle,
          description: config.panelDescription,
          guidelines: config.panelGuidelines,
          footerWarning: config.panelFooterWarning
        }, false);

        const newPanel = {
          id: postedMsg.id,
          channelId: message.channel.id,
          channelName: (message.channel as any).name,
          title: config.panelTitle || 'Supports',
          description: config.panelDescription || 'Support & inquiries',
          createdAt: new Date()
        };

        const activePanels = config.activePanels || [];
        activePanels.push(newPanel);
        config.activePanels = activePanels;
        context?.updateModuleConfig?.('tickets', config);

        return message.reply({ content: `${VERIFIED_ICON} Live support panel deployed in ${(message.channel as any)}!` });
      }

      // Guidelines & Rules Configuration Command
      if (sub === 'guidelines' || sub === 'rules' || sub === 'terms') {
        const action = args[1]?.toLowerCase();
        if (action === 'reset') {
          config.panelGuidelines = DEFAULT_TICKET_GUIDELINES;
          config.panelFooterWarning = DEFAULT_TICKET_FOOTER_WARNING;
          context?.updateModuleConfig?.('tickets', config);
          return message.reply({ content: `${VERIFIED_ICON} Reset ticket panel guidelines and footer notice back to factory defaults!` });
        }

        if (!action || action === 'view' || action === 'show') {
          const previewEmbed = buildTicketSupportPanelEmbed({
            guild: message.guild,
            title: config.panelTitle,
            description: config.panelDescription,
            guidelines: config.panelGuidelines,
            footerWarning: config.panelFooterWarning
          });
          return message.reply({
            content: `📜 **Current Support Panel Guidelines & Template:**\n*(To customize, use GUI \`r!ticket gui\` -> **Panel Guidelines** or \`r!ticket guidelines set <text>\`)*`,
            embeds: [previewEmbed]
          });
        }

        if (action === 'set' || action === 'update') {
          const newText = args.slice(2).join(' ').trim();
          if (!newText) {
            return message.reply({ content: `${WRONG_ICON} Please provide the guidelines text or use \`r!ticket gui\` for the interactive editor.` });
          }
          config.panelGuidelines = newText;
          context?.updateModuleConfig?.('tickets', config);

          // Auto-sync active panels
          let synced = 0;
          for (const panel of (config.activePanels || [])) {
            try {
              const chan = await message.guild.channels.fetch(panel.channelId).catch(() => null);
              if (chan && chan.isTextBased()) {
                const msg = await (chan as any).messages?.fetch(panel.id).catch(() => null);
                if (msg) {
                  await sendOrEditTicketPanel(msg, {
                    guild: message.guild,
                    title: config.panelTitle,
                    description: config.panelDescription,
                    guidelines: config.panelGuidelines,
                    footerWarning: config.panelFooterWarning
                  }, true).catch(() => { });
                  synced++;
                }
              }
            } catch (e) { }
          }

          return message.reply({ content: `${VERIFIED_ICON} Ticket guidelines updated!${synced > 0 ? ` (Auto-synced **${synced}** live support panel(s))` : ''}` });
        }
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

      // Staff Control Panel for Active Ticket Channel
      if (sub === 'control' || sub === 'cpanel' || sub === 'staff') {
        const currentTickets: ITicket[] = config.activeTickets || [];
        const ticket = currentTickets.find(t => t.channelId === message.channel.id) || {
          id: `ticket_${message.channel.id}`,
          userId: message.author.id,
          category: 'General Support',
          subject: 'Support Ticket'
        } as any;
        const { embed, components, payload } = buildTicketControlPanelEmbed(ticket, message.guild);
        return message.reply(payload || { embeds: [embed], components });
      }

      // Lock Ticket Channel
      if (sub === 'lock') {
        const currentTickets: ITicket[] = config.activeTickets || [];
        const ticket = currentTickets.find(t => t.channelId === message.channel.id);
        if (ticket) {
          ticket.lockStatus = 'Locked';
          config.activeTickets = currentTickets;
          context?.updateModuleConfig?.('tickets', { ...config, activeTickets: config.activeTickets });
          if (ticket.userId) {
            await (message.channel as any).permissionOverwrites?.edit?.(ticket.userId, { SendMessages: false }).catch(() => { });
          }
        }
        const currentName = (message.channel as any).name || '';
        const newName = `[ Locked ] ${currentName.replace(/\[.*?\]/g, '').trim()}`;
        await (message.channel as any).setName(newName).catch(() => { });
        return message.reply({ content: `${VERIFIED_ICON} Ticket channel locked and renamed to **#${newName}**.` });
      }

      // Unlock Ticket Channel
      if (sub === 'unlock') {
        const currentTickets: ITicket[] = config.activeTickets || [];
        const ticket = currentTickets.find(t => t.channelId === message.channel.id);
        if (ticket) {
          ticket.lockStatus = 'Unlocked';
          config.activeTickets = currentTickets;
          context?.updateModuleConfig?.('tickets', { ...config, activeTickets: config.activeTickets });
          if (ticket.userId) {
            await (message.channel as any).permissionOverwrites?.edit?.(ticket.userId, { SendMessages: true }).catch(() => { });
          }
        }
        const currentName = (message.channel as any).name || '';
        const newName = `[ Current ] ${currentName.replace(/\[.*?\]/g, '').trim()}`;
        await (message.channel as any).setName(newName).catch(() => { });
        return message.reply({ content: `${VERIFIED_ICON} Ticket channel unlocked and renamed to **#${newName}**.` });
      }

      // Archive Ticket Channel
      if (sub === 'archive') {
        const currentName = (message.channel as any).name || '';
        const newName = `[ Resolved ] ${currentName.replace(/\[.*?\]/g, '').trim()}`;
        await (message.channel as any).setName(newName).catch(() => { });
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
        }).catch(() => { });

        return message.reply({ content: `${VERIFIED_ICON} User ${target} has been added to this ticket channel.` });
      }

      // Remove User / Moderator
      if (sub === 'remove') {
        const target = message.mentions.members?.first() || (args[1] ? await message.guild.members.fetch(args[1].replace(/[<@!>]/g, '')).catch(() => null) : null);
        if (!target) return message.reply({ content: `${WRONG_ICON} Please specify a valid user to remove: \`r!ticket remove @user\`` });

        await (message.channel as any).permissionOverwrites.delete(target.id).catch(() => { });
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
        const currentTickets: ITicket[] = config.activeTickets || [];
        const ticket = currentTickets.find(t => t.channelId === message.channel.id);
        if (ticket) {
          ticket.priority = level.toLowerCase() as any;
          config.activeTickets = currentTickets;
          context?.updateModuleConfig?.('tickets', { ...config, activeTickets: config.activeTickets });
        }
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
        const activeTicketChannelIds = new Set((config.activeTickets || []).map((t: any) => t.channelId));
        const protectedChannelIds = new Set<string>([
          ...((config as any).panelChannelId ? [(config as any).panelChannelId] : []),
          ...((config as any).logChannelId ? [(config as any).logChannelId] : []),
          ...(config.transcriptChannelId ? [config.transcriptChannelId] : []),
          ...((config.activePanels || []).map((p: any) => p.channelId).filter(Boolean)),
          ...(((config as any).panels || []).map((p: any) => p.channelId).filter(Boolean))
        ]);

        const ticketChannels = message.guild.channels.cache.filter((c: any) => {
          if (!c.isTextBased() || protectedChannelIds.has(c.id)) return false;
          const lowerName = (c.name || '').toLowerCase();
          return (
            activeTicketChannelIds.has(c.id) ||
            lowerName.startsWith('ticket-') ||
            lowerName.startsWith('[ open ]') ||
            lowerName.startsWith('[ claimed ]') ||
            lowerName.startsWith('[ locked ]') ||
            lowerName.startsWith('[ resolved ]')
          );
        });

        let deletedCount = 0;
        for (const [id, chan] of ticketChannels) {
          await (chan as any).delete().then(() => deletedCount++).catch(() => { });
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
                  await msg.delete().then(() => deletedCount++).catch(() => { });
                }
              }
            }
          }
        } catch (e) { }

        const activePanels = (config.activePanels || []).filter((p: any) => p.channelId !== targetChan.id);
        config.activePanels = activePanels;
        context?.updateModuleConfig?.('tickets', config);

        return message.reply({ content: `${VERIFIED_ICON} Support ticket panel deleted from ${targetChan} (${deletedCount} panel message(s) removed).` });
      }

      // Close Ticket Command: r!ticket close [email|skip]
      if (sub === 'close') {
        const currentTickets: ITicket[] = config.activeTickets || [];
        const ticket = currentTickets.find(t => t.channelId === message.channel.id);
        const isCreator = ticket && ticket.userId === message.author.id;
        const isAuthorized = await isTicketStaffOrAdmin(message.author.id, message.guild, config);

        if (
          !ticket &&
          !(message.channel as any).name?.startsWith('ticket-') &&
          !(message.channel as any).name?.includes('Resolved') &&
          !(message.channel as any).name?.includes('Locked')
        ) {
          return message.reply({ content: `${WRONG_ICON} This command can only be used inside an active ticket channel.` });
        }

        if (!isAuthorized && !isCreator) {
          return message.reply({ content: `${WRONG_ICON} Access Denied: Only the ticket creator or Support Staff can close this ticket.` });
        }

        const emailArg = args[1]?.trim();
        if (emailArg && emailArg.includes('@') && emailArg.includes('.') && !emailArg.toLowerCase().includes('skip')) {
          return closeTicketChannel(message.client, message, context, config, { userEmail: emailArg });
        } else if (emailArg?.toLowerCase() === 'skip') {
          return closeTicketChannel(message.client, message, context, config, { userEmail: undefined });
        }

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('btn_ticket_close').setLabel('Close & Enter Email').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('btn_ticket_close_skip').setLabel('Quick Close (Skip Email)').setStyle(ButtonStyle.Danger)
        );

        return message.reply({
          content: `Would you like an email copy of this ticket transcript before closing?\nClick **Close & Enter Email** to provide your email address, or **Quick Close (Skip Email)** to proceed immediately.`,
          components: [row]
        });
      }

      // Default fallback: show Dashboard
      const { embed, components, payload } = buildDashboardComponents(config, message.guild);
      return message.reply(payload || { embeds: [embed], components });
    }
  });

  // Command: !close
  PrefixRegistry.register({
    name: 'close',
    description: 'Close active support ticket and dispatch transcripts (DM & Email)',
    category: 'Tickets',
    usage: 'r!close [email|skip]',
    cooldownSeconds: 3,
    examples: ['r!close', 'r!close myemail@gmail.com', 'r!close skip'],
    moduleOwnerId: 'tickets',
    dangerLevel: 'Low',
    execute: async (message: Message, args: string[], context?: any) => {
      if (!message.guild) return;
      const modules = context?.getModulesState ? context.getModulesState(message.guild.id) : [];
      const ticketMod = modules.find((m: any) => m.id === 'tickets');
      const config: ITicketConfig = { ...getDefaultConfig(), ...(ticketMod?.config || {}) };

      const currentTickets: ITicket[] = config.activeTickets || [];
      const ticket = currentTickets.find(t => t.channelId === message.channel.id);
      const isCreator = ticket && ticket.userId === message.author.id;
      const isAuthorized = await isTicketStaffOrAdmin(message.author.id, message.guild, config);

      if (
        !ticket &&
        !(message.channel as any).name?.startsWith('ticket-') &&
        !(message.channel as any).name?.includes('Resolved') &&
        !(message.channel as any).name?.includes('Locked')
      ) {
        return message.reply({ content: `${WRONG_ICON} This command can only be used inside an active ticket channel.` });
      }

      if (!isAuthorized && !isCreator) {
        return message.reply({ content: `${WRONG_ICON} Access Denied: Only the ticket creator or Support Staff can close this ticket.` });
      }

      const emailArg = args[0]?.trim();
      if (emailArg && emailArg.includes('@') && emailArg.includes('.') && !emailArg.toLowerCase().includes('skip')) {
        return closeTicketChannel(message.client, message, context, config, { userEmail: emailArg });
      } else if (emailArg?.toLowerCase() === 'skip') {
        return closeTicketChannel(message.client, message, context, config, { userEmail: undefined });
      }

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('btn_ticket_close').setLabel('Close & Enter Email').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_ticket_close_skip').setLabel('Quick Close (Skip Email)').setStyle(ButtonStyle.Danger)
      );

      return message.reply({
        content: `Would you like an email copy of this ticket transcript before closing?\nClick **Close & Enter Email** to provide your email address, or **Quick Close (Skip Email)** to proceed immediately.`,
        components: [row]
      });
    }
  });
}

