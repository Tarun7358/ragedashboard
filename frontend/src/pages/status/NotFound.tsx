import React from 'react';
import { AlertTriangle, Home, ArrowLeft } from 'lucide-react';

interface NotFoundProps {
  onNavigate?: (page: string) => void;
}

export function NotFound({ onNavigate }: NotFoundProps) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center">
      <div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
        <AlertTriangle size={48} />
      </div>
      <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">404 — Page Not Found</h1>
      <p className="max-w-md text-slate-400 text-sm mb-8">
        The requested resource or dashboard page does not exist or has been relocated to another endpoint.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-700 transition"
        >
          <ArrowLeft size={16} /> Go Back
        </button>
        <button
          onClick={() => onNavigate ? onNavigate('dashboard') : (window.location.href = '/')}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition shadow-lg shadow-indigo-600/20"
        >
          <Home size={16} /> Return to Dashboard
        </button>
      </div>
    </div>
  );
}
