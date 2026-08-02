import { useState, useEffect } from 'react';

// Generic activity-based idle detector. Resets on mousemove/keydown/touchstart/
// scroll; `isIdle` flips true once `ms` elapses with no activity. Pass a
// falsy `ms` (0/null) to disable the timer entirely (idle never fires).
export function useIdleTimer(ms) {
  const [isIdle, setIsIdle] = useState(false);

  useEffect(() => {
    if (!ms) {
      setIsIdle(false);
      return;
    }

    let timer;
    const reset = () => {
      setIsIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIsIdle(true), ms);
    };
    reset();

    const events = ['mousemove', 'keydown', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, reset));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [ms]);

  return isIdle;
}
