import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { api } from '../auth/AuthContext';

const NOTIFICATION_ICONS = {
  task_comment:        'chat_bubble',
  task_blocked:        'block',
  task_completed:      'check_circle',
  phase_completed:     'linear_scale',
  milestone_completed: 'flag',
};

// ── Notifications bell — personal notifications + recent space activity ──
// Shared by the desktop and tablet top bars.
export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const qc = useQueryClient();

  const { data: activity = [] } = useQuery({
    queryKey: ['activity'],
    queryFn: () => api.get('/activity').then(r => r.data),
    refetchInterval: 60_000,
  });

  // Personal notifications — targeted (project watchers, comments) rather
  // than the space-wide activity feed below.
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then(r => r.data),
    refetchInterval: 30_000,
  });
  const unreadNotifications = notifications.filter(n => !n.read_at);

  const markAllRead = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markRead = useMutation({
    mutationFn: (id) => api.post(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const newest = activity[0]?.created_at || '';
  const [lastSeen, setLastSeen] = useState(() => localStorage.getItem('activity_last_seen') || '');
  const hasUnreadActivity = !!newest && newest > lastSeen;
  const hasUnread = hasUnreadActivity || unreadNotifications.length > 0;

  const toggle = () => {
    if (!open && newest) {
      localStorage.setItem('activity_last_seen', newest);
      setLastSeen(newest);
    }
    setOpen(o => !o);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={toggle}
        aria-label={hasUnread ? 'Notifications — new activity' : 'Notifications'}
        className="relative h-12 w-12 rounded-full flex items-center justify-center hover:bg-surface-variant text-on-surface-variant transition-[background-color,transform] duration-150 active:scale-[0.97]"
      >
        <span className="material-symbols-outlined">notifications</span>
        {hasUnread && (
          <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 rounded-full bg-error border-2 border-surface" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-14 w-80 max-w-[90vw] max-h-[28rem] overflow-y-auto bg-surface-container-lowest rounded-2xl shadow-heavy border border-outline-variant/20 z-50">
          {notifications.length > 0 && (
            <>
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <p className="text-label-md tracking-widest text-on-surface-variant/60 font-bold">
                  For You
                </p>
                {unreadNotifications.length > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); markAllRead.mutate(); }}
                    className="text-label-sm text-primary font-bold hover:underline"
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div className="pb-2 border-b border-outline-variant/10">
                {notifications.slice(0, 10).map(n => (
                  <button
                    key={n.id}
                    onClick={() => !n.read_at && markRead.mutate(n.id)}
                    className={`w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-surface-container/60 transition-colors ${!n.read_at ? '' : 'opacity-60'}`}
                  >
                    <div className="w-7 h-7 rounded-full flex items-center justify-center bg-primary/10 text-primary flex-shrink-0 mt-0.5">
                      <span className="material-symbols-outlined text-[16px]">{NOTIFICATION_ICONS[n.type] || 'notifications'}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-body-md text-on-surface leading-snug">{n.message}</p>
                      <p className="text-label-sm text-on-surface-variant/70 mt-0.5">
                        {n.project_name ? `${n.project_name} · ` : ''}
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    {!n.read_at && <span className="w-2 h-2 rounded-full bg-error flex-shrink-0 mt-2" />}
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="text-label-md tracking-widest text-on-surface-variant/60 font-bold px-4 pt-4 pb-2">
            Recent Activity
          </p>
          {activity.length === 0 ? (
            <p className="text-body-md text-on-surface-variant text-center py-8 px-4">No recent activity</p>
          ) : (
            <div className="pb-2">
              {activity.slice(0, 12).map(item => (
                <div key={item.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-surface-container/60 transition-colors">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-label-sm font-bold flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: item.avatar_colour || '#6366f1' }}
                  >
                    {(item.display_name || '?')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-body-md text-on-surface leading-snug">{item.description}</p>
                    <p className="text-label-sm text-on-surface-variant/70 mt-0.5">
                      {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
