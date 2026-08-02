import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../auth/AuthContext';

export const DEFAULT_IMPORT = {
  repo: 'litert-community/gemma-4-E2B-it-litert-lm',
  file: 'gemma-4-E2B-it-web.litertlm',
  name: 'gemma4-e2b-web',
};

const STATUS_META = {
  running:       { label: 'Running',       icon: 'check_circle',     tone: 'bg-primary/10 text-primary' },
  starting:      { label: 'Starting…',     icon: 'progress_activity', tone: 'bg-warning-container text-on-warning-container', spin: true },
  stopping:      { label: 'Stopping…',     icon: 'progress_activity', tone: 'bg-surface-container-high text-on-surface-variant', spin: true },
  stopped:       { label: 'Stopped',       icon: 'stop_circle',      tone: 'bg-surface-container-high text-on-surface-variant' },
  not_installed: { label: 'Not Installed', icon: 'error',            tone: 'bg-error-container text-error' },
  error:         { label: 'Error',         icon: 'error',            tone: 'bg-error-container text-error' },
};

// Inline panel — rendered directly in Settings' "paperrAi Server" section
// (no overlay/close button; the section header above it owns the title/copy).
export default function AiServerPanel() {
  const qc = useQueryClient();
  const [showImportForm, setShowImportForm] = useState(false);
  const [importForm, setImportForm] = useState(DEFAULT_IMPORT);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: status } = useQuery({
    queryKey: ['ai-server-status'],
    queryFn: () => api.get('/ai-server/status').then(r => r.data),
    refetchInterval: 2000,
  });

  const { data: modelsData } = useQuery({
    queryKey: ['ai-server-models'],
    queryFn: () => api.get('/ai-server/models').then(r => r.data),
    refetchInterval: 2000,
  });
  const models = modelsData?.models || [];

  const openFolder = useMutation({
    mutationFn: () => api.post('/ai-server/models/open-folder'),
  });

  const start = useMutation({
    mutationFn: () => api.post('/ai-server/start'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-server-status'] }),
  });

  const stop = useMutation({
    mutationFn: () => api.post('/ai-server/stop'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-server-status'] }),
  });

  const setActiveModel = useMutation({
    mutationFn: (model) => api.put('/ai-server/active-model', { model }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-server-status'] }),
  });

  const importModel = useMutation({
    mutationFn: (data) => api.post('/ai-server/models/import', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-server-status'] });
      setShowImportForm(false);
    },
  });

  const deleteModel = useMutation({
    mutationFn: (id) => api.delete(`/ai-server/models/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-server-models'] });
      setDeleteTarget(null);
    },
  });

  if (!status) return null;

  const meta = STATUS_META[status.status] || STATUS_META.stopped;
  const activeModel = status.config?.model;
  const importing = status.importJob?.status === 'running';

  return (
    <div className="space-y-6">
      {/* Status */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-4 py-3 bg-surface-container rounded-xl">
          <div className="flex items-center gap-2">
            <span className={`w-8 h-8 rounded-full flex items-center justify-center ${meta.tone}`}>
              <span className={`material-symbols-outlined text-[18px] ${meta.spin ? 'animate-spin' : ''}`}>{meta.icon}</span>
            </span>
            <div>
              <p className="text-body-md text-on-surface font-medium">{meta.label}</p>
              <p className="text-label-sm text-on-surface-variant">
                {status.host}:{status.port}{status.pid ? ` · pid ${status.pid}` : ''}
                {status.memoryMB ? ` · ${(status.memoryMB / 1024).toFixed(1)} GB RAM` : ''}
              </p>
            </div>
          </div>

          {status.status === 'running' || status.status === 'starting' ? (
            <button
              onClick={() => stop.mutate()}
              disabled={stop.isPending || status.status === 'starting'}
              className="px-4 py-2 rounded-full border border-outline-variant text-on-surface-variant text-label-md font-bold hover:bg-surface-container-high transition disabled:opacity-50"
            >
              {stop.isPending ? 'Stopping…' : 'Stop'}
            </button>
          ) : (
            <button
              onClick={() => start.mutate()}
              disabled={start.isPending || status.status === 'not_installed' || status.status === 'stopping'}
              className="px-4 py-2 rounded-full bg-primary text-on-primary text-label-md font-bold hover:bg-primary/90 transition disabled:opacity-40"
            >
              {start.isPending ? 'Starting…' : 'Start'}
            </button>
          )}
        </div>

        {status.status === 'not_installed' && (
          <p className="text-label-sm text-error bg-error-container px-4 py-2.5 rounded-xl">
            litert-lm isn't installed yet. Install it into <span className="font-mono">server/ai/litert/venv</span> to enable this feature.
          </p>
        )}
        {status.status === 'error' && status.lastError && (
          <p className="text-label-sm text-error bg-error-container px-4 py-2.5 rounded-xl">{status.lastError}</p>
        )}
      </section>

      {/* Models */}
      <section className="space-y-3 pt-1 border-t border-outline-variant/20">
        <div className="flex items-center justify-between">
          <p className="text-label-md text-on-surface-variant font-bold uppercase tracking-wider">Models</p>
          <div className="flex items-center gap-2">
            <button
              title="Open models folder"
              onClick={() => openFolder.mutate()}
              disabled={openFolder.isPending || !modelsData?.dir}
              className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-primary transition disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[18px]">folder_open</span>
            </button>
            {!showImportForm && (
              <button
                onClick={() => setShowImportForm(true)}
                disabled={status.status === 'not_installed'}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-outline-variant rounded-full text-label-sm text-on-surface-variant hover:bg-surface-container-high transition disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-[14px]">download</span>
                Import Model
              </button>
            )}
          </div>
        </div>

        {models.length === 0 && !importing && (
          <p className="text-body-md text-on-surface-variant text-center py-3">No models imported yet.</p>
        )}

        <ul className="space-y-2">
          {models.map((m) => {
            const isActive = m.id === activeModel;
            const isDel = deleteTarget === m.id;
            return (
              <li key={m.id} className="rounded-xl bg-surface-container overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-body-md text-on-surface font-medium truncate">{m.id}</p>
                    <p className="text-label-sm text-on-surface-variant">{m.size}{m.modified ? ` · ${m.modified}` : ''}</p>
                  </div>
                  {isActive ? (
                    <span className="px-2.5 py-1 rounded-full text-label-sm font-bold bg-primary/10 text-primary flex-shrink-0">Active</span>
                  ) : (
                    <button
                      onClick={() => setActiveModel.mutate(m.id)}
                      disabled={setActiveModel.isPending}
                      className="px-3 py-1.5 rounded-full border border-outline-variant text-label-sm text-on-surface-variant hover:bg-surface-container-high transition flex-shrink-0"
                    >
                      Set Active
                    </button>
                  )}
                  <button
                    title="Delete"
                    onClick={() => setDeleteTarget(isDel ? null : m.id)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition flex-shrink-0 ${
                      isDel ? 'bg-error text-white' : 'text-on-surface-variant hover:bg-error-container hover:text-error'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>

                {isDel && (
                  <div className="px-4 pb-4 pt-1 border-t border-outline-variant/20 space-y-3">
                    <p className="text-body-md text-on-surface">Delete <span className="font-mono">{m.id}</span> from local storage?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => deleteModel.mutate(m.id)}
                        disabled={deleteModel.isPending}
                        className="h-10 px-5 rounded-full bg-error text-white text-label-md font-bold hover:bg-error/90 transition disabled:opacity-40"
                      >
                        {deleteModel.isPending ? 'Deleting…' : 'Yes, Delete'}
                      </button>
                      <button
                        onClick={() => setDeleteTarget(null)}
                        className="h-10 px-5 rounded-full border border-outline-variant text-on-surface-variant text-label-md font-bold hover:bg-surface-container transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {/* Import form */}
        {showImportForm && (
          <div className="rounded-xl bg-surface-container p-4 space-y-3">
            <p className="text-label-md text-on-surface-variant font-bold tracking-wider">Import Model</p>
            {[
              { key: 'repo', label: 'HuggingFace repo' },
              { key: 'file', label: 'Model file' },
              { key: 'name', label: 'Local model name' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="block text-label-sm text-on-surface-variant mb-1">{label}</label>
                <input
                  type="text"
                  value={importForm[key]}
                  onChange={e => setImportForm(prev => ({ ...prev, [key]: e.target.value }))}
                  className="w-full rounded-lg bg-surface-container-high px-3 py-2 text-body-md text-on-surface border-none focus:ring-2 focus:ring-primary/20 font-mono"
                />
              </div>
            ))}
            {importModel.isError && (
              <p className="text-label-sm text-error">{importModel.error?.response?.data?.error || importModel.error.message}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => importModel.mutate(importForm)}
                disabled={importModel.isPending || !importForm.file.trim()}
                className="h-10 px-5 rounded-full bg-primary text-on-primary text-label-md font-bold hover:bg-primary/90 transition disabled:opacity-40"
              >
                {importModel.isPending ? 'Starting…' : 'Start Import'}
              </button>
              <button
                onClick={() => setShowImportForm(false)}
                className="h-10 px-5 rounded-full border border-outline-variant text-on-surface-variant text-label-md font-bold hover:bg-surface-container-high transition"
              >
                Cancel
              </button>
            </div>
            <p className="text-label-sm text-on-surface-variant/70">
              This downloads a multi-GB model file — it can take a while depending on your connection.
            </p>
          </div>
        )}

        {importing && (
          <div className="rounded-xl bg-surface-container p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] animate-spin text-primary">progress_activity</span>
              <p className="text-body-md text-on-surface font-medium">Importing {status.importJob.name || status.importJob.file}…</p>
            </div>
            {status.importJob.log && (
              <pre className="text-label-sm text-on-surface-variant/70 font-mono whitespace-pre-wrap max-h-24 overflow-y-auto">
                {status.importJob.log.slice(-500)}
              </pre>
            )}
          </div>
        )}

        {status.importJob?.status === 'error' && (
          <p className="text-label-sm text-error bg-error-container px-4 py-2.5 rounded-xl">
            Import failed: {status.importJob.error}
          </p>
        )}
      </section>
    </div>
  );
}
