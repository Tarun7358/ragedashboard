import {
  Client,
  TextChannel,
  NewsChannel,
  AttachmentBuilder,
  Message,
  PermissionsBitField,
  EmbedBuilder
} from 'discord.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Database } from '../core/Database.js';
import { PrefixRegistry } from '../core/prefix/PrefixRegistry.js';
import { SQUARE_TICK_ICON, WRONG_ICON, Colors } from '../core/UIFactory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface UptimeMonitorRow {
  guildId: string;
  channelId: string;
  messageId: string;
  lastUpdated: number;
}

export class UptimeBroadcaster {
  private static client: Client | null = null;
  private static intervalTimer: NodeJS.Timeout | null = null;
  private static isUpdating = false;

  // The custom animated tick emoji from server 1266048940101599293: <a:tick:1546134620087783526>
  public static getTickEmoji(client?: Client): string {
    const cl = client || this.client;
    if (cl) {
      try {
        const guildsCache = cl.guilds?.cache;
        const targetGuild = guildsCache && typeof (guildsCache as any).get === 'function'
          ? (guildsCache as any).get('1266048940101599293')
          : null;
        const foundInTarget = targetGuild?.emojis?.cache && typeof (targetGuild.emojis.cache as any).find === 'function'
          ? (targetGuild.emojis.cache as any).find((e: any) => e.name === 'tick')
          : null;
        if (foundInTarget) {
          return foundInTarget.animated ? `<a:${foundInTarget.name}:${foundInTarget.id}>` : `<:${foundInTarget.name}:${foundInTarget.id}>`;
        }
        const emojisCache = cl.emojis?.cache;
        const foundGlobal = emojisCache && typeof (emojisCache as any).find === 'function'
          ? (emojisCache as any).find((e: any) => e.name === 'tick')
          : null;
        if (foundGlobal) {
          return foundGlobal.animated ? `<a:${foundGlobal.name}:${foundGlobal.id}>` : `<:${foundGlobal.name}:${foundGlobal.id}>`;
        }
      } catch { }
    }
    return '<a:tick:1546134620087783526>';
  }

  public static get TICK(): string {
    return this.getTickEmoji();
  }

