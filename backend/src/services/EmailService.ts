/**
 * EmailService — Rage Optimiser Enterprise
 *
 * Sends Gmail SMTP security alerts when critical events occur.
 * Uses Nodemailer with an App Password (no Google Cloud project needed).
 *
 * Required .env vars:
 *   ALERT_EMAIL_FROM     — Gmail address sending alerts   (e.g. bot@gmail.com)
 *   ALERT_EMAIL_PASSWORD — Gmail App Password (16-char)
 *   ALERT_EMAIL_TO       — Recipient address (bot owner / admin)
 *
 * All methods are no-ops when credentials are not configured.
 * sendAlert() is fire-and-forget — it never throws into the caller.
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

// ─── Custom Server Emojis for HTML Email (Discord CDN) ────────────────────────

export const EMOJI_IMG = {
  SHIELD:   '<img src="https://cdn.discordapp.com/emojis/1546134620087783526.gif?size=48" width="18" height="18" style="vertical-align:middle;display:inline-block;margin-right:4px;" alt="🛡️" />',
  APPROVED: '<img src="https://cdn.discordapp.com/emojis/1546134304625528882.gif?size=48" width="18" height="18" style="vertical-align:middle;display:inline-block;margin-right:4px;" alt="✅" />',
  WRONG:    '<img src="https://cdn.discordapp.com/emojis/1546155193303957504.gif?size=48" width="18" height="18" style="vertical-align:middle;display:inline-block;margin-right:4px;" alt="❌" />',
  WARNING:  '<img src="https://cdn.discordapp.com/emojis/1546155457981452441.gif?size=48" width="18" height="18" style="vertical-align:middle;display:inline-block;margin-right:4px;" alt="⚠️" />',
  LOADING:  '<img src="https://cdn.discordapp.com/emojis/1546134620087783526.gif?size=48" width="18" height="18" style="vertical-align:middle;display:inline-block;margin-right:4px;" alt="⏳" />',
  CROWN:    '<img src="https://cdn.discordapp.com/emojis/1538152266568306769.png?size=48" width="18" height="18" style="vertical-align:middle;display:inline-block;margin-right:4px;" alt="👑" />',
  GAVEL:    '<img src="https://cdn.discordapp.com/emojis/1532621057318584380.png?size=48" width="18" height="18" style="vertical-align:middle;display:inline-block;margin-right:4px;" alt="⚖️" />',
  STATS:    '<img src="https://cdn.discordapp.com/emojis/1532429110775779459.png?size=48" width="18" height="18" style="vertical-align:middle;display:inline-block;margin-right:4px;" alt="📊" />',
  VIP:      '<img src="https://cdn.discordapp.com/emojis/1532620837117759508.png?size=48" width="18" height="18" style="vertical-align:middle;display:inline-block;margin-right:4px;" alt="⭐" />',
};

// ─── Shared HTML template ─────────────────────────────────────────────────────

function wrapHtml(
  title: string,
  body: string,
  severity: 'critical' | 'high' | 'info' = 'high',
  badgeText: string = 'SECURITY ALERT'
): string {
  const accents: Record<string, { gradient: string; badgeBg: string; badgeBorder: string; badgeColor: string }> = {
    critical: {
      gradient: 'linear-gradient(90deg, #EF4444 0%, #DC2626 50%, #F59E0B 100%)',
      badgeBg: 'rgba(239, 68, 68, 0.12)',
      badgeBorder: 'rgba(239, 68, 68, 0.3)',
      badgeColor: '#EF4444'
    },
    high: {
      gradient: 'linear-gradient(90deg, #57F287 0%, #00D26A 50%, #3B82F6 100%)',
      badgeBg: 'rgba(87, 242, 135, 0.12)',
      badgeBorder: 'rgba(87, 242, 135, 0.3)',
      badgeColor: '#57F287'
    },
    info: {
      gradient: 'linear-gradient(90deg, #3B82F6 0%, #6366F1 50%, #57F287 100%)',
      badgeBg: 'rgba(59, 130, 246, 0.12)',
      badgeBorder: 'rgba(59, 130, 246, 0.3)',
      badgeColor: '#60A5FA'
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
<body style="margin:0;padding:0;background-color:#08090d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#08090d;padding:40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;background-color:#11141d;border:1px solid #1f2533;border-radius:14px;overflow:hidden;box-shadow:0 12px 36px rgba(0,0,0,0.45);">
          <!-- Top Accent Glow Line -->
          <tr>
            <td style="height:4px;background:${accent.gradient};font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <!-- Header Area -->
          <tr>
            <td style="padding:32px 36px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <!-- Logo / Brand Text -->
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background-color:#161c28;border:1px solid #283247;border-radius:8px;padding:6px 10px;line-height:0;">
                          <img src="https://cdn.discordapp.com/emojis/1546134620087783526.gif?size=48" width="24" height="24" style="vertical-align:middle;display:block;" alt="Shield" />
                        </td>
                        <td style="padding-left:12px;">
                          <span style="font-size:15px;font-weight:800;color:#FFFFFF;letter-spacing:1.5px;text-transform:uppercase;display:block;">RAGE OPTIMISER</span>
                          <span style="font-size:11px;font-weight:600;color:#64748B;letter-spacing:1px;text-transform:uppercase;">Enterprise Sentinel</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right">
                    <span style="display:inline-block;padding:4px 10px;background-color:${accent.badgeBg};border:1px solid ${accent.badgeBorder};color:${accent.badgeColor};font-size:11px;font-weight:700;letter-spacing:1px;border-radius:20px;text-transform:uppercase;">
                      ${badgeText}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Divider -->
          <tr>
            <td style="padding:0 36px;">
              <hr style="border:none;border-top:1px solid #1d2331;margin:0;" />
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding:28px 36px 24px;color:#CBD5E1;font-size:14px;line-height:1.65;">
              ${body}
            </td>
          </tr>
          <!-- Security Notice Callout -->
          <tr>
            <td style="padding:0 36px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0d111a;border:1px solid #1c2436;border-radius:8px;padding:14px 16px;">
                <tr>
                  <td style="font-size:14px;vertical-align:top;width:24px;">🔒</td>
                  <td style="font-size:12px;color:#94A3B8;line-height:1.5;padding-left:8px;">
                    <strong style="color:#CBD5E1;">Security Advisory:</strong> Rage Optimiser personnel will never ask for your verification codes or passwords. If you did not authorize this action, immediate server audit log inspection is recommended.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#0b0d14;border-top:1px solid #1a202e;padding:24px 36px;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#64748B;">
                Rage Optimiser Enterprise &bull; Unbypassable Discord Defense
              </p>
              <p style="margin:0;font-size:11px;color:#475569;">
                Automated security dispatch &bull; Sent at ${new Date().toUTCString()} &bull; Do not reply
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

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:10px 14px;font-size:12px;font-weight:600;color:#64748B;width:140px;border-bottom:1px solid #1c2333;text-transform:uppercase;letter-spacing:0.5px;">${label}</td>
    <td style="padding:10px 14px;font-size:13px;font-weight:600;color:#F1F5F9;border-bottom:1px solid #1c2333;">${value}</td>
  </tr>`;
}

function table(rows: string): string {
  return `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#0d1017;border:1px solid #1d2433;border-radius:8px;margin:20px 0;overflow:hidden;">${rows}</table>`;
}

// ─── Main Service ─────────────────────────────────────────────────────────────

export class EmailService {
  /** Verify SMTP credentials at startup. Logs result, never throws. */
  public static async testConnection(): Promise<boolean> {
    if (!isConfigured()) {
      console.log('[EmailService] ⚠️  Email alerts not configured — set ALERT_EMAIL_FROM, ALERT_EMAIL_PASSWORD, ALERT_EMAIL_TO in .env.');
      return false;
    }
    const t = getTransporter();
    if (!t) return false;
    try {
      await t.verify();
      console.log(`[EmailService] ✅ Gmail SMTP verified. Alerts active → ${cfg().to}`);
      return true;
    } catch (err: any) {
      console.error(`[EmailService] ❌ Gmail SMTP verify failed: ${err.message}`);
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
      console.log(`[EmailService] 📧 Alert sent → ${toOverride || to} | "${subject}"`);
    } catch (err: any) {
      console.error(`[EmailService] ❌ Send failed: ${err.message}`);
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

  // ─── Typed alert methods ─────────────────────────────────────────────────

  /** Anti-nuke action triggered */
  public static async sendAntiNukeAlert(opts: {
    guildName:   string;
    guildId:     string;
    action:      string;
    executor:    string;
    executorId?: string;
    extra?:      string;
  }): Promise<void> {
    const body = `
      <h2 style="margin:0 0 10px;font-size:20px;font-weight:700;color:#FFFFFF;">Anti-Nuke Intervened</h2>
      <p style="margin:0 0 20px;color:#94A3B8;font-size:14px;line-height:1.6;">
        The <strong>Anti-Nuke Threat Defense Engine</strong> automatically neutralized an unauthorized action on <strong><span style="color:#F8FAFC;">${opts.guildName}</span></strong>.
      </p>
      ${table(
        row('Protected Server', `${opts.guildName} (${opts.guildId})`) +
        row('Detected Threat', `<span style="color:#EF4444;font-weight:700;">${EMOJI_IMG.GAVEL} ${opts.action}</span>`) +
        row('Executor', opts.executor + (opts.executorId ? ` (${opts.executorId})` : '')) +
        (opts.extra ? row('Details', opts.extra) : '') +
        row('Intervention Time', new Date().toUTCString())
      )}
      <p style="margin:16px 0 0;font-size:13px;color:#94A3B8;">The executor account has been quarantined. Review your server audit log for full event telemetry.</p>`;

    const recipient = this.getGuildAlertEmail(opts.guildId) || cfg().to;
    await this.sendAlert(
      `🚨 Anti-Nuke Triggered — ${opts.guildName}`,
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
  }): Promise<void> {
    const action = opts.engaged ? 'EMERGENCY LOCKDOWN ENGAGED' : 'Emergency Lockdown Lifted';
    const body = `
      <h2 style="margin:0 0 10px;font-size:20px;font-weight:700;color:#FFFFFF;">${action}</h2>
      <p style="margin:0 0 20px;color:#94A3B8;font-size:14px;line-height:1.6;">
        Emergency lockdown has been <strong>${opts.engaged ? 'ACTIVATED' : 'deactivated'}</strong> on <strong><span style="color:#F8FAFC;">${opts.guildName}</span></strong>.
      </p>
      ${table(
        row('Protected Server', `${opts.guildName} (${opts.guildId})`) +
        row('State', `<span style="color:${opts.engaged ? '#EF4444' : '#57F287'};font-weight:700;">${opts.engaged ? `${EMOJI_IMG.WRONG} ENGAGED` : `${EMOJI_IMG.APPROVED} LIFTED`}</span>`) +
        row('Triggered By', opts.triggeredBy) +
        row('Timestamp', new Date().toUTCString())
      )}
      ${opts.engaged
        ? '<p style="color:#F59E0B;font-weight:600;margin:16px 0 0;">All text channels have been sealed for @everyone. Immediate administrative review recommended.</p>'
        : '<p style="color:#57F287;margin:16px 0 0;">Normal server communications have been restored.</p>'
      }`;

    const recipient = this.getGuildAlertEmail(opts.guildId) || cfg().to;
    await this.sendAlert(
      `${opts.engaged ? '🔴' : '🟢'} ${action} — ${opts.guildName}`,
      wrapHtml(action, body, opts.engaged ? 'critical' : 'info', opts.engaged ? 'LOCKDOWN ENGAGED' : 'LOCKDOWN LIFTED'),
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
  }): Promise<void> {
    const body = `
      <h2 style="margin:0 0 10px;font-size:20px;font-weight:700;color:#FFFFFF;">Raid Mode ${opts.enabled ? 'Activated' : 'Deactivated'}</h2>
      <p style="margin:0 0 20px;color:#94A3B8;font-size:14px;line-height:1.6;">
        Automated join-gate defense has been <strong>${opts.enabled ? 'ACTIVATED' : 'deactivated'}</strong> on <strong><span style="color:#F8FAFC;">${opts.guildName}</span></strong>.
      </p>
      ${table(
        row('Protected Server', `${opts.guildName} (${opts.guildId})`) +
        row('Defense State', `<strong>${opts.enabled ? `${EMOJI_IMG.SHIELD} ACTIVATED` : `${EMOJI_IMG.APPROVED} Deactivated`}</strong>`) +
        row('Triggered By', opts.triggeredBy) +
        (opts.memberCount !== undefined ? row('Member Count', opts.memberCount.toLocaleString()) : '') +
        row('Timestamp', new Date().toUTCString())
      )}`;

    const recipient = this.getGuildAlertEmail(opts.guildId) || cfg().to;
    await this.sendAlert(
      `⚔️ Raid Mode ${opts.enabled ? 'Activated' : 'Deactivated'} — ${opts.guildName}`,
      wrapHtml(`Raid Mode ${opts.enabled ? 'Activated' : 'Deactivated'}`, body, opts.enabled ? 'high' : 'info', opts.enabled ? 'RAID DEFENSE ACTIVE' : 'RAID RESOLVED'),
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
  }): Promise<void> {
    const body = `
      <h2 style="margin:0 0 10px;font-size:20px;font-weight:700;color:#FFFFFF;">User Auto-Quarantined</h2>
      <p style="margin:0 0 20px;color:#94A3B8;font-size:14px;line-height:1.6;">
        A malicious or unverified action triggered an automated quarantine on <strong><span style="color:#F8FAFC;">${opts.guildName}</span></strong>.
      </p>
      ${table(
        row('Protected Server', `${opts.guildName} (${opts.guildId})`) +
        row('Target Account', `${opts.username || 'Unknown'} (${opts.userId})`) +
        row('Trigger Reason', `<span style="color:#F59E0B;font-weight:700;">${EMOJI_IMG.GAVEL} ${opts.reason}</span>`) +
        row('Action Taken', `${EMOJI_IMG.WRONG} Dangerous Roles Stripped &amp; Timeout Enforced`) +
        row('Timestamp', new Date().toUTCString())
      )}
      <p style="margin:16px 0 0;font-size:13px;color:#94A3B8;">If this was a false alarm, run \`r!unquarantine @user\` in Discord to restore permissions.</p>`;

    const recipient = this.getGuildAlertEmail(opts.guildId) || cfg().to;
    await this.sendAlert(
      `⚠️ User Quarantined — ${opts.guildName}`,
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
  }): Promise<void> {
    const body = `
      <h2 style="margin:0 0 10px;font-size:20px;font-weight:700;color:#FFFFFF;">New Server Deployment</h2>
      <p style="margin:0 0 20px;color:#94A3B8;font-size:14px;line-height:1.6;">
        Rage Optimiser Sentinel was invited to a new server and is pending initialization.
      </p>
      ${table(
        row('Server Name', `${EMOJI_IMG.VIP} ${opts.guildName} (${opts.guildId})`) +
        row('Server Owner', `${EMOJI_IMG.CROWN} ${opts.ownerTag} (${opts.ownerId})`) +
        row('Total Members', opts.memberCount.toLocaleString()) +
        row('Deployed At', new Date().toUTCString())
      )}
      <p style="margin:16px 0 0;font-size:13px;color:#94A3B8;">Review this server in your administrative dashboard to authorize or manage features.</p>`;
    await this.sendAlert(
      `🆕 New Guild — ${opts.guildName} (${opts.memberCount} members)`,
      wrapHtml('New Guild Added', body, 'info', 'GUILD DEPLOYMENT')
    );
  }

  /** Send a test email. Returns true on success. */
  public static async sendTestEmail(toOverride?: string): Promise<boolean> {
    if (!isConfigured()) return false;
    const body = `
      <h2 style="margin:0 0 10px;font-size:20px;font-weight:700;color:#FFFFFF;">Gmail SMTP Connection Verified</h2>
      <p style="margin:0 0 20px;color:#94A3B8;font-size:14px;line-height:1.6;">
        This is an automated test alert confirming that your <strong>Rage Optimiser Enterprise</strong> email dispatch pipeline is fully operational.
      </p>
      ${table(
        row('Status', `<span style="color:#57F287;font-weight:700;">${EMOJI_IMG.APPROVED} Online &amp; Authenticated</span>`) +
        row('Gateway', `${EMOJI_IMG.SHIELD} Gmail Enterprise SMTP`) +
        row('Dispatched To', toOverride || cfg().to) +
        row('Timestamp', new Date().toUTCString())
      )}
      <p style="margin:16px 0 0;font-size:13px;color:#94A3B8;">
        All critical security triggers (Anti-Nuke, Quarantine, Emergency Lockdown, Raid Mode, and Sentinel 2FA OTPs) will now successfully route to this inbox.
      </p>`;
    try {
      await this.sendAlert('✅ Test Alert — Rage Optimiser', wrapHtml('Gmail Alert Test', body, 'info', 'SYSTEM TEST'), toOverride);
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
    const body = `
      <h2 style="margin:0 0 10px;font-size:20px;font-weight:700;color:#FFFFFF;">Two-Factor Authentication Setup</h2>
      <p style="margin:0 0 20px;color:#94A3B8;font-size:14px;line-height:1.6;">
        A request was initiated to link this Gmail address for <strong>Sentinel 2FA &amp; Security Alerts</strong> on the Discord server <strong><span style="color:#F8FAFC;">${guildName}</span></strong>.
      </p>

      <!-- OTP Card Box -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#080d0a;border:1px solid #1a3322;border-radius:10px;margin:24px 0;text-align:center;">
        <tr>
          <td style="padding:24px 20px;">
            <span style="font-size:11px;color:#57F287;font-weight:700;text-transform:uppercase;letter-spacing:2px;display:block;margin-bottom:12px;">ONE-TIME VERIFICATION CODE</span>
            <div style="font-size:42px;font-weight:800;color:#FFFFFF;letter-spacing:10px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;text-shadow:0 0 16px rgba(87,242,135,0.4);margin:0 0 12px;">
              ${code}
            </div>
            <span style="display:inline-block;padding:4px 12px;background-color:rgba(87,242,135,0.1);border:1px solid rgba(87,242,135,0.25);border-radius:20px;font-size:11px;font-weight:600;color:#57F287;">
              ⏱️ Expires in 10 minutes &bull; Single-use only
            </span>
          </td>
        </tr>
      </table>

      <h3 style="margin:24px 0 12px;font-size:13px;font-weight:700;color:#E2E8F0;text-transform:uppercase;letter-spacing:0.5px;">Verification Details</h3>
      ${table(
        row('Protected Server', `${EMOJI_IMG.SHIELD} ${guildName}`) +
        row('Security Protocol', `${EMOJI_IMG.APPROVED} Sentinel 2FA Security Gate`) +
        row('Expires At', new Date(Date.now() + 10 * 60 * 1000).toUTCString()) +
        row('Requested At', new Date().toUTCString())
      )}

      <p style="margin:20px 0 0;font-size:13px;color:#94A3B8;line-height:1.6;">
        To complete verification, return to Discord and run:
        <br />
        <code style="display:inline-block;margin-top:8px;background-color:#0d1117;border:1px solid #2d3748;padding:6px 14px;border-radius:6px;color:#57F287;font-family:monospace;font-size:13px;font-weight:600;">r!email verify ${code}</code>
        <br />
        or click <strong>Enter Verification Code</strong> on the interactive message in your Discord channel.
      </p>`;
    try {
      await t.sendMail({
        from: `"Rage Optimiser Security" <${from}>`,
        to: toEmail,
        subject: `🔐 2FA Security Code [${code}] — ${guildName}`,
        html: wrapHtml('Sentinel 2FA Verification', body, 'high', '2FA SECURITY CODE')
      });
      console.log(`[EmailService] 📧 2FA OTP code dispatched to ${toEmail}`);
      return { success: true };
    } catch (err: any) {
      console.error(`[EmailService] ❌ 2FA OTP send failed to ${toEmail}: ${err.message}`);
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

  /** Whether email alerts are configured */
  public static isConfigured(): boolean {
    return isConfigured();
  }
}
