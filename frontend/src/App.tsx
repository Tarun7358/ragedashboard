import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { SearchOverlay } from './components/SearchOverlay';
import { RestoreWizard } from './components/RestoreWizard';

import { useActivityFeed } from './hooks/useActivityFeed';
import { useDiscordSync } from './hooks/useDiscordSync';

// Pages
const Login = React.lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const OAuthCallback = React.lazy(() => import('./pages/OAuthCallback').then(m => ({ default: m.OAuthCallback })));
const ServerSelection = React.lazy(() => import('./pages/ServerSelection').then(m => ({ default: m.ServerSelection })));
const Landing = React.lazy(() => import('./pages/Landing').then(m => ({ default: m.Landing })));
const DashboardHome = React.lazy(() => import('./pages/DashboardHome').then(m => ({ default: m.DashboardHome })));
const DiscordDashboard = React.lazy(() => import('./pages/DiscordDashboard').then(m => ({ default: m.DiscordDashboard })));
const ConfigHealth = React.lazy(() => import('./pages/ConfigHealth').then(m => ({ default: m.ConfigHealth })));
const Security = React.lazy(() => import('./pages/Security').then(m => ({ default: m.Security })));
const Automation = React.lazy(() => import('./pages/Automation').then(m => ({ default: m.Automation })));
const Logging = React.lazy(() => import('./pages/Logging').then(m => ({ default: m.Logging })));
const Analytics = React.lazy(() => import('./pages/Analytics').then(m => ({ default: m.Analytics })));
const Settings = React.lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const SocialUpdates = React.lazy(() => import('./pages/SocialUpdates').then(m => ({ default: m.SocialUpdates })));
const Welcome = React.lazy(() => import('./pages/Welcome').then(m => ({ default: m.Welcome })));
const Tickets = React.lazy(() => import('./pages/Tickets').then(m => ({ default: m.Tickets })));
const Backups = React.lazy(() => import('./pages/Backups').then(m => ({ default: m.Backups })));
const VoicePresence = React.lazy(() => import('./pages/VoicePresence').then(m => ({ default: m.VoicePresence })));
const VoiceProtection = React.lazy(() => import('./pages/VoiceProtection').then(m => ({ default: m.VoiceProtection })));
const Music = React.lazy(() => import('./pages/Music').then(m => ({ default: m.Music })));
const Roles = React.lazy(() => import('./pages/Roles').then(m => ({ default: m.Roles })));
const WhitelistOverview = React.lazy(() => import('./pages/whitelist/Overview').then(m => ({ default: m.WhitelistOverview })));
const BotWhitelist = React.lazy(() => import('./pages/whitelist/BotWhitelist').then(m => ({ default: m.BotWhitelist })));
const MemberWhitelist = React.lazy(() => import('./pages/whitelist/MemberWhitelist').then(m => ({ default: m.MemberWhitelist })));
const RoleWhitelist = React.lazy(() => import('./pages/whitelist/RoleWhitelist').then(m => ({ default: m.RoleWhitelist })));
const WhitelistActivity = React.lazy(() => import('./pages/whitelist/Activity').then(m => ({ default: m.WhitelistActivity })));
const WhitelistAudit = React.lazy(() => import('./pages/whitelist/AuditLogs').then(m => ({ default: m.WhitelistAudit })));
const WhitelistSettings = React.lazy(() => import('./pages/whitelist/Settings').then(m => ({ default: m.WhitelistSettings })));
const Incidents = React.lazy(() => import('./pages/Incidents').then(m => ({ default: m.Incidents })));
const PublicDashboard = React.lazy(() => import('./pages/PublicDashboard').then(m => ({ default: m.PublicDashboard })));

const Automod = React.lazy(() => import('./pages/Automod').then(m => ({ default: m.Automod })));
const Download = React.lazy(() => import('./pages/Download').then(m => ({ default: m.Download })));
const Giveaway = React.lazy(() => import('./pages/Giveaway').then(m => ({ default: m.Giveaway })));
const Announcements = React.lazy(() => import('./pages/Announcements').then(m => ({ default: m.Announcements })));
const JoinToCreate = React.lazy(() => import('./pages/JoinToCreate').then(m => ({ default: m.JoinToCreate })));
const ReactionRoles = React.lazy(() => import('./pages/ReactionRoles').then(m => ({ default: m.ReactionRoles })));
const Leveling = React.lazy(() => import('./pages/Leveling').then(m => ({ default: m.Leveling })));
const Reminders = React.lazy(() => import('./pages/Reminders').then(m => ({ default: m.Reminders })));
import { useAuth } from './hooks/useAuth';

interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'danger' | 'warning' | 'info';
}

function App() {
  const isPublicRoute = window.location.pathname === '/public';
  const isOAuthCallback = window.location.pathname === '/auth/callback';
  const isDownloadRoute = window.location.pathname === '/download' || window.location.pathname === '/downloads';
  const { isAuthenticated, user, logout, activeGuildId, setActiveGuildId } = useAuth();

  const [activePage, setActivePage] = useState('dashboard');
  const [activeTab, setActiveTab] = useState('overview');
  const [searchOpen, setSearchOpen] = useState(false);
  const [restoreWizardOpen, setRestoreWizardOpen] = useState(false);
  const [selectedBackupId, setSelectedBackupId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  // For guild_manager: track if they've selected a guild yet
  const [guildSelected, setGuildSelected] = useState(!!activeGuildId);

  const {
    events,
    notifications,
    latency,
    uptime,
    isLive,
    setIsLive,
    markAllNotificationsRead,
    clearNotifications,
    pushManualEvent
  } = useActivityFeed();

  const {
    registry,
    modules,
    syncLogs,
    globalSettings,
    refreshSync,
    updateModuleConfig,
    simulateDiscordAction,
    musicPlayerState
  } = useDiscordSync();

  // Watch for module error additions to trigger live warnings toast
  const [prevErrorsCount, setPrevErrorsCount] = useState(0);
  const currentErrorsCount = (modules || []).reduce((acc, m) => acc + (m?.errors?.length || 0), 0);

  useEffect(() => {
    if (currentErrorsCount > prevErrorsCount) {
      triggerToast('Configuration validation alert! Please check the Config Health page.', 'danger');
    }
    setPrevErrorsCount(currentErrorsCount);
  }, [currentErrorsCount]);

  // Handle Ctrl+K shortcut to toggle search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const triggerToast = (message: string, type: ToastItem['type'] = 'success') => {
    const id = `toast-${Date.now()}`;
    setToasts(prev => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const handleNavigate = (page: string, tab?: string) => {
    setActivePage(page);
    if (tab) {
      setActiveTab(tab);
    }
  };

  const renderActivePage = () => {
    switch (activePage) {
      case 'dashboard':
        return (
          <DashboardHome
            events={events}
            latency={latency}
            uptime={uptime}
            onNavigate={handleNavigate}
            onManualTrigger={pushManualEvent}
            modules={modules}
            registry={registry}
          />
        );
      case 'health':
        return (
          <ConfigHealth
            modules={modules}
            registry={registry}
            syncLogs={syncLogs}
            onRefreshSync={refreshSync}
            onNavigate={handleNavigate}
            onSimulateAction={simulateDiscordAction}
          />
        );
      case 'discord-dashboard':
        return (
          <DiscordDashboard
            onSaveConfig={triggerToast}
            onManualTrigger={pushManualEvent}
            modules={modules}
            registry={registry}
            onUpdateConfig={updateModuleConfig}
          />
        );
      case 'security':
        return (
          <Security
            initialTab={activeTab}
            onSaveConfig={triggerToast}
            onManualTrigger={pushManualEvent}
            modules={modules}
            registry={registry}
            onUpdateConfig={updateModuleConfig}
            syncLogs={syncLogs}
          />
        );
      case 'automod':
        return (
          <Automod
            onSaveConfig={triggerToast}
            modules={modules}
            registry={registry}
            onUpdateConfig={updateModuleConfig}
          />
        );
      case 'automation':
        return (
          <Automation
            onSaveConfig={triggerToast}
            onManualTrigger={pushManualEvent}
            modules={modules}
            registry={registry}
            onUpdateConfig={updateModuleConfig}
          />
        );
      // H-1 FIX: Accept both 'social_updates' (sidebar ID / module ID) and
      // legacy 'social-updates' deep-link strings so navigation always works.
      case 'social_updates':
      case 'social-updates':
        return (
          <SocialUpdates
            registry={registry}
            modules={modules}
            updateModuleConfig={updateModuleConfig}
            addSyncLog={(msg, type) => triggerToast(msg, type === 'warn' ? 'warning' : type as any)}
          />
        );
      case 'social-youtube':
        return (
          <SocialUpdates
            initialTab="youtube"
            registry={registry}
            modules={modules}
            updateModuleConfig={updateModuleConfig}
            addSyncLog={(msg, type) => triggerToast(msg, type === 'warn' ? 'warning' : type as any)}
          />
        );
      case 'social-instagram':
        return (
          <SocialUpdates
            initialTab="instagram"
            registry={registry}
            modules={modules}
            updateModuleConfig={updateModuleConfig}
            addSyncLog={(msg, type) => triggerToast(msg, type === 'warn' ? 'warning' : type as any)}
          />
        );
      case 'logs':
        return (
          <Logging
            onSaveConfig={triggerToast}
            onManualTrigger={pushManualEvent}
            modules={modules}
            registry={registry}
            onUpdateConfig={updateModuleConfig}
          />
        );
      case 'analytics':
        return <Analytics modules={modules} registry={registry} syncLogs={syncLogs} />;
      case 'settings':
        return (
          <Settings
            onSaveConfig={triggerToast}
            modules={modules}
            registry={registry}
            onUpdateConfig={updateModuleConfig}
          />
        );
      case 'voice':
        return (
          <VoicePresence
            modules={modules}
            registry={registry}
            syncLogs={syncLogs}
            onNavigate={handleNavigate}
            onUpdateConfig={updateModuleConfig}
          />
        );
      case 'voice-protection':
        return (
          <VoiceProtection
            onSaveConfig={triggerToast}
            modules={modules}
            onUpdateConfig={updateModuleConfig}
            registry={registry}
          />
        );
      case 'music':
        return (
          <Music
            onSaveConfig={triggerToast}
            modules={modules}
            registry={registry}
            onUpdateConfig={updateModuleConfig}
            musicPlayerState={musicPlayerState}
          />
        );

      case 'roles':
        // M-10 FIX: Pass required props to Roles page
        return <Roles modules={modules} registry={registry} onUpdateConfig={updateModuleConfig} />;
      case 'whitelist-overview':
        return <WhitelistOverview modules={modules} registry={registry} onNavigate={handleNavigate} />;
      case 'whitelist-bots':
        return <BotWhitelist modules={modules} registry={registry} onUpdateConfig={updateModuleConfig} />;
      case 'whitelist-members':
        return <MemberWhitelist modules={modules} registry={registry} onUpdateConfig={updateModuleConfig} />;
      case 'whitelist-roles':
        return <RoleWhitelist modules={modules} registry={registry} onUpdateConfig={updateModuleConfig} />;
      case 'whitelist-activity':
        return <WhitelistActivity />;
      case 'whitelist-audit':
        return <WhitelistAudit />;
      case 'whitelist-settings':
        return <WhitelistSettings modules={modules} registry={registry} onUpdateConfig={updateModuleConfig} onSave={() => triggerToast('Settings saved successfully.')} />;
      case 'incidents':
        return <Incidents syncLogs={syncLogs} onNavigate={handleNavigate} />;
      case 'welcome':
        return (
          <Welcome
            onSaveConfig={triggerToast}
            onManualTrigger={pushManualEvent}
            modules={modules}
            registry={registry}
            onUpdateConfig={updateModuleConfig}
          />
        );
      case 'tickets':
        return (
          <Tickets
            onSaveConfig={triggerToast}
            onManualTrigger={pushManualEvent}
            modules={modules}
            registry={registry}
            onUpdateConfig={updateModuleConfig}
          />
        );
      case 'backups':
        return (
          <Backups
            onSaveConfig={triggerToast}
            onManualTrigger={pushManualEvent}
            onOpenRestoreWizard={(backupId) => {
              setSelectedBackupId(backupId || null);
              setRestoreWizardOpen(true);
            }}
            modules={modules}
            registry={registry}
            onUpdateConfig={updateModuleConfig}
          />
        );

      case 'giveaway':
        return (
          <Giveaway
            onSaveConfig={triggerToast}
            modules={modules}
            onUpdateConfig={updateModuleConfig}
          />
        );
      case 'announcements':
        return (
          <Announcements
            onSaveConfig={triggerToast}
            modules={modules}
            onUpdateConfig={updateModuleConfig}
          />
        );
      case 'join_to_create':
        return (
          <JoinToCreate
            onSaveConfig={triggerToast}
            modules={modules}
            onUpdateConfig={updateModuleConfig}
            registry={registry}
          />
        );
      case 'reaction_roles':
        return (
          <ReactionRoles
            onSaveConfig={triggerToast}
            modules={modules}
            registry={registry}
            onUpdateConfig={updateModuleConfig}
          />
        );
      case 'leveling':
        return (
          <Leveling
            onSaveConfig={triggerToast}
            modules={modules}
            registry={registry}
            onUpdateConfig={updateModuleConfig}
          />
        );
      case 'reminders':
        return (
          <Reminders
            onSaveConfig={triggerToast}
            modules={modules}
            registry={registry}
            onUpdateConfig={updateModuleConfig}
          />
        );
      // C-5 FIX: Removed duplicate 'logging' case — 'logs' (lines above) is
      // the canonical route that matches the sidebar nav item ID.
      // C-6 FIX: Removed dead bot_whitelist/member_whitelist/role_whitelist cases.
      // These were unreachable (sidebar uses 'whitelist-bots' etc.) AND missing
      // the required onUpdateConfig prop which would cause a crash if reached.
      default:
        return (
          <DashboardHome
            events={events}
            latency={latency}
            uptime={uptime}
            onNavigate={handleNavigate}
            onManualTrigger={pushManualEvent}
            modules={modules}
            registry={registry}
          />
        );
    }
  };

  // === ROUTE GUARDS ===

  // Handle Discord OAuth callback
  if (isOAuthCallback) {
    return (
      <OAuthCallback
        onSuccess={() => {
          setGuildSelected(false); // Show server selection after OAuth
          window.history.replaceState({}, '', '/');
        }}
      />
    );
  }

  // Public status dashboard
  if (isPublicRoute) {
    return <PublicDashboard />;
  }

  // Downloads page
  if (isDownloadRoute) {
    return <Download />;
  }

  // Not authenticated → show landing at /, login at /login
  if (!isAuthenticated) {
    const isLoginRoute = window.location.pathname === '/login';
    if (isLoginRoute) {
      return (
        <>
          <Login />
          <div className="toast-container">
            {toasts.map((toast) => (
              <div key={toast.id} className={`toast toast-${toast.type}`}>
                <span>{toast.message}</span>
              </div>
            ))}
          </div>
        </>
      );
    }
    return <Landing onGetStarted={() => { window.history.pushState({}, '', '/login'); window.location.reload(); }} />;
  }

  // Guild manager who hasn't selected a guild yet → server selection
  if (user?.role === 'guild_manager' && !guildSelected) {
    return (
      <ServerSelection
        onSelectGuild={(guildId) => {
          setActiveGuildId(guildId);
          setGuildSelected(true);
        }}
      />
    );
  }

  return (
    <>
      <Layout
        activePage={activePage}
        onPageChange={handleNavigate}
        notifications={notifications}
        latency={latency}
        uptime={uptime}
        isLive={isLive}
        onToggleLive={() => setIsLive(!isLive)}
        onMarkAllRead={markAllNotificationsRead}
        onClearNotifications={clearNotifications}
        onOpenSearch={() => setSearchOpen(true)}
        onLogout={logout}
        modules={modules}
      >
        <React.Suspense fallback={
          <div className="flex h-64 items-center justify-center">
            <div className="text-slate-400">Loading page...</div>
          </div>
        }>
          {renderActivePage()}
        </React.Suspense>
      </Layout>

      {/* Modal Overlays */}
      <SearchOverlay
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={handleNavigate}
      />

      <RestoreWizard
        isOpen={restoreWizardOpen}
        onClose={() => {
          setRestoreWizardOpen(false);
          setSelectedBackupId(null);
        }}
        onSuccess={(msg) => triggerToast(msg, 'success')}
        initialBackupId={selectedBackupId}
      />

      {/* Toast Notification Container */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export default App;
