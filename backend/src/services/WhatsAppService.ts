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
  private static badMacInterceptorInstalled: boolean = false;

  // ─── Configuration ───────────────────────────────────────────────────────────

  public static isEnabled(): boolean {
    return process.env.WHATSAPP_ENABLED === 'true' && process.env.WHATSAPP_TELEMETRY !== 'false';
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

  /**
   * Purges corrupted session / sender-key files without deleting creds.json.
   * Keeps the bot logged in while purging corrupted Double-Ratchet states so WhatsApp
   * re-negotiates a clean cryptographic handshake without requiring QR re-scan.
   */
  public static async healBadMacSessions(specificId?: string): Promise<number> {
    const authDir = this.getAuthDir();
    if (!fs.existsSync(authDir)) return 0;

    let deletedCount = 0;
    try {
      const files = fs.readdirSync(authDir);
      for (const file of files) {
        // NEVER delete creds.json - that keeps the master login identity intact
        if (file === 'creds.json') continue;

        // If specific ID is provided (e.g. 54580729630749), target matching session files
        // Otherwise target all session-*.json, sender-key-*.json, pre-key-*.json files
        const isTarget = specificId
          ? file.includes(specificId)
          : (file.startsWith('session-') || file.startsWith('sender-key-') || file.startsWith('pre-key-'));

        if (isTarget) {
          try {
            fs.unlinkSync(path.join(authDir, file));
            deletedCount++;
          } catch {
            // ignore momentary file lock
          }
        }
      }
      if (deletedCount > 0) {
        console.log(`[WhatsApp Server] [SELF-HEAL] Purged ${deletedCount} corrupted session files (preserved creds.json).`);
      }
    } catch (err) {
      console.error('[WhatsApp Server] [SELF-HEAL] Error purging corrupted session files:', err);
    }
    return deletedCount;
  }

  public static async resetSession(): Promise<void> {
    console.log('[WhatsApp Server] [RESET] Resetting WhatsApp session (clearing corrupt keys/ratchets)...');
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
      console.warn('[WhatsApp] [WARN] WHATSAPP_ENABLED is true, but WHATSAPP_OWNER_NUMBER is not set.');
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
        // @ts-ignore
        const baileysMod = await import('@whiskeysockets/baileys');
        makeWASocket = (baileysMod as any).default || baileysMod;
        DisconnectReason = (baileysMod as any).DisconnectReason;
        useMultiFileAuthState = (baileysMod as any).useMultiFileAuthState;
        // @ts-ignore
        pino = (await import('pino')).default;
        // @ts-ignore
        qrcode = (await import('qrcode-terminal')).default;
      } catch (modErr) {
        console.warn('[WhatsApp] [WARN] Optional packages (@whiskeysockets/baileys, pino, qrcode-terminal) not found.');
        console.warn('[WhatsApp] [WARN] Run `npm install` in your backend directory to activate the WhatsApp hotline.');
        this.isInitializing = false;
        return;
      }

      // Install automatic self-healing interceptor for Bad MAC errors
      if (!this.badMacInterceptorInstalled) {
        this.badMacInterceptorInstalled = true;
        const originalConsoleError = console.error;
        let lastHealTime = 0;

        console.error = (...args: any[]) => {
          const text = args.map(a => (typeof a === 'string' ? a : (a?.stack || a?.message || ''))).join(' ');
          if (text.includes('Bad MAC') || text.includes('Failed to decrypt message with any known session')) {
            // Extract address or LID if available (e.g. 54580729630749)
            const match = text.match(/(\d{7,25})/);
            const targetId = match ? match[1] : undefined;

            const now = Date.now();
            if (now - lastHealTime > 3000) {
              lastHealTime = now;
              console.log(`[WhatsApp Server] [SELF-HEAL] Detected Bad MAC decryption error for session "${targetId || 'all'}" — purging stale ratchet files from disk...`);
              WhatsAppService.healBadMacSessions(targetId).catch(() => {});
            }
          }
          originalConsoleError.apply(console, args);
        };
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
        set: (key: string, value: any) => {
          if (msgRetryMap.size > 5000) {
            const firstKey = msgRetryMap.keys().next().value;
            if (firstKey !== undefined) msgRetryMap.delete(firstKey);
          }
          msgRetryMap.set(key, value);
        },
        del: (key: string) => msgRetryMap.delete(key),
      };

      // Clean up previous socket instance before creating a new one
      if (this.socket) {
        try {
          this.socket.ev?.removeAllListeners?.();
          this.socket.end?.(undefined);
        } catch {}
      }

      const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        browser: ['Ubuntu', 'Desktop', '22.04.4'],
        syncFullHistory: false,
        markOnlineOnConnect: false,
        msgRetryCounterCache,
        getMessage: async (key: any) => {
          if (!key?.id) return undefined;
          return this.recentMessages.get(key.id) || { conversation: '' };
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
            console.log(`[WhatsApp Server Hotline] [PAIRING CODE] 8-DIGIT PAIRING CODE: ${code}`);
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
          console.log('[WhatsApp Server Hotline] [QR CODE] QR CODE GENERATED:');
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
          console.log(`[WhatsApp Server] [ONLINE] Hotline connected! Active for owner: +${ownerNumber}`);

          // Send welcome handshake to owner
          this.sendAlert(
            `> *[RAGE OPTIMISER — HOTLINE ONLINE]*\n` +
            `────────────────────────────\n` +
            `Server WhatsApp hotline connected.\n` +
            `Active Owner: +${ownerNumber}\n` +
            `────────────────────────────\n` +
            `_Type *!help* or *!stats* for system controls._`
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
          if (rawJid === 'status@broadcast' || rawJid.endsWith('@broadcast')) continue;

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
            console.log(`[WhatsApp Server] [COMMAND] Executing owner command: "${trimmed}" in ${rawJid}`);
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
            `> *[RAGE OPTIMISER — MASTER HOTLINE CONSOLE]*\n` +
            `────────────────────────────\n` +
            `*MONITORING & METRICS*\n` +
            `• *!stats* — Server uptime, RAM, latency & member counts\n` +
            `• *!security* — Anti-Nuke state & quarantined count\n` +
            `• *!tickets* — Active support tickets summary\n` +
            `• *!ping* — Discord gateway & hotline latency check\n\n` +
            `*EMERGENCY & DEFENSE*\n` +
            `• *!lockdown [reason]* — Lock all text channels\n` +
            `• *!unlock* — Lift emergency lockdown\n` +
            `• *!ban <userId> [reason]* — Ban member from Discord\n` +
            `• *!unban <userId>* — Unban member\n` +
            `• *!kick <userId> [reason]* — Kick member from server\n` +
            `• *!timeout <userId> <min> [reason]* — Timeout member\n` +
            `• *!untimeout <userId>* — Lift timeout\n` +
            `• *!quarantine <userId> [reason]* — Strip roles & isolate\n` +
            `• *!unquarantine <userId>* — Restore roles & release\n` +
            `• *!whitelist <add/remove> <userId>* — Anti-Nuke whitelist\n` +
            `• *!raid <on/off>* — Toggle high-threat join protection\n\n` +
            `*BROADCAST & ANNOUNCEMENTS*\n` +
            `• *!say <#channel> <message>* — Send message to Discord\n` +
            `• *!embed <#channel> <title> | <desc>* — Send rich embed\n\n` +
            `*TICKETS*\n` +
            `• *!closeticket <id> [reason]* — Close & delete ticket\n` +
            `• *!ticketinfo <id>* — View ticket creator & details\n\n` +
            `*BACKUPS & RECOVERY*\n` +
            `• *!backup* — Snapshot channels, roles & permissions\n` +
            `• *!backups* — List saved server snapshots\n\n` +
            `*INTELLIGENCE LOOKUPS*\n` +
            `• *!whois <userId>* — Account age, join date & roles\n` +
            `• *!logs [count]* — View recent Discord audit logs\n\n` +
            `*SYSTEM CONTROL*\n` +
            `• *!setgroup* — Bind current group for all alerts\n` +
            `• *!clearcache* — Free RAM & purge message cache\n` +
            `• *!restart* — Reboot bot process on host\n` +
            `────────────────────────────\n` +
            `_Type any command above directly in this chat._`;
          await this.sendRaw(replyJid, helpText);
          break;
        }

        case '!setgroup': {
          if (!replyJid.endsWith('@g.us')) {
            await this.sendRaw(replyJid, '[USAGE] !setgroup must be executed inside a WhatsApp group.');
            return;
          }
          this.configuredGroupJid = replyJid;
          await this.sendRaw(
            replyJid,
            `> *[HOTLINE GROUP CONFIGURED]*\n` +
            `────────────────────────────\n` +
            `This group is now set as the primary alert channel.\n` +
            `All anti-nuke alerts, ticket pings, and security notices will be routed here.\n` +
            `────────────────────────────`
          );
          break;
        }

        case '!ping': {
          const discordPing = this.discordGateway?.client?.ws?.ping ?? -1;
          const pingStr = discordPing >= 0 ? `${discordPing}ms` : 'Connecting';
          await this.sendRaw(
            replyJid,
            `> *[PONG]* Latency: *${pingStr}*\n` +
            `Hotline Status: *CONNECTED & SECURE*`
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
            `> *[LIVE SYSTEM METRICS]*\n` +
            `────────────────────────────\n` +
            `*Uptime:* ${metrics.uptime}\n` +
            `*Discord Latency:* ${metrics.latency}ms\n` +
            `*RAM (RSS):* ${rssMB} MB (Heap: ${heapMB} MB)\n` +
            `*Guilds:* ${guildCount}\n` +
            `*Total Members:* ${memberCount.toLocaleString()}\n` +
            `*Open Tickets:* ${openTickets}\n` +
            `*Status:* ONLINE & PROTECTED\n` +
            `────────────────────────────`;
          await this.sendRaw(replyJid, statsText);
          break;
        }

        case '!security': {
          const client = this.discordGateway?.client;
          const guildId = process.env.GUILD_ID || client?.guilds?.cache?.first()?.id;
          const guild = client?.guilds?.cache?.get(guildId);

          if (!guildId || !this.moduleRegistry) {
            await this.sendRaw(replyJid, '[NOTICE] Security module state not ready or guild not cached.');
            return;
          }

          const secMod = this.moduleRegistry.getModulesState(guildId)?.find((m: any) => m.id === 'security');
          const cfg = secMod?.config || {};

          const antiNuke = cfg.antiNukeEnabled !== false ? 'ACTIVE' : 'INACTIVE';
          const raidMode = cfg.raidModeEnabled ? 'RAID MODE ENABLED' : 'NORMAL';
          const emergency = cfg.emergencyMode ? 'EMERGENCY LOCKED' : 'NORMAL';
          const quarantineCount = (cfg.quarantinedUsers || []).length;
          const antiSpam = cfg.antiSpamEnabled ? 'ENABLED' : 'DISABLED';
          const antiLink = cfg.antiLinkEnabled ? 'ENABLED' : 'DISABLED';

          const secText =
            `> *[SECURITY & DEFENSE OVERVIEW]*\n` +
            `────────────────────────────\n` +
            `*Server:* ${guild?.name || 'Clutch Nation'}\n` +
            `*Anti-Nuke:* ${antiNuke}\n` +
            `*Raid Mode:* ${raidMode}\n` +
            `*Emergency Lock:* ${emergency}\n` +
            `*Quarantined Accounts:* ${quarantineCount}\n` +
            `*Anti-Spam Filter:* ${antiSpam}\n` +
            `*Anti-Link Filter:* ${antiLink}\n` +
            `────────────────────────────`;
          await this.sendRaw(replyJid, secText);
          break;
        }

        case '!tickets': {
          const client = this.discordGateway?.client;
          const guildId = process.env.GUILD_ID || client?.guilds?.cache?.first()?.id;

          if (!guildId || !this.moduleRegistry) {
            await this.sendRaw(replyJid, '[NOTICE] Ticket registry not available.');
            return;
          }

          const ticketMod = this.moduleRegistry.getModulesState(guildId)?.find((m: any) => m.id === 'tickets');
          const activeList = (ticketMod?.config?.activeTickets || []).filter((t: any) => t.status === 'open');

          if (activeList.length === 0) {
            await this.sendRaw(
              replyJid,
              `> *[SUPPORT TICKETS]*\n────────────────────────────\nNo open tickets. All clear.`
            );
            return;
          }

          let summary =
            `> *[ACTIVE SUPPORT TICKETS: ${activeList.length}]*\n` +
            `────────────────────────────\n`;

          const recent = activeList.slice(-5);
          for (const t of recent) {
            summary += `• *#${t.id.replace('ticket_', '')}* | *${t.category || 'General'}*\n  User: ${t.userTag}\n  Subject: "${(t.subject || 'No subject').slice(0, 40)}"\n`;
          }
          summary += `────────────────────────────`;

          await this.sendRaw(replyJid, summary);
          break;
        }

        case '!lockdown': {
          const reason = args.join(' ') || 'Emergency Lockdown triggered via WhatsApp Hotline';
          const client = this.discordGateway?.client;
          const guildId = process.env.GUILD_ID || client?.guilds?.cache?.first()?.id;
          const guild = client?.guilds?.cache?.get(guildId);

          if (!guild || !this.moduleRegistry) {
            await this.sendRaw(replyJid, '[ERROR] Failed to initiate lockdown: Guild not found.');
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
            `> *[EMERGENCY LOCKDOWN ENGAGED]*\n` +
            `────────────────────────────\n` +
            `*Server:* ${guild.name}\n` +
            `*Channels Locked:* ${lockedCount}\n` +
            `*Raid Mode:* FORCED ON\n` +
            `*Reason:* ${reason}\n` +
            `────────────────────────────\n` +
            `_Type *!unlock* when the incident is resolved._`
          );
          break;
        }

        case '!unlock': {
          const client = this.discordGateway?.client;
          const guildId = process.env.GUILD_ID || client?.guilds?.cache?.first()?.id;
          const guild = client?.guilds?.cache?.get(guildId);

          if (!guild || !this.moduleRegistry) {
            await this.sendRaw(replyJid, '[ERROR] Failed to lift lockdown: Guild not found.');
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
            `> *[EMERGENCY LOCKDOWN LIFTED]*\n` +
            `────────────────────────────\n` +
            `*Server:* ${guild.name}\n` +
            `*Channels Restored:* ${restoredCount}\n` +
            `*Raid Mode:* RESTORED TO NORMAL\n` +
            `────────────────────────────`
          );
          break;
        }

        // ── Remote Moderation Suite ──────────────────────────────────────────

        case '!ban': {
          const targetId = (args[0] || '').replace(/[^0-9]/g, '');
          const reason = args.slice(1).join(' ') || 'Banned via WhatsApp Hotline';
          const client = this.discordGateway?.client;
          const guildId = process.env.GUILD_ID || client?.guilds?.cache?.first()?.id;
          const guild = client?.guilds?.cache?.get(guildId);

          if (!targetId || !guild) {
            await this.sendRaw(replyJid, '[USAGE] !ban <userId> [reason]');
            return;
          }

          try {
            await guild.members.ban(targetId, { reason });
            await this.sendRaw(
              replyJid,
              `> *[MEMBER BANNED]*\n` +
              `────────────────────────────\n` +
              `*User ID:* \`${targetId}\`\n` +
              `*Server:* ${guild.name}\n` +
              `*Reason:* ${reason}\n` +
              `────────────────────────────`
            );
          } catch (banErr: any) {
            await this.sendRaw(replyJid, `[ERROR] Failed to ban \`${targetId}\`: ${banErr?.message || 'Permission error'}`);
          }
          break;
        }

        case '!unban': {
          const targetId = (args[0] || '').replace(/[^0-9]/g, '');
          const client = this.discordGateway?.client;
          const guildId = process.env.GUILD_ID || client?.guilds?.cache?.first()?.id;
          const guild = client?.guilds?.cache?.get(guildId);

          if (!targetId || !guild) {
            await this.sendRaw(replyJid, '[USAGE] !unban <userId>');
            return;
          }

          try {
            await guild.bans.remove(targetId, 'Unbanned via WhatsApp Hotline');
            await this.sendRaw(replyJid, `> *[USER UNBANNED]*\nUser ID \`${targetId}\` unbanned successfully.`);
          } catch (unbanErr: any) {
            await this.sendRaw(replyJid, `[ERROR] Failed to unban: ${unbanErr?.message || 'Ban not found'}`);
          }
          break;
        }

        case '!kick': {
          const targetId = (args[0] || '').replace(/[^0-9]/g, '');
          const reason = args.slice(1).join(' ') || 'Kicked via WhatsApp Hotline';
          const client = this.discordGateway?.client;
          const guildId = process.env.GUILD_ID || client?.guilds?.cache?.first()?.id;
          const guild = client?.guilds?.cache?.get(guildId);

          if (!targetId || !guild) {
            await this.sendRaw(replyJid, '[USAGE] !kick <userId> [reason]');
            return;
          }

          try {
            const member = await guild.members.fetch(targetId);
            await member.kick(reason);
            await this.sendRaw(
              replyJid,
              `> *[MEMBER KICKED]*\n` +
              `────────────────────────────\n` +
              `*User:* ${member.user.tag} (\`${targetId}\`)\n` +
              `*Reason:* ${reason}\n` +
              `────────────────────────────`
            );
          } catch (kickErr: any) {
            await this.sendRaw(replyJid, `[ERROR] Failed to kick: ${kickErr?.message || 'Member not found or higher role'}`);
          }
          break;
        }

        case '!timeout':
        case '!mute': {
          const targetId = (args[0] || '').replace(/[^0-9]/g, '');
          const minutes = parseInt(args[1], 10) || 10;
          const reason = args.slice(2).join(' ') || 'Timeout via WhatsApp Hotline';
          const client = this.discordGateway?.client;
          const guildId = process.env.GUILD_ID || client?.guilds?.cache?.first()?.id;
          const guild = client?.guilds?.cache?.get(guildId);

          if (!targetId || !guild) {
            await this.sendRaw(replyJid, '[USAGE] !timeout <userId> [minutes] [reason]');
            return;
          }

          try {
            const member = await guild.members.fetch(targetId);
            await member.timeout(minutes * 60 * 1000, reason);
            await this.sendRaw(
              replyJid,
              `> *[MEMBER TIMED OUT]*\n` +
              `────────────────────────────\n` +
              `*User:* ${member.user.tag} (\`${targetId}\`)\n` +
              `*Duration:* ${minutes} minute(s)\n` +
              `*Reason:* ${reason}\n` +
              `────────────────────────────`
            );
          } catch (tErr: any) {
            await this.sendRaw(replyJid, `[ERROR] Failed to timeout: ${tErr?.message || 'Error or higher role'}`);
          }
          break;
        }

        case '!untimeout':
        case '!unmute': {
          const targetId = (args[0] || '').replace(/[^0-9]/g, '');
          const client = this.discordGateway?.client;
          const guildId = process.env.GUILD_ID || client?.guilds?.cache?.first()?.id;
          const guild = client?.guilds?.cache?.get(guildId);

          if (!targetId || !guild) {
            await this.sendRaw(replyJid, '[USAGE] !untimeout <userId>');
            return;
          }

          try {
            const member = await guild.members.fetch(targetId);
            await member.timeout(null, 'Timeout lifted via WhatsApp');
            await this.sendRaw(replyJid, `> *[TIMEOUT REMOVED]*\nTimeout lifted for ${member.user.tag} (\`${targetId}\`).`);
          } catch (tErr: any) {
            await this.sendRaw(replyJid, `[ERROR] Failed: ${tErr?.message}`);
          }
          break;
        }

        case '!quarantine': {
          const targetId = (args[0] || '').replace(/[^0-9]/g, '');
          const reason = args.slice(1).join(' ') || 'Quarantined via WhatsApp Hotline';
          const client = this.discordGateway?.client;
          const guildId = process.env.GUILD_ID || client?.guilds?.cache?.first()?.id;
          const guild = client?.guilds?.cache?.get(guildId);

          if (!targetId || !guild || !this.moduleRegistry) {
            await this.sendRaw(replyJid, '[USAGE] !quarantine <userId> [reason]');
            return;
          }

          try {
            const member = await guild.members.fetch(targetId);
            const secMod = this.moduleRegistry.getModulesState(guildId)?.find((m: any) => m.id === 'security');
            const cfg = secMod?.config || {};
            const quarantineRoleId = cfg.quarantineRoleId;

            const rolesToRemove = member.roles.cache.filter((r: any) => r.name !== '@everyone' && !r.managed);
            const originalRoleIds = Array.from(rolesToRemove.keys());

            if (quarantineRoleId && guild.roles.cache.has(quarantineRoleId)) {
              await member.roles.add(quarantineRoleId).catch(() => {});
            }
            for (const rId of originalRoleIds) {
              await member.roles.remove(rId).catch(() => {});
            }

            const quarantinedUsers = (cfg.quarantinedUsers || []).filter((u: any) => u.userId !== targetId);
            quarantinedUsers.push({
              id: `q-${Date.now()}`,
              tag: member.user.username,
              userId: targetId,
              reason,
              time: new Date().toISOString(),
              status: 'Quarantined',
              risk: 'danger',
              originalRoles: originalRoleIds
            });

            this.moduleRegistry.updateModuleConfig(guildId, 'security', { quarantinedUsers });
            await this.sendRaw(
              replyJid,
              `> *[MEMBER QUARANTINED]*\n` +
              `────────────────────────────\n` +
              `*User:* ${member.user.tag} (\`${targetId}\`)\n` +
              `*Roles Stripped:* ${originalRoleIds.length}\n` +
              `*Reason:* ${reason}\n` +
              `────────────────────────────`
            );
          } catch (qErr: any) {
            await this.sendRaw(replyJid, `[ERROR] Quarantine failed: ${qErr?.message}`);
          }
          break;
        }

        case '!unquarantine': {
          const targetId = (args[0] || '').replace(/[^0-9]/g, '');
          const client = this.discordGateway?.client;
          const guildId = process.env.GUILD_ID || client?.guilds?.cache?.first()?.id;
          const guild = client?.guilds?.cache?.get(guildId);

          if (!targetId || !guild || !this.moduleRegistry) {
            await this.sendRaw(replyJid, '[USAGE] !unquarantine <userId>');
            return;
          }

          try {
            const member = await guild.members.fetch(targetId);
            const secMod = this.moduleRegistry.getModulesState(guildId)?.find((m: any) => m.id === 'security');
            const cfg = secMod?.config || {};
            const quarantinedUsers = cfg.quarantinedUsers || [];
            const userEntry = quarantinedUsers.find((u: any) => u.userId === targetId);

            if (cfg.quarantineRoleId) {
              await member.roles.remove(cfg.quarantineRoleId).catch(() => {});
            }

            const rolesToRestore = userEntry?.originalRoles || userEntry?.roles || userEntry?.roleIds || [];
            if (Array.isArray(rolesToRestore)) {
              for (const rId of rolesToRestore) {
                await member.roles.add(rId).catch(() => {});
              }
            }

            const updatedList = quarantinedUsers.filter((u: any) => u.userId !== targetId);
            this.moduleRegistry.updateModuleConfig(guildId, 'security', { quarantinedUsers: updatedList });

            await this.sendRaw(
              replyJid,
              `> *[MEMBER RELEASED]*\n` +
              `────────────────────────────\n` +
              `*User:* ${member.user.tag} (\`${targetId}\`)\n` +
              `Roles successfully restored.\n` +
              `────────────────────────────`
            );
          } catch (uqErr: any) {
            await this.sendRaw(replyJid, `[ERROR] Unquarantine failed: ${uqErr?.message}`);
          }
          break;
        }

        case '!whitelist': {
          const sub = (args[0] || '').toLowerCase();
          const targetId = (args[1] || '').replace(/[^0-9]/g, '');
          const client = this.discordGateway?.client;
          const guildId = process.env.GUILD_ID || client?.guilds?.cache?.first()?.id;

          if (!guildId || !this.moduleRegistry || (sub !== 'add' && sub !== 'remove') || !targetId) {
            await this.sendRaw(replyJid, '[USAGE] !whitelist add <userId> OR !whitelist remove <userId>');
            return;
          }

          const secMod = this.moduleRegistry.getModulesState(guildId)?.find((m: any) => m.id === 'security');
          const cfg = secMod?.config || {};
          let list: string[] = cfg.whitelistedUsers || [];

          if (sub === 'add') {
            if (!list.includes(targetId)) list.push(targetId);
            this.moduleRegistry.updateModuleConfig(guildId, 'security', { whitelistedUsers: list });
            await this.sendRaw(replyJid, `> *[WHITELIST UPDATED]*\nUser \`${targetId}\` added to Anti-Nuke Whitelist.`);
          } else {
            list = list.filter((id: string) => id !== targetId);
            this.moduleRegistry.updateModuleConfig(guildId, 'security', { whitelistedUsers: list });
            await this.sendRaw(replyJid, `> *[WHITELIST UPDATED]*\nUser \`${targetId}\` removed from Anti-Nuke Whitelist.`);
          }
          break;
        }

        case '!raid': {
          const mode = (args[0] || '').toLowerCase();
          const client = this.discordGateway?.client;
          const guildId = process.env.GUILD_ID || client?.guilds?.cache?.first()?.id;

          if (mode !== 'on' && mode !== 'off') {
            await this.sendRaw(replyJid, '[USAGE] !raid on OR !raid off');
            return;
          }

          if (!guildId || !this.moduleRegistry) {
            await this.sendRaw(replyJid, '[ERROR] Security module not available.');
            return;
          }

          const secMod = this.moduleRegistry.getModulesState(guildId)?.find((m: any) => m.id === 'security');
          const isEnabled = mode === 'on';
          this.moduleRegistry.updateModuleConfig(guildId, 'security', { ...(secMod?.config || {}), raidModeEnabled: isEnabled });

          await this.sendRaw(
            replyJid,
            isEnabled
              ? `> *[RAID MODE ENGAGED]*\nHigh-threat join protection is now ACTIVE on Discord.`
              : `> *[RAID MODE DEACTIVATED]*\nRaid defense returned to normal mode.`
          );
          break;
        }

        // ── Remote Broadcast Suite ───────────────────────────────────────────

        case '!say': {
          const chanTarget = (args[0] || '').replace(/[<#>]/g, '');
          const message = args.slice(1).join(' ');
          const client = this.discordGateway?.client;
          const guildId = process.env.GUILD_ID || client?.guilds?.cache?.first()?.id;
          const guild = client?.guilds?.cache?.get(guildId);

          if (!chanTarget || !message || !guild) {
            await this.sendRaw(replyJid, '[USAGE] !say <#channel or channelId> <message>');
            return;
          }

          const channel = guild.channels.cache.get(chanTarget) ||
            guild.channels.cache.find((c: any) => c.name.toLowerCase() === chanTarget.toLowerCase() && c.isTextBased());

          if (!channel || !channel.isTextBased()) {
            await this.sendRaw(replyJid, `[ERROR] Text channel "${chanTarget}" not found.`);
            return;
          }

          try {
            await (channel as any).send({ content: message });
            await this.sendRaw(replyJid, `> *[MESSAGE DISPATCHED]*\nSent to #${channel.name}: "${message.slice(0, 50)}..."`);
          } catch (sendErr: any) {
            await this.sendRaw(replyJid, `[ERROR] Failed to send message: ${sendErr?.message}`);
          }
          break;
        }

        case '!embed': {
          const chanTarget = (args[0] || '').replace(/[<#>]/g, '');
          const rest = args.slice(1).join(' ');
          const [title, ...descParts] = rest.split('|');
          const description = descParts.join('|').trim();
          const client = this.discordGateway?.client;
          const guildId = process.env.GUILD_ID || client?.guilds?.cache?.first()?.id;
          const guild = client?.guilds?.cache?.get(guildId);

          if (!chanTarget || !title || !description || !guild) {
            await this.sendRaw(replyJid, '[USAGE] !embed <#channel> <title> | <message>');
            return;
          }

          const channel = guild.channels.cache.get(chanTarget) ||
            guild.channels.cache.find((c: any) => c.name.toLowerCase() === chanTarget.toLowerCase() && c.isTextBased());

          if (!channel || !channel.isTextBased()) {
            await this.sendRaw(replyJid, `[ERROR] Text channel "${chanTarget}" not found.`);
            return;
          }

          try {
            const { EmbedBuilder } = await import('discord.js');
            const embed = new EmbedBuilder()
              .setTitle(title.trim())
              .setDescription(description)
              .setColor(0x84cc16)
              .setTimestamp()
              .setFooter({ text: 'Broadcasted via Rage Hotline' });

            await (channel as any).send({ embeds: [embed] });
            await this.sendRaw(replyJid, `> *[EMBED DISPATCHED]*\nSent to #${channel.name} with title: *${title.trim()}*`);
          } catch (embErr: any) {
            await this.sendRaw(replyJid, `[ERROR] Failed to dispatch embed: ${embErr?.message}`);
          }
          break;
        }

        // ── Remote Ticket Controls ───────────────────────────────────────────

        case '!closeticket': {
          const ticketId = (args[0] || '').trim();
          const reason = args.slice(1).join(' ') || 'Closed remotely via WhatsApp Hotline';
          const client = this.discordGateway?.client;
          const guildId = process.env.GUILD_ID || client?.guilds?.cache?.first()?.id;
          const guild = client?.guilds?.cache?.get(guildId);

          if (!ticketId || !guild || !this.moduleRegistry) {
            await this.sendRaw(replyJid, '[USAGE] !closeticket <ticketId> [reason]');
            return;
          }

          const ticketMod = this.moduleRegistry.getModulesState(guildId)?.find((m: any) => m.id === 'tickets');
          const tickets: any[] = ticketMod?.config?.activeTickets || [];
          const ticket = tickets.find((t: any) =>
            t.id === ticketId ||
            t.id === `ticket_${ticketId}` ||
            t.id.replace('ticket_', '') === ticketId ||
            t.channelId === ticketId
          );

          if (!ticket) {
            await this.sendRaw(replyJid, `[ERROR] Ticket \`#${ticketId}\` not found in active registry.`);
            return;
          }

          // Mark closed in registry
          ticket.status = 'closed';
          this.moduleRegistry.updateModuleConfig(guildId, 'tickets', { activeTickets: tickets });

          // Notify channel & schedule delete
          const ch = guild.channels.cache.get(ticket.channelId);
          if (ch) {
            await (ch as any).send?.({ content: `**Ticket closed remotely via WhatsApp Hotline.**\nReason: *${reason}*\n*Channel deleting in 5 seconds...*` }).catch(() => {});
            setTimeout(() => ch.delete('Closed via WhatsApp Hotline').catch(() => {}), 5000);
          }

          await this.sendRaw(
            replyJid,
            `> *[TICKET CLOSED]*\n` +
            `────────────────────────────\n` +
            `*Ticket:* #${ticket.id.replace('ticket_', '')}\n` +
            `*User:* ${ticket.userTag}\n` +
            `*Reason:* ${reason}\n` +
            `Discord channel scheduled for deletion.\n` +
            `────────────────────────────`
          );
          break;
        }

        case '!ticketinfo': {
          const ticketId = (args[0] || '').trim();
          const client = this.discordGateway?.client;
          const guildId = process.env.GUILD_ID || client?.guilds?.cache?.first()?.id;

          if (!ticketId || !this.moduleRegistry) {
            await this.sendRaw(replyJid, '[USAGE] !ticketinfo <ticketId>');
            return;
          }

          const ticketMod = this.moduleRegistry.getModulesState(guildId)?.find((m: any) => m.id === 'tickets');
          const tickets: any[] = ticketMod?.config?.activeTickets || [];
          const ticket = tickets.find((t: any) =>
            t.id === ticketId ||
            t.id === `ticket_${ticketId}` ||
            t.id.replace('ticket_', '') === ticketId
          );

          if (!ticket) {
            await this.sendRaw(replyJid, `[ERROR] Ticket \`#${ticketId}\` not found.`);
            return;
          }

          await this.sendRaw(
            replyJid,
            `> *[TICKET DETAILS: #${ticket.id.replace('ticket_', '')}]*\n` +
            `────────────────────────────\n` +
            `*Category:* ${ticket.category || 'General'}\n` +
            `*User:* ${ticket.userTag} (\`${ticket.userId}\`)\n` +
            `*Subject:* ${ticket.subject || 'No subject'}\n` +
            `*Status:* ${ticket.status.toUpperCase()}\n` +
            `*Created:* ${new Date(ticket.createdAt || Date.now()).toLocaleString()}\n` +
            `────────────────────────────`
          );
          break;
        }

        // ── Server Backups & Snapshots ───────────────────────────────────────

        case '!backup': {
          const client = this.discordGateway?.client;
          const guildId = process.env.GUILD_ID || client?.guilds?.cache?.first()?.id;
          const guild = client?.guilds?.cache?.get(guildId);

          if (!guild) {
            await this.sendRaw(replyJid, '[ERROR] Discord Guild not available for backup.');
            return;
          }

          try {
            await this.sendRaw(replyJid, '> *[CREATING BACKUP]*\nCapturing live server snapshot & anti-nuke state...');
            const { captureLiveSnapshot, saveLiveSnapshotToDb } = await import('../modules/security/manifest.js');
            const liveSnap = await captureLiveSnapshot(guild);
            await saveLiveSnapshotToDb(guild.id, liveSnap);

            await this.sendRaw(
              replyJid,
              `> *[BACKUP COMPLETED]*\n` +
              `────────────────────────────\n` +
              `*Server:* ${guild.name}\n` +
              `*Channels Synced:* ${guild.channels.cache.size}\n` +
              `*Roles Synced:* ${guild.roles.cache.size}\n` +
              `*Anti-Nuke Restoration:* READY & SECURED\n` +
              `*Time:* ${new Date().toLocaleTimeString()}\n` +
              `────────────────────────────`
            );
          } catch (bErr: any) {
            await this.sendRaw(replyJid, `[ERROR] Backup failed: ${bErr?.message}`);
          }
          break;
        }

        case '!backups': {
          try {
            const { Database } = await import('../core/Database.js');
            const db = Database.getDb();
            const client = this.discordGateway?.client;
            const guildId = process.env.GUILD_ID || client?.guilds?.cache?.first()?.id;

            if (!db) {
              await this.sendRaw(replyJid, '[ERROR] Database not connected.');
              return;
            }

            const rows = await db.all(
              'SELECT id, guildName, createdByName, timestamp, channelsCount, rolesCount FROM guild_backups WHERE guildId = ? ORDER BY timestamp DESC LIMIT 5',
              [guildId]
            ).catch(() => []);

            if (!rows || rows.length === 0) {
              await this.sendRaw(replyJid, `> *[SERVER BACKUPS]*\n────────────────────────────\nNo backups saved yet. Type *!backup* to create one.`);
              return;
            }

            let text = `> *[SAVED SERVER BACKUPS: ${rows.length}]*\n────────────────────────────\n`;
            for (const b of rows) {
              const dt = new Date(b.timestamp).toLocaleDateString();
              text += `• *${b.id}* | ${dt}\n  Channels: ${b.channelsCount} | Roles: ${b.rolesCount}\n`;
            }
            text += `────────────────────────────`;
            await this.sendRaw(replyJid, text);
          } catch (err: any) {
            await this.sendRaw(replyJid, `[ERROR] Failed to list backups: ${err?.message}`);
          }
          break;
        }

        // ── Intelligence & Audit Lookups ─────────────────────────────────────

        case '!whois': {
          const targetId = (args[0] || '').replace(/[^0-9]/g, '');
          const client = this.discordGateway?.client;
          const guildId = process.env.GUILD_ID || client?.guilds?.cache?.first()?.id;
          const guild = client?.guilds?.cache?.get(guildId);

          if (!targetId || !guild) {
            await this.sendRaw(replyJid, '[USAGE] !whois <userId>');
            return;
          }

          try {
            const member = await guild.members.fetch(targetId).catch(() => null);
            const user = member?.user || await client.users.fetch(targetId).catch(() => null);

            if (!user) {
              await this.sendRaw(replyJid, `[ERROR] User with ID \`${targetId}\` not found.`);
              return;
            }

            const daysOld = Math.floor((Date.now() - user.createdTimestamp) / (1000 * 60 * 60 * 24));
            const joinStr = member?.joinedAt ? member.joinedAt.toLocaleDateString() : 'Not in server';
            const rolesStr = member
              ? member.roles.cache.filter((r: any) => r.name !== '@everyone').map((r: any) => r.name).slice(0, 8).join(', ') || 'No roles'
              : 'N/A';

            await this.sendRaw(
              replyJid,
              `> *[USER INTELLIGENCE: ${user.tag || user.username}]*\n` +
              `────────────────────────────\n` +
              `*ID:* \`${user.id}\`\n` +
              `*Account Type:* ${user.bot ? 'Bot' : 'Human User'}\n` +
              `*Account Age:* ${daysOld} days old (${user.createdAt.toLocaleDateString()})\n` +
              `*Joined Server:* ${joinStr}\n` +
              `*Roles:* ${rolesStr}\n` +
              `────────────────────────────`
            );
          } catch (wErr: any) {
            await this.sendRaw(replyJid, `[ERROR] Failed to fetch user: ${wErr?.message}`);
          }
          break;
        }

        case '!logs': {
          const count = Math.min(parseInt(args[0], 10) || 5, 10);
          const client = this.discordGateway?.client;
          const guildId = process.env.GUILD_ID || client?.guilds?.cache?.first()?.id;
          const guild = client?.guilds?.cache?.get(guildId);

          if (!guild) {
            await this.sendRaw(replyJid, '[ERROR] Guild not available.');
            return;
          }

          try {
            const logs = await guild.fetchAuditLogs({ limit: count });
            let text = `> *[RECENT DISCORD AUDIT LOGS: ${logs.entries.size}]*\n────────────────────────────\n`;

            for (const [, entry] of logs.entries) {
              const execTag = entry.executor?.tag || entry.executor?.username || 'Unknown';
              const targetName = (entry.target as any)?.tag || (entry.target as any)?.name || (entry.target as any)?.id || 'None';
              text += `• *${entry.action}*\n  Executor: ${execTag}\n  Target: ${targetName}\n  Reason: ${entry.reason || 'None'}\n`;
            }
            text += `────────────────────────────`;
            await this.sendRaw(replyJid, text);
          } catch (logErr: any) {
            await this.sendRaw(replyJid, `[ERROR] Audit log fetch failed: ${logErr?.message}`);
          }
          break;
        }

        // ── System & Process Management ──────────────────────────────────────

        case '!clearcache': {
          const client = this.discordGateway?.client;
          let swept = 0;
          if (client) {
            client.channels.cache.forEach((ch: any) => {
              if (ch.messages?.cache) {
                swept += ch.messages.cache.size;
                ch.messages.cache.clear();
              }
            });
          }
          const mem = process.memoryUsage();
          const rssMB = Math.round(mem.rss / 1024 / 1024);
          await this.sendRaw(
            replyJid,
            `> *[MEMORY CACHE CLEARED]*\n` +
            `────────────────────────────\n` +
            `*Messages Swept:* ${swept}\n` +
            `*Current RAM (RSS):* ${rssMB} MB\n` +
            `────────────────────────────`
          );
          break;
        }

        case '!restart': {
          await this.sendRaw(
            replyJid,
            `> *[SERVER REBOOT INITIATED]*\n` +
            `────────────────────────────\n` +
            `Stopping Rage Optimiser process on container.\n` +
            `Host will reboot the bot in ~15-20 seconds.\n` +
            `────────────────────────────`
          );
          setTimeout(() => {
            process.exit(0);
          }, 1500);
          break;
        }

        default: {
          await this.sendRaw(
            replyJid,
            `[NOTICE] Unknown command: *${cmd}*\nType *!help* to view available commands.`
          );
          break;
        }
      }
    } catch (cmdErr: any) {
      console.error('[WhatsApp] Command handling error:', cmdErr);
      await this.sendRaw(replyJid, `[ERROR] Execution failed for *${cmd}*: ${cmdErr?.message || 'Internal error'}`);
    }
  }

  // ─── Outbound Alert API ───────────────────────────────────────────────────────

  public static async sendAlert(text: string): Promise<boolean> {
    if (!this.isEnabled()) return false;
    const targetJid = this.getGroupJid() || this.getOwnerJid();
    if (!targetJid) return false;
    return this.sendRaw(targetJid, text);
  }

  public static async sendSecurityAlert(payload: SecurityAlertPayload): Promise<boolean> {
    if (!this.isEnabled()) return false;
    const text =
      `> *[SECURITY THREAT DETECTED]*\n` +
      `────────────────────────────\n` +
      `*Event:* ${payload.type}\n` +
      `*Server:* ${payload.guildName || 'Protected Guild'}\n` +
      `*Executor:* ${payload.executor || 'Unknown'}\n` +
      (payload.target ? `*Target:* ${payload.target}\n` : '') +
      `*Action Taken:* ${payload.actionTaken || 'Quarantined & Mitigated'}\n` +
      (payload.details ? `*Details:* ${payload.details}\n` : '') +
      `*Time:* ${new Date().toLocaleTimeString()}\n` +
      `────────────────────────────\n` +
      `_Type *!lockdown* to freeze the server if needed._`;
    return this.sendAlert(text);
  }

  public static async sendTicketAlert(ticket: TicketAlertPayload): Promise<boolean> {
    if (!this.isEnabled()) return false;
    const text =
      `> *[NEW SUPPORT TICKET OPENED]*\n` +
      `────────────────────────────\n` +
      `*Category:* ${ticket.category || 'General'}\n` +
      `*User:* ${ticket.userTag}\n` +
      `*Subject:* ${ticket.subject}\n` +
      (ticket.channelName ? `*Channel:* #${ticket.channelName}\n` : '') +
      `*Time:* ${new Date().toLocaleTimeString()}\n` +
      `────────────────────────────`;
    return this.sendAlert(text);
  }

  public static async send2FAVerificationCode(code: string, purpose: string, guildName?: string): Promise<boolean> {
    if (!this.isEnabled()) return false;
    const text =
      `> *[2FA VERIFICATION CODE]*\n` +
      `────────────────────────────\n` +
      `*Code:* *${code}*\n` +
      `*Purpose:* ${purpose}\n` +
      `*Server:* ${guildName || 'Protected Guild'}\n` +
      `*Expires:* In 5 minutes\n` +
      `────────────────────────────\n` +
      `_Do not share this code with anyone._`;
    return this.sendAlert(text);
  }

  public static async sendSystemAlert(title: string, message: string): Promise<boolean> {
    if (!this.isEnabled()) return false;
    const text =
      `> *[SYSTEM ALERT: ${title.toUpperCase()}]*\n` +
      `────────────────────────────\n` +
      `${message}\n` +
      `*Time:* ${new Date().toLocaleTimeString()}\n` +
      `────────────────────────────`;
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
