/**
 * Social Updates Module — ComparisonEngine
 *
 * Compares freshly fetched feeds against persistent cache entries.
 * Employs state-aware logic allowing transition states (Upcoming -> Live) while preventing final duplicates.
 * Utilizes an in-memory queue cache to defer database writes until delivery finishes.
 */

import { ContentItem } from './providers/BaseProvider.js';
import { SocialSubscriptionRepository } from './SocialSubscriptionRepository.js';

export class PendingQueueCache {
  private static pendingKeys = new Set<string>(); // key format: `provider:sourceId:cacheKey`

  static add(provider: string, sourceId: string, itemCacheKey: string) {
    this.pendingKeys.add(`${provider}:${sourceId}:${itemCacheKey}`);
  }

  static has(provider: string, sourceId: string, itemCacheKey: string): boolean {
    return this.pendingKeys.has(`${provider}:${sourceId}:${itemCacheKey}`);
  }

  static delete(provider: string, sourceId: string, itemCacheKey: string) {
    this.pendingKeys.delete(`${provider}:${sourceId}:${itemCacheKey}`);
  }

  static clear() {
    this.pendingKeys.clear();
  }
}

export class ComparisonEngine {
  /**
   * Compare fetched items with cached items.
   * Tracks pending queue cache to avoid double-processing.
   * Returns items that are brand new.
   */
  static async computeNew(
    provider: string,
    sourceId: string,
    fetchedItems: ContentItem[]
  ): Promise<ContentItem[]> {
    if (fetchedItems.length === 0) return [];

    // Get current cache entries from DB
    const cached = await SocialSubscriptionRepository.getCache(provider, sourceId);
    const cachedIds = new Set(cached.map(c => c.id));

    // Helper to evaluate cached entries based on type-aware matching rules.
    // For YouTube and Instagram, we block duplicates if any state/format of the video
    // (e.g. live, premiere, short, standard video) has already been processed to prevent double-alerts.
    const hasCachedKey = (id: string, type: string) => {
      // Stories are ephemeral and can have repeating or short-lived IDs, so we treat them strictly
      if (type === 'story') {
        return cachedIds.has(`${id}:${type}`) || cachedIds.has(id);
      }

      const checkKeys = [
        id,
        `${id}:video`,
        `${id}:post`,
        `${id}:live`,
        `${id}:premiere`,
        `${id}:carousel`,
        `${id}:short`,
        `${id}:reel`
      ];
      return checkKeys.some(k => cachedIds.has(k));
    };

    // If cache is entirely empty for this account (first run), initialize it with all items and return nothing
    if (cached.length === 0) {
      for (const item of fetchedItems) {
        const type = item.extra?.contentType || (item.isShort ? 'short' : 'video');
        const itemCacheKey = `${item.id}:${type}`;

        let expiresAt: string | undefined = undefined;
        if (item.extra?.expiresAt) {
          expiresAt = item.extra.expiresAt;
        } else if (type === 'story') {
          expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        }

        await SocialSubscriptionRepository.insertCache({
          id: itemCacheKey,
          provider,
          sourceId,
          contentType: type,
          publishedAt: item.publishedAt,
          expiresAt,
          createdAt: new Date().toISOString()
        });
      }
      return [];
    }

    const newItems: ContentItem[] = [];
    const seenThisTick = new Set<string>();

    // Process from oldest to newest to preserve chronological order
    const sortedFetched = [...fetchedItems].sort((a, b) => 
      new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()
    );

    for (const item of sortedFetched) {
      const type = item.extra?.contentType || (item.isShort ? 'short' : 'video');
      const itemCacheKey = `${item.id}:${type}`;

      // Check both database cache and active in-memory pending queue
      if (type !== 'story' && seenThisTick.has(item.id)) continue;

      if (!hasCachedKey(item.id, type) && !PendingQueueCache.has(provider, sourceId, itemCacheKey)) {
        seenThisTick.add(item.id);
        newItems.push(item);
        // Place in in-memory pending queue cache immediately
        PendingQueueCache.add(provider, sourceId, itemCacheKey);
      }
    }

    return newItems;
  }
}
