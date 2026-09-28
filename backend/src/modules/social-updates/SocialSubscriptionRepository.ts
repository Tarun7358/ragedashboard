/**
 * Social Updates Module — SocialSubscriptionRepository
 *
 * All database operations for social_subscriptions, social_content_cache,
 * and social_audit_logs tables.
 */

import { Database } from '../../core/Database.js';

export interface SocialSubscription {
  id: string;
  guildId: string;
  provider: string;               // 'youtube' | 'instagram'
  sourceId: string;               // YouTube channel ID or IG username
  sourceName: string;
  sourceAvatar?: string;
  discordChannelId: string;
  embedConfig: string;            // JSON serialized EmbedConfig
  notificationTemplate?: string; // Plain text before embed
  mentionRoles: string;           // JSON array of role IDs
  pollingMode: string;            // 'fast' | 'normal' | 'slow'
  contentTypes: string;           // JSON: {videos, shorts, streams, premieres, posts, reels, stories}
  enabled: number;                // 0 | 1
  lastProcessedId?: string;
  lastSyncTimestamp?: string;
  failedAttempts: number;
  lastError?: string;
  validationStatus: string;       // 'valid' | 'invalid'
  validationError?: string;
  totalNotificationsSent: number;
  totalDeliveryTimeMs: number;    // For average calculation
  authCredential?: string;        // Encrypted user-specific Instagram session_id / token (AES-256-GCM)
  createdAt: string;
  updatedAt: string;
}

export interface SocialContentCache {
  id: string;
  provider: string;
  sourceId: string;
  contentType: string;
  publishedAt: string;
  expiresAt?: string;
  createdAt: string;
}

export interface SocialAuditLog {
  id: string;
  guildId?: string;
  provider?: string;
  sourceId?: string;
  action: string;
  details?: string;
  createdAt: string;
}

export class SocialSubscriptionRepository {
  static async ensureTable(): Promise<void> {
    // 1. Create subscriptions table
    await Database.exec(`
      CREATE TABLE IF NOT EXISTS social_subscriptions (
        id TEXT PRIMARY KEY,
        guildId TEXT NOT NULL,
        provider TEXT NOT NULL,
        sourceId TEXT NOT NULL,
        sourceName TEXT NOT NULL DEFAULT '',
        sourceAvatar TEXT,
        discordChannelId TEXT NOT NULL,
        embedConfig TEXT NOT NULL DEFAULT '{}',
        notificationTemplate TEXT,
        mentionRoles TEXT NOT NULL DEFAULT '[]',
        pollingMode TEXT NOT NULL DEFAULT 'normal',
        contentTypes TEXT NOT NULL DEFAULT '{"videos":true,"shorts":true,"streams":true,"premieres":true,"communityPosts":false,"posts":true,"reels":true,"carousels":true,"stories":false}',
        enabled INTEGER NOT NULL DEFAULT 1,
        lastProcessedId TEXT,
        lastSyncTimestamp TEXT,
        failedAttempts INTEGER NOT NULL DEFAULT 0,
        lastError TEXT,
        validationStatus TEXT NOT NULL DEFAULT 'valid',
        validationError TEXT,
        totalNotificationsSent INTEGER NOT NULL DEFAULT 0,
        totalDeliveryTimeMs INTEGER NOT NULL DEFAULT 0,
        authCredential TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `);

    // 2. Add columns if upgrading from old schema (guarded to avoid telemetry-intercepted SQLite errors)
    const tableInfo = await Database.all(`PRAGMA table_info(social_subscriptions)`).catch(() => []);
    const columnNames = (tableInfo || []).map((col: any) => col.name);

    if (!columnNames.includes('validationStatus')) {
      await Database.exec(`
        ALTER TABLE social_subscriptions ADD COLUMN validationStatus TEXT NOT NULL DEFAULT 'valid'
      `).catch(() => {});
    }

    if (!columnNames.includes('validationError')) {
      await Database.exec(`
        ALTER TABLE social_subscriptions ADD COLUMN validationError TEXT
      `).catch(() => {});
    }

    if (!columnNames.includes('authCredential')) {
      await Database.exec(`
        ALTER TABLE social_subscriptions ADD COLUMN authCredential TEXT
      `).catch(() => {});
    }

    await Database.exec(`
      CREATE INDEX IF NOT EXISTS idx_social_guild ON social_subscriptions (guildId)
    `).catch(() => {});

    // 3. Create content cache table
    await Database.exec(`
      CREATE TABLE IF NOT EXISTS social_content_cache (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        sourceId TEXT NOT NULL,
        contentType TEXT NOT NULL,
        publishedAt TEXT NOT NULL,
        expiresAt TEXT,
        createdAt TEXT NOT NULL
      )
    `);

    await Database.exec(`
      CREATE INDEX IF NOT EXISTS idx_social_cache_source ON social_content_cache (sourceId, provider)
    `).catch(() => {});

    // 4. Create audit logs table
    await Database.exec(`
      CREATE TABLE IF NOT EXISTS social_audit_logs (
        id TEXT PRIMARY KEY,
        guildId TEXT,
        provider TEXT,
        sourceId TEXT,
        action TEXT NOT NULL,
        details TEXT,
        createdAt TEXT NOT NULL
      )
    `);

    await Database.exec(`
      CREATE INDEX IF NOT EXISTS idx_social_logs_guild ON social_audit_logs (guildId)
    `).catch(() => {});
  }

