import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { api } from '../auth/AuthContext';
import { useAuthStore } from '../store/authStore';
import { useSpaceStore } from '../store/spaceStore';
import PillSelect from '../components/PillSelect';
import { CompletionRing, streakBadge } from './routines/shared';
import TrendChart from '../components/analytics/TrendChart';
import PomodoroHeatmap from '../components/analytics/PomodoroHeatmap';
import MoodPicker, { MOOD_LABELS } from '../components/analytics/MoodPicker';

// Insights & stats across wellness sessions (Pomodoro/Meditation/Breathing),
// tasks, projects, and habits. Three tabs — Personal (this user, this space),
// Family/Team (the whole space), and Log (raw entries, editable/deletable) —
// switched below. Mood and Meditation never appear in the Family/Team scope:
// that's a deliberate privacy decision, not a missing feature (see the
// "deliberately missing" note in the Family section).

const RANGE_OPTIONS = [
  { value: '7d',   label: 'Last 7 Days',    days: 7 },
  { value: '30d',  label: 'Last 30 Days',   days: 30 },
  { value: '90d',  label: 'Last 90 Days',   days: 90 },
  { value: '365d', label: 'Last 12 Months', days: 365 },
  { value: 'all',  label: 'All Time',       days: null },
];
// The space endpoint only supports 7/30/90d — no unbounded space-wide scan.
const SPACE_RANGE_OPTIONS = RANGE_OPTIONS.filter(r => r.value === '7d' || r.value === '30d' || r.value === '90d');

