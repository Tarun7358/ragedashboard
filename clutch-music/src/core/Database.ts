import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

// ─────────────────────────────────────────────────────────────────────────────
// Path Resolution — cross-platform, no hardcoded Windows paths.
// Priority:
//   1. DB_PATH env var (absolute or relative to cwd)
//   2. Sibling of cwd (monorepo: cwd = clutch-music/, db = project root)
// ─────────────────────────────────────────────────────────────────────────────
function resolveDatabasePath(): string {
  if (process.env.DB_PATH) {
    return path.resolve(process.cwd(), process.env.DB_PATH);
  }
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
  // connect() — Full production startup sequence
  // ───────────────────────────────────────────────────────────────────────────
  public static async connect(): Promise<void> {
    if (this.isConnected) return;

    this.dbPath = resolveDatabasePath();
    const dir = path.dirname(this.dbPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    try {
      fs.accessSync(dir, fs.constants.W_OK);
    } catch {
      throw new Error(`[Music DB] No write permission on directory: ${dir}`);
    }

    const dbExistedBefore = fs.existsSync(this.dbPath);

    await this._openDatabase();
    await this._applyPragmas();
    await this._integrityCheck();

    if (dbExistedBefore) {
      await this._createBackup('pre-schema');
    }

    await this.initializeSchemas();
    console.log('[Music DB] ✅ All schemas initialized.');

    await this._verifyTables();
    await this._validateConnectivity();

    console.log(`[Music DB] ✅ SQLite ready at: ${this.dbPath}`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // _openDatabase — opens the file, retrying up to 3× if locked
  // ───────────────────────────────────────────────────────────────────────────
  private static async _openDatabase(attempt = 1): Promise<void> {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
        if (err) {
          if (err.message?.includes('SQLITE_BUSY') && attempt <= 3) {
            console.warn(`[Music DB] Locked — retrying (${attempt}/3) in ${attempt * 1000}ms...`);
            setTimeout(() => this._openDatabase(attempt + 1).then(resolve).catch(reject), attempt * 1000);
            return;
          }
          return reject(new Error(`[Music DB] Failed to open: ${err.message}`));
        }
        this.dbInstance = db;
        this.isConnected = true;
        console.log(`[Music DB] Opened at: ${this.dbPath}`);
        resolve();
      });
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // _applyPragmas — WAL, FK, busy timeout, cache, synchronous
  // ───────────────────────────────────────────────────────────────────────────
  private static async _applyPragmas(): Promise<void> {
    await this.exec('PRAGMA journal_mode = WAL;');
    await this.exec('PRAGMA foreign_keys = ON;');
    await this.exec('PRAGMA busy_timeout = 5000;');
    await this.exec('PRAGMA cache_size = -4000;');
    await this.exec('PRAGMA synchronous = NORMAL;');
    await this.exec('PRAGMA wal_autocheckpoint = 1000;');
    console.log('[Music DB] PRAGMAs applied: WAL, FK=ON, busy_timeout=5000ms');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // _integrityCheck — runs PRAGMA integrity_check with self-healing REINDEX
  // ───────────────────────────────────────────────────────────────────────────
  private static async _integrityCheck(): Promise<void> {
    let results = await this.all<{ integrity_check: string }>('PRAGMA integrity_check;');
    if (!results || results.length === 0 || results[0].integrity_check !== 'ok') {
      const problems = results.map(r => r.integrity_check).join('; ');
      if (problems.toLowerCase().includes('index')) {
        console.warn(`[Music DB] Index inconsistency — attempting REINDEX: ${problems}`);
        await this.exec('REINDEX;');
        results = await this.all<{ integrity_check: string }>('PRAGMA integrity_check;');
        if (results?.[0]?.integrity_check === 'ok') {
          console.log('[Music DB] REINDEX successful — integrity restored.');
          return;
        }
      }
      throw new Error(`[Music DB] Integrity check FAILED (unrecoverable): ${problems}`);
    }
    console.log('[Music DB] Integrity check passed.');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // _createBackup — copy DB before schema mutations
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
      console.log(`[Music DB] Backup created: ${backupPath}`);
      this._pruneOldBackups(backupDir, 7);
    } catch (err: any) {
      console.warn(`[Music DB] Backup failed (non-fatal): ${err.message}`);
    }
  }

  private static _pruneOldBackups(dir: string, maxAgeDays: number): void {
    try {
      const now = Date.now();
      const cutoff = maxAgeDays * 24 * 60 * 60 * 1000;
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.sqlite')) continue;
        const fp = path.join(dir, file);
        if (now - fs.statSync(fp).mtimeMs > cutoff) {
          fs.unlinkSync(fp);
          console.log(`[Music DB] Pruned old backup: ${file}`);
        }
      }
    } catch { /* Non-fatal */ }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // _verifyTables — confirms all critical tables exist
  // ───────────────────────────────────────────────────────────────────────────
  private static async _verifyTables(): Promise<void> {
    const critical = [
      'admin_users', 'guild_configs', 'guild_xp', 'guild_economy',
      'discord_sessions', 'music_247', 'sync_logs'
    ];
    const rows = await this.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table';"
    );
    const existing = new Set(rows.map(r => r.name));
    const missing = critical.filter(t => !existing.has(t));
    if (missing.length > 0) {
      throw new Error(`[Music DB] Missing critical tables: ${missing.join(', ')}`);
    }
    console.log(`[Music DB] All ${critical.length} critical tables verified.`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // _validateConnectivity — confirms actual read/write operations work
  // ───────────────────────────────────────────────────────────────────────────
  private static async _validateConnectivity(): Promise<void> {
    await this.exec(`CREATE TABLE IF NOT EXISTS _conn_test (id INTEGER PRIMARY KEY);`);
    await this.run(`INSERT OR REPLACE INTO _conn_test (id) VALUES (1);`);
    const result = await this.get<{ id: number }>(`SELECT id FROM _conn_test WHERE id = 1;`);
    if (!result || result.id !== 1) {
      throw new Error('[Music DB] Read/write connectivity validation failed.');
    }
    await this.exec(`DROP TABLE IF EXISTS _conn_test;`);
    console.log('[Music DB] Read/write connectivity validated.');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // close() — WAL checkpoint + clean close
  // ───────────────────────────────────────────────────────────────────────────
  public static async close(): Promise<void> {
    if (!this.isConnected || !this.dbInstance) return;
    try {
      await this.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    } catch { /* Non-fatal on shutdown */ }

    return new Promise<void>((resolve, reject) => {
      this.dbInstance!.close((err) => {
        if (err) {
          console.error('[Music DB] Error closing:', err.message);
          return reject(err);
        }
        console.log('[Music DB] Connection closed cleanly.');
        this.isConnected = false;
        this.dbInstance = null;
        resolve();
      });
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Public API
  // ───────────────────────────────────────────────────────────────────────────
  public static getDb() {
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
  // initializeSchemas — idempotent, all IF NOT EXISTS
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
      `CREATE TABLE IF NOT EXISTS sync_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guildId TEXT NOT NULL,
        time TEXT NOT NULL,
        msg TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'info',
        createdAt INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );`,
      `CREATE INDEX IF NOT EXISTS idx_sync_logs_guild ON sync_logs (guildId, id DESC);`,
      `CREATE TABLE IF NOT EXISTS music_247 (
        guildId TEXT PRIMARY KEY,
        enabled INTEGER DEFAULT 0,
        voiceChannelId TEXT,
        textChannelId TEXT,
        enabledBy TEXT,
        enabledAt INTEGER,
        disabledBy TEXT,
        disabledAt INTEGER
      );`,
    ];

    for (const schema of schemas) {
      await this.exec(schema);
    }
  }
}
