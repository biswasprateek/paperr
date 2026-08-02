import React, { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useFocusStore, onFocusLogged } from '../store/focusStore';

/**
 * Single, app-level driver for the focus/wellness engine. Mounted once so that
 * timers and ambient audio keep running regardless of which (if any) focus
 * widget is currently on screen.
 *
 *  - Runs the per-tick loop only while something is actually counting down.
 *  - Hosts the persistent <audio> elements for ambient sound + guided
 *    meditation, driven entirely by store state.
 *  - Invalidates analytics queries whenever a session is logged, so the
 *    Analytics page and its widgets stay fresh.
 *
 * Renders nothing visible.
 */
export default function FocusEngine() {
  const queryClient = useQueryClient();

  // Tick only while a timer is live — subscribe so we start/stop as needed.
  useEffect(() => {
    let id = null;
    let delay = null;
    const ensure = () => {
      const state = useFocusStore.getState();
      const running = state.isRunning();
      // The stopwatch shows centiseconds, so it needs a much finer tick than
      // the other (whole-second) displays — otherwise the digits jump in
      // 250ms-sized chunks instead of counting through every value.
      const needed = state.stopwatch.status === 'running' ? 10 : 250;
      if (running && (!id || delay !== needed)) {
        if (id) clearInterval(id);
        delay = needed;
        // `id` is assigned before the tick so the tick's own `set()` (which
        // re-enters this subscriber) sees it already running instead of
        // recursing. Ticking once immediately keeps `now` fresh the instant a
        // timer starts — otherwise the remaining-time selectors read a stale
        // `now` (possibly set long ago, on store creation) against a fresh
        // `endsAt`/`startedAt` and flash a wildly wrong (even negative) value
        // for the first tick.
        id = setInterval(() => useFocusStore.getState().tick(), delay);
        state.tick();
      } else if (!running && id) {
        clearInterval(id); id = null; delay = null;
      }
    };
    ensure();
    const unsub = useFocusStore.subscribe(ensure);
    return () => { unsub(); if (id) clearInterval(id); };
  }, []);

  // Keep every analytics query fresh after each logged session — there are
  // several distinct keys across the Analytics page and its widgets
  // (breakdown, heatmap, trend, mood stats...), so a blanket invalidation is
  // simpler and safer than keeping an enumerated list in sync.
  useEffect(() => onFocusLogged(() => {
    queryClient.invalidateQueries();
  }), [queryClient]);

  // ── Ambient audio ──────────────────────────────────────────────────────────
  const ambient = useFocusStore((s) => s.ambient);
  const ambientRef = useRef(null);
  useEffect(() => {
    const el = ambientRef.current;
    if (!el) return;
    el.volume = ambient.volume;
    if (ambient.playing && ambient.src) el.play().catch(() => {});
    else el.pause();
  }, [ambient.playing, ambient.src, ambient.volume]);

  // ── Meditation audio ────────────────────────────────────────────────────────
  const med = useFocusStore((s) => s.meditation);
  const medRef = useRef(null);
  useEffect(() => {
    const el = medRef.current;
    if (!el) return;
    if (med.playing && med.src) el.play().catch(() => {});
    else el.pause();
  }, [med.playing, med.src]);

  return (
    <>
      <audio ref={ambientRef} src={ambient.src || undefined} loop />
      <audio ref={medRef} src={med.src || undefined} />
    </>
  );
}
