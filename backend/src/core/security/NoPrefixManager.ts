import { Database } from '../Database.js';
import { isOwnerOrExtraOwner } from '../../utils/whitelistCheck.js';
import { Message, PermissionFlagsBits } from 'discord.js';

export interface GuildNoPrefixConfig {
  guildId: string;
  enabled: boolean;
  roles: string[];
  channels: string[];
  users: string[];
}

export class NoPrefixManager {
  private static cache = new Map<string, GuildNoPrefixConfig>();
  private static isInitialized = false;

  private static async ensureTable(): Promise<void> {
    const db = Database.getDb();
    if (!db) return;

    // Detect and drop obsolete table schema if userId column is missing
    try {
      const cols = await db.all<any>('PRAGMA table_info(guild_noprefix)');
      if (cols && cols.length > 0) {
        const hasUserId = cols.some((c: any) => c.name === 'userId');
        if (!hasUserId) {
          console.warn('[NoPrefixManager] Migrating and rebuilding legacy guild_noprefix table...');
          await db.exec('DROP TABLE IF EXISTS guild_noprefix;');
        }
      }
    } catch (e) {
      console.error('[NoPrefixManager] Schema check error:', e);
    }

    await db.exec(`
      CREATE TABLE IF NOT EXISTS guild_noprefix_config (
        guildId TEXT PRIMARY KEY,
        enabled INTEGER DEFAULT 1,
        roles TEXT DEFAULT '[]',
        channels TEXT DEFAULT '[]',
        users TEXT DEFAULT '[]',
        updatedAt INTEGER
      );
      CREATE TABLE IF NOT EXISTS guild_noprefix (
        guildId TEXT NOT NULL,
        userId TEXT NOT NULL,
        addedBy TEXT,
        timestamp INTEGER,
        PRIMARY KEY (guildId, userId)
      );
    `);
  }

  public static async initialize(): Promise<void> {
    if (this.isInitialized) return;
    try {
      await this.ensureTable();
      const db = Database.getDb();
      if (db) {
        const rows = await db.all<any>('SELECT * FROM guild_noprefix_config');
        for (const row of rows || []) {
          this.cache.set(row.guildId, {
            guildId: row.guildId,
            enabled: row.enabled === 1,
            roles: JSON.parse(row.roles || '[]'),
            channels: JSON.parse(row.channels || '[]'),
            users: JSON.parse(row.users || '[]')
          });
        }

        // Migrate/merge legacy guild_noprefix rows if any exist
        const legacyRows = await db.all<{ guildId: string; userId: string }>('SELECT guildId, userId FROM guild_noprefix').catch(() => []);
        for (const legacy of legacyRows || []) {
          const cfg = this.getConfig(legacy.guildId);
          if (!cfg.users.includes(legacy.userId)) {
            cfg.users.push(legacy.userId);
            this.cache.set(legacy.guildId, cfg);
          }
        }
      }
      this.isInitialized = true;
    } catch (e) {
      console.error('[NoPrefixManager] Init error:', e);
    }
  }

  public static async loadAll(): Promise<void> {
    await this.initialize();
  }

  public static getConfig(guildId: string): GuildNoPrefixConfig {
    if (!this.cache.has(guildId)) {
      this.cache.set(guildId, {
        guildId,
        enabled: true,
        roles: [],
        channels: [],
        users: []
      });
    }
    return this.cache.get(guildId)!;
  }

  public static async isAllowed(message: Message): Promise<boolean> {
    if (!message.guild || !message.author) return false;
    const guildId = message.guild.id;
    const userId = message.author.id;

    // 1. Server Owner & Extra Owners ALWAYS have zero-prefix bypass access
    if (await isOwnerOrExtraOwner(userId, message.guild)) {
      return true;
    }

    const cfg = this.getConfig(guildId);
    if (!cfg.enabled) return false;

    // 2. Channel restriction logic:
    // If specific channels are configured, commands are active in those channels!
    if (cfg.channels.length > 0) {
      if (!cfg.channels.includes(message.channelId)) {
        return false;
      }
      // If inside a whitelisted channel:
      // If specific role or user restrictions are also configured, verify them
      if (cfg.roles.length > 0 || cfg.users.length > 0) {
        if (cfg.users.includes(userId)) return true;
        if (message.member?.permissions?.has(PermissionFlagsBits.Administrator)) return true;
        if (cfg.roles.length > 0 && message.member?.roles?.cache?.some(r => cfg.roles.includes(r.id))) return true;
        return false;
      }
      // In the whitelisted channel with no restrictive role list -> ANY member in this channel can use commands!
      return true;
    }

    // 3. Direct whitelisted user
    if (cfg.users.includes(userId)) return true;

    // 4. Server Administrator permission
    if (message.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
      return true;
    }

    // 5. Allowed roles
    if (cfg.roles.length > 0 && message.member?.roles?.cache) {
      const hasRole = cfg.roles.some(rId => message.member!.roles.cache.has(rId));
      if (hasRole) return true;
    }

    // 6. If no channels, no roles, and no user restrictions are configured,
    // and No-Prefix is enabled, allow server members to execute commands!
    if (cfg.roles.length === 0 && cfg.users.length === 0) {
      return true;
    }

    return false;
  }

