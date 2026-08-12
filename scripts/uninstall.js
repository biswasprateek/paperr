#!/usr/bin/env node
'use strict';
// Removes paperr's shortcuts and its Add/Remove Programs entry, and stops the
// server if it is still running. Run by the Uninstall button in Windows
// Settings, or by hand.
//
// The install folder is deliberately left in place: it holds the database,
// uploads and backups, and none of that is recoverable. Pass --purge to delete
// it too.

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { readPort, UNINSTALL_KEY, SHORTCUTS, slug } = require('./launch.js');

const root = path.join(__dirname, '..');
const win = process.platform === 'win32';
const purge = process.argv.includes('--purge');

// The launcher writes paperr.pid, so stopping the server needs no lsof, no
// PowerShell, and no per-platform way of asking who owns the port.
// ponytail: SIGTERM only — the litert child exits with the pipe, verified on
// Windows; add a tree-kill if something ever survives.
async function stopServer() {
  const pidFile = path.join(root, 'paperr.pid');
  const pid = fs.existsSync(pidFile) && Number(fs.readFileSync(pidFile, 'utf8').trim());
  if (!pid) return 'no server was recorded as running';

  // PIDs get recycled, so only kill it if paperr is genuinely answering there.
  const port = readPort(root);
  const serving = await fetch(`http://localhost:${port}/api/health`, { signal: AbortSignal.timeout(1500) })
    .then((r) => r.ok, () => false);
  if (!serving) {
    fs.rmSync(pidFile, { force: true });
    return 'no server was running';
  }

  try {
    process.kill(pid);
    fs.rmSync(pidFile, { force: true });
    return 'server stopped';
  } catch {
    return `could not stop the server (pid ${pid}) — stop it yourself`;
  }
}

function removeEntries() {
  if (win) {
    spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', [
      "foreach ($d in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {",
      ...SHORTCUTS.map(({ name }) => `  Remove-Item (Join-Path $d '${name}.lnk') -Force -ErrorAction SilentlyContinue`),
      '}',
      `Remove-Item '${UNINSTALL_KEY}' -Recurse -Force -ErrorAction SilentlyContinue`,
    ].join('\n')], { stdio: 'ignore' });
    return;
  }

  const lsregister = '/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister';

  for (const { name } of SHORTCUTS) {
    const entry = process.platform === 'darwin'
      ? path.join(os.homedir(), 'Applications', `${name}.app`)
      : path.join(os.homedir(), '.local', 'share', 'applications', `${slug(name)}.desktop`);

    fs.rmSync(entry, { recursive: true, force: true });

    // rmSync alone leaves a ghost icon in Launchpad: its index comes from the
    // LaunchServices database, which only Finder-driven deletes update. Telling
    // it to forget the path has to happen after the delete — lsregister hands
    // the unregister off to a daemon rather than committing it inline, and
    // running it first races the delete: the bundle can end up re-registered
    // instead of dropped. Confirmed empirically; order is load-bearing here.
    if (process.platform === 'darwin') spawnSync(lsregister, ['-u', entry], { stdio: 'ignore' });
  }
}

(async () => {
  const stopped = await stopServer();
  removeEntries();

  if (purge) {
    process.chdir(os.homedir()); // can't delete the folder we're standing in
    fs.rmSync(root, { recursive: true, force: true });
    console.log(`\npaperr removed (${stopped}), including everything in ${root}.\n`);
  } else {
    console.log(`\npaperr has been unregistered: ${stopped}, shortcuts removed.`);
    console.log(`Your notes, tasks and uploads are still in ${root}`);
    console.log('Delete that folder to remove them, or re-run this with --purge.\n');
  }

  // Settings closes the console the moment this exits, so hold it open when a
  // person is actually watching.
  if (win && process.stdin.isTTY) spawnSync('cmd', ['/c', 'pause'], { stdio: 'inherit' });
})();
