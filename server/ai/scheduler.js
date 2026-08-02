const cron = require('node-cron');
const { getDb } = require('../db/db');
const { morningBrief } = require('./agents/morningBrief');
const { rescheduleAdvisor } = require('./agents/rescheduleAdvisor');
const { workloadSpread } = require('./agents/workloadSpread');
const { bulletinBoard } = require('./agents/bulletinBoard');
const { customAgent } = require('./agents/customAgent');
const logger = require('../utils/logger');

let ioRef = null;
const customJobs = new Map(); // custom_agents.id → cron task

// Every (active user, space) pair — per-user agents run once per pair.
// Every agent guards itself with alreadyFiredToday, so re-runs are no-ops.
async function runForAllUsers(agentFn, label) {
  const db = getDb();
  const pairs = db.prepare(`
    SELECT u.*, sm.space_id AS agent_space_id FROM users u
    JOIN space_members sm ON sm.user_id = u.id
    WHERE u.is_active = 1
  `).all();
  for (const user of pairs) {
    try {
      await agentFn(db, ioRef, user, user.agent_space_id);
    } catch (err) {
      logger.info(`agent ${label} failed`, { userId: user.id, spaceId: user.agent_space_id, error: err.message });
    }
  }
}

async function runForAllSpaces(agentFn, label, opts = {}) {
  const db = getDb();
  const spaces = db.prepare('SELECT * FROM spaces').all();
  for (const space of spaces) {
    try {
      await agentFn(db, ioRef, space, opts);
    } catch (err) {
      logger.info(`agent ${label} failed`, { spaceId: space.id, error: err.message });
    }
  }
}

function isValidCron(expr) {
  return typeof expr === 'string' && expr.trim().split(/\s+/).length === 5 && cron.validate(expr);
}

function registerCustomAgent(row) {
  unregisterCustomAgent(row.id);
  if (!row.enabled || !isValidCron(row.schedule_cron)) return false;
  const job = cron.schedule(row.schedule_cron, () => {
    customAgent(getDb(), ioRef, row.id)
      .catch(err => logger.info('custom agent failed', { customAgentId: row.id, error: err.message }));
  });
  customJobs.set(row.id, job);
  return true;
}

function unregisterCustomAgent(id) {
  const job = customJobs.get(id);
  if (job) {
    job.stop();
    customJobs.delete(id);
  }
}

// Self-hosted servers are often asleep at fire time — after boot, run any
// daily agent whose slot has already passed today. alreadyFiredToday makes
// this idempotent.
async function catchUp() {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  // Morning Brief and Bulletin Board fire on every server start, not just once the
  // daily slot has passed — alreadyFiredToday still caps them at once per day.
  await runForAllSpaces(bulletinBoard, 'bulletinBoard', { window: now.getDay() === 1 ? 'week' : 'day' });
  await runForAllUsers(morningBrief, 'morningBrief');
  if (mins >= 9 * 60) await runForAllUsers(rescheduleAdvisor, 'rescheduleAdvisor');
  if (now.getDay() === 0 && mins >= 18 * 60) await runForAllUsers(workloadSpread, 'workloadSpread');
}

function startScheduler(io) {
  ioRef = io;

  cron.schedule('0 8 * * *', () => runForAllUsers(morningBrief, 'morningBrief'));
  cron.schedule('0 9 * * *', () => runForAllUsers(rescheduleAdvisor, 'rescheduleAdvisor'));
  cron.schedule('0 18 * * 0', () => runForAllUsers(workloadSpread, 'workloadSpread'));
  // Daily bulletin skips Monday — the weekly roll-up covers that slot
  cron.schedule('30 7 * * 0,2-6', () => runForAllSpaces(bulletinBoard, 'bulletinBoard', { window: 'day' }));
  cron.schedule('30 7 * * 1', () => runForAllSpaces(bulletinBoard, 'bulletinBoard', { window: 'week' }));

  try {
    const rows = getDb().prepare('SELECT * FROM custom_agents WHERE enabled = 1').all();
    rows.forEach(registerCustomAgent);
    logger.info('agent scheduler started', { customAgents: rows.length });
  } catch (err) {
    logger.info('agent scheduler: custom agent load failed', { error: err.message });
  }

  // Give the server a moment to finish booting before the catch-up pass
  setTimeout(() => {
    catchUp().catch(err => logger.info('agent catch-up failed', { error: err.message }));
  }, 5000);
}

module.exports = { startScheduler, registerCustomAgent, unregisterCustomAgent, isValidCron, runForAllUsers, runForAllSpaces };
