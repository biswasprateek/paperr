const express = require('express');
const router = express.Router();
const { getDb } = require('../db/db');
const { requireAuth, requireSpace } = require('../auth/middleware');

router.get('/', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const limit = parseInt(req.query.limit) || 50;
  const activities = db.prepare(`
    SELECT a.*, u.display_name, u.avatar_url, u.avatar_colour
    FROM activity a
    LEFT JOIN users u ON a.user_id = u.id
    WHERE a.space_id = ?
    ORDER BY a.created_at DESC
    LIMIT ?
  `).all(req.spaceId, limit);
  return res.json(activities);
});

router.get('/project/:id', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const projectId = parseInt(req.params.id);
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND space_id = ?').get(projectId, req.spaceId);
  if (!project) return res.status(404).json({ error: 'Not found' });
  const activities = db.prepare(`
    SELECT a.*, u.display_name, u.avatar_url, u.avatar_colour
    FROM activity a
    LEFT JOIN users u ON a.user_id = u.id
    WHERE a.space_id = ?
      AND (
        (a.entity_type = 'task' AND a.entity_id IN (SELECT id FROM tasks WHERE project_id = ?))
        OR (a.entity_type = 'project' AND a.entity_id = ?)
        OR (a.entity_type = 'phase' AND a.entity_id IN (SELECT id FROM phases WHERE project_id = ?))
        OR (a.entity_type = 'milestone' AND a.entity_id IN (SELECT id FROM milestones WHERE project_id = ?))
      )
    ORDER BY a.created_at DESC
    LIMIT 100
  `).all(req.spaceId, projectId, projectId, projectId, projectId);
  return res.json(activities);
});

module.exports = router;
