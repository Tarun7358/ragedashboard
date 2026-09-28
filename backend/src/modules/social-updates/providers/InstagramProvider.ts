/**
 * Social Updates Module — InstagramProvider
 *
 * Implements BaseProvider for Instagram, delegating core operations to InstagramFetcher.
 */

import { BaseProvider, ContentItem, ProviderType, ProviderValidation } from './BaseProvider.js';
import { InstagramFetcher } from './InstagramFetcher.js';

export class InstagramProvider extends BaseProvider {
  readonly type: ProviderType = 'instagram';
  readonly displayName = 'Instagram';

  async validate(input: string): Promise<ProviderValidation> {
    let cleaned = input.trim().replace(/^(https?:\/\/)?(www\.)?/, '');
    if (cleaned.startsWith('instagram.com/')) {
      cleaned = cleaned.replace(/^instagram\.com\//, '');
    }
    cleaned = cleaned.replace(/^@/, '');
    let username = cleaned.split('?')[0].split('/')[0];

    if (username === 'instagram.com' || username === 'www.instagram.com') {
      return {
        valid: false,
        sourceId: '',
        sourceName: '',
        error: 'Please enter a specific Instagram username or profile URL.'
      };
    }

    if (!username || username.length < 1 || username.length > 30) {
      return {
        valid: false,
        sourceId: '',
        sourceName: '',
        error: 'Invalid Instagram username format.'
      };
    }

    // Validate username characters
    if (!/^[a-zA-Z0-9._]+$/.test(username)) {
      return {
        valid: false,
        sourceId: '',
        sourceName: '',
        error: 'Username contains invalid characters.'
      };
    }

    return {
      valid: true,
      sourceId: username,
      sourceName: `@${username}`,
      sourceAvatar: undefined,
      subscriberCount: undefined,
      isVerified: false
    };
  }

  async fetchLatest(username: string, limit = 15, authCredential?: string): Promise<ContentItem[]> {
    return InstagramFetcher.fetchLatestAsync(username, limit, authCredential);
  }

  override filterByContentType(items: ContentItem[], filter: any): ContentItem[] {
    const activeFilter = filter || { posts: true, reels: true, carousels: true, stories: false };
    return items.filter(item => {
      const type = item.extra?.contentType;
      if (type === 'reel') return !!activeFilter.reels;
      if (type === 'story') return !!activeFilter.stories;
      if (type === 'carousel') return !!activeFilter.carousels;
      return !!activeFilter.posts;
    });
  }

  prepareTemplateData(item: ContentItem, source: { sourceId: string; sourceName: string; sourceAvatar?: string }): Record<string, string> {
    return {
      'post.caption': item.description || '',
      'post.image': item.thumbnailUrl || '',
      'post.url': item.url,
      'post.publish_date': item.publishedAt,
      'post.id': item.id,
      'profile.name': source.sourceName,
      'profile.username': source.sourceId,
      'profile.avatar': source.sourceAvatar || '',
      'profile.url': `https://www.instagram.com/${source.sourceId}/`,
      // Compatibility aliases
      'video.title': item.title,
      'video.url': item.url,
      'video.thumbnail': item.thumbnailUrl || '',
      'video.description': item.description || '',
      'video.publish_date': item.publishedAt,
      'video.live': '',
      'video.short': item.isShort ? 'true' : '',
      'channel.name': source.sourceName,
      'channel.id': source.sourceId,
      'channel.avatar': source.sourceAvatar || '',
      'channel.url': `https://www.instagram.com/${source.sourceId}/`
      // L-04 FIX: item.extra is NOT spread here — attacker-controlled extra fields
      // could override the keys above (e.g. post.url, channel.name) silently.
    };
  }
}
