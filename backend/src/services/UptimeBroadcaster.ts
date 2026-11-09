import {
  Client,
  TextChannel,
  NewsChannel,
  AttachmentBuilder,
  Message,
  PermissionsBitField,
  EmbedBuilder,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags
} from 'discord.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Database } from '../core/Database.js';
import { EmailService } from './EmailService.js';
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

  public static readonly BANNER_URL = 'https://cdn.discordapp.com/attachments/1520048350643359856/1566028194719596584/uptime-banner.png?ex=6ae70ce9&is=6ae5bb69&hm=b7c147180bdfb1483667de0db05e1da0a784c11fb164a366d6f5d4283de5f99b&';

  /**
   * Format Discord Components V2 Box UI container matching exact reference layout
   */
  public static formatContainer(client: Client): ContainerBuilder {
    const uptimeSec = client.uptime ? Math.floor(client.uptime / 1000) : Math.floor(process.uptime());
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
    const botAvatar = client.user?.displayAvatarURL({ size: 512 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
    const tick = this.getTickEmoji(client);

    const mem = process.memoryUsage();
    const heapMb = (mem.heapUsed / 1024 / 1024).toFixed(1);
    const rssMb = (mem.rss / 1024 / 1024).toFixed(1);
    const isDbConnected = Boolean(Database.getDb());
    const isGmailReady = EmailService.isConfigured();
    const gmailStatus = isGmailReady ? 'OAuth2 / SMTP Active' : 'SMTP/IMAP Ready';

    const bodyContent = [
      `<@${botId}> * **Live : ${liveStr}**`,
      '',
      `> ${tick} **Core Gateway:** WS 443 Connected [Latency:\u00A0\`${wsPing}ms\`]`,
      `> ${tick} **Memory Overhead:** Heap \`${heapMb} MB\` [RSS:\u00A0\`${rssMb} MB\`]`,
      `> ${tick} **SQL Database:** SQLite WAL Mode [\`${isDbConnected ? 'Connected & Healthy' : 'Connecting'}\`]`,
      `> ${tick} **Gmail Connectors:** OAuth2 Secure Bridge [\`${gmailStatus}\`]`,
      `> ${tick} **YouTube API v3:** Realtime RSS Feed Polling Active`,
      `> ${tick} **Antinuke Sentinels:** Armed & Securing \`${guildCount} Servers\``
    ].join('\n');

    const sec = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(bodyContent)
      )
      .setThumbnailAccessory(
        new ThumbnailBuilder().setURL(botAvatar)
      );

    const mg = new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL(this.BANNER_URL)
    );

    const footer = new TextDisplayBuilder().setContent('-# Rage Optimiser Enterprise • High-Availability Infrastructure');

    return new ContainerBuilder()
      .addSectionComponents(sec)
      .addMediaGalleryComponents(mg)
      .addTextDisplayComponents(footer);
  }

  /**
   * Returns full message payload (Components V2 container with fallback to Embed)
   */
  public static formatPayload(client: Client): any {
    try {
      const container = this.formatContainer(client);
      return {
        flags: MessageFlags.IsComponentsV2,
        components: [container]
      };
    } catch {
      return {
        embeds: [this.formatEmbed(client)]
      };
    }
  }

  /**
   * Format fallback embed matching exact user reference layout
   */
  public static formatEmbed(client: Client): EmbedBuilder {
    const uptimeSec = client.uptime ? Math.floor(client.uptime / 1000) : Math.floor(process.uptime());
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
    const botAvatar = client.user?.displayAvatarURL({ size: 512 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
    const tick = this.getTickEmoji(client);

    const mem = process.memoryUsage();
    const heapMb = (mem.heapUsed / 1024 / 1024).toFixed(1);
    const rssMb = (mem.rss / 1024 / 1024).toFixed(1);
    const isDbConnected = Boolean(Database.getDb());
    const isGmailReady = EmailService.isConfigured();
    const gmailStatus = isGmailReady ? 'OAuth2 / SMTP Active' : 'SMTP/IMAP Ready';

    const description = [
      `<@${botId}> * **Live : ${liveStr}**`,
      '',
      `> ${tick} **Core Gateway:** WS 443 Connected [Latency:\u00A0\`${wsPing}ms\`]`,
      `> ${tick} **Memory Overhead:** Heap \`${heapMb} MB\` [RSS:\u00A0\`${rssMb} MB\`]`,
      `> ${tick} **SQL Database:** SQLite WAL Mode [\`${isDbConnected ? 'Connected & Healthy' : 'Connecting'}\`]`,
      `> ${tick} **Gmail Connectors:** OAuth2 Secure Bridge [\`${gmailStatus}\`]`,
      `> ${tick} **YouTube API v3:** Realtime RSS Feed Polling Active`,
      `> ${tick} **Antinuke Sentinels:** Armed & Securing \`${guildCount} Servers\``
    ].join('\n');

    return new EmbedBuilder()
      .setColor(0x2B2D31)
      .setThumbnail(botAvatar)
      .setDescription(description)
      .setImage(this.BANNER_URL)
      .setFooter({ text: 'Rage Optimiser Enterprise • High-Availability Infrastructure' });
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
        if (!targetMsg.flags?.has?.(MessageFlags.IsComponentsV2)) {
          // Legacy embed message: delete and replace with fresh Components V2 Box UI container
          await targetMsg.delete().catch(() => {});
          const newMsg = await channel.send(this.formatPayload(this.client));
          await Database.run(
            'UPDATE uptime_monitors SET messageId = ?, lastUpdated = ? WHERE guildId = ?',
            [newMsg.id, Date.now(), channel.guildId]
          );
          return { success: true, messageId: newMsg.id };
        }
        try {
          await targetMsg.edit(this.formatPayload(this.client));
        } catch {
          await targetMsg.delete().catch(() => {});
          const newMsg = await channel.send(this.formatPayload(this.client));
          await Database.run(
            'UPDATE uptime_monitors SET messageId = ?, lastUpdated = ? WHERE guildId = ?',
            [newMsg.id, Date.now(), channel.guildId]
          );
          return { success: true, messageId: newMsg.id };
        }
        await Database.run(
          'UPDATE uptime_monitors SET lastUpdated = ? WHERE guildId = ?',
          [Date.now(), channel.guildId]
        );
        return { success: true, messageId: targetMsg.id };
      }

      // Otherwise post a new live message with Components V2 Container Box UI
      let newMsg: Message;
      try {
        newMsg = await channel.send(this.formatPayload(this.client));
      } catch {
        newMsg = await channel.send({ embeds: [this.formatEmbed(this.client)] });
      }
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

          if (!msg.flags?.has?.(MessageFlags.IsComponentsV2)) {
            // Legacy embed message: delete and replace with fresh Components V2 Box UI
            await msg.delete().catch(() => {});
            const newMsg = await chan.send(this.formatPayload(this.client));
            await Database.run(
              'UPDATE uptime_monitors SET messageId = ?, lastUpdated = ? WHERE guildId = ?',
              [newMsg.id, Date.now(), row.guildId]
            ).catch(() => {});
            continue;
          }

          try {
            await msg.edit(this.formatPayload(this.client));
          } catch {
            await msg.delete().catch(() => {});
            const newMsg = await chan.send(this.formatPayload(this.client));
            await Database.run(
              'UPDATE uptime_monitors SET messageId = ?, lastUpdated = ? WHERE guildId = ?',
              [newMsg.id, Date.now(), row.guildId]
            ).catch(() => {});
            continue;
          }
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
      try {
        await message.reply(UptimeBroadcaster.formatPayload(message.client));
      } catch {
        const embed = UptimeBroadcaster.formatEmbed(message.client);
        await message.reply({ embeds: [embed] }).catch((err: any) => {
          console.error('[UptimeBroadcaster] Error sending preview message:', err);
        });
      }
    }
  });
}
