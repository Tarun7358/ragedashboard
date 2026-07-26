import React from 'react';
import { Volume2, Mic, Settings, Save, Shield } from 'lucide-react';
import type { ModuleState, DiscordResourceRegistry } from '../hooks/useDiscordSync';

interface VoiceManagerProps {
  onSaveConfig: (msg: string) => void;
  modules: ModuleState[];
  registry: DiscordResourceRegistry;
  onUpdateConfig: (moduleId: string, config: Record<string, any>, enabled?: boolean) => void;
}

export function VoiceManager({ onSaveConfig, modules, registry, onUpdateConfig }: VoiceManagerProps) {
  const vmMod = (modules || []).find(m => m.id === 'voice_manager') || { status: 'disabled', config: {} as any };
  const config: Record<string, any> = vmMod.config || {};
  const isEnabled = vmMod.status === 'enabled';

  const handleToggleEnable = () => {
    onUpdateConfig('voice_manager', {}, !isEnabled);
    onSaveConfig(`Voice Manager module ${!isEnabled ? 'ENABLED' : 'DISABLED'}.`);
  };

  const handleUpdate = (field: string, value: any) => {
    onUpdateConfig('voice_manager', { [field]: value });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="page-header">
        <div className="page-title-row">
          <div>
            <h1 className="page-title">Voice Manager & Temporary Channels</h1>
            <p className="page-subtitle">Configure automated temp voice channels, bitrate tuning, user capacity limits, and voice moderation.</p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              className="btn btn-primary"
              onClick={() => onSaveConfig('Voice Manager settings saved.')}
            >
              <Save size={14} />
              <span>Save Changes</span>
            </button>
            <button 
              className={`btn ${isEnabled ? 'btn-danger' : 'btn-success'}`}
              onClick={handleToggleEnable}
            >
              <Volume2 size={14} />
              <span>{isEnabled ? 'Disable Module' : 'Enable Module'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="section-panel">
        <div className="panel-header">
          <span className="panel-title">Temporary Voice Settings</span>
          <Mic size={16} color="var(--accent-primary)" />
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Default Bitrate (kbps)</label>
            <input 
              type="number"
              className="form-input"
              value={config.bitrate || 64}
              onChange={(e) => handleUpdate('bitrate', Number(e.target.value))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Default User Limit (0 for unlimited)</label>
            <input 
              type="number"
              className="form-input"
              value={config.userLimit || 0}
              onChange={(e) => handleUpdate('userLimit', Number(e.target.value))}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
