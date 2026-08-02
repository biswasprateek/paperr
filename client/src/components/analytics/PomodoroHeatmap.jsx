import React, { useMemo } from 'react';

// GitHub-contributions-style calendar heat map. `data` is `[{ date, count,
// minutes }]` in chronological (oldest-first) order. Bucketed by session
// COUNT, not minutes — a Pomodoro is already a fixed ~25-minute chunk, so
// counting sessions reads the same way GitHub's own commit squares do.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function levelFor(count) {
  if (count <= 0) return 0;
  if (count <= 1) return 1;
  if (count <= 3) return 2;
  if (count <= 5) return 3;
  return 4;
}
const LEVEL_BG = ['bg-surface-container', 'bg-primary/20', 'bg-primary/45', 'bg-primary/70', 'bg-primary'];

export function heatmapCellSize(compact) { return compact ? 11 : 12; }

export default function PomodoroHeatmap({ data, compact = false }) {
  const cell = heatmapCellSize(compact);

  const { weeks, monthLabels } = useMemo(() => {
    if (!data.length) return { weeks: [], monthLabels: [] };
    const first = new Date(data[0].date + 'T00:00:00');
    const pad = (first.getDay() + 6) % 7; // days to prepend so the grid starts on Monday
    const padded = Array(pad).fill(null).concat(data);
    const weeksArr = [];
    for (let i = 0; i < padded.length; i += 7) weeksArr.push(padded.slice(i, i + 7));

    const monthLabels = [];
    let lastMonth = -1;
    weeksArr.forEach((week, wi) => {
      const firstReal = week.find(Boolean);
      if (!firstReal) return;
      const d = new Date(firstReal.date + 'T00:00:00');
      if (d.getDate() <= 7 && d.getMonth() !== lastMonth) {
        monthLabels.push({ week: wi, label: MONTHS[d.getMonth()] });
        lastMonth = d.getMonth();
      }
    });
    return { weeks: weeksArr, monthLabels };
  }, [data]);

  if (!weeks.length) return null;

  return (
    <div className="overflow-x-auto no-scrollbar">
      <div className="inline-block min-w-full">
        {!compact && (
          <div
            className="grid text-label-sm text-on-surface-variant mb-1"
            style={{ gridTemplateColumns: `repeat(${weeks.length}, ${cell + 3}px)`, marginLeft: 24 }}
          >
            {monthLabels.map(m => <span key={m.week} style={{ gridColumnStart: m.week + 1 }}>{m.label}</span>)}
          </div>
        )}
        <div className="flex gap-[3px]">
          {!compact && (
            <div
              className="grid text-[9px] text-on-surface-variant text-right pr-1 leading-none"
              style={{ gridTemplateRows: `repeat(7, ${cell}px)`, rowGap: 3, width: 20 }}
            >
              <span /><span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span />
            </div>
          )}
          <div className="grid grid-flow-col gap-[3px]" style={{ gridTemplateRows: `repeat(7, ${cell}px)` }}>
            {weeks.map((week, wi) => week.map((day, di) => day ? (
              <div
                key={`${wi}-${di}`}
                title={`${day.count} session${day.count === 1 ? '' : 's'} · ${day.minutes} min — ${day.date}`}
                className={`rounded-[3px] ${LEVEL_BG[levelFor(day.count)]}`}
                style={{ width: cell, height: cell }}
              />
            ) : <div key={`${wi}-${di}`} style={{ width: cell, height: cell }} />))}
          </div>
        </div>
      </div>
    </div>
  );
}
