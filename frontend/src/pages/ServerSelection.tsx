import { API_BASE, DISCORD_CLIENT_ID } from '../config';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Server, Users, Clock, Shield, ShieldCheck, ShieldAlert, ShieldX,
  ExternalLink, LogOut, CheckCircle2, XCircle, AlertTriangle, RefreshCw,
  ChevronRight, Loader2, Bot
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import type { ManagedGuild, ApprovalInfo } from '../hooks/useAuth';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ReactNode; canAccess: boolean }> = {
  'Approved': {
    label: 'Ready & Approved',
    color: '#16A34A',
    bg: '#DCFCE7',
    border: '#BBF7D0',
    icon: <ShieldCheck size={14} />,
    canAccess: true
  },
  'Pending': {
    label: 'Pending Review',
    color: '#D97706',
    bg: '#FEF3C7',
    border: '#FDE68A',
    icon: <Clock size={14} />,
    canAccess: true
  },
  'Under Review': {
    label: 'Under Review',
    color: '#2563EB',
    bg: '#DBEAFE',
    border: '#BFDBFE',
    icon: <Shield size={14} />,
    canAccess: true
  },
  'Rejected': {
    label: 'Rejected',
    color: '#DC2626',
    bg: '#FEE2E2',
    border: '#FECACA',
    icon: <XCircle size={14} />,
    canAccess: false
  },
  'Suspended': {
    label: 'Suspended',
    color: '#D97706',
    bg: '#FEF3C7',
    border: '#FDE68A',
    icon: <ShieldAlert size={14} />,
    canAccess: false
  },
  'Blacklisted': {
    label: 'Blacklisted',
    color: '#991B1B',
    bg: '#FEE2E2',
    border: '#FECACA',
    icon: <ShieldX size={14} />,
    canAccess: false
  },
  'Not Registered': {
    label: 'Bot Not Added',
    color: '#71717A',
    bg: '#F4F4F5',
    border: '#E4E4E7',
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={cfg.canAccess ? { y: -3 } : {}}
      transition={{ duration: 0.18 }}
      style={{
        background: '#FFFFFF',
        border: `1px solid ${cfg.canAccess ? '#E4E4E7' : '#F4F4F5'}`,
        borderRadius: 14,
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        position: 'relative',
        cursor: cfg.canAccess ? 'pointer' : 'default',
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        transition: 'all 0.2s ease'
      }}
      onClick={() => cfg.canAccess && onSelect(guild.id)}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {iconUrl ? (
          <img 
            src={iconUrl} 
            alt={guild.name}
            style={{ width: 50, height: 50, borderRadius: 12, objectFit: 'cover', flexShrink: 0, border: '1px solid #E4E4E7' }} 
          />
        ) : (
          <div style={{
            width: 50, height: 50, borderRadius: 12, flexShrink: 0,
            background: '#09090B',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 800, color: '#FFFFFF'
          }}>
            {guild.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 16, fontWeight: 700, color: '#09090B',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
          }}>
            {guild.name}
          </div>
          <div style={{ fontSize: 11, color: '#71717A', marginTop: 2, fontFamily: 'monospace' }}>ID: {guild.id}</div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 10px', borderRadius: 20,
          background: cfg.bg, border: `1px solid ${cfg.border}`,
          fontSize: 11, fontWeight: 700, color: cfg.color, flexShrink: 0
        }}>
          {cfg.icon}
          {cfg.label}
        </div>
      </div>

      {/* Status explanation */}
      <div style={{
        padding: '12px 14px', borderRadius: 8,
        background: '#FAFAFA',
        border: '1px solid #E4E4E7',
        fontSize: 13, color: '#52525B', lineHeight: 1.5
      }}>
        {status === 'Approved' && '✅ Full access available. Click below to manage this server.'}
        {status === 'Pending' && '⏳ Server is verified and ready for access.'}
        {status === 'Under Review' && '🔍 Server is ready for configuration.'}
        {status === 'Rejected' && `❌ Server rejected: ${approval?.guildName || 'Contact team.'}`}
        {status === 'Suspended' && '⚠️ Server access suspended.'}
        {status === 'Blacklisted' && '🚫 Server permanently restricted.'}
        {status === 'Not Registered' && '🤖 Bot is not yet present. Invite it to begin management.'}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 10 }}>
        {cfg.canAccess && (
          <button
            onClick={() => onSelect(guild.id)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '11px 20px', borderRadius: 8,
              background: '#09090B', border: '1px solid #09090B',
              color: '#FFFFFF', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            Manage Server <ChevronRight size={15} />
          </button>
        )}
        {status === 'Not Registered' && (
          <a 
            href={BOT_INVITE_URL} 
            target="_blank" 
            rel="noopener noreferrer"
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '11px 20px', borderRadius: 8,
              background: '#FFFFFF', border: '1.5px solid #09090B',
              color: '#09090B', fontSize: 13, fontWeight: 700, textDecoration: 'none'
            }}
          >
            Invite Rage <ExternalLink size={14} />
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
      backgroundColor: '#FAFAFA',
      backgroundImage: 'radial-gradient(rgba(0, 0, 0, 0.05) 1px, transparent 1px)',
      backgroundSize: '24px 24px',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      color: '#09090B'
    }}>
      {/* Top Nav */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 36px',
        backgroundColor: '#FFFFFF',
        borderBottom: '1px solid #E4E4E7',
        backdropFilter: 'blur(12px)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img 
            src="/rglogo.png" 
            alt="Rage Optimiser" 
            style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'contain' }} 
          />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#09090B', letterSpacing: '0.04em' }}>RAGE OPTIMISER</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#71717A', letterSpacing: '0.12em' }}>SERVER SELECTOR</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {avatarUrl ? (
            <img 
              src={avatarUrl} 
              alt={user?.username}
              style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', border: '1px solid #E4E4E7' }} 
            />
          ) : (
            <div style={{
              width: 34, height: 34, borderRadius: '50%',
              background: '#09090B',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, color: '#FFFFFF', fontSize: 13
            }}>
              {user?.username?.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#09090B' }}>{user?.username}</div>
            <div style={{ fontSize: 11, color: '#71717A' }}>Guild Manager</div>
          </div>
          <button
            onClick={logout}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 12px', borderRadius: 8,
              background: '#FEE2E2', border: '1px solid #FECACA',
              color: '#B91C1C', fontSize: 12, fontWeight: 600, cursor: 'pointer'
            }}
          >
            <LogOut size={13} /> Sign Out
          </button>
        </div>
      </header>

      {/* Content */}
      <div style={{ flex: 1, padding: '40px 24px', maxWidth: 960, margin: '0 auto', width: '100%' }}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -15 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ marginBottom: 28 }}
        >
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#09090B', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
            Select Your Server
          </h1>
          <p style={{ fontSize: 14, color: '#52525B', margin: 0 }}>
            Choose a Discord server to configure. Only servers where you have Administrator or Manage Server permissions appear here.
          </p>
        </motion.div>

        {/* Stats strip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          style={{
            display: 'flex', gap: 14, marginBottom: 28, alignItems: 'center'
          }}
        >
          {[
            { label: 'Total Servers', value: managedGuilds.length, color: '#09090B' },
            { label: 'Active', value: approvedCount, color: '#16A34A' },
            { label: 'Pending', value: pendingCount, color: '#D97706' }
          ].map(stat => (
            <div key={stat.label} style={{
              padding: '12px 18px', borderRadius: 10,
              background: '#FFFFFF', border: '1px solid #E4E4E7',
              display: 'flex', flexDirection: 'column', gap: 2, minWidth: 120
            }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: stat.color, fontFamily: 'monospace' }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: '#71717A', fontWeight: 600, textTransform: 'uppercase' }}>{stat.label}</div>
            </div>
          ))}

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8,
              padding: '12px 18px', borderRadius: 10,
              background: '#FFFFFF', border: '1px solid #E4E4E7',
              color: '#09090B', fontSize: 13, fontWeight: 600, cursor: 'pointer'
            }}
          >
            {refreshing ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
            <span>Refresh Server List</span>
          </button>
        </motion.div>

        {/* Guild grid */}
        {managedGuilds.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              textAlign: 'center', padding: '70px 40px',
              background: '#FFFFFF', borderRadius: 16,
              border: '1px dashed #D4D4D8'
            }}
          >
            <Server size={44} color="#A1A1AA" style={{ marginBottom: 14 }} />
            <h3 style={{ color: '#09090B', margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>No Manageable Servers Found</h3>
            <p style={{ color: '#71717A', fontSize: 14, maxWidth: 440, margin: '0 auto' }}>
              You do not currently have Administrator or Manage Server permissions in any mutual Discord server.
            </p>
          </motion.div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 20 }}>
            {managedGuilds.map((guild, i) => (
              <motion.div
                key={guild.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
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
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}
