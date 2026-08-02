import React from 'react';

// Shared 5-point sentiment picker — Material Symbols' own sentiment icon
// family, never emoji (matches the app's icon convention). Used by the Mood
// widget (tap-to-log-immediately) and by Breathe/Meditate's before/after
// rating steps (tap-to-select, submitted later with the session).
export const MOOD_ICONS = [
  { value: 1, icon: 'sentiment_very_dissatisfied' },
  { value: 2, icon: 'sentiment_dissatisfied' },
  { value: 3, icon: 'sentiment_neutral' },
  { value: 4, icon: 'sentiment_satisfied' },
  { value: 5, icon: 'sentiment_very_satisfied' },
];
export const MOOD_LABELS = { 1: 'Very Low', 2: 'Low', 3: 'Okay', 4: 'Good', 5: 'Great' };

export default function MoodPicker({ value, onChange, disabled = false, size = 'md', clearable = true }) {
  const dim = size === 'sm' ? 'w-7 h-7' : 'w-9 h-9';
  const iconSize = size === 'sm' ? 'text-[15px]' : 'text-[19px]';

  return (
    <div className="flex items-center justify-between gap-1.5">
      {MOOD_ICONS.map((m) => (
        <button
          key={m.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(clearable && value === m.value ? null : m.value)}
          aria-label={`${MOOD_LABELS[m.value]} (${m.value} of 5)`}
          title={MOOD_LABELS[m.value]}
          className={`${dim} rounded-full flex items-center justify-center flex-shrink-0 transition active:scale-95 ${
            value === m.value ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:text-primary'
          }`}
        >
          <span className={`material-symbols-outlined ${iconSize}`}>{m.icon}</span>
        </button>
      ))}
    </div>
  );
}
