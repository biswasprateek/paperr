// Separate SQLite file for Frame photo bytes — kept out of paperr.db so the
// main DB stays small while photo libraries grow to gigabytes. One row per
// photo, keyed by frame_photos.id from the main DB; SQLite has no cross-file
// foreign keys, so routes/frame.js is responsible for deleting from both
// sides together.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const MAIN_DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/databases/paperr.db');
const FRAME_DB_PATH = process.env.FRAME_DB_PATH
  || path.join(path.dirname(path.resolve(MAIN_DB_PATH)), 'frame-photos.db');

let db;

function getFrameFilesDb() {
  if (!db) {
    fs.mkdirSync(path.dirname(FRAME_DB_PATH), { recursive: true });
    db = new DatabaseSync(FRAME_DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS photo_files (
        photo_id   INTEGER PRIMARY KEY,
        mime       TEXT NOT NULL,
        size       INTEGER NOT NULL,
        data       BLOB NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }
  return db;
}

module.exports = { getFrameFilesDb };
