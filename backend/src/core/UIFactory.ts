/**
 * UIFactory — Rage Optimiser Enterprise Design System
 *
 * Centralized factory for all Discord Components V2 and enhanced embeds.
 * All modules must import from here instead of creating ad-hoc embeds.
 *
 * Components V2 requires MessageFlags.IsComponentsV2 when sending.
 * Classic embeds (EmbedBuilder) remain supported for webhook contexts.
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
  type AnyComponentBuilder,
} from 'discord.js';

export const VERIFIED_ICON = '<a:approved:1532390590707142956>';
export const WRONG_ICON = '<:wrong:1532390628330307634>';

// ─────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────
export const Colors = {
  BRAND:   0x7C5CFC,  // Rage Violet primary
  LIME:    0x7C5CFC,  // Accent primary
  SUCCESS: 0x10B981,  // Emerald Green
  WARN:    0xF59E0B,  // Amber
  DANGER:  0xEF4444,  // Red
  GOLD:    0xD4AF37,  // Premium gold
  MUTED:   0x5C6370,  // Disabled/neutral
  TICKET:  0x4F8CFF,  // Ticket system
  VOICE:   0x3B82F6,  // Voice accent
  MUSIC:   0xA855F7,  // Music accent
  INFO:    0x06B6D4,  // Cyan info
  BOOST:   0xF47FFF,  // Server boost pink
} as const;


// ─────────────────────────────────────────────
// MODULE IDENTITIES
// ─────────────────────────────────────────────
export const ModuleMeta = {
  leveling:      { icon: '⭐', name: 'Leveling & Economy',   color: Colors.GOLD },
  giveaway:      { icon: '🎉', name: 'Giveaway Manager',     color: Colors.GOLD },
  tickets:       { icon: '🎫', name: 'Ticket System',        color: Colors.TICKET },
  announcements: { icon: '📢', name: 'Announcements',        color: Colors.INFO },
  welcome:       { icon: '👋', name: 'Welcome System',       color: Colors.BRAND },
  voice:         { icon: '🎙️', name: 'Voice Manager',        color: Colors.VOICE },
  automod:       { icon: '⚙️', name: 'AutoMod',              color: Colors.WARN },
  security:      { icon: '🛡️', name: 'Security',            color: Colors.DANGER },
  analytics:     { icon: '📊', name: 'Analytics',            color: Colors.BRAND },
  music:         { icon: '🎵', name: 'Music',                color: Colors.MUSIC },
  help:          { icon: '⚡', name: 'Command Hub',          color: Colors.BRAND },
  system:        { icon: '🔧', name: 'System',               color: Colors.MUTED },
} as const;

export type ModuleKey = keyof typeof ModuleMeta;

// ─────────────────────────────────────────────
// FOOTER & AUTHOR HELPERS
// ─────────────────────────────────────────────
const BRAND_FOOTER = 'Rage Optimiser Enterprise';

function moduleFooterText(module?: ModuleKey | string): string {
  if (!module) return BRAND_FOOTER;
  const meta = ModuleMeta[module as ModuleKey];
  return `${BRAND_FOOTER}  •  ${meta ? meta.icon + ' ' + meta.name : module}`;
}

// ─────────────────────────────────────────────
// EMBED FACTORY (EmbedBuilder wrappers)
// Used where Components V2 is unsuitable (webhooks, DMs, etc.)
// ─────────────────────────────────────────────
export interface EmbedOptions {
  module?: ModuleKey | string;
  thumbnail?: string | null;
  image?: string | null;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  authorIcon?: string | null;
  footerIcon?: string | null;
  timestamp?: boolean;
  footer?: string;
}

function stripLeadingEmoji(text: string): string {
  if (!text) return '';
  return text.replace(/^[❌✅🔒⚠️🧊🌡️🔓🧹🔨✏️⏱️🔕👁️📋📜📈📝🔗🏓🪙🎲😂☀️💡🛡️✨💬👟🤖⚙️🪄🎨🎟️⏳🔊\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+\s*/u, '').trim();
}

