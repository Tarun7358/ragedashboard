import React, { useState, useEffect } from 'react';
import { Sparkles, Plus, Trash2, Save, Eye, Hash, Info, Settings2, Shield } from 'lucide-react';
import type { ModuleState, DiscordChannel, DiscordRole } from '../hooks/useDiscordSync';

interface ReactionRolesProps {
  onSaveConfig: (msg: string) => void;
  modules: ModuleState[];
  registry: { channels: DiscordChannel[], roles: DiscordRole[] };
  onUpdateConfig: (moduleId: string, config: Record<string, any>, enabledOverride?: boolean) => void;
}

const QUICK_EMOJIS = ['🎮', '🔔', '🎨', '⚔️', '📢', '🛡️', '💎', '❤️'];

export function ReactionRoles({
  onSaveConfig,
  modules,
  registry,
  onUpdateConfig
}: ReactionRolesProps) {
  const rrModule = (modules || []).find(m => m.id === 'reaction_roles');
  const config = rrModule?.config || {};
  const [roleMap, setRoleMap] = useState<Record<string, string>>({});
  const [newEmoji, setNewEmoji] = useState('🎮');
  const [newRoleId, setNewRoleId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config?.roleMap) {
      setRoleMap(config.roleMap);
    } else {
      setRoleMap({});
    }
  }, [config]);

  const handleToggleEnable = () => {
    if (!rrModule) return;
    const nextEnabled = rrModule.status !== 'enabled';
    onUpdateConfig('reaction_roles', {}, nextEnabled);
    onSaveConfig(`Reaction Roles ${nextEnabled ? 'ENABLED' : 'DISABLED'}.`);
  };

  const handleAddMapping = () => {
    if (!newEmoji || !newRoleId) return;
    const updated = { ...roleMap, [newEmoji]: newRoleId };
    setRoleMap(updated);
    setNewRoleId('');
  };

  const handleRemoveMapping = (emoji: string) => {
    const updated = { ...roleMap };
    delete updated[emoji];
    setRoleMap(updated);
  };

  const handleSave = () => {
    setSaving(true);
    // Make REST API update
    onUpdateConfig('reaction_roles', { roleMap });
    onSaveConfig('Reaction Role configurations saved successfully.');
    setTimeout(() => setSaving(false), 800);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Premium Header */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(124, 92, 252, 0.08) 0%, rgba(79, 140, 255, 0.03) 100%)',
        padding: '24px 32px',
        borderRadius: '16px',
        border: '1px solid rgba(124, 92, 252, 0.15)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
        backdropFilter: 'blur(8px)',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '20px'
      }}>
        <div style={{
          position: 'absolute', top: '-50px', right: '-50px', width: '150px', height: '150px',
          background: 'radial-gradient(circle, rgba(124, 92, 252, 0.25) 0%, transparent 70%)',
          filter: 'blur(20px)', pointerEvents: 'none'
        }} />
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            background: 'linear-gradient(135deg, #7C5CFC 0%, #4F8CFF 100%)',
            padding: '12px',
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(124, 92, 252, 0.4)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Sparkles size={28} />
          </div>
          <div>
            <h1 className="page-title" style={{
              fontSize: '28px',
              fontWeight: 800,
              background: 'linear-gradient(135deg, #FFF 30%, #A78BFA 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              margin: 0,
              letterSpacing: '-0.5px'
            }}>Reaction Roles Panel</h1>
            <p className="page-subtitle" style={{
              fontSize: '14px',
              color: '#94A3B8',
              margin: '4px 0 0 0',
              fontWeight: 500
            }}>
              Configure self-assignable roles linked directly to interactive emoji reactions.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', position: 'relative', zIndex: 2 }}>
          <button 
            className={`btn ${rrModule?.status === 'enabled' ? 'btn-danger' : 'btn-primary'}`}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: rrModule?.status === 'enabled' ? 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)' : 'linear-gradient(135deg, #7C5CFC 0%, #5B21B6 100%)',
              border: 'none',
              color: '#09090B',
              boxShadow: rrModule?.status === 'enabled' ? '0 4px 14px rgba(239, 68, 68, 0.25)' : '0 4px 14px rgba(124, 92, 252, 0.3)'
            }}
            onClick={handleToggleEnable}
          >
            {rrModule?.status === 'enabled' ? 'Deactivate Module' : 'Activate Module'}
          </button>
          
          <button 
            className="btn btn-primary"
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: 'linear-gradient(135deg, #10B981 0%, #047857 100%)',
              border: 'none',
              color: '#09090B',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onClick={handleSave}
            disabled={saving}
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>

      {/* Grid: Editor Left, Live Preview Right */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px', alignItems: 'start' }}>
        
        {/* Editor Left */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Add Mapping Panel */}
          <div className="section-panel" style={{
            background: '#FFFFFF',
            border: '1px solid #E4E4E7',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
            backdropFilter: 'blur(10px)'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#09090B', marginTop: 0, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Settings2 size={18} color="#7C5CFC" /> Map New Reaction Role
            </h3>

            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              
              <div className="form-group" style={{ flex: '1 1 120px' }}>
                <label className="form-label" style={{ fontWeight: 600, color: '#09090B', marginBottom: '8px' }}>Emoji Reaction</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    className="form-select"
                    value={newEmoji}
                    onChange={e => setNewEmoji(e.target.value)}
                    style={{ width: '80px', height: '42px', textAlign: 'center', fontSize: '18px' }}
                  >
                    {QUICK_EMOJIS.map(emoji => (
                      <option key={emoji} value={emoji}>{emoji}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    className="form-input-text"
                    value={newEmoji}
                    onChange={e => setNewEmoji(e.target.value)}
                    placeholder="Custom Emoji"
                    maxLength={4}
                    style={{ flex: 1, height: '42px', textAlign: 'center', fontSize: '16px' }}
                  />
                </div>
              </div>

              <div className="form-group" style={{ flex: '2 1 200px' }}>
                <label className="form-label" style={{ fontWeight: 600, color: '#09090B', marginBottom: '8px' }}>Target Assign Role</label>
                <select
                  className="form-select"
                  value={newRoleId}
                  onChange={e => setNewRoleId(e.target.value)}
                  style={{ width: '100%', height: '42px' }}
                >
                  <option value="">-- Choose Role to Bind --</option>
                  {(registry?.roles || []).filter(r => r.name !== '@everyone').map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              <button
                className="btn btn-primary"
                onClick={handleAddMapping}
                disabled={!newEmoji || !newRoleId}
                style={{
                  height: '42px',
                  padding: '0 20px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'linear-gradient(135deg, #7C5CFC 0%, #4F8CFF 100%)',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer'
                }}
              >
                <Plus size={16} /> Add Mapped Pair
              </button>
            </div>

            {/* Quick Presets */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '16px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: '#94A3B8' }}>Quick Emojis:</span>
              {QUICK_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => setNewEmoji(emoji)}
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '6px',
                    width: '32px',
                    height: '32px',
                    cursor: 'pointer',
                    fontSize: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Active Mappings Panel */}
          <div className="section-panel" style={{
            background: '#FFFFFF',
            border: '1px solid #E4E4E7',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
            backdropFilter: 'blur(10px)'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#09090B', marginTop: 0, marginBottom: '16px' }}>
              Active Configuration Mappings
            </h3>

            {Object.keys(roleMap).length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '32px', border: '1px dashed #E4E4E8', borderRadius: '12px', color: '#94A3B8'
              }}>
                <Info size={32} style={{ marginBottom: '12px', color: '#7C5CFC' }} />
                <p style={{ margin: 0 }}>No active emoji to role mappings configured yet.</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px' }}>Configure and bind mapping pairs above to activate self-assign roles.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {Object.entries(roleMap).map(([emoji, roleId]) => {
                  const role = (registry?.roles || []).find(r => r.id === roleId);
                  return (
                    <div key={emoji} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '12px 20px', background: '#FAFAFC',
                      border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <span style={{ fontSize: '24px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                          {emoji}
                        </span>
                        <div>
                          <div style={{ fontWeight: 600, color: '#09090B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {role?.name || `Unknown Role (${roleId})`}
                            {role?.color && (
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: role.color }} />
                            )}
                          </div>
                          <span style={{ fontSize: '11px', color: '#94A3B8' }}>Mapped to emoji {emoji}</span>
                        </div>
                      </div>
                      <button
                        className="btn"
                        onClick={() => handleRemoveMapping(emoji)}
                        style={{
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: 'none',
                          color: '#EF4444',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          padding: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Live Preview Right */}
        <div style={{ position: 'sticky', top: '100px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Eye size={14} color="#7C5CFC" />
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#7C5CFC', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Discord Spawn Sandbox</span>
          </div>

          {/* Discord Viewport */}
          <div style={{
            background: '#1e1f22', borderRadius: '16px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 12px 40px rgba(0,0,0,0.4)'
          }}>
            {/* Header channel bar */}
            <div style={{ background: '#2b2d31', padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Hash size={18} color="#949ba4" />
              <span style={{ fontSize: '15px', fontWeight: 700, color: '#f2f3f5' }}>get-roles</span>
            </div>

            {/* Message Body */}
            <div style={{ padding: '20px', display: 'flex', gap: 14 }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #7C5CFC 0%, #4F8CFF 100%)',
                flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: '12px', color: '#fff', boxShadow: '0 4px 12px rgba(124, 92, 252, 0.3)'
              }}>
                RO</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: '15px', fontWeight: 600, color: '#fff' }}>Rage Optimiser System</span>
                  <span style={{ background: '#5865F2', fontSize: '9px', fontWeight: 700, color: '#fff', padding: '2px 4px', borderRadius: '3px', textTransform: 'uppercase' }}>BOT</span>
                  <span style={{ fontSize: '12px', color: '#72767d' }}>Today at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>

                {/* Message Embed Card */}
                <div style={{
                  background: '#2b2d31',
                  borderRadius: 4,
                  borderLeft: '4px solid #7C5CFC',
                  padding: '12px 16px',
                  maxWidth: '480px'
                }}>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>🎭 Self-Assign Member Roles</div>
                  <div style={{ fontSize: '14px', color: '#dbdee1', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                    React to this panel below to assign or toggle yourself server categories. Click to toggle.
                  </div>

                  {/* Role lines preview */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px' }}>
                    {Object.entries(roleMap).map(([emoji, roleId]) => {
                      const role = (registry?.roles || []).find(r => r.id === roleId);
                      return (
                        <div key={emoji} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#dbdee1' }}>
                          <span style={{ fontSize: '16px' }}>{emoji}</span>
                          <span>—</span>
                          <span style={{
                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                            padding: '1px 6px', borderRadius: '4px', fontSize: '12px', fontWeight: 500,
                            color: role?.color || '#dbdee1', display: 'inline-flex', alignItems: 'center', gap: '4px'
                          }}>
                            <Shield size={10} />
                            {role?.name || 'Unknown Role'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* React Button list */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}>
                  {Object.keys(roleMap).map(emoji => (
                    <div key={emoji} style={{
                      background: '#2b2d31', border: '1px solid #7C5CFC33', borderRadius: '4px',
                      padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px',
                      fontSize: '14px', cursor: 'pointer', color: '#dbdee1'
                    }}>
                      <span>{emoji}</span>
                      <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>1</span>
                    </div>
                  ))}
                </div>

              </div>
            </div>
          </div>

          {/* Quick Info Alert */}
          <div style={{ display: 'flex', gap: '10px', background: 'rgba(124, 92, 252, 0.05)', padding: '14px 16px', borderRadius: '12px', border: '1px solid rgba(124, 92, 252, 0.15)' }}>
            <Info size={16} color="#A78BFA" style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: '12px', color: '#94A3B8', margin: 0, lineHeight: 1.5 }}>
              Assign roles are persistent. Members toggle status in real-time. Spawn this panel inside any channel in your server using the <code>/reactionrole</code> chat command.
            </p>
          </div>

        </div>

      </div>

    </div>
  );
}
