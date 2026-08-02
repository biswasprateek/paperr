import React, { useState } from 'react';
import { useUiStore } from '../store/uiStore';
import WidgetShell from './WidgetShell';
import FocusOverlay from '../components/FocusOverlay';
import MoodPicker, { MOOD_LABELS } from '../components/analytics/MoodPicker';
import {
  useFocusStore, logWellnessSession,
  pomodoroRemaining, stopwatchElapsed, timerRemaining, meditationRemaining, breathingElapsed,
} from '../store/focusStore';

// ─────────────────────────────────────────────────────────────────────────────
// Focus & wellness widgets. Each interactive "app" is a self-contained body
// component (PomodoroApp, StopwatchApp, …) that reads/writes the global
// focusStore so it shares live state with every other instance of itself —
// including the full-size versions on the /apps page. The exported *Widget
// wrappers add the Home-board chrome.
// ─────────────────────────────────────────────────────────────────────────────

// ── Formatting ────────────────────────────────────────────────────────────────
function fmtMS(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function fmtClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const cs = Math.floor((ms % 1000) / 10);
  const base = h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return { base, cs: String(cs).padStart(2, '0') };
}

// ── Shared control button ─────────────────────────────────────────────────────
// `title` renders a native hover tooltip; distinct from `label` (the aria-label)
// since a tooltip can afford a fuller description than an icon's short a11y name.
function CtrlBtn({ icon, onClick, variant = 'plain', big, label, title }) {
  const cls = {
    primary: 'bg-primary text-on-primary shadow-soft',
    plain:   'bg-surface-container text-on-surface',
    danger:  'border border-error/40 text-error',
  }[variant];
  const dim = big ? 'w-14 h-14' : 'w-10 h-10';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title}
      className={`${dim} ${cls} rounded-full flex items-center justify-center active:scale-95 transition flex-shrink-0`}
    >
      <span className={`material-symbols-outlined ${big ? 'text-[26px]' : 'text-[20px]'}`}>{icon}</span>
    </button>
  );
}

function Stepper({ label, value, onChange, min = 1, max = 180, suffix = 'm' }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="text-body-md text-on-surface-variant">{label}</span>
      <div className="flex items-center gap-2">
        <button onClick={() => onChange(Math.max(min, value - 1))} className="w-7 h-7 rounded-full bg-surface-container text-on-surface flex items-center justify-center active:scale-95">
          <span className="material-symbols-outlined text-[16px]">remove</span>
        </button>
        <span className="text-body-md font-bold text-on-surface tabular-nums w-12 text-center">{value}{suffix}</span>
        <button onClick={() => onChange(Math.min(max, value + 1))} className="w-7 h-7 rounded-full bg-surface-container text-on-surface flex items-center justify-center active:scale-95">
          <span className="material-symbols-outlined text-[16px]">add</span>
        </button>
      </div>
    </div>
  );
}

const wrap = 'h-full flex flex-col items-center justify-center text-center gap-3 py-2';

// ════════════════════════════════════════════════════════════════════════════
//  Pomodoro
// ════════════════════════════════════════════════════════════════════════════
const PHASE_META = {
  focus: { label: 'Focus',       accent: 'text-primary' },
  short: { label: 'Short Break', accent: 'text-tertiary' },
  long:  { label: 'Long Break',  accent: 'text-tertiary' },
};

