#!/usr/bin/env node
'use strict';
// paperr launcher — idempotent, safe to run any number of times.
//   1. starts the server only if it isn't already answering /api/health
//   2. creates the desktop app entry the first time (shortcut / .app / .desktop)
//   3. opens paperr in a chromeless browser window
// The desktop entry points back at this file, so everyday use is one click and
// never ends up with two servers on the same port.

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const win = process.platform === 'win32';

// ─── Config ───────────────────────────────────────────────────────────────────

// server/.env is the source of truth for PORT once setup-env.js has run.
function readPort(dir, env = process.env) {
  const file = path.join(dir, 'server', '.env');
  const match = fs.existsSync(file) && fs.readFileSync(file, 'utf8').match(/^PORT=(\d+)/m);
  return env.PORT || (match && match[1]) || '3000';
}

// ─── Icon ─────────────────────────────────────────────────────────────────────

// Windows shortcuts need .ico, so wrap the 512px PNG in an ICONDIR header —
// Vista+ reads PNG-compressed icon entries directly. Width/height 0 mean 256+.
function icoFrom(png) {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(1, 2);                 // type: icon
  head.writeUInt16LE(1, 4);                 // one image
  head.writeUInt16LE(1, 10);                // colour planes
  head.writeUInt16LE(32, 12);               // bits per pixel
  head.writeUInt32LE(png.length, 14);       // image size
  head.writeUInt32LE(head.length, 18);      // image offset
  return Buffer.concat([head, png]);
}

const logoPng = path.join(root, 'client', 'public', 'favicon-512.png');

function icoPath() {
  const ico = path.join(root, 'paperr.ico');
  if (fs.existsSync(ico)) return ico;
  if (!fs.existsSync(logoPng)) return null;
  fs.writeFileSync(ico, icoFrom(fs.readFileSync(logoPng)));
  return ico;
}

// ─── Desktop entries ──────────────────────────────────────────────────────────

// Desktop plus the Start Menu's Programs folder — the latter is what puts
// paperr in "All apps" and makes it findable from Windows Search. Both come
// from GetFolderPath rather than ~/… because OneDrive redirects them.
// Rewritten on every launch rather than skipped when present, so a shortcut
// left pointing at a moved or deleted checkout repairs itself.
// WindowStyle 7 keeps the console minimised while the server boots.
// ponytail: brief console flash on launch; wrap in a .vbs stub if it annoys.
const SHORTCUT_FOLDERS = "@([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))";

// Two shortcuts, one install: "paperr" runs the dev servers for hacking on the
// code, "paperr LAN Server" runs the production build other devices on the
// network can reach. Shared by every platform's shortcut/entry builder below,
// and by the uninstaller, so the two lists never drift apart.
const SHORTCUTS = [
  { name: 'paperr', dev: true },
  { name: 'paperr LAN Server', dev: false },
];

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

function winShortcutScript(icon, folders = SHORTCUT_FOLDERS) {
  return SHORTCUTS.map(({ name, dev }) => [
    '$w = New-Object -ComObject WScript.Shell',
    `foreach ($d in ${folders}) {`,
    `  $s = $w.CreateShortcut((Join-Path $d '${name}.lnk'))`,
    // A dev checkout and a one-click install share these two names, and whoever
    // launched last used to win — silently repointing the install's shortcuts at
    // an unrelated folder. Leave an entry alone while it still points at a
    // working launch.js somewhere else; only take it over once that path is gone.
    '  $o = $s.WorkingDirectory',
    `  if ($o -and $o -ne '${root}' -and (Test-Path (Join-Path $o 'scripts\\launch.js'))) { continue }`,
    `  $s.TargetPath = '${process.execPath}'`,
    `  $s.Arguments = '"${__filename}"${dev ? ' --dev' : ''}'`,
    `  $s.WorkingDirectory = '${root}'`,
    `  $s.Description = '${name}'`,
    '  $s.WindowStyle = 7',
    icon ? `  $s.IconLocation = '${icon}'` : '',
    '  $s.Save()',
    '}',
  ].filter(Boolean).join('\n')).join('\n');
}

// What puts paperr in Settings -> Installed apps with a working Uninstall
// button. HKCU, so no admin rights and nothing touched for other users.
const UNINSTALL_KEY = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\paperr';

