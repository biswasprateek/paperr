import React, { useEffect, useMemo, useState } from 'react';
import WidgetShell, { WidgetEmpty } from './WidgetShell';
import { useThoughtCollections, useThoughtSettings } from '../hooks/useThoughtCollections';
import { useThoughtPlaylist } from '../hooks/useThoughtPlaylist';

// Row in the edit-mode picker choosing which collections this widget cycles —
// mirrors FrameWidget.jsx's PickerRow.
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
        <span className="material-symbols-outlined text-primary text-[14px]">format_quote</span>
      </span>
      <span className="flex-1 min-w-0 text-body-md truncate">{label}</span>
      {selected && <span className="material-symbols-outlined text-[16px]">check</span>}
    </button>
  );
}

// Owns the cycling index/timer/pause state; shared by the board widget and
// the full-size Apps-page view.
function ThoughtCycler({ playlist, intervalMs = 15000, showAttribution = true, minHeightClass = 'min-h-[104px]' }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => { setIndex(0); }, [playlist.length]);

  useEffect(() => {
    if (paused || playlist.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % playlist.length), intervalMs);
    return () => clearInterval(id);
  }, [paused, playlist.length, intervalMs]);

  if (!playlist.length) {
    return <WidgetEmpty icon="format_quote" label="Add a collection in Good Thoughts to get started" />;
  }

  const entry = playlist[index % playlist.length];

  return (
    <div className={`relative ${minHeightClass} rounded-xl overflow-hidden bg-surface-container flex flex-col items-center justify-center text-center px-5 py-4`}>
      <span
        className="text-title-md font-serif italic text-on-surface leading-snug"
        dangerouslySetInnerHTML={{ __html: entry.body }}
      />
      {showAttribution && entry.attribution && (
        <span className="mt-2 text-label-sm text-on-surface-variant/70">— {entry.attribution}</span>
      )}
      {playlist.length > 1 && (
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? 'Play' : 'Pause'}
          className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-black/10 dark:bg-white/10 text-on-surface flex items-center justify-center backdrop-blur-sm active:scale-95"
        >
          <span className="material-symbols-outlined text-[16px]">{paused ? 'play_arrow' : 'pause'}</span>
        </button>
      )}
    </div>
  );
}

/**
 * `collectionIds` in the widget's stored props limits the cycle to those
 * collections; empty/absent means every enabled collection. In edit mode
 * (on boards that pass onUpdateProps) the body becomes the picker — mirrors
 * FrameWidget.jsx.
 */
export default function GoodThoughtsWidget({ editing, collectionIds, onUpdateProps }) {
  const { collections } = useThoughtCollections();
  const { settings } = useThoughtSettings();

  const canConfigure = typeof onUpdateProps === 'function';
  const showPicker = canConfigure && editing;

  const selection = Array.isArray(collectionIds) && collectionIds.length ? collectionIds : null;
  const shownCollections = useMemo(
    () => (selection ? collections.filter((c) => selection.includes(c.id)) : collections),
    [collections, selection]
  );

  const hasEnabled = collections.some((c) => c.enabled);

  const { playlist } = useThoughtPlaylist(shownCollections, {
    enabled: hasEnabled && !editing,
    shuffle: !!settings?.shuffle,
  });

  const toggleCollection = (id) => {
    const base = selection || [];
    const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    onUpdateProps({ collectionIds: next });
  };

  return (
    <WidgetShell icon="format_quote" title="Good Thoughts" source="/apps" editing={editing}>
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
                label={c.name || 'Untitled collection'}
                selected={!!selection?.includes(c.id)}
                onSelect={() => toggleCollection(c.id)}
              />
            ))}
          </div>
        </div>
      ) : hasEnabled ? (
        <ThoughtCycler
          playlist={playlist}
          intervalMs={(settings?.interval_seconds || 15) * 1000}
          showAttribution={!!(settings?.show_attribution ?? 1)}
        />
      ) : (
        <WidgetEmpty icon="format_quote" label="Add a collection in Good Thoughts to get started" />
      )}
    </WidgetShell>
  );
}

// Full-size body used on the Apps page — same live cycling content, no
// WidgetShell chrome (AppCard already supplies that).
export function GoodThoughtsApp() {
  const { collections } = useThoughtCollections();
  const { settings } = useThoughtSettings();
  const enabledCollections = useMemo(() => collections.filter((c) => c.enabled), [collections]);

  const { playlist } = useThoughtPlaylist(enabledCollections, {
    enabled: enabledCollections.length > 0,
    shuffle: !!settings?.shuffle,
  });

  return (
    <ThoughtCycler
      playlist={playlist}
      intervalMs={(settings?.interval_seconds || 15) * 1000}
      showAttribution={!!(settings?.show_attribution ?? 1)}
      minHeightClass="min-h-[220px]"
    />
  );
}
