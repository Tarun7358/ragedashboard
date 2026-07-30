import React, { useState, useEffect } from 'react';
import type { ModuleState, DiscordRole, DiscordChannel } from '../../hooks/useDiscordSync';
import { Settings, ShieldAlert, Key, MessageSquare, Save, Hammer, Ban, AlertTriangle, ShieldAlert as AlertIcon, RefreshCw, Layers } from 'lucide-react';
import { ChannelSelect } from '../../components/ResourceSelectors';

interface WhitelistSettingsProps {
  modules?: ModuleState[];
  registry?: { roles: DiscordRole[]; channels: DiscordChannel[] };
  onUpdateConfig?: (moduleId: string, config: Record<string, any>, enabledOverride?: boolean) => void;
  onSave?: () => void;
}

const FRONTEND_PROTECTIONS = [
  { key: 'anti_ban', label: 'Anti Ban', desc: 'Triggers when a member is banned from the server' },
  { key: 'anti_unban', label: 'Anti Unban', desc: 'Triggers when a member is unbanned' },
  { key: 'anti_kick', label: 'Anti Kick', desc: 'Triggers when a member is kicked' },
  { key: 'anti_prune', label: 'Anti Member Prune', desc: 'Triggers when bulk member pruning occurs' },
  { key: 'anti_bot_add', label: 'Anti Bot Add', desc: 'Triggers when an unapproved bot joins' },
  { key: 'anti_channel_create', label: 'Anti Channel Create', desc: 'Triggers when a channel is created' },
  { key: 'anti_channel_delete', label: 'Anti Channel Delete', desc: 'Triggers when a channel is deleted' },
  { key: 'anti_channel_update', label: 'Anti Channel Update', desc: 'Triggers when channel properties are updated' },
  { key: 'anti_role_create', label: 'Anti Role Create', desc: 'Triggers when a role is created' },
  { key: 'anti_role_delete', label: 'Anti Role Delete', desc: 'Triggers when a role is deleted' },
  { key: 'anti_role_update', label: 'Anti Role Update', desc: 'Triggers when role permissions are modified' },
  { key: 'anti_role_grant', label: 'Anti Role Assign', desc: 'Triggers when administrative roles are granted' },
  { key: 'anti_role_remove', label: 'Anti Role Remove', desc: 'Triggers when administrative roles are stripped' },
  { key: 'anti_member_update', label: 'Anti Member Update', desc: 'Triggers when member properties are updated' },
  { key: 'anti_emoji_create', label: 'Anti Emoji/Sticker Create', desc: 'Triggers when emojis or stickers are created' },
  { key: 'anti_emoji_delete', label: 'Anti Emoji/Sticker Delete', desc: 'Triggers when emojis or stickers are deleted' },
  { key: 'anti_emoji_update', label: 'Anti Emoji/Sticker Update', desc: 'Triggers when emojis or stickers are modified' },
  { key: 'anti_everyone_ping', label: 'Anti Everyone/Here Ping', desc: 'Triggers on unauthorized @everyone or @here mentions' },
  { key: 'anti_role_ping', label: 'Anti Role Ping', desc: 'Triggers on unauthorized mass role pings' },
  { key: 'anti_integration', label: 'Anti Integration', desc: 'Triggers when integrations or bots are modified' },
  { key: 'anti_guild_update', label: 'Anti Guild Update', desc: 'Triggers when server properties or vanity URL are altered' },
  { key: 'anti_webhook_create', label: 'Anti Webhook Create', desc: 'Triggers when a webhook is created' },
  { key: 'anti_webhook_delete', label: 'Anti Webhook Delete', desc: 'Triggers when a webhook is deleted' },
  { key: 'anti_webhook_update', label: 'Anti Webhook Update', desc: 'Triggers when webhook settings are modified' },
  { key: 'anti_invite_create', label: 'Anti Invite Create', desc: 'Triggers when invite links are created' },
  { key: 'anti_invite_delete', label: 'Anti Invite Delete', desc: 'Triggers when invite links are revoked' },
  { key: 'anti_timeout', label: 'Anti Timeout Abuse', desc: 'Triggers when rapid member timeouts are executed' },
  { key: 'anti_link', label: 'Anti Link Filter', desc: 'Triggers when unauthorized links or invite URLs are posted' }
];