function winUninstallScript(icon, key = UNINSTALL_KEY) {
  const version = require(path.join(root, 'package.json')).version;
  const uninstaller = `"${process.execPath}" "${path.join(root, 'scripts', 'uninstall.js')}"`;
  return [
    `$k = '${key}'`,
    // Same ownership rule as the shortcuts: one Installed apps entry, so don't
    // hijack it from another copy that is still on disk — its Uninstall button
    // would then point at the wrong folder.
    '$o = (Get-ItemProperty $k -ErrorAction SilentlyContinue).InstallLocation',
    `if (-not ($o -and $o -ne '${root}' -and (Test-Path (Join-Path $o 'scripts\\launch.js')))) {`,
    '  New-Item -Path $k -Force | Out-Null',
    "  Set-ItemProperty $k DisplayName 'paperr'",
    `  Set-ItemProperty $k DisplayVersion '${version}'`,
    "  Set-ItemProperty $k Publisher 'biswasprateek'",
    `  Set-ItemProperty $k InstallLocation '${root}'`,
    `  Set-ItemProperty $k UninstallString '${uninstaller}'`,
    "  Set-ItemProperty $k URLInfoAbout 'https://paperr.ai/'",
    '  Set-ItemProperty $k NoModify 1 -Type DWord',
    '  Set-ItemProperty $k NoRepair 1 -Type DWord',
    icon ? `  Set-ItemProperty $k DisplayIcon '${icon}'` : '',
    '}',
  ].filter(Boolean).join('\n');
}

function winShortcut() {
  const icon = icoPath();
  // One PowerShell start-up covers both — it is the slow part, not the writes.
  const ps = `${winShortcutScript(icon)}\n${winUninstallScript(icon)}`;
  const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { encoding: 'utf8' });
  // spawnSync throws for neither a missing powershell (.error) nor a failed
  // script (.status), so without this the entries silently never appear.
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(r.stderr.trim() || `powershell exited ${r.status}`);
}

// A single-image .icns is what makes Launchpad look pixelated — it upscales
// whatever one representation it finds. macOS wants every size present, so
// build a full .iconset and let iconutil compile it.
//
// Sizes come from favicon.svg where possible: it is vector, so 1024 (512@2x)
// is genuinely sharp rather than an upscaled 512 bitmap. sharp is already a
// server dependency and has librsvg built in; without it, fall back to sips
// downscaling the 512 PNG, which still beats one lone representation.
const ICON_SIZES = [16, 32, 128, 256, 512];

function loadSharp() {
  try {
    return require(path.join(root, 'server', 'node_modules', 'sharp'));
  } catch {
    return null;
  }
}

async function makeIcns(dest) {
  const sharp = loadSharp();
  const svg = path.join(root, 'client', 'public', 'favicon.svg');
  const vector = sharp && fs.existsSync(svg);
  const set = path.join(os.tmpdir(), `paperr-${process.pid}.iconset`);
  fs.mkdirSync(set, { recursive: true });

  try {
    for (const size of ICON_SIZES) {
      for (const [px, name] of [[size, `icon_${size}x${size}.png`], [size * 2, `icon_${size}x${size}@2x.png`]]) {
        const out = path.join(set, name);
        if (vector) {
          fs.writeFileSync(out, await sharp(svg).resize(px, px).png().toBuffer());
        } else {
          spawnSync('sips', ['-z', String(px), String(px), logoPng, '--out', out], { stdio: 'ignore' });
        }
      }
    }
    // Returns whether this is the sharp-rendered icon, i.e. the one worth
    // stamping as final — not merely whether a file got written.
    if (spawnSync('iconutil', ['-c', 'icns', set, '-o', dest], { stdio: 'ignore' }).status === 0) return vector;

    // Last resort: the old single-image conversion. Blurry, but an icon.
    spawnSync('sips', ['-s', 'format', 'icns', logoPng, '--out', dest], { stdio: 'ignore' });
    return false;
  } catch (err) {
    console.warn(`[paperr] Icon generation failed (${err.message}) — using the generic icon.`);
    return false;
  } finally {
    fs.rmSync(set, { recursive: true, force: true });
  }
}

