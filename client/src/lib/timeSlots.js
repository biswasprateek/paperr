import { TIME_SLOTS } from '../pages/routines/shared';

// Re-exported so Good Thoughts stays in lockstep with routines' slot
// definitions rather than maintaining its own copy.
export { TIME_SLOTS };

// Hour-of-day → time slot bucket, following the same early_morning → morning
// → afternoon → evening → night ordering TIME_SLOTS declares. Used to
// auto-filter time-scheduled collections to the current part of the day.
export function currentTimeSlot(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return 'night';
  if (h < 8) return 'early_morning';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 21) return 'evening';
  return 'night';
}
