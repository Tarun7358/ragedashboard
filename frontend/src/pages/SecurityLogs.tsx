import React from 'react';
import { FileText, Clock, Radio } from 'lucide-react';

interface SecurityLogsProps {
  syncLogs: any[];
}

export function SecurityLogs({ syncLogs = [] }: SecurityLogsProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="page-header">
        <div className="page-title-row">
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <FileText size={26} color="#a855f7" />
              Security Timeline & Gateway Audit Stream
            </h1>
            <p className="page-subtitle">Chronological timeline of security interventions, rate limit enforcement, and gateway process events.</p>
          </div>
        </div>
      </div>

      <div className="section-panel" style={{ padding: '24px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', fontWeight: 800, fontSize: '15px', color: '#fff' }}>
          <Radio size={18} color="var(--accent-primary)" />
          <span>Live Gateway Audit Log</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontFamily: 'monospace', fontSize: '12px', maxHeight: '500px', overflowY: 'auto' }}>
          {syncLogs.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No security audit logs recorded in current session.
            </div>
          ) : (
            syncLogs.map((log: any, idx: number) => (
              <div 
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  backgroundColor: 'rgba(0,0,0,0.25)',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.04)'
                }}
              >
                <Clock size={14} color="var(--text-muted)" />
                <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>[{log.time || 'NOW'}]</span>
                <span style={{ color: log.type === 'warn' ? '#f59e0b' : log.type === 'success' ? '#10b981' : '#ffffff' }}>
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
