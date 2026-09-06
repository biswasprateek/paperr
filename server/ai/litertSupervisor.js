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

// KV cache size comes from the LLM configuration row pointing at this server —
// Settings → AI → Context window — so the admin page stays the one place it is set.
// Takes effect on the next AI server start, since the cache is allocated at load.
const DEFAULT_KV_CACHE_TOKENS = 8192;

function kvCacheTokens() {
  try {
    // Required lazily: setupLiteRT.js pulls this module in at postinstall, when
    // there may be no database yet.
    const { getDb } = require('../db/db');
    const row = getDb().prepare(
      'SELECT context_window FROM llm_configurations WHERE base_url LIKE ? ORDER BY is_active DESC, id LIMIT 1'
    ).get(`%:${PORT}%`);
    return row?.context_window || DEFAULT_KV_CACHE_TOKENS;
  } catch {
    return DEFAULT_KV_CACHE_TOKENS; // no DB yet — fall back to the bundled default
  }
}

// `litert-lm serve` hardcodes the engine's KV cache to the model's own default
// (4096 tokens for gemma4-e2b) and exposes no flag for it, even though `run` and
// `benchmark` both take --max-num-tokens. 4096 is not enough for paperr's chat:
// the tool schemas alone are ~2900 tokens, so a single tool result tips the
// request over and the server answers 500 "Input token ids are too long".
// This rewrites that one hardcoded line to read an env var, which launch() sets.
//
// ponytail: patching a vendored file, re-checked on every start and a no-op once
// applied. If a future litert-lm reshapes serve_util.py the patch simply doesn't
// apply and we fall back to the model default.
const PRISTINE_KV_LINE = '\n  max_num_tokens = None\n';
const PATCHED_KV_LINE =
  '\n  max_num_tokens = int(__import__("os").environ.get("LITERT_LM_MAX_NUM_TOKENS") or 0) or None\n';

// site-packages sits at Lib/site-packages on Windows, lib/python3.x/site-packages elsewhere.
function serveUtilPath() {
  const libDir = path.join(VENV_DIR, process.platform === 'win32' ? 'Lib' : 'lib');
  const roots = process.platform === 'win32'
    ? [path.join(libDir, 'site-packages')]
    : (fs.existsSync(libDir) ? fs.readdirSync(libDir).map(d => path.join(libDir, d, 'site-packages')) : []);
  for (const root of roots) {
    const p = path.join(root, 'litert_lm_cli', 'commands', 'serve_util.py');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function ensureKvCachePatch() {
  const p = serveUtilPath();
  if (!p) return;
  try {
    const src = fs.readFileSync(p, 'utf8');
    if (src.includes('LITERT_LM_MAX_NUM_TOKENS')) return;   // already patched
    if (!src.includes(PRISTINE_KV_LINE)) {
      logger.info('[litert-lm] KV cache patch skipped — serve_util.py is not the expected shape');
      return;
    }
    fs.writeFileSync(p, src.replace(PRISTINE_KV_LINE, PATCHED_KV_LINE));
    logger.info('[litert-lm] patched serve_util.py — KV cache is now configurable');
  } catch (err) {
    logger.info(`[litert-lm] KV cache patch skipped: ${err.message}`);
  }
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

  ensureKvCachePatch();
  const self = spawn(CLI_PATH, ['serve', '--host', HOST, '--port', String(PORT)], {
    ...HIDDEN,
    env: { ...process.env, LITERT_LM_MAX_NUM_TOKENS: String(kvCacheTokens()) },
  });
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
