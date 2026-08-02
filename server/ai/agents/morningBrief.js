const { LLMUnavailableError } = require('../llmClient');
const { todayLocal, friendlyDate, alreadyFiredToday, createInsight, llmText } = require('./utils');
const logger = require('../../utils/logger');

// Daily 08:00 per-user summary of today's tasks, overdue tasks, and events.
// Works without the LLM — falls back to a plain markdown list.
async function morningBrief(db, io, user, spaceId, { force = false } = {}) {
  if (!force && alreadyFiredToday(db, 'morning_brief', { userId: user.id, spaceId })) return null;

  const today = todayLocal();

  const todayTasks = db.prepare(`
    SELECT title, priority, due_date FROM tasks
    WHERE space_id = ? AND archived = 0 AND is_completed = 0
      AND (assigned_to = ? OR assigned_to IS NULL)
      AND date(due_date) = ?
    ORDER BY priority = 'high' DESC, title
  `).all(spaceId, user.id, today);

  const overdueTasks = db.prepare(`
    SELECT title, priority, due_date FROM tasks
    WHERE space_id = ? AND archived = 0 AND is_completed = 0
      AND assigned_to = ? AND due_date IS NOT NULL AND date(due_date) < ?
    ORDER BY due_date
    LIMIT 10
  `).all(spaceId, user.id, today);

  const events = db.prepare(`
    SELECT title, start_datetime, all_day, location FROM events
    WHERE space_id = ? AND archived = 0 AND date(start_datetime) = ?
    ORDER BY start_datetime
  `).all(spaceId, today);

  if (!force && !todayTasks.length && !overdueTasks.length && !events.length) return null;

  const fmtTask = (t) => `- ${t.title}${t.priority === 'high' ? ' **(high)**' : ''}${t.due_date && t.due_date !== today ? ` — was due ${friendlyDate(t.due_date.split('T')[0])}` : ''}`;
  const fmtEvent = (e) => `- ${e.title}${e.all_day ? ' (all day)' : ` at ${e.start_datetime.split('T')[1]?.slice(0, 5) || ''}`}${e.location ? `, ${e.location}` : ''}`;

  const sections = [];
  if (todayTasks.length)   sections.push(`**Due today (${todayTasks.length})**\n${todayTasks.map(fmtTask).join('\n')}`);
  if (overdueTasks.length) sections.push(`**Overdue (${overdueTasks.length})**\n${overdueTasks.map(fmtTask).join('\n')}`);
  if (events.length)       sections.push(`**Events**\n${events.map(fmtEvent).join('\n')}`);
  const fallback = sections.length ? sections.join('\n\n') : "Nothing due today, overdue, or on the calendar — you're all caught up.";

  let content = fallback;
  try {
    const summary = await llmText(
      `You write a short, friendly morning brief for ${user.display_name}. 2-4 sentences, plain prose, no headings or bullet lists. Mention the most important items by name; be encouraging but not saccharine. Today is ${friendlyDate(today)}.`,
      `Tasks due today:\n${todayTasks.map(fmtTask).join('\n') || 'none'}\n\nOverdue tasks:\n${overdueTasks.map(fmtTask).join('\n') || 'none'}\n\nEvents today:\n${events.map(fmtEvent).join('\n') || 'none'}`
    );
    if (summary) content = `${summary}\n\n${fallback}`;
  } catch (err) {
    if (!(err instanceof LLMUnavailableError)) logger.info('morningBrief LLM error', { error: err.message });
    // LLM down — plain list fallback already in place
  }

  return createInsight(db, io, {
    userId: user.id, spaceId, agentType: 'morning_brief',
    title: 'Morning Brief', content, expiresHours: 24,
  });
}

module.exports = { morningBrief };
