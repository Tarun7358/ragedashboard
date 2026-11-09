import { PermissionFlagsBits } from 'discord.js';
import { isOwnerOrExtraOwner, checkWhitelistPermission } from '../../utils/whitelistCheck.js';
import { CentralLogger } from './CentralLogger.js';

/**
 * CommandGuard - central, deny-by-default gate for dangerous moderation commands.
 *
 * It is evaluated by BOTH dispatchers (slash: InteractionRouter, prefix: CommandPipeline)
 * so a command can never be exposed just because its metadata forgot to declare permissions.
 *
 * Rules enforced:
 *  1. Exact Discord permission (or Owner / Extra Owner / configured modRoleIds / matching whitelist).
 *  2. Protected targets and role hierarchy (executor must outrank target).
 *  3. Per-executor rate limit so a compromised moderator cannot mass-ban through the bot.
 */

// ── Permission name resolution (shared by slash + prefix) ───────────────────

const PERMISSION_ALIASES: Record<string, string> = {
  manageserver: 'ManageGuild',
  viewauditlogs: 'ViewAuditLog',
  manageemojis: 'ManageGuildExpressions',
  manageemojisandstickers: 'ManageGuildExpressions'
};

const normalizePermName = (s: string): string => s.replace(/[\s_\-]/g, '').toLowerCase();

/**
 * Resolves any spelling of a Discord permission ("BanMembers", "Ban Members", "ban_members")
 * to its bit flag. Returns null only if the name is genuinely unknown - callers MUST treat
 * null as "missing" (fail closed), never as "skip".
 */
export function resolvePermissionFlag(name: string | bigint): bigint | null {
  if (typeof name === 'bigint') return name;
  if (!name) return null;
  const direct = (PermissionFlagsBits as any)[name];
  if (typeof direct === 'bigint') return direct;
  const norm = normalizePermName(name);
  const aliased = PERMISSION_ALIASES[norm];
  if (aliased && typeof (PermissionFlagsBits as any)[aliased] === 'bigint') {
    return (PermissionFlagsBits as any)[aliased];
  }
  for (const [key, value] of Object.entries(PermissionFlagsBits)) {
    if (normalizePermName(key) === norm && typeof value === 'bigint') return value;
  }
  return null;
}

// ── Dangerous command rules (moderation module only) ─────────────────────────

interface DangerousRule {
  perms: bigint[];
  targeted: boolean;
  whitelistRule?: string;
  group: string;
  limit: number;
  windowMs: number;
}

const MIN = 60_000;

