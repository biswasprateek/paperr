import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../auth/AuthContext';

export function useFramePhotos(collectionId) {
  const qc = useQueryClient();
  const queryKey = ['frame-photos', collectionId];

  // A curated-collection import (see AppsSetupStep/curatedArt.js) keeps
  // downloading photos server-side long after whichever screen kicked it off
  // has been closed — this polls both the job itself and the photo list
  // while it's running, so a collection that was only partially populated
  // when this page first loaded keeps filling in instead of looking stuck.
  const { data: importJob } = useQuery({
    queryKey: ['frame-import-status', collectionId],
    queryFn: () => api.get(`/frame/collections/${collectionId}/import-status`).then((r) => r.data),
    enabled: !!collectionId,
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 1500 : false),
  });
  const importing = importJob?.status === 'running';

  const { data: photos = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => api.get(`/frame/collections/${collectionId}/photos`).then((r) => r.data),
    enabled: !!collectionId,
    refetchInterval: importing ? 1500 : false,
  });

  // The upload response is the full refreshed photo list — written straight
  // into the cache (not invalidated) so the grid that's already on screen
  // grows in place without a loading flash.
  const uploadPhotos = useMutation({
    mutationFn: (formData) => api.post(`/frame/collections/${collectionId}/photos`, formData).then((r) => r.data),
    onSuccess: (data) => qc.setQueryData(queryKey, data),
  });

  const updatePhoto = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/frame/collections/${collectionId}/photos/${id}`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const deletePhoto = useMutation({
    mutationFn: (id) => api.delete(`/frame/collections/${collectionId}/photos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  // The caller writes the reordered list into the cache optimistically; the
  // server echoes the canonical order back, which we keep. On error we refetch
  // to undo the optimistic move.
  const reorderPhotos = useMutation({
    mutationFn: (photoIds) => api.post(`/frame/collections/${collectionId}/photos/reorder`, { photoIds }).then((r) => r.data),
    onSuccess: (data) => qc.setQueryData(queryKey, data),
    onError: () => qc.invalidateQueries({ queryKey }),
  });

  return { photos, isLoading, importJob, uploadPhotos, updatePhoto, deletePhoto, reorderPhotos };
}
