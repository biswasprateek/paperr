import React, { useState, useEffect } from 'react';
import PillSelect from '../../components/PillSelect';
import EmojiPopover from '../../components/EmojiPopover';
import ProtocolFormModal from './ProtocolFormModal';
import { TIME_SLOTS, DAY_LABELS } from './shared';

const EMOJI_BUTTON_CLASS =
  'w-7 h-7 flex items-center justify-center text-[18px] mr-2 flex-shrink-0 text-on-surface-variant/60 hover:text-on-surface-variant transition-colors';

function FieldLabel({ children }) {
  return (
    <p className="text-label-md text-on-surface-variant tracking-wider mb-2">{children}</p>
  );
}

function InputRow({ icon, children }) {
  return (
    <div className="relative bg-surface-container-high rounded-full flex items-center px-4 h-12 focus-within:ring-2 focus-within:ring-primary/20 transition-[box-shadow]">
      {icon && (
        <span className="material-symbols-outlined text-on-surface-variant/50 mr-2 text-[20px] flex-shrink-0">{icon}</span>
      )}
      {children}
    </div>
  );
}

function TimeSlotButton({ slot, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 h-10 rounded-full text-label-md transition ${
        active
          ? 'bg-primary text-on-primary font-bold'
          : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
      }`}
    >
      <span className="text-[14px]">{slot.emoji}</span>
      {slot.label}
    </button>
  );
}

const INPUT_CLASS =
  'bg-transparent border-none focus:ring-0 p-0 text-body-md font-light tracking-wide text-on-surface w-full placeholder-on-surface-variant/50';

export default function HabitFormModal({
  open, onClose, habit = null, protocols = [],
  defaultTimeSlot = 'morning', defaultProtocolId = null,
  onSave, onDelete, onArchive, onCreateProtocol, loading,
}) {
  const [title, setTitle]           = useState('');
  const [icon, setIcon]             = useState('');
  const [protocolId, setProtocolId] = useState('');
  const [timeSlot, setTimeSlot]     = useState(defaultTimeSlot);
  const [targetTime, setTargetTime] = useState('');
  const [duration, setDuration]     = useState('');
  const [scienceNote, setScience]   = useState('');
  const [recurDays, setRecurDays]   = useState('1111111');

  const [showProtocolForm, setShowProtocolForm] = useState(false);
  const [creatingProtocol, setCreatingProtocol] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (habit) {
      const currentProtocol = protocols.find(p => p.id === habit.protocol_id);
      setTitle(habit.title || '');
      setIcon(habit.icon || '');
      setProtocolId(currentProtocol && !currentProtocol.is_system ? String(habit.protocol_id) : '');
      setTimeSlot(habit.time_slot || 'morning');
      setTargetTime(habit.target_time || '');
      setDuration(habit.duration_minutes ? String(habit.duration_minutes) : '');
      setScience(habit.science_note || '');
      setRecurDays(habit.recur_days || '1111111');
    } else {
      setTitle('');
      setIcon('');
      setProtocolId(defaultProtocolId ? String(defaultProtocolId) : '');
      setTimeSlot(defaultTimeSlot || 'morning');
      setTargetTime('');
      setDuration('');
      setScience('');
      setRecurDays('1111111');
    }
  }, [habit, open, defaultTimeSlot, defaultProtocolId, protocols]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const toggleDay = (idx) => {
    setRecurDays(prev => {
      const arr = prev.split('');
      arr[idx] = arr[idx] === '1' ? '0' : '1';
      return arr.join('');
    });
  };

  const handleSubmit = (e) => {
    e?.preventDefault?.();
    if (!title.trim()) return;
    onSave({
      protocol_id:      protocolId ? parseInt(protocolId) : null,
      title:            title.trim(),
      icon:             icon || null,
      science_note:     scienceNote.trim() || null,
      time_slot:        timeSlot,
      target_time:      targetTime || null,
      duration_minutes: duration ? parseInt(duration) : null,
      recur_days:       recurDays,
    });
  };

  const handleCreateProtocol = async (data) => {
    if (!onCreateProtocol) return;
    setCreatingProtocol(true);
    try {
      const created = await onCreateProtocol(data);
      if (created?.id) setProtocolId(String(created.id));
      setShowProtocolForm(false);
    } finally {
      setCreatingProtocol(false);
    }
  };

  const protocolOptions = [
    { value: '', label: 'No protocol' },
    ...protocols.filter(p => !p.is_system).map(p => ({ value: String(p.id), label: `${p.icon || '⭐'} ${p.name}` })),
  ];

  return (
    <div
      className="fixed inset-0 bg-inverse-surface/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-surface-container-lowest rounded-2xl shadow-heavy w-full max-w-xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-outline-variant/20 flex-shrink-0">
          <h2 className="text-headline-md font-light tracking-wide text-on-background">
            {habit ? 'Edit Habit' : 'New Habit'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="h-10 w-10 rounded-full flex items-center justify-center hover:bg-surface-container text-on-surface-variant transition-[background-color,transform] duration-150 active:scale-[0.97]"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Title */}
          <InputRow>
            <EmojiPopover
              value={icon}
              onChange={setIcon}
              placeholderIcon="add_reaction"
              allowClear
              buttonClassName={EMOJI_BUTTON_CLASS}
              title="Add emoji"
            />
            <input
              autoFocus
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Habit title…"
              className={INPUT_CLASS}
              required
            />
          </InputRow>

          {/* Protocol */}
          <div>
            <FieldLabel>
              Protocol
              <span className="ml-1 normal-case font-normal text-on-surface-variant/50">(optional)</span>
            </FieldLabel>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <PillSelect
                  icon="category"
                  value={protocolId}
                  onChange={setProtocolId}
                  options={protocolOptions}
                  placeholder="No protocol"
                />
              </div>
              {onCreateProtocol && (
                <button
                  type="button"
                  onClick={() => setShowProtocolForm(true)}
                  className="h-12 px-4 rounded-full bg-surface-container text-on-surface-variant hover:text-primary hover:bg-primary/10 text-label-md font-medium flex items-center gap-1.5 flex-shrink-0 transition active:scale-[0.97]"
                  title="Create a new protocol"
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>
                  New
                </button>
              )}
            </div>
          </div>

          {/* Time slot */}
          <div>
            <FieldLabel>Time of Day</FieldLabel>
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap justify-center gap-1.5">
                {TIME_SLOTS.slice(0, 3).map(s => (
                  <TimeSlotButton key={s.key} slot={s} active={timeSlot === s.key} onClick={() => setTimeSlot(s.key)} />
                ))}
              </div>
              <div className="flex flex-wrap justify-center gap-1.5">
                {TIME_SLOTS.slice(3).map(s => (
                  <TimeSlotButton key={s.key} slot={s} active={timeSlot === s.key} onClick={() => setTimeSlot(s.key)} />
                ))}
              </div>
            </div>
          </div>

          {/* Target time + duration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel>
                Target Time
                <span className="ml-1 normal-case font-normal text-on-surface-variant/50">(optional)</span>
              </FieldLabel>
              <InputRow icon="schedule">
                <input type="time" value={targetTime} onChange={e => setTargetTime(e.target.value)} className={INPUT_CLASS} />
              </InputRow>
            </div>
            <div>
              <FieldLabel>Duration</FieldLabel>
              <InputRow icon="timer">
                <input
                  type="number"
                  min="0"
                  value={duration}
                  onChange={e => setDuration(e.target.value)}
                  placeholder="min"
                  className={INPUT_CLASS}
                />
                <span className="text-label-md text-on-surface-variant/50 ml-1 flex-shrink-0">min</span>
              </InputRow>
            </div>
          </div>

          {/* Active days */}
          <div>
            <FieldLabel>Active Days</FieldLabel>
            <div className="flex gap-1.5">
              {DAY_LABELS.map((d, i) => {
                const on = recurDays[i] === '1';
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={`w-10 h-10 rounded-full text-label-md font-medium transition ${
                      on
                        ? 'bg-primary text-on-primary'
                        : 'bg-surface-container text-on-surface-variant/60 hover:bg-surface-container-high'
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Science note */}
          <div>
            <FieldLabel>Science Note</FieldLabel>
            <textarea
              value={scienceNote}
              onChange={e => setScience(e.target.value)}
              placeholder="Why this works…"
              rows={2}
              className="w-full bg-surface-container-high rounded-2xl px-4 py-3 text-body-md font-light tracking-wide text-on-surface border-none focus:ring-2 focus:ring-primary/20 placeholder-on-surface-variant/50 resize-none transition-[box-shadow] outline-none"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-outline-variant/20 flex-shrink-0 flex items-center gap-3">
          {habit && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(habit)}
              className="h-12 px-4 rounded-full text-label-md text-error hover:bg-error-container transition flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
            </button>
          )}
          {habit && onArchive && (
            <button
              type="button"
              onClick={() => onArchive(habit)}
              title={habit.is_active === 0
                ? 'Put this habit back in your routines'
                : 'Hides the habit everywhere but keeps its streaks and history'}
              className="h-12 px-4 rounded-full text-label-md text-on-surface-variant hover:bg-surface-container transition flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">
                {habit.is_active === 0 ? 'unarchive' : 'archive'}
              </span>
              {habit.is_active === 0 ? 'Unarchive' : 'Archive'}
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="px-5 h-12 rounded-full bg-surface-container-lowest border border-outline-variant/40 text-on-surface-variant text-label-md font-bold tracking-widest hover:bg-surface-container transition-[background-color,transform] duration-150 active:scale-[0.97]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!title.trim() || loading}
            className="px-6 h-12 rounded-full bg-primary text-on-primary text-label-md font-bold tracking-widest hover:bg-primary/90 transition-[background-color,opacity,transform] duration-150 disabled:opacity-50 active:scale-[0.97] flex items-center justify-center gap-2"
          >
            {loading && <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>}
            {habit ? 'Save' : 'Add Habit'}
          </button>
        </div>
      </div>

      {/* Nested: create a new protocol without leaving the habit form */}
      {showProtocolForm && (
        <ProtocolFormModal
          protocol={null}
          onClose={() => setShowProtocolForm(false)}
          onSave={handleCreateProtocol}
          loading={creatingProtocol}
        />
      )}
    </div>
  );
}
