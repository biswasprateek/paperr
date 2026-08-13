# One-click install

Download the file for your OS and double-click it. First run installs paperr to
`~/paperr` (Windows: `%USERPROFILE%\paperr`); every run after that just starts it.

| OS      | File                     | First-run note                                  |
| ------- | ------------------------ | ----------------------------------------------- |
| Windows | `paperr-windows.cmd`   | SmartScreen may warn — More info → Run anyway |
| macOS   | `paperr-macos.command` | `chmod +x` it, then right-click → Open       |
| Linux   | `paperr-linux.sh`      | `chmod +x` it                                 |

Needs **Node 22.5+** and **git**, plus **Python 3** for the built-in AI server.
Anything missing, the script lists it, waits for a keypress, and installs it with
winget (Windows), Homebrew (macOS) or apt/dnf/zypper/pacman (Linux) — falling back
to download links where none of those exist.

What it does: runs `npx paperr@latest`, which clones the repo, installs deps,
generates `server/.env` with real JWT secrets, builds the client, starts the
server, and adds **two** desktop entries (Desktop shortcut + Start Menu on
Windows, `~/Applications/*.app` on macOS, `.desktop` files on Linux) — then
opens the app:

| Shortcut            | Runs                                                        |
| -------------------- | ------------------------------------------------------------ |
| `paperr`             | The dev servers (API :3000, client :5173) — for working on the code |
| `paperr LAN Server`  | The production build, reachable by other devices on the network    |

Both point at the same `~/paperr` install — whichever you run first creates
both shortcuts, so the one you haven't clicked yet still shows up. Clicking
either just decides how the server for that install starts.

Delivery goes through npm on purpose: every install registers as a download on
the `paperr` package, which is the only way to see how many there are. It also
means **a new npm version has to be published** before any change to
`npm/bin/paperr.js` reaches a user.

Those shortcuts are the everyday path. Each re-runs the same launcher, which
starts the server only if it isn't already up, then opens paperr in a chromeless
Chrome/Edge window — no browser chrome, nothing extra installed, and no code
signing involved anywhere on any platform. Only `paperr LAN Server` prints a
network address other devices can use; the dev shortcut is localhost-only.

The **taskbar** button for that window shows Edge's or Chrome's icon, not
paperr's: the window is a browser process, and Windows takes taskbar identity
from the browser. The favicon only sets the window icon. To get a real paperr
taskbar entry, open `http://localhost:3000` in Edge and use **… → Apps → Install
paperr** — installed web apps get their own icon and identity. The trade-off is
that launching the installed app does *not* start the server, so start paperr
from the shortcut first, or keep using the shortcut alone and live with the
browser icon.

```Shell
npm run app            # from inside an existing checkout
npm run app -- --dev   # dev servers instead (API :3000, client :5173)
npx paperr             # from a terminal, OUTSIDE any paperr checkout
```

`npx paperr` must not be run from inside a checkout: npm walks up looking for a
local package named `paperr`, finds the repo's own `package.json` (which has no
`bin`), and gives up with "could not determine executable to run". The one-click
files `cd` to your home folder first so they can't hit this.

Updating: `git pull` in `~/paperr`, then launch normally — the launcher rebuilds
only when `client/dist` is missing, so delete it first if the UI looks stale.

### macOS without Chrome or Edge

Safari has no `--app` equivalent, so paperr opens as an ordinary Safari tab
rather than its own window. Two ways to get a real app window: install Chrome,
Edge or Brave (the launcher picks any of them up from `/Applications` or
`~/Applications`), or use Safari's **File → Add to Dock** on macOS 14+, which
turns paperr into a proper web app using the name and icon from the manifest.

## Uninstalling

Double-click the file for your OS — it asks whether to delete your data too, and
defaults to keeping it:

| OS      | File                       |
| ------- | -------------------------- |
| Windows | `uninstall-windows.cmd`  |
| macOS   | `uninstall-macos.command` |
| Linux   | `uninstall-linux.sh`     |

Windows also lists paperr in **Settings → Installed apps**, which runs exactly
the same uninstaller. Or from the install folder:

```Shell
npm run uninstall            # stops the server, removes shortcuts / .app / .desktop
npm run uninstall -- --purge # the above, plus deletes the whole folder
```

Without `--purge` your database, uploads and backups are left untouched — the
uninstaller prints the folder holding them. Nothing is installed system-wide on
any platform, so there is never anything else to clean up.
