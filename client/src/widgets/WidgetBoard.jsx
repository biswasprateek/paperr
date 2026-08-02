import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext, rectSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMode } from '../hooks/useMode';
import { useUiStore } from '../store/uiStore';
import { getWidget, newWidgetId, SIZE_PRESETS } from './index';
import WidgetDrawer from '../pages/touch/WidgetDrawer';

// Title Case for display of page names — capitalises word starts but leaves
// the rest of each word alone so user-typed acronyms ("GTD") survive.
function titleCase(s) {
  return (s || '').replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

function SortableWidget({ item, editing, canEdit, onResize, onRemove, onUpdateProps }) {
  const meta = getWidget(item.type);
  const { mode } = useMode();
  const isPhone = mode === 'phone';
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, disabled: !editing });
  const jiggle = useUiStore((s) => !s.lowMotion && s.motionPrefs.jiggle !== false);

  if (!meta) return null;
  const Body = meta.Component;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Clamped to 1 on phone — the grid itself is single-column there, so an
    // unclamped span (e.g. w:2) would force an implicit 2nd column instead
    // of actually being full-width.
    gridColumn: `span ${isPhone ? 1 : item.w}`,
    gridRow: `span ${item.h}`,
    // Invisible placeholder while DragOverlay follows the cursor
    opacity: isDragging ? 0 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(editing ? { ...attributes, ...listeners } : {})}
      className={`relative min-h-0 ${editing && !isDragging && jiggle ? 'animate-jiggle' : ''} ${editing ? 'cursor-grab active:cursor-grabbing touch-none' : ''}`}
    >
      {editing && (
        <>
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={() => onRemove(item.id)}
            aria-label="Remove widget"
            className={`absolute z-30 rounded-full bg-error text-white shadow-md flex items-center justify-center active:scale-95 ${
              isPhone ? '-top-2.5 -left-2.5 w-9 h-9' : '-top-2 -left-2 w-7 h-7'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={() => onResize(item.id)}
            aria-label="Resize widget"
            className={`absolute z-30 rounded-full bg-primary text-on-primary shadow-md flex items-center justify-center active:scale-95 ${
              isPhone ? '-bottom-2.5 -right-2.5 w-9 h-9' : '-bottom-2 -right-2 w-7 h-7'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">open_in_full</span>
          </button>
        </>
      )}
      <div
        className={`h-full rounded-2xl transition-[transform,box-shadow] duration-150 motion-reduce:transition-none ${
          !editing ? 'can-hover:hover:-translate-y-0.5 can-hover:hover:shadow-heavy' : ''
        }`}
      >
        <Body
          editing={editing}
          w={item.w}
          h={item.h}
          {...(canEdit ? { onUpdateProps: (patch) => onUpdateProps(item.id, patch) } : {})}
          {...(item.props || {})}
        />
      </div>
    </div>
  );
}

// Rendered inside DragOverlay — follows the cursor exactly, no edit chrome.
function WidgetDragCard({ item }) {
  const meta = getWidget(item.type);
  if (!meta) return null;
  const Body = meta.Component;
  const height = item.h * 150 + (item.h - 1) * 12;
  return (
    <div style={{ height }} className="rounded-2xl shadow-2xl opacity-95 overflow-hidden touch-none">
      <Body editing={false} w={item.w} h={item.h} {...(item.props || {})} />
    </div>
  );
}

