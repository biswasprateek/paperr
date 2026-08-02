const { getDb } = require('../db/db');

function notify(userId, { spaceId, projectId, taskId, type, message }) {
  const db = getDb();
  db.prepare(`
    INSERT INTO notifications (user_id, space_id, project_id, task_id, type, message)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, spaceId || null, projectId || null, taskId || null, type, message);
}

function getProjectWatchers(projectId, excludeUserId) {
  const db = getDb();
  return db.prepare(`
    SELECT user_id FROM project_members WHERE project_id = ? AND is_watcher = 1 AND user_id != ?
  `).all(projectId, excludeUserId || -1).map(r => r.user_id);
}

// Notifies every watcher of a project, plus (optionally) the task's current
// assignee — deduped so a watching assignee only gets one notification.
function notifyProjectWatchers(projectId, { spaceId, taskId, type, message, excludeUserId, alsoNotifyUserId }) {
  const recipients = new Set(getProjectWatchers(projectId, excludeUserId));
  if (alsoNotifyUserId && alsoNotifyUserId !== excludeUserId) recipients.add(alsoNotifyUserId);
  for (const userId of recipients) {
    notify(userId, { spaceId, projectId, taskId, type, message });
  }
}

module.exports = { notify, notifyProjectWatchers, getProjectWatchers };