export function WhitelistSettings({ modules, registry, onUpdateConfig, onSave }: WhitelistSettingsProps) {
  const securityModule = (modules || []).find(m => m.id === 'security');
  const secConfig = securityModule?.config || {};
  const rules = secConfig.rules || {};

  const [strictMode, setStrictMode] = useState(secConfig.strictMode ?? true);
  const [auditLogging, setAuditLogging] = useState(secConfig.auditLogging ?? true);
  const [auditChannel, setAuditChannel] = useState(secConfig.alertChannelId || '');
  const [notifyOnViolation, setNotifyOnViolation] = useState(secConfig.notifyOnViolation ?? true);
  
  // Track changes locally to batch save or update dynamically
  const [localRules, setLocalRules] = useState<Record<string, any>>({});

  useEffect(() => {
    if (rules) {
      setLocalRules(rules);
    }
  }, [JSON.stringify(rules)]);

  const handleRuleActionChange = (key: string, action: string) => {
    const nextRules = {
      ...localRules,
      [key]: {
        ...(localRules[key] || { enabled: true, limit: 3, window: 10, recovery: true }),
        action
      }
    };
    setLocalRules(nextRules);
    if (onUpdateConfig) {
      onUpdateConfig('security', { rules: nextRules });
    }
  };

  const handleApplyGlobally = (action: string) => {
    const nextRules = { ...localRules };
    FRONTEND_PROTECTIONS.forEach(p => {
      nextRules[p.key] = {
        ...(nextRules[p.key] || { enabled: true, limit: 3, window: 10, recovery: true }),
        action
      };
    });
    setLocalRules(nextRules);
    if (onUpdateConfig) {
      onUpdateConfig('security', { rules: nextRules });
    }
  };

  const handleSave = () => {
    if (onUpdateConfig) {
      onUpdateConfig('security', {
        strictMode,
        auditLogging,
        alertChannelId: auditChannel,
        notifyOnViolation,
        rules: localRules
      });
    }
    if (onSave) onSave();
  };

  return (
    <div className="module-page" style={{ padding: '32px', paddingBottom: '300px', fontFamily: '"Outfit", "Inter", sans-serif' }}>
      <div className="module-header" style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '28px', fontWeight: 800, background: 'linear-gradient(135deg, #7C5CFC, #A855F7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            <Settings size={32} style={{ stroke: 'url(#settings-grad)' }} />
            <svg width="0" height="0"><defs><linearGradient id="settings-grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#7C5CFC" /><stop offset="100%" stopColor="#A855F7" /></linearGradient></defs></svg>
            Whitelist Settings
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '4px', fontSize: '14px' }}>Global settings, rules, and violation punishments for non-whitelisted activities.</p>
        </div>
        <button className="btn btn-primary" onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '10px', fontWeight: 700, transition: 'all 0.2s', boxShadow: '0 4px 14px rgba(124, 92, 252, 0.4)' }}>
          <Save size={18} /> Save Settings
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* Core Protection Rules */}
        <div className="card" style={{ padding: '28px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', backdropFilter: 'blur(20px)' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#7C5CFC', marginBottom: '20px', fontSize: '18px', fontWeight: 700 }}>
            <ShieldAlert size={22} /> Core Protection Rules
          </h3>
          
          <div className="form-group-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ marginRight: '24px' }}>
              <div className="form-label" style={{ fontWeight: 600, fontSize: '14px', color: '#fff' }}>Strict Enforcement Mode</div>
              <div className="form-help" style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px', opacity: 0.8 }}>Automatically kick unwhitelisted bots upon joining and strip administrative roles from non-bypassed members.</div>
            </div>
            <label className="switch">
              <input type="checkbox" checked={strictMode} onChange={e => setStrictMode(e.target.checked)} />
              <span className="slider"></span>
            </label>
          </div>

          <div className="form-group-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: 'none' }}>
            <div>
              <div className="form-label" style={{ fontWeight: 600, fontSize: '14px', color: '#fff' }}>Active Violation Alerts</div>
              <div className="form-help" style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px', opacity: 0.8 }}>Ping the server owner and administrators immediately when a high-risk entity breaches whitelist restrictions.</div>
            </div>
            <label className="switch">
              <input type="checkbox" checked={notifyOnViolation} onChange={e => setNotifyOnViolation(e.target.checked)} />
              <span className="slider"></span>
            </label>
          </div>
        </div>

        {/* Whitelist Violation Punishments (NEW PREMIUM PANEL) */}
        <div className="card" style={{ padding: '28px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', backdropFilter: 'blur(20px)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#7C5CFC', fontSize: '18px', fontWeight: 700 }}>
                <AlertIcon size={22} /> Whitelist Violation Punishments
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px', opacity: 0.8 }}>Define the punishment action to execute when an unwhitelisted member triggers a security rule.</p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>Apply Globally:</span>
              {['quarantine', 'ban', 'kick', 'strip_roles', 'timeout'].map(action => (
                <button
                  key={action}
                  onClick={() => handleApplyGlobally(action)}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '11px', padding: '6px 12px', textTransform: 'uppercase', fontWeight: 700 }}
                >
                  {action.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {FRONTEND_PROTECTIONS.map(p => {
              const rule = localRules[p.key] || {};
              const currentAction = rule.action || 'quarantine';
              return (
                <div 
                  key={p.key} 
                  className="form-group-row" 
                  style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    padding: '14px 20px', 
                    background: 'rgba(255,255,255,0.01)', 
                    borderRadius: '10px', 
                    border: '1px solid rgba(255,255,255,0.03)',
                    transition: 'all 0.2s'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#fff' }}>{p.label}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', opacity: 0.7, marginTop: '2px' }}>{p.desc}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {currentAction === 'timeout' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Duration:</span>
                        <input
                          type="number"
                          min="1"
                          max="40320"
                          value={rule.timeoutDuration || 60}
                          onChange={e => {
                            const val = parseInt(e.target.value) || 60;
                            const nextRules = {
                              ...localRules,
                              [p.key]: {
                                ...(localRules[p.key] || { enabled: true, limit: 3, window: 10, recovery: true }),
                                timeoutDuration: val
                              }
                            };
                            setLocalRules(nextRules);
                            if (onUpdateConfig) {
                              onUpdateConfig('security', { rules: nextRules });
                            }
                          }}
                          style={{
                            width: '60px',
                            padding: '6px 8px',
                            borderRadius: '6px',
                            background: 'rgba(0,0,0,0.4)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: '#fff',
                            fontSize: '11px',
                            textAlign: 'center'
                          }}
                        />
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>min</span>
                      </div>
                    )}
                    <select
                      value={currentAction}
                      onChange={e => handleRuleActionChange(p.key, e.target.value)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: '8px',
                        background: 'rgba(0,0,0,0.4)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        outline: 'none'
                      }}
                    >
                      <option value="quarantine">🔒 Quarantine Violator</option>
                      <option value="ban">🔨 Ban Violator</option>
                      <option value="kick">👟 Kick Violator</option>
                      <option value="strip_roles">🪄 Strip Privileged Roles</option>
                      <option value="timeout">⏱️ Timeout Violator</option>
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Audit & Logging */}
        <div className="card" style={{ padding: '28px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', backdropFilter: 'blur(20px)' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#7C5CFC', marginBottom: '20px', fontSize: '18px', fontWeight: 700 }}>
            <MessageSquare size={22} /> Audit & Logging
          </h3>
          <div className="form-group-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0' }}>
            <div>
              <div className="form-label" style={{ fontWeight: 600, fontSize: '14px', color: '#fff' }}>Immutable Audit Log</div>
              <div className="form-help" style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px', opacity: 0.8 }}>Record every addition, removal, and modification of whitelist entries across all domains (Bots, Members, Roles).</div>
            </div>
            <label className="switch">
              <input type="checkbox" checked={auditLogging} onChange={e => setAuditLogging(e.target.checked)} />
              <span className="slider"></span>
            </label>
          </div>
          
          {auditLogging && (
            <div style={{ padding: '20px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.03)', borderRadius: '10px', marginTop: '16px' }}>
              <div className="form-group">
                <ChannelSelect 
                  label="Log Output Channel"
                  channels={registry?.channels || []}
                  selectedChannelId={auditChannel}
                  onChange={(id) => setAuditChannel(id)}
                  typeFilter={['text']}
                  helpText="Select a secure channel to pipe raw JSON and embed alerts for the WTPS audit trail."
                />
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
