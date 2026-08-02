import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import VisibilityToggle from '../../components/VisibilityToggle';

const PRESET_ICONS = [
  'book_2', 'menu_book', 'folder', 'notes',
  'description', 'library_books', 'science', 'travel_explore',
  'home', 'favorite', 'star', 'lock',
];

const PRESET_COLOURS = [
  '#e76750', '#F97316', '#EAB308', '#22C55E',
  '#14B8A6', '#3B82F6', '#8B5CF6', '#EC4899',
];

export default function NotebookFormModal({ open, notebook, onSave, onClose }) {
  const [name,        setName]        = useState('');
  const [icon,        setIcon]        = useState('book_2');
  const [colour,      setColour]      = useState('#e76750');
  const [description, setDescription] = useState('');
  const [visibility,  setVisibility]  = useState('personal');
  const nameRef = useRef(null);

  useEffect(() => {
    if (open) {
      setName(notebook?.name || '');
      setIcon(notebook?.icon || 'book_2');
      setColour(notebook?.colour || '#e76750');
      setDescription(notebook?.description || '');
      setVisibility(notebook?.visibility || 'personal');
      setTimeout(() => nameRef.current?.focus(), 60);
    }
  }, [open, notebook]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), icon, colour, description: description.trim(), visibility });
  };

  const isEdit = !!notebook;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-inverse-surface/40 backdrop-blur-sm" onClick={onClose} />

      <form
        onSubmit={handleSubmit}
        className="relative z-10 bg-surface-container-lowest rounded-2xl shadow-heavy border border-outline-variant/20 w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15">
          <h2 className="text-title-md font-semibold text-on-surface">
            {isEdit ? 'Edit Notebook' : 'New Notebook'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className="text-label-sm font-medium text-on-surface-variant mb-1.5 block">
              Name <span className="text-error">*</span>
            </label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="My notebook…"
              className="w-full h-10 px-4 rounded-xl bg-surface-container border border-outline-variant/30 text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition placeholder-on-surface-variant/40"
              required
            />
          </div>

          {/* Icon grid */}
          <div>
            <label className="text-label-sm font-medium text-on-surface-variant mb-2 block">Icon</label>
            <div className="grid grid-cols-6 gap-2">
              {PRESET_ICONS.map(ic => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcon(ic)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${
                    icon === ic
                      ? 'bg-primary/20 ring-2 ring-primary'
                      : 'bg-surface-container hover:bg-surface-container-high'
                  }`}
                >
                  <span
                    className="material-symbols-outlined text-[20px]"
                    style={{ color: icon === ic ? colour : undefined }}
                  >
                    {ic}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Colour swatches */}
          <div>
            <label className="text-label-sm font-medium text-on-surface-variant mb-2 block">Colour</label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLOURS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColour(c)}
                  className="w-8 h-8 rounded-full relative flex items-center justify-center transition hover:scale-110 active:scale-95"
                  style={{ backgroundColor: c }}
                >
                  {colour === c && (
                    <span className="material-symbols-outlined text-white text-[14px]">check</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-label-sm font-medium text-on-surface-variant mb-1.5 block">
              Description <span className="text-on-surface-variant/40 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What's this notebook for?"
              className="w-full h-10 px-4 rounded-xl bg-surface-container border border-outline-variant/30 text-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition placeholder-on-surface-variant/40"
            />
          </div>

          {/* Visibility */}
          <div>
            <label className="text-label-sm font-medium text-on-surface-variant mb-2 block">Visibility</label>
            <VisibilityToggle value={visibility} onChange={setVisibility} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-outline-variant/15">
          <button
            type="button"
            onClick={onClose}
            className="h-11 px-5 rounded-full bg-surface-container text-on-surface-variant text-label-md hover:bg-surface-container-high transition-[background-color,transform] duration-150 active:scale-[0.97]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="h-11 px-5 rounded-full bg-primary text-on-primary text-label-md font-bold hover:bg-primary/90 transition-[background-color,transform] duration-150 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isEdit ? 'Save' : 'Create'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
