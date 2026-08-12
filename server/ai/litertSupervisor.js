// Manages a local `litert-lm serve` child process — paperr's bundled,
// zero-config AI backend. Runs from a project-local venv (server/ai/litert/venv)
// so it doesn't depend on PATH or a system-wide Python install.
const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const util = require('util');
const treeKill = require('tree-kill');
const axios = require('axios');
const logger = require('../utils/logger');

const HOST = '127.0.0.1';
const PORT = 9379;
const BASE_URL = `http://${HOST}:${PORT}`;

const VENV_DIR = path.join(__dirname, 'litert', 'venv');
const CLI_PATH = process.platform === 'win32'
  ? path.join(VENV_DIR, 'Scripts', 'litert-lm.exe')
  : path.join(VENV_DIR, 'bin', 'litert-lm');
const PID_FILE = path.join(__dirname, 'litert', 'server.pid');

// windowsHide on every child: these are all console programs, and the server
// can be running with no console of its own (scripts/launch.js starts it
// detached). Without this, Windows hands each child a brand-new console and
// its window pops on screen — once every few seconds for the memory poll.
// Node defaults windowsHide to false, so it has to be explicit.
const HIDDEN = { windowsHide: true };
const execFileRaw = util.promisify(execFile);
const execFileP = (file, args, opts) => execFileRaw(file, args, { ...HIDDEN, ...opts });
const treeKillP = util.promisify(treeKill);

// Only letters/digits/dot/dash/underscore/slash — HF repo ids and file/model
// names never need anything else, and these get passed straight to spawn().
const SAFE_TOKEN = /^[A-Za-z0-9._\-/]+$/;

let child = null;
let status = 'stopped'; // stopped | starting | running | stopping | not_installed | error
let lastError = null;
let startedAt = null;
let importJob = null; // { repo, file, name, status, log: [], error }

// Memory of the running model — `litert-lm serve` itself reports nothing over
// its API, so this asks the OS directly for the launcher + its worker
// process's combined working set. Cached briefly so the UI's polling doesn't
// spawn a shell process on every request.
let lastMemMB = null;
let lastMemAt = 0;
const MEM_CACHE_MS = 3000;

function refreshMemoryIfStale() {
  if (process.platform !== 'win32' || !child?.pid) { lastMemMB = null; return; }
  if (Date.now() - lastMemAt < MEM_CACHE_MS) return;
  lastMemAt = Date.now();
  const rootPid = child.pid;

  // litert-lm.exe's real work happens in a *grandchild* python.exe (its
  // immediate child just launches another python.exe), so this walks the
  // whole descendant tree rather than assuming a fixed depth.
  execFileP('powershell', [
    '-NoProfile', '-Command',
    'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize | ConvertTo-Json -Compress',
  ]).then(({ stdout }) => {
    let procs = JSON.parse(stdout);
    if (!Array.isArray(procs)) procs = [procs]; // PowerShell unwraps single-element arrays

    const childrenOf = new Map();
    const byId = new Map();
    for (const p of procs) {
      byId.set(p.ProcessId, p);
      if (!childrenOf.has(p.ParentProcessId)) childrenOf.set(p.ParentProcessId, []);
      childrenOf.get(p.ParentProcessId).push(p.ProcessId);
    }

    let total = 0;
    const queue = [rootPid];
    const seen = new Set();
    while (queue.length) {
      const pid = queue.shift();
      if (seen.has(pid)) continue;
      seen.add(pid);
      total += byId.get(pid)?.WorkingSetSize || 0;
      for (const c of childrenOf.get(pid) || []) queue.push(c);
    }

    lastMemMB = total > 0 ? Math.round(total / (1024 * 1024)) : null;
  }).catch(() => { lastMemMB = null; });
}

function isInstalled() {
  return fs.existsSync(CLI_PATH);
}

async function pingOnce() {
  await axios.get(`${BASE_URL}/v1/models`, { timeout: 2000, insecureHTTPParser: true });
}

async function waitUntilReady(timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!child) return false; // died while we were waiting
    try { await pingOnce(); return true; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

function getStatus() {
  refreshMemoryIfStale();
  return {
    status,
    installed: isInstalled(),
    pid: child?.pid ?? null,
    host: HOST,
    port: PORT,
    baseUrl: BASE_URL,
    startedAt,
    lastError,
    memoryMB: child ? lastMemMB : null,
    importJob: importJob && {
      repo: importJob.repo,
      file: importJob.file,
      name: importJob.name,
      status: importJob.status,
      error: importJob.error,
      log: importJob.log.slice(-20).join(''),
    },
  };
}

// A crash, a forced terminal close, or a Windows SIGTERM (which Node can't
// intercept — it terminates unconditionally there) can all leave the child
// running after paperr itself has exited. A PID file lets the next start()
// find and clean up that orphan itself, rather than depending on shutdown
// signals actually being delivered.
function clearPidFile() {
  try { fs.unlinkSync(PID_FILE); } catch { /* already gone */ }
}

async function cleanupStalePid() {
  let stalePid;
  try { stalePid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10); } catch { return; }
  clearPidFile();
  if (!stalePid) return;
  try { await treeKillP(stalePid); } catch { /* already gone — fine */ }
}

