import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useUiStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { useAuth, api } from '../auth/AuthContext';
import { useSpaceStore } from '../store/spaceStore';
import { useMode } from '../hooks/useMode';
import ChatDrawer from '../components/ChatDrawer';
import Logo, { PaperrMark, DotIcon } from '../components/Logo';
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

function NavItem({ to, label, icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-3 mx-3 px-3 py-2.5 rounded-xl text-body-lg tracking-wide transition-colors duration-150 cursor-pointer
         ${isActive
           ? 'text-primary font-semibold bg-primary/10'
           : 'text-on-surface font-medium hover:bg-surface-container mono-light:hover:bg-black/[0.06]'
         }`
      }
    >
      <span className="material-symbols-outlined text-[22px]">{icon}</span>
      {label}
    </NavLink>
  );
}

// Icon-over-label nav item for the collapsed rail — mirrors the tablet nav rail.
function NavItemCollapsed({ to, label, icon, end }) {
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

export default function DesktopLayout({ children }) {
  const { sidebarOpen, toggleSidebar, quickCreate, setQuickCreate, setChatOpen } = useUiStore();
  const { user } = useAuthStore();
  const { setMode } = useMode();
  const { logout } = useAuth();
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

  // React to quickCreate store signal
  React.useEffect(() => {
    if (!quickCreate) return;
    if (quickCreate === 'task')    { setTaskFormOpen(true);  setQuickCreate(null); }
    if (quickCreate === 'event')   { setEventFormOpen(true); setQuickCreate(null); }
    if (quickCreate === 'project') { setProjectFormOpen(true); setQuickCreate(null); }
    if (quickCreate === 'list')    { setListFormOpen(true);    setQuickCreate(null); }
  }, [quickCreate]);

  const adminNavItems = NAV_ITEMS.filter(
    (item) => !item.adminOnly || user?.role === 'admin'
  );

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      {/* ── Sidebar ──────────────────────────────────────────────── */}
      <aside
        className={`
          fixed top-0 left-0 h-full bg-surface-container-lowest border-r border-outline-variant/20
          flex flex-col transition-[width] duration-300 ease-out z-30 overflow-hidden
          ${sidebarOpen ? 'w-60' : 'w-[88px]'}
        `}
      >
        {/* Logo — full wordmark when expanded, mark only when collapsed */}
        {sidebarOpen ? (
          <div className="px-5 py-5 flex-shrink-0">
            <Logo size="md" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 py-4 flex-shrink-0">
            <PaperrMark size={34} />
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
        )}

        {/* Primary nav */}
        <nav className={`flex-1 overflow-y-auto scrollbar-slim ${sidebarOpen ? 'py-2 space-y-1' : 'px-2 space-y-1'}`}>
          {adminNavItems.map((item) =>
            sidebarOpen
              ? <NavItem key={item.to} {...item} />
              : <NavItemCollapsed key={item.to} {...item} />
          )}
        </nav>

        {/* Bottom nav */}
        <div className={`flex-shrink-0 ${sidebarOpen ? 'py-3 space-y-1' : 'px-2 py-2 space-y-1'}`}>
          {!sidebarOpen && (
            <button
              onClick={() => setChatOpen(true)}
              className="flex flex-col items-center justify-center gap-1 w-full py-3 rounded-2xl text-on-surface hover:bg-surface-container mono-light:hover:bg-black/[0.06] transition-colors"
            >
              <DotIcon size={26} />
              <span className="text-[12px] font-medium tracking-wide leading-none">dotAi</span>
            </button>
          )}
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              sidebarOpen
                ? `flex items-center gap-3 mx-3 px-3 py-2.5 rounded-xl text-body-lg tracking-wide transition-colors duration-150 cursor-pointer
                   ${isActive ? 'text-primary font-semibold bg-primary/10' : 'text-on-surface font-medium hover:bg-surface-container mono-light:hover:bg-black/[0.06]'}`
                : `flex flex-col items-center justify-center gap-1 w-full py-3 rounded-2xl transition-colors duration-150 cursor-pointer
                   ${isActive ? 'text-primary bg-primary/10 font-semibold' : 'text-on-surface hover:bg-surface-container mono-light:hover:bg-black/[0.06]'}`
            }
          >
            <span className={`material-symbols-outlined ${sidebarOpen ? 'text-[22px]' : 'text-[26px]'}`}>settings</span>
            {sidebarOpen ? 'Settings' : <span className="text-[12px] font-medium tracking-wide leading-none">Settings</span>}
          </NavLink>
        </div>
      </aside>

      {/* ── Main area ────────────────────────────────────────────── */}
      <div
        className={`@container flex-1 flex flex-col min-w-0 transition-[margin-left] duration-300 ease-out ${sidebarOpen ? 'ml-60' : 'ml-[88px]'}`}
      >
        {/* Top app bar */}
        <header className="h-20 bg-surface-container-lowest border-b border-outline-variant/20 flex items-center px-6 gap-3 sticky top-0 z-20 min-w-0">
          {/* Hamburger */}
          <button
            onClick={toggleSidebar}
            aria-label="Toggle sidebar"
            className="h-12 w-12 rounded-full flex items-center justify-center hover:bg-surface-container text-on-surface-variant flex-shrink-0 transition-[background-color,transform] duration-150 active:scale-[0.97]"
          >
            <span className="material-symbols-outlined">menu</span>
          </button>

          {/* Clock + Weather — hidden once the bar is too narrow to fit everything */}
          <div className="hidden @2xl:flex items-center gap-3 flex-shrink-0">
            <TopBarClock />
            <TopBarWeather />
          </div>

          <div className="flex-1 min-w-0" />

          {/* Search — matches the tablet bar's fixed width so it doesn't collapse down to just its icon */}
          <div className="w-56 max-w-[40vw]">
            <HeaderSearch onOpenTask={openTaskFromSearch} />
          </div>

          {/* Quick create */}
          <QuickCreateButton variant="icon" />

          {/* User avatar pill */}
          <button
            onClick={() => navigate('/settings')}
            className="h-12 flex items-center gap-3 bg-surface-container-lowest rounded-full pl-1 pr-4 shadow-soft hover:bg-surface-container flex-shrink-0 transition-[background-color,transform] duration-150 active:scale-[0.97]"
          >
            <UserAvatar user={user} />
            <span className="hidden @xl:inline font-label-md text-label-md text-on-surface max-w-[140px] truncate">{user?.nickname || user?.display_name}</span>
          </button>

          {/* Notifications */}
          <NotificationsBell />

          {/* Switch to tablet view — hidden on narrow bars, it's a secondary action */}
          <button
            onClick={() => { setMode('tablet'); window.location.reload(); }}
            className="hidden @lg:flex h-12 w-12 rounded-full items-center justify-center hover:bg-surface-container text-on-surface-variant flex-shrink-0 transition-[background-color,transform] duration-150 active:scale-[0.97]"
            title="Switch to tablet view"
          >
            <span className="material-symbols-outlined">tablet_mac</span>
          </button>

          {/* Space picker — right corner */}
          <SpacePicker
            onCreateSpace={() => setShowSpaceCreate(true)}
            onEditSpace={(space) => setEditingSpace(space)}
          />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="@container max-w-[1800px] mx-auto px-container-padding py-8">
            {children}
          </div>
        </main>
      </div>

      {/* dotAi Chat Drawer */}
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
