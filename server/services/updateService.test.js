// node --test server/services/updateService.test.js
// Only plan() is worth pinning: get it wrong and an update either wastes minutes
// reinstalling untouched workspaces, or serves a stale bundle from client/dist.
const { test } = require('node:test');
const assert = require('node:assert');
const { plan } = require('./updateService');

test('plan: only touched workspaces reinstall, only client changes rebuild', () => {
  assert.deepEqual(plan(['server/routes/admin.js']), { installs: [], build: false });
  assert.deepEqual(plan(['client/src/App.jsx']), { installs: [], build: true });
  assert.deepEqual(plan(['package.json']), { installs: [''], build: false });
  assert.deepEqual(plan(['server/package.json', 'client/package-lock.json']),
    { installs: ['server/', 'client/'], build: true });
});

test('plan: unreadable diff redoes everything', () => {
  assert.deepEqual(plan(null), { installs: ['', 'server/', 'client/'], build: true });
});
