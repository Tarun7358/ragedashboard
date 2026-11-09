/**
 * Social Updates Module — TemplateEngine
 *
 * Resolves {variable} tokens and {{conditional}}...{{/conditional}} blocks
 * in notification templates against a flat key-value data map.
 *
 * Supported syntax:
 *   {channel.name}           → direct value substitution
 *   {video.title}            → direct value substitution
 *   {{video.live}}           → conditional block: renders content only if variable is truthy
 *     🔴 LIVE NOW
 *   {{/video.live}}
 */

// All known variables across all providers
export const ALL_KNOWN_VARIABLES = new Set([
  // Common / YouTube
  'channel.name', 'channel.id', 'channel.url', 'channel.avatar',
  'video.id', 'video.title', 'video.url', 'video.thumbnail',
  'video.description', 'video.publish_date', 'video.duration',
  'video.views', 'video.live', 'video.short', 'video.premiere',
  'video.updated',
  // Instagram
  'post.caption', 'post.image', 'post.url', 'post.publish_date', 'post.id',
  'profile.name', 'profile.username', 'profile.avatar', 'profile.url',
  // Discord context
  'discord.channel', 'discord.guild', 'server.name', 'role.mention',
]);

export interface ValidationResult {
  valid: boolean;
  unknownVars: string[];
}

export class TemplateEngine {
  /**
   * Resolve a template string against a data map.
   * Handles conditional blocks and simple variable substitution.
   */
  static resolve(template: string, data: Record<string, string>): string {
    let result = template;

    // 1. Process conditional blocks: {{var}}...{{/var}}
    result = result.replace(
      /\{\{([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
      (_, varName, inner) => {
        const value = data[varName];
        return value && value !== 'false' && value !== '' ? inner.trim() : '';
      }
    );

    // 2. Resolve simple variables: {var}
    result = result.replace(/\{([\w.]+)\}/g, (_, varName) => {
      return data[varName] !== undefined ? data[varName] : `{${varName}}`;
    });

    return result;
  }

  /**
   * Resolve an entire embed config object, substituting all string fields.
   */
  static resolveEmbedConfig(embedConfig: Record<string, any>, data: Record<string, string>): Record<string, any> {
    const resolved: Record<string, any> = {};

    for (const [key, value] of Object.entries(embedConfig)) {
      if (typeof value === 'string') {
        resolved[key] = this.resolve(value, data);
      } else if (Array.isArray(value)) {
        resolved[key] = value.map(item =>
          typeof item === 'object' && item !== null
            ? this.resolveEmbedConfig(item, data)
            : item
        );
      } else if (typeof value === 'object' && value !== null) {
        resolved[key] = this.resolveEmbedConfig(value, data);
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  /**
   * Validate a template string for unknown variables.
   */
  static validate(template: string, extraKnown: string[] = []): ValidationResult {
    const known = new Set([...ALL_KNOWN_VARIABLES, ...extraKnown]);
    const found: string[] = [];

    // Find all {var} references
    const matches = template.matchAll(/\{+\/?(\w[\w.]*)\}+/g);
    for (const match of matches) {
      const varName = match[1];
      if (!known.has(varName) && !found.includes(varName)) {
        found.push(varName);
      }
    }

    return { valid: found.length === 0, unknownVars: found };
  }

  /**
   * Build a Discord context variables map for a given guild/channel.
   */
  static buildDiscordContext(
    guildName: string,
    channelName: string,
    roleMentions: string[]
  ): Record<string, string> {
    return {
      'discord.guild': guildName,
      'server.name': guildName,
      'discord.channel': `#${channelName}`,
      'role.mention': roleMentions.join(' ')
    };
  }

  /**
   * Generate sample data for preview/test purposes.
   */
  static getSampleData(provider: 'youtube' | 'instagram'): Record<string, string> {
    const now = new Date().toISOString();

    if (provider === 'youtube') {
      return {
        'provider': 'youtube',
        'channel.name': 'Awesome Channel',
        'channel.id': 'UCxxxxxxxxxxxxxxxxxxxxxxxxx',
        'channel.url': 'https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxxxxx',
        'channel.avatar': '',
        'video.id': 'dQw4w9WgXcQ',
        'video.title': '🔥 My Awesome New Video!',
        'video.url': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'video.thumbnail': 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        'video.description': 'This is a sample video description for preview purposes.',
        'video.publish_date': now,
        'video.duration': '10:32',
        'video.views': '12,345',
        'video.live': '',
        'video.short': '',
        'video.premiere': '',
        'video.updated': now,
        'discord.guild': 'My Awesome Server',
        'server.name': 'My Awesome Server',
        'discord.channel': '#youtube-alerts',
        'role.mention': '@everyone'
      };
    }

    return {
      'provider': 'instagram',
      'post.caption': '📸 Check out this amazing photo! #photography #awesome',
      'post.image': '',
      'post.url': 'https://www.instagram.com/p/sample/',
      'post.publish_date': now,
      'post.id': 'sample_post_123',
      'profile.name': 'awesome.account',
      'profile.username': 'awesome.account',
      'profile.avatar': '',
      'profile.url': 'https://www.instagram.com/awesome.account/',
      'video.title': '📸 New Instagram Post',
      'video.url': 'https://www.instagram.com/p/sample/',
      'video.thumbnail': '',
      'video.description': 'Check out this amazing photo!',
      'video.publish_date': now,
      'video.live': '',
      'video.short': '',
      'channel.name': 'awesome.account',
      'channel.id': 'awesome.account',
      'channel.avatar': '',
      'channel.url': 'https://www.instagram.com/awesome.account/',
      'discord.guild': 'My Awesome Server',
      'server.name': 'My Awesome Server',
      'discord.channel': '#instagram-alerts',
      'role.mention': '@everyone'
    };
  }
}
