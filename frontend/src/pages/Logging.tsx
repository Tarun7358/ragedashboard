import { API_BASE } from '../config';
import React, { useState } from 'react';
import { 
  ShieldAlert, UserX, Bomb, Bot, Link, Mic, ClipboardList, Settings, 
  ChevronDown, ChevronUp, BellRing, Activity, Shield, Hash, Users, AlertTriangle, Send
} from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';
import { ChannelSelect } from '../components/ResourceSelectors';
import type { ModuleState, DiscordChannel } from '../hooks/useDiscordSync';

interface LoggingProps {
  onSaveConfig: (msg: string) => void;
  onManualTrigger: (msg: string, type: 'info' | 'success' | 'warning' | 'danger' | 'purple', cat: 'Security' | 'Moderation' | 'Community' | 'Backup' | 'System' | 'Ticket') => void;
  modules: ModuleState[];
  registry: { channels: DiscordChannel[] };
  onUpdateConfig: (moduleId: string, config: Record<string, any>, enabledOverride?: boolean) => void;
}

const CATEGORIES = [
  { id: 'security', name: 'Security Logs', icon: ShieldAlert, desc: 'Permission changes, failed authentications, API alerts.', color: 'var(--color-danger)' },
  { id: 'moderation', name: 'Moderation Logs', icon: UserX, desc: 'Bans, kicks, timeouts, warnings, quarantines.', color: 'var(--color-warning)' },
  { id: 'antiNuke', name: 'Anti-Nuke Logs', icon: Bomb, desc: 'Mass deletions, raid detections, emergency locks.', color: '#ff0055' },
  { id: 'botProtection', name: 'Bot Protection', icon: Bot, desc: 'Unauthorized bots added, dangerous permissions.', color: 'var(--accent-primary)' },
  { id: 'webhook', name: 'Webhook Logs', icon: Link, desc: 'Webhook creations, deletions, suspicious activity.', color: '#a855f7' },
  { id: 'voice', name: 'Voice Security', icon: Mic, desc: 'Soundboard usage, voice joins/leaves, moderator moves, mutes.', color: 'var(--color-success)' },
  { id: 'audit', name: 'Audit Logs', icon: ClipboardList, desc: 'Dashboard changes, message edits/deletions.', color: 'var(--text-secondary)' },
  { id: 'system', name: 'System Logs', icon: Settings, desc: 'Bot startups, module failures, database errors.', color: '#64748b' }
];

