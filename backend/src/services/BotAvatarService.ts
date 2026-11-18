import { Routes, type Guild, type Client } from 'discord.js';
import sharp from 'sharp';
import { Database } from '../core/Database.js';

export interface GuildBotCustomization {
  guildId: string;
  serverAvatarUrl: string | null;
  serverNickname: string | null;
  updatedBy: string;
  updatedAt: number;
}

export class BotAvatarService {
  private static isInitialized = false;

  /**
   * Ensure database schema exists for per-server bot customizations.
   */
  public static async ensureTable(): Promise<void> {
    if (this.isInitialized) return;
    try {
      const db = Database.getDb();
      if (!db) return;

      await db.exec(`
        CREATE TABLE IF NOT EXISTS guild_bot_customization (
          guildId TEXT PRIMARY KEY,
          serverAvatarUrl TEXT,
          serverNickname TEXT,
          updatedBy TEXT,
          updatedAt INTEGER
        );
      `);
      this.isInitialized = true;
    } catch (err) {
      console.error('[BotAvatarService] Error creating guild_bot_customization table:', err);
    }
  }

  /**
   * Retrieve current stored customization record for a guild.
   */
  public static async getCustomization(guildId: string): Promise<GuildBotCustomization | null> {
    await this.ensureTable();
    try {
      const db = Database.getDb();
      if (!db) return null;
      const row = await db.get<any>(
        'SELECT * FROM guild_bot_customization WHERE guildId = ?',
        [guildId]
      );
      if (!row) return null;
      return {
        guildId: row.guildId,
        serverAvatarUrl: row.serverAvatarUrl || null,
        serverNickname: row.serverNickname || null,
        updatedBy: row.updatedBy || 'system',
        updatedAt: row.updatedAt || 0
      };
    } catch (err) {
      console.error(`[BotAvatarService] Failed to load customization for guild ${guildId}:`, err);
      return null;
    }
  }

