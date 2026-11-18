import { API_BASE } from '../config';
import React, { useState, useEffect } from 'react';
import { Award, Save, RefreshCw, Trash2, Plus, Info, ShieldAlert, BarChart2, Shield } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import type { ModuleState, DiscordRole } from '../hooks/useDiscordSync';

interface LevelingProps {
  onSaveConfig: (msg: string) => void;
  modules: ModuleState[];
  registry: { roles: DiscordRole[] };
  onUpdateConfig: (moduleId: string, config: Record<string, any>, enabledOverride?: boolean) => void;
}

export function Leveling({
  onSaveConfig,
  modules,
  registry,
  onUpdateConfig
}: LevelingProps) {
  const { activeGuildId: authGuildId, token: authToken } = useAuth();
  const levelingModule = (modules || []).find(m => m.id === 'leveling');
  const isEnabled = levelingModule?.status === 'enabled';
  
  const [multiplier, setMultiplier] = useState('1.0');
  const [roleRewards, setRoleRewards] = useState<Record<string, string>>({});
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [newLevel, setNewLevel] = useState('');
  const [newRoleId, setNewRoleId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);

  const fetchState = async () => {
    const token = authToken || localStorage.getItem('cn_token');
    const currentGuild = authGuildId || localStorage.getItem('cn_active_guild');
    if (!token) return;

    setLoading(true);
    try {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`
      };
      if (currentGuild) {
        headers['X-Guild-Id'] = currentGuild;
      }

      const res = await fetch(`${API_BASE}/api/modules/leveling/state`, { headers });
      if (res.ok) {
        const data = await res.json();
        setMultiplier(data.multiplier || '1.0');
        setRoleRewards(data.roleRewards || {});
        setLeaderboard(data.leaderboard || []);
      }
    } catch (err) {
      console.error('Error fetching leveling state:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchState();
  }, [authGuildId, authToken, modules]);

  const handleToggleEnable = () => {
    if (!levelingModule) return;
    const nextEnabled = levelingModule.status !== 'enabled';
    onUpdateConfig('leveling', {}, nextEnabled);
    onSaveConfig(`Leveling & XP module ${nextEnabled ? 'ENABLED' : 'DISABLED'}.`);
  };

  const handleSaveSettings = async () => {
    const token = localStorage.getItem('cn_token');
    const currentGuild = localStorage.getItem('cn_active_guild');
    if (!token) return;

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/modules/leveling/update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Guild-Id': currentGuild || ''
        },
        body: JSON.stringify({ multiplier, roleRewards })
      });

      if (res.ok) {
        const data = await res.json();
        onUpdateConfig('leveling', { multiplier, roleRewards });
        onSaveConfig('Leveling & XP configurations saved successfully.');
      } else {
        onSaveConfig('Error saving leveling config.');
      }
    } catch (err) {
      console.error(err);
      onSaveConfig('Error updating leveling config.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddReward = () => {
    if (!newLevel || !newRoleId) return;
    if (isNaN(parseInt(newLevel))) return;
    const updated = { ...roleRewards, [newLevel]: newRoleId };
    setRoleRewards(updated);
    setNewLevel('');
    setNewRoleId('');
  };

  const handleRemoveReward = (lvl: string) => {
    const updated = { ...roleRewards };
    delete updated[lvl];
    setRoleRewards(updated);
  };

  const handleResetDatabase = async () => {
    const token = localStorage.getItem('cn_token');
    const currentGuild = localStorage.getItem('cn_active_guild');
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE}/api/modules/leveling/reset`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Guild-Id': currentGuild || ''
        }
      });
      if (res.ok) {
        setLeaderboard([]);
        setResetConfirm(false);
        onSaveConfig('Leveling & XP database reset successfully.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Premium Header */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.14) 0%, rgba(15, 23, 42, 0.95) 100%)',
        padding: '24px 32px',
        borderRadius: '16px',
        border: '1px solid rgba(234, 179, 8, 0.3)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
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
          background: 'radial-gradient(circle, rgba(234, 179, 8, 0.2) 0%, transparent 70%)',
          filter: 'blur(20px)', pointerEvents: 'none'
        }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            background: 'linear-gradient(135deg, #EAB308 0%, #F97316 100%)',
            padding: '12px',
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(234, 179, 8, 0.3)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Award size={28} />
          </div>
          <div>
            <h1 style={{
              fontSize: '26px',
              fontWeight: 800,
              color: '#F8FAFC',
              margin: 0,
              letterSpacing: '-0.5px'
            }}>Leveling & XP System</h1>
            <p style={{
              fontSize: '14px',
              color: '#94A3B8',
              margin: '4px 0 0 0',
              fontWeight: 500
            }}>
              Configure message activity experience rates, rank progression rewards, and view leaderboard metrics.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', position: 'relative', zIndex: 2 }}>
          <button 
            className={`btn ${isEnabled ? 'btn-danger' : 'btn-primary'}`}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: isEnabled ? 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)' : 'linear-gradient(135deg, #EAB308 0%, #C2410C 100%)',
              border: 'none',
              color: '#FFF',
              boxShadow: isEnabled ? '0 4px 14px rgba(239, 68, 68, 0.25)' : '0 4px 14px rgba(234, 179, 8, 0.25)'
            }}
            onClick={handleToggleEnable}
          >
            {isEnabled ? 'Deactivate Module' : 'Activate Module'}
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
              color: '#FFF',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onClick={handleSaveSettings}
            disabled={saving}
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px', alignItems: 'start' }}>
        
        {/* Left Hand Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Rate and Multipliers */}
          <div className="section-panel" style={{
            background: 'rgba(30, 41, 59, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
            backdropFilter: 'blur(10px)'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#FFF', marginTop: 0, marginBottom: '16px' }}>
              XP Generation Velocity
            </h3>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 600, color: '#E2E8F0', marginBottom: '8px' }}>Global XP Multiplier</label>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <select
                  className="form-select"
                  value={multiplier}
                  onChange={e => setMultiplier(e.target.value)}
                  style={{ width: '100%', height: '42px' }}
                >
                  <option value="0.5">0.5x Multiplier (Slower Progression)</option>
                  <option value="1.0">1.0x Multiplier (Standard Progression)</option>
                  <option value="1.5">1.5x Multiplier (Boosted progression)</option>
                  <option value="2.0">2.0x Multiplier (Double Speed)</option>
                  <option value="3.0">3.0x Multiplier (Event Triple Speed)</option>
                </select>
              </div>
              <p style={{ fontSize: '12px', color: '#94A3B8', marginTop: '8px', lineHeight: 1.5 }}>
                Controls how much XP members earn per text message. Standard XP yields between 15-25 XP per message. Multiplier directly boosts this reward.
              </p>
            </div>
          </div>

          {/* Level Role Rewards Milestones */}
          <div className="section-panel" style={{
            background: 'rgba(30, 41, 59, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
            backdropFilter: 'blur(10px)'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#FFF', marginTop: 0, marginBottom: '16px' }}>
              Level Milestone Role Rewards
            </h3>

            {/* Input fields */}
            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '20px' }}>
              <div className="form-group" style={{ flex: '1 1 100px' }}>
                <label className="form-label" style={{ fontWeight: 600, color: '#E2E8F0', marginBottom: '8px' }}>Level Milestone</label>
                <input
                  type="number"
                  className="form-input-text"
                  placeholder="e.g. 5"
                  value={newLevel}
                  onChange={e => setNewLevel(e.target.value)}
                  style={{ height: '42px', fontSize: '15px' }}
                />
              </div>

              <div className="form-group" style={{ flex: '2 1 200px' }}>
                <label className="form-label" style={{ fontWeight: 600, color: '#E2E8F0', marginBottom: '8px' }}>Reward Role</label>
                <select
                  className="form-select"
                  value={newRoleId}
                  onChange={e => setNewRoleId(e.target.value)}
                  style={{ width: '100%', height: '42px' }}
                >
                  <option value="">-- Choose Role --</option>
                  {(registry?.roles || []).filter(r => r.name !== '@everyone').map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              <button
                className="btn btn-primary"
                onClick={handleAddReward}
                disabled={!newLevel || !newRoleId}
                style={{
                  height: '42px', padding: '0 20px', borderRadius: '8px', fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: '8px',
                  background: 'linear-gradient(135deg, #EAB308 0%, #C2410C 100%)', border: 'none', color: '#fff', cursor: 'pointer'
                }}
              >
                <Plus size={16} /> Add Milestone
              </button>
            </div>

            {/* List */}
            {Object.keys(roleRewards).length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '24px', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: '12px', color: '#94A3B8'
              }}>
                <p style={{ margin: 0 }}>No role reward milestones configured.</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px' }}>Members won't receive extra roles on leveling up until milestones are configured.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {Object.entries(roleRewards).map(([levelVal, roleId]) => {
                  const role = (registry?.roles || []).find(r => r.id === roleId);
                  return (
                    <div key={levelVal} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '12px 20px', background: 'rgba(15, 23, 42, 0.3)',
                      border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{
                          background: 'rgba(234, 179, 8, 0.1)', color: '#EAB308',
                          width: '40px', height: '40px', borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 800, fontSize: '14px'
                        }}>
                          Lvl {levelVal}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: '#F1F5F9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {role?.name || `Unknown Role (${roleId})`}
                            {role?.color && (
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: role.color }} />
                            )}
                          </div>
                          <span style={{ fontSize: '11px', color: '#94A3B8' }}>Awarded automatically at Level {levelVal}</span>
                        </div>
                      </div>

                      <button
                        className="btn"
                        onClick={() => handleRemoveReward(levelVal)}
                        style={{
                          background: 'rgba(239, 68, 68, 0.1)', border: 'none', color: '#EF4444',
                          borderRadius: '8px', cursor: 'pointer', padding: '8px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s'
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
          {/* Danger zone reset */}
          <div className="section-panel" style={{
            background: 'rgba(239, 68, 68, 0.03)',
            border: '1px solid rgba(239, 68, 68, 0.15)',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
            backdropFilter: 'blur(10px)'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#EF4444', marginTop: 0, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldAlert size={18} /> Administrative Commands
            </h3>
            <p style={{ fontSize: '13px', color: '#94A3B8', marginTop: 0, marginBottom: '16px', lineHeight: 1.5 }}>
              Resetting Leveling database clears all member accumulated XP files and returns everybody back to Level 0. This action is permanent and cannot be undone.
            </p>

            {resetConfirm ? (
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  className="btn btn-danger"
                  onClick={handleResetDatabase}
                  style={{ background: '#EF4444', border: 'none', color: '#fff', fontWeight: 600, padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Yes, Clear Database
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setResetConfirm(false)}
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="btn btn-danger"
                onClick={() => setResetConfirm(true)}
                style={{
                  background: 'transparent', border: '1px solid #EF4444', color: '#EF4444',
                  fontWeight: 600, padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s'
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#EF4444'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#EF4444'; }}
              >
                Reset Member XP Database
              </button>
            )}
          </div>

        </div>

        {/* Leaderboard Table Right */}
        <div className="section-panel" style={{
          background: 'rgba(30, 41, 59, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#FFF', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BarChart2 size={18} color="#EAB308" /> Server Leaderboard
            </h3>
            <button
              onClick={fetchState}
              disabled={loading}
              style={{
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)',
                padding: '6px', borderRadius: '6px', color: '#94A3B8', cursor: 'pointer', display: 'flex', alignItems: 'center'
              }}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
            </button>
          </div>

          {loading && leaderboard.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: '#94A3B8' }}>Loading leaderboard...</div>
          ) : leaderboard.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '40px', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: '12px', color: '#94A3B8'
            }}>
              <Info size={32} style={{ marginBottom: '12px', color: '#EAB308' }} />
              <p style={{ margin: 0 }}>Leaderboard is empty.</p>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px' }}>Start sending messages in text channels to accumulate XP activity.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {leaderboard.map((user, index) => {
                const maxLevelXp = Math.pow((user.level + 1) * 10, 2);
                const currentLevelXp = Math.pow(user.level * 10, 2);
                const progressPct = Math.min(100, Math.floor(((user.xp - currentLevelXp) / (maxLevelXp - currentLevelXp)) * 100));

                return (
                  <div key={user.userId} style={{
                    display: 'flex', gap: '12px', alignItems: 'center',
                    background: index === 0 ? 'rgba(234, 179, 8, 0.05)' : 'rgba(255, 255, 255, 0.02)',
                    border: index === 0 ? '1px solid rgba(234, 179, 8, 0.2)' : '1px solid rgba(255, 255, 255, 0.05)',
                    padding: '12px 16px', borderRadius: '12px'
                  }}>
                    {/* Rank Badge */}
                    <div style={{
                      fontWeight: 800, fontSize: '14px', width: '24px', textAlign: 'center',
                      color: index === 0 ? '#EAB308' : index === 1 ? '#94A3B8' : index === 2 ? '#B45309' : '#475569'
                    }}>
                      #{index + 1}
                    </div>

                    {/* Avatar */}
                    {user.avatar ? (
                      <img src={user.avatar} alt="" style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{
                        width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#94A3B8'
                      }}>
                        {user.username.substring(0, 2).toUpperCase()}
                      </div>
                    )}

                    {/* Profile */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 600, color: index === 0 ? '#fff' : '#CBD5E1', fontSize: '14px' }}>
                          {user.username}
                        </span>
                        <span style={{ fontSize: '11px', color: '#94A3B8' }}>Lvl {user.level}</span>
                      </div>

                      {/* XP Bar */}
                      <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${progressPct}%`,
                          background: 'linear-gradient(90deg, #EAB308 0%, #F97316 100%)', borderRadius: '2px'
                        }} />
                      </div>
                    </div>

                    {/* XP Value */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#FFF' }}>{user.xp}</span>
                      <span style={{ display: 'block', fontSize: '9px', color: '#94A3B8' }}>total xp</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
