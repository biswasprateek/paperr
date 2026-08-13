# paperr

### Organize everything. Share nothing.

**paperr** is a private, self-hosted operating system for your household or team — tasks, projects, calendar, notes, routines, focus tools, a shared wall dashboard, and a built-in AI assistant, all running on your own network. Nothing ever leaves your LAN.

**100% free · local-first · self-hosted.** Apache-2.0. Docs and screenshots: **[paperr.ai](https://paperr.ai/)** · **[paperr.ai/docs](https://paperr.ai/docs)**

> **This package is the installer, not the app.** paperr is a full application rather than a library — the code lives at **[github.com/biswasprateek/paperr](https://github.com/biswasprateek/paperr)**. Installing this package globally does nothing useful; run it with `npx`.

## Quick start

```bash
npx paperr           # installs into ./paperr and starts it
npx paperr my-dir    # ...or into ./my-dir
npx paperr --dev     # dev servers instead (API :3000, client :5173)
```

One command does the whole thing:

1. Clones the repo into the target directory (skipped if it's already there — re-running just starts paperr)
2. Installs root + server + client dependencies
3. Writes `server/.env` with freshly generated `JWT_SECRET` / `JWT_REFRESH_SECRET` — existing secrets are never overwritten
4. Provisions the bundled local AI server if Python 3 is present (skipped with a warning if not)
5. Builds the client and starts the server on **:3000**
6. Creates desktop + app-menu entries (**paperr** for dev, **paperr LAN Server** for everyday use) and opens the app in a chromeless Chrome/Edge window

First launch drops you into a **Setup Wizard** for your first space and admin account.

### Requirements

- **Node.js 22.5+** — the server uses the built-in `node:sqlite` module
- **git** — used for the one-time clone
- *(optional)* **Python 3** — auto-provisions paperr's bundled AI server; never blocks the install
- *(optional)* **Ollama** or **LM Studio** — if you'd rather point the assistant at those

Windows, macOS, and Linux.

## What you get

- **Tasks** — sub-tasks, tags, comments, attachments, recurrence, due dates and time blocks, Today/Overdue views, assignment across your space
- **Projects** — Board, List, and Phases views with milestones, per-project members, watch notifications
- **Calendar** — Day / Week / Month / Agenda, events with attendees, habit rings, per-day weather
- **Notebooks** — an Obsidian-style markdown knowledge base for recipes, manuals, and house docs
- **Routines** — time-anchored habits that auto-reset daily, with a Day Arc timeline and streaks
- **Deep Work Mode** — fullscreen single-task focus with a Pomodoro/count-up timer and logged session time
- **Focus & wellness apps** — Pomodoro, Timer, Stopwatch, Breathe, Meditate, Ambient Sound, Clock, Good Thoughts
- **Frame** — turn a spare screen into a photo frame from your own uploads or curated public-domain art
- **Home board & Hub** — a personal widget board plus a shared space-wide board with sticky pads
- **Spaces** — separate Family and Team spaces, each with its own members, areas, and isolated data
- **Backups** — manual snapshots or scheduled ones with retention, restore, and delete
- **Real-time sync** over Socket.io, and desktop / phone / wall-tablet layouts from a single install

### dotAi — the assistant

Chat to create, edit, and query tasks, projects, and events, and let **background agents** (Morning Brief, Reschedule Advisor, Priority Focus, Workload Spread, Bulletin Board — or your own custom ones) surface dismissable insight cards. Nothing an agent proposes is applied without your approval.

The bundled AI server runs a small **Gemma E2B** model via `litert-lm` on **CPU alone, under 2GB of RAM**, uses a GPU when one is available, and auto-offloads when idle. Point `LLM_BASE_URL` at Ollama or LM Studio instead if you prefer.

## Network access

paperr binds to `0.0.0.0`, so every device on your LAN can reach it — the launcher prints the address. Set a DHCP reservation for the host so the URL never changes.

```
http://192.168.x.x:3000
```

## Configuration

Edit `server/.env`:

| Variable                                | Default                        | Description                  |
| --------------------------------------- | ------------------------------ | ---------------------------- |
| `PORT`                                | `3000`                       | Server port                  |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | *(auto-generated)*           | Sign access / refresh tokens |
| `DB_PATH`                             | `./data/databases/paperr.db` | SQLite database file         |
| `UPLOADS_PATH`                        | `./uploads`                  | File attachment storage      |
| `LLM_BASE_URL`                        | `http://localhost:11434`     | Ollama / LM Studio base URL  |
| `LLM_MODEL`                           | `llama3`                     | Local model name for dotAi   |
| `HTTPS_ENABLED`                       | `false`                      | Enable TLS on the LAN        |

Full reference: [paperr.ai/docs](https://paperr.ai/docs).

## Running it day to day

From the checkout:

```bash
npm run app             # start (or reopen) the production app
npm run app -- --dev    # dev servers
npm run uninstall       # remove shortcuts and stop the server
npm run uninstall -- --purge   # ...and delete the database, uploads, and backups
```

On Windows, paperr also appears in **Settings → Installed apps**.

---

[paperr.ai](https://paperr.ai/) · [Docs](https://paperr.ai/docs) · [GitHub](https://github.com/biswasprateek/paperr) · [Issues](https://github.com/biswasprateek/paperr/issues) · Apache-2.0
