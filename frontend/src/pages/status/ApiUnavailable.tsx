import React from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { API_BASE } from '../../config';

export function ApiUnavailable() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center">
      <div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
        <Activity size={48} />
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">Backend API Offline</h1>
      <p className="max-w-md text-slate-400 text-sm mb-4">
        The dashboard is unable to establish an active HTTP or WebSocket connection with the Rage Optimiser backend server.
      </p>
      <div className="mb-6 rounded-lg bg-slate-900/80 px-4 py-2 text-xs font-mono text-slate-400 border border-slate-800">
        Target Server: <span className="text-amber-300">{API_BASE}</span>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition shadow-lg shadow-indigo-600/20"
      >
        <RefreshCw size={16} /> Recheck Connection
      </button>
    </div>
  );
}
