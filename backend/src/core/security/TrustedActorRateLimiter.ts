export interface ActionEvent {
  action: string;
  targetName: string;
  timestamp: number;
}

export class TrustedActorRateLimiter {
  // Key: guildId:userId -> ActionEvent[]
  private static actionsMap = new Map<string, ActionEvent[]>();
  // Key: guildId:userId -> boolean (has warning been sent in current spree)
  private static warnedMap = new Map<string, boolean>();

  private static getKey(guildId: string, userId: string): string {
    return `${guildId}:${userId}`;
  }

  public static record(guildId: string, userId: string, action: string, targetName: string, windowSeconds = 5): number {
    const key = this.getKey(guildId, userId);
    if (!this.actionsMap.has(key)) {
      this.actionsMap.set(key, []);
    }

    const list = this.actionsMap.get(key)!;
    const now = Date.now();
    list.push({ action, targetName, timestamp: now });

    // Filter out actions outside the rolling window
    const windowMs = windowSeconds * 1000;
    const fresh = list.filter(a => now - a.timestamp <= windowMs);
    this.actionsMap.set(key, fresh);

    return fresh.length;
  }

  public static getCount(guildId: string, userId: string, windowSeconds = 5): number {
    const key = this.getKey(guildId, userId);
    const list = this.actionsMap.get(key) || [];
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    return list.filter(a => now - a.timestamp <= windowMs).length;
  }

  public static shouldWarn(guildId: string, userId: string, warnAt = 1, punishAt = 2, windowSeconds = 5): boolean {
    const count = this.getCount(guildId, userId, windowSeconds);
    const key = this.getKey(guildId, userId);
    const alreadyWarned = this.warnedMap.get(key) || false;

    if (count >= warnAt && count < punishAt && !alreadyWarned) {
      return true;
    }
    return false;
  }

  public static markWarned(guildId: string, userId: string): void {
    const key = this.getKey(guildId, userId);
    this.warnedMap.set(key, true);
  }

  public static shouldPunish(guildId: string, userId: string, punishAt = 2, windowSeconds = 5): boolean {
    const count = this.getCount(guildId, userId, windowSeconds);
    return count >= punishAt;
  }

  public static getSummary(guildId: string, userId: string, windowSeconds = 5): string[] {
    const key = this.getKey(guildId, userId);
    const list = this.actionsMap.get(key) || [];
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const fresh = list.filter(a => now - a.timestamp <= windowMs);

    return fresh.map(item => {
      const timeStr = new Date(item.timestamp).toISOString().substring(11, 19);
      return `• \`${item.action}\` — **${item.targetName}** [${timeStr}]`;
    });
  }

  public static clear(guildId: string, userId: string): void {
    const key = this.getKey(guildId, userId);
    this.actionsMap.delete(key);
    this.warnedMap.delete(key);
  }
}
