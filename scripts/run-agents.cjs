/**
 * paperr — trigger the 5 pre-built proactive agents for the demo space.
 * Split out from the screenshot run so it can be executed inside a short
 * fixed-system-clock window (agent text embeds the server's date).
 *
 *   node scripts/run-agents.cjs
 */
const BASE = 'http://localhost:5173';
const AGENTS = ['morning_brief', 'priority', 'workload', 'reschedule', 'bulletin_board'];

(async () => {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'maya', password: 'paperrdemo1' }),
  });
  if (!login.ok) throw new Error('login failed ' + login.status);
  const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  const { spaces } = await login.json();
  const sp = (spaces.find((s) => /Miller/i.test(s.name)) || spaces[0]).id;

  for (const a of AGENTS) {
    try {
      const r = await fetch(`${BASE}/api/agent-insights/prebuilt/${a}/run`, {
        method: 'POST', headers: { cookie, 'X-Space-Id': String(sp) },
      });
      console.log(`  ${a}: ${r.status}`);
    } catch (e) { console.log(`  ${a}: ${e.message}`); }
  }
})().catch((e) => { console.error(e); process.exit(1); });
