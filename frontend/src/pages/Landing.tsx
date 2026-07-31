import { API_BASE, DISCORD_CLIENT_ID } from '../config';
import React, { useState, useEffect } from 'react';

import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Zap, Users, Music, FileText, BarChart2, Bot, Lock,
  Star, ChevronRight, ExternalLink, CheckCircle2, Server, Globe,
  Activity, MessageCircle, ArrowRight, Sparkles, Sliders, RefreshCw,
  AlertTriangle, Play, FastForward, Volume2, Plus, Terminal, Search
} from 'lucide-react';

const FEATURES_TABS = [
  {
    id: 'security',
    icon: <Shield size={18} />,
    title: 'Anti-Nuke Protection',
    tagline: 'Enterprise-grade threat prevention',
    desc: 'Automated defense protocols monitor and neutralize unauthorized changes to channels, roles, webhooks, or member permissions instantly.',
    color: '#FF3B30',
    mockup: {
      title: '🛡️ Shield Log Registry',
      lines: [
        { type: 'danger', time: '12:04:10', text: 'Spike in role deletions detected (User: malicious_actor#1337)' },
        { type: 'success', time: '12:04:11', text: 'Quarantine protocol activated: User isolated & role revoked' },
        { type: 'info', time: '12:04:11', text: 'Auto-restoring deleted roles from Firebase backup...' },
        { type: 'success', time: '12:04:15', text: 'System status: 100% restored. Incident logged.' }
      ]
    }
  },
  {
    id: 'automation',
    icon: <Zap size={18} />,
    title: 'Smart Workflows',
    tagline: 'Custom rule-based triggers',
    desc: 'Construct complex, multi-stage workflows without writing code. Trigger actions based on keyword mentions, user profile ages, or role changes.',
    color: '#FF9500',
    mockup: {
      title: '⚡ Rule Builder Node',
      lines: [
        { type: 'info', time: 'TRIGGER', text: 'When a new member joins the guild' },
        { type: 'warning', time: 'CONDITION', text: 'If account age is less than 3 days' },
        { type: 'danger', time: 'ACTION 1', text: 'Assign "Unverified" role & apply CAPTCHA' },
        { type: 'info', time: 'ACTION 2', text: 'Send real-time alert to staff log channel' }
      ]
    }
  },
  {
    id: 'music',
    icon: <Music size={18} />,
    title: 'Rage Music',
    tagline: 'Hi-Fi voice playback stream',
    desc: 'An independent audio bot featuring Spotify, YouTube, and SoundCloud playback with zero lag, queue caching, and persistent 24/7 presence.',
    color: '#FF2D55',
    mockup: {
      title: '🎵 Rage Audio Player',
      player: {
        nowPlaying: 'Hypnotize - The Notorious B.I.G.',
        progress: '1:45 / 3:50',
        barWidth: '45%',
        queue: [
          'Lose Yourself - Eminem',
          'Rage Against The Machine - Guerrilla Radio',
          'After Hours - The Weeknd'
        ]
      }
    }
  },
  {
    id: 'analytics',
    icon: <BarChart2 size={18} />,
    title: 'Live Telemetry',
    tagline: 'Deep behavioral insights',
    desc: 'Real-time telemetry charts user retention, active voice channels, command usage hotspots, and spam rates directly on your screen.',
    color: '#34C759',
    mockup: {
      title: '📊 Active Server Analytics',
      metrics: [
        { name: 'Spam Multiplier', value: '0.12 (Very Low)', color: '#34C759' },
        { name: 'Active Voice Nodes', value: '14 Channels', color: '#5856D6' },
        { name: 'Avg response time', value: '45ms', color: '#007AFF' },
        { name: 'Gateway Health', value: '99.99%', color: '#30B0C7' }
      ]
    }
  },
  {
    id: 'tickets',
    icon: <FileText size={18} />,
    title: 'Support Desks',
    tagline: 'SLA-backed ticket routing',
    desc: 'Establish multi-tier support workflows, transcript archiving, feedback surveys, and automatic staff assignment rules.',
    color: '#007AFF',
    mockup: {
      title: '🎫 Support Ticket Registry',
      tickets: [
        { id: 'TKT-8291', user: 'RDXYZ', subject: 'Billing Inquiry', status: 'In Progress', priority: 'High' },
        { id: 'TKT-8290', user: 'GamerX', subject: 'Report Player', status: 'Resolved', priority: 'Medium' }
      ]
    }
  }
];

const PRICING = [
  {
    name: 'Free Starter', price: '$0', period: '/mo', color: '#8E8E93',
    desc: 'For small communities establishing their foundations.',
    features: ['Up to 500 members', 'Basic verification button', 'Standard moderation', '3 custom trigger rules', 'Real-time telemetry logs'],
    cta: 'Get Started', ctaVariant: 'outline'
  },
  {
    name: 'Premium', price: '$9', period: '/mo', color: '#FF3B30', badge: 'Recommended',
    desc: 'For growing servers seeking bulletproof security & entertainment.',
    features: ['Unlimited server members', 'Anti-Nuke & Anti-Raid system', 'Dedicated Rage Music bot', 'Unlimited automation workflows', 'Advanced audit logs & metrics', 'Priority support assistance'],
    cta: 'Start Free Trial', ctaVariant: 'primary'
  },
  {
    name: 'Enterprise', price: '$29', period: '/mo', color: '#FF9500',
    desc: 'For large corporate communities demanding elite compliance.',
    features: ['Everything in Premium', 'Dedicated custom bot client', 'Custom logo & presence', 'Exclusive API endpoints', '99.9% SLA uptime guarantee', '24/7 designated support manager'],
    cta: 'Contact Sales', ctaVariant: 'outline'
  }
];

const STATS = [
  { val: '15,000+', label: 'Servers Shielded' },
  { val: '3.6M+', label: 'Protected Members' },
  { val: '99.99%', label: 'Active Gateway Uptime' },
  { val: '840K+', label: 'Raid Threats Blocked' },
];

