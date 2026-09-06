/**
 * Social Updates Module — NotificationQueue
 *
 * Manages priority-based queuing for outgoing Discord notifications.
 * Respects rate limits, executes retries with backoff, supports auto-threads,
 * and maintains audit logs.
 */

import { ContentItem } from './providers/BaseProvider.js';
import { SocialSubscriptionRepository } from './SocialSubscriptionRepository.js';
import { NotificationService } from './NotificationService.js';
import { TemplateEngine } from './TemplateEngine.js';
import { PendingQueueCache } from './ComparisonEngine.js';

export interface QueueJob {
  id: string;
  subscriptionId: string;
  item: ContentItem;
  priority: number; // live = 5, premiere = 4, video = 3, short/reel = 2, post/story = 1
  attempts: number;
  runAt: number;
}

export class NotificationQueue {
  private static jobs: QueueJob[] = [];
  private static client: any = null;
  private static isProcessing = false;

  static setClient(client: any) {
    this.client = client;
  }

  static getPriority(item: ContentItem): number {
    const contentType = item.extra?.contentType;
    if (contentType === 'live' || item.isLive) return 5;
    if (contentType === 'premiere' || item.isPremiere) return 4;
    if (contentType === 'video') return 3;
    if (contentType === 'short' || item.isShort || contentType === 'reel') return 2;
    return 1; // posts, stories, etc.
  }

  static enqueue(subscriptionId: string, item: ContentItem) {
    const priority = this.getPriority(item);
    const id = `job_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
    this.jobs.push({
      id,
      subscriptionId,
      item,
      priority,
      attempts: 0,
      runAt: Date.now()
    });
    
    this.sortQueue();
    this.process();
  }

  private static sortQueue() {
    this.jobs.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return a.runAt - b.runAt;
    });
  }

  private static async process() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.jobs.length > 0) {
        const now = Date.now();
        const jobIndex = this.jobs.findIndex(j => j.runAt <= now);
        if (jobIndex === -1) {
          break;
        }

        const job = this.jobs.splice(jobIndex, 1)[0];
        const success = await this.deliverJob(job);
        if (!success) {
          job.attempts++;
          if (job.attempts < 3) {
            const backoff = Math.pow(2, job.attempts) * 1000;
            job.runAt = Date.now() + backoff;
            this.jobs.push(job);
            this.sortQueue();
          } else {
            await SocialSubscriptionRepository.recordFailure(job.subscriptionId, `Failed after 3 delivery attempts.`);

            const type = job.item.extra?.contentType || (job.item.isShort ? 'short' : 'video');
            const itemCacheKey = `${job.item.id}:${type}`;
            const provider = job.item.extra?.provider || 'unknown';
            const sourceId = job.item.extra?.sourceId || 'unknown';

            let expiresAt: string | undefined = undefined;
            if (job.item.extra?.expiresAt) {
              expiresAt = job.item.extra.expiresAt;
            } else if (type === 'story') {
              expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
            }

            await SocialSubscriptionRepository.insertCache({
              id: itemCacheKey,
              provider,
              sourceId,
              contentType: type,
              publishedAt: job.item.publishedAt,
              expiresAt,
              createdAt: new Date().toISOString()
            }).catch(() => {});

            PendingQueueCache.delete(provider, sourceId, itemCacheKey);

            await SocialSubscriptionRepository.insertAuditLog({
              guildId: undefined,
              provider,
              sourceId,
              action: 'Delivery Failed',
              details: `Notification permanently failed for content: "${job.item.title}" (ID: ${job.item.id})`
            }).catch(() => {});
          }
        }

        // Sequential delay to protect against rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } finally {
      this.isProcessing = false;
      if (this.jobs.length > 0) {
        setTimeout(() => this.process(), 1000);
      }
    }
  }

  private static async deliverJob(job: QueueJob): Promise<boolean> {
    if (!this.client) return false;

    const sub = await SocialSubscriptionRepository.findById(job.subscriptionId).catch(() => null);
    if (!sub || !sub.enabled) return true; // Completed silently if deleted or disabled

    const startTime = Date.now();
    try {
      const channel = await this.client.channels.fetch(sub.discordChannelId).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        throw new Error(`Discord channel ${sub.discordChannelId} not found or not text-based.`);
      }

      let embedConfig: any = {};
      try { embedConfig = JSON.parse(sub.embedConfig); } catch {}

      const provider = sub.provider;
      const templateData: Record<string, string> = {
        'post.caption': job.item.description || '',
        'post.image': job.item.thumbnailUrl || '',
        'post.url': job.item.url,
        'post.publish_date': job.item.publishedAt,
        'post.id': job.item.id,
        'profile.name': sub.sourceName,
        'profile.username': sub.sourceId,
        'profile.avatar': sub.sourceAvatar || '',
        'profile.url': provider === 'youtube'
          ? `https://www.youtube.com/channel/${sub.sourceId}`
          : `https://www.instagram.com/${sub.sourceId}/`,
        'video.title': job.item.title,
        'video.url': job.item.url,
        'video.thumbnail': job.item.thumbnailUrl || '',
        'video.description': job.item.description || '',
        'video.publish_date': job.item.publishedAt,
        'video.live': job.item.isLive ? 'true' : '',
        'video.short': job.item.isShort ? 'true' : '',
        'video.premiere': job.item.isPremiere ? 'true' : '',
        'channel.name': sub.sourceName,
        'channel.id': sub.sourceId,
        'channel.avatar': sub.sourceAvatar || '',
        'channel.url': provider === 'youtube'
          ? `https://www.youtube.com/channel/${sub.sourceId}`
          : `https://www.instagram.com/${sub.sourceId}/`,
        'discord.channel': `#${channel.name}`,
        'discord.guild': channel.guild?.name || '',
        'server.name': channel.guild?.name || '',
        ...(job.item.extra || {})
      };

