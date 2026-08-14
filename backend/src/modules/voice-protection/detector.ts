import { joinVoiceChannel, getVoiceConnection } from '@discordjs/voice';
import { startMonitoringUser, stopMonitoringUser, stopMonitoringAllInGuild } from './analyzer.js';
import { executePunishment } from './punishment.js';

const joinHistory: Map<string, number[]> = new Map();
const muteHistory: Map<string, number[]> = new Map();

export async function updateVoiceChannelConnection(guild: any, config: any, context: any) {
  const guildId = guild.id;
  if (!config.enabled) {
    const connection = getVoiceConnection(guildId);
    if (connection) {
      connection.destroy();
      stopMonitoringAllInGuild(guildId);
      if (context.logSyncEvent) {
        context.logSyncEvent(`[Voice Protection] Disconnected from voice channel (disabled).`, 'info');
      }
    }
    return;
  }

  // Get all voice-based channels in the guild
  const voiceChannels = guild.channels.cache.filter((c: any) => c.isVoiceBased());
  
  // Filter out channels that are ignored
  const monitoredChannels = voiceChannels.filter((c: any) => !config.ignoredChannels?.includes(c.id));

  let bestChannel = null;
  let maxHumans = 0;
  let isManualOverride = false;

  if (config.currentVoiceChannelId) {
    const targetChannel = guild.channels.cache.get(config.currentVoiceChannelId);
    if (targetChannel && targetChannel.isVoiceBased()) {
      bestChannel = targetChannel;
      maxHumans = targetChannel.members.filter((m: any) => !m.user.bot && !m.voice.serverMute).size;
      isManualOverride = true;
    }
  }

  if (!bestChannel) {
    for (const channel of monitoredChannels.values()) {
      // Count connected human members (non-bots) who are not server-muted
      const humans = channel.members.filter((m: any) => !m.user.bot && !m.voice.serverMute).size;
      if (humans > maxHumans) {
        maxHumans = humans;
        bestChannel = channel;
      }
    }
  }

  const currentConnection = getVoiceConnection(guildId);

  // If there are no active human members in any monitored channel (and no manual override)
  if (maxHumans === 0 && !isManualOverride) {
    if (currentConnection) {
      // Check if connection is shared with voice 24/7 presence
      const modules = context.getModulesState ? context.getModulesState() : [];
      const voiceModule = modules.find((m: any) => m.id === 'voice');
      const isVoicePresence = voiceModule?.status === 'enabled' && voiceModule.config?.channelId === currentConnection.joinConfig.channelId;

      if (!isVoicePresence) {
        currentConnection.destroy();
        stopMonitoringAllInGuild(guildId);
        if (context.logSyncEvent) {
          context.logSyncEvent(`[Voice Protection] Disconnected from voice channel (no active members).`, 'info');
        }
      }
    }
    return;
  }

  if (bestChannel) {
    if (!currentConnection) {
      // Connect to the channel
      const permissions = bestChannel.permissionsFor(guild.members.me);
      if (!permissions?.has('ViewChannel') || !permissions?.has('Connect') || !permissions?.has('MuteMembers')) {
        if (context.logSyncEvent) {
          context.logSyncEvent(
            `[Voice Protection] Missing ViewChannel, Connect, or MuteMembers permissions in channel #${bestChannel.name}. Monitoring suspended.`,
            'error'
          );
        }
        return;
      }

      try {
        const connection = joinVoiceChannel({
          channelId: bestChannel.id,
          guildId: guild.id,
          adapterCreator: guild.voiceAdapterCreator,
          selfDeaf: false, // Deaf must be false to hear speaking streams
          selfMute: true   // Mute true as the bot does not need to stream audio
        });

        if (context.logSyncEvent) {
          context.logSyncEvent(
            `[Voice Protection] Connected to voice channel #${bestChannel.name} to protect ${maxHumans} member(s).`,
            'success'
          );
        }

        // Monitor existing users
        for (const member of bestChannel.members.values()) {
          if (!member.user.bot && !member.voice.serverMute) {
            startMonitoringUser(connection, guildId, member.id, bestChannel.id, config, context);
          }
        }
      } catch (err) {
        console.error(`[Voice Protection] Failed to join voice channel #${bestChannel.name}:`, err);
      }
    } else {
      // Bot is connected. Should it switch?
      if (currentConnection.joinConfig.channelId !== bestChannel.id) {
        // If bestChannel has more humans than current connection channel, switch!
        const currentChannel = guild.channels.cache.get(currentConnection.joinConfig.channelId);
        const isCurrentChannelIgnored = config.ignoredChannels?.includes(currentConnection.joinConfig.channelId);
        const currentHumans = (currentChannel && !isCurrentChannelIgnored)
          ? currentChannel.members.filter((m: any) => !m.user.bot && !m.voice.serverMute).size
          : 0;

        if (isManualOverride || maxHumans > currentHumans) {
          const permissions = bestChannel.permissionsFor(guild.members.me);
          if (!permissions?.has('ViewChannel') || !permissions?.has('Connect') || !permissions?.has('MuteMembers')) {
            return;
          }

          try {
            const connection = joinVoiceChannel({
              channelId: bestChannel.id,
              guildId: guild.id,
              adapterCreator: guild.voiceAdapterCreator,
              selfDeaf: false,
              selfMute: true
            });

            if (context.logSyncEvent) {
              context.logSyncEvent(
                `[Voice Protection] Balanced connection. Switched to channel #${bestChannel.name} with ${maxHumans} active members.`,
                'info'
              );
            }

            // Clean up old subscriptions
            stopMonitoringAllInGuild(guildId);

            // Monitor new channel users
            for (const member of bestChannel.members.values()) {
              if (!member.user.bot && !member.voice.serverMute) {
                startMonitoringUser(connection, guildId, member.id, bestChannel.id, config, context);
              }
            }
          } catch (err) {
            console.error(`[Voice Protection] Failed to switch voice channel:`, err);
          }
        }
      } else {
        // Already in the correct channel, verify we are monitoring all current members
        for (const member of bestChannel.members.values()) {
          if (!member.user.bot && !member.voice.serverMute) {
            startMonitoringUser(currentConnection, guildId, member.id, bestChannel.id, config, context);
          }
        }
      }
    }
  }
}

