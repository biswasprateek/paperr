const express = require('express');
const router  = express.Router();
const { getDb } = require('../db/db');
const { requireAuth, requireSpace } = require('../auth/middleware');
const curatedThoughts = require('../ai/curatedThoughts');

router.use(requireAuth, requireSpace);

function emit(req, event, payload) {
  req.app.get('io')?.to(`space:${req.spaceId}`).emit(event, payload);
}

// Allowlist sanitizer — strips every tag except the five inline marks an
// entry is allowed to carry, and drops all attributes even on those (so a
// crafted onerror=/style= can't ride along in stored HTML). No dependency
// needed for a set this small.
const ALLOWED_TAGS = ['b', 'i', 'u', 's', 'br'];
function sanitizeBody(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/<\/?([a-zA-Z0-9]+)[^>]*>/g, (match, tag) => {
    const t = tag.toLowerCase();
    if (!ALLOWED_TAGS.includes(t)) return '';
    if (t === 'br') return '<br>';
    return match.startsWith('</') ? `</${t}>` : `<${t}>`;
  });
}
function toPlain(html) {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// Shared/personal visibility guard — matches the routines_protocols pattern:
// a collection is visible if you created it or its owner shared it, and
// (per that same feature) any space member with visibility may also edit it.
function getVisibleCollection(db, id, spaceId, userId) {
  return db.prepare(`
    SELECT * FROM thought_collections
    WHERE id = ? AND space_id = ? AND (created_by = ? OR visibility = 'shared')
  `).get(id, spaceId, userId);
}

// ── Collections ────────────────────────────────────────────────────────────

router.get('/collections', (req, res, next) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT c.*, (SELECT COUNT(*) FROM thought_entries e WHERE e.collection_id = c.id) AS entry_count
      FROM thought_collections c
      WHERE c.space_id = ? AND (c.created_by = ? OR c.visibility = 'shared')
      ORDER BY c.sort_order ASC, c.id ASC
    `).all(req.spaceId, req.user.id);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/collections', (req, res, next) => {
  try {
    const {
      name = 'New collection', category = 'Affirmations', icon = '💭', color = '#6366f1',
      visibility = 'personal', time_slot = null, show_in_frame = 0,
    } = req.body;
    const db = getDb();
    const result = db.prepare(`
      INSERT INTO thought_collections (space_id, created_by, name, category, icon, color, visibility, time_slot, show_in_frame)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.spaceId, req.user.id, name, category, icon, color,
           visibility === 'shared' ? 'shared' : 'personal', time_slot || null, show_in_frame ? 1 : 0);

    const collection = db.prepare('SELECT * FROM thought_collections WHERE id = ?').get(result.lastInsertRowid);
    emit(req, 'thought:collection_created', collection);
    res.status(201).json(collection);
  } catch (err) { next(err); }
});

const COLLECTION_FIELDS = ['name', 'category', 'icon', 'color', 'enabled', 'visibility', 'time_slot', 'show_in_frame', 'sort_order'];

router.patch('/collections/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const db = getDb();
    const existing = getVisibleCollection(db, id, req.spaceId, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Collection not found' });

    const updates = Object.entries(req.body).filter(([k]) => COLLECTION_FIELDS.includes(k));
    if (updates.length) {
      const setClause = updates.map(([k]) => `${k} = ?`).join(', ');
      db.prepare(`UPDATE thought_collections SET ${setClause} WHERE id = ?`)
        .run(...updates.map(([, v]) => v), id);
    }

    const collection = db.prepare('SELECT * FROM thought_collections WHERE id = ?').get(id);
    emit(req, 'thought:collection_updated', collection);
    res.json(collection);
  } catch (err) { next(err); }
});

