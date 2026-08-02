import React, { useEffect, useState } from 'react';
import WidgetShell from './WidgetShell';
import { CompletionRing } from '../pages/routines/shared';

const METRICS = [
  { key: 'day',   label: 'Day',   icon: 'schedule' },
  { key: 'month', label: 'Month', icon: 'calendar_month' },
  { key: 'year',  label: 'Year',  icon: 'event_repeat' },
];
const STYLES = [
  { value: 'bars',  label: 'Bars' },
  { value: 'rings', label: 'Rings' },
];

// Elapsed-fraction of the current day/month/year, as percentages.
function computePercents(now) {
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const day = (now - startOfDay) / 86400000 * 100;

  const somStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const somEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const month = (now - somStart) / (somEnd - somStart) * 100;

  const soyStart = new Date(now.getFullYear(), 0, 1);
  const soyEnd = new Date(now.getFullYear() + 1, 0, 1);
  const year = (now - soyStart) / (soyEnd - soyStart) * 100;

  return { day, month, year };
}

// Same segmented-pill chrome SharedCalendarWidget uses for its range picker —
// bare buttons (no wrapping row) so two pill groups can share one flex row.
function SettingPills({ items, isSelected, onSelect }) {
  return items.map((item) => (
    <button
      key={item.key ?? item.value}
      type="button"
      onClick={() => onSelect(item)}
      className={`h-6 px-2.5 rounded-full text-[11px] font-bold transition ${
        isSelected(item) ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'
      }`}
    >
      {item.label}
    </button>
  ));
}

/**
 * How much of today/this month/this year has elapsed, as a percentage — no
 * data fetch, just the wall clock. `metrics` (which of day/month/year) and
 * `style` (bars/rings) are stored per-instance in the board's widget props,
 * editable only while the board is in edit mode (drag/resize mode) so the
 * live view itself stays uncluttered.
 */
export function TimeProgressWidget({ editing, metrics = ['day', 'month', 'year'], style = 'bars', onUpdateProps }) {
  const [pct, setPct] = useState(() => computePercents(new Date()));

  useEffect(() => {
    const t = setInterval(() => setPct(computePercents(new Date())), 30000);
    return () => clearInterval(t);
  }, []);

  const active = METRICS.filter((m) => metrics.includes(m.key));
  const ringSize = active.length === 1 ? 100 : active.length === 2 ? 78 : 60;
  const ringSw = active.length === 1 ? 9 : 6;

  const toggleMetric = (key) => {
    if (metrics.includes(key)) {
      if (metrics.length === 1) return; // at least one metric must stay on
      onUpdateProps({ metrics: metrics.filter((k) => k !== key) });
    } else {
      onUpdateProps({ metrics: [...metrics, key] });
    }
  };

  return (
    <WidgetShell icon="percent" title="Time Progress" editing={editing}>
      {onUpdateProps && editing && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <SettingPills
            items={STYLES}
            isSelected={(s) => s.value === style}
            onSelect={(s) => onUpdateProps({ style: s.value })}
          />
          <span className="w-px self-stretch bg-outline-variant/30" />
          <SettingPills
            items={METRICS}
            isSelected={(m) => metrics.includes(m.key)}
            onSelect={(m) => toggleMetric(m.key)}
          />
        </div>
      )}

      {style === 'rings' ? (
        <div className="flex items-start justify-around gap-2 py-1">
          {active.map((m) => (
            <div key={m.key} className="flex flex-col items-center gap-1.5 min-w-0">
              <CompletionRing done={Math.round(pct[m.key])} total={100} size={ringSize} sw={ringSw} />
              <span className="text-label-sm text-on-surface-variant truncate">{m.label}</span>
            </div>
          ))}
        </div>
      ) : (
        active.map((m) => (
          <div key={m.key} className="py-1.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-label-md text-on-surface flex items-center gap-1.5 min-w-0">
                <span className="material-symbols-outlined text-[14px] text-on-surface-variant flex-shrink-0">{m.icon}</span>
                <span className="truncate">{m.label}</span>
              </span>
              <span className="text-label-sm text-on-surface-variant tabular-nums flex-shrink-0">{Math.round(pct[m.key])}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-container overflow-hidden">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct[m.key]}%` }} />
            </div>
          </div>
        ))
      )}
    </WidgetShell>
  );
}