export function PomodoroApp({ full }) {
  const p = useFocusStore((s) => s.pomodoro);
  const remaining = useFocusStore(pomodoroRemaining);
  const [showCfg, setShowCfg] = useState(false);
  const st = useFocusStore.getState();
  const meta = PHASE_META[p.phase];
  const running = p.status === 'running';

  return (
    <div className={wrap}>
      <div className="flex items-center gap-2">
        <span className={`text-label-md uppercase tracking-wider font-bold ${meta.accent}`}>{meta.label}</span>
        <button onClick={() => setShowCfg((v) => !v)} aria-label="Settings" title="Edit timer settings" className="text-on-surface-variant/60 active:scale-95">
          <span className="material-symbols-outlined text-[18px]">tune</span>
        </button>
      </div>

      {showCfg ? (
        <div className="w-full max-w-xs px-2">
          <Stepper label="Focus"      value={p.config.focusMin}  onChange={(v) => st.setPomodoroConfig({ focusMin: v })} />
          <Stepper label="Short Break" value={p.config.shortMin} onChange={(v) => st.setPomodoroConfig({ shortMin: v })} />
          <Stepper label="Long Break"  value={p.config.longMin}  onChange={(v) => st.setPomodoroConfig({ longMin: v })} />
          <Stepper label="Long Every"  value={p.config.longEvery} onChange={(v) => st.setPomodoroConfig({ longEvery: v })} suffix="" max={12} />
        </div>
      ) : (
        <>
          <div className={`font-bold tabular-nums text-on-surface ${full ? 'text-7xl' : 'text-4xl'}`}>{fmtMS(remaining)}</div>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: p.config.longEvery }).map((_, i) => (
              <span key={i} className={`w-2 h-2 rounded-full ${i < p.round % p.config.longEvery ? 'bg-primary' : 'bg-outline-variant/40'}`} />
            ))}
          </div>
          <div className="flex items-center gap-3">
            <CtrlBtn icon="restart_alt" variant="plain" onClick={st.resetPomodoro} label="Reset" title="Reset timer to start" />
            <CtrlBtn icon={running ? 'pause' : 'play_arrow'} variant="primary" big={full} onClick={running ? st.pausePomodoro : st.startPomodoro} label={running ? 'Pause' : 'Start'} />
            <CtrlBtn icon="skip_next" variant="plain" onClick={st.skipPomodoro} label="Skip" title="Skip to next phase" />
          </div>
        </>
      )}
    </div>
  );
}

