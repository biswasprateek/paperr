// Strips secrets out of request bodies before they reach the log file.
// Exact key names, not substrings: `token` would eat max_tokens, `pin` is_pinned.
const SECRET_FIELD = /^(password|passwd|password_hash|newPassword|currentPassword|adminPassword|pin|pin_hash|newPin|currentPin|adminPin|token|accessToken|refreshToken|secret|apiKey)$/i;

module.exports = (obj) => (obj && typeof obj === 'object' && !Array.isArray(obj)
  ? Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, SECRET_FIELD.test(k) ? '[redacted]' : v]))
  : obj);
