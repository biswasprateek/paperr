import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../auth/AuthContext';
import { renderMarkdown } from '../utils/markdown.jsx';
import InsightCard from '../components/agents/InsightCard';
import { useAgentInsights } from '../components/agents/useAgentInsights';
import ScheduleFields from '../components/agents/ScheduleFields';
import AgentIconPicker from '../components/agents/AgentIconPicker';
import { cronToSchedule, scheduleToCron } from '../components/agents/cronSchedule';
import { PREBUILT_AGENTS } from '../components/agents/prebuiltAgents';
import VisibilityToggle, { SharedBadge } from '../components/VisibilityToggle';

const VISIBLE_LIMIT = 3;
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function scheduleSummary(cron) {
  const { frequency, time, days } = cronToSchedule(cron);
  if (frequency === 'daily') return `Daily at ${time}`;
  return `${days.map(d => DAY_LABELS[d]).join(', ')} at ${time}`;
}

function CustomAgentFormModal({ open, onClose, agent, initialValues }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🤖');
  const [instructions, setInstructions] = useState('');
  const [schedule, setSchedule] = useState({ frequency: 'daily', time: '08:00', days: [1] });
  const [enabled, setEnabled] = useState(1);
  const [visibility, setVisibility] = useState('personal');
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState(null); // { report, proposal } | null
  const [testError, setTestError] = useState('');

  React.useEffect(() => {
    if (!open) return;
    const s = agent || initialValues;
    setName(s?.name || '');
    setIcon(s?.icon || '🤖');
    setInstructions(s?.instructions || '');
    setSchedule(cronToSchedule(s?.schedule_cron));
    setEnabled(agent ? agent.enabled : 1);
    setVisibility(s?.visibility || 'personal');
    setError('');
    setTestResult(null);
    setTestError('');
  }, [open, agent, initialValues]);

  const save = useMutation({
    mutationFn: () => {
      const body = { name, icon, instructions, schedule_cron: scheduleToCron(schedule), enabled: enabled ? 1 : 0, visibility };
      return agent ? api.patch(`/custom-agents/${agent.id}`, body) : api.post('/custom-agents', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custom-agents'] });
      onClose();
    },
    onError: (err) => setError(err.response?.data?.error || 'Failed to save agent'),
  });

  const test = useMutation({
    mutationFn: () => api.post('/custom-agents/test', { name, instructions }).then(r => r.data),
    onMutate: () => { setTestError(''); setTestResult(null); },
    onSuccess: (data) => setTestResult(data),
    onError: (err) => setTestError(err.response?.data?.error || 'Test run failed'),
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-inverse-surface/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-surface-container-lowest rounded-2xl shadow-heavy w-full max-w-2xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-3 flex items-center justify-between border-b border-outline-variant/20">
          <h2 className="text-headline-md text-on-surface">{agent ? 'Edit Agent' : 'New Custom Agent'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto space-y-4">
          <div className="flex gap-3">
            <AgentIconPicker value={icon} onChange={setIcon} />
            <div className="flex-1">
              <label className="text-label-sm text-on-surface-variant mb-1 block">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Stale task sweep"
                className="w-full px-3 py-2.5 rounded-xl bg-surface-container border border-outline-variant/30 text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>

          <div>
            <label className="text-label-sm text-on-surface-variant mb-1 block">Instructions</label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Create a list of all tasks that have been pending for more than 30 days."
              rows={4}
              className="w-full px-3 py-2.5 rounded-xl bg-surface-container border border-outline-variant/30 text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>

          <ScheduleFields
            frequency={schedule.frequency}
            time={schedule.time}
            days={schedule.days}
            onChange={setSchedule}
          />

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-4 h-4" />
            <span className="text-body-md text-on-surface">Enabled</span>
          </label>

          <div>
            <label className="text-label-sm text-on-surface-variant mb-1 block">Visibility</label>
            <VisibilityToggle value={visibility} onChange={setVisibility} />
          </div>

          {error && <p className="text-body-sm text-error">{error}</p>}

          {/* Test — tries the current draft instructions against the LLM without saving */}
          <div className="pt-3 border-t border-outline-variant/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-label-sm text-on-surface-variant">Test this agent</span>
              <button
                type="button"
                onClick={() => test.mutate()}
                disabled={!instructions.trim() || test.isPending}
                className="px-3 py-1.5 rounded-full border border-outline-variant/30 text-label-md text-on-surface-variant hover:bg-surface-container transition disabled:opacity-40 flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                {test.isPending ? 'Running…' : 'Test'}
              </button>
            </div>

            {testError && <p className="text-body-sm text-error">{testError}</p>}

            {testResult && (
              <div className="bg-surface-container rounded-xl p-4 max-h-64 overflow-y-auto">
                <div className="text-body-md text-on-surface">{renderMarkdown(testResult.report)}</div>
                {testResult.proposal && (
                  <div className="mt-3 pt-3 border-t border-outline-variant/20 flex items-center gap-2 text-primary">
                    <span className="material-symbols-outlined text-[16px]">bolt</span>
                    <span className="text-label-sm">Proposed action: {testResult.proposal.name} (won't run until approved on a real card)</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-outline-variant/20 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-full text-label-md text-on-surface-variant hover:bg-surface-container transition">
            Cancel
          </button>
          <button
            onClick={() => { setError(''); save.mutate(); }}
            disabled={!name.trim() || !instructions.trim() || save.isPending}
            className="px-4 py-2 rounded-full bg-primary text-on-primary text-label-md font-semibold hover:opacity-90 transition disabled:opacity-40"
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PrebuiltAgentCard({ agent, onDuplicate }) {
  const qc = useQueryClient();
  const [runStatus, setRunStatus] = useState(null); // 'ok' | 'error' | null

  const runNow = useMutation({
    mutationFn: () => api.post(`/agent-insights/prebuilt/${agent.id}/run`),
    onSuccess: () => {
      setRunStatus('ok');
      qc.invalidateQueries({ queryKey: ['agent-insights'] });
      setTimeout(() => setRunStatus(null), 3000);
    },
    onError: () => {
      setRunStatus('error');
      setTimeout(() => setRunStatus(null), 3000);
    },
  });

  return (
    <div className="bg-surface-container-lowest rounded-2xl shadow-soft border border-outline-variant/20 p-4 flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-[18px]">
          {agent.icon}
        </div>
        <h3 className="text-body-md font-semibold text-on-surface">{agent.title}</h3>
        <button
          onClick={() => runNow.mutate()}
          disabled={runNow.isPending}
          title="Run now"
          className="ml-auto w-8 h-8 rounded-full hover:bg-surface-container-high text-on-surface-variant hover:text-primary flex items-center justify-center transition disabled:opacity-30 flex-shrink-0"
        >
          <span className="material-symbols-outlined text-[18px]">play_arrow</span>
        </button>
      </div>
      <p className="text-label-sm text-on-surface-variant flex-1 mb-3">{agent.description}</p>
      {runStatus === 'ok'    && <p className="text-label-sm text-primary mb-2">Report ready — check Insights</p>}
      {runStatus === 'error' && <p className="text-label-sm text-error mb-2">No report — LLM unavailable</p>}
      <div className="flex items-center justify-between">
        <span className="text-label-sm text-on-surface-variant/70">{agent.schedule}</span>
        <button
          onClick={() => onDuplicate(agent)}
          className="px-3 py-1.5 rounded-full bg-primary/10 text-primary text-label-sm font-semibold hover:bg-primary/20 transition flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-[14px]">content_copy</span>
          Duplicate
        </button>
      </div>
    </div>
  );
}

function CustomAgentRow({ agent, onEdit }) {
  const qc = useQueryClient();
  const [runStatus, setRunStatus] = useState(null); // 'ok' | 'error' | null

  const toggle = useMutation({
    mutationFn: () => api.patch(`/custom-agents/${agent.id}`, { enabled: agent.enabled ? 0 : 1 }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-agents'] }),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/custom-agents/${agent.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-agents'] }),
  });

  const runNow = useMutation({
    mutationFn: () => api.post(`/custom-agents/${agent.id}/run`),
    onSuccess: () => {
      setRunStatus('ok');
      qc.invalidateQueries({ queryKey: ['agent-insights'] });
      setTimeout(() => setRunStatus(null), 3000);
    },
    onError: () => {
      setRunStatus('error');
      setTimeout(() => setRunStatus(null), 3000);
    },
  });

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-container transition">
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-[16px]">
        {agent.icon || '🤖'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-body-md text-on-surface font-medium truncate">{agent.name}</span>
          <SharedBadge visibility={agent.visibility} />
          <span className="text-label-sm text-on-surface-variant">{scheduleSummary(agent.schedule_cron)}</span>
        </div>
        <p className="text-label-sm text-on-surface-variant truncate">{agent.instructions}</p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {runStatus === 'ok'    && <span className="text-label-sm text-primary mr-1">Report ready</span>}
        {runStatus === 'error' && <span className="text-label-sm text-error mr-1">No report / LLM unavailable</span>}
        <button
          onClick={() => runNow.mutate()}
          disabled={runNow.isPending || !agent.enabled}
          title="Run now"
          className="w-8 h-8 rounded-full hover:bg-surface-container-high text-on-surface-variant hover:text-primary flex items-center justify-center transition disabled:opacity-30"
        >
          <span className="material-symbols-outlined text-[18px]">play_arrow</span>
        </button>
        <button
          onClick={() => toggle.mutate()}
          title={agent.enabled ? 'Disable' : 'Enable'}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition ${agent.enabled ? 'text-primary hover:bg-primary/10' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
        >
          <span className="material-symbols-outlined text-[18px]">{agent.enabled ? 'toggle_on' : 'toggle_off'}</span>
        </button>
        <button
          onClick={() => onEdit(agent)}
          title="Edit"
          className="w-8 h-8 rounded-full hover:bg-surface-container-high text-on-surface-variant hover:text-primary flex items-center justify-center transition"
        >
          <span className="material-symbols-outlined text-[18px]">edit</span>
        </button>
        <button
          onClick={() => { if (confirm(`Delete "${agent.name}"?`)) remove.mutate(); }}
          title="Delete"
          className="w-8 h-8 rounded-full hover:bg-error-container text-on-surface-variant hover:text-error flex items-center justify-center transition"
        >
          <span className="material-symbols-outlined text-[18px]">delete</span>
        </button>
      </div>
    </div>
  );
}

export default function AgentHub() {
  const [showAll, setShowAll] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [duplicateSeed, setDuplicateSeed] = useState(null);
  const { insights, busyId, onApprove, onDismiss, onSnooze } = useAgentInsights();

  const { data: customAgents = [] } = useQuery({
    queryKey: ['custom-agents'],
    queryFn: () => api.get('/custom-agents').then(r => r.data),
  });

  const visible = showAll ? insights : insights.slice(0, VISIBLE_LIMIT);
  const hiddenCount = insights.length - visible.length;

  const openCreate = () => { setEditingAgent(null); setDuplicateSeed(null); setFormOpen(true); };
  const openEdit = (agent) => { setEditingAgent(agent); setDuplicateSeed(null); setFormOpen(true); };
  const openDuplicate = (prebuilt) => {
    setEditingAgent(null);
    setDuplicateSeed({ name: prebuilt.duplicate.name, icon: prebuilt.icon, instructions: prebuilt.duplicate.instructions, schedule_cron: prebuilt.duplicate.schedule_cron });
    setFormOpen(true);
  };

  return (
    <div className="max-w-7xl mx-auto pb-8">
      <h1 className="text-headline-lg text-on-background mb-1">AI Agent Hub</h1>
      <p className="text-body-md text-on-surface-variant mb-5">
        Background agents watch your tasks, schedule, and household activity and surface what's worth knowing here.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-grid-gutter items-start">
        {/* Left: 2/3 — agents (pre-built + custom) */}
        <div className="lg:col-span-2 space-y-stack-gap-lg">
          <div>
            <h2 className="text-headline-md text-on-surface mb-3">Pre-built Agents</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PREBUILT_AGENTS.map(agent => (
                <PrebuiltAgentCard key={agent.id} agent={agent} onDuplicate={openDuplicate} />
              ))}
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-2xl shadow-soft border border-outline-variant/20 p-card-padding">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-headline-md text-on-surface">Custom Agents</h2>
              <button
                onClick={openCreate}
                className="h-9 px-4 rounded-full bg-primary/10 text-primary text-label-md font-semibold flex items-center gap-1.5 hover:bg-primary/20 transition"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                New Agent
              </button>
            </div>

            {customAgents.length === 0 ? (
              <div className="text-center py-8 text-on-surface-variant">
                <span className="material-symbols-outlined text-3xl block mb-2">smart_toy</span>
                <p className="text-body-md">No custom agents yet — describe a standing report you'd like, or duplicate a pre-built one above.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {customAgents.map(agent => (
                  <CustomAgentRow key={agent.id} agent={agent} onEdit={openEdit} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: 1/3 — insight outputs */}
        <div className="space-y-3">
          <h2 className="text-headline-md text-on-surface mb-3">Insights</h2>
          {insights.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-3xl shadow-soft border border-outline-variant/20 flex flex-col items-center justify-center text-center py-12 px-4">
              <span className="material-symbols-outlined text-[32px] text-on-surface-variant/40 mb-2">auto_awesome</span>
              <p className="text-body-md text-on-surface font-medium mb-1">No insights right now</p>
              <p className="text-label-md text-on-surface-variant">Agents run on their own schedule — check back later.</p>
            </div>
          ) : (
            <>
              {visible.map(insight => (
                <InsightCard
                  key={insight.id}
                  insight={insight}
                  compact
                  busy={busyId === insight.id}
                  onApprove={onApprove}
                  onDismiss={onDismiss}
                  onSnooze={onSnooze}
                />
              ))}
              {!showAll && hiddenCount > 0 && (
                <button
                  onClick={() => setShowAll(true)}
                  className="w-full py-2.5 rounded-full border border-outline-variant/30 text-label-md text-on-surface-variant hover:bg-surface-container transition"
                >
                  +{hiddenCount} more
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <CustomAgentFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        agent={editingAgent}
        initialValues={duplicateSeed}
      />
    </div>
  );
}
