import React, { useState } from 'react';
import { 
  ShieldCheck, Users, Activity, ShieldAlert, Award, Clock, ArrowUpRight, 
  Settings2, ChevronRight, CheckCircle2, ShieldOff, AlertTriangle, Search,
  Sliders, Bot, CreditCard, Sparkles, MessageSquare, Volume2, Music, LineChart, FileText, Gift, Send, Bell, Radio, Zap
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
}

export function DashboardHome({ events, latency, uptime, onNavigate, onManualTrigger, modules, registry }: DashboardHomeProps) {
  const [searchQuery, setSearchQuery] = useState('');

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

  // Deduplicate modules list for UI presentation
  const hiddenModuleIds = new Set(['bot_whitelist', 'role_whitelist', 'tickets', 'welcome']);

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

  const filteredModules = (modules || [])
    .filter(m => !hiddenModuleIds.has(m.id))
    .filter(m => 
      !searchQuery.trim() || 
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      m.id.toLowerCase().includes(searchQuery.toLowerCase())
    );

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
            borderRadius: '8px' 
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
      <div className="page-header">
        <div className="page-title-row">
          <div>
            <h1 className="page-title">Operational Overview</h1>
            <p className="page-subtitle">Real-time status check and module management suite.</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-secondary" onClick={() => onNavigate('health')}>
              <AlertTriangle size={14} color="var(--color-warning)" />
              <span>Config Health</span>
            </button>
            <button className="btn btn-primary" onClick={() => {
              onManualTrigger('Owner triggered audit check across all gateway shards.', 'purple', 'System');
            }}>
              <span>Trigger Manual Audit</span>
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards Row */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-header">
            <span>Global Setup Progress</span>
            <ShieldCheck size={18} color="var(--accent-primary)" />
          </div>
          <span className="stat-value">{averageProgress}%</span>
          <div className="stat-footer">
            <span className="stat-trend up">{modules.filter(m => m.status === 'enabled').length} / {modules.length} active</span>
            <span style={{ color: 'var(--text-muted)' }}>• modules online</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span>Online Members</span>
            <Users size={18} color="var(--accent-primary)" />
          </div>
          <span className="stat-value">{Number(liveOnlineMembers).toLocaleString()}</span>
          <div className="stat-footer">
            <span className="stat-trend up">Live Sync</span>
            <span style={{ color: 'var(--text-muted)' }}>• of {Number(liveTotalMembers).toLocaleString()} total members</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span>Active Staff On Duty</span>
            <Award size={18} color="var(--accent-purple)" />
          </div>
          <span className="stat-value">{onlineStaffCount} / {totalStaffCount}</span>
          <div className="stat-footer">
            <span className="stat-trend neutral">On Call</span>
            <span style={{ color: 'var(--text-muted)' }}>• {totalStaffCount - onlineStaffCount} offline</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-header">
            <span>Active Quarantines</span>
            <ShieldAlert size={18} color={quarantinedCount > 0 ? "var(--color-warning)" : "var(--text-muted)"} />
          </div>
          <span className="stat-value" style={{ color: quarantinedCount > 0 ? 'var(--color-warning)' : 'inherit' }}>
            {quarantinedCount}
          </span>
          <div className="stat-footer">
            <span className="stat-trend neutral">Resolved: {resolvedCount}</span>
            <span style={{ color: 'var(--text-muted)' }}>• {pendingCount} pending audit</span>
          </div>
        </div>
      </div>

      {/* Module Operations Hub with Live Search */}
      <div className="section-panel">
        <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={18} color="var(--accent-primary)" />
            <span>Registered Modules Control Hub</span>
          </div>
          
          <div style={{ position: 'relative', width: '260px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text"
              className="form-input"
              placeholder="Search modules..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '32px', paddingRight: '12px', height: '34px', fontSize: '12px', borderRadius: '20px' }}
            />
          </div>
        </div>

        <div className="panel-body" style={{ padding: '20px' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '16px'
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
                    backgroundColor: 'var(--bg-secondary)',
                    border: `1px solid ${isOnline ? 'rgba(16, 185, 129, 0.25)' : 'var(--border-color)'}`,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '12px',
                    transition: 'transform 0.15s, border-color 0.15s',
                    boxShadow: isOnline ? '0 0 12px rgba(16, 185, 129, 0.04)' : 'none'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.borderColor = 'var(--accent-primary)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.borderColor = isOnline ? 'rgba(16, 185, 129, 0.25)' : 'var(--border-color)';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{mod.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'monospace' }}>id: {mod.id}</div>
                    </div>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: '12px',
                      backgroundColor: isOnline ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                      color: isOnline ? '#10b981' : 'var(--text-muted)',
                      border: `1px solid ${isOnline ? 'rgba(16, 185, 129, 0.3)' : 'transparent'}`
                    }}>
                      {isOnline ? 'ACTIVE' : 'STANDBY'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--accent-primary)', fontWeight: 600 }}>
                      <span>Manage Settings</span>
                      <ChevronRight size={14} />
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
      </div>

      {/* Secondary Dashboard Grid */}
      <div className="dashboard-layout-grid">
        
        {/* Main Left Pane: Live Activity Feed */}
        <div className="section-panel">
          <div className="panel-header">
            <div className="panel-title">
              <Activity size={16} color="var(--accent-primary)" />
              <span>Live System Activity Stream</span>
            </div>
            <StatusBadge status="success" label="Websocket Live" />
          </div>
          <div className="panel-body" style={{ padding: '0', overflowY: 'auto', maxHeight: '420px' }}>
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th style={{ width: '90px' }}>Time</th>
                    <th style={{ width: '120px' }}>Scope</th>
                    <th>Action / Log Details</th>
                    <th style={{ width: '100px', textAlign: 'right' }}>Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {events.slice(0, 10).map((event) => (
                    <tr key={event.id}>
                      <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>{event.timestamp}</td>
                      <td>
                        <span style={{ 
                          fontSize: '11px', 
                          fontWeight: 600, 
                          color: event.category === 'Security' ? 'var(--color-warning)' : 'var(--text-secondary)',
                          backgroundColor: 'rgba(255,255,255,0.03)',
                          padding: '2px 6px',
                          borderRadius: '4px'
                        }}>
                          {event.category}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{event.message}</td>
                      <td style={{ textAlign: 'right' }}>
                        <StatusBadge status={event.type} label={event.type} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Sidebar Right Pane: Quick Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="section-panel">
            <div className="panel-header">
              <span className="panel-title">Quick Operational Actions</span>
            </div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { label: 'Configure AntiLink Ignored Rules', page: 'automod' },
                { label: 'Setup Enterprise Payment QR', page: 'payment' },
                { label: 'Resolve Validation Warnings', page: 'health' },
                { label: 'Create Instant Server Backup', page: 'backups' },
                { label: 'Modify Anti-Raid Thresholds', page: 'security' },
                { label: 'Export Current System Logs', page: 'logs' }
              ].map((act, i) => (
                <button
                  key={i}
                  onClick={() => onNavigate(act.page)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 'var(--border-radius-md)',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'rgba(0,0,0,0.1)',
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    transition: 'all var(--transition-fast)'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'var(--accent-primary)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                    e.currentTarget.style.backgroundColor = 'rgba(79,140,255,0.02)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                    e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.1)';
                  }}
                >
                  <span>{act.label}</span>
                  <ArrowUpRight size={14} color="var(--text-muted)" />
                </button>
              ))}
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
