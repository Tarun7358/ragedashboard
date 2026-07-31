import { API_BASE } from '../config';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, ShieldAlert, Server, Activity, Database, Lock, Globe, Loader2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

// Discord brand SVG icon
const DiscordIcon = () => (
  <svg width="18" height="18" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M60.1 4.9A58.5 58.5 0 0 0 45.5.4a.22.22 0 0 0-.23.1 40.8 40.8 0 0 0-1.8 3.7 54 54 0 0 0-16.2 0A37.7 37.7 0 0 0 25.4.5a.22.22 0 0 0-.23-.1A58.3 58.3 0 0 0 10.6 4.9a.2.2 0 0 0-.1.08C1.6 18 -.97 30.7.3 43.2a.23.23 0 0 0 .09.16 58.8 58.8 0 0 0 17.7 9 .22.22 0 0 0 .24-.08 42 42 0 0 0 3.6-5.9.22.22 0 0 0-.12-.3 38.7 38.7 0 0 1-5.5-2.6.22.22 0 0 1-.02-.37c.37-.28.74-.56 1.1-.85a.21.21 0 0 1 .22-.03c11.6 5.3 24.1 5.3 35.5 0a.21.21 0 0 1 .23.03l1.1.85a.22.22 0 0 1-.02.37 36.2 36.2 0 0 1-5.5 2.6.22.22 0 0 0-.12.31 47.2 47.2 0 0 0 3.6 5.9.22.22 0 0 0 .24.08 58.6 58.6 0 0 0 17.7-9 .22.22 0 0 0 .09-.16c1.5-15.5-2.5-28-10.6-39.4a.17.17 0 0 0-.09-.08ZM23.7 35.5c-3.5 0-6.4-3.2-6.4-7.1s2.8-7.1 6.4-7.1c3.6 0 6.5 3.2 6.4 7.1 0 3.9-2.8 7.1-6.4 7.1Zm23.6 0c-3.5 0-6.4-3.2-6.4-7.1s2.8-7.1 6.4-7.1c3.6 0 6.5 3.2 6.4 7.1 0 3.9-2.8 7.1-6.4 7.1Z" fill="currentColor"/>
  </svg>
);

