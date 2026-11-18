import React, { useState } from 'react';
import {
  Shield, Settings, ShieldCheck, Save, ChevronDown, ChevronUp, Check, Zap,
  AlertTriangle, Lock, Users, Radio, RefreshCw, Layers, Hash, Bot, Search
} from 'lucide-react';
import type { ModuleState, DiscordRole, DiscordChannel } from '../hooks/useDiscordSync';
import { RoleSelect, ChannelSelect } from '../components/ResourceSelectors';

interface AntiNukeProps {
  onSaveConfig: (msg: string) => void;
  modules: ModuleState[];
  registry: { roles: DiscordRole[]; channels: DiscordChannel[] };
  onUpdateConfig: (moduleId: string, config: Record<string, any>, enabledOverride?: boolean) => void;
}

interface RuleItem {
  key: string;
  name: string;
  desc: string;
}

interface CategoryGroup {
  id: string;
  name: string;
  desc: string;
  icon: React.ReactNode;
  color: string;
  rulesList: RuleItem[];
}

export const ANTINUKE_CATEGORIES: CategoryGroup[] = [
  {
    id: 'group_roles',
    name: 'Role Protections (5 Rules)',
    desc: 'Guards against unauthorized role creations, mass deletions, permission elevations, role grants, and role stripping.',
    icon: <Layers size={18} color="#F59E0B" />,
    color: '#F59E0B',
    rulesList: [
      { key: 'anti_role_grant', name: 'Anti-Role Grant & Elevation', desc: 'Blocks unauthorized assignment of administrative or elevated roles to members' },
      { key: 'anti_role_remove', name: 'Anti-Role Revoke & Stripping', desc: 'Prevents rogue administrators from stripping protection roles from staff' },
      { key: 'anti_role_update', name: 'Anti-Role Permission Modification', desc: 'Intercepts and reverts dangerous permission modifications on existing roles' },
      { key: 'anti_role_create', name: 'Anti-Role Spam Creation', desc: 'Blocks mass role creation attacks intended to exhaust server limits' },
      { key: 'anti_role_delete', name: 'Anti-Role Mass Deletion', desc: 'Instantly rolls back and recovers deleted server roles and permissions' }
    ]
  },
  {
    id: 'group_channels',
    name: 'Channel Protections (3 Rules)',
    desc: 'Prevents mass channel deletion, spam channel provisioning, and malicious permission overwrite manipulation.',
    icon: <Hash size={18} color="#3B82F6" />,
    color: '#3B82F6',
    rulesList: [
      { key: 'anti_channel_create', name: 'Anti-Channel Spam Creation', desc: 'Suppresses mass channel flood attacks and restores original structure' },
      { key: 'anti_channel_delete', name: 'Anti-Channel Mass Deletion', desc: 'Instantly recreates deleted channels and restores category hierarchies & permissions' },
      { key: 'anti_channel_update', name: 'Anti-Channel Renaming & Overwrite', desc: 'Reverts unauthorized channel renaming, NSFW toggling, and permission overrides' }
    ]
  },
  {
    id: 'group_members',
    name: 'Member & Mod Protections (7 Rules)',
    desc: 'Defense matrix against mass bans, rogue kicks, timeout spam, unwhitelisted bots, and mass member pruning.',
    icon: <Shield size={18} color="#10B981" />,
    color: '#10B981',
    rulesList: [
      { key: 'anti_ban', name: 'Anti-Mass Ban Interceptor', desc: 'Instantly revokes bans issued by unauthorized administrators and kicks the offender' },
      { key: 'anti_member_unban', name: 'Anti-Unauthorized Member Unban', desc: 'Re-bans blacklisted users if unbanned without Server Owner clearance' },
      { key: 'anti_kick', name: 'Anti-Mass Kick Interceptor', desc: 'Neutralizes compromised moderators attempting to mass-kick community members' },
      { key: 'anti_timeout', name: 'Anti-Timeout Abuse Shield', desc: 'Prevents abusive moderators from mass-timing-out server members' },
      { key: 'anti_bot_add', name: 'PreBot Whitelist & Rogue Bot Quarantine', desc: 'Instantly kicks unauthorized bots invited without Server Owner ID verification' },
      { key: 'anti_bot_remove', name: 'Anti-Bot Removal Shield', desc: 'Detects and alerts on unauthorized kicking or banning of verified bot instances' },
      { key: 'anti_prune', name: 'Anti-Mass Member Pruning', desc: 'Blocks mass inactive member pruning operations' }
    ]
  },
  {
    id: 'group_server',
    name: 'Server & Asset Protections (12 Rules)',
    desc: 'Full-spectrum protection covering webhooks, guild settings, emojis, stickers, vanity URLs, and integrations.',
    icon: <Zap size={18} color="#8B5CF6" />,
    color: '#8B5CF6',
    rulesList: [
      { key: 'anti_webhook_create', name: 'Anti-Rogue Webhook Creation', desc: 'Instantly deletes unauthorized webhooks created to bypass chat filters' },
      { key: 'anti_webhook_delete', name: 'Anti-Webhook Deletion Shield', desc: 'Monitors and protects critical logging and announcement webhooks' },
      { key: 'anti_webhook_update', name: 'Anti-Webhook Modification Shield', desc: 'Flags and blocks webhook avatar, name, or token adjustments' },
      { key: 'anti_guild_update', name: 'Anti-Server Settings & Vanity Hijack', desc: 'Restores server name, icon, banner, and vanity URL if maliciously modified' },
      { key: 'anti_integration', name: 'Anti-Unauthorized Bot Integrations', desc: 'Blocks malicious external bot integrations and OAuth applications' },
      { key: 'anti_invite_create', name: 'Anti-Unauthorized Server Invites', desc: 'Restricts invite creation to whitelisted roles and revokes unauthorized vanity invites' },
      { key: 'anti_emoji_create', name: 'Anti-Emoji Spam Creation', desc: 'Blocks mass emoji creation floods that exhaust server asset slots' },
      { key: 'anti_emoji_delete', name: 'Anti-Emoji Mass Deletion', desc: 'Protects server branding by preventing mass emoji wiping' },
      { key: 'anti_emoji_update', name: 'Anti-Emoji Rename & Tampering', desc: 'Flags rapid emoji property and name tampering' },
      { key: 'anti_sticker_create', name: 'Anti-Sticker Spam Creation', desc: 'Blocks unauthorized sticker upload spikes' },
      { key: 'anti_sticker_delete', name: 'Anti-Sticker Mass Deletion', desc: 'Protects server sticker packs from being maliciously cleared' },
      { key: 'anti_sticker_update', name: 'Anti-Sticker Modification', desc: 'Blocks unauthorized edits to server stickers' }
    ]
  }
];

