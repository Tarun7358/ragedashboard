import { Database } from '../Database.js';

export interface PreBot2FAConfig {
  guildId: string;
  ownerId: string;
  pin: string;
  isEnabled: boolean;
  createdAt: number;
}

export class TwoFactorManager {
  /**
   * Verify a 6-digit input PIN against the server's stored 2FA passcode
   */
  public static verifyPin(storedPin: string | null | undefined, inputPin: string): boolean {
    if (!storedPin || !inputPin) return false;
    const cleanStored = String(storedPin).trim();
    const cleanInput = String(inputPin).trim();
    if (!/^\d{6}$/.test(cleanInput)) return false;
    return cleanStored === cleanInput;
  }

  /**
   * Get per-server PreBot 2FA Configuration
   */
  public static async getPrebot2FAConfig(guildId: string): Promise<PreBot2FAConfig | null> {
    const db = Database.getDb();
    if (!db) return null;

    const row = await db.get<any>('SELECT * FROM prebot_2fa_config WHERE guildId = ?', [guildId]);
    if (!row) return null;

    return {
      guildId: row.guildId,
      ownerId: row.ownerId,
      pin: row.secret,
      isEnabled: Boolean(row.isEnabled),
      createdAt: row.createdAt
    };
  }

  /**
   * Save or update PreBot 6-digit Owner Passcode
   */
  public static async savePrebot2FAConfig(guildId: string, ownerId: string, pin: string, isEnabled: boolean = true): Promise<void> {
    const db = Database.getDb();
    if (!db) return;

    await db.run(
      `INSERT INTO prebot_2fa_config (guildId, ownerId, secret, isEnabled, createdAt)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(guildId) DO UPDATE SET
         ownerId = excluded.ownerId,
         secret = excluded.secret,
         isEnabled = excluded.isEnabled,
         createdAt = excluded.createdAt`,
      [guildId, ownerId, pin.trim(), isEnabled ? 1 : 0, Date.now()]
    );
  }

  /**
   * Set 2FA enabled status for server
   */
  public static async setPrebot2FAEnabled(guildId: string, isEnabled: boolean): Promise<void> {
    const db = Database.getDb();
    if (!db) return;

    await db.run('UPDATE prebot_2fa_config SET isEnabled = ? WHERE guildId = ?', [isEnabled ? 1 : 0, guildId]);
  }

  /**
   * Delete 2FA configuration for server
   */
  public static async deletePrebot2FAConfig(guildId: string): Promise<void> {
    const db = Database.getDb();
    if (!db) return;

    await db.run('DELETE FROM prebot_2fa_config WHERE guildId = ?', [guildId]);
  }
}
