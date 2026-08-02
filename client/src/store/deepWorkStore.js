import { create } from 'zustand';
import { api } from '../auth/AuthContext';
import { playChime } from './focusStore';

// ─────────────────────────────────────────────────────────────────────────────
// Deep Work Mode — single-task, chrome-free focus takeover.
//
// Mirrors the timestamp-based tick model already used by focusStore.js: we
// persist *timestamps* (phaseStartedAt / phaseEndsAt) rather than a
// decrementing counter, so displayed/derived elapsed time stays accurate
// across backgrounded tabs. A single ticker (in <DeepWorkOverlay/>) drives
// `tick()` on an interval while a session is active.
//
// Session state is persisted to localStorage (no store in this app uses
// zustand's `persist` middleware, so we do it by hand) — this is what makes
// Deep Work Mode device-scoped: a refresh on this device rehydrates the
// takeover, but nothing about it exists on any other device/tab.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'deepWorkSession';
const CHECK_IN_INTERVAL_MS = 15 * 60_000;
const CHECK_IN_TIMEOUT_MS  = 2 * 60_000;
const COUNTUP_CAP_MS       = 60 * 60_000;
const DEFAULT_POMO_CONFIG  = { focusMin: 25, shortMin: 5, longMin: 15, longEvery: 4 };
const CHECK_IN_TITLE = '⏰ Still there? — Deep Work';

function phaseMs(phase, config) {
  if (phase === 'short') return config.shortMin * 60_000;
  if (phase === 'long')  return config.longMin * 60_000;
  return config.focusMin * 60_000;
}

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved?.sessionId) return null;
    return saved;
  } catch { return null; }
}

function persist(state) {
  if (!state.sessionId) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  const {
    taskId, sessionId, timerMode, pomoConfig,
    phase, round, phaseStartedAt, phaseEndsAt, workedMsBase, checkIn,
  } = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    taskId, sessionId, timerMode, pomoConfig,
    phase, round, phaseStartedAt, phaseEndsAt, workedMsBase, checkIn,
  }));
}

let originalDocTitle = null;
function startTitleFlash() {
  if (originalDocTitle == null) originalDocTitle = document.title;
}
function stopTitleFlash() {
  if (originalDocTitle != null) { document.title = originalDocTitle; originalDocTitle = null; }
}
function tickTitleFlash(now) {
  if (originalDocTitle == null) return;
  document.title = Math.floor(now / 1000) % 2 === 0 ? CHECK_IN_TITLE : originalDocTitle;
}

const persisted = loadPersisted();

