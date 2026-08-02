const express = require('express');
const router = express.Router();
const { getDb } = require('../db/db');
const { requireAuth, requireSpace } = require('../auth/middleware');
const taskService = require('../services/taskService');

// GET /api/lists
router.get('/', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const lists = db.prepare(`
    SELECT * FROM lists WHERE space_id = ? AND (created_by = ? OR visibility = 'shared') ORDER BY created_at ASC
  `).all(req.spaceId, req.user.id);
  return res.json(lists);
});

// GET /api/lists/:id
router.get('/:id', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const list = db.prepare(`
    SELECT * FROM lists WHERE id = ? AND space_id = ? AND (created_by = ? OR visibility = 'shared')
  `).get(parseInt(req.params.id), req.spaceId, req.user.id);
  if (!list) return res.status(404).json({ error: 'List not found' });
  return res.json(list);
});

// POST /api/lists
router.post('/', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const { name, icon, colour, visibility } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  const result = db.prepare(
    'INSERT INTO lists (name, icon, colour, created_by, space_id, visibility) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(name, icon || '📋', colour || '#F97316', req.user.id, req.spaceId, visibility === 'shared' ? 'shared' : 'personal');

  const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(result.lastInsertRowid);
  return res.status(201).json(list);
});

// PUT /api/lists/:id
router.put('/:id', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const { name, icon, colour, visibility } = req.body;

  const list = db.prepare(`
    SELECT * FROM lists WHERE id = ? AND space_id = ? AND (created_by = ? OR visibility = 'shared')
  `).get(id, req.spaceId, req.user.id);
  if (!list) return res.status(404).json({ error: 'List not found' });

  db.prepare('UPDATE lists SET name = ?, icon = ?, colour = ?, visibility = ? WHERE id = ?')
    .run(name ?? list.name, icon ?? list.icon, colour ?? list.colour,
         visibility === undefined ? list.visibility : (visibility === 'shared' ? 'shared' : 'personal'), id);

  return res.json(db.prepare('SELECT * FROM lists WHERE id = ?').get(id));
});

// DELETE /api/lists/:id
router.delete('/:id', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const list = db.prepare(`
    SELECT * FROM lists WHERE id = ? AND space_id = ? AND (created_by = ? OR visibility = 'shared')
  `).get(id, req.spaceId, req.user.id);
  if (!list) return res.status(404).json({ error: 'List not found' });
  db.prepare('DELETE FROM lists WHERE id = ?').run(id);
  return res.json({ success: true });
});

// GET /api/lists/:id/tasks
router.get('/:id/tasks', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const list = db.prepare(`
    SELECT id FROM lists WHERE id = ? AND space_id = ? AND (created_by = ? OR visibility = 'shared')
  `).get(parseInt(req.params.id), req.spaceId, req.user.id);
  if (!list) return res.status(404).json({ error: 'List not found' });
  const tasks = taskService.getTasks({ spaceId: req.spaceId, listId: list.id });
  return res.json(tasks);
});

// ── List Items ─────────────────────────────────────────────────────────────────

function resolveProjectId(db, taskId, explicitProjectId) {
  if (taskId) {
    const task = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(taskId);
    return task?.project_id ?? explicitProjectId ?? null;
  }
  return explicitProjectId ?? null;
}

// GET /api/lists/:id/items
router.get('/:id/items', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const listId = parseInt(req.params.id);
  const list = db.prepare(`
    SELECT id FROM lists WHERE id = ? AND space_id = ? AND (created_by = ? OR visibility = 'shared')
  `).get(listId, req.spaceId, req.user.id);
  if (!list) return res.status(404).json({ error: 'List not found' });
  const items = db.prepare(`
    SELECT li.*,
      t.title AS task_title, t.status AS task_status,
      p.name AS project_name, p.cover_icon AS project_icon,
      u.display_name AS completed_by_name, u.avatar_colour AS completed_by_colour
    FROM list_items li
    LEFT JOIN tasks t    ON li.task_id    = t.id
    LEFT JOIN projects p ON li.project_id = p.id
    LEFT JOIN users u    ON li.completed_by = u.id
    WHERE li.list_id = ?
    ORDER BY li.sort_order ASC, li.created_at ASC
  `).all(listId);
  return res.json(items);
});