function BoardPage({ page, mode, editing, canEdit, onReorder, onResize, onRemove, onUpdateProps, onOpenDrawer }) {
  const [activeId, setActiveId] = useState(null);
  // Local items state drives real-time reorder during drag
  const [items, setItems] = useState(page.widgets);

  // Sync from parent whenever we're not mid-drag
  useEffect(() => {
    if (!activeId) setItems(page.widgets);
  }, [page.widgets, activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );

  const handleDragStart = ({ active }) => setActiveId(active.id);

  const handleDragOver = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    setItems(current => {
      const ids = current.map(w => w.id);
      const from = ids.indexOf(active.id);
      const to   = ids.indexOf(over.id);
      if (from === -1 || to === -1) return current;
      return arrayMove(current, from, to);
    });
  };

  const handleDragEnd = ({ over }) => {
    setActiveId(null);
    if (!over) { setItems(page.widgets); return; }
    // items has been live-reordered during dragOver; commit if the order
    // actually changed. (over.id often equals active.id here because the
    // dragged widget already sits under the cursor, so we can't gate on that.)
    const changed = items.some((w, i) => w.id !== page.widgets[i]?.id);
    if (changed) onReorder(items);
    else setItems(page.widgets);
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setItems(page.widgets);
  };

  // Widgets that can't run on this device are skipped for display — a board
  // shared across devices (the Hub) may legitimately contain them.
  const visible = items.filter(w => {
    const meta = getWidget(w.type);
    return meta && !(mode === 'phone' && meta.hideOnPhone);
  });

  if (visible.length === 0 && !editing) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-on-surface-variant">
        <span className="material-symbols-outlined text-4xl mb-2">widgets</span>
        <p className="text-body-md">This page is empty</p>
      </div>
    );
  }

  const activeItem = activeId ? items.find(w => w.id === activeId) : null;

  const grid = (
    // Fewer, wider columns: with the board capped at max-w-7xl, 4 columns
    // keeps each cell at the same ~290px width the 6-column full-bleed layout
    // used to give. Phone is single-column (each widget clamped to a 1-span
    // in SortableWidget below, since a w:2 widget would otherwise force an
    // implicit 2nd column). Dense flow backfills the holes that tall (h:2+)
    // widgets leave, so no dead cells the user can't reach.
    <div className={`grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 grid-flow-dense auto-rows-[150px] gap-3 ${editing ? 'pt-4 pb-6' : ''}`}>
      {visible.map(item => (
        <SortableWidget
          key={item.id}
          item={item}
          editing={editing}
          canEdit={canEdit}
          onResize={onResize}
          onRemove={onRemove}
          onUpdateProps={onUpdateProps}
        />
      ))}
      {editing && (
        <button
          onClick={onOpenDrawer}
          style={{ gridColumn: 'span 1', gridRow: 'span 1' }}
          className="rounded-2xl border-2 border-dashed border-outline-variant/50 text-on-surface-variant hover:border-primary hover:text-primary flex flex-col items-center justify-center gap-1 transition-colors"
        >
          <span className="material-symbols-outlined text-3xl">add</span>
          <span className="text-label-md">Add widget</span>
        </button>
      )}
    </div>
  );

  // Viewers get the plain grid — no drag sensors, no sortable wiring.
  if (!canEdit) return grid;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={items.map(w => w.id)} strategy={rectSortingStrategy}>
        {grid}
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {activeItem ? <WidgetDragCard item={activeItem} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

/**
 * Swipable, editable widget board — extracted from the touch Home board so
 * the shared Hub can reuse it. The caller owns persistence:
 *
 *   <WidgetBoard board={board} onSave={saveBoard}
 *                canEdit={isAdmin} boardType="hub" heading={<Greeting />} />
 *
 * - `canEdit={false}` renders a read-only layout: no Edit button, no drag
 *   sensors, no per-widget chrome. Widgets themselves stay interactive.
 * - `boardType` ('home' | 'hub') filters the Add-widget drawer via each
 *   widget's `boards` eligibility flag.
 * - `heading` replaces the page-title block in the controls row (the Home
 *   tablet greeting, the Hub's space greeting). Without it the current
 *   page's name renders, with inline rename while editing.
 * - Widgets with per-instance config receive `onUpdateProps(patch)` (edit-
 *   capable viewers only) to persist choices into the board JSON.
 */
export default function WidgetBoard({ board, onSave, canEdit = true, boardType = 'home', heading = null }) {
  const { mode } = useMode();
  const isPhone = mode === 'phone';
  // Named tabs on tablet + desktop (more room); compact dots on phone.
  const useNamedTabs = !isPhone;
  const [editing, setEditing] = useState(false);
  const [editSnapshot, setEditSnapshot] = useState(null);
  const [activePage, setActivePage] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // { idx, value } while a page name is being edited inline
  const [renaming, setRenaming] = useState(null);
  const scrollerRef = useRef(null);

  const pages = board.pages;

  const updatePage = useCallback((idx, updater) => {
    const next = { ...board, pages: board.pages.map((p, i) => (i === idx ? updater(p) : p)) };
    onSave(next);
  }, [board, onSave]);

  const reorderWidgets = (idx, widgets) => updatePage(idx, p => ({ ...p, widgets }));

  const startRename = (idx) => setRenaming({ idx, value: pages[idx]?.name || '' });

  const commitRename = () => {
    if (!renaming) return;
    const name = renaming.value.trim();
    if (name && name !== pages[renaming.idx]?.name) {
      updatePage(renaming.idx, p => ({ ...p, name }));
    }
    setRenaming(null);
  };

  const removeWidget = (idx, widgetId) =>
    updatePage(idx, p => ({ ...p, widgets: p.widgets.filter(w => w.id !== widgetId) }));

  // Widgets with per-instance config (e.g. the AI Agent picker) persist their
  // choices into the widget's stored props.
  const updateWidgetProps = (idx, widgetId, patch) =>
    updatePage(idx, p => ({
      ...p,
      widgets: p.widgets.map(w =>
        w.id === widgetId ? { ...w, props: { ...(w.props || {}), ...patch } } : w
      ),
    }));

  const resizeWidget = (idx, widgetId) =>
    updatePage(idx, p => ({
      ...p,
      widgets: p.widgets.map(w => {
        if (w.id !== widgetId) return w;
        const meta = getWidget(w.type);
        const cur = SIZE_PRESETS.findIndex(s => s.w === w.w && s.h === w.h);
        const nxt = SIZE_PRESETS[(cur + 1) % SIZE_PRESETS.length];
        return {
          ...w,
          w: Math.max(nxt.w, meta?.minSize.w || 1),
          h: Math.max(nxt.h, meta?.minSize.h || 1),
        };
      }),
    }));

  const addWidget = (type) => {
    const meta = getWidget(type);
    if (!meta) return;
    updatePage(activePage, p => ({
      ...p,
      widgets: [...p.widgets, { id: newWidgetId(), type, w: meta.defaultSize.w, h: meta.defaultSize.h, props: {} }],
    }));
    setDrawerOpen(false);
  };

  const addPage = () => {
    const next = {
      ...board,
      pages: [...board.pages, { id: newWidgetId(), name: `Page ${board.pages.length + 1}`, widgets: [] }],
    };
    onSave(next);
    setTimeout(() => goTo(next.pages.length - 1), 50);
  };

  const removePage = (idx) => {
    if (board.pages.length <= 1) return;
    setRenaming(null);
    const next = { ...board, pages: board.pages.filter((_, i) => i !== idx) };
    onSave(next);
    setActivePage(a => Math.max(0, Math.min(a, next.pages.length - 1)));
  };

  const enterEdit = () => {
    setEditSnapshot(board);
    setEditing(true);
  };

  const cancelEdit = () => {
    if (editSnapshot) onSave(editSnapshot);
    setEditing(false);
    setEditSnapshot(null);
    setRenaming(null);
  };

  const doneEdit = () => {
    setEditing(false);
    setEditSnapshot(null);
    setRenaming(null);
  };

  const goTo = (idx) => {
    const el = scrollerRef.current;
    if (el) el.scrollTo({ left: idx * el.clientWidth, behavior: 'smooth' });
    setActivePage(idx);
  };

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== activePage) setActivePage(idx);
  };

  const showControlsRow = !!heading || canEdit || pages.length > 1;
  const showPageNav = pages.length > 1 || (canEdit && editing);

  return (
    <div className="flex flex-col max-w-7xl mx-auto w-full">
      {/* Controls */}
      {showControlsRow && (
        <div className="flex items-center gap-2 mb-2">
          {heading ? (
            <div className="min-w-0">{heading}</div>
          ) : renaming && renaming.idx === activePage ? (
            <input
              autoFocus
              value={renaming.value}
              onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setRenaming(null);
              }}
              aria-label="Page name"
              className="text-headline-lg text-on-background bg-transparent border-0 border-b-2 border-primary/60 focus:ring-0 p-0 min-w-0 flex-1"
            />
          ) : (
            <h1
              className={`text-headline-lg text-on-background truncate ${editing ? 'cursor-text' : ''}`}
              onClick={editing ? () => startRename(activePage) : undefined}
            >
              {titleCase(pages[activePage]?.name) || 'Home'}
              {editing && (
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant ml-2 align-middle">edit</span>
              )}
            </h1>
          )}
          <div className="flex-1" />
          {canEdit && editing && pages.length > 1 && (
            <button
              onClick={() => removePage(activePage)}
              className={`${isPhone ? 'h-11' : 'h-10'} px-3 rounded-full border border-error/40 text-error text-label-md font-bold flex items-center gap-1.5 active:scale-95 transition`}
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
              Page
            </button>
          )}
          {canEdit && editing && (
            <button
              onClick={cancelEdit}
              className={`${isPhone ? 'h-11' : 'h-10'} px-4 rounded-full text-label-md font-bold border border-outline/40 text-on-surface-variant flex items-center gap-1.5 active:scale-95 transition`}
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
              Cancel
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => editing ? doneEdit() : enterEdit()}
              className={`${isPhone ? 'h-11' : 'h-10'} px-4 rounded-full text-label-md font-bold flex items-center gap-1.5 active:scale-95 transition ${
                editing ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">{editing ? 'check' : 'edit'}</span>
              {editing ? 'Done' : 'Edit'}
            </button>
          )}
        </div>
      )}

      {/* Page navigation — named tabs on tablet/desktop, dots on phone */}
      {showPageNav && (useNamedTabs ? (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {pages.map((p, i) =>
            renaming && renaming.idx === i ? (
              <input
                key={p.id}
                autoFocus
                value={renaming.value}
                onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setRenaming(null);
                }}
                aria-label="Page name"
                size={Math.max(renaming.value.length, 4)}
                className="h-8 px-4 rounded-full bg-primary text-on-primary text-label-md font-bold border-0 focus:ring-2 focus:ring-primary/40 w-auto"
              />
            ) : (
              <button
                key={p.id}
                onClick={() => {
                  if (i !== activePage) goTo(i);
                  else if (editing) startRename(i);
                }}
                aria-label={i === activePage ? `Rename ${p.name}` : `Go to ${p.name}`}
                className={`h-8 px-4 rounded-full text-label-md font-bold flex items-center gap-1.5 active:scale-95 transition ${
                  i === activePage
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                {titleCase(p.name)}
                {editing && i === activePage && (
                  <span className="material-symbols-outlined text-[14px]">edit</span>
                )}
              </button>
            )
          )}
          {canEdit && editing && (
            <button
              onClick={addPage}
              aria-label="Add page"
              className="w-8 h-8 rounded-full border border-dashed border-outline-variant text-on-surface-variant flex items-center justify-center active:scale-95 transition hover:border-primary hover:text-primary"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center gap-1 mb-3">
          {/* Dot stays visually small; the button's own padding gives it a
              real ~44px hit target instead of the bare 8px dot. */}
          {pages.map((p, i) => (
            <button
              key={p.id}
              onClick={() => goTo(i)}
              aria-label={`Go to ${p.name}`}
              className="p-3 flex items-center justify-center"
            >
              <span className={`block rounded-full transition-all ${
                i === activePage ? 'w-6 h-2 bg-primary' : 'w-2 h-2 bg-outline-variant/50'
              }`} />
            </button>
          ))}
          {canEdit && editing && (
            <button
              onClick={addPage}
              aria-label="Add page"
              className="w-11 h-11 ml-1 rounded-full bg-surface-container text-on-surface-variant flex items-center justify-center active:scale-95 transition"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
            </button>
          )}
        </div>
      ))}

      {/* Swipable pages — extra margin/padding gives room for absolute-positioned edit buttons */}
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="flex overflow-x-auto snap-x-page no-scrollbar -mx-3"
      >
        {pages.map((page, idx) => (
          <section key={page.id} className="snap-page flex-none w-full px-3">
            <BoardPage
              page={page}
              mode={mode}
              editing={editing}
              canEdit={canEdit}
              onReorder={(widgets) => reorderWidgets(idx, widgets)}
              onResize={(wid) => resizeWidget(idx, wid)}
              onRemove={(wid) => removeWidget(idx, wid)}
              onUpdateProps={(wid, patch) => updateWidgetProps(idx, wid, patch)}
              onOpenDrawer={() => setDrawerOpen(true)}
            />
          </section>
        ))}
      </div>

      {canEdit && (
        <WidgetDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} onAdd={addWidget} boardType={boardType} />
      )}
    </div>
  );
}
