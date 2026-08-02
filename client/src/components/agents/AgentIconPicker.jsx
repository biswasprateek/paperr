import React, { useState, useRef, useEffect } from 'react';
import EmojiPicker from 'emoji-picker-react';
import { useUiStore } from '../../store/uiStore';

// Emoji button + popover for the custom agent's icon, matching the pattern
// used for project icons (ProjectFormModal's EmojiPopover).
export default function AgentIconPicker({ value, onChange }) {
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
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(p => !p)}
        className="w-12 h-12 rounded-xl text-2xl flex items-center justify-center bg-surface-container-high hover:bg-surface-container border border-outline-variant/40 transition-colors"
      >
        {value || '🤖'}
      </button>
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
