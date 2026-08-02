import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../auth/AuthContext';
import WidgetShell, { WidgetEmpty } from './WidgetShell';
import { streakBadge } from '../pages/routines/shared';
import PomodoroHeatmap from '../components/analytics/PomodoroHeatmap';
import MoodPicker from '../components/analytics/MoodPicker';

function fmtMin(mins) {
  mins = Math.round(mins || 0);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Newest-first trailing streak from a chronological (oldest-first) day list,
// with grace for today: an empty "today" doesn't break a streak still in
// progress, matching the grace rule focus.js/routines.js use server-side.
function trailingStreak(days) {
  const arr = [...days].reverse();
  let i = 0;
  if (arr[0] && arr[0].count === 0) i = 1;
  let streak = 0;
  for (; i < arr.length; i++) {
    if (arr[i].count > 0) streak++;
    else break;
  }
  return streak;
}

// ════════════════════════════════════════════════════════════════════════════
//  Mood — quick 5-point check-in, Home board only (see Analytics spec §07/§08:
//  mood and meditation never appear anywhere space-shared, widgets included).
// ════════════════════════════════════════════════════════════════════════════
export function MoodWidget({ editing }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['mood-stats', 7],
    queryFn: () => api.get('/mood/stats', { params: { days: 7 } }).then(r => r.data),
  });

  const log = useMutation({
    mutationFn: (mood) => api.post('/mood/logs', { mood }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mood-stats'] });
      qc.invalidateQueries({ queryKey: ['analytics-mood-trend'] });
    },
  });

  return (
    <WidgetShell icon="mood" title="Mood" source="/analytics" editing={editing}>
      <MoodPicker
        value={data?.today?.mood ?? null}
        onChange={(v) => v != null && log.mutate(v)}
        disabled={editing || log.isPending}
        clearable={false}
      />
      {(data?.daily || []).length > 0 && (
        <div className="flex items-end gap-1 h-6 mt-2">
          {data.daily.map((d, i) => (
            <span
              key={i}
              title={`${d.date}: ${d.avg != null ? `${d.avg} / 5` : 'no check-ins'}`}
              className="flex-1 rounded-sm bg-primary"
              style={{ height: d.avg ? `${15 + (d.avg / 5) * 85}%` : '10%', opacity: d.avg ? 0.3 + (d.avg / 5) * 0.7 : 0.15 }}
            />
          ))}
        </div>
      )}
      <p className="text-label-sm text-on-surface-variant mt-2 text-center">
        {data?.today ? `Today: ${data.today.label}` : 'No check-in yet today'}
      </p>
    </WidgetShell>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Pomodoro Streak — compact contribution strip (full year lives on /analytics)
// ════════════════════════════════════════════════════════════════════════════
export function PomodoroStreakWidget({ editing }) {
  const { data: heatmap = [] } = useQuery({
    queryKey: ['pomodoro-heatmap', 98],
    queryFn: () => api.get('/wellness/heatmap', { params: { type: 'pomodoro', days: 98 } }).then(r => r.data),
  });
  const streak = trailingStreak(heatmap);

  return (
    <WidgetShell icon="calendar_view_month" title="Pomodoro Streak" source="/analytics" editing={editing}>
      {heatmap.every(d => d.count === 0)
        ? <WidgetEmpty icon="calendar_view_month" label="No Pomodoros logged yet" />
        : <PomodoroHeatmap data={heatmap} compact />}
      <p className="text-label-sm text-on-surface-variant mt-2 text-center">
        {streakBadge(streak)} {streak}-day streak
      </p>
    </WidgetShell>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Focus Breakdown — today's minutes by app, kept separate per app
// ════════════════════════════════════════════════════════════════════════════
export function FocusBreakdownWidget({ editing }) {
  const { data: breakdown } = useQuery({
    queryKey: ['focus-breakdown', 1],
    queryFn: () => api.get('/wellness/breakdown', { params: { days: 1 } }).then(r => r.data),
  });
  const { data: deepWork } = useQuery({
    queryKey: ['deepwork-summary', 1],
    queryFn: () => api.get('/deep-work/summary', { params: { days: 1 } }).then(r => r.data),
  });

  const rows = [
    { label: 'Pomodoro',  icon: 'timer',                minutes: breakdown?.pomodoro?.totalMinutes || 0 },
    { label: 'Meditate',  icon: 'self_improvement',      minutes: breakdown?.meditation?.totalMinutes || 0 },
    { label: 'Breathe',   icon: 'air',                   minutes: breakdown?.breathing?.totalMinutes || 0 },
    { label: 'Deep Work', icon: 'center_focus_strong',   minutes: deepWork?.totalMinutes || 0 },
  ];
  const max = Math.max(1, ...rows.map(r => r.minutes));
  const hasAny = rows.some(r => r.minutes > 0);

  return (
    <WidgetShell icon="donut_small" title="Focus Breakdown" source="/analytics" editing={editing}>
      {!hasAny ? (
        <WidgetEmpty icon="donut_small" label="No focus time logged today" />
      ) : rows.map(r => (
        <div key={r.label} className="py-1.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-label-md text-on-surface flex items-center gap-1.5 min-w-0">
              <span className="material-symbols-outlined text-[14px] text-on-surface-variant flex-shrink-0">{r.icon}</span>
              <span className="truncate">{r.label}</span>
            </span>
            <span className="text-label-sm text-on-surface-variant tabular-nums flex-shrink-0">{fmtMin(r.minutes)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-container overflow-hidden">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(r.minutes / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </WidgetShell>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Streaks — Pomodoro's current streak + top Routines streaks. Home-only:
//  viewer-relative, same reason my-tasks/welcome already are.
// ════════════════════════════════════════════════════════════════════════════
export function StreaksWidget({ editing }) {
  const { data: breakdown } = useQuery({
    queryKey: ['streaks-pomodoro', 30],
    queryFn: () => api.get('/wellness/breakdown', { params: { days: 30 } }).then(r => r.data),
  });
  const { data: progress = [] } = useQuery({
    queryKey: ['streaks-routines', 30],
    queryFn: () => api.get('/routines/progress', { params: { days: 30 } }).then(r => r.data),
  });
  const topRoutines = [...progress].sort((a, b) => b.current_streak - a.current_streak).slice(0, 3);
  const pomoStreak = breakdown?.pomodoro?.currentStreak || 0;

  return (
    <WidgetShell icon="local_fire_department" title="Streaks" source="/analytics" editing={editing}>
      <div className="flex items-center justify-between py-2 border-b border-outline-variant/10">
        <span className="text-body-md text-on-surface flex items-center gap-1.5 min-w-0">
          <span className="material-symbols-outlined text-[16px] text-primary flex-shrink-0">timer</span>
          <span className="truncate">Pomodoro</span>
        </span>
        <span className="text-body-md font-bold text-on-surface tabular-nums flex-shrink-0">{streakBadge(pomoStreak)} {pomoStreak}d</span>
      </div>
      {topRoutines.length === 0 ? (
        <WidgetEmpty icon="local_fire_department" label="No habit streaks yet" />
      ) : topRoutines.map(r => (
        <div key={r.habit_id} className="flex items-center justify-between py-2 border-b border-outline-variant/10 last:border-0">
          <span className="text-body-md text-on-surface flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.protocol_color || '#6366f1' }} />
            <span className="truncate">{r.title}</span>
          </span>
          <span className="text-body-md font-bold text-on-surface tabular-nums flex-shrink-0">{streakBadge(r.current_streak)} {r.current_streak}d</span>
        </div>
      ))}
    </WidgetShell>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Space Pulse — combined space totals, built only from already-space-shared
//  tables (see Analytics spec §07). Available on both Home and Hub.
// ════════════════════════════════════════════════════════════════════════════
export function SpacePulseWidget({ editing }) {
  const { data } = useQuery({
    queryKey: ['space-pulse', '7d'],
    queryFn: () => api.get('/analytics/space', { params: { range: '7d' } }).then(r => r.data),
  });
  const p = data?.pulse;

  return (
    <WidgetShell icon="groups" title="Space Pulse" source="/analytics" editing={editing}>
      <div className="h-full grid grid-cols-4 gap-1 items-center">
        <div className="text-center">
          <p className="text-body-lg font-bold text-on-surface tabular-nums">{p?.tasksDone ?? '—'}</p>
          <p className="text-label-sm text-on-surface-variant truncate">Tasks Done</p>
        </div>
        <div className="text-center">
          <p className="text-body-lg font-bold text-on-surface tabular-nums">{p ? fmtMin(p.deepWorkMinutes) : '—'}</p>
          <p className="text-label-sm text-on-surface-variant truncate">Deep Work</p>
        </div>
        <div className="text-center">
          <p className="text-body-lg font-bold text-on-surface tabular-nums">{p?.habitsKeptRate != null ? `${p.habitsKeptRate}%` : '—'}</p>
          <p className="text-label-sm text-on-surface-variant truncate">Habits Kept</p>
        </div>
        <div className="text-center">
          <p className="text-body-lg font-bold text-on-surface tabular-nums">{p?.activeProjects ?? '—'}</p>
          <p className="text-label-sm text-on-surface-variant truncate">Projects</p>
        </div>
      </div>
    </WidgetShell>
  );
}
