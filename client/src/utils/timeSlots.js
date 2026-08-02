import { TIME_SLOTS } from '../pages/routines/shared';

export { TIME_SLOTS };

// The hour-of-day each time-of-day block begins, for interleaving its
// section divider into the Calendar's hour grid at the right spot.
export const SLOT_START_HOUR = {
  early_morning: 6,
  morning: 8,
  afternoon: 12,
  evening: 17,
  night: 21,
};

/** Group a flat list of habit occurrences by time_slot, in TIME_SLOTS order. */
export function groupBySlot(habits) {
  const map = Object.fromEntries(TIME_SLOTS.map(s => [s.key, []]));
  for (const h of habits) {
    const slot = map[h.time_slot] ? h.time_slot : 'morning';
    map[slot].push(h);
  }
  return map;
}
