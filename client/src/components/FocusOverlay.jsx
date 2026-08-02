import React, { useEffect } from 'react';

/**
 * Fullscreen immersive overlay for focus/wellness apps (Breathe, Meditate).
 * Distinct from BottomSheet — this is a calm, edge-to-edge surface that fills
 * the viewport so the user can focus on the exercise without surrounding chrome.
 */
export default function FocusOverlay({ open, onClose, icon, title, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-surface flex flex-col animate-[fadeIn_200ms_ease-out]" role="dialog" aria-modal="true">
      <div className="flex items-center gap-2 px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-2 flex-shrink-0">
        {icon && <span className="material-symbols-outlined text-primary">{icon}</span>}
        <h2 className="text-headline-md text-on-surface flex-1">{title}</h2>
        <button onClick={onClose} aria-label="Close" className="w-10 h-10 rounded-full bg-surface-container text-on-surface flex items-center justify-center active:scale-95">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {children}
      </div>
    </div>
  );
}