export function PomodoroWidget({ editing }) {
  return (
    <WidgetShell icon="timer" title="Pomodoro" editing={editing}>
      <PomodoroApp />
    </WidgetShell>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Stopwatch
// ════════════════════════════════════════════════════════════════════════════
export function StopwatchApp({ full }) {
  const sw = useFocusStore((s) => s.stopwatch);
  const elapsed = useFocusStore(stopwatchElapsed);
  const st = useFocusStore.getState();
  const running = sw.status === 'running';
  const { base, cs } = fmtClock(elapsed);

  return (
    <div className={wrap}>
      <div className="flex items-baseline justify-center">
        <span className={`font-bold tabular-nums text-on-surface ${full ? 'text-7xl' : 'text-4xl'}`}>{base}</span>
        <span className={`font-bold tabular-nums text-on-surface-variant ${full ? 'text-3xl' : 'text-lg'} ml-1`}>.{cs}</span>
      </div>
      <div className="flex items-center gap-3">
        <CtrlBtn
          icon={running ? 'flag' : 'restart_alt'}
          variant="plain"
          onClick={running ? st.lapStopwatch : st.resetStopwatch}
          label={running ? 'Lap' : 'Reset'}
          title={running ? 'Record a lap time' : 'Reset stopwatch to zero'}
        />
        <CtrlBtn icon={running ? 'pause' : 'play_arrow'} variant="primary" big={full} onClick={running ? st.pauseStopwatch : st.startStopwatch} label={running ? 'Pause' : 'Start'} />
        <CtrlBtn icon="stop" variant="plain" onClick={st.resetStopwatch} label="Stop" title="Stop and reset stopwatch" />
      </div>
      {(full || sw.laps.length > 0) && sw.laps.length > 0 && (
        <div className="w-full max-w-xs mt-1 max-h-40 overflow-y-auto no-scrollbar">
          {sw.laps.map((lap, i) => (
            <div key={i} className="flex justify-between px-2 py-1 text-body-md border-b border-outline-variant/10 last:border-0">
              <span className="text-on-surface-variant">Lap {i + 1}</span>
              <span className="tabular-nums text-on-surface">{fmtClock(lap).base}.{fmtClock(lap).cs}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function StopwatchWidget({ editing }) {
  return (
    <WidgetShell icon="timer" title="Stopwatch" editing={editing}>
      <StopwatchApp />
    </WidgetShell>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Countdown timer
// ════════════════════════════════════════════════════════════════════════════
const TIMER_PRESETS = [1, 5, 10, 25];

export function TimerApp({ full }) {
  const t = useFocusStore((s) => s.timer);
  const remaining = useFocusStore(timerRemaining);
  const savedTimers = useFocusStore((s) => s.savedTimers);
  const st = useFocusStore.getState();
  const running = t.status === 'running';
  const done = t.status === 'done';
  const idle = t.status === 'idle';

  const [customOpen, setCustomOpen] = useState(false);
  const [customMin, setCustomMin] = useState('');
  const [customSec, setCustomSec] = useState('');
  const [customName, setCustomName] = useState('');
  const customMs = (parseInt(customMin, 10) || 0) * 60000 + (parseInt(customSec, 10) || 0) * 1000;
  const resetCustom = () => { setCustomMin(''); setCustomSec(''); setCustomName(''); setCustomOpen(false); };
  const startCustom = () => {
    if (customMs <= 0) return;
    if (customName.trim()) st.addSavedTimer(customName, customMs);
    st.startTimer(customMs);
    resetCustom();
  };
  const saveCustom = () => {
    if (customMs <= 0 || !customName.trim()) return;
    st.addSavedTimer(customName, customMs);
    setCustomMin(''); setCustomSec(''); setCustomName('');
  };

  return (
    <div className={wrap}>
      <div className={`font-bold tabular-nums ${done ? 'text-error' : 'text-on-surface'} ${full ? 'text-7xl' : 'text-4xl'}`}>
        {fmtMS(remaining)}
      </div>

      {idle ? (
        <div className="flex flex-col items-center gap-2 max-w-xs">
          <div className="flex flex-wrap items-center justify-center gap-2">
            {TIMER_PRESETS.map((m) => (
              <button
                key={m}
                onClick={() => st.startTimer(m * 60000)}
                className="px-3.5 h-9 rounded-full bg-surface-container text-on-surface text-label-md font-bold active:scale-95 transition"
              >
                {m}m
              </button>
            ))}
            {savedTimers.map((saved) => (
              <button
                key={saved.id}
                onClick={() => st.startTimer(saved.ms)}
                title={`Start "${saved.name}" (${fmtMS(saved.ms)})`}
                className="group flex items-center gap-1 pl-3.5 pr-2 h-9 rounded-full bg-surface-container text-on-surface text-label-md font-bold active:scale-95 transition"
              >
                <span className="max-w-[7rem] truncate">{saved.name}</span>
                <span
                  role="button"
                  aria-label={`Delete "${saved.name}"`}
                  title="Delete saved timer"
                  onClick={(e) => { e.stopPropagation(); st.deleteSavedTimer(saved.id); }}
                  className="material-symbols-outlined text-[15px] text-on-surface-variant/50 hover:text-error rounded-full"
                >
                  close
                </span>
              </button>
            ))}
            <button
              onClick={() => setCustomOpen((v) => !v)}
              className={`px-3.5 h-9 rounded-full text-label-md font-bold active:scale-95 transition ${customOpen ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface'}`}
            >
              Custom
            </button>
          </div>
          {customOpen && (
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="1"
                  autoFocus
                  value={customMin}
                  onChange={(e) => setCustomMin(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && startCustom()}
                  placeholder="Min"
                  aria-label="Minutes"
                  className="w-16 h-9 px-3 rounded-full bg-surface-container text-on-surface text-label-md font-bold text-center outline-none focus:ring-2 focus:ring-primary"
                />
                <span className="text-on-surface font-bold">:</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  step="1"
                  value={customSec}
                  onChange={(e) => setCustomSec(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && startCustom()}
                  placeholder="Sec"
                  aria-label="Seconds"
                  className="w-16 h-9 px-3 rounded-full bg-surface-container text-on-surface text-label-md font-bold text-center outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && startCustom()}
                  placeholder="Name (optional)"
                  aria-label="Timer name"
                  maxLength={30}
                  className="w-36 h-9 px-3 rounded-full bg-surface-container text-on-surface text-label-md text-center outline-none focus:ring-2 focus:ring-primary"
                />
                {customName.trim() && (
                  <button
                    onClick={saveCustom}
                    disabled={customMs <= 0}
                    title="Save for later without starting"
                    aria-label="Save timer"
                    className="w-9 h-9 rounded-full bg-surface-container text-on-surface flex items-center justify-center active:scale-95 disabled:opacity-40"
                  >
                    <span className="material-symbols-outlined text-[18px]">bookmark_add</span>
                  </button>
                )}
                <button
                  onClick={startCustom}
                  disabled={customMs <= 0}
                  className="px-4 h-9 rounded-full bg-primary text-on-primary text-label-md font-bold active:scale-95 transition disabled:opacity-40"
                >
                  Start
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <CtrlBtn icon="restart_alt" variant="plain" onClick={st.resetTimer} label="Reset" />
          {!done && (
            <CtrlBtn icon={running ? 'pause' : 'play_arrow'} variant="primary" big={full} onClick={running ? st.pauseTimer : () => st.startTimer()} label={running ? 'Pause' : 'Resume'} />
          )}
          {done && <CtrlBtn icon="check" variant="primary" big={full} onClick={st.resetTimer} label="Done" />}
        </div>
      )}
    </div>
  );
}

export function TimerWidget({ editing }) {
  return (
    <WidgetShell icon="hourglass_top" title="Timer" editing={editing}>
      <TimerApp />
    </WidgetShell>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Breathing
// ════════════════════════════════════════════════════════════════════════════
export const BREATHE_PATTERNS = {
  box:  { label: 'Box 4-4-4-4', steps: [['Inhale', 4], ['Hold', 4], ['Exhale', 4], ['Hold', 4]] },
  '478': { label: '4-7-8 Relax', steps: [['Inhale', 4], ['Hold', 7], ['Exhale', 8]] },
  calm: { label: 'Calm 4-6',    steps: [['Inhale', 4], ['Exhale', 6]] },
};

// Precompute target scale per step (Hold keeps the previous breath's size).
function patternSteps(key) {
  const pat = BREATHE_PATTERNS[key] || BREATHE_PATTERNS.box;
  let last = 0.55;
  return pat.steps.map(([name, dur]) => {
    const scale = name === 'Inhale' ? 1 : name === 'Exhale' ? 0.55 : last;
    if (name !== 'Hold') last = scale;
    return { name, dur, scale };
  });
}

export function BreatheApp({ full }) {
  const b = useFocusStore((s) => s.breathing);
  const now = useFocusStore((s) => s.now);
  const elapsedMs = useFocusStore(breathingElapsed);
  const [pattern, setPattern] = useState(b.pattern);
  const [moodBefore, setMoodBefore] = useState(null);
  const [moodAfter, setMoodAfter] = useState(null);
  const st = useFocusStore.getState();
  const running = b.status === 'running';
  const finished = b.status === 'finished';
  const move = useUiStore((s) => !s.lowMotion && s.motionPrefs.breathing !== false);

  const steps = patternSteps(running ? b.pattern : pattern);
  const cycle = steps.reduce((a, s) => a + s.dur, 0);

  let label = 'Ready';
  let scale = 0.6;
  let stepDur = 4;
  let phaseLeft = 0;
  if (running && b.startedAt) {
    const elapsed = ((now - b.startedAt) / 1000) % cycle;
    let acc = 0;
    for (const s of steps) {
      if (elapsed < acc + s.dur) {
        label = s.name; scale = s.scale; stepDur = s.dur;
        phaseLeft = Math.ceil(acc + s.dur - elapsed);
        break;
      }
      acc += s.dur;
    }
  }

  const root = full ? 'h-full flex flex-col items-center justify-center text-center gap-7 py-6' : wrap;
  const circle = full ? 'w-[min(62vw,60vh,30rem)] h-[min(62vw,60vh,30rem)]' : 'w-28 h-28';

  // Stop → freeze the clock and show the post-session rating screen. Whether
  // the session is actually logged is decided later by finishBreathing (which
  // ignores very short sessions).
  const handleStop = () => st.endBreathing();
  const finalize = (after) => {
    st.finishBreathing(after);
    setMoodBefore(null); setMoodAfter(null);
  };

  if (finished) {
    return (
      <div className={root}>
        <span className={`material-symbols-outlined text-primary ${full ? 'text-[72px]' : 'text-[40px]'}`}>air</span>
        <div className={`text-on-surface-variant ${full ? 'text-title-lg' : 'text-body-md'}`}>Session complete</div>
        <div className={`font-bold tabular-nums text-on-surface ${full ? 'text-8xl' : 'text-3xl'}`}>{fmtMS(elapsedMs)}</div>
        <div className={`text-on-surface-variant ${full ? 'text-title-md' : 'text-label-md'}`}>How do you feel now? <span className="opacity-60">(optional)</span></div>
        <div className={full ? 'w-full max-w-xs' : 'w-full max-w-[15rem]'}>
          <MoodPicker value={moodAfter} onChange={setMoodAfter} size={full ? 'md' : 'sm'} />
        </div>
        {b.moodBefore != null && (
          <div className={`text-on-surface-variant tabular-nums ${full ? 'text-body-md' : 'text-label-sm'}`}>
            Before {MOOD_LABELS[b.moodBefore]}{moodAfter != null && <> · Now {MOOD_LABELS[moodAfter]}</>}
          </div>
        )}
        <div className={`flex items-center ${full ? 'gap-5 pt-2' : 'gap-3'}`}>
          <button onClick={() => finalize(null)} className={`rounded-full font-bold bg-surface-container text-on-surface active:scale-95 ${full ? 'px-7 h-12 text-title-md' : 'px-4 h-9 text-label-md'}`}>Skip</button>
          <button onClick={() => finalize(moodAfter)} className={`rounded-full font-bold bg-primary text-on-primary active:scale-95 ${full ? 'px-7 h-12 text-title-md' : 'px-4 h-9 text-label-md'}`}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className={root}>
      {/* Phase label sits above the circle; the circle itself shows only the
          per-phase countdown (or "Ready" when idle), kept small enough to never
          exceed the circle — even at the shrunken exhale state. */}
      {running && (
        <div className={`uppercase tracking-wider font-bold text-primary ${full ? 'text-title-md' : 'text-label-md'}`}>{label}</div>
      )}
      <div className={`relative ${circle} flex items-center justify-center`}>
        <div
          className="absolute inset-0 rounded-full bg-primary/20"
          style={{ transform: `scale(${scale})`, transition: move ? `transform ${stepDur}s ease-in-out` : 'none' }}
        />
        <div
          className="absolute inset-2 rounded-full bg-primary/30"
          style={{ transform: `scale(${scale})`, transition: move ? `transform ${stepDur}s ease-in-out` : 'none' }}
        />
        <span className={`relative font-bold tabular-nums leading-none ${running ? 'text-primary' : 'text-on-surface'} ${
          running ? (full ? 'text-6xl' : 'text-2xl') : (full ? 'text-headline-md' : 'text-body-md')
        }`}>
          {running ? phaseLeft : label}
        </span>
      </div>

      {running ? (
        <>
          <div className={`text-on-surface-variant tabular-nums ${full ? 'text-title-lg' : 'text-label-md'}`}>Total {fmtMS(elapsedMs)}</div>
          <CtrlBtn icon="stop" variant="danger" big={full} onClick={handleStop} label="Stop" />
        </>
      ) : (
        <>
          <div className={`flex flex-wrap items-center justify-center ${full ? 'gap-2.5 max-w-lg' : 'gap-1.5 max-w-xs'}`}>
            {Object.entries(BREATHE_PATTERNS).map(([key, pat]) => (
              <button
                key={key}
                onClick={() => setPattern(key)}
                className={`rounded-full font-bold active:scale-95 transition ${full ? 'px-5 h-11 text-body-md' : 'px-3 h-8 text-label-sm'} ${
                  pattern === key ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface'
                }`}
              >
                {pat.label}
              </button>
            ))}
          </div>
          <div className={`text-on-surface-variant ${full ? 'text-title-md' : 'text-label-sm'}`}>Log Current Mood <span className="opacity-60">(optional)</span></div>
          <div className={full ? 'w-full max-w-xs' : 'w-full max-w-[15rem]'}>
            <MoodPicker value={moodBefore} onChange={setMoodBefore} size={full ? 'md' : 'sm'} />
          </div>
          <CtrlBtn icon="play_arrow" variant="primary" big={full} onClick={() => st.startBreathing(pattern, moodBefore)} label="Start" />
        </>
      )}
    </div>
  );
}

export function BreatheWidget({ editing }) {
  const [open, setOpen] = useState(false);
  return (
    <WidgetShell
      icon="air"
      title="Breathe"
      editing={editing}
      footer={!editing && (
        <button onClick={() => setOpen(true)} className="w-full text-label-md font-bold text-primary flex items-center justify-center gap-1 active:scale-95">
          <span className="material-symbols-outlined text-[16px]">open_in_full</span> Immersive
        </button>
      )}
    >
      <BreatheApp />
      <FocusOverlay open={open} onClose={() => setOpen(false)} icon="air" title="Breathe">
        <BreatheApp full />
      </FocusOverlay>
    </WidgetShell>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Meditation
// ════════════════════════════════════════════════════════════════════════════
const MED_PRESETS = [5, 10, 15, 20];

export function MeditateApp({ full }) {
  const m = useFocusStore((s) => s.meditation);
  const remaining = useFocusStore(meditationRemaining);
  const st = useFocusStore.getState();
  const running = m.status === 'running';
  const idle = m.status === 'idle';
  const finished = m.status === 'finished';

  const [moodBefore, setMoodBefore] = useState(null);
  const [moodAfter, setMoodAfter] = useState(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualMin, setManualMin] = useState('');
  const [manualBefore, setManualBefore] = useState(null);
  const [manualAfter, setManualAfter] = useState(null);
  const [manualSaved, setManualSaved] = useState(false);

  const startWithMood = () => { st.startMeditation(moodBefore); setMoodBefore(null); };
  const finalize = (after) => { st.finishMeditation(after); setMoodAfter(null); };

  const saveManual = () => {
    const mins = parseFloat(manualMin);
    if (!(mins > 0)) return;
    logWellnessSession({
      type: 'meditation', durationSec: Math.round(mins * 60), completed: true, source: 'manual',
      moodBefore: manualBefore, moodAfter: manualAfter,
    });
    setManualMin(''); setManualBefore(null); setManualAfter(null);
    setManualSaved(true);
    setTimeout(() => { setManualSaved(false); setManualOpen(false); }, 1200);
  };

  if (finished) {
    return (
      <div className={wrap}>
        <span className={`material-symbols-outlined text-primary ${full ? 'text-[56px]' : 'text-[36px]'}`}>self_improvement</span>
        <div className={`text-on-surface-variant ${full ? 'text-title-lg' : 'text-body-md'}`}>
          {m.finishedCompleted ? 'Session complete' : 'Session ended'}
        </div>
        <div className={`font-bold tabular-nums text-on-surface ${full ? 'text-7xl' : 'text-3xl'}`}>{fmtMS(m.finishedElapsedMs)}</div>
        <div className={`text-on-surface-variant ${full ? 'text-title-md' : 'text-label-md'}`}>How do you feel now? <span className="opacity-60">(optional)</span></div>
        <div className={full ? 'w-full max-w-xs' : 'w-full max-w-[15rem]'}>
          <MoodPicker value={moodAfter} onChange={setMoodAfter} size={full ? 'md' : 'sm'} />
        </div>
        {m.moodBefore != null && (
          <div className={`text-on-surface-variant tabular-nums ${full ? 'text-body-md' : 'text-label-sm'}`}>
            Before {MOOD_LABELS[m.moodBefore]}{moodAfter != null && <> · Now {MOOD_LABELS[moodAfter]}</>}
          </div>
        )}
        <div className={`flex items-center ${full ? 'gap-5 pt-2' : 'gap-3'}`}>
          <button onClick={() => finalize(null)} className={`rounded-full font-bold bg-surface-container text-on-surface active:scale-95 ${full ? 'px-7 h-12 text-title-md' : 'px-4 h-9 text-label-md'}`}>Skip</button>
          <button onClick={() => finalize(moodAfter)} className={`rounded-full font-bold bg-primary text-on-primary active:scale-95 ${full ? 'px-7 h-12 text-title-md' : 'px-4 h-9 text-label-md'}`}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className={wrap}>
      {!manualOpen && (
        <div className={`font-bold tabular-nums text-on-surface ${full ? 'text-7xl' : 'text-4xl'}`}>{fmtMS(remaining)}</div>
      )}

      {idle ? (
        manualOpen ? (
          <div className="flex flex-col items-center gap-2.5 w-full max-w-xs">
            {manualSaved ? (
              <div className="flex items-center gap-1.5 text-primary text-label-md font-bold py-2">
                <span className="material-symbols-outlined text-[18px]">check_circle</span> Logged
              </div>
            ) : (
              <>
                <input
                  type="number" min="1" step="1" autoFocus value={manualMin}
                  onChange={(e) => setManualMin(e.target.value)}
                  placeholder="Minutes"
                  aria-label="Minutes meditated"
                  className="w-28 h-9 px-3 rounded-full bg-surface-container text-on-surface text-label-md font-bold text-center outline-none focus:ring-2 focus:ring-primary"
                />
                <div className="w-full">
                  <p className="text-label-sm text-on-surface-variant mb-1 text-center">Before <span className="opacity-60">(optional)</span></p>
                  <MoodPicker value={manualBefore} onChange={setManualBefore} size="sm" />
                </div>
                <div className="w-full">
                  <p className="text-label-sm text-on-surface-variant mb-1 text-center">After <span className="opacity-60">(optional)</span></p>
                  <MoodPicker value={manualAfter} onChange={setManualAfter} size="sm" />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button onClick={() => setManualOpen(false)} className="px-4 h-9 rounded-full text-label-md font-bold bg-surface-container text-on-surface active:scale-95">Cancel</button>
                  <button onClick={saveManual} disabled={!(parseFloat(manualMin) > 0)} className="px-4 h-9 rounded-full text-label-md font-bold bg-primary text-on-primary active:scale-95 disabled:opacity-40">Save</button>
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-center gap-2 max-w-xs">
              {MED_PRESETS.map((min) => (
                <button
                  key={min}
                  onClick={() => st.setMeditationDuration(min * 60000)}
                  className={`px-3.5 h-9 rounded-full text-label-md font-bold active:scale-95 transition ${
                    m.durationMs === min * 60000 ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface'
                  }`}
                >
                  {min}m
                </button>
              ))}
            </div>
            <div className={`text-on-surface-variant ${full ? 'text-title-md' : 'text-label-sm'}`}>Log Current Mood <span className="opacity-60">(optional)</span></div>
            <div className={full ? 'w-full max-w-xs' : 'w-full max-w-[15rem]'}>
              <MoodPicker value={moodBefore} onChange={setMoodBefore} size={full ? 'md' : 'sm'} />
            </div>
            <CtrlBtn icon="play_arrow" variant="primary" big={full} onClick={startWithMood} label="Start" />
            <button onClick={() => setManualOpen(true)} className="text-label-sm font-bold text-on-surface-variant underline decoration-dotted active:scale-95">
              Log a past session
            </button>
          </>
        )
      ) : (
        <div className="flex items-center gap-3">
          <CtrlBtn icon="stop" variant="plain" onClick={st.stopMeditation} label="Stop" />
          <CtrlBtn icon={running ? 'pause' : 'play_arrow'} variant="primary" big={full} onClick={running ? st.pauseMeditation : () => st.startMeditation()} label={running ? 'Pause' : 'Resume'} />
        </div>
      )}

      {!manualOpen && (
        <AudioPicker
          name={m.name}
          onPick={(file) => st.loadMeditationAudio(file)}
          hint="Load a guided track"
        />
      )}
    </div>
  );
}

export function MeditateWidget({ editing }) {
  const [open, setOpen] = useState(false);
  return (
    <WidgetShell
      icon="self_improvement"
      title="Meditate"
      editing={editing}
      footer={!editing && (
        <button onClick={() => setOpen(true)} className="w-full text-label-md font-bold text-primary flex items-center justify-center gap-1 active:scale-95">
          <span className="material-symbols-outlined text-[16px]">open_in_full</span> Immersive
        </button>
      )}
    >
      <MeditateApp />
      <FocusOverlay open={open} onClose={() => setOpen(false)} icon="self_improvement" title="Meditate">
        <MeditateApp full />
      </FocusOverlay>
    </WidgetShell>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Ambient sound
// ════════════════════════════════════════════════════════════════════════════
function AudioPicker({ name, onPick, hint }) {
  const id = React.useId();
  return (
    <label htmlFor={id} className="flex items-center gap-1.5 text-label-md text-on-surface-variant cursor-pointer active:scale-95 transition">
      <span className="material-symbols-outlined text-[16px]">{name ? 'music_note' : 'upload_file'}</span>
      <span className="truncate max-w-[12rem]">{name || hint}</span>
      <input
        id={id}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0] || null)}
      />
    </label>
  );
}

export function AmbientApp({ full }) {
  const a = useFocusStore((s) => s.ambient);
  const st = useFocusStore.getState();

  return (
    <div className={wrap}>
      <span className={`material-symbols-outlined text-primary ${full ? 'text-6xl' : 'text-4xl'} ${a.playing ? 'animate-pulse' : ''}`}>
        graphic_eq
      </span>
      <AudioPicker name={a.name} onPick={(file) => st.loadAmbientAudio(file)} hint="Load a sound loop" />
      {a.src && (
        <>
          <CtrlBtn icon={a.playing ? 'pause' : 'play_arrow'} variant="primary" big={full} onClick={st.toggleAmbient} label={a.playing ? 'Pause' : 'Play'} />
          <div className="flex items-center gap-2 w-full max-w-xs px-4">
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">volume_down</span>
            <input
              type="range" min="0" max="1" step="0.01" value={a.volume}
              onChange={(e) => st.setAmbientVolume(parseFloat(e.target.value))}
              className="flex-1 accent-primary"
            />
          </div>
        </>
      )}
    </div>
  );
}

export function AmbientWidget({ editing }) {
  return (
    <WidgetShell icon="graphic_eq" title="Ambient" editing={editing}>
      <AmbientApp />
    </WidgetShell>
  );
}
