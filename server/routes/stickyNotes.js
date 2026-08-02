const express = require('express');
const router = express.Router();
const { getDb } = require('../db/db');
const { requireAuth, requireSpace } = require('../auth/middleware');

// Sticky Pads — short member-to-member messages on the Hub. Content is
// collaborative: any member may post, unlike the admin-only board layout.
// Authors control their own notes; space admins can moderate any note.

function emit(req, payload = {}) {
  req.app.get('io')?.to(`space:${req.spaceId}`).emit('sticky:updated', { spaceId: req.spaceId, ...payload });
}

function getNote(db, id, spaceId) {
  return db.prepare('SELECT * FROM sticky_notes WHERE id = ? AND space_id = ?').get(id, spaceId);
}

// GET /api/sticky-notes — live notes, oldest first (a physical corkboard
// grows outward; new pads land at the end). Expired rows are purged lazily
// here rather than by a timer.
router.get('/', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  db.prepare(
    "DELETE FROM sticky_notes WHERE space_id = ? AND expires_at IS NOT NULL AND expires_at <= datetime('now')"
  ).run(req.spaceId);

  const notes = db.prepare(`
    SELECT sn.*, u.display_name AS author_name, u.avatar_colour AS author_colour, u.avatar_url AS author_avatar_url, u.nickname AS author_nickname
    FROM sticky_notes sn
    JOIN users u ON u.id = sn.author_id
    WHERE sn.space_id = ?
    ORDER BY sn.created_at ASC, sn.id ASC
  `).all(req.spaceId);
  return res.json(notes);
});

// POST /api/sticky-notes — any member. `expiresInMinutes` null/absent = never.
router.post('/', requireAuth, requireSpace, (req, res) => {
  const { text, colour, expiresInMinutes } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text is required' });

  const minutes = parseInt(expiresInMinutes);
  const expiresAt = Number.isInteger(minutes) && minutes > 0
    ? new Date(Date.now() + minutes * 60000).toISOString().replace('T', ' ').slice(0, 19)
    : null;

  const db = getDb();
  const r = db.prepare(
    'INSERT INTO sticky_notes (space_id, author_id, text, colour, expires_at) VALUES (?, ?, ?, ?, ?)'
  ).run(req.spaceId, req.user.id, text.trim(), colour || null, expiresAt);

  emit(req);
  return res.status(201).json(getNote(db, r.lastInsertRowid, req.spaceId));
});

// PUT /api/sticky-notes/:id — author or space admin.
router.put('/:id', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const note = getNote(db, parseInt(req.params.id), req.spaceId);
  if (!note) return res.status(404).json({ error: 'Note not found' });
  if (note.author_id !== req.user.id && req.spaceRole !== 'admin') {
    return res.status(403).json({ error: 'Only the author or a space admin can edit this note' });
  }

  const { text, colour, expiresInMinutes } = req.body;
  if (text !== undefined && !text?.trim()) return res.status(400).json({ error: 'text cannot be empty' });

  let expiresAt = note.expires_at;
  if (expiresInMinutes !== undefined) {
    const minutes = parseInt(expiresInMinutes);
    expiresAt = Number.isInteger(minutes) && minutes > 0
      ? new Date(Date.now() + minutes * 60000).toISOString().replace('T', ' ').slice(0, 19)
      : null;
  }

  db.prepare("UPDATE sticky_notes SET text = ?, colour = ?, expires_at = ?, updated_at = datetime('now') WHERE id = ?")
    .run(text?.trim() ?? note.text, colour ?? note.colour, expiresAt, note.id);

  emit(req);
  return res.json(getNote(db, note.id, req.spaceId));
});

// DELETE /api/sticky-notes/:id — author or space admin.
router.delete('/:id', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const note = getNote(db, parseInt(req.params.id), req.spaceId);
  if (!note) return res.status(404).json({ error: 'Note not found' });
  if (note.author_id !== req.user.id && req.spaceRole !== 'admin') {
    return res.status(403).json({ error: 'Only the author or a space admin can delete this note' });
  }

  db.prepare('DELETE FROM sticky_notes WHERE id = ?').run(note.id);
  emit(req);
  return res.json({ success: true });
});

module.exports = router;
