import React from 'react';
import { CreditCard, QrCode, ShieldCheck, Save, DollarSign } from 'lucide-react';
import type { ModuleState, DiscordResourceRegistry } from '../hooks/useDiscordSync';

interface PaymentProps {
  onSaveConfig: (msg: string) => void;
  modules: ModuleState[];
  registry: DiscordResourceRegistry;
  onUpdateConfig: (moduleId: string, config: Record<string, any>, enabled?: boolean) => void;
}

export function Payment({ onSaveConfig, modules, registry, onUpdateConfig }: PaymentProps) {
  const payMod = (modules || []).find(m => m.id === 'payment') || { status: 'disabled', config: {} as any };
  const config: Record<string, any> = payMod.config || {};
  const isEnabled = payMod.status === 'enabled';

  const handleToggleEnable = () => {
    onUpdateConfig('payment', {}, !isEnabled);
    onSaveConfig(`Payment QR module ${!isEnabled ? 'ENABLED' : 'DISABLED'}.`);
  };

  const handleUpdate = (field: string, value: any) => {
    onUpdateConfig('payment', { [field]: value });
  };

  const textChannels = (registry.channels || []).filter(c => !c.type || c.type === 'text');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="page-header">
        <div className="page-title-row">
          <div>
            <h1 className="page-title">Enterprise Payment QR Hub</h1>
            <p className="page-subtitle">Configure automated payment QR generation, UPI/PayPal/Crypto/Stripe payment links, and receipt logging.</p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              className="btn btn-primary"
              onClick={() => onSaveConfig('Payment QR settings saved successfully.')}
            >
              <Save size={14} />
              <span>Save Changes</span>
            </button>
            <button 
              className={`btn ${isEnabled ? 'btn-danger' : 'btn-success'}`}
              onClick={handleToggleEnable}
            >
              <CreditCard size={14} />
              <span>{isEnabled ? 'Disable Module' : 'Enable Module'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="dashboard-layout-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* General Configuration */}
          <div className="section-panel">
            <div className="panel-header">
              <span className="panel-title">Payment Provider Settings</span>
              <DollarSign size={16} color="var(--accent-primary)" />
            </div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              <div className="form-group">
                <label className="form-label">Default Payment Provider</label>
                <select 
                  className="form-select"
                  value={config.provider || 'UPI'}
                  onChange={(e) => handleUpdate('provider', e.target.value)}
                >
                  <option value="UPI">UPI (Google Pay / PhonePe / Paytm / BHIM)</option>
                  <option value="PayPal">PayPal Invoice & Business QR</option>
                  <option value="Crypto">Crypto (BTC / ETH / USDT / SOL)</option>
                  <option value="Stripe">Stripe Payment Gateway</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Payment ID / Receiver Address / VPA</label>
                <input 
                  type="text"
                  className="form-input"
                  placeholder="e.g. merchant@upi or paypal.me/yourname"
                  value={config.merchantId || ''}
                  onChange={(e) => handleUpdate('merchantId', e.target.value)}
                />
                <div className="form-help">The VPA ID, Wallet address, or PayPal link used for QR code generation.</div>
              </div>

              <div className="form-group">
                <label className="form-label">Default Payment Currency</label>
                <input 
                  type="text"
                  className="form-input"
                  placeholder="INR / USD / EUR"
                  value={config.currency || 'INR'}
                  onChange={(e) => handleUpdate('currency', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Payment Receipt Log Channel</label>
                <select 
                  className="form-select"
                  value={config.logChannelId || ''}
                  onChange={(e) => handleUpdate('logChannelId', e.target.value)}
                >
                  <option value="">Select a log channel...</option>
                  {textChannels.map(c => (
                    <option key={c.id} value={c.id}>#{c.name}</option>
                  ))}
                </select>
              </div>

            </div>
          </div>

        </div>

        {/* Right Column: Live QR Preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="section-panel" style={{ flex: 1 }}>
            <div className="panel-header">
              <span className="panel-title">QR Engine Preview</span>
              <QrCode size={16} color="var(--accent-purple)" />
            </div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '32px 16px' }}>
              <div style={{
                padding: '16px',
                background: '#ffffff',
                borderRadius: '12px',
                boxShadow: '0 0 20px rgba(124, 92, 252, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <QrCode size={120} color="#000000" />
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>
                  {config.provider || 'UPI'} Payment Engine Active
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Receiver: <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{config.merchantId || 'Not configured'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
