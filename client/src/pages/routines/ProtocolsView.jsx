import React, { useState } from 'react';
import { CompletionRing, HabitRow } from './shared';

function ProtocolCard({ protocol, onToggle, onEditHabit, onAddHabit, onEditProtocol, busyId }) {
  const [open, setOpen] = useState(true);
  const habits = protocol.habits || [];
  const done   = habits.filter(h => h.completed).length;
  const total  = habits.length;
  const color  = protocol.color || '#6366f1';

  return (
    <div
      className="bg-surface-container-lowest rounded-xl shadow-soft border border-outline-variant/20 overflow-hidden"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <span className="text-[20px] leading-none flex-shrink-0">{protocol.icon || '⭐'}</span>
          <div className="min-w-0 flex-1">
            <h3 className="text-title-md font-medium text-on-surface truncate">{protocol.name}</h3>
            {protocol.description && (
              <p className="text-label-sm text-on-surface-variant/70 truncate">{protocol.description}</p>
            )}
          </div>
        </button>

        {protocol.visibility === 'shared' && (
          <span className="hidden sm:flex items-center gap-1 text-label-sm text-on-surface-variant/60 bg-surface-container rounded-full px-2 py-0.5 flex-shrink-0">
            <span className="material-symbols-outlined text-[13px]">group</span>
            Shared
          </span>
        )}

        {total > 0 && <CompletionRing done={done} total={total} size={34} sw={3.5} color={color} showFraction />}

        <button
          onClick={() => onEditProtocol(protocol)}
          aria-label="Edit protocol"
          className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant/40 hover:text-primary hover:bg-primary/10 transition-colors flex-shrink-0"
        >
          <span className="material-symbols-outlined text-[18px]">tune</span>
        </button>

        <button
          onClick={() => setOpen(o => !o)}
          className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant/50 hover:bg-surface-container transition-colors flex-shrink-0"
        >
          <span className={`material-symbols-outlined text-[20px] transition-transform ${open ? 'rotate-180' : ''}`}>expand_more</span>
        </button>
      </div>

      {/* Body */}
      {open && (
        <div className="px-2 pb-2 border-t border-outline-variant/10 pt-1">
          {habits.length === 0 ? (
            <p className="text-label-md text-on-surface-variant/50 px-3 py-3">No habits yet — add one.</p>
          ) : (
            habits.map(h => (
              <HabitRow
                key={h.id}
                habit={h}
                color={color}
                onToggle={onToggle}
                onEdit={onEditHabit}
                showTime={false}
                busy={busyId === h.id}
              />
            ))
          )}
          <button
            type="button"
            onClick={() => onAddHabit(null, protocol.id)}
            className="w-full flex items-center gap-2 px-3 py-2.5 mt-1 rounded-xl text-label-md text-on-surface-variant/60 hover:text-primary hover:bg-primary/5 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Add habit
          </button>
        </div>
      )}
    </div>
  );
}

export default function ProtocolsView({ protocols = [], onToggle, onEditHabit, onAddHabit, onEditProtocol, onAddProtocol, busyId }) {
  return (
    <div className="space-y-4">
      {protocols.filter(p => !p.is_system).map(p => (
        <ProtocolCard
          key={p.id}
          protocol={p}
          onToggle={onToggle}
          onEditHabit={onEditHabit}
          onAddHabit={onAddHabit}
          onEditProtocol={onEditProtocol}
          busyId={busyId}
        />
      ))}
      {onAddProtocol && (
        <button
          type="button"
          onClick={onAddProtocol}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-label-md text-on-surface-variant/60 hover:text-primary hover:bg-primary/5 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Add protocol
        </button>
      )}
    </div>
  );
}
