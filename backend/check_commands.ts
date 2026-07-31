import { SecurityManifest } from './src/modules/security/manifest.js';
import { LoggingManifest } from './src/modules/logging/manifest.js';
import { BackupsManifest } from './src/modules/backups/manifest.js';
import { AutomationManifest } from './src/modules/automation/manifest.js';
import { VoiceManifest } from './src/modules/voice/manifest.js';
import { MemberWhitelistManifest } from './src/modules/member_whitelist/manifest.js';
import { ReactionRolesManifest } from './src/modules/reaction-roles/manifest.js';
import { LevelingManifest } from './src/modules/leveling/manifest.js';
import { AutomodManifest } from './src/modules/automod/manifest.js';
import { DiscordDashboardManifest } from './src/modules/discord-dashboard/manifest.js';
import { MusicManifest } from './src/modules/music/manifest.js';
import { GiveawayManifest } from './src/modules/giveaway/manifest.js';
import { RemindersManifest } from './src/modules/reminders/manifest.js';
import { AnnouncementsManifest } from './src/modules/announcements/manifest.js';
import { JoinToCreateManifest } from './src/modules/joinToCreate/manifest.js';
import { VoiceManagerManifest } from './src/modules/voice_manager/manifest.js';
import { BulkOpsManifest } from './src/modules/bulk_ops/manifest.js';
import { DiagnosticsManifest } from './src/modules/diagnostics/manifest.js';
import { VoiceProtectionManifest } from './src/modules/voice-protection/index.js';
import { WelcomeV2Manifest } from './src/modules/welcome-v2/manifest.js';
import { TicketsV2Manifest } from './src/modules/tickets-v2/manifest.js';
import { JoinRoleAssignmentGuardManifest } from './src/modules/join-role-guard/manifest.js';
import { SocialUpdatesManifest } from './src/modules/social-updates/manifest.js';
import { AnalyticsManifest } from './src/modules/analytics/manifest.js';
import { AuditManifest } from './src/modules/audit/manifest.js';
import { PaymentManifest } from './src/modules/payment/manifest.js';
import { RageEnterpriseManifest } from './src/modules/rage-enterprise/manifest.js';

const allManifests = [
  SecurityManifest, LoggingManifest, BackupsManifest, AutomationManifest, VoiceManifest,
  MemberWhitelistManifest, ReactionRolesManifest, LevelingManifest, AutomodManifest,
  DiscordDashboardManifest, MusicManifest, GiveawayManifest, RemindersManifest,
  AnnouncementsManifest, JoinToCreateManifest, VoiceManagerManifest, BulkOpsManifest,
  DiagnosticsManifest, VoiceProtectionManifest, JoinRoleAssignmentGuardManifest,
  SocialUpdatesManifest, WelcomeV2Manifest, TicketsV2Manifest, AnalyticsManifest,
  AuditManifest, PaymentManifest, RageEnterpriseManifest
];

let errors: string[] = [];
let totalCommands = 0;

allManifests.forEach(m => {
  if (!m || !m.commands) return;
  m.commands.forEach((c: any) => {
    totalCommands++;
    // Check name
    if (c.name.length > 32) {
      errors.push(`[${m.id}] Command name "${c.name}" exceeds 32 chars (${c.name.length})`);
    }
    if (!/^[a-z0-9_-]+$/.test(c.name)) {
      errors.push(`[${m.id}] Command name "${c.name}" contains invalid characters: "${c.name}"`);
    }
    // Check description
    if (!c.description || c.description.length > 100) {
      errors.push(`[${m.id}] Command /${c.name} description exceeds 100 chars (${c.description?.length})`);
    }
    // Check options count
    const options = c.options || [];
    if (options.length > 25) {
      errors.push(`[${m.id}] Command /${c.name} has ${options.length} options (Discord max is 25)`);
    }
    options.forEach((opt: any) => {
      if (opt.name.length > 32) {
        errors.push(`[${m.id}] Option "${opt.name}" in /${c.name} exceeds 32 chars`);
      }
      if (!opt.description || opt.description.length > 100) {
        errors.push(`[${m.id}] Option "${opt.name}" in /${c.name} description exceeds 100 chars (${opt.description?.length})`);
      }
      if (opt.choices && opt.choices.length > 25) {
        errors.push(`[${m.id}] Option "${opt.name}" in /${c.name} has ${opt.choices.length} choices (max 25)`);
      }
      if (opt.options && opt.options.length > 25) {
        errors.push(`[${m.id}] Subcommand "${opt.name}" in /${c.name} has ${opt.options.length} options (max 25)`);
      }
    });
  });
});

console.log(`Validated ${totalCommands} slash commands across ${allManifests.length} manifests.`);
if (errors.length === 0) {
  console.log('✅ ALL DISCORD COMMAND DEFINITIONS PASSED 100% DISCORD API LIMIT CHECKS!');
} else {
  console.log('❌ DISCORD API LIMIT VIOLATIONS FOUND:');
  errors.forEach(e => console.log(' - ' + e));
}
