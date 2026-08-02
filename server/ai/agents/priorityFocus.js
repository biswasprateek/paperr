const { getDb } = require('../../db/db');
const { LLMUnavailableError } = require('../llmClient');
const { alreadyFiredToday, createInsight, friendlyDate, llmText } = require('./utils');
const logger = require('../../utils/logger');

// Event-triggered: when a day accumulates 5+ high-priority tasks for one
// user, ask the LLM for a ranked focus order. Read-only card (tasks have no
// sort_order column to write). Skips silently when the LLM is down.
const HIGH_TASK_THRESHOLD = 5;

async function priorityFocus(db, io, user, spaceId, dueDate, { force = false } = {}) {
  if (!force && alreadyFiredToday(db, 'priority', { userId: user.id, spaceId })) return null;

  const tasks = db.prepare(`
    SELECT t.id, t.title, t.description, p.name AS project_name FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.space_id = ? AND t.archived = 0 AND t.is_completed = 0
      AND t.assigned_to = ? AND t.priority = 'high' AND date(t.due_date) = ?
  `).all(spaceId, user.id, dueDate);

  if (!force && tasks.length < HIGH_TASK_THRESHOLD) return null;
  if (!tasks.length) {
    return force
      ? createInsight(db, io, { userId: user.id, spaceId, agentType: 'priority', title: 'Priority Focus', content: `No high-priority tasks due ${friendlyDate(dueDate)} — nothing to rank.` })
      : null;
  }

  let ranked;
  try {
    ranked = await llmText(
      `${user.display_name} has ${tasks.length} high-priority tasks all due ${friendlyDate(dueDate)}. Produce a numbered focus order (most important first) with a short one-line reason per task. Output only the numbered markdown list, using each task's exact title in bold.`,
      tasks.map(t => `- "${t.title}"${t.project_name ? ` (${t.project_name})` : ''}${t.description ? `: ${t.description.slice(0, 120)}` : ''}`).join('\n')
    );
  } catch (err) {
    if (!(err instanceof LLMUnavailableError)) logger.info('priorityFocus LLM error', { error: err.message });
    return null; // ranking is the whole card — nothing useful without the LLM
  }
  if (!ranked) return null;

  return createInsight(db, io, {
    userId: user.id, spaceId, agentType: 'priority',
    title: 'Priority Focus',
    content: `You have **${tasks.length} high-priority tasks** due ${friendlyDate(dueDate)}. Suggested order:\n\n${ranked}`,
  });
}

// Fire-and-forget hook for task routes: checks the threshold cheaply before
// doing any LLM work. `task` is the created/updated row.
function maybePriorityFocus(io, task) {
  if (!task?.assigned_to || !task.due_date || task.priority !== 'high' || task.is_completed) return;
  const db = getDb();
  const day = task.due_date.split('T')[0];
  const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(task.assigned_to);
  if (!user) return;
  priorityFocus(db, io, user, task.space_id, day)
    .catch(err => logger.info('priorityFocus hook error', { error: err.message }));
}

module.exports = { priorityFocus, maybePriorityFocus };
