// node --test scripts/launch.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { spawnSync } = require('node:child_process');
const { readPort, icoFrom, winShortcutScript, winUninstallScript, SHORTCUTS, movedSinceBuild } = require('./launch.js');

// Deciding wrong here is the whole "I updated and nothing changed" bug: node_modules
// and client/dist are gitignored, so only this stamp knows the build is behind.
test('movedSinceBuild: true until the stamp matches the current commit', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paperr-stamp-'));
  const stamp = path.join(dir, '.paperr-build');

  assert.equal(movedSinceBuild(dir, 'abc123'), true, 'no stamp — an install from before this check');
  fs.writeFileSync(stamp, 'abc123\n');
  assert.equal(movedSinceBuild(dir, 'abc123'), false, 'already built at this commit');
  assert.equal(movedSinceBuild(dir, 'def456'), true, 'a pull moved HEAD');
  assert.equal(movedSinceBuild(dir, ''), false, 'not a clone — nothing to compare');
});

test('readPort: env wins, then server/.env, then 3000', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paperr-'));
  assert.equal(readPort(dir, {}), '3000');

  fs.mkdirSync(path.join(dir, 'server'));
  fs.writeFileSync(path.join(dir, 'server', '.env'), 'NODE_ENV=production\nPORT=8080\n');
  assert.equal(readPort(dir, {}), '8080');
  assert.equal(readPort(dir, { PORT: '9999' }), '9999');
});

test('icoFrom: valid ICONDIR pointing past the header', () => {
  const png = Buffer.from('fake png bytes');
  const ico = icoFrom(png);

  assert.equal(ico.readUInt16LE(0), 0, 'reserved');
  assert.equal(ico.readUInt16LE(2), 1, 'type = icon');
  assert.equal(ico.readUInt16LE(4), 1, 'one image');
  assert.equal(ico.readUInt32LE(14), png.length, 'declared size');
  assert.equal(ico.readUInt32LE(18), 22, 'data starts after the header');
  assert.deepEqual(ico.subarray(22), png);
});

// The shortcut script is a hand-built PowerShell string, so quoting bugs are
// the likely failure. Build real .lnk files in a temp dir and read them back.
// One install makes two shortcuts — dev servers vs. the production build — so
// this checks both land in both folders with the right --dev argument.
test('winShortcutScript: writes both shortcuts to every folder', { skip: process.platform !== 'win32' }, () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'paperr-lnk-'));
  const desktop = path.join(base, 'Desktop');
  const programs = path.join(base, 'Programs');
  [desktop, programs].forEach((d) => fs.mkdirSync(d));
  const ico = path.join(base, 'paperr.ico');
  fs.writeFileSync(ico, icoFrom(Buffer.alloc(16)));

  const ps = (cmd) => spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', cmd], { encoding: 'utf8' });
  const made = ps(winShortcutScript(ico, `@('${desktop}', '${programs}')`));
  assert.equal(made.stderr.trim(), '', 'PowerShell reported no errors');

  for (const dir of [desktop, programs]) {
    for (const { name, dev } of SHORTCUTS) {
      const lnk = path.join(dir, `${name}.lnk`);
      assert.ok(fs.existsSync(lnk), `${name} shortcut created in ${path.basename(dir)}`);

      const read = ps(`$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${lnk}'); $s.TargetPath; $s.Arguments; $s.IconLocation`);
      const [target, args, icon] = read.stdout.trim().split(/\r?\n/);
      assert.equal(target, process.execPath);
      assert.equal(args, `"${path.join(__dirname, 'launch.js')}"${dev ? ' --dev' : ''}`);
      assert.ok(icon.startsWith(ico), `icon points at the .ico (got ${icon})`);
    }
  }

  // Re-running must repair a shortcut left pointing somewhere stale.
  const lnk = path.join(desktop, 'paperr.lnk');
  ps(`$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${lnk}'); $s.Arguments = '"C:\\gone\\launch.js"'; $s.Save()`);
  ps(winShortcutScript(ico, `@('${desktop}')`));
  const after = ps(`(New-Object -ComObject WScript.Shell).CreateShortcut('${lnk}').Arguments`);
  assert.equal(after.stdout.trim(), `"${path.join(__dirname, 'launch.js')}" --dev`, 'stale shortcut repaired');
});

// A dev checkout and a one-click install share these two names. Whoever ran last
// used to win, silently repointing the install's shortcuts at the repo.
test('winShortcutScript: keeps another live install\'s shortcut', { skip: process.platform !== 'win32' }, () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'paperr-own-'));
  const desktop = path.join(base, 'Desktop');
  fs.mkdirSync(desktop);

  const other = path.join(base, 'other');
  fs.mkdirSync(path.join(other, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(other, 'scripts', 'launch.js'), '');

  const ps = (cmd) => spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', cmd], { encoding: 'utf8' });
  const lnk = path.join(desktop, 'paperr.lnk');
  const workdir = () => ps(`(New-Object -ComObject WScript.Shell).CreateShortcut('${lnk}').WorkingDirectory`).stdout.trim();

  ps(`$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${lnk}'); $s.TargetPath = '${process.execPath}'; $s.WorkingDirectory = '${other}'; $s.Save()`);
  ps(winShortcutScript(null, `@('${desktop}')`));
  assert.equal(workdir(), other, 'the other install keeps its shortcut');

  // Once that install is gone the entry is dead, so this copy takes it over.
  fs.rmSync(other, { recursive: true, force: true });
  ps(winShortcutScript(null, `@('${desktop}')`));
  assert.equal(workdir(), path.join(__dirname, '..'), 'dead entry taken over');
});

// Written into a scratch HKCU key, never the real one — the values are
// hand-built strings and UninstallString embeds quotes, which is the risk.
test('winUninstallScript: registers a readable uninstall entry', { skip: process.platform !== 'win32' }, () => {
  const key = `HKCU:\\Software\\paperr-test-${process.pid}`;
  const ps = (cmd) => spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', cmd], { encoding: 'utf8' });
  try {
    const made = ps(winUninstallScript(null, key));
    assert.equal(made.stderr.trim(), '', 'PowerShell reported no errors');

    const read = ps(`$p = Get-ItemProperty '${key}'; $p.DisplayName; $p.UninstallString; $p.InstallLocation; $p.NoModify`);
    const [name, uninstall, location, noModify] = read.stdout.trim().split(/\r?\n/);
    assert.equal(name, 'paperr');
    assert.equal(noModify, '1');
    assert.equal(location, path.join(__dirname, '..'));
    assert.equal(uninstall, `"${process.execPath}" "${path.join(__dirname, 'uninstall.js')}"`);
    // Settings runs that string verbatim, so the script has to actually be there.
    assert.ok(fs.existsSync(path.join(__dirname, 'uninstall.js')), 'uninstaller exists on disk');
  } finally {
    ps(`Remove-Item '${key}' -Recurse -Force -ErrorAction SilentlyContinue`);
  }
});
