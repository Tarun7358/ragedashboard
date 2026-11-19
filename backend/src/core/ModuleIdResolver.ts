/**
 * ModuleIdResolver.ts
 * Single source of truth for module ID resolution and canonical mapping.
 * Eliminates drift between hyphenated, underscored, CamelCase, and shorthand module names.
 */

export const CANONICAL_MODULE_IDS = [
  'config',
  'security',
  'moderation',
  'blacklist',
  'community',
  'discord-dashboard',
  'verification',
  'embed_builder',
  'logging',
  'backups',
  'automation',
  'voice',
  'member_whitelist',
  'prebot_whitelist',
  'botstats',
  'reaction_roles',
  'self-roles',
  'leveling',
  'automod',
  'giveaway',
  'reminders',
  'announcements',
  'join_to_create',
  'voice_manager',
  'bulk_ops',
  'diagnostics',
  'voice-protection',
  'join_role_guard',
  'social_updates',
  'analytics',
  'audit',
  'rage-enterprise',
  'brain',
  'stats-counter',
  'promotion',
  'tickets'
] as const;

export type CanonicalModuleId = typeof CANONICAL_MODULE_IDS[number];

/**
 * Maps all known aliases, command tags, legacy identifiers, and case/dash variations
 * directly to the official manifest canonical module ID.
 */
