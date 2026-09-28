import { API_BASE, DISCORD_CLIENT_ID } from '../config';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Zap, Users, Music, FileText, BarChart2, Bot, Lock,
  CheckCircle2, Server, Globe, Activity, ArrowRight, Sparkles,
  Sliders, RefreshCw, AlertTriangle, Terminal, Search, Radio,
  Award, Bell, ShieldCheck, Database, Headphones, Layers,
  ChevronDown, ExternalLink
} from 'lucide-react';

const FEATURES_TABS = [
  {
    id: 'anti-nuke',
    icon: <Shield size={18} />,
    title: 'Enterprise Anti-Nuke',
    tagline: 'Sub-millisecond containment',
    desc: 'Automated protection guards roles, channels, emojis, and webhooks against malicious bots or rogue administrators. Unauthorized mass deletions trigger instant quarantine and auto-rollback.',
    badge: 'Core Defense',
    mockup: {
      title: 'Shield Activity Log',
      lines: [
        { type: 'warning', time: '14:22:01', text: 'Suspicious burst: 4 roles deleted within 800ms' },
        { type: 'danger', time: '14:22:01', text: 'Anti-Nuke triggered: Rogue administrator quarantined' },
        { type: 'success', time: '14:22:02', text: 'Permissions revoked & audit snapshot restored from database' },
        { type: 'info', time: '14:22:02', text: 'Incident report generated and dispatched to staff webhook' }
      ]
    }
  },
  {
    id: 'backups',
    icon: <Database size={18} />,
    title: 'Automated Snapshots',
    tagline: '5-Minute Disaster Recovery Engine',
    desc: 'Rage Optimiser continuously snapshots your entire server topology every 5 minutes. Channels, permissions, categories, roles, and overrides are backed up with instant 1-click restore.',
    badge: 'Disaster Recovery',
    mockup: {
      title: 'Server Snapshot Engine',
      lines: [
        { type: 'info', time: '14:20:00', text: 'Scheduled 5-minute automated snapshot initiated' },
        { type: 'success', time: '14:20:01', text: 'Captured 42 channels, 18 roles, 156 permission overrides' },
        { type: 'info', time: '14:20:01', text: 'Encrypted snapshot saved to persistent storage' },
        { type: 'success', time: '14:20:02', text: 'Ready for 1-click full or selective rollback at any time' }
      ]
    }
  },
  {
    id: 'automod',
    icon: <Lock size={18} />,
    title: 'Advanced AutoMod',
    tagline: 'Intelligent Content & Raid Defense',
    desc: 'Block invite links, scam URLs, mention cascades, and spam before users ever see them. Configure fine-grained punishments from automatic message purge to instant timeouts.',
    badge: 'Automated Safety',
    mockup: {
      title: 'AutoMod Real-Time Interceptor',
      lines: [
        { type: 'warning', time: '14:25:12', text: 'Suspicious message blocked: discord.gg invite link detected' },
        { type: 'info', time: '14:25:12', text: 'Action taken: Message deleted, user warned (Warning 1/3)' },
        { type: 'warning', time: '14:25:19', text: 'Repeated attempt: Mention burst (12 mentions in single message)' },
        { type: 'danger', time: '14:25:19', text: 'AutoMod escalation: User placed in timeout for 1 hour' }
      ]
    }
  },
  {
    id: 'voice',
    icon: <Headphones size={18} />,
    title: 'Join-to-Create Voice Hubs',
    tagline: 'Dynamic Temporary Voice Rooms',
    desc: 'Members join a designated lobby to instantly spawn their own private voice channel. Creators receive intuitive in-chat or panel controls to lock, hide, rename, and set user limits.',
    badge: 'Voice Infrastructure',
    mockup: {
      title: 'Join to Create Controller',
      lines: [
        { type: 'info', time: '14:30:05', text: 'Member RDXYZ connected to [➕ Create Voice Lobby]' },
        { type: 'success', time: '14:30:05', text: 'Created temporary channel: "RDXYZ\'s Lounge" (Limit: 5)' },
        { type: 'info', time: '14:30:06', text: 'Transferred user to dynamic room & assigned temporary owner key' },
        { type: 'info', time: '14:45:10', text: 'All members left. Channel automatically cleaned up in 0ms' }
      ]
    }
  },
  {
    id: 'community',
    icon: <Award size={18} />,
    title: 'Leveling & Engagement',
    tagline: 'XP, Reaction Roles & Giveaways',
    desc: 'Drive server activity with customizable text/voice XP rewards, dynamic rank cards, interactive button & menu reaction roles, timed giveaways, and welcome embed builders.',
    badge: 'Gamification & Growth',
    mockup: {
      title: 'Community Engine Status',
      lines: [
        { type: 'success', time: '14:32:00', text: 'Level up: User RDXYZ reached Level 25 (+500 XP bonus)' },
        { type: 'info', time: '14:32:00', text: 'Role rewarded: @Elite Member automatically assigned' },
        { type: 'info', time: '14:35:10', text: 'Giveaway concluded: Nitro Classic (Winner: @Alex, 42 entries)' },
        { type: 'success', time: '14:36:00', text: 'Reaction role claimed: @Developer button toggled' }
      ]
    }
  },
  {
    id: 'tickets',
    icon: <FileText size={18} />,
    title: 'Multi-Queue Support Desks',
    tagline: 'SLA Support Desks & HTML Transcripts',
    desc: 'Streamline member inquiries with categorized button tickets, staff claim controls, private conversation threads, and comprehensive HTML transcripts saved directly to your dashboard.',
    badge: 'Support Workflows',
    mockup: {
      title: 'Support Ticket Registry',
      tickets: [
        { id: 'TKT-1042', user: 'RDXYZ', subject: 'Server Verification Help', status: 'In Progress', priority: 'High' },
        { id: 'TKT-1041', user: 'GamerPro', subject: 'Report Malicious Link', status: 'Resolved', priority: 'Medium' },
        { id: 'TKT-1040', user: 'Nova_X', subject: 'Partnership Inquiry', status: 'Pending', priority: 'Low' }
      ]
    }
  }
];

