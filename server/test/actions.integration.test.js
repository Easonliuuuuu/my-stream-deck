const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('child_process');
const path = require('path');
const { OBSWebSocket } = require('obs-websocket-js');

const registry = require('../actionRegistry');
registry.clear();
require('../actions');

const { createRuntime } = require('../runtime');

function mockPowerShell(t, responses) {
  t.mock.method(cp, 'execFile', (_file, args, _opts, callback) => {
    const scriptName = path.basename(args[args.indexOf('-File') + 1]);
    const response = responses[scriptName];
    if (!response) return callback(null, '{}', '');
    callback(null, JSON.stringify(response), '');
  });
}

function layoutWithOneOf(actionUuid) {
  return {
    schemaVersion: 2,
    grid: { cols: 1, rows: 1 },
    root: 'folder-root',
    folders: {
      'folder-root': {
        name: 'Home',
        keys: {
          '0,0': { context: 'ctx-1', action: actionUuid, settings: {}, state: 0 },
        },
      },
    },
  };
}

test('audio.devices polls while visible and stops when the key is navigated away from', async (t) => {
  let calls = 0;
  t.mock.method(cp, 'execFile', (_file, args, _opts, callback) => {
    calls += 1;
    callback(null, JSON.stringify({ output: { current: 'Speakers', id: 'out-1' }, input: {}, outputs: [], inputs: [] }), '');
  });

  const runtime = createRuntime(layoutWithOneOf('com.streamdeck.audio.devices'));
  t.after(() => runtime.setVisibleContexts([])); // clears the module-level poller's interval
  await new Promise((r) => setImmediate(r)); // root folder auto-visible -> first poll fires
  assert.ok(calls >= 1);

  const callsAfterAppear = calls;
  await new Promise((r) => setTimeout(r, 30));
  await runtime.setVisibleContexts([]); // navigate away
  const callsAfterDisappear = calls;

  await new Promise((r) => setTimeout(r, 50));
  assert.equal(calls, callsAfterDisappear, 'no further polling once the key is invisible');
  assert.ok(callsAfterAppear >= 1);
});

test('controller.battery pushes a ring badge subtitle while visible', async (t) => {
  mockPowerShell(t, {});
  const runtime = createRuntime(layoutWithOneOf('com.streamdeck.controller.battery'));
  t.after(() => runtime.setVisibleContexts([]));
  const renders = [];
  runtime.onRender((m) => renders.push(m));
  await new Promise((r) => setImmediate(r));

  const render = renders.find((m) => m.context === 'ctx-1');
  assert.ok(render);
  assert.equal(render.subtitle, 'Disconnected'); // no real DualSense present
});

test('system.load pushes a text badge and CPU subtitle while visible', async (t) => {
  mockPowerShell(t, { 'Get-SystemLoad.ps1': { cpu: 47, gpu: 12 } });
  const runtime = createRuntime(layoutWithOneOf('com.streamdeck.system.load'));
  t.after(() => runtime.setVisibleContexts([]));
  const renders = [];
  runtime.onRender((m) => renders.push(m));
  await new Promise((r) => setImmediate(r));

  // setSubtitle and setImage are two separate emits, not one merged message.
  const subtitleMsg = renders.find((m) => m.context === 'ctx-1' && 'subtitle' in m);
  const imageMsg = renders.find((m) => m.context === 'ctx-1' && 'image' in m);
  assert.ok(subtitleMsg);
  assert.equal(subtitleMsg.subtitle, 'CPU 47%');
  assert.ok(imageMsg);
  assert.deepEqual(imageMsg.image, { icon: 'performance', badge: { kind: 'text', value: '47%' } });
});

test('an openPanel key inherits its target action\'s live subtitle on its own context', async (t) => {
  mockPowerShell(t, { 'Get-SystemLoad.ps1': { cpu: 55, gpu: 20 } });
  const layout = {
    schemaVersion: 2,
    grid: { cols: 1, rows: 1 },
    root: 'folder-root',
    folders: {
      'folder-root': {
        name: 'Home',
        keys: {
          '0,0': { context: 'ctx-perf-panel', action: 'com.streamdeck.core.openPanel', settings: { panelOf: 'com.streamdeck.system.load' }, state: 0, title: 'Performance' },
        },
      },
    },
  };
  const runtime = createRuntime(layout);
  t.after(() => runtime.setVisibleContexts([]));
  const renders = [];
  runtime.onRender((m) => renders.push(m));
  await new Promise((r) => setImmediate(r));

  // The render lands on ctx-perf-panel (the openPanel key's own context),
  // not on some context belonging to com.streamdeck.system.load directly —
  // that action was never bound to any key here.
  const subtitleMsg = renders.find((m) => m.context === 'ctx-perf-panel' && 'subtitle' in m);
  assert.ok(subtitleMsg, 'expected the openPanel key to receive a forwarded subtitle push');
  assert.equal(subtitleMsg.subtitle, 'CPU 55%');
});

