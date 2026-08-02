const express = require('express');
const router = express.Router();
const { getDb, seedDefaultData } = require('../db/db');
const { getFrameFilesDb } = require('../db/frameFilesDb');
const { requireAuth, requireSpaceAdmin } = require('../auth/middleware');

// Every route below acts on the space named in the URL (:id), not whatever
// space happens to be "active" — unlike requireSpace (used by every other
// router), which reads X-Space-Id because those routers have no space id in
// their path. Using requireSpace here would silently operate on the wrong
// space whenever a user edits/deletes a space that isn't their current one.
function requireSpaceParam(req, res, next) {
  const spaceId = parseInt(req.params.id);
  if (!spaceId || isNaN(spaceId)) return res.status(400).json({ error: 'Invalid space id' });
  const db = getDb();
  const membership = db.prepare(
    'SELECT role FROM space_members WHERE space_id = ? AND user_id = ?'
  ).get(spaceId, req.user.id);
  if (!membership) return res.status(403).json({ error: 'Not a member of this space', code: 'SPACE_FORBIDDEN' });
  req.spaceId   = spaceId;
  req.spaceRole = membership.role;
  next();
}

const PREDEFINED_AREAS = {
  family: [
    { name: 'Kitchen',     icon: '🍳' },
    { name: 'Living Room', icon: '🛋️' },
    { name: 'Bedroom',     icon: '🛏️' },
    { name: 'Bathroom',    icon: '🚿' },
    { name: 'Office',      icon: '🖥️' },
    { name: 'Garden',      icon: '🌿' },
    { name: 'Garage',      icon: '🚗' },
  ],
  team: [
    { name: 'Development', icon: '💻' },
    { name: 'Design',      icon: '🎨' },
    { name: 'Marketing',   icon: '📢' },
    { name: 'Sales',       icon: '📈' },
    { name: 'Operations',  icon: '⚙️' },
    { name: 'HR',          icon: '👥' },
    { name: 'Finance',     icon: '💰' },
  ],
};

function getUserSpaces(db, userId) {
  return db.prepare(`
    SELECT s.*, sm.role AS my_role,
      (SELECT COUNT(*) FROM space_members WHERE space_id = s.id) AS member_count
    FROM spaces s
    JOIN space_members sm ON sm.space_id = s.id AND sm.user_id = ?
    ORDER BY s.created_at ASC
  `).all(userId);
}

// List all spaces the current user belongs to
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  return res.json(getUserSpaces(db, req.user.id));
});

// Public directory of spaces someone can request to join — no auth required
// so it can be shown on the login screen. Only minimal, non-sensitive info.
router.get('/discoverable', (req, res) => {
  const db = getDb();
  const spaces = db.prepare(`
    SELECT s.id, s.name, s.type, s.icon, s.colour,
      (SELECT COUNT(*) FROM space_members WHERE space_id = s.id) AS member_count
    FROM spaces s
    ORDER BY s.name ASC
  `).all();
  return res.json(spaces);
});

// The current user's own join requests (any status) — lets the client show
// "requested" / "denied" state instead of the "request to join" button.
router.get('/join-requests/mine', requireAuth, (req, res) => {
  const db = getDb();
  const requests = db.prepare(`
    SELECT r.*, s.name AS space_name, s.icon AS space_icon
    FROM space_join_requests r
    JOIN spaces s ON s.id = r.space_id
    WHERE r.user_id = ?
    ORDER BY r.created_at DESC
  `).all(req.user.id);
  return res.json(requests);
});

// Request to join a space — the requester is not yet a member, so this
// intentionally does not use requireSpaceParam (which would 403 non-members).
router.post('/:id/join-requests', requireAuth, (req, res) => {
  const db = getDb();
  const spaceId = parseInt(req.params.id);
  const space = db.prepare('SELECT id FROM spaces WHERE id = ?').get(spaceId);
  if (!space) return res.status(404).json({ error: 'Space not found' });

  const alreadyMember = db.prepare(
    'SELECT 1 FROM space_members WHERE space_id = ? AND user_id = ?'
  ).get(spaceId, req.user.id);
  if (alreadyMember) return res.status(409).json({ error: 'Already a member of this space' });

  const pending = db.prepare(
    "SELECT 1 FROM space_join_requests WHERE space_id = ? AND user_id = ? AND status = 'pending'"
  ).get(spaceId, req.user.id);
  if (pending) return res.status(409).json({ error: 'Join request already pending' });

  const { message } = req.body;
  const result = db.prepare(
    'INSERT INTO space_join_requests (space_id, user_id, message) VALUES (?, ?, ?)'
  ).run(spaceId, req.user.id, message?.trim() || null);

  const request = db.prepare('SELECT * FROM space_join_requests WHERE id = ?').get(result.lastInsertRowid);
  return res.status(201).json(request);
});

