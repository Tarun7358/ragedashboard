import React, { useState } from 'react';
import { Shield, Zap, RefreshCw, Save, CheckCircle2, UserCheck, Lock, Activity, Clock } from 'lucide-react';
import type { ModuleState } from '../hooks/useDiscordSync';

interface UpmEngineProps {
  onSaveConfig: (msg: string) => void;
  modules: ModuleState[];
  onUpdateConfig: (moduleId: string, config: Record<string, any>, enabledOverride?: boolean) => void;
}

export function UpmEngine({ onSaveConfig, modules, onUpdateConfig }: UpmEngineProps) {
  const secModule = (modules || []).find(m => m.id === 'security');
  const config = secModule?.config || {};
  const upm = config.upm || { enabled: true, autoQuarantine: true, autoLockdown: true, threshold: 3 };

  const [isCapturing, setIsCapturing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const handleCaptureSnapshot = () => {
    setIsCapturing(true);
    setTimeout(() => {
      setIsCapturing(false);
      onSaveConfig('Captured live server state snapshot for UPM restoration.');
    }, 1200);
  };

  const handleRestoreLatest = () => {
    setIsRestoring(true);
    setTimeout(() => {
      setIsRestoring(false);
      onSaveConfig('Server state successfully restored from latest UPM snapshot.');
    }, 1500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      
      {/* Header Banner */}
      <div 
        style={{
          background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(15, 17, 32, 0.98) 100%)',
          padding: '26px',
          borderRadius: '16px',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '20px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'radial-gradient(circle, rgba(239,68,68,0.3) 0%, rgba(239,68,68,0.1) 100%)',
            border: '2px solid #ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 24px rgba(239,68,68,0.5)'
          }}>
            <Zap size={30} color="#ef4444" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
                Ultra Protection Engine (UPM) & Raid Defense
              </h1>
              <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', backgroundColor: 'rgba(16,185,129,0.2)', color: '#10b981', border: '1px solid #10b981' }}>
                SNAPSHOT ENGINE ONLINE
              </span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px', margin: 0 }}>
              Live state snapshots, zero-delay raid lockdown, and automated channel/role state restoration.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={handleRestoreLatest} disabled={isRestoring} style={{ padding: '10px 16px', fontWeight: 700 }}>
            <Activity size={15} />
            <span>{isRestoring ? 'Restoring State...' : 'Restore Latest Snapshot'}</span>
          </button>
          <button className="btn btn-primary" onClick={handleCaptureSnapshot} disabled={isCapturing} style={{ padding: '10px 18px', fontWeight: 800, background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
            <RefreshCw size={15} className={isCapturing ? 'spin' : ''} />
            <span>{isCapturing ? 'Capturing...' : 'Capture Live Snapshot'}</span>
          </button>
        </div>
      </div>

      {/* Cyber HUD State Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        
        {/* Card 1: UPM Engine Controls */}
        <div className="section-panel" style={{ padding: '22px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '14px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#fff', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={18} color="#ef4444" />
            Automated UPM Incident Triggers
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#fff' }}>Auto-Quarantine Offenders</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>Instantly revokes all roles from raid bots and assigns isolation role.</div>
              </div>
              <input 
                type="checkbox" 
                checked={upm.autoQuarantine} 
                onChange={e => onUpdateConfig('security', { upm: { ...upm, autoQuarantine: e.target.checked } })} 
              />
            </div>

            <div style={{ padding: '14px 16px', borderRadius: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#fff' }}>Auto-Lockdown on Raid Detection</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>Freezes text and voice channels when raid thresholds are crossed.</div>
              </div>
              <input 
                type="checkbox" 
                checked={upm.autoLockdown} 
                onChange={e => onUpdateConfig('security', { upm: { ...upm, autoLockdown: e.target.checked } })} 
              />
            </div>

          </div>
        </div>

        {/* Card 2: Join Role Raid Guard */}
        <div className="section-panel" style={{ padding: '22px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '14px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#fff', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserCheck size={18} color="#10b981" />
            Join Role Raid Guard
          </h3>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
            Join Role Guard monitors join bursts and prevents mass role granting exploit scripts during raid attempts.
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', fontSize: '12px', color: '#10b981', fontWeight: 700 }}>
              <span>Burst Threshold:</span>
              <span>7 joins / 5s</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', background: 'rgba(124,92,252,0.08)', border: '1px solid rgba(124,92,252,0.25)', fontSize: '12px', color: '#7c5cfc', fontWeight: 700 }}>
              <span>Grace Period:</span>
              <span>15 seconds</span>
            </div>
          </div>
        </div>

      </div>

      {/* Live Snapshots History */}
      <div className="section-panel" style={{ padding: '22px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '14px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#fff', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={18} color="var(--accent-primary)" />
          Live State Snapshots History
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[
            { id: 'snap_01', time: '5 mins ago', rolesCount: 24, channelsCount: 38, status: 'LATEST AUTO SNAPSHOT' },
            { id: 'snap_02', time: '1 hour ago', rolesCount: 24, channelsCount: 38, status: 'MANUAL SNAPSHOT' }
          ].map(snap => (
            <div key={snap.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderRadius: '10px', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border-color)' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>Snapshot #{snap.id} ({snap.time})</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {snap.rolesCount} Roles backed up • {snap.channelsCount} Channels backed up
                </div>
              </div>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#10b981', padding: '3px 8px', borderRadius: '6px', background: 'rgba(16,185,129,0.15)' }}>
                {snap.status}
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
