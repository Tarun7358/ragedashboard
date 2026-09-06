/**
 * UIFactory — Rage Optimiser Enterprise Design System
 *
 * Centralized factory for all Discord Components V2, enhanced embeds, cards,
 * and command interactive UI. Built with the UI/UX Pro Max design system.
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

// ─────────────────────────────────────────────
// CUSTOM SERVER ICONS & STATUS BADGES
// ─────────────────────────────────────────────
export const VERIFIED_ICON = '<a:security:1546142576984203336>';
export const SQUARE_TICK_ICON = '<:ticks:1532620580266836148>';
export const WRONG_ICON = '<a:wrong:1546155193303957504>';
export const WARNING_ICON = '<a:warning:1546155457981452441>';
export const VIOLATION_ICON = '<a:warning:1546155457981452441>';
export const SHIELD_ICON = '<a:security:1546142576984203336>';
export const GAVEL_ICON = '<:gavel:1532621057318584380>';
export const BOT_ICON = '<:bot:1532621107746570391>';
export const MEMBER_ICON = '<:member:1532621317487071426>';

export function formatCustomEmoji(client: any, id: string, name: string, isAnimated = true): string {
  if (client?.emojis?.cache) {
    const found = client.emojis.cache.get(id) || client.emojis.cache.find((e: any) => e.name?.toLowerCase() === name?.toLowerCase());
    if (found) {
      return found.toString();
    }
  }
  return isAnimated ? `<a:${name}:${id}>` : `<:${name}:${id}>`;
}
export const INFO_ICON = '<a:lovemail:1527647157371535420>';
export const BOOSTER_ICON = '<:booster:1532621228492460172>';
export const ARROW_ICON = '<:lightpurplearrow:1532621364115013693>';
export const CONFIG_ICON = '<:config:1532425712844144701>';
export const TICKET_ICON = '<:ticket:1532620631466836021>';
export const TIMER_ICON = '<:timer:1532620491662037123>';
export const DEFAULT_BRAND_IMAGE_URL = 'https://cdn.discordapp.com/attachments/1499055667238146289/1538212292980773004/ChatGPT_Image_Aug_15_2026_09_14_48_PM.png?ex=6a81db55&is=6a8089d5&hm=4e8308bbc0423a9b1fa28776ba323ebc65e14534cf9fa9487546a50d6e172d3b';
export const VIP_ICON = '<:vip:1532620837117759508>';
export const LINK_ICON = '<:link:1532620952087826602>';
export const VOICE_ICON = '<:voicechannelgreen:1532425750278438962>';
export const STATS_ICON = '<:stats:1532429110775779459>';
export const CART_ICON = '<:cart:1532621146208473115>';

// Server Custom Emojis
export const YOUTUBE_ICON = '<:9100youtube:1538152286839373905>';
export const DISCORD_ICON = '<:discord:1538152301322174534>';
export const INSTAGRAM_ICON = '<:instagram:1538152297845231736>';
export const TWITTER_ICON = '<:twitter:1538152305411498074>';
export const SNAPCHAT_ICON = '<:snapchat:1538152290551332897>';
export const FACEBOOK_ICON = '<:facebook:1538152294250709072>';
export const WHATSAPP_ICON = '<a:whatsapp:1538167411617042482>';
export const GOLD_CROWN_ICON = '<:goldcrown:1538152266568306769>';
export const GOLD_NITRO_ICON = '<a:goldnitro:1538152283542388766>';
export const VERIFIED_GOLD_ICON = '<:twittergoldcheckmark:1538152262755557498>';
export const FREE_FIRE_ICON = '<:Free_Fire:1534196322943373453>';
export const VALO_ICON = '<:VALO:1534198653286354984>';
export const ROBLOX_ICON = '<:ROBOLOX:1534198700275142927>';
export const DEVELOPER_ICON = '<a:Developer:1538167332063678534>';
export const ANNOUNCEMENTS_ICON = '<a:announcements:1538167338904457216>';
export const SOUNDWAVE_ICON = '<a:soundwave:1538167360287154288>';
export const RED_TICK_ICON = '<a:redtick:1538167393522557039>';
export const ANIMATED_ARROW_RED = '<a:animatedarrowred:1538167386790830190>';
export const ANIMATED_ARROW_PINK = '<a:animatedarrowpink2:1538167377597042808>';
export const ANIMATED_ARROW_ORANGE = '<a:animatedarroworange:1538167381778759680>';
export const ANIMATED_APPROVED_ICON = '<a:security:1546142576984203336>';
export const VERIFIED_BLUE_ICON = '<:verifiedblue:1518869383219253328>';
export const VERIFIED_GREEN_ICON = '<:verifiedgreen:1518869413846188152>';
export const VERIFIED_PURPLE_ICON = '<:verifiedpurple:1518869442086572102>';
export const CROWN_ANIMATED_ICON = '<a:1115crown3:1518868785493184518>';
export const SPIN_ANIMATED_ICON = '<a:loading:1546134620087783526>';
export const LOADING_ANIMATED_ICON = '<a:loading:1546134620087783526>';
export const SUCCESS_CHECK_ICON = '<a:security:1546142576984203336>';
export const ANIMATED_PINK_ARROW = '<a:pinkarrow:1527647307955310722>';
export const ANIMATED_WHITE_ARROW = '<a:animatedarrowwhite:1527647357473132554>';
export const BLACK_BUTTERFLY_ICON = '<a:1941blackbutterfly2:1527646894904578110>';
export const SECURITY_SHIELD_ICON = '<a:security:1546142576984203336>';

// ─────────────────────────────────────────────
// DESIGN TOKENS (UI/UX Pro Max Cyber Palette)
// ─────────────────────────────────────────────
export const Colors = {
  BRAND: 0x99CC00,    // Cyber Lime Primary (#99CC00 / #BEF264)
  LIME: 0x99CC00,     // Primary Accent Lime
  SUCCESS: 0x10B981,  // Emerald Green (#10B981)
  WARN: 0xF59E0B,     // Amber Warning (#F59E0B)
  DANGER: 0xEF4444,   // Crimson Red (#EF4444)
  GOLD: 0xD4AF37,     // Premium Gold (#D4AF37)
  MUTED: 0x64748B,    // Slate Neutral (#64748B)
  TICKET: 0x3B82F6,   // Electric Blue (#3B82F6)
  VOICE: 0x10B981,    // Voice Emerald (#10B981)
  MUSIC: 0x8B5CF6,    // Cyber Purple (#8B5CF6)
  INFO: 0x06B6D4,     // Neon Cyan (#06B6D4)
  BOOST: 0xF47FFF,    // Nitro Pink (#F47FFF)
} as const;

export const BRAND_FOOTER = 'Rage Optimiser Enterprise • Unbypassable Security';

// ─────────────────────────────────────────────
// MODULE IDENTITIES
// ─────────────────────────────────────────────
export const ModuleMeta = {
  leveling: { icon: VIP_ICON, name: 'Leveling & Economy', color: Colors.GOLD },
  giveaway: { icon: CART_ICON, name: 'Giveaway Manager', color: Colors.GOLD },
  tickets: { icon: TICKET_ICON, name: 'Ticket System', color: Colors.TICKET },
  announcements: { icon: INFO_ICON, name: 'Announcements', color: Colors.INFO },
  welcome: { icon: MEMBER_ICON, name: 'Welcome System', color: Colors.BRAND },
  voice: { icon: VOICE_ICON, name: 'Voice Manager', color: Colors.VOICE },
  automod: { icon: GAVEL_ICON, name: 'AutoMod Protection', color: Colors.WARN },
  security: { icon: SHIELD_ICON, name: 'Anti-Nuke Security', color: Colors.DANGER },
  analytics: { icon: STATS_ICON, name: 'Analytics & SOC', color: Colors.BRAND },
  music: { icon: VOICE_ICON, name: 'Music Suite', color: Colors.MUSIC },
  help: { icon: CONFIG_ICON, name: 'Command Hub', color: Colors.BRAND },
  prebot_whitelist: { icon: BOT_ICON, name: 'PreBot Whitelist', color: Colors.INFO },
  system: { icon: BOT_ICON, name: 'System Engine', color: Colors.MUTED },
} as const;

export type ModuleKey = keyof typeof ModuleMeta;

function moduleFooterText(module?: ModuleKey | string): string {
  if (!module) return BRAND_FOOTER;
  const meta = ModuleMeta[module as ModuleKey];
  return `${BRAND_FOOTER} | ${meta ? meta.name : module}`;
}

// ─────────────────────────────────────────────
// CORE EMBED BUILDERS
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
  client?: any;
}

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
    : (options.color || Colors.BRAND);

  const embed = new EmbedBuilder()
    .setAuthor({ name: options.author || 'Rage Optimiser Enterprise • Security Engine' })
    .setTitle(options.title)
    .setColor(colorVal as any)
    .setFooter({
      text: options.footerText || BRAND_FOOTER,
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
      name: `${INFO_ICON} Syntax / Usage`,
      value: `\`\`\`${options.commandBox}\`\`\``,
      inline: false
    });
  }

  if (options.thumbnail && options.thumbnail.startsWith('http')) {
    embed.setThumbnail(options.thumbnail);
  }

  return embed;
}

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
      iconURL: opts.footerIcon ?? opts.client?.user?.displayAvatarURL?.() ?? undefined,
    });

  if (opts.thumbnail) embed.setThumbnail(opts.thumbnail);
  if (opts.image) embed.setImage(opts.image);
  if (opts.fields && opts.fields.length > 0) {
    embed.addFields(opts.fields);
  }
  if (opts.authorIcon && title) {
    embed.setAuthor({ name: title, iconURL: opts.authorIcon });
    embed.setTitle('');
  } else {
    embed.setAuthor({ name: 'Rage Optimiser Enterprise • Core Security Engine' });
  }

  return embed;
}

export const Embeds = {
  info(title: string, description: string, opts: EmbedOptions = {}): EmbedBuilder {
    return buildBaseEmbed(Colors.BRAND, `${INFO_ICON} ${title}`, description, opts);
  },

  success(title: string, description: string, opts: EmbedOptions = {}): EmbedBuilder {
    return buildBaseEmbed(Colors.SUCCESS, `${VERIFIED_ICON} ${title}`, description, opts);
  },

  warn(title: string, description: string, opts: EmbedOptions = {}): EmbedBuilder {
    return buildBaseEmbed(Colors.WARN, `${WARNING_ICON} ${title}`, description, opts);
  },

  error(title: string, description: string, opts: EmbedOptions = {}): EmbedBuilder {
    return buildBaseEmbed(Colors.DANGER, `${WRONG_ICON} ${title}`, description, opts);
  },

  premium(title: string, description: string, opts: EmbedOptions = {}): EmbedBuilder {
    return buildBaseEmbed(Colors.GOLD, `${GOLD_CROWN_ICON} ${title}`, description, opts);
  },

  module(mod: ModuleKey | string, title: string, description: string, opts: EmbedOptions = {}): EmbedBuilder {
    return buildBaseEmbed(Colors.BRAND, title, description, { ...opts, module: mod });
  },

  denied(reason: string, opts: EmbedOptions = {}): EmbedBuilder {
    return buildBaseEmbed(Colors.DANGER, `${SHIELD_ICON} Access Denied`, reason, opts);
  },

  permError(permission: string, opts: EmbedOptions = {}): EmbedBuilder {
    return buildBaseEmbed(Colors.DANGER, `${SHIELD_ICON} Permission Required`, `You require the **${permission}** permission to execute this operation.`, opts);
  },
};

// ─────────────────────────────────────────────
// ACTION & AUDIT CARD BUILDERS
// ─────────────────────────────────────────────

export function buildMinimalAction(opts: {
  user: any;
  action: string;
  target?: string | any;
  toOrFrom?: string;
  extra?: string | any;
  reason?: string;
  duration?: string;
  color?: number;
}): EmbedBuilder {
  const color = opts.color ?? Colors.LIME;
  let text = `> ${VERIFIED_ICON} ${opts.user} **${opts.action}**`;
  if (opts.target) {
    text += ` **${opts.target}**`;
  }
  if (opts.toOrFrom && opts.extra) {
    text += ` **${opts.toOrFrom}** ${opts.extra}`;
  } else if (opts.extra) {
    text += ` ${opts.extra}`;
  }
  if (opts.duration) {
    text += ` *(Expires ${opts.duration})*`;
  }
  if (opts.reason) {
    text += `\n> ${INFO_ICON} **Reason:** \`${opts.reason}\``;
  }
  return new EmbedBuilder()
    .setColor(color)
    .setDescription(text)
    .setFooter({ text: BRAND_FOOTER })
    .setTimestamp();
}

export function buildLimeActionCard(opts: {
  title: string;
  description: string;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footerText?: string;
  color?: number;
  thumbnailUrl?: string;
}): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(opts.color ?? Colors.LIME)
    .setTitle(opts.title)
    .setDescription(opts.description)
    .setFooter({ text: opts.footerText ?? BRAND_FOOTER })
    .setTimestamp();

  if (opts.fields && opts.fields.length > 0) {
    embed.addFields(opts.fields);
  }
  if (opts.thumbnailUrl) {
    embed.setThumbnail(opts.thumbnailUrl);
  }
  return embed;
}

export function buildLimeWarnCard(opts: {
  category: string;
  user: any;
  reason: string;
  currentLimit?: number;
  maxLimit?: number;
  thumbnailUrl?: string;
  color?: number;
}): EmbedBuilder {
  const current = opts.currentLimit ?? 1;
  const max = opts.maxLimit ?? 5;
  const color = opts.color ?? Colors.WARN;

  const reasonText = opts.reason.startsWith('Used blacklisted word') || opts.reason.startsWith('Posting')
    ? opts.reason
    : `Reason: ${opts.reason}`;

  const desc = [
    `> ${opts.user} was warned for **${reasonText}** *(Message Deleted)*`,
    `> `,
    `> **Violation Progress**: \`${current}/${max}\` — Exceeding the threshold triggers automatic quarantine / punishment.`
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${WARNING_ICON} AutoMod Violation Warning • ${opts.category}`)
    .setDescription(desc)
    .setFooter({ text: 'Rage Optimiser • AutoMod & Anti-Nuke Protection' })
    .setTimestamp();

  if (opts.thumbnailUrl) {
    embed.setThumbnail(opts.thumbnailUrl);
  }

  return embed;
}

/**
 * Master Overview Card (High-Impact Discord Markdown Structure)
 */
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
    .setFooter({ text: opts.footerText ?? BRAND_FOOTER })
    .setTimestamp();

  const titleText = opts.title.trim();
  const subText = opts.subtitle ? opts.subtitle : 'Rage Optimiser Enterprise • Active Protection';

  let desc = `## ${titleText}\n**${subText}**\n\n`;

  for (const sec of opts.sections) {
    if (sec.title) {
      desc += `### **${sec.title}**\n`;
    }
    desc += `>>> `;
    const formattedItems = sec.items.map(item => {
      const trimmed = item.trim();
      if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('>')) return trimmed;
      return `${trimmed}`;
    }).join('\n');

    desc += formattedItems + `\n\n`;
  }

  embed.setDescription(desc.trim());
  if (opts.thumbnail) embed.setThumbnail(opts.thumbnail);

  return embed;
}

