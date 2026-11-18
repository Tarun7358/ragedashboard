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
      
      {/* Top Hero Banner - Black Obsidian Theme */}
      <div style={{
        background: '#09090B',
        border: '1px solid #27272A',
        borderRadius: '16px',
        padding: '24px 28px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '20px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div style={{
            width: '54px', height: '54px', borderRadius: '14px',
            background: isEnabled ? 'rgba(255, 255, 255, 0.1)' : '#FEF2F2',
            border: `1px solid ${isEnabled ? '#3F3F46' : '#FECACA'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: isEnabled ? '#FAFAFA' : '#DC2626'
          }}>
            <Bot size={28} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#FFFFFF', margin: 0, letterSpacing: '-0.02em' }}>
                AutoMod & Chat Security Center
              </h1>
              <span style={{
                fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px',
                background: isEnabled ? '#ECFDF5' : '#FEF2F2',
                color: isEnabled ? '#059669' : '#DC2626',
                border: `1px solid ${isEnabled ? '#A7F3D0' : '#FECACA'}`
              }}>
                {isEnabled ? 'FILTERS ONLINE & ACTIVE' : 'SYSTEM OFFLINE'}
              </span>
            </div>
            <p style={{ fontSize: '13px', color: '#A1A1AA', margin: '4px 0 0' }}>
              Real-time message inspection, standalone mass ping interception, phishing filter, and high-frequency anti-spam.
            </p>
          </div>
        </div>

        <button
          onClick={handleToggleMaster}
          style={{
            padding: '10px 20px', borderRadius: '10px',
            background: isEnabled ? '#FEF2F2' : '#09090B',
            border: `1px solid ${isEnabled ? '#FECACA' : '#FFFFFF'}`,
            color: isEnabled ? '#DC2626' : '#FFFFFF', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          {isEnabled ? 'Disable Master AutoMod' : 'Enable Master AutoMod'}
        </button>
      </div>

      {/* Primary Protection Engines Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '18px' }}>
        
        {/* 1. Standalone Anti-Everyone & Anti-Here (Single-Switch Engine) */}
        <div style={{
          background: '#FFFFFF',
          border: `1px solid ${isAntiEveryone ? '#FECACA' : '#E4E4E7'}`,
          borderRadius: '14px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)', position: 'relative'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: '#FEF2F2', color: '#DC2626',
                border: '1px solid #FECACA',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <AtSign size={18} />
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#09090B' }}>
                  Anti-Everyone / Anti-Here Mention Shield
                </div>
                <div style={{ fontSize: '11px', color: '#DC2626', fontWeight: 700, marginTop: 1 }}>
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
                background: isAntiEveryone ? '#09090B' : '#E4E4E7',
                border: 'none', position: 'relative', cursor: 'pointer', flexShrink: 0
              }}
            >
              <div style={{
                width: '20px', height: '20px', borderRadius: '50%', background: '#FFFFFF',
                position: 'absolute', top: '3px', left: isAntiEveryone ? '23px' : '3px',
                transition: 'left 0.2s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
              }} />
            </button>
          </div>

          <p style={{ fontSize: '12.5px', color: '#71717A', margin: 0, lineHeight: 1.5 }}>
            Decoupled single-switch protection. Intercepts unauthorized <code>@everyone</code> and <code>@here</code> mentions, deletes the offending message, instantly quarantines rogue webhooks, and applies punishment on the 1st attempt.
          </p>

          <div style={{
            padding: '10px 14px', borderRadius: '8px',
            background: '#FAFAFA', border: '1px solid #E4E4E7',
            fontSize: '11.5px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <span style={{ color: '#71717A' }}>Enforcement Timing:</span>
            <span style={{ color: '#DC2626', fontWeight: 700 }}>Immediate (1/1 Attempt)</span>
          </div>
        </div>

        {/* 2. Malicious URL & Anti-Link Shield */}
        <div style={{
          background: '#FFFFFF',
          border: `1px solid ${isAntiLink ? '#FECACA' : '#E4E4E7'}`,
          borderRadius: '14px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: '#FEF2F2', color: '#DC2626',
                border: '1px solid #FECACA',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Link size={18} />
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#09090B' }}>
                  Anti-Link & Phishing Interceptor
                </div>
                <div style={{ fontSize: '11px', color: '#DC2626', fontWeight: 700, marginTop: 1 }}>
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
                background: isAntiLink ? '#09090B' : '#E4E4E7',
                border: 'none', position: 'relative', cursor: 'pointer', flexShrink: 0
              }}
            >
              <div style={{
                width: '20px', height: '20px', borderRadius: '50%', background: '#FFFFFF',
                position: 'absolute', top: '3px', left: isAntiLink ? '23px' : '3px',
                transition: 'left 0.2s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
              }} />
            </button>
          </div>

          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
            {/* Limit Counter */}
            <div style={{ flex: 1, minWidth: 120 }}>
              <div style={{ fontSize: '11.5px', color: '#71717A', marginBottom: 4, fontWeight: 600 }}>Violation Limit:</div>
              <input
                type="number"
                min="1"
                max="10"
                value={linkLimit}
                onChange={(e) => handleUpdate({ antiLinkLimit: parseInt(e.target.value, 10) || 5, limit: parseInt(e.target.value, 10) || 5 })}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 8,
                  background: '#FFFFFF', border: '1px solid #E4E4E7',
                  color: '#09090B', fontSize: '13px', fontWeight: 700
                }}
              />
            </div>

            {/* Punishment Policy */}
            <div style={{ flex: 1.5, minWidth: 150 }}>
              <div style={{ fontSize: '11.5px', color: '#71717A', marginBottom: 4, fontWeight: 600 }}>Action On Limit:</div>
              <select
                value={linkPunishment}
                onChange={(e) => handleUpdate({ punishment: e.target.value })}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 8,
                  background: '#FFFFFF', border: '1px solid #E4E4E7',
                  color: '#09090B', fontSize: '13px', fontWeight: 700, outline: 'none'
                }}
              >
                <option value="warn">Warn (1-4) & Timeout (5)</option>
                <option value="mute">Mute / Timeout</option>
                <option value="delete">Delete Message Only</option>
                <option value="kick">Kick Offender</option>
              </select>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12.5px', color: '#3F3F46', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!allowInvites}
              onChange={(e) => handleUpdate({ allowInvites: !e.target.checked, blockInvites: e.target.checked })}
            />
            <span>Block Discord Server Invite Links (<code>discord.gg/*</code>)</span>
          </label>
        </div>

        {/* 3. High-Frequency Anti-Spam Rate Limiter */}
        <div style={{
          background: '#FFFFFF',
          border: `1px solid ${isAntiSpam ? '#FECACA' : '#E4E4E7'}`,
          borderRadius: '14px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: '#FEF2F2', color: '#DC2626',
                border: '1px solid #FECACA',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Clock size={18} />
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#09090B' }}>
                  High-Frequency Anti-Spam
                </div>
                <div style={{ fontSize: '11px', color: '#DC2626', fontWeight: 700, marginTop: 1 }}>
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
                background: isAntiSpam ? '#09090B' : '#E4E4E7',
                border: 'none', position: 'relative', cursor: 'pointer', flexShrink: 0
              }}
            >
              <div style={{
                width: '20px', height: '20px', borderRadius: '50%', background: '#FFFFFF',
                position: 'absolute', top: '3px', left: isAntiSpam ? '23px' : '3px',
                transition: 'left 0.2s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
              }} />
            </button>
          </div>

          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '11.5px', color: '#71717A', marginBottom: 4, fontWeight: 600 }}>Max Messages:</div>
              <input
                type="number"
                min="2"
                max="15"
                value={maxSpam}
                onChange={(e) => handleUpdate({ maxMessages: parseInt(e.target.value, 10) || 5, maxSpamMessages: parseInt(e.target.value, 10) || 5 })}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 8,
                  background: '#FFFFFF', border: '1px solid #E4E4E7',
                  color: '#09090B', fontSize: '13px', fontWeight: 700
                }}
              />
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '11.5px', color: '#71717A', marginBottom: 4, fontWeight: 600 }}>Window (Seconds):</div>
              <input
                type="number"
                min="2"
                max="30"
                value={spamWindow}
                onChange={(e) => handleUpdate({ windowSeconds: parseInt(e.target.value, 10) || 5, spamWindowSeconds: parseInt(e.target.value, 10) || 5 })}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 8,
                  background: '#FFFFFF', border: '1px solid #E4E4E7',
                  color: '#09090B', fontSize: '13px', fontWeight: 700
                }}
              />
            </div>
          </div>

          <div style={{
            padding: '8px 12px', borderRadius: 8,
            background: '#FAFAFA', border: '1px solid #E4E4E7',
            fontSize: '11.5px', color: '#52525B'
          }}>
            Threshold: Trigger mute if user posts more than <strong>{maxSpam} messages</strong> in <strong>{spamWindow} seconds</strong>.
          </div>
        </div>

      </div>

      {/* Advanced Media & Flood Protection */}
      <div style={{
        background: '#FFFFFF', border: '1px solid #E4E4E7',
        borderRadius: '14px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '18px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
      }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: '#09090B' }}>
          Payload, Media & Repetitive Text Filters
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
          {/* Attachment Scanner */}
          <div style={{
            padding: '14px', borderRadius: 10, background: '#FAFAFA',
            border: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <FileWarning size={18} color="#09090B" />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#09090B' }}>Suspicious File Scanner</div>
                <div style={{ fontSize: '11px', color: '#71717A' }}>Blocks <code>.exe</code>, <code>.bat</code>, <code>.scr</code>, <code>.vbs</code> payloads</div>
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
            padding: '14px', borderRadius: 10, background: '#FAFAFA',
            border: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Copy size={18} color="#09090B" />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#09090B' }}>Duplicate Flood Suppressor</div>
                <div style={{ fontSize: '11px', color: '#71717A' }}>Blocks copy-pasted repeated messages</div>
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
            padding: '14px', borderRadius: 10, background: '#FAFAFA',
            border: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Type size={18} color="#09090B" />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#09090B' }}>Caps Flood Limit (70%)</div>
                <div style={{ fontSize: '11px', color: '#71717A' }}>Suppresses messages with excessive capital letters</div>
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
            padding: '14px', borderRadius: 10, background: '#FAFAFA',
            border: '1px solid #E4E4E7', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Smile size={18} color="#09090B" />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#09090B' }}>Emoji Spam Limit (10+)</div>
                <div style={{ fontSize: '11px', color: '#71717A' }}>Suppresses custom & animated emoji floods</div>
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
        background: '#FFFFFF', border: '1px solid #E4E4E7',
        borderRadius: '14px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#09090B' }}>Word & Phrase Blacklist ({badWords.length})</div>
            <div style={{ fontSize: '12px', color: '#71717A', marginTop: 2 }}>Messages containing any of these keywords will be deleted automatically.</div>
          </div>

          <form onSubmit={handleAddWord} style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="Add keyword to block..."
              value={newWord}
              onChange={(e) => setNewWord(e.target.value)}
              style={{
                padding: '8px 14px', borderRadius: 8,
                background: '#FFFFFF', border: '1px solid #E4E4E7',
                color: '#09090B', fontSize: '13px', outline: 'none'
              }}
            />
            <button
              type="submit"
              style={{
                padding: '8px 14px', borderRadius: 8,
                background: '#09090B', border: 'none', color: '#FFFFFF',
                fontSize: '13px', fontWeight: 700, cursor: 'pointer'
              }}
            >
              Add Word
            </button>
          </form>
        </div>

        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 8, minHeight: 60,
          padding: 12, borderRadius: 10, background: '#FAFAFA',
          border: '1px solid #E4E4E7'
        }}>
          {badWords.length === 0 ? (
            <div style={{ color: '#A1A1AA', fontSize: '12.5px', margin: 'auto' }}>
              No blacklisted keywords. Type a word above to add.
            </div>
          ) : (
            badWords.map(word => (
              <span
                key={word}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px', borderRadius: 16,
                  background: '#FEF2F2', border: '1px solid #FECACA',
                  color: '#991B1B', fontSize: '12px', fontWeight: 600
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
          background: '#FFFFFF', border: '1px solid #E4E4E7', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
          borderRadius: '14px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px'
        }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#09090B' }}>
            Exempted Channels ({ignoredChannels.length})
          </div>
          <div style={{ fontSize: '12px', color: '#71717A' }}>
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
                background: '#09090B', border: 'none', color: '#FFFFFF',
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
                    background: '#F4F4F5', border: '1px solid #E4E4E7',
                    color: '#09090B', fontSize: '12px', fontWeight: 600
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
          background: '#FFFFFF', border: '1px solid #E4E4E7', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
          borderRadius: '14px', padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px'
        }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#09090B' }}>
            Exempted Roles ({ignoredRoles.length})
          </div>
          <div style={{ fontSize: '12px', color: '#71717A' }}>
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
                background: '#09090B', border: 'none', color: '#FFFFFF',
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
                    background: '#F4F4F5', border: '1px solid #E4E4E7',
                    color: '#09090B', fontSize: '12px', fontWeight: 600
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