// Rewritten each launch so a bundle pointing at a moved checkout self-repairs.
async function macApps() {
  let iconChanged = false;

  for (const { name, dev } of SHORTCUTS) {
    const app = path.join(os.homedir(), 'Applications', `${name}.app`);
    fs.mkdirSync(path.join(app, 'Contents', 'MacOS'), { recursive: true });
    fs.mkdirSync(path.join(app, 'Contents', 'Resources'), { recursive: true });

    // Built locally, so it carries no quarantine flag — Gatekeeper stays quiet
    // without any signing or notarisation. LSUIElement hides the launcher itself
    // from the Dock; the browser window it opens gets its own icon.
    fs.writeFileSync(path.join(app, 'Contents', 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>${name}</string>
  <key>CFBundleIdentifier</key><string>ai.paperr.launcher${dev ? '' : '.lan'}</string>
  <key>CFBundleExecutable</key><string>paperr</string>
  <key>CFBundleIconFile</key><string>paperr</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSUIElement</key><true/>
</dict></plist>
`);

    const exe = path.join(app, 'Contents', 'MacOS', 'paperr');
    fs.writeFileSync(exe, `#!/bin/sh\nexec "${process.execPath}" "${__filename}"${dev ? ' --dev' : ''}\n`);
    fs.chmodSync(exe, 0o755);

    // Bumped when the icon pipeline changes, so existing installs regenerate
    // instead of keeping whatever the previous version produced.
    const icns = path.join(app, 'Contents', 'Resources', 'paperr.icns');
    const stamp = path.join(app, 'Contents', 'Resources', '.icon-v2');
    if (!fs.existsSync(stamp) || !fs.existsSync(icns)) {
      // sharp lives in server/node_modules, so entries built before the first
      // install fall back to the blurry sips path — leave that unstamped so the
      // next launch regenerates it properly.
      if (await makeIcns(icns)) fs.writeFileSync(stamp, '');
      // Launchpad and the Dock cache icons hard; without this the old one sticks.
      spawnSync('touch', [app], { stdio: 'ignore' });
      iconChanged = true;
    }
  }

  if (iconChanged) spawnSync('killall', ['Dock'], { stdio: 'ignore' });
}

// Rewritten each launch so an entry pointing at a moved checkout self-repairs.
function linuxDesktop() {
  const dir = path.join(os.homedir(), '.local', 'share', 'applications');
  fs.mkdirSync(dir, { recursive: true });

  for (const { name, dev } of SHORTCUTS) {
    const file = path.join(dir, `${slug(name)}.desktop`);
    fs.writeFileSync(file, `[Desktop Entry]
Type=Application
Name=${name}
Comment=Self-hosted household OS
Exec="${process.execPath}" "${__filename}"${dev ? ' --dev' : ''}
Icon=${logoPng}
Terminal=false
Categories=Utility;Office;
`);
    fs.chmodSync(file, 0o755);
  }
}

async function ensureDesktopEntry() {
  const make = { win32: winShortcut, darwin: macApps, linux: linuxDesktop }[process.platform];
  try {
    if (make) await make();
  } catch (err) {
    console.warn(`[paperr] Couldn't create the desktop shortcut: ${err.message}`);
  }
}

// ─── Browser ──────────────────────────────────────────────────────────────────

// --app= gives a chromeless window with its own taskbar/dock entry: everything
// nativefier does here, minus downloading a second copy of Electron.
const CHROMIUM = {
  win32: [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
  ],
  // Relative to each of MAC_APP_DIRS — plenty of people install to ~/Applications.
  darwin: [
    'Google Chrome.app/Contents/MacOS/Google Chrome',
    'Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    'Brave Browser.app/Contents/MacOS/Brave Browser',
    'Vivaldi.app/Contents/MacOS/Vivaldi',
    'Chromium.app/Contents/MacOS/Chromium',
  ],
  linux: ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser'],
};

const MAC_APP_DIRS = ['/Applications', path.join(os.homedir(), 'Applications')];

function findBrowser() {
  const candidates = CHROMIUM[process.platform] || [];
  if (process.platform === 'linux') {
    return candidates.find((b) => spawnSync('which', [b], { stdio: 'ignore' }).status === 0);
  }
  if (process.platform === 'darwin') {
    for (const dir of MAC_APP_DIRS) {
      const hit = candidates.map((rel) => path.join(dir, rel)).find((p) => fs.existsSync(p));
      if (hit) return hit;
    }
    return undefined;
  }
  return candidates.find((p) => fs.existsSync(p));
}

function openApp(url) {
  const browser = findBrowser();
  const [cmd, args] = browser
    ? [browser, [`--app=${url}`]]
    : win ? ['cmd', ['/c', 'start', '', url]]          // no Chromium — plain tab
      : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];

  // Safari has no --app equivalent, so the fallback there is an ordinary tab.
  // Say so, and point at the one native way to get a real window.
  if (!browser && process.platform === 'darwin') {
    console.log('[paperr] No Chrome/Edge/Brave found, so this opens as a Safari tab.');
    console.log('         For a proper app window: in Safari use File > Add to Dock');
    console.log('         (macOS 14+), or install Chrome/Edge and launch paperr again.');
  }
  // Headless boxes and WSL have no opener at all, and an unhandled ENOENT
  // would take the whole launch down — print the URL and carry on.
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => console.log('[paperr] Nothing here can open a browser — use the URL shown.'));
  child.unref();
}

