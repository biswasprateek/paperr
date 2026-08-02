const express = require('express');
const router = express.Router();
const { getDb } = require('../db/db');
const { requireAuth, requireSpace } = require('../auth/middleware');

// GET /api/notifications — the current user's notifications in this space,
// most recent first.
router.get('/', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const limit = parseInt(req.query.limit) || 30;
  const notifications = db.prepare(`
    SELECT n.*, p.name AS project_name, t.title AS task_title
    FROM notifications n
    LEFT JOIN projects p ON n.project_id = p.id
    LEFT JOIN tasks t ON n.task_id = t.id
    WHERE n.user_id = ? AND (n.space_id = ? OR n.space_id IS NULL)
    ORDER BY n.created_at DESC
    LIMIT ?
  `).all(req.user.id, req.spaceId, limit);
  return res.json(notifications);
});

// POST /api/notifications/:id/read
router.post('/:id/read', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const notification = db.prepare('SELECT id FROM notifications WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!notification) return res.status(404).json({ error: 'Not found' });
  db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE id = ?").run(id);
  return res.json({ success: true });
});

// POST /api/notifications/read-all
router.post('/read-all', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  db.prepare(`
    UPDATE notifications SET read_at = datetime('now')
    WHERE user_id = ? AND read_at IS NULL AND (space_id = ? OR space_id IS NULL)
  `).run(req.user.id, req.spaceId);
  return res.json({ success: true });
});

module.exports = router;
