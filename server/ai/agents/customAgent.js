const { getDb } = require('../../db/db');
const { callLLM, LLMUnavailableError } = require('../llmClient');
const { LLM_TOOLS, READ_ONLY_TOOLS } = require('../tools');
const { handleToolCall } = require('../toolHandler');
const { todayLocal, createInsight } = require('./utils');
const logger = require('../../utils/logger');

const MAX_TOOL_ITERATIONS = 5;

function proposalLabel(name, args) {
  switch (name) {
    case 'rescheduleTasks':   return `Reschedule ${args.taskIds?.length || 0} task(s) to ${args.newDueDate}`;
    case 'completeTask':      return args.taskIds?.length ? `Complete ${args.taskIds.length} task(s)` : 'Complete task';
    case 'createTask':        return `Create task "${args.title}"`;
    case 'createEvent':       return `Create event "${args.title}"`;
    case 'deleteTask':        return 'Delete task';
    default:                  return `Approve: ${name}`;
  }
}

// Core LLM tool-loop shared by the scheduled runner and the "Test" button in
// the create/edit form. Read tools execute inline; any write tool is
// captured as a proposal rather than executed, and errors propagate to the
// caller instead of being swallowed — the scheduled runner and the dry-run
// test endpoint want different failure handling.
async function runAgentInstructions({ user, name, instructions, spaceId }) {
  const history = [{
    role: 'system',
    content: `You are a scheduled background agent named "${name}" running for ${user.display_name} in the paperr household app. Today is ${todayLocal()}.

Carry out the user's standing instruction below by fetching data with the available read tools (getTasks, getSummary, getListItems, resolveDate), then reply with a concise markdown report of what you found. Use bold for key items and bullet lists where natural.

You may propose ONE change (e.g. rescheduleTasks) if the instruction calls for it — it will be queued for the user's approval, not executed. Never assume a proposed change has happened.

Standing instruction: ${instructions}`,
  }, {
    role: 'user',
    content: 'Run your standing instruction now and produce the report.',
  }];

  let report = '';
  let proposal = null; // { name, args } — first write tool the model attempts

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const choice = await callLLM({ messages: history, tools: LLM_TOOLS });
    const { finish_reason, message } = choice;

    if (finish_reason === 'tool_calls' && message.tool_calls?.length) {
      history.push(message);
      for (const tc of message.tool_calls) {
        let args;
        try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }

        let resultText;
        if (READ_ONLY_TOOLS.has(tc.function.name)) {
          const toolResult = await handleToolCall(tc.function.name, args, user, null, spaceId);
          resultText = typeof toolResult.result === 'string' ? toolResult.result : JSON.stringify(toolResult.result);
        } else {
          if (!proposal) proposal = { name: tc.function.name, args };
          resultText = proposal.name === tc.function.name
            ? 'Queued for user approval — it has NOT been executed. Mention it in your report as a proposal.'
            : 'Rejected: only one proposed change per run is allowed.';
        }
        history.push({ role: 'tool', tool_call_id: tc.id, content: resultText });
      }
      continue;
    }

    report = message?.content?.trim() || '';
    break;
  }

  return { report, proposal };
}

// Runs one custom_agents row on its schedule. Failures (including the LLM
// being unavailable) are swallowed — a scheduled run should never crash the
// cron or spam an error insight; the user finds out via the empty result of
// their next "Run now"/Test attempt instead.
async function customAgent(db, io, customAgentId) {
  db = db || getDb();
  const agent = db.prepare('SELECT * FROM custom_agents WHERE id = ?').get(customAgentId);
  if (!agent || !agent.enabled) return null;

  // Avoid stacking duplicate reports while one is still awaiting the user
  const existing = db.prepare(
    "SELECT 1 FROM agent_insights WHERE custom_agent_id = ? AND status IN ('active', 'snoozed') AND (expires_at IS NULL OR expires_at > datetime('now')) LIMIT 1"
  ).get(customAgentId);
  if (existing) return null;

  const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(agent.user_id);
  if (!user) return null;

  let report = '', proposal = null;
  try {
    ({ report, proposal } = await runAgentInstructions({ user, name: agent.name, instructions: agent.instructions, spaceId: agent.space_id }));
  } catch (err) {
    if (!(err instanceof LLMUnavailableError)) logger.info('customAgent error', { customAgentId, error: err.message });
    return null;
  } finally {
    db.prepare("UPDATE custom_agents SET last_run_at = datetime('now') WHERE id = ?").run(customAgentId);
  }

  if (!report) return null;

  return createInsight(db, io, {
    userId: user.id, spaceId: agent.space_id, agentType: 'custom', customAgentId,
    title: agent.name, content: report,
    actionPayload: proposal,
    actionLabel: proposal ? proposalLabel(proposal.name, proposal.args) : null,
  });
}

module.exports = { customAgent, runAgentInstructions, proposalLabel };
