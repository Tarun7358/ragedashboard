import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, Hash, Plus, Trash2, Save, Eye,
  Image as ImageIcon, Type, Link2, Smile, Palette, ChevronDown, Code,
  Download, Check, Settings2, Sparkles, AlertCircle, Info, ExternalLink,
  Undo2, Redo2, RefreshCw, Send, Gift, Calendar, Award
} from 'lucide-react';
import { RoleSelect, ChannelSelect } from '../components/ResourceSelectors';
import { VariableInput, VariableTextArea } from '../components/builders/VariableInput';
import { EmbedBuilder, type EmbedData } from '../components/builders/EmbedBuilder';
import { useStateHistory } from '../components/builders/StateHistory';
import type { DiscordRole, DiscordChannel, DiscordResourceRegistry } from '../hooks/useDiscordSync';

interface WelcomeEmbedData extends EmbedData {
  enabled?: boolean;
}

// ─── Preset Styles for Welcome Card & Embeds ─────────────────────────────────
const STYLING_PRESETS = [
  {
    name: 'Classic Premium',
    color: '#d4af37',
    imageSettings: {
      backgroundType: 'gradient' as const,
      backgroundValue: 'linear-gradient(135deg, #0f0f13 0%, #1a1a24 100%)',
      avatarStyle: 'circle' as const,
      avatarBorderColor: '#d4af37',
      avatarBorderSize: 4,
      titleText: 'Welcome {user}',
      titleColor: '#ffffff',
      titleSize: 32,
      subtitleText: 'to {server}',
      subtitleColor: '#a0a0ab',
      subtitleSize: 20,
      footerText: 'Member #{memberCount}',
      footerColor: '#d4af37',
      footerSize: 14,
      fontFamily: 'Outfit',
      glassmorphism: true
    },
    embed: {
      enabled: true,
      title: '✨ Welcome to {server}!',
      description: 'Hey {user}, we\'re so glad you\'re here! Please read our rules and enjoy your stay. You are our **#{memberCount}** member!',
      color: '#d4af37',
      timestamp: true,
      showAvatar: true,
      fields: [
        { name: '📋 Guidelines', value: 'Read channel info', inline: true },
        { name: '💬 Chat', value: 'Join general chat', inline: true }
      ]
    }
  },
  {
    name: 'Cyberpunk Red',
    color: '#EF4444',
    imageSettings: {
      backgroundType: 'gradient' as const,
      backgroundValue: 'linear-gradient(135deg, #120202 0%, #200404 100%)',
      avatarStyle: 'square' as const,
      avatarBorderColor: '#EF4444',
      avatarBorderSize: 3,
      titleText: '⚡ SYSTEM LINK: {user}',
      titleColor: '#ffffff',
      titleSize: 28,
      subtitleText: 'Node connected to {server}',
      subtitleColor: '#EF4444',
      subtitleSize: 18,
      footerText: 'INDEX #{memberCount}',
      footerColor: '#ffffff',
      footerSize: 12,
      fontFamily: 'Share Tech Mono',
      glassmorphism: true
    },
    embed: {
      enabled: true,
      title: '⚡ CRITICAL DETECTED: {user}',
      description: 'New node connection established. Welcome to database **{server}**.\nInitializing welcome security protocols for user **#{memberCount}**.',
      color: '#EF4444',
      timestamp: true,
      showAvatar: false,
      fields: [
        { name: '📂 Access Logs', value: 'Authorized', inline: true }
      ]
    }
  },
  {
    name: 'Neon Horizon',
    color: '#a855f7',
    imageSettings: {
      backgroundType: 'gradient' as const,
      backgroundValue: 'linear-gradient(135deg, #09090b 0%, #3b0764 100%)',
      avatarStyle: 'circle' as const,
      avatarBorderColor: '#a855f7',
      avatarBorderSize: 5,
      titleText: '✨ VIP ENTRY: {user}',
      titleColor: '#ffffff',
      titleSize: 30,
      subtitleText: 'Joined the inner circle of {server}',
      subtitleColor: '#f47fff',
      subtitleSize: 18,
      footerText: 'VVIP MEMBER #{memberCount}',
      footerColor: '#f47fff',
      footerSize: 13,
      fontFamily: 'Inter',
      glassmorphism: true
    },
    embed: {
      enabled: true,
      title: '🔮 VIP Guest Arrival: {user}',
      description: 'Everyone welcome **{user}** to the premium zone of **{server}**! We are now celebrating **{memberCount}** users.',
      color: '#a855f7',
      timestamp: true,
      showAvatar: true,
      fields: []
    }
  }
];

interface WelcomeConfig {
  welcomeEnabled: boolean;
  welcomeChannelId: string;
  welcomeMessage: string;
  welcomeImageEnabled: boolean;
  welcomeImageSettings: {
    backgroundType: 'image' | 'gradient';
    backgroundValue: string;
    avatarStyle: 'circle' | 'square' | 'none';
    avatarBorderColor: string;
    avatarBorderSize: number;
    titleText: string;
    titleColor: string;
    titleSize: number;
    subtitleText: string;
    subtitleColor: string;
    subtitleSize: number;
    footerText: string;
    footerColor: string;
    footerSize: number;
    fontFamily: string;
    glassmorphism: boolean;
  };
  welcomeEmbed: WelcomeEmbedData;

  goodbyeEnabled: boolean;
  goodbyeChannelId: string;
  goodbyeMessage: string;
  goodbyeEmbed: WelcomeEmbedData;

  dmEnabled: boolean;
  dmMessage: string;
  dmEmbed: WelcomeEmbedData;

  autoroleEnabled: boolean;
  autoroleRoleIds: string[];
  autoroleDelay: number;

