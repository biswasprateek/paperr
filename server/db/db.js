// Node.js built-in SQLite (Node 22.5+) — synchronous, no compilation needed.
// API is compatible with better-sqlite3: prepare().run/get/all with positional or named params.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/databases/paperr.db');
const RESOLVED_DB_PATH = path.resolve(DB_PATH);
const schemaPath = path.join(__dirname, 'schema.sql');

let db;

function getDb() {
  if (!db) {
    fs.mkdirSync(path.dirname(RESOLVED_DB_PATH), { recursive: true });
    db = new DatabaseSync(RESOLVED_DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    // node:sqlite's DatabaseSync has no .transaction(), unlike better-sqlite3.
    // Polyfill it so existing db.transaction(fn)() call sites keep working.
    db.transaction = (fn) => (...args) => {
      db.exec('BEGIN');
      try {
        const result = fn(...args);
        db.exec('COMMIT');
        return result;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    };
    runMigrations();
    fixMissingCascades();
    runMigrations(); // re-creates any indexes dropped by a table rebuild above
  }
  return db;
}

// Closes the current connection so the underlying file can be safely
// replaced (used by backup restore); the next getDb() call reopens it.
function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

function runMigrations() {
  const schema = fs.readFileSync(schemaPath, 'utf8');
  // Strip `--` line comments BEFORE splitting on `;`. The split is deliberately
  // naive, so a stray semicolon (or apostrophe) inside a comment would otherwise
  // fuse into — and silently break — the following statement. None of this
  // schema's string literals contain `--`, so this is safe.
  const statements = schema
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  for (const stmt of statements) {
    try { db.exec(stmt + ';'); } catch {}
  }
}

// A handful of FK columns were declared without ON DELETE CASCADE, so deleting
// a task/project/space whose children still reference them throws "FOREIGN
// KEY constraint failed" instead of cascading (this is what broke space
// deletion — space -> projects cascades fine, but phases/project_members/
// events still pointing at that project has nowhere to go). SQLite can't
// ALTER a column's FK action in place, so each affected table is rebuilt via
// the rename/recreate/copy dance. Guarded by foreign_key_list so the rebuild
// (and its data copy) only actually runs once per table, ever.
function fixMissingCascades() {
  const rebuilds = [
    {
      table: 'task_comments', column: 'task_id', refTable: 'tasks',
      columns: ['id', 'task_id', 'user_id', 'content', 'created_at'],
      createSql: `CREATE TABLE task_comments (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id    INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
        user_id    INTEGER REFERENCES users(id),
        content    TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
    },
    {
      table: 'task_tags', column: 'task_id', refTable: 'tasks',
      columns: ['task_id', 'tag'],
      createSql: `CREATE TABLE task_tags (
        task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
        tag     TEXT NOT NULL,
        PRIMARY KEY (task_id, tag)
      )`,
    },
    {
      table: 'phases', column: 'project_id', refTable: 'projects',
      columns: ['id', 'project_id', 'name', 'colour', 'sort_order', 'is_completed', 'completed_at', 'completed_by'],
      createSql: `CREATE TABLE phases (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id   INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        name         TEXT NOT NULL,
        colour       TEXT,
        sort_order   INTEGER DEFAULT 0,
        is_completed INTEGER DEFAULT 0,
        completed_at TEXT,
        completed_by INTEGER REFERENCES users(id)
      )`,
    },
    {
      table: 'project_members', column: 'project_id', refTable: 'projects',
      columns: ['project_id', 'user_id', 'role_label', 'is_watcher'],
      createSql: `CREATE TABLE project_members (
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        user_id    INTEGER REFERENCES users(id),
        role_label TEXT,
        is_watcher INTEGER DEFAULT 0,
        PRIMARY KEY (project_id, user_id)
      )`,
    },
    {
      table: 'events', column: 'project_id', refTable: 'projects',
      columns: ['id', 'title', 'description', 'start_datetime', 'end_datetime', 'all_day', 'location', 'colour',
        'project_id', 'created_by', 'is_recurring', 'recur_interval', 'recur_end_date', 'archived', 'space_id', 'created_at'],
      createSql: `CREATE TABLE events (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        title          TEXT NOT NULL,
        description    TEXT,
        start_datetime TEXT NOT NULL,
        end_datetime   TEXT,
        all_day        INTEGER DEFAULT 0,
        location       TEXT,
        colour         TEXT,
        project_id     INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        created_by     INTEGER REFERENCES users(id),
        is_recurring   INTEGER DEFAULT 0,
        recur_interval TEXT,
        recur_end_date TEXT,
        archived       INTEGER DEFAULT 0,
        space_id       INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
        created_at     TEXT DEFAULT (datetime('now'))
      )`,
    },
  ];

  for (const r of rebuilds) {
    const fks = db.prepare(`PRAGMA foreign_key_list(${r.table})`).all();
    const fk = fks.find(f => f.from === r.column && f.table === r.refTable);
    if (!fk || fk.on_delete === 'CASCADE') continue;

    const cols = r.columns.join(', ');
    const tmpTable = `${r.table}__pre_cascade_fix`;
    db.exec('PRAGMA foreign_keys = OFF');
    // Without this, ALTER TABLE RENAME rewrites every OTHER table's REFERENCES
    // clause to point at the temp name too — so once the temp table is
    // dropped, those other tables are left referencing a table that no
    // longer exists. legacy_alter_table keeps a rename from touching anyone
    // else's schema text.
    db.exec('PRAGMA legacy_alter_table = ON');
    db.exec('BEGIN');
    try {
      db.exec(`ALTER TABLE ${r.table} RENAME TO ${tmpTable}`);
      db.exec(r.createSql);
      db.exec(`INSERT INTO ${r.table} (${cols}) SELECT ${cols} FROM ${tmpTable}`);
      db.exec(`DROP TABLE ${tmpTable}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    } finally {
      db.exec('PRAGMA legacy_alter_table = OFF');
      db.exec('PRAGMA foreign_keys = ON');
    }
  }
}

function isFirstRun() {
  const d = getDb();
  const row = d.prepare('SELECT COUNT(*) as cnt FROM users').get();
  return row.cnt === 0;
}

const STARTER_LISTS = {
  family: [
    ['Maintenance',    '🧹', '#F97316'],
    ['Groceries',      '🛒', '#10b981'],
    ['Meal Planning',  '🍽️', '#f59e0b'],
    ['Chores',         '🧽', '#3b82f6'],
    ['Personal',       '🔒', '#8b5cf6'],
  ],
  team: [
    ['To Do',            '✅', '#f59e0b'],
    ['Office Supplies',  '🖇️', '#64748b'],
    ['Onboarding',       '📋', '#10b981'],
    ['Meeting Notes',    '📝', '#3b82f6'],
    ['Ideas & Backlog',  '💡', '#a855f7'],
  ],
};

function seedDefaultData(adminUser, spaceId, type = 'family') {
  const d = getDb();
  const insertList = d.prepare(
    'INSERT OR IGNORE INTO lists (name, icon, colour, created_by, space_id) VALUES (?, ?, ?, ?, ?)'
  );
  const starterLists = STARTER_LISTS[type] || STARTER_LISTS.family;
  starterLists.forEach(([name, icon, colour]) => insertList.run(name, icon, colour, adminUser.id, spaceId));

  // Sample list template so the feature is discoverable on a fresh install.
  const tpl = d.prepare(
    'INSERT INTO list_templates (name, icon, colour, created_by, space_id) VALUES (?, ?, ?, ?, ?)'
  ).run('Travel Essentials', '🧳', '#0ea5e9', adminUser.id, spaceId);
  const insertTplItem = d.prepare(
    'INSERT INTO list_template_items (template_id, title, sort_order) VALUES (?, ?, ?)'
  );
  ['Passport & ID', 'Phone & charger', 'Toiletries', 'Medication', 'Travel adapter',
   'Headphones', 'Snacks', 'Reusable water bottle']
    .forEach((title, idx) => insertTplItem.run(tpl.lastInsertRowid, title, idx));

  // Starter routine so Day Arc view has a habit in every time block out of the box.
  const insertProtocol = d.prepare(
    'INSERT INTO routines_protocols (space_id, created_by, name, color, icon, description, visibility, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertHabit = d.prepare(
    'INSERT INTO routines_habits (protocol_id, title, icon, time_slot, target_time, duration_minutes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  const morningId = insertProtocol.run(
    spaceId, adminUser.id, 'Morning Routine', '#f59e0b', '🌅', 'Start the day with intention.', 'personal', 0
  ).lastInsertRowid;
  [
    ['Drink a glass of water',      '💧', 'early_morning', '06:30', 2],
    ['Make the bed',                '🛏️', 'morning',       '07:00', 5],
    ["Review today's priorities",   '📝', 'morning',       '07:15', 10],
    ['Take a short walk',           '🚶', 'afternoon',     '13:00', 15],
  ].forEach(([title, icon, slot, time, mins]) =>
    insertHabit.run(morningId, title, icon, slot, time, mins, adminUser.id));

  const windDownId = insertProtocol.run(
    spaceId, adminUser.id, 'Wind Down', '#6366f1', '🌙', 'Ease into rest.', 'personal', 1
  ).lastInsertRowid;
  [
    ['Screens off',                 '📵', 'evening', '21:00', null],
    ['Journal 3 gratitudes',        '✍️', 'evening', '21:15', 5],
    ['Read',                        '📖', 'night',   '21:30', 20],
    ['Lights out',                  '😴', 'night',   '22:30', null],
  ].forEach(([title, icon, slot, time, mins]) =>
    insertHabit.run(windDownId, title, icon, slot, time, mins, adminUser.id));

  // "Welcome to Paperr" onboarding project — tour of the app via phases/milestones/tasks/subtasks.
  const daysFromNow = (n) => {
    const dt = new Date();
    dt.setDate(dt.getDate() + n);
    return dt.toISOString().slice(0, 10);
  };

  const { lastInsertRowid: welcomeProjectId } = d.prepare(
    'INSERT INTO projects (name, description, cover_colour, cover_icon, status, owner_id, visibility, space_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run('Welcome to Paperr 👋', "A few things to explore to get comfortable around here.", '#6366f1', '👋', 'active', adminUser.id, 'personal', spaceId);

  const insertPhase = d.prepare('INSERT INTO phases (project_id, name, colour, sort_order) VALUES (?, ?, ?, ?)');
  const insertMilestone = d.prepare(
    'INSERT INTO milestones (phase_id, project_id, name, due_date, sort_order) VALUES (?, ?, ?, ?, ?)'
  );
  const insertTask = d.prepare(
    `INSERT INTO tasks (title, project_id, phase_id, assigned_to, created_by, due_date, priority, status, is_completed, completed_at, parent_task_id, space_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertTaskTag = d.prepare('INSERT INTO task_tags (task_id, tag) VALUES (?, ?)');

  const addTask = (phaseId, title, { priority = 'low', due = null, tag = null, parentId = null, done = false } = {}) => {
    const { lastInsertRowid: taskId } = insertTask.run(
      title, welcomeProjectId, phaseId, adminUser.id, adminUser.id,
      due, priority, done ? 'done' : 'todo', done ? 1 : 0, done ? new Date().toISOString() : null, parentId, spaceId
    );
    if (tag) insertTaskTag.run(taskId, tag);
    return taskId;
  };

  // Phase 1 — Get Oriented
  const phase1Id = insertPhase.run(welcomeProjectId, 'Get Oriented', '#f59e0b', 0).lastInsertRowid;
  insertMilestone.run(phase1Id, welcomeProjectId, 'Explored the basics', daysFromNow(3), 0);
  const exploreSpaceId = addTask(phase1Id, 'Explore your Space', { priority: 'medium', due: daysFromNow(1) });
  addTask(phase1Id, 'Check out the sidebar apps', { parentId: exploreSpaceId });
  addTask(phase1Id, 'Switch spaces if you have more than one', { parentId: exploreSpaceId });
  addTask(phase1Id, 'Explore the Home page');
  addTask(phase1Id, 'Explore Tasks');
  addTask(phase1Id, 'Explore Calendar');
  addTask(phase1Id, 'Create your first list', { tag: 'tutorial' });
  addTask(phase1Id, 'Try the Routines tab', { done: true });

  // Phase 2 — Discover More Apps
  const phase2Id = insertPhase.run(welcomeProjectId, 'Discover More Apps', '#a855f7', 1).lastInsertRowid;
  insertMilestone.run(phase2Id, welcomeProjectId, 'Explored the extras', daysFromNow(5), 0);
  addTask(phase2Id, 'Explore Frame');
  const exploreAgentsId = addTask(phase2Id, 'Explore AI Agents');
  addTask(phase2Id, 'Create your own agent', { parentId: exploreAgentsId });
  addTask(phase2Id, 'Explore Apps');
  addTask(phase2Id, 'Explore Analytics');
  addTask(phase2Id, 'Explore Notebooks');

  // Phase 3 — Make It Yours
  const phase3Id = insertPhase.run(welcomeProjectId, 'Make It Yours', '#10b981', 2).lastInsertRowid;
  insertMilestone.run(phase3Id, welcomeProjectId, 'Personalized your workspace', daysFromNow(7), 0);
  const setupProjectId = addTask(phase3Id, 'Set up a project of your own', { priority: 'medium' });
  addTask(phase3Id, 'Pick an icon and colour', { parentId: setupProjectId });
  addTask(phase3Id, 'Add your first task', { parentId: setupProjectId });
  addTask(phase3Id, 'Invite a teammate or family member', { priority: 'high', due: daysFromNow(5), tag: 'collaboration' });
  addTask(phase3Id, 'Explore Settings');
  addTask(phase3Id, "Delete this welcome project when you're done");
}

module.exports = { getDb, closeDb, isFirstRun, seedDefaultData, DB_PATH: RESOLVED_DB_PATH };
