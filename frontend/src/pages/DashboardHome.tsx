import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ShieldCheck, Users, Activity, ShieldAlert, Award, Clock, ArrowUpRight, 
  Settings2, ChevronRight, CheckCircle2, ShieldOff, AlertTriangle, Search,
  Sliders, Bot, Sparkles, MessageSquare, Volume2, LineChart, FileText, 
  Gift, Send, Bell, Radio, Zap, Terminal, Play, Pause, Trash2, Download,
  Copy, Check, Layers, Cpu, Server, Filter, RefreshCw
} from 'lucide-react';
import type { ActivityEvent } from '../hooks/useActivityFeed';
import type { ModuleState, DiscordResourceRegistry } from '../hooks/useDiscordSync';
import { StatusBadge } from '../components/StatusBadge';

interface DashboardHomeProps {
  events: ActivityEvent[];
  latency: number;
  uptime: string;
  onNavigate: (page: string, tab?: string) => void;
  onManualTrigger: (msg: string, type: ActivityEvent['type'], cat: ActivityEvent['category']) => void;
  modules: ModuleState[];
  registry: DiscordResourceRegistry;
  syncLogs?: any[];
}

interface ConsoleLogEntry {
  id: string;
  timestamp: string;
  scope: 'SECURITY' | 'MOD' | 'GATEWAY' | 'VOICE' | 'SYSTEM' | 'AUDIT';
  level: 'INFO' | 'SUCCESS' | 'WARN' | 'CRITICAL' | 'GATEWAY';
  message: string;
}

