const express = require('express');
const multer  = require('multer');
const router  = express.Router();
const { getDb } = require('../db/db');
const { getFrameFilesDb } = require('../db/frameFilesDb');
const { requireAuth, requireSpace } = require('../auth/middleware');
const curatedArt = require('../ai/curatedArt');

// Image bytes are loaded by plain <img> tags, which can't send the X-Space-Id
// header the rest of this router requires — so this route sits above the
// router-wide middleware (cookie auth only) and authorizes via the photo's
// own collection → space membership instead.
router.get('/photos/:photoId/file', requireAuth, (req, res, next) => {
  try {
    const photoId = parseInt(req.params.photoId);
    const db = getDb();
    const photo = db.prepare(`
      SELECT p.id FROM frame_photos p
      JOIN frame_collections c ON c.id = p.collection_id
      JOIN space_members m ON m.space_id = c.space_id AND m.user_id = ?
      WHERE p.id = ?
    `).get(req.user.id, photoId);
    if (!photo) return res.status(404).json({ error: 'Photo not found' });

    const file = getFrameFilesDb().prepare('SELECT mime, data FROM photo_files WHERE photo_id = ?').get(photoId);
    if (!file) return res.status(404).json({ error: 'Photo file not found' });

    // Aggressively cacheable: the client puts file_ver in the query string,
    // so a given URL's bytes never change — each device downloads each image
    // once, and re-uploading a filename (which bumps file_ver) busts it.
    res.set('Content-Type', file.mime);
    res.set('Cache-Control', 'private, max-age=31536000, immutable');
    res.end(Buffer.from(file.data));
  } catch (err) { next(err); }
});

router.use(requireAuth, requireSpace);

function emit(req, event, payload) {
  req.app.get('io')?.to(`space:${req.spaceId}`).emit(event, payload);
}

const COLLECTION_FIELDS = ['collection_name', 'collection_type', 'frame_style', 'enabled', 'sort_order'];

// ── Collections ────────────────────────────────────────────────────────────

router.get('/collections', (req, res, next) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM frame_collections WHERE space_id = ? ORDER BY sort_order ASC, id ASC
    `).all(req.spaceId);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/collections', (req, res, next) => {
  try {
    const { collection_name = null, collection_type = 'Photographs', frame_style = 'postcard' } = req.body;
    const db = getDb();
    const result = db.prepare(`
      INSERT INTO frame_collections (space_id, created_by, collection_name, collection_type, frame_style)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.spaceId, req.user.id, collection_name, collection_type, frame_style);

    const collection = db.prepare('SELECT * FROM frame_collections WHERE id = ?').get(result.lastInsertRowid);
    emit(req, 'frame:collection_created', collection);
    res.status(201).json(collection);
  } catch (err) { next(err); }
});

router.patch('/collections/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const db = getDb();
    const existing = db.prepare('SELECT * FROM frame_collections WHERE id = ? AND space_id = ?').get(id, req.spaceId);
    if (!existing) return res.status(404).json({ error: 'Collection not found' });

    const updates = Object.entries(req.body).filter(([k]) => COLLECTION_FIELDS.includes(k));
    if (updates.length) {
      const setClause = updates.map(([k]) => `${k} = ?`).join(', ');
      db.prepare(`UPDATE frame_collections SET ${setClause} WHERE id = ?`)
        .run(...updates.map(([, v]) => v), id);
    }

    const collection = db.prepare('SELECT * FROM frame_collections WHERE id = ?').get(id);
    emit(req, 'frame:collection_updated', collection);
    res.json(collection);
  } catch (err) { next(err); }
});

