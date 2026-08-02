import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../auth/AuthContext';
import { useUiStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import ChatDrawer from '../components/ChatDrawer';
import { DotIcon } from '../components/Logo';
import QuickCreateButton from '../components/QuickCreateButton';
import SpacePickerSheet from '../components/SpacePickerSheet';
import NotificationsBell from '../components/NotificationsBell';
import UserAvatar from '../components/UserAvatar';
import MoreMenuSheet from '../components/MoreMenuSheet';
import TaskForm from '../components/TaskForm';
import EventForm from '../pages/calendar/EventForm';
import ProjectFormModal from '../components/ProjectFormModal';
import { CreateListForm } from '../pages/ListsView';
import CreateSpaceModal from '../pages/CreateSpaceModal';
import { useSpaceStore } from '../store/spaceStore';
import { PHONE_NAV_ITEMS } from './navItems';

export default function PhoneLayout({ children }) {
  const { toggleChat, quickCreate, setQuickCreate } = useUiStore();
  const { user } = useAuthStore();
  const { switchSpace } = useSpaceStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [eventFormOpen, setEventFormOpen] = useState(false);
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [listFormOpen, setListFormOpen] = useState(false);
  const [showSpaceCreate, setShowSpaceCreate] = useState(false);
  const [editingSpace, setEditingSpace] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);

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

  useEffect(() => {
    if (!quickCreate) return;
    if (quickCreate === 'task')    { setTaskFormOpen(true);    setQuickCreate(null); }
    if (quickCreate === 'event')   { setEventFormOpen(true);   setQuickCreate(null); }
    if (quickCreate === 'project') { setProjectFormOpen(true); setQuickCreate(null); }
    if (quickCreate === 'list')    { setListFormOpen(true);    setQuickCreate(null); }
  }, [quickCreate]);

  return (
    <div className="flex flex-col h-screen bg-surface overflow-hidden">
      {/* Top bar with space picker */}
      <header className="h-14 bg-surface border-b border-outline-variant/20 flex items-center px-2 sticky top-0 z-20 flex-shrink-0">
        <SpacePickerSheet
          triggerClassName="flex items-center gap-1.5 px-3 h-full"
          onCreateSpace={() => setShowSpaceCreate(true)}
          onEditSpace={(space) => setEditingSpace(space)}
        />
        <div className="flex-1" />
        <NotificationsBell />
        <button
          onClick={() => navigate('/settings')}
          aria-label="Profile & settings"
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container transition-colors flex-shrink-0"
        >
          <UserAvatar user={user} size="w-8 h-8" />
        </button>
      </header>

      {/* Page content — px-4 pt-4 matches the padded wrapper tablet/desktop
          already use (px-6 py-6 / px-container-padding py-8), just scaled
          down for phone. Pages built with their own full-bleed math (e.g.
          MyTasks' sticky header, HomeBoard's swipable pages) self-align to
          whatever real padding this wrapper provides, so this is safe. */}
      <main className="flex-1 overflow-y-auto pb-20">
        <div className="px-4 pt-4">
          {children}
        </div>
      </main>

      {/* Floating quick-create button */}
      <div className="fixed bottom-20 right-4 z-20">
        <QuickCreateButton variant="fab" />
      </div>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-surface-container-lowest border-t border-outline-variant/20 flex z-30 safe-area-pb">
        {PHONE_NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={
              item.to === '/chat' ? (e) => { e.preventDefault(); toggleChat(); } :
              item.to === '/more' ? (e) => { e.preventDefault(); setMoreOpen(true); } :
              undefined
            }
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center pt-2 pb-1.5 gap-1 transition-colors
               ${isActive ? 'text-primary' : 'text-on-surface-variant'}`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`flex items-center justify-center h-7 w-14 rounded-full transition-colors
                   ${isActive ? 'bg-primary/10' : ''}`}
                >
                  {item.icon
                    ? <span className="material-symbols-outlined text-[22px]">{item.icon}</span>
                    : <DotIcon size={22} />
                  }
                </span>
                <span className={`text-[12px] tracking-wide ${isActive ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <ChatDrawer />
      <MoreMenuSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
      <TaskForm open={taskFormOpen} onClose={() => setTaskFormOpen(false)} />
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
