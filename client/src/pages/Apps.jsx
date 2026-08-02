import React, { useState } from 'react';
import {
  PomodoroApp, StopwatchApp, TimerApp,
  BreatheApp, MeditateApp, AmbientApp,
} from '../widgets/focusWidgets';
import { ClockApp } from '../widgets/clockWidgets';
import { GoodThoughtsApp } from '../widgets/GoodThoughtsWidget';
import ManageModal from '../components/goodThoughts/ManageModal';
import FocusOverlay from '../components/FocusOverlay';

// Standalone "Apps" page — the focus & wellness tools at full size, usable
// independently of the Home widget board. They share the same global focusStore,
// so a Pomodoro started here keeps running in its Home widget and vice-versa.

function AppCard({ icon, title, children, onExpand, span }) {
  return (
    <div className={`bg-surface-container-lowest rounded-3xl shadow-soft border border-outline-variant/20 flex flex-col overflow-hidden ${span || ''}`}>
      <div className="flex items-center gap-2 px-5 pt-4 pb-1 flex-shrink-0">
        <span className="material-symbols-outlined text-[20px] text-primary">{icon}</span>
        <h2 className="text-body-lg font-bold text-on-surface flex-1">{title}</h2>
        {onExpand && (
          <button onClick={onExpand} aria-label="Immersive" className="w-9 h-9 rounded-full bg-surface-container text-on-surface flex items-center justify-center active:scale-95">
            <span className="material-symbols-outlined text-[18px]">open_in_full</span>
          </button>
        )}
      </div>
      <div className="flex-1 min-h-[220px] flex items-center justify-center p-4">
        {children}
      </div>
    </div>
  );
}

export default function Apps() {
  const [overlay, setOverlay] = useState(null); // 'breathe' | 'meditate' | null
  const [manageThoughts, setManageThoughts] = useState(false);

  return (
    <div className="pb-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-headline-lg text-on-background mb-1">Apps</h1>
        <p className="text-body-md text-on-surface-variant mb-5">Focus &amp; wellness tools — run them here or add any as a Home widget.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AppCard icon="timer" title="Pomodoro"><PomodoroApp full /></AppCard>
          <AppCard icon="timer" title="Stopwatch"><StopwatchApp full /></AppCard>
          <AppCard icon="hourglass_top" title="Timer"><TimerApp full /></AppCard>
          <AppCard icon="air" title="Breathe" onExpand={() => setOverlay('breathe')}><BreatheApp /></AppCard>
          <AppCard icon="self_improvement" title="Meditate" onExpand={() => setOverlay('meditate')}><MeditateApp /></AppCard>
          <AppCard icon="graphic_eq" title="Ambient Sound"><AmbientApp /></AppCard>
          <AppCard icon="schedule" title="Clock"><ClockApp /></AppCard>
          <AppCard icon="format_quote" title="Good Thoughts" onExpand={() => setManageThoughts(true)}><GoodThoughtsApp /></AppCard>
        </div>
      </div>

      <FocusOverlay open={overlay === 'breathe'} onClose={() => setOverlay(null)} icon="air" title="Breathe">
        <BreatheApp full />
      </FocusOverlay>
      <FocusOverlay open={overlay === 'meditate'} onClose={() => setOverlay(null)} icon="self_improvement" title="Meditate">
        <MeditateApp full />
      </FocusOverlay>

      {manageThoughts && <ManageModal onClose={() => setManageThoughts(false)} />}
    </div>
  );
}