      const parsedRoles: string[] = JSON.parse(sub.mentionRoles || '[]');
      const mentionRoles: string[] = parsedRoles.length > 0 ? parsedRoles : ['everyone', 'here'];

      templateData['role.mention'] = mentionRoles
        .map((r: string) => r === 'everyone' ? '@everyone' : r === 'here' ? '@here' : `<@&${r}>`)
        .join(' ');

      const embed = NotificationService.buildEmbed(embedConfig, templateData);
      const components = embedConfig.buttons
        ? NotificationService.buildComponents(embedConfig.buttons, templateData)
        : [];

      const mentionContent = NotificationService.buildMentionContent(mentionRoles, templateData);

      let defaultMessage = '';
      const channelName = templateData['channel.name'] || templateData['profile.name'] || 'Creator';
      const contentUrl = templateData['video.url'] || templateData['post.url'] || '';
      const contentType = job.item.extra?.contentType || (job.item.isLive ? 'live' : job.item.isPremiere ? 'premiere' : job.item.isShort ? 'short' : 'video');

      if (provider === 'youtube') {
        if (contentType === 'live' || job.item.isLive) {
          defaultMessage = `🔴 **${channelName}** is now **LIVE** on YouTube! ${mentionContent}\n${contentUrl}`;
        } else if (contentType === 'premiere' || job.item.isPremiere) {
          defaultMessage = `🎬 **${channelName}** is premiering a new video! ${mentionContent}\n${contentUrl}`;
        } else if (contentType === 'short' || job.item.isShort) {
          defaultMessage = `**${channelName}** has released a new short! ${mentionContent}\n${contentUrl}`;
        } else {
          // Regular YouTube video upload
          defaultMessage = `**${channelName}** uploaded a new video! ${mentionContent}\n${contentUrl}`;
        }
      } else if (provider === 'instagram') {
        if (contentType === 'reel') {
          defaultMessage = `🎬 **@${channelName}** shared a new reel on Instagram! ${mentionContent}\n${contentUrl}`;
        } else if (contentType === 'story') {
          defaultMessage = `✨ **@${channelName}** posted a new story on Instagram! ${mentionContent}\n${contentUrl}`;
        } else {
          defaultMessage = `📸 **@${channelName}** shared a new post on Instagram! ${mentionContent}\n${contentUrl}`;
        }
      } else {
        defaultMessage = `📢 **${channelName}** posted new content! ${mentionContent}\n${contentUrl}`;
      }

      const customContent = embedConfig.messageContent
        ? TemplateEngine.resolve(embedConfig.messageContent, templateData)
        : defaultMessage;

      const content = customContent.substring(0, 2000);

      const msg = await channel.send({
        content,
        embeds: [embed],
        components: components.length > 0 ? components : undefined
      });

      // Auto Thread Creation
      if (embedConfig.autoThread && typeof (channel as any).threads?.create === 'function') {
        try {
          await (channel as any).threads.create({
            name: `${job.item.title.substring(0, 80)}`,
            autoArchiveDuration: 1440,
            reason: 'Social Updates Auto Thread',
            startMessage: msg
          });
        } catch (threadErr: any) {
          console.error('[SocialUpdates] Thread creation failed:', threadErr.message);
        }
      }

      const deliveryTime = Date.now() - startTime;
      await SocialSubscriptionRepository.recordSuccess(sub.id, job.item.id, deliveryTime);

      const type = job.item.extra?.contentType || (job.item.isShort ? 'short' : 'video');
      const itemCacheKey = `${job.item.id}:${type}`;

      let expiresAt: string | undefined = undefined;
      if (job.item.extra?.expiresAt) {
        expiresAt = job.item.extra.expiresAt;
      } else if (type === 'story') {
        expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      }

      await SocialSubscriptionRepository.insertCache({
        id: itemCacheKey,
        provider: sub.provider,
        sourceId: sub.sourceId,
        contentType: type,
        publishedAt: job.item.publishedAt,
        expiresAt,
        createdAt: new Date().toISOString()
      }).catch(() => {});

      PendingQueueCache.delete(sub.provider, sub.sourceId, itemCacheKey);

      await SocialSubscriptionRepository.insertAuditLog({
        guildId: sub.guildId,
        provider: sub.provider,
        sourceId: sub.sourceId,
        action: 'Notification Sent',
        details: `Sent notification for ${sub.provider}:${sub.sourceName} → "${job.item.title}" in #${channel.name}`
      }).catch(() => {});

      return true;
    } catch (err: any) {
      console.error('[SocialUpdates] Job delivery failed:', err.message);
      return false;
    }
  }

  static getQueueLength(): number {
    return this.jobs.length;
  }
}
