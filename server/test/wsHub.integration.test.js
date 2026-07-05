const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const cp = require('child_process');
const path = require('path');
const WebSocket = require('ws');

const config = require('../config');
const wsHub = require('../wsHub');

// Fakes every PowerShell-backed capability (audio, now-playing, media keys) by
// intercepting the one real OS boundary they all go through: cp.execFile.
// This lets the integration test exercise the full transport/auth/dispatch
// stack against a real HTTP+WebSocket server without needing PowerShell or
// AudioDeviceCmdlets installed on the machine running the tests.
function mockPowerShell(t, responses) {
  t.mock.method(cp, 'execFile', (_file, args, _opts, callback) => {
    const scriptName = path.basename(args[args.indexOf('-File') + 1]);
    const response = responses[scriptName];
    if (!response) return callback(new Error(`no mock configured for ${scriptName}`));
    if (response.error) return callback(new Error('mock error'), '', response.error);
    callback(null, JSON.stringify(response.json ?? {}), '');
  });
}

async function startServer() {
  const server = http.createServer();
  const { stop } = wsHub.attach(server);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  return {
    port,
    async close() {
      stop();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

// Connects and buffers every message from the moment the socket opens, so
// sequential `waitFor` calls can never miss a message that arrives in the
// same synchronous burst as an earlier one (e.g. the server sends the auth
// reply and the snapshot back-to-back in a single handler).
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
  mockPowerShell(t, {
    'Get-AudioDevices.ps1': { json: { output: {}, input: {}, outputs: [], inputs: [] } },
    'Get-NowPlaying.ps1': { json: {} },
    'Get-SystemLoad.ps1': { json: { cpu: 0, gpu: 0 } },
  });

  const { port, close } = await startServer();
  t.after(close);

  const { ws, waitFor } = await connectClient(port);
  ws.send(JSON.stringify({ type: 'auth', token: 'wrong-token' }));

  const authReply = await waitFor((m) => m.type === 'auth');
  assert.equal(authReply.ok, false);

  ws.close();
});

test('accepts the correct pairing token and sends a full snapshot', async (t) => {
  mockPowerShell(t, {
    'Get-AudioDevices.ps1': {
      json: { output: { current: 'Speakers', id: 'out-1' }, input: { current: 'Mic', id: 'in-1' }, outputs: [], inputs: [] },
    },
    'Get-NowPlaying.ps1': { json: { title: 'Song', artist: 'Artist', album: null, isPlaying: true, art: null } },
    'Get-SystemLoad.ps1': { json: { cpu: 12, gpu: 34 } },
  });

  const { port, close } = await startServer();
  t.after(close);

  const { ws, waitFor } = await connectClient(port);
  ws.send(JSON.stringify({ type: 'auth', token: config.pairingToken }));

  const authReply = await waitFor((m) => m.type === 'auth');
  assert.equal(authReply.ok, true);

  const snapshot = await waitFor((m) => m.type === 'snapshot');
  assert.equal(snapshot.payload.audio.output.current, 'Speakers');
  assert.equal(snapshot.payload.nowPlaying.title, 'Song');
  assert.equal(snapshot.payload.controller.connected, false); // no real DualSense in CI
  assert.deepEqual(snapshot.payload.systemLoad, { cpu: 12, gpu: 34 });

  ws.close();
});

test('ignores commands sent before authentication', async (t) => {
  mockPowerShell(t, {
    'Get-AudioDevices.ps1': { json: { output: {}, input: {}, outputs: [], inputs: [] } },
    'Get-NowPlaying.ps1': { json: {} },
    'Get-SystemLoad.ps1': { json: { cpu: 0, gpu: 0 } },
  });

  const { port, close } = await startServer();
  t.after(close);

  const { ws, received } = await connectClient(port);
  ws.send(JSON.stringify({ type: 'command', action: 'mediaKey', key: 'PlayPause' }));
  await new Promise((resolve) => setTimeout(resolve, 200));

  assert.equal(received.length, 0);
  ws.close();
});

test('returns a clean error for an unknown message type without dropping the connection', async (t) => {
  mockPowerShell(t, {
    'Get-AudioDevices.ps1': { json: { output: {}, input: {}, outputs: [], inputs: [] } },
    'Get-NowPlaying.ps1': { json: {} },
    'Get-SystemLoad.ps1': { json: { cpu: 0, gpu: 0 } },
  });

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

test('setAudioDevice command triggers Set-AudioDevice and broadcasts refreshed state', async (t) => {
  let setAudioDeviceCalledWith = null;
  // Overrides the shared mockPowerShell pattern to also capture the
  // Set-AudioDevice.ps1 call and flip the subsequent Get-AudioDevices.ps1
  // response, simulating a real switch.
  t.mock.method(cp, 'execFile', (_file, args, _opts, callback) => {
    const scriptName = path.basename(args[args.indexOf('-File') + 1]);
    if (scriptName === 'Set-AudioDevice.ps1') {
      setAudioDeviceCalledWith = args[args.indexOf('-Id') + 1];
      return callback(null, '{"ok":true}', '');
    }
    if (scriptName === 'Get-AudioDevices.ps1') {
      const current = setAudioDeviceCalledWith
        ? { current: 'Headphones', id: 'out-2' }
        : { current: 'Speakers', id: 'out-1' };
      return callback(null, JSON.stringify({ output: current, input: {}, outputs: [], inputs: [] }), '');
    }
    if (scriptName === 'Get-NowPlaying.ps1') return callback(null, '{}', '');
    if (scriptName === 'Get-SystemLoad.ps1') return callback(null, '{"cpu":0,"gpu":0}', '');
    callback(new Error(`no mock configured for ${scriptName}`));
  });

  const { port, close } = await startServer();
  t.after(close);

  const { ws, waitFor } = await connectClient(port);
  ws.send(JSON.stringify({ type: 'auth', token: config.pairingToken }));
  await waitFor((m) => m.type === 'auth');
  await waitFor((m) => m.type === 'snapshot');

  ws.send(JSON.stringify({ type: 'command', action: 'setAudioDevice', id: 'out-2' }));
  const audioUpdate = await waitFor((m) => m.type === 'state' && m.card === 'audio');

  assert.equal(setAudioDeviceCalledWith, 'out-2');
  assert.equal(audioUpdate.payload.output.current, 'Headphones');

  ws.close();
});

test('launchApp command triggers Launch-App.ps1 with the app\'s process name and path', async (t) => {
  let launchArgs = null;
  t.mock.method(cp, 'execFile', (_file, args, _opts, callback) => {
    const scriptName = path.basename(args[args.indexOf('-File') + 1]);
    if (scriptName === 'Launch-App.ps1') {
      launchArgs = args;
      return callback(null, '{"ok":true}', '');
    }
    if (scriptName === 'Get-AudioDevices.ps1') {
      return callback(null, JSON.stringify({ output: {}, input: {}, outputs: [], inputs: [] }), '');
    }
    if (scriptName === 'Get-NowPlaying.ps1') return callback(null, '{}', '');
    if (scriptName === 'Get-SystemLoad.ps1') return callback(null, '{"cpu":0,"gpu":0}', '');
    callback(new Error(`no mock configured for ${scriptName}`));
  });

  const { port, close } = await startServer();
  t.after(close);

  const { ws, waitFor } = await connectClient(port);
  ws.send(JSON.stringify({ type: 'auth', token: config.pairingToken }));
  await waitFor((m) => m.type === 'auth');
  await waitFor((m) => m.type === 'snapshot');

  ws.send(JSON.stringify({ type: 'command', action: 'launchApp', appId: 'discord' }));
  await new Promise((resolve) => setTimeout(resolve, 100));

  assert.ok(launchArgs.includes('-ProcessName'));
  assert.ok(launchArgs.includes('Discord'));
  assert.ok(launchArgs.includes('--processStart Discord.exe'));

  ws.close();
});

test('launchApp command with an unknown app id returns a clean error', async (t) => {
  mockPowerShell(t, {
    'Get-AudioDevices.ps1': { json: { output: {}, input: {}, outputs: [], inputs: [] } },
    'Get-NowPlaying.ps1': { json: {} },
    'Get-SystemLoad.ps1': { json: { cpu: 0, gpu: 0 } },
  });

  const { port, close } = await startServer();
  t.after(close);

  const { ws, waitFor } = await connectClient(port);
  ws.send(JSON.stringify({ type: 'auth', token: config.pairingToken }));
  await waitFor((m) => m.type === 'auth');
  await waitFor((m) => m.type === 'snapshot');

  ws.send(JSON.stringify({ type: 'command', action: 'launchApp', appId: 'nonexistent' }));
  const errorReply = await waitFor((m) => m.type === 'error');
  assert.match(errorReply.message, /Unknown app/);

  ws.close();
});
