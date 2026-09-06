/**
 * Social Updates Module — NotificationService
 *
 * Builds Discord embeds from an EmbedConfig + resolved template data,
 * then dispatches them to the configured Discord channel.
 * Handles buttons, role mentions, and image fields.
 */

import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { TemplateEngine } from './TemplateEngine.js';

export interface EmbedFieldConfig {
  name: string;
  value: string;
  inline?: boolean;
}

export interface EmbedButtonConfig {
  label: string;
  url: string;
  emoji?: string;
}

export interface EmbedConfig {
  color?: string;          // Hex string e.g. '#5865F2'
  authorEnabled?: boolean;
  authorName?: string;
  authorIcon?: string;
  authorUrl?: string;
  titleEnabled?: boolean;
  title?: string;
  titleUrl?: string;
  descriptionEnabled?: boolean;
  description?: string;
  thumbnailEnabled?: boolean;
  thumbnail?: string;
  imageEnabled?: boolean;
  image?: string;
  fields?: EmbedFieldConfig[];
  footerEnabled?: boolean;
  footerText?: string;
  footerIcon?: string;
  timestampEnabled?: boolean;
  buttons?: EmbedButtonConfig[];
  mentionRoles?: string[];  // Role IDs, 'everyone', 'here'
  messageContent?: string;  // Plain text before embed
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  deliveryTime?: number;   // ms
  error?: string;
}

export class NotificationService {
  /**
   * Build a Discord embed from an EmbedConfig and resolved template data.
   */
  static buildEmbed(rawConfig: EmbedConfig, data: Record<string, string>): EmbedBuilder {
    const isLive = data['video.live'] === 'true';
    const isPremiere = data['video.premiere'] === 'true';
    const isShort = data['video.short'] === 'true';
    const isInstagram = !!data['profile.username'] && (!!data['post.id'] || data['provider'] === 'instagram');

    const defaultFooter = isLive
      ? '{channel.name} • Live Stream'
      : isPremiere
      ? '{channel.name} • YouTube Premiere'
      : isShort
      ? '{channel.name} • YouTube Shorts'
      : isInstagram
      ? '{profile.name} • Instagram'
      : '{channel.name} • YouTube Video';

    const defaultColor = isLive
      ? '#FF0000'
      : isPremiere
      ? '#FFA500'
      : isShort
      ? '#FF0033'
      : isInstagram
      ? '#E1306C'
      : '#FF0000';

    // Standard default alert embed UI
    const defaultUI: EmbedConfig = {
      color: defaultColor,
      authorEnabled: true,
      authorName: isInstagram ? '{profile.name}' : '{channel.name}',
      authorIcon: isInstagram ? '{profile.avatar}' : '{channel.avatar}',
      authorUrl: isInstagram ? '{profile.url}' : '{channel.url}',
      titleEnabled: true,
      title: isInstagram ? '{post.caption}' : '{video.title}',
      titleUrl: isInstagram ? '{post.url}' : '{video.url}',
      imageEnabled: true,
      image: isInstagram ? '{post.image}' : '{video.thumbnail}',
      footerEnabled: true,
      footerText: defaultFooter,
      footerIcon: isInstagram ? '{profile.avatar}' : '{channel.avatar}',
      timestampEnabled: true
    };

    const merged = { ...defaultUI, ...rawConfig };

    // Resolve all template variables in the embed config
    const cfg = TemplateEngine.resolveEmbedConfig(merged as Record<string, any>, data) as EmbedConfig;

    const embed = new EmbedBuilder();

    // Color
    if (cfg.color) {
      const hex = cfg.color.replace('#', '');
      const color = parseInt(hex, 16);
      if (!isNaN(color)) embed.setColor(color);
    }

    // Author
    if (cfg.authorEnabled && cfg.authorName) {
      embed.setAuthor({
        name: cfg.authorName.substring(0, 256),
        iconURL: cfg.authorIcon || undefined,
        url: cfg.authorUrl || undefined
      });
    }

    // Title
    if (cfg.titleEnabled && cfg.title) {
      embed.setTitle(cfg.title.substring(0, 256));
      if (cfg.titleUrl) embed.setURL(cfg.titleUrl);
    }

    // Description
    if (cfg.descriptionEnabled && cfg.description) {
      embed.setDescription(cfg.description.substring(0, 4096));
    }

    // Thumbnail
    if (cfg.thumbnailEnabled && cfg.thumbnail) {
      try { embed.setThumbnail(cfg.thumbnail); } catch {}
    }

    // Image
    if (cfg.imageEnabled && cfg.image) {
      try { embed.setImage(cfg.image); } catch {}
    }

    // Fields
    if (cfg.fields && cfg.fields.length > 0) {
      const validFields = cfg.fields
        .filter(f => f.name && f.value)
        .slice(0, 25)
        .map(f => ({
          name: f.name.substring(0, 256),
          value: f.value.substring(0, 1024),
          inline: !!f.inline
        }));
      if (validFields.length > 0) embed.addFields(validFields);
    }

    // Footer
    if (cfg.footerEnabled && cfg.footerText) {
      embed.setFooter({
        text: cfg.footerText.substring(0, 2048),
        iconURL: cfg.footerIcon || undefined
      });
    }

    // Timestamp
    if (cfg.timestampEnabled) {
      embed.setTimestamp();
    }

    return embed;
  }

