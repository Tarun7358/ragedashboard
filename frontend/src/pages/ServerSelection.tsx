import { API_BASE, DISCORD_CLIENT_ID } from '../config';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Server, Shield, ShieldCheck, ShieldAlert, ShieldX,
  ExternalLink, LogOut, XCircle, RefreshCw,
  ChevronRight, Loader2, Bot, Lock, Crown, CheckCircle2, Search
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import type { ManagedGuild, ApprovalInfo } from '../hooks/useAuth';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ReactNode; isRegistered: boolean }> = {
  'Approved': {
    label: 'Ready & Approved',
    color: '#10B981',
    bg: 'rgba(16, 185, 129, 0.12)',
    border: 'rgba(16, 185, 129, 0.3)',
    icon: <ShieldCheck size={14} />,
    isRegistered: true
  },
  'Pending': {
    label: 'Pending Review',
    color: '#F59E0B',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.3)',
    icon: <Shield size={14} />,
    isRegistered: true
  },
  'Under Review': {
    label: 'Under Review',
    color: '#3B82F6',
    bg: 'rgba(59, 130, 246, 0.12)',
    border: 'rgba(59, 130, 246, 0.3)',
    icon: <Shield size={14} />,
    isRegistered: true
  },
  'Rejected': {
    label: 'Rejected',
    color: '#EF4444',
    bg: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.3)',
    icon: <XCircle size={14} />,
    isRegistered: true
  },
  'Suspended': {
    label: 'Suspended',
    color: '#F59E0B',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.3)',
    icon: <ShieldAlert size={14} />,
    isRegistered: true
  },
  'Blacklisted': {
    label: 'Blacklisted',
    color: '#DC2626',
    bg: 'rgba(220, 38, 38, 0.12)',
    border: 'rgba(220, 38, 38, 0.3)',
    icon: <ShieldX size={14} />,
    isRegistered: true
  },
  'Not Registered': {
    label: 'Bot Not Added',
    color: '#94A3B8',
    bg: 'rgba(148, 163, 184, 0.1)',
    border: 'rgba(148, 163, 184, 0.2)',
    icon: <Bot size={14} />,
    isRegistered: false
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
  const isOwner = Boolean(guild.owner);
  const iconUrl = getGuildIconUrl(guild.id, guild.icon);
  const BOT_INVITE_URL = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&permissions=8&scope=bot%20applications.commands&guild_id=${guild.id}`;

  const canManage = isOwner && cfg.isRegistered && status !== 'Blacklisted' && status !== 'Suspended' && status !== 'Rejected';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={canManage ? { y: -3, borderColor: 'rgba(16, 185, 129, 0.4)' } : {}}
      transition={{ duration: 0.18 }}
      style={{
        background: 'linear-gradient(145deg, #161E2E 0%, #111827 100%)',
        border: `1px solid ${isOwner ? (canManage ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.1)') : 'rgba(239, 68, 68, 0.2)'}`,
        borderRadius: 14,
        padding: '22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        position: 'relative',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
        cursor: canManage ? 'pointer' : 'default',
        transition: 'all 0.2s ease'
      }}
      onClick={() => canManage && onSelect(guild.id)}
    >
      {/* Top Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {iconUrl ? (
          <img 
            src={iconUrl} 
            alt={guild.name}
            style={{ width: 48, height: 48, borderRadius: 12, objectFit: 'cover', flexShrink: 0, border: '1px solid rgba(255, 255, 255, 0.1)' }} 
          />
        ) : (
          <div style={{
            width: 48, height: 48, borderRadius: 12, flexShrink: 0,
            background: 'linear-gradient(135deg, #1E293B 0%, #0F172A 100%)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 800, color: '#F1F5F9'
          }}>
            {guild.name.charAt(0).toUpperCase()}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontSize: 16, fontWeight: 700, color: '#F8FAFC',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
            }}>
              {guild.name}
            </span>
            {isOwner && (
              <span title="Server Owner" style={{ display: 'inline-flex', alignItems: 'center', color: '#F59E0B' }}>
                <Crown size={15} />
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 2, fontFamily: 'monospace' }}>
            ID: {guild.id}
          </div>
        </div>

        {/* Owner clearance badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 10px', borderRadius: 20,
          background: isOwner ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          border: `1px solid ${isOwner ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
          fontSize: 11, fontWeight: 700, color: isOwner ? '#34D399' : '#F87171', flexShrink: 0
        }}>
          {isOwner ? <ShieldCheck size={13} /> : <Lock size={13} />}
          {isOwner ? 'Owner Clearance' : 'Owner Only'}
        </div>
      </div>

      {/* Security Status Box */}
      <div style={{
        padding: '12px 14px', borderRadius: 10,
        background: 'rgba(15, 23, 42, 0.65)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        fontSize: 12, lineHeight: 1.5,
        display: 'flex', flexDirection: 'column', gap: 4
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: '#94A3B8' }}>Bot Engine Status:</span>
          <span style={{ color: cfg.color, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
            {cfg.icon} {cfg.label}
          </span>
        </div>
        <div style={{ color: isOwner ? '#94A3B8' : '#EF4444', fontSize: 11.5, marginTop: 4 }}>
          {isOwner ? (
            status === 'Approved' ? 'Full owner access authorized. Real-time control active.' :
            status === 'Pending' ? 'Server authorized. Ready for enterprise configuration.' :
            status === 'Not Registered' ? 'Rage Bot is not added yet. Invite the bot to activate security.' :
            'Access pending verification review.'
          ) : (
            'Access Restricted: Dashboard configuration is gated to the Discord Server Owner ID only.'
          )}
        </div>
      </div>

      {/* Action Button */}
      <div style={{ display: 'flex', gap: 10 }}>
        {canManage && (
          <button
            onClick={() => onSelect(guild.id)}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '11px 20px', borderRadius: 8,
              background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              border: 'none', color: '#FFFFFF',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
              transition: 'all 0.15s ease'
            }}
          >
            Manage Server <ChevronRight size={15} />
          </button>
        )}

        {!isOwner && (
          <button
            disabled
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '11px 20px', borderRadius: 8,
              background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#64748B', fontSize: 13, fontWeight: 600, cursor: 'not-allowed'
            }}
          >
            <Lock size={14} /> Owner ID Clearance Required
          </button>
        )}

        {isOwner && status === 'Not Registered' && (
          <a 
            href={BOT_INVITE_URL} 
            target="_blank" 
            rel="noopener noreferrer"
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '11px 20px', borderRadius: 8,
              background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
              border: 'none', color: '#FFFFFF',
              fontSize: 13, fontWeight: 700, textDecoration: 'none',
              boxShadow: '0 4px 14px rgba(59, 130, 246, 0.3)'
            }}
          >
            Invite Rage Bot <ExternalLink size={14} />
          </a>
        )}
      </div>
    </motion.div>
  );
}

