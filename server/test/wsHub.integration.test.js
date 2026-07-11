const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const cp = require('child_process');
const path = require('path');
const WebSocket = require('ws');

const config = require('../config');
require('../actions');
const { createRuntime } = require('../runtime');
const wsHub = require('../wsHub');

function testLayout() {
  return {
    schemaVersion: 2,
    grid: { cols: 3, rows: 3 },
    root: 'folder-root',
    folders: {
      'folder-root': {
        name: 'Home',
        keys: {
          '0,0': { context: 'ctx-audio', action: 'com.streamdeck.core.openPanel', settings: { panelOf: 'com.streamdeck.audio.devices' }, state: 0, title: 'Audio' },
          '1,0': { context: 'ctx-spotify', action: 'com.streamdeck.system.launchApp', settings: { appId: 'spotify' }, state: 0, title: 'Spotify' },
          '2,0': { context: 'ctx-discord', action: 'com.streamdeck.system.launchApp', settings: { appId: 'discord' }, state: 0, title: 'Discord' },
          '0,1': { context: 'ctx-obs', action: 'com.streamdeck.obs.control', settings: { host: '127.0.0.1', port: '4455', password: 'x' }, state: 0, title: 'OBS' },
        },
      },
      'folder-sub': {
        name: 'Sub',
        keys: {
          '0,0': { context: 'ctx-perf', action: 'com.streamdeck.system.load', settings: {}, state: 0, title: 'Performance' },
        },
      },
    },
  };
}

// Fakes every PowerShell-backed capability by intercepting the one real OS
// boundary they all go through: cp.execFile.
function mockPowerShell(t, responses) {
  t.mock.method(cp, 'execFile', (_file, args, _opts, callback) => {
    const scriptName = path.basename(args[args.indexOf('-File') + 1]);
    const response = responses[scriptName];
    if (!response) return callback(new Error(`no mock configured for ${scriptName}`));
    if (response.error) return callback(new Error('mock error'), '', response.error);
    callback(null, JSON.stringify(response.json ?? {}), '');
  });
}

const DEFAULT_MOCKS = {
  'Get-AudioDevices.ps1': { json: { output: { current: 'Speakers', id: 'out-1' }, input: {}, outputs: [{ id: 'out-1', name: 'Speakers' }, { id: 'out-2', name: 'Headphones' }], inputs: [] } },
  'Get-NowPlaying.ps1': { json: {} },
  'Get-SystemLoad.ps1': { json: { cpu: 12, gpu: 34 } },
  'Get-AppStatus.ps1': { json: { running: false } },
};

