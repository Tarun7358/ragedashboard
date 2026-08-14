import { GuildChannel, Role, ChannelType, PermissionOverwrites } from 'discord.js';

export interface ChannelSnapshot {
  type: 'channel';
  action: 'deleted' | 'created';
  timestamp: number;
  channelId: string;
  name: string;
  channelType: ChannelType;
  parentId: string | null;
  position: number;
  topic: string | null;
  nsfw: boolean;
  slowmode: number;
  bitrate: number | null;
  userLimit: number | null;
  permissionOverwrites: Array<{
    id: string;
    type: number; // 0 = role, 1 = member
    allow: string; // stringified bitfield
    deny: string;  // stringified bitfield
  }>;
}

export interface RoleSnapshot {
  type: 'role';
  action: 'deleted' | 'created';
  timestamp: number;
  roleId: string;
  name: string;
  color: number;
  hoist: boolean;
  mentionable: boolean;
  position: number;
  permissions: string; // stringified bitfield
  icon: string | null;
  unicodeEmoji: string | null;
  memberIds: string[];
}

export type SnapshotRecord = ChannelSnapshot | RoleSnapshot;

export class TrustedActorStateSnapshot {
  // Key: guildId:userId -> SnapshotRecord[]
  private static store = new Map<string, SnapshotRecord[]>();
  private static TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

  private static getKey(guildId: string, userId: string): string {
    return `${guildId}:${userId}`;
  }

  public static captureChannelBeforeDelete(channel: any): ChannelSnapshot {
    const overwrites: Array<{ id: string; type: number; allow: string; deny: string }> = [];
    
    if (channel.permissionOverwrites?.cache) {
      channel.permissionOverwrites.cache.forEach((ow: PermissionOverwrites) => {
        overwrites.push({
          id: ow.id,
          type: ow.type,
          allow: ow.allow.bitfield.toString(),
          deny: ow.deny.bitfield.toString()
        });
      });
    }

    return {
      type: 'channel',
      action: 'deleted',
      timestamp: Date.now(),
      channelId: channel.id,
      name: channel.name || 'unnamed-channel',
      channelType: channel.type,
      parentId: channel.parentId || null,
      position: channel.position ?? 0,
      topic: channel.topic || null,
      nsfw: !!channel.nsfw,
      slowmode: channel.rateLimitPerUser ?? 0,
      bitrate: channel.bitrate || null,
      userLimit: channel.userLimit || null,
      permissionOverwrites: overwrites
    };
  }

  public static captureRoleBeforeDelete(role: any): RoleSnapshot {
    const memberIds: string[] = [];
    if (role.members?.cache) {
      role.members.cache.forEach((m: any) => memberIds.push(m.id));
    }

    return {
      type: 'role',
      action: 'deleted',
      timestamp: Date.now(),
      roleId: role.id,
      name: role.name || 'unnamed-role',
      color: role.color ?? 0,
      hoist: !!role.hoist,
      mentionable: !!role.mentionable,
      position: role.position ?? 0,
      permissions: role.permissions?.bitfield ? role.permissions.bitfield.toString() : '0',
      icon: role.icon || null,
      unicodeEmoji: role.unicodeEmoji || null,
      memberIds
    };
  }

  public static recordChannelCreated(channel: any): ChannelSnapshot {
    return {
      type: 'channel',
      action: 'created',
      timestamp: Date.now(),
      channelId: channel.id,
      name: channel.name || 'new-channel',
      channelType: channel.type,
      parentId: channel.parentId || null,
      position: channel.position ?? 0,
      topic: null,
      nsfw: false,
      slowmode: 0,
      bitrate: null,
      userLimit: null,
      permissionOverwrites: []
    };
  }

  public static recordRoleCreated(role: any): RoleSnapshot {
    return {
      type: 'role',
      action: 'created',
      timestamp: Date.now(),
      roleId: role.id,
      name: role.name || 'new-role',
      color: 0,
      hoist: false,
      mentionable: false,
      position: 0,
      permissions: '0',
      icon: null,
      unicodeEmoji: null,
      memberIds: []
    };
  }

  public static push(guildId: string, userId: string, record: SnapshotRecord): void {
    const key = this.getKey(guildId, userId);
    if (!this.store.has(key)) {
      this.store.set(key, []);
    }
    const list = this.store.get(key)!;
    list.push(record);

    // Auto-cleanup stale records older than 5 minutes
    const cutoff = Date.now() - this.TTL_MS;
    const fresh = list.filter(r => r.timestamp >= cutoff);
    this.store.set(key, fresh);
  }

  public static getTimeline(guildId: string, userId: string): SnapshotRecord[] {
    const key = this.getKey(guildId, userId);
    const list = this.store.get(key) || [];
    const cutoff = Date.now() - this.TTL_MS;
    return list.filter(r => r.timestamp >= cutoff);
  }

  public static clear(guildId: string, userId: string): void {
    const key = this.getKey(guildId, userId);
    this.store.delete(key);
  }
}
