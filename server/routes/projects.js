const express = require('express');
const router = express.Router();
const { getDb } = require('../db/db');
const { requireAuth, requireSpace } = require('../auth/middleware');
const taskService = require('../services/taskService');
const notificationService = require('../services/notificationService');

// GET /api/projects
router.get('/', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const projects = db.prepare(
    "SELECT * FROM projects WHERE space_id = ? AND (owner_id = ? OR visibility = 'shared') ORDER BY created_at DESC"
  ).all(req.spaceId, req.user.id);
  return res.json(projects);
});

// GET /api/projects/templates
router.get('/templates', requireAuth, (req, res) => {
  const templates = [
    { id: 'home-renovation', name: 'Home Renovation', icon: '🏠' },
    { id: 'trip-planning', name: 'Holiday / Trip Planning', icon: '✈️' },
    { id: 'event-planning', name: 'Event Planning', icon: '🎉' },
    { id: 'moving-house', name: 'Moving House', icon: '📦' },
    { id: 'garden', name: 'Garden Project', icon: '🌱' },
    { id: 'new-baby', name: 'New Baby Prep', icon: '👶' },
    { id: 'custom', name: 'Custom (Blank)', icon: '📁' },
  ];
  return res.json(templates);
});

// GET /api/projects/:id
router.get('/:id', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const project = db.prepare(`
    SELECT * FROM projects WHERE id = ? AND space_id = ? AND (owner_id = ? OR visibility = 'shared')
  `).get(parseInt(req.params.id), req.spaceId, req.user.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  return res.json(project);
});

