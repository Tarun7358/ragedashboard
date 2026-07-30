import React, { useState } from 'react';
import { Shield, Settings, ShieldCheck, Save, ChevronDown, ChevronUp, X, Check, Zap, AlertTriangle } from 'lucide-react';
import type { ModuleState, DiscordRole, DiscordChannel } from '../hooks/useDiscordSync';
import { RoleSelect, ChannelSelect } from '../components/ResourceSelectors';

interface AntiNukeProps {
  onSaveConfig: (msg: string) => void;
  modules: ModuleState[];
  registry: { roles: DiscordRole[]; channels: DiscordChannel[] };
  onUpdateConfig: (moduleId: string, config: Record<string, any>, enabledOverride?: boolean) => void;
}

export function AntiNuke({ onSaveConfig, modules, registry, onUpdateConfig }: AntiNukeProps) {
  const secModule = (modules || []).find(m => m.id === 'security');
  const config = secModule?.config || {};
  const rules = config.rules || {};

  const quarantineRoleId = config.quarantineRoleId || '';
  const alertChannelId = config.alertChannelId || '';

  const [activeCategory, setActiveCategory] = useState<string | null>('content');
  const [editRuleData, setEditRuleData] = useState<any>(null);

  const protectionCategories = [
    {
      id: 'content',
      name: 'Content & Link Protection (Anti-Link)',
      desc: 'Controls and filters message content to prevent link spam or malicious server invites.',
      icon: <Zap size={18} color="#10b981" />,
      color: '#10b981',
      rulesList: [
        { key: 'anti_link', name: 'Anti Link & Invite Guard', desc: 'Blocks unauthorized sharing of HTTP/HTTPS web links and Discord server invite links' }
      ]
    },
    {
      id: 'member',
      name: 'Member Protection',
      desc: 'Guard against unauthorized bans, kicks, timeouts, prune actions, and nickname updating abuse.',
      icon: <Shield size={18} color="#7c5cfc" />,
      color: '#7c5cfc',
      rulesList: [
        { key: 'anti_ban', name: 'Anti Ban', desc: 'Prevents mass banning of server members' },
        { key: 'anti_kick', name: 'Anti Kick', desc: 'Prevents mass kicking of server members' },
        { key: 'anti_timeout', name: 'Anti Timeout', desc: 'Flags users spamming timeouts' },
        { key: 'anti_prune', name: 'Anti Prune', desc: 'Blocks massive member pruning' }
      ]
    },
    {
      id: 'channel',
      name: 'Channel Protection',
      desc: 'Prevent mass channel creation, deletion, or renaming operations.',
      icon: <Settings size={18} color="#3b82f6" />,
      color: '#3b82f6',
      rulesList: [
        { key: 'anti_channel_create', name: 'Anti Channel Create', desc: 'Prevents spam creation of channels' },
        { key: 'anti_channel_delete', name: 'Anti Channel Delete', desc: 'Blocks mass deletion of channels' },
        { key: 'anti_channel_update', name: 'Anti Channel Update', desc: 'Flags rapid updates to channel properties' }
      ]
    },
    {
      id: 'role',
      name: 'Role Protection',
      desc: 'Flags unauthorized role creation, position adjustments, deletion, role assignment, and role removal.',
      icon: <ShieldCheck size={18} color="#f59e0b" />,
      color: '#f59e0b',
      rulesList: [
        { key: 'anti_role_create', name: 'Anti Role Create', desc: 'Blocks unauthorized role creations' },
        { key: 'anti_role_delete', name: 'Anti Role Delete', desc: 'Blocks mass deletion of roles' },
        { key: 'anti_role_update', name: 'Anti Role Update', desc: 'Flags permission elevations or adjustments' },
        { key: 'anti_role_grant', name: 'Anti Role Assign', desc: 'Blocks unauthorized granting or assignment of roles' },
        { key: 'anti_role_remove', name: 'Anti Role Remove', desc: 'Blocks unauthorized stripping or removal of roles' }
      ]
    },
    {
      id: 'webhook',
      name: 'Webhook Protection',
      desc: 'Isolates webhooks being rapidly created, updated, or executed with malicious content.',
      icon: <AlertTriangle size={18} color="#ec4899" />,
      color: '#ec4899',
      rulesList: [
        { key: 'anti_webhook_create', name: 'Anti Webhook Create', desc: 'Blocks rogue webhook provisioning' },
        { key: 'anti_webhook_delete', name: 'Anti Webhook Delete', desc: 'Blocks deletion of system webhooks' }
      ]
    },
    {
      id: 'bot',
      name: 'Bot Integration Protection',
      desc: 'Controls bot additions and blocks unauthorized API integration creations.',
      icon: <Shield size={18} color="#6366f1" />,
      color: '#6366f1',
      rulesList: [
        { key: 'anti_bot_add', name: 'Anti Bot Add', desc: 'Blocks rogue bot invites without owner approval' }
      ]
    }
  ];

  const handleToggleRuleEnabled = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const existing = rules[key] || { enabled: true, limit: 3, window: 10, action: 'quarantine' };
    const updated = {
      ...rules,
      [key]: {
        ...existing,
        enabled: !existing.enabled
      }
    };
    onUpdateConfig('security', { rules: updated });
    onSaveConfig(`Rule "${key.replace('anti_', '').toUpperCase()}" ${!existing.enabled ? 'ENABLED' : 'DISABLED'}.`);
  };

  const saveRuleConfig = () => {
    if (!editRuleData) return;
    const updatedRules = {
      ...rules,
      [editRuleData.key]: {
        enabled: editRuleData.enabled ?? true,
        limit: editRuleData.limit || 1,
        window: editRuleData.window || 10,
        action: editRuleData.action || 'quarantine',
        recovery: editRuleData.recovery ?? true,
        ignoredDomains: editRuleData.ignoredDomains || ''
      }
    };
    onUpdateConfig('security', { rules: updatedRules });
    setEditRuleData(null);
    onSaveConfig(`Rule "${editRuleData.key.replace('anti_', '').toUpperCase()}" configuration updated.`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      
      {/* Header Banner */}
      <div 
        style={{
          background: 'linear-gradient(135deg, rgba(26, 31, 56, 0.95) 0%, rgba(15, 17, 32, 0.98) 100%)',
          padding: '26px',
          borderRadius: '16px',
          border: '1px solid rgba(124, 92, 252, 0.35)',
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
            width: '54px',
            height: '54px',
            borderRadius: '16px',
            background: 'radial-gradient(circle, rgba(124,92,252,0.3) 0%, rgba(124,92,252,0.1) 100%)',
            border: '2px solid #7c5cfc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 20px rgba(124,92,252,0.4)'
          }}>
            <Shield size={28} color="#7c5cfc" />
          </div>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
              Anti-Nuke & Threat Protection Rules
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px', margin: 0 }}>
              Configure granular action thresholds, punishment actions, quarantine roles, and anti-link whitelists.
            </p>
          </div>
        </div>

        <button className="btn btn-primary" onClick={() => onSaveConfig('Anti-Nuke settings saved.')} style={{ padding: '10px 18px', fontWeight: 800 }}>
          <Save size={15} />
          <span>Save Changes</span>
        </button>
      </div>

      {/* Required Resource Bindings Panel */}
      <div 
        className="section-panel" 
        style={{ 
          padding: '22px', 
          background: 'var(--bg-secondary)', 
          border: '1px solid var(--border-color)', 
          borderRadius: '14px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
        }}
      >
        <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={18} color="var(--accent-primary)" />
          Required Anti-Nuke Bindings & Isolation Roles
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          <RoleSelect 
            label="Quarantine Isolation Role (offenders assigned here)"
            roles={registry.roles}
            selectedRoleId={quarantineRoleId}
            onChange={id => onUpdateConfig('security', { quarantineRoleId: id })}
          />
          <ChannelSelect 
            label="Alert Notification Channel (gateway alarm output)"
            channels={registry.channels}
            selectedChannelId={alertChannelId}
            onChange={id => onUpdateConfig('security', { alertChannelId: id })}
            typeFilter={['text']}
          />
        </div>
      </div>

      {/* Accordion Rule Categories Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {protectionCategories.map(cat => {
          const isExpanded = activeCategory === cat.id;
          const activeRuleCount = cat.rulesList.filter(r => (rules[r.key]?.enabled ?? true)).length;

          return (
            <div 
              key={cat.id} 
              style={{ 
                border: `1px solid ${isExpanded ? cat.color : 'var(--border-color)'}`, 
                borderRadius: '14px', 
                overflow: 'hidden', 
                background: 'var(--bg-secondary)',
                boxShadow: isExpanded ? `0 0 20px ${cat.color}20` : 'none',
                transition: 'all 0.2s ease'
              }}
            >
              {/* Category Header */}
              <div 
                onClick={() => setActiveCategory(isExpanded ? null : cat.id)}
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  padding: '18px 24px', 
                  cursor: 'pointer',
                  background: isExpanded ? `${cat.color}10` : 'transparent'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    backgroundColor: `${cat.color}20`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: `1px solid ${cat.color}40`
                  }}>
                    {cat.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span>{cat.name}</span>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '10px',
                        backgroundColor: `${cat.color}25`,
                        color: cat.color,
                        border: `1px solid ${cat.color}40`
                      }}>
                        {activeRuleCount} / {cat.rulesList.length} Active
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{cat.desc}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {isExpanded ? <ChevronUp size={20} color="var(--text-muted)" /> : <ChevronDown size={20} color="var(--text-muted)" />}
                </div>
              </div>

              {/* Category Body Rule Cards */}
              {isExpanded && (
                <div style={{ padding: '24px', borderTop: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                  {cat.rulesList.map(r => {
                    const ruleVal = rules[r.key] || { enabled: true, limit: 3, window: 10, action: 'quarantine', ignoredDomains: '' };
                    const isEnabled = ruleVal.enabled ?? true;

                    return (
                      <div 
                        key={r.key} 
                        style={{ 
                          padding: '20px', 
                          borderRadius: '12px', 
                          background: isEnabled ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.15)', 
                          border: `1px solid ${isEnabled ? `${cat.color}50` : 'rgba(255,255,255,0.06)'}`, 
                          display: 'flex', 
                          flexDirection: 'column', 
                          gap: '14px',
                          position: 'relative'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '15px', color: '#ffffff' }}>{r.name}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: '1.4' }}>{r.desc}</div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {/* Toggle Switch */}
                            <button
                              onClick={(e) => handleToggleRuleEnabled(r.key, e)}
                              style={{
                                width: '42px',
                                height: '22px',
                                borderRadius: '11px',
                                border: 'none',
                                background: isEnabled ? '#10b981' : 'rgba(255,255,255,0.2)',
                                cursor: 'pointer',
                                position: 'relative',
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                alignItems: 'center',
                                padding: '2px'
                              }}
                            >
                              <div style={{
                                width: '18px',
                                height: '18px',
                                borderRadius: '50%',
                                background: '#ffffff',
                                transform: isEnabled ? 'translateX(20px)' : 'translateX(0px)',
                                transition: 'transform 0.2s ease',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                              }} />
                            </button>

                            <button 
                              onClick={() => setEditRuleData({ key: r.key, ...ruleVal })} 
                              className="btn btn-secondary btn-sm" 
                              style={{ padding: '6px 10px', borderRadius: '8px' }}
                            >
                              <Settings size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Parameter Badges */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', backgroundColor: 'rgba(124, 92, 252, 0.15)', color: '#7c5cfc', border: '1px solid rgba(124, 92, 252, 0.3)' }}>
                            LIMIT: {ruleVal.limit} / {ruleVal.window}s
                          </span>
                          <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                            ACTION: {(ruleVal.action || 'quarantine').toUpperCase()}
                          </span>
                          <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', backgroundColor: (ruleVal.recovery ?? true) ? 'rgba(16, 185, 129, 0.15)' : 'rgba(156, 163, 175, 0.15)', color: (ruleVal.recovery ?? true) ? '#10b981' : '#9ca3af', border: (ruleVal.recovery ?? true) ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(156, 163, 175, 0.3)' }}>
                            REVERT: {(ruleVal.recovery ?? true) ? 'AUTO' : 'DISABLED'}
                          </span>
                        </div>

                        {/* Ignored Domains Chips Preview */}
                        {r.key === 'anti_link' && ruleVal.ignoredDomains && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                            <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Whitelisted:</span>
                            {ruleVal.ignoredDomains.split(',').map((domain: string, idx: number) => (
                              <span key={idx} style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontFamily: 'monospace', fontSize: '10px' }}>
                                {domain.trim()}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Enhanced Rule Configuration Modal */}
      {editRuleData && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(6px)' }}>
          <div 
            className="section-panel" 
            style={{ 
              width: '460px', 
              padding: '28px', 
              background: 'var(--bg-card)', 
              border: '1px solid var(--accent-primary)', 
              borderRadius: '16px',
              boxShadow: '0 12px 40px rgba(0,0,0,0.6)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Settings size={20} color="var(--accent-primary)" />
                <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#ffffff', margin: 0 }}>
                  Configure {editRuleData.key.replace('anti_', '').replace('_', ' ').toUpperCase()}
                </h3>
              </div>
              <button onClick={() => setEditRuleData(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={18} color="var(--text-muted)" />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              
              {/* Enable Switch inside Modal */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderRadius: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>Enable Rule Enforcement</span>
                <input 
                  type="checkbox" 
                  checked={editRuleData.enabled ?? true}
                  onChange={e => setEditRuleData({ ...editRuleData, enabled: e.target.checked })}
                />
              </div>

              {/* Auto-Revert / Recovery Switch inside Modal */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderRadius: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>Auto-Revert & Restore</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>Automatically recreate or restore unauthorized changes</div>
                </div>
                <input 
                  type="checkbox" 
                  checked={editRuleData.recovery ?? true}
                  onChange={e => setEditRuleData({ ...editRuleData, recovery: e.target.checked })}
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 700, marginBottom: '6px', display: 'block' }}>
                  Threshold Action Limit
                </label>
                <input 
                  type="number" 
                  className="form-input-text" 
                  value={editRuleData.limit || 1} 
                  onChange={e => setEditRuleData({ ...editRuleData, limit: parseInt(e.target.value) || 1 })}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: '#fff' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 700, marginBottom: '6px', display: 'block' }}>
                  Time Window (Seconds)
                </label>
                <input 
                  type="number" 
                  className="form-input-text" 
                  value={editRuleData.window || 10} 
                  onChange={e => setEditRuleData({ ...editRuleData, window: parseInt(e.target.value) || 10 })}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: '#fff' }}
                />
              </div>

              {/* Punishment Action Dropdown */}
              <div className="form-group">
                <label className="form-label" style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 700, marginBottom: '6px', display: 'block' }}>
                  Punishment Action on Violation
                </label>
                <select
                  className="form-input-text"
                  value={editRuleData.action || 'quarantine'}
                  onChange={e => setEditRuleData({ ...editRuleData, action: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: '#fff' }}
                >
                  <option value="quarantine">Quarantine Account (Strip roles & isolate)</option>
                  <option value="ban">Ban Member from Server</option>
                  <option value="kick">Kick Member from Server</option>
                  <option value="timeout">Timeout Member (Mute)</option>
                  <option value="warn">Warn / Log Event Only</option>
                </select>
              </div>

              {/* Anti-Link Specific Ignored Domains */}
              {editRuleData.key === 'anti_link' && (
                <div className="form-group">
                  <label className="form-label" style={{ color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 700, marginBottom: '6px', display: 'block' }}>
                    Ignored Whitelisted Domains (Comma separated)
                  </label>
                  <input 
                    type="text" 
                    className="form-input-text" 
                    placeholder="e.g. spotify.com, open.spotify.com, youtube.com"
                    value={editRuleData.ignoredDomains || ''} 
                    onChange={e => setEditRuleData({ ...editRuleData, ignoredDomains: e.target.value })} 
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: '#fff' }}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                    Domains entered here will bypass anti-link filtering.
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button className="btn btn-secondary" onClick={() => setEditRuleData(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={saveRuleConfig} style={{ fontWeight: 800 }}>Save Rule</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
