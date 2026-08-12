# Release 1.0.1 — "Begonia"

_2026-08-11_

An install-and-update release. paperr can now be installed by double-clicking one file on Windows, macOS, or Linux, launches from real desktop/Start-Menu entries into its own app window, installs as a proper web app, updates itself from Settings, and uninstalls by double-clicking one file too. Plus archivable habits, and a typography pass across the app.

## Highlights

### 🧪 One-click installers (experimental)

Three downloadable files — [`install/paperr-windows.cmd`](install/paperr-windows.cmd), [`install/paperr-macos.command`](install/paperr-macos.command), [`install/paperr-linux.sh`](install/paperr-linux.sh) — take a non-technical user from nothing to a running paperr in one double-click. Each opens with an ASCII paperr banner, checks for Node 22.5+ and git (linking to the download page if either is missing), then runs `npx -y paperr@latest`.

First run clones paperr to `~/paperr` (`%USERPROFILE%\paperr` on Windows), installs dependencies, generates `server/.env` with real JWT secrets, builds the client, starts the server on `:3000`, and opens the app. Every run after that just starts it. Each step now says where it's putting things — the checkout, `server/node_modules`, `client/node_modules`, `server/.env`, `client/dist` — instead of going quiet for several minutes.

Delivery goes through npm rather than a direct download of the bootstrap, so every install registers on the `paperr` package's download stats. The trade-off is that a change to `npm/bin/paperr.js` now needs an `npm publish` before it reaches anyone. Each file also `cd`s to your home folder before calling npx: run from inside a checkout, npm walks up, finds the repo's own `package.json` (named `paperr`, but with no `bin`), and dies with "could not determine executable to run".

> **Experimental — not the supported path yet.** Verified end to end on Windows and Linux; macOS is untested. The documented `git clone` + `npm run install:all` steps remain the recommended way to install paperr.

### Two shortcuts, one install

Installing creates **two** entries, not one, on every platform (Desktop + Start Menu on Windows, `~/Applications/*.app` on macOS, `.desktop` files on Linux):

| Shortcut            | Runs                                                                 |
| ------------------- | -------------------------------------------------------------------- |
| `paperr`            | The dev servers (API `:3000`, client `:5173`) — for working on the code |
| `paperr LAN Server` | The production build, reachable by other devices on the network        |

Both point at the same install and differ only in how they start the server, and whichever one you run creates both — so the one you've never clicked still shows up. Only `paperr LAN Server` prints a network address; the dev shortcut is localhost-only. The list lives in one place in [`scripts/launch.js`](scripts/launch.js) and is shared by all three platform builders and the uninstaller, so the two can't drift apart.

### Desktop app entry, without Electron

[`scripts/launch.js`](scripts/launch.js) is a single idempotent launcher: it starts the server only if it isn't already answering, creates the desktop entries, then opens paperr in a chromeless Chrome/Edge/Brave window via `--app=` — an app window with its own icon, with no bundled browser and nothing installed system-wide. Falls back to a normal tab when no Chromium-family browser is present, and prints the URL when there's no opener at all (headless boxes, WSL). Entries are rewritten on every launch, so one pointing at a moved or deleted checkout repairs itself. Also reachable from an existing checkout as `npm run app` (`npm run app -- --dev` for the dev servers).

Browser discovery on macOS now searches `~/Applications` as well as `/Applications`, and recognises Vivaldi and plain Chromium alongside Chrome/Edge/Brave. With none of them installed, paperr opens as an ordinary Safari tab — Safari has no `--app` equivalent — and the launcher now says so, pointing at Safari's **File → Add to Dock** (macOS 14+) as the native way to get a real window.

The launcher records the server PID and logs to `paperr.log`, and reports both the local and LAN URLs on start — preferring a genuine `192.168.x`/`10.x` address over docker0 and WSL bridges.

### Installable as a web app

A web app manifest ([`client/public/manifest.webmanifest`](client/public/manifest.webmanifest)) gives paperr its own name, icon, and standalone display mode when installed from the browser — Edge/Chrome's **… → Apps → Install paperr**, Safari's **Add to Dock**, or **Add to Home Screen** on a tablet. Worth knowing before you reach for it: the taskbar button for a `--app=` window shows Edge's or Chrome's icon, because that window is a browser process and Windows takes taskbar identity from the browser. Installing as a web app fixes the icon but does *not* start the server, so the shortcut still has to run first. Both sides of that trade-off are written up in [`install/README.md`](install/README.md).

