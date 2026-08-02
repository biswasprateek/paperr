const express = require('express');
const router = express.Router();
const { getDb } = require('../db/db');
const { requireAuth, requireSpace } = require('../auth/middleware');
const taskService = require('../services/taskService');
const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');
const { maybePriorityFocus } = require('../ai/agents/priorityFocus');

// GET /api/tasks
router.get('/', requireAuth, requireSpace, (req, res) => {
  const {
    projectId, assignedTo, status, tag, areaId,
    dueFrom, dueTo, search, parentTaskId,
    isCompleted, includeUnassigned, excludeSubTasks,
    completedAtFrom, completedAtTo,
  } = req.query;
  const tasks = taskService.getTasks({
    spaceId: req.spaceId,
    projectId, assignedTo, status, tag, areaId, dueFrom, dueTo, search, parentTaskId,
    completedAtFrom, completedAtTo,
    ...(isCompleted       !== undefined ? { isCompleted:       isCompleted       === 'true' } : {}),
    ...(includeUnassigned !== undefined ? { includeUnassigned: includeUnassigned === 'true' } : {}),
    ...(excludeSubTasks   !== undefined ? { excludeSubTasks:   excludeSubTasks   === 'true' } : {}),
  });
  return res.json(tasks);
});

// GET /api/tasks/today
router.get('/today', requireAuth, requireSpace, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const tasks = taskService.getTasks({ spaceId: req.spaceId, dueFrom: today, dueTo: today, isCompleted: false });
  return res.json(tasks);
});

// GET /api/tasks/overdue
router.get('/overdue', requireAuth, requireSpace, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const tasks = taskService.getTasks({ spaceId: req.spaceId, dueTo: today, isCompleted: false });
  return res.json(tasks.filter(t => (t.due_date || '').split('T')[0] < today));
});

// GET /api/tasks/upcoming
router.get('/upcoming', requireAuth, requireSpace, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const in7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const tasks = taskService.getTasks({ spaceId: req.spaceId, dueFrom: today, dueTo: in7, isCompleted: false });
  return res.json(tasks);
});

// GET /api/tasks/:id
router.get('/:id', requireAuth, requireSpace, (req, res) => {
  const task = taskService.getTaskWithTags(parseInt(req.params.id));
  if (!task || task.space_id !== req.spaceId) return res.status(404).json({ error: 'Task not found' });
  return res.json(task);
});

// POST /api/tasks
router.post('/', requireAuth, requireSpace, (req, res) => {
  try {
    const task = taskService.createTask({ ...req.body, space_id: req.spaceId }, req.user.id);
    req.app.get('io')?.to(`space:${req.spaceId}`).emit('task:created', { task });
    maybePriorityFocus(req.app.get('io'), task);
    return res.status(201).json(task);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to create task', detail: err.message });
  }
});

// PUT /api/tasks/:id
router.put('/:id', requireAuth, requireSpace, (req, res) => {
  const taskId = parseInt(req.params.id);
  logger.info('PUT /tasks/:id called', { taskId, userId: req.user?.id, body: req.body });
  try {
    const existing = taskService.getTaskWithTags(taskId);
    if (!existing || existing.space_id !== req.spaceId) {
      return res.status(404).json({ error: 'Task not found' });
    }
    const task = taskService.updateTask(taskId, req.body, req.user.id);
    if (!task) {
      logger.warn('updateTask returned null', { taskId });
      return res.status(404).json({ error: 'Task not found' });
    }
    if (task.project_id && existing.status !== 'blocked' && task.status === 'blocked') {
      notificationService.notifyProjectWatchers(task.project_id, {
        spaceId: req.spaceId,
        taskId: task.id,
        type: 'task_blocked',
        message: `"${task.title}" is now blocked`,
        excludeUserId: req.user.id,
        alsoNotifyUserId: task.assigned_to,
      });
    }
    req.app.get('io')?.to(`space:${req.spaceId}`).emit('task:updated', { task });
    maybePriorityFocus(req.app.get('io'), task);
    return res.json(task);
  } catch (err) {
    logger.error('updateTask threw an exception', { taskId, error: err.message, stack: err.stack });
    return res.status(500).json({ error: 'Failed to update task', detail: err.message });
  }
});

// PUT /api/tasks/:id/notes — lightweight autosave for the freeform notepad.
// Intentionally does NOT log activity or broadcast task:updated: the Deep Work
// notes pad autosaves as the user types, and doing either would spam the
// activity feed and thrash every tasks query on each keystroke pause.
router.put('/:id/notes', requireAuth, requireSpace, (req, res) => {
  const taskId = parseInt(req.params.id);
  const existing = taskService.getTaskWithTags(taskId);
  if (!existing || existing.space_id !== req.spaceId) return res.status(404).json({ error: 'Task not found' });
  getDb().prepare('UPDATE tasks SET task_notes = ? WHERE id = ?').run(req.body.task_notes ?? null, taskId);
  return res.json({ success: true });
});

// DELETE /api/tasks/:id
router.delete('/:id', requireAuth, requireSpace, (req, res) => {
  const taskId = parseInt(req.params.id);
  const existing = taskService.getTaskWithTags(taskId);
  if (!existing || existing.space_id !== req.spaceId) return res.status(404).json({ error: 'Task not found' });
  taskService.deleteTask(taskId, req.user.id);
  req.app.get('io')?.to(`space:${req.spaceId}`).emit('task:deleted', { taskId });
  return res.json({ success: true });
});