/**
 * Rich Command Guide Card with syntax, examples, permissions, and cooldown indicators
 */
export function buildCommandCard(opts: {
  name: string;
  category: string;
  description: string;
  usage: string;
  aliases?: string[];
  permissions?: string[];
  cooldownSeconds?: number;
  examples?: string[];
}): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(Colors.BRAND)
    .setTitle(`${CONFIG_ICON} Command Guide: \`r!${opts.name}\``)
    .setDescription(`> ${opts.description}\n`)
    .addFields([
      { name: 'Usage Syntax', value: `\`\`\`${opts.usage}\`\`\``, inline: false },
      { name: 'Category', value: `\`${opts.category}\``, inline: true },
      { name: 'Cooldown', value: `\`${opts.cooldownSeconds || 3}s\``, inline: true },
      { name: 'Required Permissions', value: `\`${(opts.permissions || ['None']).join(', ')}\``, inline: true }
    ])
    .setFooter({ text: BRAND_FOOTER })
    .setTimestamp();

  if (opts.aliases && opts.aliases.length > 0) {
    embed.addFields({ name: 'Aliases', value: opts.aliases.map(a => `\`r!${a}\``).join(' • '), inline: false });
  }

  if (opts.examples && opts.examples.length > 0) {
    embed.addFields({ name: 'Practical Examples', value: opts.examples.map(ex => `• \`${ex}\``).join('\n'), inline: false });
  }

  return embed;
}

