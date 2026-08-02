// Provisions the local litert-lm CLI into server/ai/litert/venv if it isn't
// there yet, so a fresh clone gets the bundled "paperr AI Server" without a
// manual setup step. Runs via npm's postinstall — see server/package.json.
// Never fails the install: if no system Python is found, or the install
// itself fails, paperr just runs without this optional feature (the UI
// already shows "Not available on this machine yet." in that case).
const { execSync } = require('child_process');
const path = require('path');
const { VENV_DIR, CLI_PATH } = require('../ai/litertSupervisor');

const LITERT_LM_VERSION = '0.14.0';
const PYTHON_CANDIDATES = process.platform === 'win32' ? ['py -3', 'python'] : ['python3', 'python'];

function findPython() {
  for (const cmd of PYTHON_CANDIDATES) {
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore' });
      return cmd;
    } catch { /* try next candidate */ }
  }
  return null;
}

function main() {
  const fs = require('fs');
  if (fs.existsSync(CLI_PATH)) {
    console.log('[litert-lm] already set up, skipping.');
    return;
  }

  const python = findPython();
  if (!python) {
    console.warn('[litert-lm] no Python interpreter found on PATH — skipping bundled AI server setup. Install Python 3 and re-run `npm install` in server/ to enable it later.');
    return;
  }

  const venvPython = process.platform === 'win32'
    ? path.join(VENV_DIR, 'Scripts', 'python.exe')
    : path.join(VENV_DIR, 'bin', 'python');

  try {
    console.log(`[litert-lm] creating venv at ${VENV_DIR}...`);
    execSync(`${python} -m venv "${VENV_DIR}"`, { stdio: 'inherit' });

    console.log(`[litert-lm] installing litert-lm==${LITERT_LM_VERSION}...`);
    execSync(`"${venvPython}" -m pip install --quiet litert-lm==${LITERT_LM_VERSION}`, { stdio: 'inherit' });

    console.log('[litert-lm] setup complete.');
  } catch (err) {
    console.warn(`[litert-lm] setup failed (${err.message}) — the bundled AI server won't be available. This doesn't block the rest of the install.`);
  }
}

main();