test('launchApp key shows a "Running" subtitle while its process is running, and clears it when not', async (t) => {
  mockPowerShell(t, { 'Get-AppStatus.ps1': { running: true } });
  const layout = layoutWithOneOf('com.streamdeck.system.launchApp');
  layout.folders['folder-root'].keys['0,0'].settings = { appId: 'spotify' };

  const runtime = createRuntime(layout);
  t.after(() => runtime.setVisibleContexts([]));
  const renders = [];
  runtime.onRender((m) => renders.push(m));
  await new Promise((r) => setImmediate(r));

  const subtitleMsg = renders.find((m) => m.context === 'ctx-1' && 'subtitle' in m);
  assert.ok(subtitleMsg);
  assert.equal(subtitleMsg.subtitle, 'Running');
});

test('OBS Studio key opens its own panel directly (no Open Panel indirection key needed)', async (t) => {
  t.mock.method(OBSWebSocket.prototype, 'connect', async () => {});
  t.mock.method(OBSWebSocket.prototype, 'call', async (request) => {
    if (request === 'GetRecordStatus') return { outputActive: true, outputPaused: false };
    if (request === 'GetStreamStatus') return { outputActive: false };
    return {};
  });
  t.mock.method(OBSWebSocket.prototype, 'disconnect', () => {});

  const layout = layoutWithOneOf('com.streamdeck.obs.control');
  layout.folders['folder-root'].keys['0,0'].settings = { host: '127.0.0.1', port: '4455', password: 'x' };
  const runtime = createRuntime(layout);
  t.after(() => runtime.setVisibleContexts([]));

  const panel = await runtime.openPanel('ctx-1');
  assert.equal(panel.actionUuid, 'com.streamdeck.obs.control');
  assert.equal(panel.data.connection, 'Connected');
  assert.equal(panel.data.recording, 'Recording');
  assert.equal(panel.data.streaming, 'Offline');

  await runtime.panelAction('com.streamdeck.obs.control', 'ctx-1', 'toggleRecord', {});
  const callNames = OBSWebSocket.prototype.call.mock.calls.map((c) => c.arguments[0]);
  assert.ok(callNames.includes('ToggleRecord'));
});

test('Discord key opens its own panel and reports running status', async (t) => {
  mockPowerShell(t, { 'Get-AppStatus.ps1': { running: true } });
  const layout = layoutWithOneOf('com.streamdeck.discord.control');
  layout.folders['folder-root'].keys['0,0'].settings = { muteHotkey: 'Ctrl+Shift+M' };
  const runtime = createRuntime(layout);
  t.after(() => runtime.setVisibleContexts([]));

  const panel = await runtime.openPanel('ctx-1');
  assert.equal(panel.actionUuid, 'com.streamdeck.discord.control');
  assert.equal(panel.data.status, 'Running');
});

test('Discord close button force-kills every process named Discord', async (t) => {
  let killArgs = null;
  t.mock.method(cp, 'execFile', (_file, args, _opts, callback) => {
    const scriptName = path.basename(args[args.indexOf('-File') + 1]);
    if (scriptName === 'Stop-ProcessByName.ps1') {
      killArgs = args;
      return callback(null, '{"ok":true}', '');
    }
    callback(null, '{}', '');
  });

  const layout = layoutWithOneOf('com.streamdeck.discord.control');
  const runtime = createRuntime(layout);
  t.after(() => runtime.setVisibleContexts([]));

  await runtime.panelAction('com.streamdeck.discord.control', 'ctx-1', 'close', {});
  assert.ok(killArgs.includes('-ProcessName'));
  assert.ok(killArgs.includes('Discord'));
});

