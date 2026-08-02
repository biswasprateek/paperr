import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../auth/AuthContext';

export function useFrameCollections() {
  const qc = useQueryClient();

  const { data: collections = [], isLoading } = useQuery({
    queryKey: ['frame-collections'],
    queryFn: () => api.get('/frame/collections').then((r) => r.data),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['frame-collections'] });

  const createCollection = useMutation({
    mutationFn: (data) => api.post('/frame/collections', data).then((r) => r.data),
    onSuccess: invalidate,
  });

  const updateCollection = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/frame/collections/${id}`, data).then((r) => r.data),
    onSuccess: invalidate,
  });

  const deleteCollection = useMutation({
    mutationFn: (id) => api.delete(`/frame/collections/${id}`),
    onSuccess: invalidate,
  });

  return { collections, isLoading, createCollection, updateCollection, deleteCollection };
}

export function useFrameSettings() {
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['frame-settings'],
    queryFn: () => api.get('/frame/settings').then((r) => r.data),
  });

  const updateSettings = useMutation({
    mutationFn: (data) => api.patch('/frame/settings', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['frame-settings'] }),
  });

  return { settings, isLoading, updateSettings };
}
