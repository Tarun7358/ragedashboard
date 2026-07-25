import crypto from 'crypto';
import { generateSecret, generateURI, verify } from 'otplib';

export class SecurityService {
  private static getEncryptionKey(): Buffer {
    // BUG-003 FIX: Do not fall back to the publicly-known 'fallback_secret'.
    // The startup guard in index.ts guarantees JWT_SECRET is set and ≥32 chars.
    const secret = process.env.JWT_SECRET!;
    // Create a 32-byte key from the secret using SHA-256
    return crypto.createHash('sha256').update(String(secret)).digest();
  }

  /**
   * Encrypts a plaintext string (e.g., TOTP secret) using AES-256-GCM
   */
  public static encrypt(text: string): string {
    const iv = crypto.randomBytes(12);
    const key = this.getEncryptionKey();
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Format: iv:encrypted:authTag
    return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
  }

  /**
   * Decrypts an encrypted string
   */
  public static decrypt(encryptedText: string): string {
    try {
      const parts = encryptedText.split(':');
      if (parts.length !== 3) throw new Error('Invalid encrypted text format');
      
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = Buffer.from(parts[1], 'hex');
      const authTag = Buffer.from(parts[2], 'hex');
      const key = this.getEncryptionKey();
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted, undefined, 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err) {
      console.error('Decryption error:', err);
      throw new Error('Failed to decrypt secret');
    }
  }

  /**
   * Generates a new TOTP secret and provisioning URI
   */
  public static generateTotpSecret(username: string) {
    const secret = generateSecret();
    const uri = generateURI({ label: username, issuer: 'Rage Optimiser', secret });
    return { secret, uri };
  }

  /**
   * Verifies a TOTP token against a secret
   */
  public static async verifyTotpToken(token: string | number, secret: string): Promise<boolean> {
    try {
      const stringToken = String(token).trim().padStart(6, '0');
      const result = await verify({ token: stringToken, secret });
      return result.valid;
    } catch (err) {
      return false;
    }
  }

  /**
   * Generates 10 secure, random alphanumeric recovery codes
   */
  public static generateRecoveryCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 chars
      codes.push(`${code.substring(0, 4)}-${code.substring(4)}`);
    }
    return codes;
  }
}
