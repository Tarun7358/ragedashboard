import { Client, TextChannel } from 'discord.js';
import { Database } from '../core/Database.js';
import { buildSecurityDashboardCard, deploySecurityDashboardToChannel } from '../modules/security/enable.js';

export class DashboardSyncService {
  private static client: Client | null = null;
  private static syncTimers: Map<string, NodeJS.Timeout> = new Map();
  private static backgroundInterval: NodeJS.Timeout | null = null;
  private static isUpdating = false;

  /**
   * Initializes the dashboard sync service with the Discord client
   * and starts the background refresh heartbeat.
   */
  public static init(client: Client): void {
    this.client = client;
    console.log('[DashboardSync] Initialized Live Dashboard Sync Service.');

    if (this.backgroundInterval) {
      clearInterval(this.backgroundInterval);
    }

    // Trigger initial refresh immediately on init
    setTimeout(() => {
      this.refreshAllDashboards().catch(() => {});
    }, 2000);

    // Continuous Live Heartbeat: Auto-refresh registered dashboards every 1 minute
    this.backgroundInterval = setInterval(() => {
      this.refreshAllDashboards().catch((err) => {
        console.warn('[DashboardSync] Error during background refresh:', err?.message || err);
      });
    }, 60 * 1000);
  }

  /**
   * Registers or updates an active dashboard message for a guild.
   */
  public static async registerDashboard(guildId: string, channelId: string, messageId: string): Promise<void> {
    try {
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
      let record = await Database.getDashboard(guildId);
      const guild = this.client.guilds.cache.get(guildId) || await this.client.guilds.fetch(guildId).catch(() => null);
      if (!guild) return false;

      // If not in database, attempt to auto-discover existing #rage-dashboard channel & message
      if (!record) {
        const existingChannel = guild.channels.cache.find((c: any) => c.name === 'rage-dashboard' && c.isTextBased()) as TextChannel | undefined;
        if (existingChannel) {
          const recentMsgs = await existingChannel.messages.fetch({ limit: 10 }).catch(() => null);
          const botMsg = recentMsgs?.find(m => m.author.id === this.client?.user?.id);
          if (botMsg) {
            await this.registerDashboard(guildId, existingChannel.id, botMsg.id);
            record = { guildId, channelId: existingChannel.id, messageId: botMsg.id, updatedAt: Date.now() };
          }
        }
      }

      if (!record) {
        const deployed = await deploySecurityDashboardToChannel(guild);
        return Boolean(deployed);
      }

      const channel = guild.channels.cache.get(record.channelId) as TextChannel || await guild.channels.fetch(record.channelId).catch(() => null) as TextChannel;
      if (!channel || !channel.isTextBased()) {
        const deployed = await deploySecurityDashboardToChannel(guild);
        return Boolean(deployed);
      }

      let message = await channel.messages.fetch(record.messageId).catch(() => null);
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

      // Generate updated live dashboard card with fresh telemetry & timestamp
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
      const dashboards = await Database.getAllDashboards();
      const processedGuildIds = new Set<string>();

      // 1. Process all explicitly registered dashboards
      for (const record of dashboards) {
        const { guildId } = record;
        const guild = this.client.guilds.cache.get(guildId) || await this.client.guilds.fetch(guildId).catch(() => null);
        if (!guild) continue;

        processedGuildIds.add(guildId);
        await this.syncGuildDashboard(guildId);

        // Small delay between guild updates to respect Discord REST rate limits
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // 2. Auto-discover and sync any active #rage-dashboard channels in other connected guilds
      for (const [, guild] of this.client.guilds.cache) {
        if (processedGuildIds.has(guild.id)) continue;
        const dashCh = guild.channels?.cache?.find((c: any) => c.name === 'rage-dashboard' && c.isTextBased());
        if (dashCh) {
          processedGuildIds.add(guild.id);
          await this.syncGuildDashboard(guild.id);
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    } catch (err: any) {
      console.warn('[DashboardSync] Error in refreshAllDashboards:', err?.message || err);
    } finally {
      this.isUpdating = false;
    }
  }
}
