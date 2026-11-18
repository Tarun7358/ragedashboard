import { API_BASE } from '../../config';
/**
 * Social Updates — YouTubeTab
 * YouTube channel subscription management panel.
 */
import React, { useState } from 'react';
import {
  Plus, Trash2, Play, RefreshCw, CheckCircle2, AlertCircle,
  Clock, ChevronDown, ChevronUp, Settings, Send, Loader2,
  ExternalLink
} from 'lucide-react';
import { EmbedBuilder } from './EmbedBuilder';
import { TemplateInput } from './TemplateInput';
import type { EmbedConfig } from './EmbedPreview';
import type { DiscordChannel, DiscordRole } from '../../hooks/useDiscordSync';

const DEFAULT_EMBED: EmbedConfig = {
  color: '#FF0000',
  authorEnabled: true,
  authorName: '{channel.name}',
  authorIcon: '{channel.avatar}',
  authorUrl: '{channel.url}',
  titleEnabled: true,
  title: '🎬 {video.title}',
  titleUrl: '{video.url}',
  descriptionEnabled: false,
  description: '',
  thumbnailEnabled: false,
  thumbnail: '{video.thumbnail}',
  imageEnabled: true,
  image: '{video.thumbnail}',
  fields: [],
  footerEnabled: true,
  footerText: 'Posted by {channel.name}',
  timestampEnabled: true,
  buttons: [
    { label: '▶ Watch Now', url: '{video.url}', emoji: '' },
    { label: 'Visit Channel', url: '{channel.url}', emoji: '' }
  ],
  mentionRoles: []
};

const SAMPLE_DATA_YOUTUBE: Record<string, string> = {
  'channel.name': 'Awesome Channel', 'channel.id': 'UCxxxxxxxxx',
  'channel.url': 'https://youtube.com/channel/UCxxxxxxxxx',
  'channel.avatar': '',
  'video.id': 'dQw4w9WgXcQ', 'video.title': '🔥 My Awesome New Video!',
  'video.url': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'video.thumbnail': 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
  'video.description': 'Sample video description.',
  'video.duration': '10:32', 'video.views': '12,345',
  'video.publish_date': new Date().toISOString(),
  'video.live': '', 'video.short': '', 'video.premiere': '',
  'discord.guild': 'My Server', 'server.name': 'My Server',
  'discord.channel': '#youtube-alerts', 'role.mention': ''
};

const POLLING_MODES = [
  { value: 'fast', label: '⚡ Fast', desc: 'Every 30 sec — Real-time (Koya Speed)' },
  { value: 'normal', label: '⚖️ Normal', desc: 'Every 10 min — Balanced' },
  { value: 'slow', label: '🐢 Slow', desc: 'Every 30 min — Minimal usage' }
];

interface Subscription {
  id: string;
  provider: 'youtube';
  sourceId: string;
  sourceName: string;
  sourceAvatar?: string;
  discordChannelId: string;
  embedConfig: EmbedConfig;
  mentionRoles: string[];
  pollingMode: string;
  contentTypes: {
    videos: boolean; shorts: boolean; streams: boolean;
    premieres: boolean; communityPosts: boolean;
  };
  enabled: boolean | number;
  lastSyncTimestamp?: string;
  failedAttempts: number;
  lastError?: string;
  lastProcessedId?: string;
  totalNotificationsSent?: number;
}

interface YouTubeTabProps {
  guildId: string;
  token: string;
  channels: DiscordChannel[];
  roles: DiscordRole[];
  onSaveConfig: (msg: string) => void;
}

