const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const config = require('../config');
require('../actions');
const { createRuntime } = require('../runtime');
const { createApp } = require('../app');

function testLayout() {
  return {
    schemaVersion: 2,
    grid: { cols: 3, rows: 3 },
    root: 'folder-root',
    folders: {
      'folder-root': {
        name: 'Home',
        keys: {
          '0,0': { context: 'ctx-1', action: 'com.streamdeck.system.launchApp', settings: { appId: 'spotify' }, state: 0, title: 'Spotify', icon: 'spotify', color: 'spotify' },
        },
      },
    },
  };
}

async function startServer() {
  const layoutPath = path.join(os.tmpdir(), `layout-test-${Date.now()}-${Math.random()}.json`);
  const runtime = createRuntime(testLayout());
  const app = createApp(runtime, { layoutPath });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  return {
    port,
    layoutPath,
    close: () => new Promise((resolve) => {
      runtime.setVisibleContexts([]);
      server.close(resolve);
    }),
  };
}

test('GET /layout rejects a request without a valid pairing token', async (t) => {
  const { port, close } = await startServer();
  t.after(close);

  const res = await fetch(`http://127.0.0.1:${port}/layout`);
  assert.equal(res.status, 401);
});

test('GET /layout returns the current layout document for a valid pairing token', async (t) => {
  const { port, close } = await startServer();
  t.after(close);

  const res = await fetch(`http://127.0.0.1:${port}/layout?token=${config.pairingToken}`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.schemaVersion, 2);
  assert.ok(body.folders['folder-root'].keys['0,0']);
});

test('GET /actions returns the registered action list for a valid pairing token', async (t) => {
  const { port, close } = await startServer();
  t.after(close);

  const res = await fetch(`http://127.0.0.1:${port}/actions?token=${config.pairingToken}`);
  assert.equal(res.status, 200);
  const actions = await res.json();
  assert.ok(actions.some((a) => a.uuid === 'com.streamdeck.system.launchApp'));
  assert.ok(actions.some((a) => a.uuid === 'com.streamdeck.audio.devices'));
});

test('POST /layout rejects a request without a valid pairing token', async (t) => {
  const { port, close } = await startServer();
  t.after(close);

  const res = await fetch(`http://127.0.0.1:${port}/layout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testLayout()),
  });
  assert.equal(res.status, 401);
});

test('POST /layout with a valid token persists a valid layout', async (t) => {
  const { port, close, layoutPath } = await startServer();
  t.after(close);
  t.after(() => { try { fs.unlinkSync(layoutPath); } catch { /* not written */ } });

  const next = testLayout();
  next.folders['folder-root'].keys['1,0'] = {
    context: 'ctx-2', action: 'com.streamdeck.system.action', settings: { action: 'lock' }, state: 0, title: 'Lock',
  };

  const res = await fetch(`http://127.0.0.1:${port}/layout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.pairingToken}` },
    body: JSON.stringify(next),
  });
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(fs.readFileSync(layoutPath, 'utf8')).folders['folder-root'].keys['1,0'].title, 'Lock');
});

test('POST /layout rejects an invalid layout and leaves the previous layout in place', async (t) => {
  const { port, close, layoutPath } = await startServer();
  t.after(close);
  t.after(() => { try { fs.unlinkSync(layoutPath); } catch { /* not written */ } });

  const invalid = testLayout();
  invalid.folders['folder-root'].keys['9,9'] = {
    context: 'ctx-bad', action: 'com.streamdeck.system.launchApp', settings: { appId: 'x' }, state: 0,
  };

  const res = await fetch(`http://127.0.0.1:${port}/layout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.pairingToken}` },
    body: JSON.stringify(invalid),
  });
  assert.equal(res.status, 400);
  assert.equal(fs.existsSync(layoutPath), false);
});
