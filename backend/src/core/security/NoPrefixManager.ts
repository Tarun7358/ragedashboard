import { Database } from '../Database.js';

export class NoPrefixManager {
  private static cache = new Map<string, Set<string>>();
  private static isInitialized = false;

  private static async ensureTable(): Promise<void> {
    const db = Database.getDb();
    if (!db) return;
    await db.exec(`
      CREATE TABLE IF NOT EXISTS guild_noprefix (
        guildId TEXT NOT NULL,
        userId TEXT NOT NULL,
        addedBy TEXT,
        timestamp INTEGER,
        PRIMARY KEY (guildId, userId)
      )
    `);
  }

  public static async loadAll(): Promise<void> {
    if (this.isInitialized) return;
    try {
      await this.ensureTable();
      const db = Database.getDb();
      if (db) {
        const rows = await db.all<{ guildId: string; userId: string }>('SELECT guildId, userId FROM guild_noprefix');
        for (const row of rows) {
          if (!this.cache.has(row.guildId)) {
            this.cache.set(row.guildId, new Set());
          }
          this.cache.get(row.guildId)!.add(row.userId);
        }
      }
      this.isInitialized = true;
    } catch (e) {
      console.error('[NoPrefixManager] Error initializing table:', e);
    }
  }

  public static async getNPUsers(guildId: string): Promise<string[]> {
    await this.loadAll();
    const set = this.cache.get(guildId);
    return set ? Array.from(set) : [];
  }

  public static async isNPUser(guildId: string, userId: string): Promise<boolean> {
    await this.loadAll();
    const set = this.cache.get(guildId);
    return set ? set.has(userId) : false;
  }

  public static async addNPUser(guildId: string, userId: string, addedBy: string): Promise<boolean> {
    await this.loadAll();
    const db = Database.getDb();
    if (!db) return false;

    await db.run(
      'INSERT OR REPLACE INTO guild_noprefix (guildId, userId, addedBy, timestamp) VALUES (?, ?, ?, ?)',
      [guildId, userId, addedBy, Date.now()]
    );

    if (!this.cache.has(guildId)) {
      this.cache.set(guildId, new Set());
    }
    this.cache.get(guildId)!.add(userId);
    return true;
  }

  public static async removeNPUser(guildId: string, userId: string): Promise<boolean> {
    await this.loadAll();
    const db = Database.getDb();
    if (!db) return false;

    await db.run('DELETE FROM guild_noprefix WHERE guildId = ? AND userId = ?', [guildId, userId]);

    if (this.cache.has(guildId)) {
      this.cache.get(guildId)!.delete(userId);
    }
    return true;
  }

  public static async cleanNPUsers(guildId: string): Promise<void> {
    await this.loadAll();
    const db = Database.getDb();
    if (!db) return;

    await db.run('DELETE FROM guild_noprefix WHERE guildId = ?', [guildId]);
    this.cache.delete(guildId);
  }
}
