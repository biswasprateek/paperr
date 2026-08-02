const express = require('express');
const router  = express.Router();
const { getDb } = require('../db/db');
const { requireAuth, requireSpace } = require('../auth/middleware');
const logger = require('../utils/logger');

router.use(requireAuth, requireSpace);

// Local YYYY-MM-DD (avoid UTC drift from toISOString)
function todayStr() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

function emit(req, event, payload) {
  req.app.get('io')?.to(`space:${req.spaceId}`).emit(event, payload);
}

// ── Protocols (with nested habits + per-habit completion for ?date) ───────────────

router.get('/protocols', (req, res, next) => {
  try {
    const db   = getDb();
    const date = req.query.date || todayStr();

    const protocols = db.prepare(`
      SELECT p.*
      FROM routines_protocols p
      WHERE p.space_id = ? AND (p.created_by = ? OR p.visibility = 'shared')
      ORDER BY p.sort_order ASC, p.id ASC
    `).all(req.spaceId, req.user.id);

    const habitStmt = db.prepare(`
      SELECT h.*, c.completed_at AS completed_at, c.id AS completion_id
      FROM routines_habits h
      LEFT JOIN routines_completions c
        ON c.habit_id = h.id AND c.user_id = ? AND c.completed_date = ?
      WHERE h.protocol_id = ? AND h.is_active = 1
      ORDER BY h.sort_order ASC, h.id ASC
    `);

    for (const p of protocols) {
      const habits = habitStmt.all(req.user.id, date, p.id);
      p.habits = habits.map(h => ({ ...h, completed: !!h.completion_id }));
    }

    res.json(protocols);
  } catch (err) { next(err); }
});

// Space-wide daily view: every member's own habits (personal or shared
// protocols alike — visibility only gates whether other members could
// subscribe to a protocol, not whether it's visible on the family board) for
// ?date, one column per member. Powers the Hub's "Space Routines" widget —
// the one place routines are shown for the whole family/team at once.
router.get('/space', (req, res, next) => {
  try {
    const db   = getDb();
    const date = req.query.date || todayStr();

    const members = db.prepare(`
      SELECT u.id, u.display_name, u.nickname, u.avatar_colour, u.avatar_url
      FROM space_members sm
      JOIN users u ON u.id = sm.user_id
      WHERE sm.space_id = ?
      ORDER BY sm.joined_at ASC
    `).all(req.spaceId);

    const protocolStmt = db.prepare(`
      SELECT * FROM routines_protocols WHERE space_id = ? AND created_by = ?
      ORDER BY sort_order ASC, id ASC
    `);
    const habitStmt = db.prepare(`
      SELECT h.*, c.id AS completion_id
      FROM routines_habits h
      LEFT JOIN routines_completions c
        ON c.habit_id = h.id AND c.user_id = ? AND c.completed_date = ?
      WHERE h.protocol_id = ? AND h.is_active = 1
      ORDER BY h.sort_order ASC, h.id ASC
    `);

    for (const m of members) {
      const protocols = protocolStmt.all(req.spaceId, m.id);
      const habits = [];
      for (const p of protocols) {
        for (const h of habitStmt.all(m.id, date, p.id)) {
          habits.push({ ...h, completed: !!h.completion_id, protocol_color: p.color, protocol_name: p.name });
        }
      }
      m.habits = habits;
    }

    res.json({ date, members });
  } catch (err) { next(err); }
});

