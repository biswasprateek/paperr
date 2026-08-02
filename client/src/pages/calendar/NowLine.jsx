import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { minutesToTop } from '../../utils/hourOffsets';

// Ticks once a minute so the line drifts forward during a long-open session,
// without re-rendering the whole time grid more often than that.
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * A thin marker line at the current time, for a single day column in a
 * Week/Day hour grid. Renders nothing unless `dayKey` is today and the
 * current time falls within the grid's visible [startHour, endHour) range.
 */
export default function NowLine({ dayKey, startHour, endHour, hourHeight, offsetForHour }) {
  const now = useNow();
  if (format(now, 'yyyy-MM-dd') !== dayKey) return null;

  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < startHour * 60 || minutes >= endHour * 60) return null;

  const top = offsetForHour
    ? minutesToTop(minutes, offsetForHour, hourHeight, startHour)
    : ((minutes - startHour * 60) / 60) * hourHeight;

  return (
    <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: `${top}px` }}>
      <div className="relative border-t-2 border-primary">
        <span className="absolute -left-[3px] -top-[5px] w-2 h-2 rounded-full bg-primary" />
      </div>
    </div>
  );
}
