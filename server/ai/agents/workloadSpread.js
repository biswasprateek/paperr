const { todayLocal, addDaysLocal, friendlyDate, alreadyFiredToday, createInsight } = require('./utils');

// Sunday 18:00 — heuristic (no LLM). Finds days in the coming week carrying
// more than 2× the average load and proposes moving the excess (lowest
// priority first) to the lightest days. Approve executes a batch of
// rescheduleTasks calls, one per target day.
const PRIORITY_RANK = { low: 0, medium: 1, high: 2 };

async function workloadSpread(db, io, user, spaceId, { force = false } = {}) {
  if (!force && alreadyFiredToday(db, 'workload', { userId: user.id, spaceId })) return null;

  const today = todayLocal();
  const tasks = db.prepare(`
    SELECT id, title, priority, date(due_date) AS day FROM tasks
    WHERE space_id = ? AND archived = 0 AND is_completed = 0
      AND assigned_to = ? AND date(due_date) > ? AND date(due_date) <= ?
  `).all(spaceId, user.id, today, addDaysLocal(7));

  if (!force && tasks.length < 4) return null;

  const days = [];
  for (let i = 1; i <= 7; i++) days.push(addDaysLocal(i));
  const byDay = Object.fromEntries(days.map(d => [d, []]));
  tasks.forEach(t => byDay[t.day]?.push(t));

  const avg = tasks.length / 7;
  const overloaded = days.filter(d => byDay[d].length >= 3 && byDay[d].length > 2 * avg);
  if (!force && !overloaded.length) return null;

  const counts = Object.fromEntries(days.map(d => [d, byDay[d].length]));
  const moves = []; // { taskId, title, from, to }
  for (const day of overloaded) {
    // Move lowest-priority tasks off until the day is at ceil(avg)
    const excess = byDay[day]
      .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
      .slice(0, counts[day] - Math.ceil(avg));
    for (const task of excess) {
      const target = days
        .filter(d => !overloaded.includes(d))
        .sort((a, b) => counts[a] - counts[b] || a.localeCompare(b))[0];
      if (!target) break;
      counts[day]--;
      counts[target]++;
      moves.push({ taskId: task.id, title: task.title, from: day, to: target });
    }
  }
  if (!moves.length) {
    return force
      ? createInsight(db, io, { userId: user.id, spaceId, agentType: 'workload', title: 'Workload Balance', content: 'Next week looks evenly loaded — nothing to redistribute.' })
      : null;
  }

  // One rescheduleTasks call per target day
  const byTarget = {};
  moves.forEach(m => (byTarget[m.to] = byTarget[m.to] || []).push(m.taskId));
  const actionPayload = Object.entries(byTarget).map(([newDueDate, taskIds]) => ({
    name: 'rescheduleTasks', args: { taskIds, newDueDate },
  }));

  const overloadLines = overloaded.map(d => `- **${friendlyDate(d)}** has ${byDay[d].length} tasks`).join('\n');
  const moveLines = moves.map(m => `- Move **${m.title}** from ${friendlyDate(m.from)} to ${friendlyDate(m.to)}`).join('\n');

  return createInsight(db, io, {
    userId: user.id, spaceId, agentType: 'workload',
    title: 'Workload Balance',
    content: `Next week is uneven:\n${overloadLines}\n\nProposed moves:\n${moveLines}`,
    actionPayload,
    actionLabel: 'Redistribute',
  });
}

module.exports = { workloadSpread };