export const Embeds = {
  info(title: string, description: string, opts: EmbedOptions = {}): EmbedBuilder {
    const cleanTitle = stripLeadingEmoji(title);
    return buildBaseEmbed(Colors.BRAND, title, description, opts);
  },

  success(title: string, description: string, opts: EmbedOptions = {}): EmbedBuilder {
    return buildBaseEmbed(Colors.SUCCESS, title, description, opts);
  },

  warn(title: string, description: string, opts: EmbedOptions = {}): EmbedBuilder {
    return buildBaseEmbed(Colors.WARN, title, description, opts);
  },

  error(title: string, description: string, opts: EmbedOptions = {}): EmbedBuilder {
    return buildBaseEmbed(Colors.DANGER, title, description, opts);
  },

  premium(title: string, description: string, opts: EmbedOptions = {}): EmbedBuilder {
    return buildBaseEmbed(Colors.GOLD, title, description, opts);
  },

  module(mod: ModuleKey | string, title: string, description: string, opts: EmbedOptions = {}): EmbedBuilder {
    return buildBaseEmbed(Colors.BRAND, title, description, { ...opts, module: mod });
  },

  denied(reason: string, opts: EmbedOptions = {}): EmbedBuilder {
    return buildBaseEmbed(Colors.DANGER, '🔒 Access Denied', reason, opts);
  },

  permError(permission: string, opts: EmbedOptions = {}): EmbedBuilder {
    return buildBaseEmbed(Colors.DANGER, '🔒 Permission Required', `You require the **${permission}** permission to execute this operation.`, opts);
  },
};


function buildBaseEmbed(
  color: number,
  title: string,
  description: string,
  opts: EmbedOptions = {}
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp()
    .setFooter({
      text: opts.footer ?? moduleFooterText(opts.module),
      iconURL: opts.footerIcon ?? undefined,
    });

  if (opts.thumbnail) embed.setThumbnail(opts.thumbnail);
  if (opts.image) embed.setImage(opts.image);
  if (opts.fields && opts.fields.length > 0) {
    embed.addFields(opts.fields);
  }
  if (opts.authorIcon && title) {
    embed.setAuthor({ name: title, iconURL: opts.authorIcon });
    embed.setTitle(''); // avoid duplicating title in author
  }

  return embed;
}

export function buildMinimalAction(opts: {
  user: any;
  action: string;
  target?: string | any;
  toOrFrom?: 'to' | 'from' | '|' | '';
  extra?: string;
  color?: number;
}): EmbedBuilder {
  const color = opts.color ?? Colors.LIME;
  const linkWord = opts.toOrFrom ? ` **${opts.toOrFrom}** ` : (opts.target ? ' ' : '');
  const targetStr = opts.target ? `${linkWord}${opts.target}` : '';
  const extraStr = opts.extra ? ` ${opts.extra}` : '';
  
  return new EmbedBuilder()
    .setColor(color)
    .setDescription(`${VERIFIED_ICON} ${opts.user} **${opts.action}**${targetStr}${extraStr}`);
}

export function buildLimeOverviewCard(opts: {
  title: string;
  subtitle?: string;
  thumbnail?: string;
  sections: Array<{
    title?: string;
    items: string[];
  }>;
  footerText?: string;
  color?: number;
}): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(opts.color ?? Colors.LIME)
    .setTimestamp();

  embed.setFooter({ text: opts.footerText ?? 'Rage Optimiser • Security Engine' });

  let desc = `> • **${opts.title.toUpperCase()}**\n`;
  desc += `> • **${opts.subtitle ? opts.subtitle.toUpperCase() : 'RAGE OPTIMISER'}**\n\n`;

  for (const sec of opts.sections) {
    if (sec.title) {
      desc += `> **${sec.title}**\n`;
    }
    desc += sec.items.map(item => {
      if (item.startsWith('<a:') || item.startsWith('<:')) {
        return `> ${item}`;
      }
      return `> ${VERIFIED_ICON} __**${item}**__`;
    }).join('\n') + `\n\n`;
  }

  embed.setDescription(desc.trim());
  if (opts.thumbnail) embed.setThumbnail(opts.thumbnail);

  return embed;
}

// ─────────────────────────────────────────────
// COMPONENTS V2 FACTORY
// Produces ContainerBuilder messages with IsComponentsV2 flag
// ─────────────────────────────────────────────

export interface CV2Options {
  accentColor?: number;
  /** Extra text-display sections to append */
  extraSections?: string[];
}

