import React, { useEffect, useMemo, useState } from 'react';
import WidgetShell, { WidgetEmpty } from './WidgetShell';
import { useFrameCollections } from '../hooks/useFrameCollections';
import { useFramePlaylist } from '../hooks/useFramePlaylist';
import { useFrameStore } from '../store/frameStore';

const PREVIEW_INTERVAL_MS = 5000;

// Row in the edit-mode picker choosing which collections this widget cycles.
function PickerRow({ label, selected, onSelect }) {
  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onSelect}
      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition ${
        selected ? 'bg-primary/10 text-primary' : 'hover:bg-surface-container text-on-surface'
      }`}
    >
      <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        <span className="material-symbols-outlined text-primary text-[14px]">photo_library</span>
      </span>
      <span className="flex-1 min-w-0 text-body-md truncate">{label}</span>
      {selected && <span className="material-symbols-outlined text-[16px]">check</span>}
    </button>
  );
}

/**
 * `collectionIds` in the widget's stored props limits the preview to those
 * collections; empty/absent means every enabled collection (so newly created
 * collections show up without reconfiguring). In edit mode (on boards that
 * pass onUpdateProps) the body becomes the picker.
 */
export default function FrameWidget({ editing, collectionIds, onUpdateProps }) {
  const { collections } = useFrameCollections();
  const openOverlay = useFrameStore((s) => s.open);

  const canConfigure = typeof onUpdateProps === 'function';
  const showPicker = canConfigure && editing;

  const selection = Array.isArray(collectionIds) && collectionIds.length ? collectionIds : null;
  // Memoized so the filtered array keeps its identity between renders —
  // useFramePlaylist re-fetches whenever its collections argument changes.
  const shownCollections = useMemo(
    () => (selection ? collections.filter((c) => selection.includes(c.id)) : collections),
    [collections, selection]
  );

  const enabledCollections = collections.filter((c) => c.enabled);
  const hasEnabled = enabledCollections.length > 0;
  const shownCount = shownCollections.filter((c) => c.enabled).length;

  // Title cards included, same as fullscreen playback — the preview announces
  // each collection by name as it cycles into it.
  const { playlist: slides } = useFramePlaylist(shownCollections, { enabled: hasEnabled && !editing, withTitles: true });

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => { setIndex(0); }, [slides.length]);

  useEffect(() => {
    if (paused || slides.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % slides.length), PREVIEW_INTERVAL_MS);
    return () => clearInterval(id);
  }, [paused, slides.length]);

  const toggleCollection = (id) => {
    const base = selection || [];
    const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    onUpdateProps({ collectionIds: next });
  };

  const startNow = () => {
    // Synchronous, first thing in the click handler — this is the only place
    // the real Fullscreen API gets a genuine user gesture to work with.
    document.documentElement.requestFullscreen?.().catch(() => {});
    openOverlay('manual');
  };

  return (
    <WidgetShell
      icon="wallpaper"
      title="Frame"
      source="/frame"
      editing={editing}
      footer={!editing && (
        <button
          onClick={startNow}
          disabled={!hasEnabled}
          className="w-full text-label-md font-bold text-primary flex items-center justify-center gap-1 active:scale-95 disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-[16px]">play_arrow</span> Start Ambient Mode (Full Screen)
        </button>
      )}
    >
      {showPicker ? (
        <div>
          <p className="text-label-md tracking-widest text-on-surface-variant/60 font-bold px-1 pb-1.5">
            Show collections
          </p>
          <div className="space-y-0.5">
            <PickerRow
              label="All collections"
              selected={!selection}
              onSelect={() => onUpdateProps({ collectionIds: [] })}
            />
            {collections.map((c) => (
              <PickerRow
                key={c.id}
                label={c.collection_name || 'Untitled collection'}
                selected={!!selection?.includes(c.id)}
                onSelect={() => toggleCollection(c.id)}
              />
            ))}
          </div>
        </div>
      ) : hasEnabled ? (
        <div className="relative h-full min-h-[104px] rounded-xl overflow-hidden bg-surface-container-lowest">
          {slides.length > 0 ? (
            <>
              {slides.map((slide, i) => slide.isTitle ? (
                <div
                  key={`title-${i}`}
                  className={`absolute inset-0 bg-black flex items-center justify-center px-4 transition-opacity duration-700 ${i === index ? 'opacity-100' : 'opacity-0'}`}
                >
                  <span className="text-white font-serif text-title-lg text-center line-clamp-2">{slide.collectionName}</span>
                </div>
              ) : (
                <img
                  key={slide.url}
                  src={slide.url}
                  alt=""
                  className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-700 ${i === index ? 'opacity-100' : 'opacity-0'}`}
                />
              ))}
              {slides.length > 1 && (
                <button
                  type="button"
                  onClick={() => setPaused((p) => !p)}
                  aria-label={paused ? 'Play preview' : 'Pause preview'}
                  className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center backdrop-blur-sm active:scale-95"
                >
                  <span className="material-symbols-outlined text-[16px]">{paused ? 'play_arrow' : 'pause'}</span>
                </button>
              )}
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center gap-1">
              <span className="material-symbols-outlined text-2xl text-on-surface-variant">photo_library</span>
              <p className="text-label-md text-on-surface">{shownCount} collection{shownCount === 1 ? '' : 's'} ready</p>
            </div>
          )}
        </div>
      ) : (
        <WidgetEmpty icon="wallpaper" label="Add photos in Frame to get started" />
      )}
    </WidgetShell>
  );
}
