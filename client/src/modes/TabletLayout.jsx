import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useUiStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { api } from '../auth/AuthContext';
import { useSpaceStore } from '../store/spaceStore';
import { useMode } from '../hooks/useMode';
import ChatDrawer from '../components/ChatDrawer';
import { PaperrMark } from '../components/Logo';
import TaskForm from '../components/TaskForm';
import QuickCreateButton from '../components/QuickCreateButton';
import TopBarClock from '../components/TopBarClock';
import TopBarWeather from '../components/TopBarWeather';
import HeaderSearch from '../components/HeaderSearch';
import NotificationsBell from '../components/NotificationsBell';
import UserAvatar from '../components/UserAvatar';
import SpacePicker from '../components/SpacePicker';
import EventForm from '../pages/calendar/EventForm';
import CreateSpaceModal from '../pages/CreateSpaceModal';
import ProjectFormModal from '../components/ProjectFormModal';
import { CreateListForm } from '../pages/ListsView';
import { NAV_ITEMS } from './navItems';

// Vertical nav-rail item — icon over label, large touch target.
function RailItem({ to, label, icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex flex-col items-center justify-center gap-1 w-full py-3 rounded-2xl transition-colors duration-150 select-none
         ${isActive
           ? 'text-primary bg-primary/10 font-semibold'
           : 'text-on-surface hover:bg-surface-container active:bg-surface-container mono-light:hover:bg-black/[0.06]'
         }`
      }
    >
      <span className="material-symbols-outlined text-[26px]">{icon}</span>
      <span className="text-[12px] font-medium tracking-wide leading-none text-center">{label}</span>
    </NavLink>
  );
}

export default function TabletLayout({ children }) {
  const { quickCreate, setQuickCreate } = useUiStore();
  const { user } = useAuthStore();
  const { setMode } = useMode();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { switchSpace } = useSpaceStore();
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [listFormOpen, setListFormOpen] = useState(false);
  const [searchTask, setSearchTask] = useState(null);
  const [showSpaceCreate, setShowSpaceCreate] = useState(false);
  const [editingSpace, setEditingSpace] = useState(null);

  const createProject = useMutation({
    mutationFn: (data) => api.post('/projects', data).then(r => r.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setProjectFormOpen(false);
      navigate(`/projects/${data.id}`);
    },
  });

  const createList = useMutation({
    mutationFn: (data) => api.post('/lists', data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['lists'] });
      setListFormOpen(false);
      navigate(`/lists/${res.data.id}`);
    },
  });

  const openTaskFromSearch = (task) => {
    setSearchTask(task);
    setTaskFormOpen(true);
  };

  // React to quickCreate store signal (shared with the other shells)
  useEffect(() => {
    if (!quickCreate) return;
    if (quickCreate === 'task')    { setTaskFormOpen(true);    setQuickCreate(null); }
    if (quickCreate === 'event')   { setEventFormOpen(true);   setQuickCreate(null); }
    if (quickCreate === 'project') { setProjectFormOpen(true); setQuickCreate(null); }
    if (quickCreate === 'list')    { setListFormOpen(true);    setQuickCreate(null); }
  }, [quickCreate]);

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      {/* ── Navigation rail ──────────────────────────────────────── */}
      <aside className="w-[88px] flex-shrink-0 bg-surface-container-lowest border-r border-outline-variant/20 flex flex-col">
        <div className="flex flex-col items-center gap-1.5 py-4 flex-shrink-0">
          <PaperrMark size={34} />
          {/* Wordmark — matches the actual paperr logo's font & style */}
          <span
            className="leading-none text-on-surface"
            style={{
              fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
              fontWeight: 600,
              fontSize: '16px',
              letterSpacing: '-0.04em',
            }}
          >
            paperr
          </span>
        </div>
        <nav className="flex-1 px-2 space-y-1 overflow-y-auto scrollbar-slim">
          {NAV_ITEMS.map((item) => (
            <RailItem key={item.to} {...item} />
          ))}
        </nav>
        <div className="px-2 py-2 space-y-1">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 w-full py-3 rounded-2xl transition-colors
               ${isActive ? 'text-primary bg-primary/10 font-semibold' : 'text-on-surface font-medium hover:bg-surface-container mono-light:hover:bg-black/[0.06]'}`
            }
          >
            <span className="material-symbols-outlined text-[26px]">settings</span>
            <span className="text-label-sm leading-none">Settings</span>
          </NavLink>
        </div>
      </aside>

      {/* ── Main area ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top app bar — object placement mirrors the desktop view:
            clock + weather on the left, space picker on the far right. */}
        <header className="h-16 bg-surface-container-lowest border-b border-outline-variant/20 flex items-center px-4 gap-2 flex-shrink-0">
          {/* Clock + weather (left) — hidden on portrait to save room */}
          <div className="hidden landscape:flex items-center">
            <TopBarClock />
            <TopBarWeather />
          </div>

          <div className="flex-1" />

          <div className="w-56 max-w-[40vw]">
            <HeaderSearch onOpenTask={openTaskFromSearch} />
          </div>

          {/* User avatar pill — matches the desktop header style */}
          <button
            onClick={() => navigate('/settings')}
            aria-label="Profile & settings"
            className="h-12 flex items-center gap-3 bg-surface-container-lowest rounded-full pl-1 pr-4 shadow-soft hover:bg-surface-container flex-shrink-0 transition-[background-color,transform] duration-150 active:scale-[0.97]"
          >
            <UserAvatar user={user} />
            <span className="font-label-md text-label-md text-on-surface">{user?.nickname || user?.display_name}</span>
          </button>

          <NotificationsBell />

          {/* Switch to desktop mode */}
          <button
            onClick={() => { setMode('desktop'); window.location.reload(); }}
            className="h-12 w-12 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container transition-colors flex-shrink-0"
            title="Switch to desktop mode"
          >
            <span className="material-symbols-outlined">desktop_windows</span>
          </button>

          {/* Space picker — right corner, like desktop */}
          <SpacePicker
            onCreateSpace={() => setShowSpaceCreate(true)}
            onEditSpace={(space) => setEditingSpace(space)}
          />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1800px] mx-auto px-6 py-6">
            {children}
          </div>
        </main>
      </div>

      {/* Floating quick-create button — sits above the dotAi launcher
          (which is fixed at bottom-6 right-6, 64px tall) so they don't overlap. */}
      <div className="fixed bottom-28 right-6 z-40">
        <QuickCreateButton variant="fab" />
      </div>

      <ChatDrawer />

      <TaskForm
        open={taskFormOpen}
        task={searchTask}
        onClose={() => { setTaskFormOpen(false); setSearchTask(null); }}
      />
      <EventForm open={eventFormOpen} onClose={() => setEventFormOpen(false)} />
      {projectFormOpen && (
        <ProjectFormModal
          onClose={() => setProjectFormOpen(false)}
          onSave={(data) => createProject.mutate(data)}
          loading={createProject.isPending}
        />
      )}
      {listFormOpen && (
        <CreateListForm
          onSubmit={(data) => createList.mutate(data)}
          onCancel={() => setListFormOpen(false)}
          loading={createList.isPending}
        />
      )}
      {showSpaceCreate && (
        <CreateSpaceModal
          onClose={() => setShowSpaceCreate(false)}
          onCreated={(space) => {
            switchSpace(space.id);
            queryClient.clear();
            setShowSpaceCreate(false);
            navigate('/');
          }}
        />
      )}
      {editingSpace && (
        <CreateSpaceModal
          space={editingSpace}
          onClose={() => setEditingSpace(null)}
          onUpdated={() => setEditingSpace(null)}
          onDeleted={() => setEditingSpace(null)}
        />
      )}
    </div>
  );
}
