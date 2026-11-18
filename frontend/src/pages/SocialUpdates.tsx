/**
 * Social Updates Module Page
 * Orchestrates YouTube and Instagram tabs, holds module enable toggles and status badges.
 */
import React, { useState, useEffect } from 'react';
import { Radio, Save, HelpCircle, Loader2 } from 'lucide-react';
import { YouTubeTab } from './social-updates/YouTubeTab';
import { InstagramTab } from './social-updates/InstagramTab';
import { useAuth } from '../hooks/useAuth';
import type { DiscordChannel, DiscordRole, ModuleState } from '../hooks/useDiscordSync';
import { API_BASE } from '../config';

interface CustomIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

const YoutubeIcon = ({ size, ...props }: CustomIconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props} width={size || props.width} height={size || props.height}>
    <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.516 0-9.387.507a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.871.507 9.387.507 9.387.507s7.517 0 9.387-.507a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

const InstagramIcon = ({ size, ...props }: CustomIconProps) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props} width={size || props.width} height={size || props.height}>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

interface SocialUpdatesProps {
  initialTab?: 'youtube' | 'instagram';
  registry: {
    channels: DiscordChannel[];
    roles: DiscordRole[];
  };
  modules: ModuleState[];
  updateModuleConfig: (moduleId: string, newConfig: Record<string, any>, enabledOverride?: boolean) => Promise<void>;
  addSyncLog: (msg: string, type: 'info' | 'warn' | 'success') => void;
}

export function SocialUpdates({
  initialTab = 'youtube',
  registry,
  modules,
  updateModuleConfig,
  addSyncLog
}: SocialUpdatesProps) {
  const { activeGuildId: guildId, token } = useAuth();
  const [activeTab, setActiveTab] = useState<'youtube' | 'instagram'>(initialTab);
  const [analytics, setAnalytics] = useState({
    totalSubscriptions: 0,
    activeSubscriptions: 0,
    totalNotificationsSent: 0,
    totalFailedAttempts: 0,
    avgDeliveryTimeMs: 0
  });
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  const moduleState = modules.find(m => m.id === 'social_updates');
  const isEnabled = moduleState?.status === 'enabled';

  const fetchAnalytics = async () => {
    if (!token || !guildId) return;
    setLoadingAnalytics(true);
    try {
      // M-1: Use VITE_API_URL env var
      const res = await fetch(`${API_BASE}/api/modules/social_updates/analytics`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Guild-Id': guildId
        }
      });
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch {}
    setLoadingAnalytics(false);
  };

  useEffect(() => {
    fetchAnalytics();
  }, [guildId, token]);

  const handleToggleModule = async () => {
    const nextState = !isEnabled;
    try {
      await updateModuleConfig('social_updates', {}, nextState);
      addSyncLog(`Social Updates module ${nextState ? 'enabled' : 'disabled'}`, 'info');
    } catch (err) {
      addSyncLog('Failed to toggle Social Updates module', 'warn');
    }
  };

  const handleSaveNotify = (msg: string) => {
    addSyncLog(msg, 'success');
    fetchAnalytics(); // Refresh stats
  };

  if (!guildId) {
    return (
      <div className="section-panel" style={{ padding: 24, textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Please select a Discord Server from the sidebar to manage Social Updates.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Signature Enterprise Black Hero Header Card */}
      <div className="hero-black-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'rgba(220, 38, 38, 0.12)', border: '1px solid rgba(220, 38, 38, 0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EF4444',
            flexShrink: 0
          }}>
            <Radio size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#FFFFFF', margin: 0 }}>
                Social Feeds & Auto-Announcer
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
              Automatically announce new YouTube uploads and Instagram reels with instant Discord notifications.
            </p>
          </div>
        </div>

        {/* Toggle Switch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#A1A1AA' }}>Module Status</span>
          <label className="switch">
            <input type="checkbox" checked={isEnabled} onChange={handleToggleModule} />
            <span className="slider" />
          </label>
        </div>
      </div>

      {/* Analytics Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
        {[
          { label: 'Channels Monitored', value: `${analytics.activeSubscriptions}/${analytics.totalSubscriptions}`, desc: 'Active / Total feeds', color: 'var(--accent-primary)' },
          { label: 'Notifications Sent', value: analytics.totalNotificationsSent, desc: 'Across all channels', color: 'var(--color-success)' },
          { label: 'Failed Deliveries', value: analytics.totalFailedAttempts, desc: 'API or permission errors', color: analytics.totalFailedAttempts > 0 ? 'var(--color-danger)' : 'var(--text-muted)' },
          { label: 'Avg Delivery Speed', value: analytics.avgDeliveryTimeMs > 0 ? `${analytics.avgDeliveryTimeMs}ms` : 'N/A', desc: 'Discord API latency', color: 'var(--accent-purple)' }
        ].map((card, i) => (
          <div key={i} className="section-panel" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{card.label}</span>
            <span style={{ fontSize: 24, fontWeight: 800, color: card.color }}>{card.value}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{card.desc}</span>
          </div>
        ))}
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid var(--border-color)', paddingBottom: 2 }}>
        <button
          onClick={() => setActiveTab('youtube')}
          // M-5 FIX: Disable tab buttons when module is off — the blurred overlay
          // was blocking content but tabs were still clickable and switching state.
          disabled={!isEnabled}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
            background: 'none', border: 'none', borderBottom: `2px solid ${activeTab === 'youtube' ? 'var(--color-danger)' : 'transparent'}`,
            color: activeTab === 'youtube' && isEnabled ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: 700, fontSize: 14, cursor: isEnabled ? 'pointer' : 'not-allowed', transition: 'all 0.15s',
            opacity: isEnabled ? 1 : 0.4
          }}
        >
          <YoutubeIcon size={16} color={activeTab === 'youtube' && isEnabled ? '#FF0000' : 'var(--text-muted)'} /> YouTube Channels
        </button>
        <button
          onClick={() => setActiveTab('instagram')}
          disabled={!isEnabled}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
            background: 'none', border: 'none', borderBottom: `2px solid ${activeTab === 'instagram' && isEnabled ? '#EC4899' : 'transparent'}`,
            color: activeTab === 'instagram' && isEnabled ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: 700, fontSize: 14, cursor: isEnabled ? 'pointer' : 'not-allowed', transition: 'all 0.15s',
            opacity: isEnabled ? 1 : 0.4
          }}
        >
          <InstagramIcon size={16} color={activeTab === 'instagram' && isEnabled ? '#EC4899' : 'var(--text-muted)'} /> Instagram Accounts
        </button>
      </div>

      {/* Tab Content */}
      <div style={{ opacity: isEnabled ? 1 : 0.6, pointerEvents: isEnabled ? 'auto' : 'none', position: 'relative' }}>
        {!isEnabled && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10,
            background: 'rgba(15,17,21,0.4)', backdropFilter: 'blur(2px)', borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <div className="section-panel" style={{ padding: '16px 24px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: 20 }}>⏸</span>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '8px 0 4px 0' }}>Social Updates Disabled</h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Enable the module status at the top to configure channels.</p>
            </div>
          </div>
        )}

        {activeTab === 'youtube' && (
          <YouTubeTab
            guildId={guildId}
            token={token || ''}
            channels={registry.channels}
            roles={registry.roles}
            onSaveConfig={handleSaveNotify}
          />
        )}

        {activeTab === 'instagram' && (
          <InstagramTab
            guildId={guildId}
            token={token || ''}
            channels={registry.channels}
            roles={registry.roles}
            onSaveConfig={handleSaveNotify}
          />
        )}
      </div>
    </div>
  );
}
