import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../auth/AuthContext';
import WidgetShell, { WidgetEmpty } from './WidgetShell';
import { useAgentInsights } from '../components/agents/useAgentInsights';
import { AGENT_META } from '../components/agents/InsightCard';
import { renderMarkdown } from '../utils/markdown.jsx';

// Plain-text preview for the widget's tight space — full markdown rendering
// (headings, lists) doesn't read well truncated to two lines.
function stripMarkdown(text) {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\n+/g, ' ')
    .trim();
}

// `full` (single-agent widgets): the agent's name already sits in the widget
// header, so rows skip their own title and show the whole insight — the
// shell's body scrolls. Compact mode (the Hub's all-agents feed) keeps the
// per-row title + two-line snippet.
function AgentWidgetRow({ insight, full, busy, disabled, onApprove, onDismiss, onSnooze }) {
  const meta = AGENT_META[insight.agent_type] || AGENT_META.custom;
  const customEmoji = insight.agent_type === 'custom' ? insight.custom_agent_icon : null;
  const title = insight.agent_type === 'custom' ? (insight.custom_agent_name || insight.title) : insight.title;
  const snippet = stripMarkdown(insight.content).slice(0, 120);

  return (
    <div className="py-2.5 border-b border-outline-variant/10 last:border-0">
      {!full && (
        <div className="flex items-center gap-2 mb-1">
          <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-[11px]">
            {customEmoji || <span className="material-symbols-outlined text-primary text-[12px]">{meta.icon}</span>}
          </span>
          <span className="flex-1 min-w-0 text-body-md text-on-surface font-medium truncate">{title}</span>
        </div>
      )}
      {full
        ? <div className="text-label-md font-medium text-on-surface-variant mb-1.5 [&_p]:mb-1.5 [&_ul]:mb-1.5">{renderMarkdown(insight.content)}</div>
        : <p className="text-label-sm text-on-surface-variant line-clamp-2 mb-1.5">{snippet}</p>}
      <div className="flex items-center gap-1.5 flex-wrap">
        {insight.action_payload_json && (
          <button
            onClick={() => onApprove(insight.id)}
            disabled={disabled || busy}
            className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-label-sm font-semibold hover:bg-primary/20 transition disabled:opacity-40"
          >
            {insight.action_label || 'Approve'}
          </button>
        )}
        <button
          onClick={() => onSnooze(insight.id)}
          disabled={disabled || busy}
          className="px-2.5 py-1 rounded-full text-label-sm text-on-surface-variant hover:bg-surface-container transition disabled:opacity-40"
        >
          Snooze
        </button>
        <button
          onClick={() => onDismiss(insight.id)}
          disabled={disabled || busy}
          className="px-2.5 py-1 rounded-full text-label-sm text-on-surface-variant hover:bg-surface-container transition disabled:opacity-40"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

// Row in the agent picker shown while the widget is unconfigured (or being
// reconfigured in edit mode).
function AgentPickerRow({ icon, emoji, label, selected, onSelect }) {
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition ${
        selected ? 'bg-primary/10 text-primary' : 'hover:bg-surface-container text-on-surface'
      }`}
    >
      <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-[13px]">
        {emoji || <span className="material-symbols-outlined text-primary text-[14px]">{icon}</span>}
      </span>
      <span className="flex-1 min-w-0 text-body-md truncate">{label}</span>
      {selected && <span className="material-symbols-outlined text-[16px]">check</span>}
    </button>
  );
}

/**
 * One widget shows one agent: `agent` in the widget's stored props is either
 * a built-in agent_type or `custom:<id>`, and the header shows that agent's
 * name. While unconfigured (or in edit mode, to allow re-picking) the body
 * is a picker over the built-in agents plus the user's custom agents.
 * Boards without props editing (the read-only Hub) pass no onUpdateProps and
 * fall back to the old all-agents feed.
 */
export function AgentInsightsWidget({ editing, agent, agentName, agentIcon, onUpdateProps }) {
  const { insights, busyId, onApprove, onDismiss, onSnooze } = useAgentInsights();

  const canConfigure = typeof onUpdateProps === 'function';
  const showPicker = canConfigure && (!agent || editing);

  const { data: customAgents = [] } = useQuery({
    queryKey: ['custom-agents'],
    queryFn: () => api.get('/custom-agents').then(r => r.data),
    enabled: showPicker,
  });

  const filtered = !agent
    ? insights
    : insights.filter(i =>
        agent.startsWith('custom:')
          ? i.agent_type === 'custom' && String(i.custom_agent_id) === agent.slice('custom:'.length)
          : i.agent_type === agent
      );

  const builtinIcon = agent && !agent.startsWith('custom:') ? (AGENT_META[agent]?.icon || 'smart_toy') : 'smart_toy';

  return (
    <WidgetShell
      icon={builtinIcon}
      emoji={agentIcon || null}
      title={agentName || 'AI Agent'}
      source="/agents"
      editing={editing}
      count={agent && filtered.length ? filtered.length : null}
    >
      {showPicker ? (
        <div>
          <p className="text-label-sm uppercase tracking-widest text-on-surface-variant/60 font-bold px-1 pb-1.5">
            Choose an agent
          </p>
          <div className="space-y-0.5">
            {Object.entries(AGENT_META).filter(([type]) => type !== 'custom').map(([type, meta]) => (
              <AgentPickerRow
                key={type}
                icon={meta.icon}
                label={meta.label}
                selected={agent === type}
                onSelect={() => onUpdateProps({ agent: type, agentName: meta.label, agentIcon: null })}
              />
            ))}
            {customAgents.map(c => (
              <AgentPickerRow
                key={c.id}
                emoji={c.icon}
                label={c.name}
                selected={agent === `custom:${c.id}`}
                onSelect={() => onUpdateProps({ agent: `custom:${c.id}`, agentName: c.name, agentIcon: c.icon })}
              />
            ))}
          </div>
        </div>
      ) : filtered.length === 0
        ? <WidgetEmpty icon="auto_awesome" label="No insights right now" />
        : filtered.slice(0, 8).map(insight => (
          <AgentWidgetRow
            key={insight.id}
            insight={insight}
            full={!!agent}
            busy={busyId === insight.id}
            disabled={editing}
            onApprove={onApprove}
            onDismiss={onDismiss}
            onSnooze={onSnooze}
          />
        ))}
    </WidgetShell>
  );
}
