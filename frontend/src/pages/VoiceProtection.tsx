import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Volume2, ShieldAlert, Radio, RefreshCw, Settings, 
  Users, Shield, Save, UserCheck, ShieldOff, AlertOctagon, 
  Layers, VolumeX, Bell, AlertTriangle, Eye, Lock, Sparkles, HelpCircle
} from 'lucide-react';
import type { ModuleState, DiscordResourceRegistry } from '../hooks/useDiscordSync';
import { StatusBadge } from '../components/StatusBadge';
import { RoleSelect, ChannelSelect } from '../components/ResourceSelectors';
import { API_BASE } from '../config';

interface VoiceProtectionProps {
  onSaveConfig: (msg: string) => void;
  modules: ModuleState[];
  onUpdateConfig: (moduleId: string, config: Record<string, any>, enabledOverride?: boolean) => void;
  registry?: DiscordResourceRegistry;
}

export function VoiceProtection({ onSaveConfig, modules, onUpdateConfig, registry }: VoiceProtectionProps) {
  const [activeTab, setActiveTab] = useState('settings');
  const [isSaving, setIsSaving] = useState(false);
  const [liveMonitored, setLiveMonitored] = useState<any[]>([]);
  const [isRefreshingStats, setIsRefreshingStats] = useState(false);

  const vpModule = (modules || []).find(m => m.id === 'voice-protection') || { status: 'disabled', config: {} } as any;
  const config = vpModule.config || {};
  const stats = config.stats || {
    totalDetections: 0,
    totalMutes: 0,
    avgLoudness: 0,
    peakLoudness: 0,
    mostDetectedUsers: {},
    history: []
  };

  // Local configurations to avoid saving on every slider tick
  const [threshold, setThreshold] = useState(config.threshold ?? 85);
  const [duration, setDuration] = useState(config.duration ?? 3);
  const [punishment, setPunishment] = useState(config.punishment ?? 'servermute');
  const [muteDuration, setMuteDuration] = useState(config.muteDuration ?? 30);
  const [cooldown, setCooldown] = useState(config.cooldown ?? 60);
  const [autoUnmute, setAutoUnmute] = useState(config.autoUnmute ?? true);
  const [dmNotification, setDmNotification] = useState(config.dmNotification ?? true);
  const [logChannel, setLogChannel] = useState(config.logChannel ?? '');

  // Lists
  const [ignoredChannels, setIgnoredChannels] = useState<string[]>(config.ignoredChannels || []);
  const [ignoredRoles, setIgnoredRoles] = useState<string[]>(config.ignoredRoles || []);
  const [whitelistedUsers, setWhitelistedUsers] = useState<string[]>(config.whitelistedUsers || []);
  const [whitelistedRoles, setWhitelistedRoles] = useState<string[]>(config.whitelistedRoles || []);

  // Sync state if module's config changes from outside
  useEffect(() => {
    setThreshold(config.threshold ?? 85);
    setDuration(config.duration ?? 3);
    setPunishment(config.punishment ?? 'servermute');
    setMuteDuration(config.muteDuration ?? 30);
    setCooldown(config.cooldown ?? 60);
    setAutoUnmute(config.autoUnmute ?? true);
    setDmNotification(config.dmNotification ?? true);
    setLogChannel(config.logChannel ?? '');
    setIgnoredChannels(config.ignoredChannels || []);
    setIgnoredRoles(config.ignoredRoles || []);
    setWhitelistedUsers(config.whitelistedUsers || []);
    setWhitelistedRoles(config.whitelistedRoles || []);
  }, [config]);

  // Poll live monitored speakers from Express backend API
  useEffect(() => {
    const token = localStorage.getItem('cn_token');
    const activeGuild = localStorage.getItem('cn_active_guild');
    if (!token || !activeGuild) return;

    const fetchLiveState = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/modules/voice-protection/state`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'x-guild-id': activeGuild
          }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.monitoredUsers) {
            setLiveMonitored(data.monitoredUsers);
          }
        }
      } catch (err) {
        // Suppress background poll errors
      }
    };

    fetchLiveState();
    const interval = setInterval(fetchLiveState, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleEnable = () => {
    if (!vpModule) return;
    const nextEnabled = vpModule.status !== 'enabled';
    onUpdateConfig('voice-protection', {}, nextEnabled);
    onSaveConfig(`Voice Protection has been ${nextEnabled ? 'enabled' : 'disabled'}.`);
  };

  const handleSaveSettings = () => {
    setIsSaving(true);
    onUpdateConfig('voice-protection', {
      threshold,
      duration,
      punishment,
      muteDuration,
      cooldown,
      autoUnmute,
      dmNotification,
      logChannel: logChannel || null,
      ignoredChannels,
      ignoredRoles,
      whitelistedUsers,
      whitelistedRoles
    });
    setTimeout(() => {
      onSaveConfig('Voice Protection configurations saved successfully.');
      setIsSaving(false);
    }, 600);
  };

  const handleResetStats = async () => {
    setIsRefreshingStats(true);
    onUpdateConfig('voice-protection', {
      stats: {
        totalDetections: 0,
        totalMutes: 0,
        avgLoudness: 0,
        peakLoudness: 0,
        mostDetectedUsers: {},
        history: []
      }
    });
    setTimeout(() => {
      onSaveConfig('Voice Protection statistics have been reset.');
      setIsRefreshingStats(false);
    }, 500);
  };

  const textChannels = (registry?.channels || []).filter(c => c.type === 'text');
  const voiceChannels = (registry?.channels || []).filter(c => c.type === 'voice');
  const roles = (registry?.roles || []).filter(r => r.name !== '@everyone');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', width: '100%' }}>
      
      {/* Premium Page Header */}
      <div className="page-header" style={{ position: 'relative', overflow: 'hidden', padding: '12px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px', zIndex: 2 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span className="badge badge-purple" style={{ padding: '6px 12px', fontSize: '10px', borderRadius: '20px', letterSpacing: '0.05em' }}>
                <Sparkles size={11} style={{ marginRight: '4px' }} /> Dynamic Voice Auditing
              </span>
              <span className="badge badge-dark" style={{ padding: '6px 12px', fontSize: '10px', borderRadius: '20px', letterSpacing: '0.05em', background: 'rgba(255,255,255,0.03)', color: '#9CA3AF' }}>
                Active Channel Binding
              </span>
            </div>
            <h1 className="page-title" style={{ fontSize: '28px', fontWeight: 800, background: 'linear-gradient(to right, #FFF, #9CA3AF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '6px' }}>
              Voice Protection Suite
            </h1>
            <p className="page-subtitle" style={{ fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '650px', lineHeight: '1.5' }}>
              Guard server channels with automated acoustic auditing. Detect screamers, mic spikes, and ear-rape using rolling average RMS calculation, and apply configurable punishments instantly.
            </p>
          </div>

          <motion.button 
            whileHover={{ scale: 1.03, boxShadow: '0 0 20px rgba(124, 92, 252, 0.3)' }}
            whileTap={{ scale: 0.97 }}
            onClick={handleToggleEnable}
            style={{ 
              minWidth: '170px',
              padding: '12px 24px',
              borderRadius: '12px',
              background: vpModule?.status === 'enabled' 
                ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(16, 185, 129, 0.1))'
                : 'linear-gradient(135deg, rgba(124, 92, 252, 0.15), rgba(79, 140, 255, 0.05))',
              border: vpModule?.status === 'enabled' 
                ? '1px solid rgba(34, 197, 94, 0.4)' 
                : '1px solid rgba(124, 92, 252, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              fontWeight: 700,
              fontSize: '13px',
              color: vpModule?.status === 'enabled' ? '#10B981' : 'var(--text-primary)',
              transition: 'all 0.3s ease',
              backdropFilter: 'blur(8px)'
            }}
          >
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: vpModule?.status === 'enabled' ? '#10B981' : '#6B7280',
              boxShadow: vpModule?.status === 'enabled' ? '0 0 10px #10B981' : 'none',
              display: 'inline-block'
            }} />
            {vpModule?.status === 'enabled' ? 'SHIELD PROTECTIVE' : 'SHIELD DEACTIVATED'}
          </motion.button>
        </div>
      </div>

      {/* Current Monitoring Status Banner */}
      {config.currentVoiceChannelId && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ 
            background: 'linear-gradient(135deg, rgba(124, 92, 252, 0.15), rgba(15, 17, 21, 0.8))', 
            border: '1px solid #27272A', 
            borderRadius: '16px', 
            padding: '24px', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '24px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
            backdropFilter: 'blur(10px)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ 
              width: '48px', 
              height: '48px', 
              borderRadius: '12px', 
              background: 'rgba(124, 92, 252, 0.2)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              color: 'var(--accent-primary)',
              border: '1px solid rgba(124, 92, 252, 0.4)'
            }}>
              <Radio size={24} className="pulse" />
            </div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#09090B', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                Active Target: <span style={{ color: 'var(--accent-primary)' }}>🎤 {voiceChannels.find(c => c.id === config.currentVoiceChannelId)?.name || 'Unknown Channel'}</span>
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                The Voice Protection module is locked to this channel.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#10B981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981', display: 'inline-block', boxShadow: '0 0 6px #10B981' }} />
                {config.monitoringStatus === 'monitoring' ? 'ACTIVE MONITORING' : 'SUSPENDED'}
              </span>
            </div>

            {config.connectedSince && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Connected Since</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#09090B' }}>
                  {new Date(config.connectedSince).toLocaleTimeString()}
                </span>
              </div>
            )}

            {config.lastSwitched && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last Switched</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#09090B' }}>
                  {new Date(config.lastSwitched).toLocaleDateString()} at {new Date(config.lastSwitched).toLocaleTimeString()}
                </span>
              </div>
            )}

            {config.switchedBy && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Switched By</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#09090B' }}>
                  @{config.switchedBy}
                </span>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Metrics Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
        
        <div className="stat-card" style={{ background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: '14px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>
            <span>Acoustic Deviations</span>
            <AlertOctagon size={16} color="var(--accent-primary)" />
          </div>
          <span style={{ fontSize: '28px', fontWeight: 800, color: '#09090B' }}>{stats.totalDetections || 0}</span>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>Total amplitude violations logged</div>
        </div>

        <div className="stat-card" style={{ background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: '14px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>
            <span>Mutes Dispatched</span>
            <VolumeX size={16} color="#EF4444" />
          </div>
          <span style={{ fontSize: '28px', fontWeight: 800, color: '#09090B' }}>{stats.totalMutes || 0}</span>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>Automated server mutes enforced</div>
        </div>

        <div className="stat-card" style={{ background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: '14px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>
            <span>Peak Amplitude</span>
            <Radio size={16} color="#F59E0B" />
          </div>
          <span style={{ fontSize: '28px', fontWeight: 800, color: '#09090B' }}>{stats.peakLoudness || 0}%</span>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>Highest recorded audio surge</div>
        </div>

        <div className="stat-card" style={{ background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: '14px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>
            <span>Average RMS Level</span>
            <Volume2 size={16} color="#10B981" />
          </div>
          <span style={{ fontSize: '28px', fontWeight: 800, color: '#09090B' }}>{stats.avgLoudness || 0}%</span>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>Mean operational signal volume</div>
        </div>

      </div>

      {/* Main Panel Wrapper */}
      <div className="section-panel" style={{
        background: '#FFFFFF',
        border: '1px solid #E4E4E7',
        borderRadius: '18px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
        backdropFilter: 'blur(12px)',
        overflow: 'hidden'
      }}>
        
        {/* Navigation Tabs */}
        <div className="tabs-nav" style={{
          display: 'flex',
          gap: '24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          padding: '0 28px',
          background: 'rgba(0, 0, 0, 0.15)'
        }}>
          {[
            { id: 'settings', label: 'Shield Controls', icon: Settings },
            { id: 'exemptions', label: 'Ignore & Whitelists', icon: Shield },
            { id: 'monitors', label: `Telemetry Streams (${liveMonitored.length})`, icon: Radio }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '18px 8px',
                  fontWeight: 600,
                  fontSize: '14px',
                  color: activeTab === tab.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  borderBottom: activeTab === tab.id ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  transition: 'all 0.2s ease',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="panel-body" style={{ padding: '32px' }}>
          <AnimatePresence mode="wait">
            
            {/* Tab: Settings */}
            {activeTab === 'settings' && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
                className="grid-split-3-2"
                style={{ gap: '36px', alignItems: 'start' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#09090B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Layers size={18} color="var(--accent-primary)" /> Shield Thresholds
                    </h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      Adjust detection sensitivity, warning levels, and punishment parameters.
                    </p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    
                    {/* Audio Level Visualizer Wave */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label className="form-label" style={{ fontSize: '12px', fontWeight: 700, color: '#9CA3AF' }}>REAL-TIME AMPLITUDE SIMULATION</label>
                      <div style={{
                        height: '70px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px',
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: '12px',
                        padding: '10px',
                        border: '1px solid rgba(255,255,255,0.04)',
                        overflow: 'hidden',
                        position: 'relative'
                      }}>
                        {/* Background Grid Lines */}
                        <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: '1px', background: 'rgba(255,255,255,0.06)', zIndex: 1 }} />
                        <div style={{ position: 'absolute', left: 0, right: 0, top: `${100 - threshold}%`, height: '1px', borderTop: '1px dashed rgba(239, 68, 68, 0.6)', zIndex: 2 }}>
                          <span style={{
                            position: 'absolute',
                            right: '8px',
                            top: '-12px',
                            fontSize: '9px',
                            color: '#EF4444',
                            fontWeight: 700,
                            backgroundColor: 'rgba(15, 17, 21, 0.9)',
                            padding: '2px 4px',
                            borderRadius: '3px'
                          }}>SHIELD TRIGGER ({threshold}%)</span>
                        </div>

                        {/* Moving Waveform Bars */}
                        {[...Array(24)].map((_, bar) => {
                          const isVoiceActive = liveMonitored.length > 0 && vpModule?.status === 'enabled';
                          const duration = 0.6 + Math.random() * 0.8;
                          return (
                            <motion.div
                              key={bar}
                              animate={isVoiceActive ? {
                                height: ['20%', '85%', '35%', '95%', '25%', '75%', '20%']
                              } : {
                                height: ['5%', '18%', '8%', '22%', '5%']
                              }}
                              transition={{
                                repeat: Infinity,
                                duration: duration,
                                ease: 'easeInOut',
                                delay: bar * 0.04
                              }}
                              style={{
                                width: '6px',
                                backgroundColor: isVoiceActive ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.1)',
                                borderRadius: '3px',
                                zIndex: 3,
                                boxShadow: isVoiceActive ? '0 0 10px var(--accent-primary)' : 'none'
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>

                    {/* Loudness Threshold */}
                    <div className="form-group">
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <label className="form-label" style={{ fontSize: '12px', fontWeight: 700, color: '#9CA3AF' }}>LOUDNESS THRESHOLD</label>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-primary)' }}>{threshold}% RMS</span>
                      </div>
                      <input 
                        type="range"
                        min={70}
                        max={100}
                        value={threshold}
                        onChange={e => setThreshold(parseInt(e.target.value))}
                        style={{ width: '100%', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                      />
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                        Sets the audio amplitude ceiling. Volume spikes exceeding this limit are categorized as voice disturbances.
                      </p>
                    </div>

                    {/* Trigger Duration */}
                    <div className="form-group">
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <label className="form-label" style={{ fontSize: '12px', fontWeight: 700, color: '#9CA3AF' }}>SUSTAINED DURATION</label>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-primary)' }}>{duration} seconds</span>
                      </div>
                      <input 
                        type="range"
                        min={1}
                        max={10}
                        value={duration}
                        onChange={e => setDuration(parseInt(e.target.value))}
                        style={{ width: '100%', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
                      />
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                        The consecutive duration a member must continuously scream or emit noise to trigger the protection action.
                      </p>
                    </div>

                    {/* Punishment Selector */}
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '12px', fontWeight: 700, color: '#9CA3AF', display: 'block', marginBottom: '8px' }}>AUTOMATED PENALTY ACTION</label>
                      <select
                        value={punishment}
                        onChange={e => setPunishment(e.target.value)}
                        style={{ width: '100%', background: '#FFFFFF', border: '1px solid #E4E4E8', borderRadius: '12px', padding: '14px 16px', color: '#09090B' }}
                      >
                        <option value="warn">Warn Only (Direct Message Warning)</option>
                        <option value="servermute">Server Mute (Requires Administrative Override)</option>
                        <option value="tempmute">Temporary Server Mute</option>
                      </select>
                    </div>

                    {/* Mute Duration */}
                    {punishment === 'tempmute' && (
                      <div className="form-group">
                        <label className="form-label" style={{ fontSize: '12px', fontWeight: 700, color: '#9CA3AF', display: 'block', marginBottom: '8px' }}>TEMPORARY MUTE DURATION (SECONDS)</label>
                        <input 
                          type="number"
                          value={muteDuration}
                          onChange={e => setMuteDuration(parseInt(e.target.value) || 0)}
                          style={{ width: '100%', background: '#FFFFFF', border: '1px solid #E4E4E8', borderRadius: '12px', padding: '14px 16px', color: '#09090B' }}
                        />
                      </div>
                    )}

                    {/* Cooldown */}
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '12px', fontWeight: 700, color: '#9CA3AF', display: 'block', marginBottom: '8px' }}>PENALTY COOLDOWN (SECONDS)</label>
                      <input 
                        type="number"
                        value={cooldown}
                        onChange={e => setCooldown(parseInt(e.target.value) || 0)}
                        style={{ width: '100%', background: '#FFFFFF', border: '1px solid #E4E4E8', borderRadius: '12px', padding: '14px 16px', color: '#09090B' }}
                      />
                    </div>

                    {/* Log Channel */}
                    <ChannelSelect
                      label="AUDIT LOGGER CHANNEL"
                      channels={textChannels}
                      selectedChannelId={logChannel}
                      onChange={setLogChannel}
                      helpText="The channel where Voice Protection warning notifications and server mutes are logged."
                      typeFilter={['text']}
                    />

                    {/* DM and Auto-unmute Toggles */}
                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#9CA3AF' }}>
                        <input type="checkbox" checked={dmNotification} onChange={e => setDmNotification(e.target.checked)} />
                        Dispatch Direct Message Notification
                      </label>
                      {punishment === 'tempmute' && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#9CA3AF' }}>
                          <input type="checkbox" checked={autoUnmute} onChange={e => setAutoUnmute(e.target.checked)} />
                          Automatic Unmute Expiration
                        </label>
                      )}
                    </div>

                    {/* Save Button */}
                    <div style={{ marginTop: '12px' }}>
                      <motion.button 
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleSaveSettings}
                        disabled={isSaving}
                        style={{ 
                          padding: '14px 28px',
                          borderRadius: '12px',
                          background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-purple))',
                          border: 'none',
                          color: '#FFF',
                          fontWeight: 700,
                          fontSize: '14px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          cursor: isSaving ? 'not-allowed' : 'pointer',
                          boxShadow: '0 10px 20px rgba(124, 92, 252, 0.2)'
                        }}
                      >
                        {isSaving ? <RefreshCw size={16} className="spin" /> : <Save size={16} />}
                        <span>{isSaving ? 'Synchronizing State...' : 'Commit Configurations'}</span>
                      </motion.button>
                    </div>

                  </div>
                </div>

                {/* Right Info Box */}
                <div style={{
                  background: 'rgba(15, 17, 21, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.04)',
                  borderRadius: '14px',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '20px'
                }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 800, color: '#09090B', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <HelpCircle size={15} color="var(--accent-primary)" /> Shield Architecture
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                    <p>
                      <strong>RMS Loudness Analysis:</strong> Decodes raw voice packet streams using root-mean-square formulas to trace sound pressure level deviation.
                    </p>
                    <p>
                      <strong>Acoustic Spam Defense:</strong> Prevents scream bypass by enforcing immediate action cooldowns on persistent violators.
                    </p>
                    <p>
                      <strong>Absolute Immunity:</strong> Server Owners, administrator members, whitelisted moderators, and whitelisted roles are completely exempt.
                    </p>
                    <p>
                      <strong>Balanced Connection Loop:</strong> Operates dynamically by migrating the bot only to the channel containing the maximum number of humans.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Tab: Exemptions */}
            {activeTab === 'exemptions' && (
              <motion.div
                key="exemptions"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
                style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
                  {/* Ignored Voice Channels */}
                  <ChannelSelect
                    label="Ignored Voice Channels"
                    channels={voiceChannels}
                    selectedChannelIds={ignoredChannels}
                    onChange={setIgnoredChannels}
                    isMulti={true}
                    helpText="Voice channels that the bot should never enter or audit."
                    typeFilter={['voice']}
                  />

                  {/* Ignored Roles */}
                  <RoleSelect
                    label="Ignored Roles"
                    roles={roles}
                    selectedRoleIds={ignoredRoles}
                    onChange={setIgnoredRoles}
                    isMulti={true}
                    helpText="Members with these roles will bypass loudness screening."
                  />
                </div>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '20px' }}>
                  {/* Whitelisted Immune Roles */}
                  <RoleSelect
                    label="Whitelisted Immune Roles (Complete Exemption)"
                    roles={roles}
                    selectedRoleIds={whitelistedRoles}
                    onChange={setWhitelistedRoles}
                    isMulti={true}
                    helpText="Staff and administrative roles that bypass all triggers."
                  />
                </div>

                <div>
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSaveSettings}
                    style={{ padding: '12px 24px', borderRadius: '10px', background: 'var(--accent-primary)', border: 'none', color: '#FFF', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(124, 92, 252, 0.2)' }}
                  >
                    <Save size={14} />
                    Commit Exemption Parameters
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* Tab: Live Telemetry */}
            {activeTab === 'monitors' && (
              <motion.div
                key="monitors"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.2 }}
                style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#09090B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Radio size={18} color="var(--accent-primary)" className="pulse" /> Live Telemetry Streams
                    </h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      Acoustic streams currently linked with the auditing engine interface.
                    </p>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleResetStats}
                    disabled={isRefreshingStats}
                    style={{ padding: '8px 16px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#EF4444', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <RefreshCw size={12} className={isRefreshingStats ? 'spin' : ''} />
                    Reset Telemetry Statistics
                  </motion.button>
                </div>

                {liveMonitored.length === 0 ? (
                  <div style={{ 
                    padding: '80px 40px', 
                    textAlign: 'center', 
                    background: 'rgba(15, 17, 21, 0.3)', 
                    border: '1px dashed rgba(255,255,255,0.08)',
                    borderRadius: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '16px'
                  }}>
                    <Volume2 size={48} color="var(--text-muted)" style={{ opacity: 0.5 }} />
                    <div>
                      <h4 style={{ color: '#09090B', fontSize: '15px', fontWeight: 600 }}>No Telemetry Connections Active</h4>
                      <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px', maxWidth: '380px' }}>
                        The bot dynamically binds and logs decibel readings as soon as non-mute members join target voice channels.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                    {liveMonitored.map((user: any) => (
                      <motion.div
                        key={user.userId}
                        whileHover={{ y: -3, border: '1px solid #27272A' }}
                        style={{
                          background: 'rgba(15, 17, 21, 0.7)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          borderRadius: '14px',
                          padding: '16px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {user.avatar ? (
                            <img 
                              src={`https://cdn.discordapp.com/avatars/${user.userId}/${user.avatar}.png`} 
                              alt="Avatar" 
                              style={{ width: '40px', height: '40px', borderRadius: '50%' }}
                            />
                          ) : (
                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontWeight: 700 }}>
                              {user.username.substring(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <h4 style={{ color: '#09090B', fontSize: '14px', fontWeight: 700 }}>{user.username}</h4>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>@{user.tag}</span>
                          </div>
                        </div>

                        <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)' }} />

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Auditing Channel:</span>
                          <span style={{ color: '#09090B', fontWeight: 600 }}>🔊 {user.channelName}</span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

          </AnimatePresence>
        </div>

      </div>

    </div>
  );
}
export default VoiceProtection;
