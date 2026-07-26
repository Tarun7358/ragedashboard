import { useState, useEffect, useRef } from 'react';
import { useAuth } from './useAuth';
import { WS_BASE, API_BASE } from '../config';

// Interfaces for synchronized resources
export interface DiscordRole {
  id: string;
  name: string;
  color: string;
  position: number;
  permissions: string[];
  membersCount: number;
}

export interface DiscordChannel {
  id: string;
  name: string;
  type: 'text' | 'voice' | 'category' | 'announcement' | 'stage' | 'forum' | 'thread';
  category?: string;
  permissions: string[];
}

export interface DiscordResourceRegistry {
  roles: DiscordRole[];
  channels: DiscordChannel[];
  emojis: { name: string; url: string }[];
  stickers: { name: string; url: string }[];
  lastSyncTime: string;
  memberCount?: number;
  onlineCount?: number;
}

export interface ModuleState {
  id: string;
  name: string;
  status: 'not_configured' | 'config_required' | 'validation_failed' | 'ready' | 'enabled' | 'disabled' | 'error';
  progress: number; // 0 - 100
  errors: string[];
  config: Record<string, any>;
  connectionStatus?: string;
  connectedChannelId?: string | null;
  connectionDuration?: string;
  reconnectAttempts?: number;
  voiceGatewayStatus?: string;
}

// Initial empty/zero configurations representing Zero Operational Defaults
export const INITIAL_MODULES: ModuleState[] = [
  { id: 'security', name: 'Security Guard', status: 'config_required', progress: 0, errors: ['No Quarantine Role selected', 'No alert channel configured', 'No exceptions defined'], config: {} },
  { id: 'moderation', name: 'Moderation Console', status: 'config_required', progress: 0, errors: ['No Log Channel configured', 'No Moderator Roles selected'], config: {} },
  { id: 'welcome-v2', name: 'Welcome System V2', status: 'not_configured', progress: 0, errors: [], config: {} },
  { id: 'tickets', name: 'Ticket Management', status: 'config_required', progress: 0, errors: ['No Support Category specified', 'No Claimed Staff Roles selected'], config: {} },
  { id: 'tickets-v2', name: 'Tickets System V2', status: 'not_configured', progress: 0, errors: [], config: {} },
  { id: 'verification', name: 'Verification Gate', status: 'config_required', progress: 0, errors: ['No Verified Member role selected', 'No Unverified Role selected'], config: {} },
  { id: 'logging', name: 'System Logs Timeline', status: 'config_required', progress: 0, errors: ['No central log channel configured'], config: {} },
  { id: 'backups', name: 'Backup Hub', status: 'config_required', progress: 0, errors: ['No status notification channel configured'], config: {} },
  { id: 'automation', name: 'Automation Studio', status: 'config_required', progress: 0, errors: ['No default Auto Roles configured'], config: {} },
  { id: 'voice', name: 'Voice Presence', status: 'config_required', progress: 0, errors: ['No dedicated voice channel configured'], config: {} },
  { id: 'bot_whitelist', name: 'Bot Whitelist', status: 'not_configured', progress: 0, errors: [], config: {} },
  { id: 'member_whitelist', name: 'Member Whitelist', status: 'not_configured', progress: 0, errors: [], config: {} },
  { id: 'role_whitelist', name: 'Role Whitelist', status: 'not_configured', progress: 0, errors: [], config: {} },
  { id: 'reaction_roles', name: 'Reaction Roles', status: 'not_configured', progress: 100, errors: [], config: {} },
  { id: 'leveling', name: 'Leveling & XP', status: 'not_configured', progress: 100, errors: [], config: {} },
  { id: 'reminders', name: 'Reminder System', status: 'not_configured', progress: 100, errors: [], config: {} },
  { id: 'automod', name: 'AI Automod & AntiLink', status: 'not_configured', progress: 100, errors: [], config: {} },
  { id: 'music', name: 'Music System', status: 'not_configured', progress: 0, errors: [], config: {} },
  { id: 'voice-protection', name: 'Voice Protection', status: 'not_configured', progress: 100, errors: [], config: {} },
  { id: 'discord-dashboard', name: 'Discord Dashboard', status: 'config_required', progress: 0, errors: ['No target channel configured'], config: {} },
  { id: 'join_role_guard', name: 'Join Role Guard', status: 'enabled', progress: 100, errors: [], config: {} },
  { id: 'social_updates', name: 'Social Updates', status: 'not_configured', progress: 100, errors: [], config: {} },
  { id: 'join_to_create', name: 'Join To Create', status: 'not_configured', progress: 0, errors: [], config: {} },
  { id: 'giveaway', name: 'Giveaways', status: 'not_configured', progress: 100, errors: [], config: {} },
  { id: 'announcements', name: 'Announcements', status: 'not_configured', progress: 100, errors: [], config: {} },
  { id: 'voice_manager', name: 'Voice Manager', status: 'not_configured', progress: 100, errors: [], config: {} },
  { id: 'bulk_ops', name: 'Bulk Operations', status: 'not_configured', progress: 100, errors: [], config: {} },
  { id: 'diagnostics', name: 'System Diagnostics', status: 'not_configured', progress: 100, errors: [], config: {} },
  { id: 'analytics', name: 'Analytics Tracker', status: 'not_configured', progress: 100, errors: [], config: {} },
  { id: 'audit', name: 'Audit Timeline', status: 'not_configured', progress: 100, errors: [], config: {} },
  { id: 'payment', name: 'Enterprise Payment QR', status: 'not_configured', progress: 100, errors: [], config: {} }
];

