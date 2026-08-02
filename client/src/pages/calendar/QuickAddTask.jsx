import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { api } from '../../auth/AuthContext';

// A slim capture box for the rail — for jotting a task down without leaving
// the calendar to open the full New Event/Task modal. Defaults the due date
// to today; the full task modal is still there for anything more specific.
export default function QuickAddTask() {
  const [title, setTitle] = useState('');
  const qc = useQueryClient();

  const createTask = useMutation({
    mutationFn: (data) => api.post('/tasks', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['calendar-upcoming'] });
      setTitle('');
    },
  });

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    createTask.mutate({ title: trimmed, due_date: format(new Date(), 'yyyy-MM-dd') });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-52 shrink-0 border border-outline-variant/20 shadow-soft rounded-2xl p-3.5 bg-surface-container-lowest hidden lg:block"
    >
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant mb-2.5">Quick add</h3>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Add a task for today…"
          disabled={createTask.isPending}
          className="flex-1 min-w-0 bg-surface rounded-full px-3 py-1.5 text-xs text-on-surface placeholder-on-surface-variant/60 border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!title.trim() || createTask.isPending}
          aria-label="Add task"
          className="w-7 h-7 shrink-0 rounded-full bg-primary text-on-primary flex items-center justify-center disabled:opacity-40 hover:bg-primary/90 transition"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
        </button>
      </div>
    </form>
  );
}
