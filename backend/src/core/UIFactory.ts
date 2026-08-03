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
export const SQUARE_TICK_ICON = '<:ticks:1532620580266836148>';
export const WRONG_ICON = '<:wrong:1532390628330307634>';
export const SHIELD_ICON = '<:shield:1532403012751065179>';
export const GAVEL_ICON = '<:gavel:1532621057318584380>';
export const BOT_ICON = '<:bot:1532621107746570391>';
export const MEMBER_ICON = '<:member:1532621317487071426>';
export const INFO_ICON = '<:information:1532621274092929124>';
export const BOOSTER_ICON = '<:booster:1532621228492460172>';
export const ARROW_ICON = '<:lightpurplearrow:1532621364115013693>';
export const CONFIG_ICON = '<:config:1532425712844144701>';
export const TICKET_ICON = '<:ticket:1532620631466836021>';
export const TIMER_ICON = '<:timer:1532620491662037123>';
export const VIP_ICON = '<:vip:1532620837117759508>';
export const LINK_ICON = '<:link:1532620952087826602>';

// ─────────────────────────────────────────────
// DESIGN TOKENS (Matching Lime.gg visual design with Rage Optimiser branding)
// ─────────────────────────────────────────────
export const Colors = {
  BRAND: 0x99CC00,  // Lime Green primary (#99CC00 / #BEF264)
  LIME: 0x99CC00,  // Accent primary lime
  SUCCESS: 0x10B981,  // Emerald Green
  WARN: 0xF59E0B,  // Amber
  DANGER: 0xEF4444,  // Red
  GOLD: 0xD4AF37,  // Premium gold
  MUTED: 0x5C6370,  // Disabled/neutral
  TICKET: 0x4F8CFF,  // Ticket system
  VOICE: 0x3B82F6,  // Voice accent
  MUSIC: 0xA855F7,  // Music accent
  INFO: 0x06B6D4,  // Cyan info
  BOOST: 0xF47FFF,  // Server boost pink
} as const;

export function createLimeEmbed(options: {
  author?: string;
  title: string;
  description?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  color?: string | number;
  commandBox?: string;
  thumbnail?: string;
  footerText?: string;
  client?: any;
}): EmbedBuilder {
  const colorVal = typeof options.color === 'number'
    ? options.color
    : (options.color || 0x99CC00);

  const embed = new EmbedBuilder()
    .setAuthor({ name: options.author || 'Rage Optimiser' })
    .setTitle(options.title)
    .setColor(colorVal as any)
    .setFooter({
      text: options.footerText || `Rage Optimiser • Unbypassable Security`,
      iconURL: options.client?.user?.displayAvatarURL?.()
    })
    .setTimestamp();

  if (options.description) {
    embed.setDescription(options.description);
  }

  if (options.fields && options.fields.length > 0) {
    embed.addFields(options.fields);
  }

  if (options.commandBox) {
    embed.addFields({
      name: `${INFO_ICON} System Command`,
      value: `\`\`\`${options.commandBox}\`\`\``,
      inline: false
    });
  }

  if (options.thumbnail && options.thumbnail.startsWith('http')) {
    embed.setThumbnail(options.thumbnail);
  }

  return embed;
}

// ─────────────────────────────────────────────
// MODULE IDENTITIES
// ─────────────────────────────────────────────
export const ModuleMeta = {
  leveling: { icon: VIP_ICON, name: 'Leveling & Economy', color: Colors.GOLD },
  giveaway: { icon: '<:cart:1532621146208473115>', name: 'Giveaway Manager', color: Colors.GOLD },
  tickets: { icon: TICKET_ICON, name: 'Ticket System', color: Colors.TICKET },
  announcements: { icon: INFO_ICON, name: 'Announcements', color: Colors.INFO },
  welcome: { icon: MEMBER_ICON, name: 'Welcome System', color: Colors.BRAND },
  voice: { icon: '<:voicechannelgreen:1532425750278438962>', name: 'Voice Manager', color: Colors.VOICE },
  automod: { icon: GAVEL_ICON, name: 'AutoMod', color: Colors.WARN },
  security: { icon: SHIELD_ICON, name: 'Security', color: Colors.DANGER },
  analytics: { icon: '<:stats:1532429110775779459>', name: 'Analytics', color: Colors.BRAND },
  music: { icon: '<:voicechannelgreen:1532425750278438962>', name: 'Music', color: Colors.MUSIC },
  help: { icon: CONFIG_ICON, name: 'Command Hub', color: Colors.BRAND },
  prebot_whitelist: { icon: BOT_ICON, name: 'PreBot Whitelist', color: Colors.INFO },
  system: { icon: BOT_ICON, name: 'System', color: Colors.MUTED },
} as const;

export type ModuleKey = keyof typeof ModuleMeta;