export async function handleVoiceStateUpdate(
  client: any,
  oldState: any,
  newState: any,
  config: any,
  context: any
) {
  const guild = newState.guild || oldState.guild;
  if (!guild) return;

  const guildId = guild.id;
  if (!config.enabled) return;

  const memberId = newState.id;

  // 1. Channel Hopping Detection
  if (newState.channelId && oldState.channelId !== newState.channelId) {
    const now = Date.now();
    let history = joinHistory.get(memberId) || [];
    history = history.filter(t => now - t < 10000); // 10s window
    history.push(now);
    joinHistory.set(memberId, history);

    if (history.length > 3) {
      await executePunishment(
        client,
        guildId,
        memberId,
        newState.channelId,
        99,
        100,
        config,
        context,
        'Voice Channel Hopping'
      );
      return;
    }
  }

  // 2. Mute/Unmute toggle spam detection
  if (oldState.selfMute !== newState.selfMute) {
    const now = Date.now();
    let history = muteHistory.get(memberId) || [];
    history = history.filter(t => now - t < 10000); // 10s window
    history.push(now);
    muteHistory.set(memberId, history);

    if (history.length > 5) {
      await executePunishment(
        client,
        guildId,
        memberId,
        newState.channelId || oldState.channelId || '',
        99,
        100,
        config,
        context,
        'Rapid Mute Toggle Spam'
      );
      return;
    }
  }

  // Run channel load balancer
  await updateVoiceChannelConnection(guild, config, context);

  // If connected to a channel, update subscriptions for user leaving/joining that specific channel
  const connection = getVoiceConnection(guildId);
  if (connection) {
    const currentChannelId = connection.joinConfig.channelId;
    const memberId = newState.id;

    // User left our monitored channel
    if (oldState.channelId === currentChannelId && newState.channelId !== currentChannelId) {
      stopMonitoringUser(guildId, memberId);
    }

    // User joined our monitored channel
    if (newState.channelId === currentChannelId && oldState.channelId !== currentChannelId) {
      const member = newState.member;
      if (member && !member.user.bot && !newState.serverMute) {
        startMonitoringUser(connection, guildId, memberId, currentChannelId as string, config, context);
      }
    }

    // User was server muted / unmuted
    if (newState.channelId === currentChannelId) {
      if (newState.serverMute) {
        stopMonitoringUser(guildId, memberId);
      } else {
        const member = newState.member;
        if (member && !member.user.bot) {
          startMonitoringUser(connection, guildId, memberId, currentChannelId as string, config, context);
        }
      }
    }
  }
}
