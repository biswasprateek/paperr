const { getDb } = require('../db/db');
const logger = require('../utils/logger');

function logActivity(userId, action, entityType, entityId, description, spaceId = null) {
  const db = getDb();
  db.prepare(
    `INSERT INTO activity (user_id, action, entity_type, entity_id, description, space_id) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(userId, action, entityType, entityId, description, spaceId);
}

function getTaskWithTags(id) {
  const db = getDb();
  const task = db.prepare(`
    SELECT t.*,
      p.name       AS project_name,
      p.cover_icon AS project_icon,
      u.display_name AS assigned_to_name,
      u.avatar_colour AS assigned_to_colour,
      a.name     AS area_name,
      a.icon     AS area_icon
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    LEFT JOIN users u ON t.assigned_to = u.id
    LEFT JOIN areas a ON t.area_id = a.id
    WHERE t.id = ?
  `).get(id);
  if (!task) return null;
  task.tags = db.prepare('SELECT tag FROM task_tags WHERE task_id = ?').all(id).map(r => r.tag);
  return task;
}

function getTasks(filters = {}) {
  const db = getDb();
  let query = `SELECT t.*,
    p.name       AS project_name,
    p.cover_icon AS project_icon,
    u.display_name  AS assigned_to_name,
    u.avatar_colour AS assigned_to_colour,
    a.name     AS area_name,
    a.icon     AS area_icon,
    (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id AND st.archived = 0) AS subtask_count,
    (SELECT COUNT(*) FROM tasks st WHERE st.parent_task_id = t.id AND st.archived = 0 AND st.is_completed = 1) AS subtask_completed_count
  FROM tasks t
  LEFT JOIN projects p ON t.project_id = p.id
  LEFT JOIN users u ON t.assigned_to = u.id
  LEFT JOIN areas a ON t.area_id = a.id
  WHERE t.archived = 0`;
  const params = [];

  if (filters.spaceId)   { query += ' AND t.space_id = ?'; params.push(filters.spaceId); }
  if (filters.projectId) { query += ' AND t.project_id = ?'; params.push(filters.projectId); }
  if (filters.assignedTo) {
    if (filters.includeUnassigned) {
      query += ' AND (t.assigned_to = ? OR t.assigned_to IS NULL)';
    } else {
      query += ' AND t.assigned_to = ?';
    }
    params.push(filters.assignedTo);
  }
  if (filters.status) { query += ' AND t.status = ?'; params.push(filters.status); }
  if (filters.priority) { query += ' AND t.priority = ?'; params.push(filters.priority); }
  if (filters.areaId) { query += ' AND t.area_id = ?'; params.push(filters.areaId); }
  if (filters.dueFrom) { query += ' AND date(t.due_date) >= ?'; params.push(filters.dueFrom); }
  if (filters.dueTo)   { query += ' AND date(t.due_date) <= ?'; params.push(filters.dueTo); }
  if (filters.isCompleted !== undefined) {
    query += ' AND t.is_completed = ?';
    params.push(filters.isCompleted ? 1 : 0);
  }
  if (filters.tag) {
    query += ' AND t.id IN (SELECT task_id FROM task_tags WHERE tag = ?)';
    params.push(filters.tag);
  }
  if (filters.search) {
    query += ' AND (t.title LIKE ? OR t.description LIKE ?)';
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.parentTaskId) {
    query += ' AND t.parent_task_id = ?';
    params.push(filters.parentTaskId);
  } else if (filters.parentTaskId === null || filters.excludeSubTasks) {
    query += ' AND t.parent_task_id IS NULL';
  }
  if (filters.completedAtFrom) {
    query += ' AND date(t.completed_at) >= ?';
    params.push(filters.completedAtFrom);
  }
  if (filters.completedAtTo) {
    query += ' AND date(t.completed_at) <= ?';
    params.push(filters.completedAtTo);
  }

  query += ' ORDER BY t.due_date ASC, t.priority DESC, t.created_at DESC';

  if (filters.limit) { query += ' LIMIT ?'; params.push(filters.limit); }

  const tasks = db.prepare(query).all(...params);
  return tasks.map(task => {
    task.tags = db.prepare('SELECT tag FROM task_tags WHERE task_id = ?').all(task.id).map(r => r.tag);
    return task;
  });
}

function createTask(data, createdBy) {
  const db = getDb();

  // Resolve space_id — required by schema; fall back to creator's first space
  const spaceId = data.space_id || (() => {
    const row = db.prepare('SELECT space_id FROM space_members WHERE user_id = ? LIMIT 1').get(createdBy);
    return row?.space_id || null;
  })();

  // Deadlines are date-only and belong to top-level tasks only — subtasks are
  // scheduled purely via their start_at/end_at time block.
  const deadline = data.parent_task_id ? null : (data.due_date ? String(data.due_date).slice(0, 10) : null);

  const result = db.prepare(`
    INSERT INTO tasks (
      title, description, task_notes, project_id, phase_id,
      assigned_to, created_by, due_date, start_at, end_at, priority, status, is_recurring, recur_interval,
      recur_days, area_id, parent_task_id, blocked_by_task_id,
      space_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.title,
    data.description || null,
    data.task_notes || null,
    data.project_id || null,
    data.phase_id || null,
    data.assigned_to || null,
    createdBy,
    deadline,
    data.start_at || null,
    data.end_at || null,
    data.priority || 'medium',
    data.status || 'todo',
    data.is_recurring ? 1 : 0,
    data.recur_interval || null,
    data.recur_days || null,
    data.area_id || null,
    data.parent_task_id || null,
    data.blocked_by_task_id || null,
    spaceId
  );

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);

  if (data.tags && data.tags.length > 0) {
    const insertTag = db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag) VALUES (?, ?)');
    for (const tag of data.tags) insertTag.run(task.id, tag);
  }

  logActivity(createdBy, 'task_created', 'task', task.id, `Created task "${task.title}"`, data.space_id || null);
  return getTaskWithTags(task.id);
}

