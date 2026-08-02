import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  format, parseISO, addDays, differenceInCalendarDays,
} from 'date-fns';
import { api } from '../auth/AuthContext';
import { useCelebrationStore } from '../store/celebrationStore';
import { useMode } from '../hooks/useMode';
import { groupBySlot } from '../utils/timeSlots';
import { formatTime } from '../utils/time';

import CalendarHeader from './calendar/CalendarHeader';
import MonthView from './calendar/MonthView';
import WeekView from './calendar/WeekView';
import DayView from './calendar/DayView';
import AgendaView from './calendar/AgendaView';
import EventForm from './calendar/EventForm';
import TaskForm from '../components/TaskForm';

function getRange(view, date) {
  if (view === 'month' || view === 'agenda') {
    const s = startOfMonth(date);
    const e = endOfMonth(date);
    return {
      from: format(startOfWeek(s, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
      to:   format(endOfWeek(e,   { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    };
  }
  if (view === 'week') {
    return {
      from: format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
      to:   format(endOfWeek(date,   { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    };
  }
  const key = format(date, 'yyyy-MM-dd');
  return { from: key, to: key };
}

export default function Calendar() {
  const { view: viewParam, date: dateParam } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isShared = searchParams.get('shared') === '1';
  const { isTouch } = useMode();

  // Day is the default landing view across all device sizes.
  const view = viewParam || 'day';
  const date = dateParam ? parseISO(dateParam) : new Date();
  const { from, to } = getRange(view, date);

  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['calendar', from, to, isShared],
    queryFn: () =>
      api.get('/calendar', { params: { from, to, shared: isShared ? '1' : undefined } })
         .then(r => r.data),
    staleTime: 60_000,
  });

  const tasks  = data?.tasks  ?? [];
  const events = data?.events ?? [];

  // ── Habits (Day view: single date via /routines/protocols; Week view: whole
  //    range in one call via /routines/habits/range) ─────────────────────────
  const dayKeyStr = format(date, 'yyyy-MM-dd');

  // Habits are personal — the shared view shows only shared calendar events
  // and tasks, so skip fetching (and rendering) habits there entirely.
  const showHabits = !isShared;

  const { data: dayProtocols } = useQuery({
    queryKey: ['habits-day', dayKeyStr],
    queryFn: () => api.get('/routines/protocols', { params: { date: dayKeyStr } }).then(r => r.data),
    enabled: view === 'day' && showHabits,
    staleTime: 60_000,
  });

  const habitsBySlot = useMemo(() => {
    if (!dayProtocols || isShared) return {};
    const flat = dayProtocols.flatMap(p =>
      (p.habits || []).map(h => ({ ...h, protocol_color: p.color })));
    return groupBySlot(flat);
  }, [dayProtocols, isShared]);

  const { data: habitsByDate } = useQuery({
    queryKey: ['habits-range', from, to],
    queryFn: () => api.get('/routines/habits/range', { params: { from, to } }).then(r => r.data),
    enabled: view === 'week' && showHabits,
    staleTime: 60_000,
  });

  const toggleHabit = useMutation({
    mutationFn: ({ id, date: onDate, completed }) => completed
      ? api.delete(`/routines/habits/${id}/complete`, { params: { date: onDate } })
      : api.post(`/routines/habits/${id}/complete`, { date: onDate }),
    onSuccess: (_data, { completed }) => {
      qc.invalidateQueries({ queryKey: ['habits-day'] });
      qc.invalidateQueries({ queryKey: ['habits-range'] });
      if (!completed) useCelebrationStore.getState().fire();
    },
  });

  function handleToggleHabit(habit) {
    toggleHabit.mutate({ id: habit.id, date: habit._date ?? dayKeyStr, completed: habit.completed });
  }

  // ── "Up next" rail (Day/Week/Month): nearest upcoming items from today,
  //    independent of whichever range is currently in view ───────────────────
  const upcomingFrom = format(new Date(), 'yyyy-MM-dd');
  const upcomingTo   = format(addDays(new Date(), 13), 'yyyy-MM-dd');

  const { data: upcomingData } = useQuery({
    queryKey: ['calendar-upcoming', upcomingFrom, upcomingTo, isShared],
    queryFn: () =>
      api.get('/calendar', { params: { from: upcomingFrom, to: upcomingTo, shared: isShared ? '1' : undefined } })
         .then(r => r.data),
    enabled: view !== 'agenda',
    staleTime: 60_000,
  });

  const upcomingItems = useMemo(() => {
    if (!upcomingData) return [];
    // The API range starts at today's *date*, so it still returns items from
    // earlier today (and stale cache can hold yesterday's across midnight).
    // Filter by actual current time: timed items drop once they end; date-only
    // items stay through their whole day.
    const nowStr   = format(new Date(), "yyyy-MM-dd'T'HH:mm");
    const todayStr = nowStr.slice(0, 10);
    const items = [];
    for (const t of upcomingData.tasks) {
      if (t.is_completed) continue;
      const type = t.parent_task_id ? 'subtask' : 'task';
      // Deadline (all-day, top-level tasks only)
      if (!t.parent_task_id && t.due_date && t.due_date.slice(0, 10) >= todayStr) {
        items.push({
          id: `task-dl-${t.id}`, type, title: t.title,
          sortKey: t.due_date, dateStr: t.due_date.slice(0, 10), time: null, color: null,
        });
      }
      // Scheduled time block
      if (t.start_at && t.start_at.slice(0, 16) >= nowStr) {
        items.push({
          id: `task-blk-${t.id}`, type, title: t.title,
          sortKey: t.start_at, dateStr: t.start_at.slice(0, 10), time: formatTime(t.start_at), color: null,
        });
      }
    }
    for (const e of upcomingData.events) {
      const endsAt = e.end_datetime ?? e.start_datetime;
      if (e.all_day || !endsAt.includes('T')) {
        if (endsAt.slice(0, 10) < todayStr) continue;
      } else if (endsAt.slice(0, 16) < nowStr) continue;
      items.push({
        id: `event-${e.id}`,
        type: 'event',
        title: e.title,
        sortKey: e.start_datetime,
        dateStr: e.start_datetime.slice(0, 10),
        time: e.all_day ? null : formatTime(e.start_datetime),
        color: e.colour || null,
      });
    }
    items.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    return items.slice(0, 6);
  }, [upcomingData]);

  // ── Modal state ───────────────────────────────────────────────────────────
  const [taskForm, setTaskForm]   = useState({ open: false, task: null });
  const [eventForm, setEventForm] = useState({ open: false, event: null, defaultDate: null });

  // Subtasks don't get their own edit modal — clicking one on the calendar opens
  // its parent task instead, since that's where the subtask actually lives (with
  // its siblings, comments, etc.). The clicked item is often just the subtask's
  // calendar-range row, so fetch the parent fresh rather than assume it's loaded.
  async function openTask(task) {
    if (task.parent_task_id) {
      try {
        const { data: parent } = await api.get(`/tasks/${task.parent_task_id}`);
        setTaskForm({ open: true, task: parent });
        return;
      } catch (err) {
        console.error('Failed to load parent task:', err);
      }
    }
    setTaskForm({ open: true, task });
  }
  function openEvent(ev)             { setEventForm({ open: true, event: ev, defaultDate: null }); }
  function openEventForDate(dateStr) { setEventForm({ open: true, event: null, defaultDate: dateStr }); }

  // Drag-and-drop move handler
  const handleItemMove = useCallback(async ({ type, item, variant, newDatetime }) => {
    // Month view drops are date-only ("YYYY-MM-DD"); day/week drops include time ("YYYY-MM-DDTHH:MM")
    const isDateOnly = !newDatetime.includes('T');
    const newDatePart = newDatetime.slice(0, 10);

    try {
      if (type === 'event') {
        if (item.all_day) {
          // All-day event: shift both dates by the same day offset, no time added
          const oldStart = item.start_datetime.slice(0, 10);
          const oldEnd   = item.end_datetime ? item.end_datetime.slice(0, 10) : oldStart;
          const dayDelta = differenceInCalendarDays(
            new Date(newDatePart + 'T00:00:00'),
            new Date(oldStart   + 'T00:00:00'),
          );
          await api.put(`/calendar/events/${item.id}`, {
            start_datetime: newDatePart,
            end_datetime:   format(addDays(new Date(oldEnd + 'T00:00:00'), dayDelta), 'yyyy-MM-dd'),
          });
        } else {
          // Timed event: preserve duration; if dropped on date-only, keep original time
          const existingTime = item.start_datetime.includes('T')
            ? item.start_datetime.slice(11, 16)
            : '09:00';
          const newStart = isDateOnly ? `${newDatePart}T${existingTime}` : newDatetime;
          const durationMs = item.end_datetime
            ? new Date(item.end_datetime) - new Date(item.start_datetime)
            : 60 * 60 * 1000;
          const newEnd = new Date(new Date(newStart).getTime() + durationMs);
          await api.put(`/calendar/events/${item.id}`, {
            start_datetime: newStart,
            end_datetime:   newEnd.toISOString().slice(0, 16),
          });
        }
      } else if (type === 'task' || type === 'subtask') {
        if (variant === 'block') {
          // Move the scheduled time block, preserving its duration.
          const durationMs = item.end_at && item.start_at
            ? new Date(item.end_at) - new Date(item.start_at)
            : 30 * 60 * 1000;
          let newStart;
          if (isDateOnly) {
            // Month-view drop: keep the block's time-of-day, change its date.
            const time = item.start_at?.includes('T') ? item.start_at.slice(11, 16) : '09:00';
            newStart = `${newDatePart}T${time}`;
          } else {
            newStart = newDatetime;
          }
          const newEnd = format(new Date(new Date(newStart).getTime() + durationMs), "yyyy-MM-dd'T'HH:mm");
          await api.put(`/tasks/${item.id}`, { start_at: newStart, end_at: newEnd });
        } else {
          // Deadline chip: always date-only.
          await api.put(`/tasks/${item.id}`, { due_date: newDatePart });
        }
      }
      qc.invalidateQueries({ queryKey: ['calendar'] });
    } catch (err) {
      console.error('Failed to move item:', err);
    }
  }, [qc]);

  // Layout-level "New Event" button dispatches this event
  useEffect(() => {
    const handler = () => openEventForDate(format(new Date(), 'yyyy-MM-dd'));
    window.addEventListener('calendar:new-event', handler);
    return () => window.removeEventListener('calendar:new-event', handler);
  }, []);

  // ── Navigation helpers ────────────────────────────────────────────────────
  function buildSuffix() {
    const qs = searchParams.toString();
    return qs ? '?' + qs : '';
  }

  function handleViewChange(newView) {
    navigate(`/calendar/${newView}/${format(date, 'yyyy-MM-dd')}${buildSuffix()}`);
  }

  function handleDateChange(newDate) {
    navigate(`/calendar/${view}/${format(newDate, 'yyyy-MM-dd')}${buildSuffix()}`);
  }

  function handleDayClick(dateStr) {
    navigate(`/calendar/day/${dateStr}${buildSuffix()}`);
  }

  const sharedProps = {
    date, tasks, events, isShared, from, to,
    onTaskClick:   openTask,
    onEventClick:  openEvent,
    onEventCreate: openEventForDate,
    onItemMove:    handleItemMove,
    onDateChange:  handleDateChange,
  };

  return (
    <div className="flex flex-col h-full bg-surface overflow-hidden">
      <div className="max-w-7xl mx-auto w-full flex flex-col h-full">

      <CalendarHeader
        view={view}
        date={date}
        touch={isTouch}
        onViewChange={handleViewChange}
        onDateChange={handleDateChange}
        onNewEvent={() => openEventForDate(format(new Date(), 'yyyy-MM-dd'))}
      />

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="material-symbols-outlined text-primary animate-spin text-4xl">
            progress_activity
          </span>
        </div>
      ) : (
        <>
          {view === 'month'  && <MonthView  {...sharedProps} onDayClick={handleDayClick} upcomingItems={upcomingItems} />}
          {view === 'week'   && <WeekView   {...sharedProps} habitsByDate={showHabits ? (habitsByDate ?? {}) : {}} onToggleHabit={handleToggleHabit} onDayClick={handleDayClick} upcomingItems={upcomingItems} />}
          {view === 'day'    && <DayView    {...sharedProps} habitsBySlot={habitsBySlot} onToggleHabit={handleToggleHabit} onDayClick={handleDayClick} upcomingItems={upcomingItems} />}
          {view === 'agenda' && <AgendaView {...sharedProps} onDayClick={handleDayClick} />}
        </>
      )}

      </div>

      <TaskForm
        open={taskForm.open}
        onClose={() => setTaskForm(s => ({ ...s, open: false }))}
        task={taskForm.task}
      />

      <EventForm
        open={eventForm.open}
        onClose={() => setEventForm(s => ({ ...s, open: false }))}
        event={eventForm.event}
        defaultDate={eventForm.defaultDate}
      />

    </div>
  );
}
