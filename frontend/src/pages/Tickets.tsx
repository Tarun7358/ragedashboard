import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, Hash, Plus, Trash2, Save, Eye, Settings2,
  FileText, Shield, User, Clock, ChevronRight, X, AlertCircle,
  HelpCircle, Sparkles, RefreshCw, Layers, Check, ArrowRight
} from 'lucide-react';
import { RoleSelect, ChannelSelect } from '../components/ResourceSelectors';
import { VariableInput, VariableTextArea } from '../components/builders/VariableInput';
import { EmbedBuilder, type EmbedData } from '../components/builders/EmbedBuilder';
import { API_BASE } from '../config';
import type { DiscordRole, DiscordChannel, DiscordResourceRegistry } from '../hooks/useDiscordSync';

interface FormField {
  id: string;
  label: string;
  placeholder?: string;
  style: 'short' | 'paragraph';
  required: boolean;
}

interface PanelOption {
  id: string;
  label: string;
  description?: string;
  emoji?: string;
  style: 'primary' | 'secondary' | 'success' | 'danger';
  categoryId?: string;
  forms: FormField[];
}

interface PanelConfig {
  title: string;
  description: string;
  color: string;
  thumbnail?: string;
  image?: string;
  footer?: string;
  layoutType: 'buttons' | 'dropdown';
  defaultCategoryId?: string;
  staffRoleIds: string[];
  options: PanelOption[];
}

interface PanelRow {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  version: number;
  createdAt: number;
  updatedAt: number;
  config: PanelConfig;
}

interface TicketRow {
  id: string;
  ticketId: string;
  guildId: string;
  panelId: string;
  panelOptionId?: string;
  categoryId: string;
  creatorId: string;
  creatorName: string;
  creatorAvatar?: string;
  status: 'open' | 'claimed' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  claimedById?: string;
  claimedByName?: string;
  claimedByAvatar?: string;
  claimedAt?: number;
  messageCount: number;
  attachmentCount: number;
  createdAt: number;
  updatedAt: number;
  closedAt?: number;
  closedBy?: string;
}

interface TicketMessage {
  id: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  isStaff: number;
  timestamp: number;
}

interface TicketsProps {
  onSaveConfig: (msg: string, type?: 'success' | 'danger' | 'warning' | 'info') => void;
  onManualTrigger?: (msg: string, type?: any, cat?: any) => void;
  modules: any[];
  registry: DiscordResourceRegistry;
  onUpdateConfig: (moduleId: string, newConfig: Record<string, any>, enabledOverride?: boolean) => void;
}

const DEFAULT_PANEL_CONFIG: PanelConfig = {
  title: '✉️ Create a Support Ticket',
  description: 'Need assistance from our staff? Click the button below to open a private ticket.',
  color: '#d4af37',
  layoutType: 'buttons',
  staffRoleIds: [],
  options: [
    {
      id: 'general',
      label: 'General Support',
      description: 'General questions and help.',
      style: 'primary',
      forms: []
    }
  ]
};

