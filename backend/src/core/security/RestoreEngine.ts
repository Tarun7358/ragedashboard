import { Guild, ChannelType, PermissionFlagsBits } from 'discord.js';
import { SnapshotRecord, ChannelSnapshot, RoleSnapshot } from './TrustedActorStateSnapshot.js';

export interface RestoreReport {
  totalActions: number;
  restored: string[];
  failed: string[];
  durationMs: number;
}

export class RestoreEngine {
  public static async restoreAll(guild: Guild, timeline: SnapshotRecord[]): Promise<RestoreReport> {
    const startTime = Date.now();
    const report: RestoreReport = {
      totalActions: timeline.length,
      restored: [],
      failed: [],
      durationMs: 0
    };

    if (!guild || timeline.length === 0) {
      report.durationMs = Date.now() - startTime;
      return report;
    }

    // Process in REVERSE chronological order (LIFO)
    const reversed = [...timeline].reverse();

    for (const snap of reversed) {
      try {
        if (snap.type === 'channel') {
          await this.restoreChannel(guild, snap, report);
        } else if (snap.type === 'role') {
          await this.restoreRole(guild, snap, report);
        }
      } catch (err: any) {
        const target = snap.name || (snap.type === 'channel' ? snap.channelId : snap.roleId);
        report.failed.push(`${snap.action} ${snap.type} "${target}": ${err.message || err}`);
      }
    }

    report.durationMs = Date.now() - startTime;
    return report;
  }

  private static async restoreChannel(guild: Guild, snap: ChannelSnapshot, report: RestoreReport): Promise<void> {
    if (snap.action === 'deleted') {
      // 1. Resolve Parent Category if available
      let parentCategory = snap.parentId ? guild.channels.cache.get(snap.parentId) : undefined;
      
      // 2. Re-create Channel with exact properties
      const createOptions: any = {
        name: snap.name,
        type: snap.channelType,
        position: snap.position
      };

      if (parentCategory && parentCategory.type === ChannelType.GuildCategory) {
        createOptions.parent = parentCategory.id;
      }
      if (snap.topic) createOptions.topic = snap.topic;
      if (snap.nsfw !== undefined) createOptions.nsfw = snap.nsfw;
      if (snap.slowmode) createOptions.rateLimitPerUser = snap.slowmode;
      if (snap.bitrate && (snap.channelType === ChannelType.GuildVoice || snap.channelType === ChannelType.GuildStageVoice)) {
        createOptions.bitrate = snap.bitrate;
      }
      if (snap.userLimit && (snap.channelType === ChannelType.GuildVoice || snap.channelType === ChannelType.GuildStageVoice)) {
        createOptions.userLimit = snap.userLimit;
      }

      const newChannel: any = await guild.channels.create(createOptions);

      // 3. Restore Permission Overwrites
      if (snap.permissionOverwrites && snap.permissionOverwrites.length > 0) {
        for (const ow of snap.permissionOverwrites) {
          try {
            await newChannel.permissionOverwrites.create(ow.id, {
              allow: BigInt(ow.allow),
              deny: BigInt(ow.deny)
            });
          } catch (e) {
            // Non-fatal if target role/user no longer exists
          }
        }
      }

      // 4. Reposition channel
      if (typeof snap.position === 'number') {
        await newChannel.setPosition(snap.position).catch(() => {});
      }

      report.restored.push(`Restored deleted channel #${snap.name} (position: ${snap.position})`);
    } else if (snap.action === 'created') {
      // Delete illegally created channel
      const createdChannel = guild.channels.cache.get(snap.channelId);
      if (createdChannel) {
        await createdChannel.delete('[Rage Optimiser] Trusted Actor Abuse — Rollback unauthorized creation').catch(() => {});
        report.restored.push(`Removed unauthorized created channel #${createdChannel.name}`);
      }
    }
  }

