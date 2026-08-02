import React, { useEffect, useMemo, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Flip-clock-styled time display. Each FlipUnit is a black card (hour pair or
// minute pair) with the split-flap look (seam line down the middle) but no
// flip transition — digits just swap directly on change.
//
// Sizing is driven by a single `height` number (px) rather than fixed presets
// so a caller with a resizable container (the Home widget) can shrink/grow
// the whole face continuously as its box resizes.
// ─────────────────────────────────────────────────────────────────────────────

const PRESET_HEIGHT = { sm: 64, md: 92, lg: 158 };

const FlipHalf = React.memo(function FlipHalf({ value, pos }) {
  return (
    <div
      className={`absolute inset-x-0 h-1/2 overflow-hidden bg-neutral-900 flex justify-center
        ${pos === 'top' ? 'top-0 rounded-t-[inherit] items-end' : 'bottom-0 rounded-b-[inherit] items-start'}`}
    >
      <span
        className="font-bold text-white leading-none tabular-nums select-none"
        style={{ transform: pos === 'top' ? 'translateY(50%)' : 'translateY(-50%)' }}
      >
        {value}
      </span>
    </div>
  );
});

const FlipUnit = React.memo(function FlipUnit({ value, height }) {
  const width = Math.round(height * 0.81);
  const fontSize = Math.round(height * 0.52);
  const radius = Math.max(6, Math.round(height * 0.16));

  const cardStyle = useMemo(() => ({
    width, height, fontSize, borderRadius: radius,
  }), [width, height, fontSize, radius]);

  return (
    <div
      className="relative bg-neutral-900 shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
      style={cardStyle}
    >
      <FlipHalf value={value} pos="top" />
      <FlipHalf value={value} pos="bottom" />

      {/* seam */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-px h-[2px] bg-black/60 z-30 pointer-events-none" />
      <div className="absolute inset-x-2.5 top-1/2 -translate-y-1/2 h-2.5 rounded-full bg-black/25 blur-[3px] z-20 pointer-events-none" />
    </div>
  );
});

/** Live clock ticker, self-correcting so seconds land on the real wall-clock
 * boundary instead of drifting (a plain `setInterval(1000)` slowly slips out
 * of phase and ends up skipping or doubling a tick, which reads as a stutter). */
function useTickingClock(paused) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (paused) return;
    let id;
    const schedule = () => {
      const delay = 1000 - (Date.now() % 1000);
      id = setTimeout(() => { setNow(new Date()); schedule(); }, delay);
    };
    schedule();
    return () => clearTimeout(id);
  }, [paused]);
  return now;
}

/**
 * Flip-clock time display. Pass `now` to render a fixed moment (e.g. an alarm
 * preview); otherwise it ticks a live, drift-free internal clock every second.
 * `height` (px) sizes the cards continuously; `size` is a shorthand preset.
 */
export default function FlipClock({ size = 'md', height, now: fixedNow, showSeconds = true, className = '' }) {
  const live = useTickingClock(!!fixedNow);
  const current = fixedNow || live;
  const unitHeight = Math.max(28, height || PRESET_HEIGHT[size] || PRESET_HEIGHT.md);

  const h24 = current.getHours();
  const h12 = ((h24 + 11) % 12) + 1;
  const hh = String(h12).padStart(2, '0');
  const mm = String(current.getMinutes()).padStart(2, '0');
  const ss = String(current.getSeconds()).padStart(2, '0');
  const meridiem = h24 >= 12 ? 'PM' : 'AM';

  const gap = Math.max(4, Math.round(unitHeight * 0.09));
  const badgeSize = Math.max(7, Math.round(unitHeight * 0.1));

  return (
    <div className={`inline-flex items-center select-none ${className}`} style={{ gap }}>
      <div className="relative">
        <FlipUnit value={hh} height={unitHeight} />
        <span
          className="absolute font-bold tracking-wider text-white/60 z-40 leading-none"
          style={{ top: unitHeight * 0.08, left: unitHeight * 0.09, fontSize: badgeSize }}
        >
          {meridiem}
        </span>
      </div>
      <FlipUnit value={mm} height={unitHeight} />
      {showSeconds && (
        <span
          className="font-bold tabular-nums text-on-surface-variant/60 self-end leading-none"
          style={{ fontSize: Math.max(9, Math.round(unitHeight * 0.12)), marginLeft: gap * 0.5, paddingBottom: unitHeight * 0.05 }}
        >
          {ss}
        </span>
      )}
    </div>
  );
}
