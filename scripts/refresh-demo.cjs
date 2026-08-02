/**
 * paperr — realign the demo timeline to "today" after day(s) pass, without
 * reseeding (preserves the space name + curated Home/Hub boards).
 *
 *   node scripts/refresh-demo.cjs
 *
 * Idempotent & self-healing:
 *  - Task-group dates (tasks/events/projects/milestones/comments) shift by
 *    (today − anchor), anchor = the "Water the plants" task due on seed day.
 *  - History tables (wellness/mood/activity/sticky) shift by (today − their own
 *    latest date), so each self-heals even if a previous run half-completed.
 *  - Routine completions are regenerated (delete + rebuild) to dodge the
 *    unique-per-day constraint an in-place shift would trip.
 * Re-running the same day is a no-op. Also tops up Meal Planning and clears
 * stale agent insights so the screenshot run regenerates them for today.
 */
const path = require('path');
const { getDb } = require(path.join(__dirname, '..', 'server', 'db', 'db'));

const db = getDb();
db.exec('PRAGMA foreign_keys = ON');

const maya = db.prepare("SELECT id FROM users WHERE username = 'maya'").get();
if (!maya) { console.error('No demo user "maya" — run seed-demo.cjs first.'); process.exit(1); }
const diego = db.prepare("SELECT id FROM users WHERE username = 'diego'").get();
const SP = db.prepare("SELECT space_id FROM space_members WHERE user_id = ? AND role = 'admin'").get(maya.id).space_id;

const pad = (n) => String(n).padStart(2, '0');
// Target date the demo should be aligned to. Defaults to the real today, but
// DEMO_DATE=YYYY-MM-DD pins it (e.g. to match a fixed screenshot clock).
const todayStr = process.env.DEMO_DATE || new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD
const baseDate = new Date(todayStr + 'T12:00:00'); // anchor regeneration to the target date, not real "now"
const dateOff = (off) => { const d = new Date(baseDate); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const atOff = (off, hh, mm) => `${dateOff(off)}T${pad(hh)}:${pad(mm)}:00`;
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

// Shift a date/datetime string by `delta` days, preserving its exact format
// (date-only, or 'T'/' '-separated datetime) by only moving the date prefix.
const shiftBy = (delta) => (s) => {
  if (!s) return s;
  const d = new Date(s.slice(0, 10) + 'T00:00:00Z');
  if (isNaN(d)) return s;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10) + s.slice(10);
};
const bump = (delta, rows, cols, update) => {
  if (delta === 0) return;
  const sh = shiftBy(delta);
  for (const r of rows) {
    const vals = cols.map((c) => sh(r[c]));
    if (vals.some((v, i) => v !== r[cols[i]])) update.run(...vals, r.id);
  }
};

// ── task group: anchor on "Water the plants" (originally due seed-day) ───────
const anchor = db.prepare("SELECT due_date FROM tasks WHERE space_id = ? AND title = 'Water the plants'").get(SP)?.due_date;
const dA = anchor ? daysBetween(anchor, todayStr) : 0;
console.log(`space #${SP} · task-anchor ${anchor} · today ${todayStr} · shift ${dA}d`);
bump(dA, db.prepare('SELECT id, due_date, start_at, end_at, completed_at FROM tasks WHERE space_id = ?').all(SP),
  ['due_date', 'start_at', 'end_at', 'completed_at'],
  db.prepare('UPDATE tasks SET due_date=?, start_at=?, end_at=?, completed_at=? WHERE id=?'));
bump(dA, db.prepare('SELECT id, start_datetime, end_datetime FROM events WHERE space_id = ?').all(SP),
  ['start_datetime', 'end_datetime'], db.prepare('UPDATE events SET start_datetime=?, end_datetime=? WHERE id=?'));
bump(dA, db.prepare('SELECT id, start_date, end_date FROM projects WHERE space_id = ?').all(SP),
  ['start_date', 'end_date'], db.prepare('UPDATE projects SET start_date=?, end_date=? WHERE id=?'));