export function buildTicketPanelEmbed(opts: {
  serverName: string;
  statusText?: string;
  description?: string;
  thumbnailUrl?: string;
  bannerUrl?: string;
}): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(Colors.LIME)
    .setTitle(`${CROWN_ANIMATED_ICON} ${opts.serverName.toUpperCase()} • OFFICIAL SUPPORT DESK`)
    .setThumbnail(opts.thumbnailUrl || DEFAULT_BRAND_IMAGE_URL)
    .setImage(opts.bannerUrl || DEFAULT_BRAND_IMAGE_URL)
    .setFooter({ text: BRAND_FOOTER })
    .setTimestamp();

  const fieldsText = [
    `> **Server**: \`${opts.serverName}\``,
    `> **Status**: ${VERIFIED_ICON} **Active Support Center**`,
    `> ${ANIMATED_ARROW_PINK} Select a category from the menu below to open a private support ticket.`
  ].join('\n');

  const bulletsText = [
    `> ${VIP_ICON} **VIP & Store Help**: Billing, perks, and store support`,
    `> ${SHIELD_ICON} **Report & Moderation**: Player reports and rule violations`,
    `> ${TICKET_ICON} **General Support**: Inquiries, questions & general help`,
    `> ${BOT_ICON} **Technical & Bot Help**: Technical issues & bugs`,
    `> ${MEMBER_ICON} **Staff Application**: Apply for staff / moderator roles`,
    ``,
    `*🔒 All interactions are encrypted, audit-logged, and available in your transcript DM.*`
  ].join('\n');

  embed.setDescription(`${fieldsText}\n\n${bulletsText}`);

  return embed;
}

