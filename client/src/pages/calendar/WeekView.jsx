import React, { useMemo, useState } from 'react';
import {
  startOfWeek, addDays, format, isToday,
} from 'date-fns';
import { formatHHMM } from '../../utils/time';
import {
  DndContext, useDraggable, useDroppable, DragOverlay,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import CalendarEventChip from './CalendarEventChip';
import NowLine from './NowLine';
import HabitDotCell from './HabitDotCell';
import DayWeather from './DayWeather';
import UpNextRail from './UpNextRail';
import MiniMonthCalendar from './MiniMonthCalendar';
import QuickAddTask from './QuickAddTask';
import { layoutOverlaps } from '../../utils/overlapLayout';
import { buildHourOffsets, minutesToTop, contentPadForDivider } from '../../utils/hourOffsets';
import { TIME_SLOTS, SLOT_START_HOUR, groupBySlot } from '../../utils/timeSlots';

const HOUR_HEIGHT = 56; // h-14 = 56px
const LABEL_ROW_HEIGHT = 22;
const DOTS_ROW_HEIGHT  = 24;
const DIVIDER_HEIGHT   = LABEL_ROW_HEIGHT + DOTS_ROW_HEIGHT;
const DEFAULT_START = 8;
const DEFAULT_END   = 22; // exclusive — shows up to 22:00

function toMinutes(datetimeStr) {
  if (!datetimeStr) return 0;
  const d = new Date(datetimeStr);
  return d.getHours() * 60 + d.getMinutes();
}

function isAllDay(item, type) {
  if (type === 'milestone') return true;
  return !!item.all_day;
}

function AllDayDropCell({ dayKey, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey });
  return (
    <div
      ref={setNodeRef}
      className={`border-l border-outline-variant/20 p-1 min-h-8 min-w-0 flex flex-col gap-0.5 transition-colors ${
        isOver ? 'bg-primary/10' : ''
      }`}
    >
      {children}
    </div>
  );
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

function DayHourSlot({ dayKey, hour, onEventCreate }) {
  return (
    <div className="border-l border-b border-outline-variant/10 h-14 flex flex-col">
      <HalfHourSlot dayKey={dayKey} hour={hour} minute="00" onEventCreate={onEventCreate} />
      <HalfHourSlot dayKey={dayKey} hour={hour} minute="30" onEventCreate={onEventCreate} />
    </div>
  );
}

function DraggableChip({ draggableId, type, item, variant, showAvatar, fill, maxLines, contentTopPad, onClick }) {
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
        maxLines={maxLines}
        contentTopPad={contentTopPad}
        onClick={isDragging ? undefined : onClick}
      />
    </div>
  );
}

