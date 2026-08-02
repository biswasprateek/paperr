import React, { useMemo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday,
} from 'date-fns';
import { api } from '../auth/AuthContext';
import WidgetShell from './WidgetShell';
import CalendarEventChip from '../pages/calendar/CalendarEventChip';
import HabitDivider from '../pages/calendar/HabitDivider';
import NowLine from '../pages/calendar/NowLine';
import { useHabitToggle } from './useHabitToggle';
import { groupBySlot, TIME_SLOTS, SLOT_START_HOUR } from '../utils/timeSlots';
import { buildHourOffsets, minutesToTop } from '../utils/hourOffsets';
import { layoutOverlaps } from '../utils/overlapLayout';

// Adaptive Calendar widget — Day/Week/Month view chosen by grid footprint, so
// resizing it (the widget board's own resize handle) behaves like switching
// tabs on the real Calendar page. Cells mirror MonthView's structure (date
// circle + stacked CalendarEventChip + overflow count) so the widget reads
// as a shrunken version of the actual calendar rather than a bespoke look.
const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function dateKey(d) {
  return format(d, 'yyyy-MM-dd');
}

// w*h in grid cells → which view fits. 1 cell is too small for a 7-column
// grid at all, 2 cells (a 1x2 or 2x1) fits one week, 3+ fits a full month.
function modeForSize(w, h) {
  const cells = w * h;
  if (cells <= 1) return 'day';
  if (cells <= 2) return 'week';
  return 'month';
}

// Deadlines (task due_date) + events, grouped by date — the same shape
// MonthView builds, minus scheduled time-blocks (there's no hour grid here
// to place them on).
function groupByDate(tasks, events) {
  const map = {};
  const add = (dateStr, entry) => {
    if (!dateStr) return;
    const key = dateStr.slice(0, 10);
    (map[key] ||= []).push(entry);
  };
  for (const t of tasks) {
    if (t.parent_task_id) continue;
    if (t.due_date) add(t.due_date, { type: 'task', item: t, variant: 'deadline' });
  }
  for (const e of events) {
    const start = e.start_datetime.slice(0, 10);
    const end = (e.end_datetime ?? e.start_datetime).slice(0, 10);
    let cur = start;
    while (cur <= end) {
      add(cur, { type: 'event', item: e });
      const d = new Date(cur + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      cur = format(d, 'yyyy-MM-dd');
    }
  }
  const ORDER = { event: 0, task: 1 };
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => {
      if (ORDER[a.type] !== ORDER[b.type]) return ORDER[a.type] - ORDER[b.type];
      const at = a.type === 'event' ? a.item.start_datetime : a.item.due_date;
      const bt = b.type === 'event' ? b.item.start_datetime : b.item.due_date;
      return (at || '').localeCompare(bt || '');
    });
  }
  return map;
}

function MiniDayCell({ day, idx, inMonth, entries, maxVisible, disabled, onDayClick }) {
  const today = isToday(day);
  const visible = entries.slice(0, maxVisible);
  const overflow = entries.length - visible.length;

  return (
    <div className={`min-w-0 border-b border-r border-outline-variant/15 p-1 flex flex-col gap-0.5
      ${idx % 7 === 0 ? 'border-l' : ''} ${!inMonth ? 'bg-surface-container/30' : ''}`}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => onDayClick(dateKey(day))}
        className={`self-start w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-medium transition
          ${today ? 'bg-primary text-on-primary' : inMonth ? 'text-on-surface hover:bg-surface-container' : 'text-on-surface-variant/40'}`}
      >
        {format(day, 'd')}
      </button>
      <div className="flex flex-col gap-0.5 min-w-0">
        {visible.map(({ type, item, variant }, i) => (
          <CalendarEventChip
            key={`${type}-${item.id}-${i}`}
            type={type}
            item={item}
            variant={variant}
            maxLines={1}
            onClick={disabled ? undefined : () => onDayClick(dateKey(day))}
          />
        ))}
        {overflow > 0 && (
          <span className="text-[9px] text-primary font-medium pl-1">+{overflow}</span>
        )}
      </div>
    </div>
  );
}

function WeekdayHeaderRow({ days }) {
  return (
    <div className="grid grid-cols-7 border-b border-outline-variant/15 pb-1 mb-1 shrink-0">
      {days.map((day, i) => (
        <div key={i} className="text-[9px] font-bold text-on-surface-variant/60 uppercase text-center">
          {WEEKDAY_LETTERS[day.getDay()]}
        </div>
      ))}
    </div>
  );
}

