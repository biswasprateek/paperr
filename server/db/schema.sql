-- ============================================================
-- paperr Database Schema
-- ============================================================

-- Users & Auth
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  pin_hash TEXT,
  avatar_url TEXT,
  avatar_colour TEXT DEFAULT '#F97316',
  role TEXT DEFAULT 'member',
  preferences_json TEXT DEFAULT '{}',
  is_active INTEGER DEFAULT 1,
  nickname TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  token_hash TEXT NOT NULL,
  device_label TEXT,
  last_seen TEXT,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  details_json TEXT,
  timestamp TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- Spaces (replaces the single-household concept)
-- ============================================================
CREATE TABLE IF NOT EXISTS spaces (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'family',  -- 'family' | 'team'
  icon       TEXT DEFAULT '🏠',
  colour     TEXT DEFAULT '#F97316',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS space_members (
  space_id  INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member',  -- 'admin' | 'member'
  joined_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (space_id, user_id)
);

-- A user requesting to join a space, pending admin approval/denial.
CREATE TABLE IF NOT EXISTS space_join_requests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id    INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'denied'
  message     TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  decided_at  TEXT,
  decided_by  INTEGER REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_join_requests_space  ON space_join_requests(space_id, status);
CREATE INDEX IF NOT EXISTS idx_join_requests_user   ON space_join_requests(user_id, status);

-- Hub board: one shared, admin-curated widget board per space. Layout only —
-- same { pages: [{ widgets: [{ id, type, w, h, props }] }] } shape as the
-- personal Home board (users.preferences_json.tabletBoard). Content always
-- lives in the feature tables each widget points at.
CREATE TABLE IF NOT EXISTS hub_boards (
  space_id      INTEGER PRIMARY KEY REFERENCES spaces(id) ON DELETE CASCADE,
  board_json    TEXT NOT NULL DEFAULT '{}',
  settings_json TEXT DEFAULT '{}',
  updated_by    INTEGER REFERENCES users(id),
  updated_at    TEXT DEFAULT (datetime('now'))
);

-- Sticky notes: short member-to-member messages shown on the Hub's Sticky
-- Pads widget. Any member may post (content is collaborative even though the
-- Hub layout is admin-only). expires_at NULL means the note never expires.
CREATE TABLE IF NOT EXISTS sticky_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id   INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  author_id  INTEGER NOT NULL REFERENCES users(id),
  text       TEXT NOT NULL,
  colour     TEXT,
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sticky_notes_space ON sticky_notes(space_id);

-- ============================================================
-- Areas (replaces rooms — predefined set seeded per space type)
-- ============================================================
CREATE TABLE IF NOT EXISTS areas (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  icon       TEXT DEFAULT '📍',
  colour     TEXT,
  space_id   INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- Lists & Tasks
-- ============================================================
CREATE TABLE IF NOT EXISTS lists (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  icon       TEXT DEFAULT '📋',
  colour     TEXT DEFAULT '#F97316',
  created_by INTEGER REFERENCES users(id),
  space_id   INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  visibility TEXT NOT NULL DEFAULT 'personal', -- 'personal' | 'shared'
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS list_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id      INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  notes        TEXT,
  is_completed INTEGER DEFAULT 0,
  completed_at TEXT,
  completed_by INTEGER REFERENCES users(id),
  task_id      INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  project_id   INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  sort_order   INTEGER DEFAULT 0,
  indent_level INTEGER DEFAULT 0,
  created_by   INTEGER REFERENCES users(id),
  created_at   TEXT DEFAULT (datetime('now'))
);

-- Migration: add indent_level if table existed before this column was introduced
ALTER TABLE list_items ADD COLUMN indent_level INTEGER DEFAULT 0;

-- List templates: reusable blueprints (e.g. "Travel Essentials") used to spawn new lists.
CREATE TABLE IF NOT EXISTS list_templates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  icon       TEXT DEFAULT '📋',
  colour     TEXT DEFAULT '#F97316',
  created_by INTEGER REFERENCES users(id),
  space_id   INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS list_template_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES list_templates(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  notes       TEXT,
  sort_order  INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  description       TEXT,
  cover_colour      TEXT DEFAULT '#F97316',
  cover_icon        TEXT DEFAULT '📁',
  status            TEXT DEFAULT 'active',
  owner_id          INTEGER REFERENCES users(id),
  start_date        TEXT,
  end_date          TEXT,
  completed_at      TEXT,
  progress_override INTEGER,
  visibility        TEXT DEFAULT 'personal', -- 'personal' | 'shared'
  template          TEXT,
  space_id          INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  created_at        TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS phases (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id),
  name       TEXT NOT NULL,
  colour     TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tasks (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  title               TEXT NOT NULL,
  description         TEXT,
  task_notes          TEXT,
  project_id          INTEGER REFERENCES projects(id),
  phase_id            INTEGER REFERENCES phases(id),
  assigned_to         INTEGER REFERENCES users(id),
  created_by          INTEGER REFERENCES users(id),
  due_date            TEXT,
  start_at            TEXT,
  end_at              TEXT,
  priority            TEXT DEFAULT 'medium',
  status              TEXT DEFAULT 'todo',
  is_recurring        INTEGER DEFAULT 0,
  recur_interval      TEXT,
  recur_days          TEXT,
  area_id             INTEGER REFERENCES areas(id),
  is_completed        INTEGER DEFAULT 0,
  completed_at        TEXT,
  completed_by        INTEGER REFERENCES users(id),
  parent_task_id      INTEGER REFERENCES tasks(id),
  blocked_by_task_id  INTEGER REFERENCES tasks(id),
  archived            INTEGER DEFAULT 0,
  space_id            INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  created_at          TEXT DEFAULT (datetime('now'))
);

-- Migration: freeform markdown scratchpad per task (added after tasks shipped).
-- Duplicate-column errors on fresh DBs are swallowed by db.js's per-statement try/catch.
ALTER TABLE tasks ADD COLUMN task_notes TEXT;

-- Upgrade-only migrations for the reworked time model. Fresh installs already get
-- start_at/end_at/recur_days from the CREATE TABLE above, so on a new database these
-- ALTERs fail with a duplicate-column error that db.js swallows per statement. On an
-- existing database they add the missing columns instead. The UPDATE then strips any
-- time component off legacy due_date values so old due-times become date-only
-- deadlines.
ALTER TABLE tasks ADD COLUMN start_at   TEXT;
ALTER TABLE tasks ADD COLUMN end_at     TEXT;
ALTER TABLE tasks ADD COLUMN recur_days TEXT;
UPDATE tasks SET due_date = substr(due_date, 1, 10) WHERE due_date LIKE '%T%';

CREATE TABLE IF NOT EXISTS task_tags (
  task_id INTEGER REFERENCES tasks(id),
  tag     TEXT NOT NULL,
  PRIMARY KEY (task_id, tag)
);

CREATE TABLE IF NOT EXISTS task_comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER REFERENCES tasks(id),
  user_id    INTEGER REFERENCES users(id),
  content    TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- Projects supporting tables
-- ============================================================
CREATE TABLE IF NOT EXISTS project_members (
  project_id INTEGER REFERENCES projects(id),
  user_id    INTEGER REFERENCES users(id),
  role_label TEXT,
  is_watcher INTEGER DEFAULT 0,
  PRIMARY KEY (project_id, user_id)
);

-- ============================================================
-- Activity Feed
-- ============================================================
CREATE TABLE IF NOT EXISTS activity (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id),
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   INTEGER,
  description TEXT,
  space_id    INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- App settings (key/value — global, not space-scoped)
-- ============================================================
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Note: backup settings/history are intentionally NOT stored here — see
-- server/services/backupService.js. A restore overwrites this entire file,
-- so any backup bookkeeping kept in it would erase itself the moment it
-- was needed — it lives in data/backups/manifest.json instead.

-- ============================================================
-- LLM Settings (singleton row — always id=1)
-- ============================================================
CREATE TABLE IF NOT EXISTS llm_settings (
  id                INTEGER PRIMARY KEY DEFAULT 1 CHECK(id = 1),
  base_url          TEXT NOT NULL DEFAULT 'http://localhost:11434',
  api_key           TEXT DEFAULT '',
  model             TEXT NOT NULL DEFAULT 'llama3',
  temperature       REAL DEFAULT 0.7,
  max_tokens        INTEGER DEFAULT 2048,
  context_window    INTEGER DEFAULT 4096,
  top_p             REAL DEFAULT 1.0,
  frequency_penalty REAL DEFAULT 0.0,
  presence_penalty  REAL DEFAULT 0.0,
  updated_at        TEXT DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO llm_settings (id) VALUES (1);

-- LLM Configurations (named profiles)
CREATE TABLE IF NOT EXISTS llm_configurations (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  is_active         INTEGER NOT NULL DEFAULT 0,
  provider          TEXT DEFAULT 'Custom',
  base_url          TEXT NOT NULL DEFAULT 'http://localhost:11434',
  api_key           TEXT DEFAULT '',
  model             TEXT NOT NULL DEFAULT 'llama3',
  temperature       REAL DEFAULT 0.7,
  max_tokens        INTEGER DEFAULT 2048,
  context_window    INTEGER DEFAULT 4096,
  top_p             REAL DEFAULT 1.0,
  frequency_penalty REAL DEFAULT 0.0,
  presence_penalty  REAL DEFAULT 0.0,
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT DEFAULT (datetime('now'))
);

-- Bundled local `litert-lm serve` process paperr supervises
-- itself (see server/ai/litertSupervisor.js). Seeded active by default so
-- dotAi works out of the box with no external LLM and no accounts. Keyed on
-- provider (not a fixed id) since ids autoincrement and a household's own
-- configs may already occupy low ids by the time this runs.
INSERT INTO llm_configurations (id, name, is_active, provider, base_url, model)
SELECT 1, 'paperrAi Server', 1, 'LiteRT', 'http://127.0.0.1:9379', 'gemma4-e2b-web'
WHERE NOT EXISTS (SELECT 1 FROM llm_configurations WHERE provider = 'LiteRT');

INSERT OR IGNORE INTO llm_configurations ( name, is_active, provider, base_url, api_key, model, temperature, max_tokens, context_window, top_p, frequency_penalty, presence_penalty)
SELECT 'Ollama Server', 0, 'Ollama', base_url, api_key, model, temperature, max_tokens, context_window, top_p, frequency_penalty, presence_penalty
FROM llm_settings WHERE id = 1
AND NOT EXISTS (SELECT 1 FROM llm_configurations WHERE provider = 'Ollama');

INSERT OR IGNORE INTO llm_configurations (id, name, is_active, provider) VALUES (1, 'Default', 0, 'Ollama');

-- ============================================================
-- Calendar Events
-- ============================================================
CREATE TABLE IF NOT EXISTS events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT NOT NULL,
  description    TEXT,
  start_datetime TEXT NOT NULL,
  end_datetime   TEXT,
  all_day        INTEGER DEFAULT 0,
  location       TEXT,
  colour         TEXT,
  project_id     INTEGER REFERENCES projects(id),
  created_by     INTEGER REFERENCES users(id),
  is_recurring   INTEGER DEFAULT 0,
  recur_interval TEXT,
  recur_days     TEXT,
  recur_end_date TEXT,
  archived       INTEGER DEFAULT 0,
  space_id       INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  created_at     TEXT DEFAULT (datetime('now'))
);

-- Upgrade-only: adds recur_days on existing DBs; duplicate-column error swallowed by db.js on fresh ones.
ALTER TABLE events ADD COLUMN recur_days TEXT;

CREATE TABLE IF NOT EXISTS event_attendees (
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  user_id  INTEGER REFERENCES users(id),
  rsvp     TEXT DEFAULT 'pending',
  PRIMARY KEY (event_id, user_id)
);

-- ============================================================
-- Chat Sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL DEFAULT 'Chat',
  messages_json TEXT NOT NULL DEFAULT '[]',
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_space_members_user   ON space_members(user_id);
CREATE INDEX IF NOT EXISTS idx_space_members_space  ON space_members(space_id);
CREATE INDEX IF NOT EXISTS idx_areas_space          ON areas(space_id);
CREATE INDEX IF NOT EXISTS idx_tasks_space          ON tasks(space_id);
CREATE INDEX IF NOT EXISTS idx_tasks_area           ON tasks(area_id);
CREATE INDEX IF NOT EXISTS idx_lists_space          ON lists(space_id);
CREATE INDEX IF NOT EXISTS idx_projects_space       ON projects(space_id);
CREATE INDEX IF NOT EXISTS idx_events_space         ON events(space_id);
CREATE INDEX IF NOT EXISTS idx_activity_space       ON activity(space_id);
CREATE INDEX IF NOT EXISTS idx_list_items_list      ON list_items(list_id);
CREATE INDEX IF NOT EXISTS idx_list_items_task      ON list_items(task_id);
CREATE INDEX IF NOT EXISTS idx_list_items_project   ON list_items(project_id);
CREATE INDEX IF NOT EXISTS idx_list_templates_space ON list_templates(space_id);
CREATE INDEX IF NOT EXISTS idx_list_tpl_items_tpl   ON list_template_items(template_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project        ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned       ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_due            ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_status         ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_events_start         ON events(start_datetime);
CREATE INDEX IF NOT EXISTS idx_events_project       ON events(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_user        ON activity(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user        ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_user           ON audit_log(user_id);

-- ============================================================
-- Notebooks
-- ============================================================
CREATE TABLE IF NOT EXISTS kb_notebooks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  icon        TEXT    NOT NULL DEFAULT 'book_2',
  colour      TEXT    NOT NULL DEFAULT '#e76750',
  description TEXT,
  created_by  INTEGER REFERENCES users(id),
  space_id    INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
  sort_order  INTEGER DEFAULT 0,
  visibility  TEXT    NOT NULL DEFAULT 'personal', -- 'personal' | 'shared'
  created_at  TEXT    DEFAULT (datetime('now')),
  updated_at  TEXT    DEFAULT (datetime('now'))
);

-- Migration: add space_id if table existed before this column was introduced
ALTER TABLE kb_notebooks ADD COLUMN space_id INTEGER REFERENCES spaces(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS kb_notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  notebook_id INTEGER NOT NULL REFERENCES kb_notebooks(id) ON DELETE CASCADE,
  title       TEXT    NOT NULL,
  content     TEXT    NOT NULL DEFAULT '',
  created_by  INTEGER REFERENCES users(id),
  updated_by  INTEGER REFERENCES users(id),
  is_pinned   INTEGER DEFAULT 0,
  word_count  INTEGER DEFAULT 0,
  created_at  TEXT    DEFAULT (datetime('now')),
  updated_at  TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_kb_notes_notebook ON kb_notes(notebook_id);
CREATE INDEX IF NOT EXISTS idx_kb_notes_updated  ON kb_notes(updated_at DESC);

-- ============================================================
-- Routines (time-anchored repeating personal protocols)
-- ============================================================
CREATE TABLE IF NOT EXISTS routines_protocols (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id    INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  created_by  INTEGER REFERENCES users(id),
  name        TEXT    NOT NULL,
  color       TEXT    NOT NULL DEFAULT '#6366f1',
  icon        TEXT    DEFAULT 'star',
  description TEXT,
  visibility  TEXT    NOT NULL DEFAULT 'personal', -- 'personal' | 'shared'
  sort_order  INTEGER DEFAULT 0,
  is_system   INTEGER NOT NULL DEFAULT 0, -- 1 = hidden default bucket for protocol-less habits
  created_at  TEXT    DEFAULT (datetime('now'))
);

-- Migration: add is_system if table existed before this column was introduced
ALTER TABLE routines_protocols ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS routines_habits (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  protocol_id      INTEGER NOT NULL REFERENCES routines_protocols(id) ON DELETE CASCADE,
  title            TEXT    NOT NULL,
  icon             TEXT,            -- optional emoji shown next to the title
  science_note     TEXT,
  time_slot        TEXT    NOT NULL DEFAULT 'morning', -- 'early_morning'|'morning'|'afternoon'|'evening'|'night'
  target_time      TEXT,            -- 'HH:MM', nullable
  duration_minutes INTEGER,
  recur_days       TEXT    DEFAULT '1111111',  -- 7-bit Mon-Sun bitmask
  sort_order       INTEGER DEFAULT 0,
  is_active        INTEGER DEFAULT 1,
  created_by       INTEGER REFERENCES users(id),
  created_at       TEXT    DEFAULT (datetime('now'))
);

-- Migration: add icon if table existed before this column was introduced
ALTER TABLE routines_habits ADD COLUMN icon TEXT;

CREATE TABLE IF NOT EXISTS routines_completions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  habit_id       INTEGER NOT NULL REFERENCES routines_habits(id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completed_date TEXT    NOT NULL,  -- 'YYYY-MM-DD'
  completed_at   TEXT    DEFAULT (datetime('now')),
  UNIQUE(habit_id, user_id, completed_date)
);

CREATE INDEX IF NOT EXISTS idx_rp_space    ON routines_protocols(space_id, created_by);
CREATE INDEX IF NOT EXISTS idx_rh_protocol ON routines_habits(protocol_id);
CREATE INDEX IF NOT EXISTS idx_rc_lookup   ON routines_completions(habit_id, user_id, completed_date);

-- Migration (upgrade-only, MUST run before the CREATE TABLE below — renaming
-- onto a name that already exists fails, so this has to win the race on the
-- very first server start after this change ships). Folds the old
-- focus_sessions table into wellness_sessions, preserving history and id
-- continuity. Fails silently once focus_sessions no longer exists (fresh
-- installs, or a database that's already been migrated).
ALTER TABLE focus_sessions RENAME TO wellness_sessions;
ALTER TABLE wellness_sessions ADD COLUMN space_id INTEGER REFERENCES spaces(id) ON DELETE CASCADE;
ALTER TABLE wellness_sessions ADD COLUMN source   TEXT NOT NULL DEFAULT 'live';

-- Wellness sessions — one common log for Pomodoro, Meditation, Breathing, and
-- whatever gets added later. `type` is deliberately open text (no CHECK
-- constraint) so a new practice needs no migration, just a new value used
-- consistently by the client. space_id is nullable only for rows that predate
-- this column (see the backfill below) — every new row always sets it.
-- created_at is stored in local time so daily buckets line up with the
-- user's calendar day.
CREATE TABLE IF NOT EXISTS wellness_sessions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  space_id     INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
  type         TEXT    NOT NULL,            -- 'pomodoro' | 'meditation' | 'breathing' | ...
  label        TEXT,
  duration_sec INTEGER NOT NULL DEFAULT 0,
  completed    INTEGER NOT NULL DEFAULT 1,
  source       TEXT    NOT NULL DEFAULT 'live', -- 'live' (timer-driven) | 'manual' (logged after the fact)
  created_at   TEXT    DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_wellness_sessions_user  ON wellness_sessions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wellness_sessions_space ON wellness_sessions(space_id, created_at);

-- Backfill space_id for pre-migration rows, but only where it's unambiguous
-- (the user belongs to exactly one space) — a user in several spaces has no
-- recoverable record of which one was active when an old session was logged,
-- so those rows are left space_id = NULL rather than guessed.
UPDATE wellness_sessions
SET space_id = (SELECT space_id FROM space_members WHERE user_id = wellness_sessions.user_id)
WHERE space_id IS NULL
  AND (SELECT COUNT(*) FROM space_members WHERE user_id = wellness_sessions.user_id) = 1;

-- ============================================================
-- Deep Work Mode — per-task focus sessions
-- ============================================================
-- Distinct from focus_sessions above: these are tied to a specific task
-- (task_id) and drive the "Deep Work" takeover, not the anonymous wellness
-- widgets. Space-scoping is derived via a join through tasks.space_id.
CREATE TABLE IF NOT EXISTS deep_work_sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id       INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  timer_mode    TEXT    NOT NULL,             -- 'pomodoro' | 'countup'
  duration_sec  INTEGER NOT NULL DEFAULT 0,
  started_at    TEXT    NOT NULL,
  ended_at      TEXT,
  ended_reason  TEXT,                         -- 'manual' | 'timeout' | 'max_duration' | NULL (still running)
  created_at    TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_deep_work_task   ON deep_work_sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_deep_work_user   ON deep_work_sessions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_deep_work_active ON deep_work_sessions(ended_at);

-- ============================================================
-- Frame (ambient photo screensaver)
-- ============================================================
-- Collection metadata — the photos themselves are uploaded to the server and
-- stored as blobs in a separate SQLite file (server/db/frameFilesDb.js), so
-- collections play back on any device on the network — plain HTTP included.
CREATE TABLE IF NOT EXISTS frame_collections (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id         INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  created_by       INTEGER REFERENCES users(id),
  collection_name  TEXT,
  collection_type  TEXT NOT NULL DEFAULT 'Photographs',
  frame_style      TEXT NOT NULL DEFAULT 'postcard',   -- 'none' | 'postcard' | 'mat' | 'wood' | 'metal' | 'polaroid'
  enabled          INTEGER NOT NULL DEFAULT 1,
  sort_order       INTEGER DEFAULT 0,
  created_at       TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_frame_collections_space ON frame_collections(space_id);

-- One row per uploaded photo (created by the upload route). The image bytes
-- live in the separate files DB keyed by this row's id — file_ver goes in the
-- image URL's query string so re-uploading a filename busts the otherwise
-- immutable browser cache.
CREATE TABLE IF NOT EXISTS frame_photos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  collection_id INTEGER NOT NULL REFERENCES frame_collections(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  enabled       INTEGER NOT NULL DEFAULT 1,
  description   TEXT,
  file_ver      INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0,   -- user-defined playback order within the collection
  -- description doubles as the Title; artist/year are the extra placard lines
  -- shown only for 'Artwork' collections (all optional).
  artist        TEXT,
  year          TEXT,
  UNIQUE(collection_id, filename)
);
CREATE INDEX IF NOT EXISTS idx_frame_photos_collection ON frame_photos(collection_id);
ALTER TABLE frame_photos ADD COLUMN file_ver INTEGER NOT NULL DEFAULT 0;
ALTER TABLE frame_photos ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE frame_photos ADD COLUMN artist TEXT;
ALTER TABLE frame_photos ADD COLUMN year TEXT;

CREATE TABLE IF NOT EXISTS frame_settings (
  space_id               INTEGER PRIMARY KEY REFERENCES spaces(id) ON DELETE CASCADE,
  idle_timeout_minutes   INTEGER NOT NULL DEFAULT 0,   -- 0 = manual start (default)
  interval_seconds       INTEGER NOT NULL DEFAULT 5,
  corner_widget_enabled  INTEGER NOT NULL DEFAULT 1,   -- date/time in the bottom-right corner during playback
  background_mode        TEXT NOT NULL DEFAULT 'white',  -- 'diffused' | 'black' | 'white' surround during playback
  max_runtime_minutes    INTEGER NOT NULL DEFAULT 60,  -- auto-stop playback after this long; 0 = manual stop
  updated_at             TEXT DEFAULT (datetime('now'))
);
ALTER TABLE frame_settings ADD COLUMN corner_widget_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE frame_settings ADD COLUMN background_mode TEXT NOT NULL DEFAULT 'white';
ALTER TABLE frame_settings ADD COLUMN max_runtime_minutes INTEGER NOT NULL DEFAULT 60;

-- ─── Good Thoughts ──────────────────────────────────────────────────────────
-- User-authored collections of styled text (affirmations, quotes, movie
-- dialogs, …) that a widget cycles through, billboard-style. Private by
-- default (visibility='personal') — 'shared' exposes the collection to the
-- whole space and makes it placeable on the Hub board. Mirrors frame_* above.
CREATE TABLE IF NOT EXISTS thought_collections (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  space_id      INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  created_by    INTEGER REFERENCES users(id),
  name          TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'Affirmations', -- Affirmations | Quotes | Movie Dialogs | Gratitude | Mantras | Custom
  icon          TEXT DEFAULT '💭',
  color         TEXT NOT NULL DEFAULT '#6366f1',
  enabled       INTEGER NOT NULL DEFAULT 1,            -- activate / deactivate
  visibility    TEXT NOT NULL DEFAULT 'personal',       -- 'personal' | 'shared'
  time_slot     TEXT,                                   -- NULL = any time, else routines' TIME_SLOTS keys
  show_in_frame INTEGER NOT NULL DEFAULT 0,              -- hand off entries into Frame's fullscreen playback
  sort_order    INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_thought_collections_space ON thought_collections(space_id, created_by);

-- One styled text entry. `body` is a sanitized HTML fragment restricted to
-- <b> <i> <u> <s> <br> (enforced server-side on write, never trust client
-- HTML) — `plain` is the tag-stripped copy used to validate non-empty text.
CREATE TABLE IF NOT EXISTS thought_entries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  collection_id INTEGER NOT NULL REFERENCES thought_collections(id) ON DELETE CASCADE,
  body          TEXT NOT NULL,
  plain         TEXT NOT NULL DEFAULT '',
  attribution   TEXT,                 -- optional "Author, Film 1994"
  enabled       INTEGER NOT NULL DEFAULT 1,
  sort_order    INTEGER DEFAULT 0,
  created_by    INTEGER REFERENCES users(id),
  created_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_thought_entries_collection ON thought_entries(collection_id);

-- Per-space display preferences for the widget/app (mirrors frame_settings).
CREATE TABLE IF NOT EXISTS thought_settings (
  space_id          INTEGER PRIMARY KEY REFERENCES spaces(id) ON DELETE CASCADE,
  interval_seconds  INTEGER NOT NULL DEFAULT 15,
  shuffle           INTEGER NOT NULL DEFAULT 0,     -- shuffle across all enabled collections
  show_attribution  INTEGER NOT NULL DEFAULT 1,
  updated_at        TEXT DEFAULT (datetime('now'))
);

-- ─── Proactive Agent System ──────────────────────────────────────────────────
-- Background agents write insight cards rendered on the Home screen.
-- space_id is always set (socket events route to a space room).
-- user_id is null only for space-scoped insights (bulletin_board).
CREATE TABLE IF NOT EXISTS agent_insights (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             INTEGER REFERENCES users(id) ON DELETE CASCADE,
  space_id            INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  agent_type          TEXT    NOT NULL,  -- 'morning_brief' | 'reschedule' | 'priority' | 'workload' | 'bulletin_board' | 'custom'
  custom_agent_id     INTEGER REFERENCES custom_agents(id) ON DELETE CASCADE,
  title               TEXT    NOT NULL,
  content             TEXT    NOT NULL,  -- markdown body rendered in the card
  action_payload_json TEXT,              -- JSON: { name, args } pre-built tool call, null for read-only cards
  action_label        TEXT,
  status              TEXT    NOT NULL DEFAULT 'active',  -- 'active' | 'approved' | 'dismissed' | 'snoozed'
  snoozed_until       TEXT,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at          TEXT               -- null = never
);
CREATE INDEX IF NOT EXISTS idx_agent_insights_user  ON agent_insights(user_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_insights_space ON agent_insights(space_id, status, created_at);

-- Per-user dismiss/snooze state for space-scoped insights
CREATE TABLE IF NOT EXISTS agent_insight_dismissals (
  insight_id    INTEGER NOT NULL REFERENCES agent_insights(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        TEXT    NOT NULL,        -- 'dismissed' | 'snoozed'
  snoozed_until TEXT,
  PRIMARY KEY (insight_id, user_id)
);

-- User-authored custom agents (scheduled natural-language reports)
CREATE TABLE IF NOT EXISTS custom_agents (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  space_id      INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  icon          TEXT    DEFAULT '🤖',    -- emoji shown on the card and in the hub list
  instructions  TEXT    NOT NULL,
  schedule_cron TEXT    NOT NULL,        -- 5-field cron expression
  enabled       INTEGER NOT NULL DEFAULT 1,
  last_run_at   TEXT,
  visibility    TEXT    NOT NULL DEFAULT 'personal', -- 'personal' | 'shared'
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Migration: add space_id if table existed before this column was introduced
ALTER TABLE custom_agents ADD COLUMN space_id INTEGER REFERENCES spaces(id) ON DELETE CASCADE;
-- Migration: add icon if table existed before this column was introduced
ALTER TABLE custom_agents ADD COLUMN icon TEXT DEFAULT '🤖';

CREATE INDEX IF NOT EXISTS idx_custom_agents_user ON custom_agents(user_id, enabled);

-- Migration: budget feature removed — drop the project budget fields and the
-- budget_entries table (fails silently on databases already migrated).
ALTER TABLE projects DROP COLUMN budget;
ALTER TABLE projects DROP COLUMN actual_spend;
DROP TABLE IF EXISTS budget_entries;

-- Migration: the task↔list association was removed — tasks are no longer tied
-- to a list. Drop the index first (SQLite refuses to drop an indexed column),
-- then the column itself. Both fail silently on databases already migrated or
-- freshly created without the column.
DROP INDEX IF EXISTS idx_tasks_list;
ALTER TABLE tasks DROP COLUMN list_id;

-- Migration: dead features removed pre-1.0 — the never-implemented task-groups,
-- task-file attachments, time-tracking (time_logs + task cost/hours columns),
-- announcements, and the maintenance log. Each statement fails silently on
-- databases already migrated or freshly created without the column/table.
-- Drop the tasks columns before their parent table so no FK reference dangles.
ALTER TABLE tasks DROP COLUMN task_group_id;
ALTER TABLE tasks DROP COLUMN recur_rotation;
ALTER TABLE tasks DROP COLUMN estimated_hours;
ALTER TABLE tasks DROP COLUMN actual_hours;
ALTER TABLE tasks DROP COLUMN cost;
DROP TABLE IF EXISTS task_groups;
DROP TABLE IF EXISTS task_files;
DROP TABLE IF EXISTS time_logs;
DROP TABLE IF EXISTS announcements;
DROP TABLE IF EXISTS maintenance_items;

-- Migration: lists.type was write-only (its sole reader was AI-prompt filler);
-- nothing in the product branched on it. Dropped for a clean 1.0. Fails
-- silently on databases already migrated or freshly created without it.
ALTER TABLE lists DROP COLUMN type;

-- ============================================================
-- Notifications — targeted, per-user alerts (distinct from the
-- shared, space-wide `activity` log). Driven by project watchers:
-- comments, and a task in a watched project going blocked/done.
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  space_id   INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  task_id    INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  message    TEXT NOT NULL,
  read_at    TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);

-- ============================================================
-- Milestones — named markers within a phase. Unlike a phase's
-- derived progress (computed from its tasks), a milestone's
-- completion is always a manual flag, never computed.
-- ============================================================
CREATE TABLE IF NOT EXISTS milestones (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  phase_id     INTEGER NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  due_date     TEXT,
  sort_order   INTEGER DEFAULT 0,
  is_completed INTEGER DEFAULT 0,
  completed_at TEXT,
  completed_by INTEGER REFERENCES users(id),
  created_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_milestones_phase ON milestones(phase_id);

-- Migration: tasks.milestone_id was already accepted by taskService's
-- update allow-list but the column never existed — add it so that code
-- path actually works.
ALTER TABLE tasks ADD COLUMN milestone_id INTEGER REFERENCES milestones(id);

-- Migration: manual completion override for phases — lets a phase be
-- marked done even while it still has active tasks, independent of the
-- auto-computed "all tasks done" progress shown in the UI.
ALTER TABLE phases ADD COLUMN is_completed INTEGER DEFAULT 0;
ALTER TABLE phases ADD COLUMN completed_at TEXT;
ALTER TABLE phases ADD COLUMN completed_by INTEGER REFERENCES users(id);

-- ============================================================
-- Mood — lightweight check-ins for the Analytics page, doubling as the
-- before/after rating for any wellness_sessions row (Breathing, Meditation).
-- ============================================================
-- space_id is captured like wellness_sessions', but Mood (and Meditation)
-- still never appear in the Family/Team view — that's a standing privacy
-- policy, not a schema limit (see Analytics spec §07). Multiple standalone
-- entries per day are allowed; created_at is local time so daily/weekly
-- buckets line up with the user's own calendar, matching wellness_sessions.
CREATE TABLE IF NOT EXISTS mood_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  space_id   INTEGER REFERENCES spaces(id) ON DELETE CASCADE,
  mood       INTEGER NOT NULL, -- 1 (very dissatisfied) .. 5 (very satisfied)
  session_id INTEGER REFERENCES wellness_sessions(id) ON DELETE CASCADE, -- NULL = standalone check-in
  context    TEXT,             -- 'before' | 'after' | NULL (standalone)
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS idx_mood_logs_user    ON mood_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mood_logs_session ON mood_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_mood_logs_space   ON mood_logs(space_id, created_at);

-- Migration (upgrade-only): add the two new columns to a mood_logs table
-- created before this change (fails silently once already present).
ALTER TABLE mood_logs ADD COLUMN space_id   INTEGER REFERENCES spaces(id) ON DELETE CASCADE;
ALTER TABLE mood_logs ADD COLUMN session_id INTEGER REFERENCES wellness_sessions(id) ON DELETE CASCADE;
ALTER TABLE mood_logs ADD COLUMN context    TEXT;

UPDATE mood_logs
SET space_id = (SELECT space_id FROM space_members WHERE user_id = mood_logs.user_id)
WHERE space_id IS NULL
  AND (SELECT COUNT(*) FROM space_members WHERE user_id = mood_logs.user_id) = 1;

-- Fold wellness_sessions' old stress_before/stress_after (1-10, higher =
-- more stressed) into mood_logs rows (1-5, higher = better) instead — one
-- 'before' and one 'after' row per session that had a rating. Idempotent via
-- NOT EXISTS, so this is a safe no-op on every restart after the first.
-- The 1-10 -> 1-5 mapping is a best-effort inversion, not exact.
INSERT INTO mood_logs (user_id, space_id, mood, session_id, context, created_at)
SELECT user_id, space_id, MAX(1, MIN(5, CAST(ROUND((11 - stress_before) / 2.0) AS INTEGER))), id, 'before', created_at
FROM wellness_sessions
WHERE stress_before IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM mood_logs ml WHERE ml.session_id = wellness_sessions.id AND ml.context = 'before');

INSERT INTO mood_logs (user_id, space_id, mood, session_id, context, created_at)
SELECT user_id, space_id, MAX(1, MIN(5, CAST(ROUND((11 - stress_after) / 2.0) AS INTEGER))), id, 'after', created_at
FROM wellness_sessions
WHERE stress_after IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM mood_logs ml WHERE ml.session_id = wellness_sessions.id AND ml.context = 'after');

-- Migration (upgrade-only): drop the now-redundant stress columns. Fails
-- silently once already dropped.
ALTER TABLE wellness_sessions DROP COLUMN stress_before;
ALTER TABLE wellness_sessions DROP COLUMN stress_after;