  static async findAll(guildId: string): Promise<SocialSubscription[]> {
    return Database.all<SocialSubscription>(
      'SELECT * FROM social_subscriptions WHERE guildId = ? ORDER BY createdAt ASC',
      [guildId]
    );
  }

  static async findByProvider(guildId: string, provider: string): Promise<SocialSubscription[]> {
    return Database.all<SocialSubscription>(
      'SELECT * FROM social_subscriptions WHERE guildId = ? AND provider = ? ORDER BY createdAt ASC',
      [guildId, provider]
    );
  }

  static async findById(id: string): Promise<SocialSubscription | null> {
    return Database.get<SocialSubscription>(
      'SELECT * FROM social_subscriptions WHERE id = ?',
      [id]
    );
  }

  static async findAllEnabled(): Promise<SocialSubscription[]> {
    return Database.all<SocialSubscription>(
      'SELECT * FROM social_subscriptions WHERE enabled = 1'
    );
  }

  static async findBySourceId(guildId: string, provider: string, sourceId: string): Promise<SocialSubscription | null> {
    return Database.get<SocialSubscription>(
      'SELECT * FROM social_subscriptions WHERE guildId = ? AND provider = ? AND sourceId = ?',
      [guildId, provider, sourceId]
    );
  }

  static async insert(sub: Omit<SocialSubscription, 'failedAttempts' | 'totalNotificationsSent' | 'totalDeliveryTimeMs' | 'validationStatus' | 'validationError'>): Promise<void> {
    const now = new Date().toISOString();
    await Database.run(
      `INSERT INTO social_subscriptions (
        id, guildId, provider, sourceId, sourceName, sourceAvatar,
        discordChannelId, embedConfig, notificationTemplate, mentionRoles,
        pollingMode, contentTypes, enabled,
        lastProcessedId, lastSyncTimestamp, failedAttempts, lastError,
        validationStatus, validationError,
        totalNotificationsSent, totalDeliveryTimeMs, authCredential, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, null, 'valid', null, 0, 0, ?, ?, ?)`,
      [
        sub.id, sub.guildId, sub.provider, sub.sourceId, sub.sourceName,
        sub.sourceAvatar || null, sub.discordChannelId,
        sub.embedConfig, sub.notificationTemplate || null,
        sub.mentionRoles, sub.pollingMode, sub.contentTypes,
        sub.enabled ? 1 : 0, sub.lastProcessedId || null,
        sub.lastSyncTimestamp || null, sub.authCredential || null, now, now
      ]
    );
  }

  static async update(id: string, fields: Partial<SocialSubscription>): Promise<void> {
    const now = new Date().toISOString();
    const setClauses: string[] = [];
    const params: any[] = [];

    const allowed = [
      'discordChannelId', 'embedConfig', 'notificationTemplate', 'mentionRoles',
      'pollingMode', 'contentTypes', 'enabled', 'lastProcessedId',
      'lastSyncTimestamp', 'failedAttempts', 'lastError', 'validationStatus', 'validationError',
      'totalNotificationsSent', 'totalDeliveryTimeMs', 'sourceName', 'sourceAvatar', 'authCredential'
    ];

    for (const key of allowed) {
      if (fields[key as keyof SocialSubscription] !== undefined) {
        setClauses.push(`${key} = ?`);
        params.push(fields[key as keyof SocialSubscription]);
      }
    }

    if (setClauses.length === 0) return;

    setClauses.push('updatedAt = ?');
    params.push(now);
    params.push(id);

    await Database.run(
      `UPDATE social_subscriptions SET ${setClauses.join(', ')} WHERE id = ?`,
      params
    );
  }