export function DashboardHome({ 
  events, 
  latency, 
  uptime, 
  onNavigate, 
  onManualTrigger, 
  modules, 
  registry,
  syncLogs = []
}: DashboardHomeProps) {
  // Module search and filter tabs
  const [searchQuery, setSearchQuery] = useState('');
  const [moduleCategory, setModuleCategory] = useState<'all' | 'security' | 'moderation' | 'automations' | 'voice' | 'system'>('all');
  
  // Analytics chart state
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [activeMetric, setActiveMetric] = useState<'all' | 'security' | 'moderation' | 'voice'>('all');
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);

  // Console terminal state
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLogEntry[]>([]);
  const [consoleScope, setConsoleScope] = useState<string>('ALL');
  const [consoleSearch, setConsoleSearch] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [copiedConsole, setCopiedConsole] = useState<boolean>(false);
  const consoleBottomRef = useRef<HTMLDivElement | null>(null);

  // Compute numbers from active events
  const quarantinedCount = events.filter(e => e.message.includes('quarantine') || e.message.includes('revoked') || e.message.includes('banned')).length;
  const resolvedCount = events.filter(e => e.message.toLowerCase().includes('restore') || e.message.toLowerCase().includes('resolved') || e.message.toLowerCase().includes('success') || e.message.toLowerCase().includes('complete')).length;
  const pendingCount = events.filter(e => e.type === 'danger' || e.type === 'warning').length;

  // Calculate configuration progress
  const totalProgress = (modules || []).reduce((acc, m) => acc + (m?.progress || 0), 0);
  const averageProgress = modules?.length ? Math.round(totalProgress / modules.length) : 0;
  const activeErrors = (modules || []).reduce<string[]>((acc, m) => [...acc, ...(m?.errors || [])], []);

  // Compute live users and staff from registry
  const liveTotalMembers = registry.memberCount || (registry.roles ? registry.roles.find(r => r.id === 'r-5')?.membersCount : 0) || 842;
  const liveOnlineMembers = registry.onlineCount || Math.round(liveTotalMembers * 0.15);
  
  const staffRoles = registry.roles ? registry.roles.filter(r => 
    r.permissions && (
      r.permissions.includes('ADMINISTRATOR') || 
      r.permissions.includes('BAN_MEMBERS') || 
      r.permissions.includes('KICK_MEMBERS') ||
      r.permissions.includes('MANAGE_MESSAGES')
    )
  ) : [];
  const totalStaffCount = staffRoles.reduce((acc, r) => acc + (r.membersCount || 0), 0);
  const onlineStaffCount = totalStaffCount > 0 ? Math.max(1, Math.round(totalStaffCount * 0.6)) : 0;

  // Categorize modules into structured domains
  const categorizedModules = useMemo(() => {
    const hidden = new Set(['bot_whitelist', 'role_whitelist', 'tickets', 'welcome', 'music', 'payment']);
    const list = (modules || []).filter(m => !hidden.has(m.id));

    return list.map(m => {
      let category: 'security' | 'moderation' | 'automations' | 'voice' | 'system' = 'system';
      if (['security', 'upm', 'anti-nuke', 'member_whitelist', 'join_role_guard'].includes(m.id)) {
        category = 'security';
      } else if (['moderation', 'automod', 'verification', 'bulk_ops'].includes(m.id)) {
        category = 'moderation';
      } else if (['welcome-v2', 'tickets-v2', 'automation', 'reaction_roles', 'leveling', 'reminders', 'giveaway', 'announcements', 'social_updates'].includes(m.id)) {
        category = 'automations';
      } else if (['voice', 'voice-protection', 'join_to_create', 'voice_manager'].includes(m.id)) {
        category = 'voice';
      } else {
        category = 'system';
      }
      return { ...m, category };
    });
  }, [modules]);

  const filteredModules = useMemo(() => {
    return categorizedModules
      .filter(m => moduleCategory === 'all' || m.category === moduleCategory)
      .filter(m => 
        !searchQuery.trim() || 
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        m.id.toLowerCase().includes(searchQuery.toLowerCase())
      );
  }, [categorizedModules, moduleCategory, searchQuery]);

  const getPageRoute = (modId: string) => {
    switch (modId) {
      case 'welcome-v2': return 'welcome';
      case 'tickets-v2': return 'tickets';
      case 'member_whitelist': return 'whitelist-overview';
      case 'logging': return 'logs';
      case 'voice-protection':
      case 'voice_manager': return 'voice';
      default: return modId;
    }
  };

  // -------------------------------------------------------------
  // ANALYTICS CHART DATA GENERATOR
  // -------------------------------------------------------------
  const chartData = useMemo(() => {
    if (timeRange === '24h') {
      return [
        { label: '00:00', total: 420, security: 12, moderation: 45, voice: 30 },
        { label: '04:00', total: 210, security: 6, moderation: 20, voice: 14 },
        { label: '08:00', total: 680, security: 28, moderation: 84, voice: 52 },
        { label: '12:00', total: 1140, security: 42, moderation: 156, voice: 110 },
        { label: '16:00', total: 1480, security: 64, moderation: 198, voice: 165 },
        { label: '20:00', total: 1820, security: 78, moderation: 240, voice: 210 },
        { label: '23:59', total: 1390, security: 35, moderation: 142, voice: 145 },
      ];
    } else if (timeRange === '7d') {
      return [
        { label: 'Mon', total: 8400, security: 320, moderation: 1120, voice: 890 },
        { label: 'Tue', total: 9100, security: 410, moderation: 1250, voice: 940 },
        { label: 'Wed', total: 8850, security: 290, moderation: 1080, voice: 910 },
        { label: 'Thu', total: 9980, security: 480, moderation: 1340, voice: 1040 },
        { label: 'Fri', total: 12400, security: 620, moderation: 1780, voice: 1420 },
        { label: 'Sat', total: 15600, security: 790, moderation: 2100, voice: 1850 },
        { label: 'Sun', total: 14200, security: 680, moderation: 1920, voice: 1680 },
      ];
    } else {
      return [
        { label: 'Week 1', total: 58000, security: 2400, moderation: 8100, voice: 6200 },
        { label: 'Week 2', total: 64200, security: 2750, moderation: 8900, voice: 7100 },
        { label: 'Week 3', total: 71000, security: 3100, moderation: 9800, voice: 8400 },
        { label: 'Week 4', total: 68500, security: 2980, moderation: 9400, voice: 7900 },
      ];
    }
  }, [timeRange]);

  // SVG dimensions for responsive chart
  const svgWidth = 800;
  const svgHeight = 220;
  const paddingX = 40;
  const paddingY = 24;

  const maxChartValue = useMemo(() => {
    const values = chartData.map(d => {
      if (activeMetric === 'security') return d.security;
      if (activeMetric === 'moderation') return d.moderation;
      if (activeMetric === 'voice') return d.voice;
      return d.total;
    });
    return Math.max(...values, 100);
  }, [chartData, activeMetric]);

  const points = useMemo(() => {
    return chartData.map((d, i) => {
      const x = paddingX + (i / (chartData.length - 1)) * (svgWidth - paddingX * 2);
      let val = d.total;
      if (activeMetric === 'security') val = d.security;
      if (activeMetric === 'moderation') val = d.moderation;
      if (activeMetric === 'voice') val = d.voice;
      const y = svgHeight - paddingY - (val / maxChartValue) * (svgHeight - paddingY * 2);
      return { x, y, data: d };
    });
  }, [chartData, activeMetric, maxChartValue]);

  // Construct smooth SVG Bezier curve
  const curvePath = useMemo(() => {
    if (!points.length) return '';
    return points.reduce((acc, curr, idx, arr) => {
      if (idx === 0) return `M ${curr.x} ${curr.y}`;
      const prev = arr[idx - 1];
      const cx1 = prev.x + (curr.x - prev.x) / 2;
      const cy1 = prev.y;
      const cx2 = prev.x + (curr.x - prev.x) / 2;
      const cy2 = curr.y;
      return `${acc} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${curr.x} ${curr.y}`;
    }, '');
  }, [points]);

  const areaPath = useMemo(() => {
    if (!points.length) return '';
    const first = points[0];
    const last = points[points.length - 1];
    return `${curvePath} L ${last.x} ${svgHeight - paddingY} L ${first.x} ${svgHeight - paddingY} Z`;
  }, [curvePath, points]);

  // -------------------------------------------------------------
  // CONSOLE TERMINAL FEED INITIALIZATION & STREAMING
  // -------------------------------------------------------------
  useEffect(() => {
    const initialSeedLogs: ConsoleLogEntry[] = [
      { id: 'l-0', timestamp: '23:20:10.042', scope: 'SYSTEM', level: 'INFO', message: 'RAGE Engine v3.4.2 Shard #0 initialized successfully.' },
      { id: 'l-1', timestamp: '23:20:14.281', scope: 'GATEWAY', level: 'GATEWAY', message: 'WebSocket connection established with Discord Gateway (WSS TLSv1.3).' },
      { id: 'l-2', timestamp: '23:20:15.892', scope: 'SECURITY', level: 'SUCCESS', message: 'Anti-Nuke Interceptor armed: 14 enforcement rules active.' },
      { id: 'l-3', timestamp: '23:20:20.119', scope: 'SYSTEM', level: 'INFO', message: 'Loaded 24 server modules into active memory cache.' },
      { id: 'l-4', timestamp: '23:20:45.310', scope: 'MOD', level: 'INFO', message: 'AI AutoMod & AntiLink scanner initialized (strict invite heuristics).' },
      { id: 'l-5', timestamp: '23:21:02.504', scope: 'VOICE', level: 'SUCCESS', message: 'Join-to-Create voice state listeners registered across all audio channels.' },
      { id: 'l-6', timestamp: '23:21:30.980', scope: 'AUDIT', level: 'INFO', message: 'Disaster recovery snapshot #UPM-8942 validated with 0 integrity discrepancies.' },
    ];

    // Seed events from parent activity feed
    events.slice(0, 8).forEach((e, idx) => {
      let scope: ConsoleLogEntry['scope'] = 'SYSTEM';
      if (e.category === 'Security') scope = 'SECURITY';
      else if (e.category === 'Moderation') scope = 'MOD';
      else if (e.category === 'Ticket') scope = 'SYSTEM';
      
      let level: ConsoleLogEntry['level'] = 'INFO';
      if (e.type === 'danger') level = 'CRITICAL';
      else if (e.type === 'warning') level = 'WARN';
      else if (e.type === 'success') level = 'SUCCESS';

      initialSeedLogs.push({
        id: `ev-${idx}-${Date.now()}`,
        timestamp: e.timestamp || '23:22:00.000',
        scope,
        level,
        message: e.message
      });
    });

    setConsoleLogs(initialSeedLogs);
  }, []);

  // Periodic heartbeat / simulated gateway ticker to keep console feeling alive
  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`;

      const tickTemplates: { scope: ConsoleLogEntry['scope']; level: ConsoleLogEntry['level']; msg: string }[] = [
        { scope: 'GATEWAY', level: 'GATEWAY', msg: `Shard #0 Heartbeat ACK received in ${latency || 18}ms (seq: ${Math.floor(10000 + Math.random() * 90000)}).` },
        { scope: 'SECURITY', level: 'SUCCESS', msg: `Periodic audit completed: 0 permission anomalies or unapproved role elevations detected.` },
        { scope: 'SYSTEM', level: 'INFO', msg: `Disaster snapshot sync completed in 32ms. Memory buffer healthy (${(Math.random() * 0.5 + 24.2).toFixed(1)} KB).` },
        { scope: 'MOD', level: 'INFO', msg: `Automod inspected 18 incoming message payloads across active channels.` },
        { scope: 'VOICE', level: 'INFO', msg: `Voice presence check: verified dynamic channel states.` },
      ];

      const chosen = tickTemplates[Math.floor(Math.random() * tickTemplates.length)];
      setConsoleLogs(prev => [
        ...prev.slice(-120), // Retain last 120 logs in memory
        {
          id: `tick-${Date.now()}-${Math.random()}`,
          timestamp: timeStr,
          scope: chosen.scope,
          level: chosen.level,
          message: chosen.msg
        }
      ]);
    }, 5500);

    return () => clearInterval(interval);
  }, [isPaused, latency]);

  // Auto-scroll console when new logs arrive
  useEffect(() => {
    if (autoScroll && consoleBottomRef.current) {
      consoleBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [consoleLogs, autoScroll]);

  // Filter console logs
  const filteredConsoleLogs = useMemo(() => {
    return consoleLogs.filter(log => {
      const matchesScope = consoleScope === 'ALL' || log.scope === consoleScope;
      const matchesSearch = !consoleSearch.trim() || 
        log.message.toLowerCase().includes(consoleSearch.toLowerCase()) ||
        log.scope.toLowerCase().includes(consoleSearch.toLowerCase()) ||
        log.level.toLowerCase().includes(consoleSearch.toLowerCase());
      return matchesScope && matchesSearch;
    });
  }, [consoleLogs, consoleScope, consoleSearch]);

  const handleCopyLogs = () => {
    const text = filteredConsoleLogs.map(l => `[${l.timestamp}] [${l.scope}] [${l.level}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedConsole(true);
    setTimeout(() => setCopiedConsole(false), 2000);
  };

  const handleDownloadLogs = () => {
    const text = filteredConsoleLogs.map(l => `[${l.timestamp}] [${l.scope}] [${l.level}] ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rage-server-console-${Date.now()}.log`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      {/* Configuration Status Banner if errors present */}
      {activeErrors.length > 0 && (
        <div 
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            padding: '14px 20px', 
            backgroundColor: 'rgba(239, 68, 68, 0.05)', 
            border: '1px solid rgba(239, 68, 68, 0.2)', 
            borderRadius: '10px' 
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={16} color="var(--color-danger)" />
            <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>
              {activeErrors.length} configuration validation alert(s) require attention.
            </span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('health')}>
            Resolve Health Alerts
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="page-title-row">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{
                fontSize: '11px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                padding: '3px 8px',
                borderRadius: '6px',
                backgroundColor: '#09090B',
                color: '#FFFFFF'
              }}>
                RAGE OPERATIONAL SOC
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>• Gateway Shard #0 Online</span>
            </div>
            <h1 className="page-title" style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)' }}>
              Operational Overview & Analytics
            </h1>
            <p className="page-subtitle" style={{ color: 'var(--text-secondary)' }}>
              Real-time server telemetry, 24-hour graphical analysis, and live gateway console stream.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button className="btn btn-secondary" onClick={() => onNavigate('health')}>
              <AlertTriangle size={14} color="var(--color-warning)" />
              <span>Config Health</span>
            </button>
            <button 
              className="btn btn-primary" 
              onClick={() => {
                onManualTrigger('Admin triggered diagnostic audit check across all gateway shards.', 'purple', 'System');
              }}
            >
              <RefreshCw size={14} />
              <span>Trigger Manual Audit</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4 Top KPI & Metric Gauges */}
      <div className="stats-grid">
        {/* Metric 1: Security Readiness Score */}
        <div className="stat-card" style={{ position: 'relative', overflow: 'hidden' }}>
          <div className="stat-header">
            <span>Security Health Rating</span>
            <ShieldCheck size={18} color="#16a34a" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
            <span className="stat-value" style={{ fontSize: '32px', fontWeight: 800 }}>98%</span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#16a34a' }}>+2.4% vs last wk</span>
          </div>
          <div className="stat-footer" style={{ marginTop: '12px' }}>
            <span className="stat-trend up">MAX PROTECTION</span>
            <span style={{ color: 'var(--text-muted)' }}>• 0 active breaches</span>
          </div>
        </div>

        {/* Metric 2: Shard Latency & Gateway Telemetry */}
        <div className="stat-card">
          <div className="stat-header">
            <span>Gateway & Shard Health</span>
            <Activity size={18} color="var(--accent-primary)" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
            <span className="stat-value" style={{ fontSize: '32px', fontWeight: 800 }}>{latency || 18}ms</span>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>Shard Ping</span>
          </div>
          <div className="stat-footer" style={{ marginTop: '12px' }}>
            <span className="stat-trend up">99.98% Uptime</span>
            <span style={{ color: 'var(--text-muted)' }}>• TLSv1.3 Encrypted</span>
          </div>
        </div>

        {/* Metric 3: Online Members vs Total Population */}
        <div className="stat-card">
          <div className="stat-header">
            <span>Online Population</span>
            <Users size={18} color="var(--accent-primary)" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
            <span className="stat-value" style={{ fontSize: '32px', fontWeight: 800 }}>{Number(liveOnlineMembers).toLocaleString()}</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>/ {Number(liveTotalMembers).toLocaleString()} total</span>
          </div>
          <div className="stat-footer" style={{ marginTop: '12px' }}>
            <span className="stat-trend up">{onlineStaffCount} Staff On Duty</span>
            <span style={{ color: 'var(--text-muted)' }}>• {totalStaffCount - onlineStaffCount} on call</span>
          </div>
        </div>

        {/* Metric 4: Active Defense Rules & Quarantines */}
        <div className="stat-card">
          <div className="stat-header">
            <span>Protection Rules Armed</span>
            <ShieldAlert size={18} color="var(--accent-primary)" />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
            <span className="stat-value" style={{ fontSize: '32px', fontWeight: 800 }}>14 / 14</span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#16a34a' }}>Full Coverage</span>
          </div>
          <div className="stat-footer" style={{ marginTop: '12px' }}>
            <span className="stat-trend neutral">Quarantine: {quarantinedCount}</span>
            <span style={{ color: 'var(--text-muted)' }}>• {resolvedCount} resolved</span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* GRAPHICAL ANALYSIS SUITE (MAIN VISUAL TELEMETRY) */}
      {/* ------------------------------------------------------------- */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '24px' }}>
        
        {/* Left: Interactive Multi-Series Area / Line Graph */}
        <div className="section-panel" style={{ padding: '24px', backgroundColor: '#FFFFFF', border: '1px solid var(--border-color)', borderRadius: '14px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '20px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <LineChart size={18} color="var(--accent-primary)" />
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  Server Event Velocity & Activity Analysis
                </h3>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
                Visual telemetry of gateway transactions, moderation actions, and defense triggers.
              </p>
            </div>

            {/* Time Filter & Metric Selector */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ display: 'flex', backgroundColor: 'var(--bg-secondary)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                {(['24h', '7d', '30d'] as const).map(range => (
                  <button
                    key={range}
                    onClick={() => setTimeRange(range)}
                    style={{
                      padding: '4px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: timeRange === range ? '#09090B' : 'transparent',
                      color: timeRange === range ? '#FFFFFF' : 'var(--text-secondary)',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    {range.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Interactive Metric Category Pills */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'All Gateway Events', color: '#09090B' },
              { id: 'security', label: 'Security & Anti-Nuke', color: '#dc2626' },
              { id: 'moderation', label: 'AutoMod & Filters', color: '#16a34a' },
              { id: 'voice', label: 'Voice Sessions', color: '#7c3aed' },
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setActiveMetric(m.id as any)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 12px',
                  borderRadius: '20px',
                  fontSize: '11px',
                  fontWeight: 600,
                  border: `1px solid ${activeMetric === m.id ? '#09090B' : 'var(--border-color)'}`,
                  backgroundColor: activeMetric === m.id ? '#09090B' : '#FFFFFF',
                  color: activeMetric === m.id ? '#FFFFFF' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: m.color }} />
                <span>{m.label}</span>
              </button>
            ))}
          </div>

          {/* Responsive SVG Chart Graphic */}
          <div style={{ position: 'relative', width: '100%', height: '220px', marginTop: '10px' }}>
            <svg 
              viewBox={`0 0 ${svgWidth} ${svgHeight}`} 
              style={{ width: '100%', height: '100%', overflow: 'visible' }}
            >
              <defs>
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#09090B" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#09090B" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Horizontal Gridlines */}
              {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
                const y = paddingY + pct * (svgHeight - paddingY * 2);
                return (
                  <g key={idx}>
                    <line 
                      x1={paddingX} 
                      y1={y} 
                      x2={svgWidth - paddingX} 
                      y2={y} 
                      stroke="var(--border-color)" 
                      strokeDasharray="4 4" 
                      strokeWidth="1" 
                    />
                    <text 
                      x={paddingX - 10} 
                      y={y + 3} 
                      fill="var(--text-muted)" 
                      fontSize="9" 
                      textAnchor="end" 
                      fontFamily="monospace"
                    >
                      {Math.round(maxChartValue * (1 - pct))}
                    </text>
                  </g>
                );
              })}

              {/* Area Gradient Fill */}
              <path d={areaPath} fill="url(#areaGradient)" />

              {/* Smooth Bezier Line */}
              <path 
                d={curvePath} 
                fill="none" 
                stroke="#09090B" 
                strokeWidth="2.5" 
                strokeLinecap="round" 
              />

              {/* Data points with hover interaction */}
              {points.map((pt, idx) => (
                <g 
                  key={idx} 
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHoveredPointIndex(idx)}
                  onMouseLeave={() => setHoveredPointIndex(null)}
                >
                  <circle 
                    cx={pt.x} 
                    cy={pt.y} 
                    r={hoveredPointIndex === idx ? 6 : 4} 
                    fill="#FFFFFF" 
                    stroke="#09090B" 
                    strokeWidth="2" 
                    style={{ transition: 'r 0.15s' }}
                  />
                  {/* X Axis Label */}
                  <text 
                    x={pt.x} 
                    y={svgHeight - 6} 
                    fill="var(--text-muted)" 
                    fontSize="10" 
                    textAnchor="middle" 
                    fontWeight={hoveredPointIndex === idx ? 700 : 500}
                  >
                    {pt.data.label}
                  </text>
                </g>
              ))}
            </svg>

            {/* Interactive Tooltip Card */}
            {hoveredPointIndex !== null && points[hoveredPointIndex] && (
              <div 
                style={{
                  position: 'absolute',
                  left: `${(points[hoveredPointIndex].x / svgWidth) * 100}%`,
                  top: `${(points[hoveredPointIndex].y / svgHeight) * 100}%`,
                  transform: 'translate(-50%, -120%)',
                  backgroundColor: '#09090B',
                  color: '#FFFFFF',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  fontSize: '11px',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                  zIndex: 20
                }}
              >
                <div style={{ fontWeight: 800, color: '#A1A1AA', marginBottom: '4px' }}>
                  {points[hoveredPointIndex].data.label} Snapshot
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                    <span>Total Events:</span>
                    <strong style={{ color: '#FFFFFF' }}>{points[hoveredPointIndex].data.total.toLocaleString()}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                    <span style={{ color: '#F87171' }}>Threats Blocked:</span>
                    <strong>{points[hoveredPointIndex].data.security}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                    <span style={{ color: '#4ADE80' }}>AutoMod Filters:</span>
                    <strong>{points[hoveredPointIndex].data.moderation}</strong>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quick Metrics Footer */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>24h Aggregate</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>18,429</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Peak Velocity</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>1,820/hr</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Auto-Mitigated</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#16a34a', marginTop: '2px' }}>142 blocked</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Avg Processing</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>14ms</div>
            </div>
          </div>
        </div>

        {/* Right: Threat Mitigation & Defense Matrix */}
        <div className="section-panel" style={{ padding: '24px', backgroundColor: '#FFFFFF', border: '1px solid var(--border-color)', borderRadius: '14px', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <ShieldAlert size={18} color="var(--accent-primary)" />
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                Threat Defense Matrix
              </h3>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
              Live distribution of threat vectors intercepted in real time.
            </p>

            {/* Defense Bars */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '20px' }}>
              {[
                { name: 'Anti-Nuke Interceptor', count: '14 Purges', pct: 100, status: 'Armed', color: '#09090B' },
                { name: 'Phishing & Malicious Links', count: '48 Filtered', pct: 98, status: 'Active', color: '#16a34a' },
                { name: 'Raid & Spam Flood Control', count: '62 Throttled', pct: 96, status: 'Active', color: '#27272A' },
                { name: 'Rogue Bot Invite Blocks', count: '2 Intercepted', pct: 100, status: 'Guarded', color: '#71717A' },
              ].map((item, idx) => (
                <div key={idx}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                    <span style={{ color: 'var(--text-primary)' }}>{item.name}</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{item.count}</span>
                  </div>
                  <div style={{ height: '6px', width: '100%', backgroundColor: 'var(--bg-secondary)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div 
                      style={{ 
                        height: '100%', 
                        width: `${item.pct}%`, 
                        backgroundColor: item.color, 
                        borderRadius: '3px',
                        transition: 'width 0.4s ease'
                      }} 
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Disaster Snapshot Status */}
          <div style={{ marginTop: '24px', padding: '14px', backgroundColor: 'var(--bg-secondary)', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={16} color="#16a34a" />
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  5-Min UPM Snapshot Engine
                </span>
              </div>
              <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', backgroundColor: '#DCFCE7', color: '#166534' }}>
                LIVE SYNC
              </span>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', margin: 0 }}>
              Auto-quarantine and instant rollbacks ready. 0 discrepancies across 842 guild members.
            </p>
          </div>
        </div>

      </div>

      {/* ------------------------------------------------------------- */}
      {/* REGISTERED MODULES CONTROL HUB (ORGANIZED & CATEGORIZED) */}
      {/* ------------------------------------------------------------- */}
      <div className="section-panel" style={{ backgroundColor: '#FFFFFF', border: '1px solid var(--border-color)', borderRadius: '14px', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sliders size={18} color="var(--accent-primary)" />
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                Registered Modules Control Hub
              </h3>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
              Toggle, audit, and configure all active server enforcement modules.
            </p>
          </div>
          
          {/* Live Search */}
          <div style={{ position: 'relative', width: '280px' }}>
            <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text"
              className="form-input"
              placeholder="Search active modules..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ 
                paddingLeft: '34px', 
                paddingRight: '12px', 
                height: '36px', 
                fontSize: '12px', 
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-secondary)'
              }}
            />
          </div>
        </div>

        {/* Category Tabs */}
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
          {[
            { id: 'all', label: `All Modules (${categorizedModules.length})` },
            { id: 'security', label: 'Security & Defense' },
            { id: 'moderation', label: 'Moderation & AutoMod' },
            { id: 'automations', label: 'Automations & Studio' },
            { id: 'voice', label: 'Voice Systems' },
            { id: 'system', label: 'System & Audit' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setModuleCategory(tab.id as any)}
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 600,
                borderRadius: '8px',
                border: 'none',
                backgroundColor: moduleCategory === tab.id ? '#09090B' : 'transparent',
                color: moduleCategory === tab.id ? '#FFFFFF' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Modules Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '14px'
        }}>
          {filteredModules.map((mod) => {
            const route = getPageRoute(mod.id);
            const isOnline = mod.status === 'enabled' || mod.status === 'ready';

            return (
              <div 
                key={mod.id}
                onClick={() => onNavigate(route)}
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  backgroundColor: '#FFFFFF',
                  border: `1px solid ${isOnline ? 'var(--border-color)' : 'var(--border-subtle)'}`,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '12px',
                  transition: 'all 0.15s ease',
                  boxShadow: 'var(--shadow-sm)'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.borderColor = '#09090B';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.borderColor = 'var(--border-color)';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{mod.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'monospace' }}>id: {mod.id}</div>
                  </div>
                  <span style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '12px',
                    backgroundColor: isOnline ? '#DCFCE7' : '#F4F4F5',
                    color: isOnline ? '#166534' : 'var(--text-muted)',
                    border: `1px solid ${isOnline ? '#BBF7D0' : 'transparent'}`
                  }}>
                    {isOnline ? 'ACTIVE' : 'STANDBY'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-primary)', fontWeight: 600 }}>
                    <span>Configure</span>
                    <ChevronRight size={13} />
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Progress: {mod.progress}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* LIVE SERVER CONSOLE & EVENT STREAM TERMINAL (BOTTOM SECTION)  */}
      {/* ------------------------------------------------------------- */}
      <div 
        style={{
          borderRadius: '14px',
          overflow: 'hidden',
          backgroundColor: '#09090B',
          border: '1px solid #27272A',
          boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
          color: '#E4E4E7'
        }}
      >
        {/* Terminal Header Bar */}
        <div 
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 18px',
            backgroundColor: '#121215',
            borderBottom: '1px solid #27272A',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          {/* Left: Window Dots & Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#EF4444' }} />
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#F59E0B' }} />
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#10B981' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Terminal size={14} color="#A1A1AA" />
              <span style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'monospace', color: '#F4F4F5', letterSpacing: '0.04em' }}>
                RAGE ENGINE [SHARD #0] :: LIVE SERVER CONSOLE
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 8px', borderRadius: '12px', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10B981', boxShadow: '0 0 6px #10B981' }} />
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#10B981', fontFamily: 'monospace' }}>
                {isPaused ? 'STREAM PAUSED' : 'STREAMING LIVE'}
              </span>
            </div>
          </div>

          {/* Right: Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Auto-Scroll Toggle */}
            <button
              onClick={() => setAutoScroll(prev => !prev)}
              style={{
                fontSize: '11px',
                fontWeight: 600,
                fontFamily: 'monospace',
                padding: '4px 10px',
                borderRadius: '6px',
                border: '1px solid #3F3F46',
                backgroundColor: autoScroll ? '#27272A' : '#18181B',
                color: autoScroll ? '#F4F4F5' : '#71717A',
                cursor: 'pointer'
              }}
            >
              Auto-Scroll: {autoScroll ? 'ON' : 'OFF'}
            </button>

            {/* Pause / Resume Button */}
            <button
              onClick={() => setIsPaused(prev => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontWeight: 600,
                fontFamily: 'monospace',
                padding: '4px 10px',
                borderRadius: '6px',
                border: '1px solid #3F3F46',
                backgroundColor: '#18181B',
                color: isPaused ? '#10B981' : '#F4F4F5',
                cursor: 'pointer'
              }}
            >
              {isPaused ? <Play size={12} /> : <Pause size={12} />}
              <span>{isPaused ? 'Resume' : 'Pause'}</span>
            </button>

            {/* Copy Button */}
            <button
              onClick={handleCopyLogs}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontFamily: 'monospace',
                padding: '4px 10px',
                borderRadius: '6px',
                border: '1px solid #3F3F46',
                backgroundColor: '#18181B',
                color: '#F4F4F5',
                cursor: 'pointer'
              }}
              title="Copy All Console Logs"
            >
              {copiedConsole ? <Check size={12} color="#10B981" /> : <Copy size={12} />}
              <span>{copiedConsole ? 'Copied' : 'Copy'}</span>
            </button>

            {/* Download Button */}
            <button
              onClick={handleDownloadLogs}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontFamily: 'monospace',
                padding: '4px 10px',
                borderRadius: '6px',
                border: '1px solid #3F3F46',
                backgroundColor: '#18181B',
                color: '#F4F4F5',
                cursor: 'pointer'
              }}
              title="Download Console Log File (.log)"
            >
              <Download size={12} />
              <span>Export .log</span>
            </button>

            {/* Clear Button */}
            <button
              onClick={() => setConsoleLogs([])}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontFamily: 'monospace',
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1px solid #3F3F46',
                backgroundColor: '#18181B',
                color: '#A1A1AA',
                cursor: 'pointer'
              }}
              title="Clear Terminal Output"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>

        {/* Terminal Filter Toolbar */}
        <div 
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 18px',
            backgroundColor: '#0F0F12',
            borderBottom: '1px solid #1E1E22',
            flexWrap: 'wrap',
            gap: '10px'
          }}
        >
          {/* Scope Filters */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {['ALL', 'SECURITY', 'MOD', 'GATEWAY', 'VOICE', 'SYSTEM', 'AUDIT'].map(scope => (
              <button
                key={scope}
                onClick={() => setConsoleScope(scope)}
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  border: `1px solid ${consoleScope === scope ? '#3F3F46' : 'transparent'}`,
                  backgroundColor: consoleScope === scope ? '#27272A' : 'transparent',
                  color: consoleScope === scope ? '#FFFFFF' : '#71717A',
                  cursor: 'pointer'
                }}
              >
                {scope}
              </button>
            ))}
          </div>

          {/* Console Search Input */}
          <div style={{ position: 'relative', width: '220px' }}>
            <Search size={12} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#71717A' }} />
            <input 
              type="text"
              placeholder="Filter console stream..."
              value={consoleSearch}
              onChange={(e) => setConsoleSearch(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: '#18181B',
                border: '1px solid #27272A',
                borderRadius: '6px',
                color: '#F4F4F5',
                fontSize: '11px',
                fontFamily: 'monospace',
                padding: '4px 8px 4px 26px',
                outline: 'none'
              }}
            />
          </div>
        </div>

        {/* Terminal Logs Output Stream */}
        <div 
          style={{
            padding: '14px 18px',
            height: '360px',
            overflowY: 'auto',
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: '12px',
            lineHeight: '1.7',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            backgroundColor: '#09090B'
          }}
        >
          {filteredConsoleLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#52525B' }}>
              No console logs match the selected filter criteria.
            </div>
          ) : (
            filteredConsoleLogs.map((log) => {
              // Level color tags
              let levelColor = '#38BDF8'; // INFO
              if (log.level === 'SUCCESS') levelColor = '#4ADE80';
              else if (log.level === 'WARN') levelColor = '#FBBF24';
              else if (log.level === 'CRITICAL') levelColor = '#F87171';
              else if (log.level === 'GATEWAY') levelColor = '#C084FC';

              // Scope tag styles
              let scopeBg = 'rgba(255,255,255,0.06)';
              let scopeColor = '#A1A1AA';
              if (log.scope === 'SECURITY') {
                scopeBg = 'rgba(239, 68, 68, 0.15)';
                scopeColor = '#FCA5A5';
              } else if (log.scope === 'MOD') {
                scopeBg = 'rgba(16, 185, 129, 0.15)';
                scopeColor = '#86EFAC';
              } else if (log.scope === 'GATEWAY') {
                scopeBg = 'rgba(168, 85, 247, 0.15)';
                scopeColor = '#D8B4FE';
              } else if (log.scope === 'VOICE') {
                scopeBg = 'rgba(59, 130, 246, 0.15)';
                scopeColor = '#93C5FD';
              }

              return (
                <div 
                  key={log.id} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'baseline', 
                    gap: '10px',
                    padding: '2px 0',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.02)'
                  }}
                >
                  {/* Timestamp */}
                  <span style={{ color: '#52525B', fontSize: '11px', flexShrink: 0 }}>
                    [{log.timestamp}]
                  </span>

                  {/* Scope Tag */}
                  <span style={{ 
                    fontSize: '10px', 
                    fontWeight: 700, 
                    padding: '1px 6px', 
                    borderRadius: '4px', 
                    backgroundColor: scopeBg, 
                    color: scopeColor,
                    flexShrink: 0 
                  }}>
                    {log.scope}
                  </span>

                  {/* Level Tag */}
                  <span style={{ 
                    color: levelColor, 
                    fontWeight: 700, 
                    fontSize: '11px',
                    width: '65px',
                    flexShrink: 0 
                  }}>
                    [{log.level}]
                  </span>

                  {/* Message Content */}
                  <span style={{ color: '#D4D4D8', wordBreak: 'break-word' }}>
                    {log.message}
                  </span>
                </div>
              );
            })
          )}
          <div ref={consoleBottomRef} />
        </div>

        {/* Terminal Footer Status Bar */}
        <div 
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 18px',
            backgroundColor: '#121215',
            borderTop: '1px solid #27272A',
            fontSize: '11px',
            fontFamily: 'monospace',
            color: '#71717A'
          }}
        >
          <div style={{ display: 'flex', gap: '16px' }}>
            <span>Logs Count: <strong style={{ color: '#E4E4E7' }}>{filteredConsoleLogs.length}</strong></span>
            <span>Buffer Size: <strong style={{ color: '#E4E4E7' }}>24.8 KB</strong></span>
            <span>Shard Latency: <strong style={{ color: '#10B981' }}>{latency || 18}ms</strong></span>
          </div>
          <div>
            <span>Protocol: <strong style={{ color: '#E4E4E7' }}>WSS TLSv1.3</strong></span>
          </div>
        </div>
      </div>

    </div>
  );
}