export function useDiscordSync() {
  const { token, activeGuildId: guildId } = useAuth();

  const [registry, setRegistry] = useState<DiscordResourceRegistry>({
    roles: [],
    channels: [],
    emojis: [],
    stickers: [],
    lastSyncTime: 'Just now'
  });

  const [modules, setModules] = useState<ModuleState[]>(INITIAL_MODULES);
  const [syncLogs, setSyncLogs] = useState<{ time: string; msg: string; type: 'info' | 'warn' | 'success' }[]>([]);
  const [globalSettings, setGlobalSettings] = useState<Record<string, any>>({});
  const [musicPlayerState, setMusicPlayerState] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Re-fetch and reconnect WebSocket whenever token or guild ID changes
  useEffect(() => {
    // Close any existing WS connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (!token) {
      // Logged out — reset to defaults
      setModules(INITIAL_MODULES);
      setRegistry({ roles: [], channels: [], emojis: [], stickers: [], lastSyncTime: 'Just now' });
      setSyncLogs([]);
      setGlobalSettings({});
      setMusicPlayerState(null);
      return;
    }

    // Decode token to check if user is a guild_manager without a guildId
    let isGuildManagerWithoutGuild = false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.role === 'guild_manager' && !guildId) {
        isGuildManagerWithoutGuild = true;
      }
    } catch {}

    if (isGuildManagerWithoutGuild) {
      // No active guild selected yet — reset to initial empty states and do not fetch/connect WS
      setModules(INITIAL_MODULES);
      setRegistry({ roles: [], channels: [], emojis: [], stickers: [], lastSyncTime: 'Just now' });
      setSyncLogs([]);
      setGlobalSettings({});
      setMusicPlayerState(null);
      return;
    }

    // Fetch initial HTTP state
    const fetchInitialState = async () => {
      try {
        const headers: Record<string, string> = {
          'Authorization': `Bearer ${token}`
        };
        if (guildId) {
          headers['X-Guild-Id'] = guildId;
        }
        const res = await fetch(`${API_BASE}/api/state`, { headers });
        if (res.ok) {
          const data = await res.json();
          setModules(data.modules);
          setRegistry(data.registry);
          setSyncLogs(data.syncLogs);
          setGlobalSettings(data.globalSettings || {});
          fetch(`${API_BASE}/api/modules/music/player`, { headers })
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d) setMusicPlayerState(d); })
            .catch(() => {});
        }
      } catch (err) {
        console.error('Failed to load initial state from API server:', err);
      }
    };

    fetchInitialState();

    // H-8 / L-6 FIX: Track cleanup state and reconnect timer to prevent
    // stale-closure duplicate WebSocket connections.
    let cleanedUp = false;
    const reconnectTimer = { current: null as ReturnType<typeof setTimeout> | null };

    // Setup live WebSocket channel
    const connectWS = () => {
      const currentToken = localStorage.getItem('cn_token');
      const currentGuild = localStorage.getItem('cn_active_guild');
      if (!currentToken || cleanedUp) return;

      // M-1: Use VITE_WS_URL env var instead of hardcoded localhost
      const wsUrl = `${WS_BASE}?token=${currentToken}${currentGuild ? `&guildId=${currentGuild}` : ''}`;
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Only process updates that match our selected guild, or generic updates if no guild selected
          if (data.guildId && currentGuild && data.guildId !== currentGuild) {
            return;
          }

          if (data.type === 'INIT') {
            setModules(data.modules);
            setRegistry(data.registry);
            setSyncLogs(data.syncLogs);
            if (data.globalSettings) setGlobalSettings(data.globalSettings);
          } else if (data.type === 'STATE_UPDATE') {
            setModules(data.modules);
            setRegistry(data.registry);
          } else if (data.type === 'SYNC_LOG') {
            setSyncLogs(prev => [data.log, ...prev].slice(0, 100));
          } else if (data.type === 'GLOBAL_SETTINGS_UPDATE') {
            setGlobalSettings(data.settings);
          } else if (data.type === 'MUSIC_STATE_UPDATE') {
            setMusicPlayerState(data.state);
          }
        } catch (e) {
          console.error('WebSocket parsing error:', e);
        }
      };

      // H-8 FIX: Use a cleanup flag and reconnect timer ref to prevent stale closure
      // duplicate connections when the effect re-runs due to token/guildId changes.
      socket.onclose = () => {
        if (!cleanedUp && localStorage.getItem('cn_token')) {
          reconnectTimer.current = window.setTimeout(connectWS, 3000);
        }
      };

      socket.onerror = (err) => {
        console.error('WebSocket error:', err);
      };
    };

    connectWS();

    return () => {
      // L-6 FIX: Cancel pending reconnect timer before closing socket
      // to prevent the onclose handler scheduling another reconnect after cleanup.
      cleanedUp = true;
      if (reconnectTimer.current !== null) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    };
  }, [token, guildId]);


  const addSyncLog = (msg: string, type: 'info' | 'warn' | 'success' = 'info') => {
    // Add client-side visual log immediately, or rely on WS
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setSyncLogs(prev => [{ time, msg, type }, ...prev]);
  };

  const refreshSync = async () => {
    try {
      const token = localStorage.getItem('cn_token');
      const currentGuild = localStorage.getItem('cn_active_guild');
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`
      };
      if (currentGuild) {
        headers['X-Guild-Id'] = currentGuild;
      }
      // M-1: Use VITE_API_URL env var
      await fetch(`${API_BASE}/api/sync/refresh`, { 
        method: 'POST',
        headers
      });
    } catch (err) {
      console.error('Failed to trigger sync refresh:', err);
      addSyncLog('Sync Refresh failed: API server unreachable.', 'warn');
    }
  };

  const updateModuleConfig = async (moduleId: string, newConfig: Record<string, any>, enabledOverride?: boolean) => {
    const previousModules = [...modules];

    // Optimistically update modules in-memory
    setModules(prev => prev.map(m => {
      if (m.id === moduleId) {
        if (enabledOverride !== undefined) {
          return {
            ...m,
            // M-6 FIX: Disabled modules should show 'disabled', not 'not_configured'
            status: enabledOverride ? 'enabled' : 'disabled'
          };
        } else {
          return {
            ...m,
            config: { ...m.config, ...newConfig }
          };
        }
      }
      return m;
    }));

    try {
      const token = localStorage.getItem('cn_token');
      const currentGuild = localStorage.getItem('cn_active_guild');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };
      if (currentGuild) headers['X-Guild-Id'] = currentGuild;

      let res;
      // If toggling active status
      if (enabledOverride !== undefined) {
        // M-1: Use VITE_API_URL env var
        res = await fetch(`${API_BASE}/api/modules/${moduleId}/toggle`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ enabledOverride })
        });
      } else {
        // Just save config fields
        res = await fetch(`${API_BASE}/api/modules/${moduleId}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(newConfig)
        });
      }

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }
    } catch (err) {
      console.error(`Failed to update config for module ${moduleId}:`, err);
      addSyncLog(`Update failed for ${moduleId}: API server offline.`, 'warn');
      // Rollback to previous state on failure
      setModules(previousModules);
    }
  };

  // C-4 FIX: simulateDiscordAction removed — the backend /api/simulate endpoint
  // was deleted (it was a dev tool using fake IDs). The function is preserved as
  // a no-op stub so any lingering call sites don't throw a runtime error.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const simulateDiscordAction = async (_actionType: string): Promise<void> => {
    console.warn('[simulateDiscordAction] This endpoint has been removed. No action taken.');
  };

  // Listen for desktop media keys from Electron launcher
  useEffect(() => {
    const launcher = (window as any).launcher;
    if (launcher && typeof launcher.onMediaKey === 'function') {
      launcher.onMediaKey((key: string) => {
        const token = localStorage.getItem('cn_token');
        const currentGuild = localStorage.getItem('cn_active_guild');
        if (!token) return;

        let action = '';
        if (key === 'play-pause') {
          action = 'pause-toggle';
        } else if (key === 'next') {
          action = 'skip';
        } else if (key === 'prev') {
          action = 'prev';
        } else if (key === 'stop') {
          action = 'stop';
        }

        if (action) {
          fetch(`${API_BASE}/api/modules/music/action`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              'X-Guild-Id': currentGuild || ''
            },
            body: JSON.stringify({ action })
          }).catch(err => console.error('Launcher media key action failed:', err));
        }
      });
    }
  }, []);

  return {
    registry,
    modules,
    syncLogs,
    globalSettings,
    refreshSync,
    updateModuleConfig,
    simulateDiscordAction,
    addSyncLog,
    musicPlayerState
  };
}
