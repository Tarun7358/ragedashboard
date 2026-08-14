import dotenv from 'dotenv';
import { REST, Routes } from 'discord.js';

// Import individual manifests directly to avoid running index.ts bootstrap()
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

import { GiveawayManifest } from '../modules/giveaway/manifest.js';
import { RemindersManifest } from '../modules/reminders/manifest.js';
import { AnnouncementsManifest } from '../modules/announcements/manifest.js';
import { JoinToCreateManifest } from '../modules/joinToCreate/manifest.js';
import { VoiceManagerManifest } from '../modules/voice_manager/manifest.js';
import { BulkOpsManifest } from '../modules/bulk_ops/manifest.js';
import { DiagnosticsManifest } from '../modules/diagnostics/manifest.js';
import { VoiceProtectionManifest } from '../modules/voice-protection/index.js';
import { CommunityManifest } from '../modules/community/manifest.js';
import { JoinRoleAssignmentGuardManifest } from '../modules/join-role-guard/manifest.js';
import { SocialUpdatesManifest } from '../modules/social-updates/manifest.js';
import { AnalyticsManifest } from '../modules/analytics/manifest.js';
import { AuditManifest } from '../modules/audit/manifest.js';
import { ConfigManifest } from '../modules/config/manifest.js';
import { BotStatsManifest } from '../modules/botstats/manifest.js';

dotenv.config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId) {
  console.error('❌ DISCORD_TOKEN and CLIENT_ID must be specified in the environment.');
  process.exit(1);
}

const clientStr = clientId as string;
const guildStr = guildId as string;

const manifests = [
  ConfigManifest,
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
  CommunityManifest,
  AnalyticsManifest,
  AuditManifest,
  BotStatsManifest,
];


// Recursively serialize options, preserving channel_types, autocomplete, min/max
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
    m.commands.forEach((c: { name: string; description: string; options?: any[] }) => {
      if (seenNames.has(c.name)) {
        console.warn(`⚠️ Warning: Duplicate command name detected and skipped: /${c.name} in manifest "${m.name}" (${m.id})`);
        return;
      }
      seenNames.add(c.name);
      commands.push({
        name: c.name,
        description: c.description,
        options: (c.options || []).map(serializeOption)
      });
    });
  }
});
console.log('Registering commands:', Array.from(seenNames));


const rest = new REST({ version: '10' }).setToken(token);

async function deploy() {
  try {
    console.log(`🚀 Deploying ${commands.length} application commands GLOBALLY across ALL servers...`);
    await rest.put(
      Routes.applicationCommands(clientStr),
      { body: commands }
    );
    console.log('✅ Slash commands successfully registered globally on Discord API. Every server can now use all commands!');

    if (guildStr) {
      console.log(`⚡ Instantly updating single-guild commands for dev guild ${guildStr}...`);
      await rest.put(
        Routes.applicationGuildCommands(clientStr, guildStr),
        { body: commands }
      ).catch(() => {});
      console.log('✅ Dev guild commands updated instantly!');
    }
  } catch (error) {
    console.error('❌ Failed to deploy slash commands:', error);
    process.exit(1);
  }
}

deploy();