router.delete('/collections/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const db = getDb();
    const existing = db.prepare('SELECT * FROM frame_collections WHERE id = ? AND space_id = ?').get(id, req.spaceId);
    if (!existing) return res.status(404).json({ error: 'Collection not found' });

    // Purge blobs from the separate files DB first — the collection delete
    // below cascades frame_photos rows away, and there's no cross-file FK to
    // do this for us.
    const photoIds = db.prepare('SELECT id FROM frame_photos WHERE collection_id = ?').all(id);
    const deleteFile = getFrameFilesDb().prepare('DELETE FROM photo_files WHERE photo_id = ?');
    for (const row of photoIds) deleteFile.run(row.id);

    db.prepare('DELETE FROM frame_collections WHERE id = ?').run(id);
    emit(req, 'frame:collection_deleted', { id });
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── Curated starter collections (hand-curated, see server/data/curatedCollections.json) ─────

router.get('/curated-sets', (req, res) => {
  res.json(curatedArt.listSets());
});

router.post('/curated-sets/:key/import', (req, res, next) => {
  try {
    const set = curatedArt.loadCuratedSets()[req.params.key];
    if (!set) return res.status(404).json({ error: 'Unknown curated set' });

    const db = getDb();
    const result = db.prepare(`
      INSERT INTO frame_collections (space_id, created_by, collection_name, collection_type, frame_style)
      VALUES (?, ?, ?, 'Artwork', 'postcard')
    `).run(req.spaceId, req.user.id, set.label);
    const collection = db.prepare('SELECT * FROM frame_collections WHERE id = ?').get(result.lastInsertRowid);

    curatedArt.startImport(collection.id, req.params.key);
    emit(req, 'frame:collection_created', collection);
    res.status(201).json(collection);
  } catch (err) { next(err); }
});

router.get('/collections/:id/import-status', (req, res, next) => {
  try {
    const collectionId = parseInt(req.params.id);
    const db = getDb();
    if (!getOwnedCollection(db, collectionId, req.spaceId)) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    res.json(curatedArt.getJob(collectionId) || { status: 'done', total: 0, done: 0 });
  } catch (err) { next(err); }
});

// ── Photos (per-collection overrides — enabled/description) ────────────────

const PHOTO_FIELDS = ['enabled', 'description', 'artist', 'year'];

function getOwnedCollection(db, id, spaceId) {
  return db.prepare('SELECT id FROM frame_collections WHERE id = ? AND space_id = ?').get(id, spaceId);
}

router.get('/collections/:id/photos', (req, res, next) => {
  try {
    const collectionId = parseInt(req.params.id);
    const db = getDb();
    if (!getOwnedCollection(db, collectionId, req.spaceId)) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    const rows = db.prepare('SELECT * FROM frame_photos WHERE collection_id = ? ORDER BY sort_order ASC, filename ASC').all(collectionId);
    res.json(rows);
  } catch (err) { next(err); }
});

// Client-side resize (lib/frameUpload.js) caps images at 4K/JPEG before they
// hit the wire, so this per-file limit is just a backstop against raw
// originals slipping through (GIFs and undecodable files upload untouched).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 100 },
});

router.post('/collections/:id/photos', upload.array('photos'), (req, res, next) => {
  try {
    const collectionId = parseInt(req.params.id);
    const db = getDb();
    if (!getOwnedCollection(db, collectionId, req.spaceId)) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    const files = (req.files || []).filter((f) => f.mimetype?.startsWith('image/'));
    if (!files.length) return res.status(400).json({ error: 'No image files uploaded' });

    const filesDb = getFrameFilesDb();
    const insertPhoto = db.prepare('INSERT OR IGNORE INTO frame_photos (collection_id, filename, sort_order) VALUES (?, ?, ?)');
    const bumpVer     = db.prepare('UPDATE frame_photos SET file_ver = file_ver + 1 WHERE collection_id = ? AND filename = ?');
    const selectPhoto = db.prepare('SELECT id FROM frame_photos WHERE collection_id = ? AND filename = ?');
    const upsertFile  = filesDb.prepare('INSERT OR REPLACE INTO photo_files (photo_id, mime, size, data) VALUES (?, ?, ?, ?)');

    // New photos append after the current last one; re-uploads of an existing
    // filename keep their slot (INSERT OR IGNORE is a no-op there).
    let nextOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM frame_photos WHERE collection_id = ?').get(collectionId).n;
    for (const f of files) {
      // multer 1.x decodes originalname as latin1 — re-decode for non-ASCII names.
      const filename = Buffer.from(f.originalname, 'latin1').toString('utf8');
      const info = insertPhoto.run(collectionId, filename, nextOrder);
      if (info.changes > 0) nextOrder++;
      bumpVer.run(collectionId, filename);
      const { id } = selectPhoto.get(collectionId, filename);
      upsertFile.run(id, f.mimetype, f.size, f.buffer);
    }

    const rows = db.prepare('SELECT * FROM frame_photos WHERE collection_id = ? ORDER BY sort_order ASC, filename ASC').all(collectionId);
    emit(req, 'frame:photos_uploaded', { collectionId, photos: rows });
    res.status(201).json(rows);
  } catch (err) { next(err); }
});