const COMMANDS_DATA = [
  {
    category: 'moderation',
    name: '/status',
    desc: 'Check configuration completeness, database status, and active modules.',
    usage: '/status'
  },
  {
    category: 'moderation',
    name: '/ban',
    desc: 'Ban a user from the server.',
    params: [
      { name: 'user', required: true, type: 'USER', desc: 'The member to ban.' },
      { name: 'reason', required: false, type: 'STRING', desc: 'The reason for the ban.' }
    ],
    usage: '/ban user:@User reason:Rule breaking'
  },
  {
    category: 'moderation',
    name: '/kick',
    desc: 'Kick a user from the server.',
    params: [
      { name: 'user', required: true, type: 'USER', desc: 'The member to kick.' },
      { name: 'reason', required: false, type: 'STRING', desc: 'The reason for the kick.' }
    ],
    usage: '/kick user:@User reason:Inactivity'
  },
  {
    category: 'moderation',
    name: '/timeout',
    desc: 'Timeout/isolate a user temporarily.',
    params: [
      { name: 'user', required: true, type: 'USER', desc: 'The member to timeout.' },
      { name: 'duration', required: true, type: 'STRING', desc: 'Format like 10m, 2h, 1d.' }
    ],
    usage: '/timeout user:@User duration:30m'
  },
  {
    category: 'moderation',
    name: '/untimeout',
    desc: 'Remove an active timeout from a user.',
    params: [
      { name: 'user', required: true, type: 'USER', desc: 'The member to release.' }
    ],
    usage: '/untimeout user:@User'
  },
  {
    category: 'moderation',
    name: '/mute',
    desc: 'Mutes a user (sets a standard 1-hour timeout).',
    params: [
      { name: 'user', required: true, type: 'USER', desc: 'The member to mute.' }
    ],
    usage: '/mute user:@User'
  },
  {
    category: 'moderation',
    name: '/unmute',
    desc: 'Unmutes a user (clears the timeout).',
    params: [
      { name: 'user', required: true, type: 'USER', desc: 'The member to unmute.' }
    ],
    usage: '/unmute user:@User'
  },
  {
    category: 'moderation',
    name: '/warn',
    desc: 'Log a warning against a user. Warning data is saved in memory.',
    params: [
      { name: 'user', required: true, type: 'USER', desc: 'The member to warn.' },
      { name: 'reason', required: true, type: 'STRING', desc: 'Reason for the warning.' }
    ],
    usage: '/warn user:@User reason:Spamming'
  },
  {
    category: 'moderation',
    name: '/warnings',
    desc: 'Check warnings logged against a user.',
    params: [
      { name: 'user', required: true, type: 'USER', desc: 'User to check.' }
    ],
    usage: '/warnings user:@User'
  },
  {
    category: 'moderation',
    name: '/clearwarnings',
    desc: 'Clear all warnings logged against a user.',
    params: [
      { name: 'user', required: true, type: 'USER', desc: 'User to clear.' }
    ],
    usage: '/clearwarnings user:@User'
  },
  {
    category: 'moderation',
    name: '/purge',
    desc: 'Delete multiple messages in the current channel.',
    params: [
      { name: 'amount', required: true, type: 'INTEGER', desc: 'Range 1 to 100.' }
    ],
    usage: '/purge amount:50'
  },
  {
    category: 'moderation',
    name: '/lock',
    desc: 'Lock the current text channel, denying the @everyone role permission to send messages.',
    usage: '/lock'
  },
  {
    category: 'moderation',
    name: '/unlock',
    desc: 'Restore default message sending permissions to the channel.',
    usage: '/unlock'
  },
  {
    category: 'moderation',
    name: '/slowmode',
    desc: 'Set a message delay slowmode for the channel.',
    params: [
      { name: 'seconds', required: true, type: 'INTEGER', desc: 'Delay in seconds.' }
    ],
    usage: '/slowmode seconds:5'
  },
  {
    category: 'security',
    name: '/quarantine',
    desc: 'Manually isolate a suspicious server member. Removes all administrative roles and adds the designated quarantine role.',
    params: [
      { name: 'user', required: true, type: 'USER', desc: 'Target member.' }
    ],
    usage: '/quarantine user:@SuspiciousUser'
  },
  {
    category: 'security',
    name: '/lockdown',
    desc: 'Perform emergency lock or unlock of all guild channels.',
    params: [
      { name: 'status', required: true, type: 'STRING', desc: 'Choose lock or unlock.' }
    ],
    usage: '/lockdown status:lock'
  },
  {
    category: 'music',
    name: '/play',
    desc: 'Stream high-fidelity audio from YouTube or Spotify. (Can also use r!play)',
    params: [
      { name: 'query', required: true, type: 'STRING', desc: 'Search keywords or video/playlist URL.' }
    ],
    usage: '/play query:lofi beats'
  },
  {
    category: 'music',
    name: '/pause',
    desc: 'Pause the active playback stream. (Can also use r!pause)',
    usage: '/pause'
  },
  {
    category: 'music',
    name: '/resume',
    desc: 'Resume paused audio playback. (Can also use r!resume)',
    usage: '/resume'
  },
  {
    category: 'music',
    name: '/stop',
    desc: 'Stop the playback stream and clear the music queue. (Can also use r!stop)',
    usage: '/stop'
  },
  {
    category: 'music',
    name: '/skip',
    desc: 'Skip the currently playing track. (Can also use r!skip)',
    usage: '/skip'
  },
  {
    category: 'music',
    name: '/queue',
    desc: 'View upcoming tracks in the music queue. (Can also use r!queue)',
    usage: '/queue'
  },
  {
    category: 'music',
    name: '/shuffle',
    desc: 'Shuffle the tracks in the queue. (Can also use r!shuffle)',
    usage: '/shuffle'
  },
  {
    category: 'music',
    name: '/loop',
    desc: 'Set loop mode. (Can also use r!loop)',
    params: [
      { name: 'mode', required: true, type: 'STRING', desc: 'Options are track, queue, off.' }
    ],
    usage: '/loop mode:queue'
  },
  {
    category: 'music',
    name: '/volume',
    desc: 'Adjust volume of the bot stream. (Can also use r!volume)',
    params: [
      { name: 'percent', required: true, type: 'INTEGER', desc: 'Range 0 to 200.' }
    ],
    usage: '/volume percent:80'
  },
  {
    category: 'music',
    name: '/clear',
    desc: 'Clear all tracks in the queue except the current one. (Can also use r!clear)',
    usage: '/clear'
  },
  {
    category: 'music',
    name: '/remove',
    desc: 'Remove a track from a specific position in the queue. (Can also use r!remove)',
    params: [
      { name: 'position', required: true, type: 'INTEGER', desc: 'Position number in queue.' }
    ],
    usage: '/remove position:3'
  }
];

