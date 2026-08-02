import { create } from 'zustand';

// Ephemeral UI state for the Frame slideshow overlay — collection/settings
// data itself lives in React Query (useFrameCollections.js), not here.
// `trigger` distinguishes an idle auto-activation (no user gesture, so real
// requestFullscreen() isn't attempted) from a manual "Start now" click
// (has a gesture, so FramePlaybackOverlay attempts real fullscreen first).
// `paused` is independent of `isPlaying`: the overlay stays mounted/visible
// (isPlaying) while the user can freeze the current slide (paused) without
// exiting fullscreen.
export const useFrameStore = create((set) => ({
  isPlaying: false,
  paused: false,
  trigger: null, // 'idle' | 'manual' | null

  open: (trigger) => set({ isPlaying: true, paused: false, trigger }),
  close: () => set({ isPlaying: false, paused: false, trigger: null }),
  togglePaused: () => set((s) => ({ paused: !s.paused })),
}));
