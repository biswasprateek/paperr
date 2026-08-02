const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { getDb, closeDb, DB_PATH } = require('../db/db');
const logger = require('../utils/logger');

const BACKUPS_DIR = path.join(__dirname, '../data/backups');
const MANIFEST_PATH = path.join(BACKUPS_DIR, 'manifest.json');

const FREQUENCY_DAYS = { daily: 1, weekly: 7, monthly: 30 };

const DEFAULT_SETTINGS = {
  auto_enabled: false,
  frequency: 'daily',       // 'daily' | 'weekly' | 'monthly'
  retention_days: 180,      // 0 = keep forever
  last_backup_at: null,
};

// Backup settings/history are kept in a JSON manifest next to the backup
// files — NOT inside paperr.db. A restore overwrites that whole file, so
// any bookkeeping stored inside it would erase itself the moment it was
// needed to recover a prior backup.
function readManifest() {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  if (!fs.existsSync(MANIFEST_PATH)) {
    return { settings: { ...DEFAULT_SETTINGS }, backups: [] };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    return {
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
      backups: Array.isArray(parsed.backups) ? parsed.backups : [],
    };
  } catch {
    return { settings: { ...DEFAULT_SETTINGS }, backups: [] };
  }
}

function writeManifest(manifest) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

function timestampFolderName(date = new Date()) {
  // e.g. 2026-07-10T14-32-05 — colon-free so it's a valid Windows path segment
  return date.toISOString().replace(/:/g, '-').split('.')[0];
}

function uniqueFolderName() {
  let name = timestampFolderName();
  let n = 1;
  while (fs.existsSync(path.join(BACKUPS_DIR, name))) {
    name = `${timestampFolderName()}-${n++}`;
  }
  return name;
}

function getSettings() {
  return readManifest().settings;
}

function updateSettings(patch) {
  const manifest = readManifest();
  if (patch.auto_enabled !== undefined) manifest.settings.auto_enabled = !!patch.auto_enabled;
  if (patch.frequency !== undefined) manifest.settings.frequency = patch.frequency;
  if (patch.retention_days !== undefined) manifest.settings.retention_days = patch.retention_days;
  writeManifest(manifest);
  return manifest.settings;
}

function listBackups() {
  return [...readManifest().backups].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

// Snapshots the live database via SQLite's serialize() — a consistent,
// self-contained file image even while WAL mode is active — so backups
// don't need a checkpoint step or to touch -wal/-shm sidecars.
function createBackup({ type, userId = null, userName = null }) {
  const db = getDb();
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });

  const folderName = uniqueFolderName();
  const dir = path.join(BACKUPS_DIR, folderName);
  fs.mkdirSync(dir, { recursive: true });

  const buf = db.serialize();
  fs.writeFileSync(path.join(dir, 'paperr.db'), buf);

  if (!userName && userId) {
    const user = db.prepare('SELECT display_name FROM users WHERE id = ?').get(userId);
    userName = user?.display_name || null;
  }

  const entry = {
    id: folderName,
    folder_name: folderName,
    type,
    size_bytes: buf.length,
    created_by: userId,
    created_by_name: userName,
    created_at: new Date().toISOString(),
  };

  const manifest = readManifest();
  manifest.backups.push(entry);
  manifest.settings.last_backup_at = entry.created_at;
  writeManifest(manifest);

  applyRetention();

  return entry;
}

function deleteBackup(folderName) {
  const manifest = readManifest();
  const idx = manifest.backups.findIndex(b => b.folder_name === folderName);
  if (idx === -1) return false;

  fs.rmSync(path.join(BACKUPS_DIR, folderName), { recursive: true, force: true });
  manifest.backups.splice(idx, 1);
  writeManifest(manifest);
  return true;
}

function applyRetention() {
  const manifest = readManifest();
  const { retention_days } = manifest.settings;
  if (!retention_days) return; // 0 = keep forever

  const cutoff = Date.now() - retention_days * 24 * 60 * 60 * 1000;
  const stale = manifest.backups.filter(b => new Date(b.created_at).getTime() < cutoff);
  for (const b of stale) deleteBackup(b.folder_name);
}

// Closes the live db, replaces its file with the backup's snapshot, then
// lets the next getDb() call reopen it. A safety snapshot of the current
// state is taken first in case the restore needs to be undone.
function restoreBackup(folderName) {
  const manifest = readManifest();
  const backup = manifest.backups.find(b => b.folder_name === folderName);
  if (!backup) throw new Error('Backup not found');

  const srcFile = path.join(BACKUPS_DIR, folderName, 'paperr.db');
  if (!fs.existsSync(srcFile)) throw new Error('Backup file is missing on disk');

  createBackup({ type: 'auto', userName: 'Pre-restore safety snapshot' });

  closeDb();
  try {
    fs.copyFileSync(srcFile, DB_PATH);
    for (const ext of ['-wal', '-shm']) {
      const sidecar = DB_PATH + ext;
      if (fs.existsSync(sidecar)) fs.rmSync(sidecar, { force: true });
    }
  } finally {
    getDb(); // reopen so subsequent requests get a live connection
  }
}

function isBackupDue(settings) {
  if (!settings.auto_enabled) return false;
  if (!settings.last_backup_at) return true;
  const intervalDays = FREQUENCY_DAYS[settings.frequency] || 1;
  const dueAt = new Date(settings.last_backup_at).getTime() + intervalDays * 24 * 60 * 60 * 1000;
  return Date.now() >= dueAt;
}

function checkAutoBackup() {
  try {
    const settings = getSettings();
    if (isBackupDue(settings)) {
      createBackup({ type: 'auto' });
      logger.info('auto backup created');
    }
  } catch (err) {
    logger.info('auto backup check failed', { error: err.message });
  }
}

function startAutoBackupScheduler() {
  // Runs hourly and decides internally whether a backup is actually due —
  // simpler than re-registering a cron job whenever the frequency changes.
  cron.schedule('0 * * * *', checkAutoBackup);
  setTimeout(checkAutoBackup, 5000);
}

module.exports = {
  BACKUPS_DIR,
  getSettings,
  updateSettings,
  listBackups,
  createBackup,
  deleteBackup,
  restoreBackup,
  applyRetention,
  startAutoBackupScheduler,
};