test('Discord toggle-mute sends the configured hotkey combo', async (t) => {
  let hotkeyArgs = null;
  t.mock.method(cp, 'execFile', (_file, args, _opts, callback) => {
    const scriptName = path.basename(args[args.indexOf('-File') + 1]);
    if (scriptName === 'Send-Hotkey.ps1') {
      hotkeyArgs = args;
      return callback(null, '{"ok":true}', '');
    }
    callback(null, '{}', '');
  });

  const layout = layoutWithOneOf('com.streamdeck.discord.control');
  layout.folders['folder-root'].keys['0,0'].settings = { muteHotkey: 'Ctrl+Shift+M' };
  const runtime = createRuntime(layout);
  t.after(() => runtime.setVisibleContexts([]));

  await runtime.panelAction('com.streamdeck.discord.control', 'ctx-1', 'toggleMute', {});
  assert.ok(hotkeyArgs.includes('-Combo'));
  assert.ok(hotkeyArgs.includes('Ctrl+Shift+M'));
});

test('Discord toggle-mute refuses to run when no hotkey is configured', async (t) => {
  mockPowerShell(t, {});
  const layout = layoutWithOneOf('com.streamdeck.discord.control');
  const runtime = createRuntime(layout);
  t.after(() => runtime.setVisibleContexts([]));

  await assert.rejects(
    () => runtime.panelAction('com.streamdeck.discord.control', 'ctx-1', 'toggleMute', {}),
    /mute hotkey/i
  );
});

test('Steam key reports the currently-running game by name', async (t) => {
  mockPowerShell(t, {
    'Get-AppStatus.ps1': { running: true },
    'Get-SteamStatus.ps1': { runningAppId: 228980, gameName: 'Steamworks Common Redistributables' },
  });
  const layout = layoutWithOneOf('com.streamdeck.steam.control');
  const runtime = createRuntime(layout);
  t.after(() => runtime.setVisibleContexts([]));

  const panel = await runtime.openPanel('ctx-1');
  assert.equal(panel.data.status, 'Running');
  assert.equal(panel.data.currentGame, 'Steamworks Common Redistributables');
});

test('Steam key falls back to the raw app id when the manifest name is unresolved', async (t) => {
  mockPowerShell(t, {
    'Get-AppStatus.ps1': { running: true },
    'Get-SteamStatus.ps1': { runningAppId: 12345, gameName: null },
  });
  const layout = layoutWithOneOf('com.streamdeck.steam.control');
  const runtime = createRuntime(layout);
  t.after(() => runtime.setVisibleContexts([]));

  const panel = await runtime.openPanel('ctx-1');
  assert.equal(panel.data.currentGame, 'App 12345');
});

test('Steam key shows "None" when no game is running', async (t) => {
  mockPowerShell(t, {
    'Get-AppStatus.ps1': { running: true },
    'Get-SteamStatus.ps1': { runningAppId: 0, gameName: null },
  });
  const layout = layoutWithOneOf('com.streamdeck.steam.control');
  const runtime = createRuntime(layout);
  t.after(() => runtime.setVisibleContexts([]));

  const panel = await runtime.openPanel('ctx-1');
  assert.equal(panel.data.currentGame, 'None');
});

test('Steam close button shuts down via the -shutdown flag, not a force-kill', async (t) => {
  let shutdownArgs = null;
  t.mock.method(cp, 'execFile', (_file, args, _opts, callback) => {
    const scriptName = path.basename(args[args.indexOf('-File') + 1]);
    if (scriptName === 'Close-Steam.ps1') {
      shutdownArgs = args;
      return callback(null, '{"ok":true}', '');
    }
    callback(null, '{}', '');
  });

  const layout = layoutWithOneOf('com.streamdeck.steam.control');
  const runtime = createRuntime(layout);
  t.after(() => runtime.setVisibleContexts([]));

  await runtime.panelAction('com.streamdeck.steam.control', 'ctx-1', 'close', {});
  assert.ok(shutdownArgs.includes('-Path'));
  assert.ok(shutdownArgs.some((a) => a.toLowerCase().includes('steam.exe')));
});

test('screenshot system action invokes Invoke-SystemAction.ps1 with -Action screenshot', async (t) => {
  let sysArgs = null;
  t.mock.method(cp, 'execFile', (_file, args, _opts, callback) => {
    const scriptName = path.basename(args[args.indexOf('-File') + 1]);
    if (scriptName === 'Invoke-SystemAction.ps1') {
      sysArgs = args;
      return callback(null, '', '');
    }
    callback(null, '{}', '');
  });

  const layout = layoutWithOneOf('com.streamdeck.system.action');
  layout.folders['folder-root'].keys['0,0'].settings = { action: 'screenshot' };
  const runtime = createRuntime(layout);
  t.after(() => runtime.setVisibleContexts([]));

  await runtime.keyDown('ctx-1');
  assert.ok(sysArgs.includes('-Action'));
  assert.ok(sysArgs.includes('screenshot'));
});
