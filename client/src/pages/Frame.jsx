import React, { useState, useEffect } from 'react';
import { useFrameCollections, useFrameSettings } from '../hooks/useFrameCollections';
import { useThoughtCollections } from '../hooks/useThoughtCollections';
import { useFrameStore } from '../store/frameStore';
import FrameDetailPanel from '../components/frame/FrameDetailPanel';

const IDLE_OPTIONS = [0, 1, 5, 10, 15, 30, 60];

// Minutes; 0 means playback keeps going until someone stops it manually.
const RUNTIME_OPTIONS = [15, 30, 45, 60, 120, 180, 240, 360, 480, 720, 0];
function formatRuntime(minutes) {
  if (minutes === 0) return 'Manual Stop';
  if (minutes < 60) return `${minutes} minutes`;
  const hours = minutes / 60;
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

const BACKGROUND_MODES = [
  { value: 'diffused', label: 'Diffused', swatch: 'bg-gradient-to-br from-emerald-400 via-rose-400 to-sky-300' },
  { value: 'black', label: 'Black', swatch: 'bg-black' },
  { value: 'white', label: 'White', swatch: 'bg-white ring-1 ring-inset ring-outline-variant/40' },
];

function CollectionRow({ collection, isSelected, onSelect, onUpdate, onRemove }) {
  return (
    <div className={`flex items-center gap-2 py-2.5 px-2 rounded-xl border-b border-outline-variant/20 last:border-0 cursor-pointer transition-colors ${isSelected ? 'bg-primary/5' : 'hover:bg-surface-container'}`} onClick={onSelect}>
      <span className="material-symbols-outlined text-on-surface-variant">photo_library</span>
      <span className="flex-1 min-w-0 truncate text-on-surface font-medium">
        {collection.collection_name || 'Untitled collection'}
      </span>

      <button
        onClick={(e) => { e.stopPropagation(); onUpdate({ enabled: collection.enabled ? 0 : 1 }); }}
        className={`w-11 h-6 rounded-full ring-1 ring-inset transition-colors relative flex-shrink-0 ${collection.enabled ? 'bg-primary ring-primary' : 'bg-surface-container-high ring-outline-variant'}`}
        aria-label="Enabled"
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-surface ring-1 ring-inset ring-outline-variant/60 shadow transition-transform ${collection.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>

      <button onClick={(e) => { e.stopPropagation(); onRemove(); }} className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high active:scale-95 flex-shrink-0">
        <span className="material-symbols-outlined text-[18px]">delete</span>
      </button>
    </div>
  );
}

export default function Frame() {
  const { collections, createCollection, updateCollection, deleteCollection } = useFrameCollections();
  const { settings, updateSettings } = useFrameSettings();
  const { collections: thoughtCollections } = useThoughtCollections();
  const openOverlay = useFrameStore((s) => s.open);
  const [selectedId, setSelectedId] = useState(null);

  // Pre-select the first collection once they load, so the detail panel isn't
  // empty on arrival. Only fills an empty selection — never overrides a user's
  // pick or re-selects after they've deleted down to nothing.
  useEffect(() => {
    if (selectedId == null && collections.length) setSelectedId(collections[0].id);
  }, [selectedId, collections]);

  // Buffered locally for the same reason as CollectionRow's name field — the
  // query-backed value only updates after the mutation round-trips.
  const [intervalInput, setIntervalInput] = useState(settings?.interval_seconds ?? 5);
  useEffect(() => {
    if (settings?.interval_seconds != null) setIntervalInput(settings.interval_seconds);
  }, [settings?.interval_seconds]);

  const addCollection = async () => {
    const collection = await createCollection.mutateAsync({});
    setSelectedId(collection.id);
  };

  const removeCollection = (id) => {
    deleteCollection.mutate(id);
    setSelectedId((current) => (current === id ? null : current));
  };

  const startNow = () => {
    // Call fullscreen synchronously first (this click is the only place we
    // have a real user gesture) before any async work below.
    document.documentElement.requestFullscreen?.().catch(() => {});
    openOverlay('manual');
  };

  // Good Thoughts collections with "Include in Frame playback" turned on
  // count too, even with zero photo collections here — Frame doubles as a
  // quote board on its own.
  const hasEnabled = collections.some((c) => c.enabled)
    || thoughtCollections.some((c) => c.enabled && c.show_in_frame);

  return (
    <div className="pb-8">
      <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between pb-2">
        <h1 className="text-headline-lg text-on-background">Frame</h1>
        <button
          onClick={startNow}
          disabled={!hasEnabled}
          title="Start Ambient Mode (Full Screen)"
          className="flex items-center gap-2 h-9 px-4 rounded-full bg-primary text-on-primary text-label-md font-bold hover:bg-primary/90 transition active:scale-95 disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-[18px]">play_arrow</span>
          Start Ambient Mode (Full Screen)
        </button>
      </div>
      <p className="text-body-md text-on-surface-variant mb-5">
        Turns idle time into a rotating wall of your own photos. Upload photos into collections — they're stored with paperr itself, so the slideshow plays on every device on your network.
      </p>

      <div>
      <div className="flex flex-col lg:flex-row gap-4 mb-4 items-start">
        <div className="w-full lg:w-[340px] flex-shrink-0 flex flex-col gap-4">
          <div className="bg-surface-container-lowest rounded-3xl shadow-soft border border-outline-variant/20 p-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-body-lg font-bold text-on-surface">Library</h2>
              <button
                onClick={addCollection}
                disabled={createCollection.isPending}
                className="flex items-center gap-1.5 text-label-sm text-primary px-3 py-1.5 rounded-full hover:bg-primary/10 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                New collection
              </button>
            </div>
            {collections.length === 0 ? (
              <p className="text-body-sm text-on-surface-variant py-6 text-center">No collections yet — create one to get started.</p>
            ) : (
              collections.map((c) => (
                <CollectionRow
                  key={c.id}
                  collection={c}
                  isSelected={c.id === selectedId}
                  onSelect={() => setSelectedId(c.id)}
                  onUpdate={(data) => updateCollection.mutate({ id: c.id, data })}
                  onRemove={() => removeCollection(c.id)}
                />
              ))
            )}
          </div>

          <div className="bg-surface-container-lowest rounded-3xl shadow-soft border border-outline-variant/20 p-5">
            <h2 className="text-body-lg font-bold text-on-surface mb-3">Activation &amp; timing</h2>
            <div className="flex flex-col gap-5">
              <label className="flex flex-col gap-1.5">
                <span className="text-label-sm text-on-surface-variant font-semibold">Start After Idle For</span>
                <select
                  value={settings?.idle_timeout_minutes ?? 0}
                  onChange={(e) => updateSettings.mutate({ idle_timeout_minutes: parseInt(e.target.value) })}
                  className="bg-surface-container rounded-xl pl-3 pr-8 py-2 w-full text-on-surface border-0 focus:ring-2 focus:ring-primary outline-none"
                >
                  {IDLE_OPTIONS.map((m) => (
                    <option key={m} value={m}>{m === 0 ? 'Manual Start' : `${m} minute${m === 1 ? '' : 's'}`}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-label-sm text-on-surface-variant font-semibold">Seconds Per Photo</span>
                <input
                  type="number"
                  min={5}
                  max={300}
                  value={intervalInput}
                  onChange={(e) => setIntervalInput(e.target.value)}
                  onBlur={() => {
                    const parsed = parseInt(intervalInput);
                    const value = Number.isNaN(parsed) ? 5 : parsed;
                    setIntervalInput(value);
                    updateSettings.mutate({ interval_seconds: value });
                  }}
                  className="bg-surface-container rounded-xl px-3 py-2 text-on-surface border-0 focus:ring-2 focus:ring-primary outline-none w-28"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-label-sm text-on-surface-variant font-semibold">Run Duration</span>
                <select
                  value={settings?.max_runtime_minutes ?? 60}
                  onChange={(e) => updateSettings.mutate({ max_runtime_minutes: parseInt(e.target.value) })}
                  className="bg-surface-container rounded-xl pl-3 pr-8 py-2 w-full text-on-surface border-0 focus:ring-2 focus:ring-primary outline-none"
                >
                  {RUNTIME_OPTIONS.map((m) => (
                    <option key={m} value={m}>{formatRuntime(m)}</option>
                  ))}
                </select>
              </label>
              <div className="flex flex-col gap-1.5">
                <span className="text-label-sm text-on-surface-variant font-semibold">Background</span>
                <div className="flex gap-1 bg-surface-container rounded-xl p-1">
                  {BACKGROUND_MODES.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => updateSettings.mutate({ background_mode: m.value })}
                      aria-pressed={(settings?.background_mode ?? 'white') === m.value}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-label-sm font-medium transition-colors ${(settings?.background_mode ?? 'white') === m.value ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
                    >
                      <span className={`w-3.5 h-3.5 rounded-full flex-shrink-0 ${m.swatch}`} />
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center justify-between gap-3">
                <span className="text-label-sm text-on-surface-variant font-semibold">Date &amp; Time (Bottom-Right Corner)</span>
                <button
                  type="button"
                  onClick={() => updateSettings.mutate({ corner_widget_enabled: settings?.corner_widget_enabled ? 0 : 1 })}
                  className={`w-11 h-6 rounded-full ring-1 ring-inset transition-colors relative flex-shrink-0 ${(settings?.corner_widget_enabled ?? 1) ? 'bg-primary ring-primary' : 'bg-surface-container-high ring-outline-variant'}`}
                  aria-label="Show date and time during playback"
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-surface ring-1 ring-inset ring-outline-variant/60 shadow transition-transform ${(settings?.corner_widget_enabled ?? 1) ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </label>
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0 w-full bg-surface-container-lowest rounded-3xl shadow-soft border border-outline-variant/20 p-5">
          <FrameDetailPanel
            collection={collections.find((c) => c.id === selectedId) || null}
            onUpdateCollection={(data) => updateCollection.mutate({ id: selectedId, data })}
          />
        </div>
      </div>
      </div>
      </div>
    </div>
  );
}