export const useDeepWorkStore = create((set, get) => ({
  now: Date.now(),

  // Setup / session identity
  taskId:    persisted?.taskId ?? null,
  sessionId: persisted?.sessionId ?? null,
  timerMode: persisted?.timerMode ?? 'pomodoro',
  pomoConfig: persisted?.pomoConfig ?? DEFAULT_POMO_CONFIG,

  // Running-session state (only meaningful once sessionId is set)
  phase:          persisted?.phase ?? 'focus',
  round:          persisted?.round ?? 0,
  phaseStartedAt: persisted?.phaseStartedAt ?? null,
  phaseEndsAt:    persisted?.phaseEndsAt ?? null,
  workedMsBase:   persisted?.workedMsBase ?? 0,

  checkIn: persisted?.checkIn ?? { status: 'none', firesAt: null, deadlineAt: null },

  // Snapshot of worked-ms taken the instant a check-in fires, so a timeout
  // truncates the logged duration to "last confirmed work", not the
  // unanswered 2-minute grace window. Not persisted — a refresh mid-prompt
  // just re-derives from phase timestamps, which is close enough.
  _workedMsAtCheckInFire: null,

  isRunning: () => !!get().sessionId,

  // ── Setup (before a session has actually started) ────────────────────────
  openSetup: (taskId) => {
    if (get().sessionId) return; // a session is already live — nothing to do
    set({ taskId, timerMode: get().timerMode || 'pomodoro' });
  },
  closeSetup: () => {
    if (get().sessionId) return; // can't dismiss an active session this way
    set({ taskId: null });
  },
  setTimerMode: (mode) => {
    if (get().sessionId) return;
    set({ timerMode: mode });
  },
  setPomoConfig: (patch) => {
    if (get().sessionId) return;
    set({ pomoConfig: { ...get().pomoConfig, ...patch } });
  },

  // ── Start ──────────────────────────────────────────────────────────────
  startSession: async () => {
    const { taskId, timerMode, pomoConfig } = get();
    if (!taskId || get().sessionId) return;
    const res = await api.post('/deep-work/sessions', { task_id: taskId, timer_mode: timerMode });
    const now = Date.now();
    const endsAt = timerMode === 'pomodoro' ? now + phaseMs('focus', pomoConfig) : now + COUNTUP_CAP_MS;
    const next = {
      sessionId: res.data.id,
      phase: 'focus',
      round: 0,
      phaseStartedAt: now,
      phaseEndsAt: endsAt,
      workedMsBase: 0,
      checkIn: { status: 'none', firesAt: now + CHECK_IN_INTERVAL_MS, deadlineAt: null },
    };
    set(next);
    persist(get());
  },

  // ── Switch clock type mid-session ────────────────────────────────────────
  // Folds the time worked so far into workedMsBase and restarts a fresh leg in
  // the new mode, so accumulated Deep Work Time carries across the switch.
  switchTimerMode: (mode) => {
    const s = get();
    if (!s.sessionId || mode === s.timerMode) return;
    const now = Date.now();
    const carried = get().workedMs();
    set({
      timerMode: mode,
      phase: 'focus',
      round: 0,
      phaseStartedAt: now,
      phaseEndsAt: mode === 'pomodoro' ? now + phaseMs('focus', s.pomoConfig) : now + COUNTUP_CAP_MS,
      workedMsBase: carried,
    });
    persist(get());
  },

  // ── Derived: worked ms so far in the current session ─────────────────────
  workedMs: () => {
    const s = get();
    if (!s.sessionId) return 0;
    if (s.timerMode === 'countup') {
      return s.workedMsBase + Math.min(s.now - s.phaseStartedAt, COUNTUP_CAP_MS);
    }
    // pomodoro: only 'focus' phases count
    if (s.phase !== 'focus') return s.workedMsBase;
    return s.workedMsBase + Math.min(s.now - s.phaseStartedAt, s.phaseEndsAt - s.phaseStartedAt);
  },

  // ── Tick — the single driver for phase transitions + check-in timing ─────
  tick: () => {
    const now = Date.now();
    set({ now });
    const s = get();
    if (!s.sessionId) return;

    // Countup cap
    if (s.timerMode === 'countup' && now >= s.phaseEndsAt) {
      playChime();
      get().stopSession('max_duration');
      return;
    }

    // Pomodoro phase transitions
    if (s.timerMode === 'pomodoro' && now >= s.phaseEndsAt) {
      playChime();
      if (s.phase === 'focus') {
        const workedMsBase = s.workedMsBase + (s.phaseEndsAt - s.phaseStartedAt);
        const round = s.round + 1;
        const nextPhase = round % s.pomoConfig.longEvery === 0 ? 'long' : 'short';
        set({
          workedMsBase, round, phase: nextPhase,
          phaseStartedAt: now, phaseEndsAt: now + phaseMs(nextPhase, s.pomoConfig),
        });
      } else {
        set({ phase: 'focus', phaseStartedAt: now, phaseEndsAt: now + phaseMs('focus', s.pomoConfig) });
      }
      persist(get());
    }

    // Check-in
    const ci = get().checkIn;
    if (ci.status === 'none' && now >= ci.firesAt) {
      set({
        checkIn: { status: 'prompting', firesAt: ci.firesAt, deadlineAt: now + CHECK_IN_TIMEOUT_MS },
        _workedMsAtCheckInFire: get().workedMs(),
      });
      playChime();
      startTitleFlash();
      persist(get());
    } else if (ci.status === 'prompting') {
      startTitleFlash(); // idempotent — also covers rehydration mid-prompt after a refresh
      tickTitleFlash(now);
      if (now >= ci.deadlineAt) {
        get().stopSession('timeout');
        return;
      }
    }
  },

  confirmStillWorking: () => {
    const now = Date.now();
    stopTitleFlash();
    set({ checkIn: { status: 'none', firesAt: now + CHECK_IN_INTERVAL_MS, deadlineAt: null }, _workedMsAtCheckInFire: null });
    persist(get());
  },

  // ── Stop (manual / timeout / max_duration) ────────────────────────────────
  stopSession: (reason) => {
    const s = get();
    if (!s.sessionId) return;
    const sessionId = s.sessionId;
    const finalMs = reason === 'timeout' && s._workedMsAtCheckInFire != null
      ? s._workedMsAtCheckInFire
      : s.workedMs();

    stopTitleFlash();
    set({
      sessionId: null,
      phase: 'focus', round: 0, phaseStartedAt: null, phaseEndsAt: null, workedMsBase: 0,
      checkIn: { status: 'none', firesAt: null, deadlineAt: null },
      _workedMsAtCheckInFire: null,
      // 'max_duration' keeps the setup screen open on the same task for a
      // one-click "start another hour"; manual/timeout drop back to idle.
      taskId: reason === 'max_duration' ? s.taskId : null,
    });
    persist(get());

    api.post(`/deep-work/sessions/${sessionId}/stop`, {
      duration_sec: Math.round(finalMs / 1000),
      ended_reason: reason,
    }).catch(() => { /* best-effort — heartbeats already persisted most of it */ });
  },

  heartbeat: () => {
    const s = get();
    if (!s.sessionId) return;
    api.put(`/deep-work/sessions/${s.sessionId}/heartbeat`, {
      duration_sec: Math.round(s.workedMs() / 1000),
    }).catch(() => { /* offline / not critical, next heartbeat retries */ });
  },
}));

// ── Derived selectors ────────────────────────────────────────────────────────
export function deepWorkPhaseRemaining(s) {
  if (!s.sessionId || s.timerMode !== 'pomodoro') return 0;
  return Math.max(0, s.phaseEndsAt - s.now);
}
export function deepWorkCountupRemaining(s) {
  if (!s.sessionId || s.timerMode !== 'countup') return 0;
  return Math.max(0, s.phaseEndsAt - s.now);
}
export function deepWorkCheckInRemaining(s) {
  if (s.checkIn.status !== 'prompting') return 0;
  return Math.max(0, s.checkIn.deadlineAt - s.now);
}
