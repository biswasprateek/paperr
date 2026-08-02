import React, { useEffect } from 'react';
import { useIdleTimer } from '../../hooks/useIdleTimer';
import { useFrameCollections, useFrameSettings } from '../../hooks/useFrameCollections';
import { useThoughtCollections } from '../../hooks/useThoughtCollections';
import { useFrameStore } from '../../store/frameStore';
import FramePlaybackOverlay from './FramePlaybackOverlay';

// Single, app-level driver for Frame — mounted once (next to <FocusEngine/>)
// so idle-triggered playback works regardless of which page is on screen,
// the same way Pomodoro timers keep running off the Apps page.
export default function FrameEngine() {
  const { collections } = useFrameCollections();
  const { settings } = useFrameSettings();
  const { collections: thoughtCollections } = useThoughtCollections();
  const isPlaying = useFrameStore((s) => s.isPlaying);
  const open = useFrameStore((s) => s.open);

  // A collection with no photos of its own but "Include in Frame playback"
  // turned on (see GoodThoughtsWidget's manage modal) still counts as
  // playable content — Frame doubles as a quote board on its own.
  const hasEnabledCollection = collections.some((c) => c.enabled)
    || thoughtCollections.some((c) => c.enabled && c.show_in_frame);
  const idleMs = (settings?.idle_timeout_minutes || 0) > 0 && hasEnabledCollection
    ? settings.idle_timeout_minutes * 60_000
    : 0;
  const isIdle = useIdleTimer(idleMs);

  useEffect(() => {
    if (isIdle && !isPlaying) open('idle');
  }, [isIdle, isPlaying, open]);

  return <FramePlaybackOverlay />;
}