  milestonesEnabled: boolean;
  milestonesChannelId: string;
  milestonesInterval: number;
  milestonesMessage: string;
  milestonesEmbed: WelcomeEmbedData;

  boostEnabled: boolean;
  boostChannelId: string;
  boostMessage: string;
  boostEmbed: WelcomeEmbedData;

  unboostEnabled: boolean;
  unboostChannelId: string;
  unboostMessage: string;
  unboostEmbed: WelcomeEmbedData;

  birthdaysEnabled: boolean;
  birthdaysChannelId: string;
  birthdaysMessage: string;
  birthdaysEmbed: WelcomeEmbedData;
}

const DEFAULT_WELCOME_CONFIG: WelcomeConfig = {
  welcomeEnabled: true,
  welcomeChannelId: '',
  welcomeMessage: 'Welcome {user} to **{server}**! You are member #{memberCount}. 🎉',
  welcomeImageEnabled: true,
  welcomeImageSettings: {
    backgroundType: 'gradient',
    backgroundValue: 'linear-gradient(135deg, #0f0f13 0%, #1a1a24 100%)',
    avatarStyle: 'circle',
    avatarBorderColor: '#d4af37',
    avatarBorderSize: 4,
    titleText: 'Welcome {user}',
    titleColor: '#ffffff',
    titleSize: 32,
    subtitleText: 'to {server}',
    subtitleColor: '#a0a0ab',
    subtitleSize: 20,
    footerText: 'Member #{memberCount}',
    footerColor: '#d4af37',
    footerSize: 14,
    fontFamily: 'Outfit',
    glassmorphism: true
  },
  welcomeEmbed: {
    enabled: true,
    title: '✨ Welcome to {server}!',
    description: 'Hey {user}, we\'re so glad you\'re here! Please read our rules and enjoy your stay. You are our **#{memberCount}** member!',
    color: '#d4af37',
    timestamp: true,
    showAvatar: true,
    fields: []
  },

  goodbyeEnabled: false,
  goodbyeChannelId: '',
  goodbyeMessage: '**{userTag}** has left the server. We now have {memberCount} members.',
  goodbyeEmbed: { enabled: false, title: '', description: '', color: '#ff4444' },

  dmEnabled: false,
  dmMessage: 'Thanks for joining **{server}**!',
  dmEmbed: { enabled: false, title: '', description: '', color: '#d4af37' },

  autoroleEnabled: false,
  autoroleRoleIds: [],
  autoroleDelay: 0,

  milestonesEnabled: false,
  milestonesChannelId: '',
  milestonesInterval: 100,
  milestonesMessage: '📈 Milestone Reached!',
  milestonesEmbed: {
    enabled: true,
    title: '📈 Server Milestone Reached!',
    description: 'Congratulations! **{server}** has officially hit **{memberCount}** members! 🎉',
    color: '#d4af37'
  },

  boostEnabled: false,
  boostChannelId: '',
  boostMessage: '✨ Server Boosted!',
  boostEmbed: {
    enabled: true,
    title: '✨ Server Boosted!',
    description: 'Thank you so much to {user} for boosting the server! 🚀💖',
    color: '#f47fff',
    showAvatar: true
  },

  unboostEnabled: false,
  unboostChannelId: '',
  unboostMessage: '😢 Server Unboosted',
  unboostEmbed: {
    enabled: true,
    title: '😢 Server Unboosted',
    description: 'Oh no! **{userTag}** is no longer boosting the server.',
    color: '#ff4444'
  },

  birthdaysEnabled: false,
  birthdaysChannelId: '',
  birthdaysMessage: '🎉 Happy Birthday {user}!',
  birthdaysEmbed: {
    enabled: true,
    title: '🎉 Happy Birthday, {user}!',
    description: 'Wishing **{userTag}** a fantastic birthday today! 🎂🎈',
    color: '#d4af37',
    showAvatar: true
  }
};

interface WelcomeProps {
  onSaveConfig: (msg: string, type?: 'success' | 'danger' | 'warning' | 'info') => void;
  onManualTrigger?: (msg: string, type?: any, cat?: any) => void;
  modules: any[];
  registry: DiscordResourceRegistry;
  onUpdateConfig: (moduleId: string, newConfig: Record<string, any>, enabledOverride?: boolean) => void;
}

