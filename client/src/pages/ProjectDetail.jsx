import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import { api } from '../auth/AuthContext';
import ProjectFormModal from '../components/ProjectFormModal';
import PillSelect from '../components/PillSelect';
import TaskForm from '../components/TaskForm';
import { useDeepWorkStore } from '../store/deepWorkStore';
import { useCelebrationStore } from '../store/celebrationStore';
import { useAuthStore } from '../store/authStore';
import { useSpaceStore } from '../store/spaceStore';
import { useMode } from '../hooks/useMode';

const TABS = ['Board', 'List', 'Phases'];
// Same icon language as the Tasks page's List/Board/Table view switcher.
const TAB_ICONS = { Board: 'view_kanban', List: 'format_list_bulleted', Phases: 'linear_scale' };

const STATUS_LABELS = {
  todo:        'To Do',
  in_progress: 'In Progress',
  blocked:     'Blocked',
  done:        'Done',
};

const STATUS_STYLES = {
  todo:        'bg-surface-variant text-on-surface-variant',
  in_progress: 'bg-primary/10 text-primary',
  blocked:     'bg-error/10 text-error',
  done:        'bg-surface-variant text-on-surface-variant',
};

const PRIORITY_COLOUR = {
  high:   'text-error',
  medium: 'text-tertiary',
  low:    'text-on-surface-variant',
};

const PRIORITY_ICON = {
  high:   'keyboard_double_arrow_up',
  medium: 'remove',
  low:    'keyboard_double_arrow_down',
};

// Mirrors KANBAN_COLS in MyTasks.jsx so the project Board reads as the same
// visual language as the main Tasks board.
const BOARD_COLUMNS = [
  { key: 'todo',        label: 'To Do',       icon: 'radio_button_unchecked', text: 'text-on-surface-variant',   bg: 'bg-surface-container'  },
  { key: 'in_progress', label: 'In Progress', icon: 'pending',                text: 'text-primary',              bg: 'bg-primary/10'         },
  { key: 'blocked',     label: 'Blocked',     icon: 'block',                  text: 'text-error',                bg: 'bg-error-container/60' },
  { key: 'done',        label: 'Done',        icon: 'check_circle',           text: 'text-on-success-container', bg: 'bg-success-container'  },
];

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return null;
  try {
    const iso = d.includes('T') ? d : `${d}T00:00:00`;
    return format(parseISO(iso), 'MMM d');
  } catch { return d; }
}

function Avatar({ user, size = 24, ring = false }) {
  if (!user) return null;
  const label = user.display_name || user.username || '?';
  return (
    <div
      title={label}
      className={`rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ${ring ? 'ring-2 ring-surface-container-lowest' : ''}`}
      style={{ width: size, height: size, backgroundColor: user.avatar_colour || '#6366f1', fontSize: size * 0.42 }}
    >
      {label[0].toUpperCase()}
    </div>
  );
}

function phaseLookup(phases) {
  const map = new Map();
  phases.forEach(p => map.set(p.id, p));
  return map;
}

// ── TaskItem (List view row) ─────────────────────────────────────────────────

