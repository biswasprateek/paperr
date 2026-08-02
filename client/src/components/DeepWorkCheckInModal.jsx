import React from 'react';
import { useDeepWorkStore, deepWorkCheckInRemaining } from '../store/deepWorkStore';

function fmtMs(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// "Still working?" check-in — takes over the Deep Work surface every 15
// minutes. No response within 2 minutes and the session auto-stops (handled
// by deepWorkStore's tick()); this modal only renders the prompt + countdown
// and the one affirming action.
export default function DeepWorkCheckInModal({ taskTitle }) {
  const remaining = useDeepWorkStore(deepWorkCheckInRemaining);
  const confirmStillWorking = useDeepWorkStore((s) => s.confirmStillWorking);

  return (
    <div
      className="fixed inset-0 z-[110] bg-inverse-surface/60 backdrop-blur-sm flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-surface-container-lowest rounded-2xl shadow-heavy w-full max-w-sm p-6 text-center space-y-5">
        <span className="material-symbols-outlined text-primary text-4xl">center_focus_strong</span>
        <div>
          <h2 className="text-headline-md font-light text-on-background mb-1">Still working on this?</h2>
          <p className="text-body-md text-on-surface-variant truncate">{taskTitle}</p>
        </div>
        <p className="text-label-sm text-on-surface-variant/70">
          Session ends automatically in <span className="font-bold tabular-nums">{fmtMs(remaining)}</span> if there's no response.
        </p>
        <button
          type="button"
          onClick={confirmStillWorking}
          autoFocus
          className="w-full h-12 rounded-full bg-primary text-on-primary text-body-md font-bold hover:bg-primary/90 transition-[background-color,transform] duration-150 active:scale-[0.97]"
        >
          Yes, keep going
        </button>
      </div>
    </div>
  );
}
