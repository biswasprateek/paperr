const express = require('express');
const router  = express.Router();
const { getDb } = require('../db/db');
const { requireAuth, requireSpace } = require('../auth/middleware');
const logger = require('../utils/logger');

// Mood is space-scoped like wellness_sessions, but never appears in any
// Family/Team view — that's a standing privacy policy (see Analytics spec §07),
// not a schema limit.
router.use(requireAuth, requireSpace);

const MOOD_LABELS = { 1: 'Very Low', 2: 'Low', 3: 'Okay', 4: 'Good', 5: 'Great' };

// Local YYYY-MM-DD (matches the localtime created_at column, same helper as wellness.js).
function localDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  const tz = d.getTimezoneOffset();
  return new Date(d.getTime() - tz * 60000).toISOString().slice(0, 10);
}

// Monday-first week bucket key (matches wellness.js / Routines' Mon-Sun order).
function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d.toISOString().slice(0, 10);
}

function sinceFromParam(param, { fallback = 7, max = 365 } = {}) {
  if (param === 'all') return '0001-01-01';
  const n = Math.min(max, Math.max(1, parseInt(param) || fallback));
  return localDate(n - 1);
}

function moodValue(v) {
  const n = Math.round(Number(v));
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

// ── Log a standalone mood check-in (session-linked before/after ratings are
// created inline by wellness.js's POST /sessions instead). ──────────────────
router.post('/logs', (req, res, next) => {
  try {
    const mood = moodValue(req.body.mood);
    if (mood == null) return res.status(400).json({ error: 'mood must be an integer 1-5' });

    const db = getDb();
    const result = db.prepare(`
      INSERT INTO mood_logs (user_id, space_id, mood) VALUES (?, ?, ?)
    `).run(req.user.id, req.spaceId, mood);

    const row = db.prepare('SELECT id, mood, created_at FROM mood_logs WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (err) { next(err); }
});

// ── Stats: today's latest entry, N-day average, and a zero-filled daily
// series — standalone check-ins only (session_id IS NULL), so a Meditation or
// Breathing session's before/after rating never counts toward "how am I
// generally feeling," and vice versa. ───────────────────────────────────────
router.get('/stats', (req, res, next) => {
  try {
    const db   = getDb();
    const uid  = req.user.id, sid = req.spaceId;
    const days = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 365);
    const today = localDate(0);
    const since = localDate(days - 1);

    const todayRow = db.prepare(`
      SELECT mood FROM mood_logs
      WHERE user_id = ? AND space_id = ? AND session_id IS NULL AND date(created_at) = ?
      ORDER BY created_at DESC LIMIT 1
    `).get(uid, sid, today);

    const rows = db.prepare(`
      SELECT date(created_at) AS day, AVG(mood) AS avg, COUNT(*) AS n
      FROM mood_logs
      WHERE user_id = ? AND space_id = ? AND session_id IS NULL AND date(created_at) >= ?
      GROUP BY day
    `).all(uid, sid, since);
    const byDay = Object.fromEntries(rows.map(r => [r.day, { avg: r.avg, n: r.n }]));

    const daily = [];
    let sum = 0, entries = 0;
    for (let i = days - 1; i >= 0; i--) {
      const day = localDate(i);
      const hit = byDay[day];
      daily.push({ date: day, avg: hit ? Math.round(hit.avg * 10) / 10 : null, count: hit ? hit.n : 0 });
      if (hit) { sum += hit.avg * hit.n; entries += hit.n; }
    }

    res.json({
      today: todayRow ? { mood: todayRow.mood, label: MOOD_LABELS[todayRow.mood] } : null,
      avg: entries > 0 ? Math.round((sum / entries) * 10) / 10 : null,
      entries,
      daily,
    });
  } catch (err) { next(err); }
});

// ── Weekly trend — averaged per week, gaps left as null (not interpolated),
// standalone check-ins only (same reasoning as /stats above). ───────────────
router.get('/trend', (req, res, next) => {
  try {
    const db = getDb();
    const uid = req.user.id, sid = req.spaceId;
    const weeks = Math.min(Math.max(parseInt(req.query.weeks) || 12, 1), 52);
    const thisWeekStart = mondayOf(localDate(0));
    const earliest = new Date(thisWeekStart + 'T00:00:00');
    earliest.setDate(earliest.getDate() - (weeks - 1) * 7);
    const since = earliest.toISOString().slice(0, 10);

    const rows = db.prepare(`
      SELECT date(created_at) AS day, AVG(mood) AS avg, COUNT(*) AS n
      FROM mood_logs WHERE user_id = ? AND space_id = ? AND session_id IS NULL AND date(created_at) >= ?
      GROUP BY day
    `).all(uid, sid, since);

    const byWeek = {};
    for (const r of rows) {
      const wk = mondayOf(r.day);
      if (!byWeek[wk]) byWeek[wk] = { sum: 0, n: 0 };
      byWeek[wk].sum += r.avg * r.n;
      byWeek[wk].n += r.n;
    }

    const out = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const d = new Date(thisWeekStart + 'T00:00:00');
      d.setDate(d.getDate() - i * 7);
      const wk = d.toISOString().slice(0, 10);
      const hit = byWeek[wk];
      out.push({ weekStart: wk, avg: hit ? Math.round((hit.sum / hit.n) * 10) / 10 : null, count: hit ? hit.n : 0 });
    }
    res.json(out);
  } catch (err) { next(err); }
});

// ── Raw entry list for the Analytics page's Log tab — standalone check-ins
// only; session-linked ratings show up attached to their session there
// instead (from GET /wellness/sessions). ─────────────────────────────────────
router.get('/logs', (req, res, next) => {
  try {
    const db = getDb();
    const since = sinceFromParam(req.query.days, { fallback: 30, max: 3650 });
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 200));
    const rows = db.prepare(`
      SELECT id, mood, created_at FROM mood_logs
      WHERE user_id = ? AND space_id = ? AND session_id IS NULL AND date(created_at) >= ?
      ORDER BY created_at DESC LIMIT ?
    `).all(req.user.id, req.spaceId, since, limit);
    res.json(rows);
  } catch (err) { next(err); }
});

router.patch('/logs/:id', (req, res, next) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    const mood = moodValue(req.body.mood);
    if (mood == null) return res.status(400).json({ error: 'mood must be an integer 1-5' });

    const result = db.prepare('UPDATE mood_logs SET mood = ? WHERE id = ? AND user_id = ? AND space_id = ?')
      .run(mood, id, req.user.id, req.spaceId);
    if (result.changes === 0) return res.status(404).json({ error: 'Entry not found' });

    res.json(db.prepare('SELECT id, mood, created_at FROM mood_logs WHERE id = ?').get(id));
  } catch (err) { next(err); }
});

router.delete('/logs/:id', (req, res, next) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    const result = db.prepare('DELETE FROM mood_logs WHERE id = ? AND user_id = ? AND space_id = ? AND session_id IS NULL')
      .run(id, req.user.id, req.spaceId);
    if (result.changes === 0) return res.status(404).json({ error: 'Entry not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  logger.error(`mood route error: ${req.method} ${req.path}`, { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

module.exports = router;
