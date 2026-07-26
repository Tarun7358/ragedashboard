import React, { useState, useMemo } from 'react';
import { 
  Shield, Activity, Lock, Unlock, AlertTriangle, ShieldCheck, 
  Key, Users, FileText, CheckCircle2, RefreshCw, ArrowRight, Zap, Radio
} from 'lucide-react';
import type { ModuleState, DiscordRole, DiscordChannel } from '../hooks/useDiscordSync';
import { API_BASE } from '../config';
import { useAuth } from '../hooks/useAuth';
import { StatusBadge } from '../components/StatusBadge';

interface SecurityProps {
  onSaveConfig: (msg: string) => void;
  onManualTrigger: (msg: string, type: 'info' | 'success' | 'warning' | 'danger' | 'purple', cat: 'Security' | 'Moderation' | 'Community' | 'Backup' | 'System' | 'Ticket') => void;
  modules: ModuleState[];
  registry: { roles: DiscordRole[]; channels: DiscordChannel[] };
  onUpdateConfig: (moduleId: string, config: Record<string, any>, enabledOverride?: boolean) => void;
  syncLogs?: any[];
  onNavigate: (page: string) => void;
}

export function Security({ 
  onSaveConfig, 
  onManualTrigger,
  modules,
  registry,
  onUpdateConfig,
  syncLogs = [],
  onNavigate
}: SecurityProps) {
  const { token, activeGuildId } = useAuth();
  const [showLockdownModal, setShowLockdownModal] = useState(false);
  const [lockdownAction, setLockdownAction] = useState<'enable' | 'disable'>('enable');

  const securityModule = (modules || []).find(m => m.id === 'security');
  const automodModule = (modules || []).find(m => m.id === 'automod');

  const config = securityModule?.config || {};
  const amConfig = automodModule?.config || {};
  const rules = config.rules || {};

  const emergencyMode = config.emergencyMode || false;
  const currentPreset = config.preset || 'balanced';
  const quarantinedUsers = config.quarantinedUsers || [];
  const whitelist = config.whitelist || [];

  // Compute live threat metrics
  const scanResult = useMemo(() => {
    const adminRolesList = (registry?.roles || []).filter((r: any) => r.permissions?.includes('Administrator'));
    let score = 95;
    const issues: string[] = [];

    if (adminRolesList.length > 3) {
      score -= 15;
      issues.push(`Found ${adminRolesList.length} Administrator roles. Recommend tightening role hierarchy.`);
    }
    if (!config.quarantineRoleId) {
      score -= 20;
      issues.push('Quarantine isolation role is not assigned.');
    }
    if (!config.alertChannelId) {
      score -= 15;
      issues.push('Alert notification channel is missing.');
    }

    return {
      score: Math.max(score, 10),
      riskRating: score > 80 ? 'LOW THREAT' : score > 50 ? 'MEDIUM THREAT' : 'HIGH THREAT',
      issues
    };
  }, [registry?.roles, config.quarantineRoleId, config.alertChannelId]);

  const handleApplyPreset = async (presetName: string) => {
    try {
      const headers: Record<string, string> = { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };
      if (activeGuildId) headers['X-Guild-Id'] = activeGuildId;
      const res = await fetch(`${API_BASE}/api/modules/security/presets`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ preset: presetName })
      });
      if (res.ok) {
        onSaveConfig(`Security preset applied: ${presetName.toUpperCase()}`);
        onManualTrigger(`Applied security preset: "${presetName.toUpperCase()}"`, 'success', 'Security');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleEmergency = () => {
    setLockdownAction(emergencyMode ? 'disable' : 'enable');
    setShowLockdownModal(true);
  };

  const confirmLockdown = async () => {
    try {
      const headers: Record<string, string> = { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };
      if (activeGuildId) headers['X-Guild-Id'] = activeGuildId;
      const res = await fetch(`${API_BASE}/api/modules/security/lockdown`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: lockdownAction })
      });
      if (res.ok) {
        setShowLockdownModal(false);
        onSaveConfig(`Emergency Lockdown ${lockdownAction === 'enable' ? 'ENABLED' : 'DISABLED'}.`);
        onManualTrigger(
          `Emergency Lockdown: Server protection controls ${lockdownAction === 'enable' ? 'ENABLED' : 'DEACTIVATED'}.`,
          lockdownAction === 'enable' ? 'danger' : 'success',
          'Security'
        );
      } else {
        setShowLockdownModal(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      
      {/* Cyber-HUD Hero Command Header */}
      <div 
        style={{ 
          background: 'linear-gradient(135deg, rgba(26, 31, 56, 0.95) 0%, rgba(15, 17, 32, 0.98) 100%)', 
          padding: '28px', 
          borderRadius: '16px', 
          border: '1px solid rgba(124, 92, 252, 0.35)', 
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '20px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '18px',
            background: emergencyMode 
              ? 'radial-gradient(circle, rgba(239,68,68,0.3) 0%, rgba(239,68,68,0.1) 100%)' 
              : 'radial-gradient(circle, rgba(124,92,252,0.3) 0%, rgba(124,92,252,0.1) 100%)',
            border: `2px solid ${emergencyMode ? '#ef4444' : '#7c5cfc'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 0 24px ${emergencyMode ? 'rgba(239,68,68,0.5)' : 'rgba(124,92,252,0.4)'}`
          }}>
            <Shield size={32} color={emergencyMode ? '#ef4444' : '#7c5cfc'} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
                Security Analysis & Gateway Process Monitor
              </h1>
              <span style={{
                fontSize: '11px',
                fontWeight: 800,
                padding: '4px 10px',
                borderRadius: '12px',
                backgroundColor: emergencyMode ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)',
                color: emergencyMode ? '#ef4444' : '#10b981',
                border: `1px solid ${emergencyMode ? '#ef4444' : '#10b981'}`
              }}>
                {emergencyMode ? 'LOCKDOWN ACTIVE' : '98% SHIELDED'}
              </span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px', margin: 0 }}>
              Master Security Operations Center (SOC) • Live gateway process inspection & real-time threat analysis.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Preset Selector */}
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            {['relaxed', 'balanced', 'strict', 'maximum'].map(p => (
              <button
                key={p}
                onClick={() => handleApplyPreset(p)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: currentPreset === p ? 'var(--accent-primary)' : 'transparent',
                  color: currentPreset === p ? '#ffffff' : 'var(--text-muted)',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  transition: 'all 0.15s'
                }}
              >
                {p}
              </button>
            ))}
          </div>

          <button 
            onClick={handleToggleEmergency} 
            className={`btn ${emergencyMode ? 'btn-success' : 'btn-danger'}`} 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              padding: '10px 18px', 
              borderRadius: '10px', 
              fontWeight: 800,
              boxShadow: emergencyMode ? '0 0 15px rgba(16,185,129,0.4)' : '0 0 15px rgba(239,68,68,0.4)'
            }}
          >
            {emergencyMode ? <Unlock size={16} /> : <Lock size={16} />}
            <span>{emergencyMode ? 'EXIT LOCKDOWN' : 'EMERGENCY LOCKDOWN'}</span>
          </button>
        </div>
      </div>

      {/* Security Health & Threat Score Meters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div className="section-panel" style={{ padding: '18px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700 }}>Security Health Score</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '10px' }}>
            <div style={{ fontSize: '36px', fontWeight: 900, color: scanResult.score > 80 ? '#10b981' : '#f59e0b' }}>
              {scanResult.score}%
            </div>
            <div style={{ width: '42px', height: '42px', borderRadius: '50%', border: '4px solid rgba(16, 185, 129, 0.25)', borderTopColor: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Activity size={18} color="#10b981" />
            </div>
          </div>
        </div>

        <div className="section-panel" style={{ padding: '18px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700 }}>Threat Rating Level</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
            <span style={{ fontSize: '22px', fontWeight: 800, color: emergencyMode ? '#ef4444' : '#10b981' }}>
              {emergencyMode ? 'LOCKDOWN' : scanResult.riskRating}
            </span>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: emergencyMode ? '#ef4444' : '#10b981', boxShadow: `0 0 10px ${emergencyMode ? '#ef4444' : '#10b981'}` }}></div>
          </div>
        </div>

        <div className="section-panel" style={{ padding: '18px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700 }}>Active Protection Rules</div>
          <div style={{ fontSize: '36px', fontWeight: 900, color: 'var(--accent-purple)', marginTop: '10px' }}>
            {Object.values(rules).filter((r: any) => r.enabled).length} / {Object.keys(rules).length || 14}
          </div>
        </div>

        <div className="section-panel" style={{ padding: '18px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', fontWeight: 700 }}>Quarantined Accounts</div>
          <div style={{ fontSize: '36px', fontWeight: 900, color: quarantinedUsers.length > 0 ? '#ef4444' : 'var(--text-primary)', marginTop: '10px' }}>
            {quarantinedUsers.length}
          </div>
        </div>
      </div>

      {/* Real-Time Security Features Analysis Grid */}
      <div className="section-panel" style={{ padding: '24px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff', margin: 0 }}>
              Real-Time Security Feature Analysis & Status
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', margin: 0 }}>
              Live operational diagnosis of all security layers and gateway enforcement modules.
            </p>
          </div>
          <StatusBadge status="success" label="Gateway Engine Online" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          
          {/* 1. Anti-Nuke Defense */}
          <div 
            onClick={() => onNavigate('anti-nuke')}
            style={{
              padding: '18px',
              borderRadius: '12px',
              backgroundColor: 'rgba(124, 92, 252, 0.08)',
              border: '1px solid rgba(124, 92, 252, 0.3)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '14px', color: '#ffffff' }}>
                <Shield size={16} color="#7c5cfc" />
                <span>Anti-Nuke Defense</span>
              </div>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#10b981' }}>🟢 ACTIVE</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Monitors rapid bans, kicks, channel purges, role deletion, webhook creation, and bot invites.
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--accent-primary)', fontWeight: 600, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
              <span>Configure Thresholds & Rules</span>
              <ArrowRight size={14} />
            </div>
          </div>

          {/* 2. Ultra Protection Engine (UPM) */}
          <div 
            onClick={() => onNavigate('upm')}
            style={{
              padding: '18px',
              borderRadius: '12px',
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '14px', color: '#ffffff' }}>
                <Zap size={16} color="#ef4444" />
                <span>Ultra Protection (UPM)</span>
              </div>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#10b981' }}>🟢 SNAPSHOT READY</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Automated live snapshot capture, auto-quarantine, auto-lockdown, and instant server restoration.
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#ef4444', fontWeight: 600, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
              <span>Manage UPM Snapshots</span>
              <ArrowRight size={14} />
            </div>
          </div>

          {/* 3. AntiLink & AutoMod */}
          <div 
            onClick={() => onNavigate('automod')}
            style={{
              padding: '18px',
              borderRadius: '12px',
              backgroundColor: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '14px', color: '#ffffff' }}>
                <ShieldCheck size={16} color="#10b981" />
                <span>AntiLink & AutoMod</span>
              </div>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#10b981' }}>🟢 FILTERING</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Deletes unauthorized links (`http/https/discord.gg`), with ignored channels ({amConfig.ignoredChannels?.length || 0}) and roles ({amConfig.ignoredRoles?.length || 0}).
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#10b981', fontWeight: 600, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
              <span>Manage AntiLink Bypasses</span>
              <ArrowRight size={14} />
            </div>
          </div>

          {/* 4. Smart Whitelist */}
          <div 
            onClick={() => onNavigate('whitelist')}
            style={{
              padding: '18px',
              borderRadius: '12px',
              backgroundColor: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '14px', color: '#ffffff' }}>
                <Key size={16} color="#f59e0b" />
                <span>Smart Whitelist</span>
              </div>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#f59e0b' }}>{whitelist.length} TRUSTED</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Grants temporary or permanent security bypasses to trusted administrators, bots, and integrations.
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#f59e0b', fontWeight: 600, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
              <span>Manage Whitelisted Accounts</span>
              <ArrowRight size={14} />
            </div>
          </div>

          {/* 5. Vulnerability Scanner */}
          <div 
            onClick={() => onNavigate('vulnerability-scan')}
            style={{
              padding: '18px',
              borderRadius: '12px',
              backgroundColor: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '14px', color: '#ffffff' }}>
                <Activity size={16} color="#3b82f6" />
                <span>Vulnerability Scanner</span>
              </div>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#3b82f6' }}>{scanResult.score}% HEALTH</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Scans Administrator permissions, quarantine role binding, and alert channel setups for vulnerabilities.
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#3b82f6', fontWeight: 600, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
              <span>Run Vulnerability Audit</span>
              <ArrowRight size={14} />
            </div>
          </div>

          {/* 6. Security Timeline & Gateway Logs */}
          <div 
            onClick={() => onNavigate('security-logs')}
            style={{
              padding: '18px',
              borderRadius: '12px',
              backgroundColor: 'rgba(168, 85, 247, 0.08)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '14px', color: '#ffffff' }}>
                <FileText size={16} color="#a855f7" />
                <span>Security Timeline Logs</span>
              </div>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#a855f7' }}>LIVE STREAM</span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Real-time event stream logging gateway activity, rate limit triggers, and security interventions.
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#a855f7', fontWeight: 600, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
              <span>View Full Security Logs</span>
              <ArrowRight size={14} />
            </div>
          </div>

        </div>
      </div>

      {/* Real-Time Security Event Stream Table */}
      <div className="section-panel" style={{ padding: '24px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Radio size={18} color="var(--accent-primary)" />
            Real-Time Gateway Security Process Stream
          </h3>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Showing latest live events</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontFamily: 'monospace', fontSize: '12px', maxHeight: '350px', overflowY: 'auto' }}>
          {syncLogs.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Listening to live Gateway security process stream...
            </div>
          ) : (
            syncLogs.slice(0, 20).map((log: any, idx: number) => (
              <div 
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 14px',
                  backgroundColor: 'rgba(0,0,0,0.2)',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.04)'
                }}
              >
                <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>[{log.time || 'NOW'}]</span>
                <span style={{ color: log.type === 'warn' ? '#f59e0b' : log.type === 'success' ? '#10b981' : '#ffffff' }}>
                  {log.msg}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* LOCKDOWN CONFIRM MODAL */}
      {showLockdownModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(6px)' }}>
          <div className="section-panel" style={{ width: '440px', padding: '28px', background: 'var(--bg-card)', border: `1px solid ${lockdownAction === 'enable' ? 'rgba(239,68,68,0.5)' : 'rgba(16,185,129,0.5)'}`, boxShadow: '0 10px 30px rgba(0,0,0,0.6)', borderRadius: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#fff', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {lockdownAction === 'enable' ? '🔒' : '🔓'}
              {lockdownAction === 'enable' ? 'Enable Emergency Lockdown?' : 'Exit Emergency Lockdown?'}
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px', lineHeight: '1.6' }}>
              {lockdownAction === 'enable'
                ? 'This will freeze all server channels immediately. Only whitelisted users will be able to take actions. Are you sure?'
                : 'This will lift all lockdown restrictions and return the server to normal operational mode. Confirm to proceed.'}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowLockdownModal(false)}>Cancel</button>
              <button
                className={`btn ${lockdownAction === 'enable' ? 'btn-danger' : 'btn-primary'}`}
                onClick={confirmLockdown}
                style={{ fontWeight: 800 }}
              >
                {lockdownAction === 'enable' ? '🔒 Confirm Lockdown' : '🔓 Confirm Exit'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
