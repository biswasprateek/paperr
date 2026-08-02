import { create } from 'zustand';

const SPACE_KEY = 'paperr_space_id';

function readStoredSpaceId() {
  try { return parseInt(localStorage.getItem(SPACE_KEY)) || null; }
  catch { return null; }
}

export const useSpaceStore = create((set, get) => ({
  spaces: [],
  currentSpaceId: readStoredSpaceId(),
  currentSpace: null,

  setSpaces(spaces) {
    const stored = get().currentSpaceId;
    const valid = spaces.find(s => s.id === stored) ? stored : (spaces[0]?.id ?? null);
    if (valid) localStorage.setItem(SPACE_KEY, String(valid));
    set({
      spaces,
      currentSpaceId: valid,
      currentSpace: spaces.find(s => s.id === valid) ?? null,
    });
  },

  switchSpace(spaceId) {
    const spaces = get().spaces;
    const currentSpace = spaces.find(s => s.id === spaceId) ?? null;
    if (spaceId) localStorage.setItem(SPACE_KEY, String(spaceId));
    set({ currentSpaceId: spaceId, currentSpace });
  },

  addSpace(space) {
    set(s => ({ spaces: [...s.spaces, space] }));
  },

  updateSpace(updated) {
    set(s => ({
      spaces: s.spaces.map(sp => sp.id === updated.id ? { ...sp, ...updated } : sp),
      currentSpace: s.currentSpaceId === updated.id ? { ...s.currentSpace, ...updated } : s.currentSpace,
    }));
  },

  // If the deleted space was the active one, fall back to another remaining
  // space (the server only allows deleting a space if the user has others).
  removeSpace(spaceId) {
    set(s => {
      const spaces = s.spaces.filter(sp => sp.id !== spaceId);
      if (s.currentSpaceId !== spaceId) return { spaces };
      const next = spaces[0]?.id ?? null;
      if (next) localStorage.setItem(SPACE_KEY, String(next));
      else localStorage.removeItem(SPACE_KEY);
      return { spaces, currentSpaceId: next, currentSpace: spaces.find(sp => sp.id === next) ?? null };
    });
  },

  clearSpaces() {
    localStorage.removeItem(SPACE_KEY);
    set({ spaces: [], currentSpaceId: null, currentSpace: null });
  },
}));
