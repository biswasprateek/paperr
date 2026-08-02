import React, { useMemo } from 'react';
import { CompletionRing, streakBadge } from './shared';

export default function ProgressView({ protocols = [], progress = [], isLoading }) {
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
        <p className="text-label-sm text-on-surface-variant uppercase tracking-wider mb-4">Today</p>
        <CompletionRing done={done} total={total} size={140} sw={10} showFraction />
        <p className="text-body-md text-on-surface-variant mt-4">
          {total === 0 ? 'No habits due today' : `${done} of ${total} habits complete`}
        </p>
      </div>

      {/* Per-protocol today */}
      {perProtocol.length > 0 && (
        <div className="bg-surface-container-lowest rounded-xl shadow-soft border border-outline-variant/20 p-card-padding">
          <p className="text-label-sm text-on-surface-variant uppercase tracking-wider mb-3">By Protocol</p>
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
        <p className="text-label-sm text-on-surface-variant uppercase tracking-wider mb-3">Streaks</p>

        {isLoading ? (
          <p className="text-body-md text-on-surface-variant/60 py-4 text-center">Loading…</p>
        ) : progress.length === 0 ? (
          <p className="text-body-md text-on-surface-variant/60 py-4 text-center">No habits to track yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-label-sm text-on-surface-variant/60 uppercase tracking-wider">
                  <th className="font-medium pb-2 pr-3">Habit</th>
                  <th className="font-medium pb-2 px-3 text-center">Current</th>
                  <th className="font-medium pb-2 px-3 text-center">Best</th>
                  <th className="font-medium pb-2 pl-3 text-right">Last 7 days</th>
                </tr>
              </thead>
              <tbody>
                {progress.map(row => (
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
        )}
      </div>
    </div>
  );
}
