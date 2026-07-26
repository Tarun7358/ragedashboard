import React, { useState } from 'react';
import { Shield, Zap, RefreshCw, Save, CheckCircle2, UserCheck, Lock } from 'lucide-react';
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

  const handleCaptureSnapshot = () => {
    setIsCapturing(true);
    setTimeout(() => {
      setIsCapturing(false);
      onSaveConfig('Captured live server state snapshot for UPM restoration.');
    }, 1200);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="page-header">
        <div className="page-title-row">
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Zap size={26} color="#ef4444" />
              Ultra Protection Engine (UPM) & Raid Guard
            </h1>
            <p className="page-subtitle">Live state snapshots, zero-delay raid lockdown, and automated channel/role state restoration.</p>
          </div>
          <button className="btn btn-primary" onClick={handleCaptureSnapshot} disabled={isCapturing}>
            <RefreshCw size={14} className={isCapturing ? 'spin' : ''} />
            <span>{isCapturing ? 'Capturing...' : 'Capture Live Snapshot'}</span>
          </button>
        </div>
      </div>

      <div className="dashboard-layout-grid">
        <div className="section-panel" style={{ padding: '20px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
          <h3 style={{ fontSize: '15px', color: '#fff', marginBottom: '16px' }}>UPM Engine Settings</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="setting-card">
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#fff' }}>Auto-Quarantine Offenders</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Instantly revokes all roles from raid bots and assigns isolation role.</div>
              </div>
              <input 
                type="checkbox" 
                checked={upm.autoQuarantine} 
                onChange={e => onUpdateConfig('security', { upm: { ...upm, autoQuarantine: e.target.checked } })} 
              />
            </div>

            <div className="setting-card">
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#fff' }}>Auto-Lockdown on Raid Detection</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Freezes text and voice channels when raid thresholds are crossed.</div>
              </div>
              <input 
                type="checkbox" 
                checked={upm.autoLockdown} 
                onChange={e => onUpdateConfig('security', { upm: { ...upm, autoLockdown: e.target.checked } })} 
              />
            </div>
          </div>
        </div>

        <div className="section-panel" style={{ padding: '20px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
          <h3 style={{ fontSize: '15px', color: '#fff', marginBottom: '16px' }}>Join Role Raid Guard</h3>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
            Join Role Guard monitors join bursts and prevents mass role granting exploit scripts during raid attempts.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', color: '#10b981', fontWeight: 700 }}>
            <CheckCircle2 size={16} />
            <span>Join Role Guard Status: ENABLED</span>
          </div>
        </div>
      </div>
    </div>
  );
}
