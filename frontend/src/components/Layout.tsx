import React, { useState } from 'react';
import { 
  LayoutDashboard, Shield, Gavel, Users, Zap, FileText, 
  LineChart, Settings, ShieldAlert, Bell, Search, Play, Pause, 
  Terminal, Server, Activity, ChevronDown, Menu, X, AlertTriangle,
  Volume2, ShieldCheck, LogOut, LayoutTemplate, Music, RefreshCw,
  Gift, Send, Sparkles, Award, Radio, MessageSquare
} from 'lucide-react';
import type { NotificationItem } from '../hooks/useActivityFeed';
import { NotificationsMenu } from './NotificationsMenu';
import { useAuth } from '../hooks/useAuth';

interface LayoutProps {
  children: React.ReactNode;
  activePage: string;
  onPageChange: (page: string, tab?: string) => void;
  notifications: NotificationItem[];
  latency: number;
  uptime: string;
  isLive: boolean;
  onToggleLive: () => void;
  onMarkAllRead: () => void;
  onClearNotifications: () => void;
  onOpenSearch: () => void;
  onLogout: () => void;
  modules: any[];
}

export function Layout({
  children,
  activePage,
  onPageChange,
  notifications,
  latency,
  uptime,
  isLive,
  onToggleLive,
  onMarkAllRead,
  onClearNotifications,
  onOpenSearch,
  onLogout,
  modules
}: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const { user, activeGuildId, managedGuilds, setActiveGuildId, guildApprovals } = useAuth();

  const isGuildManager = user?.role === 'guild_manager';
  const activeGuild = managedGuilds.find(g => g.id === activeGuildId);
  const avatarUrl = isGuildManager && user?.discordId && user?.avatar
    ? `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png`
    : null;

  const navigationItems = [
    { id: 'dashboard', label: 'Web Dashboard', icon: <LayoutDashboard size={18} /> },
    { id: 'discord-dashboard', label: 'Discord Dashboard', icon: <LayoutTemplate size={18} /> },
    { id: 'health', label: 'Config Health', icon: <AlertTriangle size={18} color="var(--color-warning)" /> },
    { id: 'security', label: 'Security Panel', icon: <Shield size={18} /> },
    { id: 'giveaway', label: 'Giveaways', icon: <Gift size={18} /> },
    { id: 'announcements', label: 'Announcements', icon: <Send size={18} /> },
    { id: 'join_to_create', label: 'Join To Create', icon: <Volume2 size={18} /> },
    { id: 'reaction_roles', label: 'Reaction Roles', icon: <Sparkles size={18} /> },
    { id: 'leveling', label: 'Leveling & XP', icon: <Award size={18} /> },
    { id: 'reminders', label: 'Reminder System', icon: <Bell size={18} /> },
    { id: 'welcome', label: 'Welcome System V2', icon: <Sparkles size={18} color="#d4af37" /> },
    { id: 'tickets', label: 'Tickets System V2', icon: <MessageSquare size={18} color="#d4af37" /> },
    { id: 'roles', label: 'Roles Manager', icon: <span style={{ fontSize: 14 }}>🎭</span> },
  ];

  const whitelistItems = [
    { id: 'whitelist-overview', label: 'Overview', icon: <ShieldCheck size={18} /> },
    { id: 'whitelist-bots', label: 'Bot Whitelist', icon: <Zap size={18} /> },
    { id: 'whitelist-members', label: 'Member Whitelist', icon: <Users size={18} /> },
    { id: 'whitelist-roles', label: 'Role Whitelist', icon: <Shield size={18} /> },
    { id: 'whitelist-activity', label: 'Activity Logs', icon: <FileText size={18} /> },
    { id: 'whitelist-audit', label: 'Audit Log', icon: <AlertTriangle size={18} /> },
    { id: 'whitelist-settings', label: 'Settings', icon: <Settings size={18} /> },
  ];

  const automationItems = [
    { id: 'incidents', label: 'Incident Center', icon: <AlertTriangle size={18} /> },
    { id: 'automation', label: 'Automation', icon: <Zap size={18} /> },
    // H-1 FIX: ID must match the module manifest ID ('social_updates' with underscore)
    // The sidebar nav uses this id both for active-state highlighting AND for getModuleBadge() lookup.
    { id: 'social_updates', label: 'Social Updates', icon: <Radio size={18} /> },
    { id: 'logs', label: 'Logs Timeline', icon: <FileText size={18} /> },
    { id: 'analytics', label: 'Analytics', icon: <LineChart size={18} /> },
  ];

  const controlPanelItems = [
    { id: 'voice', label: 'Voice Presence', icon: <Volume2 size={18} /> },
    { id: 'voice-protection', label: 'Voice Protection', icon: <ShieldAlert size={18} /> },
    { id: 'music', label: 'Music System', icon: <Music size={18} /> },
    { id: 'settings', label: 'Global Settings', icon: <Settings size={18} /> },
  ];

  const handleNavClick = (pageId: string) => {
    onPageChange(pageId);
    setMobileMenuOpen(false);
  };

  const getModuleBadge = (itemId: string) => {
    const mod = (modules || []).find(m => m.id === itemId);
    if (!mod) return null;
    if (mod.status === 'validation_failed') {
      return (
        <span 
          title={mod.errors.join('\n')}
          style={{ 
            marginLeft: 'auto', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            backgroundColor: 'rgba(239,68,68,0.15)', 
            borderRadius: '50%', 
            width: '16px', 
            height: '16px' 
          }}
        >
          <AlertTriangle size={10} color="#EF4444" />
        </span>
      );
    }
    if (mod.status === 'config_required') {
      return (
        <span 
          title="Configuration Required"
          style={{ 
            marginLeft: 'auto', 
            width: '6px', 
            height: '6px', 
            borderRadius: '50%', 
            backgroundColor: 'var(--color-warning)' 
          }} 
        />
      );
    }
    return null;
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="app-container">
      {/* Sidebar navigation */}
      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div className="brand-badge-icon" style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #ff5e3a 0%, #ff2a6d 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 800,
            fontSize: '14px',
            boxShadow: '0 0 12px rgba(255, 94, 58, 0.4)',
            flexShrink: 0
          }}>RO</div>
          <span className="logo-text" style={{ textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.05em', color: '#fff' }}>RAGE OPTIMISER</span>
          <button 
            style={{ marginLeft: 'auto' }} 
            className="menu-toggle"
            onClick={() => setMobileMenuOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-title">Operations</div>
          {navigationItems.map(item => (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`nav-item ${activePage === item.id ? 'active' : ''}`}
            >
              {item.icon}
              <span>{item.label}</span>
              {getModuleBadge(item.id)}
            </button>
          ))}

          <div className="nav-section-title">Whitelist & Trust</div>
          {whitelistItems.map(item => (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`nav-item ${activePage === item.id ? 'active' : ''}`}
              style={{ paddingLeft: '24px' }}
            >
              {item.icon}
              <span style={{ fontSize: '13px' }}>{item.label}</span>
              {getModuleBadge(item.id)}
            </button>
          ))}

          <div className="nav-section-title">Automations & Analysis</div>
          {automationItems.map(item => (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`nav-item ${activePage === item.id ? 'active' : ''}`}
            >
              {item.icon}
              <span>{item.label}</span>
              {getModuleBadge(item.id)}
            </button>
          ))}

          <div className="nav-section-title">Control Panel</div>
          {controlPanelItems.map(item => (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`nav-item ${activePage === item.id ? 'active' : ''}`}
            >
              {item.icon}
              <span>{item.label}</span>
              {getModuleBadge(item.id)}
            </button>
          ))}
        </nav>

        {/* User profile footer */}
        <div className="sidebar-footer" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)' }}>
          {/* Switch server button for guild managers */}
          {isGuildManager && (
            // M-8 FIX: Use proper state management — setActiveGuildId(null) causes
            // App.tsx to re-render the guild selector screen without a hard reload.
            <button
              onClick={() => { setActiveGuildId(null); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 10px', borderRadius: 8, width: '100%',
                background: 'rgba(124,92,252,0.08)', border: '1px solid rgba(124,92,252,0.2)',
                color: '#7C5CFC', fontSize: 12, fontWeight: 600, cursor: 'pointer'
              }}
            >
              <RefreshCw size={12} /> Switch Server
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="user-avatar" style={{ padding: 0, overflow: 'hidden', backgroundColor: 'transparent', flexShrink: 0 }}>
              {avatarUrl ? (
                <img src={avatarUrl} alt={user?.username} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
              ) : (
                <img src="/ro-logo.png" alt="Admin" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              )}
            </div>
            <div className="user-info" style={{ flex: 1, minWidth: 0 }}>
              <span className="user-name" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.username || 'Administrator'}</span>
              <span className="user-role" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isGuildManager ? 'Guild Manager' : 'Server Owner'}</span>
            </div>
            <button
              onClick={onLogout}
              title="Logout"
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: '8px',
                color: '#f87171',
                cursor: 'pointer',
                padding: '7px 8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.25)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)'; }}
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main View Wrapper */}
      <div className="main-wrapper" onClick={() => setNotifOpen(false)}>
        
        {/* Topbar navigation */}
        <header className="topbar">
          <div className="topbar-left">
            <button 
              className="menu-toggle" 
              onClick={(e) => { e.stopPropagation(); setMobileMenuOpen(!mobileMenuOpen); }}
              style={{ padding: '4px', cursor: 'pointer' }}
            >
              <Menu size={20} />
            </button>

            {/* Server Name Display */}
            <div className="server-selector" style={{ cursor: 'default' }}>
              {activeGuild && activeGuild.icon ? (
                <img
                  src={`https://cdn.discordapp.com/icons/${activeGuild.id}/${activeGuild.icon}.png`}
                  alt={activeGuild.name}
                  style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover', marginRight: 2 }}
                />
              ) : (
                <div className="server-icon" style={{ padding: 0, overflow: 'hidden', backgroundColor: 'transparent' }}>
                  <img src="/ro-logo.png" alt="RO" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
              )}
              <span style={{ fontWeight: 600 }}>{activeGuild?.name || 'Rage Optimiser'}</span>
            </div>
          </div>

          <div className="topbar-right">
            {/* Global Search Bar */}
            <div className="search-trigger" onClick={onOpenSearch}>
              <Search size={14} />
              <span>Search dashboard...</span>
              <span className="search-shortcut">Ctrl+K</span>
            </div>

            {/* Live Feed Toggle Switch */}
            <button 
              className="icon-btn" 
              onClick={onToggleLive}
              title={isLive ? "Pause Live WebSocket Feed" : "Resume Live WebSocket Feed"}
            >
              {isLive ? <Pause size={16} color="var(--color-success)" /> : <Play size={16} color="var(--text-muted)" />}
            </button>

            {/* Notification bell dropdown */}
            <div style={{ position: 'relative' }}>
              <button 
                className="icon-btn" 
                onClick={(e) => { e.stopPropagation(); setNotifOpen(!notifOpen); }}
              >
                <Bell size={16} />
                {unreadCount > 0 && <span className="notification-dot" />}
              </button>
              {notifOpen && (
                <NotificationsMenu
                  notifications={notifications}
                  onClose={() => setNotifOpen(false)}
                  onNavigate={onPageChange}
                  onMarkAllRead={onMarkAllRead}
                  onClear={onClearNotifications}
                />
              )}
            </div>
          </div>
        </header>

        {/* View Content Port */}
        <main className="content-area">
          {children}
        </main>

        {/* Status bar footer */}
        <footer className="app-footer">
          <div className="footer-section">
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Terminal size={12} />
              <span>CN Core: v4.2.1-enterprise</span>
            </span>
          </div>

          <div className="footer-section">
            <div className="status-indicator">
              <Activity size={12} />
              <span>API Gateway: </span>
              <span style={{ color: 'var(--text-primary)' }}>{latency}ms</span>
            </div>

            <div className="status-indicator">
              <Server size={12} />
              <span>Gateway:</span>
              {/* M-2 FIX: Show real connection status from isLive prop */}
              <span className={`status-dot ${isLive ? 'pulse' : ''}`} style={{ backgroundColor: isLive ? undefined : 'var(--color-danger)' }} />
              <span style={{ color: isLive ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 600 }}>
                {isLive ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>

            <div style={{ color: 'var(--text-muted)' }}>
              Uptime: <span style={{ color: 'var(--text-primary)' }}>{uptime}</span>
            </div>
          </div>
        </footer>

      </div>
    </div>
  );
}