const STATS = [
  { val: '25+', label: 'Protected Servers' },
  { val: '100,000+', label: 'Secured Members' },
  { val: '99.99%', label: 'Gateway Uptime' },
  { val: '< 20ms', label: 'Response Latency' },
];

const ALL_FEATURES_GRID = [
  {
    icon: <ShieldCheck size={20} />,
    title: 'Enterprise Anti-Nuke',
    desc: 'Automatic rate-limiting and quarantine against rogue bans, kicks, role/channel deletions, and webhook abuse.'
  },
  {
    icon: <Database size={20} />,
    title: '5-Minute Auto-Backups',
    desc: 'Continuous automated snapshots of roles, permissions, channels, and settings with one-click restore wizards.'
  },
  {
    icon: <Lock size={20} />,
    title: 'Intelligent AutoMod',
    desc: 'Neural filters blocking scam links, unauthorized invites, mass mentions, and toxic phrases in real time.'
  },
  {
    icon: <Headphones size={20} />,
    title: 'Join to Create Voice',
    desc: 'Dynamic temporary voice channel generation with custom member limits, lock controls, and zero-delay cleanup.'
  },
  {
    icon: <Award size={20} />,
    title: 'Leveling & XP Engine',
    desc: 'Comprehensive text & voice activity tracking, custom multipliers, server rank cards, and automated tier roles.'
  },
  {
    icon: <Layers size={20} />,
    title: 'Reaction & Button Roles',
    desc: 'Interactive buttons and select menus for seamless onboarding, community interest opt-ins, and verified roles.'
  },
  {
    icon: <FileText size={20} />,
    title: 'Ticket Support Desks',
    desc: 'Multi-category ticket routing, staff auto-assignment, claim mechanisms, and searchable HTML transcript logs.'
  },
  {
    icon: <Radio size={20} />,
    title: 'Social Media Broadcasts',
    desc: 'Automated webhook broadcasts for YouTube uploads, Instagram posts, and Twitch live alerts with embed styling.'
  },
  {
    icon: <Bell size={20} />,
    title: 'Giveaway Engine',
    desc: 'Interactive giveaway creation with minimum server requirements, automated winner countdowns, and rerolls.'
  },
  {
    icon: <Activity size={20} />,
    title: 'Live Telemetry & Audits',
    desc: 'Real-time WebSocket telemetry, role drift monitoring, latency health indicators, and security log registry.'
  },
  {
    icon: <Sliders size={20} />,
    title: 'Embed Builder Studio',
    desc: 'WYSIWYG embed creator for server announcements, welcome messages, rules, and structured system guides.'
  },
  {
    icon: <Zap size={20} />,
    title: 'Voice Presence & Security',
    desc: 'Enforce channel mute/deafen rules, monitor voice presence, and quarantine voice spoofers automatically.'
  }
];