// List pending join requests for a space — space admin only
router.get('/:id/join-requests', requireAuth, requireSpaceParam, requireSpaceAdmin, (req, res) => {
  const db = getDb();
  const requests = db.prepare(`
    SELECT r.*, u.display_name, u.username, u.avatar_url, u.avatar_colour
    FROM space_join_requests r
    JOIN users u ON u.id = r.user_id
    WHERE r.space_id = ? AND r.status = 'pending'
    ORDER BY r.created_at ASC
  `).all(req.spaceId);
  return res.json(requests);
});

// Approve a join request — adds the requester as a member
router.post('/:id/join-requests/:reqId/approve', requireAuth, requireSpaceParam, requireSpaceAdmin, (req, res) => {
  const db = getDb();
  const request = db.prepare(
    "SELECT * FROM space_join_requests WHERE id = ? AND space_id = ? AND status = 'pending'"
  ).get(parseInt(req.params.reqId), req.spaceId);
  if (!request) return res.status(404).json({ error: 'Join request not found' });

  const alreadyMember = db.prepare(
    'SELECT 1 FROM space_members WHERE space_id = ? AND user_id = ?'
  ).get(req.spaceId, request.user_id);
  if (!alreadyMember) {
    db.prepare('INSERT INTO space_members (space_id, user_id, role) VALUES (?, ?, ?)')
      .run(req.spaceId, request.user_id, 'member');
  }
  db.prepare(
    "UPDATE space_join_requests SET status = 'approved', decided_at = datetime('now'), decided_by = ? WHERE id = ?"
  ).run(req.user.id, request.id);

  return res.json({ success: true });
});

// Deny a join request
router.post('/:id/join-requests/:reqId/deny', requireAuth, requireSpaceParam, requireSpaceAdmin, (req, res) => {
  const db = getDb();
  const request = db.prepare(
    "SELECT * FROM space_join_requests WHERE id = ? AND space_id = ? AND status = 'pending'"
  ).get(parseInt(req.params.reqId), req.spaceId);
  if (!request) return res.status(404).json({ error: 'Join request not found' });

  db.prepare(
    "UPDATE space_join_requests SET status = 'denied', decided_at = datetime('now'), decided_by = ? WHERE id = ?"
  ).run(req.user.id, request.id);

  return res.json({ success: true });
});

// Create a new space — creator becomes admin, predefined areas are seeded
router.post('/', requireAuth, (req, res) => {
  const db = getDb();
  const { name, type, icon, colour } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  if (!['family', 'team'].includes(type)) return res.status(400).json({ error: 'type must be family or team' });

  const defaultIcon = type === 'family' ? '🏠' : '💼';

  const create = db.transaction(() => {
    const { lastInsertRowid: spaceId } = db.prepare(
      'INSERT INTO spaces (name, type, icon, colour, created_by) VALUES (?, ?, ?, ?, ?)'
    ).run(name.trim(), type, icon || defaultIcon, colour || '#F97316', req.user.id);

    db.prepare('INSERT INTO space_members (space_id, user_id, role) VALUES (?, ?, ?)')
      .run(spaceId, req.user.id, 'admin');

    const insertArea = db.prepare('INSERT INTO areas (name, icon, space_id) VALUES (?, ?, ?)');
    for (const a of (PREDEFINED_AREAS[type] || [])) {
      insertArea.run(a.name, a.icon, spaceId);
    }

    seedDefaultData(req.user, spaceId, type);

    return db.prepare('SELECT * FROM spaces WHERE id = ?').get(spaceId);
  });

  const space = create();
  return res.status(201).json({ ...space, my_role: 'admin', member_count: 1 });
});

// Get a single space
router.get('/:id', requireAuth, requireSpaceParam, (req, res) => {
  const db = getDb();
  const space = db.prepare('SELECT * FROM spaces WHERE id = ?').get(req.spaceId);
  return res.json({ ...space, my_role: req.spaceRole });
});

// Update space name/icon/colour
router.put('/:id', requireAuth, requireSpaceParam, requireSpaceAdmin, (req, res) => {
  const db = getDb();
  const { name, icon, colour } = req.body;
  const space = db.prepare('SELECT * FROM spaces WHERE id = ?').get(req.spaceId);
  db.prepare('UPDATE spaces SET name=?, icon=?, colour=? WHERE id=?')
    .run(name ?? space.name, icon ?? space.icon, colour ?? space.colour, req.spaceId);
  return res.json(db.prepare('SELECT * FROM spaces WHERE id = ?').get(req.spaceId));
});

