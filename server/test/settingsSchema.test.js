const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('child_process');

const { validateSettings, validateDynamicOption } = require('../settingsSchema');
const registry = require('../actionRegistry');

const SCHEMA = {
  appId: { type: 'text' },
  mode: { type: 'select', options: ['a', 'b'] },
};

test('rejects an unknown setting key', () => {
  const errors = validateSettings(SCHEMA, { appId: 'x', bogus: 'y' });
  assert.ok(errors.some((e) => /Unknown setting: bogus/.test(e)));
});

test('rejects a wrong-typed value', () => {
  const errors = validateSettings(SCHEMA, { appId: 42 });
  assert.ok(errors.some((e) => /must be a string/.test(e)));
});

test('rejects a select value outside its declared options', () => {
  const errors = validateSettings(SCHEMA, { mode: 'z' });
  assert.ok(errors.some((e) => /invalid value/.test(e)));
});

test('accepts a valid settings object', () => {
  assert.deepEqual(validateSettings(SCHEMA, { appId: 'spotify', mode: 'a' }), []);
});

test('validateDynamicOption rejects a stale id not present in the live list', () => {
  const liveOutputs = [{ id: 'out-1', name: 'Speakers' }, { id: 'out-2', name: 'Headphones' }];
  assert.equal(validateDynamicOption(liveOutputs, 'out-1'), true);
  assert.equal(validateDynamicOption(liveOutputs, 'out-stale'), false);
});

test('a stale dynamic device id never reaches a PowerShell invocation', async (t) => {
  registry.clear();
  require('../actions/audio');

  let execFileCalled = false;
  t.mock.method(cp, 'execFile', (...args) => {
    execFileCalled = true;
    const callback = args[args.length - 1];
    if (args[1].includes('Get-AudioDevices.ps1')) {
      return callback(null, JSON.stringify({ output: {}, input: {}, outputs: [{ id: 'out-1', name: 'Speakers' }], inputs: [] }), '');
    }
    callback(null, '{}', '');
  });

  const audioModule = registry.get('com.streamdeck.audio.devices');
  // Warm the poller's cache with a live device list containing only out-1.
  await audioModule.getPanelData();

  execFileCalled = false;
  await assert.rejects(
    () => audioModule.onPanelAction('setOutput', { id: 'out-stale-device' }),
    /Unknown output device/
  );
  assert.equal(execFileCalled, false, 'Set-AudioDevice.ps1 must not have been invoked for a stale device id');
});
