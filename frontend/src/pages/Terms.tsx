import React from 'react';
import { Shield, FileText, Lock, ChevronLeft } from 'lucide-react';

export const Terms: React.FC = () => {
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
          <div className="inline-flex items-center space-x-2 px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-full text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-4">
            <FileText className="w-3.5 h-3.5" />
            <span>Legal Documentation</span>
          </div>
          <h1 className="text-4xl font-extrabold text-white tracking-tight mb-3">Terms of Service</h1>
          <p className="text-slate-400 text-base">Effective Date: August 15, 2026 • Version 3.0</p>
        </div>

        <div className="space-y-8 text-slate-300 leading-relaxed text-sm bg-slate-900/50 border border-slate-800 rounded-2xl p-8 shadow-2xl backdrop-blur-sm">
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-2">
              <span className="text-cyan-400">1.</span>
              <span>Acceptance of Terms</span>
            </h2>
            <p>
              By adding, inviting, or using <strong>RAGE OPTIMISER V3</strong> ("the Bot", "Service", "We", "Us") in your Discord server, you agree to be bound by these Terms of Service. If you do not agree to these terms, you must remove the Bot from your Discord server immediately.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-2">
              <span className="text-cyan-400">2.</span>
              <span>Description of Service</span>
            </h2>
            <p>
              RAGE OPTIMISER V3 is a high-performance Discord management and security application designed to provide automated server protection, real-time anti-nuke defense, server backup and cloning, administrative moderation tooling, automod enforcement, and logging utilities.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-2">
              <span className="text-cyan-400">3.</span>
              <span>Bot Usage & Administrator Responsibilities</span>
            </h2>
            <ul className="list-disc list-inside space-y-2 pl-2 text-slate-300">
              <li>You must possess administrative authority or the "Manage Server" permission in any Discord server where you invite RAGE OPTIMISER V3.</li>
              <li>You agree not to exploit, abuse, reverse-engineer, or attempt to bypass the security mechanisms of the Bot.</li>
              <li>You acknowledge that automated security interventions (such as anti-nuke quarantines, automated role removals, and channel state rollbacks) are performed based on server configuration set by server administrators.</li>
              <li>We reserve the right to restrict or terminate access to the Bot for any server or user violating Discord's Terms of Service or abusing Bot resources.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-2">
              <span className="text-cyan-400">4.</span>
              <span>Server Backups & Data Integrity</span>
            </h2>
            <p>
              Server backup features allow server administrators to capture snapshots of server structure (categories, channels, roles, and permissions). Backups are stored securely in encrypted databases. RAGE OPTIMISER V3 does not store user message contents within backup snapshots.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-2">
              <span className="text-cyan-400">5.</span>
              <span>Compliance with Discord Terms</span>
            </h2>
            <p>
              RAGE OPTIMISER V3 operates in strict compliance with the <a href="https://discord.com/terms" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">Discord Terms of Service</a> and <a href="https://discord.com/developers/docs/policies/developer-policy" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">Discord Developer Terms & Policies</a>. Any activity attempting to use the Bot for malicious raids, token logging, or unauthorized data scraping is strictly prohibited.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-2">
              <span className="text-cyan-400">6.</span>
              <span>Limitation of Liability</span>
            </h2>
            <p>
              RAGE OPTIMISER V3 is provided on an "AS IS" and "AS AVAILABLE" basis. While we maintain a 99.9% uptime architecture, we are not liable for any server data loss, Discord API rate limits, third-party service interruptions, or actions resulting from misconfigured administrator settings.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-2">
              <span className="text-cyan-400">7.</span>
              <span>Modifications to Terms</span>
            </h2>
            <p>
              We reserve the right to modify these Terms of Service at any time. Continued usage of the Bot following any updates constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-2">
              <span className="text-cyan-400">8.</span>
              <span>Contact & Support</span>
            </h2>
            <p>
              If you have any questions or require administrative assistance regarding these Terms, please contact our support team via our official Discord Support Server or project dashboard.
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
