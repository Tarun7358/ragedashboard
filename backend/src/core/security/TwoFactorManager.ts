import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import { Database } from '../Database.js';

export interface PreBot2FAConfig {
  guildId: string;
  ownerId: string;
  secret: string;
  isEnabled: boolean;
  createdAt: number;
}

export class TwoFactorManager {
  /**
   * Generate a new 2FA TOTP secret, OTPAuth URI, and PNG QR Code image buffer
   */
  public static async generateSecret(ownerUsername: string, guildName: string): Promise<{ secret: string; otpauthUrl: string; qrBuffer: Buffer }> {
    const secret = generateSecret();
    const cleanGuild = guildName.replace(/[^a-zA-Z0-9 ]/g, '').trim() || 'Server';
    const cleanUser = ownerUsername.replace(/[^a-zA-Z0-9 ]/g, '').trim() || 'Owner';
    const serviceName = `RageOptimiser (${cleanGuild})`;
    
    const otpauthUrl = generateURI({
      secret,
      label: cleanUser,
      issuer: serviceName
    });

    const qrBuffer = await QRCode.toBuffer(otpauthUrl, {
      margin: 2,
      width: 256,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    return { secret, otpauthUrl, qrBuffer };
  }

  /**
   * Verify a 6-digit TOTP token against a secret
   */
  public static verifyToken(secret: string, token: string): boolean {
    if (!token || !secret) return false;
    const cleanToken = token.trim().replace(/\s+/g, '');
    if (!/^\d{6}$/.test(cleanToken)) return false;

    try {
      // At runtime, verifySync returns { valid: boolean, delta, epoch, timeStep }
      // The TypeScript typings are incorrect — cast to any to access .valid safely
      const res = verifySync({ token: cleanToken, secret }) as any;
      return res === true || Boolean(res?.valid);
    } catch (err) {
      console.error('[2FA Verification Error]:', err);
      return false;
    }
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
      secret: row.secret,
      isEnabled: Boolean(row.isEnabled),
      createdAt: row.createdAt
    };
  }

  /**
   * Save or update PreBot 2FA Configuration
   */
  public static async savePrebot2FAConfig(guildId: string, ownerId: string, secret: string, isEnabled: boolean): Promise<void> {
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
      [guildId, ownerId, secret, isEnabled ? 1 : 0, Date.now()]
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
