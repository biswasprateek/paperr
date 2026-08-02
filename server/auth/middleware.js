const { verifyAccessToken } = require('./jwt');
const { getDb } = require('../db/db');

function requireAuth(req, res, next) {
  let token = null;

  // Try Authorization header first
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  // Fall back to cookie
  if (!token && req.cookies && req.cookies.access_token) {
    token = req.cookies.access_token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = verifyAccessToken(token);
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(payload.userId);

    if (!user) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Optional auth — attaches user if token present, but doesn't block if not
function optionalAuth(req, res, next) {
  let token = null;

  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }
  if (!token && req.cookies && req.cookies.access_token) {
    token = req.cookies.access_token;
  }

  if (!token) return next();

  try {
    const payload = verifyAccessToken(token);
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(payload.userId);
    if (user) req.user = user;
  } catch {
    // ignore
  }
  next();
}

function requireSpace(req, res, next) {
  const spaceId = parseInt(req.headers['x-space-id']);
  if (!spaceId || isNaN(spaceId)) {
    return res.status(400).json({ error: 'X-Space-Id header required', code: 'SPACE_REQUIRED' });
  }
  const db = getDb();
  const membership = db.prepare(
    'SELECT role FROM space_members WHERE space_id = ? AND user_id = ?'
  ).get(spaceId, req.user.id);
  if (!membership) {
    return res.status(403).json({ error: 'Not a member of this space', code: 'SPACE_FORBIDDEN' });
  }
  req.spaceId   = spaceId;
  req.spaceRole = membership.role;
  next();
}

function requireSpaceAdmin(req, res, next) {
  if (req.spaceRole !== 'admin') {
    return res.status(403).json({ error: 'Space admin access required' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, optionalAuth, requireSpace, requireSpaceAdmin };
