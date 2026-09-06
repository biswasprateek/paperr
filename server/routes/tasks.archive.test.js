// Task-archive self-check. Run: node server/routes/tasks.archive.test.js
// Archiving is tasks.archived = 1, so it must (a) hide the task from the normal
// list, (b) surface it under ?archived=1, and (c) survive the round trip intact.
// Runs against a real throwaway DB so it exercises taskService's actual SQL.
const assert = require('node:assert');
const fs   = require('node:fs');
const os   = require('node:os');
const path = require('node:path');

process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'paperr-test-')), 'test.db');
const { getDb } = require('../db/db');
const taskService = require('../services/taskService');

const db = getDb();
db.prepare("INSERT INTO users (id, username, password_hash, display_name) VALUES (1, 'tester', 'x', 'Tester')").run();
db.prepare("INSERT INTO spaces (id, name, created_by) VALUES (1, 'Home', 1)").run();

const kept     = taskService.createTask({ title: 'Kept',     space_id: 1 }, 1);
const archived = taskService.createTask({ title: 'Archived', space_id: 1 }, 1);

const titles = (filters) => taskService.getTasks({ spaceId: 1, ...filters }).map(t => t.title).sort();

assert.deepStrictEqual(titles(), ['Archived', 'Kept'], 'both active up front');
assert.deepStrictEqual(titles({ archived: true }), [], 'nothing archived up front');

taskService.updateTask(archived.id, { archived: 1 }, 1);

assert.deepStrictEqual(titles(), ['Kept'], 'archived task leaves the default list');
assert.deepStrictEqual(titles({ archived: true }), ['Archived'], 'archived task shows under archived: true');
// Archiving is not completion — the archived view must show done tasks too, and
// the other filters must keep composing on top of the archived flag.
assert.deepStrictEqual(titles({ archived: true, isCompleted: false }), ['Archived'], 'other filters still compose');
assert.strictEqual(taskService.getTaskWithTags(archived.id).title, 'Archived', 'the row itself is untouched');

taskService.updateTask(archived.id, { archived: 0 }, 1);
assert.deepStrictEqual(titles(), ['Archived', 'Kept'], 'restore brings it back');
assert.ok(kept.id !== archived.id);

console.log('task archive: all checks passed');
