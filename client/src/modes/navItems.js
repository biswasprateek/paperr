// Shared navigation definitions used across all layout shells (desktop sidebar,
// tablet rail, phone bottom bar) so labels/icons/routes stay in sync.

// Full primary navigation — desktop sidebar + tablet rail.
export const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: 'dashboard', end: true },
  { to: '/tasks', label: 'Tasks', icon: 'assignment' },
  { to: '/calendar', label: 'Calendar', icon: 'calendar_today' },
  { to: '/projects', label: 'Projects', icon: 'folder_copy' },
  { to: '/hub', label: 'Hub', icon: 'hub' },
  { to: '/routines', label: 'Routines', icon: 'repeat' },
  { to: '/frame', label: 'Frame', icon: 'wallpaper' },
  { to: '/lists', label: 'Lists', icon: 'list' },
  { to: '/apps', label: 'Apps', icon: 'apps' },
  { to: '/notebooks', label: 'Notebooks', icon: 'menu_book' },
  { to: '/agents', label: 'Agent Hub', icon: 'smart_toy' },
  { to: '/analytics', label: 'Analytics', icon: 'analytics' },
];

// Curated subset for the phone bottom bar (limited horizontal space). The
// `chat` entry is special-cased by the layout to open the dotAi chat drawer;
// `more` is special-cased to open the MoreMenuSheet (everything else in
// NAV_ITEMS that doesn't fit in the bar).
export const PHONE_NAV_ITEMS = [
  { to: '/', label: 'Home', icon: 'dashboard', end: true },
  { to: '/tasks', label: 'Tasks', icon: 'assignment' },
  { to: '/routines', label: 'Routines', icon: 'repeat' },
  { to: '/projects', label: 'Projects', icon: 'folder_copy' },
  { to: '/chat', label: 'dotAi', icon: null },
  { to: '/more', label: 'More', icon: 'more_horiz' },
];

// Every NAV_ITEMS entry not already reachable from the phone bottom bar —
// listed in the MoreMenuSheet so every page stays reachable on phone even
// without the matching Home widget on board.
export const PHONE_MORE_ITEMS = NAV_ITEMS.filter(
  (item) => !PHONE_NAV_ITEMS.some((p) => p.to === item.to)
);
