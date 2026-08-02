import React, { useEffect } from 'react';

/**
 * Shared touch-first bottom sheet — backdrop + slide-up panel with a drag
 * handle. Used by the phone space picker, the tablet sheets, and the widget
 * drawer so sheet styling stays consistent across the touch shells.
 *
 * Props:
 *  - open: boolean
 *  - onClose: () => void
 *  - title?: string            optional header label
 *  - children: sheet body
 *  - maxHeight?: string        defaults to '85vh'
 */
export default function BottomSheet({ open, onClose, title, children, maxHeight = '85vh' }) {
  // Close on Escape and lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 animate-[fadeIn_150ms_ease-out]"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className="absolute bottom-0 left-0 right-0 bg-surface rounded-t-3xl shadow-heavy
                   flex flex-col animate-[slideUp_220ms_cubic-bezier(0.22,1,0.36,1)]"
        style={{ maxHeight }}
      >
        {/* Grab handle */}
        <div className="pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1.5 bg-outline-variant/50 rounded-full mx-auto" />
        </div>

        {title && (
          <div className="px-5 pt-1 pb-2 flex-shrink-0">
            <h2 className="text-headline-md text-on-surface">{title}</h2>
          </div>
        )}

        {/* Scrollable body — pb-safe keeps content clear of the home indicator */}
        <div className="overflow-y-auto px-1 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  );
}
