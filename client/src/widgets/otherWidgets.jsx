import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import { api } from '../auth/AuthContext';
import { useAuthStore } from '../store/authStore';
import WidgetShell, { WidgetEmpty } from './WidgetShell';
import { TIME_SLOTS } from '../pages/routines/shared';
import { useHabitToggle } from './useHabitToggle';

export function WelcomeWidget() {
  const { user } = useAuthStore();
  const { data: todayTasks = [] } = useQuery({
    queryKey: ['tasks-today'],
    queryFn: () => api.get('/tasks/today').then(r => r.data),
  });
  return (
    <div className="h-full flex flex-col justify-center bg-surface-container-lowest rounded-2xl shadow-soft border border-outline-variant/20 px-5">
      <h2 className="text-headline-lg text-on-background truncate">
        Hello, {user?.display_name?.split(' ')[0]} 👋
      </h2>
      <p className="text-body-md text-on-surface-variant mt-1 truncate">
        {todayTasks.length > 0
          ? `You have ${todayTasks.length} task${todayTasks.length !== 1 ? 's' : ''} due today.`
          : 'No tasks due today — you\'re all caught up!'}
      </p>
    </div>
  );
}

export function ActivityWidget({ editing }) {
  const { data: activity = [] } = useQuery({
    queryKey: ['activity'],
    queryFn: () => api.get('/activity').then(r => r.data),
  });
  return (
    <WidgetShell icon="bolt" title="Activity" editing={editing}>
      {activity.length === 0
        ? <WidgetEmpty icon="bolt" label="No recent activity" />
        : activity.slice(0, 30).map(item => (
          <div key={item.id} className="flex items-start gap-2.5 py-2 border-b border-outline-variant/10 last:border-0">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-label-sm font-bold flex-shrink-0 mt-0.5"
              style={{ backgroundColor: item.avatar_colour || '#6366f1' }}
            >
              {(item.display_name || '?')[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-body-md text-on-surface leading-snug line-clamp-2">{item.description}</p>
              <p className="text-label-sm text-on-surface-variant/70 mt-0.5">
                {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
              </p>
            </div>
          </div>
        ))}
    </WidgetShell>
  );
}

export function ProjectsWidget({ editing }) {
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then(r => r.data),
  });
  const active = projects.filter(p => p.status !== 'archived');
  return (
    <WidgetShell icon="folder_copy" title="Projects" source="/projects" editing={editing}>
      {active.length === 0
        ? <WidgetEmpty icon="folder_open" label="No active projects" />
        : active.slice(0, 8).map(p => {
          const pct = Math.round(p.progress ?? p.progress_override ?? 0);
          return (
            <div key={p.id} className="py-2 border-b border-outline-variant/10 last:border-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[16px] flex-shrink-0">{p.cover_icon || '📁'}</span>
                <span className="flex-1 min-w-0 text-body-md text-on-surface truncate">{p.name}</span>
                <span className="text-label-sm text-on-surface-variant flex-shrink-0">{pct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-container overflow-hidden">
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
    </WidgetShell>
  );
}

// `onClick`, when passed, makes the label (icon + title) navigate to the
// habit's source page — the checkbox stays a separate hit target so tapping
// it toggles completion instead of navigating away.
export function WidgetHabitRow({ habit, color, onToggle, disabled, busy, onClick }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <button
        type="button"
        onClick={() => onToggle(habit)}
        disabled={disabled || busy}
        aria-label={habit.completed ? 'Mark incomplete' : 'Mark complete'}
        className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition-[background-color,border-color,transform] duration-150 active:scale-[0.9] ${
          habit.completed ? 'border-transparent text-white' : 'border-outline hover:border-primary'
        }`}
        style={habit.completed ? { backgroundColor: color } : undefined}
      >
        {habit.completed && <span className="material-symbols-outlined text-[13px]">check</span>}
      </button>
      <div
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick ? () => onClick(habit) : undefined}
        onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(habit); } } : undefined}
        className={`flex items-center gap-1.5 flex-1 min-w-0 outline-none ${onClick ? 'cursor-pointer hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/70 rounded' : ''}`}
      >
        {habit.icon && <span className="text-[13px] flex-shrink-0">{habit.icon}</span>}
        <span className={`flex-1 min-w-0 text-body-md truncate ${habit.completed ? 'text-on-surface-variant line-through' : 'text-on-surface'}`}>
          {habit.title}
        </span>
      </div>
    </div>
  );
}

function WidgetTimeSlotSection({ slot, habits, onToggle, disabled, busyId }) {
  return (
    <div className="py-2 border-b border-outline-variant/10 last:border-0">
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-[13px] leading-none">{slot.emoji}</span>
        <span className="text-label-sm uppercase tracking-wider text-on-surface-variant/70 font-bold">{slot.label}</span>
      </div>
      {habits.length === 0 ? (
        <p className="text-label-sm text-on-surface-variant/40 pl-5 py-1">Nothing scheduled</p>
      ) : (
        habits.map(h => (
          <WidgetHabitRow
            key={h.id}
            habit={h}
            color={h._color}
            onToggle={onToggle}
            disabled={disabled}
            busy={busyId === h.id}
          />
        ))
      )}
    </div>
  );
}

export function RoutinesWidget({ editing }) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const { toggle, busyId } = useHabitToggle(today);

  const { data: protocols = [] } = useQuery({
    queryKey: ['routines', today],
    queryFn: () => api.get('/routines/protocols', { params: { date: today } }).then(r => r.data),
  });

  const bySlot = useMemo(() => {
    const map = Object.fromEntries(TIME_SLOTS.map(s => [s.key, []]));
    for (const p of protocols) {
      for (const h of (p.habits || [])) {
        const slot = map[h.time_slot] ? h.time_slot : 'morning';
        map[slot].push({ ...h, _color: p.color });
      }
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (a.target_time || '').localeCompare(b.target_time || '') || a.sort_order - b.sort_order);
    }
    return map;
  }, [protocols]);

  const hasAny = protocols.some(p => (p.habits || []).length > 0);

  return (
    <WidgetShell icon="repeat" title="Routines" source="/routines" editing={editing}>
      {!hasAny
        ? <WidgetEmpty icon="repeat" label="No habits yet" />
        : TIME_SLOTS.map(slot => (
          <WidgetTimeSlotSection
            key={slot.key}
            slot={slot}
            habits={bySlot[slot.key]}
            onToggle={toggle}
            disabled={editing}
            busyId={busyId}
          />
        ))}
    </WidgetShell>
  );
}

export function EventsWidget({ editing }) {
  const range = (() => {
    const from = new Date();
    const to = new Date(Date.now() + 14 * 86400000);
    return { from: from.toISOString().split('T')[0], to: to.toISOString().split('T')[0] };
  })();
  const { data } = useQuery({
    queryKey: ['calendar', range.from, range.to, 'widget'],
    queryFn: () => api.get('/calendar', { params: { from: range.from, to: range.to, shared: 1 } }).then(r => r.data),
  });
  const events = (data?.events || []).slice(0, 10);
  return (
    <WidgetShell icon="calendar_today" title="Upcoming Events" source="/calendar" editing={editing}>
      {events.length === 0
        ? <WidgetEmpty icon="event_available" label="No events coming up" />
        : events.map(e => (
          <div key={e.id} className="flex items-center gap-2.5 py-2 border-b border-outline-variant/10 last:border-0">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: e.colour || '#6366f1' }} />
            <span className="flex-1 min-w-0 text-body-md text-on-surface truncate">{e.title}</span>
            <span className="text-label-sm text-on-surface-variant flex-shrink-0 whitespace-nowrap">
              {format(new Date(e.start_datetime), e.all_day ? 'MMM d' : 'MMM d, h:mm a')}
            </span>
          </div>
        ))}
    </WidgetShell>
  );
}

export function NotesWidget({ editing }) {
  const navigate = useNavigate();
  // Recent notes via the cross-notebook search endpoint (empty query = recents).
  const { data: notes = [] } = useQuery({
    queryKey: ['notes-recent'],
    queryFn: () => api.get('/notes/search', { params: { q: '' } }).then(r => r.data).catch(() => []),
  });
  const list = Array.isArray(notes) ? notes : (notes?.results || []);
  const openNote = (n) => navigate(`/notebooks/${n.notebook_id}/${n.id}`);
  return (
    <WidgetShell icon="menu_book" title="Notebooks" source="/notebooks" editing={editing} count={list.length || null}>
      {list.length === 0
        ? <WidgetEmpty icon="menu_book" label="No notes yet" />
        : list.slice(0, 10).map(n => (
          <div
            key={n.id}
            role="button"
            tabIndex={editing ? -1 : 0}
            onClick={editing ? undefined : () => openNote(n)}
            onKeyDown={(e) => { if (!editing && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openNote(n); } }}
            className={`py-2 border-b border-outline-variant/10 last:border-0 outline-none rounded-lg
              ${editing ? '' : 'cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/70'}`}
          >
            <p className="text-body-md text-on-surface truncate">{n.title || 'Untitled'}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {n.notebook_name && (
                <span className="text-label-sm text-on-surface-variant flex items-center gap-1.5 min-w-0">
                  <span
                    className="w-2 h-2 rounded-[3px] flex-shrink-0"
                    style={{ backgroundColor: n.notebook_colour || 'rgb(var(--tb-primary))' }}
                  />
                  <span className="truncate">{n.notebook_icon ? `${n.notebook_icon} ` : ''}{n.notebook_name}</span>
                </span>
              )}
              {n.updated_at && (
                <span className="text-label-sm text-on-surface-variant/60 flex-shrink-0 ml-auto">
                  {formatDistanceToNow(new Date(n.updated_at), { addSuffix: true })}
                </span>
              )}
            </div>
          </div>
        ))}
    </WidgetShell>
  );
}
