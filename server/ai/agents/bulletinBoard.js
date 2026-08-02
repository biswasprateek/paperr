const { LLMUnavailableError } = require('../llmClient');
const { alreadyFiredToday, createInsight, llmText } = require('./utils');
const logger = require('../../utils/logger');

// Space-wide digest: daily (yesterday's highlights) or Monday weekly roll-up.
// One insight per space with user_id null — every member sees it; dismiss/
// snooze is tracked per user in agent_insight_dismissals. Falls back to a
// plain per-member stat list when the LLM is down.
async function bulletinBoard(db, io, space, { window = 'day', force = false } = {}) {
  if (!force && alreadyFiredToday(db, 'bulletin_board', { spaceId: space.id })) return null;

  const days = window === 'week' ? 7 : 1;
  // Local-day window ending yesterday inclusive
  const range = { from: `date('now', 'localtime', '-${days} days')`, to: "date('now', 'localtime')" };

  const completedTasks = db.prepare(`
    SELECT u.display_name AS name, COUNT(*) AS cnt FROM tasks t
    JOIN users u ON u.id = t.completed_by
    WHERE t.space_id = ? AND t.is_completed = 1
      AND date(t.completed_at, 'localtime') >= ${range.from} AND date(t.completed_at, 'localtime') < ${range.to}
    GROUP BY t.completed_by ORDER BY cnt DESC
  `).all(space.id);

  const habits = db.prepare(`
    SELECT u.display_name AS name, COUNT(*) AS cnt FROM routines_completions rc
    JOIN routines_habits rh ON rh.id = rc.habit_id
    JOIN routines_protocols rp ON rp.id = rh.protocol_id
    JOIN users u ON u.id = rc.user_id
    WHERE rp.space_id = ?
      AND rc.completed_date >= ${range.from} AND rc.completed_date < ${range.to}
    GROUP BY rc.user_id ORDER BY cnt DESC
  `).all(space.id);

  const listItems = db.prepare(`
    SELECT u.display_name AS name, COUNT(*) AS cnt FROM list_items li
    JOIN lists l ON l.id = li.list_id
    JOIN users u ON u.id = li.completed_by
    WHERE l.space_id = ? AND li.is_completed = 1
      AND date(li.completed_at, 'localtime') >= ${range.from} AND date(li.completed_at, 'localtime') < ${range.to}
    GROUP BY li.completed_by ORDER BY cnt DESC
  `).all(space.id);

  if (!force && !completedTasks.length && !habits.length && !listItems.length) return null;

  const statLine = (rows, unit) => rows.map(r => `- **${r.name}**: ${r.cnt} ${unit}${r.cnt === 1 ? '' : 's'}`).join('\n');
  const sections = [];
  if (completedTasks.length) sections.push(`**Tasks completed**\n${statLine(completedTasks, 'task')}`);
  if (habits.length)         sections.push(`**Habits kept**\n${statLine(habits, 'habit check-in')}`);
  if (listItems.length)      sections.push(`**List items ticked off**\n${statLine(listItems, 'item')}`);
  const fallback = sections.length ? sections.join('\n\n') : 'No activity to report yet.';

  let content = fallback;
  try {
    const digest = await llmText(
      `You write a warm, concise ${window === 'week' ? 'weekly' : 'daily'} bulletin for the "${space.name}" ${space.type === 'team' ? 'team' : 'family'}. Celebrate each person's wins by name in 2-4 sentences. Plain prose, no headings, no invented facts — only what the data shows.`,
      `Activity for ${window === 'week' ? 'the past week' : 'yesterday'}:\n\n${fallback}`
    );
    if (digest) content = `${digest}\n\n${fallback}`;
  } catch (err) {
    if (!(err instanceof LLMUnavailableError)) logger.info('bulletinBoard LLM error', { error: err.message });
    // fallback stat list already in place
  }

  return createInsight(db, io, {
    userId: null, spaceId: space.id, agentType: 'bulletin_board',
    title: window === 'week' ? 'Weekly Bulletin' : 'Bulletin Board',
    content, expiresHours: 24,
  });
}

module.exports = { bulletinBoard };
