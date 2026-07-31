import { API_BASE, wsUrl } from '../config';
import { logger } from '../services/logger';
import { useState, useEffect, useRef } from 'react';


export interface ActivityEvent {
  id: string;
  timestamp: string;
  type: 'info' | 'success' | 'warning' | 'danger' | 'purple';
  category: 'Security' | 'Moderation' | 'Community' | 'Backup' | 'System' | 'Ticket';
  message: string;
  meta?: any;
}

export interface NotificationItem {
  id: string;
  title: string;
  time: string;
  type: 'info' | 'success' | 'warning' | 'danger';
  read: boolean;
  link: string;
}



export function useActivityFeed() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('cn_token'));
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [latency, setLatency] = useState(0);
  const [uptime, setUptime] = useState('Offline');
  const [isLive, setIsLive] = useState(true);

  // Poll for token changes (login/logout) since localStorage doesn't fire events in-tab
  useEffect(() => {
    const interval = setInterval(() => {
      const current = localStorage.getItem('cn_token');
      setToken(prev => (prev !== current ? current : prev));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const getCategory = (msg: string): ActivityEvent['category'] => {
    const lower = msg.toLowerCase();
    if (lower.includes('quarantine') || lower.includes('raid') || lower.includes('security') || lower.includes('protection')) return 'Security';
    if (lower.includes('ban') || lower.includes('kick') || lower.includes('warn') || lower.includes('timeout') || lower.includes('automod')) return 'Moderation';
    if (lower.includes('ticket')) return 'Ticket';
    if (lower.includes('backup')) return 'Backup';
    if (lower.includes('welcome') || lower.includes('join') || lower.includes('leave')) return 'Community';
    return 'System';
  };

  const getType = (type: string, msg: string): ActivityEvent['type'] => {
    if (type === 'warn') {
      return msg.toLowerCase().includes('quarantine') || msg.toLowerCase().includes('deleted') ? 'danger' : 'warning';
    }
    return type as any;
  };

  // Fetch initial logs and connect live WebSocket channel
  useEffect(() => {
    if (!token) {
      setEvents([]);
      setNotifications([]);
      setLatency(0);
      setUptime('Offline');
      return;
    }

    const fetchInitialLogs = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/state`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.syncLogs) {
            const mappedEvents: ActivityEvent[] = data.syncLogs.map((log: any, index: number) => ({
              id: `init-log-${index}-${log.time}`,
              timestamp: log.time,
              type: getType(log.type, log.msg),
              category: getCategory(log.msg),
              message: log.msg
            }));
            setEvents(mappedEvents);
          }
          if (data.latency !== undefined) setLatency(data.latency);
          if (data.uptime !== undefined) setUptime(data.uptime);
        }
      } catch (err) {
        console.error('Failed to load initial logs from API server:', err);
      }
    };

    fetchInitialLogs();

    let cleanedUp = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let socket: WebSocket | null = null;

    const connectWS = () => {
      if (cleanedUp || !token) return;
      const url = wsUrl({ token });
      socket = new WebSocket(url);

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'INIT') {
            if (data.syncLogs) {
              const mappedEvents: ActivityEvent[] = data.syncLogs.map((log: any, index: number) => ({
                id: `init-ws-${index}-${log.time}`,
                timestamp: log.time,
                type: getType(log.type, log.msg),
                category: getCategory(log.msg),
                message: log.msg
              }));
              setEvents(mappedEvents);
            }
            if (data.latency !== undefined) setLatency(data.latency);
            if (data.uptime !== undefined) setUptime(data.uptime);
          } else if (data.type === 'METRICS_UPDATE') {
            setLatency(data.latency);
            setUptime(data.uptime);
          } else if (data.type === 'SYNC_LOG') {
            const log = data.log;
            const newEvent: ActivityEvent = {
              id: `ev-ws-${Date.now()}-${Math.random()}`,
              timestamp: log.time,
              type: getType(log.type, log.msg),
              category: getCategory(log.msg),
              message: log.msg
            };
            setEvents(prev => [newEvent, ...prev].slice(0, 50));

            // Trigger live notification for warning/danger events
            const type = getType(log.type, log.msg);
            if (type === 'danger' || type === 'warning') {
              const newNotif: NotificationItem = {
                id: `notif-${Date.now()}`,
                title: log.msg,
                time: 'Just now',
                type: type === 'danger' ? 'danger' : 'warning',
                read: false,
                link: getCategory(log.msg).toLowerCase() === 'security' ? 'security' : 'logs',
              };
              setNotifications(prev => [newNotif, ...prev].slice(0, 15));
            }
          }
        } catch (err) {
          logger.error('Activity feed websocket parse error', { err }, 'websocket');
        }
      };

      socket.onclose = () => {
        if (!cleanedUp && localStorage.getItem('cn_token')) {
          reconnectTimer = setTimeout(connectWS, 3000);
        }
      };

      socket.onerror = (err) => {
        logger.error('Activity feed websocket error', { err }, 'websocket');
      };
    };

    connectWS();

    return () => {
      cleanedUp = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) socket.close();
    };
  }, [token]);


  const markAllNotificationsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  const pushManualEvent = (message: string, type: ActivityEvent['type'] = 'info', category: ActivityEvent['category'] = 'System') => {
    const now = new Date();
    const manualEvent: ActivityEvent = {
      id: `ev-manual-${Date.now()}`,
      timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      type,
      category,
      message
    };
    setEvents(prev => [manualEvent, ...prev]);

    // Also push a notification
    const typeMap: Record<'info' | 'success' | 'warning' | 'danger' | 'purple', 'info' | 'success' | 'warning' | 'danger'> = {
      info: 'info',
      success: 'success',
      warning: 'warning',
      danger: 'danger',
      purple: 'info',
    };
    const newNotif: NotificationItem = {
      id: `notif-man-${Date.now()}`,
      title: message,
      time: 'Just now',
      type: typeMap[type],
      read: false,
      link: category.toLowerCase() === 'security' ? 'security' : 'logs',
    };
    setNotifications(prev => [newNotif, ...prev]);
  };

  return {
    events,
    notifications,
    latency,
    uptime,
    isLive,
    setIsLive,
    markAllNotificationsRead,
    clearNotifications,
    pushManualEvent
  };
}
