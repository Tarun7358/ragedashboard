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
        color: snap.color,
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
}
