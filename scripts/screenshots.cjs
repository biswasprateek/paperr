/**
 * paperr — screenshot capture for README / docs.
 * Logs in as the seeded demo admin (see scripts/seed-demo.cjs), runs the
 * proactive agents so Home/Agent Hub have insight cards, then captures every
 * section in desktop / tablet / phone layouts.
 *
 *   node scripts/seed-demo.cjs      # first — seed the demo space
 *   node scripts/screenshots.cjs    # then — capture
 *
 * Output: .github/screenshots/<mode>/<name>.png
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const BASE = 'http://localhost:5173';
const OUT = path.join(__dirname, '..', '.github', 'screenshots');
const USER = { username: 'maya', password: 'paperrdemo1' };

const MODES = {
  desktop: { viewport: { width: 1440, height: 900 }, dsf: 2, touch: false, mobile: false },
  tablet:  { viewport: { width: 1280, height: 900 }, dsf: 2, touch: true,  mobile: false },
  phone:   { viewport: { width: 390,  height: 844 }, dsf: 3, touch: true,  mobile: true },
};

const AGENTS = ['morning_brief', 'priority', 'workload', 'reschedule', 'bulletin_board'];

// Render at 90% "browser zoom": enlarge the CSS viewport by 1/ZOOM and shrink
// the device scale by ZOOM. Net output resolution is unchanged, but 10% more
// content fits and everything is 10% smaller — with no empty margin (unlike
// CSS `zoom`, which the desktop layout ignores).
const ZOOM = 0.9;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Boot the SPA ONCE per context, waiting until the app chrome (a nav link to
// /tasks, present in every layout) is mounted — not the full-screen
// auth-loading spinner that made cold per-route loads shoot blank. Retries once.
async function bootApp(page) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    try {
      await page.waitForSelector('a[href="/tasks"]', { state: 'visible', timeout: 25000 });
      return true;
    } catch { /* still on the loading screen — retry the boot */ }
  }
  return false;
}

// Navigate WITHIN the already-booted SPA (no reload) so auth/space/socket stay
// warm and no page catches a cold-boot loading state. pushState + a popstate
// event is what drives React Router v6's history.
async function clientNav(page, route) {
  await page.evaluate((r) => {
    window.history.pushState({}, '', r);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, route);
}

// Wait for the route's data to land before shooting. Two networkidle passes
// with a gap catch the react-query burst that fires after the socket connects.
async function settle(page, heavy) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await sleep(1200);
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 8000 }).catch(() => {});
  await sleep(heavy ? 3000 : 2000);
}

