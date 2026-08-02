import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { api } from '../../auth/AuthContext';

export default function NoteListPanel({ notebookId, selectedNoteId }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const { data: notebooks = [] } = useQuery({ queryKey: ['kb', 'notebooks'] });
  const notebook = notebooks.find(nb => nb.id === notebookId);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['kb', 'notes', notebookId],
    queryFn: () => api.get(`/notes/notebooks/${notebookId}/notes`).then(r => r.data),
    enabled: !!notebookId,
  });

  const createNote = useMutation({
    mutationFn: () => api.post(`/notes/notebooks/${notebookId}/notes`, { title: 'Untitled' }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['kb', 'notes', notebookId] });
      navigate(`/notebooks/${notebookId}/${res.data.id}`);
    },
  });

  const filtered = search.trim()
    ? notes.filter(n => n.title.toLowerCase().includes(search.trim().toLowerCase()))
    : notes;

  const pinned   = filtered.filter(n => n.is_pinned);
  const unpinned = filtered.filter(n => !n.is_pinned);

  if (!notebookId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-on-surface-variant/40 px-6 text-center">
        <span className="material-symbols-outlined text-4xl mb-2">book_2</span>
        <p className="text-label-md">Select a notebook</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-outline-variant/20 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0">
            {notebook && (
              <span
                className="material-symbols-outlined text-[20px] flex-shrink-0"
                style={{ color: notebook.colour }}
              >
                {notebook.icon}
              </span>
            )}
            <h2 className="text-body-md font-semibold text-on-surface truncate">
              {notebook?.name || 'Notes'}
            </h2>
          </div>
          <button
            onClick={() => createNote.mutate()}
            disabled={createNote.isPending}
            title="New note"
            className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition flex-shrink-0 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[14px] text-on-surface-variant/40 pointer-events-none">
            search
          </span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter notes…"
            className="w-full bg-surface-container rounded-full pl-8 pr-3 h-8 text-label-md text-on-surface placeholder-on-surface-variant/40 border border-outline-variant/20 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition"
          />
        </div>
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <span className="material-symbols-outlined animate-spin text-primary text-xl">progress_activity</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <span className="material-symbols-outlined text-3xl text-on-surface-variant/30 block mb-2">
              {search ? 'search_off' : 'description'}
            </span>
            <p className="text-label-sm text-on-surface-variant/50">
              {search ? 'No notes match' : 'No notes yet'}
            </p>
            {!search && (
              <button
                onClick={() => createNote.mutate()}
                className="mt-3 text-primary text-label-sm hover:underline"
              >
                Create first note
              </button>
            )}
          </div>
        ) : (
          <div className="py-1">
            {[...pinned, ...unpinned].map(note => (
              <NoteRow
                key={note.id}
                note={note}
                isSelected={selectedNoteId === note.id}
                notebookId={notebookId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NoteRow({ note, isSelected, notebookId }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const togglePin = useMutation({
    mutationFn: () =>
      api.put(`/notes/notebooks/${notebookId}/notes/${note.id}`, { is_pinned: note.is_pinned ? 0 : 1 }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kb', 'notes', notebookId] }),
  });

  const deleteNote = useMutation({
    mutationFn: () => api.delete(`/notes/notebooks/${notebookId}/notes/${note.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kb', 'notes', notebookId] });
      if (isSelected) navigate(`/notebooks/${notebookId}`);
    },
  });

  return (
    <button
      onClick={() => navigate(`/notebooks/${notebookId}/${note.id}`)}
      className={`group w-full text-left px-4 py-3 transition border-b border-outline-variant/10 last:border-0 ${
        isSelected
          ? 'bg-primary/10'
          : 'hover:bg-surface-container'
      }`}
    >
      <div className="flex items-start gap-1.5 mb-1">
        <p className={`text-body-sm truncate flex-1 ${isSelected ? 'text-primary font-medium' : 'text-on-surface'}`}>
          {note.title || 'Untitled'}
        </p>
        <span
          onClick={(e) => { e.stopPropagation(); togglePin.mutate(); }}
          title={note.is_pinned ? 'Unpin note' : 'Pin note'}
          className={`material-symbols-outlined text-[14px] mt-0.5 flex-shrink-0 cursor-pointer transition ${
            note.is_pinned
              ? 'text-primary'
              : 'text-on-surface-variant/30 can-hover:opacity-0 can-hover:group-hover:opacity-100 hover:text-primary'
          }`}
        >
          push_pin
        </span>
        {confirmDelete ? (
          <span className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <span
              onClick={() => deleteNote.mutate()}
              title="Confirm delete"
              className="material-symbols-outlined text-[14px] mt-0.5 cursor-pointer text-error hover:opacity-70 transition"
            >
              check
            </span>
            <span
              onClick={() => setConfirmDelete(false)}
              title="Cancel"
              className="material-symbols-outlined text-[14px] mt-0.5 cursor-pointer text-on-surface-variant/50 hover:text-on-surface transition"
            >
              close
            </span>
          </span>
        ) : (
          <span
            onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
            title="Delete note"
            className="material-symbols-outlined text-[14px] mt-0.5 flex-shrink-0 cursor-pointer transition text-on-surface-variant/50 hover:text-error"
          >
            delete
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 ml-0">
        <span className="text-label-sm text-on-surface-variant/50">
          {note.updated_at
            ? formatDistanceToNow(parseISO(note.updated_at), { addSuffix: true })
            : '—'}
        </span>
        {note.word_count > 0 && (
          <>
            <span className="text-on-surface-variant/30 text-label-sm">·</span>
            <span className="text-label-sm text-on-surface-variant/40">{note.word_count}w</span>
          </>
        )}
      </div>
    </button>
  );
}
