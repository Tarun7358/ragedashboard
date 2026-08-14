import jwt from 'jsonwebtoken';
import { Database } from './Database.js';
import crypto from 'crypto';

const DISCORD_API = 'https://discord.com/api/v10';
const PERMISSIONS_MANAGE_SERVER = 0x20; // ManageGuild permission bit
const PERMISSIONS_ADMINISTRATOR = 0x8; // Administrator permission bit

// ─── TOKEN ENCRYPTION ────────────────────────────────────────────────────────
// Encrypts/decrypts Discord access tokens stored in discord_sessions using
// AES-256-GCM. The key must be 32 bytes (64 hex chars) set in TOKEN_ENCRYPTION_KEY.
// If the env var is missing, a derived fallback key is used with a one-time warning.

function getEncryptionKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (raw && raw.length === 64) {
    return Buffer.from(raw, 'hex');
  }
  if (!OAuthService._encKeyWarned) {
    console.warn('[OAuthService] ⚠️  TOKEN_ENCRYPTION_KEY is not set or invalid. Using derived fallback key — set a 32-byte hex key in your .env before deploying to production.');
    OAuthService._encKeyWarned = true;
  }
  // Derive a deterministic fallback from JWT_SECRET so at least the key isn't empty
  return crypto.createHash('sha256').update(process.env.JWT_SECRET || 'fallback_secret').digest();
}