// POST /api/tasks/:id/complete
router.post('/:id/complete', requireAuth, requireSpace, (req, res) => {
  const taskId = parseInt(req.params.id);
  const existing = taskService.getTaskWithTags(taskId);
  if (!existing || existing.space_id !== req.spaceId) return res.status(404).json({ error: 'Task not found' });
  const task = taskService.completeTask(taskId, req.user.id);
  if (task.project_id) {
    notificationService.notifyProjectWatchers(task.project_id, {
      spaceId: req.spaceId,
      taskId: task.id,
      type: 'task_completed',
      message: `"${task.title}" was completed`,
      excludeUserId: req.user.id,
    });
  }
  req.app.get('io')?.to(`space:${req.spaceId}`).emit('task:completed', { taskId: task.id, completedBy: req.user.id });
  return res.json(task);
});

// POST /api/tasks/:id/uncomplete
router.post('/:id/uncomplete', requireAuth, requireSpace, (req, res) => {
  const taskId = parseInt(req.params.id);
  const existing = taskService.getTaskWithTags(taskId);
  if (!existing || existing.space_id !== req.spaceId) return res.status(404).json({ error: 'Task not found' });
  const task = taskService.uncompleteTask(taskId, req.user.id);
  req.app.get('io')?.to(`space:${req.spaceId}`).emit('task:updated', { task });
  return res.json(task);
});

// POST /api/tasks/:id/assign
router.post('/:id/assign', requireAuth, requireSpace, (req, res) => {
  const taskId = parseInt(req.params.id);
  const existing = taskService.getTaskWithTags(taskId);
  if (!existing || existing.space_id !== req.spaceId) return res.status(404).json({ error: 'Task not found' });
  const { userId } = req.body;
  const task = taskService.updateTask(taskId, { assigned_to: userId }, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  req.app.get('io')?.to(`space:${req.spaceId}`).emit('task:updated', { task });
  maybePriorityFocus(req.app.get('io'), task);
  return res.json(task);
});

// GET /api/tasks/:id/comments
router.get('/:id/comments', requireAuth, requireSpace, (req, res) => {
  const taskId = parseInt(req.params.id);
  const existing = taskService.getTaskWithTags(taskId);
  if (!existing || existing.space_id !== req.spaceId) return res.status(404).json({ error: 'Task not found' });
  const db = getDb();
  const comments = db.prepare(`
    SELECT c.*, u.display_name, u.avatar_url, u.avatar_colour
    FROM task_comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.task_id = ?
    ORDER BY c.created_at ASC
  `).all(taskId);
  return res.json(comments);
});

// POST /api/tasks/:id/comments
router.post('/:id/comments', requireAuth, requireSpace, (req, res) => {
  const taskId = parseInt(req.params.id);
  const existing = taskService.getTaskWithTags(taskId);
  if (!existing || existing.space_id !== req.spaceId) return res.status(404).json({ error: 'Task not found' });
  const content = (req.body.content || '').trim();
  if (!content) return res.status(400).json({ error: 'content required' });

  const db = getDb();
  const r = db.prepare('INSERT INTO task_comments (task_id, user_id, content) VALUES (?, ?, ?)').run(taskId, req.user.id, content);
  const comment = db.prepare(`
    SELECT c.*, u.display_name, u.avatar_url, u.avatar_colour
    FROM task_comments c JOIN users u ON u.id = c.user_id
    WHERE c.id = ?
  `).get(r.lastInsertRowid);

  taskService.logActivity(req.user.id, 'task_commented', 'task', taskId, `Commented on "${existing.title}"`, req.spaceId);

  if (existing.project_id) {
    notificationService.notifyProjectWatchers(existing.project_id, {
      spaceId: req.spaceId,
      taskId,
      type: 'task_comment',
      message: `New comment on "${existing.title}"`,
      excludeUserId: req.user.id,
      alsoNotifyUserId: existing.assigned_to,
    });
  }

  req.app.get('io')?.to(`space:${req.spaceId}`).emit('task:commented', { taskId, comment });
  return res.status(201).json(comment);
});

// DELETE /api/tasks/:id/comments/:commentId — author only
router.delete('/:id/comments/:commentId', requireAuth, requireSpace, (req, res) => {
  const taskId = parseInt(req.params.id);
  const existing = taskService.getTaskWithTags(taskId);
  if (!existing || existing.space_id !== req.spaceId) return res.status(404).json({ error: 'Task not found' });
  const db = getDb();
  const commentId = parseInt(req.params.commentId);
  const comment = db.prepare('SELECT * FROM task_comments WHERE id = ? AND task_id = ?').get(commentId, taskId);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (comment.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM task_comments WHERE id = ?').run(commentId);
  return res.json({ success: true });
});

// POST /api/tasks/bulk
router.post('/bulk', requireAuth, requireSpace, (req, res) => {
  const { ids, action, payload } = req.body;
  if (!ids || !Array.isArray(ids) || !action) {
    return res.status(400).json({ error: 'ids[] and action required' });
  }

  const results = [];
  for (const id of ids) {
    const existing = taskService.getTaskWithTags(id);
    if (!existing || existing.space_id !== req.spaceId) continue;
    if (action === 'complete') results.push(taskService.completeTask(id, req.user.id));
    else if (action === 'delete') { taskService.deleteTask(id, req.user.id); results.push(id); }
    else if (action === 'reassign' && payload?.userId) {
      results.push(taskService.updateTask(id, { assigned_to: payload.userId }, req.user.id));
    }
  }

  req.app.get('io')?.to(`space:${req.spaceId}`).emit('task:updated', { bulk: true });
  return res.json({ success: true, results });
});

module.exports = router;
