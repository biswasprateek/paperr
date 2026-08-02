import React, { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSpaceStore } from '../store/spaceStore';

// Click-anchored space switcher — trigger button plus a dropdown card. Shared
// by the desktop and tablet shells so both look and behave identically; the
// phone shell uses SpacePickerSheet (a touch bottom sheet) instead.
export default function SpacePicker({ onCreateSpace, onEditSpace }) {
  const { spaces, currentSpace, switchSpace } = useSpaceStore();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSwitch = (spaceId) => {
    switchSpace(spaceId);
    queryClient.clear();
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 h-12 px-3 rounded-xl hover:bg-surface-container transition-colors"
      >
        <span className="text-xl leading-none">{currentSpace?.icon || '🏠'}</span>
        <span className="text-body-md font-medium text-on-surface max-w-[140px] truncate">
          {currentSpace?.name || 'Select space'}
        </span>
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {open && (
        <div className="absolute top-full mt-2 right-0 w-72 bg-surface-container-lowest rounded-2xl shadow-heavy border border-outline-variant/20 py-2 z-50">
          <p className="text-label-sm uppercase tracking-widest text-on-surface-variant/60 font-bold px-4 pt-2 pb-1">
            Your Spaces
          </p>
          {spaces.map(space => (
            <div
              key={space.id}
              className={`flex items-center gap-1 transition-colors hover:bg-primary/5
                ${space.id === currentSpace?.id ? 'text-primary' : 'text-on-surface'}`}
            >
              <button
                onClick={() => handleSwitch(space.id)}
                className="flex-1 flex items-center gap-3 py-2.5 pl-4 text-left min-w-0"
              >
                <span className="text-xl leading-none">{space.icon}</span>
                <div className="flex-1 min-w-0">
                  <span className="block text-body-md truncate">{space.name}</span>
                  <span className="block text-label-sm text-on-surface-variant/70 capitalize">{space.type}</span>
                </div>
                {space.id === currentSpace?.id && (
                  <span className="material-symbols-outlined text-[16px] text-primary">check</span>
                )}
              </button>
              <button
                onClick={() => { onEditSpace(space); setOpen(false); }}
                className="w-8 h-8 mr-1 flex items-center justify-center rounded-full hover:bg-surface-container text-on-surface-variant/40 hover:text-on-surface transition-colors flex-shrink-0"
                aria-label="Edit space"
              >
                <span className="material-symbols-outlined text-[15px]">edit</span>
              </button>
            </div>
          ))}
          <div className="border-t border-outline-variant/20 mt-1 pt-1">
            <button
              onClick={() => { onCreateSpace(); setOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-on-surface-variant hover:bg-surface-container transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">add_circle</span>
              <span className="text-body-md">Create new space</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