// ─── Server ───────────────────────────────────────────────────────────────────

// One command string rather than args + shell: the shell is what resolves npm
// to npm.cmd on Windows, and this form avoids Node's DEP0190 warning about
// unescaped args. A failed step must stop the launch — otherwise the wait loop
// just spins for two minutes on a broken install.
function npmRun(script, label) {
  const r = spawnSync(`npm run ${script}`, { cwd: root, stdio: 'inherit', shell: true });
  if (r.status !== 0) throw new Error(`${label} failed — see the output above.`);
}

// node_modules and client/dist are both gitignored, so a `git pull` that brings
// a new version leaves them behind at the old one — the app would start on
// stale dependencies and serve the previously built bundle. Stamping the commit
// each install was set up at is what makes an update actually take effect.
// Empty head means this isn't a clone (a downloaded zip); nothing to compare.
const stampFile = (dir) => path.join(dir, '.paperr-build');

function gitHead(dir) {
  const r = spawnSync('git rev-parse HEAD', { cwd: dir, shell: true, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}

// No stamp at all means an install that predates this check: treat it as moved,
// which costs one refresh and unsticks everyone already sitting on old code.
function movedSinceBuild(dir, commit) {
  const file = stampFile(dir);
  return Boolean(commit) && (!fs.existsSync(file) || fs.readFileSync(file, 'utf8').trim() !== commit);
}

const head = gitHead(root);
const moved = movedSinceBuild(root, head);
const stampBuild = () => head && fs.writeFileSync(stampFile(root), head);

// A fresh clone has no node_modules, so building or serving would fail. This
// also writes server/.env with real JWT secrets, via install:all -> setup:env
// (which leaves an existing .env alone, so it is safe on every later update).
function ensureInstalled() {
  const missing = !['server', 'client'].every((d) => fs.existsSync(path.join(root, d, 'node_modules')));
  if (!missing && !moved) return;
  if (missing) {
    console.log('[paperr] First run — installing dependencies. This takes a few minutes.');
    console.log(`         Server packages go into ${path.join(root, 'server', 'node_modules')}`);
    console.log(`         Client packages go into ${path.join(root, 'client', 'node_modules')}`);
    console.log(`         Your config (with fresh secrets) is written to ${path.join(root, 'server', '.env')}\n`);
  } else {
    console.log('[paperr] New version downloaded — updating dependencies.\n');
  }
  npmRun('install:all', 'Dependency install');
}

function startServer(port, dev) {
  ensureInstalled();
  if (dev) {
    // Dev wants the logs, so this one stays attached; Ctrl+C stops both halves.
    // Vite serves from source, so there is no bundle to go stale — stamp anyway
    // or every dev launch would reinstall dependencies.
    stampBuild();
    spawn('npm run dev', { cwd: root, stdio: 'inherit', shell: true });
    return;
  }
  if (moved || !fs.existsSync(path.join(root, 'client', 'dist', 'index.html'))) {
    console.log(`[paperr] Building the app into ${path.join(root, 'client', 'dist')} — this takes a minute...`);
    npmRun('build', 'Client build');
  }
  // After the build, never before: a build that fails exits here, and the next
  // run has to try again rather than assume this version is ready to serve.
  stampBuild();
  // NODE_ENV here rather than in .env: dotenv won't override the process env,
  // so .env stays on development for normal dev work (same trick as start-paperr.*).
  const log = fs.openSync(path.join(root, 'paperr.log'), 'a');
  const child = spawn(process.execPath, ['index.js'], {
    cwd: path.join(root, 'server'),
    env: { ...process.env, NODE_ENV: 'production', PORT: port },
    detached: true,
    stdio: ['ignore', log, log],
    windowsHide: true,
  });
  // Recorded so the uninstaller can stop it without lsof, PowerShell, or any
  // other per-platform way of asking "who owns this port".
  fs.writeFileSync(path.join(root, 'paperr.pid'), String(child.pid));
  child.unref();
}

// Prefer a genuine LAN address: docker0 and WSL bridges sit on 172.x and would
// otherwise be advertised as the address other devices should use.
const lanUrl = (port) => {
  const ips = Object.values(os.networkInterfaces()).flat()
    .filter((i) => i.family === 'IPv4' && !i.internal).map((i) => i.address);
  const ip = ips.find((a) => /^(192\.168\.|10\.)/.test(a)) || ips[0];
  return ip && `http://${ip}:${port}`;
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const dev = process.argv.includes('--dev');
  const port = readPort(root);
  const url = `http://localhost:${dev ? '5173' : port}`;

  // Before the server work, not after. The entries only need to point back at
  // this file, and every failure below returns early — a first run that dies in
  // npm install, or finds the port busy, would otherwise leave a fresh clone
  // with no shortcuts at all, which is the one thing a one-click install owes.
  // Always, not just !dev: whichever shortcut ran first creates both, so the
  // one a person never clicked still shows up.
  await ensureDesktopEntry();

  // Readiness probes / rather than /api/health: the API answers in either mode,
  // but the client bundle is only served when NODE_ENV=production, so a dev
  // server on the same port would otherwise look "up" and open an error window.
  const probe = (u) => fetch(u, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok, () => false);
  const ready = () => probe(url);

  let running = await ready();

  // The update the bootstrap just pulled is only on disk — the process
  // answering here is still the old version, and leaving it alone is why a
  // re-run used to look like nothing had changed. Stop it and start again.
  // Not in dev: paperr.pid records the detached production server, while a dev
  // run answers on :5173 and writes no pid — killing what's in that file would
  // be killing something else entirely. Vite reloads from source anyway.
  if (running && moved && !dev) {
    console.log('[paperr] A new version was downloaded — restarting to use it.');
    const pidFile = path.join(root, 'paperr.pid');
    const pid = fs.existsSync(pidFile) && Number(fs.readFileSync(pidFile, 'utf8').trim());
    try {
      if (!pid) throw new Error('no recorded pid');
      process.kill(pid);
      fs.rmSync(pidFile, { force: true });
      // The port takes a moment to come free; starting into it hits EADDRINUSE.
      for (let i = 0; i < 40 && await probe(`http://localhost:${port}/api/health`); i++) {
        await new Promise((r) => setTimeout(r, 250));
      }
      // If it outlived the kill, leave it be and open it rather than failing on
      // a port that never came free.
      running = await ready();
    } catch {
      console.error('[paperr] Couldn\'t stop the running copy — close paperr and run this again');
      console.error('         to finish updating. Opening the version that\'s running.');
    }
  }

  if (running) {
    console.log('[paperr] Already running.');
  } else if (!dev && await probe(`http://localhost:${port}/api/health`)) {
    console.error(`[paperr] Port ${port} is taken by a server that isn't serving the built client`);
    console.error('         (a dev server, most likely). Stop it, or start the dev servers: npm run app -- --dev');
    // exitCode rather than exit(): a hard exit while fetch's abort timer is
    // still closing trips a libuv assertion on Windows.
    process.exitCode = 1;
    return;
  } else {
    startServer(port, dev);
    process.stdout.write('[paperr] Starting');
    const deadline = Date.now() + 120000;
    while (!(await ready())) {
      if (Date.now() > deadline) {
        console.error(`\n[paperr] Server never came up. Check ${path.join(root, 'paperr.log')}`);
        process.exitCode = 1;
        return;
      }
      process.stdout.write('.');
      await new Promise((r) => setTimeout(r, 500));
    }
    console.log(' ready.');
  }

  console.log('[paperr] Opening paperr in your browser...');
  openApp(url);

  console.log(`\n  This device : ${url}`);
  if (!dev && lanUrl(port)) console.log(`  On network  : ${lanUrl(port)}`);
  console.log('');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`\n[paperr] ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = { readPort, icoFrom, winShortcutScript, winUninstallScript, UNINSTALL_KEY, SHORTCUTS, slug, movedSinceBuild };
