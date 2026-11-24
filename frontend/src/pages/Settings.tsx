import { API_BASE } from '../config';
import React, { useState } from 'react';
import { Settings as SettingsIcon, Link, Bell, Shield, Lock } from 'lucide-react';

interface SettingsProps {
  onSaveConfig: (msg: string, type?: 'success' | 'danger' | 'warning' | 'info') => void;
  modules: any[];
  registry: any;
  onUpdateConfig: (moduleId: string, newConfig: Record<string, any>, enabledOverride?: boolean) => void;
}

export function Settings({ onSaveConfig, modules, registry, onUpdateConfig }: SettingsProps) {
  const [activeTab, setActiveTab] = useState('general');

  // Voice Presence state
  const voiceMod = modules?.find(m => m.id === 'voice') || { config: {}, status: 'disabled' };
  const voiceConfig = voiceMod.config || {};
  const [voiceEnabled, setVoiceEnabled] = useState(voiceMod.status === 'enabled');
  const [channelId, setChannelId] = useState(voiceConfig.channelId || '');
  const [autoJoin, setAutoJoin] = useState(voiceConfig.autoJoin !== false);
  const [autoReconnect, setAutoReconnect] = useState(voiceConfig.autoReconnect !== false);
  const [reconnectDelay, setReconnectDelay] = useState(voiceConfig.reconnectDelay || 5000);
  const [maxRetries, setMaxRetries] = useState(voiceConfig.maxRetries || 5);
  const [activityStatus, setActivityStatus] = useState(voiceConfig.activityStatus || '');

  const globalSettings = registry?.globalSettings || {};
  const [commandPrefix, setCommandPrefix] = useState(globalSettings.commandPrefix || '.');
  const [timezone, setTimezone] = useState(globalSettings.timezone || 'UTC');
  const [botSync, setBotSync] = useState(globalSettings.botSync !== false);
  const [inviteScope, setInviteScope] = useState(globalSettings.inviteScope || 'Administrator role required (Standard)');
  const [incidentDispatch, setIncidentDispatch] = useState(globalSettings.incidentDispatch !== false);
  const [webhookUrl, setWebhookUrl] = useState(globalSettings.webhookUrl || 'https://discord.com/api/webhooks/...');
  const [useV2Welcome, setUseV2Welcome] = useState(!!globalSettings.useV2Welcome);
  const [useV2Tickets, setUseV2Tickets] = useState(!!globalSettings.useV2Tickets);

  const voiceChannels = registry?.channels?.filter((c: any) => c.type === 'voice') || [];

  const handleSaveVoice = async () => {
    if (voiceEnabled && !channelId) {
      onSaveConfig('Cannot enable Voice Presence: Please select a valid voice channel.', 'danger');
      return;
    }
    
    await onUpdateConfig('voice', {
      channelId,
      autoJoin,
      autoReconnect,
      reconnectDelay: Number(reconnectDelay),
      maxRetries: Number(maxRetries),
      activityStatus
    });

    await onUpdateConfig('voice', {}, voiceEnabled);
    await onUpdateConfig('voice', {}, voiceEnabled);
    onSaveConfig('Voice Presence settings updated successfully.', 'success');
  };

  const handleSaveSettings = async () => {
    try {
      const token = localStorage.getItem('cn_token');
      await fetch(`${API_BASE}/api/settings`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          commandPrefix,
          timezone,
          botSync,
          inviteScope,
          incidentDispatch,
          webhookUrl,
          useV2Welcome,
          useV2Tickets
        })
      });
      onSaveConfig('Global settings saved successfully.', 'success');
    } catch {
      onSaveConfig('Failed to save settings to backend.', 'danger');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Settings & Configurations</h1>
        <p className="page-subtitle">Adjust core bot preferences and voice presence settings.</p>
      </div>

      <div className="section-panel">
        <div className="tabs-nav">
          <button className={`tab-btn ${activeTab === 'general' ? 'active' : ''}`} onClick={() => setActiveTab('general')}>General</button>
          <button className={`tab-btn ${activeTab === 'voice_presence' ? 'active' : ''}`} onClick={() => setActiveTab('voice_presence')}>Voice Presence</button>
        </div>

        <div className="panel-body">
          
          {/* General settings */}
          {activeTab === 'general' && (
            <div className="form-section" style={{ maxWidth: '600px' }}>
              <div className="form-group">
                <label className="form-label">Command Execution Prefix</label>
                <input type="text" className="form-input-text" value={commandPrefix} onChange={(e) => setCommandPrefix(e.target.value)} />
                <span className="form-help">Preferred prefix for text commands executed directly in Discord chats.</span>
              </div>

              <div className="form-group">
                <label className="form-label">Primary Timezone Offset</label>
                <select className="form-select" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  <option value="UTC">UTC (Coordinated Universal Time)</option>
                  <option value="EST">EST / EDT (Eastern Time)</option>
                  <option value="IST">IST (Indian Standard Time)</option>
                </select>
                <span className="form-help">Timezone used for backup timestamps and audit log entries.</span>
              </div>

              <button className="btn btn-primary" onClick={handleSaveSettings} style={{ alignSelf: 'flex-start' }}>
                Save Preferences
              </button>
            </div>
          )}

          {/* Voice Presence settings */}
          {activeTab === 'voice_presence' && (
            <div className="form-section" style={{ maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="form-group-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px' }}>
                <div>
                  <div className="form-label" style={{ fontWeight: 'bold' }}>Enable Persistent Voice Presence</div>
                  <div className="form-help">Ensure the bot remains permanently active and connected inside a designated voice channel (24/7).</div>
                </div>
                <label className="switch">
                  <input type="checkbox" checked={voiceEnabled} onChange={(e) => setVoiceEnabled(e.target.checked)} />
                  <span className="slider"></span>
                </label>
              </div>

              <div className="form-group">
                <label className="form-label">Select Voice Channel</label>
                <select className="form-select" value={channelId} onChange={(e) => setChannelId(e.target.value)}>
                  <option value="">-- Choose a voice channel --</option>
                  {voiceChannels.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      🔊 {c.name} {c.category ? `(${c.category})` : ''}
                    </option>
                  ))}
                </select>
                <span className="form-help">The dedicated channel that the bot joins automatically. Synchronized from Discord in real-time.</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div className="form-label">Auto Join on Startup</div>
                    <div className="form-help">Automatically establish connection upon client startup.</div>
                  </div>
                  <label className="switch">
                    <input type="checkbox" checked={autoJoin} onChange={(e) => setAutoJoin(e.target.checked)} />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="form-group-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div className="form-label">Auto Reconnect</div>
                    <div className="form-help">Automatically reconnect if kicked or disconnected.</div>
                  </div>
                  <label className="switch">
                    <input type="checkbox" checked={autoReconnect} onChange={(e) => setAutoReconnect(e.target.checked)} />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Reconnection Delay (ms)</label>
                  <input 
                    type="number" 
                    className="form-input-text" 
                    value={reconnectDelay} 
                    onChange={(e) => setReconnectDelay(Number(e.target.value))} 
                  />
                  <span className="form-help">Time in milliseconds to wait before attempting reconnect.</span>
                </div>

                <div className="form-group">
                  <label className="form-label">Max Retry Attempts</label>
                  <input 
                    type="number" 
                    className="form-input-text" 
                    value={maxRetries} 
                    onChange={(e) => setMaxRetries(Number(e.target.value))} 
                  />
                  <span className="form-help">Number of failed attempts before aborting connection.</span>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Custom Activity Status</label>
                <input 
                  type="text" 
                  className="form-input-text" 
                  placeholder="e.g. Listening in Rage Main" 
                  value={activityStatus}
                  onChange={(e) => setActivityStatus(e.target.value)}
                />
                <span className="form-help">Custom presence activity shown in Discord user profile when connected.</span>
              </div>

              <button className="btn btn-primary" onClick={handleSaveVoice} style={{ alignSelf: 'flex-start' }}>
                Save Voice Presence Settings
              </button>
            </div>
          )}

        </div>
      </div>

    </div>
  );
}
