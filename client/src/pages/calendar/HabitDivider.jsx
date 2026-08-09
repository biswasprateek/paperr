import React from 'react';
import { TIME_SLOTS } from '../../utils/timeSlots';

const MAX_VISIBLE = 4;

function HabitChip({ habit, onToggle }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(habit)}
      className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-outline-variant/50 bg-surface pl-1 pr-2.5 py-0.5 text-[10.5px] font-semibold whitespace-nowrap hover:border-primary transition-colors"
    >
      <span
        className="w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0"
        style={{
          borderColor: habit.completed ? 'transparent' : (habit.protocol_color || '#94a3b8'),
          background:  habit.completed ? (habit.protocol_color || '#6366f1') : 'transparent',
        }}
      >
        {habit.completed && <span className="material-symbols-outlined text-white text-[9px] leading-none">check</span>}
      </span>
      <span className={habit.completed ? 'line-through text-on-surface-variant' : 'text-on-surface'}>
        {habit.icon ? `${habit.icon} ` : ''}{habit.title}
      </span>
    </button>
  );
}

// A section header for one time-of-day block (🌅 Early Morning, ☀️ Morning, …),
// with that block's habits as checkable chips right beneath it — introduced
// exactly where the block starts in the hour grid, before the timed hours
// that belong to it.
//
// Default (Day/Week views): fixed `height` (see DIVIDER_HEIGHT in the caller),
// a single row capped at MAX_VISIBLE with a "+N more" — the fixed height is
// required so the hour grid can position timed items against the shared offset
// map. `wrap` (the Schedule widget): auto-height, chips wrap to as many rows as
// needed and every habit shows; that caller measures the rendered height itself.
export default function HabitDivider({ slotKey, habits, onToggle, height, wrap = false }) {
  const slot = TIME_SLOTS.find(s => s.key === slotKey);
  const done = habits.filter(h => h.completed).length;

  if (wrap) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 bg-surface-container-low border-y border-outline-variant/25">
        <span className="text-[13px] leading-none">{slot?.emoji}</span>
        <span className="text-[11px] font-bold text-on-surface tracking-wide">{slot?.label ?? slotKey}</span>
        <span className="text-[10px] font-bold text-on-surface-variant tabular-nums">{done}/{habits.length}</span>
        {habits.map(h => <HabitChip key={h.id} habit={h} onToggle={onToggle} />)}
      </div>
    );
  }

  const visible = habits.slice(0, MAX_VISIBLE);
  const overflow = habits.length - MAX_VISIBLE;

  return (
    <div
      className="flex items-center gap-2 px-3 bg-surface-container-low border-y border-outline-variant/25 overflow-hidden shrink-0"
      style={{ height }}
    >
      <span className="text-[13px] leading-none shrink-0">{slot?.emoji}</span>
      <span className="text-[11px] font-bold text-on-surface shrink-0 tracking-wide">{slot?.label ?? slotKey}</span>
      <span className="text-[10px] font-bold text-on-surface-variant shrink-0 tabular-nums">{done}/{habits.length}</span>

      <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden">
        {visible.map(h => <HabitChip key={h.id} habit={h} onToggle={onToggle} />)}
        {overflow > 0 && (
          <span className="text-[10px] text-on-surface-variant shrink-0">+{overflow} more</span>
        )}
      </div>
    </div>
  );
}
