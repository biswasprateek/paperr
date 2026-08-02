import { create } from 'zustand';
import { api } from '../auth/AuthContext';

// ─────────────────────────────────────────────────────────────────────────────
// Focus / wellness engine state.
//
// Timers must keep running while the user swipes between Home board pages or
// navigates to another route — a widget that held its countdown in component
// state would reset on every unmount. So all timer state lives here in a single
// global store and a single ticker (<FocusEngine/>) drives it. Widgets are thin
// views over this store. We persist *timestamps* (endsAt / startedAt) rather
// than decrementing counters so the displayed time stays accurate even when the
// tab is backgrounded and the ticker pauses.
// ─────────────────────────────────────────────────────────────────────────────

// ── Saved (named) timers ─────────────────────────────────────────────────────
// Personal + device-local, so localStorage rather than the server — same call
// as the alarm clock's saved alarms.
const SAVED_TIMERS_KEY = 'paperr:savedTimers';

function loadSavedTimers() {
  try {
    const raw = localStorage.getItem(SAVED_TIMERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function persistSavedTimers(savedTimers) {
  try { localStorage.setItem(SAVED_TIMERS_KEY, JSON.stringify(savedTimers)); } catch { /* storage unavailable */ }
}
function newSavedTimerId() {
  return `st-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Session logging ──────────────────────────────────────────────────────────
const logListeners = new Set();

/** Subscribe to "a wellness session was logged" — used to refresh analytics queries. */
export function onFocusLogged(cb) {
  logListeners.add(cb);
  return () => logListeners.delete(cb);
}

/**
 * Persist a completed (or partial/manual) wellness session — Pomodoro,
 * Meditation, Breathing. `moodBefore`/`moodAfter` (1-5) are optional and, if
 * given, are written as linked mood_logs rows server-side rather than
 * columns on the session (see server/routes/wellness.js).
 */
export async function logWellnessSession({ type, durationSec, label = null, completed = true, source = 'live', moodBefore = null, moodAfter = null }) {
  if (!durationSec || durationSec < 1) return;
  try {
    await api.post('/wellness/sessions', {
      type,
      duration_sec: Math.round(durationSec),
      label,
      completed: completed ? 1 : 0,
      source,
      mood_before: moodBefore,
      mood_after: moodAfter,
    });
  } catch { /* offline / not critical */ }
  logListeners.forEach((cb) => { try { cb(); } catch { /* ignore */ } });
}

// ── Chime (synthesized — no audio asset needed) ──────────────────────────────
let _ac = null;
export function playChime() {
  try {
    _ac = _ac || new (window.AudioContext || window.webkitAudioContext)();
    if (_ac.state === 'suspended') _ac.resume();
    const start = _ac.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = _ac.createOscillator();
      const gain = _ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(_ac.destination);
      const t = start + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.start(t);
      osc.stop(t + 0.55);
    });
  } catch { /* audio unavailable */ }
}

const POMO_DEFAULTS = { focusMin: 25, shortMin: 5, longMin: 15, longEvery: 4, autoStart: true };

export const useFocusStore = create((set, get) => ({
  // Re-render heartbeat written by the ticker while anything is running.
  now: Date.now(),

  pomodoro:   { status: 'idle', phase: 'focus', endsAt: null, remainingMs: POMO_DEFAULTS.focusMin * 60000, round: 0, config: POMO_DEFAULTS },
  stopwatch:  { status: 'idle', startedAt: null, elapsedMs: 0, laps: [] },
  timer:      { status: 'idle', endsAt: null, remainingMs: 0, durationMs: 0 },
  savedTimers: loadSavedTimers(), // [{ id, name, ms }] — user-named durations for quick reuse
  breathing:  { status: 'idle', startedAt: null, endedAt: null, elapsedMs: 0, pattern: 'box', moodBefore: null },
  meditation: {
    status: 'idle', endsAt: null, remainingMs: 0, durationMs: 10 * 60000, src: null, name: '', playing: false,
    moodBefore: null,               // captured at start, carried through to the finished-rating screen
    finishedElapsedMs: 0, finishedCompleted: true, // snapshot taken when entering 'finished', consumed by finishMeditation
  },
  ambient:    { src: null, name: '', playing: false, volume: 0.6 },

  // True while something needs the per-tick UI refresh (gates the ticker).
  isRunning: () => {
    const s = get();
    return (
      s.pomodoro.status === 'running' ||
      s.stopwatch.status === 'running' ||
      s.timer.status === 'running' ||
      s.meditation.status === 'running' ||
      s.breathing.status === 'running'
    );
  },

  // ── Ticker — sets `now` and resolves any completed countdowns. ─────────────
  tick: () => {
    const n = Date.now();
    set({ now: n });
    const s = get();

    if (s.pomodoro.status === 'running' && s.pomodoro.endsAt && n >= s.pomodoro.endsAt) {
      get()._advancePomodoro(true);
    }
    if (s.timer.status === 'running' && s.timer.endsAt && n >= s.timer.endsAt) {
      playChime();
      set({ timer: { ...get().timer, status: 'done', endsAt: null, remainingMs: 0 } });
    }
    if (s.meditation.status === 'running' && s.meditation.endsAt && n >= s.meditation.endsAt) {
      playChime();
      // Don't log yet — hand off to a 'finished' rating step (mirrors
      // Breathing's finished/finishBreathing split) so an optional
      // post-session mood can be attached before the session is persisted.
      set({
        meditation: {
          ...get().meditation, status: 'finished', endsAt: null, remainingMs: 0, playing: false,
          finishedElapsedMs: get().meditation.durationMs, finishedCompleted: true,
        },
      });
    }
  },

  // ── Pomodoro ───────────────────────────────────────────────────────────────
  _phaseMs: (phase, config) => {
    if (phase === 'short') return config.shortMin * 60000;
    if (phase === 'long') return config.longMin * 60000;
    return config.focusMin * 60000;
  },
  startPomodoro: () => {
    const p = get().pomodoro;
    if (p.status === 'running') return;
    const rem = p.status === 'paused' ? p.remainingMs : get()._phaseMs(p.phase, p.config);
    set({ pomodoro: { ...p, status: 'running', endsAt: Date.now() + rem, remainingMs: rem } });
  },
  pausePomodoro: () => {
    const p = get().pomodoro;
    if (p.status !== 'running') return;
    set({ pomodoro: { ...p, status: 'paused', remainingMs: Math.max(0, p.endsAt - Date.now()), endsAt: null } });
  },
  resetPomodoro: () => {
    const p = get().pomodoro;
    set({ pomodoro: { ...p, status: 'idle', phase: 'focus', endsAt: null, remainingMs: get()._phaseMs('focus', p.config), round: 0 } });
  },
  skipPomodoro: () => get()._advancePomodoro(false),
  _advancePomodoro: (log) => {
    const p = get().pomodoro;
    let { round } = p;
    let nextPhase;
    if (p.phase === 'focus') {
      if (log) logWellnessSession({ type: 'pomodoro', durationSec: p.config.focusMin * 60 });
      round += 1;
      nextPhase = round % p.config.longEvery === 0 ? 'long' : 'short';
    } else {
      nextPhase = 'focus';
    }
    playChime();
    const rem = get()._phaseMs(nextPhase, p.config);
    const auto = p.config.autoStart;
    set({
      pomodoro: {
        ...p, phase: nextPhase, round, remainingMs: rem,
        status: auto ? 'running' : 'idle',
        endsAt: auto ? Date.now() + rem : null,
      },
    });
  },
  setPomodoroConfig: (patch) => {
    const p = get().pomodoro;
    const config = { ...p.config, ...patch };
    const remainingMs = p.status === 'idle' ? get()._phaseMs(p.phase, config) : p.remainingMs;
    set({ pomodoro: { ...p, config, remainingMs } });
  },

  // ── Stopwatch ────────────────────────────────────────────────────────────
  startStopwatch: () => {
    const s = get().stopwatch;
    if (s.status === 'running') return;
    set({ stopwatch: { ...s, status: 'running', startedAt: Date.now() } });
  },
  pauseStopwatch: () => {
    const s = get().stopwatch;
    if (s.status !== 'running') return;
    set({ stopwatch: { ...s, status: 'paused', elapsedMs: s.elapsedMs + (Date.now() - s.startedAt), startedAt: null } });
  },
  resetStopwatch: () => set({ stopwatch: { status: 'idle', startedAt: null, elapsedMs: 0, laps: [] } }),
  lapStopwatch: () => {
    const s = get().stopwatch;
    const total = s.elapsedMs + (s.status === 'running' && s.startedAt ? Date.now() - s.startedAt : 0);
    set({ stopwatch: { ...s, laps: [...s.laps, total] } });
  },

  // ── Countdown timer ──────────────────────────────────────────────────────
  startTimer: (ms) => {
    const t = get().timer;
    if (ms != null) {
      set({ timer: { status: 'running', durationMs: ms, remainingMs: ms, endsAt: Date.now() + ms } });
    } else if (t.status === 'paused') {
      set({ timer: { ...t, status: 'running', endsAt: Date.now() + t.remainingMs } });
    } else if (t.durationMs > 0) {
      set({ timer: { ...t, status: 'running', remainingMs: t.durationMs, endsAt: Date.now() + t.durationMs } });
    }
  },
  pauseTimer: () => {
    const t = get().timer;
    if (t.status !== 'running') return;
    set({ timer: { ...t, status: 'paused', remainingMs: Math.max(0, t.endsAt - Date.now()), endsAt: null } });
  },
  resetTimer: () => set({ timer: { status: 'idle', endsAt: null, remainingMs: 0, durationMs: 0 } }),

  addSavedTimer: (name, ms) => {
    const trimmed = (name || '').trim();
    if (!trimmed || !(ms > 0)) return;
    const savedTimers = [...get().savedTimers, { id: newSavedTimerId(), name: trimmed, ms }];
    set({ savedTimers });
    persistSavedTimers(savedTimers);
  },
  deleteSavedTimer: (id) => {
    const savedTimers = get().savedTimers.filter((t) => t.id !== id);
    set({ savedTimers });
    persistSavedTimers(savedTimers);
  },

  // ── Breathing ────────────────────────────────────────────────────────────
  // A session is logged only on `finishBreathing` so an optional post-session
  // mood rating can be attached. `endBreathing` freezes the elapsed clock
  // (status 'finished') while that rating is captured; `resetBreathing`
  // discards a too-short session without logging.
  startBreathing: (pattern, moodBefore = null) => set({
    breathing: {
      status: 'running', startedAt: Date.now(), endedAt: null, elapsedMs: 0,
      pattern: pattern || get().breathing.pattern, moodBefore,
    },
  }),
  endBreathing: () => {
    const b = get().breathing;
    if (b.status !== 'running' || !b.startedAt) return;
    set({ breathing: { ...b, status: 'finished', endedAt: Date.now(), elapsedMs: Date.now() - b.startedAt } });
  },
  finishBreathing: (moodAfter = null) => {
    const b = get().breathing;
    const elapsedMs = b.status === 'running' && b.startedAt ? Date.now() - b.startedAt : b.elapsedMs;
    const dur = elapsedMs / 1000;
    if (dur >= 20) {
      logWellnessSession({ type: 'breathing', durationSec: dur, label: b.pattern, moodBefore: b.moodBefore, moodAfter });
    }
    set({ breathing: { status: 'idle', startedAt: null, endedAt: null, elapsedMs: 0, pattern: b.pattern, moodBefore: null } });
  },
  resetBreathing: () => set({ breathing: { ...get().breathing, status: 'idle', startedAt: null, endedAt: null, elapsedMs: 0, moodBefore: null } }),

  // ── Meditation ───────────────────────────────────────────────────────────
  // Mirrors Breathing's finished/finish split: a natural completion (tick())
  // or an early `stopMeditation()` past 30s both land on status 'finished'
  // rather than logging immediately, so an optional post-session mood can be
  // attached; `finishMeditation` is what actually persists the session.
  setMeditationDuration: (ms) => {
    const m = get().meditation;
    if (m.status !== 'idle') return;
    set({ meditation: { ...m, durationMs: ms, remainingMs: ms } });
  },
  startMeditation: (moodBefore = null) => {
    const m = get().meditation;
    if (m.status === 'running') return;
    const rem = m.status === 'paused' ? m.remainingMs : m.durationMs;
    set({
      meditation: {
        ...m, status: 'running', remainingMs: rem, endsAt: Date.now() + rem, playing: !!m.src,
        moodBefore: m.status === 'paused' ? m.moodBefore : moodBefore,
      },
    });
  },
  pauseMeditation: () => {
    const m = get().meditation;
    if (m.status !== 'running') return;
    set({ meditation: { ...m, status: 'paused', remainingMs: Math.max(0, m.endsAt - Date.now()), endsAt: null, playing: false } });
  },
  stopMeditation: () => {
    const m = get().meditation;
    if (m.status === 'running' || m.status === 'paused') {
      const remaining = m.status === 'running' && m.endsAt ? Math.max(0, m.endsAt - Date.now()) : m.remainingMs;
      const elapsedMs = m.durationMs - remaining;
      if (elapsedMs / 1000 >= 30) {
        set({ meditation: { ...m, status: 'finished', endsAt: null, remainingMs: 0, playing: false, finishedElapsedMs: elapsedMs, finishedCompleted: false } });
        return;
      }
    }
    set({ meditation: { ...m, status: 'idle', endsAt: null, remainingMs: m.durationMs, playing: false, moodBefore: null } });
  },
  finishMeditation: (moodAfter = null) => {
    const m = get().meditation;
    const durSec = (m.finishedElapsedMs || 0) / 1000;
    if (durSec >= 1) {
      logWellnessSession({ type: 'meditation', durationSec: durSec, completed: m.finishedCompleted, moodBefore: m.moodBefore, moodAfter });
    }
    set({ meditation: { ...m, status: 'idle', endsAt: null, remainingMs: m.durationMs, playing: false, moodBefore: null, finishedElapsedMs: 0 } });
  },
  loadMeditationAudio: (file) => {
    const m = get().meditation;
    if (m.src) URL.revokeObjectURL(m.src);
    set({ meditation: { ...m, src: file ? URL.createObjectURL(file) : null, name: file?.name || '' } });
  },

  // ── Ambient sound ────────────────────────────────────────────────────────
  loadAmbientAudio: (file) => {
    const a = get().ambient;
    if (a.src) URL.revokeObjectURL(a.src);
    set({ ambient: { ...a, src: file ? URL.createObjectURL(file) : null, name: file?.name || '', playing: false } });
  },
  toggleAmbient: () => {
    const a = get().ambient;
    if (!a.src) return;
    set({ ambient: { ...a, playing: !a.playing } });
  },
  setAmbientVolume: (v) => set({ ambient: { ...get().ambient, volume: v } }),
}));

// ── Derived selectors (compute live values from timestamps + `now`) ──────────
export function pomodoroRemaining(s) {
  const p = s.pomodoro;
  return p.status === 'running' && p.endsAt ? Math.max(0, p.endsAt - s.now) : p.remainingMs;
}
export function stopwatchElapsed(s) {
  const sw = s.stopwatch;
  return Math.max(0, sw.elapsedMs + (sw.status === 'running' && sw.startedAt ? s.now - sw.startedAt : 0));
}
export function timerRemaining(s) {
  const t = s.timer;
  return t.status === 'running' && t.endsAt ? Math.max(0, t.endsAt - s.now) : t.remainingMs;
}
export function meditationRemaining(s) {
  const m = s.meditation;
  return m.status === 'running' && m.endsAt ? Math.max(0, m.endsAt - s.now) : m.remainingMs;
}
export function breathingElapsed(s) {
  const b = s.breathing;
  return b.status === 'running' && b.startedAt ? Math.max(0, s.now - b.startedAt) : b.elapsedMs;
}
