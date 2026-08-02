import React from 'react';
import { useNavigate } from 'react-router-dom';
import BottomSheet from './BottomSheet';
import { PHONE_MORE_ITEMS } from '../modes/navItems';

// Settings isn't in NAV_ITEMS (each layout wires it up specially — tablet/
// desktop via the avatar button), so it's appended here manually rather than
// via PHONE_MORE_ITEMS, which would also need touching NAV_ITEMS itself.
const SETTINGS_ITEM = { to: '/settings', label: 'Settings', icon: 'settings' };

// Phone-only "More" sheet — lists every primary page that doesn't fit in the
// bottom nav's 5 tabs, so nothing is reachable only via a Home widget.
export default function MoreMenuSheet({ open, onClose }) {
  const navigate = useNavigate();

  const go = (to) => {
    onClose();
    navigate(to);
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="More">
      {[...PHONE_MORE_ITEMS, SETTINGS_ITEM].map((item) => (
        <button
          key={item.to}
          onClick={() => go(item.to)}
          className="w-full flex items-center gap-4 px-5 py-3.5 text-left active:bg-surface-container transition-colors"
        >
          <span className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-[19px]">{item.icon}</span>
          </span>
          <span className="text-body-md text-on-surface">{item.label}</span>
        </button>
      ))}
    </BottomSheet>
  );
}
