import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * PillSelect — a pill-shaped custom select that portals its dropdown to
 * `document.body` so it is never clipped by an ancestor's `overflow` rule.
 *
 * Props:
 *   icon        — Material Symbols name shown as a leading icon (optional)
 *   value       — controlled value (string)
 *   onChange    — (value: string) => void
 *   options     — { value: string, label: string }[]
 *   placeholder — string shown when no option is selected (value === '')
 *   className   — extra classes on the trigger button (optional)
 */
export default function PillSelect({ icon, value, onChange, options, placeholder = 'Select…', className = '', disabled = false }) {
  const [open,    setOpen]    = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef  = useRef(null);
  const selectedRef = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (triggerRef.current && !triggerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Long option lists (e.g. times) start scrolled to the current selection
  // instead of always at the top.
  useEffect(() => {
    if (open) selectedRef.current?.scrollIntoView({ block: 'center' });
  }, [open]);

  const handleToggle = () => {
    if (disabled) return;
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    setOpen(v => !v);
  };

  const selected = options.find(o => String(o.value) === String(value));
  const label    = selected ? selected.label : placeholder;
  const isEmpty  = !selected || selected.value === '';

  return (
    <div ref={triggerRef} className="w-full">
      {/* Pill trigger */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={`bg-surface-container rounded-full flex items-center px-4 h-12 w-full outline-none border border-transparent hover:border-primary focus-visible:ring-2 focus-visible:ring-primary/70 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-transparent ${className}`}
      >
        {icon && (
          <span className="material-symbols-outlined text-on-surface-variant/50 mr-2 text-[20px] flex-shrink-0">
            {icon}
          </span>
        )}
        <span className={`flex-1 text-left text-body-md font-light tracking-wide truncate ${isEmpty ? 'text-on-surface-variant/50' : 'text-on-surface'}`}>
          {label}
        </span>
        <span className={`material-symbols-outlined text-on-surface-variant/50 text-[18px] ml-1 flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}>
          expand_more
        </span>
      </button>

      {/* Dropdown — rendered in a portal so no overflow clip ever applies */}
      {open && createPortal(
        <div
          style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, width: dropPos.width, zIndex: 9999 }}
          className="bg-surface-container-lowest rounded-2xl shadow-heavy border border-outline-variant/20 overflow-y-auto max-h-72"
        >
          {options.map(o => {
            const isSelected = String(o.value) === String(value);
            return (
            <button
              key={o.value}
              ref={isSelected ? selectedRef : undefined}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault(); // prevent blur-before-click race
                onChange(String(o.value));
                setOpen(false);
              }}
              className={`w-full text-left px-4 py-2.5 text-body-md font-light transition-colors ${
                isSelected
                  ? 'text-primary bg-primary/5 font-medium'
                  : 'text-on-surface hover:bg-surface-container'
              }`}
            >
              {o.label}
            </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