function fmtMin(mins) {
  mins = Math.round(mins || 0);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Mood delta (after - before, 1-5 scale) — positive is an improvement, unlike
// the old stress-scale delta this replaced (where negative used to be good).
function fmtDelta(v) {
  if (v == null) return '—';
  return v > 0 ? `+${v}` : `${v}`;
}

function Card({ className = '', children }) {
  return (
    <div className={`bg-surface-container-lowest rounded-3xl shadow-soft border border-outline-variant/20 ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ icon, title, hint }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="material-symbols-outlined text-[20px] text-primary">{icon}</span>
      <h2 className="text-body-lg font-bold text-on-surface">{title}</h2>
      {hint && <span className="text-label-md text-on-surface-variant ml-1">{hint}</span>}
    </div>
  );
}

function StatRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-t border-outline-variant/10 first:border-t-0 first:pt-0">
      <span className="text-label-md text-on-surface-variant">{label}</span>
      <span className="text-body-md font-bold text-on-surface tabular-nums">{value}</span>
    </div>
  );
}

function AppCard({ icon, name, streak, children }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-[19px]">{icon}</span>
        </span>
        <span className="text-body-md font-bold text-on-surface flex-1">{name}</span>
        {streak != null && streak > 0 && (
          <span className="text-label-md font-bold text-primary flex items-center gap-0.5">
            {streakBadge(streak)} {streak}d
          </span>
        )}
      </div>
      {children}
    </Card>
  );
}

function Avatar({ name, colour, size = 26 }) {
  const initials = (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  return (
    <span
      className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4, backgroundColor: colour || '#6366f1' }}
    >
      {initials}
    </span>
  );
}

// ── Log tab — a raw, editable/deletable timeline of wellness sessions and
// standalone mood check-ins, merged and sorted newest-first. ────────────────
function fmtDateTime(raw) {
  try {
    const d = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'));
    return format(d, 'MMM d, h:mm a');
  } catch { return raw; }
}

function LogRow({ entry, onSaveSession, onDeleteSession, onSaveMood, onDeleteMood }) {
  const [editing, setEditing] = useState(false);
  const [durMin, setDurMin] = useState(entry.kind === 'session' ? Math.round(entry.duration_sec / 60) : '');
  const [moodVal, setMoodVal] = useState(entry.kind === 'mood' ? entry.mood : null);

  const actions = editing ? (
    <>
      <button
        onClick={() => {
          if (entry.kind === 'session') onSaveSession(entry.id, { duration_sec: Math.max(60, Math.round((parseFloat(durMin) || 0) * 60)) });
          else onSaveMood(entry.id, moodVal);
          setEditing(false);
        }}
        className="text-primary text-label-sm font-bold mr-3"
      >
        Save
      </button>
      <button onClick={() => setEditing(false)} className="text-on-surface-variant text-label-sm font-bold">Cancel</button>
    </>
  ) : (
    <>
      <button onClick={() => setEditing(true)} aria-label="Edit" className="text-on-surface-variant hover:text-primary mr-2 align-middle">
        <span className="material-symbols-outlined text-[16px]">edit</span>
      </button>
      <button
        onClick={() => {
          const label = entry.kind === 'session' ? 'this session' : 'this mood entry';
          if (window.confirm(`Delete ${label}? This can't be undone.`)) {
            entry.kind === 'session' ? onDeleteSession(entry.id) : onDeleteMood(entry.id);
          }
        }}
        aria-label="Delete"
        className="text-on-surface-variant hover:text-error align-middle"
      >
        <span className="material-symbols-outlined text-[16px]">delete</span>
      </button>
    </>
  );

  if (entry.kind === 'session') {
    return (
      <tr className="border-b border-outline-variant/10 last:border-0">
        <td className="py-2.5 pr-3 text-label-md text-on-surface-variant whitespace-nowrap">{fmtDateTime(entry.created_at)}</td>
        <td className="py-2.5 pr-3 text-body-md text-on-surface capitalize">{entry.type}</td>
        <td className="py-2.5 pr-3 text-body-md text-on-surface tabular-nums">
          {editing ? (
            <input
              type="number" min="1" value={durMin} onChange={(e) => setDurMin(e.target.value)}
              className="w-16 h-8 px-2 rounded-full bg-surface-container text-center text-label-md outline-none focus:ring-2 focus:ring-primary"
            />
          ) : fmtMin(entry.duration_sec / 60)}
        </td>
        <td className="py-2.5 pr-3 text-label-md text-on-surface-variant tabular-nums">
          {entry.mood_before != null || entry.mood_after != null ? `${entry.mood_before ?? '–'} → ${entry.mood_after ?? '–'}` : '—'}
        </td>
        <td className="py-2.5 pr-3">
          <span className={`text-label-sm font-bold px-2 py-0.5 rounded-full ${entry.source === 'manual' ? 'bg-tertiary/15 text-tertiary' : 'bg-surface-container text-on-surface-variant'}`}>
            {entry.source}
          </span>
        </td>
        <td className="py-2.5 text-right whitespace-nowrap">{actions}</td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-outline-variant/10 last:border-0">
      <td className="py-2.5 pr-3 text-label-md text-on-surface-variant whitespace-nowrap">{fmtDateTime(entry.created_at)}</td>
      <td className="py-2.5 pr-3 text-body-md text-on-surface" colSpan={2}>Mood check-in</td>
      <td className="py-2.5 pr-3">
        {editing ? (
          <div className="w-40"><MoodPicker value={moodVal} onChange={setMoodVal} size="sm" clearable={false} /></div>
        ) : (
          <span className="text-body-md text-on-surface">{MOOD_LABELS[entry.mood]}</span>
        )}
      </td>
      <td className="py-2.5 pr-3" />
      <td className="py-2.5 text-right whitespace-nowrap">{actions}</td>
    </tr>
  );
}

