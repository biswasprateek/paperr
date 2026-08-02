// Builds a cumulative pixel-offset map for an hour grid that has fixed-height
// "divider" rows inserted before certain hours (e.g. habit time-of-day
// sections). The grid's own rows and anything absolutely-positioned on top
// of it (timed items, the now-line) must both read from this same map, or
// they drift apart the moment a divider is inserted.
export function buildHourOffsets(visibleHours, dividerHours, dividerHeight, hourHeight) {
  const dividerSet = new Set(dividerHours);
  const offsetForHour = {};
  let acc = 0;
  for (const h of visibleHours) {
    if (dividerSet.has(h)) acc += dividerHeight;
    offsetForHour[h] = acc;
    acc += hourHeight;
  }
  return { offsetForHour, totalHeight: acc };
}

export function minutesToTop(minutes, offsetForHour, hourHeight, fallbackStartHour) {
  const hour = Math.floor(minutes / 60);
  const frac = (minutes % 60) / 60;
  const base = offsetForHour[hour] ?? ((hour - fallbackStartHour) * hourHeight);
  return base + frac * hourHeight;
}

// A timed item that starts less than `safePx` above a divider it spans across
// renders its header (icon/time/title) right where the divider band paints —
// since the band sits above items (so its own habit checkboxes stay clickable),
// that header becomes invisible. This returns how far to push the item's inner
// content down so its header clears the first such divider, or 0 if there's
// already enough room (or no divider in range).
export function contentPadForDivider(itemTop, minutes, endMinutes, offsetForHour, dividerHours, dividerHeight, safePx = 32) {
  for (const dh of [...dividerHours].sort((a, b) => a - b)) {
    if (dh * 60 <= minutes || dh * 60 >= endMinutes) continue;
    const dividerTop = offsetForHour[dh] - dividerHeight;
    return (dividerTop - itemTop < safePx) ? Math.max(0, offsetForHour[dh] - itemTop) : 0;
  }
  return 0;
}
