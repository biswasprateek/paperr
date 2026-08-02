import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../auth/AuthContext';

const FREQUENCIES = [
  { value: 'daily',   label: 'Daily'   },
  { value: 'weekly',  label: 'Weekly'  },
  { value: 'monthly', label: 'Monthly' },
];

const RETENTIONS = [
  { value: 30,  label: '30 days' },
  { value: 90,  label: '90 days' },
  { value: 180, label: '6 months' },
  { value: 365, label: '1 year' },
  { value: 0,   label: 'Forever' },
];

function formatBytes(n) {
  if (!n) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(d) {
  if (!d) return '—';
  try {
    return new Date(d.replace(' ', 'T') + 'Z').toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch { return d; }
}

export default function BackupModal({ onClose }) {
  const qc = useQueryClient();
  const [activeAction, setActiveAction] = useState(null); // { id, type: 'restore' | 'delete' }
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [restored, setRestored] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ['backup-settings'],
    queryFn: () => api.get('/backups/settings').then(r => r.data),
  });

  const { data: backups = [] } = useQuery({
    queryKey: ['backups'],
    queryFn: () => api.get('/backups').then(r => r.data),
  });

  const updateSettings = useMutation({
    mutationFn: (patch) => api.put('/backups/settings', patch),
    onSuccess: ({ data }) => qc.setQueryData(['backup-settings'], data),
  });

  const createBackup = useMutation({
    mutationFn: () => api.post('/backups'),
    onMutate: () => { setCreating(true); setCreated(false); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backups'] });
      qc.invalidateQueries({ queryKey: ['backup-settings'] });
      setCreated(true);
      setTimeout(() => setCreated(false), 2500);
    },
    onSettled: () => setCreating(false),
  });

  const restoreBackup = useMutation({
    mutationFn: (id) => api.post(`/backups/${id}/restore`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backups'] });
      setActiveAction(null);
      setRestored(true);
    },
  });

  const deleteBackup = useMutation({
    mutationFn: (id) => api.delete(`/backups/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backups'] });
      setActiveAction(null);
    },
  });

  if (!settings) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-surface-container-lowest rounded-2xl shadow-heavy w-full max-w-xl mx-4 p-6 overflow-y-auto max-h-[90vh] space-y-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">backup</span>
            <h2 className="text-headline-sm text-on-surface">Database Backups</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-surface-container text-on-surface-variant transition"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {restored && (
          <div className="flex items-center gap-2 px-4 py-3 bg-primary/10 text-primary rounded-xl text-body-md">
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            Database restored. Reload the app to see the restored data.
          </div>
        )}

        {/* Manual backup */}
        <section className="space-y-3">
          <p className="text-label-md text-on-surface-variant font-bold uppercase tracking-wider">Manual Backup</p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => createBackup.mutate()}
              disabled={creating}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary rounded-full text-label-md font-bold hover:bg-primary/90 transition disabled:opacity-50"
            >
              {creating
                ? <><span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>Creating…</>
                : created ? <><span className="material-symbols-outlined text-[16px]">check</span>Backup Created</>
                : <><span className="material-symbols-outlined text-[16px]">add</span>Create Backup Now</>
              }
            </button>
          </div>
        </section>

        {/* Auto-backup settings */}
        <section className="space-y-4 pt-1 border-t border-outline-variant/20">
          <div className="flex items-center justify-between">
            <p className="text-label-md text-on-surface-variant font-bold uppercase tracking-wider">Automatic Backups</p>
            <button
              onClick={() => updateSettings.mutate({ auto_enabled: !settings.auto_enabled })}
              aria-label="Automatic backups"
              className={`w-11 h-6 rounded-full ring-1 ring-inset transition-colors relative flex-shrink-0 ${settings.auto_enabled ? 'bg-primary ring-primary' : 'bg-surface-container-high ring-outline-variant'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-surface ring-1 ring-inset ring-outline-variant/60 shadow transition-transform ${settings.auto_enabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          {settings.auto_enabled && (
            <>
              <div>
                <label className="block text-label-md text-on-surface-variant mb-2">Frequency</label>
                <div className="flex gap-2">
                  {FREQUENCIES.map(f => (
                    <button
                      key={f.value}
                      onClick={() => updateSettings.mutate({ frequency: f.value })}
                      className={`flex-1 py-2.5 rounded-full text-label-md font-bold transition border ${
                        settings.frequency === f.value
                          ? 'bg-primary text-on-primary border-primary'
                          : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-label-md text-on-surface-variant mb-2">Keep backups for</label>
                <div className="flex gap-2 flex-wrap">
                  {RETENTIONS.map(r => (
                    <button
                      key={r.value}
                      onClick={() => updateSettings.mutate({ retention_days: r.value })}
                      className={`px-4 py-2 rounded-full text-label-md font-bold transition border ${
                        settings.retention_days === r.value
                          ? 'bg-primary text-on-primary border-primary'
                          : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <p className="text-label-sm text-on-surface-variant/60 mt-1.5">
                  Backups older than this are deleted automatically.
                </p>
              </div>
            </>
          )}

          {settings.last_backup_at && (
            <p className="text-label-sm text-on-surface-variant">
              Last backup: {formatDate(settings.last_backup_at)}
            </p>
          )}
        </section>

        {/* Backup list */}
        <section className="space-y-3 pt-1 border-t border-outline-variant/20">
          <p className="text-label-md text-on-surface-variant font-bold uppercase tracking-wider">Existing Backups</p>

          {backups.length === 0 && (
            <p className="text-body-md text-on-surface-variant text-center py-4">No backups yet.</p>
          )}

          <ul className="space-y-2">
            {backups.map(b => {
              const isActive   = activeAction?.id === b.id;
              const isRestore  = isActive && activeAction.type === 'restore';
              const isDel      = isActive && activeAction.type === 'delete';

              return (
                <li key={b.id} className="rounded-xl bg-surface-container overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className={`material-symbols-outlined text-[18px] flex-shrink-0 ${b.type === 'manual' ? 'text-primary' : 'text-on-surface-variant/60'}`}>
                      {b.type === 'manual' ? 'person' : 'schedule'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-body-md text-on-surface font-medium">{formatDate(b.created_at)}</p>
                      <p className="text-label-sm text-on-surface-variant">
                        {b.type === 'manual' ? 'Manual' : 'Automatic'}
                        {b.created_by_name ? ` · ${b.created_by_name}` : ''} · {formatBytes(b.size_bytes)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        title="Restore"
                        onClick={() => setActiveAction(isRestore ? null : { id: b.id, type: 'restore' })}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition ${
                          isRestore ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-primary'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[18px]">restore</span>
                      </button>
                      <button
                        title="Delete"
                        onClick={() => setActiveAction(isDel ? null : { id: b.id, type: 'delete' })}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition ${
                          isDel ? 'bg-error text-white' : 'text-on-surface-variant hover:bg-error-container hover:text-error'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </div>

                  {isRestore && (
                    <div className="px-4 pb-4 pt-1 border-t border-outline-variant/20 space-y-3">
                      <p className="text-body-md text-on-surface">
                        Restore the database to this backup? Current data will be replaced —
                        a safety snapshot of the current state is taken first.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => restoreBackup.mutate(b.id)}
                          disabled={restoreBackup.isPending}
                          className="h-10 px-5 rounded-full bg-primary text-on-primary text-label-md font-bold hover:bg-primary/90 transition disabled:opacity-40 flex items-center gap-2"
                        >
                          {restoreBackup.isPending
                            ? <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                            : <span className="material-symbols-outlined text-[16px]">restore</span>
                          }
                          {restoreBackup.isPending ? 'Restoring…' : 'Yes, Restore'}
                        </button>
                        <button
                          onClick={() => setActiveAction(null)}
                          className="h-10 px-5 rounded-full border border-outline-variant text-on-surface-variant text-label-md font-bold hover:bg-surface-container transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {isDel && (
                    <div className="px-4 pb-4 pt-1 border-t border-outline-variant/20 space-y-3">
                      <p className="text-body-md text-on-surface">Delete this backup? This cannot be undone.</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => deleteBackup.mutate(b.id)}
                          disabled={deleteBackup.isPending}
                          className="h-10 px-5 rounded-full bg-error text-white text-label-md font-bold hover:bg-error/90 transition disabled:opacity-40 flex items-center gap-2"
                        >
                          {deleteBackup.isPending
                            ? <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                            : <span className="material-symbols-outlined text-[16px]">delete</span>
                          }
                          {deleteBackup.isPending ? 'Deleting…' : 'Yes, Delete'}
                        </button>
                        <button
                          onClick={() => setActiveAction(null)}
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
        </section>
      </div>
    </div>
  );
}