export function AntiNuke({ onSaveConfig, modules, registry, onUpdateConfig }: AntiNukeProps) {
  const secModule = (modules || []).find(m => m.id === 'security');
  const config = secModule?.config || {};
  const rules = config.rules || {};
  const isMasterEnabled = config.antiNukeEnabled !== false;

  const quarantineRoleId = config.quarantineRoleId || '';
  const alertChannelId = config.alertChannelId || config.logChannelId || '';
  const defaultAction = (config.defaultPunishment || 'quarantine').toLowerCase();

  const [activeCategory, setActiveCategory] = useState<string | null>('group_roles');
  const [search, setSearch] = useState('');

  // Calculate statistics
  const allRuleKeys = ANTINUKE_CATEGORIES.flatMap(c => c.rulesList.map(r => r.key));
  const totalRules = allRuleKeys.length; // 27
  const enabledCount = allRuleKeys.filter(k => (rules[k]?.enabled !== false) && isMasterEnabled).length;

  const handleToggleMaster = () => {
    const next = !isMasterEnabled;
    onUpdateConfig('security', { ...config, antiNukeEnabled: next });
    onSaveConfig(`Anti-Nuke Master Defense ${next ? 'ARMED & ACTIVE' : 'DISABLED'}.`);
  };

  const handleArmAll27 = () => {
    const updatedRules: Record<string, any> = { ...rules };
    allRuleKeys.forEach(k => {
      updatedRules[k] = {
        limit: 1,
        window: 1,
        action: defaultAction,
        recovery: true,
        ...(updatedRules[k] || {}),
        enabled: true
      };
    });
    onUpdateConfig('security', { ...config, antiNukeEnabled: true, rules: updatedRules });
    onSaveConfig('All 27 Anti-Nuke rules ARMED with Zero-Tolerance 1/1 Threshold & Auto-Rollback.');
  };

  const handleToggleRule = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const existing = rules[key] || { enabled: true, limit: 1, window: 1, action: defaultAction, recovery: true };
    const updated = {
      ...rules,
      [key]: {
        ...existing,
        enabled: !existing.enabled
      }
    };
    onUpdateConfig('security', { rules: updated });
    onSaveConfig(`Anti-Nuke rule "${key.replace('anti_', '').toUpperCase()}" ${!existing.enabled ? 'ENABLED' : 'DISABLED'}.`);
  };

  const handleUpdateGlobalAction = (act: string) => {
    const updatedRules: Record<string, any> = { ...rules };
    allRuleKeys.forEach(k => {
      if (updatedRules[k]) {
        updatedRules[k] = { ...updatedRules[k], action: act };
      }
    });
    onUpdateConfig('security', { ...config, defaultPunishment: act, rules: updatedRules });
    onSaveConfig(`Global Threat Action Policy updated to ${act.toUpperCase()}.`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Top Hero Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(15, 23, 42, 0.95) 100%)',
        border: '1px solid rgba(16, 185, 129, 0.3)',
        borderRadius: '16px',
        padding: '24px 28px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '20px',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.4)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div style={{
            width: '54px', height: '54px', borderRadius: '14px',
            background: isMasterEnabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
            border: `1px solid ${isMasterEnabled ? '#10B981' : '#EF4444'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: isMasterEnabled ? '#34D399' : '#F87171'
          }}>
            <ShieldCheck size={28} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#F8FAFC', margin: 0 }}>
                Enterprise Anti-Nuke Defense Suite
              </h1>
              <span style={{
                fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px',
                background: isMasterEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: isMasterEnabled ? '#34D399' : '#F87171',
                border: `1px solid ${isMasterEnabled ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`
              }}>
                {isMasterEnabled ? 'SYSTEM ARMED & ACTIVE' : 'SYSTEM OFFLINE / STANDBY'}
              </span>
            </div>
            <p style={{ fontSize: '13px', color: '#94A3B8', margin: '4px 0 0' }}>
              Zero-tolerance state restoration engine. Actively monitoring 27 critical Discord vectors with instant audit rollbacks.
            </p>
          </div>
        </div>

        {/* Master Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={handleArmAll27}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 18px', borderRadius: '10px',
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              border: 'none', color: '#FFFFFF', fontSize: '13px', fontWeight: 700,
              cursor: 'pointer', boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)'
            }}
          >
            <Zap size={15} /> Arm All 27 Rules
          </button>

          <button
            onClick={handleToggleMaster}
            style={{
              padding: '10px 18px', borderRadius: '10px',
              background: isMasterEnabled ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
              border: `1px solid ${isMasterEnabled ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
              color: isMasterEnabled ? '#F87171' : '#34D399',
              fontSize: '13px', fontWeight: 700, cursor: 'pointer'
            }}
          >
            {isMasterEnabled ? 'Disarm Master Engine' : 'Enable Master Engine'}
          </button>
        </div>
      </div>

      {/* Global Defense Controls Grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px'
      }}>
        {/* Global Action Policy */}
        <div style={{
          background: '#FFFFFF', border: '1px solid #E4E4E8',
          borderRadius: '12px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '10px',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#09090B', fontWeight: 700, fontSize: '13.5px' }}>
            <Lock size={16} color="#09090B" /> Default Threat Enforcement Action
          </div>
          <div style={{ fontSize: '12px', color: '#71717A' }}>
            Action automatically executed on any unwhitelisted administrator who triggers an unauthorized action:
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            {['quarantine', 'kick', 'ban'].map((act) => (
              <button
                key={act}
                onClick={() => handleUpdateGlobalAction(act)}
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: '8px',
                  background: defaultAction === act ? (act === 'quarantine' ? '#FEF2F2' : act === 'ban' ? '#09090B' : '#FEF3C7') : '#F4F4F5',
                  border: `1px solid ${defaultAction === act ? (act === 'quarantine' ? '#FECACA' : act === 'ban' ? '#09090B' : '#FDE68A') : '#E4E4E8'}`,
                  color: defaultAction === act ? (act === 'quarantine' ? '#DC2626' : act === 'ban' ? '#FFFFFF' : '#B45309') : '#52525B',
                  fontSize: '12px', fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase'
                }}
              >
                {act}
              </button>
            ))}
          </div>
        </div>

        {/* Quarantine Role */}
        <div style={{
          background: '#FFFFFF', border: '1px solid #E4E4E8',
          borderRadius: '12px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '10px',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#09090B', fontWeight: 700, fontSize: '13.5px' }}>
            <Users size={16} color="#DC2626" /> Isolation Quarantine Role
          </div>
          <div style={{ fontSize: '12px', color: '#71717A' }}>
            Offenders with action set to Quarantine will have roles stripped and receive this role:
          </div>
          <RoleSelect
            roles={registry.roles}
            value={quarantineRoleId}
            onChange={(roleId) => {
              onUpdateConfig('security', { ...config, quarantineRoleId: roleId });
              onSaveConfig('Quarantine role updated.');
            }}
            placeholder="Select a quarantine role..."
          />
        </div>

        {/* Alert Log Channel */}
        <div style={{
          background: '#FFFFFF', border: '1px solid #E4E4E8',
          borderRadius: '12px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '10px',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#09090B', fontWeight: 700, fontSize: '13.5px' }}>
            <Radio size={16} color="#09090B" /> Security Incident Dispatch Channel
          </div>
          <div style={{ fontSize: '12px', color: '#71717A' }}>
            Real-time attack reports, rollback summaries, and intruder audits will be posted here:
          </div>
          <ChannelSelect
            channels={registry.channels}
            value={alertChannelId}
            onChange={(chanId) => {
              onUpdateConfig('security', { ...config, alertChannelId: chanId, logChannelId: chanId });
              onSaveConfig('Security alert channel updated.');
            }}
            placeholder="Select a logging channel..."
          />
        </div>
      </div>

      {/* Category Tabs & Search Bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '12px'
      }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {ANTINUKE_CATEGORIES.map(cat => {
            const isActive = activeCategory === cat.id;
            const count = cat.rulesList.filter(r => (rules[r.key]?.enabled !== false) && isMasterEnabled).length;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '9px 16px', borderRadius: '10px',
                  background: isActive ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                  border: `1px solid ${isActive ? 'rgba(16, 185, 129, 0.4)' : 'transparent'}`,
                  color: isActive ? '#34D399' : '#94A3B8',
                  fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {cat.icon}
                <span>{cat.name}</span>
                <span style={{
                  fontSize: '11px', padding: '2px 7px', borderRadius: '12px',
                  background: isActive ? '#10B981' : 'rgba(255, 255, 255, 0.08)',
                  color: isActive ? '#FFFFFF' : '#94A3B8'
                }}>
                  {count}/{cat.rulesList.length}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ position: 'relative', width: 240 }}>
          <Search size={14} color="#64748B" style={{ position: 'absolute', left: 12, top: 11 }} />
          <input
            type="text"
            placeholder="Filter 27 rules..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px 8px 34px', borderRadius: '8px',
              background: '#FFFFFF', border: '1px solid #E4E4E8',
              color: '#09090B', fontSize: '12.5px', outline: 'none'
            }}
          />
        </div>
      </div>

      {/* Rules Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {ANTINUKE_CATEGORIES.filter(c => !activeCategory || c.id === activeCategory).map(cat => {
          const visibleRules = cat.rulesList.filter(r => 
            r.name.toLowerCase().includes(search.toLowerCase()) || 
            r.key.toLowerCase().includes(search.toLowerCase()) ||
            r.desc.toLowerCase().includes(search.toLowerCase())
          );

          if (visibleRules.length === 0) return null;

          return (
            <div key={cat.id} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: 800, color: '#09090B' }}>{cat.name}</span>
                <span style={{ fontSize: '12px', color: '#71717A' }}>— {cat.desc}</span>
              </div>

              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '14px'
              }}>
                {visibleRules.map(rule => {
                  const ruleConfig = rules[rule.key] || { enabled: true, limit: 1, window: 1, action: defaultAction, recovery: true };
                  const isEnabled = (ruleConfig.enabled !== false) && isMasterEnabled;
                  const ruleAction = (ruleConfig.action || defaultAction).toUpperCase();

                  return (
                    <div
                      key={rule.key}
                      style={{
                        background: '#FFFFFF',
                        border: `1px solid ${isEnabled ? '#E4E4E8' : '#F4F4F5'}`,
                        borderLeft: isEnabled ? '3px solid #09090B' : '3px solid #E4E4E8',
                        borderRadius: '12px', padding: '18px',
                        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                        gap: '14px', boxShadow: 'var(--shadow-sm)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#09090B' }}>
                            {rule.name}
                          </div>
                          <div style={{ fontSize: '11px', color: '#71717A', fontFamily: 'monospace', marginTop: '2px' }}>
                            {rule.key}
                          </div>
                          <p style={{ fontSize: '12px', color: '#52525B', margin: '8px 0 0', lineHeight: 1.5 }}>
                            {rule.desc}
                          </p>
                        </div>

                        {/* Toggle switch */}
                        <button
                          onClick={(e) => handleToggleRule(rule.key, e)}
                          style={{
                            width: '46px', height: '26px', borderRadius: '14px',
                            background: isEnabled ? '#10B981' : 'rgba(255, 255, 255, 0.1)',
                            border: 'none', position: 'relative', cursor: 'pointer', flexShrink: 0,
                            transition: 'background 0.2s ease'
                          }}
                        >
                          <div style={{
                            width: '20px', height: '20px', borderRadius: '50%',
                            background: '#FFFFFF', position: 'absolute', top: '3px',
                            left: isEnabled ? '23px' : '3px',
                            transition: 'left 0.2s ease'
                          }} />
                        </button>
                      </div>

                      {/* Rule Footer Info */}
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        paddingTop: '10px', borderTop: '1px solid #F4F4F5',
                        fontSize: '11.5px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#059669', fontWeight: 600 }}>
                          <Check size={13} /> Strict: 1 Incident / Instant Revert
                        </div>
                        <div style={{
                          padding: '2px 8px', borderRadius: '6px',
                          background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA', fontWeight: 700,
                          textTransform: 'uppercase', fontSize: '10.5px'
                        }}>
                          Action: {ruleAction}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