function updateTask(id, data, userId) {
  const db = getDb();
  logger.info('updateTask: start', { id, userId, dataKeys: Object.keys(data) });

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) {
    logger.warn('updateTask: task not found', { id });
    return null;
  }

  const allowed = [
    'title', 'description', 'task_notes', 'project_id', 'phase_id', 'milestone_id',
    'assigned_to', 'due_date', 'start_at', 'end_at', 'priority', 'status', 'is_recurring',
    'recur_interval', 'recur_days', 'area_id',
    'parent_task_id', 'blocked_by_task_id', 'archived'
  ];

  const updates = {};
  for (const key of allowed) {
    if (data[key] !== undefined) updates[key] = data[key];
  }

  // Deadlines are date-only and only apply to top-level tasks; subtasks never carry one.
  if (updates.due_date !== undefined) {
    updates.due_date = task.parent_task_id ? null : (updates.due_date ? String(updates.due_date).slice(0, 10) : null);
  }

  // Keep is_completed/completed_at in sync when status is changed directly
  // (e.g. via the task edit form), mirroring completeTask/uncompleteTask.
  let justCompleted = false;
  if (updates.status !== undefined && updates.status !== task.status) {
    if (updates.status === 'done' && !task.is_completed) {
      updates.is_completed = 1;
      updates.completed_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
      updates.completed_by = userId;
      justCompleted = true;
    } else if (updates.status !== 'done' && task.is_completed) {
      updates.is_completed = 0;
      updates.completed_at = null;
      updates.completed_by = null;
    }
  }

  if (Object.keys(updates).length > 0) {
    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates).map(v => (typeof v === 'boolean' ? (v ? 1 : 0) : v));
    const sql = `UPDATE tasks SET ${setClauses} WHERE id = ?`;
    logger.info('updateTask: running SQL', { sql, values: values.map(v => ({ value: v, type: typeof v })) });
    try {
      db.prepare(sql).run(...values, id);
    } catch (sqlErr) {
      logger.error('updateTask: SQL UPDATE failed', { sql, values, error: sqlErr.message });
      throw sqlErr;
    }
  }

  if (data.tags !== undefined) {
    logger.info('updateTask: updating tags', { id, tags: data.tags });
    try {
      db.prepare('DELETE FROM task_tags WHERE task_id = ?').run(id);
      if (data.tags.length > 0) {
        const insertTag = db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag) VALUES (?, ?)');
        for (const tag of data.tags) insertTag.run(id, tag);
      }
    } catch (tagErr) {
      logger.error('updateTask: tag update failed', { id, error: tagErr.message });
      throw tagErr;
    }
  }

  try {
    if (justCompleted) {
      logActivity(userId, 'task_completed', 'task', id, `Completed task "${task.title}"`, task.space_id);
      if (task.is_recurring && task.recur_interval) {
        createNextRecurrence(task, userId);
      }
    } else {
      logActivity(userId, 'task_updated', 'task', id, `Updated task "${task.title}"`, task.space_id);
    }
  } catch (actErr) {
    logger.error('updateTask: logActivity failed', { id, userId, error: actErr.message });
    throw actErr;
  }

  const result = getTaskWithTags(id);
  logger.info('updateTask: done', { id, found: !!result });
  return result;
}

