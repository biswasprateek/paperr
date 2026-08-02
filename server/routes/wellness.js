const express = require('express');
const router  = express.Router();
const { getDb } = require('../db/db');
const { requireAuth, requireSpace } = require('../auth/middleware');
const logger = require('../utils/logger');

// Wellness sessions (Pomodoro, Meditation, Breathing, ...) are space-scoped —
// every row records the space that was active when it was logged.
router.use(requireAuth, requireSpace);

// Types the current UI knows how to render distinctly (app cards, heatmap
// default, etc). `type` itself has no DB-level CHECK constraint — a future
// practice just needs a new value used consistently by the client, no
// migration — this list is purely for server-side defaults/labels.
const KNOWN_TYPES = new Set(['pomodoro', 'meditation', 'breathing']);

// Local YYYY-MM-DD (matches the localtime created_at column).
function localDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  const tz = d.getTimezoneOffset();
  return new Date(d.getTime() - tz * 60000).toISOString().slice(0, 10);
}

// Monday-first week bucket key for a 'YYYY-MM-DD' string (matches Routines'
// Mon-Sun day order elsewhere in the app).
function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const dow = (d.getDay() + 6) % 7; // 0 = Mon .. 6 = Sun
  d.setDate(d.getDate() - dow);
  return d.toISOString().slice(0, 10);
}

// `days` query params accept a plain number or the literal 'all' for
// unbounded history — used by breakdown/heatmap/sessions list.
function sinceFromParam(param, { fallback = 30, max = 365 } = {}) {
  if (param === 'all') return '0001-01-01';
  const n = Math.min(max, Math.max(1, parseInt(param) || fallback));
  return localDate(n - 1);
}