// Habits across a date range, one list per date, filtered by each habit's
// recur_days for that date's weekday. Used by the Calendar's Week view so a
// week of habits can be fetched in one call instead of one per day.
router.get('/habits/range', (req, res, next) => {
  try {
    const db = getDb();
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to are required' });

    const habits = db.prepare(`
      SELECT h.*, p.color AS protocol_color, p.name AS protocol_name
      FROM routines_habits h
      JOIN routines_protocols p ON h.protocol_id = p.id
      WHERE p.space_id = ? AND (p.created_by = ? OR p.visibility = 'shared') AND h.is_active = 1
      ORDER BY p.sort_order ASC, h.sort_order ASC
    `).all(req.spaceId, req.user.id);

    const compStmt = db.prepare(`
      SELECT completed_date FROM routines_completions
      WHERE habit_id = ? AND user_id = ? AND completed_date >= ? AND completed_date <= ?
    `);
    const completedByHabit = {};
    for (const h of habits) {
      completedByHabit[h.id] = new Set(compStmt.all(h.id, req.user.id, from, to).map(r => r.completed_date));
    }

    const dayMs = 86400000;
    const start = new Date(from + 'T00:00:00');
    const end   = new Date(to + 'T00:00:00');
    const byDate = {};
    for (let t = start.getTime(); t <= end.getTime(); t += dayMs) {
      const dateStr = new Date(t).toISOString().slice(0, 10);
      const dow = (new Date(t).getDay() + 6) % 7; // 0 = Mon .. 6 = Sun, matching recur_days bit order
      byDate[dateStr] = habits
        .filter(h => (h.recur_days || '1111111')[dow] === '1')
        .map(h => ({
          id: h.id, title: h.title, icon: h.icon, time_slot: h.time_slot,
          target_time: h.target_time, protocol_color: h.protocol_color,
          completed: completedByHabit[h.id].has(dateStr),
        }));
    }

    res.json(byDate);
  } catch (err) { next(err); }
});

