const express = require('express');
const router  = express.Router();
const { getDb } = require('../db/db');
const { requireAuth, requireSpace } = require('../auth/middleware');
const logger = require('../utils/logger');

// Family/Team scope only — built from tasks, projects, deep work, and
// routines. Pomodoro/Breathing now carry space_id too (wellness_sessions),
// so a combined Family view for those is possible but not wired up here yet.
// Mood and Meditation are deliberately never queried here regardless — that's
// a standing privacy policy, not a schema limit; see Analytics spec §07.
router.use(requireAuth, requireSpace);

const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 };

router.get('/space', (req, res, next) => {
  try {
    const db = getDb();
    const range = RANGE_DAYS[req.query.range] ? req.query.range : '7d';
    const days = RANGE_DAYS[range];
    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    const sinceStr = since.toISOString().slice(0, 10);

    const members = db.prepare(`
      SELECT u.id, u.display_name, u.nickname, u.avatar_colour
      FROM space_members sm JOIN users u ON u.id = sm.user_id
      WHERE sm.space_id = ? ORDER BY sm.joined_at ASC
    `).all(req.spaceId);

    const tasksByMember = db.prepare(`
      SELECT assigned_to AS user_id, COUNT(*) AS n
      FROM tasks
      WHERE space_id = ? AND is_completed = 1 AND date(completed_at) >= ? AND assigned_to IS NOT NULL
      GROUP BY assigned_to
    `).all(req.spaceId, sinceStr);
    const tasksMap = Object.fromEntries(tasksByMember.map(r => [r.user_id, r.n]));

    const deepWorkByMember = db.prepare(`
      SELECT dws.user_id AS user_id, COALESCE(SUM(dws.duration_sec), 0) AS sec
      FROM deep_work_sessions dws JOIN tasks t ON dws.task_id = t.id
      WHERE t.space_id = ? AND date(dws.started_at) >= ?
      GROUP BY dws.user_id
    `).all(req.spaceId, sinceStr);
    const deepWorkMap = Object.fromEntries(deepWorkByMember.map(r => [r.user_id, Math.round(r.sec / 60)]));

    const leaderboard = {
      tasks: members
        .map(m => ({ userId: m.id, displayName: m.nickname || m.display_name, avatarColour: m.avatar_colour, count: tasksMap[m.id] || 0 }))
        .sort((a, b) => b.count - a.count),
      deepWork: members
        .map(m => ({ userId: m.id, displayName: m.nickname || m.display_name, avatarColour: m.avatar_colour, minutes: deepWorkMap[m.id] || 0 }))
        .sort((a, b) => b.minutes - a.minutes),
    };

    const activeProjects = db.prepare(`SELECT COUNT(*) AS n FROM projects WHERE space_id = ? AND status = 'active'`).get(req.spaceId).n;

    // Habits kept rate: every (habit, day) slot in the window counts once,
    // regardless of which member completed it — avoids double-counting a
    // shared habit that several members checked off the same day. This
    // ignores each habit's recur_days scheduling (treats every active habit
    // as expected daily), so it's an approximation, not an exact rate.
    const habitRows = db.prepare(`
      SELECT h.id FROM routines_habits h JOIN routines_protocols p ON h.protocol_id = p.id
      WHERE p.space_id = ? AND h.is_active = 1
    `).all(req.spaceId);
    let habitsKeptRate = null;
    if (habitRows.length > 0) {
      const kept = db.prepare(`
        SELECT COUNT(DISTINCT rc.habit_id || '|' || rc.completed_date) AS n
        FROM routines_completions rc
        JOIN routines_habits h ON rc.habit_id = h.id
        JOIN routines_protocols p ON h.protocol_id = p.id
        WHERE p.space_id = ? AND h.is_active = 1 AND rc.completed_date >= ?
      `).get(req.spaceId, sinceStr).n;
      const expected = habitRows.length * days;
      habitsKeptRate = Math.min(100, Math.round((kept / expected) * 100));
    }

    const tasksDone = Object.values(tasksMap).reduce((a, b) => a + b, 0);
    const deepWorkMinutes = Object.values(deepWorkMap).reduce((a, b) => a + b, 0);

    res.json({
      range,
      pulse: { tasksDone, deepWorkMinutes, habitsKeptRate, activeProjects },
      leaderboard,
    });
  } catch (err) { next(err); }
});

// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  logger.error(`analytics route error: ${req.method} ${req.path}`, { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

module.exports = router;