function encryptToken(plain: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Format: iv:authTag:ciphertext (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptToken(stored: string): string {
  // Support legacy plaintext tokens that are not in the encrypted format
  if (!stored.includes(':')) return stored;
  const parts = stored.split(':');
  if (parts.length !== 3) return stored;
  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = Buffer.from(parts[2], 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted) + decipher.final('utf8');
  } catch {
    // Decryption failed — token may be from before encryption was added
    return stored;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  email?: string;
  global_name?: string;
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string; // bitfield as string
}

export interface OAuthSession {
  discordId: string;
  discordUsername: string;
  discordAvatar: string | null;
  accessToken: string;
  managedGuildIds: string[]; // guild IDs where user has Manage Server or is owner
  loginAt: number;
}

export class OAuthService {
  /** @internal — tracks whether the encryption key warning has been emitted */
  static _encKeyWarned = false;

  private static getClientId(): string {
    return (process.env.CLIENT_ID || '').trim();
  }

  private static getClientSecret(): string {
    return (process.env.CLIENT_SECRET || '').trim();
  }

  private static getRedirectUri(): string {
    return (process.env.OAUTH_REDIRECT_URI || 'http://localhost:5000/api/auth/discord/callback').trim();
  }

  /**
   * Build the Discord OAuth2 authorization URL (includes guilds.join for auto-rejoin capability)
   */
  public static getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.getClientId(),
      redirect_uri: this.getRedirectUri(),
      response_type: 'code',
      scope: 'identify guilds guilds.join',
      ...(state ? { state } : {})
    });
    return `https://discord.com/oauth2/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  public static async exchangeCode(code: string): Promise<{ access_token: string; token_type: string }> {
    const body = new URLSearchParams({
      client_id: this.getClientId(),
      client_secret: this.getClientSecret(),
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.getRedirectUri()
    });

    const res = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to exchange OAuth code: ${err}`);
    }

    return res.json() as Promise<{ access_token: string; token_type: string }>;
  }

  /**
   * Fetch the Discord user info for an access token
   */
  public static async fetchUser(accessToken: string): Promise<DiscordUser> {
    const res = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) throw new Error('Failed to fetch Discord user');
    return res.json() as Promise<DiscordUser>;
  }

  /**
   * Fetch all guilds the user is a member of
   */
  public static async fetchUserGuilds(accessToken: string): Promise<DiscordGuild[]> {
    const res = await fetch(`${DISCORD_API}/users/@me/guilds`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) throw new Error('Failed to fetch user guilds');
    return res.json() as Promise<DiscordGuild[]>;
  }

  /**
   * Filter guilds to ones the user can manage (owner OR ManageGuild OR Administrator)
   */
  public static filterManageableGuilds(guilds: DiscordGuild[]): DiscordGuild[] {
    return guilds.filter(g => {
      const perms = BigInt(g.permissions);
      const hasManage = (perms & BigInt(PERMISSIONS_MANAGE_SERVER)) !== 0n;
      const hasAdmin = (perms & BigInt(PERMISSIONS_ADMINISTRATOR)) !== 0n;
      return g.owner || hasManage || hasAdmin;
    });
  }

  /**
   * Full OAuth2 flow: exchange code → fetch user + guilds → save session → return JWT
   */
  public static async processCallback(code: string, discordClient?: any): Promise<{ 
    token: string; 
    user: DiscordUser; 
    managedGuilds: DiscordGuild[];
    approvals: Record<string, { status: string; guildName: string }>;
  }> {
    // 1. Exchange code for access token
    const tokenData = await this.exchangeCode(code);
    const { access_token } = tokenData;

    // 2. Fetch user info
    const discordUser = await this.fetchUser(access_token);

    // 3. Fetch + filter manageable guilds
    const allGuilds = await this.fetchUserGuilds(access_token);
    const manageableGuilds = this.filterManageableGuilds(allGuilds);

    // 4. Check approval status for each manageable guild from our DB
    const db = Database.getDb();
    const approvals: Record<string, { status: string; guildName: string }> = {};
    
    if (manageableGuilds.length > 0) {
      for (const guild of manageableGuilds) {
        const isInGuild = discordClient ? discordClient.guilds.cache.has(guild.id) : false;
        const defaultStatus = isInGuild ? 'Approved' : 'Not Registered';

        if (db) {
          try {
            const row = await db.get('SELECT * FROM approvals WHERE guildId = ?', [guild.id]);
            if (row) {
              let status = row.status;
              if (status !== 'Blacklisted' && status !== 'Suspended' && status !== 'Rejected') {
                status = defaultStatus;
              }
              approvals[guild.id] = { status, guildName: row.guildName || guild.name };
            } else {
              approvals[guild.id] = { status: defaultStatus, guildName: guild.name };
            }
          } catch {
            approvals[guild.id] = { status: defaultStatus, guildName: guild.name };
          }
        } else {
          approvals[guild.id] = { status: defaultStatus, guildName: guild.name };
        }
      }
    }

    // 5. Save/update Discord OAuth session in DB — accessToken stored AES-256-GCM encrypted
    if (db) {
      const encryptedToken = encryptToken(access_token);
      await db.run(
        `INSERT OR REPLACE INTO discord_sessions (
          discordId, discordUsername, discordAvatar, accessToken, managedGuildIds, loginAt
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          discordUser.id,
          discordUser.username,
          discordUser.avatar,
          encryptedToken,
          JSON.stringify(manageableGuilds.map(g => g.id)),
          Date.now()
        ]
      );
    }

    // 6. Issue a JWT for the dashboard session (role: 'guild_manager')
    const token = jwt.sign(
      {
        id: discordUser.id,
        username: discordUser.username,
        role: 'guild_manager',
        avatar: discordUser.avatar,
        managedGuildIds: manageableGuilds.map(g => g.id)
      },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    return { token, user: discordUser, managedGuilds: manageableGuilds, approvals };
  }

  /**
   * Retrieve and decrypt the stored access token for a user.
   * Use this whenever a stored token needs to be used for Discord API calls.
   */
  public static async getDecryptedAccessToken(discordId: string): Promise<string | null> {
    const db = Database.getDb();
    if (!db) return null;
    const session = await db.get<any>('SELECT accessToken FROM discord_sessions WHERE discordId = ?', [discordId]);
    if (!session?.accessToken) return null;
    return decryptToken(session.accessToken);
  }

  /**
   * Fetch fresh user guilds using stored (decrypted) session token.
   * Replaces the pattern in WebServer that reads accessToken directly.
   */
  public static async fetchUserGuildsFromSession(discordId: string): Promise<DiscordGuild[] | null> {
    const accessToken = await this.getDecryptedAccessToken(discordId);
    if (!accessToken) return null;
    return this.fetchUserGuilds(accessToken);
  }

  /**
   * Get guild icon URL
   */
  public static getGuildIconUrl(guildId: string, iconHash: string | null): string | null {
    if (!iconHash) return null;
    return `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.png`;
  }

  /**
   * Get user avatar URL
   */
  public static getAvatarUrl(userId: string, avatarHash: string | null): string {
    if (!avatarHash) {
    // H-7 FIX: Discord has 5 default avatars (indices 0-4), not 6.
      const defaultIndex = (BigInt(userId) >> 22n) % 5n;
      return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
    }
    return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png`;
  }

  /**
   * Add a user to a guild using their stored OAuth2 access token with `guilds.join` scope
   */
  public static async addUserToGuild(guildId: string, userId: string, accessToken: string): Promise<{ success: boolean; error?: string }> {
    const botToken = process.env.DISCORD_TOKEN;
    if (!botToken) return { success: false, error: 'No bot token configured' };

    try {
      const res = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${userId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bot ${botToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ access_token: accessToken })
      });

      if (res.ok || res.status === 201 || res.status === 204) {
        return { success: true };
      } else {
        const txt = await res.text();
        return { success: false, error: txt };
      }
    } catch (e: any) {
      return { success: false, error: e?.message || 'Network error' };
    }
  }

  /**
   * Attempt auto-rejoining users into a server using stored encrypted OAuth sessions
   */
  public static async attemptAutoRejoinForGuild(guildId: string): Promise<{ attempted: number; joined: number }> {
    const db = Database.getDb();
    if (!db) return { attempted: 0, joined: 0 };

    try {
      const rows = await db.all<any>('SELECT * FROM discord_sessions');
      let attempted = 0;
      let joined = 0;

      for (const r of rows) {
        try {
          const managed = JSON.parse(r.managedGuildIds || '[]');
          if (managed.includes(guildId)) {
            attempted++;
            const decryptedToken = decryptToken(r.accessToken);
            const res = await this.addUserToGuild(guildId, r.discordId, decryptedToken);
            if (res.success) joined++;
          }
        } catch { }
      }
      return { attempted, joined };
    } catch {
      return { attempted: 0, joined: 0 };
    }
  }
}
