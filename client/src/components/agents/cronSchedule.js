// Translates between a friendly { frequency, time, days } shape and the
// 5-field cron strings the scheduler understands. Only covers what the
// dropdown UI can express — daily, or weekly on one or more weekdays —
// which is all the built-in agents and any reasonable custom schedule need.
export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function cronToSchedule(expr) {
  const fallback = { frequency: 'daily', time: '08:00', days: [1] };
  if (typeof expr !== 'string') return fallback;
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return fallback;
  const [min, hour, dom, month, dow] = parts;
  if (dom !== '*' || month !== '*') return fallback; // not expressible in this UI

  const m = parseInt(min, 10);
  const h = parseInt(hour, 10);
  if (Number.isNaN(m) || Number.isNaN(h)) return fallback;
  const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  if (dow === '*') return { frequency: 'daily', time, days: [1] };

  const days = dow.split(',').map(d => parseInt(d, 10)).filter(d => !Number.isNaN(d) && d >= 0 && d <= 6);
  if (!days.length) return fallback;
  return { frequency: 'weekly', time, days };
}

export function scheduleToCron({ frequency, time, days }) {
  const [hour, min] = (time || '08:00').split(':').map(s => parseInt(s, 10));
  const h = Number.isNaN(hour) ? 8 : hour;
  const m = Number.isNaN(min) ? 0 : min;
  if (frequency === 'daily') return `${m} ${h} * * *`;
  const dowList = (days?.length ? days : [1]).slice().sort((a, b) => a - b).join(',');
  return `${m} ${h} * * ${dowList}`;
}
