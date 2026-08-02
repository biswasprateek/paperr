const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getDb, isFirstRun, seedDefaultData } = require('../db/db');
const { hashPassword, comparePassword } = require('../auth/bcrypt');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../auth/jwt');
const { recordFailedAttempt, isLocked, getRemainingLockSeconds, clearAttempts } = require('../auth/bruteForce');
const { requireAuth, requireAdmin } = require('../auth/middleware');
const { PREDEFINED_AREAS } = require('./spaces');

function getUserSpaces(db, userId) {
  return db.prepare(`
    SELECT s.*, sm.role AS my_role,
      (SELECT COUNT(*) FROM space_members WHERE space_id = s.id) AS member_count
    FROM spaces s
    JOIN space_members sm ON sm.space_id = s.id AND sm.user_id = ?
    ORDER BY s.created_at ASC
  `).all(userId);
}

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production' && process.env.HTTPS_ENABLED === 'true',
};

// ─── POST /api/auth/setup ────────────────────────────────────────────────────
// First-run setup wizard
router.post('/setup', async (req, res) => {
  try {
    if (!isFirstRun()) {
      return res.status(400).json({ error: 'Setup already completed' });
    }

    const { householdName, adminUsername, adminPassword, adminDisplayName, spaceType = 'family', pin } = req.body;
    if (!adminUsername || !adminPassword || !adminDisplayName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (pin && !/^\d{6}$/.test(pin)) {
      return res.status(400).json({ error: 'PIN must be 6 digits' });
    }

    const type = ['family', 'team'].includes(spaceType) ? spaceType : 'family';
    const defaultIcon = type === 'team' ? '💼' : '🏠';

    const db = getDb();
    const passwordHash = await hashPassword(adminPassword);
    const pinHash = pin ? await hashPassword(pin) : null;

    const result = db.prepare(
      `INSERT INTO users (display_name, username, password_hash, pin_hash, role) VALUES (?, ?, ?, ?, 'admin')`
    ).run(adminDisplayName, adminUsername, passwordHash, pinHash);

    const admin = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);

    const spaceName = householdName?.trim() || (type === 'team' ? 'My Team' : 'Our Home');
    if (householdName) {
      db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('household_name', ?)`).run(spaceName);
    }

    // Create the first space and seed its predefined areas
    const { lastInsertRowid: spaceId } = db.prepare(
      `INSERT INTO spaces (name, type, icon, colour, created_by) VALUES (?, ?, ?, '#F97316', ?)`
    ).run(spaceName, type, defaultIcon, admin.id);
    db.prepare('INSERT INTO space_members (space_id, user_id, role) VALUES (?, ?, ?)').run(spaceId, admin.id, 'admin');
    const insertArea = db.prepare('INSERT INTO areas (name, icon, space_id) VALUES (?, ?, ?)');
    for (const a of PREDEFINED_AREAS[type]) insertArea.run(a.name, a.icon, spaceId);

    seedDefaultData(admin, spaceId, type);

    return res.json({ success: true, message: 'Setup complete' });
  } catch (err) {
    console.error('Setup error:', err);
    return res.status(500).json({ error: 'Setup failed', detail: err.message });
  }
});

// ─── GET /api/auth/status ────────────────────────────────────────────────────
router.get('/status', (req, res) => {
  res.json({ firstRun: isFirstRun() });
});

// ─── POST /api/auth/register ─────────────────────────────────────────────────
// Public self-registration. New account has no space memberships yet — the
// client sends them to browse/request-join or create-space after this.
router.post('/register', async (req, res) => {
  try {
    if (isFirstRun()) {
      return res.status(400).json({ error: 'Use setup to create the first account' });
    }

    const { displayName, username, password, pin } = req.body;
    if (!displayName?.trim() || !username?.trim() || !password) {
      return res.status(400).json({ error: 'displayName, username and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (pin && !/^\d{6}$/.test(pin)) {
      return res.status(400).json({ error: 'PIN must be 6 digits' });
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
    if (existing) return res.status(409).json({ error: 'Username already taken' });

    const passwordHash = await hashPassword(password);
    const pinHash = pin ? await hashPassword(pin) : null;

    const result = db.prepare(
      `INSERT INTO users (display_name, username, password_hash, pin_hash, role) VALUES (?, ?, ?, ?, 'member')`
    ).run(displayName.trim(), username.trim(), passwordHash, pinHash);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);

    const tokenPayload = { userId: user.id, role: user.role };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    const deviceLabel = req.headers['user-agent']?.slice(0, 100) || 'unknown';

    db.prepare(
      `INSERT INTO sessions (user_id, token_hash, device_label, last_seen, expires_at) VALUES (?, ?, ?, datetime('now'), ?)`
    ).run(user.id, tokenHash, deviceLabel, expiresAt);

    res.cookie('access_token', accessToken, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.cookie('refresh_token', refreshToken, { ...COOKIE_OPTS, maxAge: 90 * 24 * 60 * 60 * 1000 });

    const { password_hash, pin_hash, ...safeUser } = user;
    return res.status(201).json({ user: safeUser, accessToken, spaces: [] });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

// ─── POST /api/auth/login ────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password, pin } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });

    if (isLocked(username)) {
      const secs = getRemainingLockSeconds(username);
      return res.status(429).json({ error: `Account locked. Try again in ${secs}s.` });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);

    if (!user) {
      recordFailedAttempt(username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    let valid = false;

    if (pin) {
      if (!user.pin_hash) return res.status(401).json({ error: 'PIN not set for this user' });
      valid = await comparePassword(pin, user.pin_hash);
    } else if (password) {
      if (!user.password_hash) return res.status(401).json({ error: 'Password not set for this user' });
      valid = await comparePassword(password, user.password_hash);
    } else {
      return res.status(400).json({ error: 'Password or PIN required' });
    }

    if (!valid) {
      recordFailedAttempt(username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    clearAttempts(username);

    const tokenPayload = { userId: user.id, role: user.role };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Store session
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    const deviceLabel = req.headers['user-agent']?.slice(0, 100) || 'unknown';

    db.prepare(
      `INSERT INTO sessions (user_id, token_hash, device_label, last_seen, expires_at) VALUES (?, ?, ?, datetime('now'), ?)`
    ).run(user.id, tokenHash, deviceLabel, expiresAt);

    res.cookie('access_token', accessToken, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.cookie('refresh_token', refreshToken, { ...COOKIE_OPTS, maxAge: 90 * 24 * 60 * 60 * 1000 });

    const { password_hash, pin_hash, ...safeUser } = user;
    const spaces = getUserSpaces(db, user.id);
    return res.json({ user: safeUser, accessToken, spaces });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// ─── POST /api/auth/logout ───────────────────────────────────────────────────
router.post('/logout', requireAuth, (req, res) => {
  const db = getDb();
  const refreshToken = req.cookies?.refresh_token;
  if (refreshToken) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  }
  res.clearCookie('access_token');
  res.clearCookie('refresh_token');
  return res.json({ success: true });
});

// ─── POST /api/auth/refresh ──────────────────────────────────────────────────
router.post('/refresh', (req, res) => {
  const refreshToken = req.cookies?.refresh_token;
  if (!refreshToken) return res.status(401).json({ error: 'No refresh token' });

  try {
    const payload = verifyRefreshToken(refreshToken);
    const db = getDb();

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const session = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(tokenHash);

    if (!session) return res.status(401).json({ error: 'Session not found' });

    const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(payload.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });

    // Update last_seen
    db.prepare(`UPDATE sessions SET last_seen = datetime('now') WHERE token_hash = ?`).run(tokenHash);

    const newAccessToken = generateAccessToken({ userId: user.id, role: user.role });
    res.cookie('access_token', newAccessToken, { ...COOKIE_OPTS, maxAge: 7 * 24 * 60 * 60 * 1000 });

    const { password_hash, pin_hash, ...safeUser } = user;
    return res.json({ user: safeUser, accessToken: newAccessToken });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// ─── POST /api/auth/reset-password ──────────────────────────────────────────
router.post('/reset-password', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword) return res.status(400).json({ error: 'userId and newPassword required' });

    const db = getDb();
    const hash = await hashPassword(newPassword);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reset password' });
  }
});

// ─── POST /api/auth/change-pin ───────────────────────────────────────────────
router.post('/change-pin', requireAuth, async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin || !/^\d{6}$/.test(pin)) {
      return res.status(400).json({ error: 'PIN must be 6 digits' });
    }
    const db = getDb();
    const hash = await hashPassword(pin);
    db.prepare('UPDATE users SET pin_hash = ? WHERE id = ?').run(hash, req.user.id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to change PIN' });
  }
});

// ─── POST /api/auth/reset-pin ────────────────────────────────────────────────
router.post('/reset-pin', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { userId, newPin } = req.body;
    if (!userId || !/^\d{6}$/.test(newPin || '')) {
      return res.status(400).json({ error: 'userId and a 6-digit newPin are required' });
    }
    const db = getDb();
    const hash = await hashPassword(newPin);
    db.prepare('UPDATE users SET pin_hash = ? WHERE id = ?').run(hash, userId);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reset PIN' });
  }
});

// ─── GET /api/auth/me ────────────────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  const { password_hash, pin_hash, ...safeUser } = req.user;
  const db = getDb();
  const spaces = getUserSpaces(db, req.user.id);
  res.json({ user: safeUser, spaces });
});

module.exports = router;