export function Logging({ 
  onSaveConfig, 
  onManualTrigger,
  modules,
  registry,
  onUpdateConfig
}: LoggingProps) {
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  const logModule = (modules || []).find(m => m.id === 'logging');
  const config = logModule?.config || {};

  const handleUpdateCategory = (categoryId: string, updates: Record<string, any>) => {
    const currentCatConfig = config[categoryId] || { enabled: false, events: {}, ignoreRoles: [], ignoreUsers: [] };
    const newConfig = {
      ...config,
      [categoryId]: { ...currentCatConfig, ...updates }
    };
    onUpdateConfig('logging', newConfig);
    onSaveConfig(`Updated configuration for ${categoryId} logs.`);
  };

  const handleToggleEnable = (categoryId: string, enabled: boolean) => {
    handleUpdateCategory(categoryId, { enabled });
    onManualTrigger(`Logging Center: ${categoryId.toUpperCase()} logs ${enabled ? 'ENABLED' : 'DISABLED'}.`, enabled ? 'success' : 'warning', 'System');
  };

  const handleTestLog = async (categoryId: string) => {
    onSaveConfig(`Sending test log for ${categoryId}...`);
    try {
      const token = localStorage.getItem('cn_token');
      const activeGuild = localStorage.getItem('cn_active_guild');
      const res = await fetch(`${API_BASE}/api/modules/logging/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Guild-Id': activeGuild || ''
        },
        body: JSON.stringify({ category: categoryId })
      });
      if (res.ok) {
        onManualTrigger(`Logs: Dispatched real test event to ${categoryId} channel.`, 'success', 'System');
      } else {
        const data = await res.json().catch(() => ({}));
        onManualTrigger(`Logs Error: ${data.error || 'Failed to dispatch test event.'}`, 'danger', 'System');
      }
    } catch (err) {
      onManualTrigger('Logs Error: API server offline.', 'danger', 'System');
    }
  };


  const renderCategoryCard = (cat: typeof CATEGORIES[0]) => {
    const catConfig = config[cat.id] || { enabled: false, channelId: '', events: {}, ignoreRoles: [], ignoreUsers: [] };
    const isExpanded = expandedCat === cat.id;

    return (
      <div key={cat.id} className="section-panel" style={{ padding: '20px', transition: 'all 0.3s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flex: 1 }}>
            <div style={{ padding: '12px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 'var(--border-radius-md)' }}>
              <cat.icon size={24} color={cat.color} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>{cat.name}</span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{cat.desc}</span>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            <div style={{ width: '200px' }}>
              <ChannelSelect 
                label=""
                channels={registry.channels}
                selectedChannelId={catConfig.channelId || ''}
                onChange={id => handleUpdateCategory(cat.id, { channelId: id })}
                typeFilter={['text']}
              />
            </div>
            <label className="switch">
              <input 
                type="checkbox" 
                checked={catConfig.enabled || false} 
                onChange={e => handleToggleEnable(cat.id, e.target.checked)} 
              />
              <span className="slider"></span>
            </label>
            <button 
              className="btn btn-secondary btn-sm" 
              onClick={() => setExpandedCat(isExpanded ? null : cat.id)}
              style={{ width: '32px', height: '32px', padding: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
            >
              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
        </div>

        {isExpanded && (
          <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <BellRing size={14} color="var(--accent-primary)" />
                  Event Triggers
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {(cat.id === 'voice' ? [
                    { name: 'Voice Join / Leave / Switch', key: 'join_leave_switch' },
                    { name: 'Soundboard Usage', key: 'soundboard' },
                    { name: 'Moderator Moves (Drag Logs)', key: 'moderator_moves' },
                    { name: 'Server Mutes & Deafens', key: 'server_mute_deafen' }
                  ] : [
                    { name: 'Default Events', key: 'default_events' },
                    { name: 'High Severity Alerts', key: 'high_severity_alerts' },
                    { name: 'Administrative Actions', key: 'administrative_actions' },
                    { name: 'Automated Bot Actions', key: 'automated_bot_actions' }
                  ]).map(trigger => {
                     const isChecked = catConfig.events?.[trigger.key] ?? true; // default true
                     return (
                       <label key={trigger.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                         <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{trigger.name}</span>
                         <input 
                           type="checkbox" 
                           checked={isChecked} 
                           onChange={e => handleUpdateCategory(cat.id, { events: { ...catConfig.events, [trigger.key]: e.target.checked }})}
                           style={{ accentColor: 'var(--accent-primary)' }}
                         />
                       </label>
                     );
                  })}
                </div>
              </div>

              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Shield size={14} color="var(--color-warning)" />
                  Exclusions
                </h4>
                <div className="form-group">
                  <label className="form-label">Ignore Roles (Comma separated IDs)</label>
                  <input 
                    type="text" 
                    className="form-input-text" 
                    placeholder="e.g. 92837192, 102938102"
                    value={catConfig.ignoreRoles?.join(', ') || ''}
                    onChange={e => handleUpdateCategory(cat.id, { ignoreRoles: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
               <div>
                <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Activity size={14} color="var(--color-success)" />
                  Advanced Configuration
                </h4>
                
                <div className="form-group-row" style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Mention Staff on Critical Event</div>
                  <label className="switch">
                    <input 
                      type="checkbox" 
                      checked={catConfig.mentionStaff ?? false} 
                      onChange={e => handleUpdateCategory(cat.id, { mentionStaff: e.target.checked })}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
                
                <div className="form-group-row" style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Include Timestamps & Metadata</div>
                  <label className="switch">
                    <input 
                      type="checkbox" 
                      checked={catConfig.metadata ?? true} 
                      onChange={e => handleUpdateCategory(cat.id, { metadata: e.target.checked })}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                <div className="form-group">
                  <label className="form-label">Maximum Logs Per Minute</label>
                  <input 
                    type="number" 
                    className="form-input-text" 
                    placeholder="60"
                    value={catConfig.rateLimit || 60}
                    onChange={e => handleUpdateCategory(cat.id, { rateLimit: parseInt(e.target.value) || 60 })}
                  />
                  <span className="form-help">Prevents API ratelimits during extreme raids.</span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto' }}>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => handleTestLog(cat.id)}
                  disabled={!catConfig.channelId}
                >
                  <Send size={14} />
                  <span>Send Test Log</span>
                </button>
              </div>
            </div>
            
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="page-header">
        <div className="page-title-row">
          <div>
            <h1 className="page-title">Advanced Logging Center</h1>
            <p className="page-subtitle">Granular event routing, rate limiting, and telemetry channels for your server.</p>
          </div>
          <button 
            className="btn btn-primary"
            onClick={() => onUpdateConfig('logging', {}, logModule?.status !== 'enabled')}
          >
            {logModule?.status === 'enabled' ? 'Pause All Logging' : 'Enable Logging System'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {CATEGORIES.map(renderCategoryCard)}
      </div>
    </div>
  );
}
