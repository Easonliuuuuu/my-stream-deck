// End-to-end UI checks driven by a real browser (Playwright) against the
// actual server + client, rather than mocked DOM. Pairing is bypassed by
// unhiding #app directly and seeding window.state (see app.js's testability
// hook) with a fake layout — window.renderGrid/applyNowPlaying/etc are plain
// top-level functions in a non-module script, so they're reachable as
// window.fn from the page context.
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

const DEFAULT_LAYOUT = {
  schemaVersion: 2,
  grid: { cols: 3, rows: 3 },
  root: 'folder-root',
  folders: {
    'folder-root': {
      name: 'Home',
      keys: {
        '0,0': { context: 'ctx-audio', action: 'com.streamdeck.core.openPanel', settings: { panelOf: 'com.streamdeck.audio.devices' }, state: 0, title: 'Audio', icon: 'audio', color: 'audio' },
        '1,0': { context: 'ctx-controller', action: 'com.streamdeck.core.openPanel', settings: { panelOf: 'com.streamdeck.controller.battery' }, state: 0, title: 'Controller', icon: 'controller', color: 'controller' },
        '2,0': { context: 'ctx-performance', action: 'com.streamdeck.core.openPanel', settings: { panelOf: 'com.streamdeck.system.load' }, state: 0, title: 'Performance', icon: 'performance', color: 'performance' },
        '0,1': { context: 'ctx-spotify', action: 'com.streamdeck.system.launchApp', settings: { appId: 'spotify' }, state: 0, title: 'Spotify', icon: 'spotify', color: 'spotify' },
      },
    },
  },
};

const DEFAULT_ACTIONS = [
  { uuid: 'com.streamdeck.audio.devices', name: 'Audio Devices', icon: 'audio', settingsSchema: {} },
  { uuid: 'com.streamdeck.controller.battery', name: 'Controller Battery', icon: 'controller', settingsSchema: {} },
  { uuid: 'com.streamdeck.system.load', name: 'Performance', icon: 'performance', settingsSchema: {} },
  { uuid: 'com.streamdeck.system.launchApp', name: 'Launch App', icon: 'launch', settingsSchema: { appId: { type: 'text' } } },
];

async function newAppPage(viewport) {
  const page = await browser.newPage({ viewport });
  await page.goto(BASE_URL);
  await page.evaluate(({ layout, actions }) => {
    document.getElementById('pin-screen').hidden = true;
    document.getElementById('app-backdrop').hidden = false;
    document.getElementById('app').hidden = false;
    window.state.layout = layout;
    window.state.currentFolderId = layout.root;
    window.state.folderStack = [];
    window.state.actions = actions;
    window.renderGrid();
  }, { layout: DEFAULT_LAYOUT, actions: DEFAULT_ACTIONS });
  return page;
}

