// ============================================================
// RAGE OPTIMISER — Complete Data Models
// ============================================================

// ---- Discord User ----
export interface IUser {
  discordId: string;
  tag: string;
  xp: number;
  balance: number;
  lastDaily: Date | null;
  lastWork: Date | null;
  inventory: string[];
  warnings: Array<{ reason: string; date: Date; by: string }>;
  updatedAt?: Date;
}

// ---- Dashboard Admin User ----
export interface IAdminUser {
  id: string;
  username: string;
  passwordHash: string;
  role: 'owner' | 'admin' | 'moderator' | 'viewer';
  lastLogin?: Date;
  failedAttempts: number;
  lockedUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
  totpSecret?: string;
  totpEnabled?: boolean;
  recoveryCodes?: string[];
}

// ---- Guild Settings ----
export interface IGuild {
  guildId: string;
  name: string;
  prefix: string;
  logChannelId: string | null;
  welcomeChannelId: string | null;
  timezone?: string;
  language?: string;
  premium?: boolean;
  premiumExpiresAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

// ---- Audit Log ----
export interface IAuditLog {
  guildId: string;
  action: string;
  actorId: string;
  actorTag?: string;
  targetId?: string;
  targetTag?: string;
  reason?: string;
  metadata?: Record<string, any>;
  module?: string;
  caseId?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  createdAt?: Date;
}

// ---- Guild Approval ----
export interface IGuildApproval {
  guildId: string;
  guildName: string;
  ownerId: string;
  ownerUsername: string;
  ownerAvatar?: string;
  memberCount: number;
  botCount: number;
  humanCount: number;
  verificationLevel: number;
  premiumTier: number;
  premiumSubscriptionCount: number;
  joinedAt: number;
  riskScore: number;
  riskLevel: 'Safe' | 'Medium' | 'High' | 'Critical';
  status: 'Pending' | 'Approved' | 'Rejected' | 'Suspended' | 'Blacklisted';
  approvedBy?: string;
  approvedAt?: number;
  rejectedBy?: string;
  rejectedAt?: number;
  rejectionReason?: string;
  blacklistedBy?: string;
  blacklistedAt?: number;
  notes?: string;
  lastUpdated: number;
}

// ---- Ticket ----
export interface ITicket {
  id: string;
  guildId: string;
  channelId: string;
  userId: string;
  userTag: string;
  claimedBy?: string;
  claimedByTag?: string;
  status: 'open' | 'claimed' | 'closed';
  category?: string;
  subject?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  transcript?: string[];
  createdAt: Date;
  closedAt?: Date;
}

// ---- Backup Schedule ----
export interface IBackupSchedule {
  id: string;
  guildId: string;
  intervalHours: number;
  keepLast: number;
  notifyChannelId?: string;
  enabled: boolean;
  lastRunAt?: Date;
  nextRunAt?: Date;
  createdAt: Date;
}

// ---- Giveaway ----
export interface IGiveaway {
  id: string;
  guildId: string;
  channelId: string;
  messageId?: string;
  hostId: string;
  hostTag: string;
  prize: string;
  description?: string;
  winnerCount: number;
  endsAt: Date;
  ended: boolean;
  winnerIds?: string[];
  entries?: string[];
  requiredRoleId?: string;
  requiredLevel?: number;
  createdAt: Date;
}

// ---- Reminder ----
export interface IReminder {
  id: string;
  userId: string;
  userTag: string;
  guildId?: string;
  channelId?: string;
  message: string;
  remindAt: Date;
  delivered: boolean;
  repeat?: 'daily' | 'weekly' | 'monthly' | null;
  createdAt: Date;
}

// ---- Announcement ----
export interface IAnnouncement {
  id: string;
  guildId: string;
  channelId: string;
  title?: string;
  content: string;
  embed?: boolean;
  embedColor?: string;
  scheduledAt?: Date;
  sentAt?: Date;
  status: 'draft' | 'scheduled' | 'sent' | 'failed';
  authorId: string;
  authorTag: string;
  pingRoleId?: string;
  pingEveryone?: boolean;
  createdAt: Date;
}

// ---- Blacklist Entry ----
export type BlacklistType = 'user' | 'role' | 'channel' | 'bot' | 'domain' | 'invite' | 'word' | 'regex' | 'emoji' | 'sticker' | 'webhook';
export interface IBlacklistEntry {
  id: string;
  guildId: string;
  type: BlacklistType;
  value: string;         // userId, roleId, channelId, domain string, word, regex, etc.
  label?: string;        // human-readable label
  reason?: string;
  action: 'delete' | 'warn' | 'timeout' | 'kick' | 'ban';
  addedBy: string;
  addedByTag?: string;
  createdAt: Date;
  expiresAt?: Date;
}

// ---- Join To Create Voice ----
export interface IJoinToCreateTrigger {
  id: string;                    // Unique trigger ID (e.g. "trigger_<channelId>")
  label: string;                 // Friendly name shown in dashboard
  triggerChannelId: string;      // The voice channel users join to create a room
  categoryId?: string | null;    // Category to spawn new channels in
  defaultName: string;           // Name template e.g. "{username}'s Channel"
  defaultLimit: number;          // User limit (0 = unlimited)
  privacy: 'public' | 'private' | 'locked' | 'invisible' | 'stage' | 'sync';
}

export interface IJoinToCreate {
  id: string;
  guildId: string;
  // Multi-trigger system (primary)
  triggers: IJoinToCreateTrigger[];
  // Legacy single-trigger fields (kept for backward compat — migrated on first save)
  triggerChannelId?: string;
  categoryId?: string | null;
  defaultName?: string;
  defaultLimit?: number;
  defaultBitrate?: number;
  privacy?: 'public' | 'private' | 'locked' | 'invisible' | 'stage' | 'sync';
  allowOwnerRename: boolean;
  allowOwnerLimit: boolean;
  allowOwnerLock: boolean;
  activeChannels: Array<{
    channelId: string;
    ownerId: string;
    ownerTag: string;
    name: string;
    locked: boolean;
    limit?: number;
    triggerId?: string;
    createdAt: Date;
  }>;
  createdAt: Date;
}

// ---- Schedule (timed actions) ----
export interface ISchedule {
  id: string;
  guildId: string;
  name: string;
  action: 'message' | 'lock' | 'unlock' | 'role-add' | 'role-remove' | 'announcement';
  channelId?: string;
  roleId?: string;
  content?: string;
  cron?: string;               // cron expression
  runAt?: Date;                // one-time run
  repeat: boolean;
  enabled: boolean;
  lastRunAt?: Date;
  runCount: number;
  createdBy: string;
  createdAt: Date;
}

// ---- Premium Entitlement ----
export interface IPremiumEntitlement {
  id: string;
  guildId: string;
  tier: 'basic' | 'pro' | 'enterprise';
  activatedBy: string;
  activatedAt: Date;
  expiresAt?: Date;
  features: string[];
  trial: boolean;
  trialDays?: number;
}

// ---- Infraction / Case ----
export interface IInfraction {
  caseId: string;
  guildId: string;
  userId: string;
  userTag: string;
  moderatorId: string;
  moderatorTag: string;
  type: 'warn' | 'mute' | 'timeout' | 'kick' | 'ban' | 'unban' | 'softban' | 'note';
  reason: string;
  duration?: number;   // ms
  active: boolean;
  createdAt: Date;
  expiresAt?: Date;
}

// ---- Moderation Note ----
export interface IModerationNote {
  id: string;
  guildId: string;
  userId: string;
  content: string;
  createdBy: string;
  createdByTag: string;
  createdAt: Date;
}

// ---- Trusted Actor Abuse Log ----
export interface ITrustedActorAbuseLog {
  id?: number;
  guildId: string;
  userId: string;
  trustType: 'whitelist' | 'extraowner';
  revokedAt: number;
  warningsIssued: number;
  actionsTimeline: string; // JSON string of SnapshotRecord[]
  punishmentType: string;
  restoreReport?: string;  // JSON string of RestoreReport
  logChannelMsgId?: string;
  createdAt?: number;
}

