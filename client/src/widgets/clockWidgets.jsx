import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import WidgetShell from './WidgetShell';
import FlipClock from '../components/FlipClock';
import { useClockStore, DAY_LABELS, minutesUntilNextFire } from '../store/clockStore';

// ─────────────────────────────────────────────────────────────────────────────
// Clock app + widget — a flip-clock face plus alarm management. Alarms live in
// the global clockStore and are driven by <ClockEngine/> (mounted once at the
// app root) so they keep ringing no matter which page is open, the same
// pattern focusWidgets.jsx uses for Pomodoro/Timer.
// ─────────────────────────────────────────────────────────────────────────────

function to12h(time) {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return format(d, 'h:mm a');
}

function AlarmRow({ alarm, onEdit, onToggle, disabled }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-outline-variant/10 last:border-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onEdit(alarm)}
        className="flex-1 min-w-0 text-left disabled:opacity-60"
      >
        <span className={`block text-title-md font-bold tabular-nums ${alarm.enabled ? 'text-on-surface' : 'text-on-surface-variant/50'}`}>
          {to12h(alarm.time)}
        </span>
        <span className="block text-label-sm text-on-surface-variant truncate mt-0.5">
          {alarm.days.length ? alarm.days.slice().sort().map((d) => DAY_LABELS[d]).join(' ') : 'Once'}
          {alarm.label ? ` · ${alarm.label}` : ''}
        </span>
      </button>
      <div
        role="switch"
        aria-checked={alarm.enabled}
        onClick={() => !disabled && onToggle(alarm.id)}
        className={`w-10 h-6 rounded-full transition-colors flex items-center flex-shrink-0 ${disabled ? '' : 'cursor-pointer'} ${alarm.enabled ? 'bg-primary' : 'bg-outline-variant'}`}
      >
        <div className={`w-4 h-4 rounded-full bg-white mx-1 transition-transform ${alarm.enabled ? 'translate-x-4' : ''}`} />
      </div>
    </div>
  );
}

