import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import EmojiPicker from 'emoji-picker-react';
import { api } from '../auth/AuthContext';
import { useUiStore } from '../store/uiStore';
import {
  DndContext, PointerSensor, TouchSensor, useSensor, useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext, rectSortingStrategy, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import VisibilityToggle, { SharedBadge } from '../components/VisibilityToggle';
import { useMode } from '../hooks/useMode';

const PRESET_COLOURS = [
  '#6366f1', '#8b5cf6', '#f43f5e', '#f59e0b',
  '#10b981', '#0ea5e9', '#64748b', '#f97316',
];

// ── Small Components ──────────────────────────────────────────────────────────

function ListIconButton({ icon, colour, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-9 h-9 rounded-lg flex items-center justify-center text-lg hover:opacity-80 transition flex-shrink-0"
      style={{ background: colour + '22', border: `1.5px solid ${colour}44` }}
    >
      {icon}
    </button>
  );
}

function ColourSwatches({ value, onChange }) {
  return (
    <div className="flex gap-2 mt-1">
      {PRESET_COLOURS.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className="w-7 h-7 rounded-full transition-transform duration-150 hover:scale-110 active:scale-95"
          style={{
            background: c,
            outline: value === c ? `2.5px solid white` : 'none',
            outlineOffset: '1.5px',
            boxShadow: value === c ? `0 0 0 3.5px ${c}` : 'none',
          }}
        />
      ))}
    </div>
  );
}

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
        className="w-10 h-10 rounded-lg text-xl flex items-center justify-center bg-surface-container-high hover:bg-surface-container border border-outline-variant/40 transition-colors duration-150"
      >
        {value}
      </button>
      {open && (
        <div className="absolute left-0 top-12 z-50 shadow-heavy rounded-xl overflow-hidden">
          <EmojiPicker
            onEmojiClick={(data) => { onChange(data.emoji); setOpen(false); }}
            searchPlaceholder="Search emojis..."
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

export function CreateListForm({ onSubmit, onCancel, loading }) {
  const [name, setName]           = useState('');
  const [icon, setIcon]           = useState('📋');
  const [colour, setColour]       = useState(PRESET_COLOURS[0]);
  const [visibility, setVisibility] = useState('personal');

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), icon, colour, visibility });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="bg-surface-container-lowest rounded-2xl p-6 w-96 shadow-heavy border border-outline-variant/20">
        <h3 className="text-title-md text-on-surface font-semibold mb-5">New list</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-3">
            <EmojiPopover value={icon} onChange={setIcon} />
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="List name..."
              className="flex-1 min-w-0 h-10 rounded-full bg-surface-container px-4 text-body-md text-on-surface border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-[box-shadow,border-color]"
              onKeyDown={(e) => e.key === 'Escape' && onCancel()}
            />
          </div>
          <div>
            <p className="text-label-sm text-on-surface-variant mb-2">Colour</p>
            <ColourSwatches value={colour} onChange={setColour} />
          </div>
          <div>
            <p className="text-label-sm text-on-surface-variant mb-2">Visibility</p>
            <VisibilityToggle value={visibility} onChange={setVisibility} />
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={!name.trim() || loading}
              className="flex-1 h-11 rounded-full bg-primary text-on-primary text-label-md font-bold disabled:opacity-40 hover:bg-primary/90 transition-[background-color,transform] duration-150 active:scale-[0.97]"
            >
              Create list
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-5 h-11 rounded-full bg-surface-container text-on-surface-variant text-label-md hover:bg-surface-container-high transition-[background-color,transform] duration-150 active:scale-[0.97]"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const MAX_INDENT = 4;
const INDENT_PX  = 24;

