import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

// ─────────────────────────────────────────────────────────────────────────────
// Path Resolution — cross-platform, no hardcoded Windows paths.
// Priority:
//   1. DB_PATH env var (absolute or relative to cwd)
//   2. Sibling of cwd (monorepo: cwd = backend/, db = project root)
// ─────────────────────────────────────────────────────────────────────────────
function resolveDatabasePath(): string {
  if (process.env.DB_PATH) {
    return path.resolve(process.cwd(), process.env.DB_PATH);
  }
  // Default: one directory up from backend/ → project root
  return path.resolve(process.cwd(), '..', 'database.sqlite');
}

function resolveBackupDir(): string {
  return path.resolve(path.dirname(resolveDatabasePath()), 'db_backups');
}

export class Database {
  private static isConnected = false;
  private static dbInstance: sqlite3.Database | null = null;
  private static dbPath = '';

  // ───────────────────────────────────────────────────────────────────────────
  // connect() — Full production startup sequence:
  //   1. Resolve & validate path
  //   2. Ensure directory exists with write permission
  //   3. Open database (auto-creates if missing)
  //   4. Enable WAL mode (better concurrency, crash safety)
  //   5. Enable foreign keys
  //   6. Set busy timeout (retry on locked)
  //   7. Run integrity check
  //   8. Backup before schema changes if DB already existed
  //   9. Initialize schemas
  //  10. Verify all critical tables present
  //  11. Validate read/write connectivity
  // ───────────────────────────────────────────────────────────────────────────
  public static async connect(): Promise<void> {
    if (this.isConnected) return;

    this.dbPath = resolveDatabasePath();
    const dir = path.dirname(this.dbPath);

    // Ensure parent directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Verify write permission on directory
    try {
      fs.accessSync(dir, fs.constants.W_OK);
    } catch {
      throw new Error(`[Database] No write permission on directory: ${dir}`);
    }

    const dbExistedBefore = fs.existsSync(this.dbPath);

    await this._openDatabase();

    // Apply PRAGMA settings immediately after open
    await this._applyPragmas();

    // Run integrity check before any writes
    await this._integrityCheck();

    // Backup existing database before any schema mutations
    if (dbExistedBefore) {
      await this._createBackup('pre-schema');
    }

    // Initialize / migrate schemas
    await this.initializeSchemas();
    console.log('[Database] ✅ All schemas initialized.');

    // Verify critical tables are present
    await this._verifyTables();

    // Validate read/write connectivity
    await this._validateConnectivity();

    console.log(`[Database] ✅ SQLite ready at: ${this.dbPath}`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // _openDatabase — opens the SQLite file, retrying up to 3× if locked
  // ───────────────────────────────────────────────────────────────────────────
  private static async _openDatabase(attempt = 1): Promise<void> {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
        if (err) {
          if (err.message?.includes('SQLITE_BUSY') && attempt <= 3) {
            console.warn(`[Database] Locked — retrying (${attempt}/3) in ${attempt * 1000}ms...`);
            setTimeout(() => this._openDatabase(attempt + 1).then(resolve).catch(reject), attempt * 1000);
            return;
          }
          return reject(new Error(`[Database] Failed to open: ${err.message}`));
        }
        this.dbInstance = db;
        this.isConnected = true;
        console.log(`[Database] Opened at: ${this.dbPath}`);
        resolve();
      });
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // _applyPragmas — WAL mode, FK enforcement, busy timeout, cache
  // ───────────────────────────────────────────────────────────────────────────
  private static async _applyPragmas(): Promise<void> {
    // WAL mode: allows concurrent reads while writing; crash-safe
    await this.exec('PRAGMA journal_mode = WAL;');
    // Enforce foreign key constraints
    await this.exec('PRAGMA foreign_keys = ON;');
    // Wait up to 5s before returning SQLITE_BUSY on a locked table
    await this.exec('PRAGMA busy_timeout = 5000;');
    // Increase page cache size for better read performance
    await this.exec('PRAGMA cache_size = -8000;');
    // Synchronous=NORMAL is safe with WAL mode and faster than FULL
    await this.exec('PRAGMA synchronous = NORMAL;');
    // Enables WAL checkpoint to be done automatically
    await this.exec('PRAGMA wal_autocheckpoint = 1000;');
    console.log('[Database] PRAGMAs applied: WAL, FK=ON, busy_timeout=5000ms');
  }


  // ───────────────────────────────────────────────────────────────────────────
  // _integrityCheck — runs PRAGMA integrity_check.
  // If index corruption is detected, attempts a self-healing REINDEX before
  // aborting startup. This handles the common case of an unclean shutdown
  // leaving a stale index entry (e.g. idx_sync_logs_guild wrong # of entries).
  // ───────────────────────────────────────────────────────────────────────────
  private static async _integrityCheck(): Promise<void> {
    let results = await this.all<{ integrity_check: string }>('PRAGMA integrity_check;');
    if (!results || results.length === 0 || results[0].integrity_check !== 'ok') {
      const problems = results.map(r => r.integrity_check).join('; ');
      // Attempt self-healing: REINDEX rebuilds all indexes from table data
      if (problems.toLowerCase().includes('index')) {
        console.warn(`[Database] Index inconsistency detected — attempting REINDEX: ${problems}`);
        await this.exec('REINDEX;');
        results = await this.all<{ integrity_check: string }>('PRAGMA integrity_check;');
        if (results?.[0]?.integrity_check === 'ok') {
          console.log('[Database] REINDEX successful — integrity restored.');
          return;
        }
      }
      throw new Error(`[Database] Integrity check FAILED (unrecoverable): ${problems}`);
    }
    console.log('[Database] Integrity check passed.');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // _createBackup — copies the database file before any schema mutation
  // ───────────────────────────────────────────────────────────────────────────
  private static async _createBackup(label: string): Promise<void> {
    try {
      const backupDir = resolveBackupDir();
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
      const backupPath = path.join(backupDir, `database_${label}_${ts}.sqlite`);
      fs.copyFileSync(this.dbPath, backupPath);
      console.log(`[Database] Backup created: ${backupPath}`);

      // Prune backups older than 7 days to avoid disk fill-up
      this._pruneOldBackups(backupDir, 7);
    } catch (err: any) {
      // Non-fatal: warn but don't abort startup
      console.warn(`[Database] Backup failed (non-fatal): ${err.message}`);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // _pruneOldBackups — deletes backup files older than maxAgeDays
  // ───────────────────────────────────────────────────────────────────────────
  private static _pruneOldBackups(dir: string, maxAgeDays: number): void {
    try {
      const now = Date.now();
      const cutoff = maxAgeDays * 24 * 60 * 60 * 1000;
      const entries = fs.readdirSync(dir);
      for (const file of entries) {
        if (!file.endsWith('.sqlite')) continue;
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (now - stat.mtimeMs > cutoff) {
          fs.unlinkSync(fullPath);
          console.log(`[Database] Pruned old backup: ${file}`);
        }
      }
    } catch { /* Non-fatal */ }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // _verifyTables — confirms all critical tables exist after schema init
  // ───────────────────────────────────────────────────────────────────────────
  private static async _verifyTables(): Promise<void> {
    const critical = [
      'admin_users', 'guild_configs', 'approvals', 'guild_backups',
      'upm_snapshots', 'guild_warnings', 'guild_verifications',
      'guild_xp', 'guild_economy', 'discord_sessions', 'public_feed',
      'sync_logs', 'schema_migrations', 'tickets', 'ticket_messages',
      'ticket_panels', 'moderation_cases', 'persistent_music_queues'
    ];

    const rows = await this.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table';"
    );
    const existing = new Set(rows.map(r => r.name));
    const missing = critical.filter(t => !existing.has(t));

    if (missing.length > 0) {
      throw new Error(`[Database] Missing critical tables after init: ${missing.join(', ')}`);
    }
    console.log(`[Database] All ${critical.length} critical tables verified.`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // _validateConnectivity — confirms the DB can be read from and written to
  // ───────────────────────────────────────────────────────────────────────────
  private static async _validateConnectivity(): Promise<void> {
    // Write test
    await this.exec(`CREATE TABLE IF NOT EXISTS _conn_test (id INTEGER PRIMARY KEY);`);
    await this.run(`INSERT OR REPLACE INTO _conn_test (id) VALUES (1);`);
    // Read test
    const result = await this.get<{ id: number }>(`SELECT id FROM _conn_test WHERE id = 1;`);
    if (!result || result.id !== 1) {
      throw new Error('[Database] Read/write connectivity validation failed.');
    }
    // Cleanup
    await this.exec(`DROP TABLE IF EXISTS _conn_test;`);
    console.log('[Database] Read/write connectivity validated.');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // close() — WAL checkpoint + clean close
  // ───────────────────────────────────────────────────────────────────────────
  public static async close(): Promise<void> {
    if (!this.isConnected || !this.dbInstance) return;

    // Force a WAL checkpoint to flush all pending writes to the main file
    try {
      await this.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    } catch { /* Non-fatal on shutdown */ }

    return new Promise<void>((resolve, reject) => {
      this.dbInstance!.close((err) => {
        if (err) {
          console.error('[Database] Error closing:', err.message);
          return reject(err);
        }
        console.log('[Database] Connection closed cleanly.');
        this.isConnected = false;
        this.dbInstance = null;
        resolve();
      });
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Public API — getDb(), run(), get(), all(), exec()
  // ───────────────────────────────────────────────────────────────────────────
  public static getDb(): typeof Database | null {
    if (!this.isConnected || !this.dbInstance) return null;
    return this;
  }

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

  // ───────────────────────────────────────────────────────────────────────────
  // initializeSchemas — idempotent schema + index creation
  // All statements use CREATE TABLE/INDEX IF NOT EXISTS — safe to re-run
  // ───────────────────────────────────────────────────────────────────────────
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
      `CREATE TABLE IF NOT EXISTS sync_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guildId TEXT NOT NULL,
        time TEXT NOT NULL,
        msg TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'info',
        createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );`,
      `CREATE INDEX IF NOT EXISTS idx_sync_logs_guild ON sync_logs (guildId, id DESC);`,
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        appliedAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );`,
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
      );`,
    ];

    for (const schema of schemas) {
      await this.exec(schema);
    }
  }
}
