import { Database } from '../../core/Database.js';

export interface PaymentConfigRecord {
  guildId: string;
  enabled: number;
  merchantName: string;
  upiId: string;
  currency: string;
  defaultExpiry: number;
  footer: string;
  branding: string; // JSON string
  defaultProfileId: string | null;
  logChannelId: string | null;
  verificationMode: string;
}

export interface PaymentProfileRecord {
  id: string;
  guildId: string;
  name: string;
  merchantName: string | null;
  upiId: string | null;
  defaultAmount: number | null;
  theme: string | null;
  footer: string | null;
  prefix: string | null;
  expiry: number | null;
}

export interface PaymentPresetRecord {
  id: string;
  guildId: string;
  name: string;
  amount: number;
}

export interface PaymentRoleRecord {
  guildId: string;
  roleId: string;
}

export interface PaymentSessionRecord {
  paymentId: string;
  guildId: string;
  userId: string;
  amount: number;
  purpose: string;
  profileId: string | null;
  merchantName: string;
  upiId: string;
  status: 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'VERIFIED';
  createdAt: string;
  expiresAt: string;
}

export class PaymentDatabase {
  private static initialized = false;

  public static async init(): Promise<void> {
    if (this.initialized) return;

    const db = Database.getDb();
    if (!db) {
      console.warn('[PaymentDatabase] Database not yet connected. Retrying on query execute.');
      return;
    }

    const schemas = [
      `CREATE TABLE IF NOT EXISTS payment_configs (
        guildId TEXT PRIMARY KEY,
        enabled INTEGER DEFAULT 0,
        merchantName TEXT DEFAULT '',
        upiId TEXT DEFAULT '',
        currency TEXT DEFAULT 'INR',
        defaultExpiry INTEGER DEFAULT 30,
        footer TEXT DEFAULT 'Rage Optimiser • Payment Gateway',
        branding TEXT DEFAULT '{}',
        defaultProfileId TEXT,
        logChannelId TEXT,
        verificationMode TEXT DEFAULT 'manual'
      );`,
      `CREATE TABLE IF NOT EXISTS payment_profiles (
        id TEXT PRIMARY KEY,
        guildId TEXT NOT NULL,
        name TEXT NOT NULL,
        merchantName TEXT,
        upiId TEXT,
        defaultAmount REAL,
        theme TEXT,
        footer TEXT,
        prefix TEXT DEFAULT 'PAY',
        expiry INTEGER DEFAULT 30
      );`,
      `CREATE TABLE IF NOT EXISTS payment_presets (
        id TEXT PRIMARY KEY,
        guildId TEXT NOT NULL,
        name TEXT NOT NULL,
        amount REAL NOT NULL
      );`,
      `CREATE TABLE IF NOT EXISTS payment_roles (
        guildId TEXT NOT NULL,
        roleId TEXT NOT NULL,
        PRIMARY KEY (guildId, roleId)
      );`,
      `CREATE TABLE IF NOT EXISTS payment_sessions (
        paymentId TEXT PRIMARY KEY,
        guildId TEXT NOT NULL,
        userId TEXT NOT NULL,
        amount REAL NOT NULL,
        purpose TEXT NOT NULL,
        profileId TEXT,
        merchantName TEXT NOT NULL,
        upiId TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        createdAt TEXT NOT NULL,
        expiresAt TEXT NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_payment_profiles_guild ON payment_profiles (guildId);`,
      `CREATE INDEX IF NOT EXISTS idx_payment_presets_guild ON payment_presets (guildId);`,
      `CREATE INDEX IF NOT EXISTS idx_payment_sessions_guild ON payment_sessions (guildId, status);`
    ];

    for (const schema of schemas) {
      await Database.exec(schema);
    }

    this.initialized = true;
    console.log('[PaymentDatabase] Payment SQLite tables initialized successfully.');
  }

  // --- Config Operations ---
  public static async getConfig(guildId: string): Promise<PaymentConfigRecord | null> {
    await this.init();
    return Database.get<PaymentConfigRecord>('SELECT * FROM payment_configs WHERE guildId = ?', [guildId]);
  }

