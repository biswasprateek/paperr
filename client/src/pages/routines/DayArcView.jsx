import React, { useMemo } from 'react';
import { TIME_SLOTS, CompletionRing, HabitRow } from './shared';

export default function DayArcView({ protocols = [], onToggle, onEditHabit, onAddHabit, busyId }) {
  // Flatten habits across protocols, tagging each with its protocol colour
  const bySlot = useMemo(() => {
    const map = Object.fromEntries(TIME_SLOTS.map(s => [s.key, []]));
    for (const p of protocols) {
      for (const h of (p.habits || [])) {
        const slot = map[h.time_slot] ? h.time_slot : 'morning';
        map[slot].push({ ...h, _color: p.color });
      }
    }
    // Sort each slot by target_time, then sort_order
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (a.target_time || '').localeCompare(b.target_time || '') || a.sort_order - b.sort_order);
    }
    return map;
  }, [protocols]);

  return (
    <div className="space-y-4">
      {TIME_SLOTS.map(slot => {
        const habits = bySlot[slot.key];
        const done   = habits.filter(h => h.completed).length;
        const total  = habits.length;

        return (
          <section
            key={slot.key}
            className="bg-surface-container-lowest rounded-xl shadow-soft border border-outline-variant/20 overflow-hidden"
          >
            {/* Block header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-outline-variant/10">
              <span className="text-[22px] leading-none">{slot.emoji}</span>
              <h3 className="text-title-md font-medium text-on-surface flex-1">{slot.label}</h3>
              {total > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-label-md text-on-surface-variant tabular-nums">{done}/{total}</span>
                  <CompletionRing done={done} total={total} size={28} sw={3} />
                </div>
              )}
            </div>

            {/* Habits */}
            <div className="p-2">
              {habits.length === 0 ? (
                <p className="text-label-md text-on-surface-variant/50 px-3 py-3">Nothing scheduled here yet.</p>
              ) : (
                habits.map(h => (
                  <HabitRow
                    key={h.id}
                    habit={h}
                    color={h._color}
                    onToggle={onToggle}
                    onEdit={onEditHabit}
                    busy={busyId === h.id}
                  />
                ))
              )}

              {/* Add habit row */}
              <button
                type="button"
                onClick={() => onAddHabit(slot.key)}
                className="w-full flex items-center gap-2 px-3 py-2.5 mt-1 rounded-xl text-label-md text-on-surface-variant/60 hover:text-primary hover:bg-primary/5 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                Add habit
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
