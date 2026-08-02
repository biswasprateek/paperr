import React, { useState, useRef, useEffect } from 'react';
import EmojiPicker from 'emoji-picker-react';
import { useUiStore } from '../store/uiStore';
import VisibilityToggle from './VisibilityToggle';

const PRESET_COLOURS = [
  '#6366f1', '#8b5cf6', '#f43f5e', '#f59e0b',
  '#10b981', '#0ea5e9', '#64748b', '#f97316',
  '#ec4899', '#14b8a6', '#84cc16', '#ef4444',
];

function EmojiPopover({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const appTheme = useUiStore(s => s.theme);

  const pickerTheme = appTheme === 'dark'
    ? 'dark'
    : appTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        className="w-12 h-12 rounded-xl text-2xl flex items-center justify-center bg-surface-container-high hover:bg-surface-container border border-outline-variant/40 transition-colors"
      >
        {value}
      </button>
      {open && (
        <div className="absolute left-0 top-14 z-50 shadow-heavy rounded-xl overflow-hidden">
          <EmojiPicker
            onEmojiClick={(data) => { onChange(data.emoji); setOpen(false); }}
            height={350}
            width={300}
            theme={pickerTheme}
            lazyLoadEmojis
          />
        </div>
      )}
    </div>
  );
}

function ColourSwatches({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {PRESET_COLOURS.map(c => (
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

export default function ProjectFormModal({ project, onClose, onSave, loading }) {
  const [name, setName]           = useState(project?.name || '');
  const [description, setDesc]    = useState(project?.description || '');
  const [icon, setIcon]           = useState(project?.cover_icon || '📁');
  const [colour, setColour]       = useState(project?.cover_colour || PRESET_COLOURS[0]);
  const [startDate, setStartDate] = useState(project?.start_date?.slice(0, 10) || '');
  const [endDate, setEndDate]     = useState(project?.end_date?.slice(0, 10) || '');
  const [visibility, setVisibility] = useState(project?.visibility || 'personal');

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      name:         name.trim(),
      description:  description.trim() || null,
      cover_icon:   icon,
      cover_colour: colour,
      start_date:   startDate || null,
      end_date:     endDate || null,
      visibility,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface-container-lowest rounded-2xl shadow-heavy w-full max-w-lg mx-4 p-6 overflow-y-auto max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-headline-sm text-on-surface">
            {project ? 'Edit Project' : 'New Project'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-surface-container text-on-surface-variant transition"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Icon & Colour */}
          <div>
            <p className="text-label-sm text-on-surface-variant uppercase mb-2">Icon & Colour</p>
            <div className="flex items-center gap-4 flex-wrap">
              <EmojiPopover value={icon} onChange={setIcon} />
              <ColourSwatches value={colour} onChange={setColour} />
            </div>
          </div>

          <div className="h-2 rounded-full w-full" style={{ backgroundColor: colour }} />

          {/* Name */}
          <div>
            <p className="text-label-sm text-on-surface-variant uppercase mb-1">Name *</p>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Project name"
              className="w-full bg-surface-container rounded-full px-4 py-2.5 text-body-lg text-on-surface outline-none border border-outline-variant/40 focus:border-primary transition"
              required
            />
          </div>

          {/* Description */}
          <div>
            <p className="text-label-sm text-on-surface-variant uppercase mb-1">Description</p>
            <textarea
              value={description}
              onChange={e => setDesc(e.target.value)}
              placeholder="What is this project about?"
              rows={2}
              className="w-full bg-surface-container rounded-2xl px-4 py-2.5 text-body-md text-on-surface outline-none border border-outline-variant/40 focus:border-primary transition resize-none"
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-label-sm text-on-surface-variant uppercase mb-1">Start Date</p>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full bg-surface-container rounded-full px-4 py-2.5 text-body-md text-on-surface outline-none border border-outline-variant/40 focus:border-primary transition"
              />
            </div>
            <div>
              <p className="text-label-sm text-on-surface-variant uppercase mb-1">End Date</p>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full bg-surface-container rounded-full px-4 py-2.5 text-body-md text-on-surface outline-none border border-outline-variant/40 focus:border-primary transition"
              />
            </div>
          </div>

          {/* Visibility */}
          <div>
            <p className="text-label-sm text-on-surface-variant uppercase mb-2">Visibility</p>
            <VisibilityToggle value={visibility} onChange={setVisibility} />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-full text-label-md text-on-surface-variant hover:bg-surface-container transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-6 py-2 rounded-full bg-primary text-on-primary text-label-md font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? 'Saving…' : project ? 'Save Changes' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
