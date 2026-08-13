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

// Which checkout an existing entry belongs to, or null when there is no entry.
// macOS keeps the path in the bundle's exec stub and Linux in the .desktop Exec
// line; both are plain text holding "…/scripts/launch.js", so one regex does.
function entryOwner(entry) {
  const file = process.platform === 'darwin' ? path.join(entry, 'Contents', 'MacOS', 'paperr') : entry;
  if (!fs.existsSync(file)) return null;
  const match = fs.readFileSync(file, 'utf8').match(/"([^"]*launch\.js)"/);
  return match && path.resolve(path.dirname(match[1]), '..');
}

// Mirrors the launcher's ownership rule: a dev checkout and a one-click install
// share these names, so only clear the ones this copy owns — otherwise
// uninstalling one strips the other's. Reports the count and, when some other
// copy holds the entries, where that copy lives.
function removeEntries() {
  if (win) {
    const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', [
      '$w = New-Object -ComObject WScript.Shell',
      '$n = 0',
      '$owner = $null',
      "foreach ($d in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {",
      ...SHORTCUTS.flatMap(({ name }) => [
        `  $p = Join-Path $d '${name}.lnk'`,
        '  if (Test-Path $p) {',
        '    $o = $w.CreateShortcut($p).WorkingDirectory',
        `    if ($o -eq '${root}') { Remove-Item $p -Force; $n++ } elseif ($o) { $owner = $o }`,
        '  }',
      ]),
      '}',
      `$k = '${UNINSTALL_KEY}'`,
      '$reg = (Get-ItemProperty $k -ErrorAction SilentlyContinue).InstallLocation',
      `if ($reg -eq '${root}') { Remove-Item $k -Recurse -Force -ErrorAction SilentlyContinue } elseif ($reg) { $owner = $reg }`,
      'Write-Output "$n|$owner"',
    ].join('\n')], { encoding: 'utf8' });

    const [count, owner] = (r.stdout || '').trim().split('|');
    return { removed: Number(count) || 0, owner: owner || null };
  }

  const lsregister = '/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister';
  let removed = 0;
  let owner = null;

  for (const { name } of SHORTCUTS) {
    const entry = process.platform === 'darwin'
      ? path.join(os.homedir(), 'Applications', `${name}.app`)
      : path.join(os.homedir(), '.local', 'share', 'applications', `${slug(name)}.desktop`);

    const holder = entryOwner(entry);
    if (holder && holder !== root) {
      owner = holder;
      continue;
    }
    if (!fs.existsSync(entry)) continue;

    fs.rmSync(entry, { recursive: true, force: true });
    removed++;

    // rmSync alone leaves a ghost icon in Launchpad: its index comes from the
    // LaunchServices database, which only Finder-driven deletes update. Telling
    // it to forget the path has to happen after the delete — lsregister hands
    // the unregister off to a daemon rather than committing it inline, and
    // running it first races the delete: the bundle can end up re-registered
    // instead of dropped. Confirmed empirically; order is load-bearing here.
    if (process.platform === 'darwin') spawnSync(lsregister, ['-u', entry], { stdio: 'ignore' });
  }

  return { removed, owner };
}

// Settings' Uninstall button registers no --purge, and someone clicking it
// reasonably expects the app gone — but this folder holds the only copy of their
// notes, tasks and uploads. Ask when a person is there to answer, and keep the
// data when nobody is (Settings can run this with no console attached).
async function wantsPurge() {
  if (purge) return true;
  if (!process.stdin.isTTY) return false;

  const rl = require('node:readline/promises').createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await rl.question(`\nAlso delete your notes, tasks and uploads in ${root}? [y/N] `)).trim());
  } finally {
    rl.close();
  }
}

(async () => {
  const stopped = await stopServer();
  const { removed, owner } = removeEntries();

  // Run from a copy that owns none of the entries — almost always a dev checkout
  // while the real install sits in ~/paperr. Point at that one rather than
  // claiming success and offering to delete the wrong folder.
  if (!removed && owner) {
    console.log(`\nNothing here belonged to this copy of paperr (${root}).`);
    console.log(`The installed one is ${owner} — uninstall that instead:`);
    console.log(`  node "${path.join(owner, 'scripts', 'uninstall.js')}"\n`);
  } else if (await wantsPurge()) {
    process.chdir(os.homedir()); // can't delete the folder we're standing in
    // git marks objects read-only, which trips EPERM on Windows without retries.
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
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
