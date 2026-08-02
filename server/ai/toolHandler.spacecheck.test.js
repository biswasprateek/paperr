// Space-guard self-check. Run: node server/ai/toolHandler.spacecheck.test.js
// Fails loudly if ownsRow ever stops fencing cross-space access.
const assert = require('node:assert');
const { DatabaseSync } = require('node:sqlite');
const { ownsRow } = require('./toolHandler');

const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE tasks (id INTEGER PRIMARY KEY, space_id INTEGER)');
db.prepare('INSERT INTO tasks (id, space_id) VALUES (1, 10), (2, 20)').run();

assert.strictEqual(ownsRow(db, 'tasks', 1, 10), true,  'own space → allowed');
assert.strictEqual(ownsRow(db, 'tasks', 1, 20), false, 'other space → denied');
assert.strictEqual(ownsRow(db, 'tasks', 999, 10), false, 'missing row → denied');
assert.strictEqual(ownsRow(db, 'tasks', 1, null), false, 'null space → fail-closed');
assert.strictEqual(ownsRow(db, 'tasks', null, 10), false, 'null id → fail-closed');

console.log('ownsRow space-guard: all checks passed');
