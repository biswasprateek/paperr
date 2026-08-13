// Self-update: fetch the repo this install was cloned from and fast-forward to it.
// `npx paperr` clones with --depth 1, so every git call has to stay shallow-safe:
// no merge, no HEAD..origin/<branch> counting — compare SHAs and hard-reset.
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');

const execFileP = promisify(execFile);
const ROOT = path.join(__dirname, '..', '..');
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// windowsHide because the server may have no console of its own (launch.js
// starts it detached), and git/npm are console programs — without it Windows
// pops a new console window for every call. Node defaults it to false.
const git = (...args) => execFileP('git', args, { cwd: ROOT, windowsHide: true }).then(r => r.stdout.trim());
// .cmd shims need a shell on Windows (same as scripts/launch.js); no user input
// reaches either call, every argument here is a literal.
const npm = (args, cwd) =>
  execFileP(NPM, args, {
    cwd, shell: process.platform === 'win32', windowsHide: true, maxBuffer: 10 * 1024 * 1024,
  });

// Which workspaces need `npm install`, and does the client bundle need a rebuild?
// changed === null means the diff couldn't be read — redo everything rather than
// leave a half-updated install.
function plan(changed) {
  const hit = (f) => !changed || changed.includes(f);
  const under = (dir) => !changed || changed.some((f) => f.startsWith(dir));
  return {
    installs: ['', 'server/', 'client/'].filter((d) => hit(`${d}package.json`) || hit(`${d}package-lock.json`)),
    build: under('client/'),
  };
}

async function check() {
  const branch = await git('rev-parse', '--abbrev-ref', 'HEAD');
  await git('fetch', '--depth', '1', 'origin', branch);
  const [current, latest, dirty, message] = await Promise.all([
    git('rev-parse', '--short', 'HEAD'),
    git('rev-parse', '--short', 'FETCH_HEAD'),
    // Untracked files survive a hard reset, so only tracked edits count as dirty.
    git('status', '--porcelain', '--untracked-files=no'),
    git('log', '-1', '--format=%s', 'FETCH_HEAD'),
  ]);
  return { branch, current, latest, message, updateAvailable: current !== latest, dirty: dirty !== '' };
}

async function apply({ force = false } = {}) {
  const status = await check();
  if (!status.updateAvailable) return { ...status, updated: false };
  if (status.dirty && !force) {
    const err = new Error('This install has local changes to tracked files — updating would discard them.');
    err.status = 409;
    throw err;
  }

  const before = await git('rev-parse', 'HEAD');
  await git('reset', '--hard', 'FETCH_HEAD');
  const changed = await git('diff', '--name-only', before, 'HEAD').then((s) => s.split('\n'), () => null);

  const { installs, build } = plan(changed);
  for (const dir of installs) await npm(['install'], path.join(ROOT, dir));
  if (build) await npm(['run', 'build'], ROOT);

  // ponytail: no auto-restart — the pulled server code only runs once paperr is
  // relaunched. Respawn the process here if one-click updates must be zero-touch.
  // The next launch sees HEAD ahead of scripts/launch.js's .paperr-build stamp,
  // so it restarts the server (wanted) but repeats this install/build (not).
  // Stamp it here too if that second build ever costs more than it's worth.
  return { ...status, current: status.latest, updateAvailable: false, updated: true, restartRequired: true };
}

module.exports = { check, apply, plan };
