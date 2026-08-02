import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  user: null,
  accessToken: null,
  isLoading: true,

  setUser: (user, accessToken) => set({ user, accessToken, isLoading: false }),
  clearUser: () => set({ user: null, accessToken: null, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
}));