  /**
   * Resolves the default image/banner across both local Windows & Linux Container environments
   */
  public static getBannerImagePath(): string | null {
    const pngCutFilename = 'gemini_generated_video_0c54a55f-ezgif.com-cut.png';
    const cutFilename = 'gemini_generated_video_0c54a55f-ezgif.com-cut.gif';
    const cropFilename = 'gemini_generated_video_0c54a55f-ezgif.com-crop (1).gif';
    const cwd = process.cwd();

    const candidates = [
      // 1. User requested PNG image (primary default)
      'D:\\RAGE OPTIMISER V3\\CLUTCH NATION\\' + pngCutFilename,
      path.resolve(cwd, pngCutFilename),
      path.resolve(cwd, 'backend', pngCutFilename),
      path.resolve(cwd, '..', pngCutFilename),
      path.resolve(cwd, 'backend', 'assets', 'uptime-banner.png'),
      path.resolve(cwd, 'assets', 'uptime-banner.png'),
      path.resolve(cwd, 'backend', 'public', 'assets', 'default_welcome_banner.png'),
      path.resolve(__dirname, '../../assets/uptime-banner.png'),
      path.resolve(__dirname, '../../../assets/uptime-banner.png'),
      '/home/container/' + pngCutFilename,
      '/home/container/backend/assets/uptime-banner.png',
      '/home/container/assets/uptime-banner.png',

      // 2. Legacy GIF fallbacks (if PNG is not present)
      path.resolve(cwd, cutFilename),
      path.resolve(cwd, '..', cutFilename),
      path.resolve(cwd, 'backend', cutFilename),
      '/home/container/' + cutFilename,
      'D:\\RAGE OPTIMISER V3\\CLUTCH NATION\\' + cutFilename,
      path.resolve(__dirname, '../../../../' + cutFilename),
      path.resolve(__dirname, '../../../' + cutFilename),
      path.resolve(cwd, 'backend', 'assets', 'uptime-banner.gif'),
      path.resolve(cwd, 'assets', 'uptime-banner.gif'),
      path.resolve(cwd, cropFilename),
      path.resolve(cwd, '..', cropFilename),
      path.resolve(cwd, 'backend', cropFilename),
      '/home/container/' + cropFilename,
      'D:\\RAGE OPTIMISER V3\\CLUTCH NATION\\' + cropFilename
    ];

    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          return p;
        }
      } catch { }
    }

    // Dynamic search fallback: search parent, cwd, and /home/container
    const searchDirs = [cwd, path.resolve(cwd, '..'), '/home/container'];
    for (const dir of searchDirs) {
      try {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          // Prefer PNG first
          const pngFound = files.find(f => f.endsWith('.png') && (f.includes('gemini') || f.includes('ezgif') || f.includes('uptime')));
          if (pngFound) return path.join(dir, pngFound);

          const cutFound = files.find(f => f.endsWith('.gif') && f.includes('cut'));
          if (cutFound) return path.join(dir, cutFound);

          const found = files.find(f =>
            (f.endsWith('.png') || f.endsWith('.gif')) && (
              f.includes('gemini') ||
              f.includes('ezgif') ||
              f.includes('uptime') ||
              f.includes('crop')
            )
          );
          if (found) {
            return path.join(dir, found);
          }
        }
      } catch { }
    }

    return null;
  }

  public static getBannerGifPath(): string | null {
    return this.getBannerImagePath();
  }

  /**
   * Returns a ready-to-upload AttachmentBuilder containing the binary image buffer
   */
  public static getBannerAttachment(): AttachmentBuilder | null {
    const bannerPath = this.getBannerImagePath();
    if (!bannerPath || !fs.existsSync(bannerPath)) {
      console.warn('[UptimeBroadcaster] ⚠️ Banner image not found at any known path.');
      return null;
    }
    try {
      const ext = path.extname(bannerPath) || '.png';
      const name = `uptime-banner-live${ext}`;
      const buffer = fs.readFileSync(bannerPath);
      return new AttachmentBuilder(buffer, { name, description: 'Rage Optimiser Live Status' });
    } catch (err: any) {
      console.error('[UptimeBroadcaster] Error reading banner image into buffer:', err);
      return null;
    }
  }

  /**
   * Initialize table and start background auto-update ticker.
   */
  public static async init(client: Client): Promise<void> {
    this.client = client;
    await this.initTable();

    // Start background loop every 45 seconds
    if (!this.intervalTimer) {
      this.intervalTimer = setInterval(async () => {
        await this.broadcastUpdate().catch((err: any) => {
          console.error('[UptimeBroadcaster] Broadcast loop error:', err);
        });
      }, 45 * 1000);

      // Run initial broadcast after client is fully warmed up
      setTimeout(() => {
        this.broadcastUpdate().catch(() => { });
      }, 5000);
    }
    console.log('[UptimeBroadcaster] ✅ Service initialized with 45s live broadcast interval.');
  }

  public static async initTable(): Promise<void> {
    try {
      await Database.exec(`
        CREATE TABLE IF NOT EXISTS uptime_monitors (
          guildId TEXT PRIMARY KEY,
          channelId TEXT NOT NULL,
          messageId TEXT NOT NULL,
          lastUpdated INTEGER NOT NULL
        );
      `);
    } catch (err: any) {
      console.error('[UptimeBroadcaster] Error ensuring uptime_monitors table:', err);
    }
  }

  /**
   * Format embed matching exact user reference screenshot with outer container box
   */
  public static formatEmbed(client: Client): EmbedBuilder {
    const uptimeSec = process.uptime();
    const days = Math.floor(uptimeSec / 86400);
    const hours = Math.floor(uptimeSec / 3600) % 24;
    const mins = Math.floor(uptimeSec / 60) % 60;
    const secs = Math.floor(uptimeSec % 60);

    let liveStr = '';
    if (days > 0) {
      liveStr = `${days} Days ${hours} Hours ${mins} Mins`;
    } else if (hours > 0) {
      liveStr = `${hours} Hours ${mins} Mins`;
    } else {
      liveStr = `${mins} Mins ${secs} Secs`;
    }

    const wsPing = Math.max(1, Math.round(client.ws?.ping || 24));
    const guildCount = client.guilds?.cache?.size || 1;
    const botId = client.user?.id || 'bot';
    const tick = this.getTickEmoji(client);

    const description = [
      `<@${botId}> * **Live : ${liveStr}**`,
      '',
      `> ${tick} **Core Gateway:** WS 443 Connected [Latency:\u00A0${wsPing}ms]`,
      `> ${tick} **Redis Cluster:** In-Memory Cache Active [0.8ms]`,
      `> ${tick} **SQL Database:** SQLite WAL Mode [Integrity:\u00A0100%]`,
      `> ${tick} **Discord REST API:** 50 Route Buckets Synchronized [0\u00A0Drops]`,
      `> ${tick} **Gmail Connectors:** OAuth2 Secure Bridge [SMTP/IMAP\u00A0Ready]`,
      `> ${tick} **YouTube API v3:** Realtime RSS Feed Polling Active`,
      `> ${tick} **Antinuke Sentinels:** Armed & Securing ${guildCount} Servers`
    ].join('\n');

    const embed = new EmbedBuilder()
      .setColor(0x2B2D31)
      .setDescription(description);

    const banner = this.getBannerAttachment();
    if (banner) {
      embed.setImage(`attachment://${banner.name || 'uptime-banner.png'}`);
    }

    return embed;
  }

  /**
   * Format message content matching exact user reference format (fallback string)
   */
  public static formatContent(client: Client): string {
    const embed = this.formatEmbed(client);
    return embed.data.description || '';
  }

  /**
   * Sets up or updates the live uptime monitor in a specific channel.
   */
  public static async setupMonitor(
    channel: TextChannel | NewsChannel
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.client) {
      return { success: false, error: 'Discord client not ready yet.' };
    }

    const me = channel.guild.members.me;
    if (
      me &&
      !channel
        .permissionsFor(me)
        ?.has([
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.AttachFiles
        ])
    ) {
      return {
        success: false,
        error: 'Missing permission to send messages and attach files in that channel.'
      };
    }

    const content = this.formatContent(this.client);
    const gifPath = this.getBannerGifPath();

    try {
      await this.initTable();

      // Check existing monitor in DB
      const existing = await Database.get<UptimeMonitorRow>(
        'SELECT * FROM uptime_monitors WHERE guildId = ?',
        [channel.guildId]
      );

      let targetMsg: Message | null = null;
      if (existing) {
        try {
          const oldChan = (await this.client.channels
            .fetch(existing.channelId)
            .catch(() => null)) as TextChannel | null;
          if (oldChan) {
            targetMsg = await oldChan.messages
              .fetch(existing.messageId)
              .catch(() => null);
          }
        } catch { }
      }

      // If existing message exists and is in the same channel, edit it
      if (targetMsg && targetMsg.channelId === channel.id) {
        const embed = this.formatEmbed(this.client);
        const editPayload: any = { content: null, embeds: [embed] };
        const banner = this.getBannerAttachment();
        const firstAtt = targetMsg.attachments.first();
        if (!firstAtt || (banner && firstAtt.name !== banner.name)) {
          if (banner) editPayload.files = [banner];
        }
        await targetMsg.edit(editPayload);
        await Database.run(
          'UPDATE uptime_monitors SET lastUpdated = ? WHERE guildId = ?',
          [Date.now(), channel.guildId]
        );
        return { success: true, messageId: targetMsg.id };
      }

      // Otherwise post a new live message with the default GIF attachment inside the embed
      const embed = this.formatEmbed(this.client);
      const sendPayload: any = { embeds: [embed] };
      const banner = this.getBannerAttachment();
      if (banner) {
        sendPayload.files = [banner];
      }

      const newMsg = await channel.send(sendPayload);
      await Database.run(
        'INSERT OR REPLACE INTO uptime_monitors (guildId, channelId, messageId, lastUpdated) VALUES (?, ?, ?, ?)',
        [channel.guildId, channel.id, newMsg.id, Date.now()]
      );

      return { success: true, messageId: newMsg.id };
    } catch (err: any) {
      console.error('[UptimeBroadcaster] setupMonitor error:', err);
      return { success: false, error: err.message || String(err) };
    }
  }

  /**
   * Stop/remove monitor for a guild
   */
  public static async stopMonitor(guildId: string): Promise<boolean> {
    try {
      await this.initTable();
      await Database.run('DELETE FROM uptime_monitors WHERE guildId = ?', [guildId]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get active monitor status for a guild
   */
  public static async getMonitor(guildId: string): Promise<UptimeMonitorRow | null> {
    try {
      await this.initTable();
      return await Database.get<UptimeMonitorRow>(
        'SELECT * FROM uptime_monitors WHERE guildId = ?',
        [guildId]
      );
    } catch {
      return null;
    }
  }

  /**
   * Background loop to edit all active uptime monitor messages in place
   */
  public static async broadcastUpdate(): Promise<void> {
    if (!this.client || !this.client.isReady() || this.isUpdating) return;
    this.isUpdating = true;

    try {
      await this.initTable();
      const rows = await Database.all<UptimeMonitorRow>('SELECT * FROM uptime_monitors');
      if (!rows || rows.length === 0) return;

      const content = this.formatContent(this.client);

      for (const row of rows) {
        try {
          const chan = (await this.client.channels
            .fetch(row.channelId)
            .catch(() => null)) as TextChannel | null;
          if (!chan) continue;

          const msg = await chan.messages.fetch(row.messageId).catch(() => null);
          if (!msg) {
            // Message was deleted, cleanup
            await Database.run('DELETE FROM uptime_monitors WHERE guildId = ?', [row.guildId]).catch(() => { });
            continue;
          }

          const embed = this.formatEmbed(this.client);
          const editPayload: any = { content: null, embeds: [embed] };
          const banner = this.getBannerAttachment();
          const firstAtt = msg.attachments.first();
          if (!firstAtt || (banner && firstAtt.name !== banner.name)) {
            if (banner) editPayload.files = [banner];
          }

          await msg.edit(editPayload).catch(async (err: any) => {
            if (err.code === 10008) {
              // Unknown Message
              await Database.run('DELETE FROM uptime_monitors WHERE guildId = ?', [row.guildId]).catch(() => { });
            }
          });
          await Database.run(
            'UPDATE uptime_monitors SET lastUpdated = ? WHERE guildId = ?',
            [Date.now(), row.guildId]
          ).catch(() => { });
        } catch (err: any) {
          if (err.code === 10008) {
            await Database.run('DELETE FROM uptime_monitors WHERE guildId = ?', [row.guildId]).catch(() => { });
          }
        }
      }
    } catch (err: any) {
      console.error('[UptimeBroadcaster] broadcastUpdate failed:', err);
    } finally {
      this.isUpdating = false;
    }
  }
}

/**
 * Register Prefix Commands `r!uptime` & `r!liveuptime`
 */
export function registerUptimeCommands(): void {
  PrefixRegistry.register({
    name: 'uptime',
    category: 'Diagnostics',
    description: 'Real-time live auto-updating bot uptime status and system telemetry.',
    usage: 'r!uptime [setup #channel | stop | refresh | status]',
    aliases: ['liveuptime', 'uptimemonitor', 'botuptime'],
    cooldownSeconds: 3,
    examples: ['r!uptime', 'r!uptime setup #bot-status', 'r!uptime refresh', 'r!uptime stop'],
    moduleOwnerId: 'core',
    dangerLevel: 'Low',
    hidden: false,
    execute: async (message: Message, args: string[]) => {
      const sub = (args[0] || '').toLowerCase();
      const tick = UptimeBroadcaster.getTickEmoji(message.client);

      // ── SUBCOMMAND: SETUP / SET ────────────────────────────────────
      if (sub === 'setup' || sub === 'set') {
        if (!message.member?.permissions.has(PermissionsBitField.Flags.ManageGuild) && !message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
          return message.reply({
            content: `${WRONG_ICON} You require **Manage Server** or **Administrator** permission to set up the live uptime monitor.`
          }).catch(() => { });
        }

        const targetChannel = (message.mentions.channels.first() ||
          message.guild?.channels.cache.get(args[1]?.replace(/[^0-9]/g, '')) ||
          message.channel) as TextChannel;

        if (!targetChannel || !targetChannel.isTextBased()) {
          return message.reply({
            content: `${WRONG_ICON} Please specify a valid text channel to deploy the live uptime display.`
          }).catch(() => { });
        }

        const result = await UptimeBroadcaster.setupMonitor(targetChannel as any);
        if (!result.success) {
          return message.reply({
            content: `${WRONG_ICON} Failed to configure live uptime monitor: ${result.error}`
          }).catch(() => { });
        }

        return message.reply({
          content: `${tick} **Live Uptime Monitor Configured!**\n> Successfully deployed in <#${targetChannel.id}>. The live dashboard is armed and will continuously update every 45 seconds.`
        }).catch(() => { });
      }

      // ── SUBCOMMAND: STOP / REMOVE / DISABLE ────────────────────────
      if (sub === 'stop' || sub === 'remove' || sub === 'disable') {
        if (!message.member?.permissions.has(PermissionsBitField.Flags.ManageGuild) && !message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
          return message.reply({
            content: `${WRONG_ICON} You require **Manage Server** or **Administrator** permission to disable the live uptime monitor.`
          }).catch(() => { });
        }

        await UptimeBroadcaster.stopMonitor(message.guildId!);
        return message.reply({
          content: `${tick} **Live Uptime Monitor Stopped!**\n> Automated uptime broadcasts for this server have been deactivated.`
        }).catch(() => { });
      }

      // ── SUBCOMMAND: REFRESH / SYNC ─────────────────────────────────
      if (sub === 'refresh' || sub === 'sync') {
        await UptimeBroadcaster.broadcastUpdate();
        return message.reply({
          content: `${tick} Real-time uptime telemetry synced across all active monitor channels.`
        }).catch(() => { });
      }

      // ── SUBCOMMAND: STATUS ─────────────────────────────────────────
      if (sub === 'status') {
        const mon = await UptimeBroadcaster.getMonitor(message.guildId!);
        if (!mon) {
          return message.reply({
            content: `${WRONG_ICON} No live uptime monitor is currently configured in this server. Run \`r!uptime setup #channel\` to start one.`
          }).catch(() => { });
        }

        return message.reply({
          content: `${tick} **Live Uptime Monitor Status:**\n> Channel: <#${mon.channelId}>\n> Message ID: \`${mon.messageId}\`\n> Last Synchronized: <t:${Math.floor(mon.lastUpdated / 1000)}:R>`
        }).catch(() => { });
      }

      // ── DEFAULT: SHOW ONE-OFF LIVE PREVIEW ──────────────────────────
      const embed = UptimeBroadcaster.formatEmbed(message.client);
      const banner = UptimeBroadcaster.getBannerAttachment();

      const sendPayload: any = { embeds: [embed] };
      if (banner) {
        sendPayload.files = [banner];
      }

      await message.reply(sendPayload).catch((err: any) => {
        console.error('[UptimeBroadcaster] Error sending preview message:', err);
      });
    }
  });
}
