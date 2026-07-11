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

test('panel button widget sends a panelAction command with its context, actionUuid, and action name', async () => {
  const page = await newAppPage({ width: 390, height: 844 });

  await page.evaluate(() => {
    window.state.ws = {
      readyState: WebSocket.OPEN,
      send: (raw) => { window.__sent.push(JSON.parse(raw)); },
    };
    window.__sent = [];
  });

  await openPanelWithFakeData(page, {
    context: 'ctx-obs',
    actionUuid: 'com.streamdeck.obs.control',
    title: 'OBS Studio',
    widgets: [
      { id: 'recording', type: 'row', label: 'Recording', source: 'recording' },
      { id: 'toggleRecord', type: 'button', label: 'Start / Stop Recording', action: 'toggleRecord' },
    ],
    data: { recording: 'Stopped' },
  });
  await page.waitForTimeout(350);

  await page.click('.screen[data-id="panel"] .panel-btn');
  const sentMessages = await page.evaluate(() => window.__sent);
  const command = sentMessages.find((m) => m.type === 'command' && m.action === 'panelAction');

  assert.ok(command, 'expected a panelAction command to have been sent');
  assert.equal(command.context, 'ctx-obs');
  assert.equal(command.actionUuid, 'com.streamdeck.obs.control');
  assert.equal(command.name, 'toggleRecord');
  await page.close();
});

test('a button widget with style:"danger" renders with the danger class for destructive actions', async () => {
  const page = await newAppPage({ width: 390, height: 844 });

  await openPanelWithFakeData(page, {
    context: 'ctx-discord-ctl',
    actionUuid: 'com.streamdeck.discord.control',
    title: 'Discord',
    widgets: [
      { id: 'close', type: 'button', label: 'Close Discord', action: 'close', style: 'danger' },
      { id: 'launch', type: 'button', label: 'Launch / Focus', action: 'launch' },
    ],
    data: {},
  });
  await page.waitForTimeout(350);

  const buttons = page.locator('.screen[data-id="panel"] .panel-btn');
  assert.equal(await buttons.count(), 2);
  assert.ok(await buttons.nth(0).evaluate((el) => el.classList.contains('panel-btn-danger')));
  assert.ok(!(await buttons.nth(1).evaluate((el) => el.classList.contains('panel-btn-danger'))));
  await page.close();
});

test('Discord panel renders its status row and all three buttons without horizontal overflow', async () => {
  const page = await newAppPage({ width: 390, height: 844 });

  await openPanelWithFakeData(page, {
    context: 'ctx-discord-ctl',
    actionUuid: 'com.streamdeck.discord.control',
    title: 'Discord',
    widgets: [
      { id: 'status', type: 'row', label: 'Status', source: 'status' },
      { id: 'launch', type: 'button', label: 'Launch / Focus', action: 'launch' },
      { id: 'toggleMute', type: 'button', label: 'Toggle Mute', action: 'toggleMute' },
      { id: 'close', type: 'button', label: 'Close Discord', action: 'close', style: 'danger' },
    ],
    data: { status: 'Running' },
  });
  await page.waitForTimeout(350);

  const panelBody = page.locator('.screen[data-id="panel"] .panel-body');
  assert.equal(await panelBody.locator('.d-row .v').textContent(), 'Running');
  const buttons = panelBody.locator('.panel-btn');
  assert.equal(await buttons.count(), 3);
  assert.deepEqual(await buttons.allTextContents(), ['Launch / Focus', 'Toggle Mute', 'Close Discord']);
  assert.ok(await buttons.nth(2).evaluate((el) => el.classList.contains('panel-btn-danger')));

  // The rows/buttons live in one shared card (matching the OBS/Performance
  // layout), so it should never be wider than the screen — a stray
  // fixed-width child in a new widget combo is the kind of thing that would
  // silently blow this out.
  const overflowsHorizontally = await page.evaluate(
    () => document.scrollingElement.scrollWidth > document.scrollingElement.clientWidth
  );
  assert.equal(overflowsHorizontally, false);
  await page.close();
});