// ── Schedule variant ───────────────────────────────────────────────────────
// A compact, read-only clone of the Calendar page's Day timeline: an hour grid
// with time-of-day habit-section dividers (checkable) interleaved at their
// start hour, and timed events/task-blocks positioned on top. Shares the exact
// offset math (buildHourOffsets/minutesToTop) and HabitDivider with DayView so
// it reads as the same view, minus DayView's drag-drop, weather and side rail.
const SCHED_HOUR_HEIGHT = 48;
const SCHED_DIVIDER_HEIGHT = 34;

function toMinutes(dt) {
  if (!dt) return 0;
  const d = new Date(dt);
  return d.getHours() * 60 + d.getMinutes();
}

function sameOffsets(a, b) {
  if (!a) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => a[k] === b[k]);
}

function ScheduleView({ dayKey, tasks, events, habitsBySlot, onToggleHabit, onOpen }) {
  const timed = useMemo(() => {
    const out = [];
    for (const t of tasks) {
      if (t.start_at && t.start_at.slice(0, 10) === dayKey) {
        const m = toMinutes(t.start_at);
        const em = t.end_at ? toMinutes(t.end_at) : m + 30;
        out.push({ type: t.parent_task_id ? 'subtask' : 'task', item: t, variant: 'block', minutes: m, endMinutes: Math.max(em, m + 15) });
      }
    }
    for (const e of events) {
      const s = e.start_datetime.slice(0, 10);
      const en = (e.end_datetime ?? e.start_datetime).slice(0, 10);
      if (s > dayKey || en < dayKey || e.all_day) continue;
      const m = toMinutes(e.start_datetime);
      const em = e.end_datetime ? toMinutes(e.end_datetime) : m + 60;
      out.push({ type: 'event', item: e, minutes: m, endMinutes: Math.max(em, m + 15) });
    }
    out.sort((a, b) => a.minutes - b.minutes);
    return out;
  }, [dayKey, tasks, events]);

  const activeSlots = useMemo(
    () => TIME_SLOTS.filter(s => (habitsBySlot[s.key]?.length ?? 0) > 0),
    [habitsBySlot],
  );
  const hourToSlotKey = useMemo(() => {
    const map = {};
    activeSlots.forEach(s => { map[SLOT_START_HOUR[s.key]] = s.key; });
    return map;
  }, [activeSlots]);

  const { startHour, endHour } = useMemo(() => {
    let start = 8, end = 22;
    timed.forEach(({ minutes }) => { const hh = Math.floor(minutes / 60); if (hh < start) start = hh; if (hh + 1 > end) end = hh + 1; });
    activeSlots.forEach(s => { const hh = SLOT_START_HOUR[s.key]; if (hh < start) start = hh; if (hh + 1 > end) end = hh + 1; });
    return { startHour: start, endHour: end };
  }, [timed, activeSlots]);

  const visibleHours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const dividerHours = useMemo(
    () => Object.keys(hourToSlotKey).map(Number).sort((a, b) => a - b),
    [hourToSlotKey],
  );
  const layout = useMemo(() => layoutOverlaps(timed, it => it.minutes, it => it.endMinutes), [timed]);

  // Habit dividers wrap to show every habit, so their height is variable and
  // unknown ahead of render. Measure each hour row's real offsetTop (which the
  // browser lays out below any preceding divider) and position timed items +
  // now-line against that; re-measure on width change (rewrapping) via observer.
  // buildHourOffsets gives a fixed-height estimate for the pre-measurement paint.
  const wrapRef = useRef(null);
  const hourRefs = useRef({});
  const estimate = useMemo(
    () => buildHourOffsets(visibleHours, dividerHours, SCHED_DIVIDER_HEIGHT, SCHED_HOUR_HEIGHT).offsetForHour,
    [visibleHours, dividerHours],
  );
  const [measured, setMeasured] = useState(null);
  const offsets = measured ?? estimate;

  const sig = visibleHours.map(hh => `${hh}:${habitsBySlot[hourToSlotKey[hh]]?.length ?? ''}`).join('|');
  useLayoutEffect(() => {
    const host = wrapRef.current;
    if (!host) return;
    const measure = () => {
      const map = {};
      for (const hh of visibleHours) {
        const row = hourRefs.current[hh];
        if (row) map[hh] = row.offsetTop;
      }
      setMeasured(prev => (sameOffsets(prev, map) ? prev : map));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  // Auto-scroll the widget body so the current time sits centred, once offsets
  // are measured / the hour range settles.
  const nowRef = useRef(null);
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const showNow = format(new Date(), 'yyyy-MM-dd') === dayKey
    && nowMinutes >= startHour * 60 && nowMinutes < endHour * 60;
  const nowTop = showNow ? minutesToTop(nowMinutes, offsets, SCHED_HOUR_HEIGHT, startHour) : null;
  useEffect(() => {
    nowRef.current?.scrollIntoView({ block: 'center' });
  }, [startHour, endHour, measured]);

  // Push an item's header/title down past a divider band that sits right at
  // its top — the band paints above items, so without this the header would
  // render underneath it and be invisible. Divider height here is variable
  // (habits wrap), so read the real gap from measured offsets rather than a
  // constant, unlike the fixed-height contentPadForDivider used elsewhere.
  function contentPadFor(minutes, endMinutes, itemTop) {
    for (const dh of dividerHours) {
      if (dh * 60 <= minutes || dh * 60 >= endMinutes) continue;
      const dividerTop = offsets[dh - 1] != null ? offsets[dh - 1] + SCHED_HOUR_HEIGHT : offsets[dh];
      return (dividerTop - itemTop < 32) ? Math.max(0, offsets[dh] - itemTop) : 0;
    }
    return 0;
  }

  return (
    <div ref={wrapRef} className="relative">
      {nowTop != null && <div ref={nowRef} className="absolute w-px" style={{ top: `${nowTop}px` }} />}
      {visibleHours.map(hh => (
        <React.Fragment key={hh}>
          {hourToSlotKey[hh] && (
            // z-20 lifts the section band above the z-10 event overlay, so a
            // chip that spans across it is visually interrupted by the divider
            // rather than covering the divider's label and habit checkboxes.
            <div className="relative z-20">
              <HabitDivider
                slotKey={hourToSlotKey[hh]}
                habits={habitsBySlot[hourToSlotKey[hh]] || []}
                onToggle={onToggleHabit}
                wrap
              />
            </div>
          )}
          <div
            ref={el => { hourRefs.current[hh] = el; }}
            className="flex border-b border-outline-variant/10"
            style={{ height: SCHED_HOUR_HEIGHT }}
          >
            <div className="w-10 text-[10px] text-on-surface-variant text-right pr-1.5 pt-0.5 shrink-0 select-none">{`${hh}:00`}</div>
            <div className="flex-1" />
          </div>
        </React.Fragment>
      ))}

      {/* pointer-events-none so an item that visually reaches a divider doesn't
          swallow clicks meant for the divider's habit chips; re-enabled per item. */}
      <div className="absolute left-10 right-0 top-0 bottom-0 pointer-events-none">
        <NowLine dayKey={dayKey} startHour={startHour} endHour={endHour} hourHeight={SCHED_HOUR_HEIGHT} offsetForHour={offsets} />
        {timed.map(({ type, item, variant, minutes, endMinutes }, i) => {
          const { col, cols } = layout[i];
          const top = minutesToTop(minutes, offsets, SCHED_HOUR_HEIGHT, startHour);
          // An end time landing exactly on an hour that carries a habit divider
          // must sit at the divider's top, not below it — otherwise the chip
          // spills across the divider and over its checkboxes. Use the prior
          // hour's bottom, which is the divider's top (or, when there's no
          // divider, identical to this hour's offset anyway).
          const eh = Math.floor(endMinutes / 60);
          const bottom = endMinutes % 60 === 0 && offsets[eh - 1] != null
            ? offsets[eh - 1] + SCHED_HOUR_HEIGHT
            : minutesToTop(endMinutes, offsets, SCHED_HOUR_HEIGHT, startHour);
          const contentPad = contentPadFor(minutes, endMinutes, top);
          return (
            <div
              key={`${type}-${item.id}-${i}`}
              className="absolute z-10 pointer-events-auto"
              style={{
                top: `${top}px`,
                height: `${Math.max(bottom - top, 20)}px`,
                left: `calc(${(col / cols) * 100}% + 2px)`,
                width: `calc(${100 / cols}% - 4px)`,
              }}
            >
              <CalendarEventChip type={type} item={item} variant={variant} fill contentTopPad={contentPad} onClick={onOpen} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CalendarWidget({ editing, w = 2, h = 2 }) {
  const navigate = useNavigate();
  const mode = modeForSize(w, h);
  const today = useMemo(() => new Date(), []);
  const todayKey = dateKey(today);

  const range = useMemo(() => {
    if (mode === 'day') return { from: todayKey, to: todayKey };
    if (mode === 'week') {
      return {
        from: dateKey(startOfWeek(today, { weekStartsOn: 1 })),
        to: dateKey(endOfWeek(today, { weekStartsOn: 1 })),
      };
    }
    return {
      from: dateKey(startOfWeek(startOfMonth(today), { weekStartsOn: 1 })),
      to: dateKey(endOfWeek(endOfMonth(today), { weekStartsOn: 1 })),
    };
  }, [mode, today, todayKey]);

  const { data } = useQuery({
    queryKey: ['calendar', range.from, range.to, 'calendar-widget'],
    queryFn: () => api.get('/calendar', { params: { from: range.from, to: range.to, shared: 1 } }).then(r => r.data),
  });
  const tasks = data?.tasks ?? [];
  const events = data?.events ?? [];
  const byDate = useMemo(() => groupByDate(tasks, events), [tasks, events]);
  // Computed unconditionally (unused in 'day' mode) so hook order stays
  // stable across resizes, which change `mode` without remounting the widget.
  const days = useMemoDays(today, mode);

  const goToDay = (dateStr) => { if (!editing) navigate(`/calendar/day/${dateStr}`); };

  let title = 'Today';
  let body;

  if (mode === 'day') {
    const entries = byDate[todayKey] || [];
    body = entries.length === 0 ? (
      <div className="h-full flex flex-col items-center justify-center text-on-surface-variant py-4">
        <span className="material-symbols-outlined text-2xl mb-1">event_available</span>
        <p className="text-label-md text-center">Nothing on the calendar today</p>
      </div>
    ) : (
      <div className="flex flex-col gap-1">
        {entries.map(({ type, item, variant }, i) => (
          <CalendarEventChip
            key={`${type}-${item.id}-${i}`}
            type={type}
            item={item}
            variant={variant}
            maxLines={2}
            onClick={editing ? undefined : () => goToDay(todayKey)}
          />
        ))}
      </div>
    );
  } else if (mode === 'week') {
    title = 'This Week';
    body = (
      <div className="h-full flex flex-col">
        <WeekdayHeaderRow days={days} />
        <div className="grid grid-cols-7 flex-1">
          {days.map((day, idx) => (
            <MiniDayCell
              key={dateKey(day)}
              day={day}
              idx={idx}
              inMonth
              entries={byDate[dateKey(day)] || []}
              maxVisible={1}
              disabled={editing}
              onDayClick={goToDay}
            />
          ))}
        </div>
      </div>
    );
  } else {
    title = format(today, 'MMMM yyyy');
    const maxVisible = h >= 3 ? 2 : 1;
    body = (
      <div className="h-full flex flex-col">
        <WeekdayHeaderRow days={days.slice(0, 7)} />
        <div className="grid grid-cols-7 flex-1">
          {days.map((day, idx) => (
            <MiniDayCell
              key={dateKey(day)}
              day={day}
              idx={idx}
              inMonth={isSameMonth(day, today)}
              entries={byDate[dateKey(day)] || []}
              maxVisible={maxVisible}
              disabled={editing}
              onDayClick={goToDay}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <WidgetShell icon="calendar_month" title={title} source="/calendar" editing={editing}>
      {body}
    </WidgetShell>
  );
}

// Standalone Schedule widget — the Calendar page's Day timeline (hour grid with
// time-of-day habit dividers + timed events/blocks), fixed to today. A distinct
// catalog entry rather than a mode of CalendarWidget.
export function ScheduleWidget({ editing }) {
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);
  const todayKey = dateKey(today);

  const { data } = useQuery({
    queryKey: ['calendar', todayKey, todayKey, 'schedule-widget'],
    queryFn: () => api.get('/calendar', { params: { from: todayKey, to: todayKey, shared: 1 } }).then(r => r.data),
  });
  const tasks = data?.tasks ?? [];
  const events = data?.events ?? [];

  const { toggle: toggleHabit } = useHabitToggle(todayKey);
  const { data: protocols = [] } = useQuery({
    queryKey: ['routines', todayKey],
    queryFn: () => api.get('/routines/protocols', { params: { date: todayKey } }).then(r => r.data),
  });
  const habitsBySlot = useMemo(() => groupBySlot(
    protocols.flatMap(p => (p.habits || []).map(hb => ({ ...hb, protocol_color: p.color }))),
  ), [protocols]);

  const openDay = editing ? undefined : () => navigate(`/calendar/day/${todayKey}`);

  return (
    <WidgetShell icon="calendar_view_day" title="Today" source="/calendar" editing={editing}>
      <ScheduleView
        dayKey={todayKey}
        tasks={tasks}
        events={events}
        habitsBySlot={habitsBySlot}
        onToggleHabit={editing ? () => {} : toggleHabit}
        onOpen={openDay}
      />
    </WidgetShell>
  );
}

// Small helper kept outside the component body's conditional branches would
// violate the rules of hooks, so week/month both call this — same hook order
// every render since `mode` only changes via a resize (full remount of the
// widget's position in the grid, not a branch within one render).
function useMemoDays(today, mode) {
  return useMemo(() => {
    if (mode === 'week') {
      const start = startOfWeek(today, { weekStartsOn: 1 });
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        return d;
      });
    }
    const start = startOfWeek(startOfMonth(today), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(today), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [today, mode]);
}

export default CalendarWidget;
