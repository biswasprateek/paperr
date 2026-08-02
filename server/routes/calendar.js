const express = require('express');
const router = express.Router();
const { requireAuth, requireSpace } = require('../auth/middleware');
const { getDb } = require('../db/db');

// ─── GET /api/calendar ────────────────────────────────────────────────────────
router.get('/', requireAuth, requireSpace, (req, res) => {
  const { from, to, shared } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required' });

  const db = getDb();
  const isShared = shared === '1' || shared === 'true';
  const userId = req.user.id;

  // ── Tasks ─────────────────────────────────────────────────────────────────
  // A task shows on the calendar for its deadline (date-only due_date) and/or its
  // scheduled time block (start_at/end_at), which may fall on a different day.
  let taskSql = `
    SELECT
      t.id, t.title, t.due_date, t.start_at, t.end_at, t.priority, t.status,
      t.is_completed, t.parent_task_id, t.project_id,
      p.name AS project_name, p.cover_colour AS project_colour,
      t.assigned_to, u.display_name AS assignee_name, u.avatar_colour AS assignee_colour,
      GROUP_CONCAT(tt.tag) AS tags
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN users u ON u.id = t.assigned_to
    LEFT JOIN task_tags tt ON tt.task_id = t.id
    WHERE t.archived = 0 AND t.space_id = ?
      AND (
        (t.due_date IS NOT NULL AND t.due_date >= ? AND t.due_date <= ?)
        OR (t.start_at IS NOT NULL AND date(t.start_at) >= ? AND date(t.start_at) <= ?)
      )
  `;
  const taskParams = [req.spaceId, from, to, from, to];

  if (!isShared) {
    taskSql += ` AND (t.assigned_to = ? OR t.created_by = ?)`;
    taskParams.push(userId, userId);
  }

  taskSql += ' GROUP BY t.id ORDER BY t.due_date';

  const tasks = db.prepare(taskSql).all(...taskParams).map(t => ({
    ...t,
    is_completed: !!t.is_completed,
    tags: t.tags ? t.tags.split(',') : [],
  }));

  // ── Events ────────────────────────────────────────────────────────────────
  let eventSql = `
    SELECT
      e.id, e.title, e.description, e.start_datetime, e.end_datetime,
      e.all_day, e.location, e.colour, e.project_id, e.created_by,
      p.name AS project_name
    FROM events e
    LEFT JOIN projects p ON p.id = e.project_id
    WHERE e.archived = 0
      AND e.space_id = ?
      AND date(e.start_datetime) <= ?
      AND date(COALESCE(e.end_datetime, e.start_datetime)) >= ?
  `;
  const eventParams = [req.spaceId, to, from];

  if (!isShared) {
    eventSql += ` AND (
      e.created_by = ?
      OR e.id IN (SELECT event_id FROM event_attendees WHERE user_id = ?)
    )`;
    eventParams.push(userId, userId);
  }

  eventSql += ' ORDER BY e.start_datetime';

  const eventRows = db.prepare(eventSql).all(...eventParams);

  const attendeeStmt = db.prepare(`
    SELECT ea.user_id, ea.rsvp, u.display_name AS name, u.avatar_colour
    FROM event_attendees ea
    JOIN users u ON u.id = ea.user_id
    WHERE ea.event_id = ?
  `);

  const events = eventRows.map(e => ({
    ...e,
    all_day: !!e.all_day,
    attendees: attendeeStmt.all(e.id),
  }));

  return res.json({ tasks, events });
});

// "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM[:SS]" — anything else breaks SQLite's
// date() in the range query and the event silently vanishes from every view.
const DT_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/;

