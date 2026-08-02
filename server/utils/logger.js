const fs = require('fs');
const path = require('path');

// Write next to index.js so the path is always known regardless of cwd
const LOG_PATH = process.env.LOG_PATH || path.join(__dirname, '..', 'data', 'logs', 'paperr.log');
fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });

function write(level, message, data) {
  const entry = { ts: new Date().toISOString(), level, message, ...(data !== undefined ? { data } : {}) };
  const line = JSON.stringify(entry);

  // Always print to console so it shows in the terminal even if file write fails
  if (level === 'ERROR') {
    console.error(`[LOGGER ${level}] ${message}`, JSON.stringify(data ?? ''));
  } else {
    console.log(`[LOGGER ${level}] ${message}`);
  }

  // Write to file — log any failure to stderr so it's visible
  try {
    fs.appendFileSync(LOG_PATH, line + '\n');
  } catch (e) {
    console.error(`[LOGGER] Could not write to ${LOG_PATH}:`, e.message);
  }
}

module.exports = {
  info:  (msg, data) => write('INFO',  msg, data),
  warn:  (msg, data) => write('WARN',  msg, data),
  error: (msg, data) => write('ERROR', msg, data),
  LOG_PATH,
};
