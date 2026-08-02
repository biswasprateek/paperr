import React from 'react';
import { formatTime } from '../../utils/time';

// Left-bar + text color per item type. Events fall back to this unless the
// event has its own custom `colour`, which overrides via inline style below.
const TYPE_COLORS = {
  milestone: 'bg-tertiary/14 text-tertiary border-tertiary',
  event:     'bg-secondary/14 text-secondary border-secondary',
  task:      'bg-primary/14 text-primary border-primary',
  subtask:   'bg-primary/14 text-primary border-primary',
};

const TYPE_ICONS = {
  milestone: 'flag',
  event:     'event',
  task:      'assignment',
  subtask:   'subdirectory_arrow_right',
};

// `variant` distinguishes a task's two calendar faces: 'deadline' (all-day chip on
// its due_date) vs 'block' (a scheduled start_at–end_at time block). Events ignore it.
// `fill` renders the chip as a duration-height block (Day/Week timed items) that
// fills its absolutely-positioned wrapper, vs. a natural-height compact chip.
// `maxLines`, when set, caps the whole chip at 2 lines total: the icon/time header
// row costs 1, so the title clamps to 1 more (with an ellipsis) instead of wrapping
// freely — used in cramped contexts like Month view cells.
export default function CalendarEventChip({ item, type, onClick, showAvatar = false, variant, fill = false, maxLines, contentTopPad = 0 }) {
  let colorClass = TYPE_COLORS[type] ?? TYPE_COLORS.task;
  let icon = TYPE_ICONS[type];
  let overdue = false;
  let highPriority = false;

  if (type === 'task' || type === 'subtask') {
    if (item.is_completed) {
      colorClass = 'bg-surface-container text-on-surface-variant border-outline-variant line-through';
    } else {
      const today = new Date().toISOString().split('T')[0];
      // "Overdue" is a deadline concept — never flag a scheduled time block as overdue.
      overdue = variant !== 'block' && !!item.due_date && item.due_date.split('T')[0] < today;
      highPriority = item.priority === 'high' || item.priority === 'urgent';

      // Overdue gets its own glyph (not just a red tint) so it can't be mistaken
      // for a custom event colour that happens to also be red.
      if (overdue) {
        colorClass = 'bg-error-container/70 text-error border-error';
        icon = 'warning';
      }
    }
  }

  // Custom colour for events overrides the default type styling above.
  const inlineStyle = (type === 'event' && item.colour)
    ? { backgroundColor: item.colour + '22', color: item.colour, borderColor: item.colour }
    : undefined;

  const avatarUser = item.assignee_colour || item.avatar_colour;

  const timeStr = type === 'event'
    ? (item.all_day ? 'All day'
        : item.end_datetime ? `${formatTime(item.start_datetime)}–${formatTime(item.end_datetime)}`
        : formatTime(item.start_datetime))
    : (variant === 'block' && !item.is_completed
        ? (item.end_at ? `${formatTime(item.start_at)}–${formatTime(item.end_at)}` : formatTime(item.start_at))
        : '');

  // Deadline chips read "Task Deadline: <title>"; scheduled blocks read "Task: <title>"
  // (or "Subtask:"/"Event:") so every calendar face is unmistakable at a glance.
  const baseTitle = item.title ?? item.name;
  const displayTitle = type === 'task' && variant === 'deadline' ? `Task Deadline: ${baseTitle}`
    : type === 'task'    && variant === 'block' ? `Task: ${baseTitle}`
    : type === 'subtask' && variant === 'block' ? `Subtask: ${baseTitle}`
    : type === 'event' ? `Event: ${baseTitle}`
    : baseTitle;

  // Hover tooltip repeats the time range alongside the title, since the chip
  // itself may truncate or (in the compact, non-fill layout) omit it.
  const tooltip = timeStr ? `${displayTitle} (${timeStr})` : displayTitle;

  // When there's a time to show, it gets its own header row above the title
  // (so the title always has the chip's full width to wrap into). Without a
  // time, the icon just sits inline with the title and wraps alongside it.
  return (
    <button
      onClick={onClick}
      title={tooltip}
      className={`
        w-full text-left flex flex-col gap-0.5 min-w-0
        rounded-md border-l-[3px] pl-1.5 pr-2 text-xs font-medium overflow-hidden
        ${fill ? 'h-full py-1' : 'py-0.5'}
        ${colorClass}
        hover:opacity-80 transition-opacity
        ${type === 'subtask' && !fill ? 'ml-2' : ''}
      `}
      style={contentTopPad ? { ...inlineStyle, paddingTop: contentTopPad } : inlineStyle}
    >
      {timeStr ? (
        <>
          {/* This header row always costs 1 line, so `maxLines` (a total budget for
              the whole chip) leaves the title exactly 1 more line to itself. */}
          <div className="flex items-center gap-1.5 min-w-0 w-full shrink-0">
            <span className="material-symbols-outlined text-[11px] shrink-0">
              {icon}
            </span>
            <time className="shrink-0 font-bold tabular-nums opacity-80 text-[10px]">{timeStr}</time>
            {highPriority && (
              <span className="w-1.5 h-1.5 rounded-full bg-error shrink-0" title="High priority" />
            )}
            {showAvatar && avatarUser && (
              <span
                className="ml-auto w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: avatarUser }}
              />
            )}
          </div>
          <span className={`leading-snug break-words ${maxLines ? 'line-clamp-1' : ''}`}>
            {displayTitle}
          </span>
        </>
      ) : (
        // No time to show (e.g. a deadline) — the icon sits inline with the title
        // and wraps together with it, rather than claiming a line of its own.
        <div className="flex items-start gap-1.5 min-w-0 w-full">
          <span className="material-symbols-outlined text-[11px] shrink-0 mt-0.5">
            {icon}
          </span>
          <span className={`leading-snug break-words flex-1 min-w-0 ${maxLines === 2 ? 'line-clamp-2' : maxLines === 1 ? 'line-clamp-1' : ''}`}>
            {displayTitle}
          </span>
          {highPriority && (
            <span className="w-1.5 h-1.5 rounded-full bg-error shrink-0 mt-1" title="High priority" />
          )}
          {showAvatar && avatarUser && (
            <span
              className="w-3 h-3 rounded-full shrink-0 mt-0.5"
              style={{ backgroundColor: avatarUser }}
            />
          )}
        </div>
      )}
    </button>
  );
}