router.post('/protocols', (req, res, next) => {
  try {
    const { name, color = '#6366f1', icon = 'star', description = '', visibility = 'personal' } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

    const db = getDb();
    const result = db.prepare(`
      INSERT INTO routines_protocols (space_id, created_by, name, color, icon, description, visibility)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(req.spaceId, req.user.id, name.trim(), color, icon, description,
           visibility === 'shared' ? 'shared' : 'personal');

    const protocol = db.prepare('SELECT * FROM routines_protocols WHERE id = ?').get(result.lastInsertRowid);
    protocol.habits = [];

    emit(req, 'routine:protocol_created', protocol);
    res.status(201).json(protocol);
  } catch (err) { next(err); }
});

router.patch('/protocols/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const db = getDb();
    const p  = db.prepare('SELECT * FROM routines_protocols WHERE id = ? AND space_id = ?').get(id, req.spaceId);
    if (!p) return res.status(404).json({ error: 'Protocol not found' });
    if (p.is_system) return res.status(400).json({ error: 'Cannot edit the default Uncategorized protocol' });

    const allowed = ['name', 'color', 'icon', 'description', 'visibility', 'sort_order'];
    const fields  = Object.keys(req.body).filter(k => allowed.includes(k));
    if (fields.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

    const sets   = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => req.body[f]);
    db.prepare(`UPDATE routines_protocols SET ${sets} WHERE id = ?`).run(...values, id);

    const updated = db.prepare('SELECT * FROM routines_protocols WHERE id = ?').get(id);
    emit(req, 'routine:protocol_updated', updated);
    res.json(updated);
  } catch (err) { next(err); }
});

router.delete('/protocols/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const db = getDb();
    const p  = db.prepare('SELECT * FROM routines_protocols WHERE id = ? AND space_id = ?').get(id, req.spaceId);
    if (!p) return res.status(404).json({ error: 'Protocol not found' });
    if (p.is_system) return res.status(400).json({ error: 'Cannot delete the default Uncategorized protocol' });

    db.prepare('DELETE FROM routines_protocols WHERE id = ?').run(id);
    emit(req, 'routine:protocol_deleted', { id });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Habits ───────────────────────────────────────────────────────────────────────

// Verify a protocol is in the user's space (and visible to them)
function getProtocolForUser(db, protocolId, req) {
  return db.prepare(`
    SELECT * FROM routines_protocols
    WHERE id = ? AND space_id = ? AND (created_by = ? OR visibility = 'shared')
  `).get(protocolId, req.spaceId, req.user.id);
}

// Lazily create (or fetch) the hidden per-user "Uncategorized" protocol that
// holds habits the user didn't file under a real protocol.
function getOrCreateUncategorized(db, req) {
  const existing = db.prepare(`
    SELECT * FROM routines_protocols WHERE space_id = ? AND created_by = ? AND is_system = 1
  `).get(req.spaceId, req.user.id);
  if (existing) return existing;

  const result = db.prepare(`
    INSERT INTO routines_protocols (space_id, created_by, name, color, icon, description, visibility, is_system)
    VALUES (?, ?, 'Uncategorized', '#94a3b8', '🗂️', NULL, 'personal', 1)
  `).run(req.spaceId, req.user.id);

  return db.prepare('SELECT * FROM routines_protocols WHERE id = ?').get(result.lastInsertRowid);
}

router.post('/habits', (req, res, next) => {
  try {
    const {
      protocol_id, title, icon = null, science_note = null, time_slot = 'morning',
      target_time = null, duration_minutes = null, recur_days = '1111111',
    } = req.body;

    if (!title?.trim()) return res.status(400).json({ error: 'title is required' });

    const db = getDb();
    let resolvedProtocolId;
    if (protocol_id) {
      const protocol = getProtocolForUser(db, parseInt(protocol_id), req);
      if (!protocol) return res.status(404).json({ error: 'Protocol not found' });
      resolvedProtocolId = protocol.id;
    } else {
      resolvedProtocolId = getOrCreateUncategorized(db, req).id;
    }

    const result = db.prepare(`
      INSERT INTO routines_habits
        (protocol_id, title, icon, science_note, time_slot, target_time, duration_minutes, recur_days, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(resolvedProtocolId, title.trim(), icon || null, science_note, time_slot, target_time,
           duration_minutes ? parseInt(duration_minutes) : null, recur_days, req.user.id);

    const habit = db.prepare('SELECT * FROM routines_habits WHERE id = ?').get(result.lastInsertRowid);
    habit.completed = false;

    emit(req, 'routine:habit_created', habit);
    res.status(201).json(habit);
  } catch (err) { next(err); }
});

// Load a habit, ensuring its protocol belongs to the user's space
function getHabitForUser(db, habitId, req) {
  return db.prepare(`
    SELECT h.* FROM routines_habits h
    JOIN routines_protocols p ON h.protocol_id = p.id
    WHERE h.id = ? AND p.space_id = ? AND (p.created_by = ? OR p.visibility = 'shared')
  `).get(habitId, req.spaceId, req.user.id);
}

router.patch('/habits/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const db = getDb();
    if (!getHabitForUser(db, id, req)) return res.status(404).json({ error: 'Habit not found' });

    const allowed = ['title', 'icon', 'science_note', 'time_slot', 'target_time',
                     'duration_minutes', 'recur_days', 'sort_order', 'is_active', 'protocol_id'];
    const fields  = Object.keys(req.body).filter(k => allowed.includes(k));
    if (fields.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

    // A cleared protocol_id ('' / null) means "no protocol" — file it under Uncategorized.
    const sets   = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f =>
      f === 'protocol_id' && !req.body.protocol_id ? getOrCreateUncategorized(db, req).id : req.body[f]
    );
    db.prepare(`UPDATE routines_habits SET ${sets} WHERE id = ?`).run(...values, id);

    const updated = db.prepare('SELECT * FROM routines_habits WHERE id = ?').get(id);
    emit(req, 'routine:habit_updated', updated);
    res.json(updated);
  } catch (err) { next(err); }
});

