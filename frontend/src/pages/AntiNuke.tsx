import React, { useState } from 'react';
import { Shield, Settings, ShieldCheck, Save, ChevronDown, ChevronUp, X } from 'lucide-react';
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

  const [activeCategory, setActiveCategory] = useState<string | null>('member');
  const [editRuleData, setEditRuleData] = useState<any>(null);

  const protectionCategories = [
    {
      id: 'member',
      name: 'Member Protection',
      desc: 'Guard against unauthorized bans, kicks, timeouts, prune actions, and nickname updating abuse.',
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
      rulesList: [
        { key: 'anti_channel_create', name: 'Anti Channel Create', desc: 'Prevents spam creation of channels' },
        { key: 'anti_channel_delete', name: 'Anti Channel Delete', desc: 'Blocks mass deletion of channels' },
        { key: 'anti_channel_update', name: 'Anti Channel Update', desc: 'Flags rapid updates to channel properties' }
      ]
    },
    {
      id: 'role',
      name: 'Role Protection',
      desc: 'Flags unauthorized role creation, position adjustments, deletion, and administrator permission grants.',
      rulesList: [
        { key: 'anti_role_create', name: 'Anti Role Create', desc: 'Blocks unauthorized role creations' },
        { key: 'anti_role_delete', name: 'Anti Role Delete', desc: 'Blocks mass deletion of roles' },
        { key: 'anti_role_update', name: 'Anti Role Update', desc: 'Flags permission elevations or adjustments' }
      ]
    },
    {
      id: 'webhook',
      name: 'Webhook Protection',
      desc: 'Isolates webhooks being rapidly created, updated, or executed with malicious content.',
      rulesList: [
        { key: 'anti_webhook_create', name: 'Anti Webhook Create', desc: 'Blocks rogue webhook provisioning' },
        { key: 'anti_webhook_delete', name: 'Anti Webhook Delete', desc: 'Blocks deletion of system webhooks' }
      ]
    },
    {
      id: 'bot',
      name: 'Bot Integration Protection',
      desc: 'Controls bot additions and blocks unauthorized API integration creations.',
      rulesList: [
        { key: 'anti_bot_add', name: 'Anti Bot Add', desc: 'Blocks rogue bot invites without owner approval' }
      ]
    },
    {
      id: 'content',
      name: 'Content & Link Protection (Anti-Link)',
      desc: 'Controls and filters message content to prevent link spam or malicious server invites.',
      rulesList: [
        { key: 'anti_link', name: 'Anti Link & Invite Guard', desc: 'Blocks unauthorized sharing of HTTP/HTTPS web links and Discord server invite links' }
      ]
    }
  ];

  const saveRuleConfig = () => {
    if (!editRuleData) return;
    const updatedRules = {
      ...rules,
      [editRuleData.key]: {
        enabled: editRuleData.enabled,
        limit: editRuleData.limit,
        window: editRuleData.window,
        action: editRuleData.action
      }
    };
    onUpdateConfig('security', { rules: updatedRules });
    setEditRuleData(null);
    onSaveConfig(`Rule "${editRuleData.key}" saved.`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="page-header">
        <div className="page-title-row">
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Shield size={26} color="#7c5cfc" />
              Anti-Nuke & Threat Protection Rules
            </h1>
            <p className="page-subtitle">Configure granular rate limits, action limits, quarantine bindings, and role hierarchy monitoring.</p>
          </div>
          <button className="btn btn-primary" onClick={() => onSaveConfig('Anti-Nuke settings saved.')}>
            <Save size={14} />
            <span>Save Changes</span>
          </button>
        </div>
      </div>

      {/* Resource Bindings */}
      <div className="section-panel" style={{ padding: '20px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
        <h3 style={{ fontSize: '15px', color: '#ffffff', marginBottom: '14px' }}>Required Anti-Nuke Bindings</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <RoleSelect 
            label="Quarantine Role"
            roles={registry.roles}
            selectedRoleId={quarantineRoleId}
            onChange={id => onUpdateConfig('security', { quarantineRoleId: id })}
          />
          <ChannelSelect 
            label="Alert Notification Channel"
            channels={registry.channels}
            selectedChannelId={alertChannelId}
            onChange={id => onUpdateConfig('security', { alertChannelId: id })}
            typeFilter={['text']}
          />
        </div>
      </div>

      {/* Categories & Rules */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {protectionCategories.map(cat => {
          const isExpanded = activeCategory === cat.id;
          return (
            <div key={cat.id} style={{ border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden', background: 'var(--bg-secondary)' }}>
              <div 
                onClick={() => setActiveCategory(isExpanded ? null : cat.id)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', cursor: 'pointer' }}
              >
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>{cat.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>{cat.desc}</div>
                </div>
                {isExpanded ? <ChevronUp size={18} color="var(--text-muted)" /> : <ChevronDown size={18} color="var(--text-muted)" />}
              </div>

              {isExpanded && (
                <div style={{ padding: '20px', borderTop: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px' }}>
                  {cat.rulesList.map(r => {
                    const ruleVal = rules[r.key] || { enabled: true, limit: 3, window: 10, action: 'quarantine' };
                    return (
                      <div key={r.key} style={{ padding: '16px', borderRadius: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, fontSize: '14px', color: '#fff' }}>{r.name}</span>
                          <button onClick={() => setEditRuleData({ key: r.key, ...ruleVal })} className="btn btn-secondary btn-sm" style={{ padding: '4px 8px' }}>
                            <Settings size={12} />
                          </button>
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{r.desc}</div>
                        <div style={{ fontSize: '11px', color: 'var(--accent-primary)', fontWeight: 600, display: 'flex', gap: '12px' }}>
                          <span>Limit: {ruleVal.limit} / {ruleVal.window}s</span>
                          <span>Action: {ruleVal.action.toUpperCase()}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Edit Modal */}
      {editRuleData && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}>
          <div className="section-panel" style={{ width: '420px', padding: '24px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>Configure {editRuleData.key.replace('anti_', '').toUpperCase()}</h3>
              <button onClick={() => setEditRuleData(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} color="var(--text-muted)" /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label className="form-label">Threshold Action Limit</label>
                <input type="number" className="form-input" value={editRuleData.limit} onChange={e => setEditRuleData({ ...editRuleData, limit: parseInt(e.target.value) || 1 })} />
              </div>
              <div className="form-group">
                <label className="form-label">Time Window (Seconds)</label>
                <input type="number" className="form-input" value={editRuleData.window} onChange={e => setEditRuleData({ ...editRuleData, window: parseInt(e.target.value) || 10 })} />
              </div>
              {editRuleData.key === 'anti_link' && (
                <div className="form-group">
                  <label className="form-label">Ignored Whitelisted Domains (Comma separated)</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. youtube.com, spotify.com, tenor.com"
                    value={editRuleData.ignoredDomains || ''} 
                    onChange={e => setEditRuleData({ ...editRuleData, ignoredDomains: e.target.value })} 
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Domains entered here will bypass anti-link filtering.</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button className="btn btn-secondary" onClick={() => setEditRuleData(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={saveRuleConfig}>Save Rule</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
