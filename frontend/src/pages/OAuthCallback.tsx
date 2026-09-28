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
      backgroundColor: '#FAFAFA',
      backgroundImage: 'radial-gradient(rgba(0, 0, 0, 0.05) 1px, transparent 1px)',
      backgroundSize: '24px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
    }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        style={{
          background: '#FFFFFF',
          border: '1px solid #E4E4E7',
          borderRadius: 16,
          padding: '48px 40px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
          minWidth: 360,
          boxShadow: '0 12px 32px rgba(0,0,0,0.06)'
        }}
      >
        <img 
          src="/rglogo.png" 
          alt="Rage Optimiser" 
          style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'contain', marginBottom: 4 }} 
        />

        {status === 'loading' && (
          <>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <Loader2 size={36} color="#09090B" />
            </motion.div>
            <div>
              <h2 style={{ color: '#09090B', margin: '0 0 6px', fontSize: 20, fontWeight: 800 }}>Completing Authorization...</h2>
              <p style={{ color: '#71717A', margin: 0, fontSize: 13 }}>Fetching your Discord servers and credentials</p>
            </div>
          </>
        )}

        {status === 'success' && (
          <>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 220 }}
            >
              <CheckCircle size={44} color="#16A34A" />
            </motion.div>
            <div>
              <h2 style={{ color: '#09090B', margin: '0 0 6px', fontSize: 20, fontWeight: 800 }}>Authorization Successful</h2>
              <p style={{ color: '#71717A', margin: 0, fontSize: 13 }}>Redirecting to your server selection...</p>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle size={44} color="#DC2626" />
            <div>
              <h2 style={{ color: '#DC2626', margin: '0 0 6px', fontSize: 20, fontWeight: 800 }}>Login Failed</h2>
              <p style={{ color: '#71717A', margin: '0 0 20px', fontSize: 13 }}>{errorMsg}</p>
              <button
                onClick={() => window.location.href = '/login'}
                style={{
                  background: '#09090B',
                  border: '1px solid #09090B',
                  color: '#FFFFFF',
                  padding: '10px 24px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Return to Login
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
