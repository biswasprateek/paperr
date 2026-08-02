import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../auth/AuthContext';
import { useSpaceStore } from '../store/spaceStore';
import UserAvatar from '../components/UserAvatar';
import WidgetBoard from '../widgets/WidgetBoard';
import { useHubBoard } from '../hooks/useHubBoard';
import { useMode } from '../hooks/useMode';

function greetingWord() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function MemberAvatars({ spaceId }) {
  const { mode } = useMode();
  const { data: members = [] } = useQuery({
    queryKey: ['space-members', spaceId],
    queryFn: () => api.get(`/spaces/${spaceId}/members`).then((r) => r.data),
    enabled: !!spaceId,
  });

  if (members.length === 0) return null;

  // Uncapped avatars can overflow a phone-width greeting row with a large
  // household; cap and roll the rest into a +N badge there only.
  const cap = mode === 'phone' ? 3 : Infinity;
  const shown = members.slice(0, cap);
  const overflow = members.length - shown.length;

  return (
    <div className="flex items-center -space-x-2 flex-shrink-0">
      {shown.map((m) => (
        <div key={m.id} className="ring-2 ring-surface-container-lowest rounded-full" title={m.display_name}>
          <UserAvatar user={m} size="w-8 h-8" />
        </div>
      ))}
      {overflow > 0 && (
        <div className="w-8 h-8 rounded-full ring-2 ring-surface-container-lowest bg-surface-container text-on-surface-variant text-[11px] font-bold flex items-center justify-center">
          +{overflow}
        </div>
      )}
    </div>
  );
}

function HubGreeting({ space }) {
  const { data: todayTasks = [] } = useQuery({
    queryKey: ['tasks-today'],
    queryFn: () => api.get('/tasks/today').then((r) => r.data),
    enabled: !!space,
  });

  return (
    <div className="flex items-center gap-4 min-w-0">
      <div className="min-w-0">
        <h1 className="text-headline-lg text-on-background leading-tight truncate">
          {greetingWord()}, {space?.name || 'everyone'}!
        </h1>
        <p className="text-body-md text-on-surface-variant mt-0.5 truncate">
          {todayTasks.length > 0
            ? `${todayTasks.length} task${todayTasks.length !== 1 ? 's' : ''} due today across the space.`
            : 'Nothing due today — all caught up!'}
        </p>
      </div>
      <MemberAvatars spaceId={space?.id} />
    </div>
  );
}

// The space's shared board — every member sees the same layout, curated by
// the space admin. Members view the layout but widgets stay interactive
// (checking a list item, completing their own habit, posting a sticky note).
export default function Hub() {
  const currentSpace = useSpaceStore((s) => s.currentSpace);
  const { board, saveBoard, isLoading } = useHubBoard();
  const isAdmin = currentSpace?.my_role === 'admin';

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center text-on-surface-variant">
        <span className="material-symbols-outlined text-3xl animate-spin">progress_activity</span>
      </div>
    );
  }

  return (
    <div className="pb-8">
      <WidgetBoard
        board={board}
        onSave={saveBoard}
        canEdit={isAdmin}
        boardType="hub"
        heading={<HubGreeting space={currentSpace} />}
      />
    </div>
  );
}
