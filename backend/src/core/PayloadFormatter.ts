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

import { EmbedBuilder } from 'discord.js';

// ── Enterprise icon tokens (Zero-Unicode design system) ────────────────────
export const FMT_ICONS = {
  verified:   '<a:approved:1532390590707142956>',
  wrong:      '<:wrong:1532390628330307634>',
  shield:     '<:shield:1532403012751065179>',
  timer:      '<:timer:1532620491662037123>',
  ticket:     '<:ticket:1532620631466836021>',
  config:     '<:config:1532425712844144701>',
  member:     '<:member:1532621317487071426>',
  bot:        '<:bot:1532621107746570391>',
  info:       '<:information:1532621274092929124>',
  stats:      '<:stats:1532429110775779459>',
  gavel:      '<:gavel:1532621057318584380>',
} as const;

// ── Canonical brand constants ───────────────────────────────────────────────
const BRAND_COLOR   = 0x99CC00;
const DANGER_COLOR  = 0xEF4444;
const BRAND_FOOTER  = 'Rage Optimiser • Unbypassable Security';

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
   * Normalize any Discord reply options object before sending.
   *
   * @param options  The raw reply options (string or object)
   * @param user     Optional Discord User for mention in content→embed promotions
   * @returns        A cleaned MessageReplyOptions-compatible object
   */
  public static normalize(options: any, user?: any): any {
    if (!options) return options;

    // String shorthand → object
    if (typeof options === 'string') {
      options = { content: options };
    }

    const copy: any = { ...options };

    // Strip ephemeral flags — prefix commands are always public
    delete copy.flags;
    delete copy.ephemeral;

    // Filter out any invalid component entries (non-ActionRow objects, e.g. bare Embeds)
    if (Array.isArray(copy.components)) {
      copy.components = copy.components.filter((c: any) => {
        if (!c) return false;
        return (
          typeof c.addComponents === 'function' ||
          c.type === 1 ||
          (Array.isArray(c.components) && !c.accentColor)
        );
      });
      if (copy.components.length === 0) delete copy.components;
    }

    // ── Case 1: Bare string content (no embeds) → promote to embed ──────────
    if (copy.content && typeof copy.content === 'string' && (!copy.embeds || copy.embeds.length === 0)) {
      const isErr = this.isErrorContent(copy.content);
      const cleanContent = this.stripLeadingEmoji(copy.content);
      const icon  = isErr ? FMT_ICONS.wrong    : FMT_ICONS.verified;
      const color = isErr ? DANGER_COLOR       : BRAND_COLOR;
      const userMention = user ? `${user} ` : '';

      copy.embeds = [
        new EmbedBuilder()
          .setColor(color)
          .setDescription(`${icon} ${userMention}${cleanContent}`.trim())
          .setFooter({ text: BRAND_FOOTER })
          .setTimestamp()
      ];
      delete copy.content;
    }
    // ── Case 2: Embeds array provided → sanitize each embed ─────────────────
    else if (Array.isArray(copy.embeds)) {
      copy.embeds = copy.embeds.map((emb: any) => {
        if (!emb) return emb;
        const json = typeof emb.toJSON === 'function' ? emb.toJSON() : { ...emb };

        // Sanitize text fields
        if (json.title)       json.title       = this.sanitizeText(json.title);
        if (json.description) json.description = this.sanitizeText(json.description);

        // Sanitize fields array
        if (Array.isArray(json.fields)) {
          json.fields = json.fields.map((f: any) => ({
            ...f,
            name:  this.sanitizeText(f.name),
            value: this.sanitizeText(f.value),
          }));
        }

        // Sanitize author name
        if (json.author?.name) {
          json.author.name = this.sanitizeText(json.author.name);
        }

        // Normalize footer
        json.footer = { text: this.normalizeFooter(json.footer?.text) };

        // Normalize color — replace legacy/unset colors with BRAND_COLOR
        if (!json.color || LEGACY_NEUTRAL_COLORS.has(json.color)) {
          json.color = BRAND_COLOR;
        }

        return EmbedBuilder.from(json);
      });
    }

    // ── Fallback: completely empty payload → default success embed ───────────
    if (
      !copy.content &&
      (!copy.embeds   || copy.embeds.length   === 0) &&
      (!copy.components || copy.components.length === 0) &&
      (!copy.files    || copy.files.length    === 0)
    ) {
      copy.embeds = [
        new EmbedBuilder()
          .setColor(BRAND_COLOR)
          .setTitle(`${FMT_ICONS.verified} Command Executed`)
          .setDescription('Command completed successfully.')
          .setFooter({ text: BRAND_FOOTER })
          .setTimestamp()
      ];
    }

    return copy;
  }

  // ── Public helpers (also available to modules that build their own embeds) ──

  /**
   * Replace legacy Unicode emoji with enterprise custom emoji,
   * and collapse duplicate sequential icon runs.
   */
  public static sanitizeText(str: string): string {
    if (!str || typeof str !== 'string') return str;

    return str
      // Custom-emoji aliases
      .replace(/<a:verifiedtwitter:\d+>/g, FMT_ICONS.verified)
      .replace(/• ᴵˢ ɢʟᴏʙᴀʟ/g, '')
      // Standard Unicode → enterprise icon
      .replace(/🏓/g, FMT_ICONS.timer)
      .replace(/📡/g, FMT_ICONS.info)
      .replace(/⚡/g, FMT_ICONS.stats)
      .replace(/💾/g, FMT_ICONS.config)
      .replace(/🧩/g, FMT_ICONS.bot)
      .replace(/🌐/g, FMT_ICONS.info)
      .replace(/🟢/g, FMT_ICONS.verified)
      .replace(/🟡/g, FMT_ICONS.timer)
      .replace(/🟠/g, FMT_ICONS.timer)
      .replace(/🔴/g, FMT_ICONS.wrong)
      .replace(/✅/g, FMT_ICONS.verified)
      .replace(/❌/g, FMT_ICONS.wrong)
      .replace(/🔒/g, FMT_ICONS.shield)
      .replace(/🛡️/g, FMT_ICONS.shield)
      .replace(/⚠️/g, FMT_ICONS.wrong)
      .replace(/⏳/g, FMT_ICONS.timer)
      .replace(/⏱️/g, FMT_ICONS.timer)
      .replace(/🔨/g, FMT_ICONS.gavel)
      .replace(/📊/g, FMT_ICONS.stats)
      .replace(/📈/g, FMT_ICONS.stats)
      .replace(/⚙️/g, FMT_ICONS.config)
      .replace(/🔧/g, FMT_ICONS.config)
      .replace(/👥/g, FMT_ICONS.member)
      .replace(/👤/g, FMT_ICONS.member)
      .replace(/🤖/g, FMT_ICONS.bot)
      .replace(/ℹ️/g, FMT_ICONS.info)
      .replace(/📋/g, FMT_ICONS.info)
      .replace(/📝/g, FMT_ICONS.info)
      .replace(/🎟️/g, FMT_ICONS.ticket)
      .replace(/🎫/g, FMT_ICONS.ticket)
      // Collapse duplicate sequential icons → pick dominant one
      .replace(
        /(?:<:wrong:\d+>|<a:approved:\d+>|<:shield:\d+>|<:timer:\d+>|[❌✅🔒⚠️🛡️])\s*(?:<:wrong:\d+>|<a:approved:\d+>|<:shield:\d+>|<:timer:\d+>|[❌✅🔒⚠️🛡️])+/g,
        (match: string) => {
          if (match.includes('<:wrong:') || match.includes('❌') || match.includes('⚠️')) return FMT_ICONS.wrong;
          if (match.includes('🔒') || match.includes('🛡️') || match.includes('<:shield:')) return FMT_ICONS.shield;
          return FMT_ICONS.verified;
        }
      );
  }

  /**
   * Normalize a footer text string to the canonical brand footer.
   * Replaces all known legacy footer variants.
   */
  public static normalizeFooter(footerText: string | undefined): string {
    if (!footerText) return BRAND_FOOTER;

    return footerText
      .replace(/Unbypassable Security \| Menu Expired Rescue it/gi, BRAND_FOOTER)
      .replace(/Rage Optimiser • Security Engine/gi, BRAND_FOOTER)
      .replace(/Rage Optimiser • IS GLOBAL/gi, BRAND_FOOTER)
      .replace(/(?:Secure\s+)?Unbypassable\s+Security(?:\s*\|\s*Menu\s+Expired\s+Rescue\s+it)?/gi, BRAND_FOOTER);
  }

  /**
   * Strip leading emoji characters from a string (for content→embed promotion).
   */
  public static stripLeadingEmoji(str: string): string {
    return str
      .replace(/^[❌✅🔒⚠️🧊🌡️🔓🧹🔨✏️⏱️🔕👁️📋📜📈📝🔗🏓🪙🎲😂☀️💡]+\s*/, '')
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
