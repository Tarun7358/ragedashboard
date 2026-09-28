/**
 * Social Updates Module — SubscriptionManager
 *
 * Unified controller for subscription lifecycles, configuration updates,
 * background validation, and event audit logging. Used by REST API routes and Discord commands.
 */

import { SocialSubscriptionRepository, SocialSubscription } from './SocialSubscriptionRepository.js';
import { ProviderManager } from './ProviderManager.js';
import { YouTubeFetcher } from './providers/YouTubeFetcher.js';
import { SecurityService } from '../../core/SecurityService.js';

export class SubscriptionManager {
  private static schedulerRef: any = null;

  static setScheduler(scheduler: any) {
    this.schedulerRef = scheduler;
  }

  /**
   * Helper to generate unique subscription IDs.
   */
  private static generateId(): string {
    return `su_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Add a new social subscription.
   */
  static async addSubscription(
    guildId: string,
    provider: string,
    input: string,
    discordChannelId: string,
    options: {
      embedConfig?: any;
      mentionRoles?: string[];
      pollingMode?: string;
      contentTypes?: any;
      authCredential?: string;
    }
  ): Promise<{ success: boolean; subscription?: SocialSubscription; error?: string }> {
    await SocialSubscriptionRepository.ensureTable().catch(() => {});

    if (!provider || !input || !discordChannelId) {
      return { success: false, error: 'provider, input, and discordChannelId are required.' };
    }

    if (!ProviderManager.has(provider)) {
      return { success: false, error: `Platform provider "${provider}" is not registered.` };
    }

    try {
      const providerInstance = ProviderManager.getProvider(provider);
      const validation = await providerInstance.validate(input);

      if (!validation.valid) {
        return { success: false, error: validation.error || 'Failed to validate source input.' };
      }

      // Check duplicates
      const existing = await SocialSubscriptionRepository.findBySourceId(guildId, provider, validation.sourceId);
      if (existing) {
        return {
          success: false,
          error: `This ${provider === 'youtube' ? 'YouTube channel' : 'Instagram account'} is already subscribed in this server.`
        };
      }

      const id = this.generateId();
      const defaultEmbed = options.embedConfig || {};
      const defaultContentTypes = options.contentTypes || {
        videos: true, shorts: true, streams: true, premieres: true, communityPosts: false, posts: true, reels: true, stories: false
      };

      // Encrypt user-provided credentials (session cookie or token)
      let encryptedAuth: string | undefined = undefined;
      if (options.authCredential && options.authCredential.trim()) {
        try {
          encryptedAuth = SecurityService.encrypt(options.authCredential.trim());
        } catch {
          encryptedAuth = options.authCredential.trim();
        }
      }

      await SocialSubscriptionRepository.insert({
        id,
        guildId,
        provider,
        sourceId: validation.sourceId,
        sourceName: validation.sourceName || validation.sourceId,
        sourceAvatar: validation.sourceAvatar || undefined,
        discordChannelId,
        embedConfig: JSON.stringify(defaultEmbed),
        mentionRoles: JSON.stringify(options.mentionRoles && options.mentionRoles.length > 0 ? options.mentionRoles : ['everyone', 'here']),
        pollingMode: options.pollingMode || 'normal',
        contentTypes: JSON.stringify(defaultContentTypes),
        enabled: 1,
        authCredential: encryptedAuth,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Insert Audit Log
      await SocialSubscriptionRepository.insertAuditLog({
        guildId,
        provider,
        sourceId: validation.sourceId,
        action: 'Subscription Added',
        details: `Subscribed to ${provider}:${validation.sourceName} in channel: ${discordChannelId}`
      }).catch(() => {});

      // Restart running scheduler monitoring cycle
      if (this.schedulerRef) {
        this.schedulerRef.triggerImmediateCheck();
      }

      const sub = await SocialSubscriptionRepository.findById(id);
      return {
        success: true,
        subscription: sub ? this.deserialize(sub) : undefined
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Remove a subscription.
   */
  static async removeSubscription(guildId: string, id: string): Promise<{ success: boolean; error?: string }> {
    const sub = await SocialSubscriptionRepository.findById(id);
    if (!sub || sub.guildId !== guildId) {
      return { success: false, error: 'Subscription not found.' };
    }

    try {
      await SocialSubscriptionRepository.delete(id);

      await SocialSubscriptionRepository.insertAuditLog({
        guildId,
        provider: sub.provider,
        sourceId: sub.sourceId,
        action: 'Subscription Removed',
        details: `Removed subscription for ${sub.provider}:${sub.sourceName}`
      }).catch(() => {});

      if (this.schedulerRef) {
        this.schedulerRef.triggerImmediateCheck();
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Update settings on an existing subscription.
   */
  static async updateSubscription(
    guildId: string,
    id: string,
    updates: Partial<Omit<SocialSubscription, 'id' | 'guildId' | 'provider' | 'sourceId'>>
  ): Promise<{ success: boolean; subscription?: SocialSubscription; error?: string }> {
    const sub = await SocialSubscriptionRepository.findById(id);
    if (!sub || sub.guildId !== guildId) {
      return { success: false, error: 'Subscription not found.' };
    }

    try {
      const patch: Partial<SocialSubscription> = {};
      if (updates.discordChannelId !== undefined) patch.discordChannelId = updates.discordChannelId;
      if (updates.embedConfig !== undefined) patch.embedConfig = typeof updates.embedConfig === 'string' ? updates.embedConfig : JSON.stringify(updates.embedConfig);
      if (updates.notificationTemplate !== undefined) patch.notificationTemplate = updates.notificationTemplate;
      if (updates.mentionRoles !== undefined) patch.mentionRoles = typeof updates.mentionRoles === 'string' ? updates.mentionRoles : JSON.stringify(updates.mentionRoles);
      if (updates.pollingMode !== undefined) patch.pollingMode = updates.pollingMode;
      if (updates.contentTypes !== undefined) patch.contentTypes = typeof updates.contentTypes === 'string' ? updates.contentTypes : JSON.stringify(updates.contentTypes);
      if (updates.enabled !== undefined) patch.enabled = updates.enabled ? 1 : 0;
      if (updates.sourceName !== undefined) patch.sourceName = updates.sourceName;
      if (updates.sourceAvatar !== undefined) patch.sourceAvatar = updates.sourceAvatar;
      if (updates.validationStatus !== undefined) patch.validationStatus = updates.validationStatus;
      if (updates.validationError !== undefined) patch.validationError = updates.validationError;
      if ((updates as any).authCredential !== undefined) {
        const raw = (updates as any).authCredential;
        if (raw && typeof raw === 'string' && raw.trim().length > 0) {
          try {
            patch.authCredential = SecurityService.encrypt(raw.trim());
          } catch {
            patch.authCredential = raw.trim();
          }
        } else {
          patch.authCredential = undefined;
        }
      }

      await SocialSubscriptionRepository.update(id, patch);

      await SocialSubscriptionRepository.insertAuditLog({
        guildId,
        provider: sub.provider,
        sourceId: sub.sourceId,
        action: 'Subscription Updated',
        details: `Updated subscription parameters for ${sub.provider}:${sub.sourceName}`
      }).catch(() => {});

      if (this.schedulerRef) {
        this.schedulerRef.triggerImmediateCheck();
      }

      const updated = await SocialSubscriptionRepository.findById(id);
      return {
        success: true,
        subscription: updated ? this.deserialize(updated) : undefined
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Validate subscription account health.
   */
  static async validateSubscription(id: string): Promise<boolean> {
    const sub = await SocialSubscriptionRepository.findById(id);
    if (!sub) return false;

    try {
      const providerInstance = ProviderManager.getProvider(sub.provider);
      const validation = await providerInstance.validate(sub.sourceId);

      if (validation.valid) {
        // Sync name/avatar if they changed
        const patch: Partial<SocialSubscription> = {
          validationStatus: 'valid',
          validationError: undefined
        };
        if (validation.sourceName && validation.sourceName !== sub.sourceName) {
          patch.sourceName = validation.sourceName;
        }
        if (validation.sourceAvatar && validation.sourceAvatar !== sub.sourceAvatar) {
          patch.sourceAvatar = validation.sourceAvatar;
        }
        await SocialSubscriptionRepository.update(id, patch);
        return true;
      } else {
        await SocialSubscriptionRepository.update(id, {
          validationStatus: 'invalid',
          validationError: validation.error || 'Account validation failed'
        });
        await SocialSubscriptionRepository.insertAuditLog({
          guildId: sub.guildId,
          provider: sub.provider,
          sourceId: sub.sourceId,
          action: 'Validation Failed',
          details: `Validation failed for account: ${sub.sourceName} (${validation.error || 'Unknown Error'})`
        }).catch(() => {});
        return false;
      }
    } catch (err: any) {
      await SocialSubscriptionRepository.update(id, {
        validationStatus: 'invalid',
        validationError: err.message
      });
      return false;
    }
  }

  /**
   * Validate all active subscriptions in the database.
   */
  static async validateAllActive(): Promise<void> {
    const subs = await SocialSubscriptionRepository.findAllEnabled();
    for (const sub of subs) {
      await this.validateSubscription(sub.id).catch(() => {});
    }
  }

  /**
   * Retrieve structured configurations list.
   */
  static deserialize(sub: any): any {
    const { authCredential, ...rest } = sub;
    return {
      ...rest,
      hasAuthCredential: !!authCredential,
      embedConfig: typeof sub.embedConfig === 'string' ? JSON.parse(sub.embedConfig || '{}') : sub.embedConfig,
      mentionRoles: typeof sub.mentionRoles === 'string' ? JSON.parse(sub.mentionRoles || '[]') : sub.mentionRoles,
      contentTypes: typeof sub.contentTypes === 'string' ? JSON.parse(sub.contentTypes || '{}') : sub.contentTypes
    };
  }
}
