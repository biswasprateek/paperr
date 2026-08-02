const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { getDb } = require('../db/db');
const { hashPassword, comparePassword } = require('../auth/bcrypt');
const { requireAuth, requireAdmin, requireSpace } = require('../auth/middleware');

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.resolve(process.env.UPLOADS_PATH || './uploads', 'avatars');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `user_${req.params.id}_${Date.now()}${ext}`);
  },
});

const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Images only'));
    cb(null, true);
  },
});

function safeUser(u) {
  if (!u) return null;
  const { password_hash, pin_hash, ...safe } = u;
  return safe;
}

// GET /api/users — admin: all; member: names+avatars only
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  if (req.user.role === 'admin') {
    const users = db.prepare('SELECT * FROM users WHERE is_active = 1').all();
    return res.json(users.map(safeUser));
  }
  const users = db.prepare('SELECT id, display_name, avatar_url, avatar_colour FROM users WHERE is_active = 1').all();
  return res.json(users);
});

// GET /api/users/:id
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const targetId = parseInt(req.params.id);
  if (req.user.role !== 'admin' && req.user.id !== targetId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(targetId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json(safeUser(user));
});

// POST /api/users — admin only. New member is added to the requesting
// admin's current space so they land in it on first login instead of
// hitting the "no spaces" screen.
router.post('/', requireAuth, requireAdmin, requireSpace, async (req, res) => {
  try {
    const { display_name, username, password, pin, role, avatar_colour } = req.body;
    if (!display_name || !username) return res.status(400).json({ error: 'display_name and username required' });

    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return res.status(409).json({ error: 'Username already taken' });

    const passwordHash = password ? await hashPassword(password) : null;
    const pinHash = pin ? await hashPassword(pin) : null;

    const create = db.transaction(() => {
      const result = db.prepare(
        `INSERT INTO users (display_name, username, password_hash, pin_hash, role, avatar_colour)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(display_name, username, passwordHash, pinHash, role || 'member', avatar_colour || '#6366f1');

      db.prepare('INSERT INTO space_members (space_id, user_id, role) VALUES (?, ?, ?)')
        .run(req.spaceId, result.lastInsertRowid, role === 'admin' ? 'admin' : 'member');

      return result.lastInsertRowid;
    });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(create());
    return res.status(201).json(safeUser(user));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to create user' });
  }
});

// PUT /api/users/:id
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    const db = getDb();

    const isAdmin = req.user.role === 'admin';
    const isSelf = req.user.id === targetId;

    if (!isAdmin && !isSelf) return res.status(403).json({ error: 'Forbidden' });

    const allowedSelf  = ['display_name', 'nickname', 'username', 'avatar_url', 'avatar_colour', 'preferences_json'];
    const allowedAdmin = [...allowedSelf, 'role', 'is_active'];

    const allowed = isAdmin ? allowedAdmin : allowedSelf;
    const updates = {};

    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    // Username uniqueness check when self changes it
    if (updates.username && updates.username !== req.user.username) {
      const taken = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(updates.username, targetId);
      if (taken) return res.status(409).json({ error: 'Username already taken' });
    }

    // Password change
    if (req.body.password) {
      if (isAdmin) {
        // Admin resets without needing current password
        updates.password_hash = await hashPassword(req.body.password);
      } else if (isSelf) {
        // Self-service: must supply current password to verify identity
        if (!req.body.currentPassword) {
          return res.status(400).json({ error: 'Current password required' });
        }
        const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(targetId);
        const valid = row?.password_hash && await comparePassword(req.body.currentPassword, row.password_hash);
        if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
        updates.password_hash = await hashPassword(req.body.password);
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), targetId];

    db.prepare(`UPDATE users SET ${setClauses} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
    return res.json(safeUser(updated));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to update user' });
  }
});

// POST /api/users/:id/avatar
router.post('/:id/avatar', requireAuth, uploadAvatar.single('avatar'), (req, res) => {
  try {
    const targetId = parseInt(req.params.id);
    if (req.user.role !== 'admin' && req.user.id !== targetId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    const db = getDb();

    // Remove old avatar file if it's a local upload
    const existing = db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(targetId);
    if (existing?.avatar_url?.startsWith('/uploads/')) {
      const oldPath = path.resolve(process.env.UPLOADS_PATH || './uploads', existing.avatar_url.replace('/uploads/', ''));
      fs.rm(oldPath, () => {});
    }

    db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, targetId);
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
    return res.json(safeUser(updated));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Upload failed' });
  }
});

// DELETE /api/users/:id — admin only (soft delete)
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const targetId = parseInt(req.params.id);

  if (req.user.id === targetId) {
    return res.status(400).json({ error: 'Cannot deactivate your own account' });
  }

  db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(targetId);
  return res.json({ success: true });
});

// GET /api/users/sessions — admin: all active sessions
router.get('/admin/sessions', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const sessions = db.prepare(`
    SELECT s.*, u.display_name, u.username
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.expires_at > datetime('now')
    ORDER BY s.last_seen DESC
  `).all();
  return res.json(sessions);
});

// DELETE /api/users/sessions/:sessionId — admin only
router.delete('/admin/sessions/:sessionId', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE id = ?').run(parseInt(req.params.sessionId));
  return res.json({ success: true });
});

module.exports = router;
