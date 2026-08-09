import React from 'react';
import { isToday } from 'date-fns';
import { CompletionRing } from '../routines/shared';

// A single at-a-glance summary of the viewed day's habits, since the
// per-section dividers only ever show a fraction for their own slot —
// nothing sums the whole day up. Reuses the same ring component as Routines.
export default function TodayHabitRing({ date, habitsBySlot }) {
  const all = Object.values(habitsBySlot || {}).flat();
  if (all.length === 0) return null;

  const done = all.filter(h => h.completed).length;
  const label = isToday(date) ? "Today's habits" : 'Habits';

  return (
    <div className="w-52 shrink-0 border border-outline-variant/20 shadow-soft rounded-2xl p-3.5 bg-surface-container-lowest hidden lg:flex items-center gap-3.5">
      <CompletionRing done={done} total={all.length} size={52} sw={5} showFraction />
      <div className="min-w-0">
        <h3 className="text-[11px] font-bold tracking-wide text-on-surface-variant mb-0.5">{label}</h3>
        <p className="text-xs text-on-surface-variant">{done} of {all.length} done</p>
      </div>
    </div>
  );
}
