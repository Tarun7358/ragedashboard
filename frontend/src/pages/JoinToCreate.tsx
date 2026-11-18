import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, Settings, Radio, RefreshCw, Plus, Trash2, Edit3, Check, X, Sparkles, Eye, EyeOff, Lock, Globe, Mic } from 'lucide-react';
import type { ModuleState } from '../hooks/useDiscordSync';

interface Trigger {
  id: string;
  label: string;
  triggerChannelId: string;
  categoryId?: string | null;
  defaultName: string;
  defaultLimit: number;
  privacy: 'public' | 'private' | 'locked' | 'invisible' | 'stage' | 'sync';
}

interface JoinToCreateProps {
  onSaveConfig: (msg: string) => void;
  modules: ModuleState[];
  onUpdateConfig: (moduleId: string, config: Record<string, any>, enabledOverride?: boolean) => void;
  registry?: { channels: Array<{ id: string; name: string; type: string; category?: string }> };
}

const PRIVACY_OPTS = [
  { id: 'public',    label: 'Public',    desc: 'Anyone can join',            icon: Globe,   color: '#10B981' },
  { id: 'private',   label: 'Private',   desc: 'Invite-only, owner controls', icon: Eye,     color: '#3B82F6' },
  { id: 'locked',    label: 'Locked',    desc: 'Visible, no one can enter',   icon: Lock,    color: '#F59E0B' },
  { id: 'invisible', label: 'Invisible', desc: 'Hidden from channel list',    icon: EyeOff,  color: '#8B5CF6' },
  { id: 'stage',     label: 'Stage',     desc: 'All muted, owner is host',    icon: Mic,     color: '#EC4899' },
  { id: 'sync',      label: 'Sync with Category', desc: 'Inherit parent overrides', icon: RefreshCw, color: '#06B6D4' },
];

const blank = (): Trigger => ({
  id: `trigger_${Date.now()}`,
  label: '',
  triggerChannelId: '',
  categoryId: null,
  defaultName: "{username}'s Channel",
  defaultLimit: 0,
  privacy: 'public',
});

