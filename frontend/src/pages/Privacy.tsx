import React from 'react';
import { Shield, Lock, ChevronLeft, EyeOff } from 'lucide-react';

export const Privacy: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#0A0E1A] text-slate-100 font-sans selection:bg-cyan-500 selection:text-white">
      {/* Header / Navbar */}
      <header className="border-b border-slate-800 bg-[#0F172A]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="font-bold text-lg text-white tracking-wide">RAGE OPTIMISER</span>
              <span className="ml-2 text-xs font-semibold px-2 py-0.5 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-full">V3</span>
            </div>
          </div>
          <a
            href="/"
            className="inline-flex items-center text-sm font-medium text-slate-400 hover:text-cyan-400 transition-colors"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Main Portal
          </a>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-10 text-center">
          <div className="inline-flex items-center space-x-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-4">
            <Lock className="w-3.5 h-3.5" />
            <span>Data Protection Policy</span>
          </div>
          <h1 className="text-4xl font-extrabold text-white tracking-tight mb-3">Privacy Policy</h1>
          <p className="text-slate-400 text-base">Effective Date: August 15, 2026 • Version 3.0</p>
        </div>

        <div className="space-y-8 text-slate-300 leading-relaxed text-sm bg-slate-900/50 border border-slate-800 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-2">
              <span className="text-emerald-400">1.</span>
              <span>Overview & Commitment</span>
            </h2>
            <p>
              Your privacy is of paramount importance to us. This Privacy Policy details how <strong>RAGE OPTIMISER V3</strong> ("the Bot", "Service", "We") collects, processes, and protects your information when added to a Discord server. We strictly adhere to Discord's Developer Terms and Privacy Policies.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-2">
              <span className="text-emerald-400">2.</span>
              <span>Information We Collect</span>
            </h2>
            <p>To provide security, automod, anti-nuke protection, and server backup functionality, the Bot processes the following minimal data:</p>
            <ul className="list-disc list-inside space-y-2 pl-2 text-slate-300">
              <li><strong>Guild Metadata:</strong> Guild IDs, channel IDs, role IDs, permissions, and server settings configured by server owners.</li>
              <li><strong>User Identification:</strong> Discord User IDs, usernames, and avatar hashes for access validation and security audit logs.</li>
              <li><strong>Security Audit Telemetry:</strong> Logged event timestamps, moderator action records, and anti-nuke rate-limit counters to detect malicious server raids or abuse.</li>
              <li><strong>Server Backups:</strong> Saved structural snapshots (categories, channels, roles, and permissions). <em>We do NOT store user message content, private messages, or media attachments in server backups.</em></li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-2">
              <span className="text-emerald-400">3.</span>
              <span>How We Use Collected Information</span>
            </h2>
            <p>Collected data is strictly utilized for operational purposes:</p>
            <ul className="list-disc list-inside space-y-2 pl-2 text-slate-300">
              <li>Executing real-time anti-nuke rollbacks and security quarantines.</li>
              <li>Restoring server layouts upon authorized administrator request.</li>
              <li>Rendering administrative analytics and audit logs on the RAGE OPTIMISER Web Dashboard.</li>
              <li>Verifying user privileges and command execution access.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-2">
              <span className="text-emerald-400">4.</span>
              <span>Data Retention & Deletion Rights</span>
            </h2>
            <p>
              We believe in minimal data footprint retention:
            </p>
            <ul className="list-disc list-inside space-y-2 pl-2 text-slate-300">
              <li><strong>Server Removal:</strong> When RAGE OPTIMISER V3 is removed (kicked) from a Discord server, all associated server configurations and snapshots are automatically purged or marked inactive.</li>
              <li><strong>Manual Data Erasure:</strong> Server owners may request complete data deletion at any time by contacting our support team or running administrative cleanup commands.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-2">
              <span className="text-emerald-400">5.</span>
              <span>Third-Party Data Sharing</span>
            </h2>
            <p>
              <strong>We do NOT sell, rent, trade, or share user or guild data with any third-party advertisers or external data brokers.</strong> Data is strictly processed internally on secured, encrypted database servers.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-2">
              <span className="text-emerald-400">6.</span>
              <span>Policy Updates & Inquiries</span>
            </h2>
            <p>
              We reserve the right to update this Privacy Policy as required by Discord Developer Policy updates. For any privacy queries or data deletion requests, please contact our privacy compliance team via our official support portal.
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8 text-center text-xs text-slate-500">
        <p>© 2026 RAGE OPTIMISER V3. All rights reserved. Not affiliated with Discord Inc.</p>
        <div className="mt-2 space-x-4">
          <a href="/terms" className="text-cyan-400 hover:underline">Terms of Service</a>
          <span>•</span>
          <a href="/privacy" className="text-cyan-400 hover:underline">Privacy Policy</a>
        </div>
      </footer>
    </div>
  );
};
