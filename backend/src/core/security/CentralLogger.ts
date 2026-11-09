import {
  WebhookClient,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  MessageFlags,
  type Guild,
  type Client,
  type TextChannel
} from 'discord.js';
import fs from 'fs';
import path from 'path';

/**
 * CentralLogger — posts anti-nuke / attack events from EVERY server the bot is in
 * to private channels in the owner's hub server, using Discord Components V2 Box UI
 * with fallback to Webhook embeds.
 *
 * Config (backend/.env):
 *   HUB_ANTINUKE_WEBHOOK_URL   -> #server-antinuke
 *   HUB_ATTACKS_WEBHOOK_URL    -> #server-attacks
 *   HUB_GUILD_ID               -> Hub Guild ID
 *   HUB_ANTINUKE_CHANNEL_ID    -> #server-antinuke channel ID
 *   HUB_ATTACKS_CHANNEL_ID     -> #server-attacks channel ID
 *   HUB_LOGGER_NAME            -> (optional) sender name, default "Rage Logger"
 *   HUB_LOGGER_AVATAR          -> (optional) sender avatar URL
 *
 * Safety: fire-and-forget through a small queue. It never throws and never blocks
 * punishment logic. If the URLs / channels are not set, it silently does nothing.
 */

export type HubSeverity = 'low' | 'high' | 'critical';

export interface HubAttackEvent {
  guild: Guild;
  /** Short title, e.g. "KICK", "BAN", "BOT BANNED", "ROLES STRIPPED" */
  action: string;
  /** Rule/reason text, e.g. "Anti-Nuke: Unauthorized Channel Deletion (#general)" */
  reason: string;
  executorId: string;
  executorName: string;
  executorIsBot?: boolean;
  targetId?: string;
  targetName?: string;
  actionTakenById?: string;
  actionTakenByName?: string;
  /** Result of the punishment */
  result?: 'success' | 'failed';
  note?: string;
  severity?: HubSeverity;
}

export interface HubAntinukeEvent {
  guild: Guild;
  /** e.g. "ANTINUKE 2FA ENABLED", "BOT JOINED SERVER", "BOT LEFT SERVER" */
  title: string;
  triggeredById?: string;
  triggeredByName?: string;
  gmail?: string;
  status2FA?: string;
  details?: string;
  severity?: HubSeverity;
}

type Channel = 'antinuke' | 'attacks';

interface QueueItem {
  channel: Channel;
  container: ContainerBuilder;
  embed: EmbedBuilder;
  components?: ActionRowBuilder<ButtonBuilder>[];
}

const SEVERITY_COLORS: Record<HubSeverity, number> = {
  low: 0x84cc16,
  high: 0xf59e0b,
  critical: 0xef4444
};

const SEND_INTERVAL_MS = 700; // stay well under webhook/REST rate limits
const MAX_QUEUE = 500;        // drop oldest beyond this during extreme floods

export class CentralLogger {
  private static discordClient: Client | null = null;
  private static clients: Partial<Record<Channel, WebhookClient | null>> = {};
  private static queue: QueueItem[] = [];
  private static draining = false;

  public static initClient(client: Client): void {
    this.discordClient = client;
    console.log('[CentralLogger] Bot Discord Client registered for direct hub channel Box UI delivery & fallback.');
  }

  private static loadEnvVars(): void {
    const keys = [
      'HUB_ANTINUKE_WEBHOOK_URL',
      'HUB_ATTACKS_WEBHOOK_URL',
      'HUB_GUILD_ID',
      'HUB_ANTINUKE_CHANNEL_ID',
      'HUB_ATTACKS_CHANNEL_ID',
      'HUB_LOGGER_NAME',
      'HUB_LOGGER_AVATAR'
    ];
    try {
      const envCandidates = [
        path.resolve(process.cwd(), 'backend', '.env'),
        path.resolve(process.cwd(), '.env'),
        path.resolve(__dirname, '..', '..', '..', '.env'),
        path.resolve(__dirname, '..', '..', '..', 'backend', '.env')
      ];
      for (const candidate of envCandidates) {
        if (fs.existsSync(candidate)) {
          const raw = fs.readFileSync(candidate, 'utf8');
          for (const key of keys) {
            if (!process.env[key]) {
              const match = raw.match(new RegExp(`^${key}\\s*=\\s*["']?([^"'\\r\\n]+)["']?`, 'm'));
              if (match && match[1]) {
                process.env[key] = match[1].trim();
              }
            }
          }
        }
      }
    } catch { /* ignore */ }
  }