// POST /api/projects
router.post('/', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const { name, description, cover_colour, cover_icon, start_date, end_date, visibility } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const r = db.prepare(`
    INSERT INTO projects (name, description, cover_colour, cover_icon, start_date, end_date, visibility, owner_id, space_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, description || null, cover_colour || '#F97316', cover_icon || '📁', start_date || null, end_date || null, visibility === 'shared' ? 'shared' : 'personal', req.user.id, req.spaceId);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(r.lastInsertRowid);
  db.prepare('INSERT INTO project_members (project_id, user_id, role_label) VALUES (?, ?, ?)').run(project.id, req.user.id, 'Owner');
  taskService.logActivity(req.user.id, 'project_created', 'project', project.id, `Created project "${project.name}"`, req.spaceId);
  return res.status(201).json(project);
});

// PUT /api/projects/:id
router.put('/:id', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const project = db.prepare(`
    SELECT * FROM projects WHERE id = ? AND space_id = ? AND (owner_id = ? OR visibility = 'shared')
  `).get(id, req.spaceId, req.user.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  const allowed = ['name', 'description', 'cover_colour', 'cover_icon', 'status', 'start_date', 'end_date', 'visibility', 'progress_override'];
  const updates = {};
  for (const k of allowed) {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  }
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'No fields to update' });
  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE projects SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), id);
  // Archiving a project archives its still-active tasks with it, so they drop
  // out of task lists/boards the same way the project drops out of the active view.
  // Reactivating does the reverse, restoring the tasks that were archived alongside it.
  if (updates.status === 'archived' && project.status !== 'archived') {
    db.prepare('UPDATE tasks SET archived = 1 WHERE project_id = ? AND archived = 0').run(id);
  } else if (updates.status !== undefined && updates.status !== 'archived' && project.status === 'archived') {
    db.prepare('UPDATE tasks SET archived = 0 WHERE project_id = ? AND archived = 1').run(id);
  }
  return res.json(db.prepare('SELECT * FROM projects WHERE id = ?').get(id));
});

// DELETE /api/projects/:id — permanently deletes the project. Phases,
// milestones, members, notifications, and events cascade via FK. Tasks don't
// (no ON DELETE CASCADE on tasks.project_id), so deleteTasks picks whether
// they're deleted too or just unlinked (kept, project_id set to NULL).
router.delete('/:id', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const project = db.prepare(`
    SELECT * FROM projects WHERE id = ? AND space_id = ? AND (owner_id = ? OR visibility = 'shared')
  `).get(id, req.spaceId, req.user.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  const deleteTasks = req.query.deleteTasks === 'true' || req.body?.deleteTasks === true;
  db.transaction(() => {
    if (deleteTasks) {
      db.prepare('DELETE FROM tasks WHERE project_id = ?').run(id);
    } else {
      db.prepare('UPDATE tasks SET project_id = NULL WHERE project_id = ?').run(id);
    }
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  })();
  taskService.logActivity(req.user.id, 'project_deleted', 'project', id, `Deleted project "${project.name}"`, req.spaceId);
  return res.json({ success: true });
});

// GET /api/projects/:id/tasks
router.get('/:id/tasks', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const project = db.prepare(`
    SELECT id FROM projects WHERE id = ? AND space_id = ? AND (owner_id = ? OR visibility = 'shared')
  `).get(parseInt(req.params.id), req.spaceId, req.user.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  const tasks = taskService.getTasks({ spaceId: req.spaceId, projectId: project.id });
  return res.json(tasks);
});

// POST /api/projects/:id/tasks
router.post('/:id/tasks', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const projectId = parseInt(req.params.id);
  const project = db.prepare(`
    SELECT id FROM projects WHERE id = ? AND space_id = ? AND (owner_id = ? OR visibility = 'shared')
  `).get(projectId, req.spaceId, req.user.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  const task = taskService.createTask({ ...req.body, project_id: projectId, space_id: req.spaceId }, req.user.id);
  req.app.get('io')?.to(`space:${req.spaceId}`).emit('task:created', { task });
  return res.status(201).json(task);
});

// GET /api/projects/:id/phases
router.get('/:id/phases', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const project = db.prepare(`
    SELECT id FROM projects WHERE id = ? AND space_id = ? AND (owner_id = ? OR visibility = 'shared')
  `).get(parseInt(req.params.id), req.spaceId, req.user.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  return res.json(db.prepare('SELECT * FROM phases WHERE project_id = ? ORDER BY sort_order').all(project.id));
});

// POST /api/projects/:id/phases
router.post('/:id/phases', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const projectId = parseInt(req.params.id);
  const project = db.prepare(`
    SELECT id FROM projects WHERE id = ? AND space_id = ? AND (owner_id = ? OR visibility = 'shared')
  `).get(projectId, req.spaceId, req.user.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  const { name, colour, sort_order } = req.body;
  const r = db.prepare('INSERT INTO phases (project_id, name, colour, sort_order) VALUES (?, ?, ?, ?)').run(projectId, name, colour || null, sort_order || 0);
  return res.status(201).json(db.prepare('SELECT * FROM phases WHERE id = ?').get(r.lastInsertRowid));
});

// POST /api/projects/:id/phases/:phaseId/complete — manual override; a phase
// can be marked done even while it still has active tasks.
router.post('/:id/phases/:phaseId/complete', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const projectId = parseInt(req.params.id);
  const phaseId = parseInt(req.params.phaseId);
  const project = db.prepare(`
    SELECT id FROM projects WHERE id = ? AND space_id = ? AND (owner_id = ? OR visibility = 'shared')
  `).get(projectId, req.spaceId, req.user.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  const phase = db.prepare('SELECT * FROM phases WHERE id = ? AND project_id = ?').get(phaseId, projectId);
  if (!phase) return res.status(404).json({ error: 'Phase not found' });
  db.prepare("UPDATE phases SET is_completed = 1, completed_at = datetime('now'), completed_by = ? WHERE id = ?").run(req.user.id, phaseId);
  taskService.logActivity(req.user.id, 'phase_completed', 'phase', phaseId, `Completed phase "${phase.name}"`, req.spaceId);
  notificationService.notifyProjectWatchers(projectId, {
    spaceId: req.spaceId, type: 'phase_completed',
    message: `Phase "${phase.name}" was marked complete`, excludeUserId: req.user.id,
  });
  return res.json(db.prepare('SELECT * FROM phases WHERE id = ?').get(phaseId));
});

// POST /api/projects/:id/phases/:phaseId/uncomplete
router.post('/:id/phases/:phaseId/uncomplete', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const projectId = parseInt(req.params.id);
  const phaseId = parseInt(req.params.phaseId);
  const project = db.prepare(`
    SELECT id FROM projects WHERE id = ? AND space_id = ? AND (owner_id = ? OR visibility = 'shared')
  `).get(projectId, req.spaceId, req.user.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  const phase = db.prepare('SELECT * FROM phases WHERE id = ? AND project_id = ?').get(phaseId, projectId);
  if (!phase) return res.status(404).json({ error: 'Phase not found' });
  db.prepare('UPDATE phases SET is_completed = 0, completed_at = NULL, completed_by = NULL WHERE id = ?').run(phaseId);
  return res.json(db.prepare('SELECT * FROM phases WHERE id = ?').get(phaseId));
});

// GET /api/projects/:id/milestones
router.get('/:id/milestones', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const projectId = parseInt(req.params.id);
  const project = db.prepare(`
    SELECT id FROM projects WHERE id = ? AND space_id = ? AND (owner_id = ? OR visibility = 'shared')
  `).get(projectId, req.spaceId, req.user.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  return res.json(
    db.prepare('SELECT * FROM milestones WHERE project_id = ? ORDER BY sort_order, created_at').all(projectId)
  );
});

// POST /api/projects/:id/milestones
router.post('/:id/milestones', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const projectId = parseInt(req.params.id);
  const project = db.prepare(`
    SELECT id FROM projects WHERE id = ? AND space_id = ? AND (owner_id = ? OR visibility = 'shared')
  `).get(projectId, req.spaceId, req.user.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  const { name, phase_id, due_date, sort_order } = req.body;
  if (!name || !phase_id) return res.status(400).json({ error: 'name and phase_id required' });
  const phase = db.prepare('SELECT id FROM phases WHERE id = ? AND project_id = ?').get(phase_id, projectId);
  if (!phase) return res.status(404).json({ error: 'Phase not found' });
  const r = db.prepare(
    'INSERT INTO milestones (phase_id, project_id, name, due_date, sort_order) VALUES (?, ?, ?, ?, ?)'
  ).run(phase_id, projectId, name, due_date || null, sort_order || 0);
  return res.status(201).json(db.prepare('SELECT * FROM milestones WHERE id = ?').get(r.lastInsertRowid));
});

// DELETE /api/projects/:id/milestones/:milestoneId
router.delete('/:id/milestones/:milestoneId', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const projectId = parseInt(req.params.id);
  const project = db.prepare(`
    SELECT id FROM projects WHERE id = ? AND space_id = ? AND (owner_id = ? OR visibility = 'shared')
  `).get(projectId, req.spaceId, req.user.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM milestones WHERE id = ? AND project_id = ?').run(parseInt(req.params.milestoneId), projectId);
  return res.json({ success: true });
});

// POST /api/projects/:id/milestones/:milestoneId/complete — always a manual
// flag; a milestone has no underlying tasks to derive completion from.
router.post('/:id/milestones/:milestoneId/complete', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const projectId = parseInt(req.params.id);
  const milestoneId = parseInt(req.params.milestoneId);
  const project = db.prepare(`
    SELECT id FROM projects WHERE id = ? AND space_id = ? AND (owner_id = ? OR visibility = 'shared')
  `).get(projectId, req.spaceId, req.user.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  const milestone = db.prepare('SELECT * FROM milestones WHERE id = ? AND project_id = ?').get(milestoneId, projectId);
  if (!milestone) return res.status(404).json({ error: 'Milestone not found' });
  db.prepare("UPDATE milestones SET is_completed = 1, completed_at = datetime('now'), completed_by = ? WHERE id = ?").run(req.user.id, milestoneId);
  taskService.logActivity(req.user.id, 'milestone_completed', 'milestone', milestoneId, `Completed milestone "${milestone.name}"`, req.spaceId);
  notificationService.notifyProjectWatchers(projectId, {
    spaceId: req.spaceId, type: 'milestone_completed',
    message: `Milestone "${milestone.name}" was reached`, excludeUserId: req.user.id,
  });
  return res.json(db.prepare('SELECT * FROM milestones WHERE id = ?').get(milestoneId));
});

// POST /api/projects/:id/milestones/:milestoneId/uncomplete
router.post('/:id/milestones/:milestoneId/uncomplete', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const projectId = parseInt(req.params.id);
  const milestoneId = parseInt(req.params.milestoneId);
  const project = db.prepare(`
    SELECT id FROM projects WHERE id = ? AND space_id = ? AND (owner_id = ? OR visibility = 'shared')
  `).get(projectId, req.spaceId, req.user.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  const milestone = db.prepare('SELECT * FROM milestones WHERE id = ? AND project_id = ?').get(milestoneId, projectId);
  if (!milestone) return res.status(404).json({ error: 'Milestone not found' });
  db.prepare('UPDATE milestones SET is_completed = 0, completed_at = NULL, completed_by = NULL WHERE id = ?').run(milestoneId);
  return res.json(db.prepare('SELECT * FROM milestones WHERE id = ?').get(milestoneId));
});

// GET /api/projects/:id/dashboard
router.get('/:id/dashboard', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const project = db.prepare(`
    SELECT * FROM projects WHERE id = ? AND space_id = ? AND (owner_id = ? OR visibility = 'shared')
  `).get(id, req.spaceId, req.user.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  const tasks = taskService.getTasks({ spaceId: req.spaceId, projectId: id });
  const total = tasks.length;
  const completed = tasks.filter(t => t.is_completed).length;
  const blocked = tasks.filter(t => t.status === 'blocked').length;
  const inProgress = tasks.filter(t => t.status === 'in_progress').length;
  const progress = project.progress_override ?? (total > 0 ? Math.round((completed / total) * 100) : 0);
  return res.json({ project, tasks, stats: { total, completed, blocked, inProgress, progress } });
});

// GET /api/projects/:id/members
router.get('/:id/members', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const projectId = parseInt(req.params.id);
  const project = db.prepare(`
    SELECT id FROM projects WHERE id = ? AND space_id = ? AND (owner_id = ? OR visibility = 'shared')
  `).get(projectId, req.spaceId, req.user.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  const members = db.prepare(`
    SELECT pm.project_id, pm.user_id, pm.role_label, pm.is_watcher,
      u.display_name, u.username, u.avatar_url, u.avatar_colour
    FROM project_members pm
    JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = ?
    ORDER BY CASE WHEN pm.role_label = 'Owner' THEN 0 ELSE 1 END, u.display_name
  `).all(projectId);
  return res.json(members);
});

// POST /api/projects/:id/members — upserts a member. Only the fields present
// in the body are changed; omitted fields keep their existing value (e.g.
// toggling isWatcher alone must not clobber roleLabel, and vice versa).
router.post('/:id/members', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const projectId = parseInt(req.params.id);
  const project = db.prepare(`
    SELECT id FROM projects WHERE id = ? AND space_id = ? AND (owner_id = ? OR visibility = 'shared')
  `).get(projectId, req.spaceId, req.user.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  const { userId, roleLabel, isWatcher } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const existing = db.prepare('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, userId);
  const role = roleLabel !== undefined ? roleLabel : (existing?.role_label ?? 'Member');
  const watcher = isWatcher !== undefined ? (isWatcher ? 1 : 0) : (existing?.is_watcher ?? 0);
  db.prepare('INSERT OR REPLACE INTO project_members (project_id, user_id, role_label, is_watcher) VALUES (?, ?, ?, ?)').run(projectId, userId, role, watcher);
  if (!existing) {
    taskService.logActivity(req.user.id, 'project_member_added', 'project', projectId, `Added a member to the project`, req.spaceId);
  }
  return res.json({ success: true });
});

// DELETE /api/projects/:id/members/:userId
router.delete('/:id/members/:userId', requireAuth, requireSpace, (req, res) => {
  const db = getDb();
  const projectId = parseInt(req.params.id);
  const project = db.prepare(`
    SELECT id FROM projects WHERE id = ? AND space_id = ? AND (owner_id = ? OR visibility = 'shared')
  `).get(projectId, req.spaceId, req.user.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?').run(projectId, parseInt(req.params.userId));
  return res.json({ success: true });
});

module.exports = router;
