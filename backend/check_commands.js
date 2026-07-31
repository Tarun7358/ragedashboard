import { SecurityManifest } from './dist/modules/security/manifest.js';
import { LoggingManifest } from './dist/modules/logging/manifest.js';
import { BackupsManifest } from './dist/modules/backups/manifest.js';
import { AutomationManifest } from './dist/modules/automation/manifest.js';
import { VoiceManifest } from './dist/modules/voice/manifest.js';
import { MemberWhitelistManifest } from './dist/modules/member_whitelist/manifest.js';
import { ReactionRolesManifest } from './dist/modules/reaction-roles/manifest.js';
import { LevelingManifest } from './dist/modules/leveling/manifest.js';
import { AutomodManifest } from './dist/modules/automod/manifest.js';
import { DiscordDashboardManifest } from './dist/modules/discord-dashboard/manifest.js';
import { MusicManifest } from './dist/modules/music/manifest.js';
import { GiveawayManifest } from './dist/modules/giveaway/manifest.js';
import { RemindersManifest } from './dist/modules/reminders/manifest.js';
import { AnnouncementsManifest } from './dist/modules/announcements/manifest.js';
import { JoinToCreateManifest } from './dist/modules/joinToCreate/manifest.js';
import { VoiceManagerManifest } from './dist/modules/voice_manager/manifest.js';
import { BulkOpsManifest } from './dist/modules/bulk_ops/manifest.js';
import { DiagnosticsManifest } from './dist/modules/diagnostics/manifest.js';
import { VoiceProtectionManifest } from './dist/modules/voice-protection/index.js';
import { WelcomeV2Manifest } from './dist/modules/welcome-v2/manifest.js';
import { TicketsV2Manifest } from './dist/modules/tickets-v2/manifest.js';
import { JoinRoleAssignmentGuardManifest } from './dist/modules/join-role-guard/manifest.js';
import { SocialUpdatesManifest } from './dist/modules/social-updates/manifest.js';
import { AnalyticsManifest } from './dist/modules/analytics/manifest.js';
import { AuditManifest } from './dist/modules/audit/manifest.js';
import { PaymentManifest } from './dist/modules/payment/manifest.js';
import { RageEnterpriseManifest } from './dist/modules/rage-enterprise/manifest.js';

const allManifests = [
  SecurityManifest, LoggingManifest, BackupsManifest, AutomationManifest, VoiceManifest,
  MemberWhitelistManifest, ReactionRolesManifest, LevelingManifest, AutomodManifest,
  DiscordDashboardManifest, MusicManifest, GiveawayManifest, RemindersManifest,
  AnnouncementsManifest, JoinToCreateManifest, VoiceManagerManifest, BulkOpsManifest,
  DiagnosticsManifest, VoiceProtectionManifest, JoinRoleAssignmentGuardManifest,
  SocialUpdatesManifest, WelcomeV2Manifest, TicketsV2Manifest, AnalyticsManifest,
  AuditManifest, PaymentManifest, RageEnterpriseManifest
];

let errors = [];
let totalCommands = 0;

allManifests.forEach(m => {
  if (!m || !m.commands) return;
  m.commands.forEach((c) => {
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
    options.forEach((opt) => {
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
