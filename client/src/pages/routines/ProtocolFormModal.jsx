import React, { useState, useEffect } from 'react';
import EmojiPopover from '../../components/EmojiPopover';

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#f43f5e', '#f59e0b',
  '#10b981', '#0ea5e9', '#64748b', '#ec4899',
];

function ColorSwatches({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PRESET_COLORS.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className="w-7 h-7 rounded-full transition-transform hover:scale-110 active:scale-95"
          style={{
            background: c,
            outline: value === c ? '2.5px solid white' : 'none',
            outlineOffset: '1.5px',
            boxShadow: value === c ? `0 0 0 3.5px ${c}` : 'none',
          }}
        />
      ))}
    </div>
  );
}

const VISIBILITIES = [
  { key: 'personal', label: 'Personal', icon: 'person' },
  { key: 'shared',   label: 'Shared',   icon: 'group' },
];

export default function ProtocolFormModal({ protocol, onClose, onSave, onDelete, loading }) {
  const [name, setName]             = useState(protocol?.name || '');
  const [description, setDesc]      = useState(protocol?.description || '');
  const [icon, setIcon]             = useState(protocol?.icon || '⭐');
  const [color, setColor]           = useState(protocol?.color || PRESET_COLORS[0]);
  const [visibility, setVisibility] = useState(protocol?.visibility || 'personal');

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name:        name.trim(),
      description: description.trim() || null,
      icon,
      color,
      visibility,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface-container-lowest rounded-2xl shadow-heavy w-full max-w-lg overflow-y-auto max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-outline-variant/20">
          <h2 className="text-headline-sm text-on-surface">{protocol ? 'Edit Protocol' : 'New Protocol'}</h2>
          <button
            onClick={onClose}
            className="h-10 w-10 rounded-full flex items-center justify-center hover:bg-surface-container text-on-surface-variant transition"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Icon & colour */}
          <div>
            <p className="text-label-md text-on-surface-variant tracking-wider mb-2">Icon & Colour</p>
            <div className="flex items-center gap-4 flex-wrap">
              <EmojiPopover value={icon} onChange={setIcon} />
              <ColorSwatches value={color} onChange={setColor} />
            </div>
          </div>

          <div className="h-2 rounded-full w-full" style={{ backgroundColor: color }} />

          {/* Name */}
          <div>
            <p className="text-label-md text-on-surface-variant tracking-wider mb-1">Name *</p>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Morning Optimization"
              className="w-full bg-surface-container rounded-full px-4 py-2.5 text-body-lg text-on-surface outline-none border border-outline-variant/40 focus:border-primary transition"
              required
            />
          </div>

          {/* Description */}
          <div>
            <p className="text-label-md text-on-surface-variant tracking-wider mb-1">Description</p>
            <textarea
              value={description}
              onChange={e => setDesc(e.target.value)}
              placeholder="The goal of this protocol…"
              rows={2}
              className="w-full bg-surface-container rounded-2xl px-4 py-2.5 text-body-md text-on-surface outline-none border border-outline-variant/40 focus:border-primary transition resize-none"
            />
          </div>

          {/* Visibility */}
          <div>
            <p className="text-label-md text-on-surface-variant tracking-wider mb-2">Visibility</p>
            <div className="flex gap-2">
              {VISIBILITIES.map(v => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setVisibility(v.key)}
                  className={`flex-1 h-11 rounded-full flex items-center justify-center gap-2 text-label-md transition ${
                    visibility === v.key
                      ? 'bg-primary text-on-primary font-bold'
                      : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">{v.icon}</span>
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            {protocol && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(protocol)}
                className="h-11 px-4 rounded-full text-label-md text-error hover:bg-error-container transition flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
                Delete
              </button>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="px-5 h-11 rounded-full text-label-md text-on-surface-variant hover:bg-surface-container transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-6 h-11 rounded-full bg-primary text-on-primary text-label-md font-bold hover:bg-primary/90 disabled:opacity-50 transition"
            >
              {loading ? 'Saving…' : protocol ? 'Save Changes' : 'Create Protocol'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
