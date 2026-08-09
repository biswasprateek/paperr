import React, { useEffect, useRef, useState } from 'react';
import EmojiPopover from '../EmojiPopover';
import PillSelect from '../PillSelect';
import VisibilityToggle, { SharedBadge } from '../VisibilityToggle';
import EntryEditor from './EntryEditor';
import { useThoughtCollections, useThoughtSettings } from '../../hooks/useThoughtCollections';
import { useThoughtEntries } from '../../hooks/useThoughtEntries';
import { CATEGORIES, PRESET_COLOURS } from '../../lib/goodThoughtsOptions';
import { TIME_SLOTS } from '../../lib/timeSlots';

// Small pill/switch used throughout — matches Frame.jsx's collection-row
// toggle (w-11 h-6 ring, sliding w-5 h-5 knob).
function Toggle({ on, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`w-11 h-6 rounded-full ring-1 ring-inset transition-colors relative flex-shrink-0 ${on ? 'bg-primary ring-primary' : 'bg-surface-container-high ring-outline-variant'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-surface ring-1 ring-inset ring-outline-variant/60 shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  );
}

function TimeSlotPill({ label, emoji, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 h-9 rounded-full text-label-md transition ${
        active ? 'bg-primary text-on-primary font-bold' : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-high'
      }`}
    >
      <span className="text-[13px]">{emoji}</span>
      {label}
    </button>
  );
}

function CollectionRow({ collection, isSelected, onSelect, onUpdate, onRemove }) {
  const count = collection.entry_count || 0;
  return (
    <div
      className={`flex items-center gap-2 py-2.5 px-2 rounded-xl border-b border-outline-variant/20 last:border-0 cursor-pointer transition-colors ${isSelected ? 'bg-primary/10' : 'hover:bg-surface-container-high'}`}
      onClick={onSelect}
    >
      <span className="text-[18px] flex-shrink-0">{collection.icon || '💭'}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-on-surface font-medium">{collection.name || 'Untitled collection'}</span>
          <SharedBadge visibility={collection.visibility} />
        </div>
        <span className="text-label-sm text-on-surface-variant">{count} {count === 1 ? 'entry' : 'entries'}</span>
      </div>
      <Toggle on={!!collection.enabled} onClick={(e) => { e.stopPropagation(); onUpdate({ enabled: collection.enabled ? 0 : 1 }); }} label="Enabled" />
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high active:scale-95 flex-shrink-0"
        aria-label="Delete collection"
      >
        <span className="material-symbols-outlined text-[18px]">delete</span>
      </button>
    </div>
  );
}

function EntryRow({ entry, onEdit, onToggle, onDelete }) {
  return (
    <div className={`flex items-start gap-2 rounded-xl border border-outline-variant/20 px-3 py-2.5 transition ${entry.enabled ? '' : 'opacity-50'}`}>
      <div className="flex-1 min-w-0">
        {/* entry.body is sanitized server-side to an allowlist of b/i/u/s/br */}
        <p className="text-body-md text-on-surface line-clamp-2" dangerouslySetInnerHTML={{ __html: entry.body }} />
        {entry.attribution && <p className="text-label-sm text-on-surface-variant/70 mt-0.5">— {entry.attribution}</p>}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Toggle on={!!entry.enabled} onClick={onToggle} label="Enabled" />
        <button onClick={onEdit} aria-label="Edit entry" className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high active:scale-95">
          <span className="material-symbols-outlined text-[16px]">edit</span>
        </button>
        <button onClick={onDelete} aria-label="Delete entry" className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high active:scale-95">
          <span className="material-symbols-outlined text-[16px]">delete</span>
        </button>
      </div>
    </div>
  );
}

