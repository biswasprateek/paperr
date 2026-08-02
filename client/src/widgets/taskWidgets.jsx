import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format, parseISO, isPast, isToday } from 'date-fns';
import { api } from '../auth/AuthContext';
import { useAuthStore } from '../store/authStore';
import WidgetShell, { WidgetEmpty } from './WidgetShell';
import { WidgetHabitRow } from './otherWidgets';
import { useHabitToggle } from './useHabitToggle';
import { useTaskComplete } from './useTaskComplete';
import { useDeepWorkStore } from '../store/deepWorkStore';

function dueColour(due) {
  if (!due) return 'text-on-surface-variant';
  const d = parseISO(due.split('T')[0]);
  if (!isToday(d) && isPast(d)) return 'text-error font-semibold';
  if (isToday(d))               return 'text-warning font-semibold';
  return 'text-on-surface-variant';
}

function fmtDue(due) {
  if (!due) return '';
  try { return format(parseISO(due), due.includes('T') ? 'MMM d, h:mm a' : 'MMM d'); }
  catch { return ''; }
}

// Compact tappable task row used across task widgets. When the parent passes
// onToggleComplete, the leading dot becomes a checkbox styled and behaving
// just like a habit's (WidgetHabitRow) — same size, border and check glyph.
// Clicking the rest of the row navigates to the Tasks page.
function TaskRow({ task, onClick, onToggleComplete, busy }) {
  const openDeepWork = useDeepWorkStore(s => s.openSetup);
  return (
    <div className="group flex items-center gap-2.5 py-2 border-b border-outline-variant/10 last:border-0">
      {onToggleComplete ? (
        <button
          type="button"
          onClick={() => onToggleComplete(task)}
          disabled={busy}
          aria-label={task.is_completed ? 'Mark incomplete' : 'Mark complete'}
          className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-[background-color,border-color,transform] duration-150 active:scale-[0.9] ${
            task.is_completed ? 'border-transparent bg-primary text-white' : 'border-outline hover:border-primary'
          }`}
        >
          {!!task.is_completed && <span className="material-symbols-outlined text-[13px]">check</span>}
        </button>
      ) : (
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
          task.priority === 'high'   ? 'bg-error' :
          task.priority === 'medium' ? 'bg-primary' : 'bg-on-surface-variant/40'
        }`} />
      )}
      <div
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick ? () => onClick(task) : undefined}
        onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(task); } } : undefined}
        className={`flex-1 min-w-0 flex items-center gap-2.5 outline-none ${
          onClick ? 'cursor-pointer hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/70 rounded' : ''
        }`}
      >
        <span className={`flex-1 min-w-0 text-body-md truncate ${task.is_completed ? 'text-on-surface-variant line-through' : 'text-on-surface'}`}>
          {task.title}
        </span>
        {task.due_date && !task.is_completed && (
          <span className={`text-label-sm flex-shrink-0 whitespace-nowrap ${dueColour(task.due_date)}`}>
            {fmtDue(task.due_date)}
          </span>
        )}
      </div>
      {task.status !== 'done' && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); openDeepWork(task.id); }}
          title="Start Deep Work"
          aria-label="Start Deep Work"
          className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-on-surface-variant can-hover:opacity-0 can-hover:group-hover:opacity-100 focus-visible:opacity-100 hover:bg-primary/10 hover:text-primary transition"
        >
          <span className="material-symbols-outlined text-[14px]">center_focus_strong</span>
        </button>
      )}
    </div>
  );
}

// Tiny uppercase section label with a trailing rule, used to split the Today
// widget into its Tasks and Habits groups.
function SectionDivider({ label }) {
  return (
    <div className="flex items-center gap-2 pt-2 pb-0.5 first:pt-0">
      <span className="text-label-sm uppercase tracking-widest text-on-surface-variant/60 font-bold">{label}</span>
      <span className="flex-1 h-px bg-outline-variant/20" />
    </div>
  );
}