async function main() {
  const browser = await chromium.launch();

  // ── log in once via API to discover the demo space + entity ids ────────────
  const boot = await browser.newContext({ baseURL: BASE });
  const login = await boot.request.post('/api/auth/login', { data: USER });
  if (!login.ok()) throw new Error('Login failed — did you run seed-demo.cjs? ' + login.status());
  const { spaces } = await login.json();
  const space = spaces.find((s) => s.name === 'The Miller Family') || spaces[0];
  const spaceId = space.id;
  const H = { 'X-Space-Id': String(spaceId) };

  const apiList = async (url) => {
    try {
      const r = await boot.request.get(url, { headers: H });
      if (!(r.headers()['content-type'] || '').includes('json')) return [];
      const j = await r.json();
      return Array.isArray(j) ? j : (j.projects || j.lists || j.notebooks || []);
    } catch { return []; }
  };
  const project = (await apiList('/api/projects')).find((p) => p.name === 'Kitchen Renovation');
  const groceries = (await apiList('/api/lists')).find((l) => l.name === 'Groceries');
  const notebook = (await apiList('/api/notes/notebooks'))[0];
  // A note to open, so the notebook screenshot shows a note (not just the list).
  // Prefer the recipe note — it's the most visually appealing / on-brand.
  const notes = notebook ? await apiList(`/api/notes/notebooks/${notebook.id}/notes`) : [];
  const note = notes.find((n) => /recipe/i.test(n.title)) || notes[0] || null;

  // ── run the proactive agents (best-effort; the LLM can be slow) ────────────
  console.log(process.env.SKIP_AGENTS ? 'Skipping agents (SKIP_AGENTS set).' : 'Running proactive agents (this can take a minute)...');
  for (const a of (process.env.SKIP_AGENTS ? [] : AGENTS)) {
    try {
      const r = await boot.request.post(`/api/agent-insights/prebuilt/${a}/run`, { headers: H, timeout: 120000 });
      console.log(`  ${a}: ${r.status()}`);
    } catch (e) { console.log(`  ${a}: ${e.message}`); }
  }

  // ── best-effort curated Frame art so /frame isn't empty ────────────────────
  try {
    // Skip if a collection with photos already exists — re-importing spawns a
    // fresh duplicate collection every run.
    const existing = await apiList('/api/frame/collections');
    const already = existing.length > 0;
    const sets = already ? [] : await (await boot.request.get('/api/frame/curated-sets', { headers: H })).json();
    if (Array.isArray(sets) && sets.length) {
      const key = sets[0].key;
      const imp = await boot.request.post(`/api/frame/curated-sets/${key}/import`, { headers: H });
      const body = await imp.json().catch(() => ({}));
      const collId = body.id || body.collectionId;
      for (let i = 0; i < 20 && collId; i++) {
        const st = await (await boot.request.get(`/api/frame/collections/${collId}/import-status`, { headers: H })).json();
        if (st.status !== 'running') break;
        await sleep(1500);
      }
      console.log('  frame curated import: attempted');
    }
  } catch (e) { console.log('  frame import skipped:', e.message); }

  await boot.close();

  // routes: [name, path]
  const routes = [
    ['home', '/'],
    ['hub', '/hub'],
    ['tasks', '/tasks'],
    ['lists', '/lists'],
    ...(groceries ? [['list-detail', `/lists/${groceries.id}`]] : []),
    ['projects', '/projects'],
    ...(project ? [['project-detail', `/projects/${project.id}`]] : []),
    ['calendar', '/calendar/month'],
    ['calendar-week', '/calendar/week'],
    ['notebooks', '/notebooks'],
    ...(notebook && note ? [['notebook-detail', `/notebooks/${notebook.id}/${note.id}`]]
      : notebook ? [['notebook-detail', `/notebooks/${notebook.id}`]] : []),
    ['routines', '/routines'],
    ['apps', '/apps'],
    ['frame', '/frame'],
    ['agents', '/agents'],
    ['analytics', '/analytics'],
    ['settings', '/settings'],
    // Last: starts the fullscreen ambient overlay, which then persists.
    ['frame-ambient', '/frame'],
  ];

  // Per-page tweaks applied after load, before the shot.
  const actions = {
    // The Home board is a horizontal page-snap; a widget's auto-scroll (the
    // Today agenda seeking "now") can drift it onto a later page + scroll down.
    // Reset to the first page and the top before shooting.
    home: async (page) => {
      await page.evaluate(() => {
        document.querySelectorAll('.snap-x-page').forEach((el) => el.scrollTo({ left: 0 }));
        window.scrollTo(0, 0);
        document.querySelectorAll('*').forEach((el) => { if (el.scrollTop > 0 && el.scrollHeight > el.clientHeight) el.scrollTop = 0; });
      });
      await sleep(500);
    },
    // Hub's "Our Calendar" defaults to Today; show the Week range instead.
    // (Local widget state — does not persist to the curated board.)
    hub: async (page) => {
      await page.getByText('Week', { exact: true }).first().click({ timeout: 4000 }).catch(() => {});
      await sleep(1000);
    },
    // Start Frame's fullscreen ambient slideshow, then shoot the overlay.
    // Stub requestFullscreen so the fixed-inset overlay fills the frame without
    // the real Fullscreen API (which can flakily self-close in headless).
    'frame-ambient': async (page) => {
      await page.evaluate(() => { Element.prototype.requestFullscreen = () => Promise.reject(new Error('stub')); });
      await page.getByRole('button', { name: /Start Ambient Mode/i }).click({ timeout: 5000 }).catch(() => {});
      await page.getByText(/Loading photos/i).waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
      await sleep(9000); // advance past the collection title card onto an actual artwork
    },
  };

  const only = process.env.ONLY_MODE ? process.env.ONLY_MODE.split(',') : null; // e.g. ONLY_MODE=tablet,phone
  for (const [mode, cfg] of Object.entries(MODES)) {
    if (only && !only.includes(mode)) continue;
    const dir = path.join(OUT, mode);
    fs.mkdirSync(dir, { recursive: true });

    const context = await browser.newContext({
      baseURL: BASE,
      viewport: { width: Math.round(cfg.viewport.width / ZOOM), height: Math.round(cfg.viewport.height / ZOOM) },
      deviceScaleFactor: +(cfg.dsf * ZOOM).toFixed(3),
      hasTouch: cfg.touch,
      isMobile: cfg.mobile,
    });
    // Pin the clock the browser sees (flip Clock, greeting, "today" grouping,
    // relative timestamps). FIXED_TIME=YYYY-MM-DDTHH:MM. Note: the server still
    // uses the real machine clock, so agent-card text/date isn't affected here.
    if (process.env.FIXED_TIME) {
      await context.clock.install({ time: new Date(process.env.FIXED_TIME) });
    }
    // Seed localStorage before the app boots: force layout mode + active space.
    const theme = process.env.THEME || null; // 'dark' | 'light' — suffixes the filename
    await context.addInitScript(([m, sid, th]) => {
      localStorage.setItem('paperr_mode', m);
      localStorage.setItem('paperr_space_id', String(sid));
      // Location — zip 11101 (Long Island City, NY). Seed the coords cache so
      // weather renders without geolocation / a network geocode round-trip.
      localStorage.setItem('zipCode', JSON.stringify('11101'));
      localStorage.setItem('weather_coords', JSON.stringify({ lat: 40.7447, lon: -73.9485 }));
      if (th) localStorage.setItem('theme', JSON.stringify(th));
    }, [mode, spaceId, theme]);
    await context.request.post('/api/auth/login', { data: USER });

    const page = await context.newPage();
    if (!(await bootApp(page))) console.log(`  [${mode}] app failed to boot`);
    await settle(page, true);

    const onlyRoutes = process.env.ONLY_ROUTES ? process.env.ONLY_ROUTES.split(',') : null; // e.g. ONLY_ROUTES=frame-ambient
    for (const [name, route] of routes) {
      if (onlyRoutes && !onlyRoutes.includes(name)) continue;
      try {
        await clientNav(page, route);
        const heavy = ['agents', 'analytics', 'home', 'hub'].includes(name);
        await settle(page, heavy);
        if (actions[name]) await actions[name](page);
        await page.screenshot({ path: path.join(dir, `${name}${theme ? `-${theme}` : ''}.png`) });
        console.log(`  [${mode}] ${name}`);
      } catch (e) {
        console.log(`  [${mode}] ${name} FAILED: ${e.message}`);
      }
    }
    await context.close();
  }

  await browser.close();
  console.log('\nDone → .github/screenshots/');
}

main().catch((e) => { console.error(e); process.exit(1); });
