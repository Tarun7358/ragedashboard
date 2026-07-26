import React from 'react';
import { FileText, Shield, Clock, Search, Filter } from 'lucide-react';
import type { ModuleState, DiscordResourceRegistry } from '../hooks/useDiscordSync';

interface AuditProps {
  modules: ModuleState[];
  registry: DiscordResourceRegistry;
  syncLogs: any[];
}

export function Audit({ modules, registry, syncLogs }: AuditProps) {
  const auditLogs = syncLogs || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="page-header">
        <div className="page-title-row">
          <div>
            <h1 className="page-title">Audit Timeline & Security Records</h1>
            <p className="page-subtitle">Real-time audit trailing of administrative updates, security actions, and role permission modifications.</p>
          </div>
        </div>
      </div>

      <div className="section-panel">
        <div className="panel-header">
          <span className="panel-title">Guild Audit Events</span>
          <FileText size={16} color="var(--accent-primary)" />
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {auditLogs.length === 0 ? (
            <div style={{ padding: '32px 10px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No audit logs recorded yet.
            </div>
          ) : (
            auditLogs.slice(0, 50).map((log: any, idx: number) => (
              <div 
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  backgroundColor: 'var(--bg-secondary)',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)'
                }}
              >
                <Clock size={14} color="var(--text-muted)" />
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', minWidth: '70px' }}>
                  {log.time || 'Recent'}
                </span>
                <span style={{ fontSize: '13px', color: log.type === 'warn' ? '#f59e0b' : log.type === 'success' ? '#10b981' : 'var(--text-primary)' }}>
                  {log.msg}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