function completeTask(id, userId) {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) return null;

  db.prepare(`
    UPDATE tasks SET is_completed = 1, status = 'done', completed_at = datetime('now'), completed_by = ?
    WHERE id = ?
  `).run(userId, id);

  if (task.is_recurring && task.recur_interval) {
    createNextRecurrence(task, userId);
  }

  logActivity(userId, 'task_completed', 'task', id, `Completed task "${task.title}"`, task.space_id);
  return getTaskWithTags(id);
}

function uncompleteTask(id, userId) {
  const db = getDb();
  db.prepare(`
    UPDATE tasks SET is_completed = 0, status = 'todo', completed_at = NULL, completed_by = NULL
    WHERE id = ?
  `).run(id);
  return getTaskWithTags(id);
}

function deleteTask(id, userId) {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) return false;
  // Subtasks are owned by this task — cascade delete instead of leaving
  // orphaned rows FK-constrained to a parent that no longer exists.
  for (const st of db.prepare('SELECT id FROM tasks WHERE parent_task_id = ?').all(id)) {
    deleteTask(st.id, userId);
  }
  db.prepare('UPDATE tasks SET blocked_by_task_id = NULL WHERE blocked_by_task_id = ?').run(id);
  db.prepare('DELETE FROM task_tags WHERE task_id = ?').run(id);
  db.prepare('DELETE FROM task_comments WHERE task_id = ?').run(id);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  logActivity(userId, 'task_deleted', 'task', id, `Deleted task "${task.title}"`, task.space_id);
  return true;
}

function createNextRecurrence(task, userId) {
  const { addDays, addWeeks, addMonths, addYears, format } = require('date-fns');

  // Advance a base Date by the task's cadence. For 'weekdays', jump to the next
  // selected weekday (0=Sun … 6=Sat) strictly after `base`.
  const advance = (base) => {
    switch (task.recur_interval) {
      case 'daily':   return addDays(base, 1);
      case 'weekly':  return addWeeks(base, 1);
      case 'monthly': return addMonths(base, 1);
      case 'yearly':  return addYears(base, 1);
      case 'weekdays': {
        const days = String(task.recur_days || '').split(',').filter(Boolean).map(Number);
        if (!days.length) return null;
        for (let i = 1; i <= 7; i++) {
          const d = addDays(base, i);
          if (days.includes(d.getDay())) return d;
        }
        return null;
      }
      default: return null;
    }
  };

  const base = { id: undefined, is_completed: 0, completed_at: null, completed_by: null, status: 'todo', created_at: undefined };

  // Scheduled-block recurrence: shift the time block forward, keep the deadline,
  // and stop once the next block would fall past the deadline.
  if (task.start_at) {
    const nextStart = advance(new Date(task.start_at));
    if (!nextStart) return;
    const nextStartStr = format(nextStart, "yyyy-MM-dd'T'HH:mm");
    const deadline = task.due_date ? String(task.due_date).slice(0, 10) : null;
    if (deadline && nextStartStr.slice(0, 10) > deadline) return; // series complete
    let nextEndStr = null;
    if (task.end_at) {
      const durationMs = new Date(task.end_at) - new Date(task.start_at);
      nextEndStr = format(new Date(nextStart.getTime() + durationMs), "yyyy-MM-dd'T'HH:mm");
    }
    createTask({ ...task, ...base, start_at: nextStartStr, end_at: nextEndStr }, userId);
    return;
  }

  // Legacy fallback: no time block → roll the date-only deadline forward by cadence.
  if (!task.due_date) return;
  const next = advance(new Date(String(task.due_date).slice(0, 10) + 'T00:00'));
  if (!next) return;
  createTask({ ...task, ...base, due_date: format(next, 'yyyy-MM-dd'), start_at: null, end_at: null }, userId);
}

module.exports = {
  getTasks,
  getTaskWithTags,
  createTask,
  updateTask,
  completeTask,
  uncompleteTask,
  deleteTask,
  logActivity,
};
