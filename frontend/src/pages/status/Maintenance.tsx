import React from 'react';
import { Wrench, RefreshCw } from 'lucide-react';

export function Maintenance() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center">
      <div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
        <Wrench size={48} />
      </div>
      <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">Scheduled Maintenance</h1>
      <p className="max-w-md text-slate-400 text-sm mb-8">
        Rage Optimiser Enterprise systems are currently undergoing planned performance updates and database optimizations. Systems will return online shortly.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-500 transition shadow-lg shadow-amber-600/20"
      >
        <RefreshCw size={16} /> Check System Status
      </button>
    </div>
  );
}
