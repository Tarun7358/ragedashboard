/**
 * FeatureExtractor — Rage Brain
 *
 * Converts raw Discord Gateway events into structured ML feature records.
 * Uses the BrainStore velocity window queries to compute rate features.
 * All methods are async and must never throw to callers.
 */

import { BrainStore, BrainEventRow } from './BrainStore.js';

// Events we care about — all others are silently ignored
export const BRAIN_TRACKED_EVENTS = new Set([
  'roleDelete', 'roleCreate', 'roleUpdate',
  'channelDelete', 'channelCreate',
  'guildBanAdd', 'guildBanRemove',
  'guildMemberRemove', 'guildMemberAdd',
  'webhookCreate', 'webhookUpdate', 'webhookDelete',
  'messageDelete', 'messageDeleteBulk',
  'voiceStateUpdate',
  'guildMemberUpdate',
  'guildUpdate',
  'emojiCreate', 'emojiDelete',
  'stickerCreate', 'stickerDelete',
  'inviteCreate', 'inviteDelete',
  'integrationCreate', 'integrationDelete',
  'threadCreate', 'threadDelete',
]);

function generateId(guildId: string, eventType: string, actorId: string, ts: number): string {
  return `brain_${guildId}_${eventType}_${actorId}_${ts}_${Math.random().toString(36).slice(2, 7)}`;
}

function safeDays(ms: number | undefined | null): number {
  if (!ms || isNaN(ms)) return 0;
  return Math.max(0, (Date.now() - ms) / (1000 * 60 * 60 * 24));
}

export class FeatureExtractor {

  /**
   * Main entry point. Extracts an event record from raw gateway event args.
   * Returns null if this event type is not tracked or can't be processed.
   */
  public static async extract(
    eventName: string,
    args: any[],
    context: {
      getModulesState?: (guildId?: string) => any[];
      getGlobalSettings?: (guildId?: string) => Record<string, any>;
    }
  ): Promise<BrainEventRow | null> {
    if (!BRAIN_TRACKED_EVENTS.has(eventName)) return null;

    try {
      return await this._extractSafe(eventName, args, context);
    } catch (err: any) {
      // Never propagate — brain must not affect bot stability
      console.debug('[FeatureExtractor] extraction error (suppressed):', err?.message);
      return null;
    }
  }

  private static async _extractSafe(
    eventName: string,
    args: any[],
    context: any
  ): Promise<BrainEventRow | null> {

    // ── Resolve actor and guild from event ──────────────────────────────────
    const resolved = this._resolveActorAndGuild(eventName, args);
    if (!resolved) return null;

    const { actorId, guildId, targetId, eventFeatures, member } = resolved;
    if (!guildId || !actorId) return null;

    const ts = Date.now();
    const id = generateId(guildId, eventName, actorId, ts);

    // ── Velocity features (from rolling window of recent brain events) ──────
    const [
      actorRate10s,
      actorRate60s,
      guildRate10s,
      actorBanRate,
      actorRoleDeleteRate,
      actorChannelDeleteRate,
      actorPreviousFlags
    ] = await Promise.all([
      BrainStore.getActorEventCount(actorId, guildId, 10_000),
      BrainStore.getActorEventCount(actorId, guildId, 60_000),
      BrainStore.getGuildEventCount(guildId, 10_000),
      BrainStore.getActorEventTypeCount(actorId, guildId, 'guildBanAdd', 30_000),
      BrainStore.getActorEventTypeCount(actorId, guildId, 'roleDelete', 10_000),
      BrainStore.getActorEventTypeCount(actorId, guildId, 'channelDelete', 10_000),
      BrainStore.getActorPreviousFlags(actorId, guildId)
    ]);

    // ── Actor profile features ──────────────────────────────────────────────
    let actorIsOwner = 0;
    let actorIsBot = 0;
    let actorAccountAgeDays = 0;
    let actorJoinedGuildDays = 0;
    let actorHighestRolePosition = 0;
    let actorWhitelisted = 0;

    try {
      // Try to resolve member from first arg (most events have guild/member info)
      const rawMember = member;
      if (rawMember?.user) {
        const guild = rawMember.guild;
        actorIsOwner = guild?.ownerId === actorId ? 1 : 0;
        actorIsBot = rawMember.user.bot ? 1 : 0;
        actorAccountAgeDays = safeDays(rawMember.user.createdTimestamp);
        actorJoinedGuildDays = safeDays(rawMember.joinedTimestamp);
        actorHighestRolePosition = rawMember.roles?.highest?.position ?? 0;
      }

      // Check whitelist status from module config
      const modules = context.getModulesState ? context.getModulesState(guildId) : [];
      const whitelistMod = modules.find((m: any) => m.id === 'member_whitelist');
      if (whitelistMod?.config?.users?.includes(actorId)) {
        actorWhitelisted = 1;
      }
    } catch { /* suppress */ }

    const row: BrainEventRow = {
      id,
      guildId,
      eventType: eventName,
      actorId,
      targetId: targetId ?? null,
      timestamp: ts,

      actorEventRate_10s: actorRate10s,
      actorEventRate_60s: actorRate60s,
      guildEventRate_10s: guildRate10s,
      actorBanRate,
      actorRoleDeleteRate,
      actorChannelDeleteRate,

      actorIsOwner,
      actorIsBot,
      actorAccountAgeDays,
      actorJoinedGuildDays,
      actorHighestRolePosition,
      actorWhitelisted,
      actorPreviousFlags,

      eventFeatures: JSON.stringify(eventFeatures),

      label: 'unlabeled',
      labelConfidence: 0,
      attackSessionId: null,
      labelledAt: null,
      labelSource: 'auto'
    };

    return row;
  }

