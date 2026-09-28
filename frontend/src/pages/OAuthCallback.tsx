import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

/**
 * OAuthCallback — handles the redirect from Discord after OAuth authorization.
 * Backend redirects here with ?data=<encoded JSON> containing token + guilds.
 * After parsing, it calls loginDiscord() and transitions to server selection.
 */
export function OAuthCallback({ onSuccess }: { onSuccess: () => void }) {
  const { loginDiscord } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rawData = params.get('data');
    const error = params.get('error');

    if (error) {
      setErrorMsg(error === 'oauth_denied' ? 'Authorization was cancelled.' : 'Discord login failed. Please try again.');
      setStatus('error');
      return;
    }

    if (!rawData) {
      setErrorMsg('Invalid callback — no data received from Discord.');
      setStatus('error');
      return;
    }

    try {
      const decoded = JSON.parse(decodeURIComponent(rawData));
      const { token, user, managedGuilds, approvals } = decoded;

      if (!token || !user) throw new Error('Malformed session data');

      loginDiscord(token, user, managedGuilds || [], approvals || {});
      setStatus('success');

      // Short success animation before redirecting to server selection
      setTimeout(() => {
        try {
          window.history.replaceState({}, '', '/');
        } catch {}
        if (onSuccess) {
          onSuccess();
        }
        // Fallback navigation in case router or state does not immediately swap
        setTimeout(() => {
          if (window.location.pathname === '/auth/callback') {
            window.location.replace('/');
          }
        }, 500);
      }, 1000);
    } catch (err: any) {
      setErrorMsg('Failed to process login. Please try again.');
      setStatus('error');
    }
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      width: '100vw',
      background: '#0B0F19',
      backgroundImage: 'radial-gradient(at 0% 0%, rgba(124,92,252,0.15) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(79,140,255,0.1) 0px, transparent 50%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        style={{
          background: 'rgba(29, 33, 43, 0.95)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20,
          padding: '60px 48px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
          minWidth: 380,
          boxShadow: '0 30px 60px rgba(0,0,0,0.5)'
        }}
      >
        {status === 'loading' && (
          <>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <Loader2 size={48} color="var(--accent-purple, #7C5CFC)" />
            </motion.div>
            <div>
              <h2 style={{ color: '#fff', margin: '0 0 8px', fontSize: 22 }}>Completing Login...</h2>
              <p style={{ color: '#9CA3AF', margin: 0, fontSize: 14 }}>Fetching your Discord servers</p>
            </div>
          </>
        )}

        {status === 'success' && (
          <>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200 }}
            >
              <CheckCircle size={56} color="#22C55E" />
            </motion.div>
            <div>
              <h2 style={{ color: '#22C55E', margin: '0 0 8px', fontSize: 22 }}>Login Successful!</h2>
              <p style={{ color: '#9CA3AF', margin: 0, fontSize: 14 }}>Taking you to server selection...</p>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle size={56} color="#EF4444" />
            <div>
              <h2 style={{ color: '#EF4444', margin: '0 0 8px', fontSize: 22 }}>Login Failed</h2>
              <p style={{ color: '#9CA3AF', margin: '0 0 24px', fontSize: 14 }}>{errorMsg}</p>
              <button
                onClick={() => window.location.href = '/login'}
                style={{
                  background: 'linear-gradient(135deg, #7C5CFC, #4F8CFF)',
                  border: 'none',
                  color: '#fff',
                  padding: '12px 28px',
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Back to Login
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
