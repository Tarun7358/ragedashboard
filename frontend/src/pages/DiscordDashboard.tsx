import React, { useState } from 'react';
import { LayoutDashboard, Save, CheckCircle, RefreshCcw, LayoutTemplate, Sparkles, Settings2, Info } from 'lucide-react';
import { SetupWizard } from '../components/SetupWizard';
import { ChannelSelect } from '../components/ResourceSelectors';

interface DiscordDashboardProps {
  onSaveConfig: (msg: string) => void;
  onManualTrigger: (msg: string, type: 'info' | 'success' | 'warning' | 'danger' | 'purple', cat: 'System') => void;
  modules: any[];
  registry: any;
  onUpdateConfig: (moduleId: string, config: Record<string, any>, enabledOverride?: boolean) => void;
}

export function DiscordDashboard({
  onSaveConfig,
  onManualTrigger,
  modules,
  registry,
  onUpdateConfig
}: DiscordDashboardProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [wizardStep, setWizardStep] = useState(0);

  const dashModule = (modules || []).find(m => m.id === 'discord-dashboard') || { config: {}, status: 'disabled', errors: [], progress: 0 };
  const config = dashModule.config || {};

  const channelId = config.channelId || '';
  const refreshInterval = config.refreshInterval || 30000; // default 30s
  
  const [enabledPages, setEnabledPages] = useState({
    home: config.enabledPages?.home ?? true,
    members: config.enabledPages?.members ?? true,
    messages: config.enabledPages?.messages ?? true,
    voice: config.enabledPages?.voice ?? true,
    tickets: config.enabledPages?.tickets ?? true,
    events: config.enabledPages?.events ?? true,
    stats: config.enabledPages?.stats ?? true,
    more: config.enabledPages?.more ?? true,
  });

  const handleUpdate = (fields: Record<string, any>) => {
    onUpdateConfig('discord-dashboard', fields);
  };

  const handleTogglePage = (page: string, value: boolean) => {
    const newPages = { ...enabledPages, [page]: value };
    setEnabledPages(newPages);
    handleUpdate({ enabledPages: newPages });
  };

  const handleSave = () => {
    onSaveConfig('Discord Dashboard layout and configuration saved.');
    onManualTrigger('Discord Dashboard: Configuration persisted to local state.', 'success', 'System');
  };

  const handleToggleEnable = () => {
    const nextEnabled = dashModule.status !== 'enabled';
    onUpdateConfig('discord-dashboard', {}, nextEnabled);
    onSaveConfig(`Discord Dashboard ${nextEnabled ? 'ENABLED' : 'DISABLED'}.`);
    onManualTrigger(`Discord Dashboard: Module status set to ${nextEnabled ? 'ACTIVE' : 'INACTIVE'}.`, nextEnabled ? 'success' : 'warning', 'System');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Premium Page Header */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(124, 92, 252, 0.08) 0%, rgba(79, 140, 255, 0.03) 100%)',
        padding: '24px 32px',
        borderRadius: '16px',
        border: '1px solid rgba(124, 92, 252, 0.15)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
        backdropFilter: 'blur(8px)',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '20px'
      }}>
        {/* Glow */}
        <div style={{
          position: 'absolute', top: '-50px', right: '-50px', width: '150px', height: '150px',
          background: 'radial-gradient(circle, rgba(124, 92, 252, 0.25) 0%, transparent 70%)',
          filter: 'blur(20px)', pointerEvents: 'none'
        }} />
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            background: 'linear-gradient(135deg, #7C5CFC 0%, #4F8CFF 100%)',
            padding: '12px',
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(124, 92, 252, 0.4)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <LayoutDashboard size={28} />
          </div>
          <div>
            <h1 className="page-title" style={{
              fontSize: '28px',
              fontWeight: 800,
              background: 'linear-gradient(135deg, #FFF 30%, #A78BFA 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              margin: 0,
              letterSpacing: '-0.5px'
            }}>Interactive Guild Dashboard</h1>
            <p className="page-subtitle" style={{
              fontSize: '14px',
              color: '#94A3B8',
              margin: '4px 0 0 0',
              fontWeight: 500
            }}>
              Deploy a persistent, self-updating statistics panel pinned in your Discord channel. Built on a zero-noise single-message architecture using interactive paging buttons.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', position: 'relative', zIndex: 2 }}>
          <button 
            className={`btn ${dashModule.status === 'enabled' ? 'btn-danger' : 'btn-primary'}`}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              background: dashModule.status === 'enabled' ? 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)' : 'linear-gradient(135deg, #7C5CFC 0%, #5B21B6 100%)',
              border: 'none',
              color: '#FFF',
              boxShadow: dashModule.status === 'enabled' ? '0 4px 14px rgba(239, 68, 68, 0.25)' : '0 4px 14px rgba(124, 92, 252, 0.3)'
            }}
            onClick={handleToggleEnable}
          >
            {dashModule.status === 'enabled' ? 'Deactivate Dashboard' : 'Activate Dashboard'}
          </button>
        </div>
      </div>

      {/* Tabs Container */}
      <div className="section-panel" style={{
        background: '#FAFAFC', border: '1px solid #E4E4E8',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.3)'
      }}>
        <div className="tabs-nav" style={{
          display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '12px', marginBottom: '24px'
        }}>
          {[
            { id: 'overview', label: 'Overview & Setup Wizard' },
            { id: 'pages', label: 'Interactive Page Architect' },
            { id: 'appearance', label: 'Refresh Intervals & Style' }
          ].map(tab => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: activeTab === tab.id ? 'linear-gradient(135deg, rgba(124, 92, 252, 0.15) 0%, rgba(79, 140, 255, 0.05) 100%)' : 'transparent',
                border: activeTab === tab.id ? '1px solid rgba(124, 92, 252, 0.3)' : '1px solid transparent',
                color: activeTab === tab.id ? '#FFF' : '#94A3B8',
                borderRadius: '8px',
                padding: '10px 18px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: activeTab === tab.id ? '0 4px 12px rgba(124, 92, 252, 0.1)' : 'none'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="panel-body" style={{ padding: 0 }}>
          
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <SetupWizard
              steps={['Architecture Intro', 'Target Bindings', 'System Activation']}
              activeStep={wizardStep}
              onStepChange={setWizardStep}
              progress={dashModule.progress}
              errors={dashModule.errors}
              status={dashModule.status}
              onToggleEnable={handleToggleEnable}
              onSave={handleSave}
            >
              {wizardStep === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h3 style={{ fontSize: '16px', color: '#FFF', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                    <LayoutDashboard size={20} color="#7C5CFC" />
                    Zero-Noise Single Message Architecture
                  </h3>
                  <p style={{ fontSize: '13px', color: '#94A3B8', lineHeight: '1.6', margin: 0 }}>
                    Traditional bots flood your server with recurring messages and notifications, cluttering channels. Rage Optimiser operates on a <strong>single-message engine</strong>. The dashboard acts as a persistent mini-app pinned inside your target channel. Members click native Discord navigation buttons to toggle views instantly.
                  </p>
                </div>
              )}

              {wizardStep === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <ChannelSelect 
                    label="Dashboard Target Channel Bindings"
                    channels={registry.channels.filter((c: any) => c.type === 'text')}
                    selectedChannelId={channelId}
                    onChange={id => handleUpdate({ channelId: id })}
                    helpText="Choose the specific channel where the persistent dashboard message will be initialized and pinned."
                  />
                  {channelId && (
                    <div style={{
                      padding: '14px 16px',
                      background: 'rgba(124, 92, 252, 0.05)',
                      borderRadius: '12px',
                      border: '1px solid rgba(124, 92, 252, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px'
                    }}>
                      <RefreshCcw size={16} color="#A78BFA" style={{ flexShrink: 0 }} />
                      <p style={{ fontSize: '13px', color: '#C084FC', margin: 0, lineHeight: 1.5 }}>
                        To instantiate the active dashboard element on your server, enter the <code>/setup-discord-dashboard</code> command in the designated channel.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {wizardStep === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center', textAlign: 'center', padding: '24px' }}>
                  <div style={{
                    width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)',
                    border: '2px solid rgba(16, 185, 129, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 16px rgba(16, 185, 129, 0.15)'
                  }}>
                    <CheckCircle size={36} color="#10B981" />
                  </div>
                  <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#09090B', margin: 0 }}>System Ready for Deployment</h3>
                  <p style={{ fontSize: '13px', color: '#94A3B8', margin: 0, maxWidth: '400px', lineHeight: 1.5 }}>
                    All parameters validated successfully. Activate the module above, then configure page modules and refresh rates to suit your guild's throughput.
                  </p>
                </div>
              )}
            </SetupWizard>
          )}

          {/* TAB 2: PAGES */}
          {activeTab === 'pages' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#09090B', margin: 0 }}>Dashboard Sub-Page Navigations</h3>
                <p style={{ fontSize: '13px', color: '#94A3B8', margin: '4px 0 0 0' }}>Enable or disable specific sections on your active panel viewport.</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                {Object.entries(enabledPages).map(([key, value]) => (
                  <div key={key} style={{
                    background: '#FAFAFC', border: '1px solid #E4E4E8',
                    border: '1px solid rgba(255, 255, 255, 0.04)',
                    padding: '16px 20px',
                    borderRadius: '12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'border 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(124, 92, 252, 0.2)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.04)'}
                  >
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#09090B', textTransform: 'capitalize' }}>{key} Page</div>
                      <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: 2 }}>Interactive "{key}" navigation option.</div>
                    </div>
                    <label className="switch">
                      <input 
                        type="checkbox" 
                        checked={value as boolean} 
                        onChange={e => handleTogglePage(key, e.target.checked)} 
                      />
                      <span className="slider"></span>
                    </label>
                  </div>
                ))}
              </div>
              <button className="btn btn-primary" onClick={handleSave} style={{
                background: 'linear-gradient(135deg, #7C5CFC 0%, #5B21B6 100%)',
                border: 'none',
                boxShadow: '0 4px 14px rgba(124, 92, 252, 0.3)',
                padding: '10px 20px',
                borderRadius: '8px',
                color: '#FFF',
                fontWeight: 600,
                cursor: 'pointer',
                alignSelf: 'flex-start'
              }}>Save Configurations</button>
            </div>
          )}

          {/* TAB 3: APPEARANCE */}
          {activeTab === 'appearance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#09090B', margin: 0 }}>Sync Rates & Optimization</h3>
                <p style={{ fontSize: '13px', color: '#94A3B8', margin: '4px 0 0 0' }}>Configure persistence schedules for automatic state updating.</p>
              </div>

              <div className="form-group" style={{ maxWidth: '400px' }}>
                <label className="form-label" style={{ fontWeight: 600, color: '#E2E8F0' }}>Auto Refresh Rate Interval</label>
                <select className="form-select" value={refreshInterval} onChange={e => handleUpdate({ refreshInterval: parseInt(e.target.value) })} style={{ height: '42px', background: 'rgba(15, 23, 42, 0.5)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <option value={10000}>10 Seconds (High Throughput)</option>
                  <option value={30000}>30 Seconds (Recommended Optimal)</option>
                  <option value={60000}>1 Minute (Low Power)</option>
                  <option value={300000}>5 Minutes</option>
                  <option value={600000}>10 Minutes</option>
                </select>
                <span className="form-help">Lower rates consume more Discord API bandwidth and may trigger rate limiting.</span>
              </div>
              
              <button className="btn btn-primary" onClick={handleSave} style={{
                background: 'linear-gradient(135deg, #7C5CFC 0%, #5B21B6 100%)',
                border: 'none',
                boxShadow: '0 4px 14px rgba(124, 92, 252, 0.3)',
                padding: '10px 20px',
                borderRadius: '8px',
                color: '#FFF',
                fontWeight: 600,
                cursor: 'pointer',
                alignSelf: 'flex-start'
              }}>Save Settings</button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
