import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from backend directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { EmailService } from '../services/EmailService.js';

const TARGET_EMAIL = 'rdxyzprvt@gmail.com';
const GUILD_NAME = 'Clutch Nation (Rage Optimiser)';
const GUILD_ID = '1524869545590915262';

async function sendAllTestEmails() {
  console.log(`\n=======================================================`);
  console.log(`🚀 DISPATCHING FULL TEST EMAIL SUITE TO: ${TARGET_EMAIL}`);
  console.log(`=======================================================\n`);

  // 1. Verify SMTP Connection
  console.log('[1/7] Testing SMTP connection...');
  const connected = await EmailService.testConnection();
  if (!connected) {
    console.error('❌ SMTP Connection failed. Check ALERT_EMAIL credentials in .env.');
    process.exit(1);
  }

  // 2. Test Connection Alert
  console.log('[2/7] Sending Gmail SMTP Pipeline Test Alert...');
  await EmailService.sendTestEmail(TARGET_EMAIL);
  await new Promise(r => setTimeout(r, 1500));

  // 3. 2FA Security Verification OTP Code
  console.log('[3/7] Sending 2FA Security Passcode (OTP)...');
  await EmailService.send2FAVerificationCode(TARGET_EMAIL, '784912', GUILD_NAME);
  await new Promise(r => setTimeout(r, 1500));

  // 4. Critical Anti-Nuke Threat Neutralization Alert
  console.log('[4/7] Sending Anti-Nuke Threat Neutralized Alert...');
  await EmailService.sendAntiNukeAlert({
    guildName: GUILD_NAME,
    guildId: GUILD_ID,
    action: 'Mass Role Deletion Blocked (4 roles in 1.1s)',
    executor: 'RogueAdmin#9999',
    executorId: '109876543210987654',
    extra: 'Attempted to delete: Admin, Moderator, VIP, Member. Rollback automatically restored all 4 roles.',
    toOverride: TARGET_EMAIL
  });
  await new Promise(r => setTimeout(r, 1500));

  // 5. Emergency Server Lockdown Alert
  console.log('[5/7] Sending Emergency Server Lockdown Engaged Alert...');
  await EmailService.sendEmergencyLockAlert({
    guildName: GUILD_NAME,
    guildId: GUILD_ID,
    triggeredBy: 'Clasher (Server Owner)',
    engaged: true,
    toOverride: TARGET_EMAIL
  });
  await new Promise(r => setTimeout(r, 1500));

  // 6. Raid Mode Activated Alert
  console.log('[6/7] Sending Server Raid Mode Active Alert...');
  await EmailService.sendRaidModeAlert({
    guildName: GUILD_NAME,
    guildId: GUILD_ID,
    triggeredBy: 'Automated Sentinel Gate',
    enabled: true,
    memberCount: 4250,
    toOverride: TARGET_EMAIL
  });
  await new Promise(r => setTimeout(r, 1500));

  // 7. User Auto-Quarantine Enforced Alert
  console.log('[7/7] Sending Automated User Quarantine Alert...');
  await EmailService.sendQuarantineAlert({
    guildName: GUILD_NAME,
    guildId: GUILD_ID,
    userId: '112233445566778899',
    username: 'SuspiciousBotToken#0001',
    reason: 'Exceeded channel creation threshold (3 channels / 2s)',
    toOverride: TARGET_EMAIL
  });
  await new Promise(r => setTimeout(r, 1500));

  // Bonus: Support Ticket Transcript with HTML Attachment
  console.log('[Bonus] Sending Support Ticket Transcript Archive with HTML Attachment...');
  const sampleTranscriptHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Ticket Transcript #ticket-0412</title>
<style>body{font-family:sans-serif;background:#0d1117;color:#c9d1d9;padding:24px;}</style>
</head>
<body>
<h2>Rage Optimiser • Ticket Transcript #ticket-0412</h2>
<p><strong>Server:</strong> ${GUILD_NAME}<br><strong>Opened By:</strong> Member#1234<br><strong>Closed By:</strong> Staff#0001</p>
<hr style="border-color:#30363d;">
<p><strong>[2026-10-11 20:00:00] Member#1234:</strong> Hello, I need help configuring verification.</p>
<p><strong>[2026-10-11 20:01:15] Staff#0001:</strong> Sure! Run r!verification gui to set up your verified role and card.</p>
<p><strong>[2026-10-11 20:03:00] Member#1234:</strong> Thank you, it is working perfectly now!</p>
</body></html>`;

  await EmailService.sendTicketTranscript({
    to: TARGET_EMAIL,
    guildName: GUILD_NAME,
    ticketId: 'ticket-0412',
    channelName: 'ticket-0412',
    userTag: 'Member#1234',
    closedByTag: 'Staff#0001',
    reason: 'Issue resolved by user',
    transcriptBuffer: Buffer.from(sampleTranscriptHtml, 'utf-8')
  });

  console.log(`\n=======================================================`);
  console.log(`✅ ALL TEST EMAILS SUCCESSFULLY DISPATCHED TO ${TARGET_EMAIL}`);
  console.log(`=======================================================\n`);
}

sendAllTestEmails().catch(err => {
  console.error('Fatal dispatch error:', err);
  process.exit(1);
});
