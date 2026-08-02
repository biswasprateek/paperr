/**
 * paperr — short animated tours for the README.
 * Records Playwright video of a nav tour in desktop + phone layouts, then
 * converts each to an optimized GIF and an MP4 via ffmpeg.
 *
 *   node scripts/seed-demo.cjs
 *   node scripts/gifs.cjs
 *
 * Output: .github/screenshots/gifs/<name>.gif  and  .mp4
 */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const BASE = 'http://localhost:5173';
const OUT = path.join(__dirname, '..', '.github', 'screenshots', 'gifs');
const RAW = path.join(OUT, '_raw');
const USER = { username: 'maya', password: 'paperrdemo1' };

// ffmpeg from the winget install (not on PATH in this shell).
const FFMPEG = fs.existsSync('C:/Users/developer/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.2-full_build/bin/ffmpeg.exe')
  ? 'C:/Users/developer/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.2-full_build/bin/ffmpeg.exe'
  : 'ffmpeg';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 90% "browser zoom" — enlarge the CSS viewport so 10% more content fits and
// everything is 10% smaller (reliable, unlike CSS `zoom` on the desktop layout).
const ZOOM = 0.9;

// name, mode, viewport, list of [route, dwell-ms]
const TOURS = [
  {
    name: 'desktop-tour', mode: 'desktop', viewport: { width: 1440, height: 900 }, dsf: 1, touch: false, mobile: false, gifWidth: 1280,
    steps: [['/', 2200], ['/tasks', 1600], ['/calendar/month', 1600], ['/projects', 1500],
            ['/notebooks', 1500], ['/routines', 1500], ['/agents', 1800], ['/hub', 2200], ['/', 1200]],
  },
  {
    name: 'phone-tour', mode: 'phone', viewport: { width: 390, height: 844 }, dsf: 2, touch: true, mobile: true, gifWidth: 390,
    steps: [['/', 2200], ['/tasks', 1600], ['/calendar/month', 1600], ['/apps', 1600], ['/hub', 1800], ['/', 1200]],
  },
  {
    name: 'frame-fullscreen', mode: 'desktop', viewport: { width: 1440, height: 810 }, dsf: 1, touch: false, mobile: false, gifWidth: 900,
    // Stub requestFullscreen so the overlay renders as a full-viewport element
    // without the real Fullscreen API (which can flakily self-close in headless).
    // noZoom: the overlay is fixed inset-0 — a 10% zoom would leave a border.
    stubFullscreen: true, noZoom: true,
    steps: [['/frame', 4000]], // let collections + thumbnails load before starting
    action: async (page) => {
      await page.getByRole('button', { name: /Start Ambient Mode/i }).click().catch(() => {});
      // Don't start counting transitions until the playlist is actually in.
      await page.getByText(/Loading photos/i).waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
      await sleep(12000); // ~3 slide transitions at the 4s interval
    },
  },
];

async function record(browser, tour) {
  fs.mkdirSync(RAW, { recursive: true });
  const vp = tour.noZoom
    ? tour.viewport
    : { width: Math.round(tour.viewport.width / ZOOM), height: Math.round(tour.viewport.height / ZOOM) };
  const context = await browser.newContext({
    baseURL: BASE, viewport: vp, deviceScaleFactor: tour.dsf,
    hasTouch: tour.touch, isMobile: tour.mobile,
    recordVideo: { dir: RAW, size: vp },
  });
  await context.addInitScript(([m, sid]) => {
    localStorage.setItem('paperr_mode', m);
    localStorage.setItem('paperr_space_id', String(sid));
    localStorage.setItem('zipCode', JSON.stringify('11101'));
    localStorage.setItem('weather_coords', JSON.stringify({ lat: 40.7447, lon: -73.9485 }));
  }, [tour.mode, tour.spaceId]);
  if (tour.stubFullscreen) {
    await context.addInitScript(() => {
      Element.prototype.requestFullscreen = () => Promise.reject(new Error('stubbed'));
    });
  }
  await context.request.post('/api/auth/login', { data: USER });

  const page = await context.newPage();
  for (const [route, dwell] of tour.steps) {
    await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await sleep(dwell);
  }
  if (tour.action) await tour.action(page);
  await page.close();
  const video = page.video();
  const src = await video.path();
  await context.close(); // finalizes the webm
  return src;
}

function convert(webm, name, gifWidth) {
  const gif = path.join(OUT, `${name}.gif`);
  const mp4 = path.join(OUT, `${name}.mp4`);
  execFileSync(FFMPEG, ['-y', '-i', webm, '-movflags', '+faststart', '-pix_fmt', 'yuv420p',
    '-vf', `scale=${gifWidth}:-2`, mp4], { stdio: 'ignore' });
  execFileSync(FFMPEG, ['-y', '-i', webm, '-vf',
    `fps=15,scale=${gifWidth}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
    gif], { stdio: 'ignore' });
  console.log(`  ${name}.gif + .mp4`);
}

async function main() {
  const browser = await chromium.launch();
  // discover space id
  const boot = await browser.newContext({ baseURL: BASE });
  const login = await boot.request.post('/api/auth/login', { data: USER });
  const { spaces } = await login.json();
  const spaceId = (spaces.find((s) => s.name === 'The Miller Family') || spaces[0]).id;
  await boot.close();

  const only = process.env.ONLY_TOUR; // e.g. ONLY_TOUR=frame-fullscreen
  for (const tour of TOURS) {
    if (only && tour.name !== only) continue;
    tour.spaceId = spaceId;
    console.log(`Recording ${tour.name}...`);
    const webm = await record(browser, tour);
    convert(webm, tour.name, tour.gifWidth);
  }
  await browser.close();
  fs.rmSync(RAW, { recursive: true, force: true });
  console.log('\nDone → .github/screenshots/gifs/');
}

main().catch((e) => { console.error(e); process.exit(1); });
