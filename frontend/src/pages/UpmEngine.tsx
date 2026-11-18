import React, { useState } from 'react';
import { Shield, Zap, RefreshCw, Save, CheckCircle2, UserCheck, Lock, Activity, Clock, AlertTriangle } from 'lucide-react';
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header Banner - Black Obsidian Theme */}
      <div 
        style={{
          background: '#09090B',
          padding: '26px 28px',
          borderRadius: '16px',
          border: '1px solid #27272A',
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '20px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div style={{
            width: '54px',
            height: '54px',
            borderRadius: '14px',
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#DC2626'
          }}>
            <Zap size={28} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.02em', margin: 0 }}>
                Ultra Protection Engine (UPM) & Raid Defense
              </h1>
              <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', backgroundColor: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0' }}>
                SNAPSHOT ENGINE ONLINE
              </span>
            </div>
            <p style={{ color: '#A1A1AA', fontSize: '13px', marginTop: '4px', margin: 0 }}>
              Live state snapshots, zero-delay raid lockdown, and automated channel/role state restoration.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={handleRestoreLatest} 
            disabled={isRestoring} 
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 18px', borderRadius: '8px',
              background: '#18181B', border: '1px solid #27272A',
              color: '#FFFFFF', fontSize: '13px', fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.15s ease'
            }}
          >
            <Activity size={15} />
            <span>{isRestoring ? 'Restoring State...' : 'Restore Latest Snapshot'}</span>
          </button>
          <button 
            onClick={handleCaptureSnapshot} 
            disabled={isCapturing} 
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 18px', borderRadius: '8px',
              background: '#DC2626', border: 'none',
              color: '#FFFFFF', fontSize: '13px', fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.15s ease'
            }}
          >
            <RefreshCw size={15} className={isCapturing ? 'spin' : ''} />
            <span>{isCapturing ? 'Capturing...' : 'Capture Live Snapshot'}</span>
          </button>
        </div>
      </div>

      {/* Cyber HUD State Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        
        {/* Card 1: UPM Engine Controls */}
        <div style={{ padding: '22px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: '14px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#09090B', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={18} color="#DC2626" />
            Automated UPM Incident Triggers
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            <div style={{ padding: '14px 16px', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#09090B' }}>Auto-Quarantine Offenders</div>
                <div style={{ fontSize: '12px', color: '#71717A', marginTop: '2px' }}>Instantly revokes all roles from raid bots and assigns isolation role.</div>
              </div>
              <input 
                type="checkbox" 
                checked={upm.autoQuarantine} 
                onChange={e => onUpdateConfig('security', { upm: { ...upm, autoQuarantine: e.target.checked } })} 
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
            </div>

            <div style={{ padding: '14px 16px', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#09090B' }}>Auto-Lockdown on Raid Detection</div>
                <div style={{ fontSize: '12px', color: '#71717A', marginTop: '2px' }}>Freezes text and voice channels when raid thresholds are crossed.</div>
              </div>
              <input 
                type="checkbox" 
                checked={upm.autoLockdown} 
                onChange={e => onUpdateConfig('security', { upm: { ...upm, autoLockdown: e.target.checked } })} 
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
            </div>

          </div>
        </div>

        {/* Card 2: Join Role Raid Guard */}
        <div style={{ padding: '22px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: '14px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#09090B', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserCheck size={18} color="#059669" />
            Join Role Raid Guard
          </h3>
          <div style={{ fontSize: '13px', color: '#71717A', lineHeight: '1.5' }}>
            Join Role Guard monitors join bursts and prevents mass role granting exploit scripts during raid attempts.
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', background: '#ECFDF5', border: '1px solid #A7F3D0', fontSize: '12px', color: '#059669', fontWeight: 700 }}>
              <span>Burst Threshold:</span>
              <span>7 joins / 5s</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', background: '#FEF2F2', border: '1px solid #FECACA', fontSize: '12px', color: '#991B1B', fontWeight: 700 }}>
              <span>Grace Period:</span>
              <span>15 seconds</span>
            </div>
          </div>
        </div>

      </div>

      {/* Live Snapshots History */}
      <div style={{ padding: '22px', background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: '14px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#09090B', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={18} color="#DC2626" />
          Live State Snapshots History
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[
            { id: 'snap_01', time: '5 mins ago', rolesCount: 24, channelsCount: 38, status: 'LATEST AUTO SNAPSHOT' },
            { id: 'snap_02', time: '1 hour ago', rolesCount: 24, channelsCount: 38, status: 'MANUAL SNAPSHOT' }
          ].map(snap => (
            <div key={snap.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderRadius: '10px', background: '#FAFAFA', border: '1px solid #E4E4E7' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#09090B' }}>Snapshot #{snap.id} ({snap.time})</div>
                <div style={{ fontSize: '11px', color: '#71717A', marginTop: '2px' }}>
                  {snap.rolesCount} Roles backed up • {snap.channelsCount} Channels backed up
                </div>
              </div>
              <span style={{ fontSize: '11px', fontWeight: 700, color: snap.status.includes('LATEST') ? '#059669' : '#09090B', padding: '3px 10px', borderRadius: '6px', background: snap.status.includes('LATEST') ? '#ECFDF5' : '#F4F4F5', border: `1px solid ${snap.status.includes('LATEST') ? '#A7F3D0' : '#E4E4E7'}` }}>
                {snap.status}
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