// ─── POST /api/calendar/events ────────────────────────────────────────────────
router.post('/events', requireAuth, requireSpace, (req, res) => {
  const {
    title, description, start_datetime, end_datetime, all_day,
    location, colour, project_id, is_recurring, recur_interval, recur_days, recur_end_date, attendee_ids = [],
  } = req.body;

  if (!title || !start_datetime) {
    return res.status(400).json({ error: 'title and start_datetime are required' });
  }
  if (!DT_RE.test(start_datetime) || (end_datetime && !DT_RE.test(end_datetime))) {
    return res.status(400).json({ error: 'Dates must be YYYY-MM-DD or YYYY-MM-DDTHH:MM' });
  }

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO events
      (title, description, start_datetime, end_datetime, all_day, location, colour,
       project_id, created_by, is_recurring, recur_interval, recur_days, recur_end_date, space_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    title, description ?? null, start_datetime, end_datetime ?? null,
    all_day ? 1 : 0, location ?? null, colour ?? null,
    project_id ?? null, req.user.id, is_recurring ? 1 : 0, recur_interval ?? null,
    recur_days ?? null, recur_end_date ?? null, req.spaceId,
  );

  const eventId = result.lastInsertRowid;
  const insertAttendee = db.prepare('INSERT OR IGNORE INTO event_attendees (event_id, user_id) VALUES (?, ?)');
  insertAttendee.run(eventId, req.user.id);
  for (const uid of attendee_ids) {
    if (uid !== req.user.id) insertAttendee.run(eventId, uid);
  }

  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
  req.app.get('io')?.to(`space:${req.spaceId}`).emit('event:created', { event });
  return res.status(201).json(event);
});

// ─── PUT /api/calendar/events/:id ─────────────────────────────────────────────
router.put('/events/:id', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const event = db.prepare('SELECT * FROM events WHERE id = ? AND space_id = ?').get(req.params.id, req.spaceId);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const {
    title, description, start_datetime, end_datetime, all_day,
    location, colour, project_id, is_recurring, recur_interval, recur_days, recur_end_date, attendee_ids,
  } = req.body;

  if ((start_datetime && !DT_RE.test(start_datetime)) || (end_datetime && !DT_RE.test(end_datetime))) {
    return res.status(400).json({ error: 'Dates must be YYYY-MM-DD or YYYY-MM-DDTHH:MM' });
  }

  db.prepare(`
    UPDATE events SET
      title = ?, description = ?, start_datetime = ?, end_datetime = ?,
      all_day = ?, location = ?, colour = ?, project_id = ?,
      is_recurring = ?, recur_interval = ?, recur_days = ?, recur_end_date = ?
    WHERE id = ?
  `).run(
    title ?? event.title,
    description ?? event.description,
    start_datetime ?? event.start_datetime,
    end_datetime ?? event.end_datetime,
    all_day !== undefined ? (all_day ? 1 : 0) : event.all_day,
    location ?? event.location,
    colour ?? event.colour,
    project_id !== undefined ? project_id : event.project_id,
    is_recurring !== undefined ? (is_recurring ? 1 : 0) : event.is_recurring,
    recur_interval ?? event.recur_interval,
    recur_days !== undefined ? (recur_days || null) : event.recur_days,
    recur_end_date !== undefined ? (recur_end_date || null) : event.recur_end_date,
    req.params.id,
  );

  if (attendee_ids !== undefined) {
    db.prepare('DELETE FROM event_attendees WHERE event_id = ?').run(req.params.id);
    const insertAttendee = db.prepare('INSERT OR IGNORE INTO event_attendees (event_id, user_id) VALUES (?, ?)');
    for (const uid of attendee_ids) insertAttendee.run(req.params.id, uid);
  }

  const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  req.app.get('io')?.to(`space:${req.spaceId}`).emit('event:updated', { event: updated });
  return res.json(updated);
});

// ─── DELETE /api/calendar/events/:id ──────────────────────────────────────────
router.delete('/events/:id', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const event = db.prepare('SELECT * FROM events WHERE id = ? AND space_id = ?').get(req.params.id, req.spaceId);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  db.prepare('DELETE FROM event_attendees WHERE event_id = ?').run(req.params.id);
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  req.app.get('io')?.to(`space:${req.spaceId}`).emit('event:deleted', { id: parseInt(req.params.id) });
  return res.json({ ok: true });
});

// ─── PUT /api/calendar/events/:id/rsvp ────────────────────────────────────────
router.put('/events/:id/rsvp', requireAuth, requireSpace, (req, res) => {
  const { rsvp } = req.body;
  if (!['pending', 'accepted', 'declined'].includes(rsvp)) {
    return res.status(400).json({ error: 'rsvp must be pending, accepted, or declined' });
  }
  const db = getDb();
  const event = db.prepare('SELECT id FROM events WHERE id = ? AND space_id = ?').get(req.params.id, req.spaceId);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  db.prepare(`
    INSERT INTO event_attendees (event_id, user_id, rsvp)
    VALUES (?, ?, ?)
    ON CONFLICT(event_id, user_id) DO UPDATE SET rsvp = excluded.rsvp
  `).run(req.params.id, req.user.id, rsvp);
  return res.json({ ok: true, rsvp });
});

module.exports = router;
