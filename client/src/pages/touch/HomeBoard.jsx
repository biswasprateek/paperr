import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { api } from '../../auth/AuthContext';
import { useAuthStore } from '../../store/authStore';
import { useMode } from '../../hooks/useMode';
import { useWidgetBoard } from '../../hooks/useWidgetBoard';
import WidgetBoard from '../../widgets/WidgetBoard';

function greetingWord() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

// Greeting + day summary header, shown on tablet and desktop (phone stays
// header-less to save space). Both queries are shared with the Today widget,
// so this costs nothing extra when that widget is on board.
function Greeting() {
  const { user } = useAuthStore();
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const { data: todayTasks = [] } = useQuery({
    queryKey: ['tasks-today'],
    queryFn: () => api.get('/tasks/today').then(r => r.data),
  });
  const { data: protocols = [] } = useQuery({
    queryKey: ['routines', todayStr],
    queryFn: () => api.get('/routines/protocols', { params: { date: todayStr } }).then(r => r.data),
  });
  const habitCount = protocols.reduce((n, p) => n + (p.habits || []).length, 0);
  const summaryParts = [];
  if (todayTasks.length) summaryParts.push(`${todayTasks.length} task${todayTasks.length !== 1 ? 's' : ''}`);
  if (habitCount)        summaryParts.push(`${habitCount} habit${habitCount !== 1 ? 's' : ''}`);
  const daySummary = summaryParts.length ? `${summaryParts.join(' and ')} today` : 'Nothing scheduled today';

  return (
    <>
      <h1 className="text-headline-lg text-on-background leading-tight truncate">
        {greetingWord()}, {user?.display_name?.split(' ')[0]}!
      </h1>
      <p className="text-body-md text-on-surface-variant mt-0.5 truncate">
        {format(new Date(), 'EEEE, MMMM d')} · {daySummary}
      </p>
    </>
  );
}

// The personal touch Home — a thin wrapper around the shared WidgetBoard,
// persisted per-user in preferences_json (useWidgetBoard).
export default function HomeBoard() {
  const { board, saveBoard } = useWidgetBoard();
  const { mode } = useMode();
  const showGreeting = mode !== 'phone';

  return (
    <WidgetBoard
      board={board}
      onSave={saveBoard}
      canEdit
      boardType="home"
      heading={showGreeting ? <Greeting /> : null}
    />
  );
}