// `editingEntry`: undefined = editor hidden, null = creating a new entry,
// object = editing that entry. Keyed by collection.id from the parent so
// this local state resets cleanly when the selected collection changes.
function CollectionEditor({ collection, onUpdate }) {
  const [name, setName] = useState(collection.name || '');
  const { entries, isLoading, createEntry, updateEntry, deleteEntry } = useThoughtEntries(collection.id);
  const [editingEntry, setEditingEntry] = useState(undefined);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <span className="text-label-md text-on-surface-variant tracking-wide">Name</span>
        <input
          value={name}
          placeholder="Untitled collection"
          onChange={(e) => { setName(e.target.value); onUpdate({ name: e.target.value }); }}
          className="mt-1 w-full bg-surface-container-lowest rounded-xl px-3 py-2 text-on-surface font-medium outline-none border-0 focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <EmojiPopover value={collection.icon} onChange={(icon) => onUpdate({ icon })} />
        <div className="flex flex-wrap gap-2">
          {PRESET_COLOURS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onUpdate({ color: c })}
              className="w-7 h-7 rounded-full transition-transform hover:scale-110 active:scale-95"
              style={{
                background: c,
                outline: collection.color === c ? '2.5px solid white' : 'none',
                outlineOffset: '1.5px',
                boxShadow: collection.color === c ? `0 0 0 3.5px ${c}` : 'none',
              }}
            />
          ))}
        </div>
      </div>

      <div>
        <span className="text-label-md text-on-surface-variant tracking-wide block mb-1">Category</span>
        <PillSelect
          value={collection.category}
          onChange={(v) => onUpdate({ category: v })}
          options={CATEGORIES.map((c) => ({ value: c, label: c }))}
        />
      </div>

      <div>
        <span className="text-label-md text-on-surface-variant tracking-wide block mb-2">Visibility</span>
        <VisibilityToggle value={collection.visibility} onChange={(v) => onUpdate({ visibility: v })} />
      </div>

      <div>
        <span className="text-label-md text-on-surface-variant tracking-wide block mb-1.5">Time of Day</span>
        <div className="flex flex-wrap gap-1.5">
          <TimeSlotPill label="Any time" emoji="🕐" active={!collection.time_slot} onClick={() => onUpdate({ time_slot: null })} />
          {TIME_SLOTS.map((s) => (
            <TimeSlotPill key={s.key} label={s.label} emoji={s.emoji} active={collection.time_slot === s.key} onClick={() => onUpdate({ time_slot: s.key })} />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <span className="text-body-md text-on-surface font-medium block">Include in Frame playback</span>
          <span className="text-label-sm text-on-surface-variant">Cycle these thoughts into Frame's fullscreen slideshow</span>
        </div>
        <Toggle on={!!collection.show_in_frame} onClick={() => onUpdate({ show_in_frame: collection.show_in_frame ? 0 : 1 })} label="Include in Frame playback" />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-label-md text-on-surface-variant tracking-wide">Entries</span>
          {editingEntry === undefined && (
            <button onClick={() => setEditingEntry(null)} className="flex items-center gap-1.5 text-label-sm text-primary px-3 py-1.5 rounded-full hover:bg-primary/10">
              <span className="material-symbols-outlined text-[18px]">add</span>
              Add entry
            </button>
          )}
        </div>

        {editingEntry !== undefined && (
          <div className="mb-3">
            <EntryEditor
              entry={editingEntry}
              saving={createEntry.isPending || updateEntry.isPending}
              onCancel={() => setEditingEntry(undefined)}
              onSave={(data) => {
                const onDone = () => setEditingEntry(undefined);
                if (editingEntry) updateEntry.mutate({ id: editingEntry.id, data }, { onSuccess: onDone });
                else createEntry.mutate(data, { onSuccess: onDone });
              }}
            />
          </div>
        )}

        {isLoading ? (
          <p className="text-body-sm text-on-surface-variant py-6 text-center">Loading entries…</p>
        ) : entries.length === 0 && editingEntry === undefined ? (
          <p className="text-body-sm text-on-surface-variant py-6 text-center">No entries yet — add one to get started.</p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                onEdit={() => setEditingEntry(entry)}
                onToggle={() => updateEntry.mutate({ id: entry.id, data: { enabled: entry.enabled ? 0 : 1 } })}
                onDelete={() => deleteEntry.mutate(entry.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ManageModal({ onClose }) {
  const { collections, createCollection, updateCollection, deleteCollection } = useThoughtCollections();
  const { settings, updateSettings } = useThoughtSettings();
  const [selectedId, setSelectedId] = useState(null);

  // Default to the top collection on open so the editor isn't empty.
  useEffect(() => {
    if (selectedId == null && collections.length > 0) setSelectedId(collections[0].id);
  }, [selectedId, collections]);

  // Buffered locally for the same reason as Frame.jsx's interval input — the
  // query-backed value only updates after the mutation round-trips.
  const [intervalInput, setIntervalInput] = useState(settings?.interval_seconds ?? 15);
  useEffect(() => { if (settings?.interval_seconds != null) setIntervalInput(settings.interval_seconds); }, [settings?.interval_seconds]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Every field already persists immediately on change — this button exists
  // to give the user a visible "saved" confirmation before dismissing, rather
  // than to trigger the actual save.
  const [justSaved, setJustSaved] = useState(false);
  const closeTimer = useRef(null);
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  const handleSave = () => {
    setJustSaved(true);
    closeTimer.current = setTimeout(onClose, 700);
  };

  const addCollection = async () => {
    const collection = await createCollection.mutateAsync({});
    setSelectedId(collection.id);
  };

  const removeCollection = (id) => {
    deleteCollection.mutate(id);
    setSelectedId((current) => (current === id ? null : current));
  };

  const selected = collections.find((c) => c.id === selectedId) || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-surface-container-lowest rounded-3xl shadow-heavy w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-primary text-[22px]">format_quote</span>
            <h2 className="text-headline-sm text-on-surface">Good Thoughts</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-surface-container text-on-surface-variant transition" aria-label="Close">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
          <div className="flex flex-col lg:flex-row gap-4 items-start">
            <div className="w-full lg:w-[360px] flex-shrink-0 bg-surface-container rounded-3xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-body-lg font-bold text-on-surface">Collections</h3>
                <button
                  onClick={addCollection}
                  disabled={createCollection.isPending}
                  className="flex items-center gap-1.5 text-label-sm text-primary px-3 py-1.5 rounded-full hover:bg-primary/10 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>
                  New
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

            <div className="flex-1 min-w-0 w-full bg-surface-container rounded-3xl p-5">
              {selected ? (
                <CollectionEditor
                  key={selected.id}
                  collection={selected}
                  onUpdate={(data) => updateCollection.mutate({ id: selected.id, data })}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-center text-body-sm text-on-surface-variant py-16 px-6">
                  Select a collection on the left, or create a new one, to add and style thoughts.
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 bg-surface-container rounded-3xl p-5">
            <h3 className="text-body-lg font-bold text-on-surface mb-3">Playback</h3>
            <div className="flex flex-wrap gap-6">
              <div className="flex flex-col gap-1.5">
                <span className="text-label-md text-on-surface-variant tracking-wide">Seconds per thought</span>
                <input
                  type="number"
                  min={5}
                  max={300}
                  value={intervalInput}
                  onChange={(e) => setIntervalInput(e.target.value)}
                  onBlur={() => {
                    const parsed = parseInt(intervalInput);
                    const value = Number.isNaN(parsed) ? 15 : parsed;
                    setIntervalInput(value);
                    updateSettings.mutate({ interval_seconds: value });
                  }}
                  className="bg-surface-container-lowest rounded-xl px-3 py-2 text-on-surface border-0 focus:ring-2 focus:ring-primary outline-none w-28"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-label-md text-on-surface-variant tracking-wide">Shuffle all collections</span>
                <Toggle on={!!settings?.shuffle} onClick={() => updateSettings.mutate({ shuffle: settings?.shuffle ? 0 : 1 })} label="Shuffle all collections" />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-label-md text-on-surface-variant tracking-wide">Show attribution</span>
                <Toggle on={(settings?.show_attribution ?? 1) === 1} onClick={() => updateSettings.mutate({ show_attribution: settings?.show_attribution ? 0 : 1 })} label="Show attribution" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-outline-variant/20 flex-shrink-0">
          <button
            type="button"
            onClick={handleSave}
            disabled={justSaved}
            className="flex items-center gap-2 px-6 py-2 rounded-full bg-primary text-on-primary text-label-md font-bold hover:bg-primary/90 disabled:opacity-80 transition"
          >
            {justSaved ? (
              <>
                <span className="material-symbols-outlined text-[18px]">check</span>
                Saved
              </>
            ) : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