  // ── Per-event actor/guild resolver ──────────────────────────────────────────

  private static _resolveActorAndGuild(eventName: string, args: any[]): {
    actorId: string;
    guildId: string;
    targetId?: string;
    eventFeatures: Record<string, any>;
    member?: any;
  } | null {

    try {
      switch (eventName) {

        case 'roleDelete': {
          const role = args[0];
          if (!role?.guild) return null;
          return {
            actorId: role.guild.ownerId,    // best effort — real actor comes from audit log
            guildId: role.guild.id,
            targetId: role.id,
            eventFeatures: {
              roleName: role.name,
              roleColor: role.color,
              rolePosition: role.position,
              permissions: role.permissions?.bitfield?.toString() ?? '0',
              hoisted: role.hoist,
              mentionable: role.mentionable
            }
          };
        }

        case 'roleCreate': {
          const role = args[0];
          if (!role?.guild) return null;
          return {
            actorId: role.guild.ownerId,
            guildId: role.guild.id,
            targetId: role.id,
            eventFeatures: {
              roleName: role.name,
              permissions: role.permissions?.bitfield?.toString() ?? '0',
              hoisted: role.hoist,
              color: role.color
            }
          };
        }

        case 'channelDelete': {
          const ch = args[0];
          if (!ch?.guild) return null;
          return {
            actorId: ch.guild.ownerId,
            guildId: ch.guild.id,
            targetId: ch.id,
            eventFeatures: {
              channelName: ch.name,
              channelType: ch.type,
              isNsfw: ch.nsfw ?? false,
              position: ch.position ?? 0
            }
          };
        }

        case 'channelCreate': {
          const ch = args[0];
          if (!ch?.guild) return null;
          return {
            actorId: ch.guild.ownerId,
            guildId: ch.guild.id,
            targetId: ch.id,
            eventFeatures: { channelName: ch.name, channelType: ch.type }
          };
        }

        case 'guildBanAdd': {
          const ban = args[0];
          const guild = ban?.guild;
          if (!guild) return null;
          return {
            actorId: guild.ownerId,
            guildId: guild.id,
            targetId: ban.user?.id,
            eventFeatures: {
              targetBot: ban.user?.bot ?? false,
              targetAccountAgeDays: safeDays(ban.user?.createdTimestamp),
              reason: ban.reason ? 'provided' : 'none'
            }
          };
        }

        case 'guildBanRemove': {
          const ban = args[0];
          const guild = ban?.guild;
          if (!guild) return null;
          return {
            actorId: guild.ownerId,
            guildId: guild.id,
            targetId: ban.user?.id,
            eventFeatures: {
              targetAccountAgeDays: safeDays(ban.user?.createdTimestamp)
            }
          };
        }

        case 'guildMemberRemove': {
          const mem = args[0];
          if (!mem?.guild) return null;
          return {
            actorId: mem.guild.ownerId,
            guildId: mem.guild.id,
            targetId: mem.id,
            member: mem,
            eventFeatures: {
              memberAccountAgeDays: safeDays(mem.user?.createdTimestamp),
              joinedGuildDays: safeDays(mem.joinedTimestamp),
              isBot: mem.user?.bot ?? false,
              roles: mem.roles?.cache?.size ?? 0
            }
          };
        }

        case 'guildMemberAdd': {
          const mem = args[0];
          if (!mem?.guild) return null;
          return {
            actorId: mem.id,
            guildId: mem.guild.id,
            member: mem,
            eventFeatures: {
              accountAgeDays: safeDays(mem.user?.createdTimestamp),
              isBot: mem.user?.bot ?? false,
              username: undefined  // never store PII — just boolean flags
            }
          };
        }

        case 'webhookCreate':
        case 'webhookUpdate':
        case 'webhookDelete': {
          const wh = args[0];
          if (!wh?.guildId) return null;
          return {
            actorId: wh.owner?.id ?? 'unknown',
            guildId: wh.guildId,
            targetId: wh.id,
            eventFeatures: {
              channelId: wh.channelId,
              name: undefined    // don't store webhook name PII
            }
          };
        }

        case 'messageDelete': {
          const msg = args[0];
          if (!msg?.guild) return null;
          return {
            actorId: msg.author?.id ?? 'unknown',
            guildId: msg.guild.id,
            targetId: msg.id,
            eventFeatures: {
              hasContent: !!msg.content,
              contentLength: msg.content?.length ?? 0,
              hasAttachments: (msg.attachments?.size ?? 0) > 0,
              embeds: msg.embeds?.length ?? 0
            }
          };
        }

        case 'messageDeleteBulk': {
          const msgs = args[0];
          const channel = args[1] ?? msgs?.first?.()?.channel;
          const guild = channel?.guild;
          if (!guild) return null;
          return {
            actorId: guild.ownerId,
            guildId: guild.id,
            eventFeatures: {
              bulkCount: msgs?.size ?? 0,
              channelType: channel?.type
            }
          };
        }

        case 'voiceStateUpdate': {
          const data = args[0];
          const oldState = data?.oldState;
          const newState = data?.newState;
          const gId = newState?.guild?.id ?? oldState?.guild?.id;
          const aId = newState?.member?.id ?? oldState?.member?.id;
          if (!gId || !aId) return null;
          return {
            actorId: aId,
            guildId: gId,
            member: newState?.member,
            eventFeatures: {
              joined: !oldState?.channelId && !!newState?.channelId,
              left: !!oldState?.channelId && !newState?.channelId,
              moved: !!oldState?.channelId && !!newState?.channelId && oldState.channelId !== newState.channelId,
              selfMute: newState?.selfMute,
              selfDeaf: newState?.selfDeaf
            }
          };
        }

        case 'guildUpdate': {
          const [oldGuild, newGuild] = args;
          if (!newGuild?.id) return null;
          return {
            actorId: newGuild.ownerId,
            guildId: newGuild.id,
            eventFeatures: {
              nameChanged: oldGuild?.name !== newGuild?.name,
              iconChanged: oldGuild?.iconURL() !== newGuild?.iconURL(),
              verificationChanged: oldGuild?.verificationLevel !== newGuild?.verificationLevel,
              ownerChanged: oldGuild?.ownerId !== newGuild?.ownerId
            }
          };
        }

        default:
          return null;
      }
    } catch {
      return null;
    }
  }
}
