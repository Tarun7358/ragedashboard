import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { AuthProvider } from './hooks/useAuth';
import { ErrorBoundary } from './components/ErrorBoundary';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <React.Suspense fallback={
          <div className="flex h-screen items-center justify-center bg-[#0B0F19] text-[#94A3B8] font-sans">
            <div className="text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#6366F1] mx-auto mb-4"></div>
              <div className="text-sm font-medium tracking-wide">Loading Rage Optimiser...</div>
            </div>
          </div>
        }>
          <App />
        </React.Suspense>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);