function fakeDevices(n, prefix) {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}`, name: `${prefix} ${i}` }));
}

async function openPanelWithFakeData(page, { context, actionUuid, title, widgets, data }) {
  await page.evaluate((panel) => { window.handlePanelMessage(panel); }, { context, actionUuid, title, widgets, data });
}

test('portrait: scrolling a long picker list does not scroll the document', async () => {
  const page = await newAppPage({ width: 390, height: 844 });
  await openPanelWithFakeData(page, {
    context: 'ctx-audio',
    actionUuid: 'com.streamdeck.audio.devices',
    title: 'Audio',
    widgets: [{ id: 'output', type: 'picker', label: 'Output', source: 'outputs', currentSource: 'currentOutput', onSelect: 'setOutput' }],
    data: { outputs: fakeDevices(25, 'Output'), currentOutput: null },
  });
  // The screen slides in over 320ms — wait for the transition to finish before
  // wheeling, otherwise the element is still off-screen and the scroll misses it.
  await page.waitForTimeout(350);

  await page.mouse.move(195, 400);
  await page.mouse.wheel(0, 5000);
  await page.waitForTimeout(150);

  const docScrollTop = await page.evaluate(() => document.scrollingElement.scrollTop);
  const innerScrollTop = await page.evaluate(
    () => document.querySelector('.stack[data-screen="panel"] .screen[data-id="panel"]').scrollTop
  );

  assert.equal(docScrollTop, 0, 'document should never scroll');
  assert.ok(innerScrollTop > 0, 'the screen container itself should have scrolled');
  await page.close();
});

test('landscape: scrolling a long picker list does not scroll the document', async () => {
  const page = await newAppPage({ width: 844, height: 390 });
  await openPanelWithFakeData(page, {
    context: 'ctx-audio',
    actionUuid: 'com.streamdeck.audio.devices',
    title: 'Audio',
    widgets: [{ id: 'output', type: 'picker', label: 'Output', source: 'outputs', currentSource: 'currentOutput', onSelect: 'setOutput' }],
    data: { outputs: fakeDevices(25, 'Output'), currentOutput: null },
  });
  await page.waitForTimeout(350);

  await page.mouse.move(700, 200);
  await page.mouse.wheel(0, 5000);
  await page.waitForTimeout(150);

  const docScrollTop = await page.evaluate(() => document.scrollingElement.scrollTop);
  const innerScrollTop = await page.evaluate(
    () => document.querySelector('.grid-panel[data-screen="panel"] .grid-screen[data-id="panel"] .detail-inner').scrollTop
  );

  assert.equal(docScrollTop, 0, 'document should never scroll');
  assert.ok(innerScrollTop > 0, 'the detail-inner container itself should have scrolled');
  await page.close();
});

test('portrait: home grid opens a panel (server round-trip) and returns home', async () => {
  const page = await newAppPage({ width: 390, height: 844 });

  // Panels need live data from the server, so tapping the key sends a real
  // command; stub the transport to reply synchronously rather than pairing
  // for real, same spirit as bypassing #pin-screen above.
  await page.evaluate(() => {
    window.state.ws = {
      readyState: WebSocket.OPEN,
      send: (raw) => {
        const msg = JSON.parse(raw);
        if (msg.type === 'command' && msg.action === 'openPanel') {
          window.handlePanelMessage({ context: msg.context, actionUuid: 'com.streamdeck.audio.devices', title: 'Audio', widgets: [], data: {} });
        }
      },
    };
  });

  await page.click('.app.audio');
  assert.equal(await page.getAttribute('#stack', 'data-screen'), 'panel');

  await page.click('.screen[data-id="panel"] .back');
  assert.equal(await page.getAttribute('#stack', 'data-screen'), 'home');
  await page.close();
});

test('landscape: CPU/GPU/Now Focused readout fits the viewport without scrolling', async () => {
  const page = await newAppPage({ width: 844, height: 390 });
  await page.evaluate(() => { window.applySystemLoadChrome({ cpu: 40, gpu: 70, activeApp: 'Test' }); });

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
    window.applyNowPlaying({ title: 'A', artist: 'B', art: null, isPlaying: true });
  });
  assert.ok(await button.evaluate((el) => el.classList.contains('is-playing')));

  await page.evaluate(() => {
    window.applyNowPlaying({ title: 'A', artist: 'B', art: null, isPlaying: false });
  });
  assert.ok(!(await button.evaluate((el) => el.classList.contains('is-playing'))));
  await page.close();
});

test('a new trivial action requires zero client-side changes to render correctly', async () => {
  // Acceptance criterion for the whole change (see tasks.md 8.6): the client
  // must render a key bound to an action it has never seen before, purely
  // from server-declared metadata and pushed render state.
  const page = await newAppPage({ width: 390, height: 844 });
  await page.evaluate(() => {
    window.state.layout.folders['folder-root'].keys['2,1'] = {
      context: 'ctx-brand-new', action: 'com.example.brandNewThing', settings: {}, state: 0, title: 'New Thing', icon: 'default', color: 'default',
    };
    window.state.renders.set('ctx-brand-new', { subtitle: 'Hello from a new action' });
    window.renderGrid();
  });

  const label = await page.locator('.app.default .lbl').last().textContent();
  const sub = await page.locator('.app.default .sub').last().textContent();
  assert.equal(label, 'New Thing');
  assert.equal(sub, 'Hello from a new action');
  await page.close();
});