function moodValue(v) {
  const n = Math.round(Number(v));
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

// ── Log a completed (or partial/manual) session, with an optional linked
// before/after mood rating — all in one transaction so a session never ends
// up without its ratings due to a partial failure. ──────────────────────────
router.post('/sessions', (req, res, next) => {
  try {
    const { type, duration_sec, label = null, completed = 1, source = 'live', mood_before, mood_after } = req.body;
    const cleanType = String(type || '').trim().toLowerCase().slice(0, 40);
    if (!cleanType) return res.status(400).json({ error: 'type is required' });
    const dur = Math.max(0, Math.round(Number(duration_sec) || 0));
    if (dur < 1) return res.status(400).json({ error: 'duration_sec required' });
    const src = source === 'manual' ? 'manual' : 'live';

    const before = moodValue(mood_before);
    const after = moodValue(mood_after);

    const db = getDb();
    const result = db.transaction(() => {
      const session = db.prepare(`
        INSERT INTO wellness_sessions (user_id, space_id, type, label, duration_sec, completed, source)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(req.user.id, req.spaceId, cleanType, label, dur, completed ? 1 : 0, src);
      const sessionId = session.lastInsertRowid;

      const insertMood = db.prepare(`
        INSERT INTO mood_logs (user_id, space_id, mood, session_id, context) VALUES (?, ?, ?, ?, ?)
      `);
      if (before != null) insertMood.run(req.user.id, req.spaceId, before, sessionId, 'before');
      if (after != null) insertMood.run(req.user.id, req.spaceId, after, sessionId, 'after');

      return sessionId;
    })();

    res.status(201).json({ id: result });
  } catch (err) { next(err); }
});

// ── Raw entry list for the Analytics page's Log tab — one row per session,
// with its before/after mood folded in if present. ──────────────────────────
router.get('/sessions', (req, res, next) => {
  try {
    const db = getDb();
    const since = sinceFromParam(req.query.days, { fallback: 30, max: 3650 });
    const type = req.query.type && String(req.query.type).trim().toLowerCase();
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 200));

    const rows = db.prepare(`
      SELECT ws.id, ws.type, ws.label, ws.duration_sec, ws.completed, ws.source, ws.created_at,
             b.mood AS mood_before, a.mood AS mood_after
      FROM wellness_sessions ws
      LEFT JOIN mood_logs b ON b.session_id = ws.id AND b.context = 'before'
      LEFT JOIN mood_logs a ON a.session_id = ws.id AND a.context = 'after'
      WHERE ws.user_id = ? AND ws.space_id = ? AND date(ws.created_at) >= ?
        ${type ? 'AND ws.type = ?' : ''}
      ORDER BY ws.created_at DESC
      LIMIT ?
    `).all(...(type ? [req.user.id, req.spaceId, since, type, limit] : [req.user.id, req.spaceId, since, limit]));

    res.json(rows);
  } catch (err) { next(err); }
});

function sessionForUser(db, id, req) {
  return db.prepare('SELECT * FROM wellness_sessions WHERE id = ? AND user_id = ? AND space_id = ?')
    .get(id, req.user.id, req.spaceId);
}

// ── Edit a session (Log tab) — duration, type, label, completed, and/or its
// linked mood ratings (upserted). ────────────────────────────────────────────
router.patch('/sessions/:id', (req, res, next) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    if (!sessionForUser(db, id, req)) return res.status(404).json({ error: 'Session not found' });

    const allowed = ['type', 'label', 'duration_sec', 'completed'];
    const fields = Object.keys(req.body).filter(k => allowed.includes(k));
    if (fields.length) {
      const sets = fields.map(f => `${f} = ?`).join(', ');
      const values = fields.map(f => {
        if (f === 'type') return String(req.body.type || '').trim().toLowerCase().slice(0, 40);
        if (f === 'duration_sec') return Math.max(0, Math.round(Number(req.body.duration_sec) || 0));
        if (f === 'completed') return req.body.completed ? 1 : 0;
        return req.body[f];
      });
      db.prepare(`UPDATE wellness_sessions SET ${sets} WHERE id = ?`).run(...values, id);
    }

    if ('mood_before' in req.body || 'mood_after' in req.body) {
      const upsert = (context, raw) => {
        const v = moodValue(raw);
        const existing = db.prepare('SELECT id FROM mood_logs WHERE session_id = ? AND context = ?').get(id, context);
        if (v == null) {
          if (existing) db.prepare('DELETE FROM mood_logs WHERE id = ?').run(existing.id);
        } else if (existing) {
          db.prepare('UPDATE mood_logs SET mood = ? WHERE id = ?').run(v, existing.id);
        } else {
          db.prepare('INSERT INTO mood_logs (user_id, space_id, mood, session_id, context) VALUES (?, ?, ?, ?, ?)')
            .run(req.user.id, req.spaceId, v, id, context);
        }
      };
      if ('mood_before' in req.body) upsert('before', req.body.mood_before);
      if ('mood_after' in req.body) upsert('after', req.body.mood_after);
    }

    const updated = db.prepare(`
      SELECT ws.*, b.mood AS mood_before, a.mood AS mood_after
      FROM wellness_sessions ws
      LEFT JOIN mood_logs b ON b.session_id = ws.id AND b.context = 'before'
      LEFT JOIN mood_logs a ON a.session_id = ws.id AND a.context = 'after'
      WHERE ws.id = ?
    `).get(id);
    res.json(updated);
  } catch (err) { next(err); }
});

router.delete('/sessions/:id', (req, res, next) => {
  try {
    const db = getDb();
    const id = parseInt(req.params.id);
    if (!sessionForUser(db, id, req)) return res.status(404).json({ error: 'Session not found' });
    db.prepare('DELETE FROM wellness_sessions WHERE id = ?').run(id); // cascades linked mood_logs
    res.json({ ok: true });
  } catch (err) { next(err); }
});

function daysStreak(daySet) {
  const dayMs = 86400000;
  const today = localDate(0);
  let current = 0;
  let cursor = new Date(today + 'T00:00:00');
  if (!daySet.has(today)) cursor = new Date(cursor.getTime() - dayMs); // grace: streak intact until end of today
  while (daySet.has(cursor.toISOString().slice(0, 10))) { current++; cursor = new Date(cursor.getTime() - dayMs); }

  const sorted = [...daySet].sort();
  let longest = 0, run = 0, prev = null;
  for (const d of sorted) {
    if (prev && (new Date(d) - new Date(prev)) === dayMs) run++; else run = 1;
    if (run > longest) longest = run;
    prev = d;
  }
  return { current, longest };
}

// ── Per-app breakdown: Pomodoro, Meditation, Breathing kept separate ────────
// (never summed into one "Focus Time" figure — see Analytics spec §03).
function typeBlock(db, req, type, sinceDate) {
  const uid = req.user.id, sid = req.spaceId;
  const totals = db.prepare(`
    SELECT COUNT(*) AS sessions,
           COALESCE(SUM(duration_sec), 0) AS totalSec,
           COALESCE(SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END), 0) AS completedN
    FROM wellness_sessions
    WHERE user_id = ? AND space_id = ? AND type = ? AND date(created_at) >= ?
  `).get(uid, sid, type, sinceDate);

  const days = new Set(
    db.prepare(`SELECT DISTINCT date(created_at) AS day FROM wellness_sessions WHERE user_id = ? AND space_id = ? AND type = ?`)
      .all(uid, sid, type).map(r => r.day)
  );
  const { current, longest } = daysStreak(days);

  const block = {
    sessions: totals.sessions,
    totalMinutes: Math.round(totals.totalSec / 60),
    avgSessionMinutes: totals.sessions ? Math.round(totals.totalSec / totals.sessions / 60) : 0,
    completionRate: totals.sessions ? Math.round((totals.completedN / totals.sessions) * 100) : null,
    currentStreak: current,
    longestStreak: longest,
  };
  if (type !== 'pomodoro') {
    const delta = db.prepare(`
      SELECT AVG(a.mood - b.mood) AS avgDelta
      FROM wellness_sessions ws
      JOIN mood_logs b ON b.session_id = ws.id AND b.context = 'before'
      JOIN mood_logs a ON a.session_id = ws.id AND a.context = 'after'
      WHERE ws.user_id = ? AND ws.space_id = ? AND ws.type = ? AND date(ws.created_at) >= ?
    `).get(uid, sid, type, sinceDate);
    block.avgMoodDelta = delta.avgDelta != null ? Math.round(delta.avgDelta * 10) / 10 : null;
  }
  if (type === 'breathing') {
    const top = db.prepare(`
      SELECT label, COUNT(*) AS n FROM wellness_sessions
      WHERE user_id = ? AND space_id = ? AND type = 'breathing' AND label IS NOT NULL AND date(created_at) >= ?
      GROUP BY label ORDER BY n DESC LIMIT 1
    `).get(uid, sid, sinceDate);
    block.topPattern = top?.label || null;
  }
  return block;
}

router.get('/breakdown', (req, res, next) => {
  try {
    const db = getDb();
    const since = sinceFromParam(req.query.days, { fallback: 30, max: 3650 });
    res.json({
      pomodoro: typeBlock(db, req, 'pomodoro', since),
      meditation: typeBlock(db, req, 'meditation', since),
      breathing: typeBlock(db, req, 'breathing', since),
    });
  } catch (err) { next(err); }
});

// ── Pomodoro heat map: one row per day, GitHub-contributions style ──────────
router.get('/heatmap', (req, res, next) => {
  try {
    const db = getDb();
    const uid = req.user.id, sid = req.spaceId;
    const type = KNOWN_TYPES.has(req.query.type) ? req.query.type : 'pomodoro';
    const days = Math.min(Math.max(parseInt(req.query.days) || 365, 1), 366);
    const since = localDate(days - 1);

    const rows = db.prepare(`
      SELECT date(created_at) AS day, COUNT(*) AS count, COALESCE(SUM(duration_sec), 0) AS sec
      FROM wellness_sessions
      WHERE user_id = ? AND space_id = ? AND type = ? AND completed = 1 AND date(created_at) >= ?
      GROUP BY day
    `).all(uid, sid, type, since);
    const byDay = Object.fromEntries(rows.map(r => [r.day, { count: r.count, minutes: Math.round(r.sec / 60) }]));

    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = localDate(i);
      const hit = byDay[day];
      out.push({ date: day, count: hit ? hit.count : 0, minutes: hit ? hit.minutes : 0 });
    }
    res.json(out);
  } catch (err) { next(err); }
});

// ── Weekly trend (Mood's own version lives in mood.js, Deep Work's in deepWork.js) ──
router.get('/trend', (req, res, next) => {
  try {
    const db = getDb();
    const uid = req.user.id, sid = req.spaceId;
    const type = KNOWN_TYPES.has(req.query.type) ? req.query.type : 'meditation';
    const weeks = Math.min(Math.max(parseInt(req.query.weeks) || 12, 1), 52);
    const thisWeekStart = mondayOf(localDate(0));
    const earliest = new Date(thisWeekStart + 'T00:00:00');
    earliest.setDate(earliest.getDate() - (weeks - 1) * 7);
    const since = earliest.toISOString().slice(0, 10);

    const rows = db.prepare(`
      SELECT date(created_at) AS day, COALESCE(SUM(duration_sec), 0) AS sec
      FROM wellness_sessions WHERE user_id = ? AND space_id = ? AND type = ? AND date(created_at) >= ?
      GROUP BY day
    `).all(uid, sid, type, since);

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

// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  logger.error(`wellness route error: ${req.method} ${req.path}`, { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

module.exports = router;
