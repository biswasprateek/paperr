import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../auth/AuthContext';

// Shared query + approve/dismiss/snooze mutations for agent insight cards.
// Used by both the compact Home widget and the full Agent Hub page so the
// two stay in sync off one React Query cache entry.
export function useAgentInsights() {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState(null);

  const { data: insights = [] } = useQuery({
    queryKey: ['agent-insights'],
    queryFn: () => api.get('/agent-insights').then(r => r.data),
    refetchInterval: 60000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['agent-insights'] });

  const approve = useMutation({
    mutationFn: (id) => api.post(`/agent-insights/${id}/approve`),
    onMutate: (id) => setBusyId(id),
    onSettled: () => setBusyId(null),
    onSuccess: invalidate,
  });
  const dismiss = useMutation({
    mutationFn: (id) => api.post(`/agent-insights/${id}/dismiss`),
    onMutate: (id) => setBusyId(id),
    onSettled: () => setBusyId(null),
    onSuccess: invalidate,
  });
  const snooze = useMutation({
    mutationFn: (id) => api.post(`/agent-insights/${id}/snooze`),
    onMutate: (id) => setBusyId(id),
    onSettled: () => setBusyId(null),
    onSuccess: invalidate,
  });

  return {
    insights,
    busyId,
    onApprove: (id) => approve.mutate(id),
    onDismiss: (id) => dismiss.mutate(id),
    onSnooze: (id) => snooze.mutate(id),
  };
}
