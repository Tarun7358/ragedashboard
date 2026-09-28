/**
 * Social Updates Module — BaseProvider
 * 
 * Every provider (YouTube, Instagram, Twitch, etc.) must implement this interface.
 * The rest of the system never needs to know the internals of a specific provider.
 */

export interface ProviderValidation {
  valid: boolean;
  sourceId: string;         // canonical ID (e.g. YouTube channel ID, IG username)
  sourceName: string;
  sourceAvatar?: string;
  subscriberCount?: number;
  isVerified?: boolean;
  error?: string;
}

export interface ContentItem {
  id: string;               // unique content ID
  title: string;
  url: string;
  thumbnailUrl?: string;
  description?: string;
  publishedAt: string;      // ISO 8601
  duration?: string;
  viewCount?: number;
  isLive?: boolean;
  isShort?: boolean;
  isPremiere?: boolean;
  isCommunityPost?: boolean;
  // Provider-specific extras stored here
  extra?: Record<string, string>;
}

export interface ContentTypeFilter {
  videos: boolean;
  shorts: boolean;
  streams: boolean;
  premieres: boolean;
  communityPosts: boolean;
  posts?: boolean;        // Instagram posts
  reels?: boolean;        // Instagram reels
  carousels?: boolean;    // Instagram carousels
  stories?: boolean;      // Instagram stories
}

export type ProviderType = 'youtube' | 'instagram' | 'twitch' | 'tiktok' | 'x' | 'rss';

export abstract class BaseProvider {
  abstract readonly type: ProviderType;
  abstract readonly displayName: string;

  /**
   * Validate a source input (URL, handle, username, channel ID) and resolve to canonical IDs.
   */
  abstract validate(input: string): Promise<ProviderValidation>;

  /**
   * Fetch the latest N content items from this source.
   */
  abstract fetchLatest(sourceId: string, limit?: number, authCredential?: string): Promise<ContentItem[]>;

  /**
   * Given the latest fetched items and the last known processed ID, return new items only.
   */
  detectNew(items: ContentItem[], lastProcessedId: string | null, lastSyncTimestamp?: string | null): ContentItem[] {
    if (!lastProcessedId) return items.slice(0, 1); // Only return the most recent on first run
    const idx = items.findIndex(i => i.id === lastProcessedId);
    if (idx === -1) {
      if (lastSyncTimestamp) {
        const lastSyncTime = new Date(lastSyncTimestamp).getTime();
        if (!isNaN(lastSyncTime)) {
          // Only return items published after the last sync timestamp to prevent flooding
          return items.filter(item => {
            const pubTime = new Date(item.publishedAt).getTime();
            return !isNaN(pubTime) && pubTime > lastSyncTime;
          });
        }
      }
      return []; // Safe fallback: return nothing if we can't determine new items
    }
    return items.slice(0, idx);   // Items before the known one are new
  }

  /**
   * Apply content type filter to a list of items.
   */
  filterByContentType(items: ContentItem[], filter: ContentTypeFilter): ContentItem[] {
    return items.filter(item => {
      if (item.isLive && !filter.streams) return false;
      if (item.isShort && !filter.shorts) return false;
      if (item.isPremiere && !filter.premieres) return false;
      if (item.isCommunityPost && !filter.communityPosts) return false;
      if (!item.isLive && !item.isShort && !item.isPremiere && !item.isCommunityPost && !filter.videos) return false;
      return true;
    });
  }

  /**
   * Map a ContentItem into a flat key-value dict for use with TemplateEngine.
   * Subclasses should override to add provider-specific variables.
   */
  prepareTemplateData(item: ContentItem, source: { sourceId: string; sourceName: string; sourceAvatar?: string }): Record<string, string> {
    return {
      'video.id': item.id,
      'video.title': item.title,
      'video.url': item.url,
      'video.thumbnail': item.thumbnailUrl || '',
      'video.description': (item.description || '').substring(0, 200),
      'video.publish_date': item.publishedAt,
      'video.duration': item.duration || '',
      'video.views': item.viewCount?.toString() || '0',
      'video.live': item.isLive ? 'true' : '',
      'video.short': item.isShort ? 'true' : '',
      'video.premiere': item.isPremiere ? 'true' : '',
      'channel.name': source.sourceName,
      'channel.id': source.sourceId,
      'channel.avatar': source.sourceAvatar || '',
      'channel.url': `https://www.youtube.com/channel/${source.sourceId}`,
      ...(item.extra || {})
    };
  }
}
