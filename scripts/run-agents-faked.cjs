/**
 * paperr — generate the pre-built agent insights as if it were a fixed date,
 * WITHOUT changing the system clock or restarting the server. We monkeypatch
 * Date inside this throwaway process only, then call the agent functions
 * directly (they read `new Date()` for "today"), so their text is dated to
 * FAKE. The insight rows' created_at is then normalised to the same day.
 *
 *   FAKE_TIME=2026-07-20T18:00:00 node scripts/run-agents-faked.cjs
 */
const path = require('path');

const FAKE_MS = new Date(process.env.FAKE_TIME || '2026-07-20T18:00:00').getTime();
const RealDate = Date;
global.Date = class extends RealDate {
  constructor(...a) { super(...(a.length ? a : [FAKE_MS])); }
  static now() { return FAKE_MS; }
};

const base = path.join(__dirname, '..', 'server');
const { getDb } = require(path.join(base, 'db', 'db'));
const { morningBrief } = require(path.join(base, 'ai', 'agents', 'morningBrief'));
const { rescheduleAdvisor } = require(path.join(base, 'ai', 'agents', 'rescheduleAdvisor'));
const { workloadSpread } = require(path.join(base, 'ai', 'agents', 'workloadSpread'));
const { bulletinBoard } = require(path.join(base, 'ai', 'agents', 'bulletinBoard'));
const { priorityFocus } = require(path.join(base, 'ai', 'agents', 'priorityFocus'));
const { todayLocal } = require(path.join(base, 'ai', 'agents', 'utils'));

const io = { to() { return { emit() {} }; }, emit() {} }; // no-op socket

(async () => {
  const db = getDb();
  const maya = db.prepare("SELECT * FROM users WHERE username = 'maya'").get();
  const SP = db.prepare("SELECT space_id FROM space_members WHERE user_id = ? AND role = 'admin'").get(maya.id).space_id;
  const space = db.prepare('SELECT * FROM spaces WHERE id = ?').get(SP);
  const today = todayLocal();
  console.log('faked today =', today, '| space', SP);

  db.prepare('DELETE FROM agent_insights WHERE space_id = ?').run(SP);

  const run = async (label, fn) => { try { await fn(); console.log(`  ${label}: ok`); } catch (e) { console.log(`  ${label}: ${e.message}`); } };
  await run('morning_brief', () => morningBrief(db, io, maya, SP, { force: true }));
  await run('priority', () => priorityFocus(db, io, maya, SP, today, { force: true }));
  await run('workload', () => workloadSpread(db, io, maya, SP, { force: true }));
  await run('reschedule', () => rescheduleAdvisor(db, io, maya, SP, { force: true }));
  await run('bulletin_board', () => bulletinBoard(db, io, space, { window: 'day', force: true }));

  // created_at is written by SQLite's real clock — normalise it to the faked
  // day so any "posted X ago" line lines up with the pinned screenshot clock.
  const stamp = today + ' 09:00:00';
  const n = db.prepare('UPDATE agent_insights SET created_at = ? WHERE space_id = ?').run(stamp, SP).changes;
  console.log(`  normalised created_at on ${n} insights -> ${stamp}`);
})().catch((e) => { console.error(e); process.exit(1); });