function TaskItem({ task, phase, onToggle, onOpen }) {
  const openDeepWork = useDeepWorkStore(s => s.openSetup);
  // mode-specific, not isTouch — tablet stays on the desktop-style sizing untouched.
  const { mode } = useMode();
  const isTouch = mode === 'phone';
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task)}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(task); }}
      className={`flex items-center gap-3 p-3 rounded-xl border transition group cursor-pointer ${
        task.is_completed
          ? 'border-outline-variant/10 bg-surface-container/50 opacity-60'
          : 'border-outline-variant/20 bg-surface-container-lowest hover:border-outline-variant/50'
      }`}
    >
      {/* Completion toggle — bumped on touch, matching MyTasks' checkbox convention */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggle(task); }}
        className={`rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${isTouch ? 'w-7 h-7' : 'w-5 h-5'} ${
          task.is_completed ? 'bg-primary border-primary' : 'border-outline hover:border-primary'
        }`}
      >
        {!!task.is_completed && (
          <span className={`material-symbols-outlined text-on-primary ${isTouch ? 'text-[16px]' : 'text-[11px]'}`}>check</span>
        )}
      </button>

      {/* Title + due date */}
      <div className="flex-1 min-w-0">
        <p className={`text-body-md text-on-surface truncate ${task.is_completed ? 'line-through text-on-surface-variant' : ''}`}>
          {task.title}
        </p>
        {task.due_date && (
          <p className="text-xs text-on-surface-variant mt-0.5">{fmtDate(task.due_date)}</p>
        )}
      </div>

      {/* Phase chip */}
      {phase && (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap bg-primary/10 text-primary flex items-center gap-1 flex-shrink-0">
          <span className="material-symbols-outlined text-[12px]">linear_scale</span>
          {phase.name}
        </span>
      )}

      {/* Priority */}
      {task.priority && (
        <span className={`material-symbols-outlined text-[18px] ${PRIORITY_COLOUR[task.priority] || ''}`}>
          {PRIORITY_ICON[task.priority] || 'remove'}
        </span>
      )}

      {/* Status badge */}
      {task.status && (
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_STYLES[task.status] || ''}`}>
          {STATUS_LABELS[task.status] || task.status}
        </span>
      )}

      {task.assigned_to_name && (
        <Avatar user={{ display_name: task.assigned_to_name, avatar_colour: task.assigned_to_colour }} size={22} />
      )}

      {/* Deep Work trigger */}
      {task.status !== 'done' && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); openDeepWork(task.id); }}
          title="Start Deep Work"
          aria-label="Start Deep Work"
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-on-surface-variant can-hover:opacity-0 can-hover:group-hover:opacity-100 focus-visible:opacity-100 hover:bg-primary/10 hover:text-primary transition"
        >
          <span className="material-symbols-outlined text-[18px]">center_focus_strong</span>
        </button>
      )}
    </div>
  );
}

// ── QuickAddTask ──────────────────────────────────────────────────────────────

function QuickAddTask({ projectId, userId, phases, onAdded }) {
  const [value, setValue]     = useState('');
  const [phaseId, setPhaseId] = useState('');
  const [loading, setLoading] = useState(false);

  const phaseOptions = [{ value: '', label: 'No phase' }, ...phases.map(p => ({ value: String(p.id), label: p.name }))];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    setLoading(true);
    try {
      await api.post(`/projects/${projectId}/tasks`, {
        title: value.trim(),
        assigned_to: userId ?? null,
        phase_id: phaseId ? parseInt(phaseId) : null,
      });
      setValue('');
      setPhaseId('');
      onAdded();
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Add a task…"
        disabled={loading}
        className="flex-1 bg-surface-container rounded-full px-4 py-2.5 text-body-md text-on-surface outline-none border border-outline-variant/40 focus:border-primary transition"
      />
      {phases.length > 0 && (
        <div className="w-40 flex-shrink-0">
          <PillSelect value={phaseId} onChange={setPhaseId} options={phaseOptions} placeholder="No phase" icon="linear_scale" />
        </div>
      )}
      <button
        type="submit"
        disabled={loading || !value.trim()}
        className="p-2.5 rounded-full bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-50 active:scale-[0.95] transition flex-shrink-0"
      >
        <span className="material-symbols-outlined text-[20px]">add</span>
      </button>
    </form>
  );
}

// ── ListTab ───────────────────────────────────────────────────────────────────

function ListTab({ projectId, tasks, phases, userId, onEditTask }) {
  const qc = useQueryClient();
  // mode-specific, not isTouch — tablet stays on the desktop-style sizing untouched.
  const { mode } = useMode();
  const isTouch = mode === 'phone';
  const [filter, setFilter] = useState('active');
  const phasesById = useMemo(() => phaseLookup(phases), [phases]);

  const toggleMutation = useMutation({
    mutationFn: (task) =>
      api.post(`/tasks/${task.id}/${task.is_completed ? 'uncomplete' : 'complete'}`),
    onSuccess: (_data, task) => {
      qc.invalidateQueries({ queryKey: ['project-dashboard', projectId] });
      if (!task.is_completed) useCelebrationStore.getState().fire();
    },
  });

  const activeCnt    = tasks.filter(t => !t.is_completed).length;
  const completedCnt = tasks.filter(t => t.is_completed).length;

  const filtered = tasks.filter(t => {
    if (filter === 'active')    return !t.is_completed;
    if (filter === 'completed') return t.is_completed;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-1 bg-surface-container rounded-full p-1 w-fit">
        {[
          ['active',    `Active (${activeCnt})`],
          ['completed', `Done (${completedCnt})`],
          ['all',       'All'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 rounded-full text-label-sm transition ${isTouch ? 'py-2' : 'py-1'} ${
              filter === key
                ? 'bg-surface-container-lowest text-on-surface shadow-soft'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Quick add */}
      <QuickAddTask
        projectId={projectId}
        userId={userId}
        phases={phases}
        onAdded={() => qc.invalidateQueries({ queryKey: ['project-dashboard', projectId] })}
      />

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-10 text-on-surface-variant">
          <span className="material-symbols-outlined text-3xl block mb-2">task_alt</span>
          <p className="text-body-md">
            {filter === 'active' ? 'No active tasks' : 'No tasks here'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(task => (
            <TaskItem
              key={task.id}
              task={task}
              phase={phasesById.get(task.phase_id)}
              onToggle={(t) => toggleMutation.mutate(t)}
              onOpen={onEditTask}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── BoardTab (Kanban) ─────────────────────────────────────────────────────────

function BoardCard({ task, phase, onOpen, isDragging, onDragStart, onDragEnd }) {
  const openDeepWork = useDeepWorkStore(s => s.openSetup);
  // mode-specific, not isTouch — tablet stays on the desktop-style sizing untouched.
  const { mode } = useMode();
  const isTouch = mode === 'phone';
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(task)}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(task); }}
      className={`bg-surface-container-lowest rounded-xl border border-outline-variant/20 shadow-soft p-3 cursor-grab active:cursor-grabbing hover:border-outline-variant/50 hover:shadow-heavy transition group ${isDragging ? 'opacity-40' : ''}`}
    >
      <div className="flex items-start gap-2">
        <p className={`text-body-sm font-medium flex-1 leading-snug ${task.is_completed ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>
          {task.title}
        </p>
        {task.priority && (
          <span className={`material-symbols-outlined text-[16px] flex-shrink-0 ${PRIORITY_COLOUR[task.priority] || ''}`}>
            {PRIORITY_ICON[task.priority] || 'remove'}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {phase ? (
          <span className="text-label-sm text-primary bg-primary/10 px-2 py-0.5 rounded-full tracking-normal flex items-center gap-1">
            <span className="material-symbols-outlined text-[11px]">linear_scale</span>
            {phase.name}
          </span>
        ) : (
          <span className="text-label-sm text-on-surface-variant/50 border border-dashed border-outline-variant/50 px-2 py-0.5 rounded-full tracking-normal flex items-center gap-1">
            <span className="material-symbols-outlined text-[11px]">linear_scale</span>
            No phase
          </span>
        )}
        {task.due_date && (
          <span className="text-label-sm text-on-surface-variant/70 tracking-normal">{fmtDate(task.due_date)}</span>
        )}
        <div className="flex-1" />
        {task.status !== 'done' && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); openDeepWork(task.id); }}
            title="Start Deep Work"
            aria-label="Start Deep Work"
            className={`rounded-full flex items-center justify-center flex-shrink-0 text-on-surface-variant can-hover:opacity-0 can-hover:group-hover:opacity-100 focus-visible:opacity-100 hover:bg-primary/10 hover:text-primary transition ${isTouch ? 'w-8 h-8' : 'w-6 h-6'}`}
          >
            <span className={`material-symbols-outlined ${isTouch ? 'text-[17px]' : 'text-[15px]'}`}>center_focus_strong</span>
          </button>
        )}
        {task.assigned_to_name && (
          <Avatar user={{ display_name: task.assigned_to_name, avatar_colour: task.assigned_to_colour }} size={20} />
        )}
      </div>
    </div>
  );
}

