import { API_BASE, DISCORD_CLIENT_ID } from '../config';
import React, { useState } from 'react';

import { motion, AnimatePresence } from 'framer-motion';
import {
  Server, Users, Clock, Shield, ShieldCheck, ShieldAlert, ShieldX,
  ExternalLink, LogOut, CheckCircle2, XCircle, AlertTriangle, RefreshCw,
  ChevronRight, Loader2, Bot, Music
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import type { ManagedGuild, ApprovalInfo } from '../hooks/useAuth';

const MUSIC_CLIENT_ID = '1520323151928623125';
const MUSIC_BOT_PERMISSIONS = '36700160';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ReactNode; canAccess: boolean }> = {
  'Approved': {
    label: 'Approved',
    color: '#22C55E',
    bg: 'rgba(34,197,94,0.08)',
    border: 'rgba(34,197,94,0.25)',
    icon: <ShieldCheck size={14} />,
    canAccess: true
  },
  'Pending': {
    label: 'Pending Review',
    color: '#FACC15',
    bg: 'rgba(250,204,21,0.08)',
    border: 'rgba(250,204,21,0.25)',
    icon: <Clock size={14} />,
    canAccess: true
  },
  'Under Review': {
    label: 'Under Review',
    color: '#60A5FA',
    bg: 'rgba(96,165,250,0.08)',
    border: 'rgba(96,165,250,0.25)',
    icon: <Shield size={14} />,
    canAccess: true
  },
  'Rejected': {
    label: 'Rejected',
    color: '#EF4444',
    bg: 'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.25)',
    icon: <XCircle size={14} />,
    canAccess: false
  },
  'Suspended': {
    label: 'Suspended',
    color: '#F97316',
    bg: 'rgba(249,115,22,0.08)',
    border: 'rgba(249,115,22,0.25)',
    icon: <ShieldAlert size={14} />,
    canAccess: false
  },
  'Blacklisted': {
    label: 'Blacklisted',
    color: '#DC2626',
    bg: 'rgba(220,38,38,0.08)',
    border: 'rgba(220,38,38,0.25)',
    icon: <ShieldX size={14} />,
    canAccess: false
  },
  'Not Registered': {
    label: 'Bot Not In Server',
    color: '#6B7280',
    bg: 'rgba(107,114,128,0.08)',
    border: 'rgba(107,114,128,0.2)',
    icon: <Bot size={14} />,
    canAccess: false
  }
};

