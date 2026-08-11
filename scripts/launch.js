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

function winShortcutScript(icon, folders = SHORTCUT_FOLDERS) {
  return [
    '$w = New-Object -ComObject WScript.Shell',
    `foreach ($d in ${folders}) {`,
    "  $s = $w.CreateShortcut((Join-Path $d 'paperr.lnk'))",
    `  $s.TargetPath = '${process.execPath}'`,
    `  $s.Arguments = '"${__filename}"'`,
    `  $s.WorkingDirectory = '${root}'`,
    "  $s.Description = 'paperr'",
    '  $s.WindowStyle = 7',
    icon ? `  $s.IconLocation = '${icon}'` : '',
    '  $s.Save()',
    '}',
  ].filter(Boolean).join('\n');
}

// What puts paperr in Settings -> Installed apps with a working Uninstall
// button. HKCU, so no admin rights and nothing touched for other users.
const UNINSTALL_KEY = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\paperr';

function winUninstallScript(icon, key = UNINSTALL_KEY) {
  const version = require(path.join(root, 'package.json')).version;
  const uninstaller = `"${process.execPath}" "${path.join(root, 'scripts', 'uninstall.js')}"`;
  return [
    `$k = '${key}'`,
    'New-Item -Path $k -Force | Out-Null',
    "Set-ItemProperty $k DisplayName 'paperr'",
    `Set-ItemProperty $k DisplayVersion '${version}'`,
    "Set-ItemProperty $k Publisher 'biswasprateek'",
    `Set-ItemProperty $k InstallLocation '${root}'`,
    `Set-ItemProperty $k UninstallString '${uninstaller}'`,
    "Set-ItemProperty $k URLInfoAbout 'https://paperr.ai/'",
    'Set-ItemProperty $k NoModify 1 -Type DWord',
    'Set-ItemProperty $k NoRepair 1 -Type DWord',
    icon ? `Set-ItemProperty $k DisplayIcon '${icon}'` : '',
  ].filter(Boolean).join('\n');
}

function winShortcut() {
  const icon = icoPath();
  // One PowerShell start-up covers both — it is the slow part, not the writes.
  const ps = `${winShortcutScript(icon)}\n${winUninstallScript(icon)}`;
  spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { stdio: 'ignore' });
}

// Rewritten each launch so a bundle pointing at a moved checkout self-repairs.
function macApp() {
  const app = path.join(os.homedir(), 'Applications', 'paperr.app');
  fs.mkdirSync(path.join(app, 'Contents', 'MacOS'), { recursive: true });
  fs.mkdirSync(path.join(app, 'Contents', 'Resources'), { recursive: true });

  // Built locally, so it carries no quarantine flag — Gatekeeper stays quiet
  // without any signing or notarisation. LSUIElement hides the launcher itself
  // from the Dock; the browser window it opens gets its own icon.
  fs.writeFileSync(path.join(app, 'Contents', 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>paperr</string>
  <key>CFBundleIdentifier</key><string>ai.paperr.launcher</string>
  <key>CFBundleExecutable</key><string>paperr</string>
  <key>CFBundleIconFile</key><string>paperr</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSUIElement</key><true/>
</dict></plist>
`);

  const exe = path.join(app, 'Contents', 'MacOS', 'paperr');
  fs.writeFileSync(exe, `#!/bin/sh\nexec "${process.execPath}" "${__filename}"\n`);
  fs.chmodSync(exe, 0o755);

  // sips ships with macOS and converts the square 512px mark straight to .icns.
  const icns = path.join(app, 'Contents', 'Resources', 'paperr.icns');
  if (!fs.existsSync(icns)) {
    const r = spawnSync('sips', ['-s', 'format', 'icns', logoPng, '--out', icns], { stdio: 'ignore' });
    if (r.status !== 0) console.warn('[paperr] Icon conversion failed — the app will use the generic icon.');
  }
}

// Rewritten each launch so an entry pointing at a moved checkout self-repairs.
function linuxDesktop() {
  const file = path.join(os.homedir(), '.local', 'share', 'applications', 'paperr.desktop');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `[Desktop Entry]
Type=Application
Name=paperr
Comment=Self-hosted household OS
Exec="${process.execPath}" "${__filename}"
Icon=${logoPng}
Terminal=false
Categories=Utility;Office;
`);
  fs.chmodSync(file, 0o755);
}

function ensureDesktopEntry() {
  const make = { win32: winShortcut, darwin: macApp, linux: linuxDesktop }[process.platform];
  try {
    if (make) make();
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
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  ],
  linux: ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser'],
};

function findBrowser() {
  const candidates = CHROMIUM[process.platform] || [];
  return process.platform === 'linux'
    ? candidates.find((b) => spawnSync('which', [b], { stdio: 'ignore' }).status === 0)
    : candidates.find((p) => fs.existsSync(p));
}

function openApp(url) {
  const browser = findBrowser();
  const [cmd, args] = browser
    ? [browser, [`--app=${url}`]]
    : win ? ['cmd', ['/c', 'start', '', url]]          // no Chromium — plain tab
      : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
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

// A fresh clone has no node_modules, so building or serving would fail. This
// also writes server/.env with real JWT secrets, via install:all -> setup:env.
function ensureInstalled() {
  if (['server', 'client'].every((d) => fs.existsSync(path.join(root, d, 'node_modules')))) return;
  console.log('[paperr] First run — installing dependencies. This takes a few minutes.\n');
  npmRun('install:all', 'Dependency install');
}

function startServer(port, dev) {
  ensureInstalled();
  if (dev) {
    // Dev wants the logs, so this one stays attached; Ctrl+C stops both halves.
    spawn('npm run dev', { cwd: root, stdio: 'inherit', shell: true });
    return;
  }
  if (!fs.existsSync(path.join(root, 'client', 'dist', 'index.html'))) {
    console.log('[paperr] Building the client (first run only)...');
    npmRun('build', 'Client build');
  }
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

  // Readiness probes / rather than /api/health: the API answers in either mode,
  // but the client bundle is only served when NODE_ENV=production, so a dev
  // server on the same port would otherwise look "up" and open an error window.
  const probe = (u) => fetch(u, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok, () => false);
  const ready = () => probe(url);

  if (await ready()) {
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

  if (!dev) ensureDesktopEntry();
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

module.exports = { readPort, icoFrom, winShortcutScript, winUninstallScript, UNINSTALL_KEY };
