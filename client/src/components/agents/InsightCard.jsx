import React from 'react';
import { renderMarkdown } from '../../utils/markdown.jsx';

export const AGENT_META = {
  morning_brief:  { icon: 'wb_sunny',     label: 'Morning Brief' },
  reschedule:     { icon: 'event_repeat', label: 'Reschedule Advisor' },
  priority:       { icon: 'flag',         label: 'Priority Focus' },
  workload:       { icon: 'balance',      label: 'Workload Spread' },
  bulletin_board: { icon: 'campaign',     label: 'Bulletin Board' },
  custom:         { icon: 'smart_toy',    label: 'Custom Agent' },
};

export function formatTime(dateStr) {
  try {
    return new Date(dateStr.replace(' ', 'T') + 'Z').toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
}

// One generic card renders all six agent types — they differ only in icon,
// title, and whether an approve action exists.
export default function InsightCard({ insight, onApprove, onDismiss, onSnooze, busy, compact = false }) {
  const meta = AGENT_META[insight.agent_type] || AGENT_META.custom;
  const title = insight.agent_type === 'custom' ? (insight.custom_agent_name || insight.title) : insight.title;
  const customEmoji = insight.agent_type === 'custom' ? insight.custom_agent_icon : null;

  return (
    <div className={`bg-surface-container-lowest rounded-2xl shadow-soft border border-outline-variant/20 ${compact ? 'p-4' : 'p-card-padding'}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            {customEmoji
              ? <span className="text-[16px] leading-none">{customEmoji}</span>
              : <span className="material-symbols-outlined text-primary text-[16px]">{meta.icon}</span>}
          </div>
          <h3 className="text-body-lg font-semibold text-on-surface">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-label-sm text-on-surface-variant">{formatTime(insight.created_at)}</span>
          <button
            onClick={() => onDismiss(insight.id)}
            disabled={busy}
            aria-label="Dismiss"
            className="w-7 h-7 rounded-full hover:bg-surface-container text-on-surface-variant flex items-center justify-center transition disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      </div>

      <div className="text-body-md text-on-surface mb-4">{renderMarkdown(insight.content)}</div>

      <div className="flex items-center gap-2 flex-wrap">
        {insight.action_payload_json && (
          <button
            onClick={() => onApprove(insight.id)}
            disabled={busy}
            className="px-4 py-2 rounded-full bg-primary text-on-primary text-label-md font-semibold hover:opacity-90 transition disabled:opacity-40"
          >
            {insight.action_label || 'Approve'}
          </button>
        )}
        <button
          onClick={() => onSnooze(insight.id)}
          disabled={busy}
          className="px-4 py-2 rounded-full border border-outline-variant/30 text-label-md text-on-surface-variant hover:bg-surface-container transition disabled:opacity-40"
        >
          Snooze 4h
        </button>
        <button
          onClick={() => onDismiss(insight.id)}
          disabled={busy}
          className="px-4 py-2 rounded-full text-label-md text-on-surface-variant hover:bg-surface-container transition disabled:opacity-40"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
