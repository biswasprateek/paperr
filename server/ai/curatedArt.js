// Curated Frame starter collections — all hand-curated, defined in
// server/data/curatedCollections.json. Each collection is a fixed list of
// { title, artist, year, imageUrl } entries; imageUrl is fetched, then
// normalized to match what a regular (browser-uploaded) photo goes through —
// see normalizeImage() below — so nothing here calls out to any third-party
// search API.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { getDb } = require('../db/db');
const { getFrameFilesDb } = require('../db/frameFilesDb');

const COLLECTIONS_FILE = path.join(__dirname, '..', 'data', 'curatedCollections.json');

// Mirrors client/src/lib/frameUpload.js's prepareImage() — regular uploads are
// downscaled in the browser before they ever reach the server, but a
// server-side fetch (this file) has no browser to do that, so it's
// replicated here with the same limits (keep MAX_DIM/JPEG_QUALITY in sync
// with that file — JPEG_QUALITY is 0-100 here vs. canvas's 0-1 scale there).
// Same fallbacks too: GIFs pass through untouched (no animation-dropping
// re-encode), and anything sharp can't decode is stored as fetched.
const MAX_DIM = 3840;
const JPEG_QUALITY = 60;
const MAX_BYTES = 3 * 1024 * 1024;
const SKIP_BYTES = 1 * 1024 * 1024;

async function normalizeImage(buf, mime) {
  if (mime === 'image/gif') return { buf, mime };
  if (buf.length < SKIP_BYTES) return { buf, mime };
  try {
    // Re-encode at falling quality until under the 2MB cap — same loop as
    // client/src/lib/frameUpload.js's prepareImage().
    let quality = JPEG_QUALITY;
    let out = await sharp(buf)
      .resize(MAX_DIM, MAX_DIM, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
    while (out.length > MAX_BYTES && quality > 10) {
      quality -= 10;
      out = await sharp(buf)
        .resize(MAX_DIM, MAX_DIM, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer();
    }
    return { buf: out, mime: 'image/jpeg' };
  } catch {
    return { buf, mime };
  }
}

// Read fresh each time rather than require()'d once, so entries can be added
// to the JSON file without restarting the server.
function loadCuratedSets() {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(COLLECTIONS_FILE, 'utf8'));
  } catch {
    return {};
  }
  const sets = {};
  for (const [key, set] of Object.entries(raw)) {
    if (key.startsWith('_')) continue; // e.g. "_comment"
    if (!Array.isArray(set?.items) || !set.items.length) continue;
    sets[key] = set;
  }
  return sets;
}

// collectionId -> { status: 'running'|'done'|'error', total, done, error }
const jobs = new Map();

function listSets() {
  return Object.entries(loadCuratedSets()).map(([key, set]) => ({
    key, label: set.label, itemCount: set.items.length,
  }));
}

function getJob(collectionId) {
  return jobs.get(collectionId) || null;
}

async function runImport(collectionId, items) {
  const job = { status: 'running', total: items.length, done: 0, error: null };
  jobs.set(collectionId, job);

  try {
    const db = getDb();
    const filesDb = getFrameFilesDb();
    const insertPhoto = db.prepare('INSERT OR IGNORE INTO frame_photos (collection_id, filename, sort_order, description, artist, year) VALUES (?, ?, ?, ?, ?, ?)');
    const selectPhoto = db.prepare('SELECT id FROM frame_photos WHERE collection_id = ? AND filename = ?');
    const upsertFile  = filesDb.prepare('INSERT OR REPLACE INTO photo_files (photo_id, mime, size, data) VALUES (?, ?, ?, ?)');
    let nextOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM frame_photos WHERE collection_id = ?').get(collectionId).n;

    for (const item of items) {
      try {
        const imgRes = await fetch(item.imageUrl);
        if (!imgRes.ok) throw new Error(`image fetch ${imgRes.status}`);
        const rawBuf = Buffer.from(await imgRes.arrayBuffer());
        const rawMime = imgRes.headers.get('content-type') || 'image/jpeg';
        const { buf, mime } = await normalizeImage(rawBuf, rawMime);
        const filename = (item.title || item.imageUrl).slice(0, 200);

        const info = insertPhoto.run(collectionId, filename, nextOrder, item.title || '', item.artist || '', item.year || '');
        if (info.changes > 0) nextOrder++;
        const row = selectPhoto.get(collectionId, filename);
        if (row) upsertFile.run(row.id, mime, buf.length, buf);
      } catch { /* skip this image, keep the rest of the set going */ }
      job.done++;
    }
    job.status = 'done';
  } catch (err) {
    job.status = 'error';
    job.error = err.message;
  }
}

function startImport(collectionId, key) {
  const set = loadCuratedSets()[key];
  if (!set) throw Object.assign(new Error('Unknown curated set'), { code: 'INVALID_INPUT' });
  if (jobs.get(collectionId)?.status === 'running') {
    throw Object.assign(new Error('Import already running for this collection'), { code: 'IMPORT_BUSY' });
  }
  runImport(collectionId, set.items); // fire-and-forget — caller polls getJob()
  return { status: 'started' };
}

module.exports = { loadCuratedSets, listSets, startImport, getJob };
