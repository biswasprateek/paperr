import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../auth/AuthContext';
import { useCelebrationStore } from '../store/celebrationStore';

// Optimistic complete/uncomplete toggle for a habit on the ['routines', date]
// cache — shared by the Routines and Today widgets so both stay in sync.
export function useHabitToggle(date) {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState(null);

  const mutation = useMutation({
    mutationFn: (habit) =>
      habit.completed
        ? api.delete(`/routines/habits/${habit.id}/complete`, { params: { date } })
        : api.post(`/routines/habits/${habit.id}/complete`, { date }),
    onMutate: async (habit) => {
      setBusyId(habit.id);
      await qc.cancelQueries({ queryKey: ['routines', date] });
      const prev = qc.getQueryData(['routines', date]);
      const nowIso = new Date().toISOString();
      qc.setQueryData(['routines', date], (old = []) =>
        old.map(p => ({
          ...p,
          habits: (p.habits || []).map(h =>
            h.id === habit.id
              ? { ...h, completed: !h.completed, completed_at: h.completed ? null : nowIso }
              : h
          ),
        }))
      );
      return { prev };
    },
    onSuccess: (_data, habit) => { if (!habit.completed) useCelebrationStore.getState().fire(); },
    onError: (_e, _h, ctx) => { if (ctx?.prev) qc.setQueryData(['routines', date], ctx.prev); },
    onSettled: () => {
      setBusyId(null);
      qc.invalidateQueries({ queryKey: ['routines'] });
      qc.invalidateQueries({ queryKey: ['routines-progress'] });
    },
  });

  return { toggle: (habit) => mutation.mutate(habit), busyId };
}