function start() {
  // status flips to 'starting' synchronously below, before the first await in
  // launch() — checking it here (not just `child`, which isn't set until after
  // that await) closes the window where two rapid calls both spawn a process.
  if (child || status === 'starting' || status === 'stopping') return getStatus();
  if (!isInstalled()) { status = 'not_installed'; return getStatus(); }

  lastError = null;
  status = 'starting';
  startedAt = new Date().toISOString();
  launch();
  return getStatus();
}

async function launch() {
  await cleanupStalePid();
  if (status !== 'starting') return; // stop() was called while we were cleaning up

  const self = spawn(CLI_PATH, ['serve', '--host', HOST, '--port', String(PORT)], HIDDEN);
  child = self;
  fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
  fs.writeFileSync(PID_FILE, String(self.pid));

  self.stdout.on('data', d => logger.info(`[litert-lm] ${d.toString().trim()}`));
  self.stderr.on('data', d => logger.info(`[litert-lm] ${d.toString().trim()}`));

  self.on('error', (err) => {
    lastError = err.message;
    status = err.code === 'ENOENT' ? 'not_installed' : 'error';
    child = null;
    clearPidFile();
  });

  self.on('exit', (code) => {
    if (status !== 'stopping') {
      lastError = `Process exited unexpectedly (code ${code})`;
      status = 'error';
    } else {
      status = 'stopped';
    }
    child = null;
    clearPidFile();
  });

  const ready = await waitUntilReady();
  if (child !== self) return; // stopped/restarted while we were waiting
  if (ready) status = 'running';
  else { lastError = 'Timed out waiting for the server to become ready'; status = 'error'; }
}

function stop() {
  return new Promise((resolve) => {
    if (!child) { status = 'stopped'; clearPidFile(); return resolve(getStatus()); }
    status = 'stopping';
    const pid = child.pid;
    treeKill(pid, 'SIGTERM', () => {
      status = 'stopped';
      child = null;
      clearPidFile();
      resolve(getStatus());
    });
  });
}

// ── Model registry — `litert-lm list` works whether or not serve is running ──

function parseListOutput(stdout) {
  const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const dirLine = lines.find(l => /^Listing models in:/i.test(l));
  const dir = dirLine ? dirLine.replace(/^Listing models in:\s*/i, '') : null;

  const headerIdx = lines.findIndex(l => /^ID\s+SIZE\s+MODIFIED/i.test(l));
  const models = headerIdx === -1 ? [] : lines.slice(headerIdx + 1).map((line) => {
    const parts = line.split(/\s{2,}/).map(s => s.trim());
    return { id: parts[0], size: parts[1] || '', modified: parts[2] || '' };
  });

  return { dir, models };
}

async function listModels() {
  if (!isInstalled()) return { dir: null, models: [] };
  const { stdout } = await execFileP(CLI_PATH, ['list']);
  return parseListOutput(stdout);
}

const OPEN_COMMAND = { win32: 'explorer', darwin: 'open' }[process.platform] || 'xdg-open';

async function openModelsFolder() {
  const { dir } = await listModels();
  if (!dir) throw Object.assign(new Error('Models directory not found'), { code: 'NOT_FOUND' });
  spawn(OPEN_COMMAND, [dir], { detached: true }).unref();
  return { dir };
}

function importModel({ repo, file, name }) {
  if (!isInstalled()) throw Object.assign(new Error('litert-lm is not installed'), { code: 'NOT_INSTALLED' });
  if (importJob?.status === 'running') {
    throw Object.assign(new Error('An import is already in progress'), { code: 'IMPORT_BUSY' });
  }
  if (!file) throw Object.assign(new Error('file is required'), { code: 'INVALID_INPUT' });
  for (const [k, v] of Object.entries({ repo, file, name })) {
    if (v && !SAFE_TOKEN.test(v)) throw Object.assign(new Error(`Invalid ${k}`), { code: 'INVALID_INPUT' });
  }

  const args = ['import'];
  if (repo) args.push('--from-huggingface-repo', repo);
  args.push(file);
  if (name) args.push(name);

  importJob = { repo, file, name, status: 'running', log: [], error: null };
  const job = importJob;
  const proc = spawn(CLI_PATH, args, HIDDEN);

  proc.stdout.on('data', d => job.log.push(d.toString()));
  proc.stderr.on('data', d => job.log.push(d.toString()));
  proc.on('exit', (code) => {
    job.status = code === 0 ? 'done' : 'error';
    if (code !== 0) job.error = job.log.slice(-5).join('') || `Exit code ${code}`;
  });
  proc.on('error', (err) => {
    job.status = 'error';
    job.error = err.message;
  });

  return { status: 'started' };
}

async function deleteModel(modelId) {
  if (!SAFE_TOKEN.test(modelId)) throw Object.assign(new Error('Invalid model id'), { code: 'INVALID_INPUT' });
  await execFileP(CLI_PATH, ['delete', modelId]);
}

module.exports = {
  start, stop, getStatus, listModels, importModel, deleteModel, openModelsFolder, BASE_URL,
  VENV_DIR, CLI_PATH,
};
