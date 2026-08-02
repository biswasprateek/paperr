import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../auth/AuthContext';
import { useCelebrationStore } from '../store/celebrationStore';

// Complete/uncomplete toggle for a task, shared by every widget that lists
// tasks (Today, Overdue, My Tasks, Upcoming) so a checkbox tap in any of them
// refreshes the others too.
export function useTaskComplete() {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState(null);

  const mutation = useMutation({
    mutationFn: (task) =>
      task.is_completed
        ? api.post(`/tasks/${task.id}/uncomplete`)
        : api.post(`/tasks/${task.id}/complete`),
    onMutate: (task) => setBusyId(task.id),
    onSuccess: (_data, task) => { if (!task.is_completed) useCelebrationStore.getState().fire(); },
    onSettled: () => {
      setBusyId(null);
      qc.invalidateQueries({ queryKey: ['tasks-today'] });
      qc.invalidateQueries({ queryKey: ['tasks-overdue'] });
      qc.invalidateQueries({ queryKey: ['tasks-upcoming'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  return { toggle: (task) => mutation.mutate(task), busyId };
}
