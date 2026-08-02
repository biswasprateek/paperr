import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../auth/AuthContext';

export function useThoughtEntries(collectionId) {
  const qc = useQueryClient();
  const queryKey = ['thought-entries', collectionId];

  const { data: entries = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => api.get(`/good-thoughts/collections/${collectionId}/entries`).then((r) => r.data),
    enabled: !!collectionId,
  });

  const createEntry = useMutation({
    mutationFn: (data) => api.post(`/good-thoughts/collections/${collectionId}/entries`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const updateEntry = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/good-thoughts/collections/${collectionId}/entries/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const deleteEntry = useMutation({
    mutationFn: (id) => api.delete(`/good-thoughts/collections/${collectionId}/entries/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return { entries, isLoading, createEntry, updateEntry, deleteEntry };
}
