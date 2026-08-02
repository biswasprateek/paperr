import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../auth/AuthContext';
import { useAuthStore } from '../store/authStore';
import WidgetShell, { WidgetEmpty } from './WidgetShell';

const STATUS_META = {
  running:       { label: 'Running',       tone: 'bg-primary/10 text-primary' },
  starting:      { label: 'Starting…',     tone: 'bg-warning-container text-on-warning-container' },
  stopping:      { label: 'Stopping…',     tone: 'bg-warning-container text-on-warning-container' },
  stopped:       { label: 'Stopped',       tone: 'bg-surface-container-high text-on-surface-variant' },
  not_installed: { label: 'Not Installed', tone: 'bg-error-container text-error' },
  error:         { label: 'Error',         tone: 'bg-error-container text-error' },
};

/**
 * Home-only, admin-only widget: power the bundled AI server, see what it's
 * costing in memory, cycle which provider is active, and glance at which
 * local model is loaded. Collapses to just the power switch + memory at its
 * minimum size; the connection switcher and model list need the room a
 * larger size gives.
 */
export function AIServerWidget({ editing, w = 2, h = 2 }) {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const qc = useQueryClient();
  const compact = w <= 1 && h <= 1;

  const { data: status } = useQuery({
    queryKey: ['ai-server-status'],
    queryFn: () => api.get('/ai-server/status').then(r => r.data),
    refetchInterval: 2000,
    enabled: isAdmin,
  });
  const { data: modelsData } = useQuery({
    queryKey: ['ai-server-models'],
    queryFn: () => api.get('/ai-server/models').then(r => r.data),
    refetchInterval: 2000,
    enabled: isAdmin && !compact,
  });
  const { data: configs = [] } = useQuery({
    queryKey: ['llm-configurations'],
    queryFn: () => api.get('/admin/llm-configurations').then(r => r.data),
    enabled: isAdmin && !compact,
  });

  const start = useMutation({
    mutationFn: () => api.post('/ai-server/start'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-server-status'] }),
  });
  const stop = useMutation({
    mutationFn: () => api.post('/ai-server/stop'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-server-status'] }),
  });
  const activateConfig = useMutation({
    mutationFn: (id) => api.post(`/admin/llm-configurations/${id}/activate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['llm-configurations'] }),
  });

  if (!isAdmin) {
    return (
      <WidgetShell icon="dns" title="Ai Manager" editing={editing}>
        <WidgetEmpty icon="lock" label="Visible to admins only" />
      </WidgetShell>
    );
  }
  if (!status) return null;

  const meta = STATUS_META[status.status] || STATUS_META.stopped;
  const busy = status.status === 'starting' || status.status === 'stopping';
  const running = status.status === 'running' || status.status === 'starting';
  const memory = status.memoryMB ? `${(status.memoryMB / 1024).toFixed(1)} GB` : '—';

  const togglePower = () => {
    if (busy) return;
    if (status.status === 'running') stop.mutate();
    else if (status.status === 'stopped' || status.status === 'error') start.mutate();
  };

  const activeConfig = configs.find(c => c.is_active);
  const cycleConnection = () => {
    if (configs.length < 2) return;
    const idx = configs.findIndex(c => c.is_active);
    const next = configs[(idx + 1) % configs.length];
    activateConfig.mutate(next.id);
  };

  const models = (modelsData?.models || []).slice().sort(
    (a, b) => (b.id === status.config?.model) - (a.id === status.config?.model)
  ).slice(0, 2);

  const serverName = status.config?.name || 'paperrAi Server';

  return (
    <WidgetShell icon="dns" title="AI Manager" editing={editing} source="/settings">
      <div className={`flex flex-col ${compact ? 'h-full items-center justify-center text-center gap-1.5' : 'gap-3 py-1'}`}>

        <p className={`font-mono text-on-surface-variant truncate ${compact ? 'text-[10px]' : 'text-label-sm'}`}>
          {serverName}
        </p>

        {/* Power */}
        <div className={compact ? 'flex flex-col items-center gap-1.5' : 'flex items-center gap-3'}>
          <button
            type="button"
            role="switch"
            aria-checked={running}
            aria-label="Turn AI Server on or off"
            onClick={togglePower}
            disabled={busy || status.status === 'not_installed'}
            className={`relative rounded-full transition-colors flex-shrink-0 disabled:opacity-50
              ${compact ? 'w-11 h-6' : 'w-10 h-[22px]'}
              ${running ? 'bg-primary' : 'bg-surface-container-high'}`}
          >
            <span
              className={`absolute top-[2px] left-[2px] rounded-full bg-surface-container-lowest shadow transition-transform
                ${compact ? 'w-5 h-5' : 'w-[18px] h-[18px]'}
                ${running ? (compact ? 'translate-x-5' : 'translate-x-[18px]') : ''}`}
            />
          </button>
          {compact ? (
            <p className="text-label-sm font-bold text-on-surface">{meta.label}</p>
          ) : (
            <div className="min-w-0">
              <span className={`inline-block px-2 py-0.5 rounded-full text-label-sm font-bold ${meta.tone}`}>
                {meta.label}
              </span>
              <p className="text-label-sm text-on-surface-variant/70 font-mono mt-0.5 truncate">
                {running ? `${status.host}:${status.port}${status.pid ? ` · pid ${status.pid}` : ''}` : ' '}
              </p>
            </div>
          )}
        </div>

        {compact ? (
          <p className="text-label-sm text-on-surface-variant tabular-nums">{running ? memory : '—'}</p>
        ) : (
          <>
            <div className="flex items-center justify-between text-label-sm">
              <span className="text-on-surface-variant">Memory</span>
              <span className="font-bold tabular-nums">{running ? memory : '—'}</span>
            </div>

            {/* Connection */}
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-label-sm text-on-surface-variant">Connection</p>
                <p className="text-body-md font-semibold text-on-surface truncate">
                  {activeConfig?.name || '—'}
                </p>
                <p className="text-label-sm text-on-surface-variant/70 font-mono truncate">
                  {activeConfig ? `${activeConfig.provider} · ${activeConfig.model}` : ''}
                </p>
              </div>
              <button
                type="button"
                title="Switch connection"
                aria-label="Switch connection"
                onClick={cycleConnection}
                disabled={configs.length < 2 || activateConfig.isPending}
                className="w-7 h-7 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition disabled:opacity-40 flex-shrink-0"
              >
                <span className="material-symbols-outlined text-[16px]">swap_horiz</span>
              </button>
            </div>

            {/* Models */}
            {models.length > 0 && (
              <div className="space-y-1">
                <p className="text-label-sm text-on-surface-variant">Models</p>
                {models.map(m => (
                  <div key={m.id} className="flex items-center gap-2 text-label-sm">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${m.id === status.config?.model ? 'bg-primary' : 'bg-outline-variant'}`} />
                    <span className="font-mono flex-1 min-w-0 truncate">{m.id}</span>
                    <span className="text-on-surface-variant/70 flex-shrink-0">{m.size}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </WidgetShell>
  );
}