  private static async restoreRole(guild: Guild, snap: RoleSnapshot, report: RestoreReport): Promise<void> {
    if (snap.action === 'deleted') {
      // 1. Re-create Role with exact properties
      const createOptions: any = {
        name: snap.name,
        colors: snap.color !== undefined ? { primaryColor: snap.color } : undefined,
        hoist: snap.hoist,
        mentionable: snap.mentionable,
        permissions: BigInt(snap.permissions || '0'),
        position: snap.position
      };
      if (snap.icon) createOptions.icon = snap.icon;
      if (snap.unicodeEmoji) createOptions.unicodeEmoji = snap.unicodeEmoji;

      const newRole: any = await guild.roles.create(createOptions);

      // 2. Reposition role below bot's highest role
      if (typeof snap.position === 'number') {
        await newRole.setPosition(snap.position).catch(() => {});
      }

      // 3. Re-assign role to original members in rate-limit safe batches
      let assignedCount = 0;
      if (snap.memberIds && snap.memberIds.length > 0) {
        const BATCH_SIZE = 5;
        for (let i = 0; i < snap.memberIds.length; i += BATCH_SIZE) {
          const batch = snap.memberIds.slice(i, i + BATCH_SIZE);
          await Promise.allSettled(
            batch.map(async (mId) => {
              const member = guild.members.cache.get(mId) || await guild.members.fetch(mId).catch(() => null);
              if (member) {
                await member.roles.add(newRole).catch(() => {});
                assignedCount++;
              }
            })
          );
          await new Promise((r) => setTimeout(r, 400));
        }
      }

      report.restored.push(`Restored deleted role @${snap.name} (reassigned to ${assignedCount}/${snap.memberIds.length} members)`);
    } else if (snap.action === 'created') {
      // Delete illegally created role
      const createdRole = guild.roles.cache.get(snap.roleId);
      if (createdRole) {
        await createdRole.delete('[Rage Optimiser] Trusted Actor Abuse — Rollback unauthorized creation').catch(() => {});
        report.restored.push(`Removed unauthorized created role @${createdRole.name}`);
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // RECOVERY 2.0: BOUNDED RETRY EXECUTOR WITH DISCORD 429 BACKOFF
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Executes a Discord API call with bounded retries and exponential jitter backoff
   * specifically respecting Discord HTTP 429 rate limit parameters.
   */
  public static async executeWithRetry<T>(
    actionName: string,
    operation: () => Promise<T>,
    maxRetries = 3
  ): Promise<T | null> {
    let attempt = 0;
    while (attempt < maxRetries) {
      attempt++;
      try {
        return await operation();
      } catch (err: any) {
        const isRateLimit = err?.status === 429 || err?.code === 429 || err?.message?.includes?.('429');
        const retryAfterMs = (err?.retry_after ? Math.ceil(err.retry_after * 1000) : 0) || (attempt * 650);
        if (isRateLimit || attempt < maxRetries) {
          console.warn(`[RestoreEngine Retry] ${actionName} failed (attempt ${attempt}/${maxRetries}). Retrying in ${retryAfterMs}ms...`);
          await new Promise(r => setTimeout(r, retryAfterMs));
        } else {
          console.error(`[RestoreEngine Final Error] ${actionName} failed after ${maxRetries} attempts:`, err?.message || err);
          return null;
        }
      }
    }
    return null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // RECOVERY 2.0: PRE-RESTORE DRY-RUN DIFF PREVIEW
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Generates a dry-run diff report comparing current live Discord state with target snapshot.
   * Completely safe and read-only: does not modify any server assets.
   */
  public static generateRestorePreview(guild: Guild, snap: any): RestorePreviewDiff {
    const diff: RestorePreviewDiff = {
      guildId: guild.id,
      channelsToCreate: [],
      channelsToUpdate: [],
      channelsToDelete: [],
      rolesToCreate: [],
      rolesToUpdate: [],
      rolesToDelete: [],
      settingsDiff: [],
      totalDiscrepancies: 0
    };

    if (!snap) return diff;

    const safeFind = (cache: any, predicate: (item: any) => boolean) => {
      if (!cache) return null;
      if (typeof cache.find === 'function') return cache.find(predicate);
      if (typeof cache.values === 'function') {
        for (const item of cache.values()) {
          if (predicate(item)) return item;
        }
      }
      return null;
    };

    // 1. Channel Diffs
    if (snap.channels && Array.isArray(snap.channels)) {
      const snapChannelMap = new Map<string, any>(snap.channels.map((c: any) => [c.id, c]));

      for (const cSnap of snap.channels) {
        const liveChan = guild.channels.cache.get(cSnap.id) ||
          safeFind(guild.channels.cache, (c: any) => c.name.toLowerCase() === cSnap.name.toLowerCase() && c.type === cSnap.type);

        if (!liveChan) {
          diff.channelsToCreate.push(`#${cSnap.name} (type: ${cSnap.type})`);
        } else if (liveChan.name !== cSnap.name || (liveChan as any).rawPosition !== cSnap.position) {
          diff.channelsToUpdate.push(`#${liveChan.name} -> #${cSnap.name}`);
        }
      }

      for (const [cId, liveChan] of guild.channels.cache) {
        const isSystem = cId === guild.rulesChannelId || cId === guild.systemChannelId || cId === guild.publicUpdatesChannelId;
        if (isSystem) continue;
        const existsInSnap = snapChannelMap.has(cId) ||
          snap.channels.some((c: any) => c.name.toLowerCase() === liveChan.name.toLowerCase() && c.type === liveChan.type);
        if (!existsInSnap) {
          diff.channelsToDelete.push(`#${liveChan.name} (rogue/untracked channel)`);
        }
      }
    }

    // 2. Role Diffs
    if (snap.roles && Array.isArray(snap.roles)) {
      const snapRoleMap = new Map<string, any>(snap.roles.map((r: any) => [r.id, r]));

      for (const rSnap of snap.roles) {
        if (rSnap.name === '@everyone') continue;
        const liveRole = guild.roles.cache.get(rSnap.id) ||
          safeFind(guild.roles.cache, (r: any) => r.name.toLowerCase() === rSnap.name.toLowerCase() && !r.managed);

        if (!liveRole) {
          diff.rolesToCreate.push(`@${rSnap.name}`);
        } else if (liveRole.name !== rSnap.name || liveRole.color !== rSnap.color || liveRole.permissions.bitfield.toString() !== rSnap.permissions) {
          diff.rolesToUpdate.push(`@${liveRole.name}`);
        }
      }

      for (const [rId, liveRole] of guild.roles.cache) {
        if (liveRole.name === '@everyone' || liveRole.managed || liveRole.name === '. Quarantine') continue;
        const existsInSnap = snapRoleMap.has(rId) ||
          snap.roles.some((r: any) => r.name.toLowerCase() === liveRole.name.toLowerCase());
        if (!existsInSnap) {
          diff.rolesToDelete.push(`@${liveRole.name} (rogue/untracked role)`);
        }
      }
    }

    // 3. Settings Diffs
    if (snap.guildSettings) {
      const gs = snap.guildSettings;
      if (gs.name && guild.name !== gs.name) diff.settingsDiff.push(`Name: "${guild.name}" -> "${gs.name}"`);
      if (gs.verificationLevel !== undefined && guild.verificationLevel !== gs.verificationLevel) {
        diff.settingsDiff.push(`Verification: ${guild.verificationLevel} -> ${gs.verificationLevel}`);
      }
    }

    diff.totalDiscrepancies =
      diff.channelsToCreate.length + diff.channelsToUpdate.length + diff.channelsToDelete.length +
      diff.rolesToCreate.length + diff.rolesToUpdate.length + diff.rolesToDelete.length +
      diff.settingsDiff.length;

    return diff;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // RECOVERY 2.0: POST-RESTORE INTEGRITY AUDIT VERIFICATION
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Verifies the completeness and accuracy of the restored server state against the snapshot.
   * Produces an integrity score (0-100%) and pinpoint record of any incomplete elements.
   */
  public static verifyIntegrity(guild: Guild, snap: any): IntegrityAuditReport {
    if (!guild || !snap) {
      return {
        passed: false,
        integrityScore: 0,
        missingChannels: [],
        missingRoles: [],
        details: 'Invalid guild or snapshot provided for audit.'
      };
    }

    const safeFind = (cache: any, predicate: (item: any) => boolean) => {
      if (!cache) return null;
      if (typeof cache.find === 'function') return cache.find(predicate);
      if (typeof cache.values === 'function') {
        for (const item of cache.values()) {
          if (predicate(item)) return item;
        }
      }
      return null;
    };

    const expectedChannels: any[] = snap.channels || [];
    const expectedRoles: any[] = (snap.roles || []).filter((r: any) => r.name !== '@everyone');

    let matchedChannels = 0;
    const missingChannels: string[] = [];

    for (const c of expectedChannels) {
      const live = guild.channels.cache.get(c.id) ||
        safeFind(guild.channels.cache, (lc: any) => lc.name.toLowerCase() === c.name.toLowerCase() && lc.type === c.type);
      if (live) {
        matchedChannels++;
      } else {
        missingChannels.push(`#${c.name}`);
      }
    }

    let matchedRoles = 0;
    const missingRoles: string[] = [];

    for (const r of expectedRoles) {
      const live = guild.roles.cache.get(r.id) ||
        safeFind(guild.roles.cache, (lr: any) => lr.name.toLowerCase() === r.name.toLowerCase());
      if (live) {
        matchedRoles++;
      } else {
        missingRoles.push(`@${r.name}`);
      }
    }

    const totalExpected = expectedChannels.length + expectedRoles.length;
    const totalMatched = matchedChannels + matchedRoles;
    const integrityScore = totalExpected > 0 ? Math.round((totalMatched / totalExpected) * 100) : 100;
    const passed = integrityScore >= 95;

    const details = passed
      ? `Integrity Verified: ${integrityScore}% complete (${matchedChannels}/${expectedChannels.length} channels, ${matchedRoles}/${expectedRoles.length} roles).`
      : `Incomplete Restoration: ${integrityScore}% complete. Missing: ${missingChannels.length} channels, ${missingRoles.length} roles.`;

    return {
      passed,
      integrityScore,
      missingChannels,
      missingRoles,
      details
    };
  }
}

export interface RestorePreviewDiff {
  guildId: string;
  channelsToCreate: string[];
  channelsToUpdate: string[];
  channelsToDelete: string[];
  rolesToCreate: string[];
  rolesToUpdate: string[];
  rolesToDelete: string[];
  settingsDiff: string[];
  totalDiscrepancies: number;
}

export interface IntegrityAuditReport {
  passed: boolean;
  integrityScore: number;
  missingChannels: string[];
  missingRoles: string[];
  details: string;
}