  private static getClient(channel: Channel): WebhookClient | null {
    if (channel in this.clients) return this.clients[channel] ?? null;
    this.loadEnvVars();

    let url = channel === 'antinuke'
      ? process.env.HUB_ANTINUKE_WEBHOOK_URL
      : process.env.HUB_ATTACKS_WEBHOOK_URL;

    let client: WebhookClient | null = null;
    if (url && url.trim()) {
      try {
        client = new WebhookClient({ url: url.trim() });
        console.log(`[CentralLogger] Initialized webhook client for channel "${channel}"`);
      } catch (e: any) {
        console.error(`[CentralLogger] Invalid webhook URL for "${channel}":`, e?.message || e);
      }
    }
    this.clients[channel] = client;
    return client;
  }

  public static isEnabled(): boolean {
    this.loadEnvVars();
    return !!(
      process.env.HUB_ANTINUKE_WEBHOOK_URL ||
      process.env.HUB_ATTACKS_WEBHOOK_URL ||
      process.env.HUB_ANTINUKE_CHANNEL_ID ||
      process.env.HUB_ATTACKS_CHANNEL_ID ||
      process.env.HUB_GUILD_ID ||
      this.discordClient
    );
  }

  private static unix(): number {
    return Math.floor(Date.now() / 1000);
  }

  private static async resolveGuildInfo(guild: Guild): Promise<{ name: string; id: string; members: string; ownerLine: string; iconURL: string }> {
    let g: any = guild;
    if (this.discordClient && guild?.id) {
      const cached = this.discordClient.guilds.cache.get(guild.id);
      if (cached) {
        g = cached;
      } else {
        const fetched = await this.discordClient.guilds.fetch(guild.id).catch(() => null);
        if (fetched) g = fetched;
      }
    }
    const name = g?.name || `Server ${g?.id || 'Unknown'}`;
    const id = g?.id || 'Unknown';
    const memberCount = g?.memberCount ?? g?.approximateMemberCount;
    const members = memberCount !== undefined ? Number(memberCount).toLocaleString() : 'N/A';
    const ownerId = g?.ownerId;
    const ownerLine = ownerId ? `<@${ownerId}> (\`${ownerId}\`)` : '`Unknown`';
    const iconURL = typeof g?.iconURL === 'function' ? (g.iconURL({ size: 512 }) || 'https://cdn.discordapp.com/embed/avatars/0.png') : 'https://cdn.discordapp.com/embed/avatars/0.png';
    return { name, id, members, ownerLine, iconURL };
  }