  public static async isEnabled(guildId: string): Promise<boolean> {
    await this.initialize();
    return this.getConfig(guildId).enabled;
  }

  public static async setEnabled(guildId: string, enabled: boolean): Promise<void> {
    await this.initialize();
    const cfg = this.getConfig(guildId);
    cfg.enabled = enabled;
    await this.save(cfg);
  }

  public static async getNPUsers(guildId: string): Promise<string[]> {
    await this.initialize();
    return [...this.getConfig(guildId).users];
  }

  public static async isNPUser(guildId: string, userId: string): Promise<boolean> {
    await this.initialize();
    return this.getConfig(guildId).users.includes(userId);
  }

  public static async addNPUser(guildId: string, userId: string, addedBy?: string): Promise<boolean> {
    await this.initialize();
    const cfg = this.getConfig(guildId);
    if (!cfg.users.includes(userId)) {
      cfg.users.push(userId);
      await this.save(cfg);

      // Legacy mirror
      const db = Database.getDb();
      if (db) {
        await db.run(
          'INSERT OR REPLACE INTO guild_noprefix (guildId, userId, addedBy, timestamp) VALUES (?, ?, ?, ?)',
          [guildId, userId, addedBy || 'system', Date.now()]
        ).catch(() => null);
      }
      return true;
    }
    return false;
  }

  public static async removeNPUser(guildId: string, userId: string): Promise<boolean> {
    await this.initialize();
    const cfg = this.getConfig(guildId);
    const idx = cfg.users.indexOf(userId);
    if (idx >= 0) {
      cfg.users.splice(idx, 1);
      await this.save(cfg);

      // Legacy mirror
      const db = Database.getDb();
      if (db) {
        await db.run('DELETE FROM guild_noprefix WHERE guildId = ? AND userId = ?', [guildId, userId]).catch(() => null);
      }
      return true;
    }
    return false;
  }

  public static async cleanNPUsers(guildId: string): Promise<void> {
    await this.initialize();
    const cfg = this.getConfig(guildId);
    cfg.users = [];
    await this.save(cfg);

    const db = Database.getDb();
    if (db) {
      await db.run('DELETE FROM guild_noprefix WHERE guildId = ?', [guildId]).catch(() => null);
    }
  }

  public static async toggleRole(guildId: string, roleId: string): Promise<boolean> {
    await this.initialize();
    const cfg = this.getConfig(guildId);
    const idx = cfg.roles.indexOf(roleId);
    let added = false;
    if (idx >= 0) {
      cfg.roles.splice(idx, 1);
    } else {
      cfg.roles.push(roleId);
      added = true;
    }
    await this.save(cfg);
    return added;
  }

  public static async toggleChannel(guildId: string, channelId: string): Promise<boolean> {
    await this.initialize();
    const cfg = this.getConfig(guildId);
    const idx = cfg.channels.indexOf(channelId);
    let added = false;
    if (idx >= 0) {
      cfg.channels.splice(idx, 1);
    } else {
      cfg.channels.push(channelId);
      added = true;
    }
    await this.save(cfg);
    return added;
  }

  public static async toggleUser(guildId: string, userId: string): Promise<boolean> {
    await this.initialize();
    const cfg = this.getConfig(guildId);
    const idx = cfg.users.indexOf(userId);
    let added = false;
    if (idx >= 0) {
      cfg.users.splice(idx, 1);
    } else {
      cfg.users.push(userId);
      added = true;
    }
    await this.save(cfg);
    return added;
  }

  private static async save(cfg: GuildNoPrefixConfig): Promise<void> {
    this.cache.set(cfg.guildId, cfg);
    const db = Database.getDb();
    if (db) {
      await db.run(
        `INSERT OR REPLACE INTO guild_noprefix_config (guildId, enabled, roles, channels, users, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          cfg.guildId,
          cfg.enabled ? 1 : 0,
          JSON.stringify(cfg.roles),
          JSON.stringify(cfg.channels),
          JSON.stringify(cfg.users),
          Date.now()
        ]
      ).catch(e => console.error('[NoPrefixManager] Save error:', e));
    }
  }
}
