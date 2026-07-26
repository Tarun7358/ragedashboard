import dotenv from 'dotenv';
import { REST, Routes } from 'discord.js';

import { SecurityManifest } from '../modules/security/manifest.js';
import { LoggingManifest } from '../modules/logging/manifest.js';
import { BackupsManifest } from '../modules/backups/manifest.js';
import { AutomationManifest } from '../modules/automation/manifest.js';
import { VoiceManifest } from '../modules/voice/manifest.js';
import { MemberWhitelistManifest } from '../modules/member_whitelist/manifest.js';
import { ReactionRolesManifest } from '../modules/reaction-roles/manifest.js';
import { LevelingManifest } from '../modules/leveling/manifest.js';
import { AutomodManifest } from '../modules/automod/manifest.js';
import { DiscordDashboardManifest } from '../modules/discord-dashboard/manifest.js';
import { MusicManifest } from '../modules/music/manifest.js';
import { GiveawayManifest } from '../modules/giveaway/manifest.js';
import { RemindersManifest } from '../modules/reminders/manifest.js';
import { AnnouncementsManifest } from '../modules/announcements/manifest.js';
import { JoinToCreateManifest } from '../modules/joinToCreate/manifest.js';
import { VoiceManagerManifest } from '../modules/voice_manager/manifest.js';
import { BulkOpsManifest } from '../modules/bulk_ops/manifest.js';
import { DiagnosticsManifest } from '../modules/diagnostics/manifest.js';
import { VoiceProtectionManifest } from '../modules/voice-protection/index.js';
import { WelcomeV2Manifest } from '../modules/welcome-v2/manifest.js';
import { TicketsV2Manifest } from '../modules/tickets-v2/manifest.js';
import { JoinRoleAssignmentGuardManifest } from '../modules/join-role-guard/manifest.js';
import { SocialUpdatesManifest } from '../modules/social-updates/manifest.js';
import { AnalyticsManifest } from '../modules/analytics/manifest.js';
import { AuditManifest } from '../modules/audit/manifest.js';
import { PaymentManifest } from '../modules/payment/manifest.js';

dotenv.config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId) {
  console.error('❌ DISCORD_TOKEN and CLIENT_ID must be specified in .env');
  process.exit(1);
}

const manifests = [
  SecurityManifest,
  LoggingManifest,
  BackupsManifest,
  AutomationManifest,
  VoiceManifest,
  MemberWhitelistManifest,
  ReactionRolesManifest,
  LevelingManifest,
  AutomodManifest,
  DiscordDashboardManifest,
  MusicManifest,
  GiveawayManifest,
  RemindersManifest,
  AnnouncementsManifest,
  JoinToCreateManifest,
  VoiceManagerManifest,
  BulkOpsManifest,
  DiagnosticsManifest,
  VoiceProtectionManifest,
  JoinRoleAssignmentGuardManifest,
  SocialUpdatesManifest,
  WelcomeV2Manifest,
  TicketsV2Manifest,
  AnalyticsManifest,
  AuditManifest,
  PaymentManifest,
];

const serializeOption = (opt: any): any => {
  const out: any = {
    name: opt.name,
    type: opt.type,
    description: opt.description
  };
  if (opt.required !== undefined) out.required = opt.required;
  if (opt.choices) out.choices = opt.choices;
  if (opt.channel_types) out.channel_types = opt.channel_types;
  if (opt.autocomplete !== undefined) out.autocomplete = opt.autocomplete;
  if (opt.min_value !== undefined) out.min_value = opt.min_value;
  if (opt.max_value !== undefined) out.max_value = opt.max_value;
  if (opt.options) out.options = opt.options.map(serializeOption);
  return out;
};

const commands: any[] = [];
const seenNames = new Set<string>();

manifests.forEach(m => {
  if (m.commands) {
    m.commands.forEach((c: any) => {
      if (seenNames.has(c.name)) return;
      seenNames.add(c.name);
      commands.push({
        name: c.name,
        description: c.description,
        options: (c.options || []).map(serializeOption)
      });
    });
  }
});

const rest = new REST({ version: '10' }).setToken(token);

async function cleanAndDeploy() {
  try {
    console.log('1️⃣ Clearing ALL Global Commands from Discord API to prevent duplicates...');
    await rest.put(Routes.applicationCommands(clientId as string), { body: [] });
    console.log('✅ Global commands completely cleared (0 global commands).');

    const userGuilds: any = await rest.get(Routes.userGuilds());
    console.log(`2️⃣ Found ${userGuilds.length} guilds. Deploying clean deduplicated command set (${commands.length} commands) per guild...`);

    for (const g of userGuilds) {
      console.log(`   ➜ Deploying to guild "${g.name}" (${g.id})...`);
      await rest.put(
        Routes.applicationGuildCommands(clientId as string, g.id),
        { body: commands }
      );
    }

    console.log('🎉 SUCCESS: All command duplicates cleared and clean commands deployed across all guilds!');
  } catch (err: any) {
    console.error('❌ Error during clean and deploy:', err);
    process.exit(1);
  }
}

cleanAndDeploy();
