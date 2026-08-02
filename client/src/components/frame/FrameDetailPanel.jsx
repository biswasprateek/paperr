import React, { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  DndContext, PointerSensor, useSensor, useSensors, closestCenter,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import PillSelect from '../PillSelect';
import { COLLECTION_TYPES, FRAME_STYLES } from '../../lib/frameOptions';
import { useFramePhotos } from '../../hooks/useFramePhotos';
import { prepareImage, photoFileUrl } from '../../lib/frameUpload';

// A metadata field buffered locally — the query-backed value only updates
// after the mutation round-trips, so typing has to survive that gap.
function MetaField({ label, value, placeholder, maxLength, onCommit, className = '', textSize = 'text-sm' }) {
  const [draft, setDraft] = useState(value || '');
  useEffect(() => { setDraft(value || ''); }, [value]);
  return (
    <label className={`flex flex-col gap-0.5 min-w-0 ${className}`}>
      <span className="text-[0.7rem] font-semibold text-on-surface-variant/70">{label}</span>
      <input
        type="text"
        value={draft}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft !== (value || '')) onCommit(draft); }}
        className={`w-full min-w-0 bg-surface-container rounded-xl px-2.5 py-1.5 ${textSize} text-on-surface outline-none border-0 focus:ring-2 focus:ring-primary placeholder:italic placeholder:text-on-surface-variant/50`}
      />
    </label>
  );
}

