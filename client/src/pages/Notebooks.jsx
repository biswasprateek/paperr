import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMode } from '../hooks/useMode';
import NotebookPanel  from './notebooks/NotebookPanel';
import NoteListPanel  from './notebooks/NoteListPanel';
import NoteEditor     from './notebooks/NoteEditor';

export default function Notebooks() {
  const { notebookId: nbParam, noteId: noteParam } = useParams();
  const { mode } = useMode();

  const notebookId = nbParam ? parseInt(nbParam) : null;
  const noteId     = noteParam ? parseInt(noteParam) : null;

  const [selectedNotebookId, setSelectedNotebookId] = useState(notebookId);
  const [createRequested, setCreateRequested] = useState(false);

  const activeNotebookId = notebookId ?? selectedNotebookId;

  // Phone: drill-down — show only the deepest active panel. There's no room
  // for a multi-pane layout at phone widths.
  if (mode === 'phone') {
    if (noteId && activeNotebookId) {
      return (
        <div className="h-full">
          <NoteEditor notebookId={activeNotebookId} noteId={noteId} />
        </div>
      );
    }
    if (activeNotebookId) {
      return (
        <div className="h-full">
          <NoteListPanel notebookId={activeNotebookId} selectedNoteId={noteId} />
        </div>
      );
    }
    return (
      <div className="h-full">
        <NotebookPanel selectedId={activeNotebookId} onSelect={setSelectedNotebookId} />
      </div>
    );
  }

  // Tablet + desktop: page shell (header + max-w-7xl) with a 3-pane card.
  // Tablet's shell chrome (header, page padding) is shorter than desktop's,
  // so it gets a taller card; its panes also narrow a bit below the lg
  // breakpoint to leave the editor room on portrait-width tablets.
  const cardHeight = mode === 'tablet' ? 'h-[calc(100vh-11.5rem)]' : 'h-[calc(100vh-13.5rem)]';

  return (
    <div className="max-w-7xl mx-auto w-full">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-headline-lg text-on-background">Notebooks</h1>
        <button
          onClick={() => setCreateRequested(true)}
          className="flex items-center gap-2 bg-primary text-on-primary rounded-full px-5 py-2.5 text-label-md font-bold hover:bg-primary/90 transition active:scale-[0.97]"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          New Notebook
        </button>
      </div>

      {/* 3-pane card */}
      <div className={`flex ${cardHeight} rounded-2xl border border-outline-variant/20 bg-surface-container-lowest overflow-hidden`}>
        {/* Left: notebook list */}
        <div className="w-44 lg:w-52 flex-shrink-0 border-r border-outline-variant/20 overflow-y-auto">
          <NotebookPanel
            selectedId={activeNotebookId}
            onSelect={setSelectedNotebookId}
            createRequested={createRequested}
            onCreateRequestHandled={() => setCreateRequested(false)}
          />
        </div>

        {/* Middle: notes in notebook */}
        <div className="w-60 lg:w-72 flex-shrink-0 border-r border-outline-variant/20 overflow-hidden flex flex-col">
          <NoteListPanel notebookId={activeNotebookId} selectedNoteId={noteId} />
        </div>

        {/* Right: editor */}
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          <NoteEditor notebookId={activeNotebookId} noteId={noteId} />
        </div>
      </div>
    </div>
  );
}
