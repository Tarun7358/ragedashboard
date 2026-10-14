export interface ActionEvent {
  action: string;
  targetName: string;
  timestamp: number;
}

export interface AggregateThreatEvent {
  eventType: string;
  targetName: string;
  weight: number;
  timestamp: number;
}

export class TrustedActorRateLimiter {
  // Key: guildId:userId -> ActionEvent[]
  private static actionsMap = new Map<string, ActionEvent[]>();
  // Key: guildId:userId -> boolean (has warning been sent in current spree)
  private static warnedMap = new Map<string, boolean>();

  // Cross-Event Server-Wide Threat Store: guildId -> AggregateThreatEvent[]
  private static aggregateThreats = new Map<string, AggregateThreatEvent[]>();
  // Circuit Breaker state: guildId -> tripped timestamp
  private static circuitBreakerTripped = new Map<string, number>();

  private static getKey(guildId: string, userId: string): string {
    return `${guildId}:${userId}`;
  }

  public static record(guildId: string, userId: string, action: string, targetName: string, windowSeconds = 10): number {
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

    // If this is the start of a fresh spree in the window, reset warned status
    if (fresh.length <= 1) {
      this.warnedMap.delete(key);
    }

    return fresh.length;
  }

  public static getCount(guildId: string, userId: string, windowSeconds = 10): number {
    const key = this.getKey(guildId, userId);
    const list = this.actionsMap.get(key) || [];
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    return list.filter(a => now - a.timestamp <= windowMs).length;
  }

  public static shouldWarn(guildId: string, userId: string, warnAt = 1, punishAt = 2, windowSeconds = 10): boolean {
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

  public static shouldPunish(guildId: string, userId: string, punishAt = 2, windowSeconds = 10): boolean {
    const count = this.getCount(guildId, userId, windowSeconds);
    return count >= punishAt;
  }

  public static getSummary(guildId: string, userId: string, windowSeconds = 10): string[] {
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

  // ───────────────────────────────────────────────────────────────────────────
  // CROSS-EVENT SERVER-WIDE AGGREGATE VELOCITY & CIRCUIT BREAKER
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Records a high-impact destructive event on a guild level.
   * Runs in RAM in <0.005ms without waiting for audit log or database.
   */
  public static recordAggregateThreat(
    guildId: string,
    eventType: string,
    targetName: string,
    weight = 1.0,
    windowSeconds = 5
  ): { score: number; events: AggregateThreatEvent[] } {
    if (!this.aggregateThreats.has(guildId)) {
      this.aggregateThreats.set(guildId, []);
    }

    const list = this.aggregateThreats.get(guildId)!;
    const now = Date.now();
    list.push({ eventType, targetName, weight, timestamp: now });

    const windowMs = windowSeconds * 1000;
    const fresh = list.filter(e => now - e.timestamp <= windowMs);
    this.aggregateThreats.set(guildId, fresh);

    const score = fresh.reduce((sum, e) => sum + e.weight, 0);
    return { score, events: fresh };
  }

  /**
   * Checks if server-wide destruction velocity trips the Circuit Breaker.
   * Default threshold: 3.0 weight points within 5 seconds.
   */
  public static shouldTripCircuitBreaker(guildId: string, threshold = 3.0, windowSeconds = 5): boolean {
    if (this.isCircuitBreakerTripped(guildId, 60)) {
      return false; // Already tripped and contained
    }

    const list = this.aggregateThreats.get(guildId) || [];
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const fresh = list.filter(e => now - e.timestamp <= windowMs);
    const score = fresh.reduce((sum, e) => sum + e.weight, 0);

    return score >= threshold;
  }

  public static markCircuitBreakerTripped(guildId: string): void {
    this.circuitBreakerTripped.set(guildId, Date.now());
  }

  public static isCircuitBreakerTripped(guildId: string, cooldownSeconds = 60): boolean {
    const trippedTime = this.circuitBreakerTripped.get(guildId);
    if (!trippedTime) return false;
    if (Date.now() - trippedTime > cooldownSeconds * 1000) {
      this.circuitBreakerTripped.delete(guildId);
      return false;
    }
    return true;
  }

  public static getRecentAggregateEvents(guildId: string, windowSeconds = 5): AggregateThreatEvent[] {
    const list = this.aggregateThreats.get(guildId) || [];
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    return list.filter(e => now - e.timestamp <= windowMs);
  }

  public static clearAggregateThreat(guildId: string): void {
    this.aggregateThreats.delete(guildId);
    this.circuitBreakerTripped.delete(guildId);
  }
}