function BoardTab({ projectId, tasks, phases, onEditTask, onAddTask }) {
  const qc = useQueryClient();
  const phasesById = useMemo(() => phaseLookup(phases), [phases]);
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  // Same semantics as MyTasks' handleMoveStatus — "done" is completion, not a
  // status value, so moving in/out of it goes through complete/uncomplete.
  const moveStatus = useMutation({
    mutationFn: async ({ task, status }) => {
      if (status === 'done') return api.post(`/tasks/${task.id}/complete`);
      if (task.is_completed) await api.post(`/tasks/${task.id}/uncomplete`);
      return api.put(`/tasks/${task.id}`, { status });
    },
    onSuccess: (_data, { task, status }) => {
      qc.invalidateQueries({ queryKey: ['project-dashboard', projectId] });
      if (status === 'done' && !task.is_completed) useCelebrationStore.getState().fire();
    },
  });

  const handleDrop = (e, colKey) => {
    e.preventDefault();
    const task = tasks.find(t => t.id === draggedId);
    if (task && colKey !== (task.is_completed ? 'done' : task.status)) {
      moveStatus.mutate({ task, status: colKey });
    }
    setDraggedId(null);
    setDragOverCol(null);
  };

  const byStatus = useMemo(() => {
    return BOARD_COLUMNS.reduce((acc, col) => {
      acc[col.key] = tasks.filter(t => (col.key === 'done' ? t.is_completed : (!t.is_completed && t.status === col.key)));
      return acc;
    }, {});
  }, [tasks]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
      {BOARD_COLUMNS.map(col => {
        const colTasks = byStatus[col.key] || [];
        const isDropTarget = dragOverCol === col.key && draggedId !== null;
        return (
          <div
            key={col.key}
            className={`rounded-2xl p-3 transition-shadow ${col.bg} ${isDropTarget ? 'ring-2 ring-primary/50' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.key); }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) {
                setDragOverCol(prev => (prev === col.key ? null : prev));
              }
            }}
            onDrop={(e) => handleDrop(e, col.key)}
          >
            <div className={`flex items-center gap-2 px-1 pb-2.5 text-label-md font-bold ${col.text}`}>
              <span className="material-symbols-outlined text-[16px]">{col.icon}</span>
              {col.label}
              <span className="ml-auto text-label-sm bg-surface-container-lowest px-2 py-0.5 rounded-full text-on-surface-variant">
                {colTasks.length}
              </span>
            </div>
            <div className="space-y-2">
              {colTasks.length === 0 ? (
                <p className="text-label-sm text-on-surface-variant/60 text-center py-6">
                  {isDropTarget ? 'Drop here' : 'Nothing here'}
                </p>
              ) : (
                colTasks.map(task => (
                  <BoardCard
                    key={task.id}
                    task={task}
                    phase={phasesById.get(task.phase_id)}
                    onOpen={onEditTask}
                    isDragging={draggedId === task.id}
                    onDragStart={() => setDraggedId(task.id)}
                    onDragEnd={() => { setDraggedId(null); setDragOverCol(null); }}
                  />
                ))
              )}
              {/* Per-column add — creates a task pre-set to this status */}
              {col.key !== 'done' && (
                <button
                  onClick={() => onAddTask(col.key)}
                  className="w-full flex items-center justify-center gap-1.5 border-[1.5px] border-dashed border-outline-variant/50 rounded-xl py-2 text-label-md text-on-surface-variant/60 hover:text-on-surface-variant hover:border-outline-variant transition"
                >
                  <span className="material-symbols-outlined text-[14px]">add</span>
                  Add
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── PhasesTab (vertical timeline, with milestones) ─────────────────────────────

function MilestoneRow({ projectId, milestone }) {
  const qc = useQueryClient();
  // mode-specific, not isTouch — tablet stays on the desktop-style sizing untouched.
  const { mode } = useMode();
  const isTouch = mode === 'phone';
  const toggle = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/milestones/${milestone.id}/${milestone.is_completed ? 'uncomplete' : 'complete'}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-milestones', projectId] }),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/projects/${projectId}/milestones/${milestone.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-milestones', projectId] }),
  });

  return (
    <div className="flex items-center gap-2 group py-1">
      {/* Visual circle stays small; padding on touch grows the hit area
          without disturbing the compact row layout. */}
      <button
        type="button"
        onClick={() => toggle.mutate()}
        aria-label={milestone.is_completed ? 'Reopen milestone' : 'Complete milestone'}
        className={`rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${isTouch ? 'w-6 h-6' : 'w-4 h-4'} ${
          milestone.is_completed ? 'bg-primary border-primary' : 'border-outline hover:border-primary'
        }`}
      >
        {!!milestone.is_completed && <span className={`material-symbols-outlined text-on-primary ${isTouch ? 'text-[13px]' : 'text-[10px]'}`}>check</span>}
      </button>
      <span className={`text-label-md flex-1 truncate ${milestone.is_completed ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>
        {milestone.name}
      </span>
      {milestone.due_date && (
        <span className="text-label-sm text-on-surface-variant/60 flex-shrink-0">{fmtDate(milestone.due_date)}</span>
      )}
      <button
        type="button"
        onClick={() => remove.mutate()}
        aria-label="Remove milestone"
        className={`can-hover:opacity-0 can-hover:group-hover:opacity-100 focus-visible:opacity-100 rounded-full flex items-center justify-center flex-shrink-0 text-on-surface-variant hover:bg-error/10 hover:text-error transition ${isTouch ? 'w-8 h-8' : 'w-5 h-5'}`}
      >
        <span className={`material-symbols-outlined ${isTouch ? 'text-[16px]' : 'text-[13px]'}`}>close</span>
      </button>
    </div>
  );
}

function AddMilestone({ projectId, phaseId }) {
  const [value, setValue] = useState('');
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (name) => api.post(`/projects/${projectId}/milestones`, { name, phase_id: phaseId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-milestones', projectId] });
      setValue('');
    },
  });
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (value.trim()) create.mutate(value.trim()); }}
      className="flex items-center gap-1.5 mt-1"
    >
      <span className="material-symbols-outlined text-[15px] text-on-surface-variant/40 flex-shrink-0">add</span>
      <input
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Add milestone…"
        disabled={create.isPending}
        className="flex-1 bg-transparent text-label-md text-on-surface outline-none placeholder-on-surface-variant/50 py-1"
      />
    </form>
  );
}

function PhaseCard({ projectId, phase, phaseTasks, milestones, state, index, isLast }) {
  const qc = useQueryClient();
  const completeMutation = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/phases/${phase.id}/${phase.is_completed ? 'uncomplete' : 'complete'}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-phases', projectId] }),
  });

  const total = phaseTasks.length;
  const done  = phaseTasks.filter(t => t.is_completed).length;

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center flex-shrink-0">
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
          state === 'done'    ? 'bg-primary text-on-primary' :
          state === 'current' ? 'bg-primary/15 text-primary ring-2 ring-primary' :
          'bg-surface-container text-on-surface-variant'
        }`}>
          {state === 'done' ? <span className="material-symbols-outlined text-[15px]">check</span> : index + 1}
        </span>
        {!isLast && <div className="w-0.5 flex-1 bg-outline-variant/30 mt-1" />}
      </div>

      <div className={`flex-1 min-w-0 rounded-xl p-4 mb-4 border ${
        state === 'current' ? 'border-primary bg-primary/5' : 'border-outline-variant/20 bg-surface-container-lowest'
      }`}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-body-md text-on-surface font-medium">{phase.name}</p>
            <p className="text-label-sm text-on-surface-variant mt-0.5">
              <span className="text-on-surface font-bold">{done}</span>/{total} tasks
              {!!phase.is_completed && total > 0 && done < total && (
                <span className="ml-1.5 text-primary">· marked complete manually</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-label-sm font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
              state === 'done'    ? 'bg-primary/10 text-primary' :
              state === 'current' ? 'bg-primary text-on-primary' :
              'bg-surface-container text-on-surface-variant'
            }`}>
              {state === 'done' ? 'Complete' : state === 'current' ? 'In progress' : 'Up next'}
            </span>
            <button
              type="button"
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending}
              className={`text-label-sm font-bold px-2.5 py-1 rounded-full whitespace-nowrap transition disabled:opacity-50 ${
                phase.is_completed
                  ? 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                  : 'bg-primary/10 text-primary hover:bg-primary/15'
              }`}
            >
              {phase.is_completed ? 'Reopen' : 'Mark complete'}
            </button>
          </div>
        </div>

        {/* Milestones */}
        <div className="mt-3 pt-3 border-t border-outline-variant/15">
          <p className="text-label-sm text-on-surface-variant uppercase tracking-wide mb-1">Milestones</p>
          {milestones.length === 0 && (
            <p className="text-label-sm text-on-surface-variant/50 py-1">No milestones yet</p>
          )}
          {milestones.map(m => (
            <MilestoneRow key={m.id} projectId={projectId} milestone={m} />
          ))}
          <AddMilestone projectId={projectId} phaseId={phase.id} />
        </div>
      </div>
    </div>
  );
}

