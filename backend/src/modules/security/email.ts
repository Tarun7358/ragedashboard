/**
 * Email Alert Prefix Commands — Rage Optimiser Enterprise
 *
 * r!email set <email> [--force] — Link Gmail address for 2FA & security alerts
 * r!email verify <code>         — Confirm 6-digit OTP code to finalize linking
 * r!email status                — Show email alert configuration & 2FA status
 * r!email test [email]          — Send a test alert email
 * r!email remove                — Unlink alert email
 */

import { Message, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { PrefixRegistry } from '../../core/prefix/PrefixRegistry.js';
import {
  createLimeEmbed,
  LOADING_ANIMATED_ICON,
  SUCCESS_CHECK_ICON,
  WRONG_ICON,
  SECURITY_SHIELD_ICON
} from '../../core/UIFactory.js';
import { EmailService } from '../../services/EmailService.js';
import { ModuleRegistry } from '../../core/ModuleRegistry.js';

const MAIL_EMOJI    = '📧';
const CHECK_EMOJI   = SUCCESS_CHECK_ICON;
const WRONG_EMOJI   = WRONG_ICON;
const LOADING_EMOJI = LOADING_ANIMATED_ICON;
const SHIELD_EMOJI  = SECURITY_SHIELD_ICON;

function getGuildSecConfig(guildId: string, context?: any): Record<string, any> {
  const modules = context?.getModulesState
    ? context.getModulesState(guildId)
    : (ModuleRegistry.getInstance()?.getModulesState(guildId) || []);
  const secMod = modules.find((m: any) => m.id === 'security');
  return secMod?.config ? { ...secMod.config } : {};
}

function saveGuildSecConfig(guildId: string, secConfig: Record<string, any>, context?: any): void {
  if (context?.updateModuleConfig) {
    context.updateModuleConfig('security', secConfig);
  } else if (ModuleRegistry.getInstance()) {
    ModuleRegistry.getInstance()!.updateModuleConfig(guildId, 'security', secConfig);
  }
}

export function registerEmailCommands(): void {
  PrefixRegistry.register({
    name: 'email',
    category: 'Security',
    description: 'Manage Gmail 2FA and security alert integration.',
    usage: 'r!email <set|verify|status|test|remove> [args]',
    aliases: ['alerts', 'emailalerts', 'gmail'],
    cooldownSeconds: 3,
    userPermissions: [],
    botPermissions: [],
    execute: async (message: Message, args: string[], context?: any) => {
      // Owner-only command
      const { isOwnerOrExtraOwner } = await import('../../utils/whitelistCheck.js');
      if (!message.guild) return;
      const isOwner = await isOwnerOrExtraOwner(message.author.id, message.guild);
      if (!isOwner) {
        return message.reply({
          embeds: [createLimeEmbed({
            title: 'Access Denied',
            description: `${WRONG_EMOJI} Only the **Server Owner** and Extra Owners can manage email alerts.`
          })]
        });
      }

      const guildId = message.guild.id;
      const sub = args[0]?.toLowerCase();

      // ── r!email set <email> ────────────────────────────────────────────────
      if (sub === 'set' || sub === 'link' || sub === 'add') {
        const email = args[1]?.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!email || !emailRegex.test(email)) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Invalid Email Format',
              description: [
                `>>> ${WRONG_EMOJI} Please provide a valid email address.`,
                '**Usage:** \`r!email set <your@gmail.com>\`',
                '**Direct Link:** \`r!email set <your@gmail.com> --force\`'
              ].join('\n')
            })]
          });
        }

        if (!EmailService.isConfigured()) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'SMTP Not Configured',
              description: `>>> ${WRONG_EMOJI} Email alerts require SMTP configuration in the bot \`.env\` (\`ALERT_EMAIL_FROM\` & \`ALERT_EMAIL_PASSWORD\`).`
            })]
          });
        }

        const isForce = args.includes('--force');

        if (isForce) {
          const secConfig = getGuildSecConfig(guildId, context);
          secConfig.alertEmail = email;
          saveGuildSecConfig(guildId, secConfig, context);
          EmailService.clearPending2FA(guildId);

          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Gmail 2FA Linked (Direct)',
              description: [
                `>>> ${CHECK_EMOJI} **\`${email}\`** linked as 2FA Security Alert recipient for **${message.guild.name}**.`,
                'Critical security alerts and **\`r!disable\`** 2FA codes will now route here.'
              ].join('\n')
            })]
          });
        }

        // Generate 6-digit OTP code & dispatch
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        EmailService.setPending2FA(guildId, {
          email,
          code: otp,
          expiresAt: Date.now() + 10 * 60 * 1000,
          userId: message.author.id
        });

        const loadingMsg = await message.reply({
          embeds: [createLimeEmbed({
            title: 'Dispatching 2FA Code',
            description: `>>> ${LOADING_EMOJI} Sending 6-digit verification code to **\`${email}\`**...`
          })]
        });

        const result = await EmailService.send2FAVerificationCode(email, otp, message.guild.name);

        if (!result.success) {
          return loadingMsg.edit({
            embeds: [createLimeEmbed({
              title: 'Email Dispatch Failed',
              description: [
                `>>> ${WRONG_EMOJI} Could not send verification email to **\`${email}\`**.`,
                `**Reason:** ${result.error || 'Check bot SMTP credentials in \`.env\`.'}`
              ].join('\n')
            })]
          });
        }

        const verifyRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('btn_sec_open_otp_modal')
            .setLabel('Enter Verification Code')
            .setStyle(ButtonStyle.Primary)
        );

        return loadingMsg.edit({
          embeds: [createLimeEmbed({
            title: 'Verification Code Dispatched',
            description: [
              `>>> ${SHIELD_EMOJI} **6-digit code** sent to **\`${email}\`**.`,
              `Use **\`r!email verify <code>\`** or click the button below.`,
              `⏱️ Expires in **10 minutes**.`
            ].join('\n')
          })],
          components: [verifyRow]
        });
      }

      // ── r!email verify <code> ──────────────────────────────────────────────
      if (sub === 'verify' || sub === 'confirm') {
        const code = args[1]?.trim();
        const pending = EmailService.getPending2FA(guildId);

        if (!code) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Verification Code Required',
              description: `>>> ${WRONG_EMOJI} Please provide the 6-digit code sent to your email.\n**Usage:** \`r!email verify <code>\``
            })]
          });
        }

        if (!pending || pending.code !== code) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Invalid or Expired Code',
              description: `>>> ${WRONG_EMOJI} The verification code is invalid or has expired.\nRun **\`r!email set <email>\`** to dispatch a fresh code.`
            })]
          });
        }

        const secConfig = getGuildSecConfig(guildId, context);
        secConfig.alertEmail = pending.email;
        saveGuildSecConfig(guildId, secConfig, context);
        EmailService.clearPending2FA(guildId);

        return message.reply({
          embeds: [createLimeEmbed({
            title: 'Gmail 2FA Successfully Linked',
            description: [
              `>>> ${CHECK_EMOJI} **\`${pending.email}\`** linked as 2FA Security Alert recipient for **${message.guild.name}**.`,
              '',
              '**Active Protections:**',
              '• **Anti-Nuke & Quarantine Alerts**: Real-time email notifications on hostile actions.',
              '• **Emergency Lockdown**: Instant notification when lockdown is engaged or lifted.',
              '• **Sentinel 2FA Gate**: Any attempt to **\`r!disable\`** security requires an OTP sent to this inbox.',
              '',
              'Run **\`r!email test\`** to send a test alert anytime.'
            ].join('\n')
          })]
        });
      }

      // ── r!email remove / unlink ────────────────────────────────────────────
      if (sub === 'remove' || sub === 'unlink' || sub === 'clear' || sub === 'delete') {
        const secConfig = getGuildSecConfig(guildId, context);
        if (!secConfig.alertEmail) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'No Email Linked',
              description: `>>> ${WRONG_EMOJI} There is no custom alert email linked to **${message.guild.name}**.`
            })]
          });
        }

        const removedEmail = secConfig.alertEmail;
        delete secConfig.alertEmail;
        saveGuildSecConfig(guildId, secConfig, context);

        return message.reply({
          embeds: [createLimeEmbed({
            title: 'Alert Email Removed',
            description: [
              `>>> ${CHECK_EMOJI} Successfully unlinked **\`${removedEmail}\`** from **${message.guild.name}**.`,
              `Alerts will fallback to system default (\`${process.env.ALERT_EMAIL_TO || 'None'}\`), and the 2FA gate for **\`r!disable\`** is deactivated.`
            ].join('\n')
          })]
        });
      }

      // ── r!email test [email] ───────────────────────────────────────────────
      if (sub === 'test') {
        if (!EmailService.isConfigured()) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'Email Not Configured',
              description: `>>> ${WRONG_EMOJI} Set \`ALERT_EMAIL_FROM\` and \`ALERT_EMAIL_PASSWORD\` in your \`.env\` file first.`
            })]
          });
        }

        const secConfig = getGuildSecConfig(guildId, context);
        const explicitTarget = args[1]?.includes('@') ? args[1].trim() : undefined;
        const targetEmail = explicitTarget || secConfig.alertEmail || process.env.ALERT_EMAIL_TO;

        if (!targetEmail) {
          return message.reply({
            embeds: [createLimeEmbed({
              title: 'No Recipient Configured',
              description: [
                `>>> ${WRONG_EMOJI} Please specify an email or link one first:`,
                '• \`r!email test user@gmail.com\`',
                '• \`r!email set user@gmail.com\`'
              ].join('\n')
            })]
          });
        }

        const loading = await message.reply({
          embeds: [createLimeEmbed({
            title: 'Sending Test Security Alert',
            description: `>>> ${LOADING_EMOJI} Connecting to Gmail SMTP and sending test alert to **\`${targetEmail}\`**...`
          })]
        });

        const success = await EmailService.sendTestEmail(targetEmail);

        await loading.edit({
          embeds: [createLimeEmbed({
            title: success ? 'Test Email Sent' : 'Test Email Failed',
            description: success
              ? `>>> ${CHECK_EMOJI} A test security alert was successfully delivered to **\`${targetEmail}\`**. Check your inbox!`
              : `>>> ${WRONG_EMOJI} Failed to send test email to **\`${targetEmail}\`**. Check bot SMTP credentials in \`.env\`.`
          })]
        });

        return;
      }

      // ── r!email status ────────────────────────────────────────────────────
      if (sub === 'status') {
        const configured = EmailService.isConfigured();
        const secConfig = getGuildSecConfig(guildId, context);
        const guildEmail = secConfig.alertEmail;

        return message.reply({
          embeds: [createLimeEmbed({
            title: 'Email Alert & 2FA Configuration',
            description: [
              `>>> ${SHIELD_EMOJI} **Sentinel 2FA & Email Gateway**`,
              `• **SMTP Gateway**: ${configured ? `${CHECK_EMOJI} \`Active (Gmail SMTP)\`` : `${WRONG_EMOJI} \`Not Configured\``}`,
              `• **Server Alert Email**: ${guildEmail ? `\`${guildEmail}\`` : '**Not Set (Use `r!email set <email>`)**'}`,
              `• **System Default**: \`${process.env.ALERT_EMAIL_TO || 'None'}\``,
              `• **2FA Disable Gate**: ${guildEmail ? `${CHECK_EMOJI} \`Engaged (Requires Gmail OTP)\`` : `${WRONG_EMOJI} \`Inactive\``}`,
              '',
              '**Automated Dispatch Triggers:**',
              '• 🚨 Anti-Nuke countermeasure execution',
              '• 🔴 Emergency Lockdown engaged / lifted',
              '• ⚔️ Raid Mode toggled',
              '• ⚠️ User quarantined for malicious action',
              '• 🔐 **\`r!disable\`** security gate 2FA code',
              '',
              '**Quick Commands:**',
              '• \`r!email set <email>\` — Link Gmail address with OTP',
              '• \`r!email verify <code>\` — Confirm 6-digit code',
              '• \`r!email test [email]\` — Send test security alert',
              '• \`r!email remove\` — Unlink Gmail address'
            ].join('\n')
          })]
        });
      }

      // ── help / default ────────────────────────────────────────────────────
      return message.reply({
        embeds: [createLimeEmbed({
          title: 'Email Alert Commands',
          description: [
            `>>> ${SHIELD_EMOJI} **Gmail Alert Management**`,
            '• **\`r!email set <email>\`** — Link your Gmail address for 2FA & alerts',
            '• **\`r!email verify <code>\`** — Verify 6-digit OTP code received in email',
            '• **\`r!email status\`** — Show email alert configuration & 2FA status',
            '• **\`r!email test [email]\`** — Send a test security alert',
            '• **\`r!email remove\`** — Unlink custom Gmail address',
            '',
            '**Example:** \`r!email set rdxyzprvt@gmail.com\`'
          ].join('\n')
        })]
      });
    }
  });
}
