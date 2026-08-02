import { useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../auth/AuthContext';
import { useSpaceStore } from '../store/spaceStore';

const EMPTY_BOARD = { pages: [{ id: 'p-hub', name: 'Hub', widgets: [] }] };

/**
 * The space's shared Hub board, from GET /api/hub. Layout writes are
 * admin-only (PUT /api/hub/board rejects members with 403); mirrors
 * useWidgetBoard's optimistic + debounced save so rapid drag/resize edits
 * coalesce into one request. Re-keyed on space so switching spaces always
 * shows the right board; other screens stay in sync via the `hub:updated`
 * socket event.
 */
export function useHubBoard() {
  const qc = useQueryClient();
  const spaceId = useSpaceStore((s) => s.currentSpaceId);
  const saveTimer = useRef(null);

  const { data, isLoading } = useQuery({
    queryKey: ['hub', spaceId],
    queryFn: () => api.get('/hub').then((r) => r.data),
    enabled: !!spaceId,
  });

  const saveBoard = useCallback((next) => {
    // Optimistic: the board re-renders immediately from the query cache.
    qc.setQueryData(['hub', spaceId], (old) => ({ ...(old || {}), board: next }));

    // Debounced server write — coalesces rapid drag/resize edits.
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.put('/hub/board', { board: next }).catch(() => {
        // Rejected (e.g. not admin, or validation) — refetch the truth.
        qc.invalidateQueries({ queryKey: ['hub', spaceId] });
      });
    }, 600);
  }, [qc, spaceId]);

  return {
    board: data?.board ?? EMPTY_BOARD,
    settings: data?.settings ?? {},
    saveBoard,
    isLoading,
  };
}