const COMMANDS_DATA = [
  {
    category: 'security',
    name: '/status',
    desc: 'Display comprehensive system health, latency, active protection modules, and database sync.',
    usage: '/status'
  },
  {
    category: 'security',
    name: '/backup',
    desc: 'Trigger a manual full-server snapshot or view existing backup snapshots.',
    usage: '/backup action:create'
  },
  {
    category: 'moderation',
    name: '/ban',
    desc: 'Permanently ban a member and log the infraction to the security audit trail.',
    usage: '/ban user:@User reason:Raid attempt'
  },
  {
    category: 'moderation',
    name: '/kick',
    desc: 'Kick a member from the server with audit logging.',
    usage: '/kick user:@User reason:Repeated warnings'
  },
  {
    category: 'moderation',
    name: '/timeout',
    desc: 'Temporarily isolate a user from speaking or typing (e.g. 10m, 1h, 1d).',
    usage: '/timeout user:@User duration:30m reason:Spam'
  },
  {
    category: 'moderation',
    name: '/purge',
    desc: 'Cleanly delete up to 100 messages in the current channel instantly.',
    usage: '/purge amount:50'
  },
  {
    category: 'moderation',
    name: '/lock',
    desc: 'Instantly lock the text channel, revoking @everyone message send permissions.',
    usage: '/lock reason:Raid containment'
  },
  {
    category: 'moderation',
    name: '/unlock',
    desc: 'Unlock a locked channel and restore normal messaging permissions.',
    usage: '/unlock'
  },
  {
    category: 'community',
    name: '/rank',
    desc: 'View your personal or another member\'s XP card, level, and leaderboard rank.',
    usage: '/rank user:@User'
  },
  {
    category: 'community',
    name: '/leaderboard',
    desc: 'Display the server\'s top active members ranked by XP and message volume.',
    usage: '/leaderboard'
  },
  {
    category: 'community',
    name: '/ticket',
    desc: 'Open a support ticket panel with interactive category buttons.',
    usage: '/ticket'
  },
  {
    category: 'community',
    name: '/giveaway',
    desc: 'Launch a timed community giveaway with customizable winners and prizes.',
    usage: '/giveaway duration:24h winners:1 prize:Discord Nitro'
  }
];

