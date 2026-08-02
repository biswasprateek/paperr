import { create } from 'zustand';

function ls(key, fallback) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}

// Reflects the active surface color into the browser chrome (mobile status
// bar / PWA title bar) so it matches the in-app theme instead of staying a
// fixed light color. Reads --tb-background rather than duplicating palette
// hex values here, so it always tracks whatever palette/theme is active.
function syncThemeColorMeta() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--tb-background').trim();
  if (!bg) return;
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = `rgb(${bg.split(/\s+/).join(' ')})`;
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark') root.classList.add('dark');
  else if (theme === 'light') root.classList.remove('dark');
  else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    prefersDark ? root.classList.add('dark') : root.classList.remove('dark');
  }
  syncThemeColorMeta();
}

// Apply saved theme + palette immediately on module load (before any component
// renders), so there's no flash of the wrong theme. The class/dataset must be
// set synchronously here, but the CSS custom properties they key off aren't
// resolvable yet — index.css hasn't been injected at this point in module
// evaluation — so defer the theme-color meta sync to the next frame.
const _initPalette = ls('colorPalette', 'mono');
const _initTheme = ls('theme', 'light');
document.documentElement.dataset.palette = _initPalette;
applyTheme(_initTheme);
requestAnimationFrame(syncThemeColorMeta);

export const useUiStore = create((set) => ({
  sidebarOpen: true,
  chatOpen: false,
  theme: _initTheme, // 'light' | 'dark' | 'system'
  colorPalette: _initPalette,

  // ── Weather preferences ──────────────────────────────────────────
  tempUnit:           ls('tempUnit', 'F'),          // 'F' | 'C'
  weatherRefreshMins: ls('weatherRefreshMins', 10), // 5 | 10 | 15 | 30 | 60
  zipCode:            ls('zipCode', ''),            // fallback if geolocation blocked

  // ── Motion preferences ────────────────────────────────────────────
  // Master switch defaults to the OS-level reduced-motion preference; the
  // individual toggles default on and only take effect once the master is off.
  lowMotion: ls('lowMotion', window.matchMedia('(prefers-reduced-motion: reduce)').matches),
  motionPrefs: ls('motionPrefs', {
    celebrations: true, weather: true, jiggle: true, alarmRing: true, breathing: true,
  }),

  quickCreate: null, // 'task' | 'event' | 'project' | null
  setQuickCreate: (type) => set({ quickCreate: type }),

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen })),
  setChatOpen: (open) => set({ chatOpen: open }),
  setTheme: (theme) => {
    localStorage.setItem('theme', JSON.stringify(theme));
    applyTheme(theme);
    set({ theme });
  },
  setColorPalette: (palette) => {
    localStorage.setItem('colorPalette', JSON.stringify(palette));
    document.documentElement.dataset.palette = palette;
    syncThemeColorMeta();
    set({ colorPalette: palette });
  },
  setTempUnit: (unit) => {
    localStorage.setItem('tempUnit', JSON.stringify(unit));
    set({ tempUnit: unit });
  },
  setWeatherRefreshMins: (mins) => {
    localStorage.setItem('weatherRefreshMins', JSON.stringify(mins));
    set({ weatherRefreshMins: mins });
  },
  setZipCode: (zip) => {
    localStorage.setItem('zipCode', JSON.stringify(zip));
    localStorage.removeItem('weather_coords'); // force re-resolve from new zip
    set({ zipCode: zip });
  },
  setLowMotion: (on) => {
    localStorage.setItem('lowMotion', JSON.stringify(on));
    set({ lowMotion: on });
  },
  setMotionPref: (key, on) => set((s) => {
    const motionPrefs = { ...s.motionPrefs, [key]: on };
    localStorage.setItem('motionPrefs', JSON.stringify(motionPrefs));
    return { motionPrefs };
  }),
}));

// True when a given individually-keyed animation should play — false if the
// master low-motion switch is on, or that specific animation is off.
export function motionAllowed(key) {
  const { lowMotion, motionPrefs } = useUiStore.getState();
  return !lowMotion && motionPrefs[key] !== false;
}