  /** Attack / punishment event -> #server-attacks / #server-vulnerability */
  public static attack(ev: HubAttackEvent): void {
    void (async () => {
      try {
        if (!this.isEnabled()) return;
        const gInfo = await this.resolveGuildInfo(ev.guild);
        const resultText = ev.result === 'failed' ? 'FAILED' : 'SUCCESS';

        const targetId = ev.targetId || ev.executorId;
        const targetName = ev.targetName || (ev.targetId ? ev.targetId : ev.executorName);
        const actorId = ev.actionTakenById || (ev.targetId ? ev.executorId : (this.discordClient?.user?.id || ev.executorId));
        const actorName = ev.actionTakenByName || (ev.targetId ? ev.executorName : (this.discordClient?.user?.username || ev.executorName));

        const titleText = `GLOBAL ACTION LOG — ${ev.action.toUpperCase()}`;

        // 1. Box UI Container (Components V2)
        const header = new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# **${titleText}**`)
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(gInfo.iconURL)
          );

        const lines: string[] = [
          `**${gInfo.name.toUpperCase()}** (\`${gInfo.id}\`)`,
          ''
        ];
        lines.push(`> **Target:** <@${targetId}> (\`${targetName}\`)`);
        lines.push(`> **Target ID:** \`${targetId}\``);
        lines.push(`> **Action Taken By:** <@${actorId}> (\`${actorName}\` | \`${actorId}\`)`);
        lines.push(`> **Executor ID:** \`${actorId}\``);
        if (ev.reason) lines.push(`> **Reason:** ${ev.reason}`);
        if (ev.result) lines.push(`> **Result:** \`${resultText}\``);
        if (ev.note) lines.push(`> **Note:** ${ev.note}`);
        lines.push(`> **Server Owner:** ${gInfo.ownerLine}`);
        lines.push(`> **Timestamp:** <t:${this.unix()}:F>`);

        const footer = new TextDisplayBuilder().setContent(
          '-# Rage Central Logger • Attack Defense Grid • Zero Compromise'
        );

        const container = new ContainerBuilder()
          .addSectionComponents(header)
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
          .addTextDisplayComponents(footer);

        // 2. Fallback Embed (Legacy)
        const embed = new EmbedBuilder()
          .setColor(0x2B2D31)
          .setTitle(titleText)
          .setDescription(lines.join('\n'));

        console.log(`[CentralLogger] Enqueueing attack event: "${ev.action}" for guild "${gInfo.name}"`);
        this.enqueue({ channel: 'attacks', container, embed });

        // Mirror to antinuke webhook/channel if separate
        this.loadEnvVars();
        if (process.env.HUB_ANTINUKE_WEBHOOK_URL && process.env.HUB_ANTINUKE_WEBHOOK_URL !== process.env.HUB_ATTACKS_WEBHOOK_URL) {
          this.enqueue({ channel: 'antinuke', container, embed });
        }
      } catch (e: any) {
        console.error('[CentralLogger] attack() build error:', e?.message || e);
      }
    })();
  }

  /** AutoMod enforcement event -> posts to central logger from all servers */
  public static automod(ev: {
    guild: Guild;
    action: string;
    reason: string;
    offenderId: string;
    offenderName: string;
    channelName?: string;
    severity?: HubSeverity;
  }): void {
    void (async () => {
      try {
        if (!this.isEnabled()) return;
        const gInfo = await this.resolveGuildInfo(ev.guild);
        const titleText = `GLOBAL AUTOMOD ENFORCEMENT — ${ev.action.toUpperCase()}`;

        // 1. Box UI Container (Components V2)
        const header = new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# **${titleText}**`)
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(gInfo.iconURL)
          );

        const lines: string[] = [
          `**${gInfo.name.toUpperCase()}** (\`${gInfo.id}\`)`,
          ''
        ];
        lines.push(`> **Offender:** <@${ev.offenderId}> (\`${ev.offenderName}\`)`);
        lines.push(`> **Action Enforced:** \`${ev.action.toUpperCase()}\``);
        lines.push(`> **Reason:** ${ev.reason}`);
        if (ev.channelName) {
          lines.push(`> **Channel:** \`#${ev.channelName}\``);
        }
        lines.push(`> **Server Owner:** ${gInfo.ownerLine}`);
        lines.push(`> **Timestamp:** <t:${this.unix()}:F>`);

        const footer = new TextDisplayBuilder().setContent(
          '-# Rage Central Logger • Global AutoMod Defense • Unbypassable Security'
        );

        const container = new ContainerBuilder()
          .addSectionComponents(header)
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
          .addTextDisplayComponents(footer);

        // 2. Fallback Embed (Legacy)
        const embed = new EmbedBuilder()
          .setColor(ev.severity === 'critical' ? 0xef4444 : (ev.severity === 'high' ? 0xf59e0b : 0x84cc16))
          .setTitle(titleText)
          .setDescription(lines.join('\n'));

        console.log(`[CentralLogger] Enqueueing automod event: "${ev.action}" for guild "${gInfo.name}"`);
        this.enqueue({ channel: 'attacks', container, embed });

        this.loadEnvVars();
        if (process.env.HUB_ANTINUKE_WEBHOOK_URL && process.env.HUB_ANTINUKE_WEBHOOK_URL !== process.env.HUB_ATTACKS_WEBHOOK_URL) {
          this.enqueue({ channel: 'antinuke', container, embed });
        }
      } catch (e: any) {
        console.error('[CentralLogger] automod() build error:', e?.message || e);
      }
    })();
  }

  /** Anti-nuke / security config event -> #server-antinuke */
  public static antinuke(ev: HubAntinukeEvent): void {
    void (async () => {
      try {
        if (!this.isEnabled()) return;
        const gInfo = await this.resolveGuildInfo(ev.guild);
        const titleText = (ev.title || 'ANTINUKE SECURITY ALERT').toUpperCase();

        // 1. Box UI Container (Components V2)
        const header = new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`# **${titleText}**`)
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(gInfo.iconURL)
          );

        const lines: string[] = [
          `**${gInfo.name.toUpperCase()}** (\`${gInfo.id}\`)`,
          ''
        ];
        lines.push(`> **Event:** \`${titleText}\``);
        lines.push(`> **Security Status:** \`High-Security Armed\``);
        if (ev.triggeredById) {
          lines.push(`> **Triggered By:** <@${ev.triggeredById}> (\`${ev.triggeredByName || ev.triggeredById}\`)`);
        }
        if (ev.status2FA) {
          lines.push(`> **2FA Status:** \`${ev.status2FA}\``);
        } else if (ev.title.includes('2FA')) {
          lines.push(`> **2FA Status:** \`ENABLED (Gmail Verified)\``);
        }
        if (ev.gmail) {
          lines.push(`> **Gmail:** \`${ev.gmail}\``);
        }
        if (gInfo.members && gInfo.members !== 'N/A') {
          lines.push(`> **Server Members:** \`${gInfo.members} Members\``);
        }
        lines.push(`> **Server Owner:** ${gInfo.ownerLine}`);
        if (ev.details) {
          lines.push(`> **Details:** ${ev.details}`);
        }
        lines.push(`> **Timestamp:** <t:${this.unix()}:F>`);

        const footer = new TextDisplayBuilder().setContent(
          '-# Rage Central Logger • Anti-Nuke Sentinel Grid • Zero Compromise'
        );

        const container = new ContainerBuilder()
          .addSectionComponents(header)
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
          .addTextDisplayComponents(footer);

        // 2. Fallback Embed (Legacy)
        const embed = new EmbedBuilder()
          .setColor(0x2B2D31)
          .setTitle(titleText)
          .setDescription(lines.join('\n'));

        console.log(`[CentralLogger] Enqueueing antinuke event: "${ev.title}" for guild "${gInfo.name}"`);
        this.enqueue({ channel: 'antinuke', container, embed });
      } catch (e: any) {
        console.error('[CentralLogger] antinuke() build error:', e?.message || e);
      }
    })();
  }

  private static enqueue(item: QueueItem): void {
    if (this.queue.length >= MAX_QUEUE) this.queue.shift();
    this.queue.push(item);
    if (!this.draining) void this.drain();
  }

  private static async resolveChannelId(channel: Channel): Promise<string | null> {
    this.loadEnvVars();

    // 1. Direct explicit environment variable
    const explicitId = channel === 'antinuke'
      ? process.env.HUB_ANTINUKE_CHANNEL_ID
      : process.env.HUB_ATTACKS_CHANNEL_ID;

    if (explicitId && /^\d{17,20}$/.test(explicitId.trim())) {
      return explicitId.trim();
    }

    // 2. Known default IDs for verified Hub Servers
    if (channel === 'antinuke') {
      return '1555980454396690512'; // 𝚂erver᲼𝙰ntinuke
    } else {
      return '1555980752594796544'; // 𝚂erver᲼𝚅ulnerability
    }
  }

  private static async drain(): Promise<void> {
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift()!;
        let sent = false;

        // 1. Direct Discord Channel ID Delivery via Bot Client (Components V2 Box UI)
        if (!sent && this.discordClient && item.container) {
          try {
            const chanId = await this.resolveChannelId(item.channel);
            if (chanId) {
              const targetChannel = await this.discordClient.channels.fetch(chanId).catch(() => null) as TextChannel | null;
              if (targetChannel && targetChannel.isTextBased()) {
                await targetChannel.send({
                  flags: MessageFlags.IsComponentsV2 | MessageFlags.SuppressNotifications,
                  components: [item.container]
                });
                console.log(`[CentralLogger] Dispatched Components V2 Box UI to "${item.channel}" channel (${chanId}) via Bot Client successfully!`);
                sent = true;
              } else {
                console.warn(`[CentralLogger] Target channel ${chanId} could not be resolved or is not text-based.`);
              }
            }
          } catch (err: any) {
            console.warn(`[CentralLogger] Direct channel delivery error for "${item.channel}": ${err?.message || err}. Falling back to webhook...`);
          }
        }

        // 2. Fallback to WebhookClient if Bot client delivery was unavailable
        if (!sent) {
          const client = this.getClient(item.channel);
          if (client) {
            try {
              const payload: any = {
                flags: MessageFlags.SuppressNotifications,
                username: process.env.HUB_LOGGER_NAME || 'Rage Logger',
                avatarURL: process.env.HUB_LOGGER_AVATAR || undefined,
                embeds: [item.embed]
              };
              if (item.components && item.components.length > 0) {
                payload.components = item.components;
              }
              await client.send(payload);
              console.log(`[CentralLogger] Dispatched fallback embed to "${item.channel}" webhook successfully.`);
              sent = true;
            } catch (e: any) {
              console.warn(`[CentralLogger] Webhook post failed for "${item.channel}": ${e?.message || e}`);
            }
          }
        }

        await new Promise(r => setTimeout(r, SEND_INTERVAL_MS));
      }
    } finally {
      this.draining = false;
    }
  }
}