### Uninstall

Three more double-clickable files — [`install/uninstall-windows.cmd`](install/uninstall-windows.cmd), [`install/uninstall-macos.command`](install/uninstall-macos.command), [`install/uninstall-linux.sh`](install/uninstall-linux.sh) — stop the server and remove every shortcut. Each asks whether to delete your data as well and **defaults to no**: it's a household's notes and uploads, and none of it is recoverable. Windows additionally registers paperr under **Settings → Installed apps** (HKCU, so no admin rights), whose Uninstall button runs the same script. From a terminal it's still `npm run uninstall` in the install folder, plus `-- --purge` to delete the database, uploads and backups too.

### In-app updates

A new **Updates** panel in Settings (admin only) checks the repository this install was cloned from and pulls it onto the machine. Both the check and the apply hit the network, so they only ever run on click, never on page load.

`npx paperr` clones with `--depth 1`, so [`server/services/updateService.js`](server/services/updateService.js) stays shallow-safe throughout — it compares SHAs and hard-resets rather than merging or counting commits. It refuses to run when there are local changes to tracked files (untracked files survive a reset, so they don't count), and after updating it reinstalls only the workspaces whose `package.json`/lockfile changed and rebuilds the client only when something under `client/` moved. Concurrent update requests are rejected with a 409.

The pulled server code takes effect on the next launch — the panel says so rather than restarting under you.

### `npx paperr` now installs *and* starts

The npm bootstrap was a clone-and-print-instructions script; it now hands off to the launcher, so `npx paperr` clones, installs, builds, starts, and opens the app in one go. Re-running it against an existing checkout skips the clone and just starts paperr, which makes it double as a start command. Node version is checked up front (the server needs `node:sqlite`, so 22.5+), an existing checkout from before the launcher existed is brought up to date with `git pull --ff-only` instead of forcing a delete-and-re-clone, and an interrupted clone gets a clear message rather than a git failure.

### Archive habits

Habits can be archived from the habit editor instead of only deleted — archiving hides a habit everywhere but keeps its streaks and history, and it can be put back at any time. Routines → Progress grows an **Archived** section (auto-expanded when there's something in it, with the count visible while collapsed); clicking an archived habit reopens it in the editor to unarchive. Backed by `GET /routines/progress?archived=1`; archiving is just `is_active = 0` via the existing `PATCH /habits/:id`, so no completions are ever deleted. Self-check at `server/routes/routines.archive.test.js`.

### Typography pass

Small-caps labels are gone. Across forms, table headers, modals, buttons, widgets, and the calendar, `text-label-sm uppercase` became plain `text-label-md` — larger, lower-contrast-free, and legible at a glance instead of decorative.

### App icon on every surface

Raster favicons (16/32/512) alongside the SVG, since Chromium app windows and home-screen installs use the PNGs for the window, taskbar, and launcher icon — not the SVG. The launcher derives a Windows `.ico` from the 512px PNG at runtime (Vista+ reads PNG-compressed icon entries directly).

macOS gets a full icon pipeline rather than one image. A single-representation `.icns` is what makes Launchpad look pixelated — it upscales whatever lone size it finds — so the launcher now renders a complete `.iconset` (16/32/128/256/512, each at 1x and 2x) and compiles it with `iconutil`. Sizes come from `favicon.svg` via `sharp`, which is already a server dependency and has librsvg built in, so 1024px is genuinely sharp instead of an upscaled bitmap; without sharp it falls back to `sips` downscaling the 512 PNG, and failing that to the old single-image conversion. A version stamp in the bundle makes existing installs regenerate their icon instead of keeping whatever the previous version produced.

### Docs

README trimmed: the long per-feature screenshot gallery collapsed into a single carousel, npm install instructions replaced by the one-click section, and the experimental installers documented with their failure modes. [`install/README.md`](install/README.md) covers the rest — the two shortcuts and what each starts, why delivery goes through npm, the browser-vs-paperr taskbar icon trade-off, macOS without a Chromium browser, and the uninstallers.

## Fixes

- Windows stopped popping console windows. The server is started detached and so has no console of its own; every `execFile`/`spawn` under it inherited Node's `windowsHide: false` default, which handed each child a brand-new console — visibly, once every few seconds for the bundled AI server's memory poll, and again on every git/npm call during a self-update. Fixed at the source in [`server/ai/litertSupervisor.js`](server/ai/litertSupervisor.js) and [`server/services/updateService.js`](server/services/updateService.js), so it covers the model import and every update step, not just the poll.
- Uninstalling on macOS left a ghost icon in Launchpad. Deleting the `.app` doesn't update the LaunchServices database that Launchpad indexes from, so the uninstaller now also unregisters the path with `lsregister -u` — after the delete, never before: it hands the unregister to a daemon rather than committing inline, and running it first can re-register the bundle instead of dropping it.
- `.gitattributes` now pins line endings per launcher type (`*.cmd`/`*.ps1` CRLF, `*.sh`/`*.command` LF) — a shell script checked out with CRLF fails to run at all.
- CONTRIBUTING's dev setup told you to `cd paperr-dev` after cloning into `paperr`.
- `npm run app` on Windows no longer emits Node's DEP0190 warning about unescaped shell arguments.

## Tests

`scripts/launch.test.js` now builds both real `.lnk` files in a temp folder and reads them back, asserting each lands in both shortcut folders with the right `--dev` argument and repairs itself when left pointing somewhere stale. Windows-only; skipped elsewhere.

## Dependencies

- No new dependencies this release. The launcher, uninstaller, and updater use only Node built-ins.

---

# Release 1.0.0-beta — "Azalea"

_2026-08-01_

The first beta of **paperr** — everything built since the initial commits, rolled into one release. Multi-space accounts, tasks/projects/lists/calendar/notebooks/routines, a Frame photo dashboard, a Focus & Wellness suite with an Analytics page, a Home board + Hub, dotAi chat with proactive background agents, a bundled local AI server, and a full accessibility/motion-control pass. This supersedes 0.1/0.1.1/0.1.2 as the canonical release notes — see below for the incremental history those covered.

## Highlights

### Spaces & accounts

Self-service registration (optional quick-login PIN + avatar) and a Browse Spaces screen for discovering and requesting to join a household or team, with admin approval. Notebooks, Projects, Lists, and Custom Agents are private to their creator by default with a one-tap toggle to share with the space. Admins can permanently delete a space (type-to-confirm). New spaces walk through an optional "Set up your apps" step (bundled AI server, curated Frame photos, curated Good Thoughts) and are seeded with type-appropriate starter lists, a starter routine, and a "Welcome to Paperr" onboarding project.

### Tasks, Projects & Lists

Tasks carry sub-tasks, tags, comments, file attachments, a markdown notes scratchpad, due dates plus explicit start/end time blocks on the Calendar, and weekday-specific recurrence. Today/Overdue smart views, drag-and-drop, and bulk actions. Projects get Board/List/Phases views, named Milestones, a Watch toggle, and per-project members + activity feed. Lists are lightweight checklists with custom icons that can link to full tasks/projects. Completing a task or habit now triggers a little confetti/emoji/toast celebration (see Motion & accessibility below for how to tune or kill it).

### Deep Work Mode

Fullscreen, single-task focus with a Pomodoro/count-up timer, a "still working?" check-in every 15 minutes, session time logged per task, and a shared widget showing who's currently heads-down.

### Calendar & Routines

Day/Week/Month/Agenda calendar views with events, attendees, habit time-of-day dividers, per-day habit rings, a mini month picker, quick-add, per-day weather, and an "up next" rail. Routines add time-anchored habits that auto-reset daily across Protocols (goal buckets), a chronological Day Arc, and streak/Progress stats.

### Notebooks

An Obsidian-style knowledge base — markdown Notebooks shared across the space for recipes, manuals, meeting notes, and house docs.

### Frame

Turns any screen into a digital photo frame — uploaded photos are downscaled and stored server-side so they sync to every device, or start from a curated public-domain art collection. Fullscreen slideshow with configurable transitions, optionally interleaved with Good Thoughts text cards.

### Focus & Wellness Apps + Analytics

Pomodoro, Stopwatch, Timer, guided Breathe (box/4-7-8/calm), Meditate, Ambient Sound, a flip-clock Clock with alarms, and Good Thoughts (custom, time-bound affirmation/quote/mantra collections). A new **Analytics** page turns session data into insight: trend charts, a Pomodoro heatmap, and streak badges across Personal, Family/Team, and a raw editable Log tab — Mood and Meditation stay Personal-only by design, never surfaced at the space level.

### Home Board & Hub

A customizable, swipable widget board (tasks, calendar, weather, projects, routines, activity, focus timers, Good Thoughts, Time Progress) with an AI Agent widget surfacing live insights from any agent. A separate shared Hub board gives the whole space Sticky Pads, a per-member calendar, a shared list, and everyone's routines side-by-side.

### dotAi — chat, proactive agents & Agent Hub

Chat with dotAi from the slide-out drawer to create, edit, and query tasks, projects, events, and more — every proposed action is queued for approval, never applied automatically. Replies can now be regenerated, with arrow buttons to flip between every alternate response. Beyond chat, five scheduled background agents (Morning Brief, Reschedule Advisor, Priority Focus, Workload Spread, Bulletin Board) post dismissable insight cards to a dedicated Agent Hub, each with a Run Now button, plus support for free-text Custom Agents. dotAi runs on paperr's bundled `litert-lm` AI server (Gemma E2B, CPU-only, under 2GB RAM, auto-offloads when idle) or an external Ollama/LM Studio — nothing leaves the LAN unless a cloud provider is deliberately configured. Recipe requests ("what can I make with X, Y, Z") now get a direct written-out recipe instead of a tool call.

### Motion & accessibility

A new Settings → Motion panel adds a master **Reduce Motion** switch (on by default if the OS already requests reduced motion) plus per-effect toggles — task/habit celebrations, weather icon animation, widget edit-mode jiggle, alarm ring shake, and the Breathe app's pulsing circle — for anyone who finds on-screen motion overwhelming rather than delightful.

### Notifications, Activity & Backups

A personal notification feed (project comments, watched-task completions/blocks) in the header bell, a real-time space activity feed, and manual/scheduled database backups (daily/weekly/monthly with configurable retention) with one-click restore and delete.

### Security

JWT access + refresh tokens in HTTP-only cookies, bcrypt-hashed passwords and quick-login PINs, brute-force lockout, server-enforced admin/member roles, session management, and a full audit log.

### Three modes, one app

Auto-detected Desktop, Phone, and Tablet layouts from screen size and touch support, switchable anytime — including a wall-mountable tablet dashboard for a spare screen.

### Contributor experience

Added `CONTRIBUTING.md` and a bug report issue template (`.github/ISSUE_TEMPLATE/bug_report.md`), linked from a new README Contributing section.

## Fixes

- `createListItem` (dotAi tool) was inserting into `list_items` with a `space_id` column the table doesn't have, throwing whenever dotAi added an item to a list.

## Dependencies

- No new dependencies this release.

---

# Release 0.1.2

_2026-07-19_

dotAi is now space-scoped, space deletion no longer throws, curated starter content for a new space, and a Task Form redesign.

## Highlights

### dotAi tools are now space-scoped

Closes the "Known gaps" item from 0.1.1's release. `POST /chat` now requires a resolved space (`requireSpace`) and threads `spaceId` through `handleToolCall` (`server/ai/toolHandler.js`), which fixes two classes of bug at once:

- **Cross-space leaks** — `getTasks`, `getSummary`, `getListItems`, and the system prompt's member/list/project/task context previously queried across *all* spaces, not just the caller's.
- **Broken/wrong-space writes** — `createList`, `createProject`, and `createListItem` were omitting the `NOT NULL space_id` column and throwing at runtime; `createTask` was falling back to "creator's first space membership," landing tasks in an arbitrary space. By-id mutations (`updateTask`, `completeTask`, `deleteTask`, `rescheduleTasks`, `updateProject`, list-item tools) are now guarded by a fail-closed `ownsRow()` check before touching a row.

A self-check lives at `server/ai/toolHandler.spacecheck.test.js` (`node server/ai/toolHandler.spacecheck.test.js`). Along the way, the tool set was consolidated: `createTaskWithSubtasks` merged into `createTask` (pass a `subtasks` array), `bulkCompleteTasks` merged into `completeTask` (pass `taskIds`), `getProjectStatus` merged into `getSummary`, and `reassignTask` dropped (use `updateTask`). `getTasks` gained `priority`, `areaId`, `parentTaskId`, and `limit` filters; `updateTask` can now move a task between projects/phases. Every tool definition also carries a `readOnly` flag, replacing a hand-maintained write-tool allowlist in both `chat.js` and custom agents.

### Space deletion actually works now

Deleting a space threw `FOREIGN KEY constraint failed` whenever it had projects with phases, project members, or events — those child tables were missing `ON DELETE CASCADE`. `server/db/db.js` now rebuilds the affected tables (`task_comments`, `task_tags`, `phases`, `project_members`, `events`) on startup to add the cascade, guarded so each rebuild only ever runs once. Space deletion also now purges the deleted space's Frame photo blobs from the separate photo-files database, which has no cross-file foreign key of its own and was leaving them orphaned.

### New-space seeding got a lot more useful

`seedDefaultData` now takes the space `type` (family/team) and seeds type-appropriate starter lists (e.g. "Meal Planning" and "Onboarding" instead of one generic set for both), a starter routine (Morning Routine + Wind Down protocols with habits), and a "Welcome to Paperr" onboarding project — three phases of tasks/subtasks/milestones that tour Tasks, Calendar, Frame, Agents, and Settings.

### Good Thoughts curated starter collections

Mirrors Frame's curated-collection import: `server/ai/curatedThoughts.js` + `server/data/curatedThoughtCollections.json` ship a "Stoic Quotes" starter set, importable in one click from the "Set up your apps" step (`GoodThoughtsCard`) or `POST /good-thoughts/curated-sets/:key/import`.

### Curated Frame photos are now downscaled like regular uploads

Curated art imports were storing images at their original fetched size, unlike browser uploads (which are downscaled client-side first). `curatedArt.js` now runs a server-side `sharp` pass (`normalizeImage`) mirroring the client's limits, so curated collections don't balloon the database. Import progress is now also surfaced live in `FrameDetailPanel` while a curated set downloads in the background.

### Bundled AI server sets itself up on install

`server/scripts/setupLiteRT.js` runs automatically via `npm install`'s `postinstall` hook, creating the `litert-lm` Python venv (`server/ai/litert/venv`) so a fresh clone gets the bundled "paperr AI Server" with zero manual setup. It looks for `py -3`/`python` on Windows and `python3`/`python` on macOS/Linux, and never fails the install — if no Python is found, paperr just runs without this optional feature.

### Agent Hub "Run now"

Each pre-built agent card (Morning Brief, Reschedule Advisor, Priority Focus, Workload Spread, Bulletin Board) now has a Run Now button (`POST /agent-insights/prebuilt/:agentType/run`) that bypasses the schedule while still respecting each agent's own "already fired today" guard. Agents that find nothing to report now post a friendly "nothing to report" insight when force-run, instead of silently returning nothing.

### Task Form redesign

The New/Edit Task modal now always uses the two-column layout (previously single-column when creating). Assignee moved to a header chip; priority is shown as colour dots + label merged into one row with a quieter status segmented control; Deadline and a new unified "Schedule Time Block" pill (reusing the sub-task date/start/end editor) sit side by side; a new time block defaults to 09:00–09:30 and bumps its end time by 30 minutes automatically when the start time changes. Comments now show absolute timestamps instead of relative "x minutes ago".

### Other additions

- **Time Progress widget** — shows how much of today/this month/this year has elapsed, as bars or rings (`client/src/widgets/timeProgressWidget.jsx`).
- **SpacePicker consolidated** — desktop and tablet now share one `SpacePicker.jsx` instead of a component duplicated inline in `DesktopLayout` plus a separate `SpacePickerSheet` for tablet.
- **CreateSpaceModal polish** — the emoji picker now renders through a portal so the modal's scroll container can't clip it, a custom icon pick swaps into the preset row instead of shifting the layout, and the delete-confirm phrase match is case-insensitive.

## Fixes

- Admin actions scoped by a space in the URL (join request approve/deny, member add/remove/role-change, space edit/delete) were reading the *active* space from the `X-Space-Id` header instead of the `:id` in the path — an admin editing/deleting a space that wasn't their currently-selected one silently affected the wrong space. Replaced with `requireSpaceParam`, which reads `:id` directly.
- `resolveDate` returned dates via `toISOString()`, which converts to UTC first and could shift the date by one day depending on the server's local time zone; now built from local year/month/day directly.
- Bulletin Board agent's fallback report crashed on an empty-sections case; now returns "No activity to report yet."

## Dependencies

- Added `sharp` (server) for downscaling/recompressing curated Frame images.

---

# Release 0.1.1

_2026-07-17_

Bundled local AI, curated Frame starter content, and space deletion.

## Highlights

### Bundled local AI Server (paperr AI Server)

dotAi no longer requires an external Ollama/LM Studio setup to try — paperr can now supervise its own local `litert-lm serve` process (`server/ai/litertSupervisor.js`) as a zero-config fallback LLM provider. Manage it from a new **paperr AI Server** panel in Settings: start/stop, live memory usage, a model registry, importing/deleting models from Hugging Face, and picking the active model (`server/routes/aiServer.js`). Seeded inactive in the database so it never overrides an admin's existing provider choice, and its process is started/stopped alongside the paperr server itself (including orphan cleanup via a PID file if a prior run didn't shut down cleanly).

### "Set up your apps" onboarding step

The Setup Wizard and space creation both now end with an optional apps step (`AppsSetupStep`) offering to download the bundled AI model and add a curated Frame photo collection — each kicks off a background job without blocking Continue.

### Curated Frame starter collections

Frame collections can now be seeded from hand-curated JSON sets (`server/data/curatedCollections.json`) via a background import with progress polling, instead of every space starting with an empty library.

### Delete a space

Space admins can permanently delete a space from the Edit Space modal's new Danger Zone (type-to-confirm), wired to the existing "can't delete your only space" backend guard. The client falls back to another remaining space if the deleted one was the active one.

## Fixes

- Newly created spaces now get the correct default Frame settings (5s interval, white background) even on databases migrated from an older schema, where stale column-level defaults were silently sticking around.
- The `X-Space-Id` request header the API client injects automatically no longer clobbers a header a caller set explicitly — needed so the new apps setup step can target a brand-new space before it becomes the active one.

## Dependencies

- Added `tree-kill` (server) to reliably terminate the litert-lm process tree, including its Python worker, on stop/shutdown.

## Deployment

- Added `start-paperr.sh`, a macOS/Linux equivalent of `start-paperr.ps1`.

---

# Release 0.1

_2026-07-11_

The first tracked release of **paperr** — a household/personal management platform covering tasks, projects, lists, calendar, notebooks, and an on-device AI assistant. This release bundles everything built since the initial commits, spanning multi-space support, a full AI agent system, and several new apps/widgets.

## Highlights

### Multi-space accounts

Self-service registration (`RegisterPage`, with optional PIN and avatar) and a **Browse Spaces** screen where users discover other households/teams and request to join. Space admins approve or deny join requests from Settings.

### Shared visibility for personal content

Notebooks, Projects, Lists, and Custom Agents are now **private to their creator by default**, with a Personal/Shared toggle to make them visible to the whole space (mirroring the pattern already used by Routines). Full edit rights are extended to any space member once something is shared.

### Project Detail overhaul

Projects now have three views — **Board** (Kanban: To Do/In Progress/Blocked/Done), **List**, and **Phases** (a step tracker showing per-phase progress) — plus assignable task phases, a Watch toggle for activity notifications, and one-click Deep Work launch from any task card. Project cards on Projects Home now show a progress ring, current phase, avatars, and visibility badges. Phases can now also hold **Milestones** — named markers with an optional due date — and both phases and milestones can be manually marked complete/reopened independent of their underlying tasks.

### Tasks decoupled from Lists

Tasks no longer belong to a List (`list_id` removed) — they're organized by Project/Phase instead, and Lists are back to being simple, standalone item lists. Tasks gained explicit **start/end scheduling** (`startAt`/`endAt`, shown as calendar time blocks) alongside the existing all-day due date, and recurrence now supports specific weekdays (`recurDays`).

### Deep Work Mode

A single-task, fullscreen, chrome-free focus mode: pick a task, start a Pomodoro or count-up timer, and get a takeover view with the full task detail and sub-tasks until you explicitly stop. Includes a "still working?" check-in every 15 minutes with a 2-minute auto-stop failsafe, session logging per task, and a shared widget showing who's currently heads-down.

### AI Agent Hub

A new `/agents` page surfacing automated insight cards from background agents driven by `node-cron`: **Morning Brief**, **Reschedule Advisor**, **Priority Focus**, **Workload Spread**, and **Bulletin Board**. Users can also define their own **Custom Agents** (name, schedule, free-text instructions) that run the same tool-calling loop; any proposed change is queued for one-click approval rather than applied automatically.

### Good Thoughts

A new widget/app for collections of affirmations, quotes, or mantras with custom color/icon/category and optional time-of-day scoping. Cycles on the dashboard and can be interleaved as text cards into Frame's fullscreen photo slideshow.

### Clock & Alarms

A flip-clock widget with alarm creation (repeat days, labels) and a persistent alarm engine that rings fullscreen with snooze/dismiss from anywhere in the app.

### Notifications

A personal notification feed (project comments, task completions/blocks on watched items) now appears in the header bell alongside space activity, with mark-as-read support. Task/project watchers are pinged when things change.

### Hub board & Sticky Notes

A shared household/team landing space with an admin-editable widget board for collaborative widgets: Sticky Pads (corkboard notes with optional expiry), Our Calendar (one column per member), Shared List, and Our Routines.

### Database backups

Admins can trigger manual database snapshots or schedule automatic backups (daily/weekly/monthly with configurable retention) from a new Backups panel in Settings, with restore (auto-snapshotting first) and delete.

### Frame photo storage moved server-side

Frame's photo library moved from client-side IndexedDB to a dedicated server-side store, so photos sync across every device on the network instead of living per-browser. Uploads are downscaled client-side before sending. Playback overlay and detail panel were reworked to match.

### Calendar habit tracking & redesign

Day/Week views show habit time-of-day dividers and per-day habit dots/rings alongside tasks and events. Added a mini month picker, quick-add task box, per-day weather, an "up next" rail, and a new flat **Agenda** view.

### Task editor improvements

The task editor gained a markdown notes scratchpad, a project-phase picker, a comment thread, a Deep Work time summary, and a two-column layout when editing an existing task.

### Home board / widget drawer rework

`HomeBoard` was rebuilt as a thin wrapper around a new shared `WidgetBoard` component (also used by Hub), and the widget-adding drawer was reorganized into grouped, searchable categories. Two new widgets round out the board: an adaptive **Calendar** widget that switches between Day/Week/Month layouts depending on how large you size it, and an **AI Agent** widget that surfaces insights from a single agent of your choice.

## Removed

- **Kiosk layout** (`KioskLayout.jsx`) — removed in favor of the tablet layout.
- **Client-side Frame storage** (`frameDb.js`, `frameScan.js`) — superseded by server-side storage (see above).
- **Project budgets** — the `budget` field on projects and the `budget_entries` table were dropped; budget tracking is out of scope for now.
- **Rooms** — `server/routes/rooms.js` and the unused area-maintenance endpoint were removed; the app now has a single, consolidated **Areas** concept instead of separate Rooms/Areas.
- **Dead dashboard prototypes** — the old `client/src/panels/*` components (`AIChatPanel`, `ActivityFeedPanel`, `AgendaPanel`, `AnnouncementsPanel`, `ClockPanel`, `QuickAddPanel`, `RoomTasksPanel`, `ShoppingListPanel`) and `client/src/store/taskStore.js` were unused leftovers from before the widget-board rework and have been deleted.

## Fixes

- `db.transaction is not a function` — Node's built-in `node:sqlite` doesn't implement `.transaction()`; added a polyfill so atomic multi-statement writes (space creation, admin adding a member, settings updates) work correctly.
- Project activity feed (`GET /api/activity/project/:id`) was matching activity rows by `entity_id` alone, so a task/milestone from a *different* project could show up if its ID happened to collide; fixed to match `entity_type` + `entity_id` together, and added `phase`/`milestone` activity to the feed.
- dotAI's task tools (`createTask`, `createTaskWithSubtasks`, `getTasks`) still referenced `listId` after tasks were decoupled from Lists; updated to use `projectId`/`startAt`/`endAt` and dropped the stale list lookups in chat confirmation cards.

## Dependencies

- Added `node-cron` (server) to drive scheduled AI agents.
- Added `playwright` (root) for browser automation/testing.

## Known gaps

- Most dotAI tools (`server/ai/tools.js`) are not yet space-scoped — a fix is scoped but not yet applied (see `.architecture/AI Tools Audit.md`).
- Calendar, Notebooks, Routines, Areas, Sticky Notes, Notifications, and Good Thoughts have no dotAI tool coverage yet.

## Planned (not in this release)

- **Installable standalone app** — a PWA manifest/service worker (so paperr installs as a windowed, tabless app) plus a Windows auto-start task for the server, with an Electron desktop app documented as a heavier alternative. Design is written up in `.architecture/Standalone App & Autostart.md`; no code has been written yet.