export function Login() {
  const { login } = useAuth();
  const [discordLoading, setDiscordLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [status, setStatus] = useState<any>(null);

  // Check for OAuth errors in URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('error');
    if (oauthError === 'oauth_denied') setErrorMsg('Discord authorization was cancelled.');
    else if (oauthError === 'oauth_failed') setErrorMsg('Discord login failed. Please try again.');
  }, []);

  useEffect(() => {
    const fetchStatus = () => {
      fetch(`${API_BASE}/api/status`)
        .then(res => res.json())
        .then(data => setStatus(data))
        .catch(err => console.error('Failed to fetch status:', err));
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleDiscordLogin = async () => {
    setDiscordLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/discord`);
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      setErrorMsg('Could not connect to the server. Make sure the backend is running.');
      setDiscordLoading(false);
    }
  };



  return (
    <div className="login-container">
      {/* Animated Background Particles */}
      <div className="particles-overlay">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="particle"
            animate={{
              y: [Math.random() * 1000, Math.random() * -1000],
              x: [Math.random() * 100, Math.random() * -100],
              opacity: [0, 0.5, 0]
            }}
            transition={{
              duration: Math.random() * 10 + 10,
              repeat: Infinity,
              ease: "linear"
            }}
            style={{
              position: 'absolute',
              width: Math.random() * 4 + 2 + 'px',
              height: Math.random() * 4 + 2 + 'px',
              backgroundColor: 'var(--accent-primary)',
              borderRadius: '50%',
              left: Math.random() * 100 + '%',
              top: Math.random() * 100 + '%',
              filter: 'blur(1px)'
            }}
          />
        ))}
      </div>

      <div className="login-layout">
        {/* Left Side: Branding & Status */}
        <motion.div 
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
          className="login-branding"
        >
          <div className="branding-header">
            <img src="/ro-logo.png" alt="Rage Optimiser Logo" style={{ width: '48px', height: '48px', objectFit: 'contain' }} />
            <div>
              <h1 className="branding-title">RAGE OPTIMISER</h1>
              <h2 className="branding-subtitle">Enterprise Discord Security Platform</h2>
            </div>
          </div>
          
          <p className="branding-desc">Protect • Monitor • Automate • Secure</p>

          <div className="features-grid">
            <div className="feature-item"><Shield size={16} /> Anti-Nuke Protection</div>
            <div className="feature-item"><Lock size={16} /> Bot Protection</div>
            <div className="feature-item"><Globe size={16} /> Real-Time Monitoring</div>
            <div className="feature-item"><Activity size={16} /> Live Analytics</div>
          </div>

          <div className="status-card glass-panel">
            <h3 className="status-title">Live System Status</h3>
            {status ? (
              <div className="status-grid">
                <div className="status-metric">
                  <span className="metric-label">Protected Servers</span>
                  <span className="metric-value">{status.protectedServers}</span>
                </div>
                <div className="status-metric">
                  <span className="metric-label">Threats Blocked Today</span>
                  <span className="metric-value" style={{ color: 'var(--color-success)' }}>{status.threatsBlocked}</span>
                </div>
                <div className="status-divider"></div>
                <div className="status-row">
                  <Server size={14} /> <span>Bot Status</span>
                  <span className="status-indicator success">🟢 {status.bot.status}</span>
                </div>
                <div className="status-row">
                  <Database size={14} /> <span>Database</span>
                  <span className="status-indicator success">🟢 {status.database.status}</span>
                </div>
                <div className="status-row">
                  <Activity size={14} /> <span>API & WebSockets</span>
                  <span className="status-indicator success">🟢 {status.api.status}</span>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
                <Loader2 size={24} className="spin" color="var(--accent-primary)" />
              </div>
            )}
          </div>
        </motion.div>

        {/* Right Side: Login Panel */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="login-form-container"
        >
          <div className="login-card glass-panel">
            <div className="login-card-header">
              <h2>Access Dashboard</h2>
              <p>Sign in to manage your Discord server</p>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
              >
                {errorMsg && (
                  <div className="login-error-container">
                    <div className="login-error">
                      <ShieldAlert size={16} />
                      <div>
                        <strong>Backend Server Unreachable</strong>
                        <p style={{ margin: '4px 0 0 0', fontSize: '12px', opacity: 0.9 }}>
                          {errorMsg}
                        </p>
                      </div>
                    </div>
                    <div className="backend-guide">
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#93C5FD', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Server size={14} /> Production Deployment Setup:
                      </h4>
                      <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <li>Deploy backend server (`backend/src/index.ts`) on Render, Railway, Fly.io, or VPS with `DASHBOARD_ENABLED=true`.</li>
                        <li>In Netlify Site Settings &rarr; <strong>Environment Variables</strong>, add:
                          <br /><code style={{ background: 'rgba(0,0,0,0.4)', padding: '2px 6px', borderRadius: '4px', color: '#60A5FA' }}>VITE_API_URL = https://your-backend-api.com</code>
                        </li>
                        <li>Re-deploy site on Netlify to apply the API endpoint.</li>
                      </ol>
                    </div>
                  </div>
                )}

                {/* Discord OAuth Button */}
                <button
                  type="button"
                  onClick={handleDiscordLogin}
                  disabled={discordLoading}
                  className="btn-discord-login"
                >
                  {discordLoading ? (
                    <Loader2 size={18} className="spin" />
                  ) : (
                    <DiscordIcon />
                  )}
                  {discordLoading ? 'Redirecting to Discord...' : 'Login with Discord'}
                </button>
              </motion.div>
            </AnimatePresence>


            <div className="login-footer">
              <span>v1.0.0</span>
              <span>Powered by Rage Optimiser</span>
            </div>
          </div>
        </motion.div>
      </div>

      <style>{`
        .login-container {
          min-height: 100vh;
          width: 100vw;
          background-color: #0B0F19;
          background-image: 
            radial-gradient(at 0% 0%, rgba(59, 130, 246, 0.15) 0px, transparent 50%),
            radial-gradient(at 100% 100%, rgba(139, 92, 246, 0.15) 0px, transparent 50%);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }

        .particles-overlay {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          pointer-events: none;
          z-index: 0;
        }

        .login-layout {
          position: relative;
          z-index: 10;
          display: flex;
          width: 100%;
          max-width: 1200px;
          padding: 40px;
          gap: 60px;
          align-items: center;
        }

        @media (max-width: 900px) {
          .login-layout {
            flex-direction: column;
            gap: 40px;
            padding: 20px;
          }
        }

        /* LEFT SIDE BRANDING */
        .login-branding {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .branding-header {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .branding-title {
          font-size: 32px;
          font-weight: 800;
          letter-spacing: -0.5px;
          color: white;
          margin: 0;
        }

        .branding-subtitle {
          font-size: 16px;
          font-weight: 500;
          color: var(--accent-primary);
          margin: 4px 0 0 0;
        }

        .branding-desc {
          font-size: 15px;
          color: var(--text-secondary);
        }

        .features-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 10px;
        }

        .feature-item {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--text-primary);
          font-size: 14px;
          background: rgba(255, 255, 255, 0.03);
          padding: 8px 12px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .glass-panel {
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }

        .status-card {
          margin-top: 20px;
          padding: 24px;
        }

        .status-title {
          font-size: 13px;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: var(--text-muted);
          margin: 0 0 16px 0;
        }

        .status-grid {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .status-metric {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .metric-label {
          color: var(--text-secondary);
          font-size: 14px;
        }

        .metric-value {
          font-size: 20px;
          font-weight: 700;
          color: white;
        }

        .status-divider {
          height: 1px;
          background: rgba(255, 255, 255, 0.05);
          margin: 8px 0;
        }

        .status-row {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 13px;
          color: var(--text-primary);
        }

        .status-indicator.success {
          margin-left: auto;
          font-family: monospace;
          color: var(--color-success);
        }

        /* RIGHT SIDE FORM */
        .login-form-container {
          flex: 1;
          max-width: 440px;
          width: 100%;
        }

        .login-card {
          padding: 40px;
          display: flex;
          flex-direction: column;
          gap: 32px;
        }

        .login-card-header h2 {
          font-size: 24px;
          color: white;
          margin: 0 0 8px 0;
        }

        .login-card-header p {
          color: var(--text-secondary);
          font-size: 14px;
          margin: 0;
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .login-error {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(239, 68, 68, 0.1);
          color: var(--color-danger);
          padding: 12px;
          border-radius: 8px;
          font-size: 13px;
          border: 1px solid rgba(239, 68, 68, 0.2);
        }

        .input-with-icon {
          position: relative;
          display: flex;
          align-items: center;
        }

        .input-with-icon svg:first-child {
          position: absolute;
          left: 14px;
          color: var(--text-muted);
        }

        .input-with-icon input {
          width: 100%;
          padding: 12px 14px 12px 40px;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: white;
          font-size: 14px;
          transition: all 0.2s ease;
        }

        .input-with-icon input:focus {
          border-color: var(--accent-primary);
          outline: none;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
        }

        .reveal-btn {
          position: absolute;
          right: 14px;
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 0;
        }

        .reveal-btn:hover {
          color: white;
        }

        /* Discord OAuth Button */
        .btn-discord-login {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 14px;
          background: #5865F2;
          border: none;
          border-radius: 10px;
          color: white;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: inherit;
          box-shadow: 0 4px 15px rgba(88,101,242,0.3);
        }
        .btn-discord-login:hover:not(:disabled) {
          background: #4752C4;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(88,101,242,0.4);
        }
        .btn-discord-login:active:not(:disabled) {
          transform: translateY(0);
        }
        .btn-discord-login:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        /* Or Divider */
        .auth-divider {
          display: flex;
          align-items: center;
          gap: 14px;
          color: var(--text-muted);
          font-size: 12px;
        }
        .auth-divider::before, .auth-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: rgba(255,255,255,0.06);
        }
        .auth-divider span {
          text-transform: uppercase;
          letter-spacing: 0.1em;
          font-weight: 500;
        }

        /* Spin animation */
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }

        .login-submit {
          width: 100%;
          padding: 12px;
          font-size: 14px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          color: white;
          border-radius: 8px;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s, background 0.2s;
          font-family: inherit;
        }

        .login-submit:hover {
          transform: translateY(-1px);
          background: rgba(255,255,255,0.1);
        }

        .login-submit:active {
          transform: translateY(1px);
        }

        .login-footer {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: var(--text-muted);
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          padding-top: 20px;
        }

        .login-loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 250px;
          text-align: center;
        }

        .success-mark {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
      `}</style>
    </div>
  );
}
