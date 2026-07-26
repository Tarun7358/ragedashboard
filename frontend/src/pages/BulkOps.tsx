import React, { useState } from 'react';
import { Layers, Trash2, UserPlus, Save, Zap } from 'lucide-react';
import type { ModuleState, DiscordResourceRegistry } from '../hooks/useDiscordSync';

interface BulkOpsProps {
  onSaveConfig: (msg: string) => void;
  modules: ModuleState[];
  registry: DiscordResourceRegistry;
  onUpdateConfig: (moduleId: string, config: Record<string, any>, enabled?: boolean) => void;
}

export function BulkOps({ onSaveConfig, modules, registry, onUpdateConfig }: BulkOpsProps) {
  const bulkMod = (modules || []).find(m => m.id === 'bulk_ops') || { status: 'disabled', config: {} as any };
  const config: Record<string, any> = bulkMod.config || {};
  const isEnabled = bulkMod.status === 'enabled';

  const [purgeCount, setPurgeCount] = useState(50);

  const handleToggleEnable = () => {
    onUpdateConfig('bulk_ops', {}, !isEnabled);
    onSaveConfig(`Bulk Operations module ${!isEnabled ? 'ENABLED' : 'DISABLED'}.`);
  };

  const handleExecutePurge = () => {
    onSaveConfig(`Triggered bulk purge request for ${purgeCount} messages.`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="page-header">
        <div className="page-title-row">
          <div>
            <h1 className="page-title">Bulk Operations Suite</h1>
            <p className="page-subtitle">Execute mass channel purges, bulk role assignments, member nickname syncing, and rapid guild operations.</p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              className={`btn ${isEnabled ? 'btn-danger' : 'btn-success'}`}
              onClick={handleToggleEnable}
            >
              <Layers size={14} />
              <span>{isEnabled ? 'Disable Module' : 'Enable Module'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="dashboard-layout-grid">
        <div className="section-panel">
          <div className="panel-header">
            <span className="panel-title">Bulk Message Purge</span>
            <Trash2 size={16} color="#ef4444" />
          </div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Message Amount (1-100)</label>
              <input 
                type="number"
                min={1}
                max={100}
                className="form-input"
                value={purgeCount}
                onChange={(e) => setPurgeCount(Number(e.target.value))}
              />
            </div>
            <button className="btn btn-danger" onClick={handleExecutePurge}>
              <Trash2 size={14} />
              <span>Execute Bulk Purge</span>
            </button>
          </div>
        </div>

        <div className="section-panel">
          <div className="panel-header">
            <span className="panel-title">Mass Role Assignment</span>
            <UserPlus size={16} color="var(--accent-primary)" />
          </div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Bulk assign or revoke roles for all members in selected channels or roles.
            </div>
            <button className="btn btn-primary" onClick={() => onSaveConfig('Mass role task queued.')}>
              <Zap size={14} />
              <span>Start Mass Role Task</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
