import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  format, addMonths, subMonths, addWeeks, subWeeks,
  addDays, subDays, startOfWeek, endOfWeek,
} from 'date-fns';
import { useSpaceStore } from '../../store/spaceStore';

const VIEWS = [
  { key: 'day',    label: 'Day' },
  { key: 'week',   label: 'Week' },
  { key: 'month',  label: 'Month' },
  { key: 'agenda', label: 'List' },
];

function formatLabel(view, date) {
  if (view === 'month' || view === 'agenda') return format(date, 'MMMM yyyy');
  if (view === 'week') {
    const s = startOfWeek(date, { weekStartsOn: 1 });
    const e = endOfWeek(date, { weekStartsOn: 1 });
    return format(s, 'MMM d') + ' – ' + format(e, 'MMM d, yyyy');
  }
  return format(date, 'EEEE, MMMM d, yyyy');
}

function navigate(view, date, dir) {
  if (view === 'month' || view === 'agenda') return dir > 0 ? addMonths(date, 1) : subMonths(date, 1);
  if (view === 'week')  return dir > 0 ? addWeeks(date, 1)  : subWeeks(date, 1);
  return dir > 0 ? addDays(date, 1) : subDays(date, 1);
}

export default function CalendarHeader({ view, date, touch, onViewChange, onDateChange, onNewEvent }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const isShared = searchParams.get('shared') === '1';
  const isTeam = useSpaceStore(s => s.currentSpace?.type === 'team');
  const sharedLabel = isTeam ? 'Team' : 'Family';

  function toggleShared() {
    const next = new URLSearchParams(searchParams);
    if (isShared) next.delete('shared');
    else next.set('shared', '1');
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="shrink-0">

      {/* Title row */}
      <div className="flex items-center justify-between pb-3">
        <h1 className="text-headline-lg text-on-background">Calendar</h1>
        <button
          onClick={onNewEvent}
          className="flex items-center gap-2 bg-primary text-on-primary rounded-full px-5 py-2.5 text-label-md font-bold hover:bg-primary/90 transition"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          New Event
        </button>
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-3 flex-wrap bg-surface-container-lowest rounded-xl border border-outline-variant/20 shadow-soft px-4 py-2.5 mb-3">

        {/* Prev / Today / Next */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => onDateChange(navigate(view, date, -1))}
            className={`rounded-full flex items-center justify-center hover:bg-surface-container active:bg-surface-container transition ${touch ? 'w-11 h-11' : 'w-8 h-8'}`}
          >
            <span className="material-symbols-outlined text-on-surface-variant text-[20px]">chevron_left</span>
          </button>

          <button
            onClick={() => onDateChange(new Date())}
            className={`rounded-full font-medium bg-surface-container text-on-surface hover:bg-surface-container-high transition ${touch ? 'px-4 py-2 text-label-md' : 'px-3 py-1 text-xs'}`}
          >
            Today
          </button>

          <button
            onClick={() => onDateChange(navigate(view, date, 1))}
            className={`rounded-full flex items-center justify-center hover:bg-surface-container active:bg-surface-container transition ${touch ? 'w-11 h-11' : 'w-8 h-8'}`}
          >
            <span className="material-symbols-outlined text-on-surface-variant text-[20px]">chevron_right</span>
          </button>
        </div>

        {/* Date label */}
        <h2 className="font-headline-md text-on-surface flex-1 min-w-0 truncate">
          {formatLabel(view, date)}
        </h2>

        {/* Shared / Personal toggle */}
        <button
          onClick={toggleShared}
          title={isShared ? 'Switch to Personal view' : `Switch to ${sharedLabel} view`}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition
            ${isShared
              ? 'bg-primary text-on-primary'
              : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
            }`}
        >
          <span className="material-symbols-outlined text-[16px]">
            {isShared ? 'group' : 'person'}
          </span>
          {isShared ? sharedLabel : 'Mine'}
        </button>

        {/* View switcher */}
        <div className="flex rounded-full bg-surface-container p-0.5 gap-0.5">
          {VIEWS.map(v => (
            <button
              key={v.key}
              onClick={() => onViewChange(v.key)}
              className={`rounded-full font-medium transition ${touch ? 'px-4 py-2 text-label-md' : 'px-3 py-1 text-xs'}
                ${view === v.key
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
                }`}
            >
              {v.label}
            </button>
          ))}
        </div>

      </div>
    </div>
  );
}
