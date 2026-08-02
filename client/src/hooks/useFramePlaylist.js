import { useEffect, useState } from 'react';
import { api } from '../auth/AuthContext';
import { photoFileUrl } from '../lib/frameUpload';

// Flattens every enabled collection's enabled photos into one playlist.
// Shared by the fullscreen overlay and the Home widget's mini preview —
// both include title cards announcing each collection by name.
export function useFramePlaylist(collections, { enabled = true, withTitles = true } = {}) {
  const [playlist, setPlaylist] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) { setPlaylist([]); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const slides = [];
      for (const col of collections.filter((c) => c.enabled)) {
        let rows = [];
        try {
          rows = await api.get(`/frame/collections/${col.id}/photos`).then((r) => r.data);
        } catch { continue; /* collection unreachable — skip, keep the rest playing */ }

        const visible = rows.filter((r) => r.enabled);
        if (!visible.length) continue;

        if (withTitles && col.collection_name) {
          slides.push({ isTitle: true, collectionName: col.collection_name, frameStyle: col.frame_style });
        }
        for (const photo of visible) {
          slides.push({
            url: photoFileUrl(photo),
            frameStyle: col.frame_style,
            collectionName: col.collection_name,
            collectionType: col.collection_type,
            description: photo.description || null,
            artist: photo.artist || null,
            year: photo.year || null,
          });
        }
      }
      if (cancelled) return;
      setPlaylist(slides);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [enabled, collections, withTitles]);

  return { playlist, loading };
}