export function Landing({ onGetStarted }: { onGetStarted: () => void }) {
  const [liveStatus, setLiveStatus] = useState<{ latency?: number; online?: boolean } | null>(null);
  const [activeTab, setActiveTab] = useState('anti-nuke');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'security' | 'moderation' | 'community'>('all');

  useEffect(() => {
    const checkStatus = () => {
      fetch(`${API_BASE}/api/status`)
        .then(r => r.json())
        .then(d => setLiveStatus({ latency: d.latency, online: true }))
        .catch(() => setLiveStatus({ online: false }));
    };

    checkStatus();
    const interval = setInterval(checkStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const BOT_INVITE = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&permissions=8&scope=bot%20applications.commands`;
  const activeFeature = FEATURES_TABS.find(f => f.id === activeTab) || FEATURES_TABS[0];

  const filteredCommands = COMMANDS_DATA.filter(cmd => {
    const matchesCategory = selectedCategory === 'all' || cmd.category === selectedCategory;
    const matchesSearch = cmd.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          cmd.desc.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="landing-root">
      {/* ── TOP NAVIGATION BAR ─────────────────────────────────────── */}
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <div className="landing-brand">
            <img 
              src="/rglogo.png" 
              alt="Rage Optimiser" 
              className="landing-logo"
            />
            <div className="brand-titles">
              <span className="brand-main">RAGE OPTIMISER</span>
              <span className="brand-badge">ENTERPRISE V3</span>
            </div>
            {liveStatus?.online && (
              <div className="live-status-pill">
                <span className="live-status-dot" />
                <span>ONLINE {liveStatus.latency}ms</span>
              </div>
            )}
          </div>

          <nav className="landing-menu">
            <a href="#features">Features</a>
            <a href="#architecture">Architecture</a>
            <a href="#commands">Commands</a>
            <a href="/manual.html" target="_blank" rel="noopener noreferrer">Manual</a>
            <a href="/public" onClick={(e) => {
              e.preventDefault();
              window.history.pushState({}, '', '/public');
              window.location.reload();
            }}>Status</a>
          </nav>

          <div className="landing-actions">
            <a 
              href={BOT_INVITE} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="btn-outline-minimal"
            >
              <Bot size={15} />
              <span>Invite Bot</span>
            </a>
            <button onClick={onGetStarted} className="btn-solid-black">
              <span>Launch Dashboard</span>
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </header>

      {/* ── HERO SECTION ───────────────────────────────────────────── */}
      <section className="landing-hero">
        <div className="hero-container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="hero-badge"
          >
            <ShieldCheck size={14} />
            <span>Next-Generation Discord Defense & Management Platform</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="hero-heading"
          >
            Total Server Control.<br />
            Uncompromised Security.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="hero-subtext"
          >
            An enterprise-grade platform uniting real-time Anti-Nuke defense, automated 5-minute disaster recovery snapshots, intelligent AutoMod, join-to-create voice infrastructure, and community gamification into a single high-speed dashboard.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="hero-cta-group"
          >
            <button onClick={onGetStarted} className="hero-primary-btn">
              <span>Open Dashboard</span>
              <ArrowRight size={18} />
            </button>
            <a 
              href={BOT_INVITE} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="hero-secondary-btn"
            >
              <Bot size={18} />
              <span>Add Rage to Discord</span>
            </a>
          </motion.div>
        </div>
      </section>

      {/* ── STATS TICKER ────────────────────────────────────────────── */}
      <section className="stats-strip">
        <div className="stats-strip-container">
          {STATS.map((s, idx) => (
            <div key={idx} className="stat-strip-item">
              <span className="stat-strip-val">{s.val}</span>
              <span className="stat-strip-label">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── INTERACTIVE SHOWCASE SECTION ───────────────────────────── */}
      <section id="features" className="showcase-section">
        <div className="section-title-wrap">
          <span className="section-eyebrow">CORE ARCHITECTURE</span>
          <h2 className="section-title">Built for Serious Discord Communities</h2>
          <p className="section-desc">Explore how Rage Optimiser secures, automates, and scales server operations.</p>
        </div>

        <div className="showcase-grid">
          {/* Left Column: Tab Selectors */}
          <div className="showcase-tabs-col">
            {FEATURES_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`showcase-tab-card ${activeTab === tab.id ? 'active' : ''}`}
              >
                <div className="tab-card-header">
                  <div className="tab-card-icon">{tab.icon}</div>
                  <span className="tab-card-badge">{tab.badge}</span>
                </div>
                <div className="tab-card-body">
                  <h3 className="tab-card-title">{tab.title}</h3>
                  <p className="tab-card-tagline">{tab.tagline}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Right Column: Live Mockup Terminal */}
          <div className="showcase-preview-card">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeFeature.id}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="mockup-panel"
              >
                <div className="mockup-topbar">
                  <div className="mockup-window-controls">
                    <span className="mockup-control-dot" />
                    <span className="mockup-control-dot" />
                    <span className="mockup-control-dot" />
                  </div>
                  <span className="mockup-topbar-title">{activeFeature.mockup.title}</span>
                  <span className="mockup-active-chip">● ACTIVE</span>
                </div>

                <div className="mockup-feature-intro">
                  <h4 className="mockup-intro-title">{activeFeature.title}</h4>
                  <p className="mockup-intro-desc">{activeFeature.desc}</p>
                </div>

                <div className="mockup-terminal-body">
                  {activeFeature.mockup.lines && (
                    <div className="terminal-lines-list">
                      {activeFeature.mockup.lines.map((l, i) => (
                        <div key={i} className={`terminal-log-row log-${l.type}`}>
                          <span className="log-time">[{l.time}]</span>
                          <span className="log-type-tag">{l.type.toUpperCase()}</span>
                          <span className="log-message">{l.text}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeFeature.mockup.tickets && (
                    <div className="tickets-mockup-table">
                      <table className="mini-table">
                        <thead>
                          <tr>
                            <th>Ticket ID</th>
                            <th>Creator</th>
                            <th>Subject</th>
                            <th>Priority</th>
                            <th style={{ textAlign: 'right' }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeFeature.mockup.tickets.map((t, i) => (
                            <tr key={i}>
                              <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{t.id}</td>
                              <td>{t.user}</td>
                              <td>{t.subject}</td>
                              <td>
                                <span className={`priority-tag priority-${t.priority.toLowerCase()}`}>
                                  {t.priority}
                                </span>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <span className="status-tag">{t.status}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* ── FULL FEATURE GRID ──────────────────────────────────────── */}
      <section id="architecture" className="features-grid-section">
        <div className="section-title-wrap">
          <span className="section-eyebrow">ENTERPRISE TOOLKIT</span>
          <h2 className="section-title">Everything Needed to Run a Discord Empire</h2>
          <p className="section-desc">Consolidate multiple fragmented bots into one unified, optimized platform.</p>
        </div>

        <div className="features-bento-grid">
          {ALL_FEATURES_GRID.map((feat, idx) => (
            <div key={idx} className="bento-feature-card">
              <div className="bento-icon-wrap">{feat.icon}</div>
              <h3 className="bento-title">{feat.title}</h3>
              <p className="bento-desc">{feat.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── COMMANDS DIRECTORY ─────────────────────────────────────── */}
      <section id="commands" className="commands-section">
        <div className="section-title-wrap">
          <span className="section-eyebrow">SLASH COMMANDS</span>
          <h2 className="section-title">Clean, Powerful Commands</h2>
          <p className="section-desc">Designed with Discord slash command autocompletion and intuitive syntax.</p>
        </div>

        <div className="commands-controls">
          <div className="commands-search-input">
            <Search size={16} />
            <input 
              type="text" 
              placeholder="Search commands (e.g. /status, /backup, /ban)..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="commands-category-filters">
            {(['all', 'security', 'moderation', 'community'] as const).map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`filter-btn ${selectedCategory === cat ? 'active' : ''}`}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="commands-cards-grid">
          {filteredCommands.map((cmd, idx) => (
            <div key={idx} className="command-card">
              <div className="command-card-header">
                <span className="command-name">{cmd.name}</span>
                <span className="command-cat-badge">{cmd.category}</span>
              </div>
              <p className="command-desc">{cmd.desc}</p>
              <div className="command-usage-box">
                <code>{cmd.usage}</code>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── BOTTOM CTA BANNER ──────────────────────────────────────── */}
      <section className="cta-banner-section">
        <div className="cta-banner-card">
          <div className="cta-banner-content">
            <img src="/rglogo.png" alt="Rage" className="cta-logo" />
            <h2 className="cta-heading">Ready to Secure Your Server?</h2>
            <p className="cta-subheading">
              Join servers utilizing Rage Optimiser for sub-millisecond threat neutralization, continuous 5-minute backups, and unified management.
            </p>
            <div className="cta-btn-row">
              <button onClick={onGetStarted} className="hero-primary-btn">
                <span>Launch Dashboard</span>
                <ArrowRight size={18} />
              </button>
              <a 
                href={BOT_INVITE} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="hero-secondary-btn"
              >
                <Bot size={18} />
                <span>Invite Rage Optimiser</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────── */}
      <footer className="landing-footer">
        <div className="footer-inner">
          <div className="footer-brand-col">
            <div className="landing-brand">
              <img src="/rglogo.png" alt="Rage Optimiser" className="landing-logo-sm" />
              <span className="brand-main">RAGE OPTIMISER</span>
            </div>
            <p className="footer-about">
              Enterprise-grade Discord defense, automation, and server management platform.
            </p>
            <span className="footer-copyright">
              © {new Date().getFullYear()} Rage Optimiser. All rights reserved.
            </span>
          </div>

          <div className="footer-links-group">
            <div className="footer-links-col">
              <span className="footer-col-title">Platform</span>
              <a href="#features">Features</a>
              <a href="#architecture">Architecture</a>
              <a href="#commands">Commands</a>
              <a href="/manual.html" target="_blank" rel="noopener noreferrer">Manual</a>
            </div>

            <div className="footer-links-col">
              <span className="footer-col-title">Resources</span>
              <a href="/public" onClick={(e) => {
                e.preventDefault();
                window.history.pushState({}, '', '/public');
                window.location.reload();
              }}>Live Status</a>
              <a href={BOT_INVITE} target="_blank" rel="noopener noreferrer">Invite Bot</a>
              <a href="/download" onClick={(e) => {
                e.preventDefault();
                window.history.pushState({}, '', '/download');
                window.location.reload();
              }}>Downloads</a>
            </div>

            <div className="footer-links-col">
              <span className="footer-col-title">Legal</span>
              <a href="/terms" onClick={(e) => {
                e.preventDefault();
                window.history.pushState({}, '', '/terms');
                window.location.reload();
              }}>Terms of Service</a>
              <a href="/privacy" onClick={(e) => {
                e.preventDefault();
                window.history.pushState({}, '', '/privacy');
                window.location.reload();
              }}>Privacy Policy</a>
            </div>
          </div>
        </div>
      </footer>

      {/* ── SCOPED BLACK & WHITE PROFESSIONAL STYLING ─────────────── */}
      <style>{`
        .landing-root {
          min-height: 100vh;
          width: 100%;
          background-color: #FFFFFF;
          color: #09090B;
          font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          overflow-x: hidden;
        }

        /* ── NAVBAR ─────────────────────────────────────────────── */
        .landing-nav {
          position: sticky;
          top: 0;
          z-index: 1000;
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid #E4E4E7;
          height: 68px;
        }

        .landing-nav-inner {
          max-width: 1240px;
          margin: 0 auto;
          height: 100%;
          padding: 0 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }

        .landing-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          text-decoration: none;
        }

        .landing-logo {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          object-fit: contain;
        }

        .landing-logo-sm {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          object-fit: contain;
        }

        .brand-titles {
          display: flex;
          flex-direction: column;
          line-height: 1.1;
        }

        .brand-main {
          font-weight: 800;
          font-size: 14px;
          letter-spacing: 0.04em;
          color: #09090B;
        }

        .brand-badge {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.12em;
          color: #71717A;
        }

        .live-status-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 3px 8px;
          border-radius: 12px;
          background: #F4F4F5;
          border: 1px solid #E4E4E7;
          font-size: 11px;
          font-weight: 700;
          color: #16A34A;
          font-family: 'JetBrains Mono', monospace;
        }

        .live-status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #16A34A;
          box-shadow: 0 0 6px #16A34A;
        }

        .landing-menu {
          display: flex;
          align-items: center;
          gap: 24px;
        }

        .landing-menu a {
          font-size: 14px;
          font-weight: 600;
          color: #52525B;
          transition: color 0.15s ease;
          text-decoration: none;
        }

        .landing-menu a:hover {
          color: #09090B;
        }

        .landing-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .btn-outline-minimal {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          border-radius: 8px;
          border: 1px solid #E4E4E7;
          background: #FFFFFF;
          color: #09090B;
          font-size: 13px;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.15s ease;
        }

        .btn-outline-minimal:hover {
          background: #F4F4F5;
          border-color: #09090B;
        }

        .btn-solid-black {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 9px 18px;
          border-radius: 8px;
          border: 1px solid #09090B;
          background: #09090B;
          color: #FFFFFF;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .btn-solid-black:hover {
          background: #27272A;
          border-color: #27272A;
          transform: translateY(-1px);
        }

        /* ── HERO ───────────────────────────────────────────────── */
        .landing-hero {
          padding: 100px 24px 70px;
          text-align: center;
          background-color: #FFFFFF;
          background-image: radial-gradient(rgba(0, 0, 0, 0.05) 1px, transparent 1px);
          background-size: 24px 24px;
        }

        .hero-container {
          max-width: 860px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          border-radius: 20px;
          background: #F4F4F5;
          border: 1px solid #E4E4E7;
          font-size: 12px;
          font-weight: 600;
          color: #09090B;
          margin-bottom: 24px;
        }

        .hero-heading {
          font-size: 60px;
          font-weight: 800;
          line-height: 1.08;
          letter-spacing: -0.035em;
          color: #09090B;
          margin-bottom: 24px;
        }

        .hero-subtext {
          font-size: 18px;
          line-height: 1.6;
          color: #52525B;
          margin-bottom: 40px;
          max-width: 720px;
        }

        .hero-cta-group {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .hero-primary-btn {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 28px;
          border-radius: 10px;
          border: 1px solid #09090B;
          background: #09090B;
          color: #FFFFFF;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
        }

        .hero-primary-btn:hover {
          background: #27272A;
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
        }

        .hero-secondary-btn {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 28px;
          border-radius: 10px;
          border: 1.5px solid #09090B;
          background: #FFFFFF;
          color: #09090B;
          font-size: 15px;
          font-weight: 700;
          text-decoration: none;
          transition: all 0.2s ease;
        }

        .hero-secondary-btn:hover {
          background: #F4F4F5;
          transform: translateY(-2px);
        }

        /* ── STATS STRIP ────────────────────────────────────────── */
        .stats-strip {
          border-top: 1px solid #E4E4E7;
          border-bottom: 1px solid #E4E4E7;
          background: #FAFAFA;
          padding: 32px 24px;
        }

        .stats-strip-container {
          max-width: 1200px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 24px;
          text-align: center;
        }

        .stat-strip-val {
          display: block;
          font-size: 34px;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: #09090B;
          font-family: 'JetBrains Mono', monospace;
        }

        .stat-strip-label {
          font-size: 13px;
          font-weight: 600;
          color: #71717A;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        /* ── SECTION HEADINGS ───────────────────────────────────── */
        .section-title-wrap {
          text-align: center;
          max-width: 720px;
          margin: 0 auto 50px;
        }

        .section-eyebrow {
          display: block;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #71717A;
          margin-bottom: 10px;
        }

        .section-title {
          font-size: 36px;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: #09090B;
          margin-bottom: 14px;
        }

        .section-desc {
          font-size: 16px;
          color: #52525B;
          line-height: 1.6;
        }

        /* ── SHOWCASE SECTION ───────────────────────────────────── */
        .showcase-section {
          max-width: 1240px;
          margin: 80px auto;
          padding: 0 24px;
        }

        .showcase-grid {
          display: grid;
          grid-template-columns: 380px 1fr;
          gap: 32px;
          align-items: stretch;
        }

        .showcase-tabs-col {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .showcase-tab-card {
          text-align: left;
          padding: 16px 20px;
          border-radius: 12px;
          border: 1px solid #E4E4E7;
          background: #FFFFFF;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .showcase-tab-card:hover {
          border-color: #A1A1AA;
          background: #FAFAFA;
        }

        .showcase-tab-card.active {
          border-color: #09090B;
          background: #09090B;
          color: #FFFFFF;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
        }

        .showcase-tab-card.active .tab-card-badge {
          background: rgba(255, 255, 255, 0.2);
          color: #FFFFFF;
        }

        .showcase-tab-card.active .tab-card-icon {
          color: #FFFFFF;
        }

        .showcase-tab-card.active .tab-card-title {
          color: #FFFFFF;
        }

        .showcase-tab-card.active .tab-card-tagline {
          color: #A1A1AA;
        }

        .tab-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .tab-card-icon {
          color: #09090B;
        }

        .tab-card-badge {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 2px 8px;
          border-radius: 6px;
          background: #F4F4F5;
          color: #52525B;
        }

        .tab-card-title {
          font-size: 15px;
          font-weight: 700;
          color: #09090B;
          margin-bottom: 3px;
        }

        .tab-card-tagline {
          font-size: 12px;
          color: #71717A;
        }

        .showcase-preview-card {
          background: #FFFFFF;
          border: 1px solid #E4E4E7;
          border-radius: 16px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .mockup-panel {
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .mockup-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 20px;
          background: #FAFAFA;
          border-bottom: 1px solid #E4E4E7;
        }

        .mockup-window-controls {
          display: flex;
          gap: 6px;
        }

        .mockup-control-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #D4D4D8;
        }

        .mockup-topbar-title {
          font-size: 12px;
          font-weight: 700;
          color: #52525B;
          font-family: 'JetBrains Mono', monospace;
        }

        .mockup-active-chip {
          font-size: 10px;
          font-weight: 800;
          color: #16A34A;
          letter-spacing: 0.05em;
        }

        .mockup-feature-intro {
          padding: 24px;
          border-bottom: 1px solid #F4F4F5;
        }

        .mockup-intro-title {
          font-size: 20px;
          font-weight: 800;
          color: #09090B;
          margin-bottom: 6px;
        }

        .mockup-intro-desc {
          font-size: 14px;
          line-height: 1.5;
          color: #52525B;
        }

        .mockup-terminal-body {
          padding: 24px;
          flex: 1;
          background: #FAFAFA;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
        }

        .terminal-lines-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .terminal-log-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-radius: 8px;
          background: #FFFFFF;
          border: 1px solid #E4E4E7;
        }

        .log-time {
          color: #71717A;
          font-size: 11px;
        }

        .log-type-tag {
          font-size: 10px;
          font-weight: 800;
          padding: 2px 6px;
          border-radius: 4px;
        }

        .log-warning .log-type-tag { background: #FEF3C7; color: #B45309; }
        .log-danger .log-type-tag { background: #FEE2E2; color: #B91C1C; }
        .log-success .log-type-tag { background: #DCFCE7; color: #15803D; }
        .log-info .log-type-tag { background: #F4F4F5; color: #09090B; }

        .log-message {
          color: #09090B;
          font-weight: 500;
        }

        .mini-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
          background: #FFFFFF;
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid #E4E4E7;
        }

        .mini-table th {
          padding: 10px 14px;
          background: #F4F4F5;
          text-align: left;
          color: #52525B;
          font-weight: 700;
          border-bottom: 1px solid #E4E4E7;
        }

        .mini-table td {
          padding: 12px 14px;
          border-bottom: 1px solid #F4F4F5;
          color: #09090B;
        }

        .priority-tag {
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .priority-high { background: #FEE2E2; color: #B91C1C; }
        .priority-medium { background: #FEF3C7; color: #B45309; }
        .priority-low { background: #F4F4F5; color: #52525B; }

        .status-tag {
          font-weight: 700;
          color: #16A34A;
        }

        /* ── BENTO FEATURES GRID ────────────────────────────────── */
        .features-grid-section {
          max-width: 1240px;
          margin: 100px auto;
          padding: 0 24px;
        }

        .features-bento-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
        }

        .bento-feature-card {
          padding: 28px;
          border-radius: 14px;
          border: 1px solid #E4E4E7;
          background: #FFFFFF;
          transition: all 0.2s ease;
        }

        .bento-feature-card:hover {
          border-color: #09090B;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
          transform: translateY(-2px);
        }

        .bento-icon-wrap {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          background: #F4F4F5;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #09090B;
          margin-bottom: 20px;
        }

        .bento-title {
          font-size: 17px;
          font-weight: 800;
          color: #09090B;
          margin-bottom: 8px;
        }

        .bento-desc {
          font-size: 14px;
          line-height: 1.6;
          color: #52525B;
        }

        /* ── COMMANDS DIRECTORY ─────────────────────────────────── */
        .commands-section {
          max-width: 1240px;
          margin: 100px auto;
          padding: 0 24px;
        }

        .commands-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          margin-bottom: 30px;
        }

        .commands-search-input {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 16px;
          border-radius: 10px;
          border: 1px solid #E4E4E7;
          background: #FFFFFF;
          width: 360px;
        }

        .commands-search-input input {
          width: 100%;
          border: none;
          outline: none;
          font-size: 13px;
          color: #09090B;
        }

        .commands-category-filters {
          display: flex;
          gap: 8px;
        }

        .filter-btn {
          padding: 8px 16px;
          border-radius: 8px;
          border: 1px solid #E4E4E7;
          background: #FFFFFF;
          color: #52525B;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .filter-btn:hover {
          color: #09090B;
          border-color: #A1A1AA;
        }

        .filter-btn.active {
          background: #09090B;
          color: #FFFFFF;
          border-color: #09090B;
        }

        .commands-cards-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }

        .command-card {
          padding: 20px;
          border-radius: 12px;
          border: 1px solid #E4E4E7;
          background: #FFFFFF;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .command-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .command-name {
          font-size: 16px;
          font-weight: 800;
          color: #09090B;
          font-family: 'JetBrains Mono', monospace;
        }

        .command-cat-badge {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          padding: 2px 6px;
          border-radius: 4px;
          background: #F4F4F5;
          color: #52525B;
        }

        .command-desc {
          font-size: 13px;
          color: #52525B;
          line-height: 1.5;
          flex: 1;
        }

        .command-usage-box {
          background: #FAFAFA;
          border: 1px solid #E4E4E7;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 12px;
          color: #09090B;
          font-family: 'JetBrains Mono', monospace;
        }

        /* ── BOTTOM CTA BANNER ──────────────────────────────────── */
        .cta-banner-section {
          max-width: 1240px;
          margin: 80px auto;
          padding: 0 24px;
        }

        .cta-banner-card {
          border-radius: 20px;
          background: #09090B;
          color: #FFFFFF;
          padding: 60px 40px;
          text-align: center;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
        }

        .cta-banner-content {
          max-width: 680px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .cta-logo {
          width: 56px;
          height: 56px;
          border-radius: 14px;
          margin-bottom: 20px;
        }

        .cta-heading {
          font-size: 38px;
          font-weight: 800;
          color: #FFFFFF;
          margin-bottom: 14px;
          letter-spacing: -0.03em;
        }

        .cta-subheading {
          font-size: 16px;
          color: #A1A1AA;
          line-height: 1.6;
          margin-bottom: 32px;
        }

        .cta-btn-row {
          display: flex;
          gap: 16px;
        }

        .cta-banner-card .hero-primary-btn {
          background: #FFFFFF;
          color: #09090B;
          border-color: #FFFFFF;
        }

        .cta-banner-card .hero-primary-btn:hover {
          background: #F4F4F5;
        }

        .cta-banner-card .hero-secondary-btn {
          background: transparent;
          color: #FFFFFF;
          border-color: #FFFFFF;
        }

        .cta-banner-card .hero-secondary-btn:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        /* ── FOOTER ─────────────────────────────────────────────── */
        .landing-footer {
          border-top: 1px solid #E4E4E7;
          background: #FAFAFA;
          padding: 60px 24px 40px;
        }

        .footer-inner {
          max-width: 1240px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          gap: 60px;
        }

        .footer-brand-col {
          max-width: 320px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .footer-about {
          font-size: 13px;
          color: #71717A;
          line-height: 1.6;
        }

        .footer-copyright {
          font-size: 12px;
          color: #A1A1AA;
        }

        .footer-links-group {
          display: flex;
          gap: 80px;
        }

        .footer-links-col {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .footer-col-title {
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #09090B;
          margin-bottom: 6px;
        }

        .footer-links-col a {
          font-size: 13px;
          color: #52525B;
          text-decoration: none;
          transition: color 0.15s ease;
        }

        .footer-links-col a:hover {
          color: #09090B;
        }

        /* ── RESPONSIVE DESIGN ──────────────────────────────────── */
        @media (max-width: 1024px) {
          .showcase-grid {
            grid-template-columns: 1fr;
          }
          .features-bento-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .commands-cards-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .stats-strip-container {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 768px) {
          .landing-menu {
            display: none;
          }
          .hero-heading {
            font-size: 40px;
          }
          .features-bento-grid, .commands-cards-grid {
            grid-template-columns: 1fr;
          }
          .commands-controls {
            flex-direction: column;
            align-items: stretch;
          }
          .commands-search-input {
            width: 100%;
          }
          .hero-cta-group, .cta-btn-row {
            flex-direction: column;
            width: 100%;
          }
          .hero-primary-btn, .hero-secondary-btn {
            width: 100%;
            justify-content: center;
          }
          .footer-inner {
            flex-direction: column;
            gap: 40px;
          }
          .footer-links-group {
            gap: 40px;
            flex-wrap: wrap;
          }
        }
      `}</style>
    </div>
  );
}
