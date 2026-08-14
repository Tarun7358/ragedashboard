import { Message } from 'discord.js';
import { Database } from '../Database.js';

export interface PrefixResolveResult {
  matched: boolean;
  isMention: boolean;
  isMentionOnly: boolean;
  prefixUsed: string;
  commandString: string;
}

export class PrefixResolver {
  public static DEFAULT_PREFIX = 'r!';
  private static prefixCache = new Map<string, string>();
  private static isLoaded = false;

  public static async loadAllPrefixes(): Promise<void> {
    if (this.isLoaded) return;
    try {
      const db = Database.getDb();
      if (db) {
        const rows = await db.all<{ guildId: string; prefix: string }>('SELECT guildId, prefix FROM guild_prefixes');
        for (const row of rows) {
          this.prefixCache.set(row.guildId, row.prefix);
        }
      }
      this.isLoaded = true;
    } catch (e) {
      console.error('[PrefixResolver] Error pre-loading guild prefixes:', e);
    }
  }

  public static getPrefix(guildId?: string): string {
    if (!guildId) return this.DEFAULT_PREFIX;
    return this.prefixCache.get(guildId) || this.DEFAULT_PREFIX;
  }

  public static async setPrefix(guildId: string, prefix: string): Promise<string> {
    const cleanPrefix = prefix.trim();
    if (!cleanPrefix || cleanPrefix.length > 10) {
      throw new Error('Prefix must be between 1 and 10 characters long.');
    }
    this.prefixCache.set(guildId, cleanPrefix);
    const db = Database.getDb();
    if (db) {
      await db.run(
        'INSERT OR REPLACE INTO guild_prefixes (guildId, prefix, updatedAt) VALUES (?, ?, ?)',
        [guildId, cleanPrefix, Date.now()]
      );
    }
    return cleanPrefix;
  }

  public static async resetPrefix(guildId: string): Promise<string> {
    this.prefixCache.delete(guildId);
    const db = Database.getDb();
    if (db) {
      await db.run('DELETE FROM guild_prefixes WHERE guildId = ?', [guildId]);
    }
    return this.DEFAULT_PREFIX;
  }

  public static resolvePrefix(message: Message, botUserId?: string): PrefixResolveResult {
    const content = message.content;
    if (!content || typeof content !== 'string') {
      return { matched: false, isMention: false, isMentionOnly: false, prefixUsed: '', commandString: '' };
    }

    const guildId = message.guildId || undefined;
    const customPrefix = this.getPrefix(guildId);

    // 1. Check Mention Prefix (@Bot or <@!botId> / <@botId>)
    if (botUserId) {
      const mentionRegex = new RegExp(`^<@!?${botUserId}>\\s*`, 'i');
      const mentionMatch = content.match(mentionRegex);
      if (mentionMatch) {
        const prefixUsed = mentionMatch[0];
        const commandString = content.slice(prefixUsed.length).trim();
        const isMentionOnly = commandString.length === 0;
        return {
          matched: true,
          isMention: true,
          isMentionOnly,
          prefixUsed: `@Rage Optimiser`,
          commandString
        };
      }
    }

    // 2. Check Guild Prefix (case-insensitive)
    const lowerContent = content.toLowerCase();
    const lowerCustomPrefix = customPrefix.toLowerCase();

    if (lowerContent.startsWith(lowerCustomPrefix)) {
      const prefixUsed = content.slice(0, customPrefix.length);
      const commandString = content.slice(customPrefix.length).trim();
      return {
        matched: true,
        isMention: false,
        isMentionOnly: false,
        prefixUsed,
        commandString
      };
    }

    // 3. Fallback check for standard prefixes (r!, r?, r., r/)
    const fallbackPrefixes = [this.DEFAULT_PREFIX.toLowerCase(), 'r?', 'r.', 'r/'];
    for (const fb of fallbackPrefixes) {
      if (lowerContent.startsWith(fb)) {
        const prefixUsed = content.slice(0, fb.length);
        const commandString = content.slice(fb.length).trim();
        return {
          matched: true,
          isMention: false,
          isMentionOnly: false,
          prefixUsed,
          commandString
        };
      }
    }

    return { matched: false, isMention: false, isMentionOnly: false, prefixUsed: '', commandString: '' };
  }
}
