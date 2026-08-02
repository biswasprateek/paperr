const express = require('express');
const { requireAuth, requireSpace } = require('../auth/middleware');
const { getDb } = require('../db/db');
const { callLLM, LLMUnavailableError } = require('../ai/llmClient');
const { buildSystemPrompt } = require('../ai/systemPrompt');
const { LLM_TOOLS, READ_ONLY_TOOLS } = require('../ai/tools');
const { handleToolCall } = require('../ai/toolHandler');

const MAX_TOOL_ITERATIONS = 5;

// Confirmed tool calls carry a stable id (from the LLM's tool_calls response) that
// stays the same if the client retries the same confirmed action after a failed
// request — e.g. the write succeeded but the follow-up LLM summary call then
// failed. Caching the result by that id for a few minutes means a retry replays
// the cached outcome instead of re-running (and duplicating) the write.
const executedToolCalls = new Map(); // tc.id -> { result, expiresAt }
const TOOL_CALL_CACHE_MS = 5 * 60 * 1000;

function pruneExecutedToolCalls() {
  const now = Date.now();
  for (const [id, entry] of executedToolCalls) {
    if (entry.expiresAt < now) executedToolCalls.delete(id);
  }
}

function buildSummary(db, name, args) {
  try {
    switch (name) {
      case 'createTask': {
        const parts = [`Create task "${args.title}"`];
        if (args.projectId) parts.push(`in project #${args.projectId}`);
        if (args.dueDate) parts.push(`due ${args.dueDate}`);
        if (args.priority && args.priority !== 'medium') parts.push(`${args.priority} priority`);
        const subCount = args.subtasks?.length || 0;
        if (subCount) parts.push(`with ${subCount} subtask${subCount !== 1 ? 's' : ''}`);
        return parts.join(', ');
      }
      case 'updateTask': {
        const task = db.prepare('SELECT title FROM tasks WHERE id = ?').get(args.taskId);
        const changes = Object.entries(args.fields || {}).map(([k, v]) => `${k}: ${v}`).join(', ');
        return `Update "${task?.title || `task #${args.taskId}`}" — ${changes}`;
      }
      case 'completeTask': {
        if (args.taskIds?.length) return `Complete ${args.taskIds.length} task(s)`;
        const task = db.prepare('SELECT title FROM tasks WHERE id = ?').get(args.taskId);
        return `Complete "${task?.title || `task #${args.taskId}`}"`;
      }
      case 'deleteTask': {
        const task = db.prepare('SELECT title FROM tasks WHERE id = ?').get(args.taskId);
        return `Delete "${task?.title || `task #${args.taskId}`}"`;
      }
      case 'rescheduleTasks':
        return `Reschedule ${args.taskIds?.length || 0} task(s) to ${args.newDueDate}`;
      case 'createList':
        return `Create ${args.type || 'custom'} list "${args.name}"`;
      case 'createProject':
        return `Create project "${args.name}"`;
      case 'updateProject': {
        const proj = db.prepare('SELECT name FROM projects WHERE id = ?').get(args.projectId);
        const changes = Object.entries(args.fields || {}).map(([k, v]) => `${k}: ${v}`).join(', ');
        return `Update project "${proj?.name || `#${args.projectId}`}" — ${changes}`;
      }
      case 'createListItem': {
        const list = db.prepare('SELECT name FROM lists WHERE id = ?').get(args.listId);
        return `Add "${args.title}" to ${list?.name || `list #${args.listId}`}`;
      }
      case 'completeListItem': {
        const item = db.prepare('SELECT title FROM list_items WHERE id = ?').get(args.itemId);
        return `Mark "${item?.title || `item #${args.itemId}`}" as ${args.completed ? 'complete' : 'incomplete'}`;
      }
      case 'deleteListItem': {
        const item = db.prepare('SELECT title FROM list_items WHERE id = ?').get(args.itemId);
        return `Delete "${item?.title || `item #${args.itemId}`}"`;
      }
      default:
        return name;
    }
  } catch {
    return name;
  }
}

