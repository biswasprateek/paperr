const express = require('express');
const router = express.Router();
const { getDb } = require('../db/db');
const { requireAuth, requireSpace } = require('../auth/middleware');

const TIMER_MODES = new Set(['pomodoro', 'countup']);
const END_REASONS = new Set(['manual', 'timeout', 'max_duration']);

// Confirms a task belongs to the caller's space — mirrors the ownership
// check pattern used throughout routes/tasks.js.
function taskInSpace(db, taskId, spaceId) {
  return db.prepare('SELECT id FROM tasks WHERE id = ? AND space_id = ?').get(taskId, spaceId);
}

// POST /api/deep-work/sessions
router.post('/sessions', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const taskId = parseInt(req.body.task_id);
  const timerMode = req.body.timer_mode;
  if (!taskId || !TIMER_MODES.has(timerMode)) {
    return res.status(400).json({ error: 'task_id and a valid timer_mode are required' });
  }

  const task = db.prepare('SELECT id, title, status FROM tasks WHERE id = ? AND space_id = ?')
    .get(taskId, req.spaceId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const result = db.prepare(`
    INSERT INTO deep_work_sessions (task_id, user_id, timer_mode, started_at)
    VALUES (?, ?, ?, datetime('now', 'localtime'))
  `).run(taskId, req.user.id, timerMode);

  if (task.status !== 'in_progress') {
    db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run('in_progress', taskId);
    // Let every space view (boards, lists, widgets) reflect the moved task live.
    req.app.get('io')?.to(`space:${req.spaceId}`).emit('task:updated', { taskId });
  }

  const user = db.prepare('SELECT display_name, avatar_colour FROM users WHERE id = ?').get(req.user.id);
  req.app.get('io')?.to(`space:${req.spaceId}`).emit('deepwork:started', {
    task_id: taskId,
    task_title: task.title,
    user_id: req.user.id,
    display_name: user?.display_name,
    avatar_colour: user?.avatar_colour,
    timer_mode: timerMode,
    started_at: new Date().toISOString(),
  });

  return res.status(201).json({ id: result.lastInsertRowid });
});

// PUT /api/deep-work/sessions/:id/heartbeat
router.put('/sessions/:id/heartbeat', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const sessionId = parseInt(req.params.id);
  const durationSec = Math.max(0, Math.round(Number(req.body.duration_sec) || 0));

  const result = db.prepare(`
    UPDATE deep_work_sessions SET duration_sec = ?
    WHERE id = ? AND user_id = ? AND ended_at IS NULL
  `).run(durationSec, sessionId, req.user.id);

  if (result.changes === 0) return res.status(404).json({ error: 'Session not found' });
  return res.json({ success: true });
});