const RULES: Record<string, DangerousRule> = {
  ban:      { perms: [PermissionFlagsBits.BanMembers],      targeted: true,  whitelistRule: 'anti_ban',           group: 'destructive', limit: 5,  windowMs: MIN },
  softban:  { perms: [PermissionFlagsBits.BanMembers],      targeted: true,  whitelistRule: 'anti_ban',           group: 'destructive', limit: 5,  windowMs: MIN },
  tempban:  { perms: [PermissionFlagsBits.BanMembers],      targeted: true,  whitelistRule: 'anti_ban',           group: 'destructive', limit: 5,  windowMs: MIN },
  hackban:  { perms: [PermissionFlagsBits.BanMembers],      targeted: true,  whitelistRule: 'anti_ban',           group: 'destructive', limit: 5,  windowMs: MIN },
  unban:    { perms: [PermissionFlagsBits.BanMembers],      targeted: false, whitelistRule: 'anti_unban',         group: 'unban',       limit: 10, windowMs: MIN },
  kick:     { perms: [PermissionFlagsBits.KickMembers],     targeted: true,  whitelistRule: 'anti_kick',          group: 'destructive', limit: 5,  windowMs: MIN },
  timeout:  { perms: [PermissionFlagsBits.ModerateMembers], targeted: true,  whitelistRule: 'anti_timeout',      group: 'timeout',     limit: 10, windowMs: MIN },
  mute:     { perms: [PermissionFlagsBits.ModerateMembers], targeted: true,  whitelistRule: 'anti_timeout',      group: 'timeout',     limit: 10, windowMs: MIN },
  untimeout:{ perms: [PermissionFlagsBits.ModerateMembers], targeted: false, whitelistRule: 'anti_timeout',      group: 'timeout',     limit: 10, windowMs: MIN },
  unmute:   { perms: [PermissionFlagsBits.ModerateMembers], targeted: false, whitelistRule: 'anti_timeout',      group: 'timeout',     limit: 10, windowMs: MIN },
  warn:     { perms: [PermissionFlagsBits.ModerateMembers], targeted: false, whitelistRule: undefined,           group: 'warn',        limit: 15, windowMs: MIN },
  warnings: { perms: [PermissionFlagsBits.ModerateMembers], targeted: false, whitelistRule: undefined,           group: 'view',        limit: 30, windowMs: MIN },
  clearwarnings: { perms: [PermissionFlagsBits.ModerateMembers], targeted: false, whitelistRule: undefined,      group: 'warn',        limit: 15, windowMs: MIN },
  history:  { perms: [PermissionFlagsBits.ModerateMembers], targeted: false, whitelistRule: undefined,           group: 'view',        limit: 30, windowMs: MIN },
  nick:     { perms: [PermissionFlagsBits.ManageNicknames], targeted: true,  whitelistRule: 'anti_member_update', group: 'nick',        limit: 10, windowMs: MIN },
  purge:    { perms: [PermissionFlagsBits.ManageMessages],  targeted: false, whitelistRule: undefined,           group: 'purge',       limit: 5,  windowMs: MIN },
  clear:    { perms: [PermissionFlagsBits.ManageMessages],  targeted: false, whitelistRule: undefined,           group: 'purge',       limit: 5,  windowMs: MIN },
  lock:     { perms: [PermissionFlagsBits.ManageChannels],  targeted: false, whitelistRule: 'anti_channel_update', group: 'channel',    limit: 8,  windowMs: MIN },
  unlock:   { perms: [PermissionFlagsBits.ManageChannels],  targeted: false, whitelistRule: 'anti_channel_update', group: 'channel',    limit: 8,  windowMs: MIN },
  slowmode: { perms: [PermissionFlagsBits.ManageChannels],  targeted: false, whitelistRule: 'anti_channel_update', group: 'channel',    limit: 8,  windowMs: MIN }
};

/** Modules whose command names are covered by RULES (names such as `clear`/`lock` exist in other modules). */
const GUARDED_MODULE_IDS = new Set(['moderation']);

export interface CommandGuardInput {
  guild: any;
  executorId: string;
  commandName: string;
  moduleId?: string;
  /** Candidate target user IDs (every mention / snowflake supplied by the executor). */
  targetIds?: string[];
  /** Guild-bound module state accessor. */
  getModules?: () => any[];
  /** Whitelist context ({ getModulesState }). */
  context?: any;
}

export interface CommandGuardVerdict {
  allowed: boolean;
  reason?: string;
}

const SNOWFLAKE = /\d{17,20}/g;

// executor rate-limit state: key -> timestamps
const rateWindows = new Map<string, number[]>();
const alertedKeys = new Map<string, number>();

export class CommandGuard {
  /** True when this (module, command) pair is covered by the central dangerous-command gate. */
  public static isGuarded(commandName: string, moduleId?: string): boolean {
    if (!commandName) return false;
    if (moduleId && !GUARDED_MODULE_IDS.has(moduleId)) return false;
    return Boolean(RULES[commandName.toLowerCase()]);
  }

  /** Permissions required for a guarded command (used by in-handler defense in depth). */
  public static getRequiredPerms(commandName: string): bigint[] {
    return RULES[(commandName || '').toLowerCase()]?.perms ?? [];
  }

  /** Slash: exact target from the typed option. */
  public static targetsFromInteraction(interaction: any): string[] {
    const ids = new Set<string>();
    try {
      const u = interaction.options?.getUser?.('user');
      if (u?.id) ids.add(u.id);
      const raw = interaction.options?.getString?.('user_id');
      if (typeof raw === 'string') (raw.match(SNOWFLAKE) || []).forEach(m => ids.add(m));
    } catch { /* ignore */ }
    return [...ids];
  }

