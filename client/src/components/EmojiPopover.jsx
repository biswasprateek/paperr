import React, { useState, useEffect, useRef } from 'react';
import EmojiPicker from 'emoji-picker-react';
import { useUiStore } from '../store/uiStore';

const DEFAULT_BUTTON_CLASS =
  'w-12 h-12 rounded-xl text-2xl flex items-center justify-center bg-surface-container-high hover:bg-surface-container border border-outline-variant/40 transition-colors';

export default function EmojiPopover({
  value, onChange, placeholderIcon = 'sentiment_satisfied', buttonClassName, allowClear = false, title,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const appTheme = useUiStore(s => s.theme);

  const pickerTheme = appTheme === 'dark'
    ? 'dark'
    : appTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        className={buttonClassName || DEFAULT_BUTTON_CLASS}
        title={title}
      >
        {value || <span className="material-symbols-outlined text-on-surface-variant/50 text-[20px]">{placeholderIcon}</span>}
      </button>
      {allowClear && value && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onChange(''); }}
          aria-label="Remove emoji"
          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-surface-container-highest border border-outline-variant/40 flex items-center justify-center text-on-surface-variant hover:text-error transition-colors"
        >
          <span className="material-symbols-outlined text-[10px]">close</span>
        </button>
      )}
      {open && (
        <div className="absolute left-0 top-14 z-50 shadow-heavy rounded-xl overflow-hidden">
          <EmojiPicker
            onEmojiClick={(data) => { onChange(data.emoji); setOpen(false); }}
            height={350}
            width={300}
            theme={pickerTheme}
            lazyLoadEmojis
          />
        </div>
      )}
    </div>
  );
}
