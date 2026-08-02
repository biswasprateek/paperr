import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../auth/AuthContext';
import { useAuthStore } from '../store/authStore';
import { useDeepWorkStore } from '../store/deepWorkStore';
import { useCelebrationStore } from '../store/celebrationStore';
import { format, isPast, isToday, parseISO } from 'date-fns';

// Small hover-reveal trigger for launching Deep Work Mode on a task, shared
// by TaskRow / KanbanCard / DetailedRow. Hidden once a task is done — Deep
// Work Mode shouldn't reopen a completed task.
function DeepWorkTrigger({ task, size = 'md' }) {
  const openDeepWork = useDeepWorkStore(s => s.openSetup);
  if (task.status === 'done') return null;
  const dims = size === 'sm' ? 'h-6 w-6' : 'h-7 w-7';
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); openDeepWork(task.id); }}
      title="Start Deep Work"
      aria-label="Start Deep Work"
      className={`rounded-full flex items-center justify-center gap-1 text-on-surface-variant can-hover:opacity-0 can-hover:group-hover:opacity-100 focus-visible:opacity-100 hover:bg-primary/10 hover:text-primary transition ${dims}`}
    >
      <span className="material-symbols-outlined text-[16px]">center_focus_strong</span>
    </button>
  );
}

function formatTaskDate(dateStr) {
  if (!dateStr) return '';
  try {
    return format(parseISO(dateStr), dateStr.includes('T') ? 'MMM d, h:mm a' : 'MMM d');
  } catch { return dateStr; }
}
import TaskForm from '../components/TaskForm';
import { useMode } from '../hooks/useMode';

// ── Constants ──────────────────────────────────────────────────────────────────
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const PRIORITIES     = ['low', 'medium', 'high'];
const STATUSES       = ['todo', 'in_progress', 'blocked', 'done'];

const PRIORITY_COLOURS = {
  high:   'bg-error-container text-error',
  medium: 'bg-primary/10 text-primary',
  low:    'bg-surface-container text-on-surface-variant',
};

const STATUS_COLOURS = {
  todo:        'bg-surface-container text-on-surface-variant',
  in_progress: 'bg-primary/10 text-primary',
  blocked:     'bg-error-container/60 text-error',
  done:        'bg-success-container text-on-success-container',
};

const STATUS_LABELS = {
  todo:        'To Do',
  in_progress: 'In Progress',
  blocked:     'Blocked',
  done:        'Done',
};

const SORT_OPTIONS = [
  { value: 'priority', label: 'Priority' },
  { value: 'due_date', label: 'Due Date' },
  { value: 'status',   label: 'Status'   },
  { value: 'created',  label: 'Newest'   },
];

const FILTER_OPTIONS = [
  { value: 'active',    label: 'Active' },
  { value: 'overdue',   label: 'Overdue' },
  { value: 'all',       label: 'All' },
  { value: 'completed', label: 'Done' },
];

const GROUP_BY_OPTIONS = [
  { value: 'due_date', label: 'Due Date' },
  { value: 'priority', label: 'Priority' },
  { value: 'project',  label: 'Project'  },
];

const DETAIL_COLS = [
  { key: 'project',  label: 'Project'  },
  { key: 'priority', label: 'Priority' },
  { key: 'status',   label: 'Status'   },
  { key: 'tags',     label: 'Tags'     },
  { key: 'due_date', label: 'Due Date' },
  { key: 'progress', label: 'Progress' },
];

const VIEW_MODES = [
  { value: 'status',   icon: 'view_kanban',          label: 'Board' },
  { value: 'priority', icon: 'format_list_bulleted', label: 'List'  },
  { value: 'detailed', icon: 'table_rows',           label: 'Table' },
];

const KANBAN_COLS = [
  { key: 'todo',        label: 'To Do',       icon: 'radio_button_unchecked', accentClass: 'text-on-surface-variant',   bgClass: 'bg-surface-container'  },
  { key: 'in_progress', label: 'In Progress', icon: 'pending',                accentClass: 'text-primary',              bgClass: 'bg-primary/10'         },
  { key: 'blocked',     label: 'Blocked',     icon: 'block',                  accentClass: 'text-error',                bgClass: 'bg-error-container/60' },
  { key: 'done',        label: 'Done',        icon: 'check_circle',           accentClass: 'text-on-success-container', bgClass: 'bg-success-container'  },
];

// Group headers get semantic ink — urgency for due-date groups, level for priority.
const GROUP_HEADER_COLOURS = {
  'Overdue':       'text-error',
  'Today':         'text-warning',
  'Upcoming':      'text-on-surface-variant/60',
  'No Due Date':   'text-on-surface-variant/60',
  'Done':          'text-on-success-container',
  'High Priority': 'text-error',
  'Medium':        'text-primary',
  'Low Priority':  'text-on-surface-variant/60',
};

const KANBAN_COL_LIMIT = 6;

// ── Helpers ────────────────────────────────────────────────────────────────────
function dueDateColour(due) {
  if (!due) return 'text-on-surface-variant';
  const d = parseISO(due.split('T')[0]);
  if (!isToday(d) && isPast(d)) return 'text-error font-semibold';
  if (isToday(d))               return 'text-warning font-semibold';
  return 'text-on-surface-variant';
}

function isTaskOverdue(t) {
  if (!t.due_date || t.is_completed) return false;
  const d = parseISO(t.due_date.split('T')[0]);
  return !isToday(d) && isPast(d);
}

function isTaskDueToday(t) {
  if (!t.due_date || t.is_completed) return false;
  return isToday(parseISO(t.due_date.split('T')[0]));
}

// Shared "all tasks for this assignee" query — used by the header subtitle and
// the stats band; react-query dedupes on the key so it fetches once.
function useAllTasksStats(userId, assigneeFilter) {
  const statsBase = useMemo(() => {
    const base = { excludeSubTasks: true };
    if (assigneeFilter === 'me')                                      return { ...base, assignedTo: userId };
    if (assigneeFilter === 'all' || assigneeFilter === 'unassigned') return base;
    return { ...base, assignedTo: Number(assigneeFilter) };
  }, [assigneeFilter, userId]);

  const { data: raw = [] } = useQuery({
    queryKey: ['tasks', 'allStats', userId, assigneeFilter],
    queryFn: () => api.get('/tasks', { params: statsBase }).then(r => r.data),
    enabled: !!userId,
  });

  return useMemo(() =>
    assigneeFilter === 'unassigned' ? raw.filter(t => !t.assigned_to) : raw,
    [raw, assigneeFilter],
  );
}

// ── CompletionRing ─────────────────────────────────────────────────────────────
function CompletionRing({ rate, size = 52, sw = 6 }) {
  const r    = (size - sw * 2) / 2;
  const circ = 2 * Math.PI * r;
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 180);
    return () => clearTimeout(t);
  }, []);

  const offset = animated ? circ * (1 - rate / 100) : circ;

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" className="stroke-surface-container-high" strokeWidth={sw}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" className="stroke-primary" strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 750ms cubic-bezier(0.23, 1, 0.32, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-label-sm text-on-surface font-bold leading-none tracking-normal">{rate}%</span>
      </div>
    </div>
  );
}

// ── MiniAvatar ─────────────────────────────────────────────────────────────────
function MiniAvatar({ user, size = 20 }) {
  if (!user) return null;
  const label    = user.nickname || user.display_name || '?';
  const initials = label.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url} alt={label}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center text-white flex-shrink-0 font-bold"
      style={{ width: size, height: size, backgroundColor: user.avatar_colour || '#a63418', fontSize: size * 0.4 }}
    >
      {initials}
    </div>
  );
}