bump(dA, db.prepare('SELECT m.id, m.due_date, m.completed_at FROM milestones m JOIN projects p ON p.id=m.project_id WHERE p.space_id=?').all(SP),
  ['due_date', 'completed_at'], db.prepare('UPDATE milestones SET due_date=?, completed_at=? WHERE id=?'));
bump(dA, db.prepare('SELECT tc.id, tc.created_at FROM task_comments tc JOIN tasks t ON t.id=tc.task_id WHERE t.space_id=?').all(SP),
  ['created_at'], db.prepare('UPDATE task_comments SET created_at=? WHERE id=?'));

// ── history tables: each self-anchors on its own latest row ──────────────────
const selfShift = (table, dateCols, where) => {
  const rows = db.prepare(`SELECT id, ${dateCols.join(', ')} FROM ${table} WHERE ${where}`).all(SP);
  if (!rows.length) return;
  const maxDate = rows.reduce((m, r) => (r[dateCols[0]] > m ? r[dateCols[0]] : m), '').slice(0, 10);
  const d = maxDate ? daysBetween(maxDate, todayStr) : 0;
  const set = dateCols.map((c) => `${c}=?`).join(', ');
  bump(d, rows, dateCols, db.prepare(`UPDATE ${table} SET ${set} WHERE id=?`));
};
selfShift('wellness_sessions', ['created_at'], 'space_id = ?');
selfShift('mood_logs', ['created_at'], 'space_id = ?');
selfShift('activity', ['created_at'], 'space_id = ?');
selfShift('sticky_notes', ['created_at', 'updated_at'], 'space_id = ?');

// ── routine completions: regenerate the 14-day streak ending today ───────────
const habits = db.prepare('SELECT h.id FROM routines_habits h JOIN routines_protocols pr ON pr.id=h.protocol_id WHERE pr.space_id=?').all(SP).map((r) => r.id);
if (habits.length) {
  const ph = habits.map(() => '?').join(',');
  db.prepare(`DELETE FROM routines_completions WHERE habit_id IN (${ph})`).run(...habits);
  const ins = db.prepare('INSERT OR IGNORE INTO routines_completions (habit_id, user_id, completed_date, completed_at) VALUES (?, ?, ?, ?)');
  for (let off = -13; off <= 0; off++) {
    habits.forEach((h, i) => { if ((i + off) % 3 !== 0) ins.run(h, maya.id, dateOff(off), atOff(off, 7, 0)); });
    if (diego) habits.forEach((h, i) => { if ((i + off) % 2 === 0 && off > -8) ins.run(h, diego.id, dateOff(off), atOff(off, 7, 30)); });
  }
  console.log('  routine completions regenerated');
}

// ── Meal Planning: ensure it's well populated ────────────────────────────────
const meal = db.prepare("SELECT id FROM lists WHERE space_id = ? AND name = 'Meal Planning'").get(SP);
if (meal) {
  const have = new Set(db.prepare('SELECT title FROM list_items WHERE list_id = ?').all(meal.id).map((r) => r.title));
  const want = [
    'Mon — Pasta primavera', 'Tue — Taco night', 'Wed — Sheet-pan salmon', 'Thu — Leftovers',
    'Fri — Homemade pizza', 'Sat — Burgers on the grill', 'Sun — Sunday roast chicken',
    'Prep — Overnight oats for the week', 'Prep — Chop veggies for lunches',
  ];
  const ins = db.prepare('INSERT INTO list_items (list_id, title, sort_order, created_by) VALUES (?, ?, ?, ?)');
  let added = 0;
  want.forEach((t, i) => { if (!have.has(t)) { ins.run(meal.id, t, i, maya.id); added++; } });
  console.log(`  Meal Planning: ${have.size} existing, +${added} added`);
}

const del = db.prepare('DELETE FROM agent_insights WHERE space_id = ?').run(SP);
console.log(`  cleared ${del.changes} agent insights (regenerated by the screenshot run)`);
console.log('done');
