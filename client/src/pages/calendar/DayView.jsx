import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { formatHHMM } from '../../utils/time';
import {
  DndContext, useDraggable, useDroppable, DragOverlay,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import CalendarEventChip from './CalendarEventChip';
import NowLine from './NowLine';
import HabitDivider from './HabitDivider';
import DayWeather from './DayWeather';
import UpNextRail from './UpNextRail';
import TodayHabitRing from './TodayHabitRing';
import MiniMonthCalendar from './MiniMonthCalendar';
import QuickAddTask from './QuickAddTask';
import { layoutOverlaps } from '../../utils/overlapLayout';
import { buildHourOffsets, minutesToTop, contentPadForDivider } from '../../utils/hourOffsets';
import { TIME_SLOTS, SLOT_START_HOUR } from '../../utils/timeSlots';

const HOUR_HEIGHT = 56; // h-14 = 56px
const DIVIDER_HEIGHT = 34;
const DEFAULT_START = 8;
const DEFAULT_END   = 22; // exclusive — shows up to 22:00

function toMinutes(datetimeStr) {
  if (!datetimeStr) return 0;
  const d = new Date(datetimeStr);
  return d.getHours() * 60 + d.getMinutes();
}

// One clickable/droppable half-hour band. Hover highlights just this 30-minute
// window, and the id doubles as the datetime handed to both the event form
// (pre-selected start time) and drag-drop moves.
function HalfHourSlot({ dayKey, hour, minute, onEventCreate }) {
  const time = `${String(hour).padStart(2, '0')}:${minute}`;
  const id = `${dayKey}T${time}`;
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      title={`New event at ${formatHHMM(time)}`}
      className={`flex-1 transition-colors ${minute === '00' ? 'border-b border-dashed border-outline-variant/10' : ''} ${
        isOver ? 'bg-primary/15 cursor-copy' : 'hover:bg-surface-container/60 cursor-pointer'
      }`}
      onClick={() => onEventCreate(id)}
    />
  );
}

function HourSlot({ hour, dayKey, onEventCreate }) {
  return (
    <div className="flex-1 flex flex-col">
      <HalfHourSlot dayKey={dayKey} hour={hour} minute="00" onEventCreate={onEventCreate} />
      <HalfHourSlot dayKey={dayKey} hour={hour} minute="30" onEventCreate={onEventCreate} />
    </div>
  );
}

function DraggableChip({ draggableId, type, item, variant, showAvatar, fill, contentTopPad, onClick }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: draggableId,
    data: { type, item, variant },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`touch-none ${fill ? 'h-full' : ''}`}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.35 : 1,
        transition: isDragging ? undefined : 'opacity 0.15s ease',
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
    >
      <CalendarEventChip
        type={type}
        item={item}
        variant={variant}
        showAvatar={showAvatar}
        fill={fill}
        contentTopPad={contentTopPad}
        onClick={isDragging ? undefined : onClick}
      />
    </div>
  );
}

