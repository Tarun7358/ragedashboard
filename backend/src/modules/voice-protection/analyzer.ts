import { EndBehaviorType } from '@discordjs/voice';
import { calculateLoudness } from './utils.js';
import { executePunishment } from './punishment.js';

interface UserMonitorState {
  userId: string;
  guildId: string;
  channelId: string;
  audioBuffer: Buffer;
  rollingWindow: number[];
  speakingStartTime: number | null;
  lastActiveTime: number;
}

const activeMonitors: Map<string, Map<string, UserMonitorState>> = new Map();
const activeSubscriptions: Map<string, Map<string, any>> = new Map();
let analysisInterval: NodeJS.Timeout | null = null;

export function startMonitoringUser(
  connection: any,
  guildId: string,
  userId: string,
  channelId: string,
  config: any,
  context: any
) {
  let guildMonitors = activeMonitors.get(guildId);
  if (!guildMonitors) {
    guildMonitors = new Map();
    activeMonitors.set(guildId, guildMonitors);
  }

  let guildSubs = activeSubscriptions.get(guildId);
  if (!guildSubs) {
    guildSubs = new Map();
    activeSubscriptions.set(guildId, guildSubs);
  }

  // Already monitoring this user in the guild
  if (guildSubs.has(userId)) return;

  try {
    const receiver = connection.receiver;
    const stream = receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 100
      }
    });

    const monitorState: UserMonitorState = {
      userId,
      guildId,
      channelId,
      audioBuffer: Buffer.alloc(0),
      rollingWindow: [],
      speakingStartTime: null,
      lastActiveTime: Date.now()
    };

    guildMonitors.set(userId, monitorState);
    guildSubs.set(userId, stream);

    stream.on('data', (chunk: Buffer) => {
      monitorState.audioBuffer = Buffer.concat([monitorState.audioBuffer, chunk]);
      monitorState.lastActiveTime = Date.now();
    });

    stream.on('error', (err: any) => {
      console.error(`[Voice Protection Analyzer] Stream error for user ${userId}:`, err);
      stopMonitoringUser(guildId, userId);
    });

  } catch (err) {
    console.error(`[Voice Protection Analyzer] Failed to subscribe to user ${userId}:`, err);
  }
}

export function stopMonitoringUser(guildId: string, userId: string) {
  const guildMonitors = activeMonitors.get(guildId);
  if (guildMonitors) {
    guildMonitors.delete(userId);
  }

  const guildSubs = activeSubscriptions.get(guildId);
  if (guildSubs) {
    const stream = guildSubs.get(userId);
    if (stream) {
      try {
        stream.destroy();
      } catch (e) {}
      guildSubs.delete(userId);
    }
  }
}

export function stopMonitoringAllInGuild(guildId: string) {
  const guildSubs = activeSubscriptions.get(guildId);
  if (guildSubs) {
    for (const userId of guildSubs.keys()) {
      stopMonitoringUser(guildId, userId);
    }
    activeSubscriptions.delete(guildId);
  }
  activeMonitors.delete(guildId);
}

export function startAnalysisLoop(client: any, getModulesState: (guildId: string) => any, context: any) {
  if (analysisInterval) return;

  analysisInterval = setInterval(async () => {
    for (const [guildId, guildMonitors] of activeMonitors.entries()) {
      if (guildMonitors.size === 0) continue;

      const modules = getModulesState(guildId);
      const vpMod = modules.find((m: any) => m.id === 'voice-protection');
      if (!vpMod || !vpMod.config?.enabled) {
        stopMonitoringAllInGuild(guildId);
        continue;
      }

      const config = vpMod.config;
      const threshold = config.threshold ?? 85;
      const duration = config.duration ?? 3;
      const maxWindow = config.rollingAverageWindow ?? 20;

      for (const [userId, state] of guildMonitors.entries()) {
        const idleTime = Date.now() - state.lastActiveTime;
        if (idleTime > 2000) {
          state.audioBuffer = Buffer.alloc(0);
          state.speakingStartTime = null;
          state.rollingWindow = [];
          continue;
        }

        const { rms, peak } = calculateLoudness(state.audioBuffer);
        state.audioBuffer = Buffer.alloc(0);

        state.rollingWindow.push(rms);
        if (state.rollingWindow.length > maxWindow) {
          state.rollingWindow.shift();
        }

        const avgRms = state.rollingWindow.reduce((a, b) => a + b, 0) / state.rollingWindow.length;

        if (avgRms > threshold) {
          if (state.speakingStartTime === null) {
            state.speakingStartTime = Date.now();
          } else {
            const elapsed = (Date.now() - state.speakingStartTime) / 1000;
            if (elapsed >= duration) {
              await executePunishment(
                client,
                guildId,
                userId,
                state.channelId,
                Math.round(avgRms),
                peak,
                config,
                context
              );
              state.speakingStartTime = null;
              state.rollingWindow = [];
            }
          }
        } else {
          state.speakingStartTime = null;
        }
      }
    }
  }, 150);
}

export function getCurrentlyMonitoredUsers(guildId: string): Array<{ userId: string; channelId: string }> {
  const guildMonitors = activeMonitors.get(guildId);
  if (!guildMonitors) return [];
  const list = [];
  for (const [userId, state] of guildMonitors.entries()) {
    list.push({ userId, channelId: state.channelId });
  }
  return list;
}