module.exports = function (io) {
  const router = express.Router();

  router.post('/', requireAuth, requireSpace, async (req, res) => {
    const { messages = [], roomId, confirmedToolCalls, pendingAssistantMessage } = req.body;
    if (!messages.length) return res.status(400).json({ error: 'messages required' });

    try {
      const db = getDb();
      const systemContent = await buildSystemPrompt(req.user, { roomId, spaceId: req.spaceId });
      const history = [
        { role: 'system', content: systemContent },
        ...messages,
      ];

      const diffCards = [];
      let reply = '';

      // If user approved pending tool calls, execute them directly then get LLM summary
      if (confirmedToolCalls?.length && pendingAssistantMessage) {
        history.push(pendingAssistantMessage);
        pruneExecutedToolCalls();
        for (const tc of confirmedToolCalls) {
          const cached = executedToolCalls.get(tc.id);
          const toolResult = cached
            ? cached.result
            : await handleToolCall(tc.name, tc.args, req.user, io, req.spaceId);
          if (!cached) executedToolCalls.set(tc.id, { result: toolResult, expiresAt: Date.now() + TOOL_CALL_CACHE_MS });
          if (toolResult.diffCard) diffCards.push(toolResult.diffCard);
          history.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: typeof toolResult.result === 'string'
              ? toolResult.result
              : JSON.stringify(toolResult.result),
          });
        }
        // Fall through — LLM loop below will produce the summary response
      }

      for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
        const choice = await callLLM({ messages: history, tools: LLM_TOOLS });
        const { finish_reason, message } = choice;

        if (finish_reason === 'tool_calls' && message.tool_calls?.length) {
          const writes = message.tool_calls.filter(tc => !READ_ONLY_TOOLS.has(tc.function.name));

          if (writes.length > 0) {
            // Intercept — return pending actions for user approval
            const pendingToolCalls = writes.map(tc => {
              let args;
              try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }
              return { id: tc.id, name: tc.function.name, args, summary: buildSummary(db, tc.function.name, args) };
            });
            return res.json({ requiresConfirmation: true, pendingToolCalls, pendingAssistantMessage: message });
          }

          // Read-only tools — execute immediately, no confirmation needed
          history.push(message);
          for (const tc of message.tool_calls) {
            let args;
            try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }
            const toolResult = await handleToolCall(tc.function.name, args, req.user, io, req.spaceId);
            if (toolResult.diffCard) diffCards.push(toolResult.diffCard);
            history.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: typeof toolResult.result === 'string'
                ? toolResult.result
                : JSON.stringify(toolResult.result),
            });
          }
          continue;
        }

        reply = message?.content || '';
        break;
      }

      db.prepare(
        "INSERT INTO audit_log (user_id, action, entity_type, details_json) VALUES (?, 'dot_chat', 'chat', ?)"
      ).run(req.user.id, JSON.stringify({ messageCount: messages.length, toolCallsCount: diffCards.length }));

      return res.json({ reply, diffCards });
    } catch (err) {
      if (err instanceof LLMUnavailableError || err.code === 'LLM_UNAVAILABLE') {
        return res.status(503).json({ error: 'LLM unavailable', detail: err.message });
      }
      console.error('Chat error:', err.message);
      return res.status(500).json({ error: 'Chat failed', detail: err.message });
    }
  });

  // ── Chat Sessions ─────────────────────────────────────────────────────────────

  router.get('/sessions', requireAuth, (req, res) => {
    const db = getDb();
    const sessions = db.prepare(
      'SELECT id, title, created_at, updated_at FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50'
    ).all(req.user.id);
    res.json(sessions);
  });

  router.post('/sessions', requireAuth, (req, res) => {
    const { id, title, messages } = req.body;
    const db = getDb();
    const json = JSON.stringify(messages || []);
    if (id) {
      db.prepare(
        "UPDATE chat_sessions SET title = ?, messages_json = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
      ).run(title, json, id, req.user.id);
      return res.json({ id });
    }
    const result = db.prepare(
      'INSERT INTO chat_sessions (user_id, title, messages_json) VALUES (?, ?, ?)'
    ).run(req.user.id, title, json);
    res.json({ id: result.lastInsertRowid });
  });

  router.get('/sessions/:id', requireAuth, (req, res) => {
    const db = getDb();
    const session = db.prepare('SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!session) return res.status(404).json({ error: 'Not found' });
    res.json({ ...session, messages: JSON.parse(session.messages_json) });
  });

  router.delete('/sessions/:id', requireAuth, (req, res) => {
    const db = getDb();
    db.prepare('DELETE FROM chat_sessions WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ ok: true });
  });

  return router;
};