  /** Prefix: every mention and every snowflake in the args, so no parsing mismatch can hide a target. */
  public static targetsFromMessage(message: any, args: string[]): string[] {
    const ids = new Set<string>();
    try {
      message.mentions?.users?.forEach((u: any) => ids.add(u.id));
      for (const a of args || []) (String(a).match(SNOWFLAKE) || []).forEach(m => ids.add(m));
    } catch { /* ignore */ }
    return [...ids];
  }

  public static async evaluate(input: CommandGuardInput): Promise<CommandGuardVerdict> {
    const rule = RULES[(input.commandName || '').toLowerCase()];
    if (!rule) return { allowed: true };
    if (input.moduleId && !GUARDED_MODULE_IDS.has(input.moduleId)) return { allowed: true };

    const { guild, executorId } = input;
    if (!guild || !executorId) return { allowed: false, reason: 'This command can only be used inside a server.' };

    const isGuildOwner =
      executorId === guild.ownerId ||
      executorId === process.env.OWNER_ID ||
      executorId === guild.client?.application?.owner?.id ||
      Boolean((guild.client?.application?.owner as any)?.members?.has?.(executorId));
    const isTop = isGuildOwner || (await isOwnerOrExtraOwner(executorId, guild).catch(() => false));

    const member =
      guild.members?.cache?.get(executorId) ||
      (await guild.members?.fetch?.(executorId).catch(() => null));

    // 1. Authorization: exact permission, mod role, or matching whitelist
    // ZERO-TRUST ANTI-NUKE ENFORCEMENT: When Security / Anti-Nuke is active and a command maps to a
    // destructive Anti-Nuke rule (anti_ban, anti_unban, anti_kick), holding a Discord Administrator /
    // BanMembers / KickMembers role is NOT sufficient by itself — the executor MUST be Server Owner,
    // Extra Owner, or explicitly whitelisted for that rule so an unwhitelisted Admin cannot bypass
    // Anti-Nuke by running bot commands!
    const modules = input.getModules ? input.getModules() : [];
    const secModule = modules.find((m: any) => m.id === 'security');
    const isAntiNukeActive = secModule?.status === 'enabled' && secModule?.config?.antiNukeEnabled !== false;
    const isZeroTrustNukeRule = Boolean(
      isAntiNukeActive &&
      rule.whitelistRule &&
      ['anti_ban', 'anti_unban', 'anti_kick'].includes(rule.whitelistRule)
    );

    let authorized = isTop;
    if (!authorized && isZeroTrustNukeRule && rule.whitelistRule) {
      authorized = await checkWhitelistPermission(
        executorId,
        guild,
        input.context || { getModulesState: () => modules },
        rule.whitelistRule
      ).catch(() => false);
      if (!authorized) {
        return {
          allowed: false,
          reason: `Anti-Nuke Zero-Trust Protection: Only the Server Owner, Extra Owners, or users whitelisted for \`${rule.whitelistRule}\` can execute \`${input.commandName}\` while Anti-Nuke is active.`
        };
      }
    }
    if (!authorized && member?.permissions) {
      authorized = rule.perms.every(p => member.permissions.has(p));
    }
    if (!authorized && member?.roles?.cache) {
      const modRoleIds: string[] = modules.find((m: any) => m.id === 'moderation')?.config?.modRoleIds || [];
      if (modRoleIds.length > 0 && member.roles.cache.some((r: any) => modRoleIds.includes(r.id))) authorized = true;
    }
    if (!authorized && rule.whitelistRule) {
      authorized = await checkWhitelistPermission(executorId, guild, input.context || { getModulesState: () => modules }, rule.whitelistRule).catch(() => false);
    }
    if (!authorized) {
      const names = Object.entries(PermissionFlagsBits).filter(([, v]) => rule.perms.includes(v as bigint)).map(([k]) => k);
      return { allowed: false, reason: `You do not have permission to use this command. Required: ${names.join(', ') || 'moderator access'}.` };
    }

    // 2. Protected targets + hierarchy
    if (rule.targeted) {
      const targets = (input.targetIds || []).filter(Boolean);
      if (targets.length === 0) {
        return { allowed: false, reason: 'Please specify a valid target member (mention or user ID).' };
      }
      for (const targetId of targets) {
        const verdict = await this.checkTarget(guild, executorId, targetId, member, isGuildOwner, isTop, rule, input);
        if (!verdict.allowed) return verdict;
      }
    }

    // 3. Rate limit (Owner / Extra Owners exempt)
    if (!isTop) {
      const now = Date.now();
      const key = `${guild.id}:${executorId}:${rule.group}`;
      const recent = (rateWindows.get(key) || []).filter(t => now - t < rule.windowMs);
      if (recent.length >= rule.limit) {
        rateWindows.set(key, recent);
        this.alertRateLimit(guild, executorId, member, key, rule, input.commandName);
        const wait = Math.max(1, Math.ceil((rule.windowMs - (now - recent[0])) / 1000));
        return { allowed: false, reason: `Rate limit reached for this action (${rule.limit} per ${rule.windowMs / 1000}s). Try again in ${wait}s.` };
      }
      recent.push(now);
      rateWindows.set(key, recent);
      this.pruneRateState(now);
    }

    return { allowed: true };
  }

