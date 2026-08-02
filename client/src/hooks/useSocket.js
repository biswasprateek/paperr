import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { useSpaceStore } from '../store/spaceStore';

let socket = null;

export function useSocket() {
  const queryClient = useQueryClient();
  const connectedRef = useRef(false);
  const { currentSpaceId } = useSpaceStore();

  // Connect once on mount
  useEffect(() => {
    if (connectedRef.current) return;
    connectedRef.current = true;

    socket = io('/', { withCredentials: true });

    const invalidateTasks = () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks-today'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      // Prefix match — covers every ['project-dashboard', projectId] query, since
      // ProjectDetail's Board/List/Phases tabs read tasks from that query, not ['tasks'].
      queryClient.invalidateQueries({ queryKey: ['project-dashboard'] });
    };

    socket.on('task:created', invalidateTasks);
    socket.on('task:updated', invalidateTasks);
    socket.on('task:completed', invalidateTasks);
    socket.on('task:deleted', () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      queryClient.invalidateQueries({ queryKey: ['project-dashboard'] });
    });
    socket.on('project:updated', () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    });
    socket.on('activity:new', () => {
      queryClient.invalidateQueries({ queryKey: ['activity'] });
    });
    socket.on('event:created', () => queryClient.invalidateQueries({ queryKey: ['calendar'] }));
    socket.on('event:updated', () => queryClient.invalidateQueries({ queryKey: ['calendar'] }));
    socket.on('event:deleted', () => queryClient.invalidateQueries({ queryKey: ['calendar'] }));
    socket.on('listitem:created', () => queryClient.invalidateQueries({ queryKey: ['list-items'] }));
    socket.on('listitem:updated', () => queryClient.invalidateQueries({ queryKey: ['list-items'] }));
    socket.on('listitem:deleted', () => queryClient.invalidateQueries({ queryKey: ['list-items'] }));

    socket.on('deepwork:started', () => queryClient.invalidateQueries({ queryKey: ['deep-work-active'] }));
    socket.on('deepwork:stopped', () => queryClient.invalidateQueries({ queryKey: ['deep-work-active'] }));

    const invalidateRoutines = () => {
      queryClient.invalidateQueries({ queryKey: ['routines'] });
      queryClient.invalidateQueries({ queryKey: ['routines-progress'] });
    };
    [
      'routine:protocol_created', 'routine:protocol_updated', 'routine:protocol_deleted',
      'routine:habit_created', 'routine:habit_updated', 'routine:habit_deleted', 'routine:completed',
    ].forEach(e => socket.on(e, invalidateRoutines));

    socket.on('agent:insight', () => queryClient.invalidateQueries({ queryKey: ['agent-insights'] }));
    socket.on('agent:insight:updated', () => queryClient.invalidateQueries({ queryKey: ['agent-insights'] }));

    // Shared Hub board layout changed (admin edit) / sticky note posted —
    // repaint every member's screen.
    socket.on('hub:updated', () => queryClient.invalidateQueries({ queryKey: ['hub'] }));
    socket.on('sticky:updated', () => queryClient.invalidateQueries({ queryKey: ['sticky-notes'] }));

    return () => {
      socket?.disconnect();
      connectedRef.current = false;
    };
  }, []);

  // Join/re-join the space socket room whenever the current space changes
  useEffect(() => {
    if (socket && currentSpaceId) {
      socket.emit('join-space', currentSpaceId);
    }
  }, [currentSpaceId]);

  return socket;
}
