import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

export class Database {
  private static isConnected = false;
  private static dbInstance: sqlite3.Database | null = null;

  public static async connect(): Promise<void> {
    if (this.isConnected) return;

    let dbPath = path.resolve(process.cwd(), '../database.sqlite');
    if (fs.existsSync(path.resolve(process.cwd(), 'docker-compose.yml'))) {
      dbPath = path.resolve(process.cwd(), 'database.sqlite');
    }

    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      this.dbInstance = new sqlite3.Database(dbPath, async (err) => {
        if (err) {
          console.error('❌ Failed to open SQLite database:', err.message);
          return reject(err);
        }
        console.log(`[Database] SQLite database opened at: ${dbPath}`);
        this.isConnected = true;
        
        try {
          await this.initializeSchemas();
          console.log('✅ SQLite schemas initialized successfully.');
          resolve();
        } catch (schemaErr) {
          reject(schemaErr);
        }
      });
    });
  }

  /**
   * Returns the raw sqlite3 Database instance, or null if not yet connected.
   * Use this when you need an actual nullable guard (if (!db) return ...).
   * For direct queries, prefer the static Database.run/get/all methods.
   */
  public static getDb(): typeof Database | null {
    if (!this.isConnected || !this.dbInstance) return null;
    return this;
  }

  // Promise-based wrappers for sqlite3
  public static run(sql: string, params: any[] = []): Promise<{ lastID: number; changes: number }> {
    return new Promise((resolve, reject) => {
      if (!this.dbInstance) return reject(new Error('Database not connected'));
      this.dbInstance.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID || 0, changes: this.changes || 0 });
      });
    });
  }

  public static get<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    return new Promise((resolve, reject) => {
      if (!this.dbInstance) return reject(new Error('Database not connected'));
      this.dbInstance.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve((row as T) || null);
      });
    });
  }

  public static all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      if (!this.dbInstance) return reject(new Error('Database not connected'));
      this.dbInstance.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve((rows || []) as T[]);
      });
    });
  }

  public static exec(sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.dbInstance) return reject(new Error('Database not connected'));
      this.dbInstance.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private static async initializeSchemas(): Promise<void> {
    const schemas = [
      `CREATE TABLE IF NOT EXISTS admin_users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        passwordHash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        totpEnabled INTEGER DEFAULT 0,
        totpSecret TEXT,
        recoveryCodes TEXT,
        failedAttempts INTEGER DEFAULT 0,
        lockedUntil TEXT,
        lastLogin TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS guild_configs (
        guildId TEXT PRIMARY KEY,
        modules TEXT NOT NULL,
        globalSettings TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS approvals (
        guildId TEXT PRIMARY KEY,
        guildName TEXT NOT NULL,
        ownerId TEXT,
        ownerUsername TEXT,
        memberCount INTEGER DEFAULT 0,
        botCount INTEGER DEFAULT 0,
        humanCount INTEGER DEFAULT 0,
        verificationLevel INTEGER DEFAULT 0,
        premiumTier INTEGER DEFAULT 0,
        premiumSubscriptionCount INTEGER DEFAULT 0,
        riskScore INTEGER DEFAULT 0,
        riskLevel TEXT,
        status TEXT DEFAULT 'Pending',
        blacklistedBy TEXT,
        blacklistedAt INTEGER,
        approvedBy TEXT,
        approvedAt INTEGER,
        rejectedBy TEXT,
        rejectedAt INTEGER,
        rejectionReason TEXT,
        notes TEXT,
        joinedAt INTEGER,
        lastUpdated INTEGER
      );`,
      `CREATE TABLE IF NOT EXISTS guild_backups (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        guildId TEXT NOT NULL,
        guildName TEXT NOT NULL,
        createdByName TEXT,
        channelsCount INTEGER DEFAULT 0,
        rolesCount INTEGER DEFAULT 0,
        emojisCount INTEGER DEFAULT 0,
        data TEXT NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS upm_snapshots (
        guildId TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        channels TEXT,
        roles TEXT,
        guildSettings TEXT
      );`,
      `CREATE TABLE IF NOT EXISTS guild_warnings (
        guildId TEXT NOT NULL,
        userId TEXT NOT NULL,
        warnings TEXT NOT NULL,
        PRIMARY KEY (guildId, userId)
      );`,
      `CREATE TABLE IF NOT EXISTS guild_verifications (
        guildId TEXT NOT NULL,
        userId TEXT NOT NULL,
        verifiedAt TEXT NOT NULL,
        PRIMARY KEY (guildId, userId)
      );`,
      `CREATE TABLE IF NOT EXISTS guild_afk (
        guildId TEXT NOT NULL,
        userId TEXT NOT NULL,
        reason TEXT,
        timestamp INTEGER NOT NULL,
        PRIMARY KEY (guildId, userId)
      );`,
      `CREATE TABLE IF NOT EXISTS guild_xp (
        guildId TEXT NOT NULL,
        userId TEXT NOT NULL,
        xp INTEGER DEFAULT 0,
        updatedAt TEXT NOT NULL,
        PRIMARY KEY (guildId, userId)
      );`,
      `CREATE TABLE IF NOT EXISTS guild_economy (
        guildId TEXT NOT NULL,
        userId TEXT NOT NULL,
        balance INTEGER DEFAULT 0,
        lastDaily INTEGER DEFAULT 0,
        lastWork INTEGER DEFAULT 0,
        inventory TEXT,
        updatedAt TEXT NOT NULL,
        PRIMARY KEY (guildId, userId)
      );`,
      `CREATE TABLE IF NOT EXISTS discord_sessions (
        discordId TEXT PRIMARY KEY,
        discordUsername TEXT NOT NULL,
        discordAvatar TEXT,
        accessToken TEXT NOT NULL,
        managedGuildIds TEXT NOT NULL,
        loginAt INTEGER NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS public_feed (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        text TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS upm_rollbacks (
        id TEXT PRIMARY KEY,
        roles TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS guild_analytics (
        guildId TEXT NOT NULL,
        date TEXT NOT NULL,
        joins INTEGER DEFAULT 0,
        leaves INTEGER DEFAULT 0,
        messages INTEGER DEFAULT 0,
        voiceMinutes INTEGER DEFAULT 0,
        commands INTEGER DEFAULT 0,
        PRIMARY KEY (guildId, date)
      );`,
      // Persistent sync log store — survives process restarts
      // Max 500 rows per guild enforced by ModuleRegistry on insert.
      `CREATE TABLE IF NOT EXISTS sync_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guildId TEXT NOT NULL,
        time TEXT NOT NULL,
        msg TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'info',
        createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );`,
      `CREATE INDEX IF NOT EXISTS idx_sync_logs_guild ON sync_logs (guildId, id DESC);`,
      // Migration tracking table for future schema changes
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        appliedAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );`,
      // V2 Tickets Tables
      `CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY,
        ticketId TEXT NOT NULL,
        guildId TEXT NOT NULL,
        panelId TEXT NOT NULL,
        panelOptionId TEXT,
        departmentId TEXT,
        categoryId TEXT NOT NULL,
        creatorId TEXT NOT NULL,
        creatorName TEXT NOT NULL,
        creatorAvatar TEXT,
        status TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'medium',
        claimedById TEXT,
        claimedByName TEXT,
        claimedByAvatar TEXT,
        claimedAt INTEGER,
        transferredAt INTEGER,
        transferredFrom TEXT,
        transferredTo TEXT,
        escalatedAt INTEGER,
        escalatedFrom TEXT,
        escalatedTo TEXT,
        reopenedAt INTEGER,
        reopenedCount INTEGER DEFAULT 0,
        ratingValue INTEGER,
        ratingComment TEXT,
        transcriptUrl TEXT,
        messageCount INTEGER DEFAULT 0,
        attachmentCount INTEGER DEFAULT 0,
        participantsJson TEXT,
        modalResponsesJson TEXT,
        workflowState TEXT,
        tagsJson TEXT,
        channelId TEXT,
        threadId TEXT,
        forumId TEXT,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        closedAt INTEGER,
        closedBy TEXT,
        internalNotes TEXT,
        isArchived INTEGER DEFAULT 0,
        isDeleted INTEGER DEFAULT 0
      );`,
      `CREATE INDEX IF NOT EXISTS idx_tickets_guild ON tickets (guildId, status);`,
      `CREATE INDEX IF NOT EXISTS idx_tickets_creator ON tickets (guildId, creatorId);`,
      `CREATE TABLE IF NOT EXISTS ticket_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticketId TEXT NOT NULL,
        messageId TEXT NOT NULL,
        senderId TEXT NOT NULL,
        senderName TEXT NOT NULL,
        senderAvatar TEXT,
        content TEXT NOT NULL,
        embedsJson TEXT,
        attachmentsJson TEXT,
        stickersJson TEXT,
        isEdited INTEGER DEFAULT 0,
        isDeleted INTEGER DEFAULT 0,
        replyToId TEXT,
        mentionsJson TEXT,
        interactionEventJson TEXT,
        isStaff INTEGER DEFAULT 0,
        isInternal INTEGER DEFAULT 0,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY(ticketId) REFERENCES tickets(id) ON DELETE CASCADE
      );`,
      `CREATE INDEX IF NOT EXISTS idx_messages_ticket ON ticket_messages (ticketId);`,
      `CREATE TABLE IF NOT EXISTS ticket_panels (
        id TEXT PRIMARY KEY,
        guildId TEXT NOT NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        version INTEGER DEFAULT 1,
        configJson TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS ticket_panel_history (
        id TEXT PRIMARY KEY,
        panelId TEXT NOT NULL,
        version INTEGER NOT NULL,
        configJson TEXT NOT NULL,
        updatedBy TEXT NOT NULL,
        updatedAt INTEGER NOT NULL,
        FOREIGN KEY(panelId) REFERENCES ticket_panels(id) ON DELETE CASCADE
      );`,
      `CREATE TABLE IF NOT EXISTS member_birthdays (
        guildId TEXT NOT NULL,
        userId TEXT NOT NULL,
        birthday TEXT NOT NULL,
        PRIMARY KEY (guildId, userId)
      );`,
      `CREATE TABLE IF NOT EXISTS guild_prefixes (
        guildId TEXT PRIMARY KEY,
        prefix TEXT NOT NULL,
        updatedAt INTEGER NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS moderation_cases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guildId TEXT NOT NULL,
        caseId INTEGER NOT NULL,
        targetId TEXT NOT NULL,
        targetTag TEXT NOT NULL,
        moderatorId TEXT NOT NULL,
        moderatorTag TEXT NOT NULL,
        action TEXT NOT NULL,
        reason TEXT NOT NULL,
        duration INTEGER,
        expiresAt INTEGER,
        status TEXT DEFAULT 'active',
        createdAt INTEGER NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_mod_cases_guild ON moderation_cases (guildId, caseId DESC);`,
      `CREATE TABLE IF NOT EXISTS persistent_music_queues (
        guildId TEXT PRIMARY KEY,
        channelId TEXT NOT NULL,
        textChannelId TEXT NOT NULL,
        queueJson TEXT NOT NULL,
        loopMode TEXT DEFAULT 'off',
        updatedAt INTEGER NOT NULL
      );`
    ];

    for (const schema of schemas) {
      await this.exec(schema);
    }
  }
}
