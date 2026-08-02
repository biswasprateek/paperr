import React, { useState, useMemo } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  isSameMonth, isSameDay, isToday, addMonths, subMonths, format,
} from 'date-fns';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// A compact date-jump picker for the Day/Week rails — browsing months here
// doesn't move the main view until an actual day is clicked, so it's safe
// to page through months just to find a date.
export default function MiniMonthCalendar({ selected, onSelect }) {
  const [cursor, setCursor] = useState(selected);

  const cells = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end   = endOfWeek(endOfMonth(cursor),     { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  return (
    <div className="w-52 shrink-0 border border-outline-variant/20 shadow-soft rounded-2xl p-3.5 bg-surface-container-lowest hidden lg:block">
      <div className="flex items-center justify-between mb-2.5">
        <button
          type="button"
          onClick={() => setCursor(d => subMonths(d, 1))}
          className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-surface-container text-on-surface-variant"
        >
          <span className="material-symbols-outlined text-[16px]">chevron_left</span>
        </button>
        <span className="text-[11px] font-bold text-on-surface">{format(cursor, 'MMMM yyyy')}</span>
        <button
          type="button"
          onClick={() => setCursor(d => addMonths(d, 1))}
          className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-surface-container text-on-surface-variant"
        >
          <span className="material-symbols-outlined text-[16px]">chevron_right</span>
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="text-[9px] font-bold text-on-surface-variant/60 text-center py-0.5">{d}</div>
        ))}
        {cells.map(day => {
          const inMonth = isSameMonth(day, cursor);
          const sel = isSameDay(day, selected);
          const today = isToday(day);
          return (
            <button
              key={String(day)}
              type="button"
              onClick={() => onSelect(day)}
              className={`w-6 h-6 mx-auto flex items-center justify-center rounded-full text-[10.5px] transition
                ${sel ? 'bg-primary text-on-primary font-bold'
                  : today ? 'text-primary font-bold'
                  : inMonth ? 'text-on-surface hover:bg-surface-container' : 'text-on-surface-variant/30'}`}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>
    </div>
  );
}
