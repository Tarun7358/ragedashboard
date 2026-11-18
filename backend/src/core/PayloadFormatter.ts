/**
 * PayloadFormatter — Rage Optimiser Enterprise
 *
 * Single source of truth for all Discord message payload normalization.
 * Replaces the duplicate `transformContentToLimeCard` (Gateway.ts) and
 * `normalizePayload` (SyntheticInteraction.ts) implementations.
 *
 * All response paths — slash commands, prefix commands, buttons, and modals —
 * must call PayloadFormatter.normalize() before sending to Discord.
 *
 * Design rules:
 *  - Brand color: 0x99CC00 (Colors.BRAND from UIFactory)
 *  - Error color:  0xEF4444 (Colors.DANGER)
 *  - All legacy Unicode emoji replaced with enterprise custom emoji
 *  - Footers normalized to the canonical brand footer string
 *  - Duplicate icon sequences collapsed to a single icon
 *  - Ephemeral flags stripped (prefix commands are always public)
 */

import {
  EmbedBuilder,
  MessageFlags,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ButtonStyle
} from 'discord.js';

// ── Enterprise icon tokens (Zero-Unicode design system) ────────────────────
export const FMT_ICONS = {
  verified:   '<:ticks:1532620580266836148>',
  wrong:      '<a:warning:1546155193303957504>',
  warning:    '<a:warning:1546155193303957504>',
  violation:  '<a:warning:1546155193303957504>',
  shield:     '<a:success_check:1546134620087783526>',
  timer:      '<a:loading:1546134304625528882>',
  ticket:     '<:ticket:1532620631466836021>',
  config:     '<:config:1532425712844144701>',
  member:     '<:member:1532621317487071426>',
  bot:        '<:bot:1532621107746570391>',
  info:       '<a:lovemail:1527647157371535420>',
  stats:      '<:stats:1532429110775779459>',
  gavel:      '<:gavel:1532621057318584380>',
} as const;

const EMOJI_REGEX = /<a?:[a-zA-Z0-9_]+:\d+>|[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{1F1E6}-\u{1F1FF}\u{1F191}-\u{1F251}\u{1F004}\u{1F0CF}\u{1F170}-\u{1F171}\u{1F17E}-\u{1F17F}\u{1F18E}\u{3030}\u{2B50}\u{2B55}\u{2934}-\u{2935}\u{2B05}-\u{2B07}\u{2B1B}-\u{2B1C}\u{3297}\u{3299}\u{FE00}-\u{FE0F}]/gu;

// ── Canonical brand constants ───────────────────────────────────────────────
const BRAND_COLOR   = 0x99CC00;
const DANGER_COLOR  = 0xEF4444;
const BRAND_FOOTER = 'Rage Optimiser - Unbypassable Security';

/** Colors that the formatter treats as "unset" and replaces with BRAND_COLOR */
const LEGACY_NEUTRAL_COLORS = new Set([
  0x7c5cfc,  // default violet
  8150268,   // same as 0x7c5cfc
  0x84cc16,  // older lime variant used in Gateway's transformer
]);

// ── Error keyword heuristic ────────────────────────────────────────────────
const ERROR_KEYWORDS = ['failed', 'error', 'denied', 'invalid', 'missing', 'unauthorized'];

