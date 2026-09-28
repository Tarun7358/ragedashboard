import React, { useState } from 'react';
import { 
  LayoutDashboard, Shield, Gavel, Users, Zap, FileText, 
  LineChart, Settings, ShieldAlert, Bell, Search, Play, Pause, 
  Terminal, Server, Activity, ChevronDown, Menu, X, AlertTriangle,
  Volume2, ShieldCheck, LogOut, LayoutTemplate, RefreshCw,
  Gift, Send, Sparkles, Award, Radio, MessageSquare, Bot, Layers, Database, History, Cpu
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

  const overviewItems = [
    { id: 'dashboard', label: 'Web Dashboard', icon: <LayoutDashboard size={18} /> },
    { id: 'discord-dashboard', label: 'Discord Interactive Dashboard', icon: <LayoutTemplate size={18} /> },
    { id: 'enterprise-health', label: 'Enterprise System Health', icon: <Activity size={18} /> },
    { id: 'health', label: 'Config Health', icon: <AlertTriangle size={18} /> },
  ];

  const securitySectorItems = [
    { id: 'security', label: 'Security Threat Analysis & SOC', icon: <Shield size={18} /> },
    { id: 'anti-nuke', label: 'Anti-Nuke & Threat Rules', icon: <ShieldCheck size={18} /> },
    { id: 'upm', label: 'Ultra Protection (UPM)', icon: <Zap size={18} /> },
    { id: 'whitelist-overview', label: 'Smart Whitelist & Trust', icon: <ShieldCheck size={18} /> },
    { id: 'vulnerability-scan', label: 'Vulnerability Scanner', icon: <Activity size={18} /> },
    { id: 'security-logs', label: 'Security Timeline Logs', icon: <FileText size={18} /> },
  ];

  const serverManagementItems = [
    { id: 'automod', label: 'AI Automod & Anti-Link', icon: <Bot size={18} /> },
    { id: 'backups', label: '5-Min Disaster Snapshots', icon: <Database size={18} /> },
    { id: 'roles', label: 'Roles & Temp-Role Manager', icon: <Layers size={18} /> },
    { id: 'bulk_ops', label: 'Bulk Operations & Cleanup', icon: <Zap size={18} /> },
  ];

  const automationItems = [
    { id: 'automation', label: 'Automation Studio', icon: <Zap size={18} /> },
    { id: 'welcome', label: 'Welcome & Gate Verification', icon: <Sparkles size={18} /> },
    { id: 'tickets', label: 'Tickets System V2', icon: <MessageSquare size={18} /> },
    { id: 'reaction_roles', label: 'Reaction Roles', icon: <Sparkles size={18} /> },
    { id: 'leveling', label: 'Leveling & XP Engine', icon: <Award size={18} /> },
    { id: 'giveaway', label: 'Giveaways Manager', icon: <Gift size={18} /> },
    { id: 'announcements', label: 'Announcements Engine', icon: <Send size={18} /> },
    { id: 'reminders', label: 'Scheduled Reminders', icon: <Bell size={18} /> },
    { id: 'social_updates', label: 'Social Feeds (YT & IG)', icon: <Radio size={18} /> },
  ];

  const systemItems = [
    { id: 'voice', label: 'Voice Presence & Hubs', icon: <Volume2 size={18} /> },
    { id: 'join-to-create', label: 'Join to Create Dynamic Voice', icon: <Volume2 size={18} /> },
    { id: 'voice-protection', label: 'Voice Protection Guard', icon: <ShieldAlert size={18} /> },
    { id: 'logs', label: 'System Logs & Audits', icon: <FileText size={18} /> },
    { id: 'audit', label: 'Discord Audit Trail', icon: <History size={18} /> },
    { id: 'diagnostics', label: 'Diagnostics & Health', icon: <Cpu size={18} /> },
    { id: 'analytics', label: 'Telemetry & Analytics', icon: <LineChart size={18} /> },
    { id: 'settings', label: 'Global Server Settings', icon: <Settings size={18} /> },
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
        <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img 
            src="/rglogo.png" 
            alt="Rage Optimiser Logo" 
            style={{ 
              width: '36px', 
              height: '36px', 
              borderRadius: '8px', 
              objectFit: 'contain', 
              flexShrink: 0 
            }} 
          />
          <div className="logo-text" style={{ textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.04em', color: '#09090B', display: 'flex', flexDirection: 'column' }}>
            RAGE OPTIMISER
            <span style={{ fontSize: '9px', color: '#71717A', fontWeight: 700, letterSpacing: '0.12em' }}>V3 ENTERPRISE</span>
          </div>
          <button 
            style={{ marginLeft: 'auto' }} 
            className="menu-toggle"
            onClick={() => setMobileMenuOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-title">Overview & Control</div>
          {overviewItems.map(item => (
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

          <div className="nav-section-title">Security Operations & Defense</div>
          {securitySectorItems.map(item => (
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

          <div className="nav-section-title">Server Management & Defense</div>
          {serverManagementItems.map(item => (
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

          <div className="nav-section-title">Automations & Community</div>
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

          <div className="nav-section-title">System & Voice Suite</div>
          {systemItems.map(item => (
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
                background: '#F4F4F5', border: '1px solid #E4E4E7',
                color: '#09090B', fontSize: 12, fontWeight: 600, cursor: 'pointer'
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
                <img src="/rglogo.png" alt="Admin" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
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
                  <img src="/rglogo.png" alt="RO" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
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
