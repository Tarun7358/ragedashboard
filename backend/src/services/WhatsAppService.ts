/**
 * WhatsAppService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Rage Optimiser Enterprise — Private Owner WhatsApp Hotline
 *
 * Provides real-time WhatsApp integration powered by @whiskeysockets/baileys:
 *  1. Outbound Security Alerts (Anti-Nuke, Raid waves, Quarantines)
 *  2. Outbound Ticket Notifications (New tickets, escalations)
 *  3. Outbound 2FA OTP delivery (Instant phone verification)
 *  4. Inbound Remote Controls (Owner-only: !stats, !security, !tickets, !lockdown, !unlock, !ping)
 *
 * Security: Strictly validates sender against process.env.WHATSAPP_OWNER_NUMBER.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

type WASocket = any;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SecurityAlertPayload {
  type: string;
  guildName?: string;
  executor?: string;
  target?: string;
  details?: string;
  actionTaken?: string;
}

export interface TicketAlertPayload {
  id: string;
  guildName?: string;
  userTag: string;
  category: string;
  subject: string;
  channelName?: string;
}

function normalizeJid(jid: string): string {
  if (!jid) return '';
  const [userPart, serverPart] = jid.split('@');
  const cleanUser = (userPart || '').split(':')[0];
  return `${cleanUser}@${serverPart || 's.whatsapp.net'}`;
}

export class WhatsAppService {
  private static socket: WASocket | null = null;
  private static isConnected: boolean = false;
  private static isInitializing: boolean = false;
  private static discordGateway: any = null;
  private static moduleRegistry: any = null;
  private static latestRawQr: string | null = null;
  private static latestPairingCode: string | null = null;
  private static reconnectAttempts: number = 0;
  private static reconnectTimer: NodeJS.Timeout | null = null;
  private static sentBotMessageIds = new Set<string>();
  private static recentMessages = new Map<string, any>();
  private static configuredGroupJid: string | null = null;

  // ─── Configuration ───────────────────────────────────────────────────────────

  public static isEnabled(): boolean {
    return process.env.WHATSAPP_ENABLED === 'true';
  }

  public static getOwnerNumber(): string {
    const raw = process.env.WHATSAPP_OWNER_NUMBER || '';
    return raw.replace(/[^0-9]/g, '');
  }

  public static getOwnerJid(): string | null {
    const num = this.getOwnerNumber();
    return num ? `${num}@s.whatsapp.net` : null;
  }

  public static getGroupJid(): string | null {
    return this.configuredGroupJid || process.env.WHATSAPP_GROUP_JID?.trim() || null;
  }

  public static getAuthDir(): string {
    const configured = process.env.WHATSAPP_AUTH_DIR?.trim();
    if (configured) {
      return path.isAbsolute(configured)
        ? configured
        : path.resolve(__dirname, '..', '..', configured);
    }
    return path.resolve(__dirname, '..', '..', 'whatsapp_session');
  }

  public static getPairingMethod(): 'qr' | 'code' {
    return process.env.WHATSAPP_PAIRING_METHOD === 'code' ? 'code' : 'qr';
  }

  public static getLatestQr(): string | null {
    return this.latestRawQr;
  }

  public static getLatestPairingCode(): string | null {
    return this.latestPairingCode;
  }

  public static getStatus() {
    return {
      enabled: this.isEnabled(),
      connected: this.isConnected,
      ownerConfigured: Boolean(this.getOwnerNumber()),
      ownerNumber: this.getOwnerNumber() ? `+${this.getOwnerNumber()}` : 'Not configured',
      groupJid: this.getGroupJid() || 'None (Direct DM)',
      hasActiveQr: Boolean(this.latestRawQr),
      pairingCode: this.latestPairingCode
    };
  }

  public static async resetSession(): Promise<void> {
    console.log('[WhatsApp Server] 🔄 Resetting WhatsApp session (clearing corrupt keys/ratchets)...');
    await this.shutdown();
    const authDir = this.getAuthDir();
    if (fs.existsSync(authDir)) {
      try {
        fs.rmSync(authDir, { recursive: true, force: true });
        console.log(`[WhatsApp Server] Cleaned session directory: ${authDir}`);
      } catch (rmErr) {
        console.error('[WhatsApp Server] Failed to delete session dir:', rmErr);
      }
    }
    this.latestRawQr = null;
    this.latestPairingCode = null;
    this.isInitializing = false;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.recentMessages.clear();

    // Automatically reboot socket to generate fresh pristine QR
    setTimeout(() => {
      this.init(this.discordGateway, this.moduleRegistry);
    }, 1500);
  }

  public static async shutdown(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      try {
        console.log('[WhatsApp] Closing socket cleanly for server shutdown...');
        this.socket.end(undefined);
        this.socket = null;
        this.isConnected = false;
      } catch (err) {
        console.error('[WhatsApp] Shutdown error:', err);
      }
    }
  }

  // ─── Initialization & Lifecycle ──────────────────────────────────────────────

  public static async init(gateway?: any, registry?: any): Promise<void> {
    if (gateway) this.discordGateway = gateway;
    if (registry) this.moduleRegistry = registry;

    if (!this.isEnabled()) {
      console.log('[WhatsApp] Service disabled (set WHATSAPP_ENABLED=true in .env to enable).');
      return;
    }

    const ownerNumber = this.getOwnerNumber();
    if (!ownerNumber) {
      console.warn('[WhatsApp] ⚠️ WHATSAPP_ENABLED is true, but WHATSAPP_OWNER_NUMBER is not set.');
      return;
    }

    if (this.isInitializing) return;
    this.isInitializing = true;

    try {
      // Dynamic imports: ensures tsc compiles cleanly with zero errors on any server
      let makeWASocket: any;
      let DisconnectReason: any;
      let useMultiFileAuthState: any;
      let pino: any;
      let qrcode: any;

      try {
        const baileysMod = await import('@whiskeysockets/baileys');
        makeWASocket = (baileysMod as any).default || baileysMod;
        DisconnectReason = (baileysMod as any).DisconnectReason;
        useMultiFileAuthState = (baileysMod as any).useMultiFileAuthState;
        pino = (await import('pino')).default;
        qrcode = (await import('qrcode-terminal')).default;
      } catch (modErr) {
        console.warn('⚠️ [WhatsApp] Optional packages (@whiskeysockets/baileys, pino, qrcode-terminal) not found.');
        console.warn('⚠️ [WhatsApp] Run `npm install` in your backend directory to activate the WhatsApp hotline.');
        this.isInitializing = false;
        return;
      }

      const authDir = this.getAuthDir();
      if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true });
      }

      const { state, saveCreds } = await useMultiFileAuthState(authDir);
      const pairingMethod = this.getPairingMethod();

      // Message retry counter cache: Prevents Bad MAC decryption lockups on retries
      const msgRetryMap = new Map<string, number>();
      const msgRetryCounterCache = {
        get: (key: string) => msgRetryMap.get(key),
        set: (key: string, value: any) => msgRetryMap.set(key, value),
        del: (key: string) => msgRetryMap.delete(key),
      };

      const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['Rage Optimiser (Server)', 'Linux', '3.0.0'],
        syncFullHistory: false,
        markOnlineOnConnect: false,
        msgRetryCounterCache,
        getMessage: async (key: any) => {
          if (!key?.id) return undefined;
          return this.recentMessages.get(key.id);
        }
      });

      this.socket = sock;

      // Handle credentials update (save keys immediately)
      sock.ev.on('creds.update', saveCreds as any);

      // Handle pairing code ONLY if explicitly configured for pairing code method
      let pairingTimer: NodeJS.Timeout | null = null;
      if (pairingMethod === 'code' && !sock.authState.creds.registered && !sock.authState.creds.me) {
        pairingTimer = setTimeout(async () => {
          if (this.isConnected || sock.authState.creds.registered || sock.authState.creds.me) return;
          try {
            const code = await sock.requestPairingCode(ownerNumber);
            this.latestPairingCode = code;
            console.log('\n======================================================');
            console.log(`📱 [WhatsApp Server Hotline] 8-DIGIT PAIRING CODE: ${code}`);
            console.log(`In WhatsApp: Linked Devices > Link with phone number instead`);
            console.log(`Enter the code above (No camera scanning needed!)`);
            console.log('======================================================\n');
          } catch (codeErr) {
            // Pairing code request may fail if session already established
          }
        }, 3000);
      }

      // Connection state listener
      sock.ev.on('connection.update', (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && pairingMethod !== 'code') {
          this.latestRawQr = qr;
          // Display in terminal for direct terminal viewers
          console.log('\n======================================================');
          console.log('📱 [WhatsApp Server Hotline] QR CODE GENERATED:');
          console.log('Scan via Terminal OR open your browser at: /api/whatsapp/qr');
          qrcode.generate(qr, { small: true });
          console.log('======================================================\n');
        }

        if (connection === 'close') {
          this.isConnected = false;
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const isRestartRequired = statusCode === 515 || statusCode === (DisconnectReason?.restartRequired ?? 515);
          const shouldReconnect = isRestartRequired || statusCode !== (DisconnectReason?.loggedOut ?? 401);

          console.warn(`[WhatsApp Server] Connection closed (status: ${statusCode || 'unknown'}).`);

          if (isRestartRequired) {
            // 515 is normal stream reset after initial device sync — reconnect immediately
            console.log('[WhatsApp Server] Multi-device stream sync completed. Restarting stream in 1s...');
            if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => {
              this.isInitializing = false;
              this.init(this.discordGateway, this.moduleRegistry);
            }, 1000);
            return;
          }

          if (shouldReconnect) {
            this.reconnectAttempts++;
            // Exponential backoff capped at 30 seconds
            const delay = Math.min(3000 * Math.pow(1.5, Math.min(this.reconnectAttempts, 5)), 30000);
            console.log(`[WhatsApp Server] Reconnecting in ${Math.round(delay / 1000)}s (Attempt #${this.reconnectAttempts})...`);

            if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => {
              this.isInitializing = false;
              this.init(this.discordGateway, this.moduleRegistry);
            }, delay);
          } else {
            console.error('[WhatsApp Server] Session logged out. Please clear whatsapp_session directory and re-link.');
            this.isInitializing = false;
            this.latestRawQr = null;
            this.latestPairingCode = null;
          }
        } else if (connection === 'open') {
          if (pairingTimer) {
            clearTimeout(pairingTimer);
            pairingTimer = null;
          }
          this.isConnected = true;
          this.isInitializing = false;
          this.reconnectAttempts = 0;
          this.latestRawQr = null;
          this.latestPairingCode = null;
          console.log(`[WhatsApp Server] ✅ Hotline connected! Active for owner: +${ownerNumber}`);

          // Send welcome handshake to owner
          this.sendAlert(
            `🟢 *RAGE OPTIMISER (SERVER) — HOTLINE ONLINE*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Your Linux server WhatsApp hotline is active.\n` +
            `Type *!help* or *!stats* anytime for server metrics.`
          ).catch(() => { });
        }
      });

      // Handle inbound messages (Owner Commands)
      sock.ev.on('messages.upsert', async (m: any) => {
        // Accept both 'notify' (messages from other chats/groups) and 'append' (self messages synced from mobile)
        if (m.type !== 'notify' && m.type !== 'append') return;

        for (const msg of m.messages || []) {
          if (!msg.message) continue;

          // Cache message payload in memory for Signal retry decryptions
          if (msg.key?.id && msg.message) {
            this.recentMessages.set(msg.key.id, msg.message);
            if (this.recentMessages.size > 200) {
              const oldestKey = this.recentMessages.keys().next().value;
              if (oldestKey) this.recentMessages.delete(oldestKey);
            }
          }

          // Skip if message was dispatched by the bot code itself
          if (msg.key.id && this.sentBotMessageIds.has(msg.key.id)) continue;

          const rawJid = msg.key.remoteJid || '';
          if (rawJid === 'status@broadcast') continue;

          const cleanJid = normalizeJid(rawJid);
          const isGroup = rawJid.endsWith('@g.us');
          const participantJid = msg.key.participant ? normalizeJid(msg.key.participant) : '';
          const participantDigits = participantJid.split('@')[0].replace(/[^0-9]/g, '');
          const senderDigits = cleanJid.split('@')[0].replace(/[^0-9]/g, '');

          // Check if sender is verified owner:
          // Covers: direct DM, group participant matching owner, or message sent from owner phone (fromMe)
          const isOwner =
            senderDigits === ownerNumber ||
            participantDigits === ownerNumber ||
            msg.key.fromMe === true;

          if (!isOwner) {
            continue;
          }

          let msgContent = msg.message;
          if (msgContent.ephemeralMessage?.message) msgContent = msgContent.ephemeralMessage.message;
          if (msgContent.viewOnceMessage?.message) msgContent = msgContent.viewOnceMessage.message;
          if (msgContent.viewOnceMessageV2?.message) msgContent = msgContent.viewOnceMessageV2.message;
          if (msgContent.documentWithCaptionMessage?.message) msgContent = msgContent.documentWithCaptionMessage.message;

          const rawText =
            msgContent.conversation ||
            msgContent.extendedTextMessage?.text ||
            msgContent.imageMessage?.caption ||
            msgContent.videoMessage?.caption ||
            '';

          const trimmed = rawText.trim();
          if (trimmed.startsWith('!')) {
            console.log(`[WhatsApp Server] 📩 Executing owner command: "${trimmed}" in ${rawJid}`);
            // Reply directly in the same conversation (group -> group, DM -> DM)
            await this.handleOwnerCommand(trimmed, rawJid);
          }
        }
      });

    } catch (err) {
      this.isInitializing = false;
      this.isConnected = false;
      console.error('[WhatsApp] Error initializing WhatsApp socket:', err);
    }
  }

  // ─── Owner Inbound Command Dispatcher ─────────────────────────────────────────

  private static async handleOwnerCommand(commandText: string, replyJid: string): Promise<void> {
    const parts = commandText.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    try {
      switch (cmd) {
        case '!help':
        case '!menu': {
          const helpText =
            `🤖 *RAGE OPTIMISER — OWNER HOTLINE COMMANDS*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `📊 *!stats* or *!bot* — Live server, memory & Discord metrics\n` +
            `🛡️ *!security* — Anti-Nuke status & active quarantines\n` +
            `🎫 *!tickets* — Active support tickets summary\n` +
            `🚨 *!lockdown [reason]* — EMERGENCY: Lock server channels\n` +
            `🟢 *!unlock* — Lift emergency server lockdown\n` +
            `👥 *!setgroup* — Set current group as alert hotline channel\n` +
            `🏓 *!ping* — Discord gateway & hotline latency check\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
          await this.sendRaw(replyJid, helpText);
          break;
        }

        case '!setgroup': {
          if (!replyJid.endsWith('@g.us')) {
            await this.sendRaw(replyJid, '⚠️ *!setgroup* must be used inside a WhatsApp group.');
            return;
          }
          this.configuredGroupJid = replyJid;
          await this.sendRaw(
            replyJid,
            `✅ *[HOTLINE GROUP CONFIGURED]*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `This group is now set as the official alert channel.\n` +
            `All anti-nuke alerts, ticket pings, and security notices will be sent here!`
          );
          break;
        }

        case '!ping': {
          const discordPing = this.discordGateway?.client?.ws?.ping ?? -1;
          const pingStr = discordPing >= 0 ? `${discordPing}ms` : 'Connecting';
          await this.sendRaw(
            replyJid,
            `🏓 *PONG!* Latency: *${pingStr}*\nWhatsApp Hotline: *ACTIVE & SECURE*`
          );
          break;
        }

        case '!stats':
        case '!bot': {
          const metrics = this.discordGateway?.getMetrics ? this.discordGateway.getMetrics() : { uptime: 'Unknown', latency: 0 };
          const client = this.discordGateway?.client;
          const guildCount = client?.guilds?.cache?.size ?? 0;
          const memberCount = client?.guilds?.cache?.reduce((acc: number, g: any) => acc + (g.memberCount || 0), 0) ?? 0;

          const mem = process.memoryUsage();
          const rssMB = Math.round(mem.rss / 1024 / 1024);
          const heapMB = Math.round(mem.heapUsed / 1024 / 1024);

          // Get active tickets count
          let openTickets = 0;
          const guildId = process.env.GUILD_ID || client?.guilds?.cache?.first()?.id;
          if (guildId && this.moduleRegistry) {
            const ticketMod = this.moduleRegistry.getModulesState(guildId)?.find((m: any) => m.id === 'tickets');
            openTickets = (ticketMod?.config?.activeTickets || []).filter((t: any) => t.status === 'open').length;
          }

          const statsText =
            `🤖 *RAGE OPTIMISER — LIVE SYSTEM METRICS*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `⏱️ *Uptime:* ${metrics.uptime}\n` +
            `📡 *Discord Latency:* ${metrics.latency}ms\n` +
            `💾 *RAM (RSS):* ${rssMB} MB (Heap: ${heapMB} MB)\n` +
            `🏛️ *Guilds:* ${guildCount}\n` +
            `👥 *Total Members:* ${memberCount.toLocaleString()}\n` +
            `🎫 *Open Tickets:* ${openTickets}\n` +
            `🟢 *Core Status:* ONLINE & PROTECTED\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
          await this.sendRaw(replyJid, statsText);
          break;
        }

        case '!security': {
          const client = this.discordGateway?.client;
          const guildId = process.env.GUILD_ID || client?.guilds?.cache?.first()?.id;
          const guild = client?.guilds?.cache?.get(guildId);

          if (!guildId || !this.moduleRegistry) {
            await this.sendRaw(replyJid, `⚠️ Security module state not ready or guild not cached.`);
            return;
          }

          const secMod = this.moduleRegistry.getModulesState(guildId)?.find((m: any) => m.id === 'security');
          const cfg = secMod?.config || {};

          const antiNuke = cfg.antiNukeEnabled !== false ? '✅ Active' : '❌ Inactive';
          const raidMode = cfg.raidModeEnabled ? '🚨 RAID MODE ENABLED' : '🟢 Normal';
          const emergency = cfg.emergencyMode ? '🛑 EMERGENCY LOCKED' : '🟢 Normal';
          const quarantineCount = (cfg.quarantinedUsers || []).length;
          const antiSpam = cfg.antiSpamEnabled ? 'Enabled' : 'Disabled';
          const antiLink = cfg.antiLinkEnabled ? 'Enabled' : 'Disabled';

          const secText =
            `🛡️ *SECURITY & ANTI-NUKE OVERVIEW*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🏛️ *Server:* ${guild?.name || 'Clutch Nation'}\n` +
            `🛡️ *Anti-Nuke:* ${antiNuke}\n` +
            `⚡ *Raid Mode:* ${raidMode}\n` +
            `🔒 *Emergency Lock:* ${emergency}\n` +
            `🛑 *Quarantined Users:* ${quarantineCount}\n` +
            `🚫 *Anti-Spam Filter:* ${antiSpam}\n` +
            `🔗 *Anti-Link Filter:* ${antiLink}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
          await this.sendRaw(replyJid, secText);
          break;
        }

        case '!tickets': {
          const client = this.discordGateway?.client;
          const guildId = process.env.GUILD_ID || client?.guilds?.cache?.first()?.id;

          if (!guildId || !this.moduleRegistry) {
            await this.sendRaw(replyJid, `⚠️ Ticket registry not available.`);
            return;
          }

          const ticketMod = this.moduleRegistry.getModulesState(guildId)?.find((m: any) => m.id === 'tickets');
          const activeList = (ticketMod?.config?.activeTickets || []).filter((t: any) => t.status === 'open');

          if (activeList.length === 0) {
            await this.sendRaw(
              replyJid,
              `🎫 *SUPPORT TICKETS*\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n✅ No open tickets. All clear!`
            );
            return;
          }

          let summary =
            `🎫 *ACTIVE SUPPORT TICKETS (${activeList.length})*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

          const recent = activeList.slice(-5);
          for (const t of recent) {
            summary += `• *#${t.id.replace('ticket_', '')}* | *${t.category || 'General'}*\n  👤 ${t.userTag}: "${(t.subject || 'No subject').slice(0, 40)}"\n`;
          }

          await this.sendRaw(replyJid, summary);
          break;
        }

        case '!lockdown': {
          const reason = args.join(' ') || 'Emergency Lockdown triggered via WhatsApp Hotline';
          const client = this.discordGateway?.client;
          const guildId = process.env.GUILD_ID || client?.guilds?.cache?.first()?.id;
          const guild = client?.guilds?.cache?.get(guildId);

          if (!guild || !this.moduleRegistry) {
            await this.sendRaw(replyJid, `❌ Failed to initiate lockdown: Guild not found.`);
            return;
          }

          const secMod = this.moduleRegistry.getModulesState(guildId)?.find((m: any) => m.id === 'security');
          const secConfig = { ...(secMod?.config || {}), emergencyMode: true, raidModeEnabled: true };
          this.moduleRegistry.updateModuleConfig(guildId, 'security', secConfig);

          // Edit permissions for everyone role across text channels
          const everyoneRole = guild.roles.everyone;
          const textChannels = guild.channels.cache.filter((c: any) => c.isTextBased() && !c.isThread());
          let lockedCount = 0;

          for (const [, ch] of textChannels) {
            try {
              await (ch as any).permissionOverwrites?.edit(everyoneRole, { SendMessages: false }, { reason });
              lockedCount++;
            } catch { }
          }

          await this.sendRaw(
            replyJid,
            `🛑 *EMERGENCY LOCKDOWN ENGAGED!*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🏛️ *Server:* ${guild.name}\n` +
            `🔒 *Channels Locked:* ${lockedCount}\n` +
            `⚡ *Raid Mode:* FORCED ON\n` +
            `📝 *Reason:* ${reason}\n` +
            `Type *!unlock* when the incident is resolved.`
          );
          break;
        }

        case '!unlock': {
          const client = this.discordGateway?.client;
          const guildId = process.env.GUILD_ID || client?.guilds?.cache?.first()?.id;
          const guild = client?.guilds?.cache?.get(guildId);

          if (!guild || !this.moduleRegistry) {
            await this.sendRaw(replyJid, `❌ Failed to lift lockdown: Guild not found.`);
            return;
          }

          const secMod = this.moduleRegistry.getModulesState(guildId)?.find((m: any) => m.id === 'security');
          const secConfig = { ...(secMod?.config || {}), emergencyMode: false, raidModeEnabled: false };
          this.moduleRegistry.updateModuleConfig(guildId, 'security', secConfig);

          const everyoneRole = guild.roles.everyone;
          const textChannels = guild.channels.cache.filter((c: any) => c.isTextBased() && !c.isThread());
          let restoredCount = 0;

          for (const [, ch] of textChannels) {
            try {
              await (ch as any).permissionOverwrites?.edit(everyoneRole, { SendMessages: null }, { reason: 'Lockdown lifted via WhatsApp' });
              restoredCount++;
            } catch { }
          }

          await this.sendRaw(
            replyJid,
            `🟢 *EMERGENCY LOCKDOWN LIFTED*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `🏛️ *Server:* ${guild.name}\n` +
            `🔓 *Channels Restored:* ${restoredCount}\n` +
            `⚡ *Raid Mode:* RESTORED TO NORMAL`
          );
          break;
        }

        default: {
          await this.sendRaw(
            replyJid,
            `❓ Unknown command: *${cmd}*\nType *!help* to view available commands.`
          );
          break;
        }
      }
    } catch (cmdErr: any) {
      console.error('[WhatsApp] Command handling error:', cmdErr);
      await this.sendRaw(replyJid, `⚠️ Error executing *${cmd}*: ${cmdErr?.message || 'Internal error'}`);
    }
  }

  // ─── Outbound Alert API ───────────────────────────────────────────────────────

  public static async sendAlert(text: string): Promise<boolean> {
    const targetJid = this.getGroupJid() || this.getOwnerJid();
    if (!targetJid) return false;
    return this.sendRaw(targetJid, text);
  }

  public static async sendSecurityAlert(payload: SecurityAlertPayload): Promise<boolean> {
    const text =
      ` *[SECURITY THREAT DETECTED]*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      ` *Event:* ${payload.type}\n` +
      ` *Server:* ${payload.guildName || 'Protected Guild'}\n` +
      ` *Executor:* ${payload.executor || 'Unknown'}\n` +
      (payload.target ? ` *Target:* ${payload.target}\n` : '') +
      ` *Action Taken:* ${payload.actionTaken || 'Quarantined & Mitigated'}\n` +
      (payload.details ? ` *Details:* ${payload.details}\n` : '') +
      ` *Time:* ${new Date().toLocaleTimeString()}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `_Type !lockdown to freeze the server if needed._`;
    return this.sendAlert(text);
  }

  public static async sendTicketAlert(ticket: TicketAlertPayload): Promise<boolean> {
    const text =
      `🎫 *[NEW SUPPORT TICKET OPENED]*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📂 *Category:* ${ticket.category || 'General'}\n` +
      `👤 *User:* ${ticket.userTag}\n` +
      `📝 *Subject:* ${ticket.subject}\n` +
      (ticket.channelName ? `💬 *Channel:* #${ticket.channelName}\n` : '') +
      `🕒 *Time:* ${new Date().toLocaleTimeString()}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    return this.sendAlert(text);
  }

  public static async send2FAVerificationCode(code: string, purpose: string, guildName?: string): Promise<boolean> {
    const text =
      `🔐 *[RAGE OPTIMISER — 2FA OTP]*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔑 *Verification Code:* *${code}*\n` +
      `🛡️ *Purpose:* ${purpose}\n` +
      `🏛️ *Server:* ${guildName || 'Protected Guild'}\n` +
      `⏰ *Expires:* In 5 minutes\n` +
      `⚠️ *Do not share this code with anyone.*`;
    return this.sendAlert(text);
  }

  public static async sendSystemAlert(title: string, message: string): Promise<boolean> {
    const text =
      `⚙️ *[RAGE SYSTEM ALERT]*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📌 *${title}*\n` +
      `${message}\n` +
      `🕒 *Time:* ${new Date().toLocaleTimeString()}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    return this.sendAlert(text);
  }

  private static async sendRaw(jid: string, text: string): Promise<boolean> {
    if (!this.socket || !this.isConnected) {
      return false;
    }

    try {
      const result = await this.socket.sendMessage(jid, { text });
      if (result?.key?.id) {
        this.sentBotMessageIds.add(result.key.id);
        if (result.message) {
          this.recentMessages.set(result.key.id, result.message);
        }
        setTimeout(() => {
          this.sentBotMessageIds.delete(result.key.id);
          this.recentMessages.delete(result.key.id);
        }, 120000);
      }
      return true;
    } catch (err) {
      console.error(`[WhatsApp] Failed to send message to ${jid}:`, err);
      return false;
    }
  }
}