/**
 * Build a Components V2 container for a simple status card.
 * Returns { components, flags } ready to spread into interaction.reply()
 */
export function buildStatusCard(opts: {
  emoji: string;
  title: string;
  body: string;
  accentColor?: number;
  thumbnailUrl?: string;
  fields?: Array<{ label: string; value: string }>;
}): { components: ContainerBuilder[]; flags: number } {
  const color = opts.accentColor ?? Colors.BRAND;

  const container = new ContainerBuilder().setAccentColor(color);

  // Header section (with optional thumbnail)
  const headerSection = new SectionBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${opts.emoji} ${opts.title}`)
  );

  if (opts.thumbnailUrl) {
    headerSection.setThumbnailAccessory(
      new ThumbnailBuilder().setURL(opts.thumbnailUrl)
    );
  }

  container.addSectionComponents(headerSection);

  // Body separator
  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
  );

  // Body text
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(opts.body)
  );

  // Optional fields
  if (opts.fields && opts.fields.length > 0) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
    for (const f of opts.fields) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**${f.label}**\n${f.value}`)
      );
    }
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}

/**
 * Quick reply helper for standard error responses in Components V2 layout
 */
export function buildErrorCard(text: string, title = 'Error'): { components: ContainerBuilder[]; flags: number } {
  return buildStatusCard({
    emoji: WRONG_ICON,
    title,
    body: text,
    accentColor: Colors.DANGER,
  });
}

/**
 * Quick reply helper for standard success responses in Components V2 layout
 */
export function buildSuccessCard(text: string, title = 'Success'): { components: ContainerBuilder[]; flags: number } {
  return buildStatusCard({
    emoji: VERIFIED_ICON,
    title,
    body: text,
    accentColor: Colors.SUCCESS,
  });
}

/**
 * Quick reply helper for warning responses in Components V2 layout
 */
export function buildWarnCard(text: string, title = 'Warning'): { components: ContainerBuilder[]; flags: number } {
  return buildStatusCard({
    emoji: '⚠️',
    title,
    body: text,
    accentColor: Colors.WARN,
  });
}

/**
 * Quick reply helper for permission error responses in Components V2 layout
 */
export function buildPermCard(permission: string): { components: ContainerBuilder[]; flags: number } {
  return buildStatusCard({
    emoji: '🔒',
    title: 'Access Denied',
    body: `You need the **${permission}** permission to execute this operation.`,
    accentColor: Colors.DANGER,
  });
}

/**
 * Build a Components V2 leaderboard / multi-entry list card.
 */
export function buildListCard(opts: {
  emoji: string;
  title: string;
  subtitle?: string;
  entries: string[];
  accentColor?: number;
  thumbnailUrl?: string;
}): { components: ContainerBuilder[]; flags: number } {
  const color = opts.accentColor ?? Colors.BRAND;
  const container = new ContainerBuilder().setAccentColor(color);

  const headerSection = new SectionBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${opts.emoji} ${opts.title}` + (opts.subtitle ? `\n-# ${opts.subtitle}` : '')
    )
  );

  if (opts.thumbnailUrl) {
    headerSection.setThumbnailAccessory(
      new ThumbnailBuilder().setURL(opts.thumbnailUrl)
    );
  }

  container.addSectionComponents(headerSection);
  container.addSeparatorComponents(
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
  );

  const listText = opts.entries.join('\n') || '*No entries found.*';
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(listText)
  );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}

/**
 * Build a full-featured Components V2 card with header, fields grid, and footer note.
 */
