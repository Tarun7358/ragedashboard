import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Database } from '../Database.js';

export interface PreBot2FAConfig {
  guildId: string;
  ownerId: string;
  pin: string;
  isEnabled: boolean;
  createdAt: number;
}

export class TwoFactorManager {
  private static readonly MAX_FAILED_ATTEMPTS = 5;
  private static readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
  private static failedAttempts = new Map<string, { count: number; lockedUntil?: number }>();

  /**
   * Check if a guild is currently locked out from 2FA PIN attempts
   */
  public static isLockedOut(guildId: string): boolean {
    const record = this.failedAttempts.get(guildId);
    if (!record || !record.lockedUntil) return false;
    if (Date.now() > record.lockedUntil) {
      this.failedAttempts.delete(guildId);
      return false;
    }
    return true;
  }

  /**
   * Get remaining lockout duration in seconds
   */
  public static getLockoutRemainingSeconds(guildId: string): number {
    const record = this.failedAttempts.get(guildId);
    if (!record || !record.lockedUntil) return 0;
    const remaining = Math.ceil((record.lockedUntil - Date.now()) / 1000);
    return Math.max(0, remaining);
  }

  /**
   * Record a failed PIN verification attempt and trigger lockout if limit reached
   */
  public static recordFailedAttempt(guildId: string): boolean {
    const record = this.failedAttempts.get(guildId) || { count: 0 };
    record.count += 1;
    if (record.count >= this.MAX_FAILED_ATTEMPTS) {
      record.lockedUntil = Date.now() + this.LOCKOUT_DURATION_MS;
      this.failedAttempts.set(guildId, record);
      return true; // Now locked out
    }
    this.failedAttempts.set(guildId, record);
    return false;
  }

  /**
   * Reset failed attempt counter upon successful authentication
   */
  public static resetFailedAttempts(guildId: string): void {
    this.failedAttempts.delete(guildId);
  }

  /**
   * Constant-time timing-safe verification of a 6-digit input PIN against stored bcrypt hash or legacy plaintext
   */
  public static verifyPin(storedPin: string | null | undefined, inputPin: string, guildId?: string): boolean {
    if (!storedPin || !inputPin) return false;

    if (guildId && this.isLockedOut(guildId)) {
      return false;
    }

    const cleanStored = String(storedPin).trim();
    const cleanInput = String(inputPin).trim();
    if (!/^\d{6}$/.test(cleanInput)) return false;

    let isValid = false;

    // Check if stored secret is a bcrypt hash ($2a$ or $2b$)
    if (cleanStored.startsWith('$2a$') || cleanStored.startsWith('$2b$')) {
      try {
        isValid = bcrypt.compareSync(cleanInput, cleanStored);
      } catch {
        isValid = false;
      }
    } else {
      // Legacy plaintext PIN check with constant-time equality
      const bufA = Buffer.from(cleanStored);
      const bufB = Buffer.from(cleanInput);
      if (bufA.length === bufB.length) {
        isValid = crypto.timingSafeEqual(bufA, bufB);
      }

      // If valid, seamlessly migrate legacy plaintext PIN to bcrypt in the background
      if (isValid && guildId) {
        bcrypt.genSalt(10).then(salt => bcrypt.hash(cleanInput, salt)).then(hash => {
          const db = Database.getDb();
          if (db) {
            db.run('UPDATE prebot_2fa_config SET secret = ? WHERE guildId = ?', [hash, guildId]).catch(() => {});
          }
        }).catch(() => {});
      }
    }

    if (guildId) {
      if (isValid) {
        this.resetFailedAttempts(guildId);
      } else {
        this.recordFailedAttempt(guildId);
      }
    }

    return isValid;
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
   * Save or update PreBot 6-digit Owner Passcode with bcrypt hashing
   */
  public static async savePrebot2FAConfig(guildId: string, ownerId: string, pin: string, isEnabled: boolean = true): Promise<void> {
    const db = Database.getDb();
    if (!db) return;

    const cleanPin = pin.trim();
    const salt = await bcrypt.genSalt(10);
    const hashedSecret = await bcrypt.hash(cleanPin, salt);

    await db.run(
      `INSERT INTO prebot_2fa_config (guildId, ownerId, secret, isEnabled, createdAt)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(guildId) DO UPDATE SET
         ownerId = excluded.ownerId,
         secret = excluded.secret,
         isEnabled = excluded.isEnabled,
         createdAt = excluded.createdAt`,
      [guildId, ownerId, hashedSecret, isEnabled ? 1 : 0, Date.now()]
    );

    this.resetFailedAttempts(guildId);
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
    this.resetFailedAttempts(guildId);
  }
}
