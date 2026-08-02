// Shared time-of-day formatting for Calendar and Routines displays.

/** "2026-07-06T09:00" → "9:00 AM". Returns '' for date-only strings (no time component). */
export function formatTime(dateTimeStr) {
  if (!dateTimeStr || !dateTimeStr.includes('T')) return '';
  const timePart = dateTimeStr.split('T')[1] ?? '';
  return formatHHMM(timePart);
}

/** "09:00" (24h) → "9:00 AM". */
export function formatHHMM(hhmm) {
  if (!hhmm) return '';
  const [hStr, mStr] = hhmm.split(':');
  let h = parseInt(hStr, 10);
  if (Number.isNaN(h)) return '';
  const m = (mStr ?? '00').padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

export function hasTimeComponent(dateTimeStr) {
  return !!dateTimeStr && dateTimeStr.includes('T');
}