// ─────────────────────────────────────────────
// FOOTER & AUTHOR HELPERS
// ─────────────────────────────────────────────
const BRAND_FOOTER = 'Rage Optimiser • Unbypassable Security';

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
    return buildBaseEmbed(Colors.DANGER, '<:shield:1532403012751065179> Access Denied', reason, opts);
  },

  permError(permission: string, opts: EmbedOptions = {}): EmbedBuilder {
    return buildBaseEmbed(Colors.DANGER, '<:shield:1532403012751065179> Permission Required', `You require the **${permission}** permission to execute this operation.`, opts);
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
  } else {
    embed.setAuthor({ name: 'Rage Optimiser Enterprise • Core Security Engine' });
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
    .setAuthor({ name: 'Rage Optimiser' })
    .setTimestamp();

  embed.setFooter({ text: opts.footerText ?? 'Rage Optimiser • Unbypassable Security' });

  let desc = `> • **${opts.title.toUpperCase()}**\n`;
  desc += `> • **${opts.subtitle ? opts.subtitle.toUpperCase() : 'RAGE OPTIMISER'}**\n\n`;

  for (const sec of opts.sections) {
    if (sec.title) {
      desc += `> **${sec.title}**\n`;
    }
    for (const rawItem of sec.items) {
      const lines = String(rawItem).split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith('<a:') || trimmed.startsWith('<:') || trimmed.startsWith('<@') || trimmed.startsWith('@') || trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('`') || trimmed.startsWith('>')) {
          desc += `> ${trimmed.startsWith('>') ? trimmed.slice(1).trim() : trimmed}\n`;
        } else if (trimmed === 'None' || trimmed.startsWith('No members') || trimmed.startsWith('No roles')) {
          desc += `> *${trimmed}*\n`;
        } else {
          desc += `> ${VERIFIED_ICON} ${trimmed}\n`;
        }
      }
    }
    desc += `\n`;
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
 * Build a standard enterprise status card embed.
 * Returns { embeds, components, flags } ready to spread into interaction.reply()
 */
export function buildStatusCard(opts: {
  emoji: string;
  title: string;
  body: string;
  accentColor?: number;
  thumbnailUrl?: string;
  fields?: Array<{ label: string; value: string }>;
}): { embeds: EmbedBuilder[]; components: any[]; flags: number } {
  const color = opts.accentColor ?? Colors.BRAND;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${opts.emoji} ${opts.title}`.trim())
    .setDescription(opts.body)
    .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
    .setTimestamp();

  if (opts.thumbnailUrl) {
    try { embed.setThumbnail(opts.thumbnailUrl); } catch {}
  }

  if (opts.fields && opts.fields.length > 0) {
    embed.addFields(opts.fields.map(f => ({ name: f.label, value: f.value, inline: false })));
  }

  return {
    embeds: [embed],
    components: [],
    flags: 0,
  };
}

/**
 * Quick reply helper for standard error responses
 */
export function buildErrorCard(text: string, title = 'Error'): { embeds: EmbedBuilder[]; components: any[]; flags: number } {
  return buildStatusCard({
    emoji: WRONG_ICON,
    title,
    body: text,
    accentColor: Colors.DANGER,
  });
}

/**
 * Quick reply helper for standard success responses
 */
export function buildSuccessCard(text: string, title = 'Success'): { embeds: EmbedBuilder[]; components: any[]; flags: number } {
  return buildStatusCard({
    emoji: VERIFIED_ICON,
    title,
    body: text,
    accentColor: Colors.BRAND,
  });
}

/**
 * Quick reply helper for warning responses
 */
export function buildWarnCard(text: string, title = 'Warning'): { embeds: EmbedBuilder[]; components: any[]; flags: number } {
  return buildStatusCard({
    emoji: TIMER_ICON,
    title,
    body: text,
    accentColor: Colors.WARN,
  });
}

/**
 * Quick reply helper for permission error responses
 */
export function buildPermCard(permission: string): { embeds: EmbedBuilder[]; components: any[]; flags: number } {
  return buildStatusCard({
    emoji: SHIELD_ICON,
    title: 'Access Denied',
    body: `You need the **${permission}** permission to execute this operation.`,
    accentColor: Colors.DANGER,
  });
}

/**
 * Build an enterprise leaderboard / multi-entry list card embed.
 */
export function buildListCard(opts: {
  emoji: string;
  title: string;
  subtitle?: string;
  entries: string[];
  accentColor?: number;
  thumbnailUrl?: string;
}): { embeds: EmbedBuilder[]; components: any[]; flags: number } {
  const color = opts.accentColor ?? Colors.BRAND;
  const listText = opts.entries.join('\n') || '*No entries found.*';

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${opts.emoji} ${opts.title}`.trim())
    .setDescription((opts.subtitle ? `*${opts.subtitle}*\n\n` : '') + listText)
    .setFooter({ text: 'Rage Optimiser • Unbypassable Security' })
    .setTimestamp();

  if (opts.thumbnailUrl) {
    try { embed.setThumbnail(opts.thumbnailUrl); } catch {}
  }

  return {
    embeds: [embed],
    components: [],
    flags: 0,
  };
}

/**
 * Build a full-featured enterprise card embed with header, fields, and footer.
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
}): { embeds: EmbedBuilder[]; components: any[]; flags: number } {
  const color = opts.accentColor ?? Colors.BRAND;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${opts.emoji} ${opts.title}`.trim())
    .setFooter({ text: opts.footerNote || 'Rage Optimiser • Unbypassable Security' })
    .setTimestamp();

  if (opts.description) {
    embed.setDescription(opts.description);
  }

  if (opts.thumbnailUrl) {
    try { embed.setThumbnail(opts.thumbnailUrl); } catch {}
  }

  if (opts.fields && opts.fields.length > 0) {
    embed.addFields(opts.fields.map(f => ({ name: f.label, value: f.value, inline: !!f.inline })));
  }

  const components: any[] = [];
  if (opts.actionRow) {
    components.push(opts.actionRow);
  }

  return {
    embeds: [embed],
    components,
    flags: 0,
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
        .setEmoji(VERIFIED_ICON),
      new ButtonBuilder()
        .setCustomId(cancelId)
        .setLabel(labels?.cancel ?? 'Cancel')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(WRONG_ICON)
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