// ─────────────────────────────────────────────
// QUICK STATUS REPLIES
// ─────────────────────────────────────────────

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
    .setDescription(`> ${opts.body}`)
    .setFooter({ text: BRAND_FOOTER })
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

export function buildErrorCard(text: string, title = 'Operation Failed'): { embeds: EmbedBuilder[]; components: any[]; flags: number } {
  return buildStatusCard({
    emoji: WRONG_ICON,
    title,
    body: text,
    accentColor: Colors.DANGER,
  });
}

export function buildSuccessCard(text: string, title = 'Operation Successful'): { embeds: EmbedBuilder[]; components: any[]; flags: number } {
  return buildStatusCard({
    emoji: VERIFIED_ICON,
    title,
    body: text,
    accentColor: Colors.BRAND,
  });
}

export function buildWarnCard(text: string, title = 'Security Notice'): { embeds: EmbedBuilder[]; components: any[]; flags: number } {
  return buildStatusCard({
    emoji: TIMER_ICON,
    title,
    body: text,
    accentColor: Colors.WARN,
  });
}

export function buildPermCard(permission: string): { embeds: EmbedBuilder[]; components: any[]; flags: number } {
  return buildStatusCard({
    emoji: SHIELD_ICON,
    title: 'Access Denied',
    body: `You require the **${permission}** permission to execute this operation.`,
    accentColor: Colors.DANGER,
  });
}

