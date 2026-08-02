import React, { useState, useRef, useEffect, useMemo } from 'react';
// useRef + useEffect still needed by ProjectCard's context menu
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../auth/AuthContext';
import ProjectFormModal from '../components/ProjectFormModal';
import { SharedBadge } from '../components/VisibilityToggle';
import { useMode } from '../hooks/useMode';

const STATUS_TABS = [
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'archived', label: 'Archived' },
];

const STATUS_STYLES = {
  active:    'bg-primary/10 text-primary',
  completed: 'bg-surface-variant text-on-surface-variant',
  archived:  'bg-surface-container text-on-surface-variant',
};

const DAY_MS = 24 * 60 * 60 * 1000;

function formatDate(d) {
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return d; }
}

// ── CardAvatar — single-letter member avatar, same shape as ProjectDetail's ───

function CardAvatar({ user, size = 22, ring = false }) {
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

// ── CardProgressRing — same construction as MyTasks' CompletionRing, sized
// for a card corner ─────────────────────────────────────────────────────────

function CardProgressRing({ pct, size = 30, sw = 3.5 }) {
  const r    = (size - sw * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-surface-container-high" strokeWidth={sw} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-primary" strokeWidth={sw}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-on-surface font-bold leading-none" style={{ fontSize: size * 0.3 }}>{pct}%</span>
      </div>
    </div>
  );
}

// ── ProjectCard ───────────────────────────────────────────────────────────────
// Status, members, and current phase all come from the same endpoints
// ProjectDetail uses — same query keys, so opening a card afterwards is a
// warm-cache navigation instead of a fresh fetch.

function ProjectCard({ project, onEdit, onArchive, onActivate, onDelete, onClick }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  // mode-specific, not isTouch — tablet stays on the desktop-style sizing untouched.
  const { mode } = useMode();
  const isTouch = mode === 'phone';

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const { data: dash } = useQuery({
    queryKey: ['project-dashboard', project.id],
    queryFn:  () => api.get(`/projects/${project.id}/dashboard`).then(r => r.data),
  });
  const { data: members = [] } = useQuery({
    queryKey: ['project-members', project.id],
    queryFn:  () => api.get(`/projects/${project.id}/members`).then(r => r.data),
  });
  const { data: phases = [] } = useQuery({
    queryKey: ['project-phases', project.id],
    queryFn:  () => api.get(`/projects/${project.id}/phases`).then(r => r.data),
  });

  const tasks = dash?.tasks || [];
  const stats = dash?.stats;

  const currentPhase = useMemo(() => {
    for (const phase of phases) {
      const phaseTasks = tasks.filter(t => t.phase_id === phase.id);
      const autoComplete = phaseTasks.length > 0 && phaseTasks.every(t => t.is_completed);
      if (!phase.is_completed && !autoComplete) return phase;
    }
    return null;
  }, [phases, tasks]);

  const nextDue = useMemo(() => {
    const upcoming = tasks
      .filter(t => !t.is_completed && t.due_date)
      .sort((a, b) => (a.due_date < b.due_date ? -1 : 1));
    return upcoming[0]?.due_date || null;
  }, [tasks]);
  const dueSoon = nextDue && (new Date(nextDue) - new Date()) < 3 * DAY_MS;

  return (
    <div
      className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 shadow-soft overflow-hidden cursor-pointer hover:shadow-heavy hover:-translate-y-0.5 transition-all duration-200 group"
      onClick={onClick}
    >
      {/* Colour bar */}
      <div className="h-2" style={{ backgroundColor: project.cover_colour || '#6366f1' }} />

      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start gap-3">
          <span
            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
            style={{ backgroundColor: `${project.cover_colour || '#6366f1'}1a` }}
          >
            {project.cover_icon || '📁'}
          </span>
          <div className="flex-1 min-w-0">
            <h3 className="text-headline-sm text-on-surface truncate">{project.name}</h3>
            {project.description && (
              <p className="text-body-sm text-on-surface-variant mt-0.5 line-clamp-1">
                {project.description}
              </p>
            )}
          </div>

          {/* Context menu */}
          <div className="relative flex-shrink-0" ref={menuRef}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setMenuOpen(p => !p); }}
              className={`rounded-full hover:bg-surface-container text-on-surface-variant can-hover:opacity-0 can-hover:group-hover:opacity-100 focus-visible:opacity-100 transition ${isTouch ? 'p-2.5' : 'p-1.5'}`}
            >
              <span className="material-symbols-outlined text-[18px]">more_vert</span>
            </button>
            {menuOpen && (
              <div className={`absolute right-0 z-10 bg-surface-container-lowest rounded-xl shadow-heavy border border-outline-variant/20 py-1 min-w-[140px] ${isTouch ? 'top-11' : 'top-8'}`}>
                <button
                  type="button"
                  className={`flex items-center gap-2 w-full px-3 text-body-sm text-on-surface hover:bg-surface-container transition ${isTouch ? 'py-3' : 'py-2'}`}
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit(project); }}
                >
                  <span className="material-symbols-outlined text-[16px]">edit</span>
                  Edit
                </button>
                {project.status === 'archived' ? (
                  <button
                    type="button"
                    className={`flex items-center gap-2 w-full px-3 text-body-sm text-on-surface hover:bg-surface-container transition ${isTouch ? 'py-3' : 'py-2'}`}
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onActivate(project.id); }}
                  >
                    <span className="material-symbols-outlined text-[16px]">unarchive</span>
                    Activate
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`flex items-center gap-2 w-full px-3 text-body-sm text-on-surface hover:bg-surface-container transition ${isTouch ? 'py-3' : 'py-2'}`}
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onArchive(project.id); }}
                  >
                    <span className="material-symbols-outlined text-[16px]">archive</span>
                    Archive
                  </button>
                )}
                <button
                  type="button"
                  className={`flex items-center gap-2 w-full px-3 text-body-sm text-error hover:bg-error/5 transition ${isTouch ? 'py-3' : 'py-2'}`}
                  onClick={(e) => {
                    e.stopPropagation(); setMenuOpen(false);
                    if (!window.confirm(`Delete "${project.name}" permanently? This cannot be undone.`)) return;
                    const total = stats?.total || 0;
                    const deleteTasks = total > 0 && window.confirm(
                      `Also delete all ${total} task${total !== 1 ? 's' : ''} in this project? Cancel to keep them, unassigned from any project.`
                    );
                    onDelete(project.id, deleteTasks);
                  }}
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Status + shared badge */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wide ${STATUS_STYLES[project.status] || STATUS_STYLES.active}`}>
            {project.status}
          </span>
          <SharedBadge visibility={project.visibility} />
        </div>

        {/* Phase + next due */}
        {(currentPhase || nextDue) && (
          <div className="mt-2.5 flex items-center gap-2 flex-wrap">
            {currentPhase && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]">linear_scale</span>
                {currentPhase.name}
              </span>
            )}
            {nextDue && (
              <span className={`text-xs font-bold flex items-center gap-1 ${dueSoon ? 'text-warning' : 'text-on-surface-variant'}`}>
                <span className="material-symbols-outlined text-[12px]">calendar_today</span>
                Due {formatDate(nextDue)}
              </span>
            )}
          </div>
        )}

        {/* Progress ring */}
        {stats && (
          <div className="mt-3 flex justify-end">
            <CardProgressRing pct={stats.progress} size={46} sw={4.5} />
          </div>
        )}

        {/* Members + task count */}
        <div className="mt-2.5 pt-3 border-t border-outline-variant/15 flex items-center gap-2">
          {members.length > 0 ? (
            <span className="flex items-center -space-x-1.5">
              {members.slice(0, 3).map(m => (
                <CardAvatar key={m.user_id} user={m} size={22} ring />
              ))}
              {members.length > 3 && (
                <span className="w-[22px] h-[22px] rounded-full bg-surface-container text-on-surface-variant text-[9px] font-bold flex items-center justify-center ring-2 ring-surface-container-lowest">
                  +{members.length - 3}
                </span>
              )}
            </span>
          ) : <span />}
          {stats && (
            <span className="ml-auto text-label-sm text-on-surface-variant font-medium whitespace-nowrap">
              <span className="text-on-surface font-bold">{stats.completed}</span>/{stats.total} tasks
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ProjectsHome ──────────────────────────────────────────────────────────────

export default function ProjectsHome() {
  const [statusFilter, setStatusFilter] = useState('active');
  const [showCreate, setShowCreate]     = useState(false);
  const [editProject, setEditProject]   = useState(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  // mode-specific, not isTouch — tablet stays on the desktop-style sizing untouched.
  const { mode } = useMode();
  const isTouch = mode === 'phone';

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data) => api.post('/projects', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      setShowCreate(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/projects/${id}`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      setEditProject(null);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id) => api.put(`/projects/${id}`, { status: 'archived' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });

  const activateMutation = useMutation({
    mutationFn: (id) => api.put(`/projects/${id}`, { status: 'active' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, deleteTasks }) => api.delete(`/projects/${id}`, { params: { deleteTasks } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });

  const filtered = projects.filter(p =>
    statusFilter === 'all' ? p.status !== 'archived' : p.status === statusFilter
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-headline-lg text-on-background leading-tight">Projects</h1>
          <p className="text-label-md text-on-surface-variant/70 mt-0.5">
            {projects.length} project{projects.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-primary text-on-primary rounded-full px-5 py-2.5 text-label-md font-bold hover:bg-primary/90 active:scale-[0.97] transition"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          New Project
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 bg-surface-container rounded-full p-1 w-fit">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-4 rounded-full text-label-sm font-medium transition ${isTouch ? 'py-2.5' : 'py-1.5'} ${
              statusFilter === tab.key
                ? 'bg-surface-container-lowest text-on-surface shadow-soft'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <span className="material-symbols-outlined animate-spin text-primary text-3xl">
            progress_activity
          </span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-on-surface-variant">
          <span className="material-symbols-outlined text-5xl block mb-3">folder_copy</span>
          <p className="text-body-lg">
            {statusFilter !== 'all' ? `No ${statusFilter} projects` : 'No projects yet'}
          </p>
          <p className="text-body-md mt-1">
            {statusFilter !== 'all'
              ? 'Try a different filter'
              : 'Create your first project to get started'}
          </p>
          {statusFilter === 'all' && (
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 inline-flex items-center gap-2 bg-primary text-on-primary rounded-full px-5 py-2.5 text-label-md font-bold hover:bg-primary/90 transition"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              New Project
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-grid-gutter">
          {filtered.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => navigate(`/projects/${project.id}`)}
              onEdit={setEditProject}
              onArchive={(id) => archiveMutation.mutate(id)}
              onActivate={(id) => activateMutation.mutate(id)}
              onDelete={(id, deleteTasks) => deleteMutation.mutate({ id, deleteTasks })}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <ProjectFormModal
          onClose={() => setShowCreate(false)}
          onSave={(data) => createMutation.mutate(data)}
          loading={createMutation.isPending}
        />
      )}

      {/* Edit modal */}
      {editProject && (
        <ProjectFormModal
          project={editProject}
          onClose={() => setEditProject(null)}
          onSave={(data) => updateMutation.mutate({ id: editProject.id, ...data })}
          loading={updateMutation.isPending}
        />
      )}
    </div>
  );
}
