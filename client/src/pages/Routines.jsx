import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { api } from '../auth/AuthContext';
import { useCelebrationStore } from '../store/celebrationStore';
import DayArcView from './routines/DayArcView';
import ProtocolsView from './routines/ProtocolsView';
import ProgressView from './routines/ProgressView';
import HabitFormModal from './routines/HabitFormModal';
import ProtocolFormModal from './routines/ProtocolFormModal';

const VIEWS = [
  { key: 'arc',       label: 'Day Arc',   icon: 'wb_twilight' },
  { key: 'protocols', label: 'Protocols', icon: 'category' },
  { key: 'progress',  label: 'Progress',  icon: 'insights' },
];

// Above this width all 3 sections show together (Day Arc + Protocols/Progress
// sidebar); below it they collapse into the single-section tab view.
const WIDE_QUERY = '(min-width: 1024px)';

function useIsWide() {
  const [isWide, setIsWide] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(WIDE_QUERY).matches : false
  );
  useEffect(() => {
    const mql = window.matchMedia(WIDE_QUERY);
    const handler = (e) => setIsWide(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return isWide;
}

function SectionHeader({ icon, label }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-3">
      <span className="material-symbols-outlined text-on-surface-variant text-[20px]">{icon}</span>
      <h2 className="text-title-md font-medium text-on-surface">{label}</h2>
    </div>
  );
}

function NoProtocols({ onNew }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-soft border border-outline-variant/20 p-12 text-center">
      <span className="material-symbols-outlined text-on-surface-variant/30 text-5xl">repeat</span>
      <h3 className="text-title-lg text-on-surface mt-3">No protocols yet</h3>
      <p className="text-body-md text-on-surface-variant mt-1 mb-5">
        Create a protocol to start building time-anchored habits.
      </p>
      <button
        onClick={onNew}
        className="inline-flex items-center gap-2 bg-primary text-on-primary rounded-full px-5 py-2.5 text-label-md font-bold hover:bg-primary/90 transition"
      >
        <span className="material-symbols-outlined text-[18px]">add</span>
        New Protocol
      </button>
    </div>
  );
}

