import { API_BASE } from '../../config';
/**
 * Social Updates — InstagramTab
 * Instagram subscription management panel.
 */
import React, { useState } from 'react';
import {
  Plus, Trash2, CheckCircle2, AlertCircle, Settings, Send, Loader2,
  ChevronDown, ChevronUp, Clock, Info
} from 'lucide-react';
import { EmbedBuilder } from './EmbedBuilder';
import type { EmbedConfig } from './EmbedPreview';
import type { DiscordChannel, DiscordRole } from '../../hooks/useDiscordSync';

const DEFAULT_EMBED: EmbedConfig = {
  color: '#EC4899',
  authorEnabled: true,
  authorName: '@{profile.username}',
  authorIcon: '{profile.avatar}',
  authorUrl: '{profile.url}',
  titleEnabled: true,
  title: '📸 New Post by @{profile.username}',
  titleUrl: '{post.url}',
  descriptionEnabled: true,
  description: '{post.caption}',
  thumbnailEnabled: false,
  thumbnail: '',
  imageEnabled: true,
  image: '{post.image}',
  fields: [],
  footerEnabled: true,
  footerText: 'Instagram Alert',
  timestampEnabled: true,
  buttons: [
    { label: 'View Post', url: '{post.url}', emoji: '' }
  ],
  mentionRoles: []
};

const SAMPLE_DATA_INSTAGRAM: Record<string, string> = {
  'post.caption': '📸 Check out this amazing photo! #photography #awesome',
  'post.image': '',
  'post.url': 'https://www.instagram.com/p/sample/',
  'post.publish_date': new Date().toISOString(),
  'post.id': 'sample_post_123',
  'profile.name': 'awesome.account',
  'profile.username': 'awesome.account',
  'profile.avatar': '',
  'profile.url': 'https://www.instagram.com/awesome.account/',
  'discord.guild': 'My Server',
  'server.name': 'My Server',
  'discord.channel': '#instagram-alerts',
  'role.mention': ''
};

const POLLING_MODES = [
  { value: 'fast', label: '⚡ Fast', desc: 'Every 30 sec — Real-time (Koya Speed)' },
  { value: 'normal', label: '⚖️ Normal', desc: 'Every 10 min — Balanced' },
  { value: 'slow', label: '🐢 Slow', desc: 'Every 30 min — Minimal usage' }
];

interface Subscription {
  id: string;
  provider: 'instagram';
  sourceId: string;
  sourceName: string;
  sourceAvatar?: string;
  discordChannelId: string;
  embedConfig: EmbedConfig;
  mentionRoles: string[];
  pollingMode: string;
  contentTypes: {
    posts: boolean; reels: boolean; stories: boolean;
  };
  enabled: boolean | number;
  lastSyncTimestamp?: string;
  failedAttempts: number;
  lastError?: string;
  lastProcessedId?: string;
  totalNotificationsSent?: number;
}

interface InstagramTabProps {
  guildId: string;
  token: string;
  channels: DiscordChannel[];
  roles: DiscordRole[];
  onSaveConfig: (msg: string) => void;
}

