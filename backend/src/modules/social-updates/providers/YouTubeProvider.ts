/**
 * Social Updates Module — YouTubeProvider
 *
 * Implements BaseProvider for YouTube, delegating core operations to YouTubeFetcher.
 */

import { BaseProvider, ContentItem, ProviderType, ProviderValidation } from './BaseProvider.js';
import { YouTubeFetcher } from './YouTubeFetcher.js';

export class YouTubeProvider extends BaseProvider {
  readonly type: ProviderType = 'youtube';
  readonly displayName = 'YouTube';

  async validate(input: string): Promise<ProviderValidation> {
    try {
      const parsed = YouTubeFetcher.extractChannelInfo(input);
      let channelId: string | null = null;
      let name: string | null = null;
      let avatar: string | null = null;

      if (parsed.type === 'id') {
        channelId = parsed.value;
        const info = await YouTubeFetcher.fetchChannelInfo(channelId);
        name = info.name;
        avatar = info.avatar;
      } else {
        const resolved = await YouTubeFetcher.resolveHandle(parsed.value);
        channelId = resolved.channelId;
        name = resolved.name;
        avatar = resolved.avatar;
      }

      if (!channelId) {
        return { valid: false, sourceId: '', sourceName: '', error: 'Could not resolve YouTube channel. Check the handle/URL.' };
      }

      return {
        valid: true,
        sourceId: channelId,
        sourceName: name || channelId,
        sourceAvatar: avatar || undefined
      };
    } catch (err: any) {
      return { valid: false, sourceId: '', sourceName: '', error: `Validation failed: ${err.message}` };
    }
  }

  async fetchLatest(channelId: string, limit = 15): Promise<ContentItem[]> {
    // 1. Fetch standard upload RSS feed
    const items: ContentItem[] = await YouTubeFetcher.fetchRssFeed(channelId, limit).catch(() => []);

    // Verify top recent items for YouTube Shorts status if not already tagged
    await Promise.all(
      items.slice(0, 5).map(async (item) => {
        if (!item.isShort && !item.isLive && !item.isPremiere) {
          const isShort = await YouTubeFetcher.checkIfShort(item.id, false);
          if (isShort) {
            item.isShort = true;
            item.url = `https://www.youtube.com/shorts/${item.id}`;
            if (item.extra) {
              item.extra.contentType = 'short';
            }
          }
        }
      })
    );

    // 2. Scrape live stream and premiere status
    const liveItem = await YouTubeFetcher.scrapeLiveStatus(channelId).catch(() => null);
    if (liveItem) {
      // Unshift active live/premiere to make sure it's processed first
      items.unshift(liveItem);
    }

    return items;
  }

  prepareTemplateData(item: ContentItem, source: { sourceId: string; sourceName: string; sourceAvatar?: string }): Record<string, string> {
    const base = super.prepareTemplateData(item, source);
    return {
      ...base,
      'channel.url': `https://www.youtube.com/channel/${source.sourceId}`,
      'post.caption': item.description || '',
      'post.image': item.thumbnailUrl || '',
      'post.url': item.url,
      'profile.name': source.sourceName,
      'profile.username': source.sourceId,
      'profile.avatar': source.sourceAvatar || ''
    };
  }
}