export default function WeekView({
  date, tasks, events, isShared,
  onTaskClick, onEventClick, onEventCreate, onItemMove,
  habitsByDate = {}, onToggleHabit,
  upcomingItems = [], onDayClick, onDateChange,
}) {
  const days = useMemo(() => {
    const start = startOfWeek(date, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [date]);

  const [activeData, setActiveData] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const { allDayByDay, timedByDay } = useMemo(() => {
    const allDayByDay = {};
    const timedByDay  = {};
    days.forEach(d => {
      const key = format(d, 'yyyy-MM-dd');
      allDayByDay[key] = [];
      timedByDay[key]  = [];
    });

    function placeTask(t) {
      const type = t.parent_task_id ? 'subtask' : 'task';
      // Deadline → all-day chip (top-level tasks only; subtasks have no deadline)
      if (!t.parent_task_id && t.due_date) {
        const key = t.due_date.slice(0, 10);
        if (allDayByDay[key]) allDayByDay[key].push({ type, item: t, variant: 'deadline' });
      }
      // Scheduled time block → timed chip
      if (t.start_at) {
        const key = t.start_at.slice(0, 10);
        if (timedByDay[key]) {
          const minutes = toMinutes(t.start_at);
          const endMinutes = t.end_at ? toMinutes(t.end_at) : minutes + 30;
          timedByDay[key].push({ type, item: t, variant: 'block', minutes, endMinutes: Math.max(endMinutes, minutes + 15) });
        }
      }
    }

    function placeEvent(e) {
      const startKey = e.start_datetime.slice(0, 10);
      const endKey   = (e.end_datetime ?? e.start_datetime).slice(0, 10);
      let cur = startKey;
      while (cur <= endKey) {
        if (allDayByDay[cur] !== undefined) {
          if (isAllDay(e, 'event')) allDayByDay[cur].push({ type: 'event', item: e });
          else {
            const minutes = toMinutes(e.start_datetime);
            const endMinutes = e.end_datetime ? toMinutes(e.end_datetime) : minutes + 60;
            timedByDay[cur].push({ type: 'event', item: e, minutes, endMinutes: Math.max(endMinutes, minutes + 15) });
          }
        }
        const d = new Date(cur + 'T00:00:00');
        d.setDate(d.getDate() + 1);
        cur = format(d, 'yyyy-MM-dd');
      }
    }

    tasks.forEach(placeTask);
    events.forEach(placeEvent);

    return { allDayByDay, timedByDay };
  }, [days, tasks, events]);

  // Each day's habits grouped by time-of-day slot, for the condensed dot rows
  // below. Each habit is tagged with its own date, since a single toggle
  // handler is shared across all 7 (differently-dated) columns.
  const habitsByDateSlot = useMemo(() => {
    const map = {};
    days.forEach(d => {
      const key = format(d, 'yyyy-MM-dd');
      const tagged = (habitsByDate[key] || []).map(h => ({ ...h, _date: key }));
      map[key] = groupBySlot(tagged);
    });
    return map;
  }, [days, habitsByDate]);

  // A slot gets a divider if ANY day this week has a habit in it — the row is
  // shared across all 7 columns, so days without one just render an empty cell.
  const activeSlots = useMemo(
    () => TIME_SLOTS.filter(s => days.some(d => {
      const key = format(d, 'yyyy-MM-dd');
      return (habitsByDateSlot[key]?.[s.key]?.length ?? 0) > 0;
    })),
    [days, habitsByDateSlot],
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
    days.forEach(d => {
      const key = format(d, 'yyyy-MM-dd');
      (timedByDay[key] ?? []).forEach(({ minutes }) => {
        const h = Math.floor(minutes / 60);
        if (h < start) start = h;
        if (h + 1 > end) end = h + 1;
      });
    });
    activeSlots.forEach(s => {
      const h = SLOT_START_HOUR[s.key];
      if (h < start) start = h;
      if (h + 1 > end) end = h + 1;
    });
    return { startHour: start, endHour: end };
  }, [days, timedByDay, activeSlots]);

  const visibleHours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const dividerHours = useMemo(() => Object.keys(hourToSlotKey).map(Number), [hourToSlotKey]);

  // Timed items and the now-line both read their top offset from this map, so
  // they stay aligned with the actual (variable-height, divider-bearing) hour flow.
  const { offsetForHour } = useMemo(
    () => buildHourOffsets(visibleHours, dividerHours, DIVIDER_HEIGHT, HOUR_HEIGHT),
    [visibleHours, dividerHours],
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

        {/* Headers + all-day row + time grid share one white card */}
        <div className="flex-1 min-h-0 flex flex-col bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-soft overflow-hidden">

        {/* Day headers */}
        <div className="grid border-b border-outline-variant/20 shrink-0" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>
          <div />
          {days.map(d => (
            <div
              key={String(d)}
              className={`py-2 text-center text-xs font-label-sm border-l border-outline-variant/20
                ${isToday(d) ? 'text-primary font-medium' : 'text-on-surface-variant'}`}
            >
              <div>{format(d, 'EEE')}</div>
              <div className={`mx-auto w-7 h-7 flex items-center justify-center rounded-full mt-0.5
                ${isToday(d) ? 'bg-primary text-on-primary' : ''}`}
              >
                {format(d, 'd')}
              </div>
              <div className="flex justify-center mt-0.5">
                <DayWeather dateStr={format(d, 'yyyy-MM-dd')} />
              </div>
            </div>
          ))}
        </div>

        {/* All-day row — droppable cells use date-only IDs so handleItemMove keeps items all-day */}
        <div className="grid border-b border-outline-variant/20 shrink-0" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>
          <div className="text-[10px] text-on-surface-variant text-right pr-2 pt-1 select-none">all day</div>
          {days.map(d => {
            const key = format(d, 'yyyy-MM-dd');
            return (
              <AllDayDropCell key={key} dayKey={key}>
                {allDayByDay[key].map(({ type, item, variant }, i) => (
                  <DraggableChip
                    key={`${type}-${item.id}-${i}`}
                    draggableId={`week-allday-${type}-${item.id}`}
                    type={type} item={item} variant={variant}
                    showAvatar={isShared}
                    maxLines={2}
                    onClick={() => type === 'event' ? onEventClick(item) : onTaskClick(item)}
                  />
                ))}
              </AllDayDropCell>
            );
          })}
        </div>

        {/* Time grid — only renders startHour to endHour */}
        <div className="flex-1 overflow-auto p-2">
          <div className="grid relative" style={{ gridTemplateColumns: '48px repeat(7, 1fr)' }}>

            {/* Visible hour rows, with a habit-section divider + condensed dot
                row inserted right before the hour each active slot starts at. */}
            {visibleHours.map(h => {
              const slotKey = hourToSlotKey[h];
              const slotMeta = slotKey ? TIME_SLOTS.find(s => s.key === slotKey) : null;
              return (
                <React.Fragment key={h}>
                  {slotMeta && (
                    // relative z-20 + opaque background lift the whole habit
                    // band above the z-10 timed-item overlay, so an item
                    // spanning across it is interrupted by the band rather than
                    // covering its label and habit dots.
                    <>
                      <div
                        className="relative z-20 flex items-center gap-1.5 px-2 bg-surface-container-low border-y border-outline-variant/25 overflow-hidden"
                        style={{ height: LABEL_ROW_HEIGHT, gridColumn: '1 / -1' }}
                      >
                        <span className="text-[11px] leading-none">{slotMeta.emoji}</span>
                        <span className="text-[10px] font-bold tracking-wide text-on-surface">{slotMeta.label}</span>
                      </div>
                      <div className="relative z-20 bg-surface-container-low" style={{ height: DOTS_ROW_HEIGHT }} />
                      {days.map(d => {
                        const key = format(d, 'yyyy-MM-dd');
                        return (
                          <div
                            key={key}
                            className="relative z-20 bg-surface-container-low border-l border-outline-variant/20 flex items-center"
                            style={{ height: DOTS_ROW_HEIGHT }}
                          >
                            <HabitDotCell
                              habits={habitsByDateSlot[key]?.[slotKey] || []}
                              onToggle={onToggleHabit}
                            />
                          </div>
                        );
                      })}
                    </>
                  )}
                  <div className="text-[10px] text-on-surface-variant text-right pr-2 pt-0.5 h-14 border-b border-outline-variant/10 select-none">
                    {`${h}:00`}
                  </div>
                  {days.map(d => {
                    const dayKey = format(d, 'yyyy-MM-dd');
                    return (
                      <DayHourSlot key={dayKey} dayKey={dayKey} hour={h} onEventCreate={onEventCreate} />
                    );
                  })}
                </React.Fragment>
              );
            })}

            {/* Timed items — one positioned wrapper per day (so overlap columns are
                relative to that day only), grid is "48px repeat(7,1fr)". pointer-events-none
                on the wrapper so it doesn't shadow-click the habit dot cells it visually
                overlaps for that column; re-enabled per item below. */}
            {days.map((d, colIdx) => {
              const key = format(d, 'yyyy-MM-dd');
              const dayItems = timedByDay[key];
              const layout = layoutOverlaps(dayItems, it => it.minutes, it => it.endMinutes);
              return (
                <div
                  key={key}
                  className="absolute inset-y-0 pointer-events-none"
                  style={{
                    left:  `calc(48px + ${colIdx} * (100% - 48px) / 7)`,
                    width: `calc((100% - 48px) / 7)`,
                  }}
                >
                  <NowLine dayKey={key} startHour={startHour} endHour={endHour} hourHeight={HOUR_HEIGHT} offsetForHour={offsetForHour} />
                  {dayItems.map(({ type, item, variant, minutes, endMinutes }, i) => {
                    const { col, cols } = layout[i];
                    const top    = minutesToTop(minutes,    offsetForHour, HOUR_HEIGHT, startHour);
                    const bottom = minutesToTop(endMinutes, offsetForHour, HOUR_HEIGHT, startHour);
                    // Push the header/title down past a divider band sitting
                    // right at the item's top — the band paints above items
                    // (so its habit dots stay clickable), so without this the
                    // header would render underneath it and be invisible.
                    const contentPad = contentPadForDivider(top, minutes, endMinutes, offsetForHour, dividerHours, DIVIDER_HEIGHT);
                    return (
                      <div
                        key={`${type}-${item.id}-${i}`}
                        className="absolute z-10 overflow-hidden pointer-events-auto"
                        style={{
                          top:    `${top}px`,
                          height: `${Math.max(bottom - top, 20)}px`,
                          left:   `calc(${(col / cols) * 100}% + 2px)`,
                          width:  `calc(${100 / cols}% - 4px)`,
                        }}
                      >
                        <DraggableChip
                          draggableId={`week-${type}-${item.id}`}
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
              );
            })}
          </div>
        </div>
        </div>
      </div>

      <div className="hidden lg:flex flex-col gap-4">
        <UpNextRail items={upcomingItems} onItemClick={(it) => onDayClick?.(it.dateStr)} />
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