// ── AssigneeFilter ─────────────────────────────────────────────────────────────
function AssigneeFilter({ value, onChange, currentUser, users, isAdmin }) {
  const [open, setOpen]   = useState(false);
  const [pos,  setPos]    = useState({ top: 0, left: 0 });
  const triggerRef        = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleToggle = () => {
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen(v => !v);
  };

  const otherUsers = users.filter(u => u.id !== currentUser?.id);

  const triggerInfo = useMemo(() => {
    if (value === 'me')         return { avatar: currentUser, icon: null,         text: 'Me'          };
    if (value === 'all')        return { avatar: null,        icon: 'group',       text: 'Everyone'    };
    if (value === 'unassigned') return { avatar: null,        icon: 'person_off',  text: 'Unassigned'  };
    const u = users.find(u => String(u.id) === value);
    return u ? { avatar: u, icon: null, text: u.display_name } : { avatar: null, icon: 'person', text: 'Assignee' };
  }, [value, currentUser, users]);

  const isActive = value !== 'me';

  const DropItem = ({ val, avatarUser, iconName, label }) => (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onChange(val); setOpen(false); }}
      className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-body-md font-light transition-colors ${
        value === val ? 'text-primary bg-primary/5 font-medium' : 'text-on-surface hover:bg-surface-container'
      }`}
    >
      {avatarUser
        ? <MiniAvatar user={avatarUser} size={20} />
        : <span className="material-symbols-outlined text-[16px] text-on-surface-variant/70">{iconName}</span>
      }
      <span className="flex-1 text-left">{label}</span>
      {value === val && (
        <span className="material-symbols-outlined text-primary text-[15px]">check</span>
      )}
    </button>
  );

  return (
    <div ref={triggerRef} className="flex-shrink-0">
      <button
        type="button"
        onClick={handleToggle}
        className={`h-9 px-3 rounded-full flex items-center gap-2 text-label-md transition active:scale-[0.97] ${
          isActive
            ? 'bg-primary text-on-primary'
            : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
        }`}
      >
        {triggerInfo.avatar
          ? <MiniAvatar user={triggerInfo.avatar} size={18} />
          : <span className={`material-symbols-outlined text-[16px] ${isActive ? 'text-on-primary' : 'text-on-surface-variant'}`}>{triggerInfo.icon}</span>
        }
        <span>{triggerInfo.text}</span>
        <span className={`material-symbols-outlined text-[14px] transition-transform duration-150 ${open ? 'rotate-180' : ''} ${isActive ? 'text-on-primary/70' : 'text-on-surface-variant/50'}`}>
          expand_more
        </span>
      </button>

      {open && createPortal(
        <div
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, minWidth: 200 }}
          className="bg-surface-container-lowest rounded-2xl shadow-heavy border border-outline-variant/20 overflow-hidden"
        >
          <DropItem val="me" avatarUser={currentUser} label="Me" />
          <div className="mx-3 my-1 h-px bg-outline-variant/20" />
          <DropItem val="all"        iconName="group"      label="Everyone"   />
          <DropItem val="unassigned" iconName="person_off" label="Unassigned" />
          {isAdmin && otherUsers.length > 0 && (
            <>
              <div className="mx-3 my-1 h-px bg-outline-variant/20" />
              {otherUsers.map(u => (
                <DropItem key={u.id} val={String(u.id)} avatarUser={u} label={u.display_name} />
              ))}
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ── FilterSegments ────────────────────────────────────────────────────────────
function FilterSegments({ value, onChange, overdueCount }) {
  return (
    <div className="flex items-center bg-surface-container rounded-full p-1 gap-0.5 flex-shrink-0">
      {FILTER_OPTIONS.map(opt => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`h-7 px-3 rounded-full flex items-center gap-1.5 text-label-md transition active:scale-[0.97] ${
              active
                ? 'bg-surface-container-lowest text-on-surface font-bold shadow-soft'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {opt.label}
            {opt.value === 'overdue' && overdueCount > 0 && (
              <span className="text-label-sm bg-error/10 text-error px-1.5 py-0.5 rounded-full font-bold tabular-nums">
                {overdueCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── SortDropdown ──────────────────────────────────────────────────────────────
function SortDropdown({ value, onChange, viewMode }) {
  const [open, setOpen] = useState(false);
  const [pos,  setPos]  = useState({ top: 0, left: 0 });
  const triggerRef      = useRef(null);

  const options = useMemo(() =>
    SORT_OPTIONS.filter(o => !(viewMode === 'status' && o.value === 'status')),
    [viewMode],
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleToggle = () => {
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.right - 160 });
    }
    setOpen(v => !v);
  };

  const isNonDefault = value !== 'priority';

  return (
    <div ref={triggerRef} className="flex-shrink-0">
      <button
        type="button"
        onClick={handleToggle}
        title="Sort tasks"
        className={`relative w-9 h-9 rounded-full flex items-center justify-center transition active:scale-95 ${
          open
            ? 'bg-surface-container-high text-on-surface'
            : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
        }`}
      >
        <span className="material-symbols-outlined text-[18px]">sort</span>
        {isNonDefault && (
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-primary" />
        )}
      </button>

      {open && createPortal(
        <div
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, minWidth: 160 }}
          className="bg-surface-container-lowest rounded-2xl shadow-heavy border border-outline-variant/20 overflow-hidden"
        >
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(opt.value); setOpen(false); }}
              className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-body-md font-light transition-colors ${
                value === opt.value ? 'text-primary bg-primary/5 font-medium' : 'text-on-surface hover:bg-surface-container'
              }`}
            >
              <span className="flex-1 text-left">{opt.label}</span>
              {value === opt.value && (
                <span className="material-symbols-outlined text-primary text-[15px]">check</span>
              )}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ── Toolbar dropdowns (group-by / columns) ─────────────────────────────────────
function CtxDropdown({ label, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const [pos,  setPos]  = useState({ top: 0, left: 0 });
  const ref             = useRef(null);
  const current         = options.find(o => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const toggle = () => {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen(v => !v);
  };

  return (
    <div ref={ref} className="flex-shrink-0">
      <button
        type="button"
        onClick={toggle}
        className="h-9 px-3 rounded-full flex items-center gap-1.5 text-label-md bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition active:scale-[0.97]"
      >
        <span className="opacity-60">{label}:</span>
        <span className="text-on-surface font-medium">{current.label}</span>
        <span className={`material-symbols-outlined text-[13px] opacity-50 transition-transform ${open ? 'rotate-180' : ''}`}>expand_more</span>
      </button>
      {open && createPortal(
        <div
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, minWidth: 148 }}
          className="bg-surface-container-lowest rounded-2xl shadow-heavy border border-outline-variant/20 overflow-hidden"
        >
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(opt.value); setOpen(false); }}
              className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-body-sm transition-colors ${
                value === opt.value ? 'text-primary bg-primary/5 font-medium' : 'text-on-surface hover:bg-surface-container'
              }`}
            >
              {opt.label}
              {value === opt.value && <span className="material-symbols-outlined text-primary text-[14px]">check</span>}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

function ColsDropdown({ hiddenCols, onToggle }) {
  const [open, setOpen] = useState(false);
  const [pos,  setPos]  = useState({ top: 0, left: 0 });
  const ref             = useRef(null);
  const visCount        = DETAIL_COLS.length - hiddenCols.size;

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const toggle = () => {
    if (!open && ref.current) {
      const r = ref.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen(v => !v);
  };

  return (
    <div ref={ref} className="flex-shrink-0">
      <button
        type="button"
        onClick={toggle}
        className={`h-9 px-3 rounded-full flex items-center gap-1.5 text-label-md transition active:scale-[0.97] ${
          hiddenCols.size > 0
            ? 'bg-primary/10 text-primary hover:bg-primary/15'
            : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
        }`}
      >
        <span className="material-symbols-outlined text-[14px]">view_column</span>
        <span>Columns {visCount}/{DETAIL_COLS.length}</span>
        <span className={`material-symbols-outlined text-[13px] opacity-50 transition-transform ${open ? 'rotate-180' : ''}`}>expand_more</span>
      </button>
      {open && createPortal(
        <div
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, minWidth: 164 }}
          className="bg-surface-container-lowest rounded-2xl shadow-heavy border border-outline-variant/20 overflow-hidden"
        >
          {DETAIL_COLS.map(col => {
            const visible = !hiddenCols.has(col.key);
            return (
              <button
                key={col.key}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onToggle(col.key); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-body-sm text-on-surface hover:bg-surface-container transition"
              >
                <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition ${
                  visible ? 'bg-primary border-primary text-on-primary' : 'border-outline'
                }`}>
                  {visible && <span className="material-symbols-outlined text-[10px]">check</span>}
                </span>
                {col.label}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ── StatsBand ──────────────────────────────────────────────────────────────────
// One horizontal band replaces the old right-hand stats rail: ring, done/total,
// stacked status bar with legend, alert chips, and a 7-day completion sparkline.
function StatsBand({ userId, assigneeFilter }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  const allTasks = useAllTasksStats(userId, assigneeFilter);

  const sevenDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().split('T')[0];
  }, []);

  const statsBase = useMemo(() => {
    const base = { excludeSubTasks: true };
    if (assigneeFilter === 'me')                                      return { ...base, assignedTo: userId };
    if (assigneeFilter === 'all' || assigneeFilter === 'unassigned') return base;
    return { ...base, assignedTo: Number(assigneeFilter) };
  }, [assigneeFilter, userId]);

  const { data: rawRecentCompleted = [] } = useQuery({
    queryKey: ['tasks', 'weeklyStats', userId, assigneeFilter, sevenDaysAgo],
    queryFn: () =>
      api.get('/tasks', {
        params: { ...statsBase, isCompleted: true, completedAtFrom: sevenDaysAgo },
      }).then(r => r.data),
    enabled: !!userId,
  });

  const recentCompleted = useMemo(() =>
    assigneeFilter === 'unassigned' ? rawRecentCompleted.filter(t => !t.assigned_to) : rawRecentCompleted,
    [rawRecentCompleted, assigneeFilter],
  );

  const total      = allTasks.length;
  const done       = allTasks.filter(t => t.is_completed).length;
  const rate       = total > 0 ? Math.round((done / total) * 100) : 0;
  const overdue    = allTasks.filter(isTaskOverdue).length;
  const dueToday   = allTasks.filter(isTaskDueToday).length;
  const inProgress = allTasks.filter(t => t.status === 'in_progress' && !t.is_completed).length;
  const blocked    = allTasks.filter(t => t.status === 'blocked'     && !t.is_completed).length;
  const todo       = allTasks.filter(t => t.status === 'todo'        && !t.is_completed).length;

  const weeklyData = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      days.push({
        day: format(d, 'EEE'),
        completed: recentCompleted.filter(
          t => t.completed_at && t.completed_at.slice(0, 10) === dateStr,
        ).length,
      });
    }
    return days;
  }, [recentCompleted]);

  const weekTotal = weeklyData.reduce((s, d) => s + d.completed, 0);
  const weekMax   = Math.max(1, ...weeklyData.map(d => d.completed));

  if (total === 0) return null;

  const legendItems = [
    { label: 'done',        value: done,       dot: 'bg-success' },
    { label: 'in progress', value: inProgress, dot: 'bg-primary' },
    { label: 'blocked',     value: blocked,    dot: 'bg-error' },
    { label: 'to do',       value: todo,       dot: 'bg-surface-container-high' },
  ];

  return (
    <div
      className="flex items-center gap-5 flex-wrap bg-surface-container-lowest rounded-xl border border-outline-variant/20 shadow-soft px-5 py-3.5 mt-1"
      style={{
        opacity:    mounted ? 1 : 0,
        transform:  mounted ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity 350ms ease-out, transform 350ms cubic-bezier(0.23, 1, 0.32, 1)',
      }}
    >
      {/* Ring + done/total */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <CompletionRing rate={rate} />
        <div className="leading-tight">
          <div className="flex items-baseline gap-1">
            <span className="text-headline-md font-bold text-on-surface tabular-nums leading-none">{done}</span>
            <span className="text-label-md text-on-surface-variant">/ {total}</span>
          </div>
          <div className="text-label-sm text-on-surface-variant/70 mt-0.5 tracking-normal">tasks done</div>
        </div>
      </div>

      <div className="w-px self-stretch bg-outline-variant/30 hidden sm:block" />

      {/* Stacked status bar + legend */}
      <div className="flex-1 min-w-[180px]">
        <div className="flex h-[7px] rounded-full bg-surface-container overflow-hidden">
          <div className="h-full bg-success"
            style={{ width: mounted ? `${(done / total) * 100}%` : '0%', transition: 'width 800ms cubic-bezier(0.23,1,0.32,1) 80ms' }} />
          <div className="h-full bg-primary"
            style={{ width: mounted ? `${(inProgress / total) * 100}%` : '0%', transition: 'width 800ms cubic-bezier(0.23,1,0.32,1) 160ms' }} />
          <div className="h-full bg-error"
            style={{ width: mounted ? `${(blocked / total) * 100}%` : '0%', transition: 'width 800ms cubic-bezier(0.23,1,0.32,1) 240ms' }} />
        </div>
        <div className="flex items-center gap-3.5 mt-2 flex-wrap">
          {legendItems.map(item => (
            <span key={item.label} className="flex items-center gap-1.5 text-label-sm text-on-surface-variant/70 tracking-normal">
              <span className={`w-[7px] h-[7px] rounded-full flex-shrink-0 ${item.dot}`} />
              <b className="text-on-surface tabular-nums">{item.value}</b> {item.label}
            </span>
          ))}
        </div>
      </div>

      {/* Alert chips */}
      {(overdue > 0 || dueToday > 0) && (
        <>
          <div className="w-px self-stretch bg-outline-variant/30 hidden lg:block" />
          <div className="flex items-center gap-2 flex-shrink-0">
            {overdue > 0 && (
              <span className="inline-flex items-center gap-1 text-label-sm text-error bg-error-container/70 px-2 py-1 rounded-full font-bold">
                <span className="material-symbols-outlined text-[11px]">warning</span>
                {overdue} overdue
              </span>
            )}
            {dueToday > 0 && (
              <span className="inline-flex items-center gap-1 text-label-sm text-warning bg-warning-container/70 px-2 py-1 rounded-full font-bold">
                <span className="material-symbols-outlined text-[11px]">today</span>
                {dueToday} due today
              </span>
            )}
          </div>
        </>
      )}

      {/* 7-day sparkline */}
      <div className="w-px self-stretch bg-outline-variant/30 hidden xl:block" />
      <div className="hidden xl:flex items-center gap-3 flex-shrink-0" title="Tasks completed, last 7 days">
        <div className="flex items-end gap-[3px] h-[34px]">
          {weeklyData.map((d, i) => (
            <div
              key={i}
              className={`w-[9px] rounded-t-[3px] ${i === weeklyData.length - 1 ? 'bg-primary' : 'bg-primary/25'}`}
              style={{
                height: mounted ? `${Math.max(8, (d.completed / weekMax) * 100)}%` : '8%',
                transition: `height 500ms cubic-bezier(0.23,1,0.32,1) ${120 + i * 40}ms`,
              }}
              title={`${d.day}: ${d.completed} done`}
            />
          ))}
        </div>
        <div className="leading-tight">
          <div className="text-body-md font-bold text-on-surface tabular-nums leading-none">{weekTotal}</div>
          <div className="text-label-sm text-on-surface-variant/70 tracking-normal">done this week</div>
        </div>
      </div>
    </div>
  );
}

// ── QuickAdd ───────────────────────────────────────────────────────────────────
function QuickAdd({ userId }) {
  const [value, setValue] = useState('');
  const inputRef = useRef(null);
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: (d) => api.post('/tasks', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      setValue('');
      inputRef.current?.focus();
    },
  });

  // "N" focuses quick-add from anywhere on the page (unless already typing).
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== 'n' && e.key !== 'N') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const submit = () => {
    const title = value.trim();
    if (!title || create.isPending) return;
    create.mutate({ title, priority: 'medium', status: 'todo', assigned_to: userId ?? null });
  };

  return (
    <div className="flex items-center gap-3 border-[1.5px] border-dashed border-outline-variant/60 rounded-xl px-4 py-2 mb-4 focus-within:border-primary/60 transition-colors">
      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
        <span className="material-symbols-outlined text-[13px]">add</span>
      </span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        placeholder="Add a task… press Enter to save"
        disabled={create.isPending}
        className="flex-1 bg-transparent border-none focus:ring-0 p-0 h-7 text-body-md text-on-surface placeholder-on-surface-variant/50"
      />
      <kbd className="hidden sm:block text-label-sm font-bold text-on-surface-variant/60 border border-outline-variant/60 rounded px-1.5 py-0.5 tracking-normal">N</kbd>
    </div>
  );
}

// ── SubTaskList ────────────────────────────────────────────────────────────────
function SubTaskList({ taskId }) {
  const qc = useQueryClient();

  const { data: subTasks = [], isLoading } = useQuery({
    queryKey: ['tasks', { parentTaskId: taskId }],
    queryFn: () =>
      api.get('/tasks', { params: { parentTaskId: taskId } }).then(r => r.data),
  });

  const complete = useMutation({
    mutationFn: (id) => api.post(`/tasks/${id}/complete`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); useCelebrationStore.getState().fire(); },
  });
  const uncomplete = useMutation({
    mutationFn: (id) => api.post(`/tasks/${id}/uncomplete`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-2">
        <span className="material-symbols-outlined animate-spin text-on-surface-variant/40 text-[16px]">
          progress_activity
        </span>
      </div>
    );
  }

  if (subTasks.length === 0) return null;

  return (
    <div className="space-y-0.5">
      {subTasks.map(st => (
        <div
          key={st.id}
          className="flex items-center gap-2.5 py-1 px-1 rounded-lg hover:bg-surface-container/50 transition"
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              st.is_completed ? uncomplete.mutate(st.id) : complete.mutate(st.id);
            }}
            aria-label={st.is_completed ? 'Mark sub-task incomplete' : 'Mark sub-task complete'}
            className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-primary/70 transition ${
              st.is_completed
                ? 'bg-primary border-primary text-on-primary'
                : 'border-outline hover:border-primary'
            }`}
          >
            {!!st.is_completed && (
              <span className="material-symbols-outlined text-[10px]">check</span>
            )}
          </button>
          <span
            className={`text-label-md flex-1 ${
              st.is_completed ? 'line-through text-on-surface-variant' : 'text-on-surface'
            }`}
          >
            {st.title}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── TaskRow ────────────────────────────────────────────────────────────────────
// Grid-aligned row: stripe · check · title · project · due · status · priority ·
// actions. Metadata scans as columns; density ~2× the old cards.
function TaskRow({
  task,
  deletingId,
  touch,
  showUnassigned,
  showProject,
  isExpanded,
  onEdit,
  onToggleExpand,
  onToggleComplete,
  onCycleStatus,
  onCyclePriority,
  onDeleteStart,
  onDeleteConfirm,
  onDeleteCancel,
  isDeleting,
  selectionMode,
  isSelected,
  onToggleSelect,
}) {
  const confirming  = deletingId === task.id;
  const hasSubTasks = task.subtask_count > 0;
  const isOverdue   = isTaskOverdue(task);

  const handleActivate = () => selectionMode ? onToggleSelect(task.id) : onEdit(task);

  // ── Swipe-to-complete (touch only) ───────────────────────────────────────────
  const [dragX, setDragX]   = useState(0);
  const swipe = useRef({ startX: 0, startY: 0, active: false });
  const SWIPE_THRESHOLD = 96;

  const onTouchStart = (e) => {
    if (!touch || selectionMode) return;
    const t = e.touches[0];
    swipe.current = { startX: t.clientX, startY: t.clientY, active: true };
  };
  const onTouchMove = (e) => {
    if (!swipe.current.active) return;
    const t = e.touches[0];
    const dx = t.clientX - swipe.current.startX;
    const dy = t.clientY - swipe.current.startY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      setDragX(Math.max(-140, Math.min(140, dx)));
    }
  };
  const onTouchEnd = () => {
    if (!swipe.current.active) return;
    swipe.current.active = false;
    if (Math.abs(dragX) >= SWIPE_THRESHOLD) onToggleComplete(task);
    setDragX(0);
  };

  const swiping = dragX !== 0;

  return (
    <div className="relative">
      {touch && swiping && (
        <div className={`absolute inset-0 flex items-center px-5 bg-success-container ${dragX > 0 ? 'justify-start' : 'justify-end'}`}>
          <span className="material-symbols-outlined text-on-success-container">
            {task.is_completed ? 'undo' : 'check_circle'}
          </span>
        </div>
      )}
      <div
        role="button"
        tabIndex={0}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={touch ? { transform: `translateX(${dragX}px)`, transition: swipe.current.active ? 'none' : 'transform 200ms ease-out' } : undefined}
        className={`group bg-surface-container-lowest cursor-pointer transition outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/70 ${
          task.is_completed
            ? 'opacity-60'
            : isSelected
              ? 'bg-primary/5'
              : 'hover:bg-surface-container/40'
        }`}
        onClick={handleActivate}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleActivate(); }
        }}
      >
        <div className={`grid items-center grid-cols-[4px_40px_minmax(0,1fr)_72px] ${
          showProject
            ? 'sm:grid-cols-[4px_40px_minmax(0,1fr)_130px_104px_108px_88px_76px]'
            : 'sm:grid-cols-[4px_40px_minmax(0,1fr)_104px_108px_88px_76px]'
        } ${touch ? 'min-h-[54px]' : 'min-h-[46px]'}`}>

          {/* Priority stripe */}
          <span className={`self-stretch ${
            !task.is_completed && task.priority !== 'low'
              ? task.priority === 'high' ? 'bg-error' : 'bg-warning'
              : ''
          }`} />

          {/* Checkbox / selection */}
          <span className="flex justify-center">
            {selectionMode ? (
              <button
                onClick={(e) => { e.stopPropagation(); onToggleSelect(task.id); }}
                aria-label={isSelected ? 'Deselect task' : 'Select task'}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-primary/70 transition ${
                  isSelected
                    ? 'bg-primary border-primary text-on-primary'
                    : 'border-outline hover:border-primary'
                }`}
              >
                {!!isSelected && <span className="material-symbols-outlined text-[12px]">check</span>}
              </button>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); onToggleComplete(task); }}
                aria-label={task.is_completed ? 'Mark task incomplete' : 'Mark task complete'}
                className={`rounded-full border flex items-center justify-center flex-shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-primary/70 transition ${touch ? 'w-7 h-7' : 'w-[18px] h-[18px]'} ${
                  task.is_completed
                    ? 'bg-primary border-primary text-on-primary'
                    : 'border-outline hover:border-primary'
                }`}
              >
                {!!task.is_completed && (
                  <span className={`material-symbols-outlined ${touch ? 'text-[16px]' : 'text-[12px]'}`}>check</span>
                )}
              </button>
            )}
          </span>

          {/* Title + inline chips — one line, chips beside the name */}
          <span className="min-w-0 py-2 pr-3">
            <span className="flex items-center gap-2 min-w-0">
              <span className={`text-body-md leading-snug truncate ${task.is_completed ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>
                {task.title}
                {task.description && (
                  <span className="text-on-surface-variant/60 font-light"> — {task.description}</span>
                )}
              </span>
              {task.tags?.slice(0, 2).map(tag => (
                <span key={tag} className="text-label-sm text-primary bg-primary/10 px-1.5 py-px rounded-full tracking-normal flex-shrink-0">
                  {tag}
                </span>
              ))}
              {hasSubTasks && (
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleExpand(task.id); }}
                  title={isExpanded ? 'Hide sub-tasks' : 'Show sub-tasks'}
                  className="flex items-center gap-0.5 text-label-sm text-on-surface-variant/60 bg-surface-container px-1.5 py-px rounded-full hover:text-on-surface-variant transition tabular-nums tracking-normal flex-shrink-0"
                >
                  <span className="material-symbols-outlined text-[11px]">checklist</span>
                  {task.subtask_completed_count}/{task.subtask_count}
                  <span className="material-symbols-outlined text-[12px]">
                    {isExpanded ? 'expand_less' : 'expand_more'}
                  </span>
                </button>
              )}
              {showUnassigned && !task.assigned_to && (
                <span className="text-label-sm flex items-center gap-1 bg-warning-container text-on-warning-container px-1.5 py-px rounded-full tracking-normal flex-shrink-0">
                  <span className="material-symbols-outlined text-[11px]">person_off</span>
                  Unassigned
                </span>
              )}
            </span>
            {/* Mobile: due date tucks under the title */}
            {task.due_date && (
              <span className={`sm:hidden flex items-center gap-1 mt-0.5 text-label-sm tracking-normal ${dueDateColour(task.due_date)}`}>
                <span className="material-symbols-outlined text-[11px]">calendar_today</span>
                {formatTaskDate(task.due_date)}
              </span>
            )}
          </span>

          {/* Project — column renders only when some visible task has one */}
          {showProject && (
            <span className="hidden sm:flex items-center gap-1.5 pr-3 min-w-0 text-label-md text-on-surface-variant/70 tracking-normal">
              {task.project_name && (
                <>
                  <span className="text-[11px] flex-shrink-0">{task.project_icon || '📁'}</span>
                  <span className="truncate font-medium">{task.project_name}</span>
                </>
              )}
            </span>
          )}

          {/* Due date */}
          <span className="hidden sm:flex items-center pr-3">
            {task.due_date && (
              <span className={`text-label-md flex items-center gap-1 tabular-nums tracking-normal ${dueDateColour(task.due_date)} ${isOverdue ? '' : 'font-medium'}`}>
                <span className="material-symbols-outlined text-[12px]">calendar_today</span>
                {formatTaskDate(task.due_date)}
              </span>
            )}
          </span>

          {/* Status */}
          <span className="hidden sm:flex items-center pr-3">
            <button
              onClick={(e) => { e.stopPropagation(); onCycleStatus(task); }}
              title="Click to change status"
              className={`text-label-sm px-2 py-0.5 rounded-full whitespace-nowrap transition hover:ring-1 hover:ring-current tracking-normal ${STATUS_COLOURS[task.status] ?? STATUS_COLOURS.todo}`}
            >
              {STATUS_LABELS[task.status] ?? task.status}
            </button>
          </span>

          {/* Priority */}
          <span className="hidden sm:flex items-center pr-3">
            <button
              onClick={(e) => { e.stopPropagation(); onCyclePriority(task); }}
              title="Click to change priority"
              className={`text-label-sm px-2 py-0.5 rounded-full capitalize transition hover:ring-1 hover:ring-current tracking-normal ${PRIORITY_COLOURS[task.priority]}`}
            >
              {task.priority}
            </button>
          </span>

          {/* Actions */}
          <span className="flex items-center justify-end gap-0.5 pr-3" onClick={(e) => e.stopPropagation()}>
            {!selectionMode && !confirming && <DeepWorkTrigger task={task} />}
            {!selectionMode && (confirming ? (
              <span className="flex items-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteConfirm(task.id); }}
                  disabled={isDeleting}
                  className="h-6 px-2 rounded-full bg-error text-on-error text-label-sm font-bold hover:bg-error/90 transition disabled:opacity-50"
                >
                  {isDeleting ? '…' : 'Del'}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteCancel(); }}
                  className="h-6 w-6 rounded-full bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition flex items-center justify-center"
                >
                  ×
                </button>
              </span>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); onDeleteStart(task.id); }}
                aria-label="Delete task"
                className={`rounded-full flex items-center justify-center text-on-surface-variant can-hover:opacity-0 can-hover:group-hover:opacity-100 focus-visible:opacity-100 hover:bg-error-container hover:text-error transition ${touch ? 'h-9 w-9' : 'h-7 w-7'}`}
                title="Delete task"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
              </button>
            ))}
          </span>
        </div>

        {!selectionMode && isExpanded && hasSubTasks && (
          <div
            className="pl-11 sm:pl-[44px] pr-4 pb-2 -mt-1"
            onClick={(e) => e.stopPropagation()}
          >
            <SubTaskList taskId={task.id} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── KanbanCard ─────────────────────────────────────────────────────────────────
function KanbanCard({ task, colIndex, onEdit, onToggleComplete, onMoveStatus, selectionMode, isSelected, onToggleSelect, isDragging, onDragStart, onDragEnd, onDeleteStart, deletingId, onDeleteConfirm, onDeleteCancel, isDeleting }) {
  const isOverdue = isTaskOverdue(task);
  const confirming = deletingId === task.id;

  const canMoveLeft  = colIndex > 0;
  const canMoveRight = colIndex < KANBAN_COLS.length - 1;

  const handleActivate = () => selectionMode ? onToggleSelect(task.id) : onEdit(task);

  const subtaskProgress = task.subtask_count > 0
    ? Math.round(((task.subtask_completed_count ?? 0) / task.subtask_count) * 100)
    : null;

  return (
    <div
      draggable={!selectionMode}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`bg-surface-container-lowest rounded-xl border shadow-soft transition group relative overflow-hidden hover:shadow-heavy ${
        selectionMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
      } ${isDragging ? 'opacity-40' : ''} ${
        task.is_completed
          ? 'border-outline-variant/15 opacity-60'
          : isSelected
            ? 'border-primary ring-1 ring-primary'
            : isOverdue
              ? 'border-error/30 hover:border-error/50'
              : 'border-outline-variant/20 hover:border-outline-variant/40'
      }`}
      onClick={handleActivate}
    >
      {selectionMode && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect(task.id); }}
          className={`absolute top-2 right-2 z-10 w-4 h-4 rounded border-2 flex items-center justify-center transition ${
            isSelected ? 'bg-primary border-primary text-on-primary' : 'border-outline bg-surface-container-lowest hover:border-primary'
          }`}
        >
          {isSelected && <span className="material-symbols-outlined text-[10px]">check</span>}
        </button>
      )}
      {!task.is_completed && task.priority !== 'low' && (
        <div className={`absolute left-0 inset-y-0 w-1 ${task.priority === 'high' ? 'bg-error' : 'bg-warning'}`} />
      )}
      <div className="p-3 pl-4">
        <div className="flex items-start gap-2 mb-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleComplete(task); }}
            className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 mt-0.5 transition ${
              task.is_completed ? 'bg-primary border-primary text-on-primary' : 'border-outline hover:border-primary'
            }`}
          >
            {!!task.is_completed && <span className="material-symbols-outlined text-[10px]">check</span>}
          </button>
          <p className={`text-body-sm font-medium flex-1 leading-snug ${task.is_completed ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>
            {task.title}
          </p>
        </div>

        {task.project_name && (
          <p className="text-label-sm text-on-surface-variant/50 ml-6 tracking-normal">
            {task.project_icon || '📁'} {task.project_name}
          </p>
        )}

        {task.tags?.length > 0 && (
          <div className="flex gap-1 ml-6 mt-1 flex-wrap">
            {task.tags.slice(0, 2).map(tag => (
              <span key={tag} className="text-label-sm text-primary bg-primary/10 px-2 py-0.5 rounded-full tracking-normal">{tag}</span>
            ))}
          </div>
        )}

        {subtaskProgress !== null && !task.is_completed && (
          <div className="flex items-center gap-2 ml-6 mt-2">
            <div className="flex-1 h-1 rounded-full bg-surface-container overflow-hidden">
              <div className="h-full rounded-full bg-primary" style={{ width: `${subtaskProgress}%` }} />
            </div>
            <span className="text-label-sm text-on-surface-variant/50 tabular-nums tracking-normal">
              {task.subtask_completed_count ?? 0}/{task.subtask_count}
            </span>
          </div>
        )}

        <div className="flex items-center gap-1.5 mt-2 ml-6">
          {task.due_date && (
            <span className={`text-label-sm flex items-center gap-0.5 tracking-normal ${dueDateColour(task.due_date)}`}>
              <span className="material-symbols-outlined text-[11px]">calendar_today</span>
              {formatTaskDate(task.due_date)}
            </span>
          )}
          <div className="flex-1" />
          {!selectionMode && <DeepWorkTrigger task={task} size="sm" />}
          {!selectionMode && (confirming ? (
            <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => onDeleteConfirm(task.id)}
                disabled={isDeleting}
                className="h-5 px-1.5 rounded-full bg-error text-on-error text-label-sm font-bold hover:bg-error/90 transition disabled:opacity-50"
              >
                {isDeleting ? '…' : 'Del'}
              </button>
              <button
                onClick={() => onDeleteCancel()}
                className="h-5 w-5 rounded-full bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition flex items-center justify-center"
              >
                ×
              </button>
            </span>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteStart(task.id); }}
              aria-label="Delete task"
              title="Delete task"
              className="h-6 w-6 rounded-full flex items-center justify-center text-on-surface-variant can-hover:opacity-0 can-hover:group-hover:opacity-100 focus-visible:opacity-100 hover:bg-error-container hover:text-error transition"
            >
              <span className="material-symbols-outlined text-[14px]">delete</span>
            </button>
          ))}
          <span className={`text-label-sm px-2 py-0.5 rounded-full capitalize tracking-normal ${PRIORITY_COLOURS[task.priority]}`}>
            {task.priority}
          </span>
        </div>

        {/* Move buttons — visible on hover */}
        <div
          className="flex items-center gap-1 mt-2 ml-6 can-hover:opacity-0 can-hover:group-hover:opacity-100 transition"
          onClick={(e) => e.stopPropagation()}
        >
          {canMoveLeft && (
            <button
              onClick={(e) => { e.stopPropagation(); onMoveStatus(task, KANBAN_COLS[colIndex - 1].key); }}
              title={`Move to ${KANBAN_COLS[colIndex - 1].label}`}
              className="h-6 px-2 rounded-full bg-surface-container text-on-surface-variant hover:bg-surface-container-high text-label-sm flex items-center gap-1 transition tracking-normal"
            >
              <span className="material-symbols-outlined text-[12px]">arrow_back</span>
              {KANBAN_COLS[colIndex - 1].label}
            </button>
          )}
          {canMoveRight && (
            <button
              onClick={(e) => { e.stopPropagation(); onMoveStatus(task, KANBAN_COLS[colIndex + 1].key); }}
              title={`Move to ${KANBAN_COLS[colIndex + 1].label}`}
              className="h-6 px-2 rounded-full bg-surface-container text-on-surface-variant hover:bg-surface-container-high text-label-sm flex items-center gap-1 transition tracking-normal"
            >
              {KANBAN_COLS[colIndex + 1].label}
              <span className="material-symbols-outlined text-[12px]">arrow_forward</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── KanbanView ─────────────────────────────────────────────────────────────────
// Columns are fluid quarters of the page (grid), not fixed 288px strips.
function KanbanView({ tasks, onEdit, onToggleComplete, onMoveStatus, onAddTask, selectionMode, selectedIds, onToggleSelect, sortBy, filter, onDeleteStart, deletingId, onDeleteConfirm, onDeleteCancel, isDeleting }) {
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [draggedId,  setDraggedId]  = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [expandedCols, setExpandedCols] = useState(new Set());

  const byStatus = useMemo(() => {
    return KANBAN_COLS.reduce((acc, col) => {
      let colTasks = tasks.filter(t => {
        if (col.key === 'done') return t.is_completed;
        return !t.is_completed && t.status === col.key;
      });
      colTasks = [...colTasks].sort((a, b) => {
        if (sortBy === 'due_date') {
          return (a.due_date || '9999-12-31') < (b.due_date || '9999-12-31') ? -1 : 1;
        }
        if (sortBy === 'created') return b.id - a.id;
        return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      });
      acc[col.key] = colTasks;
      return acc;
    }, {});
  }, [tasks, sortBy]);

  const handleDragOver = useCallback((e, colKey) => {
    e.preventDefault();
    setDragOverCol(colKey);
  }, []);

  const handleDragLeave = useCallback((e, colKey) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverCol(prev => prev === colKey ? null : prev);
    }
  }, []);

  const handleDrop = useCallback((e, colKey) => {
    e.preventDefault();
    if (draggedId !== null) {
      const task = tasks.find(t => t.id === draggedId);
      if (task) {
        const currentCol = task.is_completed ? 'done' : task.status;
        if (colKey !== currentCol) onMoveStatus(task, colKey);
      }
    }
    setDraggedId(null);
    setDragOverCol(null);
  }, [draggedId, tasks, onMoveStatus]);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDragOverCol(null);
  }, []);

  const overdueByCol = useMemo(() => KANBAN_COLS.reduce((acc, col) => {
    acc[col.key] = (byStatus[col.key] ?? []).filter(t =>
      t.due_date && !t.is_completed && t.due_date.split('T')[0] < todayStr,
    ).length;
    return acc;
  }, {}), [byStatus, todayStr]);

  const visibleCols = filter === 'completed'
    ? KANBAN_COLS.filter(c => c.key === 'done')
    : KANBAN_COLS;

  const toggleColExpand = (key) => setExpandedCols(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  return (
    <div className={`grid gap-4 items-start pb-4 ${
      filter === 'completed' ? 'grid-cols-1 max-w-lg' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'
    }`}>
      {visibleCols.map((col) => {
        const colIndex     = KANBAN_COLS.indexOf(col);
        const isDropTarget = dragOverCol === col.key && draggedId !== null;
        const colTasks     = byStatus[col.key] ?? [];
        const isExpanded   = expandedCols.has(col.key);
        const shown        = isExpanded ? colTasks : colTasks.slice(0, KANBAN_COL_LIMIT);
        const hiddenCount  = colTasks.length - shown.length;
        return (
          <div
            key={col.key}
            className={`rounded-xl transition-shadow min-w-0 ${isDropTarget ? 'ring-2 ring-primary/50' : ''}`}
            onDragOver={(e) => handleDragOver(e, col.key)}
            onDragLeave={(e) => handleDragLeave(e, col.key)}
            onDrop={(e) => handleDrop(e, col.key)}
          >
            <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl mb-3 transition ${col.bgClass} ${
              isDropTarget ? 'ring-1 ring-primary/40 ring-inset' : ''
            }`}>
              <span className={`material-symbols-outlined text-[16px] ${col.accentClass}`}>{col.icon}</span>
              <span className={`text-label-md font-bold ${col.accentClass}`}>{col.label}</span>
              <div className="ml-auto flex items-center gap-1.5">
                {overdueByCol[col.key] > 0 && (
                  <span className="text-label-sm bg-error/10 text-error px-1.5 py-0.5 rounded-full font-bold tabular-nums">
                    {overdueByCol[col.key]} overdue
                  </span>
                )}
                <span className="text-label-sm text-on-surface-variant bg-surface-container-lowest/50 px-2 py-0.5 rounded-full tabular-nums">
                  {colTasks.length}
                </span>
              </div>
            </div>
            <div className={`space-y-2 min-h-[5rem] rounded-xl transition ${
              isDropTarget ? 'bg-primary/5' : ''
            }`}>
              {shown.map(task => (
                <KanbanCard
                  key={task.id}
                  task={task}
                  colIndex={colIndex}
                  onEdit={onEdit}
                  onToggleComplete={onToggleComplete}
                  onMoveStatus={onMoveStatus}
                  selectionMode={selectionMode}
                  isSelected={selectedIds.has(task.id)}
                  onToggleSelect={onToggleSelect}
                  isDragging={draggedId === task.id}
                  onDragStart={() => setDraggedId(task.id)}
                  onDragEnd={handleDragEnd}
                  onDeleteStart={onDeleteStart}
                  deletingId={deletingId}
                  onDeleteConfirm={onDeleteConfirm}
                  onDeleteCancel={onDeleteCancel}
                  isDeleting={isDeleting}
                />
              ))}
              {hiddenCount > 0 && (
                <button
                  onClick={() => toggleColExpand(col.key)}
                  className="w-full text-label-sm text-on-surface-variant/60 hover:text-on-surface-variant py-1.5 transition"
                >
                  Show {hiddenCount} more
                </button>
              )}
              {isExpanded && colTasks.length > KANBAN_COL_LIMIT && (
                <button
                  onClick={() => toggleColExpand(col.key)}
                  className="w-full text-label-sm text-on-surface-variant/60 hover:text-on-surface-variant py-1.5 transition"
                >
                  Show less
                </button>
              )}
              {colTasks.length === 0 && filter !== 'completed' && (
                <div className={`border-2 border-dashed rounded-xl h-16 flex items-center justify-center transition ${
                  isDropTarget ? 'border-primary/40 bg-primary/5' : 'border-outline-variant/20'
                }`}>
                  <span className="text-label-sm text-on-surface-variant/30">
                    {isDropTarget ? 'Drop here' : 'No tasks'}
                  </span>
                </div>
              )}
              {/* Per-column add — creates a task pre-set to this status */}
              {col.key !== 'done' && !selectionMode && (
                <button
                  onClick={() => onAddTask(col.key)}
                  className="w-full flex items-center justify-center gap-1.5 border-[1.5px] border-dashed border-outline-variant/50 rounded-xl py-2 text-label-md text-on-surface-variant/60 hover:text-on-surface-variant hover:border-outline-variant transition"
                >
                  <span className="material-symbols-outlined text-[14px]">add</span>
                  Add
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── DetailedRow ────────────────────────────────────────────────────────────────
function DetailedRow({ task, onEdit, onToggleComplete, onCycleStatus, onCyclePriority, onDeleteStart, deletingId, onDeleteConfirm, onDeleteCancel, isDeleting, selectionMode, isSelected, onToggleSelect, hiddenCols, density }) {
  const confirming = deletingId === task.id;
  const py         = density === 'compact' ? 'py-1.5' : 'py-2.5';

  const progress = task.is_completed ? 100
    : task.subtask_count > 0
      ? Math.round(((task.subtask_completed_count ?? 0) / task.subtask_count) * 100)
      : task.status === 'in_progress' ? 40
      : task.status === 'done' ? 100
      : 0;

  return (
    <tr
      className={`group hover:bg-surface-container/40 transition cursor-pointer ${isSelected ? 'bg-primary/5' : ''} ${task.is_completed ? 'opacity-60' : ''}`}
      onClick={() => selectionMode ? onToggleSelect(task.id) : onEdit(task)}
    >
      <td className={`${py} pl-4 pr-3 w-8`} onClick={(e) => e.stopPropagation()}>
        {selectionMode ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSelect(task.id); }}
            className={`w-4 h-4 rounded border-2 flex items-center justify-center transition ${
              isSelected ? 'bg-primary border-primary text-on-primary' : 'border-outline hover:border-primary'
            }`}
          >
            {isSelected && <span className="material-symbols-outlined text-[10px]">check</span>}
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleComplete(task); }}
            className={`w-4 h-4 rounded-full border flex items-center justify-center transition ${
              task.is_completed ? 'bg-primary border-primary text-on-primary' : 'border-outline hover:border-primary'
            }`}
          >
            {!!task.is_completed && <span className="material-symbols-outlined text-[10px]">check</span>}
          </button>
        )}
      </td>
      <td className={`${py} pr-4 max-w-[220px]`}>
        <p className={`text-body-sm truncate ${task.is_completed ? 'line-through text-on-surface-variant' : 'text-on-surface font-medium'}`}>
          {task.title}
        </p>
        {task.description && density !== 'compact' && (
          <p className="text-label-sm text-on-surface-variant/50 truncate mt-0.5 tracking-normal">{task.description}</p>
        )}
      </td>
      {!hiddenCols.has('project') && (
        <td className={`${py} pr-4 min-w-[100px]`}>
          {task.project_name && (
            <span className="text-label-sm text-on-surface-variant/70 flex items-center gap-1 whitespace-nowrap tracking-normal">
              <span className="text-[10px]">{task.project_icon || '📁'}</span>
              {task.project_name}
            </span>
          )}
        </td>
      )}
      {!hiddenCols.has('priority') && (
        <td className={`${py} pr-4`} onClick={(e) => e.stopPropagation()}>
          <button
            onClick={(e) => { e.stopPropagation(); onCyclePriority(task); }}
            className={`text-label-sm px-2 py-0.5 rounded-full capitalize hover:ring-1 hover:ring-current transition tracking-normal ${PRIORITY_COLOURS[task.priority]}`}
          >
            {task.priority}
          </button>
        </td>
      )}
      {!hiddenCols.has('status') && (
        <td className={`${py} pr-4`} onClick={(e) => e.stopPropagation()}>
          <button
            onClick={(e) => { e.stopPropagation(); onCycleStatus(task); }}
            className={`text-label-sm px-2 py-0.5 rounded-full whitespace-nowrap hover:ring-1 hover:ring-current transition tracking-normal ${STATUS_COLOURS[task.status] ?? STATUS_COLOURS.todo}`}
          >
            {STATUS_LABELS[task.status] ?? task.status}
          </button>
        </td>
      )}
      {!hiddenCols.has('tags') && (
        <td className={`${py} pr-4`}>
          <div className="flex gap-1 flex-wrap">
            {task.tags?.slice(0, 2).map(tag => (
              <span key={tag} className="text-label-sm text-primary bg-primary/10 px-2 py-0.5 rounded-full whitespace-nowrap tracking-normal">{tag}</span>
            ))}
          </div>
        </td>
      )}
      {!hiddenCols.has('due_date') && (
        <td className={`${py} pr-4 whitespace-nowrap`}>
          {task.due_date && (
            <span className={`text-label-sm flex items-center gap-1 tabular-nums tracking-normal ${dueDateColour(task.due_date)}`}>
              <span className="material-symbols-outlined text-[11px]">calendar_today</span>
              {formatTaskDate(task.due_date)}
            </span>
          )}
        </td>
      )}
      {!hiddenCols.has('progress') && (
        <td className={`${py} pr-4 min-w-[100px]`}>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-surface-container overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${progress === 100 ? 'bg-success' : 'bg-primary'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-label-sm text-on-surface-variant/50 w-8 text-right tabular-nums tracking-normal">{progress}%</span>
          </div>
        </td>
      )}
      <td className={`${py} pl-1 pr-3 w-20`} onClick={(e) => e.stopPropagation()}>
        {!selectionMode && !confirming && <DeepWorkTrigger task={task} size="sm" />}
        {!selectionMode && (confirming ? (
          <div className="flex items-center gap-1">
            <button onClick={(e) => { e.stopPropagation(); onDeleteConfirm(task.id); }} disabled={isDeleting}
              className="h-6 px-2 rounded-full bg-error text-on-error text-label-sm font-bold transition">
              {isDeleting ? '…' : 'Del'}
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDeleteCancel(); }}
              className="h-6 w-6 rounded-full bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition flex items-center justify-center">
              ×
            </button>
          </div>
        ) : (
          <button onClick={(e) => { e.stopPropagation(); onDeleteStart(task.id); }}
            className="h-7 w-7 rounded-full flex items-center justify-center text-on-surface-variant can-hover:opacity-0 can-hover:group-hover:opacity-100 hover:bg-error-container hover:text-error transition">
            <span className="material-symbols-outlined text-[14px]">delete</span>
          </button>
        ))}
      </td>
    </tr>
  );
}

// ── DetailedView ───────────────────────────────────────────────────────────────
// Sortable headers + a footer that totals the set.
const SORTABLE_COLS = { priority: 'priority', status: 'status', due_date: 'due_date' };

function DetailedView({ tasks, onEdit, onToggleComplete, onCycleStatus, onCyclePriority, onDeleteStart, deletingId, onDeleteConfirm, onDeleteCancel, isDeleting, selectionMode, selectedIds, onToggleSelect, hiddenCols, density, sortBy, onSort }) {
  const th = 'py-3 pr-4 text-label-sm font-bold uppercase tracking-wider text-on-surface-variant/60';

  const SortableTh = ({ colKey, label }) => {
    const sortKey  = SORTABLE_COLS[colKey];
    const isActive = sortKey && sortBy === sortKey;
    if (!sortKey) return <th className={th}>{label}</th>;
    return (
      <th className={`${th} ${isActive ? 'text-primary' : ''}`}>
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          className="flex items-center gap-1 uppercase tracking-wider hover:text-on-surface transition"
          title={`Sort by ${label}`}
        >
          {label}
          {isActive && <span className="material-symbols-outlined text-[12px]">arrow_upward</span>}
        </button>
      </th>
    );
  };

  const total   = tasks.length;
  const done    = tasks.filter(t => t.is_completed).length;
  const overdue = tasks.filter(isTaskOverdue).length;
  const rate    = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="overflow-x-auto rounded-xl border border-outline-variant/20 shadow-soft">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-surface-container/60 border-b border-outline-variant/20">
            <th className="py-3 pl-4 pr-3 w-8" />
            <th className={th}>Task</th>
            {!hiddenCols.has('project')  && <SortableTh colKey="project"  label="Project"  />}
            {!hiddenCols.has('priority') && <SortableTh colKey="priority" label="Priority" />}
            {!hiddenCols.has('status')   && <SortableTh colKey="status"   label="Status"   />}
            {!hiddenCols.has('tags')     && <SortableTh colKey="tags"     label="Tags"     />}
            {!hiddenCols.has('due_date') && <SortableTh colKey="due_date" label="Due Date" />}
            {!hiddenCols.has('progress') && <SortableTh colKey="progress" label="Progress" />}
            <th className="py-3 pr-3 w-12" />
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/10 bg-surface-container-lowest">
          {tasks.map(task => (
            <DetailedRow
              key={task.id}
              task={task}
              onEdit={onEdit}
              onToggleComplete={onToggleComplete}
              onCycleStatus={onCycleStatus}
              onCyclePriority={onCyclePriority}
              onDeleteStart={onDeleteStart}
              deletingId={deletingId}
              onDeleteConfirm={onDeleteConfirm}
              onDeleteCancel={onDeleteCancel}
              isDeleting={isDeleting}
              selectionMode={selectionMode}
              isSelected={selectedIds.has(task.id)}
              onToggleSelect={onToggleSelect}
              hiddenCols={hiddenCols}
              density={density}
            />
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-4 px-4 py-2.5 bg-surface-container/60 border-t border-outline-variant/20 text-label-sm text-on-surface-variant tabular-nums tracking-normal">
        <span><b className="text-on-surface">{total}</b> tasks</span>
        <span><b className="text-on-surface">{done}</b> done</span>
        {overdue > 0 && <span className="text-error"><b>{overdue}</b> overdue</span>}
        <span className="ml-auto"><b className="text-on-surface">{rate}%</b> complete</span>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Tasks() {
  const { user } = useAuthStore();
  const qc       = useQueryClient();
  const { isTouch } = useMode();

  const [viewMode,        setViewMode]        = useState('status');
  const [filter,          setFilter]          = useState('all');
  const [search,          setSearch]          = useState('');
  const [sortBy,          setSortBy]          = useState('priority');
  const [assigneeFilter,  setAssigneeFilter]  = useState('me');
  const [formOpen,        setFormOpen]        = useState(false);
  const [editingTask,     setEditingTask]     = useState(null);
  const [createStatus,    setCreateStatus]    = useState(null);
  const [deletingId,      setDeletingId]      = useState(null);
  const [expandedIds,     setExpandedIds]     = useState(new Set());
  const [selectionMode,   setSelectionMode]   = useState(false);
  const [selectedIds,     setSelectedIds]     = useState(new Set());
  const [groupBy,         setGroupBy]         = useState('due_date');
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  const [hiddenCols,      setHiddenCols]      = useState(new Set());
  const [tableDensity,    setTableDensity]    = useState('comfortable');

  const openCreate = (status = null) => { setEditingTask(null); setCreateStatus(status); setFormOpen(true); };
  const openEdit   = (task) => { setEditingTask(task); setCreateStatus(null); setFormOpen(true); };
  const closeForm  = () => { setFormOpen(false); setEditingTask(null); setCreateStatus(null); };

  const toggleExpand = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelect = useCallback((id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const toggleCol = useCallback((key) => {
    setHiddenCols(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const toggleCollapseAll = (currentlyAllCollapsed) => {
    if (currentlyAllCollapsed) {
      setCollapsedGroups(new Set());
    } else {
      setCollapsedGroups(new Set(groupOrder));
    }
  };

  const isAdmin = user?.role === 'admin';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  // Users list — needed for the assignee dropdown (admin only)
  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data),
    enabled: isAdmin,
  });

  const queryParams = useMemo(() => {
    const base = { excludeSubTasks: true };
    if      (assigneeFilter === 'me')         base.assignedTo = user?.id;
    else if (assigneeFilter === 'all')        { /* no assignedTo — all tasks */ }
    else if (assigneeFilter === 'unassigned') { /* no assignedTo — filter client-side */ }
    else                                       base.assignedTo = Number(assigneeFilter);

    if (filter === 'active')    return { ...base, isCompleted: false };
    if (filter === 'completed') return { ...base, isCompleted: true };
    if (filter === 'overdue')   return { ...base, isCompleted: false, dueTo: yesterdayStr };
    return base;
  }, [filter, user?.id, assigneeFilter, yesterdayStr]);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', queryParams],
    queryFn: () =>
      api.get('/tasks', { params: queryParams }).then(r => r.data),
    enabled: !!user?.id,
  });

  // Header subtitle counts — shared query with the stats band.
  const allTasksStats  = useAllTasksStats(user?.id, assigneeFilter);
  const activeCount    = allTasksStats.filter(t => !t.is_completed).length;
  const dueTodayCount  = allTasksStats.filter(isTaskDueToday).length;

  const filteredByServer = useMemo(() => {
    let list = tasks;
    if (assigneeFilter === 'unassigned') list = list.filter(t => !t.assigned_to);
    if (filter === 'overdue') {
      const todayStr = new Date().toISOString().split('T')[0];
      list = list.filter(t => t.due_date && (t.due_date.split('T')[0] || t.due_date) < todayStr);
    }
    return list;
  }, [tasks, filter, assigneeFilter]);

  const overdueCount = useMemo(() => {
    if (filter === 'overdue')   return filteredByServer.length;
    if (filter === 'completed') return 0;
    const todayStr = new Date().toISOString().split('T')[0];
    return filteredByServer.filter(t =>
      !t.is_completed && t.due_date && t.due_date.split('T')[0] < todayStr,
    ).length;
  }, [filteredByServer, filter]);

  // ── Mutations ────────────────────────────────────────────────────────────────
  const complete = useMutation({
    mutationFn: (id) => api.post(`/tasks/${id}/complete`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); useCelebrationStore.getState().fire(); },
  });
  const uncomplete = useMutation({
    mutationFn: (id) => api.post(`/tasks/${id}/uncomplete`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
  const updateField = useMutation({
    mutationFn: ({ id, data }) => api.put(`/tasks/${id}`, data),
    // Cycling status to 'done' (handleCycleStatus) saves via this same PUT,
    // which the server also treats as completion (taskService.js) — fire here
    // too, not just from the dedicated complete endpoint.
    onSuccess: (_data, { data }) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      if (data.status === 'done') useCelebrationStore.getState().fire();
    },
  });
  // "done" is completion, not a status value — moving in/out of it must go
  // through complete/uncomplete first, sequentially, so the two requests
  // can't race and clobber each other's write (uncomplete always resets
  // status to 'todo'). Same pattern as ProjectDetail's BoardTab.moveStatus.
  const moveStatus = useMutation({
    mutationFn: async ({ task, status }) => {
      if (status === 'done') return api.post(`/tasks/${task.id}/complete`);
      if (task.is_completed) await api.post(`/tasks/${task.id}/uncomplete`);
      return api.put(`/tasks/${task.id}`, { status });
    },
    onSuccess: (_data, { task, status }) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      if (status === 'done' && !task.is_completed) useCelebrationStore.getState().fire();
    },
  });
  const deleteTask = useMutation({
    mutationFn: (id) => api.delete(`/tasks/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); setDeletingId(null); },
  });
  const bulkAction = useMutation({
    mutationFn: ({ ids, action }) => api.post('/tasks/bulk', { ids, action }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      exitSelectionMode();
    },
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleToggleComplete = (task) => {
    task.is_completed ? uncomplete.mutate(task.id) : complete.mutate(task.id);
  };
  const handleCycleStatus = (task) => {
    const next = STATUSES[(STATUSES.indexOf(task.status) + 1) % STATUSES.length];
    updateField.mutate({ id: task.id, data: { status: next } });
  };
  const handleCyclePriority = (task) => {
    const next = PRIORITIES[(PRIORITIES.indexOf(task.priority) + 1) % PRIORITIES.length];
    updateField.mutate({ id: task.id, data: { priority: next } });
  };
  const handleMoveStatus = (task, newStatus) => {
    if (newStatus !== (task.is_completed ? 'done' : task.status)) {
      moveStatus.mutate({ task, status: newStatus });
    }
  };

  const handleBulkComplete = () =>
    bulkAction.mutate({ ids: [...selectedIds], action: 'complete' });
  const handleBulkDelete = () => {
    if (!window.confirm(`Delete ${selectedIds.size} task${selectedIds.size === 1 ? '' : 's'}? This cannot be undone.`)) return;
    bulkAction.mutate({ ids: [...selectedIds], action: 'delete' });
  };
  const handleSelectAll = () =>
    setSelectedIds(new Set(processed.map(t => t.id)));

  // ── Sort / filter / group ────────────────────────────────────────────────────
  const processed = useMemo(() => {
    let list = filteredByServer;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.project_name?.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'due_date': {
          const aD = a.due_date || '9999-12-31';
          const bD = b.due_date || '9999-12-31';
          return aD < bD ? -1 : aD > bD ? 1 : 0;
        }
        case 'status':
          return STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status);
        case 'created':
          return b.id - a.id;
        default:
          return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      }
    });
  }, [filteredByServer, search, sortBy]);

  const grouped = useMemo(() => {
    if (viewMode !== 'priority') return null;
    return processed.reduce((acc, task) => {
      let key;
      if (groupBy === 'project') {
        key = task.project_name || 'No Project';
      } else if (groupBy === 'due_date') {
        if (task.is_completed) { key = 'Done'; }
        else if (!task.due_date) { key = 'No Due Date'; }
        else {
          const d = parseISO(task.due_date.split('T')[0]);
          key = (!isToday(d) && isPast(d)) ? 'Overdue' : isToday(d) ? 'Today' : 'Upcoming';
        }
      } else {
        key = task.priority === 'high' ? 'High Priority' : task.priority === 'medium' ? 'Medium' : 'Low Priority';
      }
      if (!acc[key]) acc[key] = [];
      acc[key].push(task);
      return acc;
    }, {});
  }, [processed, viewMode, groupBy]);

  const groupOrder = useMemo(() => {
    if (!grouped) return [];
    if (groupBy === 'due_date') return ['Overdue', 'Today', 'Upcoming', 'No Due Date', 'Done'].filter(k => grouped[k]);
    if (groupBy === 'priority') return ['High Priority', 'Medium', 'Low Priority'].filter(k => grouped[k]);
    return Object.keys(grouped).sort();
  }, [grouped, groupBy]);

  const allGroupsCollapsed = groupOrder.length > 0 && groupOrder.every(k => collapsedGroups.has(k));

  // Drop the Project column entirely when no visible task has one.
  const anyProject = useMemo(() => processed.some(t => t.project_name), [processed]);

  const rowProps = {
    deletingId,
    touch:            isTouch,
    showUnassigned:   isAdmin,
    showProject:      anyProject,
    onEdit:           openEdit,
    onToggleExpand:   toggleExpand,
    onToggleComplete: handleToggleComplete,
    onCycleStatus:    handleCycleStatus,
    onCyclePriority:  handleCyclePriority,
    onDeleteStart:    setDeletingId,
    onDeleteConfirm:  (id) => deleteTask.mutate(id),
    onDeleteCancel:   () => setDeletingId(null),
    isDeleting:       deleteTask.isPending,
    selectionMode,
    onToggleSelect:   toggleSelect,
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Sticky header ────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-background -mx-container-padding px-container-padding">
       <div className="max-w-7xl mx-auto">

        {/* Row 1: title + subtitle · search · new task */}
        <div className="flex items-center gap-4 pb-2.5">
          <div className="min-w-0">
            <h1 className="text-headline-lg text-on-background leading-tight">Tasks</h1>
            <p className="text-label-md text-on-surface-variant/70 mt-0.5 truncate">
              {format(new Date(), 'EEEE, MMM d')}
              {activeCount > 0 && <> · {activeCount} active</>}
              {dueTodayCount > 0 && <> · <span className="text-warning font-semibold">{dueTodayCount} due today</span></>}
            </p>
          </div>

          <div className="flex-1" />

          <div className="relative flex-shrink-0 w-44 md:w-56">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50 text-[18px] pointer-events-none">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks…"
              className="w-full bg-surface-container rounded-full pl-9 pr-8 h-9 text-body-md text-on-surface border border-outline-variant/30 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition placeholder-on-surface-variant/50"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>

          <button
            onClick={() => openCreate()}
            className="flex items-center gap-2 h-9 px-4 rounded-full bg-primary text-on-primary text-label-md font-bold hover:bg-primary/90 transition active:scale-95 flex-shrink-0"
            title="New task"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            New Task
          </button>
        </div>

        {/* Row 2: single consolidated toolbar */}
        <div className="flex items-center gap-2 pb-3 flex-wrap">
          {selectionMode ? (
            <button
              onClick={exitSelectionMode}
              className="h-9 px-3 rounded-full bg-surface-container text-on-surface-variant text-label-md hover:bg-surface-container-high transition flex items-center gap-1.5 active:scale-[0.97] flex-shrink-0"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
              Cancel
            </button>
          ) : (
            <FilterSegments value={filter} onChange={setFilter} overdueCount={overdueCount} />
          )}

          <AssigneeFilter
            value={assigneeFilter}
            onChange={setAssigneeFilter}
            currentUser={user}
            users={allUsers}
            isAdmin={isAdmin}
          />

          {/* View-specific controls live here — no extra context-bar row */}
          {viewMode === 'priority' && (
            <>
              <CtxDropdown label="Group" value={groupBy} options={GROUP_BY_OPTIONS} onChange={setGroupBy} />
              <button
                type="button"
                onClick={() => toggleCollapseAll(allGroupsCollapsed)}
                className="h-9 w-9 rounded-full flex items-center justify-center bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition active:scale-[0.97] flex-shrink-0"
                title={allGroupsCollapsed ? 'Expand all groups' : 'Collapse all groups'}
              >
                <span className="material-symbols-outlined text-[16px]">{allGroupsCollapsed ? 'unfold_more' : 'unfold_less'}</span>
              </button>
            </>
          )}
          {viewMode === 'detailed' && (
            <>
              <ColsDropdown hiddenCols={hiddenCols} onToggle={toggleCol} />
              <button
                type="button"
                onClick={() => setTableDensity(d => d === 'comfortable' ? 'compact' : 'comfortable')}
                className="h-9 px-3 rounded-full flex items-center gap-1.5 text-label-md bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition active:scale-[0.97] flex-shrink-0"
              >
                <span className="material-symbols-outlined text-[14px]">{tableDensity === 'compact' ? 'density_small' : 'density_medium'}</span>
                {tableDensity === 'compact' ? 'Compact' : 'Comfortable'}
              </button>
            </>
          )}

          <div className="flex-1" />

          <SortDropdown value={sortBy} onChange={setSortBy} viewMode={viewMode} />

          {/* View switcher — labeled so the views are discoverable */}
          <div className="flex items-center bg-surface-container rounded-full p-1 gap-0.5 flex-shrink-0">
            {VIEW_MODES.map(({ value, icon, label }) => (
              <button
                key={value}
                onClick={() => setViewMode(value)}
                title={`${label} view`}
                className={`h-7 px-2.5 rounded-full flex items-center gap-1.5 text-label-md transition active:scale-95 ${
                  viewMode === value
                    ? 'bg-surface-container-lowest text-on-surface font-bold shadow-soft'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">{icon}</span>
                <span className="hidden md:inline">{label}</span>
              </button>
            ))}
          </div>

          {!selectionMode && (
            <button
              onClick={() => { setSelectionMode(true); setSelectedIds(new Set()); }}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition active:scale-95 flex-shrink-0"
              title="Select tasks"
            >
              <span className="material-symbols-outlined text-[18px]">checklist</span>
            </button>
          )}
        </div>

        {/* Bulk action bar — appears during selection */}
        {selectionMode && (
          <div className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border mb-3 transition ${
            selectedIds.size > 0
              ? 'bg-primary/5 border-primary/20'
              : 'bg-surface-container border-outline-variant/20'
          }`}>
            <button
              onClick={handleSelectAll}
              className="text-label-md text-on-surface-variant hover:text-primary transition"
            >
              Select all ({processed.length})
            </button>
            <div className="flex-1" />
            {selectedIds.size > 0 && (
              <>
                <span className="text-label-md text-primary font-bold">
                  {selectedIds.size} selected
                </span>
                <button
                  onClick={handleBulkComplete}
                  disabled={bulkAction.isPending}
                  className="h-8 px-4 rounded-full bg-primary text-on-primary text-label-md font-bold hover:bg-primary/90 transition disabled:opacity-50 flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[16px]">check_circle</span>
                  Complete
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkAction.isPending}
                  className="h-8 px-4 rounded-full bg-error-container text-error text-label-md font-bold hover:bg-error hover:text-on-error transition disabled:opacity-50 flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                  Delete
                </button>
              </>
            )}
          </div>
        )}

       </div>

        {/* Hairline separator */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-outline-variant/20" />
      </div>

      {/* Content column — same cap as the Routines page (max-w-7xl) */}
      <div className="max-w-7xl mx-auto">

      {/* ── Stats band — full width, replaces the old right rail ─────────────── */}
      <StatsBand userId={user?.id} assigneeFilter={assigneeFilter} />

      {/* ── Empty state ───────────────────────────────────────────────────────── */}
      {!isLoading && processed.length === 0 && (
        <div className="text-center py-16 text-on-surface-variant">
          <span className="material-symbols-outlined text-5xl block mb-3">
            {filter === 'overdue' ? 'check_circle' : search ? 'search_off' : 'assignment'}
          </span>
          <p className="text-body-lg">
            {filter === 'overdue' ? 'No overdue tasks — great work!' : search ? 'No tasks match your search' : 'No tasks found'}
          </p>
          {search && (
            <button onClick={() => setSearch('')} className="mt-2 text-primary text-body-md hover:underline">
              Clear search
            </button>
          )}
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-20">
          <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
        </div>
      )}

      {/* ── Board view ────────────────────────────────────────────────────────── */}
      {!isLoading && processed.length > 0 && viewMode === 'status' && (
        <div className="pt-5">
          <KanbanView
            tasks={processed}
            onEdit={openEdit}
            onToggleComplete={handleToggleComplete}
            onMoveStatus={handleMoveStatus}
            onAddTask={(status) => openCreate(status)}
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            sortBy={sortBy}
            filter={filter}
            onDeleteStart={setDeletingId}
            deletingId={deletingId}
            onDeleteConfirm={(id) => deleteTask.mutate(id)}
            onDeleteCancel={() => setDeletingId(null)}
            isDeleting={deleteTask.isPending}
          />
        </div>
      )}

      {/* ── Table view ────────────────────────────────────────────────────────── */}
      {!isLoading && processed.length > 0 && viewMode === 'detailed' && (
        <div className="pt-5">
          <DetailedView
            tasks={processed}
            onEdit={openEdit}
            onToggleComplete={handleToggleComplete}
            onCycleStatus={handleCycleStatus}
            onCyclePriority={handleCyclePriority}
            onDeleteStart={setDeletingId}
            deletingId={deletingId}
            onDeleteConfirm={(id) => deleteTask.mutate(id)}
            onDeleteCancel={() => setDeletingId(null)}
            isDeleting={deleteTask.isPending}
            selectionMode={selectionMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            hiddenCols={hiddenCols}
            density={tableDensity}
            sortBy={sortBy}
            onSort={setSortBy}
          />
        </div>
      )}

      {/* ── List view ─────────────────────────────────────────────────────────── */}
      {!isLoading && viewMode === 'priority' && (
        <div className="pt-5">
          {!selectionMode && <QuickAdd userId={user?.id} />}

          {processed.length > 0 && grouped && (
            <div className="space-y-5">
              {groupOrder.map(group => {
                const isCollapsed = collapsedGroups.has(group);
                const headerColour = GROUP_HEADER_COLOURS[group] ?? 'text-on-surface-variant/60';
                return (
                  <div key={group}>
                    <button
                      type="button"
                      onClick={() => setCollapsedGroups(prev => {
                        const next = new Set(prev);
                        next.has(group) ? next.delete(group) : next.add(group);
                        return next;
                      })}
                      className="flex items-center gap-2 w-full mb-2 group/grp"
                    >
                      <span className={`text-label-sm uppercase tracking-widest font-bold flex-shrink-0 ${headerColour}`}>{group}</span>
                      <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-surface-container text-label-sm text-on-surface-variant flex items-center justify-center tabular-nums flex-shrink-0 tracking-normal">
                        {grouped[group].length}
                      </span>
                      <span className={`material-symbols-outlined text-[14px] text-on-surface-variant/40 transition-transform flex-shrink-0 ${isCollapsed ? '' : 'rotate-180'}`}>
                        expand_less
                      </span>
                      <div className="h-px flex-1 bg-outline-variant/20" />
                    </button>
                    {!isCollapsed && (
                      <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest shadow-soft overflow-hidden divide-y divide-outline-variant/20">
                        {grouped[group].map(task => (
                          <TaskRow
                            key={task.id}
                            task={task}
                            isExpanded={expandedIds.has(task.id)}
                            isSelected={selectedIds.has(task.id)}
                            {...rowProps}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      </div>

      <TaskForm open={formOpen} onClose={closeForm} task={editingTask} defaultStatus={createStatus} />
    </>
  );
}