// Centered popup dialog (not a bottom sheet) — matches NotebookFormModal's
// pattern, since an edge-to-edge sheet reads oddly on wide desktop layouts.
function AlarmFormModal({ open, onClose, alarm }) {
  const addAlarm = useClockStore((s) => s.addAlarm);
  const updateAlarm = useClockStore((s) => s.updateAlarm);
  const deleteAlarm = useClockStore((s) => s.deleteAlarm);

  const [time, setTime] = useState('07:30');
  const [label, setLabel] = useState('');
  const [days, setDays] = useState([]);

  useEffect(() => {
    if (!open) return;
    setTime(alarm?.time || '07:30');
    setLabel(alarm?.label || '');
    setDays(alarm?.days || []);
  }, [open, alarm]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const toggleDay = (d) => setDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d].sort()));

  const save = () => {
    if (!time) return;
    if (alarm) updateAlarm(alarm.id, { time, label: label.trim(), days });
    else addAlarm({ time, label: label.trim(), days });
    onClose();
  };
  const remove = () => {
    if (alarm) deleteAlarm(alarm.id);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-inverse-surface/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-surface-container-lowest rounded-2xl shadow-heavy border border-outline-variant/20 w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15">
          <h2 className="text-title-md font-semibold text-on-surface">{alarm ? 'Edit alarm' : 'New alarm'}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full bg-surface-container rounded-xl px-3 py-2.5 text-on-surface text-title-lg font-bold tabular-nums border-0 focus:ring-2 focus:ring-primary outline-none"
          />
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (optional)"
            className="w-full bg-surface-container rounded-xl px-3 py-2.5 text-on-surface text-body-md border-0 focus:ring-2 focus:ring-primary outline-none"
          />
          <div>
            <p className="text-label-sm text-on-surface-variant mb-2">Repeat</p>
            <div className="flex items-center gap-1.5">
              {DAY_LABELS.map((lbl, d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(d)}
                  className={`w-9 h-9 rounded-full text-label-sm font-bold transition active:scale-95 ${
                    days.includes(d) ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'
                  }`}
                >
                  {lbl[0]}
                </button>
              ))}
            </div>
            {!days.length && (
              <p className="text-label-sm text-on-surface-variant/60 mt-1.5">Rings once, then turns off</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 px-6 py-4 border-t border-outline-variant/15">
          {alarm && (
            <button type="button" onClick={remove} className="px-4 h-11 rounded-full border border-error/40 text-error font-bold active:scale-95">
              Delete
            </button>
          )}
          <button type="button" onClick={save} className="flex-1 h-11 rounded-full bg-primary text-on-primary font-bold active:scale-95">
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Expanded "see all alarms at once" popup for the widget's single-alarm
// carousel — same list chrome as ClockApp's inline list, just in a modal.
function AlarmListModal({ open, onClose, alarms, onEdit, onToggle }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-inverse-surface/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-surface-container-lowest rounded-2xl shadow-heavy border border-outline-variant/20 w-full max-w-sm max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/15 flex-shrink-0">
          <h2 className="text-title-md font-semibold text-on-surface">Alarms</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <div className="px-6 py-1 overflow-y-auto scrollbar-slim">
          {alarms.length === 0 ? (
            <p className="text-label-sm text-on-surface-variant/60 text-center py-6">No alarms set</p>
          ) : (
            alarms.map((a) => <AlarmRow key={a.id} alarm={a} onEdit={onEdit} onToggle={onToggle} />)
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Full flip clock + alarm list, sized to match the other single-cell app
// cards on the /apps page (Pomodoro, Stopwatch, …).
export function ClockApp() {
  const alarms = useClockStore((s) => s.alarms);
  const toggleAlarm = useClockStore((s) => s.toggleAlarm);
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new, alarm = edit

  return (
    <div className="w-full flex flex-col items-center gap-3">
      <FlipClock size="md" />
      <div className="w-full">
        <div className="flex items-center justify-between mb-1">
          <span className="text-label-md font-bold text-on-surface-variant tracking-wider">Alarms</span>
          <button
            type="button"
            onClick={() => setEditing(null)}
            aria-label="Add alarm"
            className="w-7 h-7 rounded-full bg-surface-container text-on-surface flex items-center justify-center active:scale-95"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
          </button>
        </div>
        <div className="max-h-[84px] overflow-y-auto scrollbar-slim">
          {alarms.length === 0 ? (
            <p className="text-label-sm text-on-surface-variant/60 text-center py-3">No alarms set</p>
          ) : (
            alarms.map((a) => <AlarmRow key={a.id} alarm={a} onEdit={setEditing} onToggle={toggleAlarm} />)
          )}
        </div>
      </div>
      <AlarmFormModal open={editing !== undefined} onClose={() => setEditing(undefined)} alarm={editing} />
    </div>
  );
}

// Alarms ordered for the widget's carousel: enabled alarms first, soonest to
// fire first, then any disabled alarms after (still reachable via arrows).
// Keeps the default (index 0) pinned to "the alarm that's actually upcoming".
function orderForCarousel(alarms, now) {
  const enabled = alarms
    .filter((a) => a.enabled)
    .sort((x, y) => minutesUntilNextFire(x, now) - minutesUntilNextFire(y, now));
  const disabled = alarms.filter((a) => !a.enabled);
  return [...enabled, ...disabled];
}

export function ClockWidget({ editing }) {
  const alarms = useClockStore((s) => s.alarms);
  const toggleAlarm = useClockStore((s) => s.toggleAlarm);
  const [editingAlarm, setEditingAlarm] = useState(undefined);
  const [listOpen, setListOpen] = useState(false);

  // The flip clock scales to whatever room is left above the alarm row, so
  // dragging the widget's resize handle (which changes its grid row/column
  // span) grows or shrinks the face instead of leaving it a fixed size. Only
  // ever one alarm row is rendered below it, so that available room — and
  // therefore the clock's size — stays constant no matter how many alarms exist.
  const clockWrapRef = useRef(null);
  const [clockHeight, setClockHeight] = useState(64);

  useEffect(() => {
    const el = clockWrapRef.current;
    if (!el) return;
    const measure = () => setClockHeight(Math.max(30, Math.min(150, el.clientHeight)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-rank periodically (not just when alarms change) so the "upcoming"
  // alarm still advances after wall-clock time carries it past the soonest one.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!alarms.length) return undefined;
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, [alarms.length]);

  const ordered = useMemo(() => orderForCarousel(alarms, now), [alarms, now]);
  const [cursor, setCursor] = useState(0);
  const upcomingId = ordered[0]?.id;
  useEffect(() => { setCursor(0); }, [upcomingId]);

  const idx = ordered.length ? Math.min(cursor, ordered.length - 1) : 0;
  const current = ordered[idx];
  const canScroll = ordered.length > 1 && !editing;
  const goPrev = () => setCursor((c) => (c - 1 + ordered.length) % ordered.length);
  const goNext = () => setCursor((c) => (c + 1) % ordered.length);

  return (
    <WidgetShell
      icon="schedule"
      title="Clock"
      source="/apps"
      editing={editing}
      footer={!editing && (
        <button
          type="button"
          onClick={() => setEditingAlarm(null)}
          className="w-full text-label-md font-bold text-primary flex items-center justify-center gap-1 active:scale-95"
        >
          <span className="material-symbols-outlined text-[16px]">add_alarm</span> Add alarm
        </button>
      )}
    >
      <div className="h-full flex flex-col">
        <div ref={clockWrapRef} className="flex-1 min-h-[36px] flex items-center justify-center py-1 px-4">
          <FlipClock height={clockHeight} showSeconds={clockHeight >= 70} />
        </div>
        {alarms.length === 0 ? (
          <p className="flex-none text-label-sm text-on-surface-variant/60 text-center py-2">No alarms yet</p>
        ) : (
          <div className="flex-none">
            <div className="flex items-center justify-between px-0.5 pb-0.5">
              <span className="text-label-sm text-on-surface-variant/60 tabular-nums">{idx + 1}/{ordered.length}</span>
              <button
                type="button"
                disabled={editing}
                onClick={() => setListOpen(true)}
                aria-label="View all alarms"
                className="w-6 h-6 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition active:scale-95 disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[14px]">open_in_full</span>
              </button>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                disabled={!canScroll}
                onClick={goPrev}
                aria-label="Previous alarm"
                className="flex-none w-7 h-7 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition active:scale-95 disabled:opacity-0"
              >
                <span className="material-symbols-outlined text-[18px]">chevron_left</span>
              </button>
              <div className="flex-1 min-w-0">
                <AlarmRow alarm={current} onEdit={setEditingAlarm} onToggle={toggleAlarm} disabled={editing} />
              </div>
              <button
                type="button"
                disabled={!canScroll}
                onClick={goNext}
                aria-label="Next alarm"
                className="flex-none w-7 h-7 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition active:scale-95 disabled:opacity-0"
              >
                <span className="material-symbols-outlined text-[18px]">chevron_right</span>
              </button>
            </div>
          </div>
        )}
      </div>
      <AlarmListModal open={listOpen} onClose={() => setListOpen(false)} alarms={ordered} onEdit={(a) => { setListOpen(false); setEditingAlarm(a); }} onToggle={toggleAlarm} />
      <AlarmFormModal open={editingAlarm !== undefined} onClose={() => setEditingAlarm(undefined)} alarm={editingAlarm} />
    </WidgetShell>
  );
}
