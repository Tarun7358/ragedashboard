import { PermissionFlagsBits, ChannelType, Guild, VoiceChannel, StageChannel } from 'discord.js';

export interface IVoiceStatusTarget {
  channelId: string;
  defaultStatus: string;
  enabled: boolean;
  createdAt: number;
  lastUpdated?: number;
}

export interface IVoiceStatusSettings {
  autoStatusEnabled: boolean;
  channels: IVoiceStatusTarget[];
}

/**
 * In-memory state tracking to avoid redundant API calls and prevent overwriting
 * user-set statuses when members are active inside the voice channel.
 */
class VoiceStatusStateManager {
  // channelId -> boolean indicating a user manually updated the status
  private userManualOverrides: Map<string, boolean> = new Map();
  // channelId -> last known voice status text
  private currentStatuses: Map<string, string> = new Map();
  // channelId -> timestamp of last status update attempt (cooldown/rate limit guard)
  private lastUpdateTimestamps: Map<string, number> = new Map();
  // channelId -> pending debounce timer
  private pendingDebounceTimers: Map<string, NodeJS.Timeout> = new Map();
  // Set of channelIds currently in an active REST request
  private inFlightRequests: Set<string> = new Set();
  // Bot client reference for sweep operations
  private client: any = null;

  public setClient(client: any) {
    this.client = client;
  }

  public getClient(): any {
    return this.client;
  }

  public isManualOverride(channelId: string): boolean {
    return this.userManualOverrides.get(channelId) === true;
  }

  public setManualOverride(channelId: string, value: boolean) {
    this.userManualOverrides.set(channelId, value);
  }

  public getCurrentStatus(channelId: string): string | undefined {
    return this.currentStatuses.get(channelId);
  }

  public setCurrentStatus(channelId: string, status: string) {
    this.currentStatuses.set(channelId, status);
  }

  public isCooldownActive(channelId: string, cooldownMs: number = 3000): boolean {
    const last = this.lastUpdateTimestamps.get(channelId) || 0;
    return Date.now() - last < cooldownMs;
  }

  public recordUpdateTimestamp(channelId: string) {
    this.lastUpdateTimestamps.set(channelId, Date.now());
  }

  public setPendingTimer(channelId: string, timer: NodeJS.Timeout) {
    const existing = this.pendingDebounceTimers.get(channelId);
    if (existing) clearTimeout(existing);
    this.pendingDebounceTimers.set(channelId, timer);
  }

  public clearPendingTimer(channelId: string) {
    const existing = this.pendingDebounceTimers.get(channelId);
    if (existing) {
      clearTimeout(existing);
      this.pendingDebounceTimers.delete(channelId);
    }
  }

  public isInFlight(channelId: string): boolean {
    return this.inFlightRequests.has(channelId);
  }

  public markInFlight(channelId: string, state: boolean) {
    if (state) {
      this.inFlightRequests.add(channelId);
    } else {
      this.inFlightRequests.delete(channelId);
    }
  }
}

export const VoiceStatusState = new VoiceStatusStateManager();

/**
 * Low-level Discord REST call to set the status text on a Voice or Stage channel.
 */
export async function setVoiceChannelStatus(
  channel: any,
  statusText: string | null
): Promise<{ success: boolean; error?: string }> {
  if (!channel || (!channel.isVoiceBased?.() && channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice)) {
    return { success: false, error: 'Target channel is not a voice or stage channel.' };
  }

  // Check bot permissions
  const botMember = channel.guild?.members?.me || channel.guild?.members?.cache?.get(channel.client?.user?.id);
  if (botMember && typeof channel.permissionsFor === 'function') {
    const perms = channel.permissionsFor(botMember);
    // PermissionFlagsBits.SetVoiceChannelStatus = 1n << 40n (0x10000000000)
    const SET_VOICE_CHANNEL_STATUS_FLAG = 1n << 40n;
    const hasPerm = perms?.has(PermissionFlagsBits.Administrator) ||
                    perms?.has(SET_VOICE_CHANNEL_STATUS_FLAG) ||
                    perms?.has(PermissionFlagsBits.ManageChannels);

    if (!hasPerm) {
      return {
        success: false,
        error: 'Bot lacks "Set Voice Channel Status" or "Manage Channels" permission in this channel.'
      };
    }
  }

  const cleanStatus = statusText ? statusText.trim().slice(0, 500) : '';

  try {
    VoiceStatusState.markInFlight(channel.id, true);

    if (typeof channel.setVoiceChannelStatus === 'function') {
      await channel.setVoiceChannelStatus(cleanStatus);
    } else if (channel.client?.rest) {
      await channel.client.rest.put(`/channels/${channel.id}/voice-status`, {
        body: { status: cleanStatus }
      });
    } else {
      return { success: false, error: 'Discord REST client unavailable.' };
    }

    VoiceStatusState.setCurrentStatus(channel.id, cleanStatus);
    VoiceStatusState.recordUpdateTimestamp(channel.id);
    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to update voice channel status via Discord REST API.'
    };
  } finally {
    VoiceStatusState.markInFlight(channel.id, false);
  }
}

