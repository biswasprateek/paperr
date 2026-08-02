import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import MDEditor, { commands } from '@uiw/react-md-editor';
import { api } from '../../auth/AuthContext';
import { useUiStore } from '../../store/uiStore';

const AUTOSAVE_DELAY = 1500;

/* Curated toolbar — text formatting plus explicit list, checkbox and table actions. */
const EDITOR_COMMANDS = [
  commands.bold,
  commands.italic,
  commands.strikethrough,
  commands.divider,
  commands.title,
  commands.quote,
  commands.code,
  commands.codeBlock,
  commands.link,
  commands.divider,
  commands.unorderedListCommand,
  commands.orderedListCommand,
  commands.checkedListCommand,
  commands.divider,
  commands.table,
];

export default function NoteEditor({ notebookId, noteId }) {
  const qc    = useQueryClient();
  const theme = useUiStore(s => s.theme);

  const [title,    setTitle]    = useState('');
  const [content,  setContent]  = useState('');
  const [isDirty,  setIsDirty]  = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  const saveTimer   = useRef(null);
  const initialLoad = useRef(true);

  const { data: note, isLoading } = useQuery({
    queryKey: ['kb', 'note', notebookId, noteId],
    queryFn: () => api.get(`/notes/notebooks/${notebookId}/notes/${noteId}`).then(r => r.data),
    enabled: !!notebookId && !!noteId,
  });

  useEffect(() => {
    if (note) {
      initialLoad.current = true;
      setTitle(note.title || '');
      setContent(note.content || '');
      setIsDirty(false);
      setLastSaved(null);
    }
  }, [note?.id]);

  const saveNote = useMutation({
    mutationFn: (data) => api.put(`/notes/notebooks/${notebookId}/notes/${noteId}`, data),
    onMutate: () => setIsSaving(true),
    onSuccess: (res) => {
      qc.setQueryData(['kb', 'note', notebookId, noteId], res.data);
      qc.invalidateQueries({ queryKey: ['kb', 'notes', notebookId] });
      setIsDirty(false);
      setIsSaving(false);
      setLastSaved(new Date());
    },
    onError: () => setIsSaving(false),
  });

  const triggerSave = useCallback((t, c) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveNote.mutate({ title: t, content: c });
    }, AUTOSAVE_DELAY);
  }, [notebookId, noteId]);

  const handleTitleChange = (e) => {
    if (initialLoad.current) { initialLoad.current = false; return; }
    const val = e.target.value;
    setTitle(val);
    setIsDirty(true);
    triggerSave(val, content);
  };

  const handleContentChange = (val = '') => {
    if (initialLoad.current) { initialLoad.current = false; return; }
    setContent(val);
    setIsDirty(true);
    triggerSave(title, val);
  };

  const saveNow = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveNote.mutate({ title, content });
  }, [title, content, notebookId, noteId]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isDirty) saveNow();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isDirty, saveNow]);

  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  if (!noteId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-on-surface-variant/30 select-none">
        <span className="material-symbols-outlined text-6xl mb-3">menu_book</span>
        <p className="text-body-lg">Select a note to start writing</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
      </div>
    );
  }

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  const statusText = isSaving
    ? 'Saving…'
    : isDirty
      ? `Unsaved · ${wordCount} words`
      : lastSaved
        ? 'Saved'
        : `${wordCount} words`;

  return (
    <div className="flex flex-col h-full" data-color-mode={theme === 'dark' ? 'dark' : 'light'}>
      {/* Title + save status — view-mode toggles live in the editor's own toolbar */}
      <div className="flex items-baseline gap-3 px-4 pt-5 pb-2 flex-shrink-0">
        <input
          type="text"
          value={title}
          onChange={handleTitleChange}
          placeholder="Note title…"
          className="flex-1 min-w-0 text-headline-md text-on-surface bg-transparent border-none outline-none placeholder-on-surface-variant/30"
        />
        <span className={`text-label-sm flex-shrink-0 bg-surface-container px-2.5 py-1 rounded-full ${
          isSaving ? 'text-primary' : isDirty ? 'text-warning' : 'text-on-surface-variant/70'
        }`}>
          {statusText}
        </span>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden px-4 pb-4">
        <MDEditor
          value={content}
          onChange={handleContentChange}
          preview="live"
          commands={EDITOR_COMMANDS}
          tabSize={2}
          height="100%"
          style={{ height: '100%' }}
          visibleDragbar={false}
        />
      </div>
    </div>
  );
}
