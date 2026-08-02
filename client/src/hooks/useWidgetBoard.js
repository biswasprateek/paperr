import { useState, useRef, useCallback } from 'react';
import { api } from '../auth/AuthContext';
import { useAuthStore } from '../store/authStore';
import { defaultBoard } from '../widgets';

// preferences_json key under which the touch Home board layout is stored.
const BOARD_KEY = 'tabletBoard';

function parsePrefs(user) {
  const raw = user?.preferences_json;
  if (!raw) return {};
  if (typeof raw === 'object') return { ...raw };
  try { return JSON.parse(raw) || {}; } catch { return {}; }
}

function readBoard(user) {
  const prefs = parsePrefs(user);
  const board = prefs[BOARD_KEY];
  if (board && Array.isArray(board.pages) && board.pages.length) return board;
  return defaultBoard(user?.role === 'admin');
}

/**
 * Loads the user's swipable widget board from users.preferences_json and
 * persists edits back via PUT /users/:id (debounced). Updates are optimistic —
 * the auth store is updated immediately so the board stays in sync everywhere,
 * and a brand-new user transparently gets the seeded default board.
 */
export function useWidgetBoard() {
  const user = useAuthStore((s) => s.user);
  const [board, setBoardState] = useState(() => readBoard(user));
  const saveTimer = useRef(null);

  const saveBoard = useCallback((next) => {
    setBoardState(next);

    const store = useAuthStore.getState();
    const current = store.user;
    if (!current) return;

    const prefs = parsePrefs(current);
    prefs[BOARD_KEY] = next;
    const prefStr = JSON.stringify(prefs);

    // Optimistic: reflect immediately in the auth store.
    store.setUser({ ...current, preferences_json: prefStr }, store.accessToken);

    // Debounced server write — coalesces rapid drag/resize edits.
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.put(`/users/${current.id}`, { preferences_json: prefStr }).catch(() => {});
    }, 600);
  }, []);

  return { board, saveBoard };
}
