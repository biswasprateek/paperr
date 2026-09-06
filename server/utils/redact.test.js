// Log-redaction self-check. Run: node server/utils/redact.test.js
// Secrets must never reach the log file, and ordinary fields must survive —
// a substring match on "token"/"pin" silently eats max_tokens and is_pinned.
const assert = require('node:assert');
const redact = require('./redact');

for (const key of ['password', 'pin', 'newPin', 'adminPassword', 'currentPassword',
                   'password_hash', 'refreshToken', 'apiKey', 'PASSWORD']) {
  assert.strictEqual(redact({ [key]: 'hunter2' })[key], '[redacted]', `${key} leaked`);
}

for (const [key, val] of Object.entries({ max_tokens: 512, is_pinned: 1, username: 'jane',
                                          displayName: 'Jane', spinner: 'on' })) {
  assert.strictEqual(redact({ [key]: val })[key], val, `${key} was over-redacted`);
}

assert.deepStrictEqual(redact({ username: 'jane', password: 'p' }), { username: 'jane', password: '[redacted]' });
assert.strictEqual(redact(undefined), undefined);
assert.strictEqual(redact(null), null);
assert.deepStrictEqual(redact([1, 2]), [1, 2]);

console.log('redact self-check passed');
