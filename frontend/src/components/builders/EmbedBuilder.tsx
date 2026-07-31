import React, { useState } from 'react';
import { Plus, Trash2, Eye, Link2, Image as ImageIcon, Calendar, X } from 'lucide-react';
import { VariableInput, VariableTextArea } from './VariableInput';

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface EmbedData {
  title?: string;
  url?: string;
  description?: string;
  color?: string;
  author?: string;
  authorIcon?: string;
  authorUrl?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  footer?: string;
  footerIcon?: string;
  timestamp?: boolean;
  showAvatar?: boolean;
  fields?: EmbedField[];
}

interface EmbedBuilderProps {
  value: EmbedData;
  onChange: (val: EmbedData) => void;
  titleLabel?: string;
  layout?: 'horizontal' | 'vertical';
  hidePreview?: boolean;
}

const KOYA_PRESET_COLORS = [
  { name: 'Green', hex: '#57f287' },
  { name: 'Cyan', hex: '#00b0f4' },
  { name: 'Blue', hex: '#5865f2' },
  { name: 'Purple', hex: '#9b59b6' },
  { name: 'Magenta', hex: '#e91e63' },
  { name: 'Yellow', hex: '#f1c40f' },
  { name: 'Orange', hex: '#e67e22' },
  { name: 'Red', hex: '#ed4245' },
  { name: 'Grey', hex: '#979c9f' },
  { name: 'Slate', hex: '#4f545c' },
  { name: 'White', hex: '#ffffff' }
];