export default function Routines() {
  const qc = useQueryClient();
  const today = format(new Date(), 'yyyy-MM-dd');
  const isWide = useIsWide();

  const [view, setView] = useState('arc');

  // Modal state
  const [protocolModal, setProtocolModal] = useState(null); // { protocol } | { protocol: null } | null
  const [habitModal, setHabitModal]       = useState(null); // { habit, defaultTimeSlot, defaultProtocolId } | null
  const [busyId, setBusyId]               = useState(null);

  // ── Data ────────────────────────────────────────────────────────────────────
  const { data: protocols = [], isLoading } = useQuery({
    queryKey: ['routines', today],
    queryFn:  () => api.get('/routines/protocols', { params: { date: today } }).then(r => r.data),
  });

  const { data: progress = [], isLoading: progressLoading } = useQuery({
    queryKey: ['routines-progress'],
    queryFn:  () => api.get('/routines/progress', { params: { days: 30 } }).then(r => r.data),
    enabled:  isWide || view === 'progress',
  });

  // ── Mutations ────────────────────────────────────────────────────────────────
  const toggleComplete = useMutation({
    mutationFn: (habit) =>
      habit.completed
        ? api.delete(`/routines/habits/${habit.id}/complete`, { params: { date: today } })
        : api.post(`/routines/habits/${habit.id}/complete`, { date: today }),
    onMutate: async (habit) => {
      setBusyId(habit.id);
      await qc.cancelQueries({ queryKey: ['routines', today] });
      const prev = qc.getQueryData(['routines', today]);
      const nowIso = new Date().toISOString();
      qc.setQueryData(['routines', today], (old = []) =>
        old.map(p => ({
          ...p,
          habits: (p.habits || []).map(h =>
            h.id === habit.id
              ? { ...h, completed: !h.completed, completed_at: h.completed ? null : nowIso }
              : h
          ),
        }))
      );
      return { prev };
    },
    onSuccess: (_data, habit) => { if (!habit.completed) useCelebrationStore.getState().fire(); },
    onError: (_e, _h, ctx) => { if (ctx?.prev) qc.setQueryData(['routines', today], ctx.prev); },
    onSettled: () => {
      setBusyId(null);
      qc.invalidateQueries({ queryKey: ['routines'] });
      qc.invalidateQueries({ queryKey: ['routines-progress'] });
    },
  });

  const saveProtocol = useMutation({
    mutationFn: ({ id, data }) => id ? api.patch(`/routines/protocols/${id}`, data) : api.post('/routines/protocols', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['routines'] }); setProtocolModal(null); },
  });

  // Create a protocol inline (from the habit modal) and return it so the
  // habit form can immediately select the new protocol.
  const createProtocolInline = async (data) => {
    const res = await api.post('/routines/protocols', data);
    await qc.invalidateQueries({ queryKey: ['routines'] });
    return res.data;
  };

  const deleteProtocol = useMutation({
    mutationFn: (id) => api.delete(`/routines/protocols/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routines'] });
      qc.invalidateQueries({ queryKey: ['routines-progress'] });
      setProtocolModal(null);
    },
  });

  const saveHabit = useMutation({
    mutationFn: ({ id, data }) => id ? api.patch(`/routines/habits/${id}`, data) : api.post('/routines/habits', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routines'] });
      qc.invalidateQueries({ queryKey: ['routines-progress'] });
      setHabitModal(null);
    },
  });

  const deleteHabit = useMutation({
    mutationFn: (id) => api.delete(`/routines/habits/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routines'] });
      qc.invalidateQueries({ queryKey: ['routines-progress'] });
      setHabitModal(null);
    },
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const onToggle      = (habit) => toggleComplete.mutate(habit);
  const onEditHabit   = (habit) => setHabitModal({ habit });
  const onAddHabit    = (slot, protocolId) => setHabitModal({ habit: null, defaultTimeSlot: slot || 'morning', defaultProtocolId: protocolId });
  const onEditProtocol = (protocol) => setProtocolModal({ protocol });

  const hasProtocols = protocols.some(p => !p.is_system);

  return (
    <div>
      {/* Header — same width cap as the content so edges align (and match Tasks) */}
      <div className={isWide ? 'max-w-7xl mx-auto' : 'max-w-5xl mx-auto'}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-headline-lg text-on-background">Routines</h1>
          </div>
          <button
            onClick={() => setProtocolModal({ protocol: null })}
            className="flex items-center gap-2 bg-primary text-on-primary rounded-full px-5 py-2.5 text-label-md font-bold hover:bg-primary/90 transition active:scale-[0.97]"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            New Protocol
          </button>
        </div>
      </div>

      <div className={isWide ? 'max-w-7xl mx-auto' : 'max-w-5xl mx-auto'}>
      {/* View tabs — only needed once the sidebar sections collapse */}
      {!isWide && (
        <div className="flex rounded-full bg-surface-container p-0.5 gap-0.5 mb-6 w-fit">
          {VIEWS.map(v => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-label-md font-medium transition ${
                view === v.key
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">{v.icon}</span>
              {v.label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <span className="material-symbols-outlined text-primary animate-spin text-4xl">progress_activity</span>
        </div>
      ) : isWide ? (
        <div className="grid grid-cols-3 gap-6 items-start">
          <div>
            <SectionHeader icon="wb_twilight" label="Day Arc" />
            <DayArcView
              protocols={protocols}
              onToggle={onToggle}
              onEditHabit={onEditHabit}
              onAddHabit={onAddHabit}
              busyId={busyId}
            />
          </div>
          <div>
            <SectionHeader icon="category" label="Protocols" />
            {!hasProtocols ? (
              <NoProtocols onNew={() => setProtocolModal({ protocol: null })} />
            ) : (
              <ProtocolsView
                protocols={protocols}
                onToggle={onToggle}
                onEditHabit={onEditHabit}
                onAddHabit={onAddHabit}
                onEditProtocol={onEditProtocol}
                onAddProtocol={() => setProtocolModal({ protocol: null })}
                busyId={busyId}
              />
            )}
          </div>
          <div>
            <SectionHeader icon="insights" label="Progress" />
            <ProgressView protocols={protocols} progress={progress} isLoading={progressLoading} onEditHabit={onEditHabit} />
          </div>
        </div>
      ) : view === 'arc' ? (
        <DayArcView
          protocols={protocols}
          onToggle={onToggle}
          onEditHabit={onEditHabit}
          onAddHabit={onAddHabit}
          busyId={busyId}
        />
      ) : !hasProtocols ? (
        <NoProtocols onNew={() => setProtocolModal({ protocol: null })} />
      ) : view === 'protocols' ? (
        <ProtocolsView
          protocols={protocols}
          onToggle={onToggle}
          onEditHabit={onEditHabit}
          onAddHabit={onAddHabit}
          onEditProtocol={onEditProtocol}
          onAddProtocol={() => setProtocolModal({ protocol: null })}
          busyId={busyId}
        />
      ) : (
        <ProgressView protocols={protocols} progress={progress} isLoading={progressLoading} onEditHabit={onEditHabit} />
      )}
      </div>

      {/* Modals */}
      {protocolModal && (
        <ProtocolFormModal
          protocol={protocolModal.protocol}
          onClose={() => setProtocolModal(null)}
          onSave={(data) => saveProtocol.mutate({ id: protocolModal.protocol?.id, data })}
          onDelete={(p) => deleteProtocol.mutate(p.id)}
          loading={saveProtocol.isPending}
        />
      )}
      {habitModal && (
        <HabitFormModal
          open
          habit={habitModal.habit}
          protocols={protocols}
          defaultTimeSlot={habitModal.defaultTimeSlot}
          defaultProtocolId={habitModal.defaultProtocolId}
          onClose={() => setHabitModal(null)}
          onSave={(data) => saveHabit.mutate({ id: habitModal.habit?.id, data })}
          onDelete={(h) => deleteHabit.mutate(h.id)}
          onArchive={(h) => saveHabit.mutate({ id: h.id, data: { is_active: h.is_active === 0 ? 1 : 0 } })}
          onCreateProtocol={createProtocolInline}
          loading={saveHabit.isPending}
        />
      )}
    </div>
  );
}