export function ServerSelection({ onSelectGuild }: { onSelectGuild: (guildId: string) => void }) {
  const { user, managedGuilds, guildApprovals, logout, setActiveGuildId, updateDiscordGuilds, token } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterOwnerOnly, setFilterOwnerOnly] = useState(false);

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

  const ownedGuilds = managedGuilds.filter(g => g.owner);
  const otherGuilds = managedGuilds.filter(g => !g.owner);

  const filteredOwned = ownedGuilds.filter(g => g.name.toLowerCase().includes(search.toLowerCase()) || g.id.includes(search));
  const filteredOther = otherGuilds.filter(g => g.name.toLowerCase().includes(search.toLowerCase()) || g.id.includes(search));

  const avatarUrl = user?.avatar && user?.discordId
    ? getAvatarUrl(user.discordId, user.avatar)
    : null;

  return (
    <div style={{
      minHeight: '100vh', width: '100vw',
      backgroundColor: '#0B0F19',
      backgroundImage: 'radial-gradient(rgba(16, 185, 129, 0.08) 1px, transparent 1px)',
      backgroundSize: '28px 28px',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      color: '#F8FAFC'
    }}>
      {/* Top Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 36px',
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(16px)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img 
            src="/rglogo.png" 
            alt="Rage Optimiser" 
            style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'contain', filter: 'drop-shadow(0 0 8px rgba(16, 185, 129, 0.4))' }} 
          />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#F8FAFC', letterSpacing: '0.04em' }}>RAGE OPTIMISER</span>
            <span style={{ fontSize: 9.5, fontWeight: 700, color: '#10B981', letterSpacing: '0.12em' }}>OWNER SECURITY GATEWAY</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          {avatarUrl ? (
            <img 
              src={avatarUrl} 
              alt={user?.username}
              style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid #10B981' }} 
            />
          ) : (
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: '#1E293B',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, color: '#F8FAFC', fontSize: 13
            }}>
              {user?.username?.charAt(0).toUpperCase()}
            </div>
          )}
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#F8FAFC' }}>{user?.username}</div>
            <div style={{ fontSize: 11, color: '#10B981', fontWeight: 600 }}>Discord ID: {user?.discordId || 'Connected'}</div>
          </div>
          <button
            onClick={logout}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8,
              background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#F87171', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <LogOut size={13} /> Sign Out
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div style={{ flex: 1, padding: '36px 24px', maxWidth: 1040, margin: '0 auto', width: '100%' }}>
        
        {/* Banner Alert: Owner Only Policy */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            padding: '16px 20px', borderRadius: 12,
            background: 'linear-gradient(90deg, rgba(16, 185, 129, 0.12) 0%, rgba(15, 23, 42, 0.6) 100%)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            display: 'flex', alignItems: 'center', gap: 14,
            marginBottom: 28
          }}
        >
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: 'rgba(16, 185, 129, 0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#34D399', flexShrink: 0
          }}>
            <Crown size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#F8FAFC' }}>
              Owner-Only Dashboard Access Policy Active
            </div>
            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
              To ensure unbypassable enterprise security, configuration management is restricted to the **Discord Server Owner ID** only. Other administrators cannot alter system parameters.
            </div>
          </div>
        </motion.div>

        {/* Header Title & Search Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: '#F8FAFC', margin: '0 0 6px', letterSpacing: '-0.02em' }}>
              Select Authorized Server
            </h1>
            <p style={{ fontSize: 13.5, color: '#94A3B8', margin: 0 }}>
              {ownedGuilds.length} owned {ownedGuilds.length === 1 ? 'server' : 'servers'} eligible for management.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ position: 'relative', width: 260 }}>
              <Search size={15} color="#64748B" style={{ position: 'absolute', left: 12, top: 12 }} />
              <input 
                type="text" 
                placeholder="Search server name or ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px 10px 36px',
                  borderRadius: 10, background: '#161E2E',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#F8FAFC', fontSize: 13, outline: 'none'
                }}
              />
            </div>

            <button
              onClick={handleRefresh}
              disabled={refreshing}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 16px', borderRadius: 10,
                background: '#161E2E', border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#F8FAFC', fontSize: 13, fontWeight: 600, cursor: 'pointer'
              }}
            >
              {refreshing ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
              <span>Sync</span>
            </button>
          </div>
        </div>

        {/* Section 1: Owned Servers */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Crown size={18} color="#F59E0B" />
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#F8FAFC', margin: 0 }}>
              Your Owned Servers ({filteredOwned.length})
            </h2>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: 'rgba(16, 185, 129, 0.15)', color: '#34D399', fontWeight: 700 }}>
              Full Control Authorized
            </span>
          </div>

          {filteredOwned.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '40px 20px',
              background: '#161E2E', borderRadius: 14,
              border: '1px dashed rgba(255, 255, 255, 0.1)'
            }}>
              <Server size={32} color="#64748B" style={{ marginBottom: 10 }} />
              <div style={{ color: '#F8FAFC', fontWeight: 600, fontSize: 14 }}>No Owned Servers Found</div>
              <div style={{ color: '#64748B', fontSize: 12, marginTop: 4 }}>
                {search ? 'No owned server matches your search term.' : 'You do not own any Discord server on this account.'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 }}>
              {filteredOwned.map((guild) => (
                <GuildCard
                  key={guild.id}
                  guild={guild}
                  approval={guildApprovals[guild.id]}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          )}
        </div>

        {/* Section 2: Other Managed Servers (Locked) */}
        {filteredOther.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <Lock size={16} color="#94A3B8" />
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#94A3B8', margin: 0 }}>
                Other Managed Servers ({filteredOther.length})
              </h2>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: 'rgba(239, 68, 68, 0.15)', color: '#F87171', fontWeight: 700 }}>
                Owner ID Required (Locked)
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18, opacity: 0.85 }}>
              {filteredOther.map((guild) => (
                <GuildCard
                  key={guild.id}
                  guild={guild}
                  approval={guildApprovals[guild.id]}
                  onSelect={handleSelect}
                />
              ))}
            </div>
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
