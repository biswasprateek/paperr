import { useState, useEffect } from 'react';

const MODE_KEY = 'paperr_mode';

// Width band (px) below which a touch device is treated as a phone; the band
// up to TABLET_MAX is treated as a tablet. Above that → desktop.
const PHONE_MAX  = 768;
const TABLET_MAX = 1280;

function isTouchDevice() {
  return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
}

function detectMode() {
  const stored = localStorage.getItem(MODE_KEY);
  if (stored === 'phone' || stored === 'tablet' || stored === 'desktop') return stored;

  const w = window.innerWidth;
  if (isTouchDevice()) {
    if (w < PHONE_MAX)  return 'phone';
    if (w < TABLET_MAX) return 'tablet';
  }
  return 'desktop';
}

// Shared helper — the touch-first design system (shell + widget Home + page
// variants) is used by both phone and tablet. Desktop keeps the classic layout.
export function isTouchMode(mode) {
  return mode === 'phone' || mode === 'tablet';
}

export function useMode() {
  const [mode, setModeState] = useState(detectMode);

  const setMode = (newMode) => {
    localStorage.setItem(MODE_KEY, newMode);
    setModeState(newMode);
  };

  useEffect(() => {
    const handleResize = () => {
      const stored = localStorage.getItem(MODE_KEY);
      if (!stored) {
        setModeState(detectMode());
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return { mode, setMode, isTouch: isTouchMode(mode) };
}
