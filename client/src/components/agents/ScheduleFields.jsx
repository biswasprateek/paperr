import React from 'react';
import { DAY_LABELS } from './cronSchedule';

// Friendly frequency/time/day-of-week controls that compose into a cron
// string via cronSchedule.js — replaces a raw cron text field so users don't
// need to know cron syntax.
export default function ScheduleFields({ frequency, time, days, onChange }) {
  const toggleDay = (d) => {
    const next = days.includes(d) ? days.filter(x => x !== d) : [...days, d].sort((a, b) => a - b);
    onChange({ frequency, time, days: next.length ? next : days });
  };

  return (
    <div>
      <label className="text-label-sm text-on-surface-variant mb-1 block">Schedule</label>
      <div className="flex items-center gap-2">
        <select
          value={frequency}
          onChange={(e) => onChange({ frequency: e.target.value, time, days })}
          className="px-3 py-2.5 rounded-xl bg-surface-container border border-outline-variant/30 text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
        <span className="text-body-md text-on-surface-variant">at</span>
        <input
          type="time"
          value={time}
          onChange={(e) => onChange({ frequency, time: e.target.value, days })}
          className="px-3 py-2.5 rounded-xl bg-surface-container border border-outline-variant/30 text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {frequency === 'weekly' && (
        <div className="flex gap-1.5 mt-2">
          {DAY_LABELS.map((label, d) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleDay(d)}
              className={`w-9 h-9 rounded-full text-label-sm font-semibold transition ${
                days.includes(d)
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {label[0]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