router.delete('/collections/:id/photos/:photoId', (req, res, next) => {
  try {
    const collectionId = parseInt(req.params.id);
    const photoId = parseInt(req.params.photoId);
    const db = getDb();
    if (!getOwnedCollection(db, collectionId, req.spaceId)) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    const existing = db.prepare('SELECT id FROM frame_photos WHERE id = ? AND collection_id = ?').get(photoId, collectionId);
    if (!existing) return res.status(404).json({ error: 'Photo not found' });

    db.prepare('DELETE FROM frame_photos WHERE id = ?').run(photoId);
    getFrameFilesDb().prepare('DELETE FROM photo_files WHERE photo_id = ?').run(photoId);
    emit(req, 'frame:photo_deleted', { collectionId, id: photoId });
    res.status(204).end();
  } catch (err) { next(err); }
});

router.patch('/collections/:id/photos/:photoId', (req, res, next) => {
  try {
    const collectionId = parseInt(req.params.id);
    const photoId = parseInt(req.params.photoId);
    const db = getDb();
    if (!getOwnedCollection(db, collectionId, req.spaceId)) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    const existing = db.prepare('SELECT * FROM frame_photos WHERE id = ? AND collection_id = ?').get(photoId, collectionId);
    if (!existing) return res.status(404).json({ error: 'Photo not found' });

    const updates = Object.entries(req.body).filter(([k]) => PHOTO_FIELDS.includes(k));
    if (updates.length) {
      const setClause = updates.map(([k]) => `${k} = ?`).join(', ');
      db.prepare(`UPDATE frame_photos SET ${setClause} WHERE id = ?`)
        .run(...updates.map(([, v]) => v), photoId);
    }

    const photo = db.prepare('SELECT * FROM frame_photos WHERE id = ?').get(photoId);
    emit(req, 'frame:photo_updated', photo);
    res.json(photo);
  } catch (err) { next(err); }
});

// Persist a new playback order for a collection's photos. Body: { photoIds }
// in the desired order — each row's sort_order becomes its index.
router.post('/collections/:id/photos/reorder', (req, res, next) => {
  try {
    const collectionId = parseInt(req.params.id);
    const db = getDb();
    if (!getOwnedCollection(db, collectionId, req.spaceId)) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    const { photoIds } = req.body;
    if (!Array.isArray(photoIds)) return res.status(400).json({ error: 'photoIds array required' });

    const upd = db.prepare('UPDATE frame_photos SET sort_order = ? WHERE id = ? AND collection_id = ?');
    photoIds.forEach((id, idx) => upd.run(idx, parseInt(id), collectionId));

    const rows = db.prepare('SELECT * FROM frame_photos WHERE collection_id = ? ORDER BY sort_order ASC, filename ASC').all(collectionId);
    emit(req, 'frame:photos_reordered', { collectionId, photos: rows });
    res.json(rows);
  } catch (err) { next(err); }
});

// ── Settings (singleton per space) ─────────────────────────────────────────

// Explicit values here (not just column DEFAULTs) because this table predates
// the 5s/white defaults in schema.sql on any database migrated from an older
// version — CREATE TABLE IF NOT EXISTS / ALTER TABLE ADD COLUMN are no-ops
// against an already-existing table/column, so those older defaults (30s,
// diffused) silently stuck around at the column level even after the schema
// file changed. This guarantees a newly created space gets 5s/white regardless.
function ensureFrameSettingsRow(db, spaceId) {
  db.prepare(`
    INSERT OR IGNORE INTO frame_settings (space_id, idle_timeout_minutes, interval_seconds, background_mode)
    VALUES (?, 0, 5, 'white')
  `).run(spaceId);
}

router.get('/settings', (req, res, next) => {
  try {
    const db = getDb();
    ensureFrameSettingsRow(db, req.spaceId);
    const settings = db.prepare('SELECT * FROM frame_settings WHERE space_id = ?').get(req.spaceId);
    res.json(settings);
  } catch (err) { next(err); }
});

router.patch('/settings', (req, res, next) => {
  try {
    const db = getDb();
    ensureFrameSettingsRow(db, req.spaceId);

    const allowed = ['idle_timeout_minutes', 'interval_seconds', 'corner_widget_enabled', 'background_mode', 'max_runtime_minutes'];
    const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
    if (updates.length) {
      const setClause = updates.map(([k]) => `${k} = ?`).join(', ');
      db.prepare(`UPDATE frame_settings SET ${setClause}, updated_at = datetime('now') WHERE space_id = ?`)
        .run(...updates.map(([, v]) => v), req.spaceId);
    }

    const settings = db.prepare('SELECT * FROM frame_settings WHERE space_id = ?').get(req.spaceId);
    emit(req, 'frame:settings_updated', settings);
    res.json(settings);
  } catch (err) { next(err); }
});

module.exports = router;