function ItemRow({ item, editing, onRequestEdit, onStopEdit, onToggle, onDelete, onTitleChange, onIndent, onEnter, dragRef, dragStyle, dragHandleProps }) {
  const [draft, setDraft]   = useState(item.title);
  const inputRef            = useRef(null);
  const advancingRef        = useRef(false);
  const indent              = item.indent_level || 0;
  const { mode }             = useMode();
  const touch                = mode === 'phone';

  // When this row becomes the active edit target, sync the draft and focus it.
  useEffect(() => {
    if (editing) {
      setDraft(item.title);
      const raf = requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select?.(); });
      return () => cancelAnimationFrame(raf);
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    const t = draft.trim();
    if (t && t !== item.title) onTitleChange(item.id, t);
  };

  // Leaving an empty row removes it, so blank inserted items never linger.
  const commitOrRemove = () => {
    if (draft.trim() === '') onDelete?.(item.id);
    else save();
  };

  const handleBlur = () => {
    // Skip closing when Enter/Escape is already handling this row — that transition
    // unmounts the input and fires blur, which would otherwise run twice.
    if (advancingRef.current) { advancingRef.current = false; return; }
    commitOrRemove();
    onStopEdit();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      advancingRef.current = true;
      if (draft.trim() === '') { onDelete?.(item.id); onStopEdit(); return; }
      save();
      onEnter?.(item.id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      advancingRef.current = true;
      if (draft.trim() === '') onDelete?.(item.id); // discard a never-filled blank row
      else setDraft(item.title);                    // discard edits to an existing item
      onStopEdit();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      onIndent?.(item.id, e.shiftKey ? -1 : 1);
    }
  };

  return (
    <div
      ref={dragRef}
      style={{ marginLeft: indent * INDENT_PX, ...dragStyle }}
      className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl border transition ${
      item.is_completed
        ? 'border-outline-variant/10 bg-surface-container/30 opacity-50'
        : 'border-outline-variant/20 bg-surface-container-lowest hover:border-outline-variant/40'
    }`}>
      {/* Drag handle */}
      {dragHandleProps && (
        <button
          {...dragHandleProps}
          aria-label="Drag to reorder"
          className={`can-hover:opacity-0 can-hover:group-hover:opacity-100 focus-visible:opacity-100 -ml-1 rounded text-on-surface-variant/50 hover:text-on-surface-variant cursor-grab active:cursor-grabbing flex-shrink-0 touch-none transition ${touch ? 'p-2' : 'p-0.5'}`}
        >
          <span className="material-symbols-outlined text-[16px]">drag_indicator</span>
        </button>
      )}

      {/* Checkbox */}
      <button
        onClick={() => onToggle(item.id)}
        aria-label={item.is_completed ? 'Mark item incomplete' : 'Mark item complete'}
        className={`rounded-full border-2 flex items-center justify-center flex-shrink-0 transition focus-visible:ring-2 focus-visible:ring-primary/70 ${touch ? 'w-7 h-7' : 'w-5 h-5'} ${
          item.is_completed
            ? 'bg-primary border-primary'
            : 'border-outline hover:border-primary'
        }`}
      >
        {!!item.is_completed && (
          <span className={`material-symbols-outlined text-on-primary ${touch ? 'text-[16px]' : 'text-[12px]'}`}>check</span>
        )}
      </button>

      {/* Title */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent text-body-md text-on-surface border-0 p-0 focus:outline-none focus:ring-0"
          />
        ) : (
          <span
            onClick={() => !item.is_completed && onRequestEdit?.(item.id)}
            className={`text-body-md block truncate ${item.is_completed ? 'line-through text-on-surface-variant' : 'text-on-surface cursor-text'}`}
          >
            {item.title}
          </span>
        )}

        {/* Linked chips */}
        {(item.task_title || item.project_name) && (
          <div className="flex gap-1.5 mt-1">
            {item.task_title && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary/10 text-secondary font-medium">
                ✓ {item.task_title}
              </span>
            )}
            {item.project_name && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-tertiary/10 text-tertiary font-medium">
                {item.project_icon} {item.project_name}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Indent controls */}
      <div className="flex items-center can-hover:opacity-0 can-hover:group-hover:opacity-100 focus-within:opacity-100 transition">
        <button
          onClick={() => onIndent?.(item.id, -1)}
          disabled={indent === 0}
          aria-label="Outdent item"
          title="Outdent (Shift+Tab)"
          className={`rounded-full hover:bg-surface-container transition text-on-surface-variant hover:text-on-surface disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-on-surface-variant ${touch ? 'p-2' : 'p-1'}`}
        >
          <span className="material-symbols-outlined text-[16px]">format_indent_decrease</span>
        </button>
        <button
          onClick={() => onIndent?.(item.id, 1)}
          disabled={indent >= MAX_INDENT}
          aria-label="Indent item"
          title="Indent (Tab)"
          className={`rounded-full hover:bg-surface-container transition text-on-surface-variant hover:text-on-surface disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-on-surface-variant ${touch ? 'p-2' : 'p-1'}`}
        >
          <span className="material-symbols-outlined text-[16px]">format_indent_increase</span>
        </button>
      </div>

      {/* Delete */}
      <button
        onClick={() => onDelete(item.id)}
        aria-label="Delete item"
        className={`can-hover:opacity-0 can-hover:group-hover:opacity-100 focus-visible:opacity-100 rounded-full hover:bg-error/10 transition text-on-surface-variant hover:text-error ${touch ? 'p-2' : 'p-1'}`}
      >
        <span className="material-symbols-outlined text-[16px]">delete</span>
      </button>
    </div>
  );
}

// Sortable wrapper so active items can be dragged to reorder.
function SortableItemRow(props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.item.id });
  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: 'relative',
  };
  return (
    <ItemRow
      {...props}
      dragRef={setNodeRef}
      dragStyle={dragStyle}
      dragHandleProps={{ ...attributes, ...listeners }}
    />
  );
}

// Reorder active items, moving a dragged parent together with its indented subtree.
function reorderItemsWithSubtree(list, activeId, overId) {
  const from = list.findIndex(i => i.id === activeId);
  const to   = list.findIndex(i => i.id === overId);
  if (from === -1 || to === -1 || from === to) return null;

  // Block = dragged item + the contiguous rows indented deeper than it.
  const level = list[from].indent_level || 0;
  let end = from + 1;
  while (end < list.length && (list[end].indent_level || 0) > level) end++;
  if (to >= from && to < end) return null; // can't drop a parent inside its own subtree

  const block = list.slice(from, end);
  const rest  = [...list.slice(0, from), ...list.slice(end)];
  let insertAt = rest.findIndex(i => i.id === overId);
  if (insertAt === -1) insertAt = rest.length;
  if (from < to) insertAt += 1; // dropping downward lands after the target
  return [...rest.slice(0, insertAt), ...block, ...rest.slice(insertAt)];
}

function EditListModal({ list, onSave, onClose, loading }) {
  const [name, setName]           = useState(list.name);
  const [icon, setIcon]           = useState(list.icon);
  const [colour, setColour]       = useState(list.colour);
  const [visibility, setVisibility] = useState(list.visibility || 'personal');

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), icon, colour, visibility });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-surface-container-lowest rounded-2xl p-6 w-96 shadow-heavy border border-outline-variant/20">
        <h3 className="text-title-md text-on-surface font-semibold mb-5">Edit list</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-3">
            <EmojiPopover value={icon} onChange={setIcon} />
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="List name..."
              className="flex-1 min-w-0 h-10 rounded-full bg-surface-container px-4 text-body-md text-on-surface border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-[box-shadow,border-color]"
              onKeyDown={(e) => e.key === 'Escape' && onClose()}
            />
          </div>
          <div>
            <p className="text-label-sm text-on-surface-variant mb-2">Colour</p>
            <ColourSwatches value={colour} onChange={setColour} />
          </div>
          <div>
            <p className="text-label-sm text-on-surface-variant mb-2">Visibility</p>
            <VisibilityToggle value={visibility} onChange={setVisibility} />
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={!name.trim() || loading}
              className="flex-1 h-11 rounded-full bg-primary text-on-primary text-label-md font-bold disabled:opacity-40 hover:bg-primary/90 transition-[background-color,transform] duration-150 active:scale-[0.97]"
            >
              Save changes
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 h-11 rounded-full bg-surface-container text-on-surface-variant text-label-md hover:bg-surface-container-high transition-[background-color,transform] duration-150 active:scale-[0.97]"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── List Templates ────────────────────────────────────────────────────────────

let _tplKey = 0;
const tplRow = (title = '') => ({ key: `t${_tplKey++}`, title });

function TemplateEditorModal({ template, onSave, onClose, loading }) {
  const [name, setName]     = useState(template?.name ?? '');
  const [icon, setIcon]     = useState(template?.icon ?? '🧳');
  const [colour, setColour] = useState(template?.colour ?? PRESET_COLOURS[0]);
  const [items, setItems]   = useState(() =>
    (template?.items?.length ? template.items.map(i => tplRow(i.title)) : [tplRow()])
  );
  const lastInputRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const setItemTitle = (key, title) =>
    setItems(prev => prev.map(it => (it.key === key ? { ...it, title } : it)));
  const removeItem = (key) =>
    setItems(prev => (prev.length === 1 ? [tplRow()] : prev.filter(it => it.key !== key)));
  const addItem = () => {
    setItems(prev => [...prev, tplRow()]);
    requestAnimationFrame(() => lastInputRef.current?.focus());
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const cleaned = items
      .map((it, idx) => ({ title: it.title.trim(), sort_order: idx }))
      .filter(it => it.title.length > 0);
    onSave({ name: name.trim(), icon, colour, items: cleaned });
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-surface-container-lowest rounded-2xl p-6 w-[28rem] max-h-[85vh] flex flex-col shadow-heavy border border-outline-variant/20">
        <h3 className="text-title-md text-on-surface font-semibold mb-5 flex-shrink-0">
          {template ? 'Edit template' : 'New template'}
        </h3>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 min-h-0 flex-1">
          <div className="flex items-center gap-3 flex-shrink-0">
            <EmojiPopover value={icon} onChange={setIcon} />
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Template name (e.g. Travel Essentials)..."
              className="flex-1 min-w-0 h-10 rounded-full bg-surface-container px-4 text-body-md text-on-surface border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-[box-shadow,border-color]"
            />
          </div>
          <div className="flex-shrink-0">
            <p className="text-label-sm text-on-surface-variant mb-2">Colour</p>
            <ColourSwatches value={colour} onChange={setColour} />
          </div>

          <div className="flex flex-col min-h-0 flex-1">
            <p className="text-label-sm text-on-surface-variant mb-2 flex-shrink-0">Items</p>
            <div className="space-y-1.5 overflow-y-auto pr-1">
              {items.map((it, idx) => (
                <div key={it.key} className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-on-surface-variant/50 flex-shrink-0">check_box_outline_blank</span>
                  <input
                    ref={idx === items.length - 1 ? lastInputRef : null}
                    type="text"
                    value={it.title}
                    onChange={(e) => setItemTitle(it.key, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
                    placeholder="Item..."
                    className="flex-1 min-w-0 h-9 rounded-lg bg-surface-container px-3 text-body-sm text-on-surface border border-outline-variant/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(it.key)}
                    aria-label="Remove item"
                    className="p-1 rounded-full text-on-surface-variant hover:bg-error/10 hover:text-error transition flex-shrink-0"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addItem}
              className="mt-2 flex items-center gap-1.5 text-label-sm text-primary font-medium hover:opacity-80 transition flex-shrink-0 self-start"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              Add item
            </button>
          </div>

          <div className="flex gap-3 pt-1 flex-shrink-0">
            <button
              type="submit"
              disabled={!name.trim() || loading}
              className="flex-1 h-11 rounded-full bg-primary text-on-primary text-label-md font-bold disabled:opacity-40 hover:bg-primary/90 transition-[background-color,transform] duration-150 active:scale-[0.97]"
            >
              {template ? 'Save template' : 'Create template'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 h-11 rounded-full bg-surface-container text-on-surface-variant text-label-md hover:bg-surface-container-high transition-[background-color,transform] duration-150 active:scale-[0.97]"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TemplatesManagerModal({ onClose, onListCreated }) {
  const qc = useQueryClient();
  const [editorOpen, setEditorOpen]   = useState(false);
  const [editingTpl, setEditingTpl]   = useState(null); // full template (with items) or null for new
  const [deletingId, setDeletingId]   = useState(null);

  const { data: templates = [] } = useQuery({
    queryKey: ['list-templates'],
    queryFn: () => api.get('/list-templates').then(r => r.data),
  });

  const saveTemplate = useMutation({
    mutationFn: (data) =>
      editingTpl?.id
        ? api.put(`/list-templates/${editingTpl.id}`, data)
        : api.post('/list-templates', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['list-templates'] });
      setEditorOpen(false);
      setEditingTpl(null);
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: (id) => api.delete(`/list-templates/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['list-templates'] });
      setDeletingId(null);
    },
  });

  const useTemplate = useMutation({
    mutationFn: (id) => api.post(`/list-templates/${id}/create-list`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['lists'] });
      onListCreated?.(res.data.id);
    },
  });

  const openEdit = async (tpl) => {
    const full = await api.get(`/list-templates/${tpl.id}`).then(r => r.data);
    setEditingTpl(full);
    setEditorOpen(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-surface-container-lowest rounded-2xl p-6 w-[34rem] max-h-[85vh] flex flex-col shadow-heavy border border-outline-variant/20">
        <div className="flex items-center justify-between mb-5 flex-shrink-0">
          <h3 className="text-title-md text-on-surface font-semibold">List templates</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-full text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 overflow-y-auto pr-1">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="group rounded-xl border border-outline-variant/20 bg-surface-container-lowest p-3 flex flex-col gap-2"
              style={{ background: tpl.colour + '0d' }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
                  style={{ background: tpl.colour + '22' }}
                >
                  {tpl.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-body-md text-on-surface font-medium truncate">{tpl.name}</p>
                  <p className="text-label-xs text-on-surface-variant">{tpl.item_count} item{tpl.item_count === 1 ? '' : 's'}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 mt-auto">
                <button
                  onClick={() => useTemplate.mutate(tpl.id)}
                  disabled={useTemplate.isPending}
                  className="flex-1 h-8 rounded-full bg-primary text-on-primary text-label-sm font-bold disabled:opacity-40 hover:bg-primary/90 transition"
                >
                  Use
                </button>
                <button
                  onClick={() => openEdit(tpl)}
                  aria-label="Edit template"
                  className="p-1.5 rounded-full text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition"
                >
                  <span className="material-symbols-outlined text-[16px]">edit</span>
                </button>
                <button
                  onClick={() => setDeletingId(tpl.id)}
                  aria-label="Delete template"
                  className="p-1.5 rounded-full text-on-surface-variant hover:bg-error/10 hover:text-error transition"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                </button>
              </div>
            </div>
          ))}

          <button
            onClick={() => { setEditingTpl(null); setEditorOpen(true); }}
            className="rounded-xl border border-dashed border-outline-variant/50 p-3 flex flex-col items-center justify-center gap-1 text-on-surface-variant hover:border-primary hover:text-primary transition min-h-[5.5rem]"
          >
            <span className="material-symbols-outlined text-2xl">add</span>
            <span className="text-label-sm font-medium">New template</span>
          </button>
        </div>

        {templates.length === 0 && (
          <p className="text-body-sm text-on-surface-variant text-center mt-4">
            Create a template like “Travel Essentials” to quickly spin up new lists.
          </p>
        )}
      </div>

      {editorOpen && (
        <TemplateEditorModal
          template={editingTpl}
          onSave={(data) => saveTemplate.mutate(data)}
          onClose={() => { setEditorOpen(false); setEditingTpl(null); }}
          loading={saveTemplate.isPending}
        />
      )}

      {deletingId && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setDeletingId(null)}
        >
          <div className="bg-surface-container-lowest rounded-2xl p-6 w-80 shadow-heavy border border-outline-variant/20">
            <h3 className="text-headline-md text-on-surface font-semibold mb-2">Delete template?</h3>
            <p className="text-body-md text-on-surface-variant mb-6 leading-relaxed">
              This template will be removed. Lists already created from it are not affected.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteTemplate.mutate(deletingId)}
                disabled={deleteTemplate.isPending}
                className="flex-1 h-12 rounded-full bg-error text-on-error text-label-md font-bold hover:bg-error/90 transition disabled:opacity-40"
              >
                Delete
              </button>
              <button
                onClick={() => setDeletingId(null)}
                className="flex-1 h-12 rounded-full bg-surface-container text-on-surface-variant text-label-md font-medium hover:bg-surface-container-high transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── List Column (Board view) ──────────────────────────────────────────────────

