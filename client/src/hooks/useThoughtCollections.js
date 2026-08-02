import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../auth/AuthContext';

export function useThoughtCollections() {
  const qc = useQueryClient();

  const { data: collections = [], isLoading } = useQuery({
    queryKey: ['thought-collections'],
    queryFn: () => api.get('/good-thoughts/collections').then((r) => r.data),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['thought-collections'] });

  const createCollection = useMutation({
    mutationFn: (data) => api.post('/good-thoughts/collections', data).then((r) => r.data),
    onSuccess: invalidate,
  });

  const updateCollection = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/good-thoughts/collections/${id}`, data).then((r) => r.data),
    onSuccess: invalidate,
  });

  const deleteCollection = useMutation({
    mutationFn: (id) => api.delete(`/good-thoughts/collections/${id}`),
    onSuccess: invalidate,
  });

  return { collections, isLoading, createCollection, updateCollection, deleteCollection };
}

export function useThoughtSettings() {
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['thought-settings'],
    queryFn: () => api.get('/good-thoughts/settings').then((r) => r.data),
  });

  const updateSettings = useMutation({
    mutationFn: (data) => api.patch('/good-thoughts/settings', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['thought-settings'] }),
  });

  return { settings, isLoading, updateSettings };
}
