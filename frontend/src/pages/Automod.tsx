import React, { useState } from 'react';
import {
  Bot, Shield, Plus, X, Link, Type, Save, Hash, ShieldCheck,
  AlertTriangle, AtSign, Clock, FileWarning, Copy, Smile, Check, Zap, Lock
} from 'lucide-react';
import type { ModuleState, DiscordResourceRegistry } from '../hooks/useDiscordSync';
import { RoleSelect, ChannelSelect } from '../components/ResourceSelectors';

interface AutomodProps {
  onSaveConfig: (msg: string) => void;
  modules: ModuleState[];
  registry: DiscordResourceRegistry;
  onUpdateConfig: (moduleId: string, config: Record<string, any>, enabled?: boolean) => void;
}

export function Automod({ onSaveConfig, modules, registry, onUpdateConfig }: AutomodProps) {
  const amModule = (modules || []).find(m => m.id === 'automod') || { status: 'enabled', config: {} as any };
  const config: Record<string, any> = amModule.config || {};
  const isEnabled = amModule.status !== 'disabled' && config.autoModEnabled !== false;

  const [newWord, setNewWord] = useState('');
  const [selectedChannelToAdd, setSelectedChannelToAdd] = useState('');
  const [selectedRoleToAdd, setSelectedRoleToAdd] = useState('');

  const handleToggleMaster = () => {
    const next = !isEnabled;
    onUpdateConfig('automod', { ...config, autoModEnabled: next }, next);
    onSaveConfig(`AutoMod Master Engine ${next ? 'ENABLED' : 'DISABLED'}.`);
  };

  const handleUpdate = (updates: Record<string, any>) => {
    onUpdateConfig('automod', { ...config, ...updates });
  };

  // Anti-Everyone & Anti-Here (Single-Switch)
  const isAntiEveryone = config.antiEveryoneEnabled !== false;
  const antiEveryoneAction = (config.antiEveryoneAction || config.punishment || 'timeout').toLowerCase();

  // Anti-Link
  const isAntiLink = config.blockLinks !== false && config.antiLinkEnabled !== false;
  const linkLimit = typeof config.antiLinkLimit === 'number' && config.antiLinkLimit > 0 ? config.antiLinkLimit : (config.limit || 5);
  const linkPunishment = (config.punishment || 'warn').toLowerCase();
  const allowInvites = Boolean(config.allowInvites);

  // Anti-Spam
  const isAntiSpam = Boolean(config.antiSpamEnabled);
  const maxSpam = config.maxMessages || config.maxSpamMessages || 5;
  const spamWindow = config.windowSeconds || config.spamWindowSeconds || 5;
  const spamAction = (config.spamAction || 'mute').toLowerCase();

  // Media & Advanced Content Filters
  const isAttachmentFilter = config.attachmentFilterEnabled !== false;
  const isDuplicateFilter = config.duplicateFilterEnabled !== false;
  const isCapsFilter = Boolean(config.preventCapsSpam);
  const maxCaps = config.maxCapsPercent || 70;
  const isEmojiFilter = Boolean(config.emojiSpamEnabled);
  const maxEmojis = config.maxEmojis || 10;

  // Blacklist
  const badWords: string[] = config.badWords || [];
  const ignoredChannels: string[] = config.ignoredChannels || [];
  const ignoredRoles: string[] = config.ignoredRoles || [];

  const handleAddWord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWord.trim()) return;
    const lower = newWord.trim().toLowerCase();
    if (!badWords.includes(lower)) {
      handleUpdate({ badWords: [...badWords, lower] });
      onSaveConfig(`Added "${lower}" to Word Blacklist.`);
    }
    setNewWord('');
  };

  const handleRemoveWord = (word: string) => {
    handleUpdate({ badWords: badWords.filter((w: string) => w !== word) });
    onSaveConfig(`Removed "${word}" from Word Blacklist.`);
  };

  const handleAddChannel = () => {
    if (!selectedChannelToAdd || ignoredChannels.includes(selectedChannelToAdd)) return;
    handleUpdate({ ignoredChannels: [...ignoredChannels, selectedChannelToAdd] });
    onSaveConfig('Added channel to AutoMod whitelist.');
    setSelectedChannelToAdd('');
  };

  const handleRemoveChannel = (channelId: string) => {
    handleUpdate({ ignoredChannels: ignoredChannels.filter((id: string) => id !== channelId) });
    onSaveConfig('Removed channel from AutoMod whitelist.');
  };

  const handleAddRole = () => {
    if (!selectedRoleToAdd || ignoredRoles.includes(selectedRoleToAdd)) return;
    handleUpdate({ ignoredRoles: [...ignoredRoles, selectedRoleToAdd] });
    onSaveConfig('Added role to AutoMod whitelist.');
    setSelectedRoleToAdd('');
  };

  const handleRemoveRole = (roleId: string) => {
    handleUpdate({ ignoredRoles: ignoredRoles.filter((id: string) => id !== roleId) });
    onSaveConfig('Removed role from AutoMod whitelist.');
  };

  const serverRoles = registry.roles || [];
  const serverChannels = registry.channels || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Top Hero Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(15, 23, 42, 0.95) 100%)',
        border: '1px solid rgba(59, 130, 246, 0.3)',
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
            background: isEnabled ? 'rgba(59, 130, 246, 0.2)' : 'rgba(239, 68, 68, 0.2)',
            border: `1px solid ${isEnabled ? '#3B82F6' : '#EF4444'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: isEnabled ? '#60A5FA' : '#F87171'
          }}>
            <Bot size={28} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#F8FAFC', margin: 0 }}>
                AutoMod & Chat Security Center
              </h1>
              <span style={{
                fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px',
                background: isEnabled ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: isEnabled ? '#34D399' : '#F87171',
                border: `1px solid ${isEnabled ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`
              }}>
                {isEnabled ? 'FILTERS ONLINE & ACTIVE' : 'SYSTEM OFFLINE'}
              </span>
            </div>
            <p style={{ fontSize: '13px', color: '#94A3B8', margin: '4px 0 0' }}>
              Real-time message inspection, standalone mass ping interception, phishing filter, and high-frequency anti-spam.
            </p>
          </div>
        </div>

        <button
          onClick={handleToggleMaster}
          style={{
            padding: '10px 20px', borderRadius: '10px',
            background: isEnabled ? 'rgba(239, 68, 68, 0.15)' : 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
            border: `1px solid ${isEnabled ? 'rgba(239, 68, 68, 0.4)' : 'none'}`,
            color: '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
            boxShadow: isEnabled ? 'none' : '0 4px 14px rgba(16, 185, 129, 0.3)'
          }}
        >
          {isEnabled ? 'Disable Master AutoMod' : 'Enable Master AutoMod'}
        </button>
      </div>

      {/* Primary Protection Engines Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '18px' }}>
        
        {/* 1. Standalone Anti-Everyone & Anti-Here (Single-Switch Engine) */}
        <div style={{
          background: '#161E2E',
          border: `1px solid ${isAntiEveryone ? 'rgba(16, 185, 129, 0.35)' : 'rgba(255, 255, 255, 0.08)'}`,
          borderRadius: '14px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)', position: 'relative'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'rgba(16, 185, 129, 0.15)', color: '#34D399',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <AtSign size={18} />
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#F8FAFC' }}>
                  Anti-Everyone / Anti-Here Mention Shield
                </div>
                <div style={{ fontSize: '11px', color: '#10B981', fontWeight: 700, marginTop: 1 }}>
                  Zero-Tolerance • 1st Attempt Punishment
                </div>
              </div>
            </div>

            {/* Single Switch Toggle */}
            <button
              onClick={() => {
                const next = !isAntiEveryone;
                handleUpdate({ antiEveryoneEnabled: next });
                onSaveConfig(`Anti-Everyone / Anti-Here Mention filter ${next ? 'ENABLED' : 'DISABLED'}.`);
              }}
              style={{
                width: '46px', height: '26px', borderRadius: '14px',
                background: isAntiEveryone ? '#10B981' : 'rgba(255, 255, 255, 0.1)',
                border: 'none', position: 'relative', cursor: 'pointer', flexShrink: 0
              }}
            >
              <div style={{
                width: '20px', height: '20px', borderRadius: '50%', background: '#FFFFFF',
                position: 'absolute', top: '3px', left: isAntiEveryone ? '23px' : '3px',
                transition: 'left 0.2s ease'
              }} />
            </button>
          </div>

          <p style={{ fontSize: '12.5px', color: '#94A3B8', margin: 0, lineHeight: 1.5 }}>
            Decoupled single-switch protection. Intercepts unauthorized `@everyone` and `@here` mentions, deletes the offending message, instantly quarantines rogue webhooks, and applies punishment on the 1st attempt.
          </p>

          <div style={{
            padding: '10px 14px', borderRadius: '8px',
            background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.06)',
            fontSize: '11.5px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <span style={{ color: '#94A3B8' }}>Enforcement Timing:</span>
            <span style={{ color: '#34D399', fontWeight: 700 }}>Immediate (1/1 Attempt)</span>
          </div>
        </div>

        {/* 2. Malicious URL & Anti-Link Shield */}
        <div style={{
          background: '#161E2E',
          border: `1px solid ${isAntiLink ? 'rgba(59, 130, 246, 0.35)' : 'rgba(255, 255, 255, 0.08)'}`,
          borderRadius: '14px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'rgba(59, 130, 246, 0.15)', color: '#60A5FA',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Link size={18} />
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#F8FAFC' }}>
                  Anti-Link & Phishing Interceptor
                </div>
                <div style={{ fontSize: '11px', color: '#60A5FA', fontWeight: 700, marginTop: 1 }}>
                  External Link & Scam Shield
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                const next = !isAntiLink;
                handleUpdate({ blockLinks: next, antiLinkEnabled: next });
                onSaveConfig(`Anti-Link filter ${next ? 'ENABLED' : 'DISABLED'}.`);
              }}
              style={{
                width: '46px', height: '26px', borderRadius: '14px',
                background: isAntiLink ? '#3B82F6' : 'rgba(255, 255, 255, 0.1)',
                border: 'none', position: 'relative', cursor: 'pointer', flexShrink: 0
              }}
            >
              <div style={{
                width: '20px', height: '20px', borderRadius: '50%', background: '#FFFFFF',
                position: 'absolute', top: '3px', left: isAntiLink ? '23px' : '3px',
                transition: 'left 0.2s ease'
              }} />
            </button>
          </div>

          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
            {/* Limit Counter */}
            <div style={{ flex: 1, minWidth: 120 }}>
              <div style={{ fontSize: '11.5px', color: '#94A3B8', marginBottom: 4 }}>Violation Limit:</div>
              <input
                type="number"
                min="1"
                max="10"
                value={linkLimit}
                onChange={(e) => handleUpdate({ antiLinkLimit: parseInt(e.target.value, 10) || 5, limit: parseInt(e.target.value, 10) || 5 })}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 8,
                  background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#F8FAFC', fontSize: '13px', fontWeight: 700
                }}
              />
            </div>

            {/* Punishment Policy */}
            <div style={{ flex: 1.5, minWidth: 150 }}>
              <div style={{ fontSize: '11.5px', color: '#94A3B8', marginBottom: 4 }}>Action On Limit:</div>
              <select
                value={linkPunishment}
                onChange={(e) => handleUpdate({ punishment: e.target.value })}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 8,
                  background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#F8FAFC', fontSize: '13px', fontWeight: 700, outline: 'none'
                }}
              >
                <option value="warn">Warn (1-4) & Timeout (5)</option>
                <option value="mute">Mute / Timeout</option>
                <option value="delete">Delete Message Only</option>
                <option value="kick">Kick Offender</option>
              </select>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12.5px', color: '#CBD5E1', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!allowInvites}
              onChange={(e) => handleUpdate({ allowInvites: !e.target.checked, blockInvites: e.target.checked })}
            />
            <span>Block Discord Server Invite Links (`discord.gg/*`)</span>
          </label>
        </div>

        {/* 3. High-Frequency Anti-Spam Rate Limiter */}
        <div style={{
          background: '#161E2E',
          border: `1px solid ${isAntiSpam ? 'rgba(245, 158, 11, 0.35)' : 'rgba(255, 255, 255, 0.08)'}`,
          borderRadius: '14px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Clock size={18} />
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#F8FAFC' }}>
                  High-Frequency Anti-Spam
                </div>
                <div style={{ fontSize: '11px', color: '#F59E0B', fontWeight: 700, marginTop: 1 }}>
                  Message Velocity & Raid Filter
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                const next = !isAntiSpam;
                handleUpdate({ antiSpamEnabled: next, maxSpamMessages: maxSpam, spamWindowSeconds: spamWindow });
                onSaveConfig(`Anti-Spam rate limiter ${next ? 'ENABLED' : 'DISABLED'}.`);
              }}
              style={{
                width: '46px', height: '26px', borderRadius: '14px',
                background: isAntiSpam ? '#F59E0B' : 'rgba(255, 255, 255, 0.1)',
                border: 'none', position: 'relative', cursor: 'pointer', flexShrink: 0
              }}
            >
              <div style={{
                width: '20px', height: '20px', borderRadius: '50%', background: '#FFFFFF',
                position: 'absolute', top: '3px', left: isAntiSpam ? '23px' : '3px',
                transition: 'left 0.2s ease'
              }} />
            </button>
          </div>

          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '11.5px', color: '#94A3B8', marginBottom: 4 }}>Max Messages:</div>
              <input
                type="number"
                min="2"
                max="15"
                value={maxSpam}
                onChange={(e) => handleUpdate({ maxMessages: parseInt(e.target.value, 10) || 5, maxSpamMessages: parseInt(e.target.value, 10) || 5 })}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 8,
                  background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#F8FAFC', fontSize: '13px', fontWeight: 700
                }}
              />
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '11.5px', color: '#94A3B8', marginBottom: 4 }}>Window (Seconds):</div>
              <input
                type="number"
                min="2"
                max="30"
                value={spamWindow}
                onChange={(e) => handleUpdate({ windowSeconds: parseInt(e.target.value, 10) || 5, spamWindowSeconds: parseInt(e.target.value, 10) || 5 })}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 8,
                  background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#F8FAFC', fontSize: '13px', fontWeight: 700
                }}
              />
            </div>
          </div>

          <div style={{
            padding: '8px 12px', borderRadius: 8,
            background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.06)',
            fontSize: '11.5px', color: '#CBD5E1'
          }}>
            Threshold: Trigger mute if user posts more than <strong>{maxSpam} messages</strong> in <strong>{spamWindow} seconds</strong>.
          </div>
        </div>

      </div>

      {/* Advanced Media & Flood Protection */}
      <div style={{
        background: '#161E2E', border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '14px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '18px'
      }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#F8FAFC' }}>
          Payload, Media & Repetitive Text Filters
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
          {/* Attachment Scanner */}
          <div style={{
            padding: '14px', borderRadius: 10, background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <FileWarning size={18} color="#8B5CF6" />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#F8FAFC' }}>Suspicious File Scanner</div>
                <div style={{ fontSize: '11px', color: '#94A3B8' }}>Blocks `.exe`, `.bat`, `.scr`, `.vbs` payloads</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={isAttachmentFilter}
              onChange={(e) => handleUpdate({ attachmentFilterEnabled: e.target.checked })}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
          </div>

          {/* Duplicate Suppressor */}
          <div style={{
            padding: '14px', borderRadius: 10, background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Copy size={18} color="#3B82F6" />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#F8FAFC' }}>Duplicate Flood Suppressor</div>
                <div style={{ fontSize: '11px', color: '#94A3B8' }}>Blocks copy-pasted repeated messages</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={isDuplicateFilter}
              onChange={(e) => handleUpdate({ duplicateFilterEnabled: e.target.checked })}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
          </div>

          {/* Caps Limit */}
          <div style={{
            padding: '14px', borderRadius: 10, background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Type size={18} color="#EC4899" />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#F8FAFC' }}>Caps Flood Limit (70%)</div>
                <div style={{ fontSize: '11px', color: '#94A3B8' }}>Suppresses messages with excessive capital letters</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={isCapsFilter}
              onChange={(e) => handleUpdate({ preventCapsSpam: e.target.checked })}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
          </div>

          {/* Emoji Flood */}
          <div style={{
            padding: '14px', borderRadius: 10, background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Smile size={18} color="#F59E0B" />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#F8FAFC' }}>Emoji Spam Limit (10+)</div>
                <div style={{ fontSize: '11px', color: '#94A3B8' }}>Suppresses custom & animated emoji floods</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={isEmojiFilter}
              onChange={(e) => handleUpdate({ emojiSpamEnabled: e.target.checked, maxEmojis: 10 })}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
          </div>
        </div>
      </div>

      {/* Word Blacklist Manager */}
      <div style={{
        background: '#161E2E', border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '14px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#F8FAFC' }}>Word & Phrase Blacklist ({badWords.length})</div>
            <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: 2 }}>Messages containing any of these keywords will be deleted automatically.</div>
          </div>

          <form onSubmit={handleAddWord} style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="Add keyword to block..."
              value={newWord}
              onChange={(e) => setNewWord(e.target.value)}
              style={{
                padding: '8px 14px', borderRadius: 8,
                background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#F8FAFC', fontSize: '13px', outline: 'none'
              }}
            />
            <button
              type="submit"
              style={{
                padding: '8px 14px', borderRadius: 8,
                background: '#10B981', border: 'none', color: '#FFFFFF',
                fontSize: '13px', fontWeight: 700, cursor: 'pointer'
              }}
            >
              Add Word
            </button>
          </form>
        </div>

        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 8, minHeight: 60,
          padding: 12, borderRadius: 10, background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.06)'
        }}>
          {badWords.length === 0 ? (
            <div style={{ color: '#64748B', fontSize: '12.5px', margin: 'auto' }}>
              No blacklisted keywords. Type a word above to add.
            </div>
          ) : (
            badWords.map(word => (
              <span
                key={word}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px', borderRadius: 16,
                  background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#F87171', fontSize: '12px', fontWeight: 600
                }}
              >
                {word}
                <X
                  size={13}
                  onClick={() => handleRemoveWord(word)}
                  style={{ cursor: 'pointer' }}
                />
              </span>
            ))
          )}
        </div>
      </div>

      {/* Bypass Whitelist (Channels & Roles) */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px'
      }}>
        {/* Ignored Channels */}
        <div style={{
          background: '#161E2E', border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '14px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px'
        }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#F8FAFC' }}>
            Exempted Channels ({ignoredChannels.length})
          </div>
          <div style={{ fontSize: '12px', color: '#94A3B8' }}>
            AutoMod filters will be completely disabled in these channels:
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <ChannelSelect
                channels={serverChannels.filter(c => !ignoredChannels.includes(c.id))}
                value={selectedChannelToAdd}
                onChange={(id) => setSelectedChannelToAdd(id)}
                placeholder="Select channel to exempt..."
              />
            </div>
            <button
              onClick={handleAddChannel}
              style={{
                padding: '8px 14px', borderRadius: 8,
                background: '#3B82F6', border: 'none', color: '#FFFFFF',
                fontSize: '12.5px', fontWeight: 700, cursor: 'pointer'
              }}
            >
              Add
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ignoredChannels.map(id => {
              const ch = serverChannels.find(c => c.id === id);
              return (
                <span
                  key={id}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '4px 10px', borderRadius: 6,
                    background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)',
                    color: '#60A5FA', fontSize: '12px', fontWeight: 600
                  }}
                >
                  #{ch?.name || id}
                  <X size={13} onClick={() => handleRemoveChannel(id)} style={{ cursor: 'pointer' }} />
                </span>
              );
            })}
          </div>
        </div>

        {/* Ignored Roles */}
        <div style={{
          background: '#161E2E', border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '14px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px'
        }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#F8FAFC' }}>
            Exempted Roles ({ignoredRoles.length})
          </div>
          <div style={{ fontSize: '12px', color: '#94A3B8' }}>
            Users holding any of these roles bypass all AutoMod checks:
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <RoleSelect
                roles={serverRoles.filter(r => !ignoredRoles.includes(r.id))}
                value={selectedRoleToAdd}
                onChange={(id) => setSelectedRoleToAdd(id)}
                placeholder="Select role to exempt..."
              />
            </div>
            <button
              onClick={handleAddRole}
              style={{
                padding: '8px 14px', borderRadius: 8,
                background: '#10B981', border: 'none', color: '#FFFFFF',
                fontSize: '12.5px', fontWeight: 700, cursor: 'pointer'
              }}
            >
              Add
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ignoredRoles.map(id => {
              const r = serverRoles.find(role => role.id === id);
              return (
                <span
                  key={id}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '4px 10px', borderRadius: 6,
                    background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#34D399', fontSize: '12px', fontWeight: 600
                  }}
                >
                  @{r?.name || id}
                  <X size={13} onClick={() => handleRemoveRole(id)} style={{ cursor: 'pointer' }} />
                </span>
              );
            })}
          </div>
        </div>
      </div>

    </div>
  );
}
