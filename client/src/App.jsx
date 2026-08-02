import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useMode } from './hooks/useMode';
import { useSocket } from './hooks/useSocket';
import { useAuthStore } from './store/authStore';
import { useSpaceStore } from './store/spaceStore';
import { api } from './auth/AuthContext';

import ProtectedRoute from './auth/ProtectedRoute';
import LoginPage from './auth/LoginPage';
import RegisterPage from './auth/RegisterPage';
import SetupWizard from './pages/SetupWizard';
import SpaceSelectScreen from './pages/SpaceSelectScreen';
import BrowseSpacesScreen from './pages/BrowseSpacesScreen';
import ErrorBoundary from './components/ErrorBoundary';

import DesktopLayout from './modes/DesktopLayout';
import PhoneLayout from './modes/PhoneLayout';
import TabletLayout from './modes/TabletLayout';

import HomeBoard from './pages/touch/HomeBoard';
import Tasks from './pages/MyTasks';
import ListsView from './pages/ListsView';
import ProjectsHome from './pages/ProjectsHome';
import ProjectDetail from './pages/ProjectDetail';
import Settings from './pages/Settings';
import Analytics from './pages/Analytics';
import Calendar from './pages/Calendar';
import Hub from './pages/Hub';
import Notebooks from './pages/Notebooks';
import Routines from './pages/Routines';
import Apps from './pages/Apps';
import Frame from './pages/Frame';
import AgentHub from './pages/AgentHub';
import FocusEngine from './components/FocusEngine';
import DeepWorkOverlay from './components/DeepWorkOverlay';
import ClockEngine from './components/ClockEngine';
import FrameEngine from './components/frame/FrameEngine';
import CelebrationEngine from './components/CelebrationEngine';

function SpaceGuard({ children }) {
  const { currentSpaceId, spaces } = useSpaceStore();
  const { isLoading } = useAuthStore();

  if (!isLoading && (!spaces.length || !currentSpaceId)) {
    return <SpaceSelectScreen />;
  }

  return children;
}

const LAYOUTS = { phone: PhoneLayout, tablet: TabletLayout, desktop: DesktopLayout };

function AppRoutes() {
  const { mode } = useMode();
  useSocket();

  const Layout = LAYOUTS[mode] ?? DesktopLayout;

  return (
    <ProtectedRoute>
      <SpaceGuard>
        <FocusEngine />
        <DeepWorkOverlay />
        <ClockEngine />
        <FrameEngine />
        <CelebrationEngine />
        <Layout>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<HomeBoard />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/calendar/:view" element={<Calendar />} />
              <Route path="/calendar/:view/:date" element={<Calendar />} />
              <Route path="/hub" element={<Hub />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/lists" element={<ListsView />} />
              <Route path="/lists/:id" element={<ListsView />} />
              <Route path="/projects" element={<ProjectsHome />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              <Route path="/notebooks"                         element={<Notebooks />} />
              <Route path="/notebooks/:notebookId"           element={<Notebooks />} />
              <Route path="/notebooks/:notebookId/:noteId"   element={<Notebooks />} />
              <Route path="/routines" element={<Routines />} />
              <Route path="/apps" element={<Apps />} />
              <Route path="/frame" element={<Frame />} />
              <Route path="/agents" element={<AgentHub />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/select-space" element={<SpaceSelectScreen />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ErrorBoundary>
        </Layout>
      </SpaceGuard>
    </ProtectedRoute>
  );
}

export default function App() {
  const { user, isLoading } = useAuthStore();
  const [firstRun, setFirstRun] = React.useState(null);

  useEffect(() => {
    api.get('/auth/status')
      .then(({ data }) => setFirstRun(data.firstRun))
      .catch(() => setFirstRun(false));
  }, []);

  if (firstRun === null || isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface">
        <div className="w-10 h-10 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  if (firstRun) {
    return (
      <Routes>
        <Route path="*" element={<SetupWizard onComplete={() => setFirstRun(false)} />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/browse-spaces" replace /> : <RegisterPage />} />
      <Route path="/browse-spaces" element={<BrowseSpacesScreen />} />
      <Route path="/*" element={<AppRoutes />} />
    </Routes>
  );
}
