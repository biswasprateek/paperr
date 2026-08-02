import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Header icon chip tint, keyed off the accent text class the widget passes
// (Overdue sends text-error only while it actually has overdue items).
function chipClasses(accent) {
  if (accent === 'text-error') return 'bg-error/10 text-error';
  if (accent === 'text-on-surface-variant') return 'bg-surface-container text-on-surface-variant';
  return 'bg-primary/10 text-primary';
}

/**
 * Common chrome for every Home widget — a rounded card that fills its grid
 * cell, with a header (icon chip + Title Case title + optional count badge)
 * that navigates to the widget's source page, and a genuinely scrollable body
 * with a thin scrollbar and a bottom fade hint while content overflows. In
 * edit mode the header tap is disabled so the card can be dragged instead.
 */
export default function WidgetShell({ icon, emoji, title, source, editing, accent, count, children, footer }) {
  const navigate = useNavigate();
  const clickable = source && !editing;

  const bodyRef = useRef(null);
  const [overflowing, setOverflowing] = useState(false);

  // No dep array on purpose: content height changes whenever the widget's
  // data renders, and a scrollHeight read per render is cheap. The observer
  // additionally catches pure container resizes (grid cell resize).
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const check = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  });

  return (
    // Hover lift lives on the board's cell wrapper (WidgetBoard), not here,
    // so custom-chromed widgets (Weather, Welcome, Frame…) rise exactly
    // like shell-based ones.
    <div className="h-full flex flex-col bg-surface-container-lowest rounded-2xl shadow-soft border border-outline-variant/20 overflow-hidden">
      <button
        type="button"
        disabled={!clickable}
        onClick={clickable ? () => navigate(source) : undefined}
        className={`flex items-center gap-2.5 px-4 pt-3 pb-2 flex-shrink-0 text-left
          ${clickable ? 'hover:text-primary transition-colors cursor-pointer' : 'cursor-default'}`}
      >
        {(icon || emoji) && (
          <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${chipClasses(accent)}`}>
            {emoji
              ? <span className="text-[15px] leading-none">{emoji}</span>
              : <span className="material-symbols-outlined text-[16px]">{icon}</span>}
          </span>
        )}
        <span className="text-body-md font-semibold text-on-surface flex-1 truncate">
          {title}
        </span>
        {count != null && count !== '' && (
          <span className="text-label-sm font-bold text-on-surface-variant bg-surface-container rounded-full px-2 py-0.5 tabular-nums flex-shrink-0">
            {count}
          </span>
        )}
        {clickable && (
          <span className="material-symbols-outlined text-[16px] text-on-surface-variant/50">chevron_right</span>
        )}
      </button>

      <div className="relative flex-1 min-h-0">
        <div ref={bodyRef} className="h-full overflow-y-auto scrollbar-slim px-4 pb-3">
          {children}
        </div>
        {overflowing && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-1.5 h-6 bg-gradient-to-b from-transparent to-surface-container-lowest" />
        )}
      </div>

      {footer && (
        <div className="px-4 py-2 border-t border-outline-variant/20 flex-shrink-0">{footer}</div>
      )}
    </div>
  );
}

// Shared empty-state used by several widgets.
export function WidgetEmpty({ icon = 'check_circle', label }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-on-surface-variant py-4">
      <span className="material-symbols-outlined text-2xl mb-1">{icon}</span>
      <p className="text-label-md text-center">{label}</p>
    </div>
  );
}