function PhotoCard({ photo, isArtwork, onToggle, onUpdate, onDelete }) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: photo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.6 : undefined,
  };

  const enabled = !!photo.enabled;

  return (
    <div ref={setNodeRef} style={style} className="group rounded-2xl overflow-hidden bg-surface-container border border-outline-variant/20">
      <div className="relative aspect-[4/3] bg-surface-container-high">
        <img src={photoFileUrl(photo)} alt="" loading="lazy" draggable={false} className={`w-full h-full object-cover ${enabled ? '' : 'opacity-30'}`} />
        <button
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="absolute bottom-2 left-2 w-7 h-7 rounded-full bg-black/50 text-white items-center justify-center hidden group-hover:flex cursor-grab active:cursor-grabbing touch-none"
        >
          <span className="material-symbols-outlined text-[16px]">drag_indicator</span>
        </button>
        <button
          onClick={onToggle}
          aria-label={enabled ? 'Disable photo' : 'Enable photo'}
          className={`absolute top-2 right-2 w-9 h-5 rounded-full ring-1 ring-inset transition-colors ${enabled ? 'bg-primary ring-primary' : 'bg-surface-container-high ring-outline-variant'}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-surface ring-1 ring-inset ring-outline-variant/60 shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
        <button
          onClick={onDelete}
          aria-label="Delete photo"
          className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/50 text-white items-center justify-center hidden group-hover:flex active:scale-95"
        >
          <span className="material-symbols-outlined text-[16px]">delete</span>
        </button>
      </div>
      <div className="flex flex-col gap-2 px-2.5 py-2.5 border-t border-outline-variant/20">
        <MetaField
          label="Title"
          value={photo.description}
          placeholder={isArtwork ? 'Untitled' : 'Add title'}
          maxLength={140}
          onCommit={(v) => onUpdate({ description: v })}
        />
        {isArtwork && (
          <div className="grid grid-cols-[1fr_3.5rem] gap-3">
            <MetaField label="Artist" value={photo.artist} placeholder="Add artist" maxLength={80} textSize="text-xs" onCommit={(v) => onUpdate({ artist: v })} />
            <MetaField label="Year" value={photo.year} placeholder="—" maxLength={20} textSize="text-xs" onCommit={(v) => onUpdate({ year: v })} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function FrameDetailPanel({ collection, onUpdateCollection }) {
  const [name, setName] = useState(collection?.collection_name || '');
  useEffect(() => { setName(collection?.collection_name || ''); }, [collection?.collection_name]);

  const { photos, isLoading, importJob, uploadPhotos, updatePhoto, deletePhoto, reorderPhotos } = useFramePhotos(collection?.id);

  const qc = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const oldIdx = photos.findIndex((p) => p.id === active.id);
    const newIdx = photos.findIndex((p) => p.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(photos, oldIdx, newIdx);
    qc.setQueryData(['frame-photos', collection.id], reordered); // optimistic
    reorderPhotos.mutate(reordered.map((p) => p.id));
  };

  const fileInputRef = useRef(null);
  // { done, total } while an upload run is in flight, null otherwise.
  const [uploading, setUploading] = useState(null);
  const [uploadError, setUploadError] = useState(null);

  const onFilesPicked = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setUploadError(null);
    setUploading({ done: 0, total: files.length });
    try {
      // Resized client-side (4K cap) then sent in small batches, so one giant
      // request can't stall a slow Wi-Fi link and a mid-run failure keeps
      // everything already uploaded.
      const BATCH = 5;
      for (let i = 0; i < files.length; i += BATCH) {
        const prepared = await Promise.all(files.slice(i, i + BATCH).map(prepareImage));
        const form = new FormData();
        for (const p of prepared) form.append('photos', p.blob, p.filename);
        await uploadPhotos.mutateAsync(form);
        setUploading({ done: Math.min(i + BATCH, files.length), total: files.length });
      }
    } catch {
      setUploadError('Some photos failed to upload — try again.');
    } finally {
      setUploading(null);
    }
  };

  if (!collection) {
    return (
      <div className="h-full flex items-center justify-center text-center text-body-sm text-on-surface-variant py-16 px-6">
        Select a collection on the left to view and edit its photos.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <span className="text-label-sm text-on-surface-variant uppercase tracking-wide">Title — shown at the start of this collection's slideshow</span>
        <input
          type="text"
          value={name}
          placeholder="Untitled collection"
          onChange={(e) => { setName(e.target.value); onUpdateCollection({ collection_name: e.target.value }); }}
          className="mt-1 w-full bg-surface-container rounded-xl px-3 py-2 text-on-surface font-medium outline-none border-0 focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wide block mb-1">Type</span>
          <PillSelect
            value={collection.collection_type}
            onChange={(v) => onUpdateCollection({ collection_type: v })}
            options={COLLECTION_TYPES.map((t) => ({ value: t, label: t }))}
          />
        </div>
        <div className="flex-1">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wide block mb-1">Frame</span>
          <PillSelect
            value={collection.frame_style}
            onChange={(v) => onUpdateCollection({ frame_style: v })}
            options={FRAME_STYLES}
          />
        </div>
      </div>

      {importJob?.status === 'running' && (
        <p className="flex items-center gap-1.5 text-body-sm text-on-surface-variant bg-surface-container rounded-xl px-3 py-2">
          <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
          Downloading this collection's photos in the background — {importJob.done}/{importJob.total} so far.
        </p>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wide">Photos</span>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!!uploading}
            className="flex items-center gap-1.5 text-label-sm text-primary px-3 py-1.5 rounded-full hover:bg-primary/10 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">add_photo_alternate</span>
            {uploading ? `Uploading ${uploading.done}/${uploading.total}…` : 'Add photos'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={onFilesPicked}
          />
        </div>

        {uploadError && (
          <p className="text-body-sm text-error mb-2">{uploadError}</p>
        )}

        {isLoading ? (
          <p className="text-body-sm text-on-surface-variant py-6 text-center">Loading photos…</p>
        ) : photos.length === 0 ? (
          <p className="text-body-sm text-on-surface-variant py-6 text-center">
            No photos yet — add some and they'll play on every device on your network.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={photos.map((p) => p.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {photos.map((photo) => (
                  <PhotoCard
                    key={photo.id}
                    photo={photo}
                    isArtwork={collection.collection_type === 'Artwork'}
                    onToggle={() => updatePhoto.mutate({ id: photo.id, data: { enabled: photo.enabled ? 0 : 1 } })}
                    onUpdate={(data) => updatePhoto.mutate({ id: photo.id, data })}
                    onDelete={() => deletePhoto.mutate(photo.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
