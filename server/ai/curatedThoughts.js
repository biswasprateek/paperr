// Curated Good Thoughts starter collections — hand-curated, defined in
// server/data/curatedThoughtCollections.json. Unlike curatedArt.js's photo
// import, this is plain text with no network fetch/image processing, so the
// import runs synchronously (no background job/polling needed).
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db/db');

const COLLECTIONS_FILE = path.join(__dirname, '..', 'data', 'curatedThoughtCollections.json');

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

function listSets() {
  return Object.entries(loadCuratedSets()).map(([key, set]) => ({
    key, label: set.label, itemCount: set.items.length,
  }));
}

function toPlain(html) {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function importSet(spaceId, userId, key) {
  const set = loadCuratedSets()[key];
  if (!set) throw Object.assign(new Error('Unknown curated set'), { code: 'INVALID_INPUT' });

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO thought_collections (space_id, created_by, name, category, icon, color)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(spaceId, userId, set.label, set.category || 'Quotes', set.icon || '💭', set.color || '#6366f1');
  const collectionId = result.lastInsertRowid;

  const insertEntry = db.prepare(`
    INSERT INTO thought_entries (collection_id, body, plain, attribution, created_by, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  set.items.forEach((item, i) => {
    insertEntry.run(collectionId, item.body, toPlain(item.body), item.attribution || null, userId, i);
  });

  return db.prepare('SELECT * FROM thought_collections WHERE id = ?').get(collectionId);
}

module.exports = { loadCuratedSets, listSets, importSet };
