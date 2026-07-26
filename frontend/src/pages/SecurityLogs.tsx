import React, { useState } from 'react';
import { FileText, Clock, Radio, Filter } from 'lucide-react';

interface SecurityLogsProps {
  syncLogs: any[];
}

export function SecurityLogs({ syncLogs = [] }: SecurityLogsProps) {
  const [filterType, setFilterType] = useState<'all' | 'warn' | 'success'>('all');

  const filteredLogs = syncLogs.filter(log => {
    if (filterType === 'all') return true;
    if (filterType === 'warn') return log.type === 'warn' || log.type === 'danger';
    if (filterType === 'success') return log.type === 'success';
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      
      {/* Header Banner */}
      <div 
        style={{
          background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(15, 17, 32, 0.98) 100%)',
          padding: '26px',
          borderRadius: '16px',
          border: '1px solid rgba(168, 85, 247, 0.35)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '20px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'radial-gradient(circle, rgba(168,85,247,0.3) 0%, rgba(168,85,247,0.1) 100%)',
            border: '2px solid #a855f7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 24px rgba(168,85,247,0.5)'
          }}>
            <FileText size={30} color="#a855f7" />
          </div>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
              Security Timeline & Gateway Audit Stream
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px', margin: 0 }}>
              Chronological timeline of security interventions, rate limit enforcement, and gateway process events.
            </p>
          </div>
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
          {[
            { id: 'all', label: 'All Events' },
            { id: 'warn', label: 'Threat Alerts' },
            { id: 'success', label: 'Enforcements' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilterType(f.id as any)}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                background: filterType === f.id ? '#a855f7' : 'transparent',
                color: filterType === f.id ? '#ffffff' : 'var(--text-muted)',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Code-Terminal Audit Stream Panel */}
      <div className="section-panel" style={{ padding: '24px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px', fontWeight: 800, fontSize: '15px', color: '#fff' }}>
          <Radio size={18} color="var(--accent-primary)" />
          <span>Live Gateway Audit Log</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontFamily: 'monospace', fontSize: '12px', maxHeight: '550px', overflowY: 'auto' }}>
          {filteredLogs.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No security audit logs recorded for selected filter.
            </div>
          ) : (
            filteredLogs.map((log: any, idx: number) => (
              <div 
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '12px 18px',
                  backgroundColor: 'rgba(0,0,0,0.3)',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.04)'
                }}
              >
                <Clock size={14} color="var(--text-muted)" />
                <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>[{log.time || 'NOW'}]</span>
                <span style={{ color: log.type === 'warn' ? '#f59e0b' : log.type === 'success' ? '#10b981' : '#ffffff', lineHeight: '1.4' }}>
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