export function EmbedBuilder({ value, onChange, titleLabel = 'Embed Configuration', layout = 'horizontal', hidePreview = false }: EmbedBuilderProps) {
  // Input visibility toggles inspired by Koya
  const [showAuthorIcon, setShowAuthorIcon] = useState(!!value.authorIcon);
  const [showAuthorUrl, setShowAuthorUrl] = useState(!!value.authorUrl);
  const [showTitleUrl, setShowTitleUrl] = useState(!!value.url);
  const [showThumbnailInput, setShowThumbnailInput] = useState(!!value.thumbnailUrl);
  const [showFooterIcon, setShowFooterIcon] = useState(!!value.footerIcon);

  const updateEmbed = (key: keyof EmbedData, val: any) => {
    onChange({
      ...value,
      [key]: val
    });
  };

  const addField = () => {
    const fields = [...(value.fields || [])];
    fields.push({ name: 'New Field', value: 'Field value', inline: true });
    updateEmbed('fields', fields);
  };

  const removeField = (index: number) => {
    const fields = [...(value.fields || [])];
    fields.splice(index, 1);
    updateEmbed('fields', fields);
  };

  const updateField = (index: number, key: keyof EmbedField, val: any) => {
    const fields = [...(value.fields || [])];
    fields[index] = { ...fields[index], [key]: val };
    updateEmbed('fields', fields);
  };

  // Helper to render Discord-style markdown and mentions
  const renderDiscordMarkdown = (text?: string) => {
    if (!text) return '';

    // First resolve common variable tags
    let processed = text
      .replace(/{user}/g, '@User')
      .replace(/{user\.mention}/g, '@User')
      .replace(/{username}/g, 'User')
      .replace(/{userTag}/g, 'User#0001')
      .replace(/{userId}/g, '7358129381293812')
      .replace(/{server}/g, 'Rage Optimiser')
      .replace(/{server\.name}/g, 'Rage Optimiser')

      .replace(/{membercount}/g, '142')
      .replace(/{memberCount}/g, '142')
      .replace(/{date}/g, 'Friday, July 17, 2026')
      .replace(/{boosts}/g, '28')
      .replace(/{boostTier}/g, '3');

    // Tokenize strings by channel tags <#id>, mentions (@username), and bold text (**text**)
    const regex = /(<#\d+>|@\w+|\*\*.*?\*\*)/g;
    const parts = processed.split(regex);

    return (
      <>
        {parts.map((part, index) => {
          if (part.startsWith('<#') && part.endsWith('>')) {
            const id = part.slice(2, -1);
            let channelName = 'channel';
            if (id === '1507674485518630963') {
              channelName = 'RULES | 🌟';
            } else if (id === '1507682353256861716') {
              channelName = 'CREATE-TICKET | 🌟';
            }
            return (
              <span
                key={index}
                style={{
                  color: '#c9cdfb',
                  backgroundColor: 'rgba(88, 101, 242, 0.3)',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  fontWeight: 500,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '2px'
                }}
              >
                #{channelName}
              </span>
            );
          }

          if (part.startsWith('@')) {
            return (
              <span
                key={index}
                style={{
                  color: '#c9cdfb',
                  backgroundColor: 'rgba(88, 101, 242, 0.3)',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                {part}
              </span>
            );
          }

          if (part.startsWith('**') && part.endsWith('**')) {
            return (
              <strong key={index} style={{ fontWeight: 700, color: '#ffffff' }}>
                {part.slice(2, -2)}
              </strong>
            );
          }

          return part;
        })}
      </>
    );
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: hidePreview ? '1fr' : (layout === 'vertical' ? '1fr' : '1fr 1fr'),
      gap: '24px',
      alignItems: 'start'
    }}>
      {/* Configuration Controls (Form) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* Color and Thumbnail Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: '20px' }}>
          {/* Color picker & Swatches */}
          <div className="form-group">
            <label className="form-label" style={{ fontSize: '12px', fontWeight: 600 }}>Color</label>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div style={{
                position: 'relative',
                width: '38px',
                height: '38px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: value.color || '#16161f',
                cursor: 'pointer',
                overflow: 'hidden'
              }}>
                <input
                  type="color"
                  value={value.color || '#d4af37'}
                  onChange={e => updateEmbed('color', e.target.value)}
                  style={{
                    border: 'none',
                    width: '100%',
                    height: '100%',
                    padding: 0,
                    cursor: 'pointer',
                    opacity: 0,
                    position: 'absolute',
                    top: 0,
                    left: 0
                  }}
                />
                <div style={{
                  width: '100%',
                  height: '100%',
                  backgroundColor: value.color || '#d4af37'
                }} />
              </div>

              {/* Preset swatches */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {KOYA_PRESET_COLORS.map(c => (
                  <button
                    key={c.hex}
                    type="button"
                    onClick={() => updateEmbed('color', c.hex)}
                    style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      backgroundColor: c.hex,
                      border: value.color?.toLowerCase() === c.hex.toLowerCase() ? '2px solid #ffffff' : '1.5px solid rgba(255,255,255,0.15)',
                      cursor: 'pointer',
                      padding: 0,
                      boxShadow: value.color?.toLowerCase() === c.hex.toLowerCase() ? '0 0 6px rgba(255,255,255,0.5)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Thumbnail Preview Selector Box */}
          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <label className="form-label" style={{ fontSize: '12px', fontWeight: 600 }}>Thumbnail</label>
            <div
              onClick={() => setShowThumbnailInput(!showThumbnailInput)}
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: showThumbnailInput ? 'rgba(212, 175, 55, 0.08)' : 'rgba(255, 255, 255, 0.01)',
                borderColor: showThumbnailInput ? '#d4af37' : 'var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              {value.thumbnailUrl ? (
                <img src={value.thumbnailUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
              ) : (
                <ImageIcon size={16} color="var(--text-muted)" />
              )}
            </div>
          </div>
        </div>

        {/* Thumbnail URL Input (Conditional) */}
        {showThumbnailInput && (
          <div className="form-group" style={{ marginTop: '-8px' }}>
            <input
              type="text"
              value={value.thumbnailUrl || ''}
              onChange={e => updateEmbed('thumbnailUrl', e.target.value)}
              className="form-control"
              placeholder="Thumbnail image URL"
            />
          </div>
        )}

        {/* Author Field */}
        <div className="form-group">
          <label className="form-label" style={{ fontSize: '12px', fontWeight: 600 }}>Author</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setShowAuthorIcon(!showAuthorIcon)}
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: showAuthorIcon ? 'rgba(212, 175, 55, 0.15)' : 'rgba(255,255,255,0.02)',
                borderColor: showAuthorIcon ? '#d4af37' : 'var(--border-color)',
                color: showAuthorIcon ? '#fff' : 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title="Add Author Icon URL"
            >
              <ImageIcon size={16} />
            </button>
            <button
              type="button"
              onClick={() => setShowAuthorUrl(!showAuthorUrl)}
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: showAuthorUrl ? 'rgba(212, 175, 55, 0.15)' : 'rgba(255,255,255,0.02)',
                borderColor: showAuthorUrl ? '#d4af37' : 'var(--border-color)',
                color: showAuthorUrl ? '#fff' : 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title="Add Author Link URL"
            >
              <Link2 size={16} />
            </button>
            <VariableInput
              value={value.author || ''}
              onValueChange={(val) => updateEmbed('author', val)}
              placeholder="Name of the author"
            />
          </div>
          {showAuthorIcon && (
            <input
              type="text"
              value={value.authorIcon || ''}
              onChange={e => updateEmbed('authorIcon', e.target.value)}
              className="form-control"
              style={{ marginTop: '8px' }}
              placeholder="Author Icon URL"
            />
          )}
          {showAuthorUrl && (
            <input
              type="text"
              value={value.authorUrl || ''}
              onChange={e => updateEmbed('authorUrl', e.target.value)}
              className="form-control"
              style={{ marginTop: '8px' }}
              placeholder="Author Link URL"
            />
          )}
        </div>

        {/* Title Field */}
        <div className="form-group">
          <label className="form-label" style={{ fontSize: '12px', fontWeight: 600 }}>Title</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setShowTitleUrl(!showTitleUrl)}
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: showTitleUrl ? 'rgba(212, 175, 55, 0.15)' : 'rgba(255,255,255,0.02)',
                borderColor: showTitleUrl ? '#d4af37' : 'var(--border-color)',
                color: showTitleUrl ? '#fff' : 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title="Add Title Link URL"
            >
              <Link2 size={16} />
            </button>
            <VariableInput
              value={value.title || ''}
              onValueChange={(val) => updateEmbed('title', val)}
              placeholder="Title of the embed"
            />
          </div>
          {showTitleUrl && (
            <input
              type="text"
              value={value.url || ''}
              onChange={e => updateEmbed('url', e.target.value)}
              className="form-control"
              style={{ marginTop: '8px' }}
              placeholder="Title Link URL"
            />
          )}
        </div>

        {/* Description Field */}
        <div className="form-group" style={{ position: 'relative' }}>
          <label className="form-label" style={{ fontSize: '12px', fontWeight: 600 }}>Description</label>
          <VariableTextArea
            value={value.description || ''}
            onValueChange={(val) => updateEmbed('description', val)}
            placeholder="Description of the embed"
          />
          <span style={{
            position: 'absolute',
            bottom: '8px',
            right: '12px',
            fontSize: '10px',
            color: 'var(--text-muted)'
          }}>
            {(value.description || '').length} / 4096
          </span>
        </div>

        {/* Fields List */}
        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label className="form-label" style={{ fontSize: '12px', fontWeight: 600 }}>Fields</label>
            <button
              type="button"
              onClick={addField}
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '11px' }}
            >
              <Plus size={12} /> Add Field
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {(!value.fields || value.fields.length === 0) ? (
              <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: '11px', border: '1px dashed var(--border-color)', borderRadius: '6px' }}>
                No fields configured. Add fields to structure key details.
              </div>
            ) : (
              value.fields.map((f, idx) => (
                <div key={idx} style={{
                  padding: '12px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(255, 255, 255, 0.01)',
                  position: 'relative'
                }}>
                  <button
                    type="button"
                    onClick={() => removeField(idx)}
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = '#ff4d4d'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                  >
                    <Trash2 size={12} />
                  </button>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px', paddingRight: '20px' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <VariableInput
                        value={f.name}
                        onValueChange={(val) => updateField(idx, 'name', val)}
                        placeholder="Field Name"
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <VariableInput
                        value={f.value}
                        onValueChange={(val) => updateField(idx, 'value', val)}
                        placeholder="Field Value"
                      />
                    </div>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                    <input
                      type="checkbox"
                      checked={!!f.inline}
                      onChange={e => updateField(idx, 'inline', e.target.checked)}
                    />
                    Inline display
                  </label>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Image File Field */}
        <div className="form-group">
          <label className="form-label" style={{ fontSize: '12px', fontWeight: 600 }}>Image</label>
          <div style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
            <input
              type="text"
              value={value.imageUrl || ''}
              onChange={e => updateEmbed('imageUrl', e.target.value)}
              className="form-control"
              placeholder="Large Main Image URL"
            />
            {value.imageUrl && (
              <div style={{
                position: 'relative',
                width: '100%',
                maxHeight: '140px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                overflow: 'hidden',
                backgroundColor: 'rgba(0,0,0,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <img src={value.imageUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="" />
                <button
                  type="button"
                  onClick={() => updateEmbed('imageUrl', '')}
                  style={{
                    position: 'absolute',
                    top: '6px',
                    right: '6px',
                    backgroundColor: 'rgba(0,0,0,0.6)',
                    border: 'none',
                    color: '#fff',
                    borderRadius: '50%',
                    width: '20px',
                    height: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <X size={10} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer Field */}
        <div className="form-group">
          <label className="form-label" style={{ fontSize: '12px', fontWeight: 600 }}>Footer</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setShowFooterIcon(!showFooterIcon)}
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: showFooterIcon ? 'rgba(212, 175, 55, 0.15)' : 'rgba(255,255,255,0.02)',
                borderColor: showFooterIcon ? '#d4af37' : 'var(--border-color)',
                color: showFooterIcon ? '#fff' : 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
              title="Add Footer Icon URL"
            >
              <ImageIcon size={16} />
            </button>
            <VariableInput
              value={value.footer || ''}
              onValueChange={(val) => updateEmbed('footer', val)}
              placeholder="Footer text"
            />
            {/* Timestamp switch */}
            <button
              type="button"
              onClick={() => updateEmbed('timestamp', !value.timestamp)}
              style={{
                padding: '0 12px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: value.timestamp ? 'rgba(212, 175, 55, 0.15)' : 'rgba(255,255,255,0.02)',
                borderColor: value.timestamp ? '#d4af37' : 'var(--border-color)',
                color: value.timestamp ? '#fff' : 'var(--text-secondary)',
                fontSize: '11px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                whiteSpace: 'nowrap',
                cursor: 'pointer'
              }}
            >
              <Calendar size={12} />
              {value.timestamp ? 'Timestamp On' : 'Add timestamp'}
            </button>
          </div>
          {showFooterIcon && (
            <input
              type="text"
              value={value.footerIcon || ''}
              onChange={e => updateEmbed('footerIcon', e.target.value)}
              className="form-control"
              style={{ marginTop: '8px' }}
              placeholder="Footer Icon URL"
            />
          )}
        </div>

      </div>

      {/* Visual Live Discord Mockup Preview */}
      {!hidePreview && (
        <div style={{
          backgroundColor: '#313338',
          borderRadius: '12px',
          padding: '24px',
          fontFamily: "'GG Sans', 'Helvetica Neue', Arial, sans-serif",
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          alignSelf: 'stretch',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          border: '1px solid rgba(255,255,255,0.03)'
        }}>
          <h4 style={{
            fontSize: '12px',
            fontWeight: 800,
            color: '#949ba4',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <Eye size={12} /> Live Simulator Viewport
          </h4>

          {/* Discord Chat Layout */}
          <div style={{ display: 'flex', gap: '16px' }}>
            {/* Bot Avatar */}
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: '#5865f2',
              backgroundImage: 'url("https://cdn.discordapp.com/embed/avatars/4.png")',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              flexShrink: 0
            }} />

            {/* Chat Bubble Content */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {/* Header / Bot Username & Timestamp */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#ffffff', fontWeight: 600, fontSize: '15px', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'} onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}>
                  Rage Optimiser
                </span>
                <span style={{
                  backgroundColor: '#5865f2',
                  color: '#ffffff',
                  fontSize: '10px',
                  fontWeight: 700,
                  borderRadius: '3px',
                  padding: '2px 4px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.2px',
                  display: 'inline-flex',
                  alignItems: 'center'
                }}>
                  BOT
                </span>
                <span style={{ color: '#949ba4', fontSize: '12px', marginLeft: '4px' }}>
                  Today at 12:00 PM
                </span>
              </div>

              {/* Embed itself */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: '#2b2d31',
                borderLeft: `4px solid ${value.color || '#d4af37'}`,
                borderRadius: '4px',
                padding: '12px 16px',
                maxWidth: '520px',
                gap: '8px',
                position: 'relative'
              }}>
                {/* Thumbnail Top-Right */}
                {value.thumbnailUrl && (
                  <img
                    src={value.thumbnailUrl}
                    alt=""
                    style={{
                      position: 'absolute',
                      top: '12px',
                      right: '16px',
                      width: '80px',
                      height: '80px',
                      borderRadius: '4px',
                      objectFit: 'cover'
                    }}
                    onError={e => e.currentTarget.style.display = 'none'}
                  />
                )}

                {/* Author Row */}
                {value.author && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {value.authorIcon && (
                      <img
                        src={value.authorIcon}
                        alt=""
                        style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }}
                        onError={e => e.currentTarget.style.display = 'none'}
                      />
                    )}
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>
                      {renderDiscordMarkdown(value.author)}
                    </span>
                  </div>
                )}

                {/* Title */}
                {value.title && (
                  <div style={{
                    fontSize: '16px',
                    fontWeight: 700,
                    color: value.url ? '#00b0f4' : '#ffffff',
                    cursor: value.url ? 'pointer' : 'default',
                    textDecoration: 'none'
                  }}>
                    {renderDiscordMarkdown(value.title)}
                  </div>
                )}

                {/* Description */}
                {value.description && (
                  <div style={{
                    fontSize: '14px',
                    color: '#dbdee1',
                    whiteSpace: 'pre-wrap',
                    lineHeight: '1.4'
                  }}>
                    {renderDiscordMarkdown(value.description)}
                  </div>
                )}

                {/* Custom Fields Grid */}
                {value.fields && value.fields.length > 0 && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '8px',
                    marginTop: '4px',
                    width: value.thumbnailUrl ? 'calc(100% - 90px)' : '100%'
                  }}>
                    {value.fields.map((f, idx) => (
                      <div
                        key={idx}
                        style={{
                          gridColumn: f.inline ? 'span 1' : 'span 3',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px'
                        }}
                      >
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#ffffff' }}>
                          {renderDiscordMarkdown(f.name)}
                        </div>
                        <div style={{ fontSize: '13px', color: '#dbdee1' }}>
                          {renderDiscordMarkdown(f.value)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Main Image */}
                {value.imageUrl && (
                  <img
                    src={value.imageUrl}
                    alt=""
                    style={{
                      maxWidth: '100%',
                      borderRadius: '4px',
                      marginTop: '8px',
                      maxHeight: '260px',
                      objectFit: 'contain',
                      backgroundColor: '#1e1f22'
                    }}
                    onError={e => e.currentTarget.style.display = 'none'}
                  />
                )}

                {/* User Avatar Placement (Conditional check box) */}
                {value.showAvatar && (
                  <div style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    border: `3px solid ${value.color || '#d4af37'}`,
                    backgroundColor: '#1e1f22',
                    backgroundImage: 'url("https://cdn.discordapp.com/embed/avatars/4.png")',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    marginTop: '8px'
                  }} />
                )}

                {/* Footer Row */}
                {(value.footer || value.timestamp) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    {value.footerIcon && (
                      <img
                        src={value.footerIcon}
                        alt=""
                        style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover' }}
                        onError={e => e.currentTarget.style.display = 'none'}
                      />
                    )}
                    <span style={{ fontSize: '12px', color: '#949ba4', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {value.footer ? renderDiscordMarkdown(value.footer) : ''}
                      {value.footer && value.timestamp && <span>•</span>}
                      {value.timestamp ? 'Today at 12:00 PM' : ''}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
