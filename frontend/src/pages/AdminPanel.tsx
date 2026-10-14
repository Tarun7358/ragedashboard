import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Shield, Server, Activity, AlertTriangle, CheckCircle, XCircle, RefreshCw,
  Terminal, Zap, Users, Lock, Send, Trash2, ChevronDown,
  ChevronRight, Globe, Cpu, Database, Clock, ShieldAlert, ShieldCheck,
  Radio, Crown, Power, Eye, Play, Pause, Search, Sliders, ExternalLink
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { API_BASE } from '../config';

const API = API_BASE;
const OWNER_ID = '830993126301630485';

interface GuildData {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
  enabledModules: number;
  errorModules: number;
  totalModules: number;
  approvalStatus: string;
  securityScore: number;
}

interface SystemData {
  botOnline: boolean;
  latencyMs: number;
  uptime: string;
  memoryMb: number;
  totalMemMb: number;
  guildCount: number;
  pid: number;
  nodeVersion: string;
  startedAt: string;
}

interface LogEntry {
  id?: string;
  guildId?: string;
  guildName?: string;
  action?: string;
  type?: string;
  targetId?: string;
  executorId?: string;
  executorTag?: string;
  reason?: string;
  timestamp?: number | string;
  details?: string;
  message?: string;
}

interface AdminOverview {
  guilds: GuildData[];
  system: SystemData;
  recentLogs: LogEntry[];
}

function securityColor(score: number): string {
  if (score >= 80) return '#10B981';
  if (score >= 60) return '#F59E0B';
  return '#EF4444';
}

function securityBadgeBg(score: number): string {
  if (score >= 80) return 'rgba(16, 185, 129, 0.12)';
  if (score >= 60) return 'rgba(245, 158, 11, 0.12)';
  return 'rgba(239, 68, 68, 0.12)';
}

function securityLabel(score: number): string {
  if (score >= 80) return 'OPTIMAL';
  if (score >= 60) return 'MODERATE';
  return 'VULNERABLE';
}

