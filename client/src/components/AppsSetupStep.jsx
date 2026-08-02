import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../auth/AuthContext';
import { DEFAULT_IMPORT } from './AiServerPanel';

// Shared "set up your apps" step — rendered both by the first-time SetupWizard
// and by CreateSpaceModal when a new space is created. Every action here just
// kicks off a background job and moves on; nothing blocks Continue.

function AppCard({ icon, title, description, children }) {
  return (
    <div className="rounded-xl bg-surface-container p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-primary text-[20px]">{icon}</span>
        <p className="text-label-lg font-bold text-on-surface">{title}</p>
      </div>
      <p className="text-body-sm text-on-surface-variant">{description}</p>
      {children}
    </div>
  );
}

function EnableButton({ label, busyLabel, doneLabel, busy, done, error, onClick }) {
  if (done) {
    return (
      <p className="text-label-sm text-primary flex items-center gap-1.5">
        <span className="material-symbols-outlined text-[16px]">check_circle</span>
        {doneLabel}
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="flex items-center gap-1.5 px-4 py-2 bg-primary text-on-primary rounded-full text-label-sm font-bold hover:bg-primary/90 transition disabled:opacity-60"
      >
        {busy && <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>}
        {busy ? busyLabel : label}
      </button>
      {error && <p className="text-label-sm text-error">{error}</p>}
    </div>
  );
}

function AiServerCard() {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [activating, setActivating] = useState(false);
  const { data: status } = useQuery({
    queryKey: ['ai-server-status'],
    queryFn: () => api.get('/ai-server/status').then(r => r.data),
    refetchInterval: enabled ? 2000 : false,
  });

  const start = useMutation({ mutationFn: () => api.post('/ai-server/start') });

  const importModel = useMutation({
    mutationFn: () => api.post('/ai-server/models/import', DEFAULT_IMPORT),
    onSuccess: () => setEnabled(true),
  });

  const setActiveModel = useMutation({
    mutationFn: () => api.put('/ai-server/active-model', { model: DEFAULT_IMPORT.name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-server-status'] }),
  });

  const importing = status?.importJob?.status === 'running';
  const imported = status?.importJob?.status === 'done';
  const active = status?.config?.model === DEFAULT_IMPORT.name;

  // One click here should leave the server fully ready — download finishing is
  // also the cue to make it the active model, rather than sending the user to
  // Settings to pick it manually (that manual step is still how a non-default
  // model gets activated).
  useEffect(() => {
    if (imported && !active && !activating) {
      setActivating(true);
      setActiveModel.mutate();
    }
  }, [imported, active, activating]);

  const handleSetup = () => {
    start.mutate();
    importModel.mutate();
  };

  return (
    <AppCard icon="smart_toy" title={<>Paperr A<span className="[font-variant:small-caps]">i</span> Server</>} description="A local, built-in AI model that runs on this machine and steps in automatically if no other AI provider is reachable.">
      {status?.status === 'not_installed' ? (
        <p className="text-label-sm text-on-surface-variant/70">Not available on this machine yet.</p>
      ) : (
        <EnableButton
          label="Set up & download model"
          busyLabel={importing ? 'Downloading in background…' : 'Finishing setup…'}
          doneLabel="Ready to use"
          busy={enabled && (importing || !active)}
          done={enabled && imported && active}
          error={importModel.isError ? (importModel.error?.response?.data?.error || 'Failed to start download') : null}
          onClick={handleSetup}
        />
      )}
    </AppCard>
  );
}

// spaceId is passed explicitly (rather than relying on the api client's
// ambient "current space" header) because during new-space creation the space
// just created isn't the active one yet — see CreateSpaceModal.
function FrameCard({ spaceId }) {
  const [collectionIds, setCollectionIds] = useState({}); // key -> collectionId
  const spaceHeader = spaceId ? { headers: { 'X-Space-Id': String(spaceId) } } : undefined;

  const { data: sets } = useQuery({
    queryKey: ['frame-curated-sets'],
    queryFn: () => api.get('/frame/curated-sets', spaceHeader).then(r => r.data),
  });

  const importSet = useMutation({
    mutationFn: (key) => api.post(`/frame/curated-sets/${key}/import`, {}, spaceHeader).then(r => r.data),
    onSuccess: (collection, key) => setCollectionIds(prev => ({ ...prev, [key]: collection.id })),
  });

  return (
    <AppCard icon="photo_library" title="Frame — Curated Photo Collections" description="Ambient photo screensaver. Add a curated starter collection to get going.">
      <div className="space-y-2">
        {(sets || []).map(set => (
          <FrameSetRow key={set.key} set={set} spaceHeader={spaceHeader} collectionId={collectionIds[set.key]} onAdd={() => importSet.mutate(set.key)} adding={importSet.isPending && importSet.variables === set.key} />
        ))}
      </div>
    </AppCard>
  );
}

function FrameSetRow({ set, spaceHeader, collectionId, onAdd, adding }) {
  const { data: job } = useQuery({
    queryKey: ['frame-import-status', collectionId],
    queryFn: () => api.get(`/frame/collections/${collectionId}/import-status`, spaceHeader).then(r => r.data),
    enabled: !!collectionId,
    refetchInterval: (query) => (query.state.data?.status === 'running' ? 1500 : false),
  });

  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div>
        <p className="text-body-sm text-on-surface font-medium">{set.label}</p>
        <p className="text-label-sm text-on-surface-variant/70">~{set.itemCount} photos</p>
      </div>
      {collectionId ? (
        job?.status === 'running' || adding ? (
          <span className="text-label-sm text-on-surface-variant flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
            {job ? `${job.done}/${job.total}` : 'Starting…'}
          </span>
        ) : (
          <span className="text-label-sm text-primary flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">check_circle</span>
            Added
          </span>
        )
      ) : (
        <button
          type="button"
          onClick={onAdd}
          className="px-3 py-1.5 border border-outline-variant rounded-full text-label-sm text-on-surface-variant hover:bg-surface-container-high transition"
        >
          Add
        </button>
      )}
    </div>
  );
}

// Good Thoughts' curated sets are plain text (no fetch/processing), so the
// import resolves immediately — no job/polling needed like FrameCard's.
function GoodThoughtsCard({ spaceId }) {
  const [addedKeys, setAddedKeys] = useState({}); // key -> true
  const spaceHeader = spaceId ? { headers: { 'X-Space-Id': String(spaceId) } } : undefined;

  const { data: sets } = useQuery({
    queryKey: ['good-thoughts-curated-sets'],
    queryFn: () => api.get('/good-thoughts/curated-sets', spaceHeader).then(r => r.data),
  });

  const importSet = useMutation({
    mutationFn: (key) => api.post(`/good-thoughts/curated-sets/${key}/import`, {}, spaceHeader).then(r => r.data),
    onSuccess: (_collection, key) => setAddedKeys(prev => ({ ...prev, [key]: true })),
  });

  return (
    <AppCard icon="auto_awesome" title="Good Thoughts — Curated Collections" description="Rotating affirmations and quotes. Add a curated starter collection to get going.">
      <div className="space-y-2">
        {(sets || []).map(set => (
          <div key={set.key} className="flex items-center justify-between gap-3 py-1">
            <div>
              <p className="text-body-sm text-on-surface font-medium">{set.label}</p>
              <p className="text-label-sm text-on-surface-variant/70">~{set.itemCount} entries</p>
            </div>
            {addedKeys[set.key] ? (
              <span className="text-label-sm text-primary flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                Added
              </span>
            ) : (
              <button
                type="button"
                onClick={() => importSet.mutate(set.key)}
                disabled={importSet.isPending && importSet.variables === set.key}
                className="px-3 py-1.5 border border-outline-variant rounded-full text-label-sm text-on-surface-variant hover:bg-surface-container-high transition disabled:opacity-60"
              >
                {importSet.isPending && importSet.variables === set.key ? 'Adding…' : 'Add'}
              </button>
            )}
          </div>
        ))}
      </div>
    </AppCard>
  );
}

export default function AppsSetupStep({ mode = 'initial', spaceId, onDone, doneLabel = 'Finish' }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-headline-md text-on-background">Set up your apps</h2>
        <p className="text-body-md text-on-surface-variant mt-1">
          Optional — each one downloads in the background. You can change any of this later in Settings.
        </p>
      </div>

      <div className="space-y-3">
        {/* Machine-wide AI setting — only offered during first-time environment setup, not per-space. */}
        {mode === 'initial' && <AiServerCard />}
        <FrameCard spaceId={spaceId} />
        <GoodThoughtsCard spaceId={spaceId} />
      </div>

      <button
        onClick={onDone}
        className="w-full bg-primary text-on-primary rounded-full py-3 text-label-md font-bold uppercase tracking-wider hover:bg-primary/90 transition"
      >
        {doneLabel}
      </button>
    </div>
  );
}
