import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../auth/AuthContext';
import { NAV_ITEMS } from '../modes/navItems';
import { useDeepWorkStore } from '../store/deepWorkStore';

// ── Header quick-jump search ─────────────────────────────────────────
// Searches active tasks, lists, projects and app pages. Ctrl/Cmd+K focuses.
// Shared by the desktop top bar and the tablet top bar.
export default function HeaderSearch({ onOpenTask }) {
  const navigate = useNavigate();
  const openDeepWork = useDeepWorkStore((s) => s.openSetup);
  const [query, setQuery]         = useState('');
  const [open, setOpen]           = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef  = useRef(null);
  const inputRef = useRef(null);

  const q       = query.trim().toLowerCase();
  const enabled = open && q.length >= 2;

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', { isCompleted: false, excludeSubTasks: true }],
    queryFn: () => api.get('/tasks', { params: { isCompleted: false, excludeSubTasks: true } }).then(r => r.data),
    enabled,
    staleTime: 30_000,
  });
  const { data: lists = [] } = useQuery({
    queryKey: ['lists'],
    queryFn: () => api.get('/lists').then(r => r.data),
    enabled,
    staleTime: 30_000,
  });
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then(r => r.data),
    enabled,
    staleTime: 30_000,
  });

  const groups = useMemo(() => {
    if (q.length < 2) return [];
    const match = (s) => s?.toLowerCase().includes(q);
    const out = [];
    const taskHits = tasks.filter(t => match(t.title)).slice(0, 5).map(t => ({
      key: `task-${t.id}`, icon: 'assignment', title: t.title,
      subtitle: t.project_name || null,
      action: () => onOpenTask(t),
      deepWork: t.status !== 'done' ? () => openDeepWork(t.id) : null,
    }));
    const listHits = lists.filter(l => match(l.name)).slice(0, 3).map(l => ({
      key: `list-${l.id}`, emoji: l.icon, title: l.name,
      action: () => navigate(`/lists/${l.id}`),
    }));
    const projHits = projects.filter(p => match(p.name)).slice(0, 3).map(p => ({
      key: `proj-${p.id}`, emoji: p.cover_icon, title: p.name,
      action: () => navigate('/projects'),
    }));
    const pageHits = NAV_ITEMS.filter(p => match(p.label)).slice(0, 3).map(p => ({
      key: `page-${p.to}`, icon: p.icon, title: p.label,
      action: () => navigate(p.to),
    }));
    if (taskHits.length) out.push({ label: 'Tasks',    items: taskHits });
    if (listHits.length) out.push({ label: 'Lists',    items: listHits });
    if (projHits.length) out.push({ label: 'Projects', items: projHits });
    if (pageHits.length) out.push({ label: 'Pages',    items: pageHits });
    return out;
  }, [q, tasks, lists, projects, navigate, onOpenTask, openDeepWork]);

  const flat = useMemo(() => groups.flatMap(g => g.items), [groups]);

  useEffect(() => setActiveIdx(0), [q]);

  // Global Ctrl/Cmd+K shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const select = (item) => {
    item.action();
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); return; }
    if (!flat.length) return;
    if (e.key === 'ArrowDown')      { e.preventDefault(); setActiveIdx(i => (i + 1) % flat.length); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => (i - 1 + flat.length) % flat.length); }
    else if (e.key === 'Enter')     { e.preventDefault(); select(flat[activeIdx]); }
  };

  let runningIdx = -1;

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="relative bg-surface-container rounded-full flex items-center px-4 h-12 focus-within:ring-2 focus-within:ring-primary/20 transition-[box-shadow]">
        <span className="material-symbols-outlined text-on-surface-variant/50 mr-2">search</span>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open && q.length >= 2}
          aria-label="Search tasks, lists, projects and pages"
          placeholder="Search…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="bg-transparent border-none focus:ring-0 p-0 text-body-md text-on-surface w-full placeholder-on-surface-variant/50"
        />
        {query ? (
          <button
            onClick={() => { setQuery(''); inputRef.current?.focus(); }}
            aria-label="Clear search"
            className="text-on-surface-variant/60 hover:text-on-surface transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        ) : (
          <kbd className="hidden lg:flex items-center gap-0.5 text-label-sm text-on-surface-variant/50 bg-surface-container-high rounded px-1.5 py-0.5 flex-shrink-0 select-none">
            Ctrl K
          </kbd>
        )}
      </div>

      {open && q.length >= 2 && (
        <div
          role="listbox"
          className="absolute top-full mt-2 left-0 w-96 max-w-[90vw] max-h-[28rem] overflow-y-auto bg-surface-container-lowest rounded-2xl shadow-heavy border border-outline-variant/20 py-2 z-50"
        >
          {groups.length === 0 ? (
            <p className="text-body-md text-on-surface-variant text-center py-6">
              No results for “{query.trim()}”
            </p>
          ) : (
            groups.map(group => (
              <div key={group.label}>
                <p className="text-label-sm uppercase tracking-widest text-on-surface-variant/60 font-bold px-4 pt-2 pb-1">
                  {group.label}
                </p>
                {group.items.map(item => {
                  runningIdx += 1;
                  const idx = runningIdx;
                  return (
                    <div
                      key={item.key}
                      role="option"
                      aria-selected={idx === activeIdx}
                      onMouseEnter={() => setActiveIdx(idx)}
                      className={`flex items-center transition-colors ${idx === activeIdx ? 'bg-primary/5' : ''}`}
                    >
                      <button
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); select(item); }}
                        className={`flex-1 min-w-0 flex items-center gap-3 pl-4 pr-2 py-2.5 text-left ${
                          idx === activeIdx ? 'text-primary' : 'text-on-surface'
                        }`}
                      >
                        {item.emoji
                          ? <span className="text-[18px] flex-shrink-0">{item.emoji}</span>
                          : <span className={`material-symbols-outlined text-[18px] flex-shrink-0 ${idx === activeIdx ? 'text-primary' : 'text-on-surface-variant/60'}`}>{item.icon}</span>
                        }
                        <span className="flex-1 min-w-0">
                          <span className="text-body-md block truncate">{item.title}</span>
                          {item.subtitle && (
                            <span className="text-label-sm text-on-surface-variant/70 block truncate">{item.subtitle}</span>
                          )}
                        </span>
                        {idx === activeIdx && (
                          <span className="material-symbols-outlined text-[14px] text-on-surface-variant/50 flex-shrink-0">keyboard_return</span>
                        )}
                      </button>
                      {item.deepWork && (
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            item.deepWork();
                            setOpen(false); setQuery(''); inputRef.current?.blur();
                          }}
                          title="Start Deep Work"
                          aria-label="Start Deep Work"
                          className="flex-shrink-0 w-9 h-9 mr-2 rounded-full flex items-center justify-center text-on-surface-variant/60 hover:bg-primary/10 hover:text-primary transition-colors"
                        >
                          <span className="material-symbols-outlined text-[16px]">center_focus_strong</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
