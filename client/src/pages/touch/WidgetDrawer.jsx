import React, { useEffect, useMemo, useState } from 'react';
import BottomSheet from '../../components/BottomSheet';
import { WIDGETS, widgetBoards } from '../../widgets';
import { useMode } from '../../hooks/useMode';
import { useAuthStore } from '../../store/authStore';

// A single widget tile in the gallery, shared between the grouped "All"
// view and a single-group filtered view.
function WidgetTile({ item, onAdd }) {
  return (
    <button
      onClick={() => onAdd(item.type)}
      className="flex items-start gap-3 p-3.5 rounded-2xl bg-surface-container hover:bg-surface-container-high active:scale-[0.98] transition text-left"
    >
      <span className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
        <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="text-body-md font-semibold text-on-surface truncate">{item.title}</span>
          <span className="text-[10px] font-bold text-on-surface-variant/70 border border-outline-variant/50 rounded px-1 py-px flex-shrink-0 tabular-nums">
            {item.defaultSize.w}×{item.defaultSize.h}
          </span>
        </span>
        {item.description && (
          <span className="block text-label-sm font-medium text-on-surface-variant/80 mt-0.5 leading-snug">
            {item.description}
          </span>
        )}
      </span>
    </button>
  );
}

// Widget catalog picker for the board. The "All" view groups tiles under
// their source-page headings so a long catalog stays easy to scan; picking
// a specific group chip drops back to one flat grid for that group alone.
// Presents as a bottom sheet on phone and a centred dialog (like TaskForm)
// on tablet.
// `boardType` ('home' | 'hub') hides widgets not eligible for that board —
// viewer-relative ones (My Tasks, Welcome, Focus Stats) never fit the shared
// Hub, where everyone must see the same content.
export default function WidgetDrawer({ open, onClose, onAdd, boardType = 'home' }) {
  const { mode } = useMode();
  const { user } = useAuthStore();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('All');

  const all = useMemo(
    () =>
      Object.entries(WIDGETS)
        .filter(([, meta]) => !(mode === 'phone' && meta.hideOnPhone))
        .filter(([type]) => widgetBoards(type).includes(boardType))
        .filter(([, meta]) => !meta.adminOnly || user?.role === 'admin')
        .map(([type, meta]) => ({ type, ...meta })),
    [mode, boardType, user?.role],
  );

  // On the Hub, "Shared" widgets are the whole point of the board, so their
  // chip and section lead — everywhere else groups keep their natural
  // (registry-declaration) order.
  const groups = useMemo(() => {
    const natural = [...new Set(all.map(w => w.group))];
    if (boardType !== 'hub' || !natural.includes('Shared')) return ['All', ...natural];
    return ['All', 'Shared', ...natural.filter(g => g !== 'Shared')];
  }, [all, boardType]);

  const q = query.trim().toLowerCase();
  const visible = all.filter(w =>
    (group === 'All' || w.group === group) &&
    (!q || w.title.toLowerCase().includes(q) || (w.description || '').toLowerCase().includes(q))
  );

  const isTablet = mode === 'tablet';

  // The dialog variant handles its own Escape key (BottomSheet already does).
  useEffect(() => {
    if (!open || !isTablet) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, isTablet, onClose]);

  const body = (
    <div className="px-4 pb-2 w-full max-w-3xl mx-auto">
      {/* Search */}
      <div className="relative mb-3">
        <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-on-surface-variant/60 pointer-events-none">
          search
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search widgets…"
          aria-label="Search widgets"
          className="w-full h-10 pl-10 pr-4 rounded-full bg-surface-container border-0 focus:ring-2 focus:ring-primary/40 text-body-md text-on-surface placeholder:text-on-surface-variant/50"
        />
      </div>

      {/* Group filter chips */}
      <div className="flex flex-wrap gap-2 pb-3">
        {groups.map(g => (
          <button
            key={g}
            onClick={() => setGroup(g)}
            className={`h-8 px-3.5 rounded-full text-label-md font-bold flex-shrink-0 transition ${
              g === group
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Gallery — grouped by source page in "All", flat within one group */}
      {group === 'All' ? (
        <div className="pb-2 space-y-4">
          {groups.filter(g => g !== 'All').map(g => {
            const items = visible.filter(w => w.group === g);
            if (items.length === 0) return null;
            return (
              <div key={g}>
                <p className="text-label-sm uppercase tracking-wider text-on-surface-variant/60 font-bold mb-2 px-0.5">
                  {g}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {items.map(item => <WidgetTile key={item.type} item={item} onAdd={onAdd} />)}
                </div>
              </div>
            );
          })}
          {visible.length === 0 && (
            <p className="text-body-md text-on-surface-variant text-center py-8">
              No widgets match “{query.trim()}”
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pb-2">
          {visible.map(item => <WidgetTile key={item.type} item={item} onAdd={onAdd} />)}
          {visible.length === 0 && (
            <p className="col-span-full text-body-md text-on-surface-variant text-center py-8">
              No widgets match “{query.trim()}”
            </p>
          )}
        </div>
      )}
    </div>
  );

  if (isTablet) {
    if (!open) return null;
    return (
      <div
        className="fixed inset-0 bg-inverse-surface/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6"
        role="dialog"
        aria-modal="true"
        onClick={onClose}
      >
        <div
          className="bg-surface rounded-3xl shadow-heavy w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 pt-4 pb-3 flex-shrink-0">
            <h2 className="text-headline-md text-on-surface">Add a Widget</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-9 h-9 rounded-full hover:bg-surface-container text-on-surface-variant flex items-center justify-center transition"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
          <div className="overflow-y-auto scrollbar-slim px-1 pb-4">{body}</div>
        </div>
      </div>
    );
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Add a Widget">
      {body}
    </BottomSheet>
  );
}
