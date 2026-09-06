import { Client, TextChannel } from 'discord.js';
import { Database } from '../core/Database.js';
import { buildSecurityDashboardCard, deploySecurityDashboardToChannel } from '../modules/security/enable.js';

export class DashboardSyncService {
  private static client: Client | null = null;
  private static syncTimers: Map<string, NodeJS.Timeout> = new Map();
  private static backgroundInterval: NodeJS.Timeout | null = null;
  private static isUpdating = false;

  // In-Memory Fast RAM Cache for instant 0ms message resolution: guildId -> { channelId, messageId }
  private static inMemoryCache = new Map<string, { channelId: string; messageId: string }>();

  /**
   * Initializes the dashboard sync service with the Discord client
   * and starts the continuous background refresh heartbeat.
   */
  public static init(client: Client): void {
    this.client = client;
    console.log('[DashboardSync] Initialized Live Dashboard Sync Service (Heartbeat Active).');

    if (this.backgroundInterval) {
      clearInterval(this.backgroundInterval);
    }

    // Trigger initial refresh immediately on startup after 3s delay for Discord caches to warm up
    setTimeout(() => {
      this.refreshAllDashboards().catch((err) => {
        console.warn('[DashboardSync] Initial warmup refresh warning:', err?.message || err);
      });
    }, 3000);

    // Continuous Live Heartbeat: Auto-refresh registered dashboards every 30 seconds
    this.backgroundInterval = setInterval(() => {
      this.refreshAllDashboards().catch((err) => {
        console.warn('[DashboardSync] Background auto-update error:', err?.message || err);
      });
    }, 30 * 1000);
  }

  /**
   * Registers or updates an active dashboard message for a guild (persists to RAM & SQLite).
   */
  public static async registerDashboard(guildId: string, channelId: string, messageId: string): Promise<void> {
    try {
      this.inMemoryCache.set(guildId, { channelId, messageId });
      await Database.registerDashboard(guildId, channelId, messageId);
      console.log(`[DashboardSync] Registered dashboard for guild ${guildId} (channel: ${channelId}, msg: ${messageId})`);
    } catch (err: any) {
      console.warn(`[DashboardSync] Failed to register dashboard for guild ${guildId}:`, err?.message || err);
    }
  }

  /**
   * Triggers a debounced live sync update for a guild.
   * Debouncing avoids hitting Discord REST rate limits during rapid security events.
   */
  public static triggerSync(guildId: string, delayMs = 1000): void {
    if (!this.client) return;

    const existingTimer = this.syncTimers.get(guildId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
      this.syncTimers.delete(guildId);
      await this.syncGuildDashboard(guildId);
    }, delayMs);

