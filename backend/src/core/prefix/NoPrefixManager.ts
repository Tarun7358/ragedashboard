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
  private static isLoaded = false;

  public static async initialize(): Promise<void> {
    if (this.isLoaded) return;
    try {
      const db = Database.getDb();
      if (db) {
        await db.run(`
          CREATE TABLE IF NOT EXISTS guild_noprefix (
            guildId TEXT PRIMARY KEY,
            enabled INTEGER DEFAULT 1,
            roles TEXT DEFAULT '[]',
            channels TEXT DEFAULT '[]',
            users TEXT DEFAULT '[]',
            updatedAt INTEGER
          )
        `);

        const rows = await db.all<any>('SELECT * FROM guild_noprefix');
        for (const row of rows || []) {
          this.cache.set(row.guildId, {
            guildId: row.guildId,
            enabled: row.enabled === 1,
            roles: JSON.parse(row.roles || '[]'),
            channels: JSON.parse(row.channels || '[]'),
            users: JSON.parse(row.users || '[]')
          });
        }
      }
      this.isLoaded = true;
    } catch (e) {
      console.error('[NoPrefixManager] Init error:', e);
    }
  }

  public static getConfig(guildId: string): GuildNoPrefixConfig {
    if (!this.cache.has(guildId)) {
      this.cache.set(guildId, {
        guildId,
        enabled: true, // Enabled by default for Server Owner & Extra Owners
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

    // 1. Server Owner & Extra Owners ALWAYS have No-Prefix access
    if (await isOwnerOrExtraOwner(userId, message.guild)) {
      return true;
    }

    const cfg = this.getConfig(guildId);
    if (!cfg.enabled) return false;

    // 2. Direct whitelisted user
    if (cfg.users.includes(userId)) return true;

    // 3. Channel restriction: if specific channels configured, message must be in one of them
    if (cfg.channels.length > 0 && !cfg.channels.includes(message.channelId)) {
      return false;
    }

    // 4. Server Administrator permission
    if (message.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
      return true;
    }

    // 5. Allowed roles
    if (cfg.roles.length > 0 && message.member?.roles?.cache) {
      const hasRole = cfg.roles.some(rId => message.member!.roles.cache.has(rId));
      if (hasRole) return true;
    }

    return false;
  }

  public static async setEnabled(guildId: string, enabled: boolean): Promise<void> {
    const cfg = this.getConfig(guildId);
    cfg.enabled = enabled;
    await this.save(cfg);
  }

  public static async toggleRole(guildId: string, roleId: string): Promise<boolean> {
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
        `INSERT OR REPLACE INTO guild_noprefix (guildId, enabled, roles, channels, users, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          cfg.guildId,
          cfg.enabled ? 1 : 0,
          JSON.stringify(cfg.roles),
          JSON.stringify(cfg.channels),
          JSON.stringify(cfg.users),
          Date.now()
        ]
      );
    }
  }
}
