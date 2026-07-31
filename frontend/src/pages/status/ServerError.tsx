import React from 'react';
import { ServerOff, RefreshCw, Home } from 'lucide-react';

interface ServerErrorProps {
  onNavigate?: (page: string) => void;
}

export function ServerError({ onNavigate }: ServerErrorProps) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center">
      <div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
        <ServerOff size={48} />
      </div>
      <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">500 — Server Exception</h1>
      <p className="max-w-md text-slate-400 text-sm mb-8">
        An unexpected internal error occurred on the API server while processing your request.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 rounded-lg bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 transition shadow-lg shadow-rose-600/20"
        >
          <RefreshCw size={16} /> Reload Page
        </button>
        <button
          onClick={() => onNavigate ? onNavigate('dashboard') : (window.location.href = '/')}
          className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/80 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-slate-700 transition"
        >
          <Home size={16} /> Dashboard
        </button>
      </div>
    </div>
  );
}
