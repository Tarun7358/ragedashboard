import React from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

export function Offline() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center">
      <div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-2xl bg-slate-500/10 border border-slate-500/20 text-slate-400">
        <WifiOff size={48} />
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">You Are Currently Offline</h1>
      <p className="max-w-md text-slate-400 text-sm mb-8">
        Please check your internet connection. The dashboard will automatically reconnect once internet access is restored.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition"
      >
        <RefreshCw size={16} /> Retry Connection
      </button>
    </div>
  );
}
