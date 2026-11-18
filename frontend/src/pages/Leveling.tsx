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
    const token = authToken || localStorage.getItem('cn_token');
    const currentGuild = authGuildId || localStorage.getItem('cn_active_guild');
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
    const token = authToken || localStorage.getItem('cn_token');
    const currentGuild = authGuildId || localStorage.getItem('cn_active_guild');
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      
      {/* Signature Enterprise Black Hero Header Card */}
      <div className="hero-black-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            background: 'rgba(220, 38, 38, 0.12)',
            border: '1px solid rgba(220, 38, 38, 0.3)',
            padding: '12px',
            borderRadius: '12px',
            color: '#EF4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Award size={26} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
                Leveling & XP Engine
              </h1>
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '6px',
                background: isEnabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                color: isEnabled ? '#34D399' : '#F87171',
                border: `1px solid ${isEnabled ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
              }}>
                {isEnabled ? 'ACTIVE' : 'DISABLED'}
              </span>
            </div>
            <p style={{ fontSize: '13px', color: '#A1A1AA', margin: '4px 0 0 0' }}>
              Configure message activity experience rates, rank progression rewards, and view real-time leaderboard metrics.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            style={{
              padding: '9px 16px',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all 0.15s',
              background: isEnabled ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.1)',
              border: `1px solid ${isEnabled ? 'rgba(239, 68, 68, 0.4)' : 'rgba(255, 255, 255, 0.2)'}`,
              color: isEnabled ? '#F87171' : '#FFFFFF'
            }}
            onClick={handleToggleEnable}
          >
            {isEnabled ? 'Deactivate Module' : 'Activate Module'}
          </button>
          
          <button 
            style={{
              padding: '9px 18px',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all 0.15s',
              background: '#FFFFFF',
              border: '1px solid #FFFFFF',
              color: '#09090B',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: 'var(--shadow-sm)'
            }}
            onClick={handleSaveSettings}
            disabled={saving}
          >
            <Save size={15} />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '22px', alignItems: 'start' }}>
        
        {/* Left Hand Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Rate and Multipliers */}
          <div className="section-panel" style={{ padding: '22px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#09090B', marginTop: 0, marginBottom: '14px' }}>
              XP Generation Velocity
            </h3>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 600, color: '#09090B', marginBottom: '8px' }}>
                Global XP Multiplier
              </label>
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
              <p style={{ fontSize: '12px', color: '#71717A', marginTop: '8px', lineHeight: 1.5 }}>
                Controls how much XP members earn per text message. Standard XP yields between 15-25 XP per message. Multiplier directly boosts this reward.
              </p>
            </div>
          </div>

          {/* Level Role Rewards Milestones */}
          <div className="section-panel" style={{ padding: '22px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#09090B', marginTop: 0, marginBottom: '14px' }}>
              Level Milestone Role Rewards
            </h3>

            {/* Input fields */}
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '18px' }}>
              <div className="form-group" style={{ flex: '1 1 100px' }}>
                <label className="form-label" style={{ fontWeight: 600, color: '#09090B', marginBottom: '6px' }}>
                  Level Milestone
                </label>
                <input
                  type="number"
                  className="form-input-text"
                  placeholder="e.g. 5"
                  value={newLevel}
                  onChange={e => setNewLevel(e.target.value)}
                  style={{ height: '40px' }}
                />
              </div>

              <div className="form-group" style={{ flex: '2 1 200px' }}>
                <label className="form-label" style={{ fontWeight: 600, color: '#09090B', marginBottom: '6px' }}>
                  Reward Role
                </label>
                <select
                  className="form-select"
                  value={newRoleId}
                  onChange={e => setNewRoleId(e.target.value)}
                  style={{ width: '100%', height: '40px' }}
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
                  height: '40px', padding: '0 18px', borderRadius: '8px', fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0
                }}
              >
                <Plus size={15} /> Add Milestone
              </button>
            </div>

            {/* List */}
            {Object.keys(roleRewards).length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '22px', border: '1px dashed #E4E4E8', borderRadius: '10px', color: '#71717A', background: '#FAFAFC'
              }}>
                <p style={{ margin: 0, fontSize: '13px', fontWeight: 500 }}>No role reward milestones configured.</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px' }}>Members receive extra roles on leveling up once milestones are added.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Object.entries(roleRewards).map(([levelVal, roleId]) => {
                  const role = (registry?.roles || []).find(r => r.id === roleId);
                  return (
                    <div key={levelVal} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '12px 16px', background: '#FAFAFC',
                      border: '1px solid #E4E4E8', borderRadius: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{
                          background: '#09090B', color: '#FFFFFF',
                          width: '38px', height: '38px', borderRadius: '8px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 800, fontSize: '13px'
                        }}>
                          L{levelVal}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: '#09090B', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px' }}>
                            {role?.name || `Unknown Role (${roleId})`}
                            {role?.color && (
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: role.color }} />
                            )}
                          </div>
                          <span style={{ fontSize: '11px', color: '#71717A' }}>Awarded automatically at Level {levelVal}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemoveReward(levelVal)}
                        style={{
                          background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626',
                          borderRadius: '8px', cursor: 'pointer', padding: '7px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s'
                        }}
                        title="Delete milestone"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
          {/* Administrative Danger Zone in Clean Light Red */}
          <div className="light-red-card">
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#991B1B', marginTop: 0, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldAlert size={16} color="#DC2626" /> Administrative Commands
            </h3>
            <p style={{ fontSize: '12.5px', color: '#7F1D1D', marginTop: 0, marginBottom: '14px', lineHeight: 1.5 }}>
              Resetting Leveling database clears all member accumulated XP records and resets all users back to Level 0. This action is permanent and cannot be undone.
            </p>

            {resetConfirm ? (
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  className="btn btn-danger"
                  onClick={handleResetDatabase}
                  style={{ padding: '8px 16px', fontSize: '12px' }}
                >
                  Yes, Clear Database
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setResetConfirm(false)}
                  style={{ padding: '8px 16px', fontSize: '12px' }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="btn btn-danger"
                onClick={() => setResetConfirm(true)}
                style={{ padding: '8px 16px', fontSize: '12px' }}
              >
                Reset Member XP Database
              </button>
            )}
          </div>

        </div>

        {/* Leaderboard Table Right */}
        <div className="section-panel" style={{ padding: '22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#09090B', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BarChart2 size={17} color="#09090B" /> Server Leaderboard
            </h3>
            <button
              onClick={fetchState}
              disabled={loading}
              style={{
                background: '#F4F4F5', border: '1px solid #E4E4E8',
                padding: '6px 10px', borderRadius: '6px', color: '#52525B', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px'
              }}
            >
              <RefreshCw size={13} className={loading ? 'spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>

          {loading && leaderboard.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: '#71717A', fontSize: '13px' }}>Loading leaderboard...</div>
          ) : leaderboard.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '36px 20px', border: '1px dashed #E4E4E8', borderRadius: '10px', color: '#71717A', background: '#FAFAFC'
            }}>
              <Info size={28} style={{ marginBottom: '10px', color: '#09090B' }} />
              <p style={{ margin: 0, fontWeight: 600, color: '#09090B', fontSize: '14px' }}>Leaderboard is empty.</p>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px' }}>Start sending messages in text channels to accumulate XP activity.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {leaderboard.map((user, index) => {
                const maxLevelXp = Math.pow((user.level + 1) * 10, 2);
                const currentLevelXp = Math.pow(user.level * 10, 2);
                const progressPct = Math.min(100, Math.floor(((user.xp - currentLevelXp) / (maxLevelXp - currentLevelXp)) * 100));

                return (
                  <div key={user.userId} style={{
                    display: 'flex', gap: '12px', alignItems: 'center',
                    background: index === 0 ? '#FEF2F2' : '#FFFFFF',
                    border: `1px solid ${index === 0 ? '#FECACA' : '#E4E4E8'}`,
                    padding: '10px 14px', borderRadius: '10px',
                    boxShadow: 'var(--shadow-sm)'
                  }}>
                    {/* Rank Badge */}
                    <div style={{
                      fontWeight: 800, fontSize: '13px', width: '22px', textAlign: 'center',
                      color: index === 0 ? '#DC2626' : index === 1 ? '#09090B' : index === 2 ? '#D97706' : '#71717A'
                    }}>
                      #{index + 1}
                    </div>

                    {/* Avatar */}
                    {user.avatar ? (
                      <img src={user.avatar} alt="" style={{ width: '34px', height: '34px', borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{
                        width: '34px', height: '34px', borderRadius: '50%', background: '#F4F4F5', border: '1px solid #E4E4E8',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#09090B'
                      }}>
                        {user.username.substring(0, 2).toUpperCase()}
                      </div>
                    )}

                    {/* Profile */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 600, color: '#09090B', fontSize: '13.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {user.username}
                        </span>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: index === 0 ? '#DC2626' : '#71717A', marginLeft: '6px' }}>
                          Lvl {user.level}
                        </span>
                      </div>

                      {/* XP Bar */}
                      <div style={{ width: '100%', height: '4px', background: '#F4F4F5', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${progressPct}%`,
                          background: index === 0 ? '#DC2626' : '#09090B', borderRadius: '2px'
                        }} />
                      </div>
                    </div>

                    {/* XP Value */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#09090B' }}>{user.xp}</span>
                      <span style={{ display: 'block', fontSize: '9px', color: '#71717A', textTransform: 'uppercase' }}>xp</span>
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