router.delete('/collections/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const db = getDb();
    const existing = getVisibleCollection(db, id, req.spaceId, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Collection not found' });

    db.prepare('DELETE FROM thought_collections WHERE id = ?').run(id);
    emit(req, 'thought:collection_deleted', { id });
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── Curated starter collections (hand-curated, see server/data/curatedThoughtCollections.json) ──

router.get('/curated-sets', (req, res) => {
  res.json(curatedThoughts.listSets());
});

router.post('/curated-sets/:key/import', (req, res, next) => {
  try {
    const collection = curatedThoughts.importSet(req.spaceId, req.user.id, req.params.key);
    emit(req, 'thought:collection_created', collection);
    res.status(201).json(collection);
  } catch (err) {
    if (err.code === 'INVALID_INPUT') return res.status(404).json({ error: err.message });
    next(err);
  }
});

// ── Entries ────────────────────────────────────────────────────────────────

router.get('/collections/:id/entries', (req, res, next) => {
  try {
    const collectionId = parseInt(req.params.id);
    const db = getDb();
    if (!getVisibleCollection(db, collectionId, req.spaceId, req.user.id)) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    const rows = db.prepare('SELECT * FROM thought_entries WHERE collection_id = ? ORDER BY sort_order ASC, id ASC').all(collectionId);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/collections/:id/entries', (req, res, next) => {
  try {
    const collectionId = parseInt(req.params.id);
    const db = getDb();
    if (!getVisibleCollection(db, collectionId, req.spaceId, req.user.id)) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    const body = sanitizeBody(req.body.body || '');
    const plain = toPlain(body);
    if (!plain) return res.status(400).json({ error: 'Entry text is required' });
    const attribution = req.body.attribution?.trim() || null;

    const result = db.prepare(`
      INSERT INTO thought_entries (collection_id, body, plain, attribution, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(collectionId, body, plain, attribution, req.user.id);

    const entry = db.prepare('SELECT * FROM thought_entries WHERE id = ?').get(result.lastInsertRowid);
    emit(req, 'thought:entry_created', { collectionId, entry });
    res.status(201).json(entry);
  } catch (err) { next(err); }
});

const ENTRY_FIELDS = ['attribution', 'enabled', 'sort_order'];

router.patch('/collections/:id/entries/:entryId', (req, res, next) => {
  try {
    const collectionId = parseInt(req.params.id);
    const entryId = parseInt(req.params.entryId);
    const db = getDb();
    if (!getVisibleCollection(db, collectionId, req.spaceId, req.user.id)) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    const existing = db.prepare('SELECT * FROM thought_entries WHERE id = ? AND collection_id = ?').get(entryId, collectionId);
    if (!existing) return res.status(404).json({ error: 'Entry not found' });

    const updates = Object.entries(req.body).filter(([k]) => ENTRY_FIELDS.includes(k));
    if ('body' in req.body) {
      const body = sanitizeBody(req.body.body || '');
      const plain = toPlain(body);
      if (!plain) return res.status(400).json({ error: 'Entry text is required' });
      updates.push(['body', body], ['plain', plain]);
    }
    if (updates.length) {
      const setClause = updates.map(([k]) => `${k} = ?`).join(', ');
      db.prepare(`UPDATE thought_entries SET ${setClause} WHERE id = ?`)
        .run(...updates.map(([, v]) => v), entryId);
    }

    const entry = db.prepare('SELECT * FROM thought_entries WHERE id = ?').get(entryId);
    emit(req, 'thought:entry_updated', { collectionId, entry });
    res.json(entry);
  } catch (err) { next(err); }
});

router.delete('/collections/:id/entries/:entryId', (req, res, next) => {
  try {
    const collectionId = parseInt(req.params.id);
    const entryId = parseInt(req.params.entryId);
    const db = getDb();
    if (!getVisibleCollection(db, collectionId, req.spaceId, req.user.id)) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    const existing = db.prepare('SELECT id FROM thought_entries WHERE id = ? AND collection_id = ?').get(entryId, collectionId);
    if (!existing) return res.status(404).json({ error: 'Entry not found' });

    db.prepare('DELETE FROM thought_entries WHERE id = ?').run(entryId);
    emit(req, 'thought:entry_deleted', { collectionId, id: entryId });
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── Settings (singleton per space) ─────────────────────────────────────────

router.get('/settings', (req, res, next) => {
  try {
    const db = getDb();
    db.prepare('INSERT OR IGNORE INTO thought_settings (space_id) VALUES (?)').run(req.spaceId);
    const settings = db.prepare('SELECT * FROM thought_settings WHERE space_id = ?').get(req.spaceId);
    res.json(settings);
  } catch (err) { next(err); }
});

router.patch('/settings', (req, res, next) => {
  try {
    const db = getDb();
    db.prepare('INSERT OR IGNORE INTO thought_settings (space_id) VALUES (?)').run(req.spaceId);

    const allowed = ['interval_seconds', 'shuffle', 'show_attribution'];
    const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
    if (updates.length) {
      const setClause = updates.map(([k]) => `${k} = ?`).join(', ');
      db.prepare(`UPDATE thought_settings SET ${setClause}, updated_at = datetime('now') WHERE space_id = ?`)
        .run(...updates.map(([, v]) => v), req.spaceId);
    }

    const settings = db.prepare('SELECT * FROM thought_settings WHERE space_id = ?').get(req.spaceId);
    emit(req, 'thought:settings_updated', settings);
    res.json(settings);
  } catch (err) { next(err); }
});

module.exports = router;