export function Welcome({ onSaveConfig, onManualTrigger, modules = [], registry, onUpdateConfig }: WelcomeProps) {
  // Find current backend configuration
  const welcomeModule = modules.find(m => m.id === 'welcome-v2');
  const backendConfig = welcomeModule?.config || {};

  // Initialize custom state history with loaded configurations
  const initialConfig = { ...DEFAULT_WELCOME_CONFIG, ...backendConfig };
  const { state: config, pushState, undo, redo, canUndo, canRedo, reset } = useStateHistory<WelcomeConfig>(initialConfig);

  // Sync state if backendConfig updates externally
  useEffect(() => {
    if (welcomeModule?.config) {
      reset({ ...DEFAULT_WELCOME_CONFIG, ...welcomeModule.config });
    }
  }, [welcomeModule?.config, reset]);

  // Sidebar Sub-Module tab
  const [activeTab, setActiveTab] = useState<'welcome' | 'goodbye' | 'dm' | 'autorole' | 'boost' | 'milestone' | 'birthdays'>('welcome');

  // Preview Simulator variables state
  const [simUsername, setSimUsername] = useState('RageMember');
  const [simMemberCount, setSimMemberCount] = useState(4291);
  const [simBoosts, setSimBoosts] = useState(28);

  const roles = registry?.roles || [];
  const channels = registry?.channels || [];
  const textChannels = channels.filter(c => c.type === 'text' || c.type === 'announcement');

  const updateConfigVal = (key: keyof WelcomeConfig, val: any) => {
    pushState({
      ...config,
      [key]: val
    });
  };

  const updateWelcomeImageSetting = (key: string, val: any) => {
    pushState({
      ...config,
      welcomeImageSettings: {
        ...config.welcomeImageSettings,
        [key]: val
      }
    });
  };

  const handleSave = async () => {
    try {
      await onUpdateConfig('welcome-v2', config as any);
      onSaveConfig('Welcome vNext configurations saved successfully!', 'success');
      if (onManualTrigger) {
        onManualTrigger('Saved welcome system settings', 'success', 'Welcome');
      }
    } catch (err) {
      onSaveConfig('Failed to save welcome configurations.', 'danger');
    }
  };

  const applyPreset = (preset: typeof STYLING_PRESETS[0]) => {
    pushState({
      ...config,
      welcomeImageSettings: { ...config.welcomeImageSettings, ...preset.imageSettings },
      welcomeEmbed: { ...config.welcomeEmbed, ...preset.embed }
    });
    onSaveConfig(`Applied "${preset.name}" preset details! Remember to save.`, 'info');
  };

  // Helper to resolve template variables in simulator
  const resolveSimulatorText = (text: string) => {
    if (!text) return '';
    return text
      .replace(/{user}/g, `<span style="color: #5865f2; font-weight: 600;">@${simUsername}</span>`)
      .replace(/{username}/g, simUsername)
      .replace(/{userTag}/g, `${simUsername}#0001`)
      .replace(/{user\.tag}/g, `${simUsername}#0001`)
      .replace(/{userId}/g, '7358129381293812')
      .replace(/{server}/g, 'Rage Optimiser')
      .replace(/{memberCount}/g, simMemberCount.toString())
      .replace(/{date}/g, new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))
      .replace(/{boosts}/g, simBoosts.toString())
      .replace(/{boostTier}/g, simBoosts >= 14 ? '3' : simBoosts >= 7 ? '2' : simBoosts >= 2 ? '1' : '0');
  };

  // Plain text replacement (without HTML tags)
  const resolveSimulatorTextPlain = (text: string) => {
    if (!text) return '';
    return text
      .replace(/{user}/g, `@${simUsername}`)
      .replace(/{username}/g, simUsername)
      .replace(/{userTag}/g, `${simUsername}#0001`)
      .replace(/{user\.tag}/g, `${simUsername}#0001`)
      .replace(/{userId}/g, '7358129381293812')
      .replace(/{server}/g, 'Rage Optimiser')
      .replace(/{memberCount}/g, simMemberCount.toString())
      .replace(/{date}/g, new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))
      .replace(/{boosts}/g, simBoosts.toString())
      .replace(/{boostTier}/g, simBoosts >= 14 ? '3' : simBoosts >= 7 ? '2' : simBoosts >= 2 ? '1' : '0');
  };

  return (
    <div className="welcome-grid">
      {/* ─── COLUMN 1: Settings & Routing Tab Section ────────────────────────── */}
      <div className="card" style={{
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        backgroundColor: '#FFFFFF', border: '1px solid #E4E4E7',
        padding: '20px',
        gap: '16px',
        overflowY: 'auto'
      }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#09090B', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings2 size={18} color="#d4af37" /> Welcome Suite V2
          </h2>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Configure and routing triggers for server member actions.
          </p>
        </div>

        {/* Global Save, Undo & Redo Controls */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
          <button
            type="button"
            onClick={handleSave}
            className="btn btn-primary"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 12px',
              fontSize: '12px'
            }}
          >
            <Save size={14} /> Save Config
          </button>

          <button
            type="button"
            disabled={!canUndo}
            onClick={undo}
            className="btn btn-secondary"
            style={{ padding: '8px', opacity: canUndo ? 1 : 0.4 }}
            title="Undo Edit"
          >
            <Undo2 size={14} />
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={redo}
            className="btn btn-secondary"
            style={{ padding: '8px', opacity: canRedo ? 1 : 0.4 }}
            title="Redo Edit"
          >
            <Redo2 size={14} />
          </button>
        </div>

        {/* Preset Styles Dropdown Selector */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Palette size={14} /> Preset Themes
          </label>
          <select
            onChange={(e) => {
              const selected = STYLING_PRESETS.find(p => p.name === e.target.value);
              if (selected) applyPreset(selected);
            }}
            className="form-control"
            style={{ height: '34px', fontSize: '12px' }}
            defaultValue=""
          >
            <option value="" disabled>Select style template preset...</option>
            {STYLING_PRESETS.map(p => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* Event List Tabs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, marginTop: '8px' }}>
          {[
            { id: 'welcome', label: 'Welcome Message (Join)', icon: Sparkles },
            { id: 'goodbye', label: 'Goodbye Message (Leave)', icon: MessageSquare },
            { id: 'dm', label: 'Direct Message (DM)', icon: Send },
            { id: 'autorole', label: 'Auto-assigned Roles', icon: Settings2 },
            { id: 'boost', label: 'Server Boosts log', icon: Gift },
            { id: 'milestone', label: 'Milestone Trackers', icon: Award },
            { id: 'birthdays', label: 'Birthdays Celebrations', icon: Calendar }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  justifyContent: 'flex-start',
                  padding: '12px 16px',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  borderRadius: '8px',
                  width: '100%',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  backgroundColor: isActive ? 'rgba(212, 175, 55, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                  border: isActive ? '1px solid rgba(212, 175, 55, 0.3)' : '1px solid rgba(255, 255, 255, 0.05)',
                  color: isActive ? '#ffffff' : '#9ca3af',
                  boxShadow: isActive ? '0 0 12px rgba(212, 175, 55, 0.1)' : 'none',
                  fontWeight: isActive ? 700 : 500
                }}
              >
                <Icon size={14} color={isActive ? '#d4af37' : '#9ca3af'} /> {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── COLUMN 2: WYSIWYG Code & Embed Controls Column ─────────────────── */}
      <div className="card" style={{
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        backgroundColor: '#FFFFFF', border: '1px solid #E4E4E7',
        padding: '24px',
        gap: '20px',
        overflowY: 'auto'
      }}>
        {activeTab === 'welcome' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#09090B' }}>Welcome Event Settings</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px' }}>
                <input
                  type="checkbox"
                  checked={config.welcomeEnabled}
                  onChange={(e) => updateConfigVal('welcomeEnabled', e.target.checked)}
                />
                Enable Welcome Messages
              </label>
            </div>

            <ChannelSelect
              label="Welcome Message Destination"
              channels={textChannels}
              selectedChannelId={config.welcomeChannelId}
              onChange={(val) => updateConfigVal('welcomeChannelId', val)}
              helpText="Select the channel where welcome messages and graphic cards will be posted."
            />

            <div className="form-group">
              <label className="form-label">Message Plain Content</label>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                Supports markdown. Type <code>{"{"}</code> to autocomplete variables.
              </span>
              <VariableTextArea
                value={config.welcomeMessage}
                onValueChange={(val) => updateConfigVal('welcomeMessage', val)}
                placeholder="e.g. Welcome {user} to the server!"
              />
            </div>

            {/* Graphic card generator configs */}
            <div style={{
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '16px',
              backgroundColor: 'rgba(255,255,255,0.01)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#d4af37', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ImageIcon size={14} /> Welcome Graphic Card (ImageGenerator)
                </h4>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px' }}>
                  <input
                    type="checkbox"
                    checked={config.welcomeImageEnabled}
                    onChange={(e) => updateConfigVal('welcomeImageEnabled', e.target.checked)}
                  />
                  Enable Graphic Card
                </label>
              </div>

              {config.welcomeImageEnabled && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '11px' }}>Background Style Type</label>
                      <select
                        value={config.welcomeImageSettings.backgroundType}
                        onChange={(e) => updateWelcomeImageSetting('backgroundType', e.target.value)}
                        className="form-control"
                        style={{ height: '30px', fontSize: '11px', padding: '4px' }}
                      >
                        <option value="gradient">CSS Gradient Color</option>
                        <option value="image">Custom Background Image URL</option>
                      </select>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '11px' }}>Background Value (URL / CSS)</label>
                      <input
                        type="text"
                        value={config.welcomeImageSettings.backgroundValue}
                        onChange={(e) => updateWelcomeImageSetting('backgroundValue', e.target.value)}
                        className="form-control"
                        style={{ height: '30px', fontSize: '11px' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '11px' }}>Avatar Style</label>
                      <select
                        value={config.welcomeImageSettings.avatarStyle}
                        onChange={(e) => updateWelcomeImageSetting('avatarStyle', e.target.value)}
                        className="form-control"
                        style={{ height: '30px', fontSize: '11px', padding: '4px' }}
                      >
                        <option value="circle">Circular Avatar</option>
                        <option value="square">Rounded Square</option>
                        <option value="none">No Avatar Display</option>
                      </select>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '11px' }}>Avatar Border Size (px)</label>
                      <input
                        type="number"
                        value={config.welcomeImageSettings.avatarBorderSize}
                        onChange={(e) => updateWelcomeImageSetting('avatarBorderSize', Number(e.target.value))}
                        className="form-control"
                        style={{ height: '30px', fontSize: '11px' }}
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '11px' }}>Avatar Border Color</label>
                      <input
                        type="text"
                        value={config.welcomeImageSettings.avatarBorderColor}
                        onChange={(e) => updateWelcomeImageSetting('avatarBorderColor', e.target.value)}
                        className="form-control"
                        style={{ height: '30px', fontSize: '11px' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '11px' }}>Title Size</label>
                      <input
                        type="number"
                        value={config.welcomeImageSettings.titleSize}
                        onChange={(e) => updateWelcomeImageSetting('titleSize', Number(e.target.value))}
                        className="form-control"
                        style={{ height: '30px', fontSize: '11px' }}
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '11px' }}>Subtitle Size</label>
                      <input
                        type="number"
                        value={config.welcomeImageSettings.subtitleSize}
                        onChange={(e) => updateWelcomeImageSetting('subtitleSize', Number(e.target.value))}
                        className="form-control"
                        style={{ height: '30px', fontSize: '11px' }}
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '11px' }}>Card Font Family</label>
                      <select
                        value={config.welcomeImageSettings.fontFamily}
                        onChange={(e) => updateWelcomeImageSetting('fontFamily', e.target.value)}
                        className="form-control"
                        style={{ height: '30px', fontSize: '11px', padding: '4px' }}
                      >
                        <option value="Outfit">Outfit</option>
                        <option value="Inter">Inter</option>
                        <option value="Share Tech Mono">Share Tech Mono</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '11px' }}>Card Title Template</label>
                      <input
                        type="text"
                        value={config.welcomeImageSettings.titleText}
                        onChange={(e) => updateWelcomeImageSetting('titleText', e.target.value)}
                        className="form-control"
                        style={{ height: '30px', fontSize: '11px' }}
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '11px' }}>Card Subtitle Template</label>
                      <input
                        type="text"
                        value={config.welcomeImageSettings.subtitleText}
                        onChange={(e) => updateWelcomeImageSetting('subtitleText', e.target.value)}
                        className="form-control"
                        style={{ height: '30px', fontSize: '11px' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '20px', marginTop: '4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px' }}>
                      <input
                        type="checkbox"
                        checked={config.welcomeImageSettings.glassmorphism}
                        onChange={(e) => updateWelcomeImageSetting('glassmorphism', e.target.checked)}
                      />
                      Enable Glassmorphic card overlay container
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#09090B' }}>Welcome Custom Embed</h4>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '11px' }}>
                  <input
                    type="checkbox"
                    checked={!!config.welcomeEmbed.enabled}
                    onChange={(e) => pushState({
                      ...config,
                      welcomeEmbed: { ...config.welcomeEmbed, enabled: e.target.checked }
                    })}
                  />
                  Enable Message Embed
                </label>
              </div>

              {config.welcomeEmbed.enabled && (
                <EmbedBuilder
                  value={config.welcomeEmbed}
                  onChange={(val) => pushState({ ...config, welcomeEmbed: val })}
                  titleLabel="Welcome Embed settings"
                  hidePreview={true}
                />
              )}
            </div>
          </div>
        )}

        {activeTab === 'goodbye' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#09090B' }}>Goodbye (Leave) Log Settings</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px' }}>
                <input
                  type="checkbox"
                  checked={config.goodbyeEnabled}
                  onChange={(e) => updateConfigVal('goodbyeEnabled', e.target.checked)}
                />
                Enable Leave Message Logs
              </label>
            </div>

            <ChannelSelect
              label="Leave Log Destination"
              channels={textChannels}
              selectedChannelId={config.goodbyeChannelId}
              onChange={(val) => updateConfigVal('goodbyeChannelId', val)}
              helpText="Select the channel where server departure notifications will be posted."
            />

            <div className="form-group">
              <label className="form-label">Message Content</label>
              <VariableTextArea
                value={config.goodbyeMessage}
                onValueChange={(val) => updateConfigVal('goodbyeMessage', val)}
                placeholder="e.g. Goodbye {username}..."
              />
            </div>

            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#09090B' }}>Goodbye Message Embed</h4>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '11px' }}>
                  <input
                    type="checkbox"
                    checked={!!config.goodbyeEmbed.enabled}
                    onChange={(e) => pushState({
                      ...config,
                      goodbyeEmbed: { ...config.goodbyeEmbed, enabled: e.target.checked }
                    })}
                  />
                  Enable Goodbye Embed
                </label>
              </div>

              {config.goodbyeEmbed.enabled && (
                <EmbedBuilder
                  value={config.goodbyeEmbed}
                  onChange={(val) => pushState({ ...config, goodbyeEmbed: val })}
                  titleLabel="Goodbye Embed details"
                  hidePreview={true}
                />
              )}
            </div>
          </div>
        )}

        {activeTab === 'dm' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#09090B' }}>Welcome Direct Message (DM) Settings</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px' }}>
                <input
                  type="checkbox"
                  checked={config.dmEnabled}
                  onChange={(e) => updateConfigVal('dmEnabled', e.target.checked)}
                />
                Send DM to Joined Members
              </label>
            </div>

            <div className="form-group">
              <label className="form-label">DM Text Message Content</label>
              <VariableTextArea
                value={config.dmMessage}
                onValueChange={(val) => updateConfigVal('dmMessage', val)}
                placeholder="Thank you for joining our community!"
              />
            </div>

            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: 700, color: '#09090B' }}>DM Custom Embed</h4>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '11px' }}>
                  <input
                    type="checkbox"
                    checked={!!config.dmEmbed.enabled}
                    onChange={(e) => pushState({
                      ...config,
                      dmEmbed: { ...config.dmEmbed, enabled: e.target.checked }
                    })}
                  />
                  Enable DM Embed
                </label>
              </div>

              {config.dmEmbed.enabled && (
                <EmbedBuilder
                  value={config.dmEmbed}
                  onChange={(val) => pushState({ ...config, dmEmbed: val })}
                  titleLabel="DM Embed configuration"
                  hidePreview={true}
                />
              )}
            </div>
          </div>
        )}

        {activeTab === 'autorole' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#09090B' }}>Auto-assigned Member Roles</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px' }}>
                <input
                  type="checkbox"
                  checked={config.autoroleEnabled}
                  onChange={(e) => updateConfigVal('autoroleEnabled', e.target.checked)}
                />
                Enable Auto-roles
              </label>
            </div>

            <RoleSelect
              label="Assigned Welcome Roles"
              roles={roles}
              selectedRoleIds={config.autoroleRoleIds || []}
              isMulti={true}
              onChange={(val) => updateConfigVal('autoroleRoleIds', val)}
              helpText="Select roles that will be automatically given to users upon joining the server."
            />

            <div className="form-group">
              <label className="form-label">Auto-role Assignment Delay (seconds)</label>
              <input
                type="number"
                value={config.autoroleDelay}
                onChange={(e) => updateConfigVal('autoroleDelay', Math.max(0, Number(e.target.value)))}
                className="form-control"
                placeholder="e.g. 5"
              />
              <span className="help-text">
                Adding a slight delay helps evade bot-detection mechanisms and avoids server load spikes.
              </span>
            </div>
          </div>
        )}

        {activeTab === 'boost' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#09090B' }}>Server Boosting Event Logs</h3>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Send logs and announcement cards when users boost or unboost your server.
              </p>
            </div>

            {/* Boosting log */}
            <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px', backgroundColor: 'rgba(255,255,255,0.01)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#f47fff' }}>🚀 New Boost Event</h4>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px' }}>
                  <input
                    type="checkbox"
                    checked={config.boostEnabled}
                    onChange={(e) => updateConfigVal('boostEnabled', e.target.checked)}
                  />
                  Enable
                </label>
              </div>

              <ChannelSelect
                label="Destination Channel"
                channels={textChannels}
                selectedChannelId={config.boostChannelId}
                onChange={(val) => updateConfigVal('boostChannelId', val)}
              />

              <div className="form-group" style={{ marginTop: '12px' }}>
                <label className="form-label" style={{ fontSize: '11px' }}>Message Text</label>
                <VariableInput
                  value={config.boostMessage}
                  onValueChange={(val) => updateConfigVal('boostMessage', val)}
                />
              </div>

              {config.boostEnabled && (
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!config.boostEmbed.enabled}
                      onChange={(e) => pushState({
                        ...config,
                        boostEmbed: { ...config.boostEmbed, enabled: e.target.checked }
                      })}
                    />
                    Enable Boost Embed
                  </label>
                  {config.boostEmbed.enabled && (
                    <EmbedBuilder
                      value={config.boostEmbed}
                      onChange={(val) => pushState({ ...config, boostEmbed: val })}
                      titleLabel="Boost Embed configuration"
                      hidePreview={true}
                    />
                  )}
                </div>
              )}
            </div>

            {/* Unboosting log */}
            <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px', backgroundColor: 'rgba(255,255,255,0.01)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h4 style={{ fontSize: '12px', fontWeight: 700, color: '#ff4444' }}>😢 Unboost Event</h4>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11px' }}>
                  <input
                    type="checkbox"
                    checked={config.unboostEnabled}
                    onChange={(e) => updateConfigVal('unboostEnabled', e.target.checked)}
                  />
                  Enable
                </label>
              </div>

              <ChannelSelect
                label="Destination Channel"
                channels={textChannels}
                selectedChannelId={config.unboostChannelId}
                onChange={(val) => updateConfigVal('unboostChannelId', val)}
              />

              <div className="form-group" style={{ marginTop: '12px' }}>
                <label className="form-label" style={{ fontSize: '11px' }}>Message Text</label>
                <VariableInput
                  value={config.unboostMessage}
                  onValueChange={(val) => updateConfigVal('unboostMessage', val)}
                />
              </div>

              {config.unboostEnabled && (
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!config.unboostEmbed.enabled}
                      onChange={(e) => pushState({
                        ...config,
                        unboostEmbed: { ...config.unboostEmbed, enabled: e.target.checked }
                      })}
                    />
                    Enable Unboost Embed
                  </label>
                  {config.unboostEmbed.enabled && (
                    <EmbedBuilder
                      value={config.unboostEmbed}
                      onChange={(val) => pushState({ ...config, unboostEmbed: val })}
                      titleLabel="Unboost Embed configuration"
                      hidePreview={true}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'milestone' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#09090B' }}>Milestone Member Trackers</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px' }}>
                <input
                  type="checkbox"
                  checked={config.milestonesEnabled}
                  onChange={(e) => updateConfigVal('milestonesEnabled', e.target.checked)}
                />
                Enable Announcements
              </label>
            </div>

            <ChannelSelect
              label="Milestone Announcement Channel"
              channels={textChannels}
              selectedChannelId={config.milestonesChannelId}
              onChange={(val) => updateConfigVal('milestonesChannelId', val)}
            />

            <div className="form-group">
              <label className="form-label">Milestone Interval (e.g. every 100 or 500 members)</label>
              <input
                type="number"
                value={config.milestonesInterval}
                onChange={(e) => updateConfigVal('milestonesInterval', Math.max(1, Number(e.target.value)))}
                className="form-control"
                placeholder="e.g. 100"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Milestone plain message text</label>
              <VariableInput
                value={config.milestonesMessage}
                onValueChange={(val) => updateConfigVal('milestonesMessage', val)}
              />
            </div>

            {config.milestonesEnabled && (
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer', marginBottom: '12px' }}>
                  <input
                    type="checkbox"
                    checked={!!config.milestonesEmbed.enabled}
                    onChange={(e) => pushState({
                      ...config,
                      milestonesEmbed: { ...config.milestonesEmbed, enabled: e.target.checked }
                    })}
                  />
                  Enable Milestone Embed
                </label>
                {config.milestonesEmbed.enabled && (
                  <EmbedBuilder
                    value={config.milestonesEmbed}
                    onChange={(val) => pushState({ ...config, milestonesEmbed: val })}
                    titleLabel="Milestone Embed details"
                    hidePreview={true}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'birthdays' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#09090B' }}>Daily Birthday Celebrations</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px' }}>
                <input
                  type="checkbox"
                  checked={config.birthdaysEnabled}
                  onChange={(e) => updateConfigVal('birthdaysEnabled', e.target.checked)}
                />
                Enable Announcements
              </label>
            </div>

            <ChannelSelect
              label="Birthday Celebrations Destination Channel"
              channels={textChannels}
              selectedChannelId={config.birthdaysChannelId}
              onChange={(val) => updateConfigVal('birthdaysChannelId', val)}
            />

            <div className="form-group">
              <label className="form-label">Celebration message text</label>
              <VariableInput
                value={config.birthdaysMessage}
                onValueChange={(val) => updateConfigVal('birthdaysMessage', val)}
              />
            </div>

            {config.birthdaysEnabled && (
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer', marginBottom: '12px' }}>
                  <input
                    type="checkbox"
                    checked={!!config.birthdaysEmbed.enabled}
                    onChange={(e) => pushState({
                      ...config,
                      birthdaysEmbed: { ...config.birthdaysEmbed, enabled: e.target.checked }
                    })}
                  />
                  Enable Birthday Embed
                </label>
                {config.birthdaysEmbed.enabled && (
                  <EmbedBuilder
                    value={config.birthdaysEmbed}
                    onChange={(val) => pushState({ ...config, birthdaysEmbed: val })}
                    titleLabel="Birthday Embed details"
                    hidePreview={true}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── COLUMN 3: Visual Live Discord Preview / Simulator Viewport ────── */}
      <div className="card" style={{
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid var(--border-color)',
        borderRadius: '12px',
        backgroundColor: '#2b2d31', // Standard dark Discord chat background
        padding: '20px',
        gap: '16px',
        overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '12px' }}>
          <h4 style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Eye size={12} /> Live Simulator Viewport
          </h4>
          <span style={{ fontSize: '10px', color: '#57f287', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#57f287' }} /> Mock State
          </span>
        </div>

        {/* Live Simulator State Controllers */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px',
          padding: '10px',
          backgroundColor: 'rgba(0,0,0,0.15)',
          borderRadius: '8px',
          border: '1px solid rgba(255,255,255,0.03)'
        }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '10px' }}>Username</label>
            <input
              type="text"
              value={simUsername}
              onChange={(e) => setSimUsername(e.target.value)}
              className="form-control"
              style={{ height: '26px', fontSize: '11px', padding: '2px 6px' }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '10px' }}>Member Count</label>
            <input
              type="number"
              value={simMemberCount}
              onChange={(e) => setSimMemberCount(Number(e.target.value))}
              className="form-control"
              style={{ height: '26px', fontSize: '11px', padding: '2px 6px' }}
            />
          </div>
        </div>

        {/* Live Discord Message Client Emulator */}
        <div style={{
          display: 'flex',
          gap: '14px',
          fontFamily: "'GG Sans', 'Helvetica Neue', Arial, sans-serif"
        }}>
          {/* Mock Client Avatar */}
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            backgroundColor: '#d4af37',
            backgroundImage: 'url("https://cdn.discordapp.com/embed/avatars/0.png")',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            flexShrink: 0
          }} />

          {/* Discord Message details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: 0 }}>
            {/* Header info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff' }}>Rage Optimiser</span>
              <span style={{
                backgroundColor: '#5865f2',
                color: '#09090B',
                fontSize: '9px',
                fontWeight: 700,
                padding: '1px 4px',
                borderRadius: '3px',
                textTransform: 'uppercase'
              }}>BOT</span>
              <span style={{ fontSize: '11px', color: '#949ba4', marginLeft: '4px' }}>Today at 12:00 PM</span>
            </div>

            {/* Custom Plain Text Message body */}
            {activeTab === 'welcome' && config.welcomeMessage && (
              <div
                style={{ fontSize: '14px', color: '#dbdee1', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}
                dangerouslySetInnerHTML={{ __html: resolveSimulatorText(config.welcomeMessage) }}
              />
            )}
            {activeTab === 'goodbye' && config.goodbyeMessage && (
              <div
                style={{ fontSize: '14px', color: '#dbdee1', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}
                dangerouslySetInnerHTML={{ __html: resolveSimulatorText(config.goodbyeMessage) }}
              />
            )}
            {activeTab === 'dm' && config.dmMessage && (
              <div
                style={{ fontSize: '14px', color: '#dbdee1', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}
                dangerouslySetInnerHTML={{ __html: resolveSimulatorText(config.dmMessage) }}
              />
            )}
            {activeTab === 'boost' && config.boostMessage && (
              <div
                style={{ fontSize: '14px', color: '#dbdee1', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}
                dangerouslySetInnerHTML={{ __html: resolveSimulatorText(config.boostMessage) }}
              />
            )}
            {activeTab === 'milestone' && config.milestonesMessage && (
              <div
                style={{ fontSize: '14px', color: '#dbdee1', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}
                dangerouslySetInnerHTML={{ __html: resolveSimulatorText(config.milestonesMessage) }}
              />
            )}
            {activeTab === 'birthdays' && config.birthdaysMessage && (
              <div
                style={{ fontSize: '14px', color: '#dbdee1', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}
                dangerouslySetInnerHTML={{ __html: resolveSimulatorText(config.birthdaysMessage) }}
              />
            )}

            {/* Welcome Graphic Card live mock renderer */}
            {activeTab === 'welcome' && config.welcomeImageEnabled && (
              <div style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '800 / 350',
                borderRadius: '8px',
                overflow: 'hidden',
                marginTop: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: config.welcomeImageSettings.backgroundType === 'gradient'
                  ? config.welcomeImageSettings.backgroundValue
                  : `url(${config.welcomeImageSettings.backgroundValue}) center/cover no-repeat`
              }}>
                <div style={{
                  width: 'calc(100% - 20px)',
                  height: 'calc(100% - 20px)',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 20px',
                  position: 'relative',
                  overflow: 'hidden',
                  ...(config.welcomeImageSettings.glassmorphism ? {
                    background: 'rgba(10, 10, 10, 0.55)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    border: '1px solid rgba(212, 175, 55, 0.15)'
                  } : {
                    border: '1px solid rgba(255, 255, 255, 0.05)'
                  })
                }}>
                  {config.welcomeImageSettings.avatarStyle !== 'none' && (
                    <div style={{ marginRight: '16px', display: 'flex', alignItems: 'center' }}>
                      <div style={{
                        width: '70px',
                        height: '70px',
                        backgroundColor: '#232428',
                        backgroundImage: 'url("https://cdn.discordapp.com/embed/avatars/0.png")',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        border: `${config.welcomeImageSettings.avatarBorderSize / 2}px solid ${config.welcomeImageSettings.avatarBorderColor}`,
                        borderRadius: config.welcomeImageSettings.avatarStyle === 'circle' ? '50%' : '8px',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)'
                      }} />
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontFamily: config.welcomeImageSettings.fontFamily === 'Share Tech Mono' ? 'Share Tech Mono' : 'inherit',
                      fontSize: `${config.welcomeImageSettings.titleSize / 2}px`,
                      fontWeight: 800,
                      color: config.welcomeImageSettings.titleColor,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {resolveSimulatorTextPlain(config.welcomeImageSettings.titleText)}
                    </div>
                    <div style={{
                      fontFamily: config.welcomeImageSettings.fontFamily === 'Share Tech Mono' ? 'Share Tech Mono' : 'inherit',
                      fontSize: `${config.welcomeImageSettings.subtitleSize / 2}px`,
                      fontWeight: 500,
                      color: config.welcomeImageSettings.subtitleColor,
                      marginTop: '2px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {resolveSimulatorTextPlain(config.welcomeImageSettings.subtitleText)}
                    </div>
                    <div style={{
                      fontFamily: config.welcomeImageSettings.fontFamily === 'Share Tech Mono' ? 'Share Tech Mono' : 'inherit',
                      fontSize: `${config.welcomeImageSettings.footerSize / 2}px`,
                      fontWeight: 600,
                      color: config.welcomeImageSettings.footerColor,
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      marginTop: '6px'
                    }}>
                      {resolveSimulatorTextPlain(config.welcomeImageSettings.footerText)}
                    </div>
                  </div>
                  <div style={{
                    position: 'absolute',
                    bottom: '8px',
                    right: '10px',
                    fontSize: '6px',
                    color: 'rgba(255, 255, 255, 0.15)',
                    fontFamily: 'monospace'
                  }}>POWERED BY RAGE OPTIMISER</div>
                </div>
              </div>
            )}

            {/* Custom Embed live mock renderer */}
            {activeTab === 'welcome' && config.welcomeEmbed.enabled && (
              <MockEmbedCard embed={config.welcomeEmbed} resolve={resolveSimulatorTextPlain} />
            )}
            {activeTab === 'goodbye' && config.goodbyeEmbed.enabled && (
              <MockEmbedCard embed={config.goodbyeEmbed} resolve={resolveSimulatorTextPlain} />
            )}
            {activeTab === 'dm' && config.dmEmbed.enabled && (
              <MockEmbedCard embed={config.dmEmbed} resolve={resolveSimulatorTextPlain} />
            )}
            {activeTab === 'boost' && config.boostEmbed.enabled && (
              <MockEmbedCard embed={config.boostEmbed} resolve={resolveSimulatorTextPlain} />
            )}
            {activeTab === 'milestone' && config.milestonesEmbed.enabled && (
              <MockEmbedCard embed={config.milestonesEmbed} resolve={resolveSimulatorTextPlain} />
            )}
            {activeTab === 'birthdays' && config.birthdaysEmbed.enabled && (
              <MockEmbedCard embed={config.birthdaysEmbed} resolve={resolveSimulatorTextPlain} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tiny Embed Component for Live Discord Preview Simulator ─────────────────
function MockEmbedCard({ embed, resolve }: { embed: EmbedData; resolve: (t: string) => string }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#2b2d31',
      borderLeft: `4px solid ${embed.color || '#d4af37'}`,
      borderRadius: '4px',
      padding: '12px 16px',
      maxWidth: '520px',
      gap: '8px',
      marginTop: '6px',
      position: 'relative'
    }}>
      {embed.thumbnailUrl && (
        <img
          src={embed.thumbnailUrl}
          alt=""
          style={{
            position: 'absolute',
            top: '12px',
            right: '16px',
            width: '60px',
            height: '60px',
            borderRadius: '4px',
            objectFit: 'cover'
          }}
          onError={e => e.currentTarget.style.display = 'none'}
        />
      )}

      {embed.author && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {embed.authorIcon && (
            <img
              src={embed.authorIcon}
              alt=""
              style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover' }}
              onError={e => e.currentTarget.style.display = 'none'}
            />
          )}
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#ffffff' }}>
            {resolve(embed.author)}
          </span>
        </div>
      )}

      {embed.title && (
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>
          {resolve(embed.title)}
        </div>
      )}

      {embed.description && (
        <div style={{ fontSize: '13px', color: '#dbdee1', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
          {resolve(embed.description)}
        </div>
      )}

      {embed.fields && embed.fields.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
          marginTop: '4px'
        }}>
          {embed.fields.map((f, idx) => (
            <div
              key={idx}
              style={{
                gridColumn: f.inline ? 'span 1' : 'span 3',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px'
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#ffffff' }}>
                {resolve(f.name)}
              </div>
              <div style={{ fontSize: '12px', color: '#dbdee1' }}>
                {resolve(f.value)}
              </div>
            </div>
          ))}
        </div>
      )}

      {embed.imageUrl && (
        <img
          src={embed.imageUrl}
          alt=""
          style={{
            maxWidth: '100%',
            borderRadius: '4px',
            marginTop: '4px',
            maxHeight: '200px',
            objectFit: 'contain',
            backgroundColor: '#1e1f22'
          }}
          onError={e => e.currentTarget.style.display = 'none'}
        />
      )}

      {embed.showAvatar && (
        <div style={{
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          border: `2px solid ${embed.color || '#d4af37'}`,
          backgroundColor: '#1e1f22',
          backgroundImage: 'url("https://cdn.discordapp.com/embed/avatars/0.png")',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          marginTop: '6px'
        }} />
      )}

      {(embed.footer || embed.timestamp) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
          {embed.footerIcon && (
            <img
              src={embed.footerIcon}
              alt=""
              style={{ width: '16px', height: '16px', borderRadius: '50%', objectFit: 'cover' }}
              onError={e => e.currentTarget.style.display = 'none'}
            />
          )}
          <span style={{ fontSize: '11px', color: '#949ba4', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {embed.footer ? resolve(embed.footer) : ''}
            {embed.footer && embed.timestamp && <span>•</span>}
            {embed.timestamp ? 'Today at 12:00 PM' : ''}
          </span>
        </div>
      )}
    </div>
  );
}
