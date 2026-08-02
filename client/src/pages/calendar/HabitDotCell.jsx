import React from 'react';

const MAX_VISIBLE = 4;

// The Week view's condensed habit indicator: one day's habits for a single
// time-of-day block, collapsed to a dot per habit (no room for titles at
// this width). Same color + completed state as the Day view's chip; the
// name shows in a custom tooltip on hover (native `title` was too slow/small
// to notice at this size).
export default function HabitDotCell({ habits, onToggle }) {
  if (!habits || habits.length === 0) return <div />;

  const visible = habits.slice(0, MAX_VISIBLE);
  const overflow = habits.length - MAX_VISIBLE;

  return (
    <div className="flex items-center gap-1 flex-wrap px-1">
      {visible.map(h => (
        <div key={h.id} className="relative group/dot shrink-0">
          <button
            type="button"
            aria-label={`${h.title}${h.completed ? ' · done' : ''}`}
            onClick={() => onToggle(h)}
            className="w-3 h-3 rounded-full border flex items-center justify-center hover:scale-110 transition-transform"
            style={{
              borderColor: h.completed ? 'transparent' : (h.protocol_color || '#94a3b8'),
              background:  h.completed ? (h.protocol_color || '#6366f1') : 'transparent',
            }}
          >
            {h.completed && <span className="material-symbols-outlined text-white text-[7px] leading-none">check</span>}
          </button>
          <div
            role="tooltip"
            className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-20
                       whitespace-nowrap px-2 py-1 rounded-lg bg-surface-container-lowest
                       border border-outline-variant/20 shadow-heavy text-label-sm text-on-surface
                       opacity-0 scale-95 origin-bottom transition-all duration-150
                       group-hover/dot:opacity-100 group-hover/dot:scale-100"
          >
            {h.title}
            {h.completed && <span className="text-on-surface-variant"> · done</span>}
          </div>
        </div>
      ))}
      {overflow > 0 && (
        <span className="text-[9px] text-on-surface-variant shrink-0">+{overflow}</span>
      )}
    </div>
  );
}