/**
 * Helper to count human (non-bot) members in a voice channel.
 */
export function getHumanMemberCount(channel: any): number {
  if (!channel || !channel.members) return 0;
  if (typeof channel.members.filter === 'function') {
    return channel.members.filter((m: any) => !m.user?.bot).size;
  }
  let count = 0;
  const iterable = typeof channel.members.values === 'function' ? channel.members.values() : channel.members;
  for (const m of iterable) {
    if (!m?.user?.bot) count++;
  }
  return count;
}

/**
 * Extract Voice Status config from the module state.
 */
export function getVoiceStatusConfig(context: any, guildId?: string): IVoiceStatusSettings {
  const gId = guildId || process.env.GUILD_ID || 'default_guild';
  const modules = context?.getModulesState ? context.getModulesState(gId) : [];
  const voiceMgr = modules.find((m: any) => m.id === 'voice_manager');
  const raw = voiceMgr?.config?.voiceStatus || {};

  return {
    autoStatusEnabled: raw.autoStatusEnabled !== false,
    channels: Array.isArray(raw.channels) ? raw.channels : []
  };
}

/**
 * Save updated Voice Status config to SQLite via ModuleRegistry context.
 */
export async function saveVoiceStatusConfig(
  context: any,
  guildId: string,
  updated: IVoiceStatusSettings
): Promise<void> {
  const gId = guildId || process.env.GUILD_ID || 'default_guild';
  const modules = context?.getModulesState ? context.getModulesState(gId) : [];
  const voiceMgr = modules.find((m: any) => m.id === 'voice_manager');
  const existingConfig = voiceMgr?.config || {};

  const newConfig = {
    ...existingConfig,
    voiceStatus: {
      autoStatusEnabled: updated.autoStatusEnabled,
      channels: updated.channels
    }
  };

  if (context?.updateModuleConfig) {
    await context.updateModuleConfig('voice_manager', newConfig);
  }
}

/**
 * Apply or reset status when channel becomes empty, respecting debounce & user overrides.
 */
export async function handleEmptyVoiceChannelCheck(
  client: any,
  channel: any,
  targetConfig: IVoiceStatusTarget,
  sourceReason: string = 'channel_empty'
): Promise<boolean> {
  if (!channel || !targetConfig.enabled) return false;

  const humanCount = getHumanMemberCount(channel);
  if (humanCount > 0) {
    // Channel is occupied; do not reset
    return false;
  }

  // Channel is empty! Clear manual override since no one is in it
  VoiceStatusState.setManualOverride(channel.id, false);

  const desiredStatus = targetConfig.defaultStatus;
  const currentStatus = VoiceStatusState.getCurrentStatus(channel.id);

  // If already equal to desired status, no redundant API call needed
  if (currentStatus === desiredStatus) {
    return true;
  }

  // Check cooldown to avoid hammering Discord API on rapid join/leave
  if (VoiceStatusState.isCooldownActive(channel.id, 2500) || VoiceStatusState.isInFlight(channel.id)) {
    VoiceStatusState.setPendingTimer(
      channel.id,
      setTimeout(async () => {
        const recheckHumanCount = getHumanMemberCount(channel);
        if (recheckHumanCount === 0) {
          await setVoiceChannelStatus(channel, desiredStatus);
        }
      }, 3000)
    );
    return true;
  }

  const result = await setVoiceChannelStatus(channel, desiredStatus);
  return result.success;
}

/**
 * voiceStateUpdate event processor
 */
