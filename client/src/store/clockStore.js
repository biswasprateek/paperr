import { create } from 'zustand';

// ─────────────────────────────────────────────────────────────────────────────
// Alarm clock state. Alarms are personal + device-local (no cross-device sync
// need), so they're persisted to localStorage rather than the server — same
// call as the focus engine's ambient/meditation audio picks. A single global
// store + ticker (<ClockEngine/>) means an alarm still fires while the user is
// off on another page, exactly like the Pomodoro/Timer countdowns.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'paperr:alarms';
export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function loadAlarms() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAlarms(alarms) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(alarms)); } catch { /* storage unavailable */ }
}

function newAlarmId() {
  return `al-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Alarm tone (synthesized — two-tone siren, looped while ringing) ─────────
let _ac = null;
let _ringTimer = null;

function beep() {
  try {
    _ac = _ac || new (window.AudioContext || window.webkitAudioContext)();
    if (_ac.state === 'suspended') _ac.resume();
    const start = _ac.currentTime;
    [1046, 784].forEach((freq, i) => {
      const osc = _ac.createOscillator();
      const gain = _ac.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(_ac.destination);
      const t = start + i * 0.24;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.start(t);
      osc.stop(t + 0.25);
    });
  } catch { /* audio unavailable */ }
}

function startRingTone() {
  if (_ringTimer) return;
  beep();
  _ringTimer = setInterval(beep, 700);
}
function stopRingTone() {
  if (_ringTimer) { clearInterval(_ringTimer); _ringTimer = null; }
}

// Minutes from `now` until `alarm` next rings, assuming it stays enabled.
// One-off alarms (no repeat days) fire at the next occurrence of their time
// (today if not yet passed, else tomorrow). Repeating alarms search forward
// for the closest matching weekday. Used to pick the "upcoming" alarm to
// show in the Clock widget's single-alarm carousel.
export function minutesUntilNextFire(alarm, now = new Date()) {
  const [h, m] = alarm.time.split(':').map(Number);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const alarmMinutes = h * 60 + m;

  if (!alarm.days.length) {
    return alarmMinutes > nowMinutes ? alarmMinutes - nowMinutes : 1440 - nowMinutes + alarmMinutes;
  }

  const today = now.getDay();
  let best = Infinity;
  for (const d of alarm.days) {
    const dayDiff = (d - today + 7) % 7;
    let minutes = dayDiff * 1440 + (alarmMinutes - nowMinutes);
    if (minutes <= 0) minutes += 7 * 1440;
    best = Math.min(best, minutes);
  }
  return best;
}

export const useClockStore = create((set, get) => ({
  alarms: loadAlarms(),
  ringing: null,          // the alarm object currently going off, or null
  snoozeUntil: {},         // alarmId -> timestamp ms, suppresses re-fire after snooze
  _firedAt: {},             // alarmId -> "yyyy-MM-ddTHH:mm" guard against re-firing within the same minute

  addAlarm: (alarm) => {
    const a = {
      id: newAlarmId(),
      time: alarm.time,             // "HH:mm", 24h
      label: alarm.label || '',
      enabled: true,
      days: alarm.days || [],       // [] = one-off (auto-disables after firing)
    };
    const alarms = [...get().alarms, a].sort((x, y) => x.time.localeCompare(y.time));
    set({ alarms });
    saveAlarms(alarms);
    return a.id;
  },
  updateAlarm: (id, patch) => {
    const alarms = get().alarms
      .map((a) => (a.id === id ? { ...a, ...patch } : a))
      .sort((x, y) => x.time.localeCompare(y.time));
    set({ alarms });
    saveAlarms(alarms);
  },
  deleteAlarm: (id) => {
    const alarms = get().alarms.filter((a) => a.id !== id);
    set({ alarms });
    saveAlarms(alarms);
  },
  toggleAlarm: (id) => {
    const a = get().alarms.find((x) => x.id === id);
    if (a) get().updateAlarm(id, { enabled: !a.enabled });
  },

  // Called every second by <ClockEngine/>. Fires at most one alarm at a time.
  checkAlarms: () => {
    const s = get();
    if (s.ringing) return;
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const minuteKey = `${now.toDateString()}T${hhmm}`;
    const day = now.getDay();

    for (const a of s.alarms) {
      if (!a.enabled || a.time !== hhmm) continue;
      if (a.days.length && !a.days.includes(day)) continue;
      if (s._firedAt[a.id] === minuteKey) continue;
      const snoozed = s.snoozeUntil[a.id];
      if (snoozed && now.getTime() < snoozed) continue;

      set((st) => ({ ringing: a, _firedAt: { ...st._firedAt, [a.id]: minuteKey } }));
      if (!a.days.length) get().updateAlarm(a.id, { enabled: false });
      startRingTone();
      break;
    }
  },

  dismissAlarm: () => {
    stopRingTone();
    set({ ringing: null });
  },
  snoozeAlarm: (minutes = 9) => {
    const r = get().ringing;
    stopRingTone();
    if (!r) { set({ ringing: null }); return; }
    set((s) => ({ ringing: null, snoozeUntil: { ...s.snoozeUntil, [r.id]: Date.now() + minutes * 60000 } }));
  },
}));