  public static async saveConfig(config: Partial<PaymentConfigRecord> & { guildId: string }): Promise<void> {
    await this.init();
    const existing = await this.getConfig(config.guildId);
    if (existing) {
      const merged = { ...existing, ...config };
      await Database.run(
        `UPDATE payment_configs SET 
          enabled = ?, merchantName = ?, upiId = ?, currency = ?, defaultExpiry = ?, 
          footer = ?, branding = ?, defaultProfileId = ?, logChannelId = ?, verificationMode = ?
         WHERE guildId = ?`,
        [
          merged.enabled,
          merged.merchantName,
          merged.upiId,
          merged.currency,
          merged.defaultExpiry,
          merged.footer,
          typeof merged.branding === 'object' ? JSON.stringify(merged.branding) : merged.branding,
          merged.defaultProfileId,
          merged.logChannelId,
          merged.verificationMode,
          merged.guildId
        ]
      );
    } else {
      await Database.run(
        `INSERT INTO payment_configs (
          guildId, enabled, merchantName, upiId, currency, defaultExpiry, footer, branding, defaultProfileId, logChannelId, verificationMode
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          config.guildId,
          config.enabled ?? 0,
          config.merchantName ?? '',
          config.upiId ?? '',
          config.currency ?? 'INR',
          config.defaultExpiry ?? 30,
          config.footer ?? 'Rage Optimiser • Payment Gateway',
          typeof config.branding === 'object' ? JSON.stringify(config.branding) : (config.branding ?? '{}'),
          config.defaultProfileId ?? null,
          config.logChannelId ?? null,
          config.verificationMode ?? 'manual'
        ]
      );
    }
  }

  // --- Profiles Operations ---
  public static async getProfiles(guildId: string): Promise<PaymentProfileRecord[]> {
    await this.init();
    return Database.all<PaymentProfileRecord>('SELECT * FROM payment_profiles WHERE guildId = ?', [guildId]);
  }

  public static async getProfileById(guildId: string, id: string): Promise<PaymentProfileRecord | null> {
    await this.init();
    return Database.get<PaymentProfileRecord>('SELECT * FROM payment_profiles WHERE guildId = ? AND (id = ? OR LOWER(name) = LOWER(?))', [guildId, id, id]);
  }

  public static async saveProfile(profile: PaymentProfileRecord): Promise<void> {
    await this.init();
    await Database.run(
      `INSERT OR REPLACE INTO payment_profiles (
        id, guildId, name, merchantName, upiId, defaultAmount, theme, footer, prefix, expiry
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        profile.id,
        profile.guildId,
        profile.name,
        profile.merchantName,
        profile.upiId,
        profile.defaultAmount,
        profile.theme,
        profile.footer,
        profile.prefix || 'PAY',
        profile.expiry || 30
      ]
    );
  }

  public static async deleteProfile(guildId: string, id: string): Promise<boolean> {
    await this.init();
    const res = await Database.run('DELETE FROM payment_profiles WHERE guildId = ? AND (id = ? OR LOWER(name) = LOWER(?))', [guildId, id, id]);
    return res.changes > 0;
  }

  // --- Presets Operations ---
  public static async getPresets(guildId: string): Promise<PaymentPresetRecord[]> {
    await this.init();
    return Database.all<PaymentPresetRecord>('SELECT * FROM payment_presets WHERE guildId = ?', [guildId]);
  }

  public static async savePreset(preset: PaymentPresetRecord): Promise<void> {
    await this.init();
    await Database.run(
      `INSERT OR REPLACE INTO payment_presets (id, guildId, name, amount) VALUES (?, ?, ?, ?)`,
      [preset.id, preset.guildId, preset.name, preset.amount]
    );
  }

  public static async deletePreset(guildId: string, id: string): Promise<boolean> {
    await this.init();
    const res = await Database.run('DELETE FROM payment_presets WHERE guildId = ? AND (id = ? OR LOWER(name) = LOWER(?))', [guildId, id, id]);
    return res.changes > 0;
  }

  // --- Manager Roles Operations ---
  public static async getRoles(guildId: string): Promise<string[]> {
    await this.init();
    const rows = await Database.all<PaymentRoleRecord>('SELECT roleId FROM payment_roles WHERE guildId = ?', [guildId]);
    return rows.map(r => r.roleId);
  }

  public static async addRole(guildId: string, roleId: string): Promise<void> {
    await this.init();
    await Database.run('INSERT OR IGNORE INTO payment_roles (guildId, roleId) VALUES (?, ?)', [guildId, roleId]);
  }

  public static async removeRole(guildId: string, roleId: string): Promise<boolean> {
    await this.init();
    const res = await Database.run('DELETE FROM payment_roles WHERE guildId = ? AND roleId = ?', [guildId, roleId]);
    return res.changes > 0;
  }

  // --- Payment Sessions Operations ---
  public static async createSession(session: PaymentSessionRecord): Promise<void> {
    await this.init();
    await Database.run(
      `INSERT INTO payment_sessions (
        paymentId, guildId, userId, amount, purpose, profileId, merchantName, upiId, status, createdAt, expiresAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.paymentId,
        session.guildId,
        session.userId,
        session.amount,
        session.purpose,
        session.profileId,
        session.merchantName,
        session.upiId,
        session.status,
        session.createdAt,
        session.expiresAt
      ]
    );
  }

  public static async getSession(paymentId: string): Promise<PaymentSessionRecord | null> {
    await this.init();
    return Database.get<PaymentSessionRecord>('SELECT * FROM payment_sessions WHERE paymentId = ?', [paymentId]);
  }

  public static async updateSessionStatus(paymentId: string, status: 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'VERIFIED'): Promise<boolean> {
    await this.init();
    const res = await Database.run('UPDATE payment_sessions SET status = ? WHERE paymentId = ?', [status, paymentId]);
    return res.changes > 0;
  }
}