export const MODULE_ALIAS_MAP: Record<string, string> = {
  // Security & Anti-Nuke
  security: 'security',
  antinuke: 'security',
  'anti-nuke': 'security',
  anti_nuke: 'security',
  an: 'security',
  sec: 'security',
  nuke: 'security',
  threats: 'security',
  quarantine: 'security',

  // AutoMod
  automod: 'automod',
  'auto-mod': 'automod',
  auto_mod: 'automod',
  am: 'automod',
  antilink: 'automod',
  'anti-link': 'automod',
  anti_link: 'automod',
  antispam: 'automod',
  'anti-spam': 'automod',
  anti_spam: 'automod',
  filter: 'automod',
  chatfilter: 'automod',

  // Voice & Join to Create
  voice: 'voice',
  vc: 'voice',
  jointocreate: 'join_to_create',
  'join-to-create': 'join_to_create',
  join_to_create: 'join_to_create',
  jointocreatevc: 'join_to_create',
  jtc: 'join_to_create',
  '247': 'voice',
  voicepresence: 'voice',
  voicemanager: 'voice_manager',
  'voice-manager': 'voice_manager',
  voice_manager: 'voice_manager',
  voiceprotection: 'voice-protection',
  'voice-protection': 'voice-protection',
  voice_protection: 'voice-protection',
  vp: 'voice-protection',

  // Backups
  backup: 'backups',
  backups: 'backups',
  'backup-recovery': 'backups',
  backup_recovery: 'backups',
  recovery: 'backups',
  snapshot: 'backups',
  snapshots: 'backups',

  // Logging & Audit
  logging: 'logging',
  logs: 'logging',
  log: 'logging',
  audit: 'audit',
  auditlog: 'logging',
  auditlogs: 'logging',
  'audit-logging': 'logging',
  audit_logging: 'logging',
  telemetry: 'logging',

  // Tickets
  ticket: 'tickets',
  tickets: 'tickets',
  ticketsystem: 'tickets',
  'ticket-system': 'tickets',
  ticket_system: 'tickets',
  tkmgr: 'tickets',
  support: 'tickets',

  // Verification
  verification: 'verification',
  verify: 'verification',
  captcha: 'verification',
  gatekeeper: 'verification',
  'verification-gate': 'verification',
  verification_gate: 'verification',

  // Join Role Guard / AutoRole
  autorole: 'join_role_guard',
  'auto-role': 'join_role_guard',
  auto_role: 'join_role_guard',
  joinrole: 'join_role_guard',
  'join-role': 'join_role_guard',
  join_role: 'join_role_guard',
  joinroles: 'join_role_guard',
  joinroleguard: 'join_role_guard',
  'join-role-guard': 'join_role_guard',
  join_role_guard: 'join_role_guard',

  // Giveaway
  giveaway: 'giveaway',
  giveaways: 'giveaway',
  gw: 'giveaway',
  gstart: 'giveaway',

  // Reaction Roles & Self Roles
  reactionroles: 'reaction_roles',
  'reaction-roles': 'reaction_roles',
  reaction_roles: 'reaction_roles',
  rr: 'reaction_roles',
  selfroles: 'self-roles',
  'self-roles': 'self-roles',
  self_roles: 'self-roles',

  // Leveling
  leveling: 'leveling',
  levels: 'leveling',
  level: 'leveling',
  rank: 'leveling',
  xp: 'leveling',
  economy: 'leveling',

  // Social Updates
  social: 'social_updates',
  socials: 'social_updates',
  'social-updates': 'social_updates',
  social_updates: 'social_updates',
  youtube: 'social_updates',
  twitch: 'social_updates',
  twitter: 'social_updates',

  // Stats Counter
  stats: 'stats-counter',
  statscounter: 'stats-counter',
  'stats-counter': 'stats-counter',
  stats_counter: 'stats-counter',
  serverstats: 'stats-counter',
  'server-stats': 'stats-counter',
  server_stats: 'stats-counter',
  membercount: 'stats-counter',

  // Reminders
  reminder: 'reminders',
  reminders: 'reminders',
  remind: 'reminders',

  // Announcements
  announcement: 'announcements',
  announcements: 'announcements',
  announce: 'announcements',

  // Promotion
  promotion: 'promotion',
  promo: 'promotion',
  bump: 'promotion',

  // Moderation
  moderation: 'moderation',
  mod: 'moderation',
  modtools: 'moderation',

  // Embed Builder
  embed: 'embed_builder',
  embeds: 'embed_builder',
  embedbuilder: 'embed_builder',
  'embed-builder': 'embed_builder',
  embed_builder: 'embed_builder',

  // Bot Stats
  botstats: 'botstats',
  'bot-stats': 'botstats',
  bot_stats: 'botstats',
  botinfo: 'botstats',

  // Whitelists
  prebot: 'prebot_whitelist',
  prebot_whitelist: 'prebot_whitelist',
  'prebot-whitelist': 'prebot_whitelist',
  member_whitelist: 'member_whitelist',
  'member-whitelist': 'member_whitelist',
  whitelist: 'member_whitelist',

  // Blacklist
  blacklist: 'blacklist',

  // Diagnostics & Bulk Ops
  diagnostics: 'diagnostics',
  diag: 'diagnostics',
  bulkops: 'bulk_ops',
  'bulk-ops': 'bulk_ops',
  bulk_ops: 'bulk_ops',

  // Community
  community: 'community',

  // Discord Dashboard
  dashboard: 'discord-dashboard',
  'discord-dashboard': 'discord-dashboard',
  discord_dashboard: 'discord-dashboard',

  // Analytics & Automation
  analytics: 'analytics',
  automation: 'automation',
  automations: 'automation',

  // Brain & Enterprise
  brain: 'brain',
  enterprise: 'rage-enterprise',
  'rage-enterprise': 'rage-enterprise',
  rage_enterprise: 'rage-enterprise',

  // Master triggers
  all: 'all',
  full: 'all',
  master: 'all'
};

/**
 * Resolves any raw module name, alias, hyphenated string, or shorthand to its canonical ID.
 */
export function resolveCanonicalModuleId(rawId: string | null | undefined): string {
  if (!rawId) return '';
  const clean = rawId.toLowerCase().trim();
  if (MODULE_ALIAS_MAP[clean]) {
    return MODULE_ALIAS_MAP[clean];
  }
  const stripped = clean.replace(/[-_]/g, '');
  for (const [key, val] of Object.entries(MODULE_ALIAS_MAP)) {
    if (key.replace(/[-_]/g, '') === stripped) {
      return val;
    }
  }
  return clean;
}
