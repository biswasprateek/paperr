# One-click install

Download the file for your OS and double-click it. First run installs paperr to
`~/paperr` (Windows: `%USERPROFILE%\paperr`); every run after that just starts it.

| OS      | File                     | First-run note                                  |
| ------- | ------------------------ | ----------------------------------------------- |
| Windows | `paperr-windows.cmd`   | SmartScreen may warn — More info → Run anyway |
| macOS   | `paperr-macos.command` | `chmod +x` it, then right-click → Open       |
| Linux   | `paperr-linux.sh`      | `chmod +x` it                                 |

Needs **Node 22.5+** and **git** — the script links you to them if they're missing.

What it does: downloads the bootstrap from the repo, clones paperr, installs
deps, generates `server/.env` with real JWT secrets, builds the client, starts
the server, and adds a desktop entry (Desktop shortcut / `~/Applications/
paperr.app` / `.desktop` file) — then opens the app.

That desktop entry is the everyday path. It re-runs the same launcher, which
starts the server only if it isn't already up, then opens paperr in a chromeless
Chrome/Edge window — an app window with its own icon, no browser chrome, nothing
extra installed. No code signing involved anywhere, on any platform.

```Shell
npm run app            # from inside an existing checkout
npm run app -- --dev   # dev servers instead (API :3000, client :5173)
npx paperr             # from a terminal, OUTSIDE any paperr checkout
```

`npx paperr` must not be run from inside a checkout: npm walks up looking for a
local package named `paperr`, finds the repo's own `package.json` (which has no
`bin`), and gives up with "could not determine executable to run". The one-click
files avoid npm entirely for that reason.

Updating: `git pull` in `~/paperr`, then launch normally — the launcher rebuilds
only when `client/dist` is missing, so delete it first if the UI looks stale.

## Uninstalling

Windows registers paperr in **Settings → Installed apps**, so it uninstalls from
there like anything else. macOS and Linux have no equivalent registry, so run it
by hand from the install folder:

```Shell
npm run uninstall            # stops the server, removes shortcuts / .app / .desktop
npm run uninstall -- --purge # the above, plus deletes the whole folder
```

Without `--purge` your database, uploads and backups are left untouched — the
uninstaller prints the folder holding them. Nothing is installed system-wide on
any platform, so there is never anything else to clean up.