export function buildRichCard(opts: {
  emoji: string;
  title: string;
  description?: string;
  accentColor?: number;
  thumbnailUrl?: string;
  fields?: Array<{ label: string; value: string; inline?: boolean }>;
  footerNote?: string;
  actionRow?: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>;
}): { components: (ContainerBuilder | ActionRowBuilder<any>)[]; flags: number } {
  const color = opts.accentColor ?? Colors.BRAND;
  const container = new ContainerBuilder().setAccentColor(color);

  // Header section
  const headerSection = new SectionBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${opts.emoji} ${opts.title}`)
  );

  if (opts.thumbnailUrl) {
    headerSection.setThumbnailAccessory(
      new ThumbnailBuilder().setURL(opts.thumbnailUrl)
    );
  }

  container.addSectionComponents(headerSection);

  if (opts.description) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
    );
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(opts.description)
    );
  }

  // Fields
  if (opts.fields && opts.fields.length > 0) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );
    for (const f of opts.fields) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**${f.label}**\n${f.value}`)
      );
    }
  }

  // Footer note
  if (opts.footerNote) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
    );
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${opts.footerNote}`)
    );
  }

  const components: (ContainerBuilder | ActionRowBuilder<any>)[] = [container];
  if (opts.actionRow) {
    components.push(opts.actionRow);
  }

  return {
    components,
    flags: MessageFlags.IsComponentsV2,
  };
}

// ─────────────────────────────────────────────
// COMPONENT ROW FACTORY
// ─────────────────────────────────────────────
export const Components = {
  /**
   * Confirm (Danger) + Cancel (Secondary) row
   */
  confirmRow(confirmId: string, cancelId: string, labels?: { confirm?: string; cancel?: string }): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(confirmId)
        .setLabel(labels?.confirm ?? 'Confirm')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId(cancelId)
        .setLabel(labels?.cancel ?? 'Cancel')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('✖️')
    );
  },

  /**
   * Row of link buttons
   */
  linkRow(buttons: Array<{ label: string; url: string; emoji?: string }>): ActionRowBuilder<ButtonBuilder> {
    const btns = buttons.slice(0, 5).map(b => {
      const btn = new ButtonBuilder()
        .setLabel(b.label)
        .setStyle(ButtonStyle.Link)
        .setURL(b.url);
      if (b.emoji) btn.setEmoji(b.emoji);
      return btn;
    });
    return new ActionRowBuilder<ButtonBuilder>().addComponents(btns);
  },

  /**
   * Pagination nav: Previous / Page X/Y / Next
   */
  navRow(prevId: string, nextId: string, page: number, total: number): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(prevId)
        .setLabel('◀ Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 1),
      new ButtonBuilder()
        .setCustomId('page_indicator')
        .setLabel(`Page ${page} / ${total}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(nextId)
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= total)
    );
  },

  /**
   * Single action button row (primary)
   */
  primaryButton(id: string, label: string, emoji?: string): ActionRowBuilder<ButtonBuilder> {
    const btn = new ButtonBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(ButtonStyle.Primary);
    if (emoji) btn.setEmoji(emoji);
    return new ActionRowBuilder<ButtonBuilder>().addComponents(btn);
  },

  /**
   * Success + Danger button row (claim/close, start/cancel patterns)
   */
  actionPair(
    successId: string, successLabel: string, successEmoji: string,
    dangerID: string, dangerLabel: string, dangerEmoji: string
  ): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(successId).setLabel(successLabel).setStyle(ButtonStyle.Success).setEmoji(successEmoji),
      new ButtonBuilder().setCustomId(dangerID).setLabel(dangerLabel).setStyle(ButtonStyle.Danger).setEmoji(dangerEmoji)
    );
  },

  /**
   * Jump-to-message link button
   */
  jumpButton(url: string, label = 'Jump to Message'): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url).setEmoji('↗️')
    );
  },
};

// ─────────────────────────────────────────────
// XP / PROGRESS BAR HELPER
// ─────────────────────────────────────────────

/**
 * Render a Unicode block-style progress bar.
 * @param current Current value
 * @param max Max value
 * @param size Bar width in blocks (default 12)
 */
export function progressBar(current: number, max: number, size = 12): string {
  const ratio = max > 0 ? Math.min(current / max, 1) : 0;
  const filled = Math.round(ratio * size);
  const empty = size - filled;
  return '█'.repeat(filled) + '░'.repeat(empty) + ` \`${Math.round(ratio * 100)}%\``;
}

/**
 * Format a large number with commas.
 */
export function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Discord timestamp for a Date or Unix seconds.
 */
export function ts(dateOrSec: Date | number, style: 'R' | 'F' | 'f' | 'D' | 'd' | 'T' | 't' = 'R'): string {
  const sec = typeof dateOrSec === 'number' ? dateOrSec : Math.floor(dateOrSec.getTime() / 1000);
  return `<t:${sec}:${style}>`;
}
