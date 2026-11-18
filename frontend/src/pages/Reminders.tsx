import { API_BASE } from '../config';
import React, { useState, useEffect } from 'react';
import { Bell, Save, Trash2, Clock, Plus, Info, Calendar, RefreshCw, MessageSquare } from 'lucide-react';
import type { ModuleState, DiscordChannel } from '../hooks/useDiscordSync';

interface RemindersProps {
  onSaveConfig: (msg: string) => void;
  modules: ModuleState[];
  registry: { channels: DiscordChannel[] };
  onUpdateConfig: (moduleId: string, config: Record<string, any>, enabledOverride?: boolean) => void;
}

export function Reminders({
  onSaveConfig,
  modules,
  registry,
  onUpdateConfig
}: RemindersProps) {
  const remindersModule = (modules || []).find(m => m.id === 'reminders');
  const isEnabled = remindersModule?.status === 'enabled';

  const [reminders, setReminders] = useState<any[]>([]);
  const [duration, setDuration] = useState('10m');
  const [message, setMessage] = useState('');
  const [targetChannel, setTargetChannel] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [repeat, setRepeat] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchState = async () => {
    const token = localStorage.getItem('cn_token');
    const currentGuild = localStorage.getItem('cn_active_guild');
    if (!token) return;

    setLoading(true);
    try {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${token}`
      };
      if (currentGuild) {
        headers['X-Guild-Id'] = currentGuild;
      }

      const res = await fetch(`${API_BASE}/api/modules/reminders/state`, { headers });
      if (res.ok) {
        const data = await res.json();
        setReminders(data.reminders || []);
      }
    } catch (err) {
      console.error('Error fetching reminders state:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchState();
  }, [modules]);

  const handleToggleEnable = () => {
    if (!remindersModule) return;
    const nextEnabled = remindersModule.status !== 'enabled';
    onUpdateConfig('reminders', {}, nextEnabled);
    onSaveConfig(`Reminder System ${nextEnabled ? 'ENABLED' : 'DISABLED'}.`);
  };

  const handleCreateReminder = async () => {
    if (!message.trim()) return;
    const token = localStorage.getItem('cn_token');
    const currentGuild = localStorage.getItem('cn_active_guild');
    if (!token) return;

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/modules/reminders/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Guild-Id': currentGuild || ''
        },
        body: JSON.stringify({
          message,
          userId: targetUserId || null,
          repeat: repeat || null,
          duration,
          channelId: targetChannel || null
        })
      });

      if (res.ok) {
        const data = await res.json();
        setReminders(data.reminders || []);
        setMessage('');
        setTargetUserId('');
        setTargetChannel('');
        setRepeat('');
        onSaveConfig('Reminder scheduled successfully.');
      } else {
        onSaveConfig('Failed to create reminder.');
      }
    } catch (err) {
      console.error(err);
      onSaveConfig('Error creating reminder.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelReminder = async (id: string) => {
    const token = localStorage.getItem('cn_token');
    const currentGuild = localStorage.getItem('cn_active_guild');
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE}/api/modules/reminders/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Guild-Id': currentGuild || ''
        },
        body: JSON.stringify({ id })
      });

      if (res.ok) {
        const data = await res.json();
        setReminders(data.reminders || []);
        onSaveConfig('Reminder cancelled successfully.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const textChannels = (registry?.channels || []).filter(c => c.type === 'text');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Premium Header */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(147, 51, 234, 0.03) 100%)',
        padding: '24px 32px',
        borderRadius: '16px',
        border: '1px solid rgba(59, 130, 246, 0.15)',
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
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.2) 0%, transparent 70%)',
          filter: 'blur(20px)', pointerEvents: 'none'
        }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            background: 'linear-gradient(135deg, #3B82F6 0%, #9333EA 100%)',
            padding: '12px',
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(59, 130, 246, 0.3)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Bell size={28} />
          </div>
          <div>
            <h1 className="page-title" style={{
              fontSize: '28px',
              fontWeight: 800,
              background: 'linear-gradient(135deg, #FFF 30%, #60A5FA 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              margin: 0,
              letterSpacing: '-0.5px'
            }}>Reminder & Alarm Scheduler</h1>
            <p className="page-subtitle" style={{
              fontSize: '14px',
              color: '#94A3B8',
              margin: '4px 0 0 0',
              fontWeight: 500
            }}>
              Schedule automated message alerts and timer notifications delivered directly to Discord channels or DMs.
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
              background: isEnabled ? 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)' : 'linear-gradient(135deg, #3B82F6 0%, #581C87 100%)',
              border: 'none',
              color: '#FFF',
              boxShadow: isEnabled ? '0 4px 14px rgba(239, 68, 68, 0.25)' : '0 4px 14px rgba(59, 130, 246, 0.25)'
            }}
            onClick={handleToggleEnable}
          >
            {isEnabled ? 'Deactivate Module' : 'Activate Module'}
          </button>
        </div>
      </div>

      {/* Grid: Form Left, Active Right */}
      <div className="grid-split-1-1" style={{ alignItems: 'start' }}>
        
        {/* Form Left */}
        <div className="section-panel" style={{
          background: '#FFFFFF',
          border: '1px solid #E4E4E7',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
          backdropFilter: 'blur(10px)'
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#09090B', marginTop: 0, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={18} color="#3B82F6" /> Schedule New Alarm
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 600, color: '#E2E8F0', marginBottom: '8px' }}>Message Alert Content</label>
              <textarea
                className="form-input-text"
                placeholder="Remind me to perform server backups..."
                value={message}
                onChange={e => setMessage(e.target.value)}
                style={{ width: '100%', height: '80px', padding: '10px', fontSize: '14px', resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600, color: '#E2E8F0', marginBottom: '8px' }}>Time Duration</label>
                <input
                  type="text"
                  className="form-input-text"
                  placeholder="e.g. 10m, 2h, 1d"
                  value={duration}
                  onChange={e => setDuration(e.target.value)}
                  style={{ height: '42px', fontSize: '14px' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600, color: '#E2E8F0', marginBottom: '8px' }}>Delivery Channel</label>
                <select
                  className="form-select"
                  value={targetChannel}
                  onChange={e => setTargetChannel(e.target.value)}
                  style={{ width: '100%', height: '42px' }}
                >
                  <option value="">Direct Message (DM)</option>
                  {textChannels.map(c => (
                    <option key={c.id} value={c.id}>#{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600, color: '#E2E8F0', marginBottom: '8px' }}>Target Discord User ID</label>
                <input
                  type="text"
                  className="form-input-text"
                  placeholder="Optional (defaults to self)"
                  value={targetUserId}
                  onChange={e => setTargetUserId(e.target.value)}
                  style={{ height: '42px', fontSize: '14px' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600, color: '#E2E8F0', marginBottom: '8px' }}>Repeat Interval</label>
                <select
                  className="form-select"
                  value={repeat}
                  onChange={e => setRepeat(e.target.value)}
                  style={{ width: '100%', height: '42px' }}
                >
                  <option value="">No Repeat (One-Time)</option>
                  <option value="daily">Daily Interval</option>
                  <option value="weekly">Weekly Interval</option>
                </select>
              </div>
            </div>

            <button
              className="btn btn-primary"
              onClick={handleCreateReminder}
              disabled={saving || !message.trim()}
              style={{
                height: '42px', borderRadius: '8px', fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                background: 'linear-gradient(135deg, #3B82F6 0%, #9333EA 100%)', border: 'none', color: '#fff', cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(59, 130, 246, 0.25)', marginTop: '8px'
              }}
            >
              <Plus size={16} /> Schedule Reminder
            </button>

          </div>
        </div>

        {/* List Right */}
        <div className="section-panel" style={{
          background: '#FFFFFF',
          border: '1px solid #E4E4E7',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#09090B', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={18} color="#3B82F6" /> Scheduled Active Reminders
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

          {loading && reminders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: '#94A3B8' }}>Loading active reminders...</div>
          ) : reminders.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '40px', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: '12px', color: '#94A3B8'
            }}>
              <Info size={32} style={{ marginBottom: '12px', color: '#3B82F6' }} />
              <p style={{ margin: 0 }}>No active timers scheduled.</p>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px' }}>Use the left creation panel to schedule alerts.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {reminders.map(rem => {
                const diffMs = new Date(rem.remindAt).getTime() - Date.now();
                let timeStr = 'Passed';
                if (diffMs > 0) {
                  const minutes = Math.floor(diffMs / 60000);
                  const hours = Math.floor(minutes / 60);
                  if (hours > 0) {
                    timeStr = `in ${hours}h ${minutes % 60}m`;
                  } else {
                    timeStr = `in ${minutes}m`;
                  }
                }

                const channelName = rem.channelId
                  ? (textChannels.find(c => c.id === rem.channelId)?.name || 'channel')
                  : 'Direct Messages';

                return (
                  <div key={rem.id} style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid #E4E4E7',
                    padding: '16px', borderRadius: '12px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}>
                    <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', flex: 1 }}>
                      <div style={{
                        background: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6',
                        padding: '10px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        <Clock size={20} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#3B82F6' }}>
                            {timeStr}
                          </span>
                          <span style={{ fontSize: '10px', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <MessageSquare size={10} /> {rem.channelId ? `#${channelName}` : 'DMs'}
                          </span>
                        </div>
                        
                        <div style={{ fontSize: '14px', color: '#09090B', fontWeight: 500, wordBreak: 'break-word', lineHeight: 1.4 }}>
                          {rem.message}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontSize: '11px', color: '#64748B' }}>
                          <Calendar size={11} />
                          <span>Recipient: @{rem.userTag || rem.userId}</span>
                          {rem.repeat && (
                            <span style={{ background: 'rgba(147, 51, 234, 0.1)', color: '#C084FC', padding: '1px 4px', borderRadius: '3px', fontSize: '9px', fontWeight: 600 }}>
                              Repeat: {rem.repeat}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      className="btn"
                      onClick={() => handleCancelReminder(rem.id)}
                      style={{
                        background: 'rgba(239, 68, 68, 0.1)', border: 'none', color: '#EF4444',
                        borderRadius: '8px', cursor: 'pointer', padding: '8px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', marginLeft: '12px'
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

      </div>

    </div>
  );
}