export class PayloadFormatter {
  /**
   * Strip every emoji from a string. When keepStatus is true, the two ON/OFF status icons
   * (success_check = ON, warning = OFF) are preserved when they sit at the START of a line
   * (optionally after a blockquote marker), so status lists render "icon + label".
   */
  public static stripAllEmojis(str: string, keepStatus = false): string {
    if (!str || typeof str !== 'string') return str;
    let work = str;
    if (keepStatus) {
      work = work
        .replace(/(^|\n)([> ]*)<a?:\w+:1546134620087783526>[ \t]*/g, '$1$2\uE000')
        .replace(/(^|\n)([> ]*)<a?:\w+:1546155193303957504>[ \t]*/g, '$1$2\uE001');
    }
    work = work
      .replace(/\uE000/g, '')
      .replace(/\uE001/g, '')
      .replace(EMOJI_REGEX, '')
      .replace(/\u2022/g, '-')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/^ +/gm, '')
      .trim();
    return work;
  }
  /**
   * Normalize any Discord reply options object before sending.
   *
   * @param options  The raw reply options (string or object)
   * @param user     Optional Discord User for mention in content→embed promotions
   * @returns        A cleaned MessageReplyOptions-compatible object
   */
  public static normalize(options: any, user?: any): any {
    if (!options) return options;

    if (typeof options === 'object' && options._rawEmbed) {
      const rawCopy = { ...options };
      delete rawCopy._rawEmbed;
      return rawCopy;
    }

    // Components V2 passthrough: never alter existing V2 containers, but strip forbidden top-level content/embeds
    const isV2 = Boolean(
      options?.flags === MessageFlags.IsComponentsV2 ||
      (typeof options?.flags === 'number' && (options.flags & MessageFlags.IsComponentsV2) !== 0) ||
      (Array.isArray(options?.components) && options.components.some((c: any) => c?.type === 17 || c?.data?.type === 17 || c?.constructor?.name === 'ContainerBuilder'))
    );
    if (isV2) {
      const v2Copy = { ...options };
      const existingFlags = typeof v2Copy.flags === 'number' ? v2Copy.flags : 0;
      v2Copy.flags = existingFlags | MessageFlags.IsComponentsV2;
      delete v2Copy.content;
      delete v2Copy.embeds;
      return v2Copy;
    }

    // String shorthand → object
    if (typeof options === 'string') {
      options = { content: options };
    }

    const copy: any = { ...options };

    // Preserve ephemeral flags if specified (for buttons, slash commands, modal submits)
    const isEphemeral = Boolean(
      options?.flags === 64 ||
      options?.flags === 64n ||
      options?.ephemeral === true ||
      (typeof options?.flags === 'number' && (options.flags & 64) === 64)
    );

    // Suppress notifications (@silent message) for log & telemetry dispatches
    const isSilent = Boolean(
      options?.silent === true ||
      options?.flags === MessageFlags.SuppressNotifications ||
      (typeof options?.flags === 'number' && (options.flags & MessageFlags.SuppressNotifications) !== 0) ||
      (typeof options?.flags === 'bigint' && (options.flags & BigInt(MessageFlags.SuppressNotifications)) !== 0n)
    );

    // Filter out any invalid component entries
    const actionRows: any[] = [];
    if (Array.isArray(copy.components)) {
      for (const comp of copy.components) {
        if (!comp) continue;
        if (
          typeof comp.addComponents === 'function' ||
          comp.type === 1 ||
          (Array.isArray(comp.components) && !comp.accentColor)
        ) {
          // Normalize button styles to default secondary grey (keep Danger as Danger, Link as Link)
          if (Array.isArray(comp.components)) {
            for (const btn of comp.components) {
              if (btn && btn.data && btn.data.style && btn.data.style !== ButtonStyle.Danger && btn.data.style !== ButtonStyle.Link) {
                btn.data.style = ButtonStyle.Secondary;
              }
            }
          }
          actionRows.push(comp);
        }
      }
    }

    // Transform any command response (embeds or plain text) into Components V2 Box UI
    try {
      let title = 'System Notification';
      let titleUrl: string | null = null;
      let body = '';
      let footerText = BRAND_FOOTER;
      let thumbnailUrl: string | null = null;
      if (user?.displayAvatarURL) {
        thumbnailUrl = user.displayAvatarURL({ size: 512 });
      }
      let imageUrl: string | null = null;

      if (Array.isArray(copy.embeds) && copy.embeds.length > 0) {
        const emb = copy.embeds[0];
        const json = typeof emb.toJSON === 'function' ? emb.toJSON() : emb;

        if (json.title) title = this.sanitizeText(json.title);
        else if (json.author?.name) title = this.sanitizeText(json.author.name);

        if (json.url) titleUrl = json.url;

        if (json.thumbnail?.url) {
          thumbnailUrl = json.thumbnail.url;
        } else if (json.author?.icon_url) {
          thumbnailUrl = json.author.icon_url;
        } else if (json.author?.iconURL) {
          thumbnailUrl = json.author.iconURL;
        }

        if (json.image?.url) imageUrl = json.image.url;

        if (json.description) body = this.stripAllEmojis(json.description, true);

        if (Array.isArray(json.fields) && json.fields.length > 0) {
          const fieldStr = json.fields.map((f: any) => `> **${this.sanitizeText(f.name)}:** ${this.stripAllEmojis(f.value, true)}`).join('\n');
          body = body ? `${body}\n\n${fieldStr}` : fieldStr;
        }

        if (json.footer?.text) footerText = this.normalizeFooter(json.footer.text);

        // If top-level content has mentions (e.g. role mentions for social alerts), bring them into body
        if (copy.content && typeof copy.content === 'string') {
          const mentions = copy.content.match(/(@everyone|@here|<@&?\d+>)/g);
          if (mentions && mentions.length > 0) {
            const mentionStr = Array.from(new Set(mentions)).join(' ');
            body = body ? `${mentionStr}\n\n${body}` : mentionStr;
          }
        }
      } else if (copy.content && typeof copy.content === 'string') {
        const clean = this.stripLeadingEmoji(copy.content);
        const lines = clean.split('\n');
        const leadTitle = lines[0].match(/^\*\*([^\*\n]{2,60})\*\*\s*:?\s*(.*)$/);
        if (leadTitle && !(lines[0].startsWith('**') && lines[0].endsWith('**'))) {
          title = leadTitle[1].trim();
          body = [leadTitle[2], ...lines.slice(1)].join('\n').trim();
        } else if (lines[0].startsWith('**') && lines[0].endsWith('**')) {
          title = lines[0].replace(/\*\*/g, '').trim();
          body = lines.slice(1).join('\n').trim();
        } else {
          body = clean;
        }
      }

      const titleLines = (title || 'System Notification').split('\n').map(l => l.trim()).filter(Boolean);
      const cleanTitle = this.stripAllEmojis(titleLines[0] || 'System Notification') || 'System Notification';
      if (titleLines.length > 1 && !body) {
        body = this.stripAllEmojis(titleLines.slice(1).join('\n'), true);
      }
      // Status icons are only kept on neutral cards; warnings/errors stay emoji-free.
      if (/warn|notice|violation|denied|error|fail|invalid|required|missing|unauthor/i.test(cleanTitle)) {
        body = this.stripAllEmojis(body);
      }
      if (!body && Array.isArray(copy.embeds) && copy.embeds.length > 1) {
        body = copy.embeds.slice(1).map((e: any) => {
          const j = typeof e.toJSON === 'function' ? e.toJSON() : e;
          return [j.title ? `**${this.sanitizeText(j.title)}**` : '', j.description ? this.sanitizeText(j.description) : ''].filter(Boolean).join('\n');
        }).filter(Boolean).join('\n\n');
      }
      if (!body && actionRows.length === 0 && !imageUrl) {
        body = '> No additional details available.';
      }

      const WARNING_ICON_URL = 'https://cdn.discordapp.com/emojis/1546155193303957504.webp?size=32&animated=true';

      const isWarning = Boolean(
        cleanTitle.toLowerCase().includes('warn') ||
        cleanTitle.toLowerCase().includes('notice') ||
        cleanTitle.toLowerCase().includes('violation') ||
        body.toLowerCase().includes('warned for') ||
        body.toLowerCase().includes('violation warning') ||
        body.toLowerCase().includes('security notice')
      );

      if (isWarning) {
        thumbnailUrl = WARNING_ICON_URL;
      }

      const isRoleAction = Boolean(
        options?.noThumbnail ||
        cleanTitle.toLowerCase().includes('role') ||
        body.toLowerCase().includes('has given') ||
        body.toLowerCase().includes('has removed') ||
        body.toLowerCase().includes('given role') ||
        body.toLowerCase().includes('removed role')
      );

      const container = new ContainerBuilder();
      const titleContent = titleUrl ? `# [**${cleanTitle}**](${titleUrl})` : `# **${cleanTitle}**`;

      const isValidMediaUrl = (u: string | null | undefined): u is string =>
        typeof u === 'string' && /^(https?:\/\/|attachment:\/\/)/i.test(u.trim());

      // Display banner image at the top of the outer box container
      if (isValidMediaUrl(imageUrl)) {
        container.addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL(imageUrl.trim())
          )
        );
      }

      const isHelpBanner = typeof imageUrl === 'string' && imageUrl.includes('help-box');

      if (!isHelpBanner) {
        if (isRoleAction || !isValidMediaUrl(thumbnailUrl)) {
          container.addTextDisplayComponents(new TextDisplayBuilder().setContent(titleContent));
        } else {
          const sec = new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(titleContent));
          sec.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnailUrl.trim()));
          container.addSectionComponents(sec);
        }

        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
      }

      if (body) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
      }

      for (const row of actionRows) {
        container.addActionRowComponents(row);
      }

      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${(footerText || BRAND_FOOTER).replace(/•/g, '-')}`));

      const isLogMessage = Boolean(
        isSilent ||
        cleanTitle.toLowerCase().includes('log') ||
        cleanTitle.toLowerCase().includes('audit') ||
        cleanTitle.toLowerCase().includes('telemetry') ||
        body.toLowerCase().includes('audit log') ||
        body.toLowerCase().includes('voice log') ||
        body.toLowerCase().includes('soundboard log') ||
        (footerText && (footerText.toLowerCase().includes('telemetry') || footerText.toLowerCase().includes('audit')))
      );

      let outFlags = MessageFlags.IsComponentsV2;
      if (isEphemeral) outFlags |= 64;
      if (isLogMessage) outFlags |= MessageFlags.SuppressNotifications;

      let mentionsOnly: string | undefined = undefined;
      if (copy.content && typeof copy.content === 'string') {
        const mentions = copy.content.match(/(@everyone|@here|<@&?\d+>)/g);
        if (mentions && mentions.length > 0) {
          mentionsOnly = Array.from(new Set(mentions)).join(' ');
        }
      }

      return {
        ...(mentionsOnly ? { content: mentionsOnly } : {}),
        flags: outFlags,
        components: [container],
        ...(Array.isArray(copy.files) && copy.files.length > 0 ? { files: copy.files } : {}),
        ...(Array.isArray(copy.attachments) ? { attachments: copy.attachments } : {})
      };
    } catch {
      return copy;
    }
  }

    // ── Public helpers (also available to modules that build their own embeds) ──

  /**
   * Replace legacy Unicode emoji with enterprise custom emoji,
   * and collapse duplicate sequential icon runs.
   */
  public static sanitizeText(str: string): string {
    if (!str || typeof str !== 'string') return str;
    return this.stripAllEmojis(str);
  }

  /**
   * Normalize a footer text string to the canonical brand footer.
   * Replaces all known legacy footer variants.
   */
  public static normalizeFooter(footerText: string | undefined): string {
    if (!footerText) return BRAND_FOOTER;

    let cleaned = footerText
      .replace(/(?:Rage Optimiser\s*-\s*)+/gi, 'Rage Optimiser - ')
      .replace(/Unbypassable Security \| Menu Expired Rescue it/gi, BRAND_FOOTER)
      .replace(/Rage Optimiser - Security Engine/gi, BRAND_FOOTER)
      .replace(/Rage Optimiser - IS GLOBAL/gi, BRAND_FOOTER);

    if (cleaned.includes('Unbypassable Security')) {
      if (!cleaned.startsWith('Rage Optimiser')) {
        cleaned = `Rage Optimiser - ${cleaned}`;
      }
      cleaned = cleaned.replace(/(?:Rage Optimiser\s*-\s*)+/gi, 'Rage Optimiser - ').trim();
    }

    return cleaned;
  }

  /**
   * Strip leading emoji characters from a string (for content→embed promotion).
   */
  public static stripLeadingEmoji(str: string): string {
    return str
      .replace(/^[❌✅🔒⚠️🧊🌡️🔓🧹🔨✏️⏱️🔕👁️📋📜📈📝🔗🏓🪙🎲😂☀️💡]+\s*/, '')
      .replace(/^(?:<a?:[a-zA-Z0-9_]+:\d+>\s*)+/, '')
      .trim();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private static isErrorContent(content: string): boolean {
    const lower = content.toLowerCase();
    return (
      content.includes('❌') ||
      content.includes('🔒') ||
      ERROR_KEYWORDS.some(kw => lower.includes(kw))
    );
  }
}