function formatTimestamp(ts: number | string | undefined): string {
  if (!ts) return '--:--:--';
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  return d.toLocaleTimeString('en-GB', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function getLogColor(type?: string): string {
  const t = (type || 'INFO').toLowerCase();
  if (t.includes('danger') || t.includes('crit') || t.includes('err') || t.includes('kick') || t.includes('ban')) {
    return '#EF4444';
  }
  if (t.includes('warn')) return '#F59E0B';
  if (t.includes('success')) return '#10B981';
  return '#60A5FA';
}

// Circular SVG Health Ring Component
function ScoreRing({ score, size = 68 }: { score: number; size?: number }) {
  const stroke = 5;
  const radius = (size - stroke * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(100, Math.max(0, score));
  const strokeDashoffset = circumference - (progress / 100) * circumference;
  const color = securityColor(score);

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#27272A"
          strokeWidth={stroke}
          fill="transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{ fontSize: size * 0.26, fontWeight: 800, color: '#FAFAFA', fontFamily: 'var(--font-mono)' }}>
          {score}%
        </span>
      </div>
    </div>
  );
}

// Sparkline SVG for visual trends
function Sparkline({ values, color = '#10B981' }: { values: number[]; color?: string }) {
  if (!values || values.length < 2) {
    return <div style={{ width: 64, height: 20 }} />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values, min + 1);
  const width = 64;
  const height = 20;
  const points = values.map((val, idx) => {
    const x = (idx / (values.length - 1)) * width;
    const y = height - ((val - min) / (max - min)) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

// Individual Server Real-Time Log Console
function GuildConsole({ guild, token }: { guild: GuildData; token: string }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [filterLevel, setFilterLevel] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);

  const fetchGuildLogs = useCallback(async () => {
    if (isPaused) return;
    try {
      setLoading(true);
      const res = await fetch(`${API}/api/admin/guild/${guild.id}/logs?limit=100`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-guild-id': guild.id
        }
      });
      if (res.ok) {
        const data = await res.json();
        const combined: LogEntry[] = [
          ...(data.logs || []).map((l: any) => ({ ...l, type: l.type || 'info' })),
          ...(data.syncLogs || []).map((l: any) => ({ ...l, type: l.type || 'sync' }))
        ].sort((a, b) => {
          const tA = new Date(a.timestamp || 0).getTime();
          const tB = new Date(b.timestamp || 0).getTime();
          return tA - tB;
        });
        setLogs(combined);
      }
    } catch {
      // ignore poll error
    } finally {
      setLoading(false);
    }
  }, [guild.id, token, isPaused]);

  useEffect(() => {
    fetchGuildLogs();
    const interval = setInterval(fetchGuildLogs, 6000);
    return () => clearInterval(interval);
  }, [fetchGuildLogs]);

  useEffect(() => {
    if (!isPaused && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isPaused]);

  const filteredLogs = logs.filter(l => {
    const txt = `${l.action || ''} ${l.message || ''} ${l.executorTag || ''} ${l.details || ''} ${l.reason || ''}`.toLowerCase();
    if (searchTerm && !txt.includes(searchTerm.toLowerCase())) return false;
    if (filterLevel === 'CRITICAL') {
      return (l.type || '').toLowerCase().includes('danger') || (l.type || '').toLowerCase().includes('crit');
    }
    if (filterLevel === 'WARN') {
      return (l.type || '').toLowerCase().includes('warn');
    }
    if (filterLevel === 'SYNC') {
      return (l.type || '').toLowerCase().includes('sync');
    }
    return true;
  });

  return (
    <div style={{
      backgroundColor: '#09090B',
      borderRadius: '8px',
      border: '1px solid #27272A',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'var(--font-mono)'
    }}>
      {/* Console Top Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        backgroundColor: '#18181B',
        borderBottom: '1px solid #27272A',
        gap: '8px',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '5px' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF4444', display: 'inline-block' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#F59E0B', display: 'inline-block' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
          </div>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#A1A1AA', letterSpacing: '0.04em' }}>
            {guild.name.toUpperCase()} [{guild.id}] — REALTIME AUDIT STREAM
          </span>
          {loading && <RefreshCw size={11} className="spin" color="#71717A" />}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Filter Pills */}
          {(['ALL', 'CRITICAL', 'WARN', 'SYNC'] as const).map(flt => (
            <button
              key={flt}
              onClick={() => setFilterLevel(flt)}
              style={{
                padding: '2px 7px',
                fontSize: '10px',
                fontWeight: 700,
                borderRadius: '4px',
                background: filterLevel === flt ? '#27272A' : 'transparent',
                color: filterLevel === flt ? '#FAFAFA' : '#71717A',
                border: '1px solid',
                borderColor: filterLevel === flt ? '#3F3F46' : 'transparent',
                cursor: 'pointer'
              }}
            >
              {flt}
            </button>
          ))}

          {/* Quick Filter Input */}
          <input
            type="text"
            placeholder="Search stream..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              padding: '2px 6px',
              fontSize: '10px',
              backgroundColor: '#09090B',
              border: '1px solid #27272A',
              borderRadius: '4px',
              color: '#FAFAFA',
              width: '110px'
            }}
          />

          {/* Pause / Play auto-poll */}
          <button
            onClick={() => setIsPaused(!isPaused)}
            title={isPaused ? 'Resume live feed' : 'Pause feed'}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '3px 6px',
              borderRadius: '4px',
              background: isPaused ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
              color: isPaused ? '#EF4444' : '#10B981',
              border: '1px solid',
              borderColor: isPaused ? 'rgba(239,68,68,0.4)' : 'rgba(16,185,129,0.4)',
              fontSize: '10px',
              cursor: 'pointer',
              gap: '4px'
            }}
          >
            {isPaused ? <Play size={10} /> : <Pause size={10} />}
            <span>{isPaused ? 'PAUSED' : 'LIVE'}</span>
          </button>
        </div>
      </div>

      {/* Console Content Window */}
      <div style={{
        height: '220px',
        overflowY: 'auto',
        padding: '10px 12px',
        backgroundColor: '#09090B',
        fontSize: '11px',
        lineHeight: '1.6',
        display: 'flex',
        flexDirection: 'column',
        gap: '3px'
      }}>
        {filteredLogs.length === 0 ? (
          <div style={{ color: '#52525B', fontStyle: 'italic', padding: '16px 0', textAlign: 'center' }}>
            [Awaiting incoming event stream from Discord Gateway for {guild.name}...]
          </div>
        ) : (
          filteredLogs.map((log, index) => {
            const color = getLogColor(log.type);
            const ts = formatTimestamp(log.timestamp);
            const action = log.action || log.message || 'DISCORD_GATEWAY_EVENT';
            const author = log.executorTag || log.executorId ? `@${log.executorTag || log.executorId}` : 'BOT_CORE';
            const detail = log.details || log.reason || '';

            return (
              <div key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <span style={{ color: '#52525B', flexShrink: 0 }}>[{ts}]</span>
                <span style={{
                  padding: '0 4px',
                  borderRadius: '3px',
                  fontSize: '9px',
                  fontWeight: 800,
                  backgroundColor: `${color}22`,
                  color: color,
                  border: `1px solid ${color}44`,
                  flexShrink: 0
                }}>
                  {(log.type || 'INFO').toUpperCase()}
                </span>
                <span style={{ color: '#A1A1AA', fontWeight: 600, flexShrink: 0 }}>{author}:</span>
                <span style={{ color: '#FAFAFA', wordBreak: 'break-all' }}>
                  {action} {detail && <span style={{ color: '#71717A' }}>({detail})</span>}
                </span>
              </div>
            );
          })
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}

export function AdminPanel({ onNavigate }: { onNavigate?: (page: string, tab?: string) => void }) {
  const { user, token } = useAuth();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'servers' | 'logs' | 'actions'>('overview');
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
  const [searchGuild, setSearchGuild] = useState('');
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [actionErrorMsg, setActionErrorMsg] = useState<string | null>(null);
  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);
  const [broadcastText, setBroadcastText] = useState('');
  const [executingAction, setExecutingAction] = useState(false);
  const [latencyHistory, setLatencyHistory] = useState<number[]>([35, 42, 38, 45, 40, 36]);

  const isOwner = user?.discordId === OWNER_ID || user?.role === 'owner';

  const fetchOverview = useCallback(async (isSilent = false) => {
    if (!token) return;
    try {
      if (!isSilent) setRefreshing(true);
      const res = await fetch(`${API}/api/admin/overview`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        const json: AdminOverview = await res.json();
        setData(json);
        if (json.system?.latencyMs) {
          setLatencyHistory(prev => [...prev.slice(-9), json.system.latencyMs]);
        }
      } else if (res.status === 403) {
        setActionErrorMsg('Access Denied: Owner verification failed on server.');
      }
    } catch (err: any) {
      if (!isSilent) setActionErrorMsg(`Connection failed: ${err.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    fetchOverview();
    const interval = setInterval(() => fetchOverview(true), 8000);
    return () => clearInterval(interval);
  }, [fetchOverview]);

  const executeAdminAction = async (action: string, guildId?: string, payload?: any) => {
    if (!token) return;
    setExecutingAction(true);
    setActionSuccessMsg(null);
    setActionErrorMsg(null);

    try {
      const res = await fetch(`${API}/api/admin/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ action, guildId, payload })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setActionSuccessMsg(`Action executed successfully: ${result.message || action}`);
        fetchOverview(true);
      } else {
        setActionErrorMsg(result.error || `Execution failed for ${action}`);
      }
    } catch (err: any) {
      setActionErrorMsg(`Execution error: ${err.message}`);
    } finally {
      setExecutingAction(false);
      setTimeout(() => {
        setActionSuccessMsg(null);
        setActionErrorMsg(null);
      }, 5000);
    }
  };

  // 1. ACCESS CONTROL PERIMETER CHECK
  if (!isOwner) {
    return (
      <div style={{
        minHeight: '80vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px'
      }}>
        <div style={{
          maxWidth: '520px',
          width: '100%',
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E4E4E8',
          boxShadow: '0 20px 40px rgba(0,0,0,0.08)',
          padding: '36px',
          textAlign: 'center'
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px'
          }}>
            <ShieldAlert size={32} color="#DC2626" />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#09090B', marginBottom: '8px' }}>
            RESTRICTED ADMIN ACCESS
          </h2>
          <p style={{ fontSize: '13px', color: '#71717A', lineHeight: '1.6', marginBottom: '20px' }}>
            The Global Admin Console is exclusively restricted to the Bot Sovereign Owner (<code>{OWNER_ID}</code>).
            Your current Discord identity does not hold executive clearance.
          </p>
          <div style={{
            backgroundColor: '#F4F4F5',
            borderRadius: '8px',
            padding: '12px',
            fontSize: '11px',
            color: '#52525B',
            fontFamily: 'var(--font-mono)',
            marginBottom: '24px',
            textAlign: 'left'
          }}>
            <div><strong>Active User:</strong> {user?.username || 'Unauthenticated'}</div>
            <div><strong>Detected ID:</strong> {user?.discordId || 'None'}</div>
            <div><strong>Required ID:</strong> {OWNER_ID}</div>
            <div><strong>Access Verdict:</strong> <span style={{ color: '#DC2626', fontWeight: 700 }}>REJECTED (403)</span></div>
          </div>
          {onNavigate && (
            <button
              onClick={() => onNavigate('dashboard')}
              style={{
                width: '100%',
                padding: '10px 16px',
                borderRadius: '8px',
                backgroundColor: '#09090B',
                color: '#FFFFFF',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              Return to Public Dashboard
            </button>
          )}
        </div>
      </div>
    );
  }

  const guilds = data?.guilds || [];
  const system = data?.system;
  const recentLogs = data?.recentLogs || [];

  const totalMembers = guilds.reduce((acc, g) => acc + (g.memberCount || 0), 0);
  const avgScore = guilds.length
    ? Math.round(guilds.reduce((acc, g) => acc + (g.securityScore || 0), 0) / guilds.length)
    : 100;
  const criticalGuilds = guilds.filter(g => (g.securityScore || 100) < 60).length;

  const filteredGuilds = guilds.filter(g =>
    g.name.toLowerCase().includes(searchGuild.toLowerCase()) ||
    g.id.includes(searchGuild)
  );

  return (
    <div style={{ padding: '24px 32px 60px', maxWidth: '1600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* ── TOP HERO BANNER & OWNER BADGE ── */}
      <div style={{
        backgroundColor: '#09090B',
        borderRadius: '16px',
        padding: '24px 28px',
        color: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '20px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
        border: '1px solid #27272A'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #EAB308 0%, #CA8A04 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#000000',
            boxShadow: '0 4px 14px rgba(234, 179, 8, 0.35)',
            flexShrink: 0
          }}>
            <Crown size={28} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em', margin: 0 }}>
                GLOBAL SECURITY & SOVEREIGN COMMAND
              </h1>
              <span style={{
                backgroundColor: 'rgba(234, 179, 8, 0.18)',
                color: '#FACC15',
                border: '1px solid rgba(234, 179, 8, 0.4)',
                fontSize: '10px',
                fontWeight: 800,
                padding: '2px 8px',
                borderRadius: '6px',
                letterSpacing: '0.08em',
                fontFamily: 'var(--font-mono)'
              }}>
                OWNER CLEARANCE: {OWNER_ID}
              </span>
            </div>
            <p style={{ fontSize: '13px', color: '#A1A1AA', marginTop: '4px', margin: 0 }}>
              Live telemetry, real-time Discord gateway logs & executive controls across all tenant servers.
            </p>
          </div>
        </div>

        {/* Live Status Indicators & Top Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#18181B',
            padding: '6px 14px',
            borderRadius: '8px',
            border: '1px solid #27272A',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)'
          }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: system?.botOnline ? '#10B981' : '#EF4444',
              display: 'inline-block',
              boxShadow: system?.botOnline ? '0 0 8px #10B981' : 'none'
            }} />
            <span style={{ color: '#E4E4E7' }}>GATEWAY: {system?.botOnline ? 'ONLINE' : 'CONNECTING'}</span>
            <span style={{ color: '#71717A' }}>|</span>
            <span style={{ color: '#10B981' }}>{system?.latencyMs || 0}ms</span>
          </div>

          <button
            onClick={() => fetchOverview(false)}
            disabled={refreshing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#27272A',
              color: '#FFFFFF',
              border: '1px solid #3F3F46',
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: refreshing ? 'not-allowed' : 'pointer'
            }}
          >
            <RefreshCw size={13} className={refreshing ? 'spin' : ''} />
            <span>{refreshing ? 'Syncing...' : 'Refresh'}</span>
          </button>

          <button
            onClick={() => setBroadcastModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#2563EB',
              color: '#FFFFFF',
              border: 'none',
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Send size={13} />
            <span>Broadcast Alert</span>
          </button>

          <button
            onClick={() => {
              if (window.confirm('ALERT: Perform emergency lockdown on ALL monitored servers?')) {
                executeAdminAction('emergency_lock_all');
              }
            }}
            disabled={executingAction}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#DC2626',
              color: '#FFFFFF',
              border: 'none',
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: executingAction ? 'not-allowed' : 'pointer'
            }}
          >
            <Lock size={13} />
            <span>Lock All</span>
          </button>
        </div>
      </div>

      {/* Notifications / Alerts banner */}
      {actionSuccessMsg && (
        <div className="alert-box success" style={{ animation: 'fade-in-anim 0.2s' }}>
          <CheckCircle size={16} />
          <span>{actionSuccessMsg}</span>
        </div>
      )}
      {actionErrorMsg && (
        <div className="alert-box danger" style={{ animation: 'fade-in-anim 0.2s' }}>
          <AlertTriangle size={16} />
          <span>{actionErrorMsg}</span>
        </div>
      )}

      {/* ── KPI METRICS CARDS ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px'
      }}>
        {/* Metric 1: Total Servers */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E4E4E8',
          padding: '18px 20px',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Connected Servers
            </span>
            <Server size={16} color="#71717A" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '28px', fontWeight: 800, color: '#09090B', fontFamily: 'var(--font-mono)' }}>
              {guilds.length}
            </span>
            <span style={{ fontSize: '12px', color: '#16A34A', fontWeight: 600 }}>Active Fleet</span>
          </div>
          <span style={{ fontSize: '11px', color: '#A1A1AA' }}>
            Across all Discord regional clusters
          </span>
        </div>

        {/* Metric 2: Global Security Index */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E4E4E8',
          padding: '18px 20px',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Fleet Security Index
            </span>
            <ShieldCheck size={16} color={securityColor(avgScore)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '28px', fontWeight: 800, color: securityColor(avgScore), fontFamily: 'var(--font-mono)' }}>
              {avgScore}%
            </span>
            <span style={{
              fontSize: '10px',
              fontWeight: 800,
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: securityBadgeBg(avgScore),
              color: securityColor(avgScore)
            }}>
              {securityLabel(avgScore)}
            </span>
          </div>
          <span style={{ fontSize: '11px', color: '#A1A1AA' }}>
            Average defensive rating
          </span>
        </div>

        {/* Metric 3: Protected Population */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E4E4E8',
          padding: '18px 20px',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Total Protected Members
            </span>
            <Users size={16} color="#71717A" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '28px', fontWeight: 800, color: '#09090B', fontFamily: 'var(--font-mono)' }}>
              {totalMembers.toLocaleString()}
            </span>
            <span style={{ fontSize: '12px', color: '#2563EB', fontWeight: 600 }}>Accounts</span>
          </div>
          <span style={{ fontSize: '11px', color: '#A1A1AA' }}>
            Shielded under Anti-Nuke & AutoMod
          </span>
        </div>

        {/* Metric 4: System Host Telemetry */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E4E4E8',
          padding: '18px 20px',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Host Core & Latency
            </span>
            <Activity size={16} color="#71717A" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontSize: '24px', fontWeight: 800, color: '#09090B', fontFamily: 'var(--font-mono)' }}>
                {system?.memoryMb || 0}
              </span>
              <span style={{ fontSize: '12px', color: '#71717A', marginLeft: '4px' }}>MB RAM</span>
            </div>
            <Sparkline values={latencyHistory} color="#2563EB" />
          </div>
          <span style={{ fontSize: '11px', color: '#A1A1AA', fontFamily: 'var(--font-mono)' }}>
            Uptime: {system?.uptime || 'N/A'} | Node: {system?.nodeVersion || 'v20'}
          </span>
        </div>
      </div>

      {/* ── NAVIGATION TABS ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #E4E4E8',
        paddingBottom: '2px',
        gap: '12px',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {[
            { id: 'overview', label: 'Security Dashboard', icon: <Activity size={15} /> },
            { id: 'servers', label: `Tenant Servers (${guilds.length})`, icon: <Server size={15} /> },
            { id: 'logs', label: 'Global Logs Console', icon: <Terminal size={15} /> },
            { id: 'actions', label: 'Executive Commands', icon: <Sliders size={15} /> }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 16px',
                borderRadius: '8px 8px 0 0',
                fontSize: '13px',
                fontWeight: activeTab === tab.id ? 700 : 500,
                color: activeTab === tab.id ? '#09090B' : '#71717A',
                borderBottom: activeTab === tab.id ? '2px solid #09090B' : '2px solid transparent',
                backgroundColor: activeTab === tab.id ? '#FFFFFF' : 'transparent',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Search input for quick guild filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E4E4E8',
            borderRadius: '8px',
            padding: '6px 12px'
          }}>
            <Search size={14} color="#71717A" />
            <input
              type="text"
              placeholder="Filter by server or ID..."
              value={searchGuild}
              onChange={e => setSearchGuild(e.target.value)}
              style={{
                fontSize: '12px',
                color: '#09090B',
                width: '180px',
                outline: 'none'
              }}
            />
          </div>
        </div>
      </div>

      {/* ── TAB 1: OVERVIEW ── */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Server Security Status Grid (Graphical Cards with circular ScoreRing) */}
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '14px',
            border: '1px solid #E4E4E8',
            padding: '24px',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#09090B', margin: 0 }}>
                  MULTI-SERVER SECURITY HEALTH MAP
                </h3>
                <p style={{ fontSize: '12px', color: '#71717A', margin: '4px 0 0 0' }}>
                  Live graphical breakdown of threat resistance and configuration posture per server
                </p>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#16A34A', fontWeight: 600 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} /> 80-100% Optimal
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#D97706', fontWeight: 600 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B' }} /> 60-79% Review
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#DC2626', fontWeight: 600 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444' }} /> &lt;60% Danger
                </span>
              </div>
            </div>

            {filteredGuilds.length === 0 ? (
              <div className="empty-state">
                <Server size={36} color="#A1A1AA" />
                <span className="empty-state-title">No matching Discord servers</span>
                <span className="empty-state-desc">The bot is currently not running in any servers matching your query.</span>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: '16px'
              }}>
                {filteredGuilds.map(guild => {
                  const isSelected = selectedGuildId === guild.id;
                  return (
                    <div
                      key={guild.id}
                      onClick={() => setSelectedGuildId(isSelected ? null : guild.id)}
                      style={{
                        backgroundColor: isSelected ? '#FAFAFA' : '#FFFFFF',
                        border: isSelected ? '2px solid #09090B' : '1px solid #E4E4E8',
                        borderRadius: '12px',
                        padding: '16px 18px',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        boxShadow: isSelected ? 'var(--shadow-md)' : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {guild.icon ? (
                            <img
                              src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`}
                              alt={guild.name}
                              style={{ width: 42, height: 42, borderRadius: '10px', objectFit: 'cover' }}
                            />
                          ) : (
                            <div style={{
                              width: 42,
                              height: 42,
                              borderRadius: '10px',
                              backgroundColor: '#18181B',
                              color: '#FFFFFF',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 800,
                              fontSize: '14px'
                            }}>
                              {guild.name.substring(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <span style={{ fontSize: '14px', fontWeight: 700, color: '#09090B', display: 'block' }}>
                              {guild.name}
                            </span>
                            <span style={{ fontSize: '10px', color: '#71717A', fontFamily: 'var(--font-mono)' }}>
                              ID: {guild.id}
                            </span>
                          </div>
                        </div>

                        {/* Circular Score Gauge */}
                        <ScoreRing score={guild.securityScore || 85} size={54} />
                      </div>

                      {/* Info & Stats bar */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingTop: '8px',
                        borderTop: '1px solid #F4F4F5',
                        fontSize: '11px',
                        color: '#71717A'
                      }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Users size={12} /> {(guild.memberCount || 0).toLocaleString()} users
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Zap size={12} /> {guild.enabledModules || 0}/{guild.totalModules || 16} active modules
                        </span>
                        <span style={{
                          padding: '1px 6px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 700,
                          backgroundColor: guild.approvalStatus === 'Approved' ? '#DCFCE7' : '#FEF3C7',
                          color: guild.approvalStatus === 'Approved' ? '#15803D' : '#B45309'
                        }}>
                          {guild.approvalStatus || 'Approved'}
                        </span>
                      </div>

                      {/* Click to expand prompt */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        fontSize: '11px',
                        color: isSelected ? '#09090B' : '#A1A1AA',
                        fontWeight: 600,
                        paddingTop: '4px'
                      }}>
                        <Terminal size={12} />
                        <span>{isSelected ? 'Hide Live Terminal Console' : 'View Live Terminal Console'}</span>
                        {isSelected ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </div>

                      {/* Expanded Console under this server */}
                      {isSelected && token && (
                        <div style={{ marginTop: '8px' }} onClick={e => e.stopPropagation()}>
                          <GuildConsole guild={guild} token={token} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Global Real-Time Logs Console */}
          <div style={{
            backgroundColor: '#09090B',
            borderRadius: '14px',
            border: '1px solid #27272A',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-md)'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 20px',
              backgroundColor: '#18181B',
              borderBottom: '1px solid #27272A'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Terminal size={16} color="#10B981" />
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#FAFAFA', letterSpacing: '0.04em' }}>
                  FLEET-WIDE DISCORD GATEWAY EVENT CONSOLE
                </span>
                <span style={{
                  fontSize: '9px',
                  backgroundColor: 'rgba(16, 185, 129, 0.2)',
                  color: '#10B981',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontWeight: 800
                }}>
                  GLOBAL REALTIME
                </span>
              </div>
              <span style={{ fontSize: '11px', color: '#71717A', fontFamily: 'var(--font-mono)' }}>
                Showing last {recentLogs.length} gateway actions
              </span>
            </div>

            <div style={{
              height: '260px',
              overflowY: 'auto',
              padding: '14px 18px',
              fontSize: '11.5px',
              fontFamily: 'var(--font-mono)',
              lineHeight: '1.7',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
              {recentLogs.length === 0 ? (
                <div style={{ color: '#52525B', textAlign: 'center', padding: '24px 0' }}>
                  No recent global gateway transactions logged yet.
                </div>
              ) : (
                recentLogs.map((log, idx) => {
                  const color = getLogColor(log.type);
                  return (
                    <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <span style={{ color: '#52525B' }}>[{formatTimestamp(log.timestamp)}]</span>
                      <span style={{
                        padding: '0 4px',
                        borderRadius: '3px',
                        fontSize: '9px',
                        fontWeight: 800,
                        backgroundColor: `${color}22`,
                        color: color,
                        border: `1px solid ${color}44`
                      }}>
                        {(log.type || 'INFO').toUpperCase()}
                      </span>
                      <span style={{ color: '#E4E4E7', fontWeight: 600 }}>
                        {log.executorTag ? `@${log.executorTag}` : 'GATEWAY'}:
                      </span>
                      <span style={{ color: '#FAFAFA' }}>
                        {log.action || log.message}
                      </span>
                      {log.details && (
                        <span style={{ color: '#71717A' }}>
                          — {log.details}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: SERVERS MANAGEMENT & EXPANDABLE PANELS ── */}
      {activeTab === 'servers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredGuilds.map(guild => (
            <div
              key={guild.id}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E4E4E8',
                padding: '20px 24px',
                boxShadow: 'var(--shadow-sm)',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  {guild.icon ? (
                    <img
                      src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`}
                      alt={guild.name}
                      style={{ width: 48, height: 48, borderRadius: '12px' }}
                    />
                  ) : (
                    <div style={{
                      width: 48,
                      height: 48,
                      borderRadius: '12px',
                      backgroundColor: '#09090B',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: '16px'
                    }}>
                      {guild.name.substring(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h4 style={{ fontSize: '16px', fontWeight: 800, color: '#09090B', margin: 0 }}>
                        {guild.name}
                      </h4>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 700,
                        backgroundColor: guild.approvalStatus === 'Approved' ? '#DCFCE7' : '#FEF3C7',
                        color: guild.approvalStatus === 'Approved' ? '#15803D' : '#B45309'
                      }}>
                        {guild.approvalStatus || 'Approved'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px', fontSize: '12px', color: '#71717A' }}>
                      <span style={{ fontFamily: 'var(--font-mono)' }}>ID: {guild.id}</span>
                      <span>•</span>
                      <span>{(guild.memberCount || 0).toLocaleString()} Members</span>
                      <span>•</span>
                      <span>{guild.enabledModules || 0} Modules Armed</span>
                    </div>
                  </div>
                </div>

                {/* Action buttons for this specific server */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => executeAdminAction('approve_guild', guild.id)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 600,
                      backgroundColor: '#DCFCE7',
                      color: '#15803D',
                      border: '1px solid #BBF7D0',
                      cursor: 'pointer'
                    }}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => executeAdminAction('reject_guild', guild.id)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 600,
                      backgroundColor: '#FEF3C7',
                      color: '#B45309',
                      border: '1px solid #FDE68A',
                      cursor: 'pointer'
                    }}
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Permanently remove bot from ${guild.name} (${guild.id})?`)) {
                        executeAdminAction('kick_guild', guild.id);
                      }
                    }}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 600,
                      backgroundColor: '#FEE2E2',
                      color: '#DC2626',
                      border: '1px solid #FECACA',
                      cursor: 'pointer'
                    }}
                  >
                    Kick Bot
                  </button>
                </div>
              </div>

              {/* Dedicated Embedded Console for this Guild */}
              {token && <GuildConsole guild={guild} token={token} />}
            </div>
          ))}
        </div>
      )}

      {/* ── TAB 3: DEDICATED FULLSCREEN LOGS CONSOLE ── */}
      {activeTab === 'logs' && (
        <div style={{
          backgroundColor: '#09090B',
          borderRadius: '14px',
          border: '1px solid #27272A',
          padding: '20px',
          boxShadow: 'var(--shadow-md)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #27272A', paddingBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Terminal size={20} color="#10B981" />
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#FAFAFA', margin: 0 }}>
                  RAW DISCORD GATEWAY TRANSACTION CONSOLE
                </h3>
                <span style={{ fontSize: '11px', color: '#71717A' }}>
                  Realtime streaming telemetry from all attached Discord guild listeners
                </span>
              </div>
            </div>
            <button
              onClick={() => fetchOverview(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                backgroundColor: '#18181B',
                color: '#FAFAFA',
                border: '1px solid #3F3F46',
                fontSize: '11px',
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={12} className={refreshing ? 'spin' : ''} />
              <span>Poll Now</span>
            </button>
          </div>

          <div style={{
            height: '480px',
            overflowY: 'auto',
            padding: '16px',
            backgroundColor: '#050507',
            borderRadius: '8px',
            border: '1px solid #18181B',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            lineHeight: '1.8'
          }}>
            {recentLogs.map((log, i) => {
              const col = getLogColor(log.type);
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <span style={{ color: '#52525B' }}>[{formatTimestamp(log.timestamp)}]</span>
                  <span style={{
                    padding: '1px 5px',
                    borderRadius: '3px',
                    fontSize: '9px',
                    fontWeight: 800,
                    backgroundColor: `${col}22`,
                    color: col,
                    border: `1px solid ${col}44`
                  }}>
                    {(log.type || 'INFO').toUpperCase()}
                  </span>
                  <span style={{ color: '#A1A1AA', fontWeight: 600 }}>
                    {log.executorTag ? `@${log.executorTag}` : 'RO-CORE'}:
                  </span>
                  <span style={{ color: '#FFFFFF' }}>{log.action || log.message}</span>
                  {log.details && <span style={{ color: '#71717A' }}>— {log.details}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TAB 4: EXECUTIVE ACTIONS & CONTROLS ── */}
      {activeTab === 'actions' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '20px'
        }}>
          {/* Action 1: Fleet Synchronization */}
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E4E4E8',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <RefreshCw size={20} color="#2563EB" />
              <h4 style={{ fontSize: '15px', fontWeight: 800, margin: 0 }}>Force Fleet Synchronization</h4>
            </div>
            <p style={{ fontSize: '12px', color: '#71717A', lineHeight: '1.5' }}>
              Triggers an immediate background verification pass across all Discord guilds. Refreshes member caches, roles, and channel mappings.
            </p>
            <button
              onClick={() => executeAdminAction('sync_all')}
              disabled={executingAction}
              style={{
                marginTop: 'auto',
                padding: '10px',
                borderRadius: '8px',
                backgroundColor: '#2563EB',
                color: '#FFFFFF',
                fontWeight: 600,
                fontSize: '12px',
                cursor: executingAction ? 'not-allowed' : 'pointer'
              }}
            >
              {executingAction ? 'Running Sync...' : 'Execute Fleet Sync'}
            </button>
          </div>

          {/* Action 2: Emergency Lockdown */}
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #FCA5A5',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldAlert size={20} color="#DC2626" />
              <h4 style={{ fontSize: '15px', fontWeight: 800, margin: 0, color: '#DC2626' }}>
                Emergency Threat Lockdown
              </h4>
            </div>
            <p style={{ fontSize: '12px', color: '#71717A', lineHeight: '1.5' }}>
              Instantly arms Anti-Nuke maximum thresholds, throttles mass channel/role creations, and enters high-alert defense across all servers.
            </p>
            <button
              onClick={() => {
                if (window.confirm('CRITICAL: Lock down all servers under emergency defense?')) {
                  executeAdminAction('emergency_lock_all');
                }
              }}
              disabled={executingAction}
              style={{
                marginTop: 'auto',
                padding: '10px',
                borderRadius: '8px',
                backgroundColor: '#DC2626',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '12px',
                cursor: executingAction ? 'not-allowed' : 'pointer'
              }}
            >
              Lockdown All Servers
            </button>
          </div>

          {/* Action 3: Broadcast Emergency Announcement */}
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E4E4E8',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Send size={20} color="#09090B" />
              <h4 style={{ fontSize: '15px', fontWeight: 800, margin: 0 }}>System Broadcast</h4>
            </div>
            <p style={{ fontSize: '12px', color: '#71717A', lineHeight: '1.5' }}>
              Dispatch an official system maintenance or security alert embed to the default notification channels of all active servers.
            </p>
            <button
              onClick={() => setBroadcastModalOpen(true)}
              style={{
                marginTop: 'auto',
                padding: '10px',
                borderRadius: '8px',
                backgroundColor: '#09090B',
                color: '#FFFFFF',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Compose Broadcast
            </button>
          </div>
        </div>
      )}

      {/* ── BROADCAST MODAL ── */}
      {broadcastModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 3000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            maxWidth: '540px',
            width: '100%',
            padding: '28px',
            boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Send size={18} color="#2563EB" />
                <h3 style={{ fontSize: '16px', fontWeight: 800, margin: 0 }}>Broadcast to All Servers</h3>
              </div>
              <button
                onClick={() => setBroadcastModalOpen(false)}
                style={{ fontSize: '16px', color: '#71717A', cursor: 'pointer', padding: 4 }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '12px', color: '#71717A', margin: 0 }}>
              This alert will be transmitted via Discord Gateway webhook / system channel to all {guilds.length} connected servers simultaneously.
            </p>

            <textarea
              rows={4}
              placeholder="Enter announcement text or maintenance notification..."
              value={broadcastText}
              onChange={e => setBroadcastText(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #D4D4D8',
                fontSize: '13px',
                fontFamily: 'var(--font-sans)',
                outline: 'none',
                resize: 'vertical'
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setBroadcastModalOpen(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  backgroundColor: '#F4F4F5',
                  color: '#52525B',
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!broadcastText.trim()) return;
                  await executeAdminAction('broadcast_message', undefined, { message: broadcastText });
                  setBroadcastModalOpen(false);
                  setBroadcastText('');
                }}
                disabled={executingAction || !broadcastText.trim()}
                style={{
                  padding: '8px 18px',
                  borderRadius: '6px',
                  backgroundColor: '#2563EB',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: !broadcastText.trim() || executingAction ? 'not-allowed' : 'pointer'
                }}
              >
                Send Broadcast Alert
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
export default AdminPanel;
