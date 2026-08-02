const express = require('express');
const router  = express.Router();
const { getDb } = require('../db/db');
const { requireAuth, requireSpace } = require('../auth/middleware');
const { logActivity } = require('../services/taskService');
const logger = require('../utils/logger');

router.use(requireAuth, requireSpace);

// ── Notebooks ──────────────────────────────────────────────────────────────────

router.get('/notebooks', (req, res, next) => {
  try {
    const db = getDb();
    const notebooks = db.prepare(`
      SELECT nb.*,
        (SELECT COUNT(*) FROM kb_notes n WHERE n.notebook_id = nb.id) AS note_count
      FROM kb_notebooks nb
      WHERE nb.space_id = ? AND (nb.created_by = ? OR nb.visibility = 'shared')
      ORDER BY nb.name ASC
    `).all(req.spaceId, req.user.id);
    res.json(notebooks);
  } catch (err) { next(err); }
});

router.post('/notebooks', (req, res, next) => {
  try {
    const { name, icon = 'book_2', colour = '#e76750', description = '', visibility } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

    const db = getDb();
    const result = db.prepare(
      'INSERT INTO kb_notebooks (name, icon, colour, description, created_by, space_id, visibility) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(name.trim(), icon, colour, description, req.user.id, req.spaceId, visibility === 'shared' ? 'shared' : 'personal');

    const notebook = db.prepare('SELECT * FROM kb_notebooks WHERE id = ?').get(result.lastInsertRowid);
    notebook.note_count = 0;

    try {
      logActivity(req.user.id, 'kb_notebook_created', 'kb_notebook', notebook.id, `Created notebook "${notebook.name}"`, req.spaceId);
    } catch (actErr) {
      logger.error('notes: logActivity failed', { error: actErr.message });
    }

    req.app.get('io')?.to(`space:${req.spaceId}`).emit('kb:notebook_created', notebook);
    res.status(201).json(notebook);
  } catch (err) { next(err); }
});

router.put('/notebooks/:nbId', (req, res, next) => {
  try {
    const nbId = parseInt(req.params.nbId);
    const db   = getDb();
    const nb   = db.prepare(`
      SELECT * FROM kb_notebooks WHERE id = ? AND space_id = ? AND (created_by = ? OR visibility = 'shared')
    `).get(nbId, req.spaceId, req.user.id);
    if (!nb) return res.status(404).json({ error: 'Notebook not found' });

    const allowed = ['name', 'icon', 'colour', 'description', 'sort_order', 'visibility'];
    const fields  = Object.keys(req.body).filter(k => allowed.includes(k));
    if (fields.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

    const sets   = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => req.body[f]);
    db.prepare(`UPDATE kb_notebooks SET ${sets}, updated_at = datetime('now') WHERE id = ?`).run(...values, nbId);

    const updated = db.prepare(`
      SELECT nb.*, (SELECT COUNT(*) FROM kb_notes n WHERE n.notebook_id = nb.id) AS note_count
      FROM kb_notebooks nb WHERE nb.id = ?
    `).get(nbId);

    req.app.get('io')?.to(`space:${req.spaceId}`).emit('kb:notebook_updated', updated);
    res.json(updated);
  } catch (err) { next(err); }
});

router.delete('/notebooks/:nbId', (req, res, next) => {
  try {
    const nbId = parseInt(req.params.nbId);
    const db   = getDb();
    const nb   = db.prepare(`
      SELECT * FROM kb_notebooks WHERE id = ? AND space_id = ? AND (created_by = ? OR visibility = 'shared')
    `).get(nbId, req.spaceId, req.user.id);
    if (!nb) return res.status(404).json({ error: 'Notebook not found' });

    db.prepare('DELETE FROM kb_notebooks WHERE id = ?').run(nbId);

    try {
      logActivity(req.user.id, 'kb_notebook_deleted', 'kb_notebook', nbId, `Deleted notebook "${nb.name}"`, req.spaceId);
    } catch (actErr) {
      logger.error('notes: logActivity failed', { error: actErr.message });
    }

    req.app.get('io')?.to(`space:${req.spaceId}`).emit('kb:notebook_deleted', { id: nbId });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Notes ──────────────────────────────────────────────────────────────────────

router.get('/notebooks/:nbId/notes', (req, res, next) => {
  try {
    const nbId = parseInt(req.params.nbId);
    const db   = getDb();
    const nb   = db.prepare(`
      SELECT id FROM kb_notebooks WHERE id = ? AND space_id = ? AND (created_by = ? OR visibility = 'shared')
    `).get(nbId, req.spaceId, req.user.id);
    if (!nb) return res.status(404).json({ error: 'Notebook not found' });

    const notes = db.prepare(`
      SELECT n.id, n.notebook_id, n.title, n.is_pinned, n.word_count,
             n.created_at, n.updated_at, n.updated_by,
             u.display_name AS updated_by_name
      FROM kb_notes n
      LEFT JOIN users u ON n.updated_by = u.id
      WHERE n.notebook_id = ?
      ORDER BY n.is_pinned DESC, n.updated_at DESC
    `).all(nbId);

    res.json(notes);
  } catch (err) { next(err); }
});

router.post('/notebooks/:nbId/notes', (req, res, next) => {
  try {
    const nbId = parseInt(req.params.nbId);
    const db   = getDb();
    const nb   = db.prepare(`
      SELECT id FROM kb_notebooks WHERE id = ? AND space_id = ? AND (created_by = ? OR visibility = 'shared')
    `).get(nbId, req.spaceId, req.user.id);
    if (!nb) return res.status(404).json({ error: 'Notebook not found' });

    const title   = req.body.title?.trim() || 'Untitled';
    const content = req.body.content || '';
    const wc      = content.trim() ? content.trim().split(/\s+/).length : 0;

    const result = db.prepare(
      'INSERT INTO kb_notes (notebook_id, title, content, created_by, updated_by, word_count) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(nbId, title, content, req.user.id, req.user.id, wc);

    const note = db.prepare(`
      SELECT n.*, u.display_name AS updated_by_name
      FROM kb_notes n LEFT JOIN users u ON n.updated_by = u.id
      WHERE n.id = ?
    `).get(result.lastInsertRowid);

    try {
      logActivity(req.user.id, 'kb_note_created', 'kb_note', note.id, `Created note "${title}"`, req.spaceId);
    } catch (actErr) {
      logger.error('notes: logActivity failed', { error: actErr.message });
    }

    req.app.get('io')?.to(`space:${req.spaceId}`).emit('kb:note_created', { notebook_id: nbId, note });
    res.status(201).json(note);
  } catch (err) { next(err); }
});

router.get('/notebooks/:nbId/notes/:noteId', (req, res, next) => {
  try {
    const nbId   = parseInt(req.params.nbId);
    const noteId = parseInt(req.params.noteId);
    const db     = getDb();

    const nb = db.prepare(`
      SELECT id FROM kb_notebooks WHERE id = ? AND space_id = ? AND (created_by = ? OR visibility = 'shared')
    `).get(nbId, req.spaceId, req.user.id);
    if (!nb) return res.status(404).json({ error: 'Notebook not found' });

    const note = db.prepare(`
      SELECT n.*, u.display_name AS updated_by_name
      FROM kb_notes n LEFT JOIN users u ON n.updated_by = u.id
      WHERE n.id = ? AND n.notebook_id = ?
    `).get(noteId, nbId);

    if (!note) return res.status(404).json({ error: 'Note not found' });
    res.json(note);
  } catch (err) { next(err); }
});

router.put('/notebooks/:nbId/notes/:noteId', (req, res, next) => {
  try {
    const nbId   = parseInt(req.params.nbId);
    const noteId = parseInt(req.params.noteId);
    const db     = getDb();

    const nb = db.prepare(`
      SELECT id FROM kb_notebooks WHERE id = ? AND space_id = ? AND (created_by = ? OR visibility = 'shared')
    `).get(nbId, req.spaceId, req.user.id);
    if (!nb) return res.status(404).json({ error: 'Notebook not found' });

    const note = db.prepare('SELECT * FROM kb_notes WHERE id = ? AND notebook_id = ?').get(noteId, nbId);
    if (!note) return res.status(404).json({ error: 'Note not found' });

    const allowed = ['title', 'content', 'is_pinned'];
    const fields  = Object.keys(req.body).filter(k => allowed.includes(k));
    if (fields.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

    const newContent = 'content' in req.body ? req.body.content : note.content;
    const wc = newContent.trim() ? newContent.trim().split(/\s+/).length : 0;

    const sets   = [...fields.map(f => `${f} = ?`), 'word_count = ?', 'updated_by = ?', "updated_at = datetime('now')"].join(', ');
    const values = [...fields.map(f => req.body[f]), wc, req.user.id];

    db.prepare(`UPDATE kb_notes SET ${sets} WHERE id = ?`).run(...values, noteId);

    const updated = db.prepare(`
      SELECT n.*, u.display_name AS updated_by_name
      FROM kb_notes n LEFT JOIN users u ON n.updated_by = u.id
      WHERE n.id = ?
    `).get(noteId);

    req.app.get('io')?.to(`space:${req.spaceId}`).emit('kb:note_updated', { notebook_id: nbId, note: updated });
    res.json(updated);
  } catch (err) { next(err); }
});

router.delete('/notebooks/:nbId/notes/:noteId', (req, res, next) => {
  try {
    const nbId   = parseInt(req.params.nbId);
    const noteId = parseInt(req.params.noteId);
    const db     = getDb();

    const nb = db.prepare(`
      SELECT id FROM kb_notebooks WHERE id = ? AND space_id = ? AND (created_by = ? OR visibility = 'shared')
    `).get(nbId, req.spaceId, req.user.id);
    if (!nb) return res.status(404).json({ error: 'Notebook not found' });

    const note = db.prepare('SELECT * FROM kb_notes WHERE id = ? AND notebook_id = ?').get(noteId, nbId);
    if (!note) return res.status(404).json({ error: 'Note not found' });

    db.prepare('DELETE FROM kb_notes WHERE id = ?').run(noteId);

    try {
      logActivity(req.user.id, 'kb_note_deleted', 'kb_note', noteId, `Deleted note "${note.title}"`, req.spaceId);
    } catch (actErr) {
      logger.error('notes: logActivity failed', { error: actErr.message });
    }

    req.app.get('io')?.to(`space:${req.spaceId}`).emit('kb:note_deleted', { notebook_id: nbId, note_id: noteId });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Export ─────────────────────────────────────────────────────────────────────

router.get('/notebooks/:nbId/export', (req, res, next) => {
  try {
    const nbId = parseInt(req.params.nbId);
    const db   = getDb();
    const nb   = db.prepare(`
      SELECT * FROM kb_notebooks WHERE id = ? AND space_id = ? AND (created_by = ? OR visibility = 'shared')
    `).get(nbId, req.spaceId, req.user.id);
    if (!nb) return res.status(404).json({ error: 'Notebook not found' });

    const notes = db.prepare(`
      SELECT n.id, n.title, n.content, n.is_pinned, n.created_at, n.updated_at,
             u.display_name AS updated_by_name
      FROM kb_notes n
      LEFT JOIN users u ON n.updated_by = u.id
      WHERE n.notebook_id = ?
      ORDER BY n.is_pinned DESC, n.updated_at DESC
    `).all(nbId);

    res.json({ notebook: nb, notes });
  } catch (err) { next(err); }
});

// ── Search ─────────────────────────────────────────────────────────────────────

router.get('/search', (req, res, next) => {
  try {
    const q = req.query.q?.trim();

    // Empty query = recent notes across the space (used by the Home
    // Notebooks widget, which shows recently edited notes).
    if (!q) {
      const recents = getDb().prepare(`
        SELECT n.id, n.notebook_id, n.title, n.word_count, n.updated_at,
               nb.name AS notebook_name, nb.icon AS notebook_icon, nb.colour AS notebook_colour
        FROM kb_notes n
        JOIN kb_notebooks nb ON n.notebook_id = nb.id
        WHERE nb.space_id = ? AND (nb.created_by = ? OR nb.visibility = 'shared')
        ORDER BY n.updated_at DESC
        LIMIT 10
      `).all(req.spaceId, req.user.id);
      return res.json(recents);
    }

    const db      = getDb();
    const pattern = `%${q}%`;
    const results = db.prepare(`
      SELECT n.id, n.notebook_id, n.title, n.word_count, n.updated_at,
             nb.name AS notebook_name, nb.icon AS notebook_icon, nb.colour AS notebook_colour
      FROM kb_notes n
      JOIN kb_notebooks nb ON n.notebook_id = nb.id
      WHERE nb.space_id = ? AND (nb.created_by = ? OR nb.visibility = 'shared') AND (n.title LIKE ? OR n.content LIKE ?)
      ORDER BY n.updated_at DESC
      LIMIT 50
    `).all(req.spaceId, req.user.id, pattern, pattern);

    res.json(results);
  } catch (err) { next(err); }
});

// ── Error handler ──────────────────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  logger.error(`notes route error: ${req.method} ${req.path}`, { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

module.exports = router;
