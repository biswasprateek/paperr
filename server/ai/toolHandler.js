const { getDb } = require('../db/db');
const taskService = require('../services/taskService');

// Map camelCase tool args → snake_case DB/service fields.
// Node.js built-in DatabaseSync throws "Provided value cannot be bound to SQLite parameter N"
// for undefined values, so we convert undefined → null here to get proper constraint errors instead.
function toTaskFields(fields) {
  const map = {
    projectId: 'project_id', assignedTo: 'assigned_to',
    dueDate: 'due_date', startAt: 'start_at', endAt: 'end_at', phaseId: 'phase_id',
    roomId: 'area_id', areaId: 'area_id', parentTaskId: 'parent_task_id',
    blockedByTaskId: 'blocked_by_task_id',
    isRecurring: 'is_recurring', recurInterval: 'recur_interval',
    recurDays: 'recur_days',
  };
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    out[map[k] || k] = v === undefined ? null : v;
  }
  return out;
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  try {
    const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return dateStr;
  }
}

// Fail-closed space guard: true only if row exists AND is in the caller's space.
// Table names come from literal call sites only (never user input), so interpolation is safe.
function ownsRow(db, table, id, spaceId) {
  if (id == null || spaceId == null) return false;
  const row = db.prepare(`SELECT space_id FROM ${table} WHERE id = ?`).get(id);
  return !!row && row.space_id === spaceId;
}

