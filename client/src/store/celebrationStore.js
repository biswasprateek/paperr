import { create } from 'zustand';
import { motionAllowed } from './uiStore';

const TYPES = ['confetti', 'emoji', 'toast'];

// Fired by any task/habit completion call site; CelebrationEngine (mounted
// once in App.jsx) renders whatever `active` holds. A no-op when the user has
// low-motion or celebrations specifically turned off.
export const useCelebrationStore = create((set) => ({
  active: null, // { id, type }

  fire: () => {
    if (!motionAllowed('celebrations')) return;
    const type = TYPES[Math.floor(Math.random() * TYPES.length)];
    set({ active: { id: Date.now(), type } });
  },
  clear: () => set({ active: null }),
}));