export function JoinToCreate({ onSaveConfig, modules, onUpdateConfig, registry }: JoinToCreateProps) {
  const [tab, setTab] = useState<'triggers' | 'active'>('triggers');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Trigger>(blank());
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const jtcMod = (modules || []).find(m => m.id === 'join_to_create');
  const config = jtcMod?.config || {};
  const triggers: Trigger[] = (() => {
    const arr: Trigger[] = [...(config.triggers || [])];
    // Migrate legacy single-trigger config if not already in the array
    if (config.triggerChannelId && !arr.find((t: Trigger) => t.triggerChannelId === config.triggerChannelId)) {
      arr.unshift({
        id: `trigger_${config.triggerChannelId}`,
        label: (config as any).label || 'Default Trigger',
        triggerChannelId: config.triggerChannelId,
        categoryId: config.categoryId ?? null,
        defaultName: config.defaultName || "{username}'s Channel",
        defaultLimit: config.defaultLimit ?? 0,
        privacy: config.privacy || 'public',
      });
    }
    return arr;
  })();

  const activeChannels: any[] = config.activeChannels || [];

  const voiceChannels = (registry?.channels || []).filter(c => c.type === 'voice');
  const categories   = (registry?.channels || []).filter(c => c.type === 'category');

  const saveTriggers = (next: Trigger[], msg = 'Triggers saved.') => {
    setSaving(true);
    // Always persist new array AND clear legacy root fields to prevent duplicates
    onUpdateConfig('join_to_create', {
      triggers: next,
      triggerChannelId: null,
      categoryId: null,
      defaultName: null,
      defaultLimit: null,
      privacy: null,
    });
    setTimeout(() => { onSaveConfig(msg); setSaving(false); }, 600);
  };


  const handleAdd = () => { setDraft(blank()); setAdding(true); setEditingId(null); };
  const handleEdit = (t: Trigger) => { setDraft({ ...t }); setEditingId(t.id); setAdding(false); };
  const handleCancel = () => { setAdding(false); setEditingId(null); };

  const handleSaveDraft = () => {
    if (!draft.triggerChannelId) { setFormError('Please select a trigger channel.'); return; }
    setFormError(null);
    // BUG FIX: do not mutate draft directly — compute label from state snapshot
    const label = draft.label.trim() || voiceChannels.find(c => c.id === draft.triggerChannelId)?.name || 'Trigger';
    const finalDraft = { ...draft, label };
    const next = editingId
      ? triggers.map(t => t.id === editingId ? finalDraft : t)
      : [...triggers, { ...finalDraft, id: `trigger_${draft.triggerChannelId}` }];
    saveTriggers(next, editingId ? 'Trigger updated.' : 'Trigger added.');
    setAdding(false); setEditingId(null);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Remove this trigger?')) return;
    saveTriggers(triggers.filter(t => t.id !== id), 'Trigger removed.');
  };

  const setD = (f: Partial<Trigger>) => setDraft(p => ({ ...p, ...f }));

  const formOpen = adding || !!editingId;

  // ─── Form panel — defined as a named function so React keeps it stable ──────
  const TriggerForm = (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
      style={{ background: '#FAFAFC', border: '1px solid #E4E4E8', borderRadius: 16, padding: 28, marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h3 style={{ color: '#09090B', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Plus size={16} color="var(--accent-primary)" />{editingId ? 'Edit Trigger' : 'New Trigger'}
        </h3>
        <button onClick={handleCancel} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
      </div>

      {/* Inline validation error */}
      {formError && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '8px 14px', fontSize: 12, color: '#EF4444', marginBottom: 16 }}>
          ⚠️ {formError}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* BUG FIX: box-sizing ensures padding doesn't overflow the grid cell */}
        {/* Label */}
        <div>
          <label style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Label</label>
          <input value={draft.label} onChange={e => setD({ label: e.target.value })} placeholder="e.g. Gaming Lounge"
            style={{ width: '100%', boxSizing: 'border-box', background: '#FFFFFF', border: '1px solid #E4E4E8', borderRadius: 10, padding: '11px 14px', color: '#09090B', fontSize: 13 }} />
        </div>
        {/* Trigger Channel */}
        <div>
          <label style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Trigger Channel *</label>
          <select value={draft.triggerChannelId} onChange={e => { setD({ triggerChannelId: e.target.value }); setFormError(null); }}
            style={{ width: '100%', boxSizing: 'border-box', background: '#FFFFFF', border: `1px solid ${formError && !draft.triggerChannelId ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 10, padding: '11px 14px', color: '#09090B', fontSize: 13 }}>
            <option value="">Select voice channel…</option>
            {voiceChannels.map(c => <option key={c.id} value={c.id}>🔊 {c.name} {c.category ? `[${c.category}]` : ''}</option>)}
          </select>
        </div>
        {/* Spawn Category */}
        <div>
          <label style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Spawn Category</label>
          <select value={draft.categoryId || ''} onChange={e => setD({ categoryId: e.target.value || null })}
            style={{ width: '100%', boxSizing: 'border-box', background: '#FFFFFF', border: '1px solid #E4E4E8', borderRadius: 10, padding: '11px 14px', color: '#09090B', fontSize: 13 }}>
            <option value="">Same as trigger (auto)</option>
            {categories.map(c => <option key={c.id} value={c.id}>📁 {c.name}</option>)}
          </select>
        </div>
        {/* Name Template */}
        <div>
          <label style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Name Template</label>
          <input value={draft.defaultName} onChange={e => setD({ defaultName: e.target.value })} placeholder="{username}'s Channel"
            style={{ width: '100%', boxSizing: 'border-box', background: '#FFFFFF', border: '1px solid #E4E4E8', borderRadius: 10, padding: '11px 14px', color: '#09090B', fontSize: 13 }} />
        </div>
        {/* User Limit */}
        <div>
          <label style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>
            User Limit: <strong style={{ color: '#09090B' }}>{draft.defaultLimit === 0 ? '∞ Unlimited' : `${draft.defaultLimit} max`}</strong>
          </label>
          {/* BUG FIX: parseInt can return NaN on empty string — use fallback 0 */}
          <input type="range" min={0} max={99} value={draft.defaultLimit} onChange={e => setD({ defaultLimit: parseInt(e.target.value) || 0 })}
            style={{ width: '100%', accentColor: 'var(--accent-primary)' }} />
        </div>
        {/* Privacy */}
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>Privacy Mode</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
            {PRIVACY_OPTS.map(o => {
              const Icon = o.icon;
              const sel = draft.privacy === o.id;
              const rgb = o.color === '#10B981' ? '16,185,129' : o.color === '#3B82F6' ? '59,130,246' : o.color === '#F59E0B' ? '245,158,11' : o.color === '#8B5CF6' ? '139,92,246' : o.color === '#06B6D4' ? '6,182,212' : '236,72,153';
              return (
                <button key={o.id} onClick={() => setD({ privacy: o.id as any })} title={(o as any).desc}
                  style={{ padding: '12px 6px', borderRadius: 10, background: sel ? `rgba(${rgb},0.14)` : 'rgba(15,17,21,0.6)',
                    border: `1.5px solid ${sel ? o.color : 'rgba(255,255,255,0.06)'}`, color: sel ? o.color : 'var(--text-muted)',
                    cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700,
                    boxShadow: sel ? `0 0 12px rgba(${rgb},0.2)` : 'none', transition: 'all 0.18s' }}>
                  <Icon size={15} />{o.label}
                  <span style={{ fontSize: 9, fontWeight: 400, opacity: 0.7, textAlign: 'center', lineHeight: 1.3 }}>{(o as any).desc}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={handleCancel} style={{ padding: '10px 20px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid #E4E4E8', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} onClick={handleSaveDraft}
          style={{ padding: '10px 24px', borderRadius: 10, background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-purple))', border: 'none', color: '#FFF', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          {saving ? <RefreshCw size={14} className="spin" /> : <Check size={14} />}
          {editingId ? 'Update Trigger' : 'Add Trigger'}
        </motion.button>
      </div>
    </motion.div>
  );

  // ─── Trigger card ───────────────────────────────────────────────
  const TriggerCard = ({ t }: { t: Trigger }) => {
    const ch = voiceChannels.find(c => c.id === t.triggerChannelId);
    const cat = categories.find(c => c.id === t.categoryId);
    const privOpt = PRIVACY_OPTS.find(o => o.id === t.privacy) || PRIVACY_OPTS[0];
    const Icon = privOpt.icon;
    const activeCount = activeChannels.filter(a => a.triggerId === t.id).length;
    return (
      <motion.div whileHover={{ y: -3, boxShadow: '0 12px 28px rgba(0,0,0,0.35)' }} transition={{ duration: 0.2 }}
        style={{ background: '#FAFAFC', border: '1px solid #E4E4E8', borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#09090B', marginBottom: 2 }}>{t.label || ch?.name || 'Unnamed'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>🔊 {ch?.name || t.triggerChannelId}</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {activeCount > 0 && (
              <span style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10B981', fontSize: 10, fontWeight: 700 }}>
                🟢 {activeCount} LIVE
              </span>
            )}
          </div>
        </div>
        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[
            { label: 'Privacy', value: <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: privOpt.color }}><Icon size={11} />{privOpt.label}</span> },
            { label: 'Limit', value: t.defaultLimit === 0 ? '∞ Unlimited' : `${t.defaultLimit} max` },
            { label: 'Category', value: cat?.name || 'Auto' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
              <div style={{ fontSize: 12, color: '#09090B', fontWeight: 600 }}>{s.value}</div>
            </div>
          ))}
        </div>
        {/* Name template */}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '6px 10px' }}>
          Template: <code style={{ color: 'var(--accent-primary)' }}>{t.defaultName}</code>
        </div>
        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
          <button onClick={() => handleEdit(t)}
            style={{ flex: 1, padding: '9px', borderRadius: 9, background: 'rgba(124,92,252,0.1)', border: '1px solid rgba(124,92,252,0.25)', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Edit3 size={13} /> Edit
          </button>
          <button onClick={() => handleDelete(t.id)}
            style={{ padding: '9px 14px', borderRadius: 9, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Trash2 size={13} />
          </button>
        </div>
      </motion.div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <span className="badge badge-purple" style={{ padding: '5px 12px', fontSize: 10, borderRadius: 20, letterSpacing: '0.05em', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
            <Sparkles size={10} /> Dynamic Voice Systems
          </span>
          <h1 style={{ fontSize: 26, fontWeight: 800, background: 'linear-gradient(to right, #FFF, #9CA3AF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 4 }}>
            Join-to-Create Hub
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 560 }}>
            Configure multiple trigger channels — each with its own name template, privacy and category. Users auto-get a private room on join.
          </p>
        </div>
        {/* BUG FIX: toggle was negating the WRONG side — status 'enabled' means currently enabled,
             so clicking should DISABLE it (pass false), not re-enable. Fixed the boolean. */}
        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
          onClick={() => {
            const nextEnabled = jtcMod?.status !== 'enabled';
            onUpdateConfig('join_to_create', {}, nextEnabled);
            onSaveConfig(`JTC ${nextEnabled ? 'ENABLED' : 'DISABLED'}.`);
          }}
          style={{ minWidth: 150, padding: '11px 22px', borderRadius: 12, background: jtcMod?.status === 'enabled' ? 'rgba(34,197,94,0.12)' : 'rgba(124,92,252,0.1)', border: `1px solid ${jtcMod?.status === 'enabled' ? 'rgba(34,197,94,0.35)' : 'rgba(124,92,252,0.25)'}`, color: jtcMod?.status === 'enabled' ? '#22C55E' : 'var(--text-primary)', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: jtcMod?.status === 'enabled' ? '#22C55E' : '#6B7280', boxShadow: jtcMod?.status === 'enabled' ? '0 0 8px #22C55E' : 'none', display: 'inline-block' }} />
          {jtcMod?.status === 'enabled' ? 'ACTIVE' : 'INACTIVE'}
        </motion.button>
      </div>

      {/* Tabs */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E4E4E7', borderRadius: 18, overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', gap: 24, borderBottom: '1px solid #E4E4E7', padding: '0 28px', background: '#FAFAFC' }}>
          {[{ id: 'triggers', label: `Trigger Blueprints (${triggers.length})`, icon: Settings }, { id: 'active', label: `Live Rooms (${activeChannels.length})`, icon: Radio }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '17px 0', fontWeight: 600, fontSize: 13, background: 'none', border: 'none', borderBottom: tab === t.id ? '2px solid var(--accent-primary)' : '2px solid transparent', color: tab === t.id ? 'var(--accent-primary)' : 'var(--text-secondary)', cursor: 'pointer' }}>
              <t.icon size={15} />{t.label}
            </button>
          ))}
        </div>

        <div style={{ padding: 28 }}>
          <AnimatePresence mode="wait">
            {tab === 'triggers' && (
              <motion.div key="triggers" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
                {/* Add button */}
                {!formOpen && (
                  <motion.button whileHover={{ scale: 1.01 }} onClick={handleAdd}
                    style={{ width: '100%', padding: '14px', borderRadius: 12, background: 'rgba(124,92,252,0.07)', border: '1.5px dashed rgba(124,92,252,0.35)', color: 'var(--accent-primary)', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer', marginBottom: 24 }}>
                    <Plus size={18} /> Add New Trigger Channel
                  </motion.button>
                )}

                {/* Form — TriggerForm is a JSX element variable, not a component */}
                <AnimatePresence>{formOpen && TriggerForm}</AnimatePresence>

                {/* Trigger cards grid */}
                {triggers.length === 0 && !formOpen ? (
                  <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <Volume2 size={40} style={{ opacity: 0.3 }} />
                    <div style={{ color: '#09090B', fontSize: 15, fontWeight: 600 }}>No Trigger Channels Yet</div>
                    <p style={{ fontSize: 13, maxWidth: 340, lineHeight: 1.5 }}>Click "Add New Trigger Channel" above to configure your first Join-to-Create trigger. You can add as many as you need!</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
                    {triggers.map(t => <TriggerCard key={t.id} t={t} />)}
                  </div>
                )}
              </motion.div>
            )}

            {tab === 'active' && (
              <motion.div key="active" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25 }}>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: '#09090B', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Radio size={17} color="var(--accent-primary)" /> Live Temporary Rooms
                </h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>Dynamically managed voice rooms currently active on the server.</p>
                {activeChannels.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, background: 'rgba(15,17,21,0.3)', border: '1px dashed rgba(255,255,255,0.07)', borderRadius: 14 }}>
                    <Volume2 size={40} style={{ opacity: 0.3 }} />
                    <div style={{ color: '#09090B', fontSize: 14, fontWeight: 600 }}>No Active Channels</div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 340 }}>No members are using any JTC trigger right now. Details appear here in real time.</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 18 }}>
                    {activeChannels.map((room: any) => {
                      const src = triggers.find(t => t.id === room.triggerId);
                      return (
                        <motion.div key={room.channelId} whileHover={{ y: -3 }}
                          style={{ background: 'rgba(15,17,21,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 9, padding: '3px 8px', borderRadius: 12, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10B981', fontWeight: 700 }}>🟢 LIVE</span>
                            {src && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>via {src.label}</span>}
                          </div>
                          <div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#09090B', display: 'flex', alignItems: 'center', gap: 6 }}><Volume2 size={14} color="var(--accent-primary)" />{room.name}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>Owner: <strong>@{room.ownerTag}</strong></div>
                          </div>
                          <div style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)' }}>
                            <span>{room.locked ? '🔒 Locked' : '🔓 Open'}</span>
                            {/* BUG FIX: room.limit may be undefined for legacy active channels */}
                            <span>{room.limit === undefined || room.limit === 0 ? '∞ slots' : `${room.limit} max`}</span>
                          </div>
                        </motion.div>
                      );
                    })}
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