async function startServer() {
  const server = http.createServer();
  const runtime = createRuntime(testLayout());
  const { stop } = wsHub.attach(server, runtime);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  return {
    port,
    runtime,
    async close() {
      stop();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

async function connectClient(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const received = [];
  ws.on('message', (raw) => received.push(JSON.parse(raw.toString())));
  await new Promise((resolve) => ws.on('open', resolve));

  function waitFor(predicate) {
    const existing = received.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timed out waiting for message')), 2000);
      const interval = setInterval(() => {
        const match = received.find(predicate);
        if (match) {
          clearTimeout(timeout);
          clearInterval(interval);
          resolve(match);
        }
      }, 10);
    });
  }

  return { ws, received, waitFor };
}

test('rejects an incorrect pairing token and does not send a snapshot', async (t) => {
  mockPowerShell(t, DEFAULT_MOCKS);
  const { port, close } = await startServer();
  t.after(close);

  const { ws, waitFor } = await connectClient(port);
  ws.send(JSON.stringify({ type: 'auth', token: 'wrong-token' }));

  const authReply = await waitFor((m) => m.type === 'auth');
  assert.equal(authReply.ok, false);
  ws.close();
});

test('accepts the correct pairing token and sends a full snapshot with the layout and renders', async (t) => {
  mockPowerShell(t, DEFAULT_MOCKS);
  const { port, close } = await startServer();
  t.after(close);

  const { ws, waitFor } = await connectClient(port);
  ws.send(JSON.stringify({ type: 'auth', token: config.pairingToken }));

  const authReply = await waitFor((m) => m.type === 'auth');
  assert.equal(authReply.ok, true);

  const snapshot = await waitFor((m) => m.type === 'snapshot');
  assert.equal(snapshot.payload.layout.schemaVersion, 2);
  assert.ok(Array.isArray(snapshot.payload.renders));
  assert.ok(snapshot.payload.renders.some((r) => r.context === 'ctx-spotify' && r.title === 'Spotify'));

  ws.close();
});

test('ignores commands sent before authentication', async (t) => {
  mockPowerShell(t, DEFAULT_MOCKS);
  const { port, close } = await startServer();
  t.after(close);

  const { ws, received } = await connectClient(port);
  ws.send(JSON.stringify({ type: 'command', action: 'keyDown', context: 'ctx-spotify' }));
  await new Promise((resolve) => setTimeout(resolve, 200));

  assert.equal(received.length, 0);
  ws.close();
});

test('returns a clean error for an unknown message type without dropping the connection', async (t) => {
  mockPowerShell(t, DEFAULT_MOCKS);
  const { port, close } = await startServer();
  t.after(close);

  const { ws, waitFor } = await connectClient(port);
  ws.send(JSON.stringify({ type: 'auth', token: config.pairingToken }));
  await waitFor((m) => m.type === 'auth');
  await waitFor((m) => m.type === 'snapshot');

  ws.send(JSON.stringify({ type: 'bogus' }));
  const errorReply = await waitFor((m) => m.type === 'error');
  assert.match(errorReply.message, /Unknown message type/);
  assert.equal(ws.readyState, WebSocket.OPEN);
  ws.close();
});

test('keyDown on a launchApp key triggers Launch-App.ps1 with the app\'s process name and path', async (t) => {
  let launchArgs = null;
  t.mock.method(cp, 'execFile', (_file, args, _opts, callback) => {
    const scriptName = path.basename(args[args.indexOf('-File') + 1]);
    if (scriptName === 'Launch-App.ps1') {
      launchArgs = args;
      return callback(null, '{"ok":true}', '');
    }
    const mock = DEFAULT_MOCKS[scriptName];
    callback(null, JSON.stringify(mock ? mock.json : {}), '');
  });

  const { port, close } = await startServer();
  t.after(close);

  const { ws, waitFor } = await connectClient(port);
  ws.send(JSON.stringify({ type: 'auth', token: config.pairingToken }));
  await waitFor((m) => m.type === 'auth');
  await waitFor((m) => m.type === 'snapshot');

  ws.send(JSON.stringify({ type: 'command', action: 'keyDown', context: 'ctx-discord' }));
  await new Promise((resolve) => setTimeout(resolve, 100));

  assert.ok(launchArgs.includes('-ProcessName'));
  assert.ok(launchArgs.includes('Discord'));
  assert.ok(launchArgs.includes('--processStart Discord.exe'));
  ws.close();
});

test('keyDown on an unknown context returns a clean error', async (t) => {
  mockPowerShell(t, DEFAULT_MOCKS);
  const { port, close } = await startServer();
  t.after(close);

  const { ws, waitFor } = await connectClient(port);
  ws.send(JSON.stringify({ type: 'auth', token: config.pairingToken }));
  await waitFor((m) => m.type === 'auth');
  await waitFor((m) => m.type === 'snapshot');

  ws.send(JSON.stringify({ type: 'command', action: 'keyDown', context: 'ctx-does-not-exist' }));
  const errorReply = await waitFor((m) => m.type === 'error');
  assert.match(errorReply.message, /Unknown context/);
  ws.close();
});

test('openPanel returns live panel data for the panel-owning action', async (t) => {
  mockPowerShell(t, DEFAULT_MOCKS);
  const { port, close } = await startServer();
  t.after(close);

  const { ws, waitFor } = await connectClient(port);
  ws.send(JSON.stringify({ type: 'auth', token: config.pairingToken }));
  await waitFor((m) => m.type === 'auth');
  await waitFor((m) => m.type === 'snapshot');

  ws.send(JSON.stringify({ type: 'command', action: 'openPanel', context: 'ctx-audio' }));
  const panel = await waitFor((m) => m.type === 'panel');

  assert.equal(panel.actionUuid, 'com.streamdeck.audio.devices');
  assert.equal(panel.title, 'Audio');
  assert.equal(panel.data.currentOutput, 'out-1');
  assert.deepEqual(panel.data.outputs, [{ id: 'out-1', name: 'Speakers' }, { id: 'out-2', name: 'Headphones' }]);
  ws.close();
});

test('panelAction setOutput triggers Set-AudioDevice with the chosen id', async (t) => {
  let setAudioDeviceCalledWith = null;
  t.mock.method(cp, 'execFile', (_file, args, _opts, callback) => {
    const scriptName = path.basename(args[args.indexOf('-File') + 1]);
    if (scriptName === 'Set-AudioDevice.ps1') {
      setAudioDeviceCalledWith = args[args.indexOf('-Id') + 1];
      return callback(null, '{"ok":true}', '');
    }
    const mock = DEFAULT_MOCKS[scriptName];
    callback(null, JSON.stringify(mock ? mock.json : {}), '');
  });

  const { port, close } = await startServer();
  t.after(close);

  const { ws, waitFor } = await connectClient(port);
  ws.send(JSON.stringify({ type: 'auth', token: config.pairingToken }));
  await waitFor((m) => m.type === 'auth');
  await waitFor((m) => m.type === 'snapshot');

  ws.send(JSON.stringify({ type: 'command', action: 'panelAction', actionUuid: 'com.streamdeck.audio.devices', name: 'setOutput', payload: { id: 'out-2' } }));
  await new Promise((resolve) => setTimeout(resolve, 100));

  assert.equal(setAudioDeviceCalledWith, 'out-2');
  ws.close();
});

test('panelAction with a stale device id is refused and never reaches Set-AudioDevice', async (t) => {
  let setAudioDeviceCalled = false;
  t.mock.method(cp, 'execFile', (_file, args, _opts, callback) => {
    const scriptName = path.basename(args[args.indexOf('-File') + 1]);
    if (scriptName === 'Set-AudioDevice.ps1') {
      setAudioDeviceCalled = true;
      return callback(null, '{"ok":true}', '');
    }
    const mock = DEFAULT_MOCKS[scriptName];
    callback(null, JSON.stringify(mock ? mock.json : {}), '');
  });

  const { port, close } = await startServer();
  t.after(close);

  const { ws, waitFor } = await connectClient(port);
  ws.send(JSON.stringify({ type: 'auth', token: config.pairingToken }));
  await waitFor((m) => m.type === 'auth');
  await waitFor((m) => m.type === 'snapshot');
  // Warm the panel cache with the live device list (out-1/out-2 only).
  ws.send(JSON.stringify({ type: 'command', action: 'openPanel', context: 'ctx-audio' }));
  await waitFor((m) => m.type === 'panel');

  ws.send(JSON.stringify({ type: 'command', action: 'panelAction', actionUuid: 'com.streamdeck.audio.devices', name: 'setOutput', payload: { id: 'out-stale' } }));
  const errorReply = await waitFor((m) => m.type === 'error');
  assert.match(errorReply.message, /Unknown output device/);
  assert.equal(setAudioDeviceCalled, false);
  ws.close();
});

test('panelAction with a context re-pushes a fresh panel for that key (OBS toggle reflects immediately)', async (t) => {
  const { OBSWebSocket } = require('obs-websocket-js');
  let recording = false;
  t.mock.method(OBSWebSocket.prototype, 'connect', async () => {});
  t.mock.method(OBSWebSocket.prototype, 'call', async (request) => {
    if (request === 'ToggleRecord') { recording = !recording; return {}; }
    if (request === 'GetRecordStatus') return { outputActive: recording, outputPaused: false };
    if (request === 'GetStreamStatus') return { outputActive: false };
    return {};
  });
  t.mock.method(OBSWebSocket.prototype, 'disconnect', () => {});

  const { port, close } = await startServer();
  t.after(close);

  const { ws, waitFor } = await connectClient(port);
  ws.send(JSON.stringify({ type: 'auth', token: config.pairingToken }));
  await waitFor((m) => m.type === 'auth');
  await waitFor((m) => m.type === 'snapshot');

  ws.send(JSON.stringify({ type: 'command', action: 'panelAction', context: 'ctx-obs', actionUuid: 'com.streamdeck.obs.control', name: 'toggleRecord', payload: {} }));
  const panel = await waitFor((m) => m.type === 'panel' && m.context === 'ctx-obs');

  assert.equal(panel.data.recording, 'Recording');
  ws.close();
});

test('setVisibleContexts brings a key in a different folder into view and it starts rendering', async (t) => {
  mockPowerShell(t, DEFAULT_MOCKS);
  const { port, close } = await startServer();
  t.after(close);

  const { ws, waitFor } = await connectClient(port);
  ws.send(JSON.stringify({ type: 'auth', token: config.pairingToken }));
  await waitFor((m) => m.type === 'auth');
  await waitFor((m) => m.type === 'snapshot');

  ws.send(JSON.stringify({ type: 'command', action: 'setVisibleContexts', contexts: ['ctx-perf'] }));
  const render = await waitFor((m) => m.type === 'render' && m.context === 'ctx-perf');
  assert.equal(render.subtitle, 'CPU 12%');
  ws.close();
});

test('mediaKey command still triggers Send-MediaKey.ps1 (legacy transport-control path, unchanged)', async (t) => {
  let sentKey = null;
  t.mock.method(cp, 'execFile', (_file, args, _opts, callback) => {
    const scriptName = path.basename(args[args.indexOf('-File') + 1]);
    if (scriptName === 'Send-MediaKey.ps1') {
      sentKey = args[args.indexOf('-Key') + 1];
      return callback(null, '{"ok":true}', '');
    }
    const mock = DEFAULT_MOCKS[scriptName];
    callback(null, JSON.stringify(mock ? mock.json : {}), '');
  });

  const { port, close } = await startServer();
  t.after(close);

  const { ws, waitFor } = await connectClient(port);
  ws.send(JSON.stringify({ type: 'auth', token: config.pairingToken }));
  await waitFor((m) => m.type === 'auth');
  await waitFor((m) => m.type === 'snapshot');

  ws.send(JSON.stringify({ type: 'command', action: 'mediaKey', key: 'PlayPause' }));
  await new Promise((resolve) => setTimeout(resolve, 100));

  assert.equal(sentKey, 'PlayPause');
  ws.close();
});

test('renders reach only authenticated clients', async (t) => {
  mockPowerShell(t, DEFAULT_MOCKS);
  const { port, close } = await startServer();
  t.after(close);

  const unauthed = await connectClient(port);
  const authed = await connectClient(port);
  authed.ws.send(JSON.stringify({ type: 'auth', token: config.pairingToken }));
  await authed.waitFor((m) => m.type === 'auth');
  await authed.waitFor((m) => m.type === 'snapshot');

  authed.ws.send(JSON.stringify({ type: 'command', action: 'setVisibleContexts', contexts: ['ctx-perf'] }));
  await authed.waitFor((m) => m.type === 'render' && m.context === 'ctx-perf');

  assert.equal(unauthed.received.some((m) => m.type === 'render'), false);
  unauthed.ws.close();
  authed.ws.close();
});
