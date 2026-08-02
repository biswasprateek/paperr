import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useUiStore } from '../store/uiStore';

const OPTIONS = [
  { type: 'task',    label: 'Task',    icon: 'assignment' },
  { type: 'event',   label: 'Event',   icon: 'event' },
  { type: 'project', label: 'Project', icon: 'folder_copy' },
  { type: 'list',    label: 'List',    icon: 'list' },
];

// variant: 'fab' (phone floating button) | 'icon' (desktop header icon)
export default function QuickCreateButton({ variant = 'icon' }) {
  const { setQuickCreate } = useUiStore();
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const isFab = variant === 'fab';

  function openMenu() {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      if (isFab) {
        setMenuPos({
          bottom: window.innerHeight - rect.top + 8,
          right: window.innerWidth - rect.right,
          top: 'auto',
        });
      } else {
        setMenuPos({
          top: rect.bottom + 8,
          right: window.innerWidth - rect.right,
          bottom: 'auto',
        });
      }
    }
    setOpen(o => !o);
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (
        btnRef.current && !btnRef.current.contains(e.target) &&
        menuRef.current && !menuRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function select(type) {
    setOpen(false);
    setQuickCreate(type);
  }

  return (
    <div>
      <button
        ref={btnRef}
        onClick={openMenu}
        title="Create new…"
        aria-label="Create new item"
        className={
          isFab
            ? `w-16 h-16 bg-primary text-on-primary rounded-full shadow-heavy flex items-center justify-center transition-transform duration-200 ${open ? 'rotate-45' : ''}`
            : `h-12 w-12 rounded-full flex items-center justify-center hover:bg-surface-variant text-on-surface-variant flex-shrink-0 transition-[background-color,transform] duration-150 active:scale-[0.97] ${open ? 'bg-surface-variant' : ''}`
        }
      >
        <span className="material-symbols-outlined text-[22px]">add</span>
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: menuPos.top !== 'auto' ? menuPos.top : undefined,
            bottom: menuPos.bottom !== 'auto' ? menuPos.bottom : undefined,
            right: menuPos.right,
            zIndex: 9999,
          }}
          className="flex flex-col gap-1 p-2 bg-surface-container-lowest rounded-2xl shadow-heavy border border-outline-variant/20 min-w-[140px]"
        >
          {OPTIONS.map(({ type, label, icon }) => (
            <button
              key={type}
              onClick={() => select(type)}
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-surface-container transition text-left w-full"
            >
              <span className="material-symbols-outlined text-primary text-[20px]">{icon}</span>
              <span className="text-on-surface font-body-md">{label}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