function ListColumn({ list, onEdit, onDelete, isDragging = false }) {
  const qc = useQueryClient();
  const [newItemTitle, setNewItemTitle] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [editingId, setEditingId]   = useState(null);
  const addInputRef                 = useRef(null);

  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging: isSortableDragging,
  } = useSortable({ id: list.id });

  const { data: items = [] } = useQuery({
    queryKey: ['list-items', list.id],
    queryFn: () => api.get(`/lists/${list.id}/items`).then(r => r.data),
  });

  const createItem = useMutation({
    mutationFn: (data) => api.post(`/lists/${list.id}/items`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['list-items', list.id] }); setNewItemTitle(''); },
  });

  const toggleItem = useMutation({
    mutationFn: (itemId) => api.post(`/lists/items/${itemId}/complete`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['list-items', list.id] }),
  });

  const updateItem = useMutation({
    mutationFn: ({ id: itemId, ...data }) => api.put(`/lists/items/${itemId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['list-items', list.id] }),
  });

  const deleteItem = useMutation({
    mutationFn: (itemId) => api.delete(`/lists/items/${itemId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['list-items', list.id] }),
  });

  const reorderItems = useMutation({
    mutationFn: (itemIds) => api.post(`/lists/${list.id}/items/reorder`, { itemIds }),
    onError: () => qc.invalidateQueries({ queryKey: ['list-items', list.id] }),
  });

  const itemSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const activeItems    = items.filter(i => !i.is_completed);
  const completedItems = items.filter(i => i.is_completed);

  const handleItemDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const newActive = reorderItemsWithSubtree(activeItems, active.id, over.id);
    if (!newActive) return;
    const newAll = [...newActive, ...completedItems];
    qc.setQueryData(['list-items', list.id], newAll); // optimistic
    reorderItems.mutate(newAll.map(i => i.id));
  };

  const handleIndent = (itemId, delta) => {
    const it = items.find(i => i.id === itemId);
    if (!it) return;
    const current = it.indent_level || 0;
    const next = Math.max(0, Math.min(MAX_INDENT, current + delta));
    if (next !== current) updateItem.mutate({ id: itemId, indent_level: next });
  };

  // Enter on an item moves to the next one, or inserts a fresh blank item to edit if it's the last.
  const handleEnter = (itemId) => {
    const idx = activeItems.findIndex(i => i.id === itemId);
    const next = activeItems[idx + 1];
    if (next) { setEditingId(next.id); return; }
    const current = items.find(i => i.id === itemId);
    createItem.mutate(
      { title: '', indent_level: current?.indent_level || 0 },
      { onSuccess: (res) => setEditingId(res.data.id) },
    );
  };

  const handleAddItem = (e) => {
    e.preventDefault();
    if (!newItemTitle.trim()) return;
    createItem.mutate({ title: newItemTitle.trim() });
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.35 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex flex-col rounded-2xl border border-outline-variant/20 bg-surface-container-lowest overflow-hidden"
    >
      {/* Column header */}
      <div
        className="flex items-center gap-2.5 px-4 py-3 border-b border-outline-variant/20 flex-shrink-0"
        style={{ background: list.colour + '14' }}
      >
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="p-0.5 rounded text-on-surface-variant/40 hover:text-on-surface-variant transition cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"
          aria-label="Drag to reorder"
        >
          <span className="material-symbols-outlined text-[16px]">drag_indicator</span>
        </button>
        <span className="text-xl">{list.icon}</span>
        <span className="flex-1 font-semibold text-body-lg text-on-surface truncate">{list.name}</span>
        <SharedBadge visibility={list.visibility} />
        <span
          className="text-label-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
          style={{ background: list.colour + '22', color: list.colour }}
        >
          {activeItems.length}
        </span>
        <button
          onClick={() => onEdit(list)}
          className="p-1 rounded-full text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition flex-shrink-0"
        >
          <span className="material-symbols-outlined text-[15px]">edit</span>
        </button>
        <button
          onClick={() => onDelete(list.id)}
          className="p-1 rounded-full text-on-surface-variant hover:bg-error/10 hover:text-error transition flex-shrink-0"
        >
          <span className="material-symbols-outlined text-[15px]">delete</span>
        </button>
      </div>

      {/* Add item */}
      <form onSubmit={handleAddItem} className="px-3 pt-3 pb-2 flex-shrink-0">
        <div className="flex gap-2">
          <input
            ref={addInputRef}
            type="text"
            value={newItemTitle}
            onChange={(e) => setNewItemTitle(e.target.value)}
            placeholder="Add an item..."
            className="flex-1 min-w-0 rounded-full bg-surface-container px-3 py-2 text-body-sm text-on-surface border border-outline-variant/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <button
            type="submit"
            disabled={!newItemTitle.trim()}
            className="px-3 py-2 bg-primary text-on-primary rounded-full text-label-sm font-bold disabled:opacity-40 hover:bg-primary/90 transition flex-shrink-0"
          >
            Add
          </button>
        </div>
      </form>

      {/* Items */}
      <div className="px-3 pb-3 space-y-1.5">
        <DndContext sensors={itemSensors} collisionDetection={closestCenter} onDragEnd={handleItemDragEnd}>
          <SortableContext items={activeItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5">
              {activeItems.map((item) => (
                <SortableItemRow
                  key={item.id}
                  item={item}
                  editing={editingId === item.id}
                  onRequestEdit={setEditingId}
                  onStopEdit={() => setEditingId(null)}
                  onEnter={handleEnter}
                  onToggle={(itemId) => toggleItem.mutate(itemId)}
                  onDelete={(itemId) => deleteItem.mutate(itemId)}
                  onTitleChange={(itemId, title) => updateItem.mutate({ id: itemId, title })}
                  onIndent={handleIndent}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {completedItems.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setShowCompleted(p => !p)}
              className="flex items-center gap-1.5 text-label-xs text-on-surface-variant mb-1.5 hover:text-on-surface transition"
            >
              <span className="material-symbols-outlined text-[13px]">
                {showCompleted ? 'expand_less' : 'expand_more'}
              </span>
              Completed ({completedItems.length})
            </button>
            {showCompleted && (
              <div className="space-y-1.5">
                {completedItems.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    onToggle={(itemId) => toggleItem.mutate(itemId)}
                    onDelete={(itemId) => deleteItem.mutate(itemId)}
                    onTitleChange={(itemId, title) => updateItem.mutate({ id: itemId, title })}
                    onIndent={handleIndent}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {items.length === 0 && (
          <div className="text-center py-8 text-on-surface-variant">
            <span className="material-symbols-outlined text-3xl block mb-1">check_circle</span>
            <p className="text-body-sm">Empty list</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ListsView() {
  const { id }             = useParams();
  const navigate           = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc                 = useQueryClient();
  const { mode }            = useMode();
  const isPhone             = mode === 'phone';

  const [showCreateList, setShowCreateList] = useState(() => searchParams.get('create') === '1');
  const [showTemplates, setShowTemplates]   = useState(false);
  const [viewMode, setViewMode]             = useState('board');
  const [orderedLists, setOrderedLists]     = useState([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  // Phone-only variant: TouchSensor's delay (rather than PointerSensor's
  // distance-only constraint) stops a vertical scroll swipe from being
  // mistaken for a drag on touch — same pattern as WidgetBoard's sensors.
  // Kept separate from `sensors` above so tablet/desktop drag behaviour
  // (which also uses `sensors`) is untouched.
  const phoneItemSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setShowCreateList(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  const { data: lists = [] } = useQuery({
    queryKey: ['lists'],
    queryFn: () => api.get('/lists').then(r => r.data),
  });

  useEffect(() => { setOrderedLists(lists); }, [lists]);

  const [deletingListId, setDeletingListId] = useState(null);
  const [editingList, setEditingList]       = useState(null);
  const [newItemTitle, setNewItemTitle]     = useState('');
  const [showCompleted, setShowCompleted]   = useState(false);
  const [editingItemId, setEditingItemId]   = useState(null);
  const addItemRef                          = useRef(null);

  // ── Data queries ──────────────────────────────────────────────────────────

  // Phone doesn't auto-select the first list — /lists shows the picker and
  // only /lists/:id drills into items, matching the phone drill-in flow below.
  const selectedList = id ? lists.find(l => l.id === parseInt(id)) : (isPhone ? null : lists[0]);

  const { data: items = [] } = useQuery({
    queryKey: ['list-items', selectedList?.id],
    queryFn: () => api.get(`/lists/${selectedList.id}/items`).then(r => r.data),
    enabled: !!selectedList?.id,
  });

  // ── List mutations ────────────────────────────────────────────────────────

  const createList = useMutation({
    mutationFn: (data) => api.post('/lists', data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['lists'] });
      setShowCreateList(false);
      navigate(`/lists/${res.data.id}`);
    },
  });

  const deleteList = useMutation({
    mutationFn: (listId) => api.delete(`/lists/${listId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lists'] });
      setDeletingListId(null);
      if (selectedList?.id === deletingListId) navigate('/lists');
    },
  });

  const updateList = useMutation({
    mutationFn: ({ id: listId, ...data }) => api.put(`/lists/${listId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lists'] });
      setEditingList(null);
    },
  });

  // ── Item mutations ────────────────────────────────────────────────────────

  const createItem = useMutation({
    mutationFn: (data) => api.post(`/lists/${selectedList.id}/items`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['list-items', selectedList.id] });
      setNewItemTitle('');
    },
  });

  const toggleItem = useMutation({
    mutationFn: (itemId) => api.post(`/lists/items/${itemId}/complete`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['list-items', selectedList.id] }),
  });

  const updateItem = useMutation({
    mutationFn: ({ id: itemId, ...data }) => api.put(`/lists/items/${itemId}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['list-items', selectedList.id] }),
  });

  const deleteItem = useMutation({
    mutationFn: (itemId) => api.delete(`/lists/items/${itemId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['list-items', selectedList.id] }),
  });

  const reorderItems = useMutation({
    mutationFn: (itemIds) => api.post(`/lists/${selectedList.id}/items/reorder`, { itemIds }),
    onError: () => qc.invalidateQueries({ queryKey: ['list-items', selectedList.id] }),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleItemDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id || !selectedList) return;
    const active_ = items.filter(i => !i.is_completed);
    const completed_ = items.filter(i => i.is_completed);
    const newActive = reorderItemsWithSubtree(active_, active.id, over.id);
    if (!newActive) return;
    const newAll = [...newActive, ...completed_];
    qc.setQueryData(['list-items', selectedList.id], newAll); // optimistic
    reorderItems.mutate(newAll.map(i => i.id));
  };

  const handleIndent = (itemId, delta) => {
    const it = items.find(i => i.id === itemId);
    if (!it) return;
    const current = it.indent_level || 0;
    const next = Math.max(0, Math.min(MAX_INDENT, current + delta));
    if (next !== current) updateItem.mutate({ id: itemId, indent_level: next });
  };

  // Enter on an item moves to the next one, or creates a fresh item to edit if it's the last.
  const handleEnter = (itemId) => {
    const active = items.filter(i => !i.is_completed);
    const idx = active.findIndex(i => i.id === itemId);
    const next = active[idx + 1];
    if (next) { setEditingItemId(next.id); return; }
    const current = items.find(i => i.id === itemId);
    createItem.mutate(
      { title: '', indent_level: current?.indent_level || 0 },
      { onSuccess: (res) => setEditingItemId(res.data.id) },
    );
  };

  const handleAddItem = (e) => {
    e.preventDefault();
    if (!newItemTitle.trim() || !selectedList) return;
    createItem.mutate({ title: newItemTitle.trim() });
  };

  const activeItems    = items.filter(i => !i.is_completed);
  const completedItems = items.filter(i => i.is_completed);

  // ── Render ────────────────────────────────────────────────────────────────

  // Shared across the phone and desktop/tablet render paths below.
  const modals = (
    <>
      {/* ── Create list modal ── */}
      {showCreateList && (
        <CreateListForm
          onSubmit={(data) => createList.mutate(data)}
          onCancel={() => setShowCreateList(false)}
          loading={createList.isPending}
        />
      )}

      {/* ── Templates manager ── */}
      {showTemplates && (
        <TemplatesManagerModal
          onClose={() => setShowTemplates(false)}
          onListCreated={(listId) => {
            setShowTemplates(false);
            navigate(`/lists/${listId}`);
          }}
        />
      )}

      {/* ── Edit list modal ── */}
      {editingList && (
        <EditListModal
          list={editingList}
          onSave={(data) => updateList.mutate({ id: editingList.id, ...data })}
          onClose={() => setEditingList(null)}
          loading={updateList.isPending}
        />
      )}

      {/* ── Delete list confirmation ── */}
      {deletingListId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setDeletingListId(null)}
        >
          <div className="bg-surface-container-lowest rounded-2xl p-6 w-80 shadow-heavy border border-outline-variant/20">
            <h3 className="text-headline-md text-on-surface font-semibold mb-2">Delete list?</h3>
            <p className="text-body-md text-on-surface-variant mb-6 leading-relaxed">
              <span className="font-medium text-on-surface">
                {lists.find(l => l.id === deletingListId)?.icon}{' '}
                {lists.find(l => l.id === deletingListId)?.name}
              </span>
              {' '}and all its items will be permanently removed.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteList.mutate(deletingListId)}
                disabled={deleteList.isPending}
                className="flex-1 h-12 rounded-full bg-error text-on-error text-label-md font-bold hover:bg-error/90 transition-[background-color,transform] duration-150 active:scale-[0.97] disabled:opacity-40"
              >
                Delete
              </button>
              <button
                onClick={() => setDeletingListId(null)}
                className="flex-1 h-12 rounded-full bg-surface-container text-on-surface-variant text-label-md font-medium hover:bg-surface-container-high transition-[background-color,transform] duration-150 active:scale-[0.97]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // ── Phone: drill-in flow (list picker ↔ single-list items), full width,
  // no board view (its fixed columnCount doesn't fit a phone screen). ───────
  if (isPhone) {
    return (
      <div className="flex flex-col h-full">
        {!selectedList ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-headline-lg text-on-background">Lists</h1>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowTemplates(true)}
                  aria-label="Templates"
                  className="w-11 h-11 rounded-full bg-surface-container text-on-surface flex items-center justify-center hover:bg-surface-container-high transition"
                >
                  <span className="material-symbols-outlined text-[20px]">dashboard_customize</span>
                </button>
                <button
                  onClick={() => setShowCreateList(p => !p)}
                  aria-label="New list"
                  className="w-11 h-11 rounded-full bg-primary text-on-primary flex items-center justify-center hover:bg-primary/90 transition"
                >
                  <span className="material-symbols-outlined text-[20px]">add</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5">
              {lists.map((list) => (
                <div key={list.id} className="flex items-center gap-1">
                  <button
                    onClick={() => navigate(`/lists/${list.id}`)}
                    className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3.5 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-left active:bg-surface-container transition"
                  >
                    <span className="text-xl flex-shrink-0">{list.icon}</span>
                    <span className="flex-1 min-w-0 text-body-md text-on-surface font-medium truncate">{list.name}</span>
                    <SharedBadge visibility={list.visibility} />
                    <span className="material-symbols-outlined text-[20px] text-on-surface-variant/50 flex-shrink-0">chevron_right</span>
                  </button>
                  <button
                    onClick={() => setDeletingListId(list.id)}
                    aria-label={`Delete list ${list.name}`}
                    className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 text-on-surface-variant hover:bg-error/10 hover:text-error transition"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              ))}
              {lists.length === 0 && (
                <div className="text-center py-20 text-on-surface-variant">
                  <span className="material-symbols-outlined text-5xl block mb-3">list</span>
                  <p className="text-body-lg">No lists yet</p>
                  <p className="text-body-md mt-1">Create a list to get started</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Back navigation */}
            <button
              onClick={() => navigate('/lists')}
              className="-m-2.5 p-2.5 flex items-center gap-1 text-on-surface-variant hover:text-on-surface text-body-md transition mb-2"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              Lists
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
              <span className="text-2xl flex-shrink-0">{selectedList.icon}</span>
              <h1 className="text-headline-lg text-on-background flex-1 min-w-0 truncate">{selectedList.name}</h1>
              <button
                onClick={() => setEditingList(selectedList)}
                aria-label="Edit list"
                className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition"
              >
                <span className="material-symbols-outlined text-[20px]">edit</span>
              </button>
            </div>

            {/* Add item */}
            <form onSubmit={handleAddItem} className="mb-5">
              <div className="flex gap-3">
                <input
                  ref={addItemRef}
                  type="text"
                  value={newItemTitle}
                  onChange={(e) => setNewItemTitle(e.target.value)}
                  placeholder="Add an item..."
                  className="flex-1 min-w-0 rounded-full bg-surface-container px-5 py-3 text-body-md text-on-surface border border-outline-variant/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <button
                  type="submit"
                  disabled={!newItemTitle.trim()}
                  className="px-5 py-3 bg-primary text-on-primary rounded-full text-label-md font-bold disabled:opacity-40 hover:bg-primary/90 transition flex-shrink-0"
                >
                  Add
                </button>
              </div>
            </form>

            {/* Active items */}
            <DndContext sensors={phoneItemSensors} collisionDetection={closestCenter} onDragEnd={handleItemDragEnd}>
              <SortableContext items={activeItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5">
                  {activeItems.map((item) => (
                    <SortableItemRow
                      key={item.id}
                      item={item}
                      editing={editingItemId === item.id}
                      onRequestEdit={setEditingItemId}
                      onStopEdit={() => setEditingItemId(null)}
                      onEnter={handleEnter}
                      onToggle={(itemId) => toggleItem.mutate(itemId)}
                      onDelete={(itemId) => deleteItem.mutate(itemId)}
                      onTitleChange={(itemId, title) => updateItem.mutate({ id: itemId, title })}
                      onIndent={handleIndent}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {/* Completed section */}
            {completedItems.length > 0 && (
              <div className="mt-6">
                <button
                  onClick={() => setShowCompleted(p => !p)}
                  className="-m-2 p-2 flex items-center gap-2 text-label-sm text-on-surface-variant mb-2 hover:text-on-surface transition"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {showCompleted ? 'expand_less' : 'expand_more'}
                  </span>
                  Completed ({completedItems.length})
                </button>
                {showCompleted && (
                  <div className="space-y-1.5">
                    {completedItems.map((item) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        onToggle={(itemId) => toggleItem.mutate(itemId)}
                        onDelete={(itemId) => deleteItem.mutate(itemId)}
                        onTitleChange={(itemId, title) => updateItem.mutate({ id: itemId, title })}
                        onIndent={handleIndent}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {items.length === 0 && (
              <div className="text-center py-20 text-on-surface-variant">
                <span className="material-symbols-outlined text-5xl block mb-3">check_circle</span>
                <p className="text-body-lg">This list is empty</p>
                <p className="text-body-md mt-1">Add your first item above</p>
              </div>
            )}
          </div>
        )}

        {modals}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="max-w-7xl mx-auto w-full flex flex-col h-full">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-headline-lg text-on-background">Lists</h1>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex rounded-full bg-surface-container p-1 gap-0.5">
            <button
              onClick={() => setViewMode('list')}
              title="List view"
              className={`p-2 rounded-full transition ${viewMode === 'list' ? 'bg-surface-container-highest text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
            >
              <span className="material-symbols-outlined text-[18px]">view_sidebar</span>
            </button>
            <button
              onClick={() => setViewMode('board')}
              title="Board view"
              className={`p-2 rounded-full transition ${viewMode === 'board' ? 'bg-surface-container-highest text-on-surface shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
            >
              <span className="material-symbols-outlined text-[18px]">view_column</span>
            </button>
          </div>
          <button
            onClick={() => setShowTemplates(true)}
            className="flex items-center gap-2 bg-surface-container text-on-surface rounded-full px-5 py-2.5 text-label-md font-bold hover:bg-surface-container-high transition"
          >
            <span className="material-symbols-outlined text-[18px]">dashboard_customize</span>
            Templates
          </button>
          <button
            onClick={() => setShowCreateList(p => !p)}
            className="flex items-center gap-2 bg-primary text-on-primary rounded-full px-5 py-2.5 text-label-md font-bold hover:bg-primary/90 transition"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            New List
          </button>
        </div>
      </div>

      {/* ── Board view ── */}
      {viewMode === 'board' && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={({ active, over }) => {
            if (!over || active.id === over.id) return;
            setOrderedLists(prev => {
              const oldIdx = prev.findIndex(l => l.id === active.id);
              const newIdx = prev.findIndex(l => l.id === over.id);
              return arrayMove(prev, oldIdx, newIdx);
            });
          }}
        >
          <SortableContext items={orderedLists.map(l => l.id)} strategy={rectSortingStrategy}>
            <div className="flex-1 overflow-y-auto pb-2" style={{ columnCount: 3, columnGap: '1rem' }}>
              {orderedLists.map((list) => (
                <div key={list.id} className="break-inside-avoid mb-4">
                  <ListColumn
                    list={list}
                    onEdit={(l) => setEditingList(l)}
                    onDelete={(listId) => setDeletingListId(listId)}
                  />
                </div>
              ))}
              {orderedLists.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant">
                  <span className="material-symbols-outlined text-5xl block mb-3">view_column</span>
                  <p className="text-body-lg">No lists yet</p>
                  <p className="text-body-md mt-1">Create a list to get started</p>
                </div>
              )}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div className={`gap-grid-gutter flex-1 min-h-0 ${viewMode === 'list' ? 'flex' : 'hidden'}`}>
      {/* ── Sidebar ── */}
      <div className="w-56 flex-shrink-0 flex flex-col">
        <div className="mb-4">
          <h2 className="text-label-md tracking-wider text-on-surface-variant font-bold">My Lists</h2>
        </div>

        <div className="space-y-0.5 flex-1 overflow-y-auto">
          {lists.map((list) => (
            <div key={list.id} className="group relative">
              <button
                onClick={() => navigate(`/lists/${list.id}`)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-body-md transition text-left pr-9 ${
                  selectedList?.id === list.id
                    ? 'bg-primary/10 text-primary font-bold'
                    : 'text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                <span className="text-lg flex-shrink-0">{list.icon}</span>
                <span className="flex-1 truncate">{list.name}</span>
                <SharedBadge visibility={list.visibility} />
              </button>
              {/* Delete list button */}
              <button
                onClick={() => setDeletingListId(list.id)}
                aria-label={`Delete list ${list.name}`}
                className="absolute right-2 top-1/2 -translate-y-1/2 can-hover:opacity-0 can-hover:group-hover:opacity-100 focus-visible:opacity-100 p-1 rounded-full hover:bg-error/10 text-on-surface-variant hover:text-error transition"
              >
                <span className="material-symbols-outlined text-[14px]">delete</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Item area ── */}
      <div className="flex-1 min-w-0">
        {selectedList ? (
          <div>
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <span className="text-2xl">{selectedList.icon}</span>
              <h1 className="text-headline-lg text-on-background">{selectedList.name}</h1>
              <span className="text-label-sm text-on-surface-variant bg-surface-container px-2 py-1 rounded-full">
                {activeItems.length} remaining
              </span>
              <button
                onClick={() => setEditingList(selectedList)}
                aria-label="Edit list"
                className="ml-1 p-1.5 rounded-full text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition"
                title="Edit list"
              >
                <span className="material-symbols-outlined text-[18px]">edit</span>
              </button>
            </div>

            {/* Add item */}
            <form onSubmit={handleAddItem} className="mb-5">
              <div className="flex gap-3">
                <input
                  ref={addItemRef}
                  type="text"
                  value={newItemTitle}
                  onChange={(e) => setNewItemTitle(e.target.value)}
                  placeholder="Add an item..."
                  className="flex-1 rounded-full bg-surface-container px-5 py-3 text-body-md text-on-surface border border-outline-variant/40 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <button
                  type="submit"
                  disabled={!newItemTitle.trim()}
                  className="px-5 py-3 bg-primary text-on-primary rounded-full text-label-md font-bold disabled:opacity-40 hover:bg-primary/90 transition"
                >
                  Add
                </button>
              </div>
            </form>

            {/* Active items */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleItemDragEnd}>
              <SortableContext items={activeItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5">
                  {activeItems.map((item) => (
                    <SortableItemRow
                      key={item.id}
                      item={item}
                      editing={editingItemId === item.id}
                      onRequestEdit={setEditingItemId}
                      onStopEdit={() => setEditingItemId(null)}
                      onEnter={handleEnter}
                      onToggle={(itemId) => toggleItem.mutate(itemId)}
                      onDelete={(itemId) => deleteItem.mutate(itemId)}
                      onTitleChange={(itemId, title) => updateItem.mutate({ id: itemId, title })}
                      onIndent={handleIndent}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {/* Completed section */}
            {completedItems.length > 0 && (
              <div className="mt-6">
                <button
                  onClick={() => setShowCompleted(p => !p)}
                  className="flex items-center gap-2 text-label-sm text-on-surface-variant mb-2 hover:text-on-surface transition"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    {showCompleted ? 'expand_less' : 'expand_more'}
                  </span>
                  Completed ({completedItems.length})
                </button>
                {showCompleted && (
                  <div className="space-y-1.5">
                    {completedItems.map((item) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        onToggle={(itemId) => toggleItem.mutate(itemId)}
                        onDelete={(itemId) => deleteItem.mutate(itemId)}
                        onTitleChange={(itemId, title) => updateItem.mutate({ id: itemId, title })}
                        onIndent={handleIndent}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {items.length === 0 && (
              <div className="text-center py-20 text-on-surface-variant">
                <span className="material-symbols-outlined text-5xl block mb-3">check_circle</span>
                <p className="text-body-lg">This list is empty</p>
                <p className="text-body-md mt-1">Add your first item above</p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-20 text-on-surface-variant">
            <span className="material-symbols-outlined text-5xl block mb-3">list</span>
            <p className="text-body-lg">Select a list to get started</p>
          </div>
        )}
      </div>

      </div>{/* end flex row */}

      </div>{/* end width wrapper */}

      {modals}
    </div>
  );
}
