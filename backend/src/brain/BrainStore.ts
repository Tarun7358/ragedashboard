/**
 * BrainStore — Rage Brain SQLite Layer
 *
 * Manages all brain_* tables. Deliberately isolated from the core
 * Database class to ensure zero risk of interference with production tables.
 * All methods are fire-and-forget safe (never throw to callers).
 */

import { Database } from '../core/Database.js';

export interface BrainEventRow {
  id: string;
  guildId: string;
  eventType: string;
  actorId: string;
  targetId: string | null;
  timestamp: number;

  // Velocity features
  actorEventRate_10s: number;
  actorEventRate_60s: number;
  guildEventRate_10s: number;
  actorBanRate: number;
  actorRoleDeleteRate: number;
  actorChannelDeleteRate: number;

  // Actor profile snapshot
  actorIsOwner: number;       // 0 | 1
  actorIsBot: number;
  actorAccountAgeDays: number;
  actorJoinedGuildDays: number;
  actorHighestRolePosition: number;
  actorWhitelisted: number;
  actorPreviousFlags: number;

  // Raw event-specific feature blob
  eventFeatures: string;      // JSON

  // Labels
  label: 'benign' | 'suspicious' | 'attack' | 'unlabeled';
  labelConfidence: number;
  attackSessionId: string | null;
  labelledAt: number | null;
  labelSource: 'auto' | 'antinuke_trigger' | 'manual';
}

export interface BrainActorProfileRow {
  guildId: string;
  actorId: string;
  totalEvents: number;
  totalFlags: number;
  totalConfirmedAttacks: number;
  lastSeen: number;
  riskScore: number;
  behaviorVector: string; // JSON
  updatedAt: number;
}

export interface BrainAttackSessionRow {
  id: string;
  guildId: string;
  startedAt: number;
  endedAt: number | null;
  attackerIds: string;   // JSON array
  eventTypes: string;    // JSON array
  outcome: string | null;
  eventCount: number;
  severity: string;
}

export class BrainStore {

  // ─── Schema Initialization ──────────────────────────────────────────────────

  public static async initSchemas(): Promise<void> {
    const db = Database.getDb();
    if (!db) return;

    const schemas = [
      `CREATE TABLE IF NOT EXISTS brain_events (
        id TEXT PRIMARY KEY,
        guildId TEXT NOT NULL,
        eventType TEXT NOT NULL,
        actorId TEXT NOT NULL,
        targetId TEXT,
        timestamp INTEGER NOT NULL,
        actorEventRate_10s REAL DEFAULT 0,
        actorEventRate_60s REAL DEFAULT 0,
        guildEventRate_10s REAL DEFAULT 0,
        actorBanRate REAL DEFAULT 0,
        actorRoleDeleteRate REAL DEFAULT 0,
        actorChannelDeleteRate REAL DEFAULT 0,
        actorIsOwner INTEGER DEFAULT 0,
        actorIsBot INTEGER DEFAULT 0,
        actorAccountAgeDays REAL DEFAULT 0,
        actorJoinedGuildDays REAL DEFAULT 0,
        actorHighestRolePosition INTEGER DEFAULT 0,
        actorWhitelisted INTEGER DEFAULT 0,
        actorPreviousFlags INTEGER DEFAULT 0,
        eventFeatures TEXT DEFAULT '{}',
        label TEXT DEFAULT 'unlabeled',
        labelConfidence REAL DEFAULT 0,
        attackSessionId TEXT,
        labelledAt INTEGER,
        labelSource TEXT DEFAULT 'auto'
      );`,
      `CREATE INDEX IF NOT EXISTS idx_brain_events_guild ON brain_events (guildId, timestamp DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_brain_events_actor ON brain_events (actorId, timestamp DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_brain_events_label ON brain_events (label);`,
      `CREATE INDEX IF NOT EXISTS idx_brain_events_type ON brain_events (eventType, timestamp DESC);`,

      `CREATE TABLE IF NOT EXISTS brain_actor_profiles (
        guildId TEXT NOT NULL,
        actorId TEXT NOT NULL,
        totalEvents INTEGER DEFAULT 0,
        totalFlags INTEGER DEFAULT 0,
        totalConfirmedAttacks INTEGER DEFAULT 0,
        lastSeen INTEGER NOT NULL,
        riskScore REAL DEFAULT 0.0,
        behaviorVector TEXT DEFAULT '{}',
        updatedAt INTEGER NOT NULL,
        PRIMARY KEY (guildId, actorId)
      );`,

      `CREATE TABLE IF NOT EXISTS brain_attack_sessions (
        id TEXT PRIMARY KEY,
        guildId TEXT NOT NULL,
        startedAt INTEGER NOT NULL,
        endedAt INTEGER,
        attackerIds TEXT NOT NULL,
        eventTypes TEXT NOT NULL,
        outcome TEXT,
        eventCount INTEGER DEFAULT 0,
        severity TEXT DEFAULT 'unknown'
      );`,
      `CREATE INDEX IF NOT EXISTS idx_brain_sessions_guild ON brain_attack_sessions (guildId, startedAt DESC);`,

      `CREATE TABLE IF NOT EXISTS brain_training_exports (
        id TEXT PRIMARY KEY,
        exportedAt INTEGER NOT NULL,
        recordCount INTEGER NOT NULL,
        filePath TEXT,
        format TEXT DEFAULT 'jsonl',
        labelFilter TEXT
      );`,

      // Nightly purge tracking
      `CREATE TABLE IF NOT EXISTS brain_purge_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guildId TEXT,
        purgedAt INTEGER NOT NULL,
        recordsDeleted INTEGER DEFAULT 0,
        reason TEXT DEFAULT 'retention_policy'
      );`
    ];

    for (const sql of schemas) {
      await Database.exec(sql).catch((err) => {
        console.error('[BrainStore] Schema init error:', err.message);
      });
    }

    console.log('[BrainStore] Brain schemas initialized.');
  }

