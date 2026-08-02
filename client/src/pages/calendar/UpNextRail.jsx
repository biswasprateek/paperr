import React from 'react';
import { isToday, isTomorrow, format, parseISO } from 'date-fns';

function dayLabel(dateStr) {
  const d = parseISO(dateStr);
  if (isToday(d)) return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  return format(d, 'EEE, MMM d');
}

const TYPE_DOT = {
  task: 'rgb(var(--tb-primary))',
  subtask: 'rgb(var(--tb-primary))',
  milestone: 'rgb(var(--tb-tertiary))',
};

// A slim rail of the nearest upcoming items, pulled from a wider date range
// than whatever month is currently in view. A sparse month still has
// something worth scanning, and it doubles as a fast "what's coming" glance.
export default function UpNextRail({ items, onItemClick }) {
  if (!items || items.length === 0) return null;

  return (
    <div className="w-52 shrink-0 border border-outline-variant/20 shadow-soft rounded-2xl p-3.5 bg-surface-container-lowest hidden lg:block h-fit">
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant mb-2.5">Up next</h3>
      <div className="flex flex-col">
        {items.map((it, i) => (
          <button
            key={it.id}
            type="button"
            onClick={() => onItemClick(it)}
            className={`flex items-start gap-2.5 text-left py-2 hover:bg-surface-container/60 -mx-1 px-1 rounded-lg transition-colors ${i > 0 ? 'border-t border-outline-variant/20' : ''}`}
          >
            <span
              className="w-2 h-2 rounded-full mt-1 shrink-0"
              style={{ background: it.color || TYPE_DOT[it.type] || 'rgb(var(--tb-secondary))' }}
            />
            <span className="min-w-0">
              <span className="block text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
                {dayLabel(it.dateStr)}{it.time ? ` · ${it.time}` : ''}
              </span>
              <span className="block text-xs font-medium text-on-surface truncate">{it.title}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
