// In-memory brute force protection
// Locks account for 5 minutes after 5 failed attempts

const attempts = new Map(); // username -> { count, lockedUntil }

const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes

function recordFailedAttempt(username) {
  const now = Date.now();
  const entry = attempts.get(username) || { count: 0, lockedUntil: null };

  // Reset if previous lock has expired
  if (entry.lockedUntil && now > entry.lockedUntil) {
    entry.count = 0;
    entry.lockedUntil = null;
  }

  entry.count += 1;

  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCK_DURATION_MS;
  }

  attempts.set(username, entry);
}

function isLocked(username) {
  const entry = attempts.get(username);
  if (!entry) return false;
  if (!entry.lockedUntil) return false;
  if (Date.now() > entry.lockedUntil) {
    attempts.delete(username);
    return false;
  }
  return true;
}

function getRemainingLockSeconds(username) {
  const entry = attempts.get(username);
  if (!entry || !entry.lockedUntil) return 0;
  return Math.ceil((entry.lockedUntil - Date.now()) / 1000);
}

function clearAttempts(username) {
  attempts.delete(username);
}

module.exports = { recordFailedAttempt, isLocked, getRemainingLockSeconds, clearAttempts };
