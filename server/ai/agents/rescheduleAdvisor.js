const { todayLocal, addDaysLocal, friendlyDate, alreadyFiredToday, createInsight } = require('./utils');

// Daily 09:00 — proposes new dates for overdue tasks. Purely heuristic (no
// LLM): each task is offered the lightest of the user's next 7 days, so the
// action payload is deterministic and the agent works when the LLM is down.
const MAX_SUGGESTIONS = 5;

async function rescheduleAdvisor(db, io, user, spaceId, { force = false } = {}) {
  if (!force && alreadyFiredToday(db, 'reschedule', { userId: user.id, spaceId })) return null;

  const today = todayLocal();

  const overdue = db.prepare(`
    SELECT id, title, due_date, priority FROM tasks
    WHERE space_id = ? AND archived = 0 AND is_completed = 0
      AND assigned_to = ? AND due_date IS NOT NULL AND date(due_date) < ?
    ORDER BY due_date
    LIMIT ?
  `).all(spaceId, user.id, today, MAX_SUGGESTIONS);

  if (!overdue.length) {
    return force
      ? createInsight(db, io, { userId: user.id, spaceId, agentType: 'reschedule', title: 'Reschedule suggestion', content: 'No overdue tasks right now — nothing to reschedule.' })
      : null;
  }

  // Task count per day for the next 7 days (the user's own open tasks)
  const load = {};
  for (let i = 1; i <= 7; i++) load[addDaysLocal(i)] = 0;
  db.prepare(`
    SELECT date(due_date) AS day, COUNT(*) AS cnt FROM tasks
    WHERE space_id = ? AND archived = 0 AND is_completed = 0
      AND assigned_to = ? AND date(due_date) > ? AND date(due_date) <= ?
    GROUP BY date(due_date)
  `).all(spaceId, user.id, today, addDaysLocal(7))
    .forEach(r => { if (r.day in load) load[r.day] = r.cnt; });

  const insights = [];
  for (const task of overdue) {
    // Lightest upcoming day, earliest on ties; count the move so successive
    // suggestions spread across days instead of piling onto the same one.
    const target = Object.keys(load).sort((a, b) => load[a] - load[b] || a.localeCompare(b))[0];
    load[target]++;

    const nice = friendlyDate(target);
    const wasDue = friendlyDate(task.due_date.split('T')[0]);
    const others = load[target] - 1;
    insights.push(createInsight(db, io, {
      userId: user.id, spaceId, agentType: 'reschedule',
      title: 'Reschedule suggestion',
      content: `**${task.title}** was due ${wasDue} and is still open.\n\n${nice} looks like your lightest day (${others === 0 ? 'nothing else scheduled' : `${others} other task${others === 1 ? '' : 's'}`}) — move it there?`,
      actionPayload: { name: 'rescheduleTasks', args: { taskIds: [task.id], newDueDate: target } },
      actionLabel: `Accept ${nice}`,
    }));
  }
  return insights;
}

module.exports = { rescheduleAdvisor };