  /**
   * Build Discord link buttons from button config.
   */
  static buildComponents(buttons: EmbedButtonConfig[], data: Record<string, string>): ActionRowBuilder<ButtonBuilder>[] {
    if (!buttons || buttons.length === 0) return [];

    const resolved = buttons
      .filter(b => b.label && b.url)
      .slice(0, 5) // Max 5 buttons per row
      .map(b => {
        const url = TemplateEngine.resolve(b.url, data);
        const label = TemplateEngine.resolve(b.label, data).substring(0, 80);
        if (!url || url.startsWith('{') || !url.startsWith('http')) return null;
        const btn = new ButtonBuilder()
          .setLabel(label || 'Link')
          .setStyle(ButtonStyle.Link)
          .setURL(url);
        if (b.emoji) {
          try { btn.setEmoji(b.emoji); } catch {}
        }
        return btn;
      })
      .filter((b): b is ButtonBuilder => b !== null);

    if (resolved.length === 0) return [];

    return [new ActionRowBuilder<ButtonBuilder>().addComponents(resolved)];
  }

  /**
   * Build the @mention content prefix from role configurations.
   */
  static buildMentionContent(mentionRoles: string[], data: Record<string, string>): string {
    const mentions = (mentionRoles || []).map(role => {
      if (role === 'everyone') return '@everyone';
      if (role === 'here') return '@here';
      if (role.startsWith('<@&')) return role; // Already formatted
      return `<@&${role}>`;
    });
    return mentions.join(' ');
  }

  /**
   * Send a notification to a Discord channel.
   */
  static async send(
    client: any,
    channelId: string,
    embedConfig: EmbedConfig,
    data: Record<string, string>
  ): Promise<SendResult> {
    const startTime = Date.now();

    try {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        return { success: false, error: `Channel ${channelId} not found or not text-based` };
      }

      const embed = this.buildEmbed(embedConfig, data);
      const components = embedConfig.buttons
        ? this.buildComponents(embedConfig.buttons, data)
        : [];

      const mentionContent = this.buildMentionContent(embedConfig.mentionRoles || [], data);
      const customContent = embedConfig.messageContent
        ? TemplateEngine.resolve(embedConfig.messageContent, data)
        : '';

      const content = [mentionContent, customContent].filter(Boolean).join('\n').substring(0, 2000) || undefined;

      const msg = await channel.send({
        content,
        embeds: [embed],
        components: components.length > 0 ? components : undefined
      });

      return {
        success: true,
        messageId: msg.id,
        deliveryTime: Date.now() - startTime
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Unknown error sending notification',
        deliveryTime: Date.now() - startTime
      };
    }
  }
}