function TodayEventRow({ event, onClick }) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick ? () => onClick(event) : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(event); } } : undefined}
      className={`flex items-center gap-2.5 py-2 px-1 -mx-1 border-b border-outline-variant/10 last:border-0 outline-none ${
        onClick ? 'cursor-pointer hover:bg-surface-container rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-primary/70' : ''
      }`}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: event.colour || 'rgb(var(--tb-primary))' }}
      />
      <span className="flex-1 min-w-0 text-body-md text-on-surface truncate">{event.title}</span>
      <span className="text-label-sm text-on-surface-variant flex-shrink-0 whitespace-nowrap">
        {event.all_day ? 'All day' : format(new Date(event.start_datetime), 'h:mm a')}
      </span>
    </div>
  );
}

// The whole of today in one card — calendar events first, then tasks due and
// habits. Lives in the Calendar group; the header opens the calendar. Rows
// navigate to their owning page on click (Calendar/Tasks/Routines) rather
// than opening an edit form in place — modals rendered from inside a grid
// widget lose fixed positioning because react-grid-layout positions cells
// with a CSS transform, which traps position:fixed children.
export function TodayAgendaWidget({ editing }) {
  const navigate = useNavigate();
  const today = format(new Date(), 'yyyy-MM-dd');
  const { toggle, busyId } = useHabitToggle(today);
  const { toggle: toggleTask, busyId: taskBusyId } = useTaskComplete();

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks-today'],
    queryFn: () => api.get('/tasks/today').then(r => r.data),
  });

  const { data: calData } = useQuery({
    queryKey: ['calendar', today, today, 'today-widget'],
    queryFn: () => api.get('/calendar', { params: { from: today, to: today, shared: 1 } }).then(r => r.data),
  });
  const events = calData?.events || [];

  const { data: protocols = [] } = useQuery({
    queryKey: ['routines', today],
    queryFn: () => api.get('/routines/protocols', { params: { date: today } }).then(r => r.data),
  });

  const habits = useMemo(() => {
    const out = [];
    for (const p of protocols) {
      for (const h of (p.habits || [])) out.push({ ...h, _color: p.color });
    }
    out.sort((a, b) =>
      (a.target_time || '').localeCompare(b.target_time || '') || a.sort_order - b.sort_order);
    return out;
  }, [protocols]);

  const groups = [
    { label: 'Events', items: events.map(e => <TodayEventRow key={`e-${e.id}`} event={e} onClick={() => navigate('/calendar')} />) },
    {
      label: 'Tasks',
      items: tasks.map(t => (
        <TaskRow
          key={`t-${t.id}`}
          task={t}
          onClick={() => navigate('/tasks')}
          onToggleComplete={toggleTask}
          busy={taskBusyId === t.id}
        />
      )),
    },
    {
      label: 'Habits',
      items: habits.map(h => (
        <WidgetHabitRow
          key={`h-${h.id}`}
          habit={h}
          color={h._color}
          onToggle={toggle}
          disabled={editing}
          busy={busyId === h.id}
          onClick={() => navigate('/routines')}
        />
      )),
    },
  ].filter(g => g.items.length > 0);

  const total = events.length + tasks.length + habits.length;

  return (
    <WidgetShell icon="today" title="Today" source="/calendar" editing={editing} count={total || null}>
      {groups.length === 0
        ? <WidgetEmpty label="Nothing due today!" />
        : groups.map(g => (
          <React.Fragment key={g.label}>
            <SectionDivider label={g.label} />
            {g.items}
          </React.Fragment>
        ))}
    </WidgetShell>
  );
}

