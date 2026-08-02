import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSpaceStore } from '../store/spaceStore';
import BottomSheet from './BottomSheet';

// Touch-first space switcher — a trigger button plus a bottom sheet listing the
// user's spaces. Shared by the phone and tablet shells.
// onCreateSpace / onEditSpace are lifted to the layout so the modal renders
// outside any stacking context created by the header's backdrop-filter.
export default function SpacePickerSheet({
  triggerClassName = 'flex items-center gap-1.5 px-3 h-full',
  onCreateSpace,
  onEditSpace,
}) {
  const { spaces, currentSpace, switchSpace } = useSpaceStore();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const handleSwitch = (spaceId) => {
    switchSpace(spaceId);
    queryClient.clear();
    setOpen(false);
  };

  const handleCreate = () => {
    setOpen(false);
    onCreateSpace?.();
  };

  const handleEdit = (space) => {
    setOpen(false);
    onEditSpace?.(space);
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className={triggerClassName}>
        <span className="text-lg leading-none">{currentSpace?.icon || '🏠'}</span>
        <span className="text-body-md font-medium text-on-surface max-w-[140px] truncate">
          {currentSpace?.name || 'Select space'}
        </span>
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant">expand_more</span>
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)}>
        <p className="text-label-sm uppercase tracking-widest text-on-surface-variant/60 font-bold px-5 pb-2">
          Your Spaces
        </p>
        {spaces.map(space => (
          <div
            key={space.id}
            className={`flex items-center gap-1 transition-colors ${
              space.id === currentSpace?.id ? 'text-primary' : 'text-on-surface'
            }`}
          >
            <button
              onClick={() => handleSwitch(space.id)}
              className="flex-1 flex items-center gap-3 px-5 py-3.5 text-left active:bg-surface-container"
            >
              <span className="text-2xl">{space.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-body-md truncate">{space.name}</p>
                <p className="text-label-sm text-on-surface-variant capitalize">{space.type}</p>
              </div>
              {space.id === currentSpace?.id && (
                <span className="material-symbols-outlined text-[18px] text-primary">check</span>
              )}
            </button>
            {onEditSpace && (
              <button
                onClick={() => handleEdit(space)}
                className="w-10 h-10 mr-3 flex items-center justify-center rounded-full hover:bg-surface-container text-on-surface-variant/40 hover:text-on-surface transition-colors flex-shrink-0"
                aria-label="Edit space"
              >
                <span className="material-symbols-outlined text-[18px]">edit</span>
              </button>
            )}
          </div>
        ))}
        <div className="border-t border-outline-variant/20 mt-2 pt-2 px-5">
          <button
            onClick={handleCreate}
            className="flex items-center gap-3 text-on-surface-variant py-3 active:bg-surface-container w-full rounded-xl px-3 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">add_circle</span>
            <span className="text-body-md">Create new space</span>
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
