import { API_BASE } from '../config';
import React, { useState, useEffect } from 'react';
import { LineChart, BarChart2, Activity, Shield, Users, AlertTriangle, CheckCircle2, Zap, Server, Clock, Calendar } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface AnalyticsProps {
  modules: any[];
  registry: { roles: any[]; channels: any[]; memberCount?: number; onlineCount?: number };
  syncLogs: { time: string; msg: string; type: string }[];
}

export function Analytics({ modules, registry, syncLogs }: AnalyticsProps) {
  const { token, activeGuildId } = useAuth();
  const [days, setDays] = useState(7);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeHoverIdx, setActiveHoverIdx] = useState<number | null>(null);

  // Fetch summary
  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        const guildId = activeGuildId || localStorage.getItem('cn_active_guild') || '';
        if (!guildId) {
          if (active) setLoading(false);
          return;
        }
        const res = await fetch(`${API_BASE}/api/analytics/summary?guildId=${guildId}&days=${days}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Guild-Id': guildId
          }
        });
        if (res.ok && active) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error('[Analytics] Error fetching analytics data:', err);
      }
      if (active) setLoading(false);
    };
    fetchData();
    return () => { active = false; };
  }, [days, token, activeGuildId]);

  const totalMembers = registry.memberCount ?? 0;
  const onlineMembers = registry.onlineCount ?? 0;
  const enabledModules = modules.filter(m => m.status === 'enabled').length;
  const errorModules = modules.filter(m => m.status === 'validation_failed' || m.errors.length > 0).length;
  const totalRoles = registry.roles.length;
  const totalChannels = registry.channels.length;
  const recentIncidents = syncLogs.filter(l => l.type === 'warn').slice(0, 10);

  // SVG Line Chart Helpers
  const chartWidth = 500;
  const chartHeight = 160;
  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 30;

  const pointsWidth = chartWidth - paddingLeft - paddingRight;
  const pointsHeight = chartHeight - paddingTop - paddingBottom;

  const maxVal = Math.max(...(data.map(d => d.joins + d.leaves) || [10])) || 10;

  // Generate SVG coordinates for Join/Leave line
  const pointsList = data.map((d, index) => {
    const x = paddingLeft + (index / (data.length - 1 || 1)) * pointsWidth;
    const y = chartHeight - paddingBottom - ((d.joins || 0) / maxVal) * pointsHeight;
    return { x, y, data: d };
  });

  const linePath = pointsList.length > 0 
    ? `M ${pointsList[0].x} ${pointsList[0].y} ` + pointsList.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
    : '';

  const areaPath = pointsList.length > 0
    ? `${linePath} L ${pointsList[pointsList.length - 1].x} ${chartHeight - paddingBottom} L ${pointsList[0].x} ${chartHeight - paddingBottom} Z`
    : '';

  // Command usage totals
  const commandTotals: Record<string, number> = {};
  data.forEach(d => {
    if (d.commands) {
      Object.entries(d.commands).forEach(([name, count]) => {
        commandTotals[name] = (commandTotals[name] || 0) + (count as number);
      });
    }
  });
  const commandList = Object.entries(commandTotals)
    .map(([name, val]) => ({ name, val }))
    .sort((a, b) => b.val - a.val)
    .slice(0, 5);

  const maxCommandVal = Math.max(...commandList.map(c => c.val), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Analytics & Intelligence</h1>
          <p className="page-subtitle">Real-time metrics, server health, command trends, and security audits.</p>
        </div>
        <div style={{ display: 'flex', gap: 6, background: 'rgba(255,255,255,0.03)', padding: 3, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
          {[7, 14, 30].map(d => (
            <button key={d} onClick={() => setDays(d)}
              style={{
                padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                background: days === d ? 'rgba(124,92,252,0.2)' : 'transparent',
                color: days === d ? '#A78BFA' : 'var(--text-muted)'
              }}>
              {d} Days
            </button>
          ))}
        </div>
      </div>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        {[
          { label: 'Total Members', val: totalMembers || '—', icon: <Users size={18} />, color: 'var(--accent-primary)', sub: `${onlineMembers} online` },
          { label: 'Active Modules', val: `${enabledModules} / ${modules.length}`, icon: <Zap size={18} />, color: 'var(--color-success)', sub: `${errorModules} warnings` },
          { label: 'Server Roles', val: totalRoles, icon: <Shield size={18} />, color: 'var(--accent-purple)', sub: 'live from Discord' },
          { label: 'Channels', val: totalChannels, icon: <Server size={18} />, color: 'var(--color-warning)', sub: 'all types' },
        ].map((kpi, i) => (
          <div key={i} className="section-panel" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{kpi.label}</div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '6px' }}>{kpi.val}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{kpi.sub}</div>
              </div>
              <div style={{ color: kpi.color, opacity: 0.8 }}>{kpi.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Section */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        
        {/* Member Growth SVG Line Chart */}
        <div className="section-panel">
          <div className="panel-header">
            <div className="panel-title"><LineChart size={16} color="var(--accent-primary)" /><span>Member Growth (Daily Joins)</span></div>
          </div>
          <div className="panel-body" style={{ padding: '16px 20px', minHeight: 200, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {loading ? (
              <div style={{ display: 'flex', height: 160, alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Loading growth data...</div>
            ) : (
              <div style={{ position: 'relative' }}>
                <svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} style={{ overflow: 'visible' }}>
                  {/* Grid Lines */}
                  {[0, 0.25, 0.5, 0.75, 1].map((r, i) => {
                    const y = paddingTop + r * pointsHeight;
                    const val = Math.round(maxVal * (1 - r));
                    return (
                      <g key={i}>
                        <line x1={paddingLeft} y1={y} x2={chartWidth - paddingRight} y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="3,3" />
                        <text x={paddingLeft - 8} y={y + 4} textAnchor="end" fontSize={9} fill="var(--text-muted)" fontFamily="inherit">{val}</text>
                      </g>
                    );
                  })}
                  {/* Date labels */}
                  {data.map((d, i) => {
                    if (i === 0 || i === data.length - 1 || (data.length > 7 && i === Math.floor(data.length / 2))) {
                      const x = paddingLeft + (i / (data.length - 1 || 1)) * pointsWidth;
                      const displayDate = d.date.split('-').slice(1).join('/');
                      return (
                        <text key={i} x={x} y={chartHeight - 8} textAnchor="middle" fontSize={9} fill="var(--text-muted)" fontFamily="inherit">{displayDate}</text>
                      );
                    }
                    return null;
                  })}
                  {/* Line & Area */}
                  {pointsList.length > 0 && (
                    <>
                      <path d={areaPath} fill="url(#joins-gradient)" opacity={0.15} />
                      <path d={linePath} fill="none" stroke="var(--accent-primary)" strokeWidth={2} strokeLinecap="round" />
                    </>
                  )}
                  {/* Interaction Dots */}
                  {pointsList.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={activeHoverIdx === i ? 6 : 3}
                      fill={activeHoverIdx === i ? 'var(--accent-primary)' : 'rgba(124,92,252,0.4)'}
                      stroke="#fff" strokeWidth={activeHoverIdx === i ? 2 : 0}
                      style={{ transition: 'r 0.1s, fill 0.1s', cursor: 'pointer' }}
                      onMouseEnter={() => setActiveHoverIdx(i)}
                      onMouseLeave={() => setActiveHoverIdx(null)}
                    />
                  ))}
                  {/* Defs for gradient */}
                  <defs>
                    <linearGradient id="joins-gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent-primary)" />
                      <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                </svg>

                {/* Tooltip */}
                {activeHoverIdx !== null && data[activeHoverIdx] && (
                  <div style={{
                    position: 'absolute', top: 0, left: 50, background: 'rgba(30, 31, 34, 0.95)',
                    border: '1px solid rgba(124,92,252,0.3)', borderRadius: 6, padding: '8px 12px',
                    pointerEvents: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', zIndex: 10
                  }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>{data[activeHoverIdx].date}</div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                      <span style={{ fontSize: 12, color: 'var(--color-success)', fontWeight: 700 }}>+{data[activeHoverIdx].joins} Joins</span>
                      <span style={{ fontSize: 12, color: 'var(--color-danger)', fontWeight: 700 }}>-{data[activeHoverIdx].leaves} Leaves</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Command Usage SVG Bar Chart */}
        <div className="section-panel">
          <div className="panel-header">
            <div className="panel-title"><BarChart2 size={16} color="var(--accent-purple)" /><span>Top Commands Executed</span></div>
          </div>
          <div className="panel-body" style={{ padding: '16px 20px', minHeight: 200, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {loading ? (
              <div style={{ display: 'flex', height: 160, alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Loading usage stats...</div>
            ) : commandList.length === 0 ? (
              <div style={{ display: 'flex', height: 160, alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No commands executed in this timeframe.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {commandList.map((cmd, i) => {
                  const pct = Math.round((cmd.val / maxCommandVal) * 100);
                  return (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>/{cmd.name}</span>
                        <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{cmd.val} runs</span>
                      </div>
                      <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 4, background: 'linear-gradient(90deg, #7C5CFC, #A78BFA)', transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        
        {/* Message Volume Grid / Vertical Charts */}
        <div className="section-panel">
          <div className="panel-header">
            <div className="panel-title"><Activity size={16} color="var(--color-success)" /><span>Activity Heatmap</span></div>
          </div>
          <div className="panel-body" style={{ padding: '16px 20px', display: 'flex', flexWrap: 'wrap', gap: 14 }}>
            {data.map((d, i) => {
              const totalAct = d.messages + d.voiceMinutes + (d.joins * 2);
              const opacity = Math.min(1, Math.max(0.1, totalAct / 500));
              return (
                <div key={i} style={{
                  flex: '1 0 50px', background: `rgba(34, 197, 94, ${opacity})`, borderRadius: 8, padding: '10px 8px',
                  textAlign: 'center', border: '1px solid rgba(34,197,94,0.1)'
                }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{totalAct}</div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>{d.date.split('-').slice(2).join('/')}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Security Incident Timeline */}
        <div className="section-panel">
          <div className="panel-header">
            <div className="panel-title"><AlertTriangle size={16} color="var(--color-warning)" /><span>Live Security Incidents</span></div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{recentIncidents.length} logged</div>
          </div>
          <div className="panel-body" style={{ padding: 0, maxHeight: '240px', overflowY: 'auto' }}>
            {recentIncidents.length === 0
              ? <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No security warnings this session.</div>
              : recentIncidents.map((log, i) => (
                <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <AlertTriangle size={12} color="var(--color-warning)" style={{ marginTop: '2px', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{log.msg}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: '2px' }}>{log.time}</div>
                  </div>
                </div>
              ))
            }
          </div>
        </div>

      </div>

    </div>
  );
}
