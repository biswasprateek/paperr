// Habit-archive self-check. Run: node server/routes/routines.archive.test.js
// Archiving is is_active = 0, so it must (a) hide the habit from every read
// path and (b) leave its completion history untouched for the Progress view.
const assert = require('node:assert');
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE routines_protocols (id INTEGER PRIMARY KEY, space_id INTEGER, created_by INTEGER,
    name TEXT, color TEXT, visibility TEXT, sort_order INTEGER DEFAULT 0);
  CREATE TABLE routines_habits (id INTEGER PRIMARY KEY, protocol_id INTEGER, title TEXT, icon TEXT,
    science_note TEXT, time_slot TEXT DEFAULT 'morning', target_time TEXT, duration_minutes INTEGER,
    recur_days TEXT DEFAULT '1111111', is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0);
  CREATE TABLE routines_completions (id INTEGER PRIMARY KEY, habit_id INTEGER, user_id INTEGER, completed_date TEXT);
  INSERT INTO routines_protocols (id, space_id, created_by, name, color, visibility) VALUES (1, 10, 7, 'Morning', '#6366f1', 'personal');
  INSERT INTO routines_habits (id, protocol_id, title) VALUES (1, 1, 'Active'), (2, 1, 'Soon archived');
  INSERT INTO routines_completions (habit_id, user_id, completed_date)
    VALUES (2, 7, '2026-08-01'), (2, 7, '2026-08-02');
`);

// Same filter every habit read path uses; ?archived=1 flips the bound value.
const list = (active) => db.prepare(`
  SELECT h.title FROM routines_habits h
  JOIN routines_protocols p ON h.protocol_id = p.id
  WHERE p.space_id = ? AND (p.created_by = ? OR p.visibility = 'shared') AND h.is_active = ?
`).all(10, 7, active).map(r => r.title);

const completions = () =>
  db.prepare('SELECT COUNT(*) AS n FROM routines_completions WHERE habit_id = 2').get().n;

assert.deepStrictEqual(list(1), ['Active', 'Soon archived'], 'both active up front');
assert.deepStrictEqual(list(0), [], 'nothing archived up front');

db.prepare('UPDATE routines_habits SET is_active = 0 WHERE id = 2').run();

assert.deepStrictEqual(list(1), ['Active'], 'archived habit leaves the active views');
assert.deepStrictEqual(list(0), ['Soon archived'], 'archived habit shows under ?archived=1');
assert.strictEqual(Number(completions()), 2, 'history survives archiving');

// Archived rows are opened in the habit edit modal to be unarchived, so
// /progress must return the whole habit row, not just the display columns.
// Dropping any of these silently blanks that field when the form saves.
const progressRow = db.prepare(`
  SELECT h.*, p.name AS protocol_name, p.color AS protocol_color
  FROM routines_habits h JOIN routines_protocols p ON h.protocol_id = p.id
  WHERE h.id = 2
`).get();
for (const field of ['id', 'title', 'icon', 'protocol_id', 'time_slot', 'target_time',
                     'duration_minutes', 'science_note', 'recur_days', 'is_active']) {
  assert.ok(field in progressRow, `progress row must carry ${field} for the edit modal`);
}

db.prepare('UPDATE routines_habits SET is_active = 1 WHERE id = 2').run();
assert.deepStrictEqual(list(1), ['Active', 'Soon archived'], 'restore brings it back');
assert.strictEqual(Number(completions()), 2, 'history survives the round trip');

console.log('habit archive: all checks passed');
