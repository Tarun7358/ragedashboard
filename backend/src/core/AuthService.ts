import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Database } from './Database.js';
import { IAdminUser } from '../models/index.js';

export class AuthService {
  private static readonly MAX_FAILED_ATTEMPTS = 5;
  private static readonly LOCKOUT_MINUTES = 15;
  private static readonly DEFAULT_ADMIN_USER = 'admin';

  /**
   * Ensure that the default owner account exists.
   */
  public static async provisionDefaultOwner(): Promise<void> {
    const db = Database.getDb();
    if (!db) {
      console.warn('[AuthService] Cannot provision owner - no DB connected.');
      return;
    }

    try {
      const user = await db.get('SELECT * FROM admin_users WHERE username = ?', [this.DEFAULT_ADMIN_USER]);

      if (!user) {
        console.log('[AuthService] No admin user found. Provisioning default owner account.');

        // L-06 FIX: Generate a random password if DASHBOARD_PASSWORD is not set
        let rawPassword = process.env.DASHBOARD_PASSWORD;
        if (!rawPassword) {
          rawPassword = crypto.randomBytes(16).toString('hex');
          console.warn(
            `[AuthService] ⚠️  DASHBOARD_PASSWORD is not set. ` +
            `A one-time random password has been generated for the 'admin' account: ${rawPassword}\n` +
            `Set DASHBOARD_PASSWORD in your .env to persist a fixed password.`
          );
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(rawPassword, salt);

        // L-03 FIX: Use crypto.randomUUID() instead of Math.random()
        const id = 'admin_owner_' + crypto.randomUUID().replace(/-/g, '').substring(0, 7);
        const now = new Date().toISOString();

        await db.run(
          `INSERT INTO admin_users (
            id, username, passwordHash, role, totpEnabled, totpSecret, recoveryCodes, 
            failedAttempts, lockedUntil, lastLogin, createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, 0, null, '[]', 0, null, null, ?, ?)`,
          [id, this.DEFAULT_ADMIN_USER, passwordHash, 'owner', now, now]
        );
        console.log('[AuthService] Default owner provisioning sequence completed.');
      }
    } catch (err) {
      console.error('[AuthService] Error provisioning default owner:', err);
    }
  }

  /**
   * Validate credentials and handle lockouts.
   */
  public static async authenticate(username: string, password: string): Promise<IAdminUser | null> {
    // BUG-14 FIX: Do NOT log the username — avoids PII leakage and accidental
    // capture of passwords typed into the username field.
    console.log('[AuthService] Authentication attempt received.');
    const db = Database.getDb();
    if (!db) {
      console.error('[AuthService] Authentication failed: database disconnected');
      throw new Error('Database disconnected');
    }

    console.log('[AuthService] Fetching user row from SQLite...');
    const user = await db.get<any>('SELECT * FROM admin_users WHERE username = ?', [username]);

    if (!user) {
      return null; // User not found
    }

    // 1. Check if account is locked
    if (user.lockedUntil) {
      const lockedUntilDate = new Date(user.lockedUntil);
      if (lockedUntilDate > new Date()) {
        console.error('[AuthService] Account locked');
        throw new Error('ACCOUNT_LOCKED');
      }
    }

    // 2. Verify password
    const isMatch = await bcrypt.compare(password, user.passwordHash);

    if (!isMatch) {
      // Increment failed attempts
      let failed = (user.failedAttempts || 0) + 1;
      let lockedUntil: string | null = null;

      if (failed >= this.MAX_FAILED_ATTEMPTS) {
        const lockUntil = new Date();
        lockUntil.setMinutes(lockUntil.getMinutes() + this.LOCKOUT_MINUTES);
        lockedUntil = lockUntil.toISOString();
      }

      await db.run(
        'UPDATE admin_users SET failedAttempts = ?, lockedUntil = ?, updatedAt = ? WHERE id = ?',
        [failed, lockedUntil, new Date().toISOString(), user.id]
      );
      return null;
    }

    // 3. Successful login - reset counters
    const lastLogin = new Date().toISOString();
    await db.run(
      'UPDATE admin_users SET failedAttempts = 0, lockedUntil = null, lastLogin = ?, updatedAt = ? WHERE id = ?',
      [lastLogin, new Date().toISOString(), user.id]
    );

    return {
      ...user,
      totpEnabled: !!user.totpEnabled,
      recoveryCodes: typeof user.recoveryCodes === 'string' ? JSON.parse(user.recoveryCodes) : (user.recoveryCodes || [])
    } as any;
  }
}
