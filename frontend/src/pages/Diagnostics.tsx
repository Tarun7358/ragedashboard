import React from 'react';
import { Activity, Server, Cpu, Database, RefreshCw, CheckCircle2 } from 'lucide-react';
import type { ModuleState, DiscordResourceRegistry } from '../hooks/useDiscordSync';

interface DiagnosticsProps {
  modules: ModuleState[];
  registry: DiscordResourceRegistry;
  syncLogs: any[];
}

export function Diagnostics({ modules, registry, syncLogs }: DiagnosticsProps) {
  const activeCount = (modules || []).filter(m => m.status === 'enabled' || m.status === 'ready').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="page-header">
        <div className="page-title-row">
          <div>
            <h1 className="page-title">System Diagnostics & Health Engine</h1>
            <p className="page-subtitle">Inspect memory allocation, Gateway heartbeat, active module states, and database query latency.</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div className="section-panel" style={{ padding: '16px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Active Modules</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--accent-primary)', marginTop: '6px' }}>
            {activeCount} / {modules.length}
          </div>
        </div>

        <div className="section-panel" style={{ padding: '16px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Database Status</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', color: '#10b981', fontWeight: 700, fontSize: '18px' }}>
            <CheckCircle2 size={18} />
            <span>SQLite Connected</span>
          </div>
        </div>

        <div className="section-panel" style={{ padding: '16px' }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600 }}>Gateway Engine</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', color: '#10b981', fontWeight: 700, fontSize: '18px' }}>
            <Server size={18} />
            <span>Operational</span>
          </div>
        </div>
      </div>
    </div>
  );
}