export function buildListCard(opts: {
  emoji: string;
  title: string;
  subtitle?: string;
  entries: string[];
  accentColor?: number;
  thumbnailUrl?: string;
}): { embeds: EmbedBuilder[]; components: any[]; flags: number } {
  const color = opts.accentColor ?? Colors.BRAND;
  const listText = opts.entries.join('\n') || '*No records found.*';

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${opts.emoji} ${opts.title}`.trim())
    .setDescription((opts.subtitle ? `*${opts.subtitle}*\n\n` : '') + `>>> ${listText}`)
    .setFooter({ text: BRAND_FOOTER })
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
    .setFooter({ text: opts.footerNote || BRAND_FOOTER })
    .setTimestamp();

  if (opts.description) {
    embed.setDescription(`> ${opts.description}`);
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
  confirmRow(confirmId: string, cancelId: string, labels?: { confirm?: string; cancel?: string }): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(confirmId)
        .setLabel(labels?.confirm ?? 'Confirm Action')
        .setStyle(ButtonStyle.Success)
        .setEmoji(VERIFIED_ICON),
      new ButtonBuilder()
        .setCustomId(cancelId)
        .setLabel(labels?.cancel ?? 'Cancel')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji(WRONG_ICON)
    );
  },

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

  primaryButton(id: string, label: string, emoji?: string): ActionRowBuilder<ButtonBuilder> {
    const btn = new ButtonBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(ButtonStyle.Primary);
    if (emoji) btn.setEmoji(emoji);
    return new ActionRowBuilder<ButtonBuilder>().addComponents(btn);
  },

  actionPair(
    successId: string, successLabel: string, successEmoji: string,
    dangerID: string, dangerLabel: string, dangerEmoji: string
  ): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(successId).setLabel(successLabel).setStyle(ButtonStyle.Success).setEmoji(successEmoji),
      new ButtonBuilder().setCustomId(dangerID).setLabel(dangerLabel).setStyle(ButtonStyle.Danger).setEmoji(dangerEmoji)
    );
  },

  jumpButton(url: string, label = 'Jump to Message'): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url).setEmoji('↗️')
    );
  },
};

// ─────────────────────────────────────────────
// PROGRESS BAR & FORMATTING HELPERS
// ─────────────────────────────────────────────
export function progressBar(current: number, max: number, size = 12): string {
  const ratio = max > 0 ? Math.min(current / max, 1) : 0;
  const filled = Math.round(ratio * size);
  const empty = size - filled;
  return '█'.repeat(filled) + '░'.repeat(empty) + ` \`${Math.round(ratio * 100)}%\``;
}

export function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

export function ts(dateOrSec: Date | number, style: 'R' | 'F' | 'f' | 'D' | 'd' | 'T' | 't' = 'R'): string {
  const sec = typeof dateOrSec === 'number' ? dateOrSec : Math.floor(dateOrSec.getTime() / 1000);
  return `<t:${sec}:${style}>`;
}