function getAvatarUrl(userId: string, avatarHash: string | null): string {
  if (!avatarHash) return `https://cdn.discordapp.com/embed/avatars/${Number(userId) % 5}.png`;
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png`;
}

function getGuildIconUrl(guildId: string, iconHash: string | null): string | null {
  if (!iconHash) return null;
  return `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.png`;
}

function GuildCard({
  guild,
  approval,
  onSelect
}: {
  guild: ManagedGuild;
  approval: ApprovalInfo | undefined;
  onSelect: (id: string) => void;
}) {
  const status = approval?.status || 'Not Registered';
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG['Not Registered'];
  const iconUrl = getGuildIconUrl(guild.id, guild.icon);
  const BOT_INVITE_URL = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&permissions=8&scope=bot%20applications.commands&guild_id=${guild.id}`;

  const MUSIC_INVITE_URL = `https://discord.com/api/oauth2/authorize?client_id=${MUSIC_CLIENT_ID}&permissions=${MUSIC_BOT_PERMISSIONS}&scope=bot%20applications.commands&guild_id=${guild.id}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={cfg.canAccess ? { y: -4, scale: 1.01 } : {}}
      transition={{ duration: 0.2 }}
      style={{
        background: '#1D212B',
        border: `1px solid ${cfg.canAccess ? cfg.border : '#2C313C'}`,
        borderRadius: 16,
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        position: 'relative',
        overflow: 'hidden',
        cursor: cfg.canAccess ? 'pointer' : 'default',
        transition: 'all 0.25s ease',
        boxShadow: cfg.canAccess ? `0 0 0 0 ${cfg.color}` : 'none'
      }}
      onClick={() => cfg.canAccess && onSelect(guild.id)}
    >
      {/* Glow accent for approved servers */}
      {cfg.canAccess && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(90deg, ${cfg.color}, transparent)`
        }} />
      )}

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {iconUrl ? (
          <img src={iconUrl} alt={guild.name}
            style={{ width: 52, height: 52, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
        ) : (
          <div style={{
            width: 52, height: 52, borderRadius: 12, flexShrink: 0,
            background: 'linear-gradient(135deg, #7C5CFC, #4F8CFF)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, fontWeight: 700, color: '#fff'
          }}>
            {guild.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 16, fontWeight: 700, color: '#F3F4F6',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
          }}>
            {guild.name}
          </div>
          <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>ID: {guild.id}</div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 10px', borderRadius: 20,
          background: cfg.bg, border: `1px solid ${cfg.border}`,
          fontSize: 11, fontWeight: 600, color: cfg.color, flexShrink: 0
        }}>
          {cfg.icon}
          {cfg.label}
        </div>
      </div>

      {/* Status message */}
      <div style={{
        padding: '12px 14px', borderRadius: 10,
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.04)',
        fontSize: 13, color: '#9CA3AF'
      }}>
        {status === 'Approved' && '✅ Your server has full access to the Rage Optimiser dashboard.'}
        {status === 'Pending' && '⏳ Your server is awaiting manual review by the Rage Optimiser team. You\'ll receive a DM once approved.'}
        {status === 'Under Review' && '🔍 Your server is currently being reviewed. This usually takes 24–48 hours.'}
        {status === 'Rejected' && `❌ Your server was rejected. Reason: ${approval?.guildName || 'Contact support for more info.'}`}
        {status === 'Suspended' && '⚠️ Your server\'s access has been suspended. Contact support.'}
        {status === 'Blacklisted' && '🚫 This server has been permanently blacklisted from Rage Optimiser.'}
        {status === 'Not Registered' && '🤖 The bot hasn\'t joined this server yet. Invite it to start the approval process.'}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10 }}>
        {cfg.canAccess && (
          <button
            onClick={() => onSelect(guild.id)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '11px 20px', borderRadius: 10,
              background: 'linear-gradient(135deg, #7C5CFC, #4F8CFF)',
              border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer'
            }}
          >
            Manage Server <ChevronRight size={16} />
          </button>
        )}
        {status === 'Not Registered' && (
          <a href={BOT_INVITE_URL} target="_blank" rel="noopener noreferrer"
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '11px 20px', borderRadius: 10,
              background: 'rgba(124,92,252,0.15)', border: '1px solid rgba(124,92,252,0.3)',
              color: '#7C5CFC', fontSize: 14, fontWeight: 600, textDecoration: 'none'
            }}
          >
            Invite Bot <ExternalLink size={14} />
          </a>
        )}
        {/* Always show music bot invite for non-blacklisted servers */}
        {status !== 'Blacklisted' && status !== 'Not Registered' && (
          <a href={MUSIC_INVITE_URL} target="_blank" rel="noopener noreferrer"
            title="Rage Music is a separate bot required for music commands"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '11px 16px', borderRadius: 10,
              background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.25)',
              color: '#FACC15', fontSize: 13, fontWeight: 600, textDecoration: 'none',
              flexShrink: 0
            }}
          >
            <Music size={14} /> Music Bot
          </a>
        )}
      </div>
    </motion.div>
  );
}

