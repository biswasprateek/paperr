import React, { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format, parseISO } from 'date-fns';
import { api } from '../auth/AuthContext';
import { useAuthStore } from '../store/authStore';
import { useDeepWorkStore } from '../store/deepWorkStore';
import { useCelebrationStore } from '../store/celebrationStore';
import PillSelect from './PillSelect';
import TaskNotes from './TaskNotes';

// ── Date helpers ──────────────────────────────────────────────────────────────
function quickDate(daysFromNow) {
  return format(addDays(new Date(), daysFromNow), 'yyyy-MM-dd');
}

/** Split "2024-01-15T10:30" → { date: "2024-01-15", time: "10:30" } */
function splitDateTime(str) {
  if (!str) return { date: '', time: '' };
  if (str.includes('T')) {
    const [date, time] = str.split('T');
    return { date, time };
  }
  return { date: str, time: '' };
}

/** Combine date + time back to a single string for the API */
function combineDateTime(date, time) {
  if (!date) return null;
  return time ? `${date}T${time}` : date;
}

/** Format a duration in seconds as e.g. "2h 15m" / "15m" */
function formatDeepWorkTime(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.round((totalSec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Display a scheduled time block, e.g. "Jul 14, 2:00–3:00 PM" */
function formatBlock(startAt, endAt) {
  if (!startAt) return '';
  try {
    const s = parseISO(startAt);
    const parts = `${format(s, 'MMM d')}, ${format(s, 'h:mm a')}`;
    if (endAt) return `${parts}–${format(parseISO(endAt), 'h:mm a')}`;
    return parts;
  } catch { return ''; }
}

// ── Constants ─────────────────────────────────────────────────────────────────
const PRIORITIES = ['low', 'medium', 'high'];
const STATUSES   = ['todo', 'in_progress', 'blocked', 'done'];

const RECUR_OPTIONS = [
  { value: 'daily',    label: 'Daily'         },
  { value: 'weekly',   label: 'Weekly'        },
  { value: 'weekdays', label: 'Specific days' },
  { value: 'monthly',  label: 'Monthly'       },
  { value: 'yearly',   label: 'Yearly'        },
];

// 0=Sun … 6=Sat, matching JS Date.getDay() and the server's recur_days storage.
const WEEKDAYS = [
  { value: 0, label: 'S' }, { value: 1, label: 'M' }, { value: 2, label: 'T' },
  { value: 3, label: 'W' }, { value: 4, label: 'T' }, { value: 5, label: 'F' },
  { value: 6, label: 'S' },
];

const QUICK_DATES = [
  { label: 'Today',    days: 0 },
  { label: 'Tomorrow', days: 1 },
];

const STATUS_LABELS = {
  todo: 'To Do', in_progress: 'In Progress', blocked: 'Blocked', done: 'Done',
};

// Display-only labels — the stored priority value stays 'low' | 'medium' | 'high'.
const PRIORITY_LABELS = {
  low: 'Low', medium: 'Med', high: 'High',
};

const PRIORITY_DOT = {
  low:    'bg-on-surface-variant/50',
  medium: 'bg-primary',
  high:   'bg-error',
};

const PRIORITY_RING = {
  low:    'ring-on-surface-variant/40',
  medium: 'ring-primary',
  high:   'ring-error',
};

// ── Shared UI atoms ───────────────────────────────────────────────────────────
function FieldLabel({ children }) {
  return (
    <p className="text-label-sm text-on-surface-variant tracking-wide mb-2">
      {children}
    </p>
  );
}

function InputRow({ icon, children, className = '' }) {
  return (
    <div className={`relative bg-surface-container-high rounded-full flex items-center px-4 h-12 border border-transparent hover:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-[box-shadow,border-color] ${className}`}>
      {icon && (
        <span className="material-symbols-outlined text-on-surface-variant/50 mr-2 text-[20px] flex-shrink-0">
          {icon}
        </span>
      )}
      {children}
    </div>
  );
}

const INPUT_CLASS =
  'bg-transparent border-none focus:ring-0 p-0 text-body-md font-light tracking-wide text-on-surface w-full placeholder-on-surface-variant/50';

// 15-minute time options for TimeSelect — enforced by only offering these values,
// since <input type="time">'s dropdown picker ignores its `step` attribute.
const TIME_OPTIONS = (() => {
  const out = [];
  for (let m = 0; m < 24 * 60; m += 15) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return out;
})();

function timeLabel(v) {
  const [h, m] = v.split(':').map(Number);
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

/** "14:30" + 30 → "15:00", wrapping past midnight */
function addMinutes(time, mins) {
  const [h, m] = time.split(':').map(Number);
  const total = (h * 60 + m + mins + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const TIME_SELECT_OPTIONS = TIME_OPTIONS.map(o => ({ value: o, label: timeLabel(o) }));

function TimeSelect({ value, onChange, disabled, icon }) {
  // Keep an off-grid legacy value (e.g. 05:35) selectable so opening an old task
  // never silently rewrites a time the user didn't touch.
  const offGrid = value && !TIME_OPTIONS.includes(value);
  const options = offGrid
    ? [{ value, label: timeLabel(value) }, ...TIME_SELECT_OPTIONS]
    : TIME_SELECT_OPTIONS;
  return (
    <PillSelect
      icon={icon}
      value={value}
      onChange={onChange}
      options={options}
      placeholder="--:--"
      disabled={disabled}
    />
  );
}

// ── Inline subtask time-block editor (date + start + end) ──────────────────────
function SubTaskBlockEditor({ initialDate, initialStart, initialEnd, onSave, onCancel }) {
  const [date,  setDate]  = useState(initialDate  || '');
  const [start, setStart] = useState(initialStart || '09:00');
  const [end,   setEnd]   = useState(initialEnd   || '09:30');

  const handleStartChange = (v) => { setStart(v); setEnd(addMinutes(v, 30)); };

  return (
    <div className="px-3 pb-3 pt-1 border-t border-outline-variant/10 space-y-2">
      <InputRow icon="calendar_today">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className={INPUT_CLASS} />
      </InputRow>
      <div className="grid grid-cols-2 gap-2">
        <TimeSelect icon="schedule" value={start} onChange={handleStartChange} disabled={!date} />
        <TimeSelect icon="schedule" value={end} onChange={setEnd} disabled={!date} />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onSave(date, start, end)}
          className="flex-1 h-9 rounded-full bg-primary text-on-primary text-label-md font-bold hover:bg-primary/90 transition-[background-color,transform] duration-150 active:scale-[0.97]"
        >
          Save
        </button>
        {(initialDate || date) && (
          <button
            type="button"
            onClick={() => onSave('', '', '')}
            className="h-9 px-4 rounded-full border border-outline-variant text-on-surface-variant text-label-md hover:bg-error-container hover:text-error transition-[background-color,color,transform] duration-150 active:scale-[0.97]"
          >
            Clear
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="h-9 px-4 rounded-full border border-outline-variant text-on-surface-variant text-label-md hover:bg-surface-container transition-[background-color,transform] duration-150 active:scale-[0.97]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Assignee chip (header) — avatar + name, dashed circle when unassigned ─────
function AssigneeChip({ value, onChange, users }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const assignee = users.find(u => String(u.id) === String(value));

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 bg-surface-container rounded-full pl-1 pr-3 h-9 hover:bg-surface-container-high transition-colors duration-150"
      >
        {assignee ? (
          <span
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-label-sm font-bold flex-shrink-0"
            style={{ backgroundColor: assignee.avatar_colour || '#6366f1' }}
          >
            {(assignee.display_name || '?')[0].toUpperCase()}
          </span>
        ) : (
          <span className="w-7 h-7 rounded-full border-2 border-dashed border-on-surface-variant/40 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-[14px] text-on-surface-variant/50">person</span>
          </span>
        )}
        <span className={`text-label-md ${assignee ? 'text-on-surface font-bold' : 'text-on-surface-variant/60 font-light'}`}>
          {assignee ? assignee.display_name : 'Assign'}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 bg-surface-container-lowest rounded-2xl shadow-heavy border border-outline-variant/20 overflow-y-auto max-h-72 z-10">
          <button
            type="button"
            onClick={() => { onChange(''); setOpen(false); }}
            className={`w-full flex items-center gap-2.5 text-left px-3.5 py-2.5 text-body-md font-light transition-colors ${!value ? 'text-primary bg-primary/5 font-medium' : 'text-on-surface hover:bg-surface-container'}`}
          >
            <span className="w-6 h-6 rounded-full border-2 border-dashed border-on-surface-variant/40 flex-shrink-0" />
            Unassigned
          </button>
          {users.map(u => (
            <button
              key={u.id}
              type="button"
              onClick={() => { onChange(String(u.id)); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 text-left px-3.5 py-2.5 text-body-md font-light transition-colors ${String(value) === String(u.id) ? 'text-primary bg-primary/5 font-medium' : 'text-on-surface hover:bg-surface-container'}`}
            >
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-label-sm font-bold flex-shrink-0"
                style={{ backgroundColor: u.avatar_colour || '#6366f1' }}
              >
                {(u.display_name || '?')[0].toUpperCase()}
              </span>
              {u.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────
export default function TaskForm({ open, onClose, task = null, defaultStatus = null, defaultProjectId = null }) {
  const qc = useQueryClient();
  const { user } = useAuthStore();

  // ── form state ───────────────────────────────────────────────────────────────
  const [title,          setTitle]          = useState('');
  const [description,    setDescription]    = useState('');
  const [taskNotes,      setTaskNotes]      = useState('');
  const [priority,       setPriority]       = useState('medium');
  const [status,         setStatus]         = useState('todo');
  const [deadline,       setDeadline]       = useState('');   // date-only (top-level tasks)
  const [blockDate,      setBlockDate]      = useState('');   // scheduled time-block day
  const [startTime,      setStartTime]      = useState('');
  const [endTime,        setEndTime]        = useState('');
  const [scheduleOpen,   setScheduleOpen]   = useState(false); // Schedule pill's inline editor
  const [assignedTo,     setAssignedTo]     = useState('');
  const [areaId,         setAreaId]         = useState('');
  const [tagInput,       setTagInput]       = useState('');
  const [tags,           setTags]           = useState([]);
  const [projectId,      setProjectId]      = useState('');
  const [phaseId,        setPhaseId]        = useState('');
  const [newComment,     setNewComment]     = useState('');
  const [isRecurring,    setIsRecurring]    = useState(false);
  const [recurInterval,  setRecurInterval]  = useState('weekly');
  const [recurDays,      setRecurDays]      = useState([]);   // weekday numbers for 'weekdays'
  const [saveError,      setSaveError]      = useState('');
  // New subtask fields (time block: date + start + end)
  const [newSubTask,      setNewSubTask]      = useState('');
  const [newSubDate,      setNewSubDate]      = useState('');
  const [newSubStart,     setNewSubStart]     = useState('09:00');
  const [newSubEnd,       setNewSubEnd]       = useState('09:30');
  // Which subtask is having its time block edited inline
  const [editingSubTaskDateId, setEditingSubTaskDateId] = useState(null);

  const isSubtask = !!task?.parent_task_id;

  // ── remote data ──────────────────────────────────────────────────────────────
  const { data: users    = [] } = useQuery({ queryKey: ['users'],    queryFn: () => api.get('/users').then(r => r.data),    enabled: open });
  const { data: areas    = [] } = useQuery({ queryKey: ['areas'],    queryFn: () => api.get('/areas').then(r => r.data),    enabled: open });
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => api.get('/projects').then(r => r.data), enabled: open });
  const { data: phases   = [] } = useQuery({
    // projectId state is a string; key by number so it shares one cache entry
    // with ProjectDetail's queries/invalidations (['project-phases', 5]).
    queryKey: ['project-phases', parseInt(projectId) || null],
    queryFn:  () => api.get(`/projects/${projectId}/phases`).then(r => r.data),
    enabled:  open && !!projectId,
  });
  const { data: comments = [] } = useQuery({
    queryKey: ['task-comments', task?.id],
    queryFn:  () => api.get(`/tasks/${task.id}/comments`).then(r => r.data),
    enabled:  !!task?.id,
  });
  const { data: subTasks = [] } = useQuery({
    queryKey: ['tasks', { parentTaskId: task?.id }],
    queryFn:  () => api.get('/tasks', { params: { parentTaskId: task.id } }).then(r => r.data),
    enabled:  !!task?.id,
  });
  const { data: deepWorkSummary } = useQuery({
    queryKey: ['deep-work-summary', task?.id],
    queryFn:  () => api.get(`/deep-work/tasks/${task.id}/summary`).then(r => r.data),
    enabled:  !!task?.id,
  });
  const openDeepWork = useDeepWorkStore(s => s.openSetup);

  // ── populate when task / open changes ────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    if (task) {
      setTitle(task.title || '');
      setDescription(task.description || '');
      setTaskNotes(task.task_notes || '');
      setPriority(task.priority || 'medium');
      setStatus(task.status || 'todo');
      setDeadline(task.due_date ? task.due_date.slice(0, 10) : '');
      const s = splitDateTime(task.start_at);
      const e = splitDateTime(task.end_at);
      setBlockDate(s.date || e.date || '');
      setStartTime(s.time || '');
      setEndTime(e.time || '');
      setAssignedTo(task.assigned_to  ? String(task.assigned_to)  : '');
      setAreaId(task.area_id      ? String(task.area_id)      : '');
      setProjectId(task.project_id ? String(task.project_id) : '');
      setPhaseId(task.phase_id ? String(task.phase_id) : '');
      setTags(task.tags || []);
      setIsRecurring(!!task.is_recurring);
      setRecurInterval(task.recur_interval || 'weekly');
      setRecurDays(task.recur_days ? task.recur_days.split(',').filter(Boolean).map(Number) : []);
    } else {
      setTitle(''); setDescription(''); setTaskNotes('');
      setPriority('medium'); setStatus(defaultStatus || 'todo');
      setDeadline(''); setBlockDate(''); setStartTime(''); setEndTime('');
      setAssignedTo(user?.id ? String(user.id) : ''); setAreaId('');
      setProjectId(defaultProjectId ? String(defaultProjectId) : ''); setPhaseId(''); setTags([]); setTagInput('');
      setIsRecurring(false); setRecurInterval('weekly'); setRecurDays([]);
    }
    setNewSubTask(''); setNewSubDate(''); setNewSubStart('09:00'); setNewSubEnd('09:30');
    setEditingSubTaskDateId(null);
    setScheduleOpen(false);
    setNewComment('');
    setSaveError('');
  }, [task, open, defaultStatus, defaultProjectId]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // ── mutations ────────────────────────────────────────────────────────────────
  // Tasks render on both the task list pages (['tasks']) and the calendar
  // (['calendar'], ['calendar-upcoming']) — invalidate all three so a save made
  // from either surface shows up on the other without a full page reload.
  const invalidateTaskQueries = () => {
    qc.invalidateQueries({ queryKey: ['tasks'] });
    qc.invalidateQueries({ queryKey: ['calendar'] });
    qc.invalidateQueries({ queryKey: ['calendar-upcoming'] });
  };

  const createTask = useMutation({
    mutationFn: d => api.post('/tasks', d),
    onSuccess: (_data, d) => {
      invalidateTaskQueries(); onClose();
      if (d.status === 'done') useCelebrationStore.getState().fire();
    },
    onError: err => setSaveError(err.response?.data?.detail || err.response?.data?.error || 'Failed to create task'),
  });
  const updateTask = useMutation({
    mutationFn: d => api.put(`/tasks/${task.id}`, d),
    onSuccess: (_data, d) => {
      invalidateTaskQueries(); onClose();
      // The server syncs is_completed when status is set to 'done' via this
      // same PUT (taskService.js), so a plain save-with-status-done needs to
      // fire the celebration too, not just the dedicated complete endpoint.
      if (d.status === 'done' && task.status !== 'done') useCelebrationStore.getState().fire();
    },
    onError: err => setSaveError(err.response?.data?.detail || err.response?.data?.error || 'Failed to save changes'),
  });
  const completeSubTask = useMutation({
    mutationFn: id => api.post(`/tasks/${id}/complete`),
    onSuccess: () => { invalidateTaskQueries(); useCelebrationStore.getState().fire(); },
  });
  const updateSubTask = useMutation({
    mutationFn: ({ id, data }) => api.put(`/tasks/${id}`, data),
    onSuccess: invalidateTaskQueries,
  });
  const createSubTask = useMutation({
    mutationFn: d => api.post('/tasks', d),
    onSuccess: () => {
      invalidateTaskQueries();
      setNewSubTask(''); setNewSubDate(''); setNewSubStart('09:00'); setNewSubEnd('09:30');
    },
  });
  const addComment = useMutation({
    mutationFn: content => api.post(`/tasks/${task.id}/comments`, { content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-comments', task.id] });
      setNewComment('');
    },
  });
  const deleteComment = useMutation({
    mutationFn: commentId => api.delete(`/tasks/${task.id}/comments/${commentId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-comments', task.id] }),
  });

  // ── helpers ──────────────────────────────────────────────────────────────────
  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setTagInput('');
  };

  const handleSubmit = e => {
    if (e?.preventDefault) e.preventDefault();
    if (!title.trim()) return;
    if (startTime && endTime && blockDate && endTime <= startTime) {
      setSaveError('The block end time must be after the start time.');
      return;
    }
    setSaveError('');
    const data = {
      title:           title.trim(),
      description:     description.trim() || null,
      task_notes:      taskNotes.trim() || null,
      project_id:      projectId  ? parseInt(projectId)  : null,
      phase_id:        projectId && phaseId ? parseInt(phaseId) : null,
      priority, status,
      // Deadlines belong to top-level tasks only; subtasks are scheduled purely by their block.
      due_date:        isSubtask ? null : (deadline || null),
      start_at:        combineDateTime(blockDate, startTime),
      end_at:          combineDateTime(blockDate, endTime),
      assigned_to:     assignedTo ? parseInt(assignedTo) : null,
      area_id:         areaId     ? parseInt(areaId)     : null,
      tags,
      is_recurring:    isRecurring,
      recur_interval:  isRecurring ? recurInterval : null,
      recur_days:      isRecurring && recurInterval === 'weekdays' ? recurDays.slice().sort((a, b) => a - b).join(',') : null,
    };
    task ? updateTask.mutate(data) : createTask.mutate(data);
  };

  const toggleRecurDay = day =>
    setRecurDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);

  const handleAddSubTask = () => {
    if (!newSubTask.trim()) return;
    createSubTask.mutate({
      title:          newSubTask.trim(),
      parent_task_id: task.id,
      start_at:       combineDateTime(newSubDate, newSubStart),
      end_at:         combineDateTime(newSubDate, newSubEnd),
    });
  };

  const handleSubTaskKey = e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    handleAddSubTask();
  };

  const handleSubTaskBlockSave = (stId, date, startT, endT) => {
    updateSubTask.mutate({ id: stId, data: {
      start_at: combineDateTime(date, startT),
      end_at:   combineDateTime(date, endT),
    } });
    setEditingSubTaskDateId(null);
  };

  if (!open) return null;
  const isPending = createTask.isPending || updateTask.isPending;

  // Tags — rendered under Project/Project Phase in the left column.
  const tagsSection = (
    <div>
      <FieldLabel>Tags</FieldLabel>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {tags.map(tag => (
            <span key={tag} className="flex items-center gap-1 bg-primary/10 text-primary px-3 py-1 rounded-full text-label-md">
              {tag}
              <button
                type="button"
                onClick={() => setTags(tags.filter(t => t !== tag))}
                aria-label={`Remove tag ${tag}`}
                className="hover:text-error transition-colors duration-150"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </span>
          ))}
        </div>
      )}
      <InputRow icon="label">
        <input
          type="text"
          value={tagInput}
          onChange={e => setTagInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } }}
          placeholder="Add tag, press Enter..."
          className={INPUT_CLASS}
        />
        {tagInput && (
          <button type="button" onClick={addTag} className="text-primary flex-shrink-0 ml-1">
            <span className="material-symbols-outlined text-[20px]">add</span>
          </button>
        )}
      </InputRow>
    </div>
  );

  const areaOptions    = [{ value: '', label: 'No area'     }, ...areas.map(a    => ({ value: String(a.id),    label: `${a.icon} ${a.name}` }))];
  const projectOptions = [{ value: '', label: 'No project'  }, ...projects.map(p => ({ value: String(p.id),    label: `${p.cover_icon} ${p.name}` }))];
  const phaseOptions   = [{ value: '', label: 'No phase'    }, ...phases.map(p   => ({ value: String(p.id),    label: p.name }))];
  const recurOptions   = RECUR_OPTIONS;

  // Recurring controls — rendered inline in the single column when creating, and
  // in the roomier right column when editing.
  const recurringSection = (
    <div className="space-y-2">
      <div className="flex items-center gap-4 bg-surface-container rounded-2xl px-4 py-3">
        <button
          type="button"
          onClick={() => setIsRecurring(v => !v)}
          className={`relative w-10 h-6 rounded-full border transition-colors duration-150 ease-out flex-shrink-0 ${isRecurring ? 'bg-primary border-primary' : 'bg-surface-container-high border-outline-variant'}`}
        >
          <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white border border-outline-variant shadow transition-transform duration-150 ease-out ${isRecurring ? 'translate-x-4 border-transparent' : ''}`} />
        </button>
        <span className="text-body-md font-light text-on-surface">Recurring task</span>
        {isRecurring && (
          <div className="ml-auto">
            <PillSelect value={recurInterval} onChange={setRecurInterval} options={recurOptions} />
          </div>
        )}
      </div>

      {isRecurring && recurInterval === 'weekdays' && (
        <div className="bg-surface-container rounded-2xl px-4 py-3">
          <p className="text-label-sm text-on-surface-variant mb-2">Repeat on</p>
          <div className="flex gap-1.5">
            {WEEKDAYS.map((d, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleRecurDay(d.value)}
                className={`w-9 h-9 rounded-full text-label-md font-bold transition-[background-color,color,transform] duration-150 active:scale-[0.97] ${
                  recurDays.includes(d.value)
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {isRecurring && !isSubtask && (
        <p className="text-label-sm text-on-surface-variant/60 px-1">
          {deadline
            ? `Repeats until the deadline (${(() => { try { return format(parseISO(deadline), 'MMM d, yyyy'); } catch { return deadline; } })()}).`
            : 'Set a deadline to bound how long this repeats.'}
        </p>
      )}
    </div>
  );

  return (
    <div
      className="fixed inset-0 bg-inverse-surface/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      {/* Modal shell — sticky header + scrollable body + sticky footer */}
      <div className="bg-surface-container-lowest rounded-2xl shadow-heavy w-full max-h-[92vh] flex flex-col max-w-4xl">

        {/* ── Header (sticky) ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-outline-variant/20 flex-shrink-0">
          <h2 className="text-headline-md font-light tracking-wide text-on-background">
            {task ? 'Edit Task' : 'New Task'}
          </h2>
          <div className="flex items-center gap-2">
            <AssigneeChip value={assignedTo} onChange={setAssignedTo} users={users} />
            <button
              onClick={onClose}
              aria-label="Close"
              className="h-10 w-10 rounded-full flex items-center justify-center hover:bg-surface-container text-on-surface-variant transition-[background-color,transform] duration-150 active:scale-[0.97]"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        {/* ── Scrollable body ──────────────────────────────────────────────── */}
        <form id="task-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-6 items-start">

          {/* ── Left column: core task fields ─────────────────────────────── */}
          <div className="space-y-5">

          {/* Title */}
          <InputRow icon="edit">
            <input
              autoFocus
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Task title..."
              className={INPUT_CLASS}
              required
            />
          </InputRow>

          {/* Description */}
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Description (optional)..."
            rows={2}
            className="w-full bg-surface-container-high rounded-2xl px-4 py-3 text-body-md font-light tracking-wide text-on-surface border border-transparent hover:border-primary focus:ring-2 focus:ring-primary/20 placeholder-on-surface-variant/50 resize-none transition-[box-shadow,border-color] outline-none"
          />

          {/* ── 2-column grid ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-5">

            {/* Priority & Status — merged into one row: priority as colour dots, status as a quiet segmented control */}
            <div className="sm:col-span-2 flex items-center gap-3 overflow-x-auto">
              <div className="flex items-center gap-0.5 flex-shrink-0">
                {PRIORITIES.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    aria-label={`Priority: ${p}`}
                    title={`Priority: ${p}`}
                    className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                  >
                    <span
                      className={`block rounded-full transition-all duration-150 ${PRIORITY_DOT[p]} ${
                        priority === p
                          ? `w-3 h-3 ring-2 ring-offset-2 ring-offset-surface-container-lowest ${PRIORITY_RING[p]}`
                          : 'w-2.5 h-2.5 opacity-35 hover:opacity-60'
                      }`}
                    />
                  </button>
                ))}
                <span className="text-label-md font-bold text-on-surface ml-1.5 whitespace-nowrap">{PRIORITY_LABELS[priority]}</span>
              </div>

              <div className="w-px h-5 bg-outline-variant/40 flex-shrink-0" />

              <div className="flex items-center gap-0.5 flex-shrink-0">
                {STATUSES.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={`h-8 px-2.5 rounded-full text-label-sm whitespace-nowrap transition-[background-color,color,transform] duration-150 active:scale-[0.97] ${
                      status === s
                        ? 'bg-on-surface text-surface-container-lowest font-bold'
                        : 'text-on-surface-variant/60 hover:text-on-surface-variant font-light'
                    }`}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* Deadline + Schedule — side by side; Deadline is date-only, Schedule opens
                the same date+start/end editor used for sub-task time blocks. The editor
                itself spans the full row (not just the Schedule half) so it has room. */}
            <div className="sm:col-span-2 space-y-4">
              <div className="flex flex-wrap items-start gap-4">
                {!isSubtask && (
                  <div className="flex-1 min-w-[180px]">
                    <FieldLabel>
                      Deadline
                      <span className="ml-1 normal-case font-normal text-on-surface-variant/50">(all-day)</span>
                    </FieldLabel>
                    <InputRow icon="event_available">
                      <input
                        type="date"
                        value={deadline}
                        onChange={e => setDeadline(e.target.value)}
                        className={INPUT_CLASS}
                      />
                    </InputRow>
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {QUICK_DATES.map(({ label, days }) => {
                        const val = quickDate(days);
                        return (
                          <button
                            key={label}
                            type="button"
                            onClick={() => setDeadline(val)}
                            className={`px-2.5 h-6 rounded-full text-label-sm transition-[background-color,color,transform] duration-150 active:scale-[0.97] ${
                              deadline === val
                                ? 'bg-primary text-on-primary'
                                : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                      {deadline && (
                        <button
                          type="button"
                          onClick={() => setDeadline('')}
                          className="px-2.5 h-6 rounded-full text-label-sm bg-surface-container text-on-surface-variant hover:bg-error-container hover:text-error transition-[background-color,color,transform] duration-150 active:scale-[0.97] flex items-center gap-0.5"
                        >
                          <span className="material-symbols-outlined text-[11px]">close</span>
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex-1 min-w-[180px]">
                  <FieldLabel>
                    Schedule Time Block
                    <span className="ml-1 normal-case font-normal text-on-surface-variant/50">(Optional)</span>
                  </FieldLabel>
                  <div className="w-full bg-surface-container-high rounded-full flex items-center pl-4 pr-1.5 h-12">
                    <span className="material-symbols-outlined text-on-surface-variant/50 mr-2 text-[20px] flex-shrink-0">calendar_today</span>
                    <span className={`flex-1 text-left text-body-md font-light tracking-wide truncate ${blockDate ? 'text-on-surface' : 'text-on-surface-variant/50'}`}>
                      {blockDate ? format(parseISO(blockDate), 'MMM d, yyyy') : 'mm/dd/yyyy'}
                    </span>
                    {/* Schedule toggle — same treatment as the sub-task time-block toggle */}
                    <button
                      type="button"
                      onClick={() => setScheduleOpen(v => !v)}
                      title={blockDate ? 'Edit time block' : 'Schedule a time block'}
                      className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-[background-color,color,transform] duration-150 active:scale-[0.97] ${
                        scheduleOpen
                          ? 'bg-primary text-on-primary'
                          : 'text-on-surface-variant/40 hover:text-primary hover:bg-primary/10'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">calendar_today</span>
                    </button>
                  </div>
                  {blockDate && startTime && (
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      <span className="px-2.5 h-6 rounded-full text-label-sm bg-primary text-on-primary flex items-center">
                        {`${timeLabel(startTime)}${endTime ? `–${timeLabel(endTime)}` : ''}`}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {scheduleOpen && (
                <div className="bg-surface-container rounded-2xl">
                  <SubTaskBlockEditor
                    initialDate={blockDate}
                    initialStart={startTime}
                    initialEnd={endTime}
                    onSave={(d, s, e) => { setBlockDate(d); setStartTime(s); setEndTime(e); setScheduleOpen(false); }}
                    onCancel={() => setScheduleOpen(false)}
                  />
                </div>
              )}
            </div>

            {/* Area */}
            <div className="sm:col-span-2">
              <FieldLabel>Area</FieldLabel>
              <PillSelect
                icon="grid_view"
                value={areaId}
                onChange={setAreaId}
                options={areaOptions}
                placeholder="No area"
              />
            </div>

            {/* Project */}
            <div>
              <FieldLabel>Project</FieldLabel>
              <PillSelect
                icon="folder_copy"
                value={projectId}
                onChange={v => { setProjectId(v); setPhaseId(''); }}
                options={projectOptions}
                placeholder="No project"
              />
            </div>

            {/* Project Phase — always shown; only selectable once a project is picked */}
            <div>
              <FieldLabel>Project Phase</FieldLabel>
              <PillSelect
                icon="linear_scale"
                value={phaseId}
                onChange={setPhaseId}
                options={phaseOptions}
                placeholder={projectId ? 'No phase' : 'Pick a project first'}
              />
            </div>

            {/* Tags — under Project/Project Phase */}
            <div className="sm:col-span-2">
              {tagsSection}
            </div>

          </div>{/* end 2-col grid */}

          {!!deepWorkSummary?.total_sec && (
            <p className="text-label-sm text-on-surface-variant/70 px-1">
              Deep work logged: {formatDeepWorkTime(deepWorkSummary.total_sec)}
            </p>
          )}

          </div>{/* ── end left column ── */}

          {/* ── Right column: Notes · Recurring · Sub-tasks (edit only) · Comments (edit only) ── */}
          <div className="space-y-5 lg:border-l lg:border-outline-variant/20 lg:pl-6">

          {/* Task Notes */}
          <div>
            <FieldLabel>Notes</FieldLabel>
            <TaskNotes value={taskNotes} onChange={setTaskNotes} height={180} />
          </div>

          {/* Recurring — moved here for the extra room in the right column */}
          {recurringSection}

          {/* ── Sub-tasks ─────────────────────────────────────────────────── */}
          {task && (
            <div>
              <FieldLabel>
                Sub-tasks
                {subTasks.length > 0 && (
                  <span className="ml-2 normal-case font-normal text-on-surface-variant/60">
                    ({subTasks.filter(s => !!s.is_completed).length}/{subTasks.length} done)
                  </span>
                )}
              </FieldLabel>

              {subTasks.length > 0 && (
                <div className="space-y-1 mb-3">
                  {subTasks.map(st => {
                    const isEditingDate = editingSubTaskDateId === st.id;
                    const stBlockDate  = splitDateTime(st.start_at).date || splitDateTime(st.end_at).date;
                    const stStart      = splitDateTime(st.start_at).time;
                    const stEnd        = splitDateTime(st.end_at).time;
                    return (
                      <div key={st.id} className="rounded-xl bg-surface-container overflow-hidden">
                        {/* Subtask row */}
                        <div className="flex items-center gap-3 px-3 py-2">
                          <button
                            type="button"
                            onClick={() => completeSubTask.mutate(st.id)}
                            aria-label={st.is_completed ? 'Mark sub-task incomplete' : 'Mark sub-task complete'}
                            className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-primary/70 transition-[background-color,border-color,transform] duration-150 active:scale-[0.97] ${
                              st.is_completed
                                ? 'bg-primary border-primary text-on-primary'
                                : 'border-outline hover:border-primary'
                            }`}
                          >
                            {!!st.is_completed && (
                              <span className="material-symbols-outlined text-[12px]">check</span>
                            )}
                          </button>

                          <span className={`text-body-md font-light flex-1 min-w-0 truncate ${st.is_completed ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>
                            {st.title}
                          </span>

                          {/* Time-block badge */}
                          {st.start_at && !isEditingDate && (
                            <span className="text-label-sm text-on-surface-variant/70 flex-shrink-0 whitespace-nowrap">
                              {formatBlock(st.start_at, st.end_at)}
                            </span>
                          )}

                          {/* Schedule toggle */}
                          <button
                            type="button"
                            onClick={() => setEditingSubTaskDateId(isEditingDate ? null : st.id)}
                            title={st.start_at ? 'Edit time block' : 'Schedule a time block'}
                            className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-[background-color,color,transform] duration-150 active:scale-[0.97] ${
                              isEditingDate
                                ? 'bg-primary text-on-primary'
                                : 'text-on-surface-variant/40 hover:text-primary hover:bg-primary/10'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[16px]">calendar_today</span>
                          </button>
                        </div>

                        {/* Inline time-block editor */}
                        {isEditingDate && (
                          <SubTaskBlockEditor
                            initialDate={stBlockDate}
                            initialStart={stStart}
                            initialEnd={stEnd}
                            onSave={(date, startT, endT) => handleSubTaskBlockSave(st.id, date, startT, endT)}
                            onCancel={() => setEditingSubTaskDateId(null)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* New subtask input */}
              <div className="space-y-2">
                <InputRow icon="subdirectory_arrow_right">
                  <input
                    type="text"
                    value={newSubTask}
                    onChange={e => setNewSubTask(e.target.value)}
                    onKeyDown={handleSubTaskKey}
                    placeholder="Add sub-task, press Enter..."
                    className={INPUT_CLASS}
                  />
                  {newSubTask.trim() && (
                    <button type="button" onClick={handleAddSubTask} className="text-primary flex-shrink-0 ml-1">
                      <span className="material-symbols-outlined text-[20px]">add</span>
                    </button>
                  )}
                </InputRow>

                {/* Optional time block for the new subtask (shown while typing) */}
                {newSubTask.trim() && (
                  <div className="space-y-2">
                    <InputRow icon="calendar_today">
                      <input
                        type="date"
                        value={newSubDate}
                        onChange={e => setNewSubDate(e.target.value)}
                        className={INPUT_CLASS}
                      />
                    </InputRow>
                    <div className="grid grid-cols-2 gap-2">
                      <TimeSelect icon="schedule" value={newSubStart} onChange={(v) => { setNewSubStart(v); setNewSubEnd(addMinutes(v, 30)); }} disabled={!newSubDate} />
                      <TimeSelect icon="schedule" value={newSubEnd} onChange={setNewSubEnd} disabled={!newSubDate} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Comments (edit mode only) ────────────────────────────────────── */}
          {task && (
            <div>
              <FieldLabel>
                Comments
                {comments.length > 0 && (
                  <span className="ml-2 normal-case font-normal text-on-surface-variant/60">({comments.length})</span>
                )}
              </FieldLabel>

              {comments.length > 0 && (
                <div className="space-y-3 mb-3">
                  {comments.map(c => (
                    <div key={c.id} className="flex items-start gap-2.5 group">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-label-sm font-bold flex-shrink-0 mt-0.5"
                        style={{ backgroundColor: c.avatar_colour || '#6366f1' }}
                      >
                        {(c.display_name || '?')[0].toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1 bg-surface-container rounded-2xl px-3.5 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-label-md font-bold text-on-surface">{c.display_name}</span>
                          <span className="text-label-sm text-on-surface-variant/60 flex-shrink-0">
                            {format(new Date(c.created_at.includes('T') ? c.created_at : `${c.created_at.replace(' ', 'T')}Z`), 'MMM d, h:mm a')}
                          </span>
                        </div>
                        <p className="text-body-md font-light text-on-surface mt-0.5 whitespace-pre-wrap break-words">{c.content}</p>
                      </div>
                      {c.user_id === user?.id && (
                        <button
                          type="button"
                          onClick={() => deleteComment.mutate(c.id)}
                          aria-label="Delete comment"
                          className="can-hover:opacity-0 can-hover:group-hover:opacity-100 focus-visible:opacity-100 w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-on-surface-variant hover:bg-error-container hover:text-error transition-[background-color,color,opacity] duration-150"
                        >
                          <span className="material-symbols-outlined text-[15px]">delete</span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <InputRow icon="chat_bubble">
                <input
                  type="text"
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newComment.trim()) {
                      e.preventDefault();
                      addComment.mutate(newComment.trim());
                    }
                  }}
                  placeholder="Add a comment, press Enter..."
                  disabled={addComment.isPending}
                  className={INPUT_CLASS}
                />
                {newComment.trim() && (
                  <button
                    type="button"
                    onClick={() => addComment.mutate(newComment.trim())}
                    disabled={addComment.isPending}
                    className="text-primary flex-shrink-0 ml-1"
                  >
                    <span className="material-symbols-outlined text-[20px]">send</span>
                  </button>
                )}
              </InputRow>
            </div>
          )}

          </div>{/* ── end right column ── */}

          </div>{/* ── end two-column wrapper ── */}
        </form>

        {/* ── Sticky footer (always visible) ──────────────────────────────── */}
        <div className="px-6 py-4 border-t border-outline-variant/20 flex-shrink-0 space-y-2">
          {saveError && (
            <p className="text-label-sm text-error text-center">{saveError}</p>
          )}
          {task && task.status !== 'done' && (
            <button
              type="button"
              onClick={() => { openDeepWork(task.id); onClose(); }}
              className="w-full h-11 rounded-full border border-primary text-primary text-label-md font-bold tracking-wide hover:bg-primary/10 transition-[background-color,transform] duration-150 active:scale-[0.97] flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">center_focus_strong</span>
              Start Deep Work
            </button>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-12 rounded-full bg-surface-container-lowest border border-outline-variant/40 text-on-surface-variant text-label-md font-bold tracking-wide hover:bg-surface-container transition-[background-color,transform] duration-150 active:scale-[0.97]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!title.trim() || isPending}
              className="flex-1 h-12 rounded-full bg-primary text-on-primary text-label-md font-bold tracking-wide hover:bg-primary/90 transition-[background-color,opacity,transform] duration-150 disabled:opacity-50 active:scale-[0.97] flex items-center justify-center gap-2"
            >
              {isPending && (
                <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
              )}
              {task ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