// Delete a space
router.delete('/:id', requireAuth, requireSpaceParam, requireSpaceAdmin, (req, res) => {
  const db = getDb();
  // Prevent deleting if it's the user's only space
  const userSpaceCount = db.prepare(
    'SELECT COUNT(*) AS cnt FROM space_members WHERE user_id = ?'
  ).get(req.user.id).cnt;
  if (userSpaceCount <= 1) {
    return res.status(400).json({ error: 'Cannot delete your only space' });
  }

  // Frame photo bytes live in a separate SQLite file (frameFilesDb.js) with no
  // cross-file FK, so the frame_collections/frame_photos row cascade below
  // won't touch them — purge the blobs first or they're orphaned forever.
  const photoIds = db.prepare(`
    SELECT p.id FROM frame_photos p
    JOIN frame_collections c ON c.id = p.collection_id
    WHERE c.space_id = ?
  `).all(req.spaceId);
  const deleteFile = getFrameFilesDb().prepare('DELETE FROM photo_files WHERE photo_id = ?');
  for (const row of photoIds) deleteFile.run(row.id);

  db.prepare('DELETE FROM spaces WHERE id = ?').run(req.spaceId);
  return res.json({ success: true });
});

// List members of a space
router.get('/:id/members', requireAuth, requireSpaceParam, (req, res) => {
  const db = getDb();
  const members = db.prepare(`
    SELECT u.id, u.display_name, u.username, u.avatar_url, u.avatar_colour, u.nickname,
           sm.role, sm.joined_at
    FROM space_members sm
    JOIN users u ON u.id = sm.user_id
    WHERE sm.space_id = ?
    ORDER BY sm.joined_at ASC
  `).all(req.spaceId);
  return res.json(members);
});

// Add a member to a space
router.post('/:id/members', requireAuth, requireSpaceParam, requireSpaceAdmin, (req, res) => {
  const db = getDb();
  const { userId, role } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  const user = db.prepare('SELECT id FROM users WHERE id = ? AND is_active = 1').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const existing = db.prepare('SELECT 1 FROM space_members WHERE space_id = ? AND user_id = ?').get(req.spaceId, userId);
  if (existing) return res.status(409).json({ error: 'User is already a member' });
  db.prepare('INSERT INTO space_members (space_id, user_id, role) VALUES (?, ?, ?)')
    .run(req.spaceId, userId, role === 'admin' ? 'admin' : 'member');
  return res.status(201).json({ success: true });
});

// Change a member's role
router.put('/:id/members/:uid', requireAuth, requireSpaceParam, requireSpaceAdmin, (req, res) => {
  const db = getDb();
  const targetId = parseInt(req.params.uid);
  const { role } = req.body;
  if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: 'role must be admin or member' });
  // Prevent removing the last admin
  if (role === 'member') {
    const adminCount = db.prepare(
      "SELECT COUNT(*) AS cnt FROM space_members WHERE space_id = ? AND role = 'admin'"
    ).get(req.spaceId).cnt;
    const targetRole = db.prepare(
      'SELECT role FROM space_members WHERE space_id = ? AND user_id = ?'
    ).get(req.spaceId, targetId)?.role;
    if (targetRole === 'admin' && adminCount <= 1) {
      return res.status(400).json({ error: 'Cannot demote the last admin' });
    }
  }
  db.prepare('UPDATE space_members SET role = ? WHERE space_id = ? AND user_id = ?')
    .run(role, req.spaceId, targetId);
  return res.json({ success: true });
});

// Remove a member
router.delete('/:id/members/:uid', requireAuth, requireSpaceParam, requireSpaceAdmin, (req, res) => {
  const db = getDb();
  const targetId = parseInt(req.params.uid);
  const adminCount = db.prepare(
    "SELECT COUNT(*) AS cnt FROM space_members WHERE space_id = ? AND role = 'admin'"
  ).get(req.spaceId).cnt;
  const targetRole = db.prepare(
    'SELECT role FROM space_members WHERE space_id = ? AND user_id = ?'
  ).get(req.spaceId, targetId)?.role;
  if (targetRole === 'admin' && adminCount <= 1) {
    return res.status(400).json({ error: 'Cannot remove the last admin' });
  }
  db.prepare('DELETE FROM space_members WHERE space_id = ? AND user_id = ?').run(req.spaceId, targetId);
  return res.json({ success: true });
});

// Leave a space
router.post('/:id/leave', requireAuth, requireSpaceParam, (req, res) => {
  const db = getDb();
  const adminCount = db.prepare(
    "SELECT COUNT(*) AS cnt FROM space_members WHERE space_id = ? AND role = 'admin'"
  ).get(req.spaceId).cnt;
  if (req.spaceRole === 'admin' && adminCount <= 1) {
    return res.status(400).json({ error: 'Transfer admin role before leaving' });
  }
  db.prepare('DELETE FROM space_members WHERE space_id = ? AND user_id = ?').run(req.spaceId, req.user.id);
  return res.json({ success: true });
});

module.exports = { router, PREDEFINED_AREAS };
