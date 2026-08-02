const express = require('express');
const router = express.Router();
const { getDb } = require('../db/db');
const { requireAuth, requireSpace } = require('../auth/middleware');
const taskService = require('../services/taskService');

// GET /api/areas
router.get('/', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  return res.json(db.prepare('SELECT * FROM areas WHERE space_id = ? ORDER BY name').all(req.spaceId));
});

// POST /api/areas
router.post('/', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const { name, icon, colour } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const r = db.prepare('INSERT INTO areas (name, icon, colour, space_id) VALUES (?, ?, ?, ?)').run(name, icon || '📍', colour || null, req.spaceId);
  return res.status(201).json(db.prepare('SELECT * FROM areas WHERE id = ?').get(r.lastInsertRowid));
});

// PUT /api/areas/:id
router.put('/:id', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const area = db.prepare('SELECT * FROM areas WHERE id = ? AND space_id = ?').get(id, req.spaceId);
  if (!area) return res.status(404).json({ error: 'Area not found' });
  const { name, icon, colour } = req.body;
  db.prepare('UPDATE areas SET name=?, icon=?, colour=? WHERE id=?')
    .run(name ?? area.name, icon ?? area.icon, colour ?? area.colour, id);
  return res.json(db.prepare('SELECT * FROM areas WHERE id = ?').get(id));
});

// DELETE /api/areas/:id
router.delete('/:id', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const area = db.prepare('SELECT id FROM areas WHERE id = ? AND space_id = ?').get(id, req.spaceId);
  if (!area) return res.status(404).json({ error: 'Area not found' });
  db.prepare('UPDATE tasks SET area_id = NULL WHERE area_id = ?').run(id);
  db.prepare('DELETE FROM areas WHERE id = ?').run(id);
  return res.json({ success: true });
});

// GET /api/areas/:id/tasks
router.get('/:id/tasks', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const area = db.prepare('SELECT id FROM areas WHERE id = ? AND space_id = ?').get(id, req.spaceId);
  if (!area) return res.status(404).json({ error: 'Area not found' });
  return res.json(taskService.getTasks({ spaceId: req.spaceId, areaId: id }));
});

module.exports = router;