    this.syncTimers.set(guildId, timer);
  }

  /**
   * Immediately syncs a single guild dashboard.
   */
  public static async syncGuildDashboard(guildId: string): Promise<boolean> {
    if (!this.client) return false;

    try {
      // 1. Check in-memory RAM cache first, fallback to SQLite
      let channelId = this.inMemoryCache.get(guildId)?.channelId;
      let messageId = this.inMemoryCache.get(guildId)?.messageId;

      if (!channelId || !messageId) {
        const record = await Database.getDashboard(guildId);
        if (record) {
          channelId = record.channelId;
          messageId = record.messageId;
          this.inMemoryCache.set(guildId, { channelId, messageId });
        }
      }

      const guild = this.client.guilds.cache.get(guildId) || await this.client.guilds.fetch(guildId).catch(() => null);
      if (!guild) return false;

      // 2. Auto-discover #rage-dashboard channel if no record exists
      if (!channelId || !messageId) {
        const existingChannel = guild.channels.cache.find((c: any) => c.name === 'rage-dashboard' && c.isTextBased()) as TextChannel | undefined;
        if (existingChannel) {
          const recentMsgs = await existingChannel.messages.fetch({ limit: 10 }).catch(() => null);
          const botMsg = recentMsgs?.find(m => m.author.id === this.client?.user?.id);
          if (botMsg) {
            await this.registerDashboard(guildId, existingChannel.id, botMsg.id);
            channelId = existingChannel.id;
            messageId = botMsg.id;
          }
        }
      }

      // If still not found, deploy fresh dashboard
      if (!channelId || !messageId) {
        const deployed = await deploySecurityDashboardToChannel(guild);
        return Boolean(deployed);
      }

      // 3. Fetch channel and message
      const channel = guild.channels.cache.get(channelId) as TextChannel || await guild.channels.fetch(channelId).catch(() => null) as TextChannel;
      if (!channel || !channel.isTextBased()) {
        const deployed = await deploySecurityDashboardToChannel(guild);
        return Boolean(deployed);
      }

      let message = await channel.messages.fetch(messageId).catch(() => null);
      if (!message) {
        // Search recent messages before recreating to avoid duplicate messages
        const recentMsgs = await channel.messages.fetch({ limit: 10 }).catch(() => null);
        message = recentMsgs?.find(m => m.author.id === this.client?.user?.id) || null;
        if (message) {
          await this.registerDashboard(guildId, channel.id, message.id);
        } else {
          const deployed = await deploySecurityDashboardToChannel(guild);
          return Boolean(deployed);
        }
      }

      // 4. Generate updated live dashboard card with fresh telemetry & timestamp
      const dashboard = await buildSecurityDashboardCard(guild);
      await message.edit({
        content: dashboard.content || undefined,
        embeds: dashboard.embeds,
        components: dashboard.components
      }).catch(async (editErr: any) => {
        console.warn(`[DashboardSync] Edit failed for guild ${guildId}, redeploying fresh:`, editErr?.message || editErr);
        await deploySecurityDashboardToChannel(guild).catch(() => {});
      });

      return true;
    } catch (err: any) {
      if (err?.code === 10008 || err?.code === 10003) {
        this.inMemoryCache.delete(guildId);
        await Database.removeDashboard(guildId).catch(() => {});
      }
      return false;
    }
  }

  /**
   * Refreshes all registered guild dashboards across the bot.
   * Only syncs guilds that have an existing dashboard registered or a #rage-dashboard channel.
   * Does NOT deploy new dashboards to guilds that never had one set up.
   */
  public static async refreshAllDashboards(): Promise<void> {
    if (!this.client || this.isUpdating) return;
    this.isUpdating = true;

    try {
      const dashboards = await Database.getAllDashboards().catch(() => []);
      const processedGuildIds = new Set<string>();

      // 1. Process all explicitly registered dashboards from SQLite
      for (const record of dashboards) {
        const { guildId } = record;
        const guild = this.client.guilds.cache.get(guildId) || await this.client.guilds.fetch(guildId).catch(() => null);
        if (!guild) continue;

        processedGuildIds.add(guildId);
        await this.syncGuildDashboard(guildId);

        // Small delay between guild updates to respect Discord REST rate limits
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      // 2. Process all RAM cached dashboards
      for (const [guildId] of this.inMemoryCache) {
        if (processedGuildIds.has(guildId)) continue;
        const guild = this.client.guilds.cache.get(guildId) || await this.client.guilds.fetch(guildId).catch(() => null);
        if (!guild) continue;

        processedGuildIds.add(guildId);
        await this.syncGuildDashboard(guildId);
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      // 3. Auto-discover and sync any active #rage-dashboard channels in connected guilds
      for (const [, guild] of this.client.guilds.cache) {
        if (processedGuildIds.has(guild.id)) continue;
        const dashCh = guild.channels?.cache?.find((c: any) => c.name === 'rage-dashboard' && c.isTextBased());
        if (dashCh) {
          processedGuildIds.add(guild.id);
          await this.syncGuildDashboard(guild.id);
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
    } catch (err: any) {
      console.warn('[DashboardSync] Error in refreshAllDashboards:', err?.message || err);
    } finally {
      this.isUpdating = false;
    }
  }
}
