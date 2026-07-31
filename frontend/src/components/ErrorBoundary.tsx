import React from 'react';
import { logger } from '../services/logger';

interface State {
  hasError: boolean;
  error: Error | null;
  info: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ info });
    logger.error(`[ErrorBoundary] ${error.message}`, { componentStack: info.componentStack }, 'react');
  }


  handleReload = () => {
    this.setState({ hasError: false, error: null, info: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #050508 0%, #0f0f1a 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Inter', -apple-system, sans-serif",
          padding: '40px 20px'
        }}>
          <div style={{
            maxWidth: '560px',
            width: '100%',
            background: 'rgba(15, 15, 25, 0.9)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '16px',
            padding: '40px',
            boxShadow: '0 0 60px rgba(239, 68, 68, 0.08), 0 20px 60px rgba(0,0,0,0.6)'
          }}>
            {/* Icon */}
            <div style={{
              width: '56px', height: '56px',
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '14px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '26px', marginBottom: '20px'
            }}>⚠</div>

            <h2 style={{ color: '#f1f5f9', fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>
              Dashboard Error
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '24px', lineHeight: 1.6 }}>
              A rendering error occurred. This is usually caused by a temporary state issue.
              Try recovering — no data will be lost.
            </p>

            {/* Error message */}
            <div style={{
              background: 'rgba(239,68,68,0.07)',
              border: '1px solid rgba(239,68,68,0.15)',
              borderRadius: '8px',
              padding: '12px 14px',
              marginBottom: '24px',
              fontFamily: 'monospace',
              fontSize: '12px',
              color: '#fca5a5',
              wordBreak: 'break-all',
              maxHeight: '100px',
              overflowY: 'auto'
            }}>
              {this.state.error?.message || 'Unknown error'}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={this.handleReload}
                style={{
                  flex: 1,
                  padding: '10px 20px',
                  background: 'linear-gradient(135deg, #4f46e5, #818cf8)',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: "'Inter', sans-serif"
                }}
              >
                🔄 Try to Recover
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{
                  flex: 1,
                  padding: '10px 20px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: '#94a3b8',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: "'Inter', sans-serif"
                }}
              >
                ↺ Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
