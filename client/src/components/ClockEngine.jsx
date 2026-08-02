import React, { useEffect } from 'react';
import { useClockStore } from '../store/clockStore';
import { useUiStore } from '../store/uiStore';
import FlipClock from './FlipClock';

function fmtLabel(alarm) {
  const [h, m] = alarm.time.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * App-level driver for the alarm clock — mounted once so alarms keep firing
 * regardless of which page is on screen (mirrors <FocusEngine/>). Renders
 * nothing until an alarm actually goes off, at which point it takes over the
 * full screen until dismissed or snoozed.
 */
export default function ClockEngine() {
  useEffect(() => {
    const id = setInterval(() => useClockStore.getState().checkAlarms(), 1000);
    return () => clearInterval(id);
  }, []);

  const ringing = useClockStore((s) => s.ringing);
  const dismissAlarm = useClockStore((s) => s.dismissAlarm);
  const snoozeAlarm = useClockStore((s) => s.snoozeAlarm);
  const shake = useUiStore((s) => !s.lowMotion && s.motionPrefs.alarmRing !== false);

  if (!ringing) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-neutral-950 flex flex-col items-center justify-center gap-8 px-6 animate-[fadeIn_200ms_ease-out]" role="alertdialog" aria-modal="true">
      <span className={`material-symbols-outlined text-white text-[56px] ${shake ? 'animate-alarm-ring' : ''}`}>alarm</span>
      {ringing.label && <p className="text-title-lg text-white/90 text-center -mt-4">{ringing.label}</p>}
      <FlipClock size="lg" now={fmtLabel(ringing)} showSeconds={false} />
      <div className="flex items-center gap-4 mt-4">
        <button
          type="button"
          onClick={() => snoozeAlarm(9)}
          className="px-6 h-12 rounded-full bg-white/10 text-white font-bold active:scale-95 transition"
        >
          Snooze 9m
        </button>
        <button
          type="button"
          onClick={dismissAlarm}
          className="px-8 h-12 rounded-full bg-primary text-on-primary font-bold active:scale-95 transition"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
