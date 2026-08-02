import { useEffect, useMemo, useState } from 'react';
import { api } from '../auth/AuthContext';
import { currentTimeSlot } from '../lib/timeSlots';

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Flattens every enabled, currently-in-scope collection's enabled entries
// into one playlist. Mirrors useFramePlaylist.js's per-collection fetch loop.
// `timeFiltered` drops collections whose `time_slot` doesn't match the
// current part of the day (NULL time_slot collections always show).
export function useThoughtPlaylist(collections, { enabled = true, shuffle = false, timeFiltered = true } = {}) {
  const [playlist, setPlaylist] = useState([]);
  const [loading, setLoading] = useState(false);

  // Callers often derive `collections` with `.filter()` in their render body,
  // which returns a new array reference every render even when its contents
  // are unchanged. Depending on that reference directly would re-run this
  // effect (and re-fetch) every render — an infinite loop, since setPlaylist
  // below triggers the next render. Deriving a stable content-based key lets
  // the effect only re-run when the actual collection set changes.
  const collectionsKey = useMemo(
    () => collections.map((c) => `${c.id}:${c.enabled}:${c.time_slot || ''}`).join(','),
    [collections]
  );

  useEffect(() => {
    if (!enabled) { setPlaylist([]); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const slot = currentTimeSlot();
      const items = [];
      for (const col of collections.filter((c) => c.enabled)) {
        if (timeFiltered && col.time_slot && col.time_slot !== slot) continue;
        let rows = [];
        try {
          rows = await api.get(`/good-thoughts/collections/${col.id}/entries`).then((r) => r.data);
        } catch { continue; /* collection unreachable — skip, keep the rest playing */ }

        for (const entry of rows.filter((e) => e.enabled)) {
          items.push({
            id: entry.id,
            body: entry.body,
            plain: entry.plain,
            attribution: entry.attribution,
            collectionId: col.id,
            collectionName: col.name,
            category: col.category,
            color: col.color,
            icon: col.icon,
          });
        }
      }
      if (cancelled) return;
      setPlaylist(shuffle ? shuffleArray(items) : items);
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- collectionsKey stands in for `collections`
  }, [enabled, collectionsKey, shuffle, timeFiltered]);

  return { playlist, loading };
}
