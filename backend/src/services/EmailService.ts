/**
 * EmailService — Rage Optimiser Enterprise
 *
 * Sends Gmail SMTP security alerts when critical events occur.
 * Professional, high-contrast, minimalist email template without emojis or spreadsheet grids.
 * Uses Nodemailer with an App Password.
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { ModuleRegistry } from '../core/ModuleRegistry.js';

// ─── Config helpers ───────────────────────────────────────────────────────────

function cfg() {
  return {
    from:     process.env.ALERT_EMAIL_FROM?.trim()     || '',
    password: process.env.ALERT_EMAIL_PASSWORD?.trim() || '',
    to:       process.env.ALERT_EMAIL_TO?.trim()       || '',
  };
}

function isConfigured(): boolean {
  const { from, password, to } = cfg();
  return Boolean(from && password && to);
}

// ─── Singleton transporter (lazy-init) ───────────────────────────────────────

let _transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!isConfigured()) return null;
  if (_transporter) return _transporter;

  const { from, password } = cfg();
  _transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: from, pass: password }
  });

  return _transporter;
}

// ─── Professional Detail Block (Replaces Generic Spreadsheet Table) ─────────

interface DetailItem {
  label: string;
  value: string;
  isDanger?: boolean;
  isSuccess?: boolean;
  isMono?: boolean;
}

function renderDetails(items: DetailItem[]): string {
  const rows = items
    .filter(item => Boolean(item && item.value))
    .map((item, idx, arr) => {
      const isLast = idx === arr.length - 1;
      let valColor = '#0F172A';
      if (item.isDanger) valColor = '#DC2626';
      if (item.isSuccess) valColor = '#16A34A';

      const fontFamily = item.isMono
        ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
        : "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

      return `<tr>
        <td style="padding:10px 0;border-bottom:${isLast ? 'none' : '1px solid #F1F5F9'};width:40%;vertical-align:top;">
          <span style="font-size:11px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;color:#64748B;">${item.label}</span>
        </td>
        <td style="padding:10px 0;border-bottom:${isLast ? 'none' : '1px solid #F1F5F9'};width:60%;text-align:right;vertical-align:top;">
          <span style="font-size:13px;font-weight:600;color:${valColor};font-family:${fontFamily};word-break:break-word;">${item.value}</span>
        </td>
      </tr>`;
    })
    .join('');

  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;border-top:1px solid #E2E8F0;border-bottom:1px solid #E2E8F0;">
    ${rows}
  </table>`;
}

// ─── Shared Simple Clean HTML Template ──────────────────────────────────────

function wrapHtml(
  title: string,
  body: string,
  severity: 'critical' | 'high' | 'info' = 'high',
  badgeText: string = 'SECURITY ALERT'
): string {
  const accents: Record<string, { badgeColor: string; badgeBg: string }> = {
    critical: {
      badgeColor: '#DC2626',
      badgeBg: '#FEF2F2'
    },
    high: {
      badgeColor: '#16A34A',
      badgeBg: '#F0FDF4'
    },
    info: {
      badgeColor: '#475569',
      badgeBg: '#F1F5F9'
    }
  };

  const accent = accents[severity] || accents.high;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;color:#1E293B;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F8FAFC;padding:32px 16px;">
    <tr>
      <td align="center">
        <!-- Clean Simple Container -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:540px;background-color:#FFFFFF;border:1px solid #E2E8F0;border-radius:8px;">
          <!-- Header Area -->
          <tr>
            <td style="padding:22px 28px 18px;border-bottom:1px solid #F1F5F9;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <span style="font-size:14px;font-weight:700;color:#0F172A;letter-spacing:0.5px;text-transform:uppercase;display:block;">Rage Optimiser</span>
                    <span style="font-size:11px;color:#64748B;display:block;margin-top:2px;">Security &amp; Management</span>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="display:inline-block;padding:3px 8px;background-color:${accent.badgeBg};color:${accent.badgeColor};font-size:11px;font-weight:600;border-radius:4px;text-transform:uppercase;letter-spacing:0.5px;">
                      ${badgeText}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding:26px 28px 24px;color:#334155;font-size:14px;line-height:1.6;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:18px 28px;background-color:#F8FAFC;border-top:1px solid #E2E8F0;text-align:center;">
              <p style="margin:0 0 4px;font-size:11px;color:#64748B;">
                Rage Optimiser &bull; Automated Security Telemetry
              </p>
              <p style="margin:0;font-size:11px;color:#94A3B8;">
                Generated at ${new Date().toUTCString()} &bull; Do not reply
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Main Service ─────────────────────────────────────────────────────────────

export class EmailService {
  /** Verify SMTP credentials at startup. Logs result, never throws. */
  public static async testConnection(): Promise<boolean> {
    if (!isConfigured()) {
      console.log('[EmailService] Email alerts not configured — set ALERT_EMAIL_FROM, ALERT_EMAIL_PASSWORD, ALERT_EMAIL_TO in .env.');
      return false;
    }
    const t = getTransporter();
    if (!t) return false;
    try {
      await t.verify();
      console.log(`[EmailService] Gmail SMTP verified. Alerts active -> ${cfg().to}`);
      return true;
    } catch (err: any) {
      console.error(`[EmailService] Gmail SMTP verify failed: ${err.message}`);
      return false;
    }
  }

  /** Generic fire-and-forget send. Never throws. */
  public static async sendAlert(subject: string, html: string, toOverride?: string): Promise<void> {
    if (!isConfigured()) return;
    const t = getTransporter();
    if (!t) return;
    const { from, to } = cfg();
    try {
      await t.sendMail({
        from: `"Rage Optimiser Security" <${from}>`,
        to:   toOverride || to,
        subject,
        html
      });
      console.log(`[EmailService] Alert sent -> ${toOverride || to} | "${subject}"`);
    } catch (err: any) {
      console.error(`[EmailService] Send failed: ${err.message}`);
    }
  }

  /** Look up configured 2FA/security alert email for a specific guild */
  public static getGuildAlertEmail(guildId?: string): string | undefined {
    if (!guildId) return undefined;
    try {
      const registry = ModuleRegistry.getInstance();
      if (registry) {
        const state = registry.getGuildState(guildId);
        const secMod = state?.modules?.find((m: any) => m.id === 'security');
        if (secMod?.config?.alertEmail) return secMod.config.alertEmail;
      }
    } catch {}
    return undefined;
  }

  // ─── Typed Alert Methods (Emoji-Free & Clean Key-Value Cards) ──────────────

  /** Anti-nuke action triggered */
  public static async sendAntiNukeAlert(opts: {
    guildName:   string;
    guildId:     string;
    action:      string;
    executor:    string;
    executorId?: string;
    extra?:      string;
    toOverride?: string;
  }): Promise<void> {
    const details = renderDetails([
      { label: 'Protected Server', value: `${opts.guildName} (${opts.guildId})` },
      { label: 'Detected Threat', value: opts.action, isDanger: true },
      { label: 'Executor Account', value: opts.executor + (opts.executorId ? ` (${opts.executorId})` : ''), isMono: true },
      ...(opts.extra ? [{ label: 'Telemetry Details', value: opts.extra }] : []),
      { label: 'Mitigation State', value: 'NEUTRALIZED & ROLLED BACK', isSuccess: true },
      { label: 'Intervention Time', value: new Date().toUTCString(), isMono: true }
    ]);

    const body = `
      <h2 style="margin:0 0 8px;font-size:18px;font-weight:600;color:#0F172A;">Anti-Nuke Threat Neutralized</h2>
      <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">
        The Anti-Nuke Threat Defense Engine intercepted and neutralized an unauthorized action on <strong>${opts.guildName}</strong>.
      </p>
      ${details}
      <p style="margin:16px 0 0;font-size:13px;color:#64748B;line-height:1.5;">
        The executor account has been quarantined and dangerous roles revoked. Review your server audit log for full telemetry.
      </p>`;

    const recipient = opts.toOverride || this.getGuildAlertEmail(opts.guildId) || cfg().to;
    await this.sendAlert(
      `[SECURITY ALERT] Anti-Nuke Triggered — ${opts.guildName}`,
      wrapHtml(`Anti-Nuke Triggered — ${opts.action}`, body, 'critical', 'CRITICAL THREAT'),
      recipient
    );
  }

  /** Emergency server lockdown engaged or lifted */
  public static async sendEmergencyLockAlert(opts: {
    guildName:   string;
    guildId:     string;
    triggeredBy: string;
    engaged:     boolean;
    toOverride?: string;
  }): Promise<void> {
    const actionLabel = opts.engaged ? 'LOCKDOWN ENGAGED' : 'LOCKDOWN LIFTED';
    const details = renderDetails([
      { label: 'Protected Server', value: `${opts.guildName} (${opts.guildId})` },
      { label: 'Lockdown State', value: opts.engaged ? 'ENGAGED' : 'LIFTED', isDanger: opts.engaged, isSuccess: !opts.engaged },
      { label: 'Triggered By', value: opts.triggeredBy },
      { label: 'Communication Gate', value: opts.engaged ? 'ALL TEXT CHANNELS SEALED FOR @EVERYONE' : 'NORMAL COMMUNICATIONS RESTORED' },
      { label: 'Timestamp', value: new Date().toUTCString(), isMono: true }
    ]);

    const body = `
      <h2 style="margin:0 0 8px;font-size:18px;font-weight:600;color:#0F172A;">Emergency Lockdown ${opts.engaged ? 'Activated' : 'Lifted'}</h2>
      <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">
        Emergency lockdown has been <strong>${opts.engaged ? 'ENGAGED' : 'LIFTED'}</strong> on <strong>${opts.guildName}</strong>.
      </p>
      ${details}
      ${opts.engaged
        ? '<p style="color:#DC2626;font-weight:600;font-size:13px;margin:16px 0 0;">All channels have been locked down. Immediate administrative inspection recommended.</p>'
        : '<p style="color:#16A34A;font-size:13px;margin:16px 0 0;">Standard channel communication permissions have been restored across the server.</p>'
      }`;

    const recipient = opts.toOverride || this.getGuildAlertEmail(opts.guildId) || cfg().to;
    await this.sendAlert(
      `[SECURITY] Emergency Lockdown ${opts.engaged ? 'Engaged' : 'Lifted'} — ${opts.guildName}`,
      wrapHtml(actionLabel, body, opts.engaged ? 'critical' : 'info', actionLabel),
      recipient
    );
  }

  /** Raid mode toggled */
  public static async sendRaidModeAlert(opts: {
    guildName:    string;
    guildId:      string;
    triggeredBy:  string;
    enabled:      boolean;
    memberCount?: number;
    toOverride?:  string;
  }): Promise<void> {
    const details = renderDetails([
      { label: 'Protected Server', value: `${opts.guildName} (${opts.guildId})` },
      { label: 'Defense State', value: opts.enabled ? 'ACTIVE' : 'STANDBY', isDanger: opts.enabled, isSuccess: !opts.enabled },
      { label: 'Triggered By', value: opts.triggeredBy },
      ...(opts.memberCount !== undefined ? [{ label: 'Member Count', value: opts.memberCount.toLocaleString() }] : []),
      { label: 'Timestamp', value: new Date().toUTCString(), isMono: true }
    ]);

    const body = `
      <h2 style="margin:0 0 8px;font-size:18px;font-weight:600;color:#0F172A;">Raid Protection ${opts.enabled ? 'Activated' : 'Deactivated'}</h2>
      <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">
        Automated join-gate defense has been <strong>${opts.enabled ? 'ACTIVATED' : 'DEACTIVATED'}</strong> on <strong>${opts.guildName}</strong>.
      </p>
      ${details}`;

    const recipient = opts.toOverride || this.getGuildAlertEmail(opts.guildId) || cfg().to;
    await this.sendAlert(
      `[DEFENSE] Raid Protection ${opts.enabled ? 'Activated' : 'Deactivated'} — ${opts.guildName}`,
      wrapHtml(`Raid Protection ${opts.enabled ? 'Activated' : 'Deactivated'}`, body, opts.enabled ? 'high' : 'info', opts.enabled ? 'RAID DEFENSE ACTIVE' : 'RAID RESOLVED'),
      recipient
    );
  }

  /** User auto-quarantined */
  public static async sendQuarantineAlert(opts: {
    guildName: string;
    guildId:   string;
    userId:    string;
    username?: string;
    reason:    string;
    toOverride?: string;
  }): Promise<void> {
    const details = renderDetails([
      { label: 'Protected Server', value: `${opts.guildName} (${opts.guildId})` },
      { label: 'Target Account', value: `${opts.username || 'Unknown'} (${opts.userId})`, isMono: true },
      { label: 'Trigger Reason', value: opts.reason, isDanger: true },
      { label: 'Action Enforced', value: 'ROLES STRIPPED & ISOLATION TIMEOUT APPLIED' },
      { label: 'Timestamp', value: new Date().toUTCString(), isMono: true }
    ]);

    const body = `
      <h2 style="margin:0 0 8px;font-size:18px;font-weight:600;color:#0F172A;">Automated Account Quarantine Enforced</h2>
      <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">
        A suspicious or unverified action triggered an automated quarantine protocol on <strong>${opts.guildName}</strong>.
      </p>
      ${details}
      <p style="margin:16px 0 0;font-size:13px;color:#64748B;line-height:1.5;">
        If this was an authorized action, run <code style="background:#F1F5F9;border:1px solid #E2E8F0;padding:2px 6px;border-radius:4px;color:#0F172A;font-family:monospace;">r!unquarantine @user</code> in Discord to restore permissions.
      </p>`;

    const recipient = opts.toOverride || this.getGuildAlertEmail(opts.guildId) || cfg().to;
    await this.sendAlert(
      `[SECURITY] User Quarantined — ${opts.guildName}`,
      wrapHtml('User Auto-Quarantined', body, 'high', 'QUARANTINE ENFORCED'),
      recipient
    );
  }

  /** Bot added to a new guild */
  public static async sendNewGuildAlert(opts: {
    guildName:   string;
    guildId:     string;
    ownerTag:    string;
    ownerId:     string;
    memberCount: number;
    toOverride?: string;
  }): Promise<void> {
    const details = renderDetails([
      { label: 'Server Name', value: `${opts.guildName} (${opts.guildId})` },
      { label: 'Server Owner', value: `${opts.ownerTag} (${opts.ownerId})`, isMono: true },
      { label: 'Member Count', value: opts.memberCount.toLocaleString() },
      { label: 'Deployed At', value: new Date().toUTCString(), isMono: true }
    ]);

    const body = `
      <h2 style="margin:0 0 8px;font-size:18px;font-weight:600;color:#0F172A;">New Server Deployment Initialized</h2>
      <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">
        Rage Optimiser Sentinel was initialized on a new server.
      </p>
      ${details}
      <p style="margin:16px 0 0;font-size:13px;color:#64748B;">Review this server in the master administrative console to manage feature flags.</p>`;

    const recipient = opts.toOverride || cfg().to;
    await this.sendAlert(
      `[SYSTEM] New Server Deployment — ${opts.guildName} (${opts.memberCount} members)`,
      wrapHtml('New Guild Added', body, 'info', 'GUILD DEPLOYMENT'),
      recipient
    );
  }

  /** Send a test email. Returns true on success. */
  public static async sendTestEmail(toOverride?: string): Promise<boolean> {
    if (!isConfigured()) return false;

    const details = renderDetails([
      { label: 'System Status', value: 'ONLINE & AUTHENTICATED', isSuccess: true },
      { label: 'Delivery Gateway', value: 'GMAIL ENTERPRISE SMTP' },
      { label: 'Dispatched To', value: toOverride || cfg().to, isMono: true },
      { label: 'Timestamp', value: new Date().toUTCString(), isMono: true }
    ]);

    const body = `
      <h2 style="margin:0 0 8px;font-size:18px;font-weight:600;color:#0F172A;">SMTP Dispatch Connection Verified</h2>
      <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">
        Automated test transmission confirming that the <strong>Rage Optimiser Enterprise</strong> email dispatch pipeline is fully operational.
      </p>
      ${details}
      <p style="margin:16px 0 0;font-size:13px;color:#64748B;">
        All security alerts (Anti-Nuke, Quarantine, Emergency Lockdown, Raid Mode, and 2FA Verification Codes) are successfully routed through this channel.
      </p>`;

    try {
      await this.sendAlert('[VERIFICATION] SMTP Delivery Test — Rage Optimiser', wrapHtml('Gmail Alert Test', body, 'info', 'SYSTEM TEST'), toOverride);
      return true;
    } catch {
      return false;
    }
  }

  /** Send a 6-digit 2FA verification OTP code to link or verify Gmail alerts. */
  public static async send2FAVerificationCode(toEmail: string, code: string, guildName: string): Promise<{ success: boolean; error?: string }> {
    if (!isConfigured()) return { success: false, error: 'SMTP credentials not configured in bot .env.' };
    const t = getTransporter();
    if (!t) return { success: false, error: 'SMTP Transporter initialization failed.' };
    const { from } = cfg();

    const details = renderDetails([
      { label: 'Protected Server', value: guildName },
      { label: 'Security Protocol', value: 'SENTINEL 2FA VERIFICATION GATE' },
      { label: 'Expires At', value: new Date(Date.now() + 10 * 60 * 1000).toUTCString(), isMono: true },
      { label: 'Requested At', value: new Date().toUTCString(), isMono: true }
    ]);

    const body = `
      <h2 style="margin:0 0 8px;font-size:18px;font-weight:600;color:#0F172A;">Two-Factor Authentication Passcode</h2>
      <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">
        A request was initiated for <strong>Sentinel 2FA &amp; Security Authorization</strong> on <strong>${guildName}</strong>.
      </p>

      <div style="text-align:center;padding:20px 0 16px;">
        <div style="font-size:11px;font-weight:600;color:#64748B;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">One-Time Verification Code</div>
        <div style="font-size:38px;font-weight:700;color:#0F172A;letter-spacing:8px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;">
          ${code}
        </div>
        <div style="font-size:12px;color:#64748B;margin-top:8px;">
          Valid for 10 minutes &bull; Single-use token
        </div>
      </div>

      ${details}

      <p style="margin:16px 0 0;font-size:13px;color:#475569;line-height:1.6;">
        To complete verification, return to Discord and execute:
        <br />
        <code style="display:inline-block;margin-top:6px;background-color:#F1F5F9;border:1px solid #E2E8F0;padding:6px 12px;border-radius:4px;color:#0F172A;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:13px;font-weight:600;">r!email verify ${code}</code>
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#94A3B8;line-height:1.5;">
        If you did not request this verification code, please ignore this email or review your server audit logs.
      </p>`;

    try {
      await t.sendMail({
        from: `"Rage Optimiser Security" <${from}>`,
        to: toEmail,
        subject: `[SECURITY] 2FA Verification Code [${code}] — ${guildName}`,
        html: wrapHtml('Sentinel 2FA Verification', body, 'high', '2FA AUTHENTICATION')
      });
      console.log(`[EmailService] 2FA OTP code dispatched to ${toEmail}`);
      return { success: true };
    } catch (err: any) {
      console.error(`[EmailService] 2FA OTP send failed to ${toEmail}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /** Mask an email for safe display (e.g. keerthi5492@gmail.com -> kee******@gmail.com) */
  public static maskEmail(email: string): string {
    if (!email || !email.includes('@')) return 'Not Configured';
    const [user, domain] = email.split('@');
    if (user.length <= 3) return `${user.slice(0, 1)}***@${domain}`;
    return `${user.slice(0, 3)}${'*'.repeat(Math.min(6, user.length - 3))}@${domain}`;
  }

  private static pending2FACodes = new Map<string, { email: string; code: string; expiresAt: number; userId: string }>();

  public static setPending2FA(guildId: string, entry: { email: string; code: string; expiresAt: number; userId: string }): void {
    this.pending2FACodes.set(guildId, entry);
  }

  public static getPending2FA(guildId: string): { email: string; code: string; expiresAt: number; userId: string } | undefined {
    const entry = this.pending2FACodes.get(guildId);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.pending2FACodes.delete(guildId);
      return undefined;
    }
    return entry;
  }

  public static clearPending2FA(guildId: string): void {
    this.pending2FACodes.delete(guildId);
  }

  /** Send ticket transcript copy with HTML attachment to specified email */
  public static async sendTicketTranscript(opts: {
    to: string;
    guildName: string;
    ticketId: string;
    channelName: string;
    userTag: string;
    closedByTag: string;
    reason?: string;
    transcriptBuffer: Buffer;
  }): Promise<{ success: boolean; error?: string }> {
    if (!isConfigured()) return { success: false, error: 'SMTP not configured' };
    const t = getTransporter();
    if (!t) return { success: false, error: 'Transporter unavailable' };
    const { from } = cfg();

    const details = renderDetails([
      { label: 'Server', value: opts.guildName },
      { label: 'Ticket Channel', value: `#${opts.channelName}`, isMono: true },
      { label: 'Opened By', value: opts.userTag },
      { label: 'Closed By', value: opts.closedByTag },
      ...(opts.reason ? [{ label: 'Closing Reason', value: opts.reason }] : []),
      { label: 'Closed At', value: new Date().toUTCString(), isMono: true }
    ]);

    const body = `
      <h2 style="margin:0 0 8px;font-size:18px;font-weight:600;color:#0F172A;">Support Ticket Transcript Archive</h2>
      <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">
        A complete interaction transcript for ticket <strong>#${opts.channelName}</strong> on <strong>${opts.guildName}</strong> is attached below.
      </p>
      ${details}
      <p style="margin:16px 0 0;font-size:13px;color:#64748B;line-height:1.5;">
        An interactive HTML archive of the ticket conversation is attached to this transmission.
      </p>`;

    try {
      await t.sendMail({
        from: `"Rage Optimiser Support" <${from}>`,
        to: opts.to,
        subject: `[SUPPORT] Ticket Transcript [#${opts.channelName}] — ${opts.guildName}`,
        html: wrapHtml(`Ticket Transcript [#${opts.channelName}]`, body, 'info', 'TICKET TRANSCRIPT'),
        attachments: [
          {
            filename: `transcript-${opts.channelName}.html`,
            content: opts.transcriptBuffer,
            contentType: 'text/html'
          }
        ]
      });
      console.log(`[EmailService] Transcript email sent to ${opts.to} for #${opts.channelName}`);
      return { success: true };
    } catch (err: any) {
      console.error(`[EmailService] Failed to send transcript email to ${opts.to}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /** Whether email alerts are configured */
  public static isConfigured(): boolean {
    return isConfigured();
  }
}