  /**
   * Sets the bot's server-specific avatar via Discord REST API (PATCH /guilds/{id}/members/@me).
   */
  public static async setServerAvatar(
    guild: Guild,
    imageSource: string | Buffer,
    updatedBy: string
  ): Promise<{ success: boolean; avatarUrl?: string; error?: string }> {
    await this.ensureTable();

    try {
      let imageBuffer: Buffer;
      let originalUrl: string | null = null;

      // 1. Resolve image into a Buffer
      if (typeof imageSource === 'string') {
        originalUrl = imageSource;
        if (!/^https?:\/\//i.test(imageSource)) {
          return { success: false, error: 'Invalid URL. Please provide a direct http/https link or file attachment.' };
        }

        const res = await fetch(imageSource);
        if (!res.ok) {
          return { success: false, error: `Failed to download image (HTTP ${res.status}: ${res.statusText}).` };
        }
        const arrayBuf = await res.arrayBuffer();
        imageBuffer = Buffer.from(arrayBuf);
      } else {
        imageBuffer = imageSource;
      }

      if (!imageBuffer || imageBuffer.length === 0) {
        return { success: false, error: 'Image file was empty or could not be processed.' };
      }

      // Check max payload size (8 MB)
      if (imageBuffer.length > 8 * 1024 * 1024) {
        return { success: false, error: 'Image size exceeds maximum limit of 8 MB.' };
      }

      // 2. Validate and format image with Sharp
      const metadata = await sharp(imageBuffer).metadata().catch(() => null);
      if (!metadata || !metadata.format) {
        return { success: false, error: 'Unsupported or corrupted image format. Please use PNG, JPEG, WebP, or GIF.' };
      }

      let mimeType = `image/${metadata.format as string}`;
      let finalBuffer = imageBuffer;

      // Optimize oversized images (> 1024x1024 or > 2MB static)
      if (metadata.format !== 'gif') {
        if ((metadata.width && metadata.width > 1024) || (metadata.height && metadata.height > 1024) || imageBuffer.length > 2 * 1024 * 1024) {
          finalBuffer = await sharp(imageBuffer)
            .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
            .png({ quality: 90 })
            .toBuffer();
          mimeType = 'image/png';
        }
      }

      // Convert to Discord Base64 Data URI
      const base64DataUri = `data:${mimeType};base64,${finalBuffer.toString('base64')}`;

      // 3. Dispatch to Discord REST API
      const patchResult: any = await guild.client.rest.patch(
        Routes.guildMember(guild.id, '@me'),
        {
          body: { avatar: base64DataUri }
        }
      );

      // Invalidate and refresh cache for guild.members.me
      await guild.members.fetchMe().catch(() => null);

      // 4. Persist to SQLite
      const db = Database.getDb();
      if (db) {
        const storedUrl = originalUrl || 'attachment_upload';
        await db.run(
          `INSERT INTO guild_bot_customization (guildId, serverAvatarUrl, updatedBy, updatedAt)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(guildId) DO UPDATE SET
             serverAvatarUrl = excluded.serverAvatarUrl,
             updatedBy = excluded.updatedBy,
             updatedAt = excluded.updatedAt`,
          [guild.id, storedUrl, updatedBy, Date.now()]
        );
      }

      const newAvatarUrl = guild.members.me?.displayAvatarURL({ size: 1024 }) || patchResult?.avatar;
      return { success: true, avatarUrl: newAvatarUrl };
    } catch (err: any) {
      console.error(`[BotAvatarService] setServerAvatar failed in ${guild.id}:`, err);
      let errorMsg = err?.message || 'Failed to update bot server avatar.';
      if (err?.code === 50035) {
        errorMsg = 'Discord rejected the image format or payload. Please try a standard PNG or JPEG under 4 MB.';
      } else if (err?.status === 429) {
        errorMsg = 'Rate limit encountered: Discord allows setting server avatars only a few times per minute. Please try again shortly.';
      }
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Resets the bot's server avatar to the global default bot avatar.
   */
  public static async resetServerAvatar(
    guild: Guild,
    updatedBy: string
  ): Promise<{ success: boolean; error?: string }> {
    await this.ensureTable();

    try {
      await guild.client.rest.patch(
        Routes.guildMember(guild.id, '@me'),
        {
          body: { avatar: null }
        }
      );

      await guild.members.fetchMe().catch(() => null);

      const db = Database.getDb();
      if (db) {
        await db.run(
          `UPDATE guild_bot_customization SET serverAvatarUrl = NULL, updatedBy = ?, updatedAt = ? WHERE guildId = ?`,
          [updatedBy, Date.now(), guild.id]
        );
      }

      return { success: true };
    } catch (err: any) {
      console.error(`[BotAvatarService] resetServerAvatar failed in ${guild.id}:`, err);
      return { success: false, error: err?.message || 'Failed to reset server avatar.' };
    }
  }

  /**
   * Sets the bot's server nickname in this guild.
   */
  public static async setServerNickname(
    guild: Guild,
    nickname: string | null,
    updatedBy: string
  ): Promise<{ success: boolean; nickname?: string | null; error?: string }> {
    await this.ensureTable();

    try {
      const cleanNick = nickname ? nickname.trim().slice(0, 32) : null;
      await guild.client.rest.patch(
        Routes.guildMember(guild.id, '@me'),
        {
          body: { nick: cleanNick }
        }
      );

      await guild.members.fetchMe().catch(() => null);

      const db = Database.getDb();
      if (db) {
        await db.run(
          `INSERT INTO guild_bot_customization (guildId, serverNickname, updatedBy, updatedAt)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(guildId) DO UPDATE SET
             serverNickname = excluded.serverNickname,
             updatedBy = excluded.updatedBy,
             updatedAt = excluded.updatedAt`,
          [guild.id, cleanNick, updatedBy, Date.now()]
        );
      }

      return { success: true, nickname: cleanNick };
    } catch (err: any) {
      console.error(`[BotAvatarService] setServerNickname failed in ${guild.id}:`, err);
      return { success: false, error: err?.message || 'Failed to change server nickname.' };
    }
  }

  /**
   * Sets the bot's global profile banner via Discord REST API (PATCH /users/@me).
   */
  public static async setGlobalBanner(
    client: Client,
    imageSource: string | Buffer
  ): Promise<{ success: boolean; bannerUrl?: string; error?: string }> {
    try {
      let imageBuffer: Buffer;

      if (typeof imageSource === 'string') {
        if (!/^https?:\/\//i.test(imageSource)) {
          return { success: false, error: 'Invalid URL. Please provide a direct http/https link or file attachment.' };
        }
        const res = await fetch(imageSource);
        if (!res.ok) {
          return { success: false, error: `Failed to download image (HTTP ${res.status}: ${res.statusText}).` };
        }
        const arrayBuf = await res.arrayBuffer();
        imageBuffer = Buffer.from(arrayBuf);
      } else {
        imageBuffer = imageSource;
      }

      if (!imageBuffer || imageBuffer.length === 0) {
        return { success: false, error: 'Image file was empty or could not be processed.' };
      }

      const metadata = await sharp(imageBuffer).metadata().catch(() => null);
      if (!metadata || !metadata.format) {
        return { success: false, error: 'Unsupported image format. Please use PNG, JPEG, WebP, or GIF.' };
      }

      const mimeType = `image/${metadata.format as string}`;
      const base64DataUri = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;

      const updatedUser: any = await client.rest.patch(Routes.user(), {
        body: { banner: base64DataUri }
      });

      const bannerUrl =
        client.user?.bannerURL({ size: 1024 }) ||
        (updatedUser?.banner
          ? `https://cdn.discordapp.com/banners/${client.user?.id}/${updatedUser.banner}.png?size=1024`
          : undefined);

      return { success: true, bannerUrl };
    } catch (err: any) {
      console.error('[BotAvatarService] setGlobalBanner failed:', err);
      let errorMsg = err?.message || 'Failed to update global banner.';
      if (err?.code === 50035) {
        errorMsg = 'Discord rejected the banner image format or dimensions. Recommended banner size is 600x240 or 1100x440 under 8 MB.';
      } else if (err?.status === 429) {
        errorMsg = 'Rate limit encountered: Discord allows changing the global bot banner only a few times per 10 minutes.';
      }
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Resets the bot's global profile banner.
   */
  public static async resetGlobalBanner(
    client: Client
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await client.rest.patch(Routes.user(), {
        body: { banner: null }
      });
      return { success: true };
    } catch (err: any) {
      console.error('[BotAvatarService] resetGlobalBanner failed:', err);
      return { success: false, error: err?.message || 'Failed to reset global banner.' };
    }
  }
}