function LogTab({ daysParam }) {
  const qc = useQueryClient();
  const { data: sessions = [], isLoading: loadingSessions } = useQuery({
    queryKey: ['log-sessions', daysParam],
    queryFn: () => api.get('/wellness/sessions', { params: { days: daysParam } }).then(r => r.data),
  });
  const { data: moods = [], isLoading: loadingMoods } = useQuery({
    queryKey: ['log-moods', daysParam],
    queryFn: () => api.get('/mood/logs', { params: { days: daysParam } }).then(r => r.data),
  });

  const entries = useMemo(() => {
    const s = sessions.map(x => ({ kind: 'session', ...x }));
    const m = moods.map(x => ({ kind: 'mood', ...x }));
    return [...s, ...m].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [sessions, moods]);

  // A blanket invalidation (rather than an enumerated key list) so every app
  // card, trend, and the heatmap all stay in sync with an edit or delete —
  // same reasoning as FocusEngine's onFocusLogged handler.
  const invalidate = () => qc.invalidateQueries();
  const updateSession = useMutation({ mutationFn: ({ id, ...patch }) => api.patch(`/wellness/sessions/${id}`, patch), onSuccess: invalidate });
  const deleteSessionM = useMutation({ mutationFn: (id) => api.delete(`/wellness/sessions/${id}`), onSuccess: invalidate });
  const updateMoodM = useMutation({ mutationFn: ({ id, mood }) => api.patch(`/mood/logs/${id}`, { mood }), onSuccess: invalidate });
  const deleteMoodM = useMutation({ mutationFn: (id) => api.delete(`/mood/logs/${id}`), onSuccess: invalidate });

  return (
    <section className="mb-8">
      <SectionHeader icon="history" title="Log" hint={`${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`} />
      <Card className="p-5">
        {loadingSessions || loadingMoods ? (
          <p className="text-body-md text-on-surface-variant/60 py-8 text-center">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-body-md text-on-surface-variant/60 py-8 text-center">Nothing logged in this period yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-label-sm text-on-surface-variant/70">
                  <th className="font-bold pb-2 pr-3 text-center">Date</th>
                  <th className="font-bold pb-2 pr-3 text-center">Type</th>
                  <th className="font-bold pb-2 pr-3 text-center">Duration</th>
                  <th className="font-bold pb-2 pr-3 text-center">Mood (Before → After)</th>
                  <th className="font-bold pb-2 pr-3 text-center">Source</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <LogRow
                    key={`${e.kind}-${e.id}`}
                    entry={e}
                    onSaveSession={(id, patch) => updateSession.mutate({ id, ...patch })}
                    onDeleteSession={(id) => deleteSessionM.mutate(id)}
                    onSaveMood={(id, mood) => updateMoodM.mutate({ id, mood })}
                    onDeleteMood={(id) => deleteMoodM.mutate(id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}

function LeaderList({ icon, title, rows, valueFn }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3.5">
        <span className="material-symbols-outlined text-[17px] text-primary">{icon}</span>
        <span className="text-label-md font-bold text-on-surface">{title}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-label-md text-on-surface-variant/60 py-2">No data yet this period.</p>
      ) : rows.map(r => (
        <div key={r.userId} className="flex items-center gap-2.5 mb-2.5 last:mb-0">
          <Avatar name={r.displayName} colour={r.avatarColour} size={26} />
          <span className="text-label-md text-on-surface w-16 flex-shrink-0 truncate">{r.displayName}</span>
          <div className="flex-1 h-2 rounded-full bg-surface-container overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, backgroundColor: r.avatarColour || '#6366f1' }} />
          </div>
          <span className="text-label-md text-on-surface-variant w-14 text-right tabular-nums flex-shrink-0">{valueFn(r.value)}</span>
        </div>
      ))}
    </Card>
  );
}

export default function Analytics() {
  const { user } = useAuthStore();
  const isTeam = useSpaceStore(s => s.currentSpace?.type === 'team');
  const [scope, setScope] = useState('personal');
  const [range, setRange] = useState('30d');

  const rangeOptions = scope === 'family' ? SPACE_RANGE_OPTIONS : RANGE_OPTIONS;
  const cfg = rangeOptions.find(r => r.value === range) || rangeOptions[1];
  const days = cfg.days; // null when "All time"
  const daysParam = days == null ? 'all' : days;
  const weeks = Math.min(52, Math.max(1, days == null ? 52 : Math.ceil(days / 7)));
  const today = format(new Date(), 'yyyy-MM-dd');
  const since = days == null ? '0001-01-01' : format(subDays(new Date(), days - 1), 'yyyy-MM-dd');

  const SCOPE_TABS = [
    { key: 'personal', label: 'Personal' },
    { key: 'family', label: isTeam ? 'Team' : 'Family' },
    { key: 'log', label: 'Log' },
  ];

  // ── Personal queries ─────────────────────────────────────────────────────
  const enabled = scope === 'personal';
  const { data: breakdown } = useQuery({
    queryKey: ['analytics-breakdown', daysParam],
    queryFn: () => api.get('/wellness/breakdown', { params: { days: daysParam } }).then(r => r.data),
    enabled,
  });
  const { data: deepWork } = useQuery({
    queryKey: ['analytics-deepwork-summary', daysParam],
    queryFn: () => api.get('/deep-work/summary', { params: { days: daysParam } }).then(r => r.data),
    enabled,
  });
  const { data: moodStats } = useQuery({
    queryKey: ['analytics-mood-stats'],
    queryFn: () => api.get('/mood/stats', { params: { days: 7 } }).then(r => r.data),
    enabled,
  });
  const { data: moodTrend = [] } = useQuery({
    queryKey: ['analytics-mood-trend', weeks],
    queryFn: () => api.get('/mood/trend', { params: { weeks } }).then(r => r.data),
    enabled,
  });
  const { data: meditationTrend = [] } = useQuery({
    queryKey: ['analytics-med-trend', weeks],
    queryFn: () => api.get('/wellness/trend', { params: { type: 'meditation', weeks } }).then(r => r.data),
    enabled,
  });
  const { data: deepWorkTrend = [] } = useQuery({
    queryKey: ['analytics-dw-trend', weeks],
    queryFn: () => api.get('/deep-work/trend', { params: { weeks } }).then(r => r.data),
    enabled,
  });
  const { data: heatmap = [] } = useQuery({
    queryKey: ['analytics-heatmap'],
    queryFn: () => api.get('/wellness/heatmap', { params: { type: 'pomodoro', days: 365 } }).then(r => r.data),
    enabled,
  });
  const { data: dueTasks = [] } = useQuery({
    queryKey: ['analytics-tasks-due', since],
    queryFn: () => api.get('/tasks', { params: { assignedTo: user?.id, dueFrom: since, dueTo: today } }).then(r => r.data),
    enabled: enabled && !!user?.id,
  });
  const { data: projects = [] } = useQuery({
    queryKey: ['analytics-projects'],
    queryFn: () => api.get('/projects').then(r => r.data),
    enabled,
  });
  const { data: routinesToday = [] } = useQuery({
    queryKey: ['analytics-routines-today', today],
    queryFn: () => api.get('/routines/protocols', { params: { date: today } }).then(r => r.data),
    enabled,
  });
  const { data: routinesProgress = [] } = useQuery({
    queryKey: ['analytics-routines-progress', daysParam],
    queryFn: () => api.get('/routines/progress', { params: { days: daysParam === 'all' ? 3650 : daysParam } }).then(r => r.data),
    enabled,
  });

  // ── Space (Family/Team) query ────────────────────────────────────────────
  const { data: space } = useQuery({
    queryKey: ['analytics-space', range],
    queryFn: () => api.get('/analytics/space', { params: { range } }).then(r => r.data),
    enabled: scope === 'family',
  });

  const tasksRollup = useMemo(() => {
    const done = dueTasks.filter(t => t.is_completed);
    const onTime = done.filter(t => t.due_date && t.completed_at && t.completed_at.slice(0, 10) <= t.due_date.slice(0, 10));
    const byPriority = { high: 0, medium: 0, low: 0 };
    done.forEach(t => { byPriority[t.priority] = (byPriority[t.priority] || 0) + 1; });
    return { done: done.length, total: dueTasks.length, onTimeRate: done.length ? Math.round((onTime.length / done.length) * 100) : null, byPriority };
  }, [dueTasks]);

  const projectsRollup = useMemo(() => ({
    active: projects.filter(p => p.status === 'active').length,
    completedThisPeriod: projects.filter(p => p.status === 'completed' && p.completed_at && p.completed_at.slice(0, 10) >= since).length,
  }), [projects, since]);

  const routinesRollup = useMemo(() => {
    let done = 0, total = 0;
    for (const p of routinesToday) for (const h of (p.habits || [])) { total++; if (h.completed) done++; }
    const longestStreak = routinesProgress.reduce((m, r) => Math.max(m, r.longest_streak || 0), 0);
    return { done, total, longestStreak };
  }, [routinesToday, routinesProgress]);

  const trendData = (rows, key) => (rows || []).map(r => ({ label: r.weekStart, value: r[key] }));

  return (
    <div className="max-w-6xl mx-auto pb-8">
      <h1 className="text-headline-lg text-on-background mb-1">Analytics</h1>
      <p className="text-body-md text-on-surface-variant mb-5">Insights into how you spend your time.</p>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div className="inline-flex bg-surface-container rounded-full p-1">
          {SCOPE_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setScope(t.key)}
              className={`px-5 h-9 rounded-full text-label-md font-bold transition ${
                scope === t.key ? 'bg-primary text-on-primary shadow-soft' : 'text-on-surface-variant'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="w-48">
          <PillSelect icon="date_range" value={range} onChange={setRange} options={rangeOptions} />
        </div>
      </div>

      {scope === 'personal' && (
        <>
          <section className="mb-8">
            <SectionHeader icon="self_improvement" title="Focus & Wellness" hint={cfg.label} />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              <AppCard icon="timer" name="Pomodoro" streak={breakdown?.pomodoro?.currentStreak}>
                <StatRow label="Focus time" value={fmtMin(breakdown?.pomodoro?.totalMinutes)} />
                <StatRow label="Sessions" value={breakdown?.pomodoro?.sessions ?? 0} />
                <StatRow label="Completion rate" value={breakdown?.pomodoro?.completionRate != null ? `${breakdown.pomodoro.completionRate}%` : '—'} />
              </AppCard>
              <AppCard icon="self_improvement" name="Meditation">
                <StatRow label="Total time" value={fmtMin(breakdown?.meditation?.totalMinutes)} />
                <StatRow label="Sessions" value={breakdown?.meditation?.sessions ?? 0} />
                <StatRow label="Avg. mood lift" value={fmtDelta(breakdown?.meditation?.avgMoodDelta)} />
              </AppCard>
              <AppCard icon="air" name="Breathing">
                <StatRow label="Total time" value={fmtMin(breakdown?.breathing?.totalMinutes)} />
                <StatRow label="Sessions" value={breakdown?.breathing?.sessions ?? 0} />
                <StatRow label="Top pattern" value={breakdown?.breathing?.topPattern || '—'} />
              </AppCard>
              <AppCard icon="center_focus_strong" name="Deep Work">
                <StatRow label="Total time" value={fmtMin(deepWork?.totalMinutes)} />
                <StatRow label="Sessions" value={deepWork?.sessions ?? 0} />
                <StatRow label="Top task" value={deepWork?.topItems?.[0]?.title || '—'} />
              </AppCard>
              <AppCard icon="mood" name="Mood">
                <StatRow label="Today" value={moodStats?.today?.label || '—'} />
                <StatRow label="7-day avg" value={moodStats?.avg != null ? `${moodStats.avg} / 5` : '—'} />
                <StatRow label="Entries logged" value={moodStats?.entries ?? 0} />
              </AppCard>
            </div>
          </section>

          <section className="mb-8">
            <SectionHeader icon="trending_up" title="Trends Over Time" hint={`Last ${weeks} week${weeks === 1 ? '' : 's'}`} />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-label-md font-bold text-on-surface">Mood</span>
                  <span className="text-label-md font-bold text-primary">{moodStats?.avg != null ? `${moodStats.avg} / 5 avg` : '—'}</span>
                </div>
                <TrendChart
                  data={trendData(moodTrend, 'avg')}
                  axisMax={5}
                  guide={3}
                  formatTooltip={r => `Week of ${r.label}: ${r.value != null ? `${r.value} / 5` : 'no check-ins'}`}
                />
              </Card>
              <Card className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-label-md font-bold text-on-surface">Meditation</span>
                  <span className="text-label-md font-bold text-primary">min / week</span>
                </div>
                <TrendChart data={trendData(meditationTrend, 'minutes')} formatTooltip={r => `Week of ${r.label}: ${r.value} min`} />
              </Card>
              <Card className="p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-label-md font-bold text-on-surface">Deep Work</span>
                  <span className="text-label-md font-bold text-primary">min / week</span>
                </div>
                <TrendChart data={trendData(deepWorkTrend, 'minutes')} formatTooltip={r => `Week of ${r.label}: ${r.value} min`} />
              </Card>
            </div>
          </section>

          <section className="mb-8">
            <SectionHeader icon="checklist" title="Tasks, Projects & Routines" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="p-5 flex items-center gap-4">
                <CompletionRing done={tasksRollup.done} total={tasksRollup.total} size={62} sw={6} showFraction />
                <div className="min-w-0">
                  <p className="text-body-md font-bold text-on-surface">Tasks</p>
                  <p className="text-label-md text-on-surface-variant">
                    {tasksRollup.total === 0 ? 'Nothing due this period' : `On-time ${tasksRollup.onTimeRate ?? '—'}%`}
                  </p>
                </div>
              </Card>
              <Card className="p-5 flex items-center gap-4">
                <CompletionRing done={projectsRollup.active} total={Math.max(projectsRollup.active, 1)} size={62} sw={6} />
                <div className="min-w-0">
                  <p className="text-body-md font-bold text-on-surface">Projects</p>
                  <p className="text-label-md text-on-surface-variant">
                    <b className="text-on-surface">{projectsRollup.active}</b> active &middot; <b className="text-on-surface">{projectsRollup.completedThisPeriod}</b> completed this period
                  </p>
                </div>
              </Card>
              <Card className="p-5 flex items-center gap-4">
                <CompletionRing done={routinesRollup.done} total={routinesRollup.total} size={62} sw={6} showFraction />
                <div className="min-w-0">
                  <p className="text-body-md font-bold text-on-surface">Routines</p>
                  <p className="text-label-md text-on-surface-variant">
                    Longest streak {streakBadge(routinesRollup.longestStreak)} <b className="text-on-surface">{routinesRollup.longestStreak}</b> days
                  </p>
                </div>
              </Card>
            </div>
          </section>

          <section className="mb-8">
            <SectionHeader icon="calendar_view_month" title="Pomodoro Streak" hint="Last 12 months" />
            <Card className="p-6">
              <PomodoroHeatmap data={heatmap} />
              <div className="flex items-center gap-2 mt-4 text-label-sm text-on-surface-variant">
                <span>Less</span>
                <span className="w-2.5 h-2.5 rounded-[3px] bg-surface-container" />
                <span className="w-2.5 h-2.5 rounded-[3px] bg-primary/20" />
                <span className="w-2.5 h-2.5 rounded-[3px] bg-primary/45" />
                <span className="w-2.5 h-2.5 rounded-[3px] bg-primary/70" />
                <span className="w-2.5 h-2.5 rounded-[3px] bg-primary" />
                <span>More</span>
              </div>
              <div className="flex gap-6 mt-3 text-label-md text-on-surface-variant">
                <span><b className="text-on-surface tabular-nums">{heatmap.reduce((s, d) => s + d.count, 0)}</b> sessions in the last year</span>
                <span><b className="text-on-surface tabular-nums">{heatmap.filter(d => d.count > 0).length}</b> active days</span>
                <span><b className="text-on-surface tabular-nums">{Math.max(0, ...heatmap.map(d => d.count))}</b> best day</span>
              </div>
            </Card>
          </section>
        </>
      )}

      {scope === 'family' && (
        <>
          <section className="mb-8">
            <SectionHeader icon="groups" title="Space Pulse" hint={cfg.label} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card className="p-5 text-center">
                <p className="text-headline-md text-on-surface tabular-nums">{space?.pulse?.tasksDone ?? '—'}</p>
                <p className="text-label-md text-on-surface-variant mt-1">Tasks Done</p>
              </Card>
              <Card className="p-5 text-center">
                <p className="text-headline-md text-on-surface tabular-nums">{space ? fmtMin(space.pulse.deepWorkMinutes) : '—'}</p>
                <p className="text-label-md text-on-surface-variant mt-1">Deep Work</p>
              </Card>
              <Card className="p-5 text-center">
                <p className="text-headline-md text-on-surface tabular-nums">{space?.pulse?.habitsKeptRate != null ? `${space.pulse.habitsKeptRate}%` : '—'}</p>
                <p className="text-label-md text-on-surface-variant mt-1">Habits Kept</p>
              </Card>
              <Card className="p-5 text-center">
                <p className="text-headline-md text-on-surface tabular-nums">{space?.pulse?.activeProjects ?? '—'}</p>
                <p className="text-label-md text-on-surface-variant mt-1">Active Projects</p>
              </Card>
            </div>
          </section>

          <section className="mb-8">
            <SectionHeader icon="trending_up" title="Per-Member Leaderboard" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <LeaderList icon="center_focus_strong" title="Deep Work minutes" rows={space?.leaderboard?.deepWork || []} valueFn={fmtMin} />
              <LeaderList icon="check_circle" title="Tasks completed" rows={(space?.leaderboard?.tasks || []).map(r => ({ ...r, value: r.count }))} valueFn={v => v} />
            </div>
            <div className="flex gap-3 items-start bg-surface-container-lowest border border-outline-variant/20 rounded-2xl p-4 mt-4">
              <span className="material-symbols-outlined text-[20px] text-tertiary mt-0.5">info</span>
              <p className="text-label-md text-on-surface-variant leading-relaxed">
                <b className="text-on-surface">Mood and Meditation stay Personal.</b> Neither appears here, even in aggregate — that's a deliberate privacy decision, not a missing feature. Pomodoro and Breathing could show up here too now that sessions carry a space — just not wired into this view yet.
              </p>
            </div>
          </section>
        </>
      )}

      {scope === 'log' && <LogTab daysParam={daysParam} />}
    </div>
  );
}