export function YouTubeTab({ guildId, token, channels, roles, onSaveConfig }: YouTubeTabProps) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  // Input state
  const [channelInput, setChannelInput] = useState('');
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState('');

  // Expanded sub
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [embedBuilderSubId, setEmbedBuilderSubId] = useState<string | null>(null);

  // Loading
  const [testingId, setTestingId] = useState<string | null>(null);

  const apiHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'X-Guild-Id': guildId
  });

  const loadSubscriptions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/modules/social_updates/status`, {
        headers: apiHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        setSubscriptions((data.subscriptions || []).filter((s: Subscription) => s.provider === 'youtube'));
      }
    } catch {}
    setLoading(false);
    setLoaded(true);
  };

  // Load subscriptions whenever guild or auth token updates
  React.useEffect(() => {
    if (guildId && token) {
      loadSubscriptions();
    }
  }, [guildId, token]);

  const handleAddChannel = async () => {
    if (!channelInput.trim()) return;
    setValidating(true);
    setValidationError('');
    try {
      const res = await fetch(`${API_BASE}/api/modules/social_updates/validate`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ provider: 'youtube', input: channelInput.trim() })
      });
      const data = await res.json();
      if (!data.valid) {
        setValidationError(data.error || 'Invalid channel');
        setValidating(false);
        return;
      }

      // Add subscription with default embed
      const subRes = await fetch(`${API_BASE}/api/modules/social_updates/subscribe`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          provider: 'youtube',
          sourceId: data.sourceId,
          sourceName: data.sourceName,
          sourceAvatar: data.sourceAvatar,
          discordChannelId: (channels.find(c => c.type === 'text') || channels[0])?.id || '',
          embedConfig: DEFAULT_EMBED,
          mentionRoles: [],
          pollingMode: 'fast',
          contentTypes: { videos: true, shorts: true, streams: true, premieres: true, communityPosts: false }
        })
      });

      if (subRes.ok) {
        const subData = await subRes.json();
        setSubscriptions(prev => [...prev, subData.subscription]);
        setChannelInput('');
        setExpandedId(subData.subscription.id);
        onSaveConfig(`YouTube channel "${data.sourceName}" added successfully.`);
      } else {
        const errData = await subRes.json().catch(() => ({}));
        setValidationError(errData.error || 'Failed to save subscription.');
      }
    } catch (err: any) {
      setValidationError('Failed to add channel. Check backend connection.');
    }
    setValidating(false);
  };

  const handleUpdate = async (id: string, patch: Partial<Subscription>) => {
    try {
      const res = await fetch(`${API_BASE}/api/modules/social_updates/update`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ id, ...patch })
      });
      if (res.ok) {
        const data = await res.json();
        setSubscriptions(prev => prev.map(s => s.id === id ? data.subscription : s));
      }
    } catch {}
  };

  const handleRemove = async (id: string) => {
    if (!confirm('Remove this YouTube channel subscription?')) return;
    try {
      await fetch(`${API_BASE}/api/modules/social_updates/unsubscribe`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ id })
      });
      setSubscriptions(prev => prev.filter(s => s.id !== id));
      onSaveConfig('YouTube subscription removed.');
    } catch {}
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const res = await fetch(`${API_BASE}/api/modules/social_updates/test`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (data.success) {
        onSaveConfig('✅ Test notification sent successfully!');
      } else {
        onSaveConfig(`❌ Test failed: ${data.error}`);
      }
    } catch {
      onSaveConfig('❌ Test failed: Backend unreachable.');
    }
    setTestingId(null);
  };

  const handleSaveEmbed = async (id: string) => {
    const current = subscriptions.find(s => s.id === id);
    if (!current) return;
    await handleUpdate(id, { embedConfig: current.embedConfig });
    onSaveConfig('Embed configuration saved.');
    setEmbedBuilderSubId(null);
  };

  const textChannels = channels.filter(c => c.type === 'text' || c.type === 'announcement');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Add Channel Input */}
      <div className="section-panel" style={{ padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
          Add YouTube Channel
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            type="text"
            value={channelInput}
            onChange={e => setChannelInput(e.target.value)}
            placeholder="@channelhandle, Channel URL, or Channel ID"
            className="text-input"
            style={{ flex: 1 }}
            onKeyDown={e => e.key === 'Enter' && handleAddChannel()}
          />
          <button
            onClick={handleAddChannel}
            disabled={validating || !channelInput.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px',
              background: 'var(--color-danger)', border: 'none', borderRadius: 8,
              color: '#fff', fontWeight: 700, fontSize: 13, cursor: validating ? 'not-allowed' : 'pointer',
              opacity: validating || !channelInput.trim() ? 0.6 : 1, whiteSpace: 'nowrap'
            }}
          >
            {validating ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
            {validating ? 'Validating…' : 'Add Channel'}
          </button>
        </div>
        {validationError && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-danger)', fontSize: 13 }}>
            <AlertCircle size={14} /> {validationError}
          </div>
        )}
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
          Supported formats: <code style={{ background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 3 }}>@handle</code> · <code style={{ background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 3 }}>youtube.com/@handle</code> · <code style={{ background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: 3 }}>UCxxxxxxxxxx</code>
        </div>
      </div>

      {/* Subscription Cards */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Loading subscriptions…
        </div>
      )}

      {!loading && subscriptions.length === 0 && loaded && (
        <div style={{
          textAlign: 'center', padding: '48px 24px',
          background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)',
          borderRadius: 12, color: 'var(--text-muted)'
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📺</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>No YouTube channels configured</div>
          <div style={{ fontSize: 13 }}>Add a channel above to start receiving notifications.</div>
        </div>
      )}

      {subscriptions.map(sub => (
        <div key={sub.id} className="section-panel" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Channel Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: 'rgba(0,0,0,0.15)' }}>
            {/* Avatar */}
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: 'linear-gradient(135deg, #FF0000, #CC0000)',
              flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden', border: '2px solid rgba(255,0,0,0.3)'
            }}>
              {sub.sourceAvatar ? (
                <img src={sub.sourceAvatar} alt={sub.sourceName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>▶</span>
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{sub.sourceName}</span>
                <span style={{ fontSize: 10, background: 'rgba(255,0,0,0.1)', color: '#FF4444', border: '1px solid rgba(255,0,0,0.2)', borderRadius: 10, padding: '1px 6px', fontWeight: 600 }}>YouTube</span>
                {sub.enabled ? (
                  <span style={{ fontSize: 10, background: 'rgba(34,197,94,0.1)', color: 'var(--color-success)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '1px 6px', fontWeight: 600 }}>● Active</span>
                ) : (
                  <span style={{ fontSize: 10, background: 'rgba(250,204,21,0.1)', color: 'var(--color-warning)', border: '1px solid rgba(250,204,21,0.2)', borderRadius: 10, padding: '1px 6px', fontWeight: 600 }}>⏸ Paused</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                → <span style={{ color: 'var(--accent-primary)' }}>#{textChannels.find(c => c.id === sub.discordChannelId)?.name || 'No channel set'}</span>
                {' · '}
                {POLLING_MODES.find(m => m.value === sub.pollingMode)?.label || 'Normal'}
                {sub.lastSyncTimestamp && ` · Last check: ${new Date(sub.lastSyncTimestamp).toLocaleTimeString()}`}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button
                onClick={() => handleTest(sub.id)}
                disabled={testingId === sub.id}
                title="Send Test Notification"
                style={{ padding: '7px 12px', borderRadius: 8, background: 'rgba(79,140,255,0.1)', border: '1px solid rgba(79,140,255,0.2)', color: 'var(--accent-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}
              >
                {testingId === sub.id ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={13} />}
                Test
              </button>
              <button
                onClick={() => setExpandedId(expandedId === sub.id ? null : sub.id)}
                style={{ padding: '7px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                {expandedId === sub.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
              <button
                onClick={() => handleRemove(sub.id)}
                style={{ padding: '7px 10px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--color-danger)', cursor: 'pointer' }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>

          {/* Expanded Config */}
          {expandedId === sub.id && (
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {/* Discord Channel */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Discord Channel</label>
                  <select
                    value={sub.discordChannelId}
                    onChange={e => handleUpdate(sub.id, { discordChannelId: e.target.value })}
                    className="form-select"
                  >
                    <option value="">Select channel…</option>
                    {textChannels.map(c => (
                      <option key={c.id} value={c.id}>#{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* Polling Mode */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Polling Speed</label>
                  <select
                    value={sub.pollingMode}
                    onChange={e => handleUpdate(sub.id, { pollingMode: e.target.value })}
                    className="form-select"
                  >
                    {POLLING_MODES.map(m => (
                      <option key={m.value} value={m.value}>{m.label} — {m.desc}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Content Types */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Content Types</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {Object.entries(sub.contentTypes).map(([key, val]) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', padding: '6px 12px', background: val ? 'rgba(79,140,255,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${val ? 'rgba(79,140,255,0.3)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 20, userSelect: 'none' }}>
                      <input type="checkbox" checked={!!val} style={{ display: 'none' }}
                        onChange={() => handleUpdate(sub.id, { contentTypes: { ...sub.contentTypes, [key]: !val } as any })} />
                      <span style={{ fontSize: 14 }}>
                        {key === 'videos' ? '🎬' : key === 'shorts' ? '📱' : key === 'streams' ? '🔴' : key === 'premieres' ? '🎭' : '💬'}
                      </span>
                      <span style={{ color: val ? 'var(--accent-primary)' : 'var(--text-muted)', fontWeight: 600, textTransform: 'capitalize' }}>
                        {key === 'communityPosts' ? 'Community Posts' : key}
                      </span>
                      <span onClick={() => handleUpdate(sub.id, { contentTypes: { ...sub.contentTypes, [key]: !val } as any })} style={{ cursor: 'pointer' }}>
                        {val ? '✓' : '○'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Role Mentions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Role Mentions</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {[
                    { id: 'everyone', name: '@everyone' },
                    { id: 'here', name: '@here' },
                    ...roles.filter(r => r.name !== '@everyone')
                  ].map(role => {
                    const selected = sub.mentionRoles.includes(role.id);
                    return (
                      <button
                        key={role.id}
                        onClick={() => {
                          const next = selected
                            ? sub.mentionRoles.filter(r => r !== role.id)
                            : [...sub.mentionRoles, role.id];
                          handleUpdate(sub.id, { mentionRoles: next });
                        }}
                        style={{
                          padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                          background: selected ? 'rgba(79,140,255,0.15)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${selected ? 'rgba(79,140,255,0.4)' : 'rgba(255,255,255,0.08)'}`,
                          color: selected ? 'var(--accent-primary)' : 'var(--text-secondary)',
                          cursor: 'pointer', transition: 'all 0.12s'
                        }}
                      >
                        {role.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Enable/Disable + Embed Builder */}
              <div style={{ display: 'flex', gap: 10, borderTop: '1px solid var(--border-color)', paddingTop: 14 }}>
                <button
                  onClick={() => setEmbedBuilderSubId(embedBuilderSubId === sub.id ? null : sub.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 8, background: 'rgba(124,92,252,0.1)', border: '1px solid rgba(124,92,252,0.3)', color: 'var(--accent-purple)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  <Settings size={14} /> {embedBuilderSubId === sub.id ? 'Close' : 'Configure'} Embed
                </button>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  <span>{sub.enabled ? 'Enabled' : 'Paused'}</span>
                  <label className="switch">
                    <input type="checkbox" checked={!!sub.enabled} onChange={() => handleUpdate(sub.id, { enabled: !sub.enabled })} />
                    <span className="slider" />
                  </label>
                </label>
              </div>

              {/* History */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                {[
                  { label: 'Notifications Sent', value: sub.totalNotificationsSent || 0, icon: '✅' },
                  { label: 'Failed Attempts', value: sub.failedAttempts || 0, icon: sub.failedAttempts > 0 ? '❌' : '✅' },
                  { label: 'Last Video ID', value: sub.lastProcessedId ? sub.lastProcessedId.substring(0, 11) : 'None', icon: '🆔' },
                ].map(stat => (
                  <div key={stat.label} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{stat.icon} {stat.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{stat.value}</div>
                  </div>
                ))}
                {sub.lastError && (
                  <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8, padding: '10px 12px', gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: 11, color: 'var(--color-danger)', marginBottom: 4 }}>❌ Last Error</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{sub.lastError}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Embed Builder Panel */}
          {embedBuilderSubId === sub.id && (
            <div style={{ borderTop: '1px solid var(--border-color)', padding: 18 }}>
              <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Embed Builder — {sub.sourceName}</span>
                <button
                  onClick={() => handleSaveEmbed(sub.id)}
                  style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--color-success)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <CheckCircle2 size={14} /> Save Embed
                </button>
              </div>
              <EmbedBuilder
                config={sub.embedConfig}
                onChange={newConfig => setSubscriptions(prev => prev.map(s => s.id === sub.id ? { ...s, embedConfig: newConfig } : s))}
                provider="youtube"
                sampleData={SAMPLE_DATA_YOUTUBE}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
