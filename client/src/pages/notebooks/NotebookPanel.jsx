import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import JSZip from 'jszip';
import { api } from '../../auth/AuthContext';
import { useSpaceStore } from '../../store/spaceStore';
import NotebookFormModal from './NotebookFormModal';

async function exportNotebook(nb) {
  const { data } = await api.get(`/notes/notebooks/${nb.id}/export`);
  const zip = new JSZip();
  const folder = zip.folder(nb.name.replace(/[/\\?%*:|"<>]/g, '-'));

  for (const note of data.notes) {
    const safeName = (note.title || 'Untitled').replace(/[/\\?%*:|"<>]/g, '-');
    const frontmatter = [
      '---',
      `title: "${note.title || 'Untitled'}"`,
      `created: ${note.created_at || ''}`,
      `updated: ${note.updated_at || ''}`,
      note.is_pinned ? 'pinned: true' : null,
      '---',
      '',
    ].filter(l => l !== null).join('\n');
    folder.file(`${safeName}.md`, frontmatter + (note.content || ''));
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nb.name.replace(/[/\\?%*:|"<>]/g, '-')}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function NotebookPanel({ selectedId, onSelect, createRequested, onCreateRequestHandled }) {
  const qc = useQueryClient();
  const { currentSpaceId } = useSpaceStore();
  const navigate = useNavigate();

  const [formOpen,      setFormOpen]      = useState(false);
  const [editingNb,     setEditingNb]     = useState(null);
  const [menuId,        setMenuId]        = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [exportingId,   setExportingId]   = useState(null);
  const menuRef = useRef(null);

  // Page-level "New Notebook" button opens the same create form
  useEffect(() => {
    if (createRequested) {
      setEditingNb(null);
      setFormOpen(true);
      onCreateRequestHandled?.();
    }
  }, [createRequested]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!menuId) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuId]);

  const { data: notebooks = [], isLoading } = useQuery({
    queryKey: ['kb', 'notebooks', currentSpaceId],
    queryFn: () => api.get('/notes/notebooks').then(r => r.data),
    enabled: !!currentSpaceId,
  });

  const createNb = useMutation({
    mutationFn: (data) => api.post('/notes/notebooks', data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['kb', 'notebooks'] });
      onSelect(res.data.id);
      navigate(`/notebooks/${res.data.id}`);
    },
  });

  const updateNb = useMutation({
    mutationFn: ({ id, data }) => api.put(`/notes/notebooks/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kb', 'notebooks'] }),
  });

  const deleteNb = useMutation({
    mutationFn: (id) => api.delete(`/notes/notebooks/${id}`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['kb', 'notebooks'] });
      setConfirmDelete(null);
      if (selectedId === id) navigate('/notebooks');
    },
  });

  const handleExport = async (nb) => {
    setMenuId(null);
    setExportingId(nb.id);
    try { await exportNotebook(nb); } finally { setExportingId(null); }
  };

  const openCreate = () => { setEditingNb(null); setFormOpen(true); };
  const openEdit   = (nb) => { setEditingNb(nb); setFormOpen(true); setMenuId(null); };

  const handleSave = (data) => {
    if (editingNb) {
      updateNb.mutate({ id: editingNb.id, data });
    } else {
      createNb.mutate(data);
    }
    setFormOpen(false);
  };

  const handleDeleteConfirm = (nb) => {
    deleteNb.mutate(nb.id);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-outline-variant/20 flex-shrink-0">
        <span className="text-label-md uppercase tracking-wider text-on-surface-variant font-bold">
          Notebooks
        </span>
        <button
          onClick={openCreate}
          title="New notebook"
          className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-2">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <span className="material-symbols-outlined animate-spin text-primary text-xl">progress_activity</span>
          </div>
        ) : notebooks.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <span className="material-symbols-outlined text-3xl text-on-surface-variant/30 block mb-2">book_2</span>
            <p className="text-label-sm text-on-surface-variant/50">No notebooks yet</p>
          </div>
        ) : (
          notebooks.map(nb => (
            <div key={nb.id} className="relative group px-2">
              {confirmDelete?.id === nb.id ? (
                <div className="mb-1 px-3 py-2 rounded-xl bg-error-container/50 border border-error/20">
                  <p className="text-label-sm text-error font-medium mb-2">
                    Delete "{nb.name}"{nb.note_count > 0 ? ` and ${nb.note_count} note${nb.note_count !== 1 ? 's' : ''}` : ''}?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDeleteConfirm(nb)}
                      disabled={deleteNb.isPending}
                      className="flex-1 h-7 rounded-full bg-error text-on-error text-label-sm font-bold transition disabled:opacity-50"
                    >
                      {deleteNb.isPending ? '…' : 'Delete'}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="flex-1 h-7 rounded-full bg-surface-container text-on-surface-variant text-label-sm transition hover:bg-surface-container-high"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { onSelect(nb.id); navigate(`/notebooks/${nb.id}`); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition ${
                    selectedId === nb.id
                      ? 'bg-primary/10 text-primary font-bold'
                      : 'text-on-surface-variant hover:bg-surface-container'
                  }`}
                >
                  <span
                    className="material-symbols-outlined text-[18px] flex-shrink-0"
                    style={{ color: nb.colour }}
                  >
                    {nb.icon}
                  </span>
                  <span className="text-body-sm flex-1 line-clamp-2 leading-tight break-words">
                    {nb.name}
                  </span>
                  {nb.visibility === 'shared' && (
                    <span
                      title="Shared"
                      className="material-symbols-outlined text-[15px] text-on-surface-variant/60 flex-shrink-0"
                    >
                      group
                    </span>
                  )}
                  <span className={`text-label-sm flex-shrink-0 tabular-nums ${selectedId === nb.id ? 'text-primary/60' : 'text-on-surface-variant/40'}`}>
                    {nb.note_count}
                  </span>

                  {/* More menu trigger */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setMenuId(menuId === nb.id ? null : nb.id); }}
                    className="w-6 h-6 rounded-full flex items-center justify-center can-hover:opacity-0 can-hover:group-hover:opacity-100 hover:bg-surface-container-high transition flex-shrink-0"
                  >
                    <span className="material-symbols-outlined text-[14px] text-on-surface-variant">more_vert</span>
                  </button>
                </button>
              )}

              {/* Popover menu */}
              {menuId === nb.id && (
                <div
                  ref={menuRef}
                  className="absolute right-3 top-8 z-50 bg-surface-container-lowest rounded-xl shadow-heavy border border-outline-variant/20 overflow-hidden min-w-[140px]"
                >
                  <button
                    onClick={() => openEdit(nb)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-body-sm text-on-surface hover:bg-surface-container transition"
                  >
                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant">edit</span>
                    Edit
                  </button>
                  <button
                    onClick={() => handleExport(nb)}
                    disabled={exportingId === nb.id}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-body-sm text-on-surface hover:bg-surface-container transition disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                      {exportingId === nb.id ? 'progress_activity' : 'download'}
                    </span>
                    {exportingId === nb.id ? 'Exporting…' : 'Export as .md'}
                  </button>
                  <div className="mx-3 h-px bg-outline-variant/20" />
                  <button
                    onClick={() => { setConfirmDelete(nb); setMenuId(null); }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-body-sm text-error hover:bg-error-container/40 transition"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <NotebookFormModal
        open={formOpen}
        notebook={editingNb}
        onSave={handleSave}
        onClose={() => setFormOpen(false)}
      />
    </div>
  );
}
