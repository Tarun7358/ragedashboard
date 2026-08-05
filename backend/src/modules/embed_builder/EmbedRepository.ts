import { Database } from '../../core/Database.js';

export interface SavedEmbedRecord {
  guildId: string;
  name: string;
  embedData: string; // JSON string
  authorId: string;
  updatedAt: number;
}

export class EmbedRepository {
  /**
   * Save or update an embed template preset for a guild.
   */
  public static async saveEmbed(guildId: string, name: string, embedData: Record<string, any>, authorId: string): Promise<boolean> {
    const db = Database.getDb();
    if (!db) return false;

    const nameLower = name.toLowerCase().trim();
    const jsonStr = JSON.stringify(embedData);
    const now = Math.floor(Date.now() / 1000);

    const sql = `
      INSERT INTO guild_custom_embeds (guildId, name, embedData, authorId, updatedAt)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(guildId, name) DO UPDATE SET
        embedData = excluded.embedData,
        authorId = excluded.authorId,
        updatedAt = excluded.updatedAt;
    `;

    await db.run(sql, [guildId, nameLower, jsonStr, authorId, now]);
    return true;
  }

  /**
   * Fetch a saved embed template preset by name for a guild.
   */
  public static async getEmbed(guildId: string, name: string): Promise<SavedEmbedRecord | null> {
    const db = Database.getDb();
    if (!db) return null;

    const nameLower = name.toLowerCase().trim();
    const sql = `SELECT * FROM guild_custom_embeds WHERE guildId = ? AND name = ?;`;
    const record = await db.get<SavedEmbedRecord>(sql, [guildId, nameLower]);
    return record || null;
  }

  /**
   * List all saved embed template presets for a guild.
   */
  public static async listEmbeds(guildId: string): Promise<SavedEmbedRecord[]> {
    const db = Database.getDb();
    if (!db) return [];

    const sql = `SELECT * FROM guild_custom_embeds WHERE guildId = ? ORDER BY name ASC;`;
    const rows = await db.all<SavedEmbedRecord>(sql, [guildId]);
    return rows || [];
  }

  /**
   * Delete a saved embed template preset by name for a guild.
   */
  public static async deleteEmbed(guildId: string, name: string): Promise<boolean> {
    const db = Database.getDb();
    if (!db) return false;

    const nameLower = name.toLowerCase().trim();
    const sql = `DELETE FROM guild_custom_embeds WHERE guildId = ? AND name = ?;`;
    const result = await db.run(sql, [guildId, nameLower]);
    return result.changes > 0;
  }
}
