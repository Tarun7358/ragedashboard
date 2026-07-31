import React from 'react';
import { Lock, LogIn } from 'lucide-react';

export function Unauthorized() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center">
      <div className="relative mb-6 flex h-24 w-24 items-center justify-center rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
        <Lock size={48} />
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">Access Denied</h1>
      <p className="max-w-md text-slate-400 text-sm mb-8">
        Your current session has expired or you do not have permission to view this enterprise resource. Please log in again.
      </p>
      <button
        onClick={() => {
          localStorage.removeItem('cn_token');
          window.location.href = '/login';
        }}
        className="flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-500 transition shadow-lg shadow-purple-600/20"
      >
        <LogIn size={16} /> Re-authenticate Session
      </button>
    </div>
  );
}