async function handleToolCall(toolName, args, user, io, spaceId) {
  const db = getDb();

  switch (toolName) {

    case 'resolveDate': {
      let expr = (args.expression || '').toLowerCase().trim();
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const d = new Date(now);

      // Strip an embedded time-of-day ("tuesday 530pm", "next friday at 5:30 pm", "17:30")
      // so the date-matching logic below still sees a clean expression, and report the
      // time back so the caller can build a full startAt without re-asking the user.
      let time = null;
      if (/\bnoon\b/.test(expr)) {
        time = '12:00';
        expr = expr.replace(/\b(?:at\s+)?noon\b/, '').trim() || 'today';
      } else if (/\bmidnight\b/.test(expr)) {
        time = '00:00';
        expr = expr.replace(/\b(?:at\s+)?midnight\b/, '').trim() || 'today';
      } else {
        const timeMatch = expr.match(/\b(?:at\s+)?(?:(\d{1,2}):(\d{2})\s*(am|pm)?|(\d{3,4})\s*(am|pm)|(\d{1,2})\s*(am|pm))\b/i);
        if (timeMatch) {
          let hour, minute = 0, meridiem;
          if (timeMatch[1] !== undefined) {
            hour = parseInt(timeMatch[1]); minute = parseInt(timeMatch[2]); meridiem = timeMatch[3];
          } else if (timeMatch[4] !== undefined) {
            const digits = timeMatch[4];
            meridiem = timeMatch[5];
            hour = parseInt(digits.slice(0, digits.length - 2));
            minute = parseInt(digits.slice(-2));
          } else {
            hour = parseInt(timeMatch[6]); meridiem = timeMatch[7];
          }
          if (meridiem) {
            meridiem = meridiem.toLowerCase();
            if (meridiem === 'pm' && hour < 12) hour += 12;
            if (meridiem === 'am' && hour === 12) hour = 0;
          }
          time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
          expr = expr.replace(timeMatch[0], '').trim();
          if (!expr) expr = 'today';
        }
      }

      const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

      const nextWeekday = (name) => {
        const target = WEEKDAYS.indexOf(name);
        if (target === -1) return null;
        const diff = ((target - d.getDay() + 7) % 7) || 7;
        const r = new Date(d);
        r.setDate(r.getDate() + diff);
        return r;
      };

      let result = null;

      if (['today', 'now', 'eod', 'end of day'].includes(expr)) {
        result = d;
      } else if (['tomorrow', 'tmr', 'tmrw'].includes(expr)) {
        d.setDate(d.getDate() + 1); result = d;
      } else if (expr === 'day after tomorrow') {
        d.setDate(d.getDate() + 2); result = d;
      } else if (expr === 'yesterday') {
        d.setDate(d.getDate() - 1); result = d;
      } else if (expr === 'day before yesterday') {
        d.setDate(d.getDate() - 2); result = d;
      } else if (['end of week', 'eow', 'this weekend', 'this saturday'].includes(expr)) {
        result = nextWeekday('saturday');
      } else if (expr === 'next weekend') {
        result = nextWeekday('saturday'); result.setDate(result.getDate() + 7);
      } else if (['start of month', 'beginning of month'].includes(expr)) {
        result = new Date(d.getFullYear(), d.getMonth(), 1);
      } else if (expr === 'end of month') {
        result = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      } else if (['start of next month', 'beginning of next month'].includes(expr)) {
        result = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      } else if (expr === 'end of year') {
        result = new Date(d.getFullYear(), 11, 31);
      } else {
        // "in N days/weeks/months/years", "N days from now", "a/couple (of)/few days (from now)"
        // — normalize word quantifiers to digits first so one numeric regex covers all of them.
        const qExpr = expr
          .replace(/^(?:a|an|one)?\s*couple(?:\s+of)?\s+/, '2 ')
          .replace(/^(?:a|an|one)?\s*few\s+/, '3 ')
          .replace(/^(?:a|an|one)\s+/, '1 ');
        const inN = qExpr.match(/^(?:in\s+)?(\d+)\s+(day|days|week|weeks|month|months|year|years)(?:\s+from\s+now)?$/);
        if (inN) {
          const n = parseInt(inN[1]);
          const unit = inN[2];
          if (unit.startsWith('day'))   d.setDate(d.getDate() + n);
          else if (unit.startsWith('week'))  d.setDate(d.getDate() + n * 7);
          else if (unit.startsWith('month')) d.setMonth(d.getMonth() + n);
          else if (unit.startsWith('year'))  d.setFullYear(d.getFullYear() + n);
          result = d;
        }

        // "next monday", "this friday", "next week", "next month"
        if (!result) {
          const nextExpr = expr.replace(/^(next|this)\s+/, '');
          if (nextExpr === 'week') { d.setDate(d.getDate() + 7); result = d; }
          else if (nextExpr === 'month') { d.setMonth(d.getMonth() + 1); result = d; }
          else if (nextExpr === 'year') { d.setFullYear(d.getFullYear() + 1); result = d; }
          else result = nextWeekday(nextExpr);
        }

        // "last monday", "past friday", "last week/month/year" — most recent occurrence, strictly before today
        if (!result) {
          const lastExpr = expr.match(/^(?:last|past)\s+(.+)$/);
          if (lastExpr) {
            const target = lastExpr[1];
            if (target === 'week') { d.setDate(d.getDate() - 7); result = d; }
            else if (target === 'month') { d.setMonth(d.getMonth() - 1); result = d; }
            else if (target === 'year') { d.setFullYear(d.getFullYear() - 1); result = d; }
            else if (WEEKDAYS.includes(target)) {
              const t = WEEKDAYS.indexOf(target);
              const diff = ((d.getDay() - t + 7) % 7) || 7;
              d.setDate(d.getDate() - diff);
              result = d;
            }
          }
        }

        // bare weekday name: "monday", "friday"
        if (!result && WEEKDAYS.includes(expr)) {
          result = nextWeekday(expr);
        }
      }

      if (!result) {
        return { ok: false, result: `Could not resolve date expression: "${args.expression}". Please use an absolute date like YYYY-MM-DD.`, diffCard: null };
      }

      const iso = `${result.getFullYear()}-${String(result.getMonth() + 1).padStart(2, '0')}-${String(result.getDate()).padStart(2, '0')}`;
      const friendly = result.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const timeSuffix = time ? `T${time} — ${friendly} at ${time}` : ` — ${friendly}`;
      return { ok: true, result: `${iso}${timeSuffix}`, diffCard: null };
    }

    case 'getTasks': {
      const filters = {
        spaceId: spaceId,
        ...args.projectId    && { projectId: args.projectId },
        ...args.assignedTo   && { assignedTo: args.assignedTo },
        ...args.status       && { status: args.status },
        ...args.priority     && { priority: args.priority },
        ...args.areaId       && { areaId: args.areaId },
        ...args.parentTaskId && { parentTaskId: args.parentTaskId },
        ...args.tag          && { tag: args.tag },
        ...args.dueFrom      && { dueFrom: args.dueFrom },
        ...args.dueTo        && { dueTo: args.dueTo },
        ...args.search       && { search: args.search },
        isCompleted: args.isCompleted || false,
        limit: args.limit || 50,
      };
      const tasks = taskService.getTasks(filters);
      const summary = tasks.length
        ? tasks.map(t => `[${t.id}] "${t.title}" — ${t.status}, ${t.priority} priority${t.due_date ? ', due ' + t.due_date : ''}${t.assigned_to_name ? ', assigned to ' + t.assigned_to_name : ''}`).join('\n')
        : 'No tasks found matching those filters.';
      return { ok: true, result: summary, diffCard: null };
    }

    case 'createTask': {
      const data = toTaskFields({
        title:        args.title,
        space_id:     spaceId,
        projectId:    args.projectId,
        phaseId:      args.phaseId,
        assignedTo:   args.assignedTo ?? user.id,  // default to requesting user
        areaId:       args.areaId,
        dueDate:      args.dueDate,
        startAt:      args.startAt,
        endAt:        args.endAt,
        priority:     args.priority || 'medium',
        description:  args.description,
        isRecurring:  !!args.recur,
        recurInterval: args.recur || null,
        recurDays:    args.recur === 'weekdays' && Array.isArray(args.recurDays) ? args.recurDays.join(',') : null,
        tags:         args.tags || [],
      });
      const task = taskService.createTask(data, user.id);
      if (io) io.emit('task:created', { task });

      // Optional subtasks — created nested under the new task (a deadline lives on the parent only).
      const createdSubtasks = [];
      for (const sub of (args.subtasks || [])) {
        if (!sub || !sub.title) continue; // skip malformed subtask objects from LLM
        const subtask = taskService.createTask(toTaskFields({
          title:        sub.title,
          space_id:     spaceId,
          description:  sub.description,
          startAt:      sub.startAt,
          endAt:        sub.endAt,
          priority:     sub.priority || 'medium',
          assignedTo:   sub.assignedTo ?? args.assignedTo ?? user.id,
          parentTaskId: task.id,
          projectId:    args.projectId,
        }), user.id);
        if (io) io.emit('task:created', { task: subtask });
        createdSubtasks.push(subtask);
      }

      const projectName = task.project_name || null;
      const assignedTo = task.assigned_to_name || null;
      const parts = [`Created task "${task.title}"`];
      if (projectName) parts.push(`in ${projectName}`);
      if (task.due_date) parts.push(`due ${formatDate(task.due_date)}`);
      if (assignedTo) parts.push(`assigned to ${assignedTo}`);
      if (createdSubtasks.length) parts.push(`with ${createdSubtasks.length} subtask${createdSubtasks.length !== 1 ? 's' : ''}`);
      return { ok: true, result: createdSubtasks.length ? { task, subtasks: createdSubtasks } : task, diffCard: parts.join(', ') };
    }

    case 'createEvent': {
      const result = db.prepare(`
        INSERT INTO events
          (title, description, start_datetime, end_datetime, all_day, location,
           project_id, created_by, is_recurring, recur_interval, recur_end_date, space_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        args.title, args.description ?? null, args.startDatetime, args.endDatetime ?? null,
        args.allDay ? 1 : 0, args.location ?? null,
        args.projectId ?? null, user.id, args.recur ? 1 : 0, args.recur ?? null,
        args.recurEndDate ?? null, spaceId,
      );
      const eventId = result.lastInsertRowid;
      const insertAttendee = db.prepare('INSERT OR IGNORE INTO event_attendees (event_id, user_id) VALUES (?, ?)');
      insertAttendee.run(eventId, user.id);
      for (const uid of (args.attendeeIds || [])) {
        if (uid !== user.id) insertAttendee.run(eventId, uid);
      }
      const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
      if (io) io.emit('event:created', { event });
      return { ok: true, result: event, diffCard: `Created event "${event.title}", starting ${formatDate(event.start_datetime)}` };
    }

    case 'updateTask': {
      if (!ownsRow(db, 'tasks', args.taskId, spaceId)) return { ok: false, result: `Task ${args.taskId} not found.`, diffCard: null };
      const fields = toTaskFields(args.fields || {});
      const task = taskService.updateTask(args.taskId, fields, user.id);
      if (!task) return { ok: false, result: `Task ${args.taskId} not found.`, diffCard: null };
      if (io) io.emit('task:updated', { task });
      return {
        ok: true,
        result: task,
        diffCard: `Updated task "${task.title}" (ID: ${task.id})`,
      };
    }

    case 'completeTask': {
      // Accepts a single taskId or a taskIds array — cross-space ids are skipped.
      const ids = args.taskIds?.length ? args.taskIds : (args.taskId != null ? [args.taskId] : []);
      const done = [];
      for (const id of ids) {
        if (!ownsRow(db, 'tasks', id, spaceId)) continue;
        const task = taskService.completeTask(id, user.id);
        if (task) {
          done.push(task.title);
          if (io) io.emit('task:completed', { taskId: task.id, completedBy: user.id });
        }
      }
      if (!done.length) return { ok: false, result: 'No matching task to complete.', diffCard: null };
      return {
        ok: true,
        result: `Completed ${done.length} task(s).`,
        diffCard: done.length === 1 ? `Marked "${done[0]}" as complete` : `Completed ${done.length} task(s): ${done.join(', ')}`,
      };
    }

    case 'deleteTask': {
      if (!ownsRow(db, 'tasks', args.taskId, spaceId)) return { ok: false, result: `Task ${args.taskId} not found.`, diffCard: null };
      const taskRow = db.prepare('SELECT title FROM tasks WHERE id = ?').get(args.taskId);
      const ok = taskService.deleteTask(args.taskId, user.id);
      if (!ok) return { ok: false, result: `Task ${args.taskId} not found.`, diffCard: null };
      if (io) io.emit('task:deleted', { taskId: args.taskId });
      return {
        ok: true,
        result: `Task ${args.taskId} deleted.`,
        diffCard: `Deleted task "${taskRow?.title || args.taskId}"`,
      };
    }

    case 'rescheduleTasks': {
      const updated = [];
      for (const taskId of args.taskIds) {
        if (!ownsRow(db, 'tasks', taskId, spaceId)) continue;
        const task = taskService.updateTask(taskId, { due_date: args.newDueDate }, user.id);
        if (task) {
          updated.push(task.title);
          if (io) io.emit('task:updated', { task });
        }
      }
      return {
        ok: true,
        result: `Rescheduled ${updated.length} task(s) to ${args.newDueDate}.`,
        diffCard: `Rescheduled ${updated.length} task(s) to ${formatDate(args.newDueDate)}: ${updated.join(', ')}`,
      };
    }

    case 'createList': {
      const result = db.prepare(
        'INSERT INTO lists (name, icon, created_by, space_id) VALUES (?, ?, ?, ?)'
      ).run(args.name, args.icon || 'list', user.id, spaceId);
      const list = db.prepare('SELECT * FROM lists WHERE id = ?').get(result.lastInsertRowid);
      return {
        ok: true,
        result: list,
        diffCard: `Created list "${list.name}"`,
      };
    }

    case 'createProject': {
      const result = db.prepare(`
        INSERT INTO projects (name, description, status, owner_id, start_date, end_date, space_id)
        VALUES (?, ?, 'active', ?, ?, ?, ?)
      `).run(
        args.name,
        args.description || null,
        user.id,
        args.startDate || null,
        args.endDate || null,
        spaceId,
      );
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
      if (args.memberIds?.length) {
        const addMember = db.prepare(
          'INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)'
        );
        for (const uid of args.memberIds) addMember.run(project.id, uid);
      }
      if (io) io.emit('project:updated', { project });
      return {
        ok: true,
        result: project,
        diffCard: `Created project "${project.name}"${args.endDate ? ', due ' + formatDate(args.endDate) : ''}`,
      };
    }

    case 'updateProject': {
      if (!ownsRow(db, 'projects', args.projectId, spaceId)) return { ok: false, result: `Project ${args.projectId} not found.`, diffCard: null };
      const fieldMap = {
        name: 'name', description: 'description', status: 'status',
        endDate: 'end_date',
      };
      const updates = {};
      for (const [k, v] of Object.entries(args.fields || {})) {
        const col = fieldMap[k] || k;
        updates[col] = v;
      }
      if (!Object.keys(updates).length) {
        return { ok: false, result: 'No valid fields to update.', diffCard: null };
      }
      const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      db.prepare(`UPDATE projects SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), args.projectId);
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(args.projectId);
      if (io) io.emit('project:updated', { project });
      return {
        ok: true,
        result: project,
        diffCard: `Updated project "${project?.name || args.projectId}"`,
      };
    }

    case 'getSummary': {
      const now = new Date();
      let from, label;
      if (args.period === 'today') {
        from = now.toISOString().split('T')[0];
        label = 'today';
      } else if (args.period === 'week') {
        const d = new Date(now); d.setDate(d.getDate() - 7);
        from = d.toISOString().split('T')[0];
        label = 'this week';
      } else {
        const d = new Date(now); d.setMonth(d.getMonth() - 1);
        from = d.toISOString().split('T')[0];
        label = 'this month';
      }
      const to = now.toISOString().split('T')[0];

      let summary;
      if (args.scope === 'project' && args.projectId) {
        if (!ownsRow(db, 'projects', args.projectId, spaceId)) return { ok: false, result: `Project ${args.projectId} not found.`, diffCard: null };
        const project = db.prepare('SELECT name, status FROM projects WHERE id = ?').get(args.projectId);
        const s = db.prepare(`
          SELECT COUNT(*) AS total,
            SUM(CASE WHEN is_completed = 1 THEN 1 ELSE 0 END) AS done,
            SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked,
            SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
            SUM(CASE WHEN is_completed = 0 AND due_date < date('now') THEN 1 ELSE 0 END) AS overdue
          FROM tasks WHERE project_id = ? AND archived = 0
        `).get(args.projectId);
        const progress = s.total ? Math.round((s.done / s.total) * 100) : 0;
        summary = `Project "${project?.name || args.projectId}" [${project?.status || '—'}] — ${progress}% complete (${s.done || 0}/${s.total || 0}). Overdue: ${s.overdue || 0}, Blocked: ${s.blocked || 0}, In progress: ${s.in_progress || 0}.`;
      } else {
        const completed = db.prepare(
          "SELECT COUNT(*) AS n FROM tasks WHERE space_id = ? AND is_completed = 1 AND date(completed_at) >= ? AND date(completed_at) <= ?"
        ).get(spaceId, from, to);
        const created = db.prepare(
          "SELECT COUNT(*) AS n FROM tasks WHERE space_id = ? AND date(created_at) >= ? AND date(created_at) <= ?"
        ).get(spaceId, from, to);
        const overdue = db.prepare(
          "SELECT COUNT(*) AS n FROM tasks WHERE space_id = ? AND is_completed = 0 AND due_date < date('now') AND archived = 0"
        ).get(spaceId);
        summary = `Household ${label}: ${completed.n} tasks completed, ${created.n} created, ${overdue.n} currently overdue.`;
      }
      return { ok: true, result: summary, diffCard: null };
    }

    // ── List Item Tools ────────────────────────────────────────────────────────

    case 'getListItems': {
      if (!ownsRow(db, 'lists', args.listId, spaceId)) return { ok: false, result: `List ${args.listId} not found.`, diffCard: null };
      let query = `
        SELECT li.id, li.title, li.notes, li.is_completed, li.task_id, li.project_id,
          t.title AS task_title,
          p.name  AS project_name
        FROM list_items li
        LEFT JOIN tasks t    ON li.task_id    = t.id
        LEFT JOIN projects p ON li.project_id = p.id
        WHERE li.list_id = ?
      `;
      const params = [args.listId];
      if (!args.includeCompleted) {
        query += ' AND li.is_completed = 0';
      }
      query += ' ORDER BY li.sort_order ASC, li.created_at ASC';
      const items = db.prepare(query).all(...params);
      if (!items.length) return { ok: true, result: 'No items found in that list.', diffCard: null };
      const lines = items.map(i => {
        const check = i.is_completed ? '✓' : '○';
        const extra = [i.task_title && `task: ${i.task_title}`, i.project_name && `project: ${i.project_name}`].filter(Boolean).join(', ');
        return `[${i.id}] ${check} "${i.title}"${extra ? ` (${extra})` : ''}`;
      }).join('\n');
      return { ok: true, result: lines, diffCard: null };
    }

    case 'createListItem': {
      if (!ownsRow(db, 'lists', args.listId, spaceId)) return { ok: false, result: `List ${args.listId} not found.`, diffCard: null };
      const taskId = args.taskId ?? null;
      let resolvedProjectId = args.projectId ?? null;
      if (taskId) {
        const task = db.prepare('SELECT project_id FROM tasks WHERE id = ?').get(taskId);
        resolvedProjectId = task?.project_id ?? resolvedProjectId;
      }
      const result = db.prepare(`
        INSERT INTO list_items (list_id, title, notes, task_id, project_id, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(args.listId, args.title, args.notes ?? null, taskId, resolvedProjectId, user.id);
      const item = db.prepare('SELECT * FROM list_items WHERE id = ?').get(result.lastInsertRowid);
      const list = db.prepare('SELECT name FROM lists WHERE id = ?').get(args.listId);
      if (io) io.emit('listitem:created', { item });
      return {
        ok: true,
        result: item,
        diffCard: `Added "${args.title}" to ${list?.name || `list ${args.listId}`}`,
      };
    }

    case 'completeListItem': {
      if (!ownsRow(db, 'list_items', args.itemId, spaceId)) return { ok: false, result: `List item ${args.itemId} not found.`, diffCard: null };
      const item = db.prepare('SELECT * FROM list_items WHERE id = ?').get(args.itemId);
      if (!item) return { ok: false, result: `List item ${args.itemId} not found.`, diffCard: null };
      db.prepare(`
        UPDATE list_items SET is_completed = ?, completed_at = ?, completed_by = ? WHERE id = ?
      `).run(
        args.completed ? 1 : 0,
        args.completed ? new Date().toISOString() : null,
        args.completed ? user.id : null,
        args.itemId
      );
      const updated = db.prepare('SELECT * FROM list_items WHERE id = ?').get(args.itemId);
      if (io) io.emit('listitem:updated', { item: updated });
      const verb = args.completed ? 'Checked off' : 'Unchecked';
      return { ok: true, result: updated, diffCard: `${verb} "${item.title}"` };
    }

    case 'deleteListItem': {
      if (!ownsRow(db, 'list_items', args.itemId, spaceId)) return { ok: false, result: `List item ${args.itemId} not found.`, diffCard: null };
      const item = db.prepare('SELECT * FROM list_items WHERE id = ?').get(args.itemId);
      if (!item) return { ok: false, result: `List item ${args.itemId} not found.`, diffCard: null };
      db.prepare('DELETE FROM list_items WHERE id = ?').run(args.itemId);
      if (io) io.emit('listitem:deleted', { itemId: args.itemId });
      return { ok: true, result: `Item ${args.itemId} deleted.`, diffCard: `Removed "${item.title}" from list` };
    }

    default:
      return { ok: false, result: `Unknown tool: ${toolName}`, diffCard: null };
  }
}

module.exports = { handleToolCall, ownsRow };
