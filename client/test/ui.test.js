// End-to-end UI checks driven by a real browser (Playwright) against the
// actual server + client, rather than mocked DOM. Pairing is bypassed by
// unhiding #app directly and calling the page's own render* functions with
// fake data — they're plain top-level functions in a non-module script, so
// they're reachable as window.renderX from the page context.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const PORT = 8799;
const BASE_URL = `http://localhost:${PORT}`;

let serverProcess;
let browser;

function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      fetch(url).then((res) => {
        if (res.ok) resolve();
        else retry();
      }).catch(retry);
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) reject(new Error('server did not start in time'));
      else setTimeout(attempt, 200);
    };
    attempt();
  });
}

before(async () => {
  serverProcess = spawn(process.execPath, ['index.js'], {
    cwd: path.join(__dirname, '..', '..', 'server'),
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });
  await waitForServer(BASE_URL);
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  serverProcess?.kill();
});

const DEFAULT_KEYS = [
  { id: 'audio',       label: 'Audio',       icon: 'audio',       action: 'nav',    payload: 'audio',       color: 'audio' },
  { id: 'controller',  label: 'Controller',  icon: 'controller',  action: 'nav',    payload: 'controller',  color: 'controller' },
  { id: 'performance', label: 'Performance', icon: 'performance', action: 'nav',    payload: 'performance', color: 'performance' },
  { id: 'spotify',     label: 'Spotify',     icon: 'spotify',     action: 'launch', payload: 'spotify',     color: 'spotify' },
  { id: 'discord',     label: 'Discord',     icon: 'discord',     action: 'launch', payload: 'discord',     color: 'discord' },
  { id: 'steam',       label: 'Steam',       icon: 'steam',       action: 'launch', payload: 'steam',       color: 'steam' },
];

async function newAppPage(viewport) {
  const page = await browser.newPage({ viewport });
  await page.goto(BASE_URL);
  await page.evaluate((keys) => {
    document.getElementById('pin-screen').hidden = true;
    document.getElementById('app-backdrop').hidden = false;
    document.getElementById('app').hidden = false;
    // Populate the grid so tiles exist without a real server auth round-trip.
    window.renderKeyGrid(keys);
  }, DEFAULT_KEYS);
  return page;
}

function fakeDevices(n, prefix) {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}`, name: `${prefix} ${i}` }));
}

test('portrait: scrolling a long device list does not scroll the document', async () => {
  const page = await newAppPage({ width: 390, height: 844 });
  await page.evaluate(() => { document.getElementById('stack').dataset.screen = 'audio'; });
  await page.evaluate((devices) => {
    window.renderAudio({
      output: { current: 'X', id: 'o' },
      input: { current: 'Y', id: 'i' },
      outputs: devices,
      inputs: [],
    });
  }, fakeDevices(25, 'Output'));

  await page.mouse.move(195, 400);
  await page.mouse.wheel(0, 5000);
  await page.waitForTimeout(150);

  const docScrollTop = await page.evaluate(() => document.scrollingElement.scrollTop);
  const innerScrollTop = await page.evaluate(
    () => document.querySelector('.stack[data-screen="audio"] .screen[data-id="audio"]').scrollTop
  );

  assert.equal(docScrollTop, 0, 'document should never scroll');
  assert.ok(innerScrollTop > 0, 'the screen container itself should have scrolled');
  await page.close();
});

test('landscape: scrolling a long device list does not scroll the document', async () => {
  const page = await newAppPage({ width: 844, height: 390 });
  await page.evaluate(() => { document.querySelector('.grid-panel').dataset.screen = 'audio'; });
  await page.evaluate((devices) => {
    window.renderAudio({
      output: { current: 'X', id: 'o' },
      input: { current: 'Y', id: 'i' },
      outputs: devices,
      inputs: [],
    });
  }, fakeDevices(25, 'Output'));

  await page.mouse.move(700, 200);
  await page.mouse.wheel(0, 5000);
  await page.waitForTimeout(150);

  const docScrollTop = await page.evaluate(() => document.scrollingElement.scrollTop);
  const innerScrollTop = await page.evaluate(
    () => document.querySelector('.grid-panel[data-screen="audio"] .grid-screen[data-id="audio"] .detail-inner').scrollTop
  );

  assert.equal(docScrollTop, 0, 'document should never scroll');
  assert.ok(innerScrollTop > 0, 'the detail-inner container itself should have scrolled');
  await page.close();
});

test('portrait: home grid navigates to a detail screen and back', async () => {
  const page = await newAppPage({ width: 390, height: 844 });

  await page.click('.app.audio');
  assert.equal(await page.getAttribute('#stack', 'data-screen'), 'audio');

  await page.click('.screen[data-id="audio"] .back');
  assert.equal(await page.getAttribute('#stack', 'data-screen'), 'home');
  await page.close();
});

test('landscape: CPU/GPU/Now Focused readout fits the viewport without scrolling', async () => {
  const page = await newAppPage({ width: 844, height: 390 });
  await page.evaluate(() => { window.renderSystemLoad({ cpu: 40, gpu: 70, activeApp: 'Test' }); });

  const box = await page.locator('.system-card').boundingBox();
  const viewport = page.viewportSize();
  assert.ok(box, 'system-card should be present');
  assert.ok(
    box.y >= 0 && box.y + box.height <= viewport.height,
    'system-card should fit within the viewport without needing to scroll'
  );
  await page.close();
});

test('play/pause icon reflects actual playback state', async () => {
  const page = await newAppPage({ width: 390, height: 844 });
  const button = page.locator('[data-key="PlayPause"]').first();

  await page.evaluate(() => {
    window.renderNowPlaying({ title: 'A', artist: 'B', art: null, isPlaying: true });
  });
  assert.ok(await button.evaluate((el) => el.classList.contains('is-playing')));

  await page.evaluate(() => {
    window.renderNowPlaying({ title: 'A', artist: 'B', art: null, isPlaying: false });
  });
  assert.ok(!(await button.evaluate((el) => el.classList.contains('is-playing'))));
  await page.close();
});
