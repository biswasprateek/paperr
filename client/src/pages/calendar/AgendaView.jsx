import React, { useMemo } from 'react';
import { eachDayOfInterval, format, isToday, parseISO } from 'date-fns';
import CalendarEventChip from './CalendarEventChip';

function dateKey(d) {
  return format(d, 'yyyy-MM-dd');
}

function groupByDate(tasks, events, from, to) {
  const map = {};
  const days = eachDayOfInterval({ start: parseISO(from), end: parseISO(to) });
  days.forEach(d => { map[dateKey(d)] = []; });

  function add(dateStr, type, item, variant) {
    if (!dateStr) return;
    const key = dateStr.slice(0, 10);
    if (!(key in map)) return;
    map[key].push({ type, item, variant });
  }

  for (const t of tasks) {
    if (t.is_completed) continue;
    const type = t.parent_task_id ? 'subtask' : 'task';
    if (!t.parent_task_id && t.due_date) add(t.due_date, type, t, 'deadline');
    if (t.start_at) add(t.start_at, type, t, 'block');
  }
  for (const e of events) {
    const start = e.start_datetime.slice(0, 10);
    const end   = (e.end_datetime ?? e.start_datetime).slice(0, 10);
    let cur = start;
    while (cur <= end) {
      add(cur, 'event', e);
      const d = new Date(cur + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      cur = format(d, 'yyyy-MM-dd');
    }
  }

  const ORDER = { event: 0, task: 1, subtask: 2 };
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => ORDER[a.type] - ORDER[b.type]);
  }
  return map;
}

// A flat, scannable alternative to the Month/Week/Day grids — every day in
// range that actually has something on it, in order, with nothing to browse
// past for empty days. Reads better than a shrunken 7-column grid on narrow
// screens, and answers "what do I have this month" faster than paging cells.
export default function AgendaView({
  tasks, events, isShared, from, to,
  onTaskClick, onEventClick, onDayClick,
}) {
  const byDate = useMemo(() => groupByDate(tasks, events, from, to), [tasks, events, from, to]);

  const activeDays = useMemo(
    () => Object.keys(byDate).filter(k => byDate[k].length > 0).sort(),
    [byDate],
  );

  if (activeDays.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant gap-2">
        <span className="material-symbols-outlined text-4xl">event_available</span>
        <p className="text-body-md">Nothing scheduled this month</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto px-1">
      <div className="max-w-2xl mx-auto flex flex-col py-2">
        {activeDays.map(key => {
          const d = new Date(key + 'T00:00:00');
          const entries = byDate[key];
          const today = isToday(d);
          return (
            <div key={key} className="flex gap-3 py-2.5 border-b border-outline-variant/15">
              <button
                onClick={() => onDayClick(key)}
                className="w-14 shrink-0 flex flex-col items-center pt-0.5 hover:opacity-70 transition"
              >
                <span className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
                  {format(d, 'EEE')}
                </span>
                <span className={`w-8 h-8 mt-0.5 flex items-center justify-center rounded-full text-sm font-semibold ${
                  today ? 'bg-primary text-on-primary' : 'text-on-surface'
                }`}>
                  {format(d, 'd')}
                </span>
              </button>
              <div className="flex-1 min-w-0 flex flex-col gap-1 pt-1">
                {entries.map(({ type, item, variant }, i) => (
                  <CalendarEventChip
                    key={`${type}-${item.id}-${variant ?? ''}-${i}`}
                    type={type}
                    item={item}
                    variant={variant}
                    showAvatar={isShared}
                    onClick={() => type === 'event' ? onEventClick(item) : onTaskClick(item)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