export function Landing({ onGetStarted }: { onGetStarted: () => void }) {
  const [liveStatus, setLiveStatus] = useState<{ latency?: number; online?: boolean } | null>(null);
  const [activeTab, setActiveTab] = useState('security');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'moderation' | 'security' | 'music'>('all');
  const [expandedCommand, setExpandedCommand] = useState<string | null>(null);

  useEffect(() => {
    const checkStatus = () => {
      fetch(`${API_BASE}/api/status`)
        .then(r => r.json())
        .then(d => setLiveStatus({ latency: d.latency, online: true }))
        .catch(() => setLiveStatus({ online: false }));
    };

    checkStatus();
    const interval = setInterval(checkStatus, 2000);
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
    <div className="landing-page">
      {/* Dynamic Background Glows */}
      <div className="bg-glow bg-glow-1" />
      <div className="bg-glow bg-glow-2" />
      <div className="bg-glow bg-glow-3" />

      {/* === NAVBAR === */}
      <nav className="navbar glass-nav">
        <div className="nav-brand">
          <div className="brand-badge-icon">RO</div>
          <span className="brand-text">RAGE OPTIMISER</span>
          {liveStatus?.online && (
            <span className="live-pill">
              <span className="live-dot" />
              {liveStatus.latency}ms
            </span>
          )}
        </div>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#commands">Commands</a>
          <a href="/download" onClick={(e) => {
            e.preventDefault();
            window.history.pushState({}, '', '/download');
            window.location.reload();
          }}>Download</a>
          <a href={BOT_INVITE} target="_blank" rel="noopener noreferrer" className="external-link-nav">
            Invite Bot <ExternalLink size={12} />
          </a>
          <button onClick={onGetStarted} className="btn-dashboard-entry">
            <span>Control Panel</span>
            <ChevronRight size={14} />
          </button>
        </div>
      </nav>

      {/* === HERO SECTION === */}
      <section className="hero-section">
        <motion.div 
          initial={{ opacity: 0, y: 30 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.8 }}
          className="hero-content"
        >
          <div className="hero-announcement">
            <Sparkles size={13} />
            <span>Next-Gen Crimson Discord Shield Deployed</span>
          </div>

          <h1 className="hero-title">
            The Ultimate <span className="text-crimson-gradient">Discord Command Center</span>
          </h1>

          <p className="hero-subtitle">
            Secure, moderate, automate, and entertain your community. A premium platform built with bulletproof anti-nuke code and lag-free music streams.
          </p>

          <div className="hero-actions">
            <a href={BOT_INVITE} target="_blank" rel="noopener noreferrer" className="btn btn-hero-primary">
              <Bot size={18} />
              <span>Add to Server</span>
            </a>
            <button onClick={onGetStarted} className="btn btn-hero-secondary">
              <span>Open Control Panel</span>
              <ArrowRight size={18} />
            </button>
          </div>
        </motion.div>
      </section>

      {/* === STATS BAR === */}
      <section className="stats-section glass-panel">
        <div className="stats-grid">
          {STATS.map((s, i) => (
            <div key={i} className="stat-card">
              <div className="stat-value">{s.val}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* === INTERACTIVE SHOWCASE SECTION === */}
      <section id="features" className="showcase-section">
        <div className="section-header">
          <span className="section-pre">INTERACTIVE SHOWCASE</span>
          <h2 className="section-title">One Dashboard. Total Dominance.</h2>
          <p className="section-subtitle">Click through our primary operational systems to preview how Rage Optimiser secures and manages your server environment.</p>
        </div>

        <div className="showcase-container">
          {/* Left Side: Tabs Selector */}
          <div className="showcase-tabs">
            {FEATURES_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`showcase-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                style={{ '--tab-accent': tab.color } as React.CSSProperties}
              >
                <div className="tab-btn-icon">{tab.icon}</div>
                <div className="tab-btn-meta">
                  <div className="tab-btn-title">{tab.title}</div>
                  <div className="tab-btn-tagline">{tab.tagline}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Right Side: Interactive Mockup Panel */}
          <div className="showcase-mockup glass-panel">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeFeature.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="mockup-content"
              >
                <div className="mockup-header">
                  <div className="mockup-dots">
                    <span className="dot dot-red" />
                    <span className="dot dot-yellow" />
                    <span className="dot dot-green" />
                  </div>
                  <span className="mockup-title-text">{activeFeature.mockup.title}</span>
                  <div className="mockup-badge" style={{ backgroundColor: `${activeFeature.color}15`, color: activeFeature.color }}>
                    Active
                  </div>
                </div>

                <div className="mockup-body">
                  {/* Anti-Nuke or Automation Mockup */}
                  {activeFeature.mockup.lines && (
                    <div className="mockup-terminal-lines">
                      {activeFeature.mockup.lines.map((line, idx) => (
                        <div key={idx} className="terminal-line">
                          <span className="line-time">[{line.time}]</span>
                          <span className={`line-tag line-tag-${line.type}`}>{line.type.toUpperCase()}</span>
                          <span className="line-text">{line.text}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Music Player Mockup */}
                  {activeFeature.mockup.player && (
                    <div className="mockup-player-container">
                      <div className="player-now-playing">
                        <div className="playing-bars">
                          <span className="bar bar1" />
                          <span className="bar bar2" />
                          <span className="bar bar3" />
                        </div>
                        <div>
                          <div className="player-label">NOW PLAYING</div>
                          <div className="player-track">{activeFeature.mockup.player.nowPlaying}</div>
                        </div>
                      </div>
                      <div className="player-progress-bar">
                        <div className="progress-fill" style={{ width: activeFeature.mockup.player.progress }} />
                      </div>
                      <div className="player-time-row">
                        <span>{activeFeature.mockup.player.progress}</span>
                        <div className="player-controls">
                          <FastForward size={14} className="flip-h" />
                          <div className="play-btn-circle"><Play size={10} fill="#fff" /></div>
                          <FastForward size={14} />
                        </div>
                        <div className="player-volume"><Volume2 size={14} /></div>
                      </div>
                      <div className="player-queue-header">UP NEXT IN QUEUE</div>
                      <div className="player-queue-list">
                        {activeFeature.mockup.player.queue.map((track, i) => (
                          <div key={i} className="queue-item">
                            <span className="queue-idx">0{i+1}</span>
                            <span className="queue-track">{track}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Analytics Mockup */}
                  {activeFeature.mockup.metrics && (
                    <div className="mockup-metrics-grid">
                      {activeFeature.mockup.metrics.map((metric, i) => (
                        <div key={i} className="metric-box glass-panel">
                          <div className="metric-box-val" style={{ color: metric.color }}>{metric.value}</div>
                          <div className="metric-box-name">{metric.name}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Tickets Mockup */}
                  {activeFeature.mockup.tickets && (
                    <div className="mockup-tickets-table">
                      <table className="custom-table-mock">
                        <thead>
                          <tr>
                            <th>Ticket</th>
                            <th>Creator</th>
                            <th>Subject</th>
                            <th>Priority</th>
                            <th style={{ textAlign: 'right' }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeFeature.mockup.tickets.map((t, i) => (
                            <tr key={i}>
                              <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t.id}</td>
                              <td>{t.user}</td>
                              <td>{t.subject}</td>
                              <td>
                                <span className={`priority-pill priority-${t.priority.toLowerCase()}`}>{t.priority}</span>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <span className={`status-pill status-${t.status.toLowerCase().replace(' ', '')}`}>{t.status}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="mockup-footer">
                  <p>{activeFeature.desc}</p>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* === COMMAND DIRECTORY === */}
      <section id="commands" className="commands-section">
        <div className="section-header">
          <span className="section-pre">COMMAND DIRECTORY</span>
          <h2 className="section-title">Fully Integrated Discord System</h2>
          <p className="section-subtitle">Browse and search through all of our slash and prefix commands built for moderators, owners, and listeners.</p>
        </div>

        <div className="commands-container glass-panel">
          {/* Controls Bar */}
          <div className="commands-controls">
            <div className="commands-search-box">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Search commands (e.g. /ban, /play)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="commands-search-input"
              />
            </div>

            <div className="commands-category-filters">
              {(['all', 'moderation', 'security', 'music'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`btn-filter ${selectedCategory === cat ? 'active' : ''}`}
                >
                  {cat.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Commands List */}
          <div className="commands-list">
            {filteredCommands.length === 0 ? (
              <div className="no-commands-found">
                <Terminal size={32} style={{ color: 'var(--accent-primary)', marginBottom: 12 }} />
                <p>No commands matched your search query.</p>
              </div>
            ) : (
              filteredCommands.map((cmd) => {
                const isExpanded = expandedCommand === cmd.name;
                return (
                  <div
                    key={cmd.name}
                    className={`command-item-row ${isExpanded ? 'expanded' : ''}`}
                  >
                    <div
                      className="command-item-summary"
                      onClick={() => setExpandedCommand(isExpanded ? null : cmd.name)}
                    >
                      <div className="command-name-group">
                        <Terminal size={14} className="command-term-icon" />
                        <span className="command-name-text">{cmd.name}</span>
                      </div>
                      <span className="command-desc-short">{cmd.desc}</span>
                      <span className={`command-category-badge badge-${cmd.category}`}>
                        {cmd.category}
                      </span>
                    </div>

                    {isExpanded && (
                      <div className="command-item-details">
                        <div className="details-grid">
                          <div>
                            <span className="detail-label">Description</span>
                            <p className="detail-val">{cmd.desc}</p>
                          </div>
                          <div>
                            <span className="detail-label">Usage Example</span>
                            <code className="detail-code">{cmd.usage}</code>
                          </div>
                        </div>

                        {cmd.params && cmd.params.length > 0 && (
                          <div className="params-section">
                            <span className="detail-label">Parameters</span>
                            <div className="params-table-container">
                              <table className="params-table">
                                <thead>
                                  <tr>
                                    <th>Parameter</th>
                                    <th>Type</th>
                                    <th>Required</th>
                                    <th>Description</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {cmd.params.map((param) => (
                                    <tr key={param.name}>
                                      <td className="param-name">{param.name}</td>
                                      <td><span className="param-type-badge">{param.type}</span></td>
                                      <td>
                                        <span className={`param-req-badge ${param.required ? 'required' : 'optional'}`}>
                                          {param.required ? 'Yes' : 'No'}
                                        </span>
                                      </td>
                                      <td className="param-desc">{param.desc}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>



      {/* === BANNER CTA === */}
      <section className="banner-section">
        <div className="banner-card glass-panel text-center">
          <h2 className="banner-title">Elevate Your Discord Infrastructure</h2>
          <p className="banner-desc">Integrate elite protection protocols, live telemetry, and premium audio bots today.</p>
          <div className="banner-actions">
            <a href={BOT_INVITE} target="_blank" rel="noopener noreferrer" className="btn btn-banner-primary">
              <Bot size={16} />
              <span>Invite Rage Optimiser</span>
            </a>
            <button onClick={onGetStarted} className="btn btn-banner-secondary">
              <span>Open Dashboard Console</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {/* === FOOTER === */}
      <footer className="landing-footer">
        <div className="footer-left">
          <div className="footer-logo">RO</div>
          <span className="footer-brand-text">RAGE OPTIMISER</span>
          <span className="footer-copyright">© 2026 All rights reserved. Platform rebranded & secured.</span>
        </div>
        <div className="footer-right">
          <a href="/download" onClick={(e) => {
            e.preventDefault();
            window.history.pushState({}, '', '/download');
            window.location.reload();
          }}>Download</a>
          <a href="#">Privacy Policy</a>
          <a href="#">Terms of Service</a>
          <a href={BOT_INVITE} target="_blank" rel="noopener noreferrer">Invite Bot</a>
        </div>
      </footer>

      {/* CSS STYLING INJECTED DIRECTLY */}
      <style>{`
        /* Core Aesthetics */
        .landing-page {
          background-color: #07090e;
          min-height: 100vh;
          font-family: 'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          color: #f3f4f6;
          position: relative;
          overflow-x: hidden;
          padding-top: 64px;
        }

        /* Ambient Glow System */
        .bg-glow {
          position: absolute;
          border-radius: 50%;
          filter: blur(120px);
          pointer-events: none;
          z-index: 0;
          opacity: 0.6;
        }
        .bg-glow-1 {
          top: 5%;
          left: 10%;
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, rgba(255, 59, 48, 0.08) 0%, transparent 70%);
        }
        .bg-glow-2 {
          top: 35%;
          right: 5%;
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, rgba(255, 149, 0, 0.05) 0%, transparent 70%);
        }
        .bg-glow-3 {
          bottom: 10%;
          left: 15%;
          width: 450px;
          height: 450px;
          background: radial-gradient(circle, rgba(255, 45, 85, 0.06) 0%, transparent 70%);
        }

        /* Glassmorphism Classes */
        .glass-panel {
          background: rgba(13, 17, 28, 0.7);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 16px;
        }

        .glass-nav {
          background: rgba(7, 9, 14, 0.8);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        /* Navigation */
        .navbar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 64px;
          padding: 0 48px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          z-index: 1000;
        }
        .nav-brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .brand-badge-icon {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: linear-gradient(135deg, #ff3b30, #ff9500);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 13px;
          color: #fff;
          box-shadow: 0 0 15px rgba(255, 59, 48, 0.4);
        }
        .brand-text {
          font-weight: 800;
          font-size: 16px;
          letter-spacing: 1.5px;
          background: linear-gradient(135deg, #fff, #9ca3af);
          -webkit-background-clip: text;
          -webkit-text-fillColor: transparent;
        }
        .live-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 3px 10px;
          border-radius: 20px;
          background: rgba(52, 199, 89, 0.1);
          border: 1px solid rgba(52, 199, 89, 0.25);
          font-size: 11px;
          color: #34c759;
          font-weight: 600;
        }
        .live-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #34c759;
          box-shadow: 0 0 8px #34c759;
          animation: pulse 1.5s infinite;
        }
        .nav-links {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .nav-links a {
          color: #9ca3af;
          text-decoration: none;
          font-size: 14px;
          padding: 6px 12px;
          transition: color 0.2s;
        }
        .nav-links a:hover {
          color: #ff3b30;
        }
        .external-link-nav {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .btn-dashboard-entry {
          background: linear-gradient(135deg, #ff3b30, #ff453a);
          border: none;
          color: white;
          padding: 8px 18px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: transform 0.2s, box-shadow 0.2s;
          box-shadow: 0 4px 15px rgba(255, 59, 48, 0.25);
        }
        .btn-dashboard-entry:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(255, 59, 48, 0.35);
        }

        /* Hero Section */
        .hero-section {
          position: relative;
          z-index: 10;
          padding: 120px 24px 80px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .hero-content {
          max-width: 900px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .hero-announcement {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 16px;
          border-radius: 30px;
          background: rgba(255, 59, 48, 0.08);
          border: 1px solid rgba(255, 59, 48, 0.2);
          font-size: 12px;
          color: #ff453a;
          font-weight: 700;
          margin-bottom: 24px;
          letter-spacing: 0.5px;
        }
        .hero-title {
          font-size: clamp(40px, 6vw, 76px);
          font-weight: 900;
          line-height: 1.05;
          margin-bottom: 24px;
          letter-spacing: -1.5px;
          color: #fff;
        }
        .text-crimson-gradient {
          background: linear-gradient(135deg, #ff3b30 20%, #ff9500 80%, #ff2d55 100%);
          -webkit-background-clip: text;
          -webkit-text-fillColor: transparent;
        }
        .hero-subtitle {
          font-size: clamp(16px, 2vw, 19px);
          color: #9ca3af;
          max-width: 680px;
          margin-bottom: 40px;
          line-height: 1.6;
        }
        .hero-actions {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
          justify-content: center;
        }
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 14px 32px;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 700;
          text-decoration: none;
          transition: all 0.25s ease;
          cursor: pointer;
        }
        .btn-hero-primary {
          background: linear-gradient(135deg, #ff3b30, #ff9500);
          color: white;
          box-shadow: 0 8px 30px rgba(255, 59, 48, 0.3);
        }
        .btn-hero-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 35px rgba(255, 59, 48, 0.4);
        }
        .btn-hero-secondary {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: white;
        }
        .btn-hero-secondary:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.2);
          transform: translateY(-2px);
        }

        /* Stats Bar */
        .stats-section {
          position: relative;
          z-index: 10;
          max-width: 1100px;
          margin: 0 auto 100px;
          padding: 32px;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
        }
        @media (max-width: 768px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 32px;
          }
        }
        .stat-card {
          text-align: center;
        }
        .stat-value {
          font-size: 36px;
          font-weight: 800;
          background: linear-gradient(135deg, #fff, #ff3b30);
          -webkit-background-clip: text;
          -webkit-text-fillColor: transparent;
        }
        .stat-label {
          font-size: 13px;
          color: #6b7280;
          margin-top: 4px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        /* Headers & Section Titles */
        .section-header {
          text-align: center;
          margin-bottom: 60px;
        }
        .section-pre {
          font-size: 11px;
          color: #ff3b30;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 2px;
          display: inline-block;
          margin-bottom: 12px;
        }
        .section-title {
          font-size: 40px;
          font-weight: 800;
          margin: 0 0 16px;
          color: #fff;
        }
        .section-subtitle {
          font-size: 16px;
          color: #9ca3af;
          max-width: 600px;
          margin: 0 auto;
          line-height: 1.6;
        }

        /* Showcase Section */
        .showcase-section {
          max-width: 1200px;
          margin: 0 auto 120px;
          padding: 0 24px;
          position: relative;
          z-index: 10;
        }
        .showcase-container {
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 40px;
          align-items: start;
        }
        @media (max-width: 992px) {
          .showcase-container {
            grid-template-columns: 1fr;
          }
        }
        .showcase-tabs {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        @media (max-width: 992px) {
          .showcase-tabs {
            flex-direction: row;
            overflow-x: auto;
            padding-bottom: 12px;
          }
        }
        .showcase-tab-btn {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 12px;
          cursor: pointer;
          text-align: left;
          transition: all 0.2s ease;
          width: 100%;
        }
        @media (max-width: 992px) {
          .showcase-tab-btn {
            min-width: 250px;
          }
        }
        .showcase-tab-btn:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.1);
        }
        .showcase-tab-btn.active {
          background: rgba(255, 255, 255, 0.06);
          border-color: var(--tab-accent);
          box-shadow: 0 0 20px rgba(255, 255, 255, 0.02);
        }
        .tab-btn-icon {
          width: 38px;
          height: 38px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.04);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #9ca3af;
          transition: all 0.2s;
        }
        .showcase-tab-btn.active .tab-btn-icon {
          background: var(--tab-accent);
          color: white;
          box-shadow: 0 0 10px var(--tab-accent);
        }
        .tab-btn-meta {
          flex: 1;
        }
        .tab-btn-title {
          font-size: 14px;
          font-weight: 700;
          color: #fff;
        }
        .tab-btn-tagline {
          font-size: 11px;
          color: #6b7280;
          margin-top: 2px;
        }

        /* Showcase Mockup Console Panel */
        .showcase-mockup {
          min-height: 340px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .mockup-content {
          padding: 24px;
          display: flex;
          flex-direction: column;
          height: 100%;
          flex: 1;
        }
        .mockup-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          padding-bottom: 14px;
          margin-bottom: 16px;
        }
        .mockup-dots {
          display: flex;
          gap: 6px;
        }
        .dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }
        .dot-red { background-color: #ff3b30; }
        .dot-yellow { background-color: #ff9500; }
        .dot-green { background-color: #34c759; }
        
        .mockup-title-text {
          font-family: monospace;
          font-size: 13px;
          color: #9ca3af;
        }
        .mockup-badge {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          padding: 3px 8px;
          border-radius: 20px;
        }

        .mockup-body {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          min-height: 200px;
        }
        .mockup-footer {
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          padding-top: 16px;
          margin-top: 16px;
        }
        .mockup-footer p {
          font-size: 13px;
          color: #9ca3af;
          margin: 0;
          line-height: 1.5;
        }

        /* Mockup: Terminal Logs */
        .mockup-terminal-lines {
          font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
          font-size: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .terminal-line {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          line-height: 1.5;
        }
        .line-time {
          color: #6b7280;
          flex-shrink: 0;
        }
        .line-tag {
          font-weight: bold;
          padding: 1px 6px;
          border-radius: 4px;
          font-size: 10px;
          flex-shrink: 0;
        }
        .line-tag-danger { background: rgba(255, 59, 48, 0.15); color: #ff3b30; }
        .line-tag-success { background: rgba(52, 199, 89, 0.15); color: #34c759; }
        .line-tag-info { background: rgba(0, 122, 255, 0.15); color: #007aff; }
        .line-tag-warning { background: rgba(255, 149, 0, 0.15); color: #ff9500; }
        .line-text {
          color: #d1d5db;
        }

        /* Mockup: Music Player */
        .mockup-player-container {
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 16px;
        }
        .player-now-playing {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 12px;
        }
        .playing-bars {
          display: flex;
          align-items: flex-end;
          gap: 3px;
          width: 16px;
          height: 16px;
        }
        .bar {
          width: 3px;
          background: #ff3b30;
          animation: dance 1s infinite alternate;
          border-radius: 1px;
        }
        .bar1 { height: 60%; animation-delay: 0.1s; }
        .bar2 { height: 100%; animation-delay: 0.3s; }
        .bar3 { height: 40%; animation-delay: 0.5s; }

        @keyframes dance {
          from { height: 20%; }
          to { height: 100%; }
        }

        .player-label {
          font-size: 9px;
          color: #ff3b30;
          font-weight: 800;
          letter-spacing: 1px;
        }
        .player-track {
          font-size: 13px;
          font-weight: 700;
          color: #fff;
          margin-top: 1px;
        }
        .player-progress-bar {
          height: 4px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 2px;
          margin-bottom: 8px;
          position: relative;
          overflow: hidden;
        }
        .progress-fill {
          position: absolute;
          left: 0; top: 0; bottom: 0;
          background: #ff3b30;
        }
        .player-time-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11px;
          color: #6b7280;
          margin-bottom: 14px;
        }
        .player-controls {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .play-btn-circle {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #ff3b30;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          cursor: pointer;
        }
        .player-volume {
          opacity: 0.7;
        }
        .player-queue-header {
          font-size: 10px;
          font-weight: 700;
          color: #6b7280;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.04);
          padding-top: 10px;
        }
        .player-queue-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .queue-item {
          display: flex;
          gap: 10px;
          font-size: 12px;
          color: #9ca3af;
        }
        .queue-idx {
          color: #ff3b30;
          font-weight: 600;
        }

        /* Mockup: Metrics Grid */
        .mockup-metrics-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .metric-box {
          padding: 16px;
          text-align: center;
        }
        .metric-box-val {
          font-size: 20px;
          font-weight: 800;
        }
        .metric-box-name {
          font-size: 11px;
          color: #6b7280;
          margin-top: 4px;
          text-transform: uppercase;
        }

        /* Mockup: Tickets Table */
        .mockup-tickets-table {
          overflow-x: auto;
        }
        .custom-table-mock {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
          color: #9ca3af;
          text-align: left;
        }
        .custom-table-mock th, .custom-table-mock td {
          padding: 8px 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        }
        .custom-table-mock th {
          font-weight: 700;
          color: #6b7280;
          text-transform: uppercase;
          font-size: 10px;
        }
        .priority-pill {
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
        }
        .priority-high { background: rgba(255, 59, 48, 0.15); color: #ff3b30; }
        .priority-medium { background: rgba(255, 149, 0, 0.15); color: #ff9500; }
        
        .status-pill {
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
        }
        .status-inprogress { background: rgba(0, 122, 255, 0.15); color: #007aff; }
        .status-resolved { background: rgba(52, 199, 89, 0.15); color: #34c759; }

        /* Commands Section */
        .commands-section {
          max-width: 1100px;
          margin: 0 auto 100px;
          padding: 0 24px;
          position: relative;
          z-index: 10;
        }
        .commands-container {
          background: rgba(18, 22, 33, 0.5);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          padding: 24px;
        }
        .commands-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          margin-bottom: 24px;
          flex-wrap: wrap;
        }
        .commands-search-box {
          position: relative;
          flex: 1;
          min-width: 280px;
        }
        .commands-search-box .search-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #6b7280;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .commands-search-input {
          width: 100%;
          background: rgba(10, 12, 18, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 12px 16px 12px 42px;
          color: #fff;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .commands-search-input:focus {
          border-color: var(--accent-primary);
          box-shadow: 0 0 12px rgba(255, 59, 48, 0.15);
        }
        .commands-category-filters {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .btn-filter {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          color: #9ca3af;
          padding: 10px 16px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          letter-spacing: 0.05em;
        }
        .btn-filter:hover {
          background: rgba(255, 255, 255, 0.06);
          color: #fff;
        }
        .btn-filter.active {
          background: var(--accent-primary);
          border-color: var(--accent-primary);
          color: #fff;
          box-shadow: 0 0 12px rgba(255, 59, 48, 0.3);
        }
        .commands-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .command-item-row {
          background: rgba(10, 12, 18, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.03);
          border-radius: 10px;
          overflow: hidden;
          transition: all 0.2s;
        }
        .command-item-row:hover {
          border-color: rgba(255, 255, 255, 0.08);
          background: rgba(10, 12, 18, 0.6);
        }
        .command-item-row.expanded {
          border-color: rgba(255, 59, 48, 0.3);
          background: rgba(10, 12, 18, 0.8);
        }
        .command-item-summary {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          cursor: pointer;
          gap: 16px;
          user-select: none;
          flex-wrap: wrap;
        }
        .command-name-group {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 180px;
        }
        .command-term-icon {
          color: var(--accent-primary);
        }
        .command-name-text {
          font-family: monospace;
          font-weight: 700;
          color: #fff;
          font-size: 15px;
        }
        .command-desc-short {
          flex: 1;
          color: #9ca3af;
          font-size: 14px;
        }
        .command-category-badge {
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          padding: 4px 8px;
          border-radius: 6px;
          letter-spacing: 0.05em;
        }
        .badge-moderation { background: rgba(52, 199, 89, 0.1); color: #34c759; }
        .badge-security { background: rgba(255, 59, 48, 0.1); color: #ff3b30; }
        .badge-music { background: rgba(255, 45, 85, 0.1); color: #ff2d55; }

        .command-item-details {
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          padding: 20px;
          background: rgba(0, 0, 0, 0.2);
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .details-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 24px;
        }
        @media (max-width: 768px) {
          .details-grid {
            grid-template-columns: 1fr;
          }
          .commands-controls {
            flex-direction: column;
            align-items: stretch;
          }
          .commands-category-filters {
            justify-content: stretch;
          }
          .btn-filter {
            flex: 1;
          }
        }
        .detail-label {
          display: block;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #6b7280;
          font-weight: 700;
          margin-bottom: 6px;
        }
        .detail-val {
          color: #d1d5db;
          font-size: 14px;
          line-height: 1.5;
          margin: 0;
        }
        .detail-code {
          display: inline-block;
          font-family: monospace;
          background: #000;
          color: var(--accent-primary);
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 13px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        .params-section {
          margin-top: 8px;
        }
        .params-table-container {
          overflow-x: auto;
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          background: rgba(0, 0, 0, 0.3);
        }
        .params-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-size: 13px;
        }
        .params-table th, .params-table td {
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .params-table th {
          background: rgba(255, 255, 255, 0.02);
          color: #9ca3af;
          font-weight: 600;
        }
        .params-table tr:last-child td {
          border-bottom: none;
        }
        .param-name {
          font-family: monospace;
          font-weight: 700;
          color: #fff;
        }
        .param-type-badge {
          background: rgba(255, 255, 255, 0.05);
          color: #9ca3af;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
        }
        .param-req-badge {
          font-size: 11px;
          font-weight: 700;
        }
        .param-req-badge.required { color: #ff3b30; }
        .param-req-badge.optional { color: #6b7280; }
        .param-desc {
          color: #9ca3af;
        }
        .no-commands-found {
          padding: 48px;
          text-align: center;
          color: #6b7280;
        }

        /* Pricing Section */
        .pricing-section {
          max-width: 1100px;
          margin: 0 auto 120px;
          padding: 0 24px;
          position: relative;
          z-index: 10;
        }
        .pricing-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 28px;
        }
        @media (max-width: 900px) {
          .pricing-grid {
            grid-template-columns: 1fr;
            max-width: 450px;
            margin: 0 auto;
          }
        }
        .pricing-card {
          padding: 32px;
          display: flex;
          flex-direction: column;
          position: relative;
          transition: transform 0.25s, border-color 0.25s;
        }
        .pricing-card:hover {
          transform: translateY(-4px);
        }
        .pricing-card.recommended {
          border-color: rgba(255, 59, 48, 0.4);
          background: linear-gradient(135deg, rgba(255, 59, 48, 0.06), rgba(255, 149, 0, 0.02));
          box-shadow: 0 10px 40px rgba(255, 59, 48, 0.1);
        }
        .pricing-badge {
          position: absolute;
          top: -12px;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(135deg, #ff3b30, #ff9500);
          color: white;
          padding: 4px 16px;
          border-radius: 20px;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          white-space: nowrap;
          box-shadow: 0 4px 10px rgba(255, 59, 48, 0.3);
        }
        
        .pricing-card-header {
          margin-bottom: 24px;
        }
        .plan-name {
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          display: block;
          margin-bottom: 8px;
        }
        .plan-price-row {
          display: flex;
          align-items: baseline;
          gap: 4px;
        }
        .plan-price {
          font-size: 48px;
          font-weight: 800;
          color: #fff;
        }
        .plan-period {
          font-size: 15px;
          color: #6b7280;
        }
        .plan-desc {
          font-size: 13px;
          color: #9ca3af;
          margin-top: 8px;
          line-height: 1.4;
        }
        
        .pricing-divider {
          height: 1px;
          background: rgba(255, 255, 255, 0.06);
          margin-bottom: 24px;
        }
        
        .plan-features {
          list-style: none;
          padding: 0;
          margin: 0 0 32px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          flex: 1;
        }
        .plan-feature-item {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 13.5px;
          color: #d1d5db;
        }
        
        .btn-plan-action {
          width: 100%;
          padding: 12px;
          border-radius: 8px;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-plan-primary {
          background: linear-gradient(135deg, #ff3b30, #ff453a);
          border: none;
          color: white;
        }
        .btn-plan-primary:hover {
          opacity: 0.95;
          transform: translateY(-1px);
        }
        .btn-plan-secondary {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: white;
        }
        .btn-plan-secondary:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.18);
        }

        /* Banner CTA */
        .banner-section {
          max-width: 900px;
          margin: 0 auto 100px;
          padding: 0 24px;
          position: relative;
          z-index: 10;
        }
        .banner-card {
          padding: 60px 48px;
          background: linear-gradient(135deg, rgba(255, 59, 48, 0.08), rgba(255, 149, 0, 0.02));
          border-color: rgba(255, 59, 48, 0.25);
          border-radius: 24px;
        }
        .banner-title {
          font-size: 32px;
          font-weight: 800;
          color: #fff;
          margin-bottom: 12px;
        }
        .banner-desc {
          font-size: 15px;
          color: #9ca3af;
          margin-bottom: 32px;
        }
        .banner-actions {
          display: flex;
          gap: 16px;
          justify-content: center;
          flex-wrap: wrap;
        }
        .btn-banner-primary {
          background: linear-gradient(135deg, #ff3b30, #ff9500);
          color: white;
          padding: 12px 28px;
          border-radius: 10px;
          font-weight: 700;
          font-size: 14px;
          box-shadow: 0 4px 15px rgba(255, 59, 48, 0.3);
        }
        .btn-banner-primary:hover {
          transform: translateY(-1px);
        }
        .btn-banner-secondary {
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: white;
          padding: 12px 28px;
          border-radius: 10px;
          font-weight: 600;
          font-size: 14px;
        }
        .btn-banner-secondary:hover {
          background: rgba(255, 255, 255, 0.05);
        }

        /* Footer */
        .landing-footer {
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          padding: 40px 48px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 20px;
          background: #05070a;
          position: relative;
          z-index: 10;
        }
        .footer-left {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .footer-logo {
          width: 24px;
          height: 24px;
          border-radius: 6px;
          background: linear-gradient(135deg, #ff3b30, #ff9500);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 10px;
          color: white;
        }
        .footer-brand-text {
          font-weight: 700;
          font-size: 13px;
        }
        .footer-copyright {
          font-size: 12px;
          color: #4b5563;
        }
        .footer-right {
          display: flex;
          gap: 24px;
        }
        .footer-right a {
          color: #6b7280;
          font-size: 13px;
          text-decoration: none;
          transition: color 0.2s;
        }
        .footer-right a:hover {
          color: #ff3b30;
        }

        /* Miscellaneous utilities */
        .text-center { text-align: center; }
        .flip-h { transform: scaleX(-1); }
        
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(52, 199, 89, 0.4); }
          70% { box-shadow: 0 0 0 6px rgba(52, 199, 89, 0); }
          100% { box-shadow: 0 0 0 0 rgba(52, 199, 89, 0); }
        }
      `}</style>
    </div>
  );
}