export function ServerSelection({ onSelectGuild }: { onSelectGuild: (guildId: string) => void }) {
  const { user, managedGuilds, guildApprovals, logout, setActiveGuildId, updateDiscordGuilds, token } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const handleSelect = (guildId: string) => {
    setActiveGuildId(guildId);
    onSelectGuild(guildId);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`${API_BASE}/api/user/guilds`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        updateDiscordGuilds(data.managedGuilds, data.approvals);
      } else {
        // Fallback to OAuth redirect if token is expired/invalid
        const authRes = await fetch(`${API_BASE}/api/auth/discord`);
        const { url } = await authRes.json();
        window.location.href = url;
      }
    } catch {
      try {
        const authRes = await fetch(`${API_BASE}/api/auth/discord`);
        const { url } = await authRes.json();
        window.location.href = url;
      } catch {
        setRefreshing(false);
      }
    } finally {
      setRefreshing(false);
    }
  };

  const approvedCount = managedGuilds.filter(g => guildApprovals[g.id]?.status === 'Approved').length;
  const pendingCount = managedGuilds.filter(g => guildApprovals[g.id]?.status === 'Pending').length;

  const avatarUrl = user?.avatar && user?.discordId
    ? getAvatarUrl(user.discordId, user.avatar)
    : null;

  return (
    <div style={{
      minHeight: '100vh', width: '100vw',
      background: '#0B0F19',
      backgroundImage: 'radial-gradient(at 0% 0%, rgba(124,92,252,0.12) 0px, transparent 50%), radial-gradient(at 100% 0%, rgba(79,140,255,0.08) 0px, transparent 50%)',
      display: 'flex', flexDirection: 'column'
    }}>
      {/* Top Nav */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 40px',
        background: 'rgba(23,26,33,0.8)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(12px)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #FF3B30, #FF9500)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 14, color: '#fff'
          }}>RO</div>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#fff', letterSpacing: 1 }}>RAGE OPTIMISER</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {avatarUrl ? (
            <img src={avatarUrl} alt={user?.username}
              style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,59,48,0.4)' }} />
          ) : (
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'linear-gradient(135deg, #FF3B30, #FF9500)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, color: '#fff', fontSize: 14
            }}>
              {user?.username?.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#F3F4F6' }}>{user?.username}</div>
            <div style={{ fontSize: 11, color: '#6B7280' }}>Guild Manager</div>
          </div>
          <button
            onClick={logout}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
              color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: 'pointer'
            }}
          >
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '40px', maxWidth: 900, margin: '0 auto', width: '100%' }}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ marginBottom: 20 }}
        >
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#F3F4F6', margin: '0 0 8px' }}>
            Select Your Server
          </h1>
          <p style={{ fontSize: 15, color: '#9CA3AF', margin: 0 }}>
            Choose a server to manage. Only servers where you have administrator or manage server permissions are shown.
          </p>
        </motion.div>

        {/* Two-Bot Architecture Banner */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          style={{
            marginBottom: 24, padding: '16px 20px', borderRadius: 14,
            background: 'linear-gradient(135deg, rgba(124,92,252,0.1), rgba(79,140,255,0.06))',
            border: '1px solid rgba(124,92,252,0.25)',
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: 'linear-gradient(135deg, #7C5CFC, #4F8CFF)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Shield size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#F3F4F6', marginBottom: 4 }}>
                Rage Optimiser (Main Bot)
              </div>
              <div style={{ fontSize: 12, color: '#9CA3AF', lineHeight: 1.5 }}>
                Handles moderation, security, logging, tickets, verification, automod, automation & dashboard sync.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: 'linear-gradient(135deg, #FACC15, #F97316)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Music size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#F3F4F6', marginBottom: 4 }}>
                Rage Music (Separate Bot)
              </div>
              <div style={{ fontSize: 12, color: '#9CA3AF', lineHeight: 1.5 }}>
                Dedicated music playback bot for /play, /queue, Spotify, YouTube & SoundCloud. Must be invited separately per server.
              </div>
            </div>
          </div>
        </motion.div>

        {/* Stats bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          style={{
            display: 'flex', gap: 16, marginBottom: 28
          }}
        >
          {[
            { label: 'Total Servers', value: managedGuilds.length, color: '#7C5CFC' },
            { label: 'Approved', value: approvedCount, color: '#22C55E' },
            { label: 'Pending', value: pendingCount, color: '#FACC15' }
          ].map(stat => (
            <div key={stat.label} style={{
              padding: '14px 20px', borderRadius: 12,
              background: '#1D212B', border: '1px solid #2C313C',
              display: 'flex', flexDirection: 'column', gap: 4
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: 12, color: '#6B7280' }}>{stat.label}</div>
            </div>
          ))}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8,
              padding: '0 20px', borderRadius: 12,
              background: '#1D212B', border: '1px solid #2C313C',
              color: '#9CA3AF', fontSize: 13, fontWeight: 500, cursor: 'pointer'
            }}
          >
            {refreshing ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
            Refresh Servers
          </button>
        </motion.div>

        {/* Guild grid */}
        {managedGuilds.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              textAlign: 'center', padding: '80px 40px',
              background: '#1D212B', borderRadius: 16,
              border: '1px dashed #2C313C'
            }}
          >
            <Server size={48} color="#4B5563" style={{ marginBottom: 16 }} />
            <h3 style={{ color: '#F3F4F6', margin: '0 0 8px' }}>No Manageable Servers Found</h3>
            <p style={{ color: '#6B7280', fontSize: 14 }}>
              You don't appear to have Administrator or Manage Server permissions in any Discord server.
            </p>
          </motion.div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 20 }}>
            {managedGuilds.map((guild, i) => (
              <motion.div
                key={guild.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <GuildCard
                  guild={guild}
                  approval={guildApprovals[guild.id]}
                  onSelect={handleSelect}
                />
              </motion.div>
            ))}
          </div>
        )}

        {/* Info banner */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          style={{
            marginTop: 32, padding: '16px 20px', borderRadius: 12,
            background: 'rgba(34,197,94,0.06)',
            border: '1px solid rgba(34,197,94,0.2)',
            display: 'flex', alignItems: 'flex-start', gap: 12
          }}
        >
          <ShieldCheck size={16} color="#22C55E" style={{ marginTop: 2, flexShrink: 0 }} />
          <div style={{ fontSize: 13, color: '#9CA3AF', lineHeight: 1.6 }}>
            <strong style={{ color: '#22C55E' }}>Open Discord Bot:</strong> Rage Optimiser is now a fully open public bot. 
            Once invited, you can manage your server settings instantly. No manual approval required!
          </div>
        </motion.div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}