export function InstagramTab({ guildId, token, channels, roles, onSaveConfig }: InstagramTabProps) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [instagramInput, setInstagramInput] = useState('');
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [embedBuilderSubId, setEmbedBuilderSubId] = useState<string | null>(null);
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
        setSubscriptions((data.subscriptions || []).filter((s: Subscription) => s.provider === 'instagram'));
      }
    } catch {}
    setLoading(false);
    setLoaded(true);
  };

  React.useEffect(() => {
    if (!loaded) loadSubscriptions();
  }, []);

  const handleAddInstagram = async () => {
    if (!instagramInput.trim()) return;
    setValidating(true);
    setValidationError('');
    try {
      const res = await fetch(`${API_BASE}/api/modules/social_updates/validate`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ provider: 'instagram', input: instagramInput.trim() })
      });
      const data = await res.json();
      if (!data.valid) {
        setValidationError(data.error || 'Invalid account');
        setValidating(false);
        return;
      }

      const subRes = await fetch(`${API_BASE}/api/modules/social_updates/subscribe`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          provider: 'instagram',
          sourceId: data.sourceId,
          sourceName: data.sourceName,
          sourceAvatar: data.sourceAvatar,
          discordChannelId: (channels.find(c => c.type === 'text') || channels[0])?.id || '',
          embedConfig: DEFAULT_EMBED,
          mentionRoles: [],
          pollingMode: 'fast',
          contentTypes: { posts: true, reels: true, stories: false }
        })
      });

      if (subRes.ok) {
        const subData = await subRes.json();
        setSubscriptions(prev => [...prev, subData.subscription]);
        setInstagramInput('');
        setExpandedId(subData.subscription.id);
        onSaveConfig(`Instagram account "${data.sourceName}" added successfully.`);
      } else {
        const errData = await subRes.json().catch(() => ({}));
        setValidationError(errData.error || 'Failed to save subscription.');
      }
    } catch (err) {
      setValidationError('Failed to add Instagram account.');
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
    if (!confirm('Remove this Instagram subscription?')) return;
    try {
      await fetch(`${API_BASE}/api/modules/social_updates/unsubscribe`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ id })
      });
      setSubscriptions(prev => prev.filter(s => s.id !== id));
      onSaveConfig('Instagram subscription removed.');
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
        onSaveConfig('✅ Instagram test notification sent successfully!');
      } else {
        onSaveConfig(`❌ Test failed: ${data.error}`);
      }
    } catch {
      onSaveConfig('❌ Test failed.');
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
      {/* Production Live Monitoring Banner */}
      <div style={{
        background: 'rgba(34, 197, 94, 0.06)',
        border: '1px solid rgba(34, 197, 94, 0.25)',
        borderRadius: 12,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12
      }}>
        <CheckCircle2 size={20} color="var(--color-success)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-success)' }}>Instagram Production Feed Engine</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
            Instagram active monitoring engine is online. Connect Meta Graph API tokens in your backend environment to enable enterprise rate-limit bypasses and instant post alerts.
          </div>
        </div>
      </div>

      {/* Add Instagram Input */}
      <div className="section-panel" style={{ padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
          Add Instagram Account
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            type="text"
            value={instagramInput}
            onChange={e => setInstagramInput(e.target.value)}
            placeholder="Username or profile URL (e.g. @nasa)"
            className="text-input"
            style={{ flex: 1 }}
            onKeyDown={e => e.key === 'Enter' && handleAddInstagram()}
          />
          <button
            onClick={handleAddInstagram}
            disabled={validating || !instagramInput.trim()}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px',
              background: '#EC4899', border: 'none', borderRadius: 8,
              color: '#fff', fontWeight: 700, fontSize: 13, cursor: validating ? 'not-allowed' : 'pointer',
              opacity: validating || !instagramInput.trim() ? 0.6 : 1, whiteSpace: 'nowrap'
            }}
          >
            {validating ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={14} />}
            {validating ? 'Validating…' : 'Add Profile'}
          </button>
        </div>
        {validationError && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-danger)', fontSize: 13 }}>
            <AlertCircle size={14} /> {validationError}
          </div>
        )}
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
          <div style={{ fontSize: 36, marginBottom: 12 }}>📸</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>No Instagram profiles configured</div>
          <div style={{ fontSize: 13 }}>Add a profile above to start receiving notifications.</div>
        </div>
      )}

      {subscriptions.map(sub => (
        <div key={sub.id} className="section-panel" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: 'rgba(0,0,0,0.15)' }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: 'linear-gradient(135deg, #F9CE34, #EE2A7B, #6228D7)',
              flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden', border: '2px solid rgba(238,42,123,0.3)'
            }}>
              {sub.sourceAvatar ? (
                <img src={sub.sourceAvatar} alt={sub.sourceName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>📸</span>
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{sub.sourceName}</span>
                <span style={{ fontSize: 10, background: 'rgba(238,42,123,0.1)', color: '#EE2A7B', border: '1px solid rgba(238,42,123,0.2)', borderRadius: 10, padding: '1px 6px', fontWeight: 600 }}>Instagram</span>
                <span style={{ fontSize: 10, background: 'rgba(34,197,94,0.1)', color: 'var(--color-success)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '1px 6px', fontWeight: 600 }}>Production Mode</span>
                {sub.enabled ? (
                  <span style={{ fontSize: 10, background: 'rgba(34,197,94,0.1)', color: 'var(--color-success)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '1px 6px', fontWeight: 600 }}>● Active</span>
                ) : (
                  <span style={{ fontSize: 10, background: 'rgba(250,204,21,0.1)', color: 'var(--color-warning)', border: '1px solid rgba(250,204,21,0.2)', borderRadius: 10, padding: '1px 6px', fontWeight: 600 }}>⏸ Paused</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                → <span style={{ color: 'var(--accent-primary)' }}>#{textChannels.find(c => c.id === sub.discordChannelId)?.name || 'No channel set'}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button
                onClick={() => handleTest(sub.id)}
                disabled={testingId === sub.id}
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

                {/* Polling Speed */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Polling Speed</label>
                  <select
                    value={sub.pollingMode}
                    onChange={e => handleUpdate(sub.id, { pollingMode: e.target.value })}
                    className="form-select"
                  >
                    {POLLING_MODES.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
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
                        {key === 'posts' ? '📸' : key === 'reels' ? '📱' : '🎬'}
                      </span>
                      <span style={{ color: val ? 'var(--accent-primary)' : 'var(--text-muted)', fontWeight: 600, textTransform: 'capitalize' }}>
                        {key}
                      </span>
                      <span style={{ marginLeft: 4 }}>{val ? '✓' : '○'}</span>
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
            </div>
          )}

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
                provider="instagram"
                sampleData={SAMPLE_DATA_INSTAGRAM}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
