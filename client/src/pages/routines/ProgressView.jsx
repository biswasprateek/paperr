import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../auth/AuthContext';
import { CompletionRing, streakBadge } from './shared';

function StreakTable({ rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="text-label-md text-on-surface-variant/60 tracking-wider">
            <th className="font-medium pb-2 pr-3">Habit</th>
            <th className="font-medium pb-2 px-3 text-center">Current</th>
            <th className="font-medium pb-2 px-3 text-center">Best</th>
            <th className="font-medium pb-2 pl-3 text-right">Last 7 days</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.habit_id} className="border-t border-outline-variant/10">
              <td className="py-2.5 pr-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: row.protocol_color || '#6366f1' }} />
                  <span className="text-body-md text-on-surface truncate">{row.title}</span>
                </div>
              </td>
              <td className="py-2.5 px-3 text-center">
                <span className="text-body-md text-on-surface tabular-nums">
                  {streakBadge(row.current_streak)} {row.current_streak}
                </span>
              </td>
              <td className="py-2.5 px-3 text-center text-body-md text-on-surface-variant tabular-nums">
                {row.longest_streak}
              </td>
              <td className="py-2.5 pl-3">
                <div className="flex items-center gap-1 justify-end">
                  {row.last7.map((hit, i) => (
                    <span
                      key={i}
                      className={`w-2.5 h-2.5 rounded-full ${hit ? '' : 'bg-surface-container-high'}`}
                      style={hit ? { backgroundColor: row.protocol_color || '#6366f1' } : undefined}
                      title={hit ? 'Done' : 'Missed'}
                    />
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ProgressView({ protocols = [], progress = [], isLoading, onEditHabit }) {
  // null = untouched, so the section can default to open once we know there's
  // something in it. An explicit click wins from then on.
  const [showArchived, setShowArchived] = useState(null);

  // Fetched unconditionally so the section can show its count while collapsed —
  // a silent "Archived" header gives no clue there's anything to restore.
  const { data: archived = [] } = useQuery({
    queryKey: ['routines-progress', 'archived'],
    queryFn:  () => api.get('/routines/progress', { params: { days: 30, archived: 1 } }).then(r => r.data),
  });

  const archivedOpen = showArchived ?? archived.length > 0;

  // Today's overall + per-protocol tallies from the (date-aware) protocols payload
  const { done, total, perProtocol } = useMemo(() => {
    let d = 0, t = 0;
    const per = protocols.map(p => {
      const hs = p.habits || [];
      const pd = hs.filter(h => h.completed).length;
      d += pd; t += hs.length;
      return { id: p.id, name: p.name, color: p.color, icon: p.icon, done: pd, total: hs.length };
    });
    return { done: d, total: t, perProtocol: per };
  }, [protocols]);

  return (
    <div className="space-y-6">
      {/* Today's overall ring */}
      <div className="bg-surface-container-lowest rounded-xl shadow-soft border border-outline-variant/20 p-card-padding flex flex-col items-center text-center">
        <p className="text-label-md text-on-surface-variant tracking-wider mb-4">Today</p>
        <CompletionRing done={done} total={total} size={140} sw={10} showFraction />
        <p className="text-body-md text-on-surface-variant mt-4">
          {total === 0 ? 'No habits due today' : `${done} of ${total} habits complete`}
        </p>
      </div>

      {/* Per-protocol today */}
      {perProtocol.length > 0 && (
        <div className="bg-surface-container-lowest rounded-xl shadow-soft border border-outline-variant/20 p-card-padding">
          <p className="text-label-md text-on-surface-variant tracking-wider mb-3">By Protocol</p>
          <div className="space-y-1">
            {perProtocol.map(p => (
              <div key={p.id} className="flex items-center gap-3 px-2 py-2">
                <CompletionRing done={p.done} total={p.total} size={26} sw={3} color={p.color} />
                <span className="text-[16px] leading-none flex-shrink-0">{p.icon || '⭐'}</span>
                <span className="flex-1 min-w-0 text-body-md text-on-surface truncate">{p.name}</span>
                <span className="text-label-md text-on-surface-variant tabular-nums">{p.done}/{p.total}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Streak table */}
      <div className="bg-surface-container-lowest rounded-xl shadow-soft border border-outline-variant/20 p-card-padding">
        <p className="text-label-md text-on-surface-variant tracking-wider mb-3">Streaks</p>

        {isLoading ? (
          <p className="text-body-md text-on-surface-variant/60 py-4 text-center">Loading…</p>
        ) : progress.length === 0 ? (
          <p className="text-body-md text-on-surface-variant/60 py-4 text-center">No habits to track yet.</p>
        ) : (
          <StreakTable rows={progress} />
        )}
      </div>

      {/* Archived habits — kept out of every other view, history intact.
          Always rendered, even at zero: hiding it when empty means a user who
          has never archived anything can't find the feature or its unarchive
          control at all. */}
      <div className="bg-surface-container-lowest rounded-xl shadow-soft border border-outline-variant/20 p-card-padding">
        <button
          onClick={() => setShowArchived(!archivedOpen)}
          className="w-full flex items-center gap-2 text-label-md text-on-surface-variant tracking-wider"
        >
          <span className={`material-symbols-outlined text-[18px] transition-transform ${archivedOpen ? 'rotate-90' : ''}`}>
            chevron_right
          </span>
          Archived ({archived.length})
        </button>

        {archivedOpen && (
          <div className="mt-3">
            {archived.length === 0 ? (
              <p className="text-body-md text-on-surface-variant/60 py-4 text-center">
                No archived habits yet. Open a habit and choose Archive to hide it
                here without losing its streaks.
              </p>
            ) : (
              /* Same shape as the Streaks table, but only the two columns that
                 fit — this panel sits in a third-width column, where that
                 table's trailing columns overflow out of sight. */
              <table className="w-full text-left">
                <thead>
                  <tr className="text-label-md text-on-surface-variant/60 tracking-wider">
                    <th className="font-medium pb-2 pr-3">Habit</th>
                    <th className="font-medium pb-2 pl-3 pr-6 text-right">Longest Streak</th>
                  </tr>
                </thead>
                <tbody>
                  {archived.map(row => (
                    <tr
                      key={row.habit_id}
                      tabIndex={0}
                      onClick={() => onEditHabit?.(row)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEditHabit?.(row); } }}
                      title="Open to unarchive"
                      className="border-t border-outline-variant/10 cursor-pointer hover:bg-surface-container transition"
                    >
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: row.protocol_color || '#6366f1' }}
                          />
                          {row.icon && <span className="text-[16px] leading-none flex-shrink-0">{row.icon}</span>}
                          <span className="text-body-md text-on-surface truncate">{row.title}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pl-3">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-body-md text-on-surface-variant tabular-nums">{row.longest_streak}</span>
                          <span className="material-symbols-outlined text-[18px] text-on-surface-variant/50 flex-shrink-0">
                            chevron_right
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
