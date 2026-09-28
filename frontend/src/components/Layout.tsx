import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, Shield, Gavel, Users, Zap, FileText, 
  LineChart, Settings, ShieldAlert, Bell, Search, Play, Pause, 
  Terminal, Server, Activity, ChevronDown, ChevronRight, Menu, X, AlertTriangle,
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
  const [navSearch, setNavSearch] = useState('');
  const { user, activeGuildId, managedGuilds, setActiveGuildId, guildApprovals } = useAuth();

  const isGuildManager = user?.role === 'guild_manager';
  const activeGuild = managedGuilds.find(g => g.id === activeGuildId);
  const avatarUrl = isGuildManager && user?.discordId && user?.avatar
    ? `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png`
    : null;

  // Streamlined, punchy navigation sections
  const navSections = [
    {
      id: 'overview',
      title: 'Overview',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
        { id: 'discord-dashboard', label: 'Discord Embed', icon: <LayoutTemplate size={16} /> },
        { id: 'enterprise-health', label: 'System Health', icon: <Activity size={16} /> },
        { id: 'health', label: 'Config Health', icon: <AlertTriangle size={16} /> },
      ]
    },
    {
      id: 'security',
      title: 'Security & Defense',
      items: [
        { id: 'security', label: 'Security SOC', icon: <Shield size={16} /> },
        { id: 'anti-nuke', label: 'Anti-Nuke Rules', icon: <ShieldCheck size={16} /> },
        { id: 'upm', label: 'Disaster Recovery', icon: <Zap size={16} /> },
        { id: 'whitelist-overview', label: 'Smart Whitelist', icon: <ShieldCheck size={16} /> },
        { id: 'vulnerability-scan', label: 'Vulnerability Scan', icon: <Activity size={16} /> },
        { id: 'security-logs', label: 'Security Logs', icon: <FileText size={16} /> },
      ]
    },
    {
      id: 'management',
      title: 'Server Management',
      items: [
        { id: 'automod', label: 'AI AutoMod', icon: <Bot size={16} /> },
        { id: 'backups', label: 'Server Snapshots', icon: <Database size={16} /> },
        { id: 'roles', label: 'Role Manager', icon: <Layers size={16} /> },
        { id: 'bulk_ops', label: 'Bulk Operations', icon: <Zap size={16} /> },
      ]
    },
    {
      id: 'automations',
      title: 'Automations',
      items: [
        { id: 'automation', label: 'Automation Studio', icon: <Zap size={16} /> },
        { id: 'welcome', label: 'Welcome & Gate', icon: <Sparkles size={16} /> },
        { id: 'tickets', label: 'Ticket Desk', icon: <MessageSquare size={16} /> },
        { id: 'reaction_roles', label: 'Reaction Roles', icon: <Sparkles size={16} /> },
        { id: 'leveling', label: 'Leveling & XP', icon: <Award size={16} /> },
        { id: 'giveaway', label: 'Giveaways', icon: <Gift size={16} /> },
        { id: 'announcements', label: 'Announcements', icon: <Send size={16} /> },
        { id: 'reminders', label: 'Reminders', icon: <Bell size={16} /> },
        { id: 'social_updates', label: 'Social Feeds', icon: <Radio size={16} /> },
      ]
    },
    {
      id: 'system',
      title: 'Voice & System',
      items: [
        { id: 'voice', label: 'Voice Presence', icon: <Volume2 size={16} /> },
        { id: 'join-to-create', label: 'Dynamic Voice', icon: <Volume2 size={16} /> },
        { id: 'voice-protection', label: 'Voice Protection', icon: <ShieldAlert size={16} /> },
        { id: 'logs', label: 'System Logs', icon: <FileText size={16} /> },
        { id: 'audit', label: 'Audit Trail', icon: <History size={16} /> },
        { id: 'diagnostics', label: 'Diagnostics', icon: <Cpu size={16} /> },
        { id: 'analytics', label: 'Analytics', icon: <LineChart size={16} /> },
        { id: 'settings', label: 'Server Settings', icon: <Settings size={16} /> },
      ]
    }
  ];

  // Collapsible category states
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    overview: true,
    security: true,
    management: false,
    automations: false,
    system: false
  });

  // Automatically expand the section that contains the active page
  useEffect(() => {
    navSections.forEach(sec => {
      if (sec.items.some(item => item.id === activePage)) {
        setOpenSections(prev => ({ ...prev, [sec.id]: true }));
      }
    });
  }, [activePage]);

  const toggleSection = (secId: string) => {
    setOpenSections(prev => ({ ...prev, [secId]: !prev[secId] }));
  };

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
            width: '14px', 
            height: '14px' 
          }}
        >
          <AlertTriangle size={9} color="#EF4444" />
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
        {/* Logo Header */}
        <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px' }}>
          <img 
            src="/rglogo.png" 
            alt="Rage Optimiser Logo" 
            style={{ 
              width: '32px', 
              height: '32px', 
              borderRadius: '8px', 
              objectFit: 'contain', 
              flexShrink: 0 
            }} 
          />
          <div className="logo-text" style={{ textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.04em', color: '#09090B', display: 'flex', flexDirection: 'column' }}>
            RAGE OPTIMISER
            <span style={{ fontSize: '9px', color: '#71717A', fontWeight: 700, letterSpacing: '0.1em' }}>V3 ENTERPRISE</span>
          </div>
          <button 
            style={{ marginLeft: 'auto' }} 
            className="menu-toggle"
            onClick={() => setMobileMenuOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        {/* Server Context Banner */}
        {isGuildManager && activeGuild && (
          <div style={{ 
            padding: '10px 14px', 
            borderBottom: '1px solid var(--border-color)', 
            backgroundColor: 'var(--bg-secondary)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            gap: '8px' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              {activeGuild.icon ? (
                <img 
                  src={`https://cdn.discordapp.com/icons/${activeGuild.id}/${activeGuild.icon}.png`} 
                  alt={activeGuild.name} 
                  style={{ width: '26px', height: '26px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }} 
                />
              ) : (
                <div style={{ width: '26px', height: '26px', borderRadius: '6px', backgroundColor: '#09090B', color: '#FFF', fontSize: '10px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {activeGuild.name.substring(0, 2).toUpperCase()}
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeGuild.name}
                </div>
                <div style={{ fontSize: '10px', color: '#16A34A', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#16A34A' }} />
                  Active Server
                </div>
              </div>
            </div>
            <button 
              onClick={() => setActiveGuildId(null)}
              title="Switch Server"
              style={{
                padding: '3px 8px',
                fontSize: '11px',
                fontWeight: 600,
                backgroundColor: '#FFFFFF',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                flexShrink: 0
              }}
            >
              Switch
            </button>
          </div>
        )}

        {/* Quick Nav Search Input */}
        <div style={{ padding: '8px 12px 0' }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Quick jump..."
              value={navSearch}
              onChange={e => setNavSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px 6px 30px',
                fontSize: '11px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                outline: 'none'
              }}
            />
            {navSearch && (
              <button 
                onClick={() => setNavSearch('')} 
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Navigation Stream */}
        <nav className="sidebar-nav">
          {navSections.map(section => {
            const isSectionOpen = openSections[section.id] || Boolean(navSearch.trim());
            const filteredItems = section.items.filter(item => 
              !navSearch.trim() || item.label.toLowerCase().includes(navSearch.toLowerCase())
            );

            if (filteredItems.length === 0) return null;

            return (
              <div key={section.id} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {/* Collapsible Section Header */}
                <div 
                  className="nav-section-header" 
                  onClick={() => toggleSection(section.id)}
                >
                  <div className="nav-section-title">
                    <span>{section.title}</span>
                    <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', backgroundColor: '#F4F4F5', color: '#71717A', fontWeight: 600 }}>
                      {filteredItems.length}
                    </span>
                  </div>
                  {isSectionOpen ? <ChevronDown size={12} color="#71717A" /> : <ChevronRight size={12} color="#71717A" />}
                </div>

                {/* Section Items */}
                {isSectionOpen && filteredItems.map(item => (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    className={`nav-item ${activePage === item.id ? 'active' : ''}`}
                    title={item.label}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                    {getModuleBadge(item.id)}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>

        {/* User profile footer */}
        <div className="sidebar-footer" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderTop: '1px solid var(--border-color)', backgroundColor: '#FAFAFA' }}>
          <div className="user-avatar" style={{ padding: 0, overflow: 'hidden', backgroundColor: 'transparent', flexShrink: 0, width: '32px', height: '32px' }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt={user?.username} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
            ) : (
              <img src="/rglogo.png" alt="Admin" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            )}
          </div>
          <div className="user-info" style={{ flex: 1, minWidth: 0 }}>
            <span className="user-name" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px', fontWeight: 700 }}>
              {user?.username || 'Administrator'}
            </span>
            <span className="user-role" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '10px', color: 'var(--text-muted)' }}>
              {isGuildManager ? 'Guild Manager' : 'Server Owner'}
            </span>
          </div>
          <button
            onClick={onLogout}
            title="Logout"
            style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '6px',
              color: '#dc2626',
              cursor: 'pointer',
              padding: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.2)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.08)'; }}
          >
            <LogOut size={14} />
          </button>
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