// POST /api/deep-work/sessions/:id/stop
router.post('/sessions/:id/stop', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const sessionId = parseInt(req.params.id);
  const durationSec = Math.max(0, Math.round(Number(req.body.duration_sec) || 0));
  const endedReason = req.body.ended_reason;
  if (!END_REASONS.has(endedReason)) {
    return res.status(400).json({ error: 'valid ended_reason is required' });
  }

  const session = db.prepare('SELECT task_id FROM deep_work_sessions WHERE id = ? AND user_id = ?')
    .get(sessionId, req.user.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  db.prepare(`
    UPDATE deep_work_sessions
    SET duration_sec = ?, ended_reason = ?, ended_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(durationSec, endedReason, sessionId);

  req.app.get('io')?.to(`space:${req.spaceId}`).emit('deepwork:stopped', {
    task_id: session.task_id,
    user_id: req.user.id,
  });

  return res.json({ success: true });
});

// GET /api/deep-work/tasks/:taskId/summary
router.get('/tasks/:taskId/summary', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const taskId = parseInt(req.params.taskId);
  if (!taskInSpace(db, taskId, req.spaceId)) return res.status(404).json({ error: 'Task not found' });

  const row = db.prepare(`
    SELECT COALESCE(SUM(duration_sec), 0) AS total_sec, COUNT(*) AS session_count
    FROM deep_work_sessions WHERE task_id = ?
  `).get(taskId);
  return res.json(row);
});

// Local YYYY-MM-DD and Monday-first week bucket key, matching wellness.js/mood.js.
function localDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  const tz = d.getTimezoneOffset();
  return new Date(d.getTime() - tz * 60000).toISOString().slice(0, 10);
}
function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d.toISOString().slice(0, 10);
}
// `days` accepts a plain number or the literal 'all' for unbounded history.
function sinceFromParam(param, { fallback = 30, max = 3650 } = {}) {
  if (param === 'all') return '0001-01-01';
  const n = Math.min(max, Math.max(1, parseInt(param) || fallback));
  return localDate(n - 1);
}

// GET /api/deep-work/summary — the signed-in user's own totals + top tasks,
// for the Analytics page's Deep Work card. Space-scoped via a join through
// tasks (deep_work_sessions itself carries no space_id).
router.get('/summary', requireAuth, requireSpace, (req, res, next) => {
  try {
    const db = getDb();
    const since = sinceFromParam(req.query.days);

    const totals = db.prepare(`
      SELECT COUNT(*) AS sessions, COALESCE(SUM(dws.duration_sec), 0) AS totalSec
      FROM deep_work_sessions dws JOIN tasks t ON dws.task_id = t.id
      WHERE dws.user_id = ? AND t.space_id = ? AND date(dws.started_at) >= ?
    `).get(req.user.id, req.spaceId, since);

    const topItems = db.prepare(`
      SELECT t.id AS task_id, t.title, COALESCE(SUM(dws.duration_sec), 0) AS totalSec, COUNT(*) AS sessions
      FROM deep_work_sessions dws JOIN tasks t ON dws.task_id = t.id
      WHERE dws.user_id = ? AND t.space_id = ? AND date(dws.started_at) >= ?
      GROUP BY t.id ORDER BY totalSec DESC LIMIT 3
    `).all(req.user.id, req.spaceId, since);

    res.json({
      sessions: totals.sessions,
      totalMinutes: Math.round(totals.totalSec / 60),
      avgSessionMinutes: totals.sessions ? Math.round(totals.totalSec / totals.sessions / 60) : 0,
      topItems: topItems.map(t => ({ taskId: t.task_id, title: t.title, minutes: Math.round(t.totalSec / 60), sessions: t.sessions })),
    });
  } catch (err) { next(err); }
});

// GET /api/deep-work/trend — weekly totals for the Analytics trend chart.
router.get('/trend', requireAuth, requireSpace, (req, res, next) => {
  try {
    const db = getDb();
    const weeks = Math.min(Math.max(parseInt(req.query.weeks) || 12, 1), 52);
    const thisWeekStart = mondayOf(localDate(0));
    const earliest = new Date(thisWeekStart + 'T00:00:00');
    earliest.setDate(earliest.getDate() - (weeks - 1) * 7);
    const since = earliest.toISOString().slice(0, 10);

    const rows = db.prepare(`
      SELECT date(dws.started_at) AS day, COALESCE(SUM(dws.duration_sec), 0) AS sec
      FROM deep_work_sessions dws JOIN tasks t ON dws.task_id = t.id
      WHERE dws.user_id = ? AND t.space_id = ? AND date(dws.started_at) >= ?
      GROUP BY day
    `).all(req.user.id, req.spaceId, since);

    const byWeek = {};
    for (const r of rows) { const wk = mondayOf(r.day); byWeek[wk] = (byWeek[wk] || 0) + r.sec; }

    const out = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const d = new Date(thisWeekStart + 'T00:00:00');
      d.setDate(d.getDate() - i * 7);
      const wk = d.toISOString().slice(0, 10);
      out.push({ weekStart: wk, minutes: Math.round((byWeek[wk] || 0) / 60) });
    }
    res.json(out);
  } catch (err) { next(err); }
});

// GET /api/deep-work/active
router.get('/active', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT dws.id, dws.task_id, dws.user_id, dws.timer_mode, dws.duration_sec, dws.started_at,
           t.title AS task_title, u.display_name, u.avatar_colour
    FROM deep_work_sessions dws
    JOIN tasks t ON dws.task_id = t.id
    JOIN users u ON dws.user_id = u.id
    WHERE dws.ended_at IS NULL AND t.space_id = ?
    ORDER BY dws.started_at ASC
  `).all(req.spaceId);
  return res.json(rows);
});

module.exports = router;