  private static async checkTarget(
    guild: any,
    executorId: string,
    targetId: string,
    executorMember: any,
    isGuildOwner: boolean,
    isTop: boolean,
    rule: DangerousRule,
    input: CommandGuardInput
  ): Promise<CommandGuardVerdict> {
    if (targetId === executorId) return { allowed: false, reason: 'You cannot use this command on yourself.' };
    if (targetId === guild.client?.user?.id) return { allowed: false, reason: 'I cannot be targeted by this command.' };
    if (targetId === guild.ownerId) return { allowed: false, reason: 'The server owner cannot be targeted.' };

    // Only the guild owner may act on Extra Owners (stops a compromised extra owner pivoting).
    const targetIsTop = await isOwnerOrExtraOwner(targetId, guild).catch(() => false);
    if (targetIsTop && !isGuildOwner) {
      return { allowed: false, reason: 'Owners and Extra Owners are protected and cannot be targeted.' };
    }

    if (isTop) return { allowed: true };

    // Whitelisted members / bots are protected from regular moderators.
    const ctx = input.context || { getModulesState: () => input.getModules?.() || [] };
    const targetWhitelisted = await checkWhitelistPermission(targetId, guild, ctx, rule.whitelistRule).catch(() => false);
    if (targetWhitelisted) {
      return { allowed: false, reason: 'Whitelisted members and bots are protected and cannot be targeted.' };
    }

    // Role hierarchy: executor must strictly outrank the target.
    const targetMember =
      guild.members?.cache?.get(targetId) ||
      (await guild.members?.fetch?.(targetId).catch(() => null));
    if (targetMember) {
      const execPos = executorMember?.roles?.highest?.position ?? -1;
      const targetPos = targetMember.roles?.highest?.position ?? 0;
      if (execPos <= targetPos) {
        return { allowed: false, reason: 'You can only moderate members whose highest role is below yours.' };
      }
    }
    return { allowed: true };
  }

  private static alertRateLimit(guild: any, executorId: string, member: any, key: string, rule: DangerousRule, commandName: string): void {
    const now = Date.now();
    const last = alertedKeys.get(key) || 0;
    if (now - last < rule.windowMs) return;
    alertedKeys.set(key, now);
    try {
      CentralLogger.attack({
        guild,
        action: 'MODERATION RATE LIMIT TRIPPED',
        reason: `Executor exceeded ${rule.limit} /${commandName} style actions in ${rule.windowMs / 1000}s`,
        executorId,
        executorName: member?.user?.username || executorId,
        result: 'success',
        note: 'Command blocked by CommandGuard. Review this moderator account for compromise.',
        severity: 'high'
      } as any);
    } catch { /* logging must never break command flow */ }
  }

  private static pruneRateState(now: number): void {
    if (rateWindows.size < 500) return;
    for (const [key, list] of rateWindows) {
      if (!list.some(t => now - t < MIN * 2)) rateWindows.delete(key);
    }
    for (const [key, t] of alertedKeys) {
      if (now - t > MIN * 2) alertedKeys.delete(key);
    }
  }
}