export function OverdueWidget({ editing }) {
  const navigate = useNavigate();
  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks-overdue'],
    queryFn: () => api.get('/tasks/overdue').then(r => r.data),
  });
  return (
    <WidgetShell icon="warning" title="Overdue" source="/tasks" editing={editing}
      accent={tasks.length ? 'text-error' : 'text-on-surface-variant'} count={tasks.length || null}>
      {tasks.length === 0
        ? <WidgetEmpty label="No overdue items" />
        : tasks.map(t => <TaskRow key={t.id} task={t} onClick={() => navigate('/tasks')} />)}
    </WidgetShell>
  );
}

export function MyTasksWidget({ editing }) {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { toggle, busyId } = useTaskComplete();
  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', { assignedTo: user?.id, isCompleted: false, excludeSubTasks: true }],
    queryFn: () => api.get('/tasks', {
      params: { assignedTo: user?.id, isCompleted: false, excludeSubTasks: true },
    }).then(r => r.data),
    enabled: !!user?.id,
  });
  return (
    <WidgetShell icon="assignment" title="My Tasks" source="/tasks" editing={editing} count={tasks.length || null}>
      {tasks.length === 0
        ? <WidgetEmpty icon="assignment" label="No tasks assigned to you" />
        : tasks.map(t => (
          <TaskRow key={t.id} task={t} onClick={() => navigate('/tasks')} onToggleComplete={toggle} busy={busyId === t.id} />
        ))}
    </WidgetShell>
  );
}

export function UpcomingTasksWidget({ editing }) {
  const navigate = useNavigate();
  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks-upcoming'],
    queryFn: () => api.get('/tasks/upcoming').then(r => r.data),
  });
  return (
    <WidgetShell icon="event_upcoming" title="Upcoming" source="/tasks" editing={editing} count={tasks.length || null}>
      {tasks.length === 0
        ? <WidgetEmpty icon="event_available" label="Nothing in the next 7 days" />
        : tasks.map(t => <TaskRow key={t.id} task={t} onClick={() => navigate('/tasks')} />)}
    </WidgetShell>
  );
}

// `perspective="space"` swaps the third stat from the viewer's own open
// tasks to the space's total open tasks — used on the Hub, where every
// member sees the same board and a per-viewer "My Tasks" count would show a
// different number to each person looking at the same screen.
export function StatsWidget({ editing, perspective = 'personal' }) {
  const { user } = useAuthStore();
  const spaceWide = perspective === 'space';

  const { data: today = [] }   = useQuery({ queryKey: ['tasks-today'],   queryFn: () => api.get('/tasks/today').then(r => r.data) });
  const { data: overdue = [] } = useQuery({ queryKey: ['tasks-overdue'], queryFn: () => api.get('/tasks/overdue').then(r => r.data) });
  const { data: mine = [] } = useQuery({
    queryKey: spaceWide
      ? ['tasks', { isCompleted: false, excludeSubTasks: true }]
      : ['tasks', { assignedTo: user?.id, isCompleted: false, excludeSubTasks: true }],
    queryFn: () => api.get('/tasks', {
      params: spaceWide
        ? { isCompleted: false, excludeSubTasks: true }
        : { assignedTo: user?.id, isCompleted: false, excludeSubTasks: true },
    }).then(r => r.data),
    enabled: spaceWide || !!user?.id,
  });

  const stats = [
    { label: 'Due Today', value: today.length,   colour: 'text-primary' },
    { label: 'Overdue',   value: overdue.length, colour: overdue.length ? 'text-error' : 'text-on-surface-variant' },
    { label: spaceWide ? 'Open Tasks' : 'My Tasks', value: mine.length, colour: 'text-primary' },
  ];

  return (
    <WidgetShell icon="insights" title="Tasks At a Glance" source="/tasks" editing={editing}>
      <div className="h-full grid grid-cols-3 gap-2 items-center">
        {stats.map(s => (
          <div key={s.label} className="text-center">
            <p className={`text-headline-lg font-bold ${s.colour}`}>{s.value}</p>
            <p className="text-label-sm text-on-surface-variant uppercase tracking-wide">{s.label}</p>
          </div>
        ))}
      </div>
    </WidgetShell>
  );
}
