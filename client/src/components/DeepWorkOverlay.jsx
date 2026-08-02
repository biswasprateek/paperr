import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { api } from '../auth/AuthContext';
import { useDeepWorkStore, deepWorkPhaseRemaining } from '../store/deepWorkStore';
import { useTaskComplete } from '../widgets/useTaskComplete';
import DeepWorkCheckInModal from './DeepWorkCheckInModal';
import TaskNotes from './TaskNotes';

const STATUS_LABELS = { todo: 'To Do', in_progress: 'In Progress', blocked: 'Blocked', done: 'Done' };
const COUNTUP_CAP_MS = 60 * 60_000;

// Mirror of deepWorkStore's phaseMs — how long the current pomodoro phase runs.
function phaseTotalMs(phase, cfg) {
  if (phase === 'short') return cfg.shortMin * 60_000;
  if (phase === 'long') return cfg.longMin * 60_000;
  return cfg.focusMin * 60_000;
}

function fmtClock(ms, roundUp = false) {
  const total = Math.max(0, roundUp ? Math.ceil(ms / 1000) : Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtHM(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.round((totalSec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatDue(str) {
  try { return format(parseISO(str), str.includes('T') ? 'MMM d, h:mm a' : 'MMM d'); }
  catch { return str; }
}

function Chip({ icon, emoji, label, muted }) {
  if (!label) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-label-sm ${
      muted ? 'bg-surface-container text-on-surface-variant' : 'bg-primary/10 text-primary'
    }`}>
      {emoji
        ? <span className="text-[13px]">{emoji}</span>
        : icon ? <span className="material-symbols-outlined text-[13px]">{icon}</span> : null}
      <span className="capitalize">{label}</span>
    </span>
  );
}

// Circular progress dial — conic fill on a faint track, with an open face in
// the middle for the clock. `tone` switches the fill between the accent (focus
// / count-up) and the calm success green (pomodoro breaks).
function ProgressRing({ fraction, tone = 'primary', children }) {
  const deg = Math.max(0, Math.min(1, fraction || 0)) * 360;
  const fill = tone === 'success' ? 'rgb(var(--tb-success))' : 'rgb(var(--tb-primary))';
  const track = 'rgb(var(--tb-outline-variant) / 0.45)';
  return (
    <div
      className="relative rounded-full grid place-items-center w-[clamp(160px,22vw,264px)] aspect-square transition-[background] duration-500"
      style={{ background: `conic-gradient(${fill} ${deg}deg, ${track} ${deg}deg)` }}
    >
      <div className="absolute inset-[clamp(12px,1.4vw,18px)] rounded-full bg-surface-container flex flex-col items-center justify-center gap-1 text-center px-3">
        {children}
      </div>
    </div>
  );
}

/**
 * Fullscreen, chrome-free Deep Work takeover. Mounted once at the app level
 * (next to <FocusEngine/>) so it paints over the sidebar/top bar entirely —
 * there is no route change involved, matching the technique FocusOverlay
 * already uses for Breathe/Meditate. Renders nothing until a task is opened
 * via deepWorkStore.openSetup(taskId).
 *
 * Active layout is "Split Focus": the left half is the task + a live sub-task
 * checklist you tick as you go; the right half is a tinted timer panel with a
 * progress dial and phase pills.
 */
export default function DeepWorkOverlay() {
  const taskId        = useDeepWorkStore((s) => s.taskId);
  const sessionId      = useDeepWorkStore((s) => s.sessionId);
  const timerMode      = useDeepWorkStore((s) => s.timerMode);
  const phase          = useDeepWorkStore((s) => s.phase);
  const round          = useDeepWorkStore((s) => s.round);
  const pomoConfig     = useDeepWorkStore((s) => s.pomoConfig);
  const checkInStatus  = useDeepWorkStore((s) => s.checkIn.status);
  const setTimerMode   = useDeepWorkStore((s) => s.setTimerMode);
  const switchTimerMode = useDeepWorkStore((s) => s.switchTimerMode);
  const startSession    = useDeepWorkStore((s) => s.startSession);
  const stopSession     = useDeepWorkStore((s) => s.stopSession);
  const closeSetup      = useDeepWorkStore((s) => s.closeSetup);
  const phaseRemaining  = useDeepWorkStore(deepWorkPhaseRemaining);
  const workedMs        = useDeepWorkStore((s) => s.workedMs());

  const [confirmingStop, setConfirmingStop] = useState(false);
  const [starting, setStarting] = useState(false);

  // Freeform notes pad — seeded once per task, autosaved (debounced) to the
  // silent /tasks/:id/notes endpoint so it doesn't spam activity/socket traffic.
  const [notes, setNotes] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const notesSeededFor = useRef(null);
  const notesTimer = useRef(null);
  const notesPending = useRef(null);

  const qc = useQueryClient();
  const { toggle: toggleSubTask, busyId: subTaskBusyId } = useTaskComplete();

  const { data: task } = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => api.get(`/tasks/${taskId}`).then((r) => r.data),
    enabled: !!taskId,
  });
  const { data: subTasks = [] } = useQuery({
    queryKey: ['tasks', { parentTaskId: taskId }],
    queryFn: () => api.get('/tasks', { params: { parentTaskId: taskId } }).then((r) => r.data),
    enabled: !!taskId,
  });
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then((r) => r.data),
    enabled: !!taskId,
  });
  const { data: summary } = useQuery({
    queryKey: ['deep-work-summary', taskId],
    queryFn: () => api.get(`/deep-work/tasks/${taskId}/summary`).then((r) => r.data),
    enabled: !!taskId,
  });

  // Ticker + heartbeat — only run while a session is actually active.
  useEffect(() => {
    if (!sessionId) return undefined;
    const tickId = setInterval(() => useDeepWorkStore.getState().tick(), 250);
    const hbId   = setInterval(() => useDeepWorkStore.getState().heartbeat(), 30_000);
    return () => { clearInterval(tickId); clearInterval(hbId); };
  }, [sessionId]);

  // Warn on tab close/refresh mid-session.
  useEffect(() => {
    if (!sessionId) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [sessionId]);

  // Escape only dismisses the pre-start setup screen — once a session is
  // running the only way out is the confirmed Stop flow.
  useEffect(() => {
    if (!taskId || sessionId) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeSetup(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [taskId, sessionId, closeSetup]);

  // Lock page scroll while the takeover is open.
  useEffect(() => {
    if (!taskId) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [taskId]);

  // Refresh the rollup once a session ends (manual/timeout/max_duration).
  const prevSessionId = useRef(sessionId);
  useEffect(() => {
    if (prevSessionId.current && !sessionId) {
      qc.invalidateQueries({ queryKey: ['deep-work-summary', taskId] });
    }
    prevSessionId.current = sessionId;
  }, [sessionId, taskId, qc]);

  // Seed the notes pad from the task once per task (not on every refetch, so
  // typing is never clobbered by a background task refresh).
  useEffect(() => {
    if (task && notesSeededFor.current !== task.id) {
      setNotes(task.task_notes || '');
      notesSeededFor.current = task.id;
    }
  }, [task]);

  // Flush any pending note write immediately (debounce timer or blur).
  const flushNotes = () => {
    if (notesTimer.current) { clearTimeout(notesTimer.current); notesTimer.current = null; }
    if (notesPending.current == null) return;
    const val = notesPending.current;
    notesPending.current = null;
    setNotesSaving(true);
    api.put(`/tasks/${taskId}/notes`, { task_notes: val })
      .then(() => qc.setQueryData(['task', taskId], (old) => (old ? { ...old, task_notes: val } : old)))
      .catch(() => { /* offline — next edit retries */ })
      .finally(() => setNotesSaving(false));
  };

  const saveNotes = (val) => {
    setNotes(val);
    notesPending.current = val;
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(flushNotes, 1200);
  };

  useEffect(() => () => { if (notesTimer.current) clearTimeout(notesTimer.current); }, []);

  if (!taskId) return null;

  const project = task?.project_id ? projects.find((p) => p.id === task.project_id) : null;

  const handleStart = async () => {
    setStarting(true);
    try {
      await startSession();
      // Starting moves the task to In Progress on the server — refresh the
      // cached task (this overlay's status chip) and the lists/boards.
      qc.invalidateQueries({ queryKey: ['task', taskId] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['tasks-today'] });
      qc.invalidateQueries({ queryKey: ['tasks-overdue'] });
      qc.invalidateQueries({ queryKey: ['tasks-upcoming'] });
    } finally { setStarting(false); }
  };

  const handleStop = () => {
    stopSession('manual');
    setConfirmingStop(false);
  };

  // ── Derived timer values ─────────────────────────────────────────────────
  const isBreak = timerMode === 'pomodoro' && phase !== 'focus';
  const ringFraction = timerMode === 'pomodoro'
    ? (() => { const total = phaseTotalMs(phase, pomoConfig); return total > 0 ? (total - phaseRemaining) / total : 0; })()
    : Math.min(workedMs / COUNTUP_CAP_MS, 1);
  const totalTodaySec = (summary?.total_sec || 0) + Math.round(workedMs / 1000);
  const doneCount = subTasks.filter((t) => t.is_completed).length;
  const subPct = subTasks.length ? Math.round((doneCount / subTasks.length) * 100) : 0;

  // Chips (deadline is shown on its own line for prominence, so it's not here).
  const chips = task && (
    <div className="flex flex-wrap gap-2">
      <Chip icon="flag" label={task.priority} />
      <Chip icon="label_important" label={STATUS_LABELS[task.status] || task.status} />
      {task.assigned_to_name && <Chip icon="person" label={task.assigned_to_name} />}
      {task.area_name && <Chip emoji={task.area_icon || '🗂️'} label={task.area_name} />}
      {project && <Chip emoji={project.cover_icon || '📁'} label={project.name} />}
      {task.tags?.map((tag) => <Chip key={tag} label={tag} muted />)}
    </div>
  );

  const dueLine = task?.due_date && (
    <span className="inline-flex items-center gap-1.5 text-label-md text-on-surface-variant">
      <span className="material-symbols-outlined text-[16px]">event</span>
      Due {formatDue(task.due_date)}
    </span>
  );

  const subTaskList = (
    <div className="space-y-1.5">
      {subTasks.map((st) => (
        <button
          key={st.id}
          type="button"
          onClick={() => toggleSubTask(st)}
          disabled={subTaskBusyId === st.id}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl bg-surface-container-lowest hover:bg-surface-container/60 transition text-left disabled:opacity-60"
        >
          <span className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 transition ${
            st.is_completed ? 'bg-success border-success text-on-success' : 'border-outline'
          }`}>
            {!!st.is_completed && <span className="material-symbols-outlined text-[12px]">check</span>}
          </span>
          <span className={`text-body-md flex-1 min-w-0 truncate ${st.is_completed ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>
            {st.title}
          </span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] bg-surface flex flex-col" role="dialog" aria-modal="true">
      {/* Slim brand bar */}
      <div className="flex items-center gap-2 px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-2 flex-shrink-0">
        <span className="material-symbols-outlined text-primary">center_focus_strong</span>
        <h1 className="text-body-lg font-bold text-on-surface flex-1 tracking-tight">Deep Work</h1>
        {!sessionId && (
          <button
            onClick={closeSetup}
            aria-label="Cancel"
            className="w-10 h-10 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant transition"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        )}
      </div>

      {/* ══════════════════════ SETUP (pre-start) ══════════════════════ */}
      {!sessionId ? (
        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-[max(2rem,env(safe-area-inset-bottom))] flex items-center justify-center">
          <div className="w-full max-w-md flex flex-col gap-6 text-center py-6">
            {!task ? (
              <p className="text-body-md text-on-surface-variant">Loading task…</p>
            ) : (
              <>
                <div className="flex flex-col items-center gap-3">
                  <span className="text-label-sm tracking-wide text-on-surface-variant/70 font-bold">
                    Focus on
                  </span>
                  <h2 className="text-headline-md font-light text-on-background break-words">{task.title}</h2>
                  <div className="flex flex-wrap gap-2 justify-center">{chips.props.children}</div>
                  {dueLine}
                  {task.description && (
                    <p className="text-body-md text-on-surface-variant whitespace-pre-wrap">{task.description}</p>
                  )}
                </div>

                <div className="flex flex-col gap-3 text-left">
                  <p className="text-label-sm tracking-wide text-on-surface-variant/60 font-bold">Timer mode</p>
                  <div className="flex gap-2">
                    {[['pomodoro', 'Pomodoro'], ['countup', 'Flow']].map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setTimerMode(mode)}
                        className={`flex-1 h-11 rounded-full text-label-md transition ${
                          timerMode === mode
                            ? 'bg-primary text-on-primary font-bold'
                            : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-label-sm text-on-surface-variant/70 min-h-[1.25rem]">
                    {timerMode === 'countup'
                      ? 'Flow runs open-ended up to a 1-hour cap, then offers another hour.'
                      : `${pomoConfig.focusMin}-minute focus blocks with breaks between.`}
                    {!!summary?.total_sec && ` · ${fmtHM(summary.total_sec)} logged so far.`}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleStart}
                  disabled={starting}
                  className="h-14 rounded-full bg-primary text-on-primary text-body-md font-bold hover:bg-primary/90 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[20px]">center_focus_strong</span>
                  {starting ? 'Starting…' : 'Start Deep Work'}
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        /* ══════════════════════ ACTIVE (Split Focus) ══════════════════════ */
        <div className="flex-1 min-h-0 grid grid-rows-[1.1fr_1fr] md:grid-rows-1 md:grid-cols-[1.15fr_1fr]">

          {/* ── Left: the work ──────────────────────────────────────────── */}
          <div className="flex flex-col gap-4 min-h-0 overflow-y-auto px-6 md:px-10 pt-2 pb-6">
            {task && (
              <>
                {chips}
                <div className="flex flex-col gap-2">
                  <h2 className="text-headline-lg font-light text-on-background break-words leading-tight">
                    {task.title}
                  </h2>
                  {dueLine}
                  {task.description && (
                    <p className="text-body-md text-on-surface-variant whitespace-pre-wrap">{task.description}</p>
                  )}
                </div>

                {subTasks.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-label-sm">
                      <span className="tracking-wide text-on-surface-variant/60 font-bold">Sub-tasks</span>
                      <span className="text-on-surface-variant tabular-nums">{doneCount} of {subTasks.length} done</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-container-high overflow-hidden">
                      <div className="h-full bg-success rounded-full transition-all duration-500" style={{ width: `${subPct}%` }} />
                    </div>
                    {subTaskList}
                  </div>
                )}

                {/* Notes pad — write thoughts as you work; autosaves */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-label-sm tracking-wide text-on-surface-variant/60 font-bold">Notes</span>
                    <span className="text-label-sm text-on-surface-variant/50">{notesSaving ? 'Saving…' : 'Markdown'}</span>
                  </div>
                  <TaskNotes
                    value={notes}
                    onChange={saveNotes}
                    onBlur={flushNotes}
                    height={220}
                    placeholder="Capture thoughts, blockers and links as you work…"
                  />
                </div>
              </>
            )}
          </div>

          {/* ── Right: the clock ────────────────────────────────────────── */}
          <div className="bg-surface-container flex flex-col items-center justify-center gap-5 px-6 md:px-10 py-8">
            <ProgressRing fraction={ringFraction} tone={isBreak ? 'success' : 'primary'}>
              {timerMode === 'pomodoro' ? (
                <>
                  <span className={`text-label-sm font-bold tracking-wide ${isBreak ? 'text-success' : 'text-primary'}`}>
                    {phase === 'focus' ? 'Focus' : phase === 'long' ? 'Long break' : 'Short break'}
                  </span>
                  <span className="text-[clamp(26px,4.2vw,46px)] font-light tabular-nums text-on-surface leading-none">
                    {fmtClock(phaseRemaining, true)}
                  </span>
                  <span className="text-label-sm text-on-surface-variant">Round {round + 1}</span>
                </>
              ) : (
                <>
                  <span className="text-label-sm font-bold tracking-wide text-primary">Elapsed</span>
                  <span className="text-[clamp(26px,4.2vw,46px)] font-light tabular-nums text-on-surface leading-none">
                    {fmtClock(workedMs)}
                  </span>
                  <span className="text-label-sm text-on-surface-variant">of 60:00</span>
                </>
              )}
            </ProgressRing>

            {/* Clock-type toggle — switchable mid-session, carries worked time over */}
            <div className="flex gap-1 bg-surface-container-lowest rounded-full p-1">
              {[['pomodoro', 'Pomodoro'], ['countup', 'Flow']].map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => switchTimerMode(mode)}
                  className={`px-4 h-9 rounded-full text-label-sm font-bold transition ${
                    timerMode === mode
                      ? 'bg-primary text-on-primary'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <p className="text-label-md text-on-surface-variant tabular-nums">
              {fmtHM(totalTodaySec)} on this task
            </p>

            {!confirmingStop ? (
              <button
                type="button"
                onClick={() => setConfirmingStop(true)}
                className="h-12 px-8 rounded-full border border-error text-error text-label-md font-bold hover:bg-error-container transition flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">stop</span>
                Stop
              </button>
            ) : (
              <div className="flex flex-col gap-2 items-center">
                <p className="text-label-sm text-on-surface-variant">End deep work session?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingStop(false)}
                    className="h-10 px-5 rounded-full bg-surface-container-lowest text-on-surface-variant text-label-sm hover:bg-surface-container-high transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleStop}
                    className="h-10 px-5 rounded-full bg-error text-on-error text-label-sm font-bold hover:bg-error/90 transition"
                  >
                    End session
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {checkInStatus === 'prompting' && <DeepWorkCheckInModal taskTitle={task?.title || ''} />}
    </div>
  );
}