  // ─── Event Ingestion ────────────────────────────────────────────────────────

  public static async insertEvent(row: BrainEventRow): Promise<void> {
    const db = Database.getDb();
    if (!db) return;

    await Database.run(
      `INSERT OR IGNORE INTO brain_events (
        id, guildId, eventType, actorId, targetId, timestamp,
        actorEventRate_10s, actorEventRate_60s, guildEventRate_10s,
        actorBanRate, actorRoleDeleteRate, actorChannelDeleteRate,
        actorIsOwner, actorIsBot, actorAccountAgeDays, actorJoinedGuildDays,
        actorHighestRolePosition, actorWhitelisted, actorPreviousFlags,
        eventFeatures, label, labelConfidence, attackSessionId, labelledAt, labelSource
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        row.id, row.guildId, row.eventType, row.actorId, row.targetId ?? null, row.timestamp,
        row.actorEventRate_10s, row.actorEventRate_60s, row.guildEventRate_10s,
        row.actorBanRate, row.actorRoleDeleteRate, row.actorChannelDeleteRate,
        row.actorIsOwner, row.actorIsBot, row.actorAccountAgeDays, row.actorJoinedGuildDays,
        row.actorHighestRolePosition, row.actorWhitelisted, row.actorPreviousFlags,
        row.eventFeatures, row.label, row.labelConfidence,
        row.attackSessionId ?? null, row.labelledAt ?? null, row.labelSource
      ]
    ).catch((err) => {
      console.error('[BrainStore] insertEvent error:', err.message);
    });
  }

  // ─── Actor Profile UPSERT ───────────────────────────────────────────────────

  public static async upsertActorProfile(guildId: string, actorId: string, updates: Partial<BrainActorProfileRow>): Promise<void> {
    const db = Database.getDb();
    if (!db) return;

    const now = Date.now();
    const existing = await Database.get<BrainActorProfileRow>(
      `SELECT * FROM brain_actor_profiles WHERE guildId = ? AND actorId = ?`,
      [guildId, actorId]
    ).catch(() => null);

    if (!existing) {
      await Database.run(
        `INSERT INTO brain_actor_profiles
          (guildId, actorId, totalEvents, totalFlags, totalConfirmedAttacks, lastSeen, riskScore, behaviorVector, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          guildId, actorId,
          updates.totalEvents ?? 1,
          updates.totalFlags ?? 0,
          updates.totalConfirmedAttacks ?? 0,
          updates.lastSeen ?? now,
          updates.riskScore ?? 0.0,
          updates.behaviorVector ?? '{}',
          now
        ]
      ).catch(() => {});
    } else {
      await Database.run(
        `UPDATE brain_actor_profiles SET
          totalEvents = totalEvents + ?,
          totalFlags = totalFlags + ?,
          totalConfirmedAttacks = totalConfirmedAttacks + ?,
          lastSeen = ?,
          riskScore = ?,
          behaviorVector = ?,
          updatedAt = ?
        WHERE guildId = ? AND actorId = ?`,
        [
          updates.totalEvents ?? 0,
          updates.totalFlags ?? 0,
          updates.totalConfirmedAttacks ?? 0,
          updates.lastSeen ?? now,
          updates.riskScore ?? existing.riskScore,
          updates.behaviorVector ?? existing.behaviorVector,
          now,
          guildId, actorId
        ]
      ).catch(() => {});
    }
  }

  // ─── Attack Sessions ────────────────────────────────────────────────────────

  public static async createAttackSession(session: BrainAttackSessionRow): Promise<void> {
    const db = Database.getDb();
    if (!db) return;

    await Database.run(
      `INSERT OR REPLACE INTO brain_attack_sessions
        (id, guildId, startedAt, endedAt, attackerIds, eventTypes, outcome, eventCount, severity)
        VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        session.id, session.guildId, session.startedAt, session.endedAt ?? null,
        session.attackerIds, session.eventTypes, session.outcome ?? null,
        session.eventCount, session.severity
      ]
    ).catch(() => {});
  }

  // ─── Labeling ───────────────────────────────────────────────────────────────

  public static async labelEventsByActor(
    guildId: string,
    actorId: string,
    sinceTimestamp: number,
    label: 'attack' | 'suspicious' | 'benign',
    confidence: number,
    sessionId: string,
    source: 'auto' | 'antinuke_trigger' | 'manual'
  ): Promise<number> {
    const db = Database.getDb();
    if (!db) return 0;

    const result = await Database.run(
      `UPDATE brain_events
        SET label = ?, labelConfidence = ?, attackSessionId = ?, labelledAt = ?, labelSource = ?
        WHERE guildId = ? AND actorId = ? AND timestamp >= ? AND label = 'unlabeled'`,
      [label, confidence, sessionId, Date.now(), source, guildId, actorId, sinceTimestamp]
    ).catch(() => null);

    return result?.changes ?? 0;
  }

  // ─── Velocity Queries (used by FeatureExtractor) ────────────────────────────

  public static async getActorEventCount(actorId: string, guildId: string, windowMs: number): Promise<number> {
    const since = Date.now() - windowMs;
    const row = await Database.get<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM brain_events WHERE actorId = ? AND guildId = ? AND timestamp >= ?`,
      [actorId, guildId, since]
    ).catch(() => null);
    return row?.cnt ?? 0;
  }

  public static async getActorEventTypeCount(actorId: string, guildId: string, eventType: string, windowMs: number): Promise<number> {
    const since = Date.now() - windowMs;
    const row = await Database.get<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM brain_events WHERE actorId = ? AND guildId = ? AND eventType = ? AND timestamp >= ?`,
      [actorId, guildId, eventType, since]
    ).catch(() => null);
    return row?.cnt ?? 0;
  }

  public static async getGuildEventCount(guildId: string, windowMs: number): Promise<number> {
    const since = Date.now() - windowMs;
    const row = await Database.get<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM brain_events WHERE guildId = ? AND timestamp >= ?`,
      [guildId, since]
    ).catch(() => null);
    return row?.cnt ?? 0;
  }

  public static async getActorPreviousFlags(actorId: string, guildId: string): Promise<number> {
    const row = await Database.get<{ totalFlags: number }>(
      `SELECT totalFlags FROM brain_actor_profiles WHERE actorId = ? AND guildId = ?`,
      [actorId, guildId]
    ).catch(() => null);
    return row?.totalFlags ?? 0;
  }

  // ─── Stats & Reads ──────────────────────────────────────────────────────────

  public static async getStats(guildId?: string): Promise<{
    totalEvents: number;
    labeledAttack: number;
    labeledBenign: number;
    labeledSuspicious: number;
    unlabeled: number;
    attackSessions: number;
    uniqueActors: number;
  }> {
    const where = guildId ? `WHERE guildId = '${guildId}'` : '';

    const [totRow, attackRow, benignRow, suspRow, unlabeledRow, sessRow, actorRow] = await Promise.all([
      Database.get<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM brain_events ${where}`),
      Database.get<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM brain_events ${where ? where + " AND label = 'attack'" : "WHERE label = 'attack'"}`),
      Database.get<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM brain_events ${where ? where + " AND label = 'benign'" : "WHERE label = 'benign'"}`),
      Database.get<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM brain_events ${where ? where + " AND label = 'suspicious'" : "WHERE label = 'suspicious'"}`),
      Database.get<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM brain_events ${where ? where + " AND label = 'unlabeled'" : "WHERE label = 'unlabeled'"}`),
      Database.get<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM brain_attack_sessions ${where}`),
      Database.get<{ cnt: number }>(`SELECT COUNT(DISTINCT actorId) as cnt FROM brain_events ${where}`)
    ]).catch(() => Array(7).fill(null));

    return {
      totalEvents: (totRow as any)?.cnt ?? 0,
      labeledAttack: (attackRow as any)?.cnt ?? 0,
      labeledBenign: (benignRow as any)?.cnt ?? 0,
      labeledSuspicious: (suspRow as any)?.cnt ?? 0,
      unlabeled: (unlabeledRow as any)?.cnt ?? 0,
      attackSessions: (sessRow as any)?.cnt ?? 0,
      uniqueActors: (actorRow as any)?.cnt ?? 0
    };
  }

  public static async getActorProfile(guildId: string, actorId: string): Promise<BrainActorProfileRow | null> {
    return Database.get<BrainActorProfileRow>(
      `SELECT * FROM brain_actor_profiles WHERE guildId = ? AND actorId = ?`,
      [guildId, actorId]
    ).catch(() => null);
  }

  public static async getRecentSessions(guildId: string, limit = 10): Promise<BrainAttackSessionRow[]> {
    return Database.all<BrainAttackSessionRow>(
      `SELECT * FROM brain_attack_sessions WHERE guildId = ? ORDER BY startedAt DESC LIMIT ?`,
      [guildId, limit]
    ).catch(() => []);
  }

  public static async getExportableEvents(labelFilter?: string, limit = 50000): Promise<BrainEventRow[]> {
    const where = labelFilter ? `WHERE label = ?` : `WHERE label != 'unlabeled'`;
    const params: any[] = labelFilter ? [labelFilter, limit] : [limit];
    return Database.all<BrainEventRow>(
      `SELECT * FROM brain_events ${where} ORDER BY timestamp DESC LIMIT ?`,
      params
    ).catch(() => []);
  }

  public static async recordExport(id: string, recordCount: number, filePath: string, format: string, labelFilter?: string): Promise<void> {
    await Database.run(
      `INSERT INTO brain_training_exports (id, exportedAt, recordCount, filePath, format, labelFilter) VALUES (?,?,?,?,?,?)`,
      [id, Date.now(), recordCount, filePath, format, labelFilter ?? null]
    ).catch(() => {});
  }

  // ─── Data Retention — purge events older than maxAgeDays ───────────────────

  public static async runRetentionPurge(maxAgeDays = 90, guildId?: string): Promise<number> {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    const where = guildId
      ? `WHERE timestamp < ? AND guildId = ?`
      : `WHERE timestamp < ?`;
    const params = guildId ? [cutoff, guildId] : [cutoff];

    const result = await Database.run(
      `DELETE FROM brain_events ${where}`, params
    ).catch(() => null);

    const deleted = result?.changes ?? 0;

    await Database.run(
      `INSERT INTO brain_purge_log (guildId, purgedAt, recordsDeleted, reason) VALUES (?,?,?,?)`,
      [guildId ?? null, Date.now(), deleted, guildId ? 'manual_guild_purge' : 'retention_policy']
    ).catch(() => {});

    return deleted;
  }

  // ─── Full Guild Purge (GDPR) ────────────────────────────────────────────────

  public static async purgeGuild(guildId: string): Promise<{ events: number; actors: number; sessions: number }> {
    const [evtResult, actorResult, sessResult] = await Promise.all([
      Database.run(`DELETE FROM brain_events WHERE guildId = ?`, [guildId]).catch(() => null),
      Database.run(`DELETE FROM brain_actor_profiles WHERE guildId = ?`, [guildId]).catch(() => null),
      Database.run(`DELETE FROM brain_attack_sessions WHERE guildId = ?`, [guildId]).catch(() => null)
    ]);

    await Database.run(
      `INSERT INTO brain_purge_log (guildId, purgedAt, recordsDeleted, reason) VALUES (?,?,?,?)`,
      [guildId, Date.now(), (evtResult?.changes ?? 0) + (actorResult?.changes ?? 0) + (sessResult?.changes ?? 0), 'manual_guild_purge']
    ).catch(() => {});

    return {
      events: evtResult?.changes ?? 0,
      actors: actorResult?.changes ?? 0,
      sessions: sessResult?.changes ?? 0
    };
  }
}