export function Tickets({ onSaveConfig, modules = [], registry, onUpdateConfig }: TicketsProps) {
  const token = localStorage.getItem('cn_token');
  const guildId = localStorage.getItem('cn_active_guild');

  const [activeTab, setActiveTab] = useState<'panels' | 'transcripts'>('panels');
  const [panels, setPanels] = useState<PanelRow[]>([]);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Panel Editor modal / view state
  const [editingPanel, setEditingPanel] = useState<Partial<PanelRow> | null>(null);
  const [activeOptionIndex, setActiveOptionIndex] = useState<number>(0);

  // Transcript viewer state
  const [selectedTicket, setSelectedTicket] = useState<TicketRow | null>(null);
  const [ticketMessages, setTicketMessages] = useState<TicketMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const roles = registry?.roles || [];
  const channels = registry?.channels || [];
  const categories = channels.filter(c => c.type === 'category');

  // Fetch Panel configurations and Ticket transcripts
  const fetchPanels = async () => {
    if (!token || !guildId) return;
    try {
      const res = await fetch(`${API_BASE}/api/modules/tickets-v2/panels`, {
        headers: { 'Authorization': `Bearer ${token}`, 'X-Guild-Id': guildId }
      });
      if (res.ok) {
        const data = await res.json();
        setPanels(data.panels || []);
      }
    } catch (err) {
      console.error('Failed to fetch ticket panels:', err);
    }
  };

  const fetchTickets = async () => {
    if (!token || !guildId) return;
    try {
      const res = await fetch(`${API_BASE}/api/modules/tickets-v2/tickets`, {
        headers: { 'Authorization': `Bearer ${token}`, 'X-Guild-Id': guildId }
      });
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets || []);
      }
    } catch (err) {
      console.error('Failed to fetch tickets:', err);
    }
  };

  useEffect(() => {
    fetchPanels();
    fetchTickets();
  }, [guildId, token]);

  const handleCreatePanel = () => {
    setEditingPanel({
      id: crypto.randomUUID(),
      name: 'new-support-panel',
      status: 'active',
      config: { ...DEFAULT_PANEL_CONFIG }
    });
    setActiveOptionIndex(0);
  };

  const handleEditPanel = (panel: PanelRow) => {
    setEditingPanel({
      id: panel.id,
      name: panel.name,
      status: panel.status,
      config: JSON.parse(JSON.stringify(panel.config)) // deep copy
    });
    setActiveOptionIndex(0);
  };

  const handleDeletePanel = async (panelId: string) => {
    if (!confirm('Are you sure you want to delete this panel? This action cannot be undone.')) return;
    try {
      const res = await fetch(`${API_BASE}/api/modules/tickets-v2/panels/${panelId}/delete`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        onSaveConfig('Ticket panel deleted successfully.', 'success');
        fetchPanels();
      } else {
        onSaveConfig('Failed to delete ticket panel.', 'danger');
      }
    } catch (err) {
      onSaveConfig('API error deleting panel.', 'danger');
    }
  };

  const handleSavePanel = async () => {
    if (!editingPanel || !editingPanel.id || !editingPanel.name) return;
    try {
      const res = await fetch(`${API_BASE}/api/modules/tickets-v2/panels/${editingPanel.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Guild-Id': guildId || ''
        },
        body: JSON.stringify({
          name: editingPanel.name,
          status: editingPanel.status || 'active',
          config: editingPanel.config
        })
      });
      if (res.ok) {
        onSaveConfig('Ticket Panel configuration saved successfully!', 'success');
        setEditingPanel(null);
        fetchPanels();
      } else {
        onSaveConfig('Failed to save ticket panel config.', 'danger');
      }
    } catch (err) {
      onSaveConfig('API error saving panel configuration.', 'danger');
    }
  };

  const updatePanelConfig = (key: keyof PanelConfig, val: any) => {
    if (!editingPanel || !editingPanel.config) return;
    setEditingPanel({
      ...editingPanel,
      config: {
        ...editingPanel.config,
        [key]: val
      }
    });
  };

  // Option Operations
  const addOption = () => {
    if (!editingPanel || !editingPanel.config) return;
    const options = [...editingPanel.config.options];
    options.push({
      id: `opt-${crypto.randomUUID().slice(0, 6)}`,
      label: 'New Category',
      style: 'primary',
      forms: []
    });
    updatePanelConfig('options', options);
    setActiveOptionIndex(options.length - 1);
  };

  const removeOption = (index: number) => {
    if (!editingPanel || !editingPanel.config) return;
    const options = [...editingPanel.config.options];
    options.splice(index, 1);
    updatePanelConfig('options', options);
    setActiveOptionIndex(Math.max(0, index - 1));
  };

  const updateOptionVal = (index: number, key: keyof PanelOption, val: any) => {
    if (!editingPanel || !editingPanel.config) return;
    const options = [...editingPanel.config.options];
    options[index] = { ...options[index], [key]: val };
    updatePanelConfig('options', options);
  };

  // Guided Modal Questionnaire Builders
  const addFormField = (optIndex: number) => {
    if (!editingPanel || !editingPanel.config) return;
    const options = [...editingPanel.config.options];
    const forms = [...(options[optIndex].forms || [])];
    forms.push({
      id: `field-${crypto.randomUUID().slice(0, 6)}`,
      label: 'Question Label',
      placeholder: 'User response hint...',
      style: 'short',
      required: true
    });
    options[optIndex] = { ...options[optIndex], forms };
    updatePanelConfig('options', options);
  };

  const removeFormField = (optIndex: number, fieldIndex: number) => {
    if (!editingPanel || !editingPanel.config) return;
    const options = [...editingPanel.config.options];
    const forms = [...(options[optIndex].forms || [])];
    forms.splice(fieldIndex, 1);
    options[optIndex] = { ...options[optIndex], forms };
    updatePanelConfig('options', options);
  };

  const updateFormFieldVal = (optIndex: number, fieldIndex: number, key: keyof FormField, val: any) => {
    if (!editingPanel || !editingPanel.config) return;
    const options = [...editingPanel.config.options];
    const forms = [...(options[optIndex].forms || [])];
    forms[fieldIndex] = { ...forms[fieldIndex], [key]: val };
    options[optIndex] = { ...options[optIndex], forms };
    updatePanelConfig('options', options);
  };

  // Transcript Loader
  const handleViewTranscript = async (ticket: TicketRow) => {
    setSelectedTicket(ticket);
    setLoadingMessages(true);
    try {
      const res = await fetch(`${API_BASE}/api/modules/tickets-v2/tickets/${ticket.id}/messages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTicketMessages(data.messages || []);
      }
    } catch (err) {
      console.error('Failed to load ticket messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%' }}>
      {/* Header bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#09090B', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers color="#d4af37" size={22} /> Ticket System vNext
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Design beautiful support panel embeds, guided form questionnaires, and manage SQL transcripts.
          </p>
        </div>

        {/* Tab switchers */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('panels')}
            style={{
              padding: '10px 20px',
              fontSize: '13px',
              fontWeight: 700,
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              backgroundColor: activeTab === 'panels' ? '#09090B' : '#FFFFFF', border: activeTab === 'panels' ? '1px solid #09090B' : '1px solid #E4E4E7', color: activeTab === 'panels' ? '#FFFFFF' : '#71717A',
              boxShadow: activeTab === 'panels' ? '0 0 12px rgba(212, 175, 55, 0.1)' : 'none'
            }}
          >
            <Settings2 size={16} color={activeTab === 'panels' ? '#d4af37' : '#9ca3af'} /> Panels Manager
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('transcripts')}
            style={{
              padding: '10px 20px',
              fontSize: '13px',
              fontWeight: 700,
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              backgroundColor: activeTab === 'transcripts' ? '#09090B' : '#FFFFFF', border: activeTab === 'transcripts' ? '1px solid #09090B' : '1px solid #E4E4E7', color: activeTab === 'transcripts' ? '#FFFFFF' : '#71717A',
              boxShadow: activeTab === 'transcripts' ? '0 0 12px rgba(212, 175, 55, 0.1)' : 'none'
            }}
          >
            <FileText size={16} color={activeTab === 'transcripts' ? '#d4af37' : '#9ca3af'} /> Transcripts & Logs
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* EDITING PANEL VIEWPORT */}
        {editingPanel ? (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="card tickets-panel-grid"
          >
            {/* Panel Column 1: Config & General Info */}
            <div className="tickets-col-1">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#09090B' }}>Configure Panel Settings</h3>
                <button
                  type="button"
                  onClick={() => setEditingPanel(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="form-group">
                <label className="form-label">Panel ID Name (Slash setup identifier)</label>
                <input
                  type="text"
                  value={editingPanel.name || ''}
                  onChange={(e) => setEditingPanel({ ...editingPanel, name: e.target.value })}
                  className="form-control"
                  placeholder="e.g. general-support"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Panel Layout Type</label>
                <select
                  value={editingPanel.config?.layoutType}
                  onChange={(e) => updatePanelConfig('layoutType', e.target.value)}
                  className="form-control"
                >
                  <option value="buttons">Interactivity Buttons</option>
                  <option value="dropdown">String Dropdown Selector</option>
                </select>
              </div>

              <ChannelSelect
                label="Default Category (Spawning category)"
                channels={categories}
                selectedChannelId={editingPanel.config?.defaultCategoryId}
                onChange={(val) => updatePanelConfig('defaultCategoryId', val)}
                helpText="Discord category where ticket text channels will be generated."
              />

              <RoleSelect
                label="Support Staff Roles"
                roles={roles}
                selectedRoleIds={editingPanel.config?.staffRoleIds || []}
                isMulti={true}
                onChange={(val) => updatePanelConfig('staffRoleIds', val)}
                helpText="Roles that receive automatic visibility and manager permissions inside tickets."
              />

              <div className="form-group">
                <label className="form-label">Status</label>
                <select
                  value={editingPanel.status}
                  onChange={(e) => setEditingPanel({ ...editingPanel, status: e.target.value as any })}
                  className="form-control"
                >
                  <option value="active">Active (Deployable)</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={handleSavePanel}
                  className="btn btn-primary"
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  <Save size={16} /> Save Panel
                </button>
                <button
                  type="button"
                  onClick={() => setEditingPanel(null)}
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
              </div>
            </div>

            {/* Panel Column 2: Interactive Categories & Modals Wizard */}
            <div className="tickets-col-2">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#09090B' }}>Support Categories & Modals</h3>
                <button
                  type="button"
                  onClick={addOption}
                  className="btn btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', padding: '6px 12px' }}
                >
                  <Plus size={14} /> Add Category
                </button>
              </div>

              {/* Categories list tabs */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {(editingPanel.config?.options || []).map((opt, idx) => {
                  const isActive = idx === activeOptionIndex;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setActiveOptionIndex(idx)}
                      style={{
                        fontSize: '12px',
                        padding: '6px 12px',
                        fontWeight: isActive ? 700 : 500,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        backgroundColor: isActive ? 'rgba(212, 175, 55, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                        border: isActive ? '1px solid rgba(212, 175, 55, 0.4)' : '1px solid rgba(255, 255, 255, 0.05)',
                        color: isActive ? '#ffffff' : '#9ca3af',
                        boxShadow: isActive ? '0 0 10px rgba(212, 175, 55, 0.08)' : 'none'
                      }}
                    >
                      {opt.label || `Category ${idx + 1}`}
                    </button>
                  );
                })}
              </div>

              {/* Editing active option */}
              {editingPanel.config?.options[activeOptionIndex] && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-primary)' }}>
                      Category: {editingPanel.config.options[activeOptionIndex].label}
                    </span>
                    {(editingPanel.config.options || []).length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeOption(activeOptionIndex)}
                        style={{ background: 'none', border: 'none', color: '#ff4d4d', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Trash2 size={12} /> Remove Category
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '11px' }}>Category Name Label</label>
                      <input
                        type="text"
                        value={editingPanel.config.options[activeOptionIndex].label}
                        onChange={(e) => updateOptionVal(activeOptionIndex, 'label', e.target.value)}
                        className="form-control"
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '11px' }}>Category ID (customId suffix)</label>
                      <input
                        type="text"
                        value={editingPanel.config.options[activeOptionIndex].id}
                        onChange={(e) => updateOptionVal(activeOptionIndex, 'id', e.target.value)}
                        className="form-control"
                        placeholder="e.g. general"
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '11px' }}>Description (dropdown only)</label>
                      <input
                        type="text"
                        value={editingPanel.config.options[activeOptionIndex].description || ''}
                        onChange={(e) => updateOptionVal(activeOptionIndex, 'description', e.target.value)}
                        className="form-control"
                      />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '11px' }}>Option Button Color Style</label>
                      <select
                        value={editingPanel.config.options[activeOptionIndex].style}
                        onChange={(e) => updateOptionVal(activeOptionIndex, 'style', e.target.value)}
                        className="form-control"
                      >
                        <option value="primary">Primary Blue</option>
                        <option value="secondary">Secondary Gray</option>
                        <option value="success">Success Green</option>
                        <option value="danger">Danger Red</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '11px' }}>Button emoji (optional)</label>
                      <input
                        type="text"
                        value={editingPanel.config.options[activeOptionIndex].emoji || ''}
                        onChange={(e) => updateOptionVal(activeOptionIndex, 'emoji', e.target.value)}
                        className="form-control"
                        placeholder="e.g. 🙋‍♂️"
                      />
                    </div>

                    <ChannelSelect
                      label="Override Category (Optional)"
                      channels={categories}
                      selectedChannelId={editingPanel.config.options[activeOptionIndex].categoryId}
                      onChange={(val) => updateOptionVal(activeOptionIndex, 'categoryId', val)}
                    />
                  </div>

                  {/* Questionnaire wizard */}
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div>
                        <h4 style={{ fontSize: '12px', fontWeight: 800, color: '#09090B' }}>Guided Modal Questionnaire</h4>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          Create inputs users must answer to submit this ticket.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => addFormField(activeOptionIndex)}
                        className="btn btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '4px 8px' }}
                      >
                        <Plus size={12} /> Add Question
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '220px', overflowY: 'auto' }}>
                      {(!editingPanel.config.options[activeOptionIndex].forms || editingPanel.config.options[activeOptionIndex].forms.length === 0) ? (
                        <div style={{ textAlign: 'center', padding: '16px', border: '1px dashed var(--border-color)', borderRadius: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                          No questionnaire setup. Tickets will spawn immediately upon clicking button.
                        </div>
                      ) : (
                        editingPanel.config.options[activeOptionIndex].forms.map((form, fIdx) => (
                          <div
                            key={form.id}
                            style={{
                              padding: '10px',
                              border: '1px solid var(--border-color)',
                              borderRadius: '6px',
                              backgroundColor: '#FAFAFC',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px',
                              position: 'relative'
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => removeFormField(activeOptionIndex, fIdx)}
                              style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                            >
                              <X size={12} />
                            </button>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                              <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label" style={{ fontSize: '10px' }}>Input Question Label</label>
                                <input
                                  type="text"
                                  value={form.label}
                                  onChange={(e) => updateFormFieldVal(activeOptionIndex, fIdx, 'label', e.target.value)}
                                  className="form-control"
                                  style={{ height: '26px', fontSize: '10px' }}
                                />
                              </div>

                              <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label" style={{ fontSize: '10px' }}>Placeholder text</label>
                                <input
                                  type="text"
                                  value={form.placeholder || ''}
                                  onChange={(e) => updateFormFieldVal(activeOptionIndex, fIdx, 'placeholder', e.target.value)}
                                  className="form-control"
                                  style={{ height: '26px', fontSize: '10px' }}
                                />
                              </div>
                            </div>

                            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={form.required}
                                  onChange={(e) => updateFormFieldVal(activeOptionIndex, fIdx, 'required', e.target.checked)}
                                />
                                Required Field
                              </label>

                              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', cursor: 'pointer' }}>
                                <select
                                  value={form.style}
                                  onChange={(e) => updateFormFieldVal(activeOptionIndex, fIdx, 'style', e.target.value)}
                                  style={{ height: '20px', fontSize: '9px', padding: '2px', backgroundColor: '#FAFAFC', border: '1px solid #E4E4E8', color: '#09090B', border: '1px solid #E4E4E8', borderRadius: '3px' }}
                                >
                                  <option value="short">Short text reply</option>
                                  <option value="paragraph">Paragraph reply</option>
                                </select>
                                Field Size
                              </label>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Panel Column 3: Embed Panel Preview */}
            <div className="tickets-col-3">
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#09090B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Eye size={16} /> Board Embed Designer
              </h3>

              <div style={{ flex: 1 }}>
                <EmbedBuilder
                  value={{
                    title: editingPanel.config?.title,
                    description: editingPanel.config?.description,
                    color: editingPanel.config?.color,
                    thumbnailUrl: editingPanel.config?.thumbnail,
                    imageUrl: editingPanel.config?.image,
                    footer: editingPanel.config?.footer
                  }}
                  onChange={(val) => {
                    if (!editingPanel || !editingPanel.config) return;
                    setEditingPanel({
                      ...editingPanel,
                      config: {
                        ...editingPanel.config,
                        title: val.title || '',
                        description: val.description || '',
                        color: val.color || '',
                        thumbnail: val.thumbnailUrl,
                        image: val.imageUrl,
                        footer: val.footer
                      }
                    });
                  }}
                  titleLabel="Panel Embed Customization"
                  layout="vertical"
                />
              </div>
            </div>
          </motion.div>
        ) : (
          /* PANELS LIST & TRANSCRIPTS LIST TAB SECTION */
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
          >
            {activeTab === 'panels' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#09090B' }}>Interactive Ticket Board Panels</h3>
                  <button
                    onClick={handleCreatePanel}
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
                  >
                    <Plus size={16} /> Create Support Board
                  </button>
                </div>

                {panels.length === 0 ? (
                  <div style={{
                    padding: '60px',
                    textAlign: 'center',
                    border: '1px dashed var(--border-color)',
                    borderRadius: '12px',
                    color: 'var(--text-muted)'
                  }}>
                    <HelpCircle size={40} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                    <h4 style={{ color: '#09090B', fontSize: '15px', fontWeight: 700 }}>No Support Boards configured</h4>
                    <p style={{ fontSize: '13px', marginTop: '6px' }}>
                      Click the button above to design your first Ticket V2 Panel and guided modal questions.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
                    {panels.map((p) => (
                      <div
                        key={p.id}
                        className="card"
                        style={{
                          border: '1px solid var(--border-color)',
                          borderRadius: '10px',
                          padding: '16px',
                          backgroundColor: '#FFFFFF', border: '1px solid #E4E4E7',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '14px', fontWeight: 800, color: '#09090B' }}>
                            {p.name}
                          </span>
                          <span style={{
                            backgroundColor: p.status === 'active' ? 'rgba(87, 242, 135, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                            color: p.status === 'active' ? '#57f287' : 'var(--text-muted)',
                            fontSize: '10px',
                            fontWeight: 700,
                            borderRadius: '4px',
                            padding: '2px 6px',
                            textTransform: 'uppercase'
                          }}>
                            {p.status}
                          </span>
                        </div>

                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span>Layout Mode:</span>
                            <span style={{ color: '#09090B', fontWeight: 600 }}>{p.config.layoutType}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span>Categories:</span>
                            <span style={{ color: '#09090B', fontWeight: 600 }}>{p.config.options?.length || 0} configured</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Version:</span>
                            <span style={{ color: '#09090B', fontWeight: 600 }}>v{p.version}</span>
                          </div>
                        </div>

                        {/* Setup Command helper banner */}
                        <div style={{
                          padding: '8px',
                          backgroundColor: '#FAFAFC', border: '1px solid #E4E4E8',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontFamily: 'monospace',
                          color: '#d4af37',
                          border: '1px solid rgba(212,175,55,0.1)'
                        }}>
                          /setup-tickets panel: {p.name}
                        </div>

                        <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
                          <button
                            onClick={() => handleEditPanel(p)}
                            className="btn btn-secondary"
                            style={{ flex: 1, padding: '6px 12px', fontSize: '12px' }}
                          >
                            Edit Config
                          </button>
                          <button
                            onClick={() => handleDeletePanel(p.id)}
                            className="btn btn-secondary"
                            style={{ padding: '6px 12px', color: '#ff4d4d' }}
                            title="Delete Panel"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'transcripts' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#09090B' }}>Ticket SQL Transcripts Logs</h3>
                  <button
                    onClick={fetchTickets}
                    className="btn btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 12px' }}
                  >
                    <RefreshCw size={12} /> Refresh logs
                  </button>
                </div>

                {tickets.length === 0 ? (
                  <div style={{
                    padding: '60px',
                    textAlign: 'center',
                    border: '1px dashed var(--border-color)',
                    borderRadius: '12px',
                    color: 'var(--text-muted)'
                  }}>
                    <FileText size={40} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                    <h4 style={{ color: '#09090B', fontSize: '15px', fontWeight: 700 }}>No Support Tickets found</h4>
                    <p style={{ fontSize: '13px', marginTop: '6px' }}>
                      Spawned ticket records, staff assignments, and messages transcripts will register here.
                    </p>
                  </div>
                ) : (
                  <div className="table-responsive" style={{ border: '1px solid var(--border-color)', borderRadius: '10px', backgroundColor: '#FFFFFF', border: '1px solid #E4E4E7' }}>
                    <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', backgroundColor: '#FAFAFC' }}>
                          <th style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>Ticket ID</th>
                          <th style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>Creator Member</th>
                          <th style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>Status</th>
                          <th style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>Staff Owner</th>
                          <th style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>Messages</th>
                          <th style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>Created Date</th>
                          <th style={{ padding: '12px 16px', color: 'var(--text-muted)', textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tickets.map(t => (
                          <tr key={t.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '12px 16px', fontWeight: 700, color: '#d4af37' }}>{t.ticketId}</td>
                            <td style={{ padding: '12px 16px', color: '#09090B' }}>{t.creatorName}</td>
                            <td style={{ padding: '12px 16px' }}>
                              <span style={{
                                backgroundColor: t.status === 'open' ? 'rgba(87,242,135,0.1)' : t.status === 'claimed' ? 'rgba(212,175,55,0.1)' : 'rgba(255,77,77,0.1)',
                                color: t.status === 'open' ? '#57f287' : t.status === 'claimed' ? '#d4af37' : '#ff4d4d',
                                fontSize: '11px',
                                fontWeight: 700,
                                borderRadius: '4px',
                                padding: '2px 6px'
                              }}>
                                {t.status}
                              </span>
                            </td>
                            <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                              {t.claimedByName || 'Unassigned'}
                            </td>
                            <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{t.messageCount || 0} msgs</td>
                            <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                              {new Date(t.createdAt).toLocaleDateString()}
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                              <button
                                onClick={() => handleViewTranscript(t)}
                                className="btn btn-secondary"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '4px 8px' }}
                              >
                                View Chat <ChevronRight size={12} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* CHAT TRANSCRIPT OVERLAY MODAL */}
      <AnimatePresence>
        {selectedTicket && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1500
          }}>
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              style={{
                width: '640px',
                height: '80vh',
                backgroundColor: '#313338', // discord chat theme
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 12px 40px rgba(0,0,0,0.6)'
              }}
            >
              {/* Header */}
              <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#2b2d31'
              }}>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#09090B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    Transcript: {selectedTicket.ticketId}
                  </h3>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Creator: {selectedTicket.creatorName} • Staff Owner: {selectedTicket.claimedByName || 'None'}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedTicket(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Message loop body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {loadingMessages ? (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', gap: '8px', color: 'var(--text-muted)' }}>
                    <RefreshCw className="animate-spin" size={16} /> Loading transcript...
                  </div>
                ) : ticketMessages.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '13px' }}>
                    No messages recorded in this ticket database transcript log.
                  </div>
                ) : (
                  ticketMessages.map((msg) => (
                    <div key={msg.id} style={{ display: 'flex', gap: '12px' }}>
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        backgroundColor: '#d4af37',
                        backgroundImage: msg.senderAvatar ? `url(${msg.senderAvatar})` : 'url("https://cdn.discordapp.com/embed/avatars/0.png")',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        flexShrink: 0
                      }} />
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: msg.isStaff ? '#d4af37' : '#ffffff' }}>
                            {msg.senderName}
                          </span>
                          {msg.isStaff === 1 && (
                            <span style={{
                              backgroundColor: 'rgba(212,175,55,0.15)',
                              color: '#d4af37',
                              fontSize: '8px',
                              fontWeight: 800,
                              borderRadius: '3px',
                              padding: '1px 3px',
                              textTransform: 'uppercase'
                            }}>
                              Staff
                            </span>
                          )}
                          <span style={{ fontSize: '10px', color: '#949ba4' }}>
                            {new Date(msg.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <div style={{ fontSize: '13px', color: '#dbdee1', marginTop: '4px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: '1.4' }}>
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Footer status summary */}
              <div style={{
                padding: '12px 20px',
                borderTop: '1px solid rgba(255,255,255,0.05)',
                backgroundColor: '#2b2d31',
                borderBottomLeftRadius: '12px',
                borderBottomRightRadius: '12px',
                fontSize: '11px',
                color: 'var(--text-muted)',
                textAlign: 'right'
              }}>
                Recorded via SQL transcript logs. Powered by Rage Optimiser.
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
