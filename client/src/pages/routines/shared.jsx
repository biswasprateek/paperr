import React, { useEffect, useState } from 'react';

// ── Time-of-day blocks (Day Arc order) ──────────────────────────────────────────
export const TIME_SLOTS = [
  { key: 'early_morning', label: 'Early Morning', emoji: '🌅' },
  { key: 'morning',       label: 'Morning',       emoji: '☀️' },
  { key: 'afternoon',     label: 'Afternoon',     emoji: '🌤️' },
  { key: 'evening',       label: 'Evening',       emoji: '🌇' },
  { key: 'night',         label: 'Night',         emoji: '🌙' },
];

export const SLOT_LABEL = Object.fromEntries(TIME_SLOTS.map(s => [s.key, s.label]));

// Mon–Sun day pills (recur_days bitmask order)
export const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Streak badge: nothing (0) → · (1–6) → ✦ (7–13) → 🔥 (14+) */
export function streakBadge(days) {
  if (days >= 14) return '🔥';
  if (days >= 7)  return '✦';
  if (days >= 1)  return '·';
  return '';
}

/** Format a UTC "YYYY-MM-DD HH:MM:SS" completion timestamp as local "h:mm AM" */
export function formatCompletedAt(str) {
  if (!str) return '';
  try {
    const d = new Date(str.includes('T') ? str : str.replace(' ', 'T') + 'Z');
    if (isNaN(d)) return '';
    let h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  } catch { return ''; }
}

/** Pretty target/duration suffix, e.g. "10 min" */
export function durationLabel(mins) {
  if (!mins) return '';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// ── CompletionRing — SVG donut (same stroke trick as MyTasks) ────────────────────
export function CompletionRing({ done = 0, total = 0, size = 116, sw = 8, color, showFraction }) {
  const r    = (size - sw * 2) / 2;
  const circ = 2 * Math.PI * r;
  const rate = total > 0 ? done / total : 0;
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 180);
    return () => clearTimeout(t);
  }, []);

  const offset = animated ? circ * (1 - rate) : circ;
  const stroke = color || undefined;

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" className="stroke-surface-container-high" strokeWidth={sw}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" strokeWidth={sw} strokeLinecap="round"
          className={stroke ? '' : 'stroke-primary'}
          style={{
            stroke,
            strokeDasharray: circ,
            strokeDashoffset: offset,
            transition: 'stroke-dashoffset 750ms cubic-bezier(0.23, 1, 0.32, 1)',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        {showFraction ? (
          <span className="font-bold text-on-surface tabular-nums" style={{ fontSize: size * 0.26 }}>
            {done}<span className="text-on-surface-variant/60">/{total}</span>
          </span>
        ) : (
          <span className="font-bold text-on-surface tabular-nums" style={{ fontSize: size * 0.24 }}>
            {Math.round(rate * 100)}%
          </span>
        )}
      </div>
    </div>
  );
}

// ── HabitRow — shared between Day Arc and Protocols views ────────────────────────
export function HabitRow({ habit, color, onToggle, onEdit, showTime = true, busy }) {
  const [expanded, setExpanded] = useState(false);
  const badge = streakBadge(habit.current_streak || 0);
  const dot   = color || '#6366f1';
  const doneAt = habit.completed ? formatCompletedAt(habit.completed_at) : '';

  return (
    <div className="group rounded-xl hover:bg-surface-container/50 transition-colors">
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Colour dot */}
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: dot }} />

        {/* Emoji (optional) */}
        {habit.icon && <span className="text-[15px] flex-shrink-0">{habit.icon}</span>}

        {/* Title + meta */}
        <button
          type="button"
          onClick={() => habit.science_note ? setExpanded(e => !e) : onEdit?.(habit)}
          className="flex-1 min-w-0 text-left"
        >
          <span className={`block text-body-md truncate ${habit.completed ? 'text-on-surface-variant line-through' : 'text-on-surface'}`}>
            {habit.title}
          </span>
          {doneAt ? (
            <span className="text-label-sm flex items-center gap-0.5 tabular-nums" style={{ color: dot }}>
              <span className="material-symbols-outlined text-[12px]">check_circle</span>
              Done {doneAt}
            </span>
          ) : (showTime && habit.target_time) ? (
            <span className="text-label-sm text-on-surface-variant/70 tabular-nums">{habit.target_time}</span>
          ) : null}
        </button>

        {/* Duration badge */}
        {habit.duration_minutes ? (
          <span className="hidden sm:inline text-label-sm text-on-surface-variant/70 bg-surface-container rounded-full px-2 py-0.5 flex-shrink-0">
            {durationLabel(habit.duration_minutes)}
          </span>
        ) : null}

        {/* Streak badge */}
        {badge && (
          <span
            className="text-label-sm text-on-surface-variant/80 flex items-center gap-0.5 flex-shrink-0"
            title={`${habit.current_streak} day streak`}
          >
            <span className="text-[13px]">{badge}</span>
            {habit.current_streak >= 7 && <span className="tabular-nums">{habit.current_streak}</span>}
          </span>
        )}

        {/* Edit (hover) */}
        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(habit)}
            aria-label="Edit habit"
            className="w-7 h-7 rounded-full flex items-center justify-center can-hover:text-on-surface-variant/0 can-hover:group-hover:text-on-surface-variant/50 text-on-surface-variant/50 hover:!text-primary hover:bg-primary/10 transition-colors flex-shrink-0"
          >
            <span className="material-symbols-outlined text-[16px]">edit</span>
          </button>
        )}

        {/* Check button */}
        <button
          type="button"
          onClick={() => onToggle(habit)}
          disabled={busy}
          aria-label={habit.completed ? 'Mark incomplete' : 'Mark complete'}
          className={`w-7 h-7 rounded-full border flex items-center justify-center flex-shrink-0 transition-[background-color,border-color,transform] duration-150 active:scale-[0.9] ${
            habit.completed
              ? 'border-transparent text-white'
              : 'border-outline hover:border-primary'
          }`}
          style={habit.completed ? { backgroundColor: dot } : undefined}
        >
          {habit.completed && <span className="material-symbols-outlined text-[16px]">check</span>}
        </button>
      </div>

      {/* Science note (expandable) */}
      {expanded && habit.science_note && (
        <p className="px-3 pb-3 -mt-1 pl-8 text-label-md text-on-surface-variant/80 leading-relaxed">
          {habit.science_note}
        </p>
      )}
    </div>
  );
}
