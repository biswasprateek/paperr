import React, { useMemo, useState } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday, format,
} from 'date-fns';
import {
  DndContext, useDraggable, useDroppable, DragOverlay,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import CalendarEventChip from './CalendarEventChip';
import UpNextRail from './UpNextRail';
import QuickAddTask from './QuickAddTask';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_VISIBLE = 3;

function dateKey(d) {
  return format(d, 'yyyy-MM-dd');
}

function groupByDate(tasks, events) {
  const map = {};

  function add(date, type, item, variant) {
    if (!date) return;
    const key = date.slice(0, 10);
    if (!map[key]) map[key] = [];
    map[key].push({ type, item, variant });
  }

  for (const t of tasks) {
    const type = t.parent_task_id ? 'subtask' : 'task';
    // Deadline chip (top-level tasks only) + scheduled time-block chip
    if (!t.parent_task_id && t.due_date) add(t.due_date, type, t, 'deadline');
    if (t.start_at) add(t.start_at, type, t, 'block');
  }
  for (const e of events) {
    const start = e.start_datetime.slice(0, 10);
    const end   = (e.end_datetime ?? e.start_datetime).slice(0, 10);
    let cur = start;
    while (cur <= end) {
      add(cur, 'event', e);
      const d = new Date(cur + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      cur = format(d, 'yyyy-MM-dd');
    }
  }

  const ORDER = { event: 0, task: 1, subtask: 2 };
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => ORDER[a.type] - ORDER[b.type]);
  }

  return map;
}

function DraggableChip({ draggableId, type, item, variant, showAvatar, onClick }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: draggableId,
    data: { type, item, variant },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="touch-none"
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.3 : 1,
        transition: isDragging ? undefined : 'opacity 0.15s ease',
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
    >
      <CalendarEventChip
        type={type}
        item={item}
        variant={variant}
        showAvatar={showAvatar}
        maxLines={2}
        onClick={isDragging ? undefined : onClick}
      />
    </div>
  );
}

function DroppableCell({ dayKey, inMonth, idx, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey });
  return (
    <div
      ref={setNodeRef}
      className={`
        min-h-28 min-w-0 border-b border-r border-outline-variant/20 p-1 flex flex-col transition-colors
        ${!inMonth ? 'bg-surface-container/30' : ''}
        ${idx % 7 === 0 ? 'border-l' : ''}
        ${isOver ? 'bg-primary/10 ring-1 ring-inset ring-primary/30' : ''}
      `}
    >
      {children}
    </div>
  );
}

export default function MonthView({
  date, tasks, events, isShared,
  onTaskClick, onEventClick, onDayClick, onEventCreate, onItemMove,
  upcomingItems = [],
}) {
  const [activeData, setActiveData] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const cells = useMemo(() => {
    const monthStart = startOfMonth(date);
    const monthEnd   = endOfMonth(date);
    const start = startOfWeek(monthStart, { weekStartsOn: 1 });
    const end   = endOfWeek(monthEnd,     { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [date]);

  const byDate = useMemo(
    () => groupByDate(tasks, events),
    [tasks, events],
  );

  function handleDragStart({ active }) {
    setActiveData(active.data.current ?? null);
  }

  function handleDragEnd({ active, over }) {
    setActiveData(null);
    if (!over || !active.data.current) return;
    // Month view drops are date-only strings (no time component)
    onItemMove?.({ ...active.data.current, newDatetime: over.id });
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex-1 overflow-auto flex gap-4">
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Weekday headers + day grid share one white card */}
        <div className="flex-1 min-h-0 flex flex-col bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-soft overflow-hidden">
        <div className="grid grid-cols-7 border-b border-outline-variant/20 shrink-0">
          {WEEKDAYS.map(d => (
            <div key={d} className="py-2 text-center text-xs font-label-sm text-on-surface-variant tracking-wide">
              {d}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 flex-1">
          {cells.map((day, idx) => {
            const key      = dateKey(day);
            const entries  = byDate[key] ?? [];
            const inMonth  = isSameMonth(day, date);
            const today    = isToday(day);
            const visible  = entries.slice(0, MAX_VISIBLE);
            const overflow = entries.length - MAX_VISIBLE;

            return (
              <DroppableCell key={key} dayKey={key} inMonth={inMonth} idx={idx}>
                {/* Date number */}
                <button
                  onClick={() => onDayClick(key)}
                  className={`
                    self-start w-7 h-7 flex items-center justify-center rounded-full text-xs font-medium mb-1 transition
                    ${today
                      ? 'bg-primary text-on-primary'
                      : inMonth
                        ? 'text-on-surface hover:bg-surface-container'
                        : 'text-on-surface-variant/50'
                    }
                  `}
                >
                  {format(day, 'd')}
                </button>

                {/* Events / tasks */}
                <div className="flex flex-col gap-0.5 flex-1">
                  {visible.map(({ type, item, variant }, i) => (
                    <DraggableChip
                      key={`${type}-${item.id}-${variant ?? ''}-${i}`}
                      draggableId={`month-${variant ?? 'x'}-${type}-${item.id}`}
                      type={type}
                      item={item}
                      variant={variant}
                      showAvatar={isShared}
                      onClick={() => type === 'event' ? onEventClick(item) : onTaskClick(item)}
                    />
                  ))}
                  {overflow > 0 && (
                    <button
                      onClick={() => onDayClick(key)}
                      className="text-[10px] text-primary font-medium pl-2 text-left hover:underline"
                    >
                      +{overflow} more
                    </button>
                  )}
                </div>

                {/* Click empty area to create event — always faintly visible (not
                    hover-only) so it's discoverable on touch devices too, and
                    brightens on hover/focus for pointer users. */}
                <button
                  className="mt-auto h-4 w-full opacity-30 hover:opacity-100 focus-visible:opacity-100 transition-opacity flex items-center justify-center"
                  onClick={() => onEventCreate(key)}
                  title="New event"
                >
                  <span className="material-symbols-outlined text-[12px] text-primary">add</span>
                </button>
              </DroppableCell>
            );
          })}
        </div>
        </div>
      </div>

      <div className="hidden lg:flex flex-col gap-4">
        <UpNextRail items={upcomingItems} onItemClick={(it) => onDayClick(it.dateStr)} />
        <QuickAddTask />
      </div>
      </div>

      <DragOverlay dropAnimation={{ duration: 160, easing: 'cubic-bezier(0.18,0.67,0.6,1.22)' }}>
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