test('Steam panel renders both status rows and both buttons', async () => {
  const page = await newAppPage({ width: 390, height: 844 });

  await openPanelWithFakeData(page, {
    context: 'ctx-steam-ctl',
    actionUuid: 'com.streamdeck.steam.control',
    title: 'Steam',
    widgets: [
      { id: 'status', type: 'row', label: 'Status', source: 'status' },
      { id: 'currentGame', type: 'row', label: 'Now Playing', source: 'currentGame' },
      { id: 'launch', type: 'button', label: 'Launch / Focus', action: 'launch' },
      { id: 'close', type: 'button', label: 'Close Steam', action: 'close', style: 'danger' },
    ],
    data: { status: 'Running', currentGame: 'Half-Life 3' },
  });
  await page.waitForTimeout(350);

  const panelBody = page.locator('.screen[data-id="panel"] .panel-body');
  const rowValues = await panelBody.locator('.d-row .v').allTextContents();
  assert.deepEqual(rowValues, ['Running', 'Half-Life 3']);
  const buttons = panelBody.locator('.panel-btn');
  assert.equal(await buttons.count(), 2);
  assert.deepEqual(await buttons.allTextContents(), ['Launch / Focus', 'Close Steam']);
  await page.close();
});

test('a server-pushed error shows a dismissible on-screen toast, not just a console log', async () => {
  const page = await newAppPage({ width: 390, height: 844 });

  await page.evaluate(() => { window.showErrorToast('Set a mute hotkey in this key\'s settings'); });
  const toast = page.locator('#error-toast');
  assert.equal(await toast.isHidden(), false);
  assert.equal(await toast.textContent(), 'Set a mute hotkey in this key\'s settings');

  await page.waitForTimeout(4300);
  assert.equal(await toast.isHidden(), true);
  await page.close();
});

test('a key bound directly to an action with its own panel (no Open Panel indirection) opens that panel', async () => {
  const page = await newAppPage({ width: 390, height: 844 });

  await page.evaluate(() => {
    window.state.layout.folders['folder-root'].keys['2,1'] = {
      context: 'ctx-obs', action: 'com.streamdeck.obs.control', settings: { host: '127.0.0.1' }, state: 0, title: 'OBS', icon: 'obs', color: 'obs',
    };
    window.state.actions.push({ uuid: 'com.streamdeck.obs.control', name: 'OBS Studio', icon: 'obs', settingsSchema: { host: { type: 'text' } }, panel: { title: 'OBS Studio' } });
    window.renderGrid();
    window.state.ws = {
      readyState: WebSocket.OPEN,
      send: (raw) => {
        const msg = JSON.parse(raw);
        if (msg.type === 'command' && msg.action === 'openPanel') {
          window.handlePanelMessage({ context: msg.context, actionUuid: 'com.streamdeck.obs.control', title: 'OBS Studio', widgets: [], data: {} });
        }
      },
    };
  });

  await page.click('.app.obs');
  assert.equal(await page.getAttribute('#stack', 'data-screen'), 'panel');
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

test('applyNowPlaying renders real title/artist text and a sniffed-mime art background', async () => {
  // Regression test: applyNowPlaying was previously only ever exercised with
  // title/artist filled in but art: null, so a real base64 thumbnail (and
  // the hardcoded image/png mime guess) had zero coverage.
  const page = await newAppPage({ width: 390, height: 844 });
  const jpegBase64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wA=';

  await page.evaluate((art) => {
    window.applyNowPlaying({ title: 'Song Title', artist: 'The Artist', art, isPlaying: true });
  }, jpegBase64);

  const title = await page.locator('.track-title').first().textContent();
  const artist = await page.locator('.track-artist').first().textContent();
  const bg = await page.locator('.art').first().evaluate((el) => el.style.backgroundImage);

  assert.equal(title, 'Song Title');
  assert.equal(artist, 'The Artist');
  assert.ok(bg.includes('data:image/jpeg;base64'), `expected a jpeg data URI, got: ${bg}`);
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

test('a render push for one key patches its DOM node in place instead of rebuilding the grid', async () => {
  // Regression test: updateKeyRender used to be a full renderGrid() call on
  // every push, which recreated every key's button and replayed the
  // `.icon`'s key-boot entrance animation — reported as constant flickering
  // since audio/controller/performance poll every 1.5-4s. Tag every button
  // with a marker the real code never sets; if a node gets recreated instead
  // of patched, the marker is lost.
  const page = await newAppPage({ width: 390, height: 844 });

  await page.evaluate(() => {
    document.querySelectorAll('[data-context]').forEach((el) => { el.dataset.testMarker = 'untouched'; });
    window.state.renders.set('ctx-audio', { subtitle: 'Speakers' });
    window.updateKeyRender('ctx-audio');
  });

  const markers = await page.evaluate(() =>
    [...document.querySelectorAll('[data-context]')].map((el) => el.dataset.testMarker));
  assert.ok(markers.every((m) => m === 'untouched'), 'no key button should have been recreated by a single-context render push');

  const sub = await page.locator('[data-context="ctx-audio"] .sub').first().textContent();
  assert.equal(sub, 'Speakers');
  await page.close();
});