router.delete('/habits/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const db = getDb();
    if (!getHabitForUser(db, id, req)) return res.status(404).json({ error: 'Habit not found' });

    db.prepare('DELETE FROM routines_habits WHERE id = ?').run(id);
    emit(req, 'routine:habit_deleted', { id });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Completions (always personal) ────────────────────────────────────────────────

router.post('/habits/:id/complete', (req, res, next) => {
  try {
    const id   = parseInt(req.params.id);
    const date = req.body.date || todayStr();
    const db   = getDb();
    if (!getHabitForUser(db, id, req)) return res.status(404).json({ error: 'Habit not found' });

    db.prepare(`
      INSERT OR IGNORE INTO routines_completions (habit_id, user_id, completed_date)
      VALUES (?, ?, ?)
    `).run(id, req.user.id, date);

    emit(req, 'routine:completed', { userId: req.user.id, habitId: id, date });
    res.json({ ok: true, completed: true });
  } catch (err) { next(err); }
});

router.delete('/habits/:id/complete', (req, res, next) => {
  try {
    const id   = parseInt(req.params.id);
    const date = req.query.date || req.body?.date || todayStr();
    const db   = getDb();
    if (!getHabitForUser(db, id, req)) return res.status(404).json({ error: 'Habit not found' });

    db.prepare(`
      DELETE FROM routines_completions WHERE habit_id = ? AND user_id = ? AND completed_date = ?
    `).run(id, req.user.id, date);

    emit(req, 'routine:completed', { userId: req.user.id, habitId: id, date });
    res.json({ ok: true, completed: false });
  } catch (err) { next(err); }
});

// ── Progress (per-habit streaks + completion rate over last N days) ───────────────

router.get('/progress', (req, res, next) => {
  try {
    const db   = getDb();
    const days = Math.min(parseInt(req.query.days) || 30, 365);
    const today = todayStr();

    // All habits visible to the user in this space
    const habits = db.prepare(`
      SELECT h.id, h.title, h.icon, h.protocol_id, p.name AS protocol_name, p.color AS protocol_color
      FROM routines_habits h
      JOIN routines_protocols p ON h.protocol_id = p.id
      WHERE p.space_id = ? AND (p.created_by = ? OR p.visibility = 'shared') AND h.is_active = 1
      ORDER BY p.sort_order ASC, h.sort_order ASC
    `).all(req.spaceId, req.user.id);

    const compStmt = db.prepare(`
      SELECT completed_date FROM routines_completions
      WHERE habit_id = ? AND user_id = ?
      ORDER BY completed_date DESC
    `);

    const dayMs = 86400000;
    const result = habits.map(h => {
      const rows = compStmt.all(h.id, req.user.id);
      const doneSet = new Set(rows.map(r => r.completed_date));

      // Current streak: count back from today (today optional, then consecutive)
      let current = 0;
      let cursor = new Date(today + 'T00:00:00');
      if (!doneSet.has(today)) cursor = new Date(cursor.getTime() - dayMs); // grace: streak intact until end of today
      while (doneSet.has(cursor.toISOString().slice(0, 10))) {
        current++;
        cursor = new Date(cursor.getTime() - dayMs);
      }

      // Longest streak across all completions
      const sorted = [...doneSet].sort();
      let longest = 0, run = 0, prev = null;
      for (const d of sorted) {
        if (prev && (new Date(d) - new Date(prev)) === dayMs) run++;
        else run = 1;
        if (run > longest) longest = run;
        prev = d;
      }

      // Completion rate + last-7-days sparkline
      const windowStart = new Date(new Date(today + 'T00:00:00').getTime() - (days - 1) * dayMs)
        .toISOString().slice(0, 10);
      const inWindow = [...doneSet].filter(d => d >= windowStart && d <= today).length;
      const rate = Math.round((inWindow / days) * 100);

      const last7 = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(new Date(today + 'T00:00:00').getTime() - i * dayMs).toISOString().slice(0, 10);
        last7.push(doneSet.has(d));
      }

      return {
        habit_id: h.id, title: h.title, icon: h.icon,
        protocol_id: h.protocol_id, protocol_name: h.protocol_name, protocol_color: h.protocol_color,
        current_streak: current, longest_streak: longest, completion_rate: rate, last7,
      };
    });

    res.json(result);
  } catch (err) { next(err); }
});

// ── Error handler ──────────────────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  logger.error(`routines route error: ${req.method} ${req.path}`, { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

module.exports = router;