export default function DayView({
  date, tasks, events, isShared,
  onTaskClick, onEventClick, onEventCreate, onItemMove,
  habitsBySlot = {}, onToggleHabit,
  upcomingItems = [], onDayClick, onDateChange,
}) {
  const dayKey = format(date, 'yyyy-MM-dd');
  const [activeData, setActiveData] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const { allDay, timed } = useMemo(() => {
    const allDay = [];
    const timed  = [];

    tasks.forEach(t => {
      const type = t.parent_task_id ? 'subtask' : 'task';
      // Deadline → all-day chip (top-level tasks only; subtasks have no deadline)
      if (!t.parent_task_id && t.due_date && t.due_date.slice(0, 10) === dayKey) {
        allDay.push({ type, item: t, variant: 'deadline' });
      }
      // Scheduled time block → timed chip
      if (t.start_at && t.start_at.slice(0, 10) === dayKey) {
        const minutes = toMinutes(t.start_at);
        const endMinutes = t.end_at ? toMinutes(t.end_at) : minutes + 30;
        timed.push({ type, item: t, variant: 'block', minutes, endMinutes: Math.max(endMinutes, minutes + 15) });
      }
    });

    events.forEach(e => {
      const start = e.start_datetime.slice(0, 10);
      const end   = (e.end_datetime ?? e.start_datetime).slice(0, 10);
      if (start > dayKey || end < dayKey) return;
      if (e.all_day) allDay.push({ type: 'event', item: e });
      else {
        const minutes = toMinutes(e.start_datetime);
        const endMinutes = e.end_datetime ? toMinutes(e.end_datetime) : minutes + 60;
        timed.push({ type: 'event', item: e, minutes, endMinutes: Math.max(endMinutes, minutes + 15) });
      }
    });

    timed.sort((a, b) => a.minutes - b.minutes);
    return { allDay, timed };
  }, [date, tasks, events, dayKey]);

  // Active time-of-day habit sections — only slots with a habit today get a divider
  const activeSlots = useMemo(
    () => TIME_SLOTS.filter(s => (habitsBySlot[s.key]?.length ?? 0) > 0),
    [habitsBySlot],
  );

  const hourToSlotKey = useMemo(() => {
    const map = {};
    activeSlots.forEach(s => { map[SLOT_START_HOUR[s.key]] = s.key; });
    return map;
  }, [activeSlots]);

  // Visible hour range: 8–22 by default, expanded to include any out-of-range
  // items and any active habit-section boundary.
  const { startHour, endHour } = useMemo(() => {
    let start = DEFAULT_START;
    let end   = DEFAULT_END;
    timed.forEach(({ minutes }) => {
      const h = Math.floor(minutes / 60);
      if (h < start) start = h;
      if (h + 1 > end) end = h + 1;
    });
    activeSlots.forEach(s => {
      const h = SLOT_START_HOUR[s.key];
      if (h < start) start = h;
      if (h + 1 > end) end = h + 1;
    });
    return { startHour: start, endHour: end };
  }, [timed, activeSlots]);

  const visibleHours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

  const dividerHours = useMemo(() => Object.keys(hourToSlotKey).map(Number), [hourToSlotKey]);

  // Timed items and the now-line both read their top offset from this map, so
  // they stay aligned with the actual (variable-height, divider-bearing) hour flow.
  const { offsetForHour } = useMemo(
    () => buildHourOffsets(visibleHours, dividerHours, DIVIDER_HEIGHT, HOUR_HEIGHT),
    [visibleHours, dividerHours],
  );

  const timedLayout = useMemo(
    () => layoutOverlaps(timed, it => it.minutes, it => it.endMinutes),
    [timed],
  );

  function handleDragStart({ active }) {
    setActiveData(active.data.current ?? null);
  }

  function handleDragEnd({ active, over }) {
    setActiveData(null);
    if (!over || !active.data.current) return;
    onItemMove?.({ ...active.data.current, newDatetime: over.id });
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex-1 overflow-hidden flex gap-4">
      <div className="flex-1 min-w-0 flex flex-col">

        {/* Weather for the viewed date (7-day forecast window; renders nothing beyond it) */}
        <DayWeather dateStr={dayKey} variant="strip" />

        {/* All-day section + hour timeline share one white card */}
        <div className="flex-1 min-h-0 flex flex-col bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-soft overflow-hidden">
          {allDay.length > 0 && (
            <div className="px-4 py-2 border-b border-outline-variant/20 shrink-0">
              <p className="text-[10px] text-on-surface-variant mb-1 tracking-wide">All day</p>
              <div className="flex flex-col gap-1">
                {allDay.map(({ type, item, variant }, i) => (
                  <CalendarEventChip
                    key={`${type}-${item.id}-${i}`}
                    type={type} item={item} variant={variant}
                    showAvatar={isShared}
                    maxLines={2}
                    onClick={() => type === 'event' ? onEventClick(item) : onTaskClick(item)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Hour timeline — only renders startHour to endHour */}
          <div className="flex-1 overflow-auto p-2">
            <div className="relative">
              {visibleHours.map(h => (
                <React.Fragment key={h}>
                  {hourToSlotKey[h] && (
                    // z-20 lifts the section band above the z-10 timed-item
                    // overlay, so an item spanning across it is interrupted by
                    // the divider rather than covering its label + checkboxes.
                    <div className="relative z-20">
                      <HabitDivider
                        slotKey={hourToSlotKey[h]}
                        habits={habitsBySlot[hourToSlotKey[h]] || []}
                        onToggle={onToggleHabit}
                        height={DIVIDER_HEIGHT}
                      />
                    </div>
                  )}
                  <div className="flex border-b border-outline-variant/10 h-14">
                    <div className="w-12 text-[10px] text-on-surface-variant text-right pr-2 pt-0.5 shrink-0 select-none">
                      {`${h}:00`}
                    </div>
                    <HourSlot hour={h} dayKey={dayKey} onEventCreate={onEventCreate} />
                  </div>
                </React.Fragment>
              ))}

              {/* Timed items — positioned relative to startHour (via offsetForHour, which
                  accounts for habit-divider rows), side-by-side within overlap clusters.
                  pointer-events-none on the wrapper so it doesn't shadow-click the habit
                  divider chips/checkboxes it visually overlaps; re-enabled per item below. */}
              <div className="absolute left-14 right-2 top-0 bottom-0 pointer-events-none">
                <NowLine dayKey={dayKey} startHour={startHour} endHour={endHour} hourHeight={HOUR_HEIGHT} offsetForHour={offsetForHour} />
                {timed.map(({ type, item, variant, minutes, endMinutes }, i) => {
                  const { col, cols } = timedLayout[i];
                  const top    = minutesToTop(minutes,    offsetForHour, HOUR_HEIGHT, startHour);
                  const bottom = minutesToTop(endMinutes, offsetForHour, HOUR_HEIGHT, startHour);
                  // If a divider band the item spans across sits right at its
                  // top, push the item's header/title down past it — the band
                  // paints above items (so its own habit checkboxes stay
                  // clickable), so without this the header would render
                  // underneath it and be invisible.
                  const contentPad = contentPadForDivider(top, minutes, endMinutes, offsetForHour, dividerHours, DIVIDER_HEIGHT);
                  return (
                    <div
                      key={`${type}-${item.id}-${i}`}
                      className="absolute z-10 pointer-events-auto"
                      style={{
                        top:    `${top}px`,
                        height: `${Math.max(bottom - top, 20)}px`,
                        left:   `calc(${(col / cols) * 100}% + 2px)`,
                        width:  `calc(${100 / cols}% - 4px)`,
                      }}
                    >
                      <DraggableChip
                        draggableId={`day-${type}-${item.id}`}
                        type={type} item={item} variant={variant}
                        showAvatar={isShared}
                        fill
                        contentTopPad={contentPad}
                        onClick={() => type === 'event' ? onEventClick(item) : onTaskClick(item)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="hidden lg:flex flex-col gap-4">
        <UpNextRail items={upcomingItems} onItemClick={(it) => onDayClick?.(it.dateStr)} />
        <TodayHabitRing date={date} habitsBySlot={habitsBySlot} />
        <MiniMonthCalendar selected={date} onSelect={(d) => onDateChange?.(d)} />
        <QuickAddTask />
      </div>
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.18,0.67,0.6,1.22)' }}>
        {activeData && (
          <div className="shadow-heavy rounded-full scale-105 opacity-95 pointer-events-none">
            <CalendarEventChip
              type={activeData.type}
              item={activeData.item}
              variant={activeData.variant}
              showAvatar={isShared}
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
