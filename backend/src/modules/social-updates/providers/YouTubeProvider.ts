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
    // The RSS parser only guesses "short" from a #shorts hashtag, which mislabels live streams
    // and long videos that carry the hashtag. YouTube is the source of truth, so verify both ways.
    await Promise.all(
      items.slice(0, 5).map(async (item) => {
        if (item.isLive || item.isPremiere) return;
        const verified = await YouTubeFetcher.verifyShort(item.id);
        if (verified === null) return; // network issue: keep heuristic result
        if (verified && !item.isShort) {
          item.isShort = true;
          item.url = `https://www.youtube.com/shorts/${item.id}`;
          if (item.extra) item.extra.contentType = 'short';
        } else if (!verified && item.isShort) {
          item.isShort = false;
          item.url = `https://www.youtube.com/watch?v=${item.id}`;
          if (item.extra) item.extra.contentType = 'video';
        }
      })
    );

    // 2. Scrape live stream and premiere status
    const liveItem = await YouTubeFetcher.scrapeLiveStatus(channelId).catch(() => null);
    if (liveItem) {
      // The same stream usually also appears in the RSS feed as a plain video. Keep only the
      // live/premiere entry so one stream can never produce two alerts.
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i].id === liveItem.id) items.splice(i, 1);
      }
      items.unshift(liveItem);
    }

    return items;
  }

  prepareTemplateData(item: ContentItem, source: { sourceId: string; sourceName: string; sourceAvatar?: string }): Record<string, string> {
    const base = super.prepareTemplateData(item, source);
    return {
      ...base,
      'provider': 'youtube',
      'channel.url': `https://www.youtube.com/channel/${source.sourceId}`,
      'channel.name': source.sourceName,
      'channel.id': source.sourceId,
      'channel.avatar': source.sourceAvatar || '',
      'video.id': item.id,
      'video.title': item.title,
      'video.url': item.url,
      'video.thumbnail': item.thumbnailUrl || '',
      'video.description': item.description || ''
    };
  }
}