// POST /api/lists/:id/items
router.post('/:id/items', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const listId = parseInt(req.params.id);
  const list = db.prepare(`
    SELECT id FROM lists WHERE id = ? AND space_id = ? AND (created_by = ? OR visibility = 'shared')
  `).get(listId, req.spaceId, req.user.id);
  if (!list) return res.status(404).json({ error: 'List not found' });
  const { title, notes, task_id, project_id, sort_order, indent_level } = req.body;
  // title may be blank: pressing Enter inserts an empty row that gets filled in (or removed) next.
  if (title === undefined || title === null) return res.status(400).json({ error: 'title required' });

  const taskId = task_id ? parseInt(task_id) : null;
  const resolvedProjectId = resolveProjectId(db, taskId, project_id ? parseInt(project_id) : null);

  const result = db.prepare(`
    INSERT INTO list_items (list_id, title, notes, task_id, project_id, sort_order, indent_level, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(listId, title, notes ?? null, taskId, resolvedProjectId, sort_order ?? 0, indent_level ?? 0, req.user.id);

  const item = db.prepare(`
    SELECT li.*,
      t.title AS task_title, t.status AS task_status,
      p.name AS project_name, p.cover_icon AS project_icon
    FROM list_items li
    LEFT JOIN tasks t    ON li.task_id    = t.id
    LEFT JOIN projects p ON li.project_id = p.id
    WHERE li.id = ?
  `).get(result.lastInsertRowid);

  req.app.get('io')?.to(`space:${req.spaceId}`).emit('listitem:created', { item });
  return res.status(201).json(item);
});

// POST /api/lists/:id/items/reorder — persist a new order for the list's items.
router.post('/:id/items/reorder', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const listId = parseInt(req.params.id);
  const list = db.prepare(`
    SELECT id FROM lists WHERE id = ? AND space_id = ? AND (created_by = ? OR visibility = 'shared')
  `).get(listId, req.spaceId, req.user.id);
  if (!list) return res.status(404).json({ error: 'List not found' });

  const { itemIds } = req.body;
  if (!Array.isArray(itemIds)) return res.status(400).json({ error: 'itemIds array required' });

  const upd = db.prepare('UPDATE list_items SET sort_order = ? WHERE id = ? AND list_id = ?');
  itemIds.forEach((id, idx) => upd.run(idx, parseInt(id), listId));

  req.app.get('io')?.to(`space:${req.spaceId}`).emit('listitems:reordered', { listId, itemIds });
  return res.json({ success: true });
});

// PUT /api/lists/items/:itemId
router.put('/items/:itemId', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const itemId = parseInt(req.params.itemId);
  const existing = db.prepare(`
    SELECT li.*, l.space_id, l.created_by AS list_created_by, l.visibility AS list_visibility
    FROM list_items li JOIN lists l ON l.id = li.list_id WHERE li.id = ?
  `).get(itemId);
  if (!existing || existing.space_id !== req.spaceId ||
      (existing.list_created_by !== req.user.id && existing.list_visibility !== 'shared')) {
    return res.status(404).json({ error: 'Item not found' });
  }

  const { title, notes, task_id, project_id, sort_order, indent_level } = req.body;
  const taskId = task_id !== undefined ? (task_id ? parseInt(task_id) : null) : existing.task_id;
  const explicitProjectId = project_id !== undefined ? (project_id ? parseInt(project_id) : null) : existing.project_id;
  const resolvedProjectId = resolveProjectId(db, taskId, explicitProjectId);

  db.prepare(`
    UPDATE list_items SET title = ?, notes = ?, task_id = ?, project_id = ?, sort_order = ?, indent_level = ?
    WHERE id = ?
  `).run(
    title ?? existing.title,
    notes !== undefined ? notes : existing.notes,
    taskId,
    resolvedProjectId,
    sort_order !== undefined ? sort_order : existing.sort_order,
    indent_level !== undefined ? Math.max(0, Math.min(5, parseInt(indent_level) || 0)) : existing.indent_level,
    itemId
  );

  const item = db.prepare(`
    SELECT li.*,
      t.title AS task_title, t.status AS task_status,
      p.name AS project_name, p.cover_icon AS project_icon
    FROM list_items li
    LEFT JOIN tasks t    ON li.task_id    = t.id
    LEFT JOIN projects p ON li.project_id = p.id
    WHERE li.id = ?
  `).get(itemId);

  req.app.get('io')?.to(`space:${req.spaceId}`).emit('listitem:updated', { item });
  return res.json(item);
});

// DELETE /api/lists/items/:itemId
router.delete('/items/:itemId', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const itemId = parseInt(req.params.itemId);
  const existing = db.prepare(`
    SELECT li.id, l.space_id, l.created_by AS list_created_by, l.visibility AS list_visibility
    FROM list_items li JOIN lists l ON l.id = li.list_id WHERE li.id = ?
  `).get(itemId);
  if (!existing || existing.space_id !== req.spaceId ||
      (existing.list_created_by !== req.user.id && existing.list_visibility !== 'shared')) {
    return res.status(404).json({ error: 'Item not found' });
  }
  db.prepare('DELETE FROM list_items WHERE id = ?').run(itemId);
  req.app.get('io')?.to(`space:${req.spaceId}`).emit('listitem:deleted', { itemId });
  return res.json({ success: true });
});

// POST /api/lists/items/:itemId/complete
router.post('/items/:itemId/complete', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const itemId = parseInt(req.params.itemId);
  const existing = db.prepare(`
    SELECT li.*, l.space_id, l.created_by AS list_created_by, l.visibility AS list_visibility
    FROM list_items li JOIN lists l ON l.id = li.list_id WHERE li.id = ?
  `).get(itemId);
  if (!existing || existing.space_id !== req.spaceId ||
      (existing.list_created_by !== req.user.id && existing.list_visibility !== 'shared')) {
    return res.status(404).json({ error: 'Item not found' });
  }

  const nowCompleted = !existing.is_completed;

  // Children are derived from indentation: the contiguous following rows that are
  // indented deeper than this item. Toggling a parent cascades to its whole subtree.
  const ordered = db.prepare(
    'SELECT id, indent_level FROM list_items WHERE list_id = ? ORDER BY sort_order ASC, created_at ASC'
  ).all(existing.list_id);
  const startIdx = ordered.findIndex(r => r.id === itemId);
  const parentLevel = existing.indent_level || 0;
  const ids = [itemId];
  for (let i = startIdx + 1; i < ordered.length; i++) {
    if ((ordered[i].indent_level || 0) > parentLevel) ids.push(ordered[i].id);
    else break;
  }

  const completedAt = nowCompleted ? new Date().toISOString() : null;
  const completedBy = nowCompleted ? req.user.id : null;
  const setState = db.prepare(
    'UPDATE list_items SET is_completed = ?, completed_at = ?, completed_by = ? WHERE id = ?'
  );
  for (const id of ids) setState.run(nowCompleted ? 1 : 0, completedAt, completedBy, id);

  const io = req.app.get('io');
  const updatedItems = ids.map(id => db.prepare('SELECT * FROM list_items WHERE id = ?').get(id));
  for (const item of updatedItems) io?.to(`space:${req.spaceId}`).emit('listitem:updated', { item });

  return res.json(updatedItems[0]);
});

module.exports = router;
