import React, { useState } from 'react';
import { Bot, Shield, Plus, X, Link, Type, Save, Hash, ShieldCheck } from 'lucide-react';
import type { ModuleState, DiscordResourceRegistry } from '../hooks/useDiscordSync';

interface AutomodProps {
  onSaveConfig: (msg: string) => void;
  modules: ModuleState[];
  registry: DiscordResourceRegistry;
  onUpdateConfig: (moduleId: string, config: Record<string, any>, enabled?: boolean) => void;
}

export function Automod({ onSaveConfig, modules, registry, onUpdateConfig }: AutomodProps) {
  const amModule = (modules || []).find(m => m.id === 'automod') || { status: 'disabled', config: {} as any };
  const config: Record<string, any> = amModule.config || {};
  const isEnabled = amModule.status === 'enabled';

  const [newWord, setNewWord] = useState('');
  const [selectedChannelToAdd, setSelectedChannelToAdd] = useState('');
  const [selectedRoleToAdd, setSelectedRoleToAdd] = useState('');

  const handleToggleEnable = () => {
    onUpdateConfig('automod', {}, !isEnabled);
    onSaveConfig(`AI Automod module ${!isEnabled ? 'ENABLED' : 'DISABLED'}.`);
  };

  const handleUpdate = (field: string, value: any) => {
    onUpdateConfig('automod', { [field]: value });
  };

  const handleAddWord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWord.trim()) return;
    const currentWords = config.badWords || [];
    if (!currentWords.includes(newWord.trim().toLowerCase())) {
      handleUpdate('badWords', [...currentWords, newWord.trim().toLowerCase()]);
    }
    setNewWord('');
  };

  const handleRemoveWord = (word: string) => {
    const currentWords = config.badWords || [];
    handleUpdate('badWords', currentWords.filter((w: string) => w !== word));
  };

  const ignoredChannels: string[] = config.ignoredChannels || [];
  const ignoredRoles: string[] = config.ignoredRoles || [];

  const handleAddChannel = () => {
    if (!selectedChannelToAdd || ignoredChannels.includes(selectedChannelToAdd)) return;
    handleUpdate('ignoredChannels', [...ignoredChannels, selectedChannelToAdd]);
    setSelectedChannelToAdd('');
  };

  const handleRemoveChannel = (channelId: string) => {
    handleUpdate('ignoredChannels', ignoredChannels.filter((id: string) => id !== channelId));
  };

  const handleAddRole = () => {
    if (!selectedRoleToAdd || ignoredRoles.includes(selectedRoleToAdd)) return;
    handleUpdate('ignoredRoles', [...ignoredRoles, selectedRoleToAdd]);
    setSelectedRoleToAdd('');
  };

  const handleRemoveRole = (roleId: string) => {
    handleUpdate('ignoredRoles', ignoredRoles.filter((id: string) => id !== roleId));
  };

  const textChannels = (registry.channels || []).filter(c => !c.type || c.type === 'text' || c.type === '0');
  const serverRoles = registry.roles || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header */}
      <div className="page-header">
        <div className="page-title-row">
          <div>
            <h1 className="page-title">AI Automod & AntiLink Settings</h1>
            <p className="page-subtitle">Configure intelligent chat filters, anti-link rules, ignored channels, and role bypasses.</p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              className="btn btn-primary"
              onClick={() => onSaveConfig('Automod settings saved successfully.')}
            >
              <Save size={14} />
              <span>Save Changes</span>
            </button>
            <button 
              className={`btn ${isEnabled ? 'btn-danger' : 'btn-success'}`}
              onClick={handleToggleEnable}
            >
              <Bot size={14} />
              <span>{isEnabled ? 'Disable Module' : 'Enable Module'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="dashboard-layout-grid">
        
        {/* Left Column: General & Filters */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* General Settings */}
          <div className="section-panel">
            <div className="panel-header">
              <span className="panel-title">General Settings</span>
              <Shield size={16} color="var(--text-muted)" />
            </div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              <div className="form-group">
                <label className="form-label">Intervention Log Channel</label>
                <select 
                  className="form-select"
                  value={config.logChannelId || ''}
                  onChange={(e) => handleUpdate('logChannelId', e.target.value)}
                >
                  <option value="">Select a channel...</option>
                  {textChannels.map(c => (
                    <option key={c.id} value={c.id}>#{c.name}</option>
                  ))}
                </select>
                <div className="form-help">Where Automod sends reports when it deletes messages or punishes users.</div>
              </div>

              <div className="form-group">
                <label className="form-label">Automated Punishment</label>
                <select 
                  className="form-select"
                  value={config.punishment || 'warn'}
                  onChange={(e) => handleUpdate('punishment', e.target.value)}
                >
                  <option value="warn">Warn User (Delete Message)</option>
                  <option value="timeout">Timeout (5 Minutes)</option>
                  <option value="kick">Kick User</option>
                </select>
                <div className="form-help">The action taken when a user triggers any enabled filter.</div>
              </div>
            </div>
          </div>

          {/* Filter Toggles */}
          <div className="section-panel">
            <div className="panel-header">
              <span className="panel-title">Protection Filters</span>
            </div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              <div className="setting-card">
                <div className="setting-info">
                  <div className="setting-title">
                    <Link size={16} color="var(--accent-primary)" />
                    Block Unauthorized Links (AntiLink)
                  </div>
                  <div className="setting-desc">Auto-deletes messages containing `http://` or `https://` (Ignored channels and roles bypass this).</div>
                </div>
                <label className="switch">
                  <input 
                    type="checkbox" 
                    checked={config.blockLinks !== false}
                    onChange={(e) => handleUpdate('blockLinks', e.target.checked)}
                  />
                  <span className="slider round"></span>
                </label>
              </div>

              <div className="setting-card">
                <div className="setting-info">
                  <div className="setting-title">
                    <Type size={16} color="var(--accent-primary)" />
                    Prevent CAPS Spam
                  </div>
                  <div className="setting-desc">Deletes messages that consist of more than 70% capital letters (ignores short messages).</div>
                </div>
                <label className="switch">
                  <input 
                    type="checkbox" 
                    checked={config.preventCapsSpam || false}
                    onChange={(e) => handleUpdate('preventCapsSpam', e.target.checked)}
                  />
                  <span className="slider round"></span>
                </label>
              </div>

            </div>
          </div>

          {/* AntiLink Channel & Role Bypasses */}
          <div className="section-panel">
            <div className="panel-header">
              <span className="panel-title">AntiLink Channel & Role Bypasses</span>
              <ShieldCheck size={16} color="var(--accent-primary)" />
            </div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Messages posted in ignored channels, or sent by members holding an ignored role, will automatically bypass AntiLink link purges.
              </div>

              {/* Ignored Channels */}
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Hash size={14} color="var(--accent-primary)" />
                  Ignored Channels (Links Allowed)
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select 
                    className="form-select"
                    value={selectedChannelToAdd}
                    onChange={(e) => setSelectedChannelToAdd(e.target.value)}
                    style={{ flex: 1 }}
                  >
                    <option value="">Select a text channel to ignore...</option>
                    {textChannels
                      .filter(c => !ignoredChannels.includes(c.id))
                      .map(c => (
                        <option key={c.id} value={c.id}>#{c.name}</option>
                      ))}
                  </select>
                  <button 
                    type="button" 
                    className="btn btn-primary"
                    disabled={!selectedChannelToAdd}
                    onClick={handleAddChannel}
                  >
                    <Plus size={16} />
                    <span>Add</span>
                  </button>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                  {ignoredChannels.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      No channels ignored yet. AntiLink filters all channels.
                    </div>
                  ) : (
                    ignoredChannels.map(id => {
                      const ch = textChannels.find(c => c.id === id);
                      return (
                        <div 
                          key={id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            backgroundColor: 'rgba(124, 92, 252, 0.12)',
                            color: 'var(--accent-primary)',
                            padding: '4px 10px',
                            borderRadius: '16px',
                            fontSize: '13px',
                            border: '1px solid rgba(124, 92, 252, 0.3)',
                            fontWeight: 600
                          }}
                        >
                          <Hash size={12} />
                          <span>{ch ? ch.name : id}</span>
                          <button 
                            onClick={() => handleRemoveChannel(id)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 0 }}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Ignored Roles */}
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldCheck size={14} color="var(--accent-purple)" />
                  Ignored Roles (Links Allowed Server-Wide)
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select 
                    className="form-select"
                    value={selectedRoleToAdd}
                    onChange={(e) => setSelectedRoleToAdd(e.target.value)}
                    style={{ flex: 1 }}
                  >
                    <option value="">Select a role to ignore...</option>
                    {serverRoles
                      .filter(r => !ignoredRoles.includes(r.id))
                      .map(r => (
                        <option key={r.id} value={r.id}>@{r.name}</option>
                      ))}
                  </select>
                  <button 
                    type="button" 
                    className="btn btn-primary"
                    disabled={!selectedRoleToAdd}
                    onClick={handleAddRole}
                  >
                    <Plus size={16} />
                    <span>Add</span>
                  </button>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                  {ignoredRoles.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      No roles ignored yet. Only Server Owner and Admins bypass AntiLink.
                    </div>
                  ) : (
                    ignoredRoles.map(id => {
                      const r = serverRoles.find(role => role.id === id);
                      return (
                        <div 
                          key={id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            backgroundColor: 'rgba(52, 211, 153, 0.12)',
                            color: '#10b981',
                            padding: '4px 10px',
                            borderRadius: '16px',
                            fontSize: '13px',
                            border: '1px solid rgba(52, 211, 153, 0.3)',
                            fontWeight: 600
                          }}
                        >
                          <span>@{r ? r.name : id}</span>
                          <button 
                            onClick={() => handleRemoveRole(id)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: 0 }}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Right Column: Bad Words Blacklist */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div className="section-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div className="panel-header">
              <span className="panel-title">Custom Word Filter</span>
            </div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Add specific words or phrases you want Automod to instantly delete.
              </div>

              <form onSubmit={handleAddWord} style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text"
                  className="form-input"
                  placeholder="Type a word and press Enter..."
                  value={newWord}
                  onChange={(e) => setNewWord(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button type="submit" className="btn btn-primary" disabled={!newWord.trim()}>
                  <Plus size={16} />
                </button>
              </form>

              <div style={{ 
                display: 'flex', 
                flexWrap: 'wrap', 
                gap: '8px', 
                marginTop: '8px',
                alignItems: 'flex-start',
                alignContent: 'flex-start',
                flex: 1
              }}>
                {(config.badWords || []).length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    No words added to the blacklist yet.
                  </div>
                ) : (
                  (config.badWords || []).map((word: string) => (
                    <div 
                      key={word} 
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '6px',
                        backgroundColor: 'var(--bg-secondary)',
                        padding: '4px 10px',
                        borderRadius: '16px',
                        fontSize: '13px',
                        border: '1px solid var(--border-color)'
                      }}
                    >
                      <span>{word}</span>
                      <button 
                        onClick={() => handleRemoveWord(word)}
                        style={{ 
                          background: 'none', 
                          border: 'none', 
                          color: 'var(--text-muted)', 
                          cursor: 'pointer',
                          display: 'flex',
                          padding: 0
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