export async function processVoiceStateUpdate(
  client: any,
  oldState: any,
  newState: any,
  context: any
): Promise<void> {
  const guild = newState?.guild || oldState?.guild;
  if (!guild) return;

  const config = getVoiceStatusConfig(context, guild.id);
  if (!config.autoStatusEnabled || config.channels.length === 0) return;

  // 1. Check if user LEFT a voice channel (oldState.channelId)
  if (oldState?.channelId && oldState.channelId !== newState?.channelId) {
    const targetConfig = config.channels.find(c => c.channelId === oldState.channelId && c.enabled);
    if (targetConfig) {
      const channel = oldState.channel || guild.channels.cache.get(oldState.channelId);
      if (channel) {
        // If human members count is now 0, reset to default status!
        const humanCount = getHumanMemberCount(channel);
        if (humanCount === 0) {
          // Debounce briefly (1.5s) to allow for users hopping or reconnecting
          VoiceStatusState.setPendingTimer(
            channel.id,
            setTimeout(async () => {
              const liveChannel = guild.channels.cache.get(channel.id) || await guild.channels.fetch(channel.id).catch(() => null);
              if (liveChannel && getHumanMemberCount(liveChannel) === 0 && !VoiceStatusState.isInFlight(channel.id)) {
                await setVoiceChannelStatus(liveChannel, targetConfig.defaultStatus);
              }
            }, 1500)
          );
        }
      }
    }
  }

  // 2. Check if user JOINED a voice channel (newState.channelId)
  if (newState?.channelId && newState.channelId !== oldState?.channelId) {
    const targetConfig = config.channels.find(c => c.channelId === newState.channelId && c.enabled);
    if (targetConfig) {
      const channel = newState.channel || guild.channels.cache.get(newState.channelId);
      if (channel) {
        // Clear any pending empty reset timer since people are now in the channel
        VoiceStatusState.clearPendingTimer(channel.id);
      }
    }
  }
}

/**
 * Intercept manual Discord voice status changes (VOICE_CHANNEL_STATUS_UPDATE gateway packet)
 */
export function processVoiceChannelStatusUpdate(
  client: any,
  data: { channelId?: string; id?: string; guildId?: string; guild_id?: string; status?: string | null },
  context: any
): void {
  const channelId = data.channelId || data.id;
  const guildId = data.guildId || data.guild_id;
  if (!channelId || !guildId) return;

  const config = getVoiceStatusConfig(context, guildId);
  const targetConfig = config.channels.find(c => c.channelId === channelId && c.enabled);
  if (!targetConfig) return;

  const newStatus = (data.status || '').trim();
  const knownStatus = VoiceStatusState.getCurrentStatus(channelId);

  // If this status change differs from our configured default status or last applied status:
  if (newStatus !== targetConfig.defaultStatus) {
    // A user in the channel manually changed their status!
    // Set manual override flag so the bot respects the user's status while they remain in the channel.
    VoiceStatusState.setManualOverride(channelId, true);
    VoiceStatusState.setCurrentStatus(channelId, newStatus);
  } else {
    // Status is restored to default
    VoiceStatusState.setCurrentStatus(channelId, newStatus);
    VoiceStatusState.setManualOverride(channelId, false);
  }
}

/**
 * Startup sweep across all guilds and configured voice channels.
 * If empty, sets the default idle status immediately.
 */
export async function startupVoiceStatusSweep(client: any, context?: any): Promise<number> {
  if (!client || !client.isReady?.()) return 0;
  VoiceStatusState.setClient(client);

  let updatedCount = 0;

  for (const guild of client.guilds.cache.values()) {
    try {
      const config = getVoiceStatusConfig(context, guild.id);
      if (!config.autoStatusEnabled || config.channels.length === 0) continue;

      for (const target of config.channels) {
        if (!target.enabled) continue;

        const channel = guild.channels.cache.get(target.channelId) || await guild.channels.fetch(target.channelId).catch(() => null);
        if (!channel || (!channel.isVoiceBased?.() && channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice)) continue;

        const humanCount = getHumanMemberCount(channel);
        if (humanCount === 0) {
          // Channel is empty: ensure default status is set
          const ok = await handleEmptyVoiceChannelCheck(client, channel, target, 'startup_sweep');
          if (ok) updatedCount++;
        }
      }
    } catch (err: any) {
      console.warn(`[VoiceStatus] Startup sweep warning in guild ${guild.id}:`, err?.message || err);
    }
  }

  return updatedCount;
}
