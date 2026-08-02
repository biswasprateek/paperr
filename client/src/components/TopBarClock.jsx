import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';

// Live clock + date, shown in the desktop and tablet top bars.
export default function TopBarClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-3 pl-3 select-none">
      {/* Divider */}
      <div className="w-px h-8 bg-outline-variant/40" />
      <div className="flex flex-col items-center leading-tight">
        <span className="text-label-md text-on-surface-variant whitespace-nowrap">
          {format(now, 'EEEE, MMM d')}
        </span>
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-headline-md text-on-surface font-bold tabular-nums">
            {format(now, 'hh:mm')}
          </span>
          <div className="flex flex-col leading-none">
            <span className="text-label-sm text-primary font-bold">
              {format(now, 'a')}
            </span>
            <span className="text-label-sm text-on-surface-variant tabular-nums">
              {format(now, 'ss')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
