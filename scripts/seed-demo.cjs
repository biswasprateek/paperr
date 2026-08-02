/**
 * paperr — demo data seeder for screenshots / docs.
 * Creates a clean "The Miller Family" space with 4 members and realistic,
 * collaborative content across every section. Idempotent: re-running wipes the
 * previous demo space + users first.
 *
 *   node scripts/seed-demo.cjs
 *
 * Login for all demo users: password `paperrdemo1` (maya is the admin).
 */
const path = require('path');
const bcrypt = require(path.join(__dirname, '..', 'server', 'node_modules', 'bcryptjs'));
const { getDb, seedDefaultData } = require(path.join(__dirname, '..', 'server', 'db', 'db'));

const SPACE_NAME = 'The Miller Family';
const PASSWORD = 'paperrdemo1';
const AREAS = [
  { name: 'Kitchen', icon: '🍳' }, { name: 'Living Room', icon: '🛋️' },
  { name: 'Bedroom', icon: '🛏️' }, { name: 'Bathroom', icon: '🚿' },
  { name: 'Office', icon: '🖥️' }, { name: 'Garage', icon: '🚗' },
];

// ── date helpers (local time strings, no timezone suffix) ────────────────────
const pad = (n) => String(n).padStart(2, '0');
const base = new Date();
function dateOnly(off) { const d = new Date(base); d.setDate(d.getDate() + off); return d.toISOString().slice(0, 10); }
function at(off, hh, mm) { const d = new Date(base); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hh)}:${pad(mm)}:00`; }

let widSeq = 0;
const wid = () => `w-seed-${++widSeq}`;

async function main() {
  const db = getDb();
  db.exec('PRAGMA foreign_keys = ON');

  // ── wipe previous demo ─────────────────────────────────────────────────────
  for (const s of db.prepare('SELECT id FROM spaces WHERE name = ?').all(SPACE_NAME)) {
    db.prepare('DELETE FROM spaces WHERE id = ?').run(s.id); // cascades content
  }
  for (const uname of ['maya', 'diego', 'ava', 'leo']) {
    const u = db.prepare('SELECT id FROM users WHERE username = ?').get(uname);
    if (u) { db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id); db.prepare('DELETE FROM users WHERE id = ?').run(u.id); }
  }

  // ── users ──────────────────────────────────────────────────────────────────
  const hash = await bcrypt.hash(PASSWORD, 10);
  const mkUser = (display, username, role, colour) =>
    db.prepare('INSERT INTO users (display_name, username, password_hash, role, avatar_colour) VALUES (?, ?, ?, ?, ?)')
      .run(display, username, hash, role, colour).lastInsertRowid;

  const maya = mkUser('Maya', 'maya', 'admin', '#e11d48');
  const diego = mkUser('Diego', 'diego', 'member', '#0ea5e9');
  const ava = mkUser('Ava', 'ava', 'member', '#a855f7');
  const leo = mkUser('Leo', 'leo', 'member', '#f59e0b');
  const mayaUser = db.prepare('SELECT * FROM users WHERE id = ?').get(maya);

  // ── space + areas + members + default seed content ─────────────────────────
  const spaceId = db.prepare(
    `INSERT INTO spaces (name, type, icon, colour, created_by) VALUES (?, 'family', '🏡', '#e11d48', ?)`
  ).run(SPACE_NAME, maya).lastInsertRowid;

  const addArea = db.prepare('INSERT INTO areas (name, icon, space_id) VALUES (?, ?, ?)');
  AREAS.forEach((a) => addArea.run(a.name, a.icon, spaceId));

  const addMember = db.prepare('INSERT INTO space_members (space_id, user_id, role) VALUES (?, ?, ?)');
  addMember.run(spaceId, maya, 'admin');
  [diego, ava, leo].forEach((u) => addMember.run(spaceId, u, 'member'));

  seedDefaultData(mayaUser, spaceId, 'family'); // starter lists, routines, Welcome project

  // ── project: Kitchen Renovation (shared) ───────────────────────────────────
  const proj = db.prepare(
    `INSERT INTO projects (name, description, cover_colour, cover_icon, status, owner_id, start_date, end_date, visibility, space_id)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?, 'shared', ?)`
  ).run('Kitchen Renovation', 'Refreshing the kitchen — new counters, cabinets and a fresh coat of paint before the holidays.',
    '#f97316', '🍳', maya, dateOnly(-20), dateOnly(30), spaceId).lastInsertRowid;

  db.prepare('INSERT INTO project_members (project_id, user_id, role_label, is_watcher) VALUES (?, ?, ?, ?)').run(proj, maya, 'Owner', 1);
  db.prepare('INSERT INTO project_members (project_id, user_id, role_label, is_watcher) VALUES (?, ?, ?, ?)').run(proj, diego, 'Builder', 1);
  db.prepare('INSERT INTO project_members (project_id, user_id, role_label, is_watcher) VALUES (?, ?, ?, ?)').run(proj, ava, 'Design', 0);

  const addPhase = db.prepare('INSERT INTO phases (project_id, name, colour, sort_order) VALUES (?, ?, ?, ?)');
  const addMilestone = db.prepare('INSERT INTO milestones (phase_id, project_id, name, due_date, sort_order, is_completed, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const addTask = db.prepare(
    `INSERT INTO tasks (title, description, project_id, phase_id, assigned_to, created_by, due_date, start_at, end_at, priority, status, is_completed, completed_at, completed_by, area_id, parent_task_id, space_id)
     VALUES (@title, @description, @project_id, @phase_id, @assigned_to, @created_by, @due_date, @start_at, @end_at, @priority, @status, @is_completed, @completed_at, @completed_by, @area_id, @parent_task_id, @space_id)`
  );
  const T = (o) => addTask.run({
    title: o.title, description: o.description ?? null, project_id: o.project_id ?? null, phase_id: o.phase_id ?? null,
    assigned_to: o.assigned_to ?? null, created_by: o.created_by ?? maya, due_date: o.due_date ?? null,
    start_at: o.start_at ?? null, end_at: o.end_at ?? null, priority: o.priority ?? 'medium',
    status: o.done ? 'done' : (o.status ?? 'todo'), is_completed: o.done ? 1 : 0,
    completed_at: o.done ? at(o.doneOff ?? -1, 12, 0) : null, completed_by: o.done ? (o.assigned_to ?? maya) : null,
    area_id: o.area_id ?? null, parent_task_id: o.parent_task_id ?? null, space_id: spaceId,
  }).lastInsertRowid;
  const addTag = db.prepare('INSERT INTO task_tags (task_id, tag) VALUES (?, ?)');
  const addComment = db.prepare('INSERT INTO task_comments (task_id, user_id, content, created_at) VALUES (?, ?, ?, ?)');

  const kitchenArea = db.prepare('SELECT id FROM areas WHERE space_id = ? AND name = ?').get(spaceId, 'Kitchen').id;

  const p1 = addPhase.run(proj, 'Planning', '#f59e0b', 0).lastInsertRowid;
  addMilestone.run(p1, proj, 'Budget & design locked', dateOnly(-10), 0, 1, at(-10, 9, 0));
  T({ title: 'Measure the kitchen', project_id: proj, phase_id: p1, assigned_to: diego, priority: 'medium', done: true, doneOff: -18, area_id: kitchenArea });
  T({ title: 'Pick counter material', project_id: proj, phase_id: p1, assigned_to: ava, priority: 'high', done: true, doneOff: -12 });
  T({ title: 'Get 3 contractor quotes', project_id: proj, phase_id: p1, assigned_to: maya, priority: 'high', done: true, doneOff: -11 });

  const p2 = addPhase.run(proj, 'Demolition', '#ef4444', 1).lastInsertRowid;
  addMilestone.run(p2, proj, 'Old kitchen cleared', dateOnly(-2), 0, 1, at(-2, 16, 0));
  T({ title: 'Empty and disconnect cabinets', project_id: proj, phase_id: p2, assigned_to: diego, priority: 'medium', done: true, doneOff: -4 });
  T({ title: 'Haul away old appliances', project_id: proj, phase_id: p2, assigned_to: diego, priority: 'low', done: true, doneOff: -2 });

  const p3 = addPhase.run(proj, 'Build', '#3b82f6', 2).lastInsertRowid;
  addMilestone.run(p3, proj, 'Cabinets & counters installed', dateOnly(10), 0, 0, null);
  const inst = T({ title: 'Install new cabinets', description: 'Contractor booked for the week.', project_id: proj, phase_id: p3, assigned_to: diego, due_date: dateOnly(2), priority: 'high' });
  T({ title: 'Sand and prep frames', project_id: proj, phase_id: p3, assigned_to: diego, parent_task_id: inst });
  T({ title: 'Mount upper cabinets', project_id: proj, phase_id: p3, assigned_to: diego, parent_task_id: inst });
  T({ title: 'Template & fit countertops', project_id: proj, phase_id: p3, assigned_to: maya, due_date: dateOnly(6), priority: 'medium' });
  addTag.run(T({ title: 'Tile the backsplash', project_id: proj, phase_id: p3, assigned_to: maya, due_date: dateOnly(8), priority: 'medium' }), 'blocked');

  const p4 = addPhase.run(proj, 'Finishing', '#10b981', 3).lastInsertRowid;
  addMilestone.run(p4, proj, 'Painted & styled', dateOnly(24), 0, 0, null);
  T({ title: 'Paint the walls (sage green)', project_id: proj, phase_id: p4, assigned_to: ava, due_date: dateOnly(14), priority: 'low' });
  T({ title: 'Style open shelves', project_id: proj, phase_id: p4, assigned_to: ava, due_date: dateOnly(20), priority: 'low' });

  addComment.run(inst, diego, 'Contractor confirmed for Tuesday — I\'ll be home to let them in.', at(-1, 8, 30));
  addComment.run(inst, maya, 'Perfect, thank you! I moved the countertop fitting to later that week.', at(-1, 9, 5));

  // ── standalone tasks (Today / Overdue / Calendar time-blocks) ──────────────
  addTag.run(T({ title: 'Pay the electricity bill', assigned_to: maya, due_date: dateOnly(-1), priority: 'high' }), 'bills');
  T({ title: 'Grocery run', assigned_to: diego, due_date: dateOnly(0), start_at: at(0, 17, 0), end_at: at(0, 18, 0), priority: 'medium' });
  T({ title: 'Soccer practice pickup', assigned_to: leo, due_date: dateOnly(0), start_at: at(0, 16, 0), end_at: at(0, 17, 30), priority: 'medium', area_id: kitchenArea });
  T({ title: 'Water the plants', assigned_to: ava, due_date: dateOnly(0), done: true, doneOff: 0 });
  T({ title: 'Book dentist appointment', assigned_to: maya, due_date: dateOnly(2), priority: 'low' });
  T({ title: 'Sunday meal prep', assigned_to: diego, due_date: dateOnly(4), start_at: at(4, 11, 0), end_at: at(4, 12, 30), priority: 'medium' });
  T({ title: 'Change HVAC filter', assigned_to: diego, due_date: dateOnly(-3), priority: 'medium' });

  // ── calendar events + attendees ────────────────────────────────────────────
  const addEvent = db.prepare(
    `INSERT INTO events (title, description, start_datetime, end_datetime, all_day, location, colour, created_by, space_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const rsvp = db.prepare('INSERT INTO event_attendees (event_id, user_id, rsvp) VALUES (?, ?, ?)');
  const evAll = (id) => [maya, diego, ava, leo].forEach((u) => rsvp.run(id, u, 'accepted'));

  const e1 = addEvent.run('Family Dinner', 'Taco night 🌮', at(0, 19, 0), at(0, 20, 30), 0, 'Home', '#e11d48', maya, spaceId).lastInsertRowid; evAll(e1);
  const e2 = addEvent.run('Parent-Teacher Meeting', null, at(3, 15, 0), at(3, 15, 30), 0, 'Lincoln Elementary', '#0ea5e9', maya, spaceId).lastInsertRowid;
  rsvp.run(e2, maya, 'accepted'); rsvp.run(e2, diego, 'accepted');
  const e3 = addEvent.run('Ava\'s Piano Recital', null, at(5, 18, 0), at(5, 19, 0), 0, 'Community Hall', '#a855f7', maya, spaceId).lastInsertRowid; evAll(e3);
  const e4 = addEvent.run('Weekend Getaway Planning', 'Pick a spot for the long weekend', at(6, 0, 0), at(6, 0, 0), 1, null, '#10b981', diego, spaceId).lastInsertRowid; evAll(e4);
  const e5 = addEvent.run('Leo — Soccer Match', null, at(6, 10, 0), at(6, 11, 30), 0, 'Riverside Field', '#f59e0b', diego, spaceId).lastInsertRowid; evAll(e5);

  // ── list items on the seeded starter lists ─────────────────────────────────
  const listByName = (name) => db.prepare('SELECT id FROM lists WHERE space_id = ? AND name = ?').get(spaceId, name)?.id;
  const addItem = db.prepare('INSERT INTO list_items (list_id, title, is_completed, completed_at, completed_by, sort_order, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const groceries = listByName('Groceries');
  [['Milk', 1], ['Eggs', 1], ['Baby spinach', 0], ['Chicken thighs', 0], ['Olive oil', 0], ['Coffee beans', 1], ['Bananas', 0], ['Taco shells', 0]]
    .forEach(([t, done], i) => addItem.run(groceries, t, done, done ? at(0, 10, 0) : null, done ? diego : null, i, diego));
  const meals = listByName('Meal Planning');
  [['Mon — Pasta primavera', 0], ['Tue — Taco night', 0], ['Wed — Sheet-pan salmon', 0], ['Thu — Leftovers', 0], ['Fri — Homemade pizza', 0]]
    .forEach(([t, done], i) => addItem.run(meals, t, done, null, null, i, maya));
  // Share a couple of the starter lists so they show on the Hub / collaboratively
  db.prepare("UPDATE lists SET visibility = 'shared' WHERE space_id = ? AND name IN ('Groceries','Meal Planning','Chores')").run(spaceId);

  // ── notebook + notes (shared) ──────────────────────────────────────────────
  const nb = db.prepare(
    "INSERT INTO kb_notebooks (name, icon, colour, description, created_by, space_id, visibility) VALUES (?, 'home', '#e76750', ?, ?, ?, 'shared')"
  ).run('Home Docs', 'The shared family brain — how things work around the house.', maya, spaceId).lastInsertRowid;
  const addNote = db.prepare('INSERT INTO kb_notes (notebook_id, title, content, created_by, updated_by, is_pinned, word_count) VALUES (?, ?, ?, ?, ?, ?, ?)');
  addNote.run(nb, 'Wi-Fi & Network',
    '# Wi-Fi & Network\n\n**Network:** MillerHome_5G\n**Guest network:** MillerGuest (ask before sharing)\n\n- Router is in the office closet\n- Restart: unplug 30s if the internet drops\n- Printer connects over Wi-Fi — `HP-OfficeJet`\n', maya, maya, 1, 40);
  addNote.run(nb, 'Weeknight Dinner Recipes',
    '# Weeknight Dinners\n\n## Taco Night 🌮\n- Brown 1 lb beef with taco seasoning\n- Warm shells, chop toppings\n- Serve with rice & beans\n\n## Sheet-pan Salmon\n- Salmon + broccoli + lemon\n- 400°F for 15 min\n\n> Ava is vegetarian on weekdays — keep a bean option.\n', diego, diego, 0, 55);
  addNote.run(nb, 'Home Maintenance Log',
    '# Maintenance Log\n\n| Task | Every | Last done |\n| --- | --- | --- |\n| HVAC filter | 3 months | recently |\n| Smoke detectors | 6 months | — |\n| Gutters | Fall | — |\n\n- Water heater flush is overdue, book a plumber.\n', maya, maya, 0, 45);

  // ── good thoughts (shared) ─────────────────────────────────────────────────
  const tc = db.prepare(
    "INSERT INTO thought_collections (space_id, created_by, name, category, icon, color, visibility) VALUES (?, ?, ?, 'Affirmations', '🌱', '#10b981', 'shared')"
  ).run(spaceId, maya, 'Daily Family Affirmations').lastInsertRowid;
  const addThought = db.prepare('INSERT INTO thought_entries (collection_id, body, plain, attribution, sort_order, created_by) VALUES (?, ?, ?, ?, ?, ?)');
  [['We take care of this home together.', null], ['Every small effort counts.', null],
   ['Kindness first, always.', null], ['Progress over perfection.', 'Ava'],
   ['We\'ve got each other.', null]]
    .forEach(([t, by], i) => addThought.run(tc, t, t, by, i, maya));

  // ── hub board + sticky notes ───────────────────────────────────────────────
  const hubBoard = {
    pages: [{
      id: 'p-hub', name: 'Hub', widgets: [
        { id: wid(), type: 'sticky-pads', w: 2, h: 2, props: {} },
        { id: wid(), type: 'shared-calendar', w: 2, h: 2, props: {} },
        { id: wid(), type: 'space-routines', w: 2, h: 2, props: {} },
        { id: wid(), type: 'shared-list', w: 1, h: 2, props: { listId: groceries } },
        { id: wid(), type: 'events', w: 1, h: 2, props: {} },
        { id: wid(), type: 'activity', w: 1, h: 2, props: {} },
        { id: wid(), type: 'projects', w: 1, h: 2, props: {} },
      ],
    }],
  };
  db.prepare("INSERT INTO hub_boards (space_id, board_json, updated_by) VALUES (?, ?, ?) ON CONFLICT(space_id) DO UPDATE SET board_json = excluded.board_json")
    .run(spaceId, JSON.stringify(hubBoard), maya);

  const addSticky = db.prepare('INSERT INTO sticky_notes (space_id, author_id, text, colour) VALUES (?, ?, ?, ?)');
  addSticky.run(spaceId, diego, 'Contractor comes Tuesday 8am — someone be home 🔨', '#fde68a');
  addSticky.run(spaceId, ava, 'Recital Friday! Please come 🎹', '#fbcfe8');
  addSticky.run(spaceId, maya, 'Grandma visiting this weekend — tidy the guest room 💛', '#bbf7d0');
  addSticky.run(spaceId, leo, 'Out of cereal!! 🥣', '#bfdbfe');

  // ── custom agent (Maya, shared) ────────────────────────────────────────────
  db.prepare(
    "INSERT INTO custom_agents (user_id, space_id, name, icon, instructions, schedule_cron, enabled, visibility) VALUES (?, ?, ?, '🧹', ?, '0 8 * * *', 1, 'shared')"
  ).run(maya, spaceId, 'Chore Chaser', 'Every morning, summarise which chores are overdue and who they are assigned to. Keep it light and encouraging.');

  // ── a couple of notifications for Maya (project watcher) ───────────────────
  const addNotif = db.prepare('INSERT INTO notifications (user_id, space_id, project_id, task_id, type, message) VALUES (?, ?, ?, ?, ?, ?)');
  addNotif.run(maya, spaceId, proj, inst, 'comment', 'Diego commented on “Install new cabinets”');
  addNotif.run(maya, spaceId, proj, null, 'task_done', 'Diego completed “Haul away old appliances”');

  // ── activity feed ──────────────────────────────────────────────────────────
  const addAct = db.prepare('INSERT INTO activity (user_id, action, entity_type, entity_id, description, space_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  addAct.run(diego, 'completed', 'task', null, 'completed “Haul away old appliances”', spaceId, at(-2, 16, 10));
  addAct.run(ava, 'completed', 'task', null, 'completed “Water the plants”', spaceId, at(0, 8, 30));
  addAct.run(maya, 'created', 'event', e3, 'added event “Ava\'s Piano Recital”', spaceId, at(-1, 20, 0));
  addAct.run(diego, 'commented', 'task', inst, 'commented on “Install new cabinets”', spaceId, at(-1, 8, 30));
  addAct.run(leo, 'created', 'sticky', null, 'left a sticky note', spaceId, at(0, 7, 15));

  // ── routine streaks + wellness/mood for Analytics (Maya) ───────────────────
  const habits = db.prepare(
    "SELECT h.id FROM routines_habits h JOIN routines_protocols p ON p.id = h.protocol_id WHERE p.space_id = ?"
  ).all(spaceId).map((r) => r.id);
  const addCompletion = db.prepare('INSERT OR IGNORE INTO routines_completions (habit_id, user_id, completed_date, completed_at) VALUES (?, ?, ?, ?)');
  for (let off = -13; off <= 0; off++) {
    // Maya keeps a strong streak; Diego is more sporadic.
    habits.forEach((h, i) => { if ((i + off) % 3 !== 0) addCompletion.run(h, maya, dateOnly(off), at(off, 7, 0)); });
    habits.forEach((h, i) => { if ((i + off) % 2 === 0 && off > -8) addCompletion.run(h, diego, dateOnly(off), at(off, 7, 30)); });
  }

  const addWell = db.prepare('INSERT INTO wellness_sessions (user_id, space_id, type, label, duration_sec, completed, source, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)');
  const addMood = db.prepare('INSERT INTO mood_logs (user_id, space_id, mood, session_id, context, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  for (let off = -13; off <= 0; off++) {
    if (off % 2 === 0) {
      const s = addWell.run(maya, spaceId, 'pomodoro', 'Deep work', 1500, 'live', at(off, 9, 0)).lastInsertRowid;
      if (off % 4 === 0) addWell.run(maya, spaceId, 'pomodoro', 'Deep work', 1500, 'live', at(off, 10, 0));
      addMood.run(maya, spaceId, 3 + ((off / 2) % 2 === 0 ? 1 : 0), null, null, at(off, 20, 0));
      void s;
    }
    if (off % 3 === 0) addWell.run(maya, spaceId, 'meditation', 'Calm', 600, 'live', at(off, 21, 0));
    if (off % 3 === 0) addWell.run(diego, spaceId, 'pomodoro', 'Focus', 1500, 'live', at(off, 14, 0));
  }

  console.log(`\n✅ Seeded "${SPACE_NAME}" (space #${spaceId})`);
  console.log(`   Users (password: ${PASSWORD}):  maya[admin] #${maya} · diego #${diego} · ava #${ava} · leo #${leo}`);
  console.log(`   Project #${proj} · Notebook #${nb} · ${habits.length} habits\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