function PhasesTab({ projectId, phases, tasks, isLoading }) {
  const [newPhase, setNewPhase] = useState('');
  const qc = useQueryClient();

  const { data: milestones = [] } = useQuery({
    queryKey: ['project-milestones', projectId],
    queryFn: () => api.get(`/projects/${projectId}/milestones`).then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (name) => api.post(`/projects/${projectId}/phases`, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-phases', projectId] });
      setNewPhase('');
    },
  });

  // A phase counts as done if it was marked complete manually OR every one
  // of its tasks is done — the manual flag lets a phase close early even
  // while tasks are still active.
  const steps = useMemo(() => {
    let foundCurrent = false;
    return phases.map(phase => {
      const phaseTasks = tasks.filter(t => t.phase_id === phase.id);
      const autoComplete = phaseTasks.length > 0 && phaseTasks.every(t => t.is_completed);
      const isComplete = !!phase.is_completed || autoComplete;
      let state = 'upcoming';
      if (isComplete) state = 'done';
      else if (!foundCurrent) { state = 'current'; foundCurrent = true; }
      return { phase, phaseTasks, state };
    });
  }, [phases, tasks]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {phases.length === 0 ? (
        <div className="text-center py-10 text-on-surface-variant">
          <span className="material-symbols-outlined text-3xl block mb-2">linear_scale</span>
          <p className="text-body-md">No phases yet</p>
          <p className="text-body-sm mt-1">Break your project into phases, add milestones, then link tasks to them from the task editor</p>
        </div>
      ) : (
        <div>
          {steps.map(({ phase, phaseTasks, state }, i) => (
            <PhaseCard
              key={phase.id}
              projectId={projectId}
              phase={phase}
              phaseTasks={phaseTasks}
              milestones={milestones.filter(m => m.phase_id === phase.id)}
              state={state}
              index={i}
              isLast={i === steps.length - 1}
            />
          ))}
        </div>
      )}

      {/* Add phase form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (newPhase.trim()) createMutation.mutate(newPhase.trim());
        }}
        className="flex gap-2"
      >
        <input
          value={newPhase}
          onChange={e => setNewPhase(e.target.value)}
          placeholder="Phase name…"
          className="flex-1 bg-surface-container rounded-full px-4 py-2.5 text-body-md text-on-surface outline-none border border-outline-variant/40 focus:border-primary transition"
        />
        <button
          type="submit"
          disabled={createMutation.isPending || !newPhase.trim()}
          className="px-4 py-2 rounded-full bg-primary text-on-primary text-label-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition"
        >
          Add
        </button>
      </form>
    </div>
  );
}

// ── People rail ───────────────────────────────────────────────────────────────

function PeopleRail({ projectId, currentUserId }) {
  const qc = useQueryClient();
  const spaceId = useSpaceStore(s => s.currentSpaceId);
  const [inviteId, setInviteId] = useState('');
  // mode-specific, not isTouch — tablet stays on the desktop-style sizing untouched.
  const { mode } = useMode();
  const isTouch = mode === 'phone';

  const { data: members = [] } = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: () => api.get(`/projects/${projectId}/members`).then(r => r.data),
  });

  const { data: spaceMembers = [] } = useQuery({
    queryKey: ['space-members', spaceId],
    queryFn: () => api.get(`/spaces/${spaceId}/members`).then(r => r.data),
    enabled: !!spaceId,
  });

  const upsertMember = useMutation({
    mutationFn: (data) => api.post(`/projects/${projectId}/members`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-members', projectId] }),
  });

  const removeMember = useMutation({
    mutationFn: (userId) => api.delete(`/projects/${projectId}/members/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-members', projectId] }),
  });

  const memberIds = new Set(members.map(m => m.user_id));
  const invitable = spaceMembers.filter(u => !memberIds.has(u.user_id ?? u.id)).map(u => ({
    id: u.user_id ?? u.id, display_name: u.display_name,
  }));
  const inviteOptions = invitable.map(u => ({ value: String(u.id), label: u.display_name }));

  return (
    <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-soft overflow-hidden">
      <p className="text-label-sm text-on-surface-variant uppercase tracking-wide px-4 pt-4 pb-2">People</p>
      <div className="px-4 pb-3 space-y-2.5">
        {members.map(m => (
          <div key={m.user_id} className="flex items-center gap-2.5 group">
            <Avatar user={m} size={26} />
            <div className="min-w-0 flex-1">
              <p className="text-body-sm text-on-surface font-medium truncate">{m.display_name}</p>
              <p className="text-label-sm text-on-surface-variant/70">{m.role_label || 'Member'}</p>
            </div>
            {!!m.is_watcher && (
              <span title="Watching this project" className="material-symbols-outlined text-[15px] text-primary flex-shrink-0">visibility</span>
            )}
            {m.role_label !== 'Owner' && (
              <button
                type="button"
                onClick={() => removeMember.mutate(m.user_id)}
                aria-label={`Remove ${m.display_name}`}
                className={`can-hover:opacity-0 can-hover:group-hover:opacity-100 focus-visible:opacity-100 rounded-full flex items-center justify-center flex-shrink-0 text-on-surface-variant hover:bg-error/10 hover:text-error transition ${isTouch ? 'w-9 h-9' : 'w-6 h-6'}`}
              >
                <span className={`material-symbols-outlined ${isTouch ? 'text-[17px]' : 'text-[14px]'}`}>close</span>
              </button>
            )}
          </div>
        ))}
      </div>
      {inviteOptions.length > 0 && (
        <div className="px-4 pb-4 flex gap-2 border-t border-outline-variant/20 pt-3">
          <div className="flex-1 min-w-0">
            <PillSelect value={inviteId} onChange={setInviteId} options={[{ value: '', label: 'Invite from household…' }, ...inviteOptions]} placeholder="Invite from household…" icon="person_add" />
          </div>
          <button
            type="button"
            disabled={!inviteId || upsertMember.isPending}
            onClick={() => { upsertMember.mutate({ userId: parseInt(inviteId), roleLabel: 'Member' }); setInviteId(''); }}
            className="px-3 rounded-full bg-primary text-on-primary text-label-sm font-bold disabled:opacity-40 hover:bg-primary/90 transition flex-shrink-0"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

// ── Activity rail ─────────────────────────────────────────────────────────────

function ActivityRail({ projectId }) {
  const { data: activity = [], isLoading } = useQuery({
    queryKey: ['project-activity', projectId],
    queryFn: () => api.get(`/activity/project/${projectId}`).then(r => r.data),
    refetchInterval: 30_000,
  });

  return (
    <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-soft overflow-hidden">
      <p className="text-label-sm text-on-surface-variant uppercase tracking-wide px-4 pt-4 pb-2">Activity</p>
      <div className="px-4 pb-4 space-y-3 max-h-96 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-4">
            <span className="material-symbols-outlined animate-spin text-primary text-[18px]">progress_activity</span>
          </div>
        ) : activity.length === 0 ? (
          <p className="text-body-sm text-on-surface-variant text-center py-4">No activity yet</p>
        ) : (
          activity.slice(0, 15).map(item => (
            <div key={item.id} className="flex items-start gap-2.5">
              <Avatar user={item} size={22} />
              <div className="min-w-0 flex-1">
                <p className="text-body-sm text-on-surface leading-snug">{item.description}</p>
                <p className="text-label-sm text-on-surface-variant/60 mt-0.5">
                  {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── ProjectDetail ─────────────────────────────────────────────────────────────

export default function ProjectDetail() {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const qc         = useQueryClient();
  const projectId  = parseInt(id, 10);
  const currentUser = useAuthStore(s => s.user);
  // mode-specific, not isTouch — tablet stays on the desktop-style sizing untouched.
  const { mode } = useMode();
  const isTouch = mode === 'phone';
  const [activeTab, setActiveTab] = useState('Board');
  const [editOpen, setEditOpen]   = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [createStatus, setCreateStatus] = useState(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['project-dashboard', projectId],
    queryFn:  () => api.get(`/projects/${id}/dashboard`).then(r => r.data),
  });

  const { data: phases = [], isLoading: phasesLoading } = useQuery({
    queryKey: ['project-phases', projectId],
    queryFn: () => api.get(`/projects/${projectId}/phases`).then(r => r.data),
  });

  const { data: members = [] } = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: () => api.get(`/projects/${projectId}/members`).then(r => r.data),
  });

  const archiveMutation = useMutation({
    mutationFn: () => api.put(`/projects/${id}`, { status: 'archived' }),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      navigate('/projects');
    },
  });

  const activateMutation = useMutation({
    mutationFn: () => api.put(`/projects/${id}`, { status: 'active' }),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['project-dashboard', projectId] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (deleteTasks) => api.delete(`/projects/${id}`, { params: { deleteTasks } }),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      navigate('/projects');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (updates) => api.put(`/projects/${id}`, updates).then(r => r.data),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['project-dashboard', projectId] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      setEditOpen(false);
    },
  });

  const watchMutation = useMutation({
    mutationFn: (isWatcher) => api.post(`/projects/${projectId}/members`, { userId: currentUser.id, isWatcher }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-members', projectId] }),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <span className="material-symbols-outlined animate-spin text-primary text-3xl">
          progress_activity
        </span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="text-center py-20 text-on-surface-variant">
        <span className="material-symbols-outlined text-5xl block mb-3">error</span>
        <p className="text-body-lg">Project not found</p>
        <button
          onClick={() => navigate('/projects')}
          className="mt-4 text-primary text-body-md hover:underline"
        >
          Back to Projects
        </button>
      </div>
    );
  }

  const { project, tasks = [], stats } = data;
  const myMembership = members.find(m => m.user_id === currentUser?.id);
  const isWatching = !!myMembership?.is_watcher;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Back navigation — padding trick grows the tap area on touch without
          shifting the visible position or the space-y-6 stack below it. */}
      <button
        onClick={() => navigate('/projects')}
        className={`flex items-center gap-1 text-on-surface-variant hover:text-on-surface text-body-md transition ${isTouch ? '-m-2.5 p-2.5' : ''}`}
      >
        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
        Projects
      </button>

      {/* Project header card */}
      <div className="rounded-2xl overflow-hidden border border-outline-variant/20 shadow-soft bg-surface-container-lowest">
        <div className="h-3" style={{ backgroundColor: project.cover_colour || '#6366f1' }} />
        <div className={`flex items-start gap-4 ${isTouch ? 'p-4' : 'p-6'}`}>
          <span className="text-4xl">{project.cover_icon || '📁'}</span>
          <div className="flex-1 min-w-0">
            <h1 className="text-headline-md text-on-surface">{project.name}</h1>
            {project.description && (
              <p className="text-body-md text-on-surface-variant mt-1">{project.description}</p>
            )}
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wide ${
                project.status === 'active'    ? 'bg-primary/10 text-primary' :
                project.status === 'completed' ? 'bg-surface-variant text-on-surface-variant' :
                'bg-surface-container text-on-surface-variant'
              }`}>
                {project.status}
              </span>
              {project.start_date && (
                <span className="text-label-sm text-on-surface-variant flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px]">event</span>
                  {fmtDate(project.start_date)}
                  {project.end_date && ` → ${fmtDate(project.end_date)}`}
                </span>
              )}
              {members.length > 0 && (
                <span className="flex items-center -space-x-2">
                  {members.slice(0, 4).map(m => (
                    <Avatar key={m.user_id} user={m} size={24} ring />
                  ))}
                  {members.length > 4 && (
                    <span className="w-6 h-6 rounded-full bg-surface-container text-on-surface-variant text-[10px] font-bold flex items-center justify-center ring-2 ring-surface-container-lowest">
                      +{members.length - 4}
                    </span>
                  )}
                </span>
              )}
              {currentUser && (
                <button
                  type="button"
                  onClick={() => watchMutation.mutate(!isWatching)}
                  className={`text-label-sm font-bold px-2.5 py-1 rounded-full flex items-center gap-1 transition ${
                    isWatching ? 'bg-primary/10 text-primary' : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[14px]">{isWatching ? 'visibility' : 'visibility_off'}</span>
                  {isWatching ? 'Watching' : 'Watch'}
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => setCreatingTask(true)}
              title="New task"
              className={`flex items-center gap-2 bg-primary text-on-primary rounded-full font-bold hover:bg-primary/90 active:scale-[0.97] transition ${
                isTouch ? 'p-3' : 'px-5 py-2.5 text-label-md'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              {!isTouch && 'Create New Task'}
            </button>
            <button
              onClick={() => setEditOpen(true)}
              className={`rounded-full hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition ${isTouch ? 'p-3' : 'p-2'}`}
              title="Edit project"
            >
              <span className="material-symbols-outlined text-[20px]">edit</span>
            </button>
            {project.status === 'archived' ? (
              <button
                onClick={() => activateMutation.mutate()}
                className={`rounded-full hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition ${isTouch ? 'p-3' : 'p-2'}`}
                title="Activate project"
              >
                <span className="material-symbols-outlined text-[20px]">unarchive</span>
              </button>
            ) : (
              <button
                onClick={() => {
                  if (window.confirm('Archive this project?')) archiveMutation.mutate();
                }}
                className={`rounded-full hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition ${isTouch ? 'p-3' : 'p-2'}`}
                title="Archive project"
              >
                <span className="material-symbols-outlined text-[20px]">archive</span>
              </button>
            )}
            <button
              onClick={() => {
                if (!window.confirm('Delete this project permanently? This cannot be undone.')) return;
                const deleteTasks = stats.total > 0 && window.confirm(
                  `Also delete all ${stats.total} task${stats.total !== 1 ? 's' : ''} in this project? Cancel to keep them, unassigned from any project.`
                );
                deleteMutation.mutate(deleteTasks);
              }}
              className={`rounded-full hover:bg-error/10 text-on-surface-variant hover:text-error transition ${isTouch ? 'p-3' : 'p-2'}`}
              title="Delete project"
            >
              <span className="material-symbols-outlined text-[20px]">delete</span>
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="px-6 pb-5">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-label-sm text-on-surface-variant">Progress</span>
            <span className="text-label-sm text-on-surface font-semibold">{stats.progress}%</span>
          </div>
          <div className="h-2 bg-surface-container-high rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${stats.progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total',       value: stats.total,      icon: 'task',       colour: 'text-on-surface' },
          { label: 'Completed',   value: stats.completed,  icon: 'task_alt',   colour: 'text-primary'    },
          { label: 'In Progress', value: stats.inProgress, icon: 'pending',    colour: 'text-tertiary'   },
          { label: 'Blocked',     value: stats.blocked,    icon: 'block',      colour: 'text-error'      },
        ].map(({ label, value, icon, colour }) => (
          <div
            key={label}
            className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/20 shadow-soft text-center"
          >
            <span className={`material-symbols-outlined text-2xl ${colour}`}>{icon}</span>
            <p className="text-headline-sm text-on-surface font-bold mt-1">{value}</p>
            <p className="text-label-sm text-on-surface-variant uppercase tracking-wide mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Tabs + rail */}
      <div>
        <div className="flex items-center bg-surface-container rounded-full p-1 gap-0.5 w-fit">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              title={`${tab} view`}
              className={`${isTouch ? 'h-11' : 'h-9'} px-3.5 rounded-full flex items-center gap-1.5 text-label-md transition active:scale-95 ${
                activeTab === tab
                  ? 'bg-surface-container-lowest text-on-surface font-bold shadow-soft'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">{TAB_ICONS[tab]}</span>
              {tab}
            </button>
          ))}
        </div>

        <div className="pt-5 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5 items-start">
          <div className="min-w-0">
            {activeTab === 'Board' && (
              <BoardTab
                projectId={projectId}
                tasks={tasks}
                phases={phases}
                onEditTask={setEditingTask}
                onAddTask={(status) => { setCreateStatus(status); setCreatingTask(true); }}
              />
            )}
            {activeTab === 'List' && (
              <ListTab projectId={projectId} tasks={tasks} phases={phases} userId={currentUser?.id} onEditTask={setEditingTask} />
            )}
            {activeTab === 'Phases' && (
              <PhasesTab projectId={projectId} phases={phases} tasks={tasks} isLoading={phasesLoading} />
            )}
          </div>
          <div className="space-y-4">
            <PeopleRail projectId={projectId} currentUserId={currentUser?.id} />
            <ActivityRail projectId={projectId} />
          </div>
        </div>
      </div>

      {/* Edit project modal */}
      {editOpen && (
        <ProjectFormModal
          project={project}
          onClose={() => setEditOpen(false)}
          onSave={(updates) => updateMutation.mutate(updates)}
          loading={updateMutation.isPending}
        />
      )}

      {/* Task editor (Board/List card click, or "+" in the header) */}
      <TaskForm
        open={!!editingTask || creatingTask}
        task={editingTask}
        defaultProjectId={projectId}
        defaultStatus={createStatus}
        onClose={() => {
          setEditingTask(null);
          setCreatingTask(false);
          setCreateStatus(null);
          qc.invalidateQueries({ queryKey: ['project-dashboard', projectId] });
        }}
      />
    </div>
  );
}