  static async recordSuccess(id: string, newLastId: string, deliveryTimeMs: number): Promise<void> {
    const now = new Date().toISOString();
    await Database.run(
      `UPDATE social_subscriptions 
       SET lastProcessedId = ?, lastSyncTimestamp = ?, failedAttempts = 0, lastError = null,
           totalNotificationsSent = totalNotificationsSent + 1,
           totalDeliveryTimeMs = totalDeliveryTimeMs + ?,
           updatedAt = ?
       WHERE id = ?`,
      [newLastId, now, deliveryTimeMs, now, id]
    );
  }

  static async recordFailure(id: string, error: string): Promise<void> {
    const now = new Date().toISOString();
    await Database.run(
      `UPDATE social_subscriptions 
       SET failedAttempts = failedAttempts + 1, lastError = ?, lastSyncTimestamp = ?, updatedAt = ?
       WHERE id = ?`,
      [error.substring(0, 500), now, now, id]
    );
  }

  static async delete(id: string): Promise<void> {
    await Database.run('DELETE FROM social_subscriptions WHERE id = ?', [id]);
  }

  static async getAnalytics(guildId: string): Promise<{
    totalSubscriptions: number;
    activeSubscriptions: number;
    totalNotificationsSent: number;
    totalFailedAttempts: number;
    avgDeliveryTimeMs: number;
    byProvider: Record<string, number>;
  }> {
    const subs = await this.findAll(guildId);

    const totalNotifications = subs.reduce((s, x) => s + (x.totalNotificationsSent || 0), 0);
    const totalDelivery = subs.reduce((s, x) => s + (x.totalDeliveryTimeMs || 0), 0);
    const totalFailed = subs.reduce((s, x) => s + (x.failedAttempts || 0), 0);
    const byProvider: Record<string, number> = {};
    for (const sub of subs) {
      byProvider[sub.provider] = (byProvider[sub.provider] || 0) + 1;
    }

    return {
      totalSubscriptions: subs.length,
      activeSubscriptions: subs.filter(s => s.enabled).length,
      totalNotificationsSent: totalNotifications,
      totalFailedAttempts: totalFailed,
      avgDeliveryTimeMs: totalNotifications > 0 ? Math.round(totalDelivery / totalNotifications) : 0,
      byProvider
    };
  }

  // ─── CACHE ENGINE OPERATIONS ──────────────────────────────────────────────────

  static async getCache(provider: string, sourceId: string): Promise<SocialContentCache[]> {
    return Database.all<SocialContentCache>(
      'SELECT * FROM social_content_cache WHERE provider = ? AND sourceId = ? ORDER BY publishedAt DESC',
      [provider, sourceId]
    );
  }

  static async insertCache(item: SocialContentCache): Promise<void> {
    await Database.run(
      `INSERT OR REPLACE INTO social_content_cache (
        id, provider, sourceId, contentType, publishedAt, expiresAt, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [item.id, item.provider, item.sourceId, item.contentType, item.publishedAt, item.expiresAt || null, item.createdAt]
    );
  }

  static async clearExpiredCache(): Promise<void> {
    const now = new Date().toISOString();
    await Database.run(
      'DELETE FROM social_content_cache WHERE expiresAt IS NOT NULL AND expiresAt < ?',
      [now]
    );
  }

  // ─── AUDIT LOGGING OPERATIONS ─────────────────────────────────────────────────

  static async insertAuditLog(log: Omit<SocialAuditLog, 'id' | 'createdAt'>): Promise<void> {
    const id = `sal_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();
    await Database.run(
      `INSERT INTO social_audit_logs (
        id, guildId, provider, sourceId, action, details, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, log.guildId || null, log.provider || null, log.sourceId || null, log.action, log.details || null, now]
    );
  }

  static async getAuditLogs(guildId: string, limit = 50): Promise<SocialAuditLog[]> {
    return Database.all<SocialAuditLog>(
      'SELECT * FROM social_audit_logs WHERE guildId = ? ORDER BY createdAt DESC LIMIT ?',
      [guildId, limit]
    );
  }
}
