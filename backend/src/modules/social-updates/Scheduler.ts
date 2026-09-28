/**
 * Social Updates Module — Scheduler
 *
 * One Master Scheduler process that monitors all subscriptions by grouping them by account.
 * Restricts API usage to exactly one fetch per account, routes events to all subscribed guilds,
 * and handles adaptive intervals and validation.
 */

import { SocialSubscriptionRepository, SocialSubscription } from './SocialSubscriptionRepository.js';
import { ProviderManager } from './ProviderManager.js';
import { ComparisonEngine, PendingQueueCache } from './ComparisonEngine.js';
import { NotificationQueue } from './NotificationQueue.js';
import { SubscriptionManager } from './SubscriptionManager.js';
import { SecurityService } from '../../core/SecurityService.js';

const POLLING_INTERVALS: Record<string, number> = {
  fast:   30 * 1000,        // 30 seconds
  normal: 10 * 60 * 1000,   // 10 minutes
  slow:   30 * 60 * 1000    // 30 minutes
};

interface AccountGroup {
  provider: string;
  sourceId: string;
  subscriptions: SocialSubscription[];
}

export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private client: any = null;
  private logFn: ((msg: string, type: 'info' | 'warn' | 'success') => void) | null = null;
  private lastFetchTimes = new Map<string, number>(); // key: `provider:sourceId` -> timestamp

  constructor(client: any, logFn?: (msg: string, type: 'info' | 'warn' | 'success') => void) {
    this.client = client;
    this.logFn = logFn || null;
    NotificationQueue.setClient(client);
    SubscriptionManager.setScheduler(this);
  }

  private log(msg: string, type: 'info' | 'warn' | 'success' = 'info') {
    if (this.logFn) this.logFn(`[SocialUpdates] ${msg}`, type);
    else console.log(`[SocialUpdates] ${msg}`);
  }

  /**
   * Start the master scheduler loop.
   */
  start() {
    this.stop();
    this.log('Master Scheduler started.', 'success');
    
    // Initial immediate tick, then run master interval every 30 seconds
    this.tick().catch(err => this.log(`Scheduler tick error: ${err.message}`, 'warn'));
    this.timer = setInterval(() => {
      this.tick().catch(err => this.log(`Scheduler tick error: ${err.message}`, 'warn'));
    }, 30 * 1000);
  }

  /**
   * Stop the master scheduler.
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Initialize scheduler state and active tables.
   */
  async initAll() {
    try {
      await SocialSubscriptionRepository.ensureTable();
      this.start();
    } catch (err: any) {
      this.log(`Failed to initialize scheduler: ${err.message}`, 'warn');
    }
  }

  /**
   * Stop all timers (for graceful shutdown).
   */
  stopAll() {
    this.stop();
  }

  /**
   * Update the Discord client reference.
   */
  updateClient(client: any) {
    this.client = client;
    NotificationQueue.setClient(client);
  }

  /**
   * Trigger an immediate check loop (runs when configurations are updated).
   */
  triggerImmediateCheck() {
    this.lastFetchTimes.clear();
    this.tick().catch(err => this.log(`Immediate check error: ${err.message}`, 'warn'));
  }

  /**
   * Core scheduler tick. Runs once every 30 seconds.
   */
  private async tick(): Promise<void> {
    if (!this.client) return;

    // Clear expired cache entries (e.g. stories)
    await SocialSubscriptionRepository.clearExpiredCache().catch(() => {});

    // Load active subscriptions
    const subs = await SocialSubscriptionRepository.findAllEnabled().catch(() => []);
    if (subs.length === 0) return;

    // Group subscriptions by provider and sourceId
    const groups = this.groupSubscriptions(subs);

    for (const group of groups) {
      const key = `${group.provider}:${group.sourceId}`;
      const lastFetch = this.lastFetchTimes.get(key) || 0;
      const interval = this.determineInterval(group);
      const now = Date.now();

      if (now - lastFetch >= interval) {
        this.lastFetchTimes.set(key, now);
        this.pollAccountGroup(group).catch(err => 
          this.log(`Error checking ${group.provider}:${group.sourceId}: ${err.message}`, 'warn')
        );
      }
    }
  }

  /**
   * Aggregate active configurations by provider and account.
   */
  private groupSubscriptions(subs: SocialSubscription[]): AccountGroup[] {
    const map = new Map<string, AccountGroup>();
    for (const sub of subs) {
      const key = `${sub.provider}:${sub.sourceId}`;
      let group = map.get(key);
      if (!group) {
        group = {
          provider: sub.provider,
          sourceId: sub.sourceId,
          subscriptions: []
        };
        map.set(key, group);
      }
      group.subscriptions.push(sub);
    }
    return [...map.values()];
  }

  /**
   * Determine interval dynamically based on group polling configs (adaptive polling).
   */
  private determineInterval(group: AccountGroup): number {
    // If any subscription in the group wants 'fast', check fast.
    const modes = group.subscriptions.map(s => s.pollingMode);
    if (modes.includes('fast')) return POLLING_INTERVALS.fast;
    if (modes.includes('normal')) return POLLING_INTERVALS.normal;
    return POLLING_INTERVALS.slow;
  }

  /**
   * Poll a single account, evaluate updates, and fan out events.
   */
  private async pollAccountGroup(group: AccountGroup): Promise<void> {
    try {
      const provider = ProviderManager.getProvider(group.provider);

      // Extract user-specific decrypted credential if configured on any subscription in the group
      let decryptedAuth: string | undefined = undefined;
      const subWithAuth = group.subscriptions.find(s => !!s.authCredential);
      if (subWithAuth?.authCredential) {
        try {
          decryptedAuth = SecurityService.decrypt(subWithAuth.authCredential);
        } catch {
          // Fallback to raw string in case stored unencrypted during legacy setups
          decryptedAuth = subWithAuth.authCredential;
        }
      }

      const items = await provider.fetchLatest(group.sourceId, 15, decryptedAuth);

      // Perform caching & deduplication checks once for the account
      const newItems = await ComparisonEngine.computeNew(group.provider, group.sourceId, items);

      if (newItems.length === 0) {
        // Just update sync timestamps in the database
        for (const sub of group.subscriptions) {
          await SocialSubscriptionRepository.update(sub.id, {
            lastSyncTimestamp: new Date().toISOString()
          });
        }
        return;
      }

      // Sort oldest to newest (ComparisonEngine already does this, but confirm)
      const newestItem = newItems[newItems.length - 1];

      // Fan out notifications to all subscribing guilds
      for (const sub of group.subscriptions) {
        let contentFilter: any;
        try {
          contentFilter = JSON.parse(sub.contentTypes) || {};
        } catch {
          contentFilter = {};
        }

        const filtered = provider.filterByContentType(newItems, contentFilter);

        for (const item of filtered) {
          const publishedTime = new Date(item.publishedAt).getTime();
          const oneHourAgo = Date.now() - 60 * 60 * 1000;
          
          if (!isNaN(publishedTime) && publishedTime < oneHourAgo) {
            const type = item.extra?.contentType || (item.isShort ? 'short' : 'video');
            const itemCacheKey = `${item.id}:${type}`;
            
            await SocialSubscriptionRepository.insertCache({
              id: itemCacheKey,
              provider: sub.provider,
              sourceId: sub.sourceId,
              contentType: type,
              publishedAt: item.publishedAt,
              createdAt: new Date().toISOString()
            }).catch(() => {});
            
            PendingQueueCache.delete(sub.provider, sub.sourceId, itemCacheKey);
            continue;
          }

          NotificationQueue.enqueue(sub.id, item);
        }

        // Update tracking state in SQLite
        await SocialSubscriptionRepository.update(sub.id, {
          lastProcessedId: newestItem.id,
          lastSyncTimestamp: new Date().toISOString(),
          validationStatus: 'valid',
          validationError: undefined
        });
      }
    } catch (err: any) {
      // Mark validation failures / network errors on all subscriptions in the group
      for (const sub of group.subscriptions) {
        await SocialSubscriptionRepository.recordFailure(sub.id, err.message || 'Check failed');
        // Validate subscription health status
        await SocialSubscriptionRepository.update(sub.id, {
          validationStatus: 'invalid',
          validationError: err.message || 'Check failed'
        });
      }
      this.log(`Group polling failed for ${group.provider}:${group.sourceId} - ${err.message}`, 'warn');
    }
  }
}
