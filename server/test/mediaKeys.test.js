const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('child_process');
const path = require('path');

const { sendMediaKey } = require('../services/mediaKeys');

function captureScriptCalls(t) {
  const calls = [];
  t.mock.method(cp, 'execFile', (_file, args, _opts, callback) => {
    calls.push({
      script: path.basename(args[args.indexOf('-File') + 1]),
      args,
    });
    callback(null, '{"ok":true}', '');
  });
  return calls;
}

test('transport keys (PlayPause/Next/Prev) still go through Send-MediaKey.ps1', async (t) => {
  const calls = captureScriptCalls(t);
  await sendMediaKey('PlayPause');
  assert.equal(calls[0].script, 'Send-MediaKey.ps1');
  assert.equal(calls[0].args[calls[0].args.indexOf('-Key') + 1], 'PlayPause');
});

test('VolumeUp/VolumeDown/Mute go through Set-Volume.ps1 against the default device, not a simulated hardware key', async (t) => {
  const calls = captureScriptCalls(t);
  await sendMediaKey('VolumeUp');
  await sendMediaKey('VolumeDown');
  await sendMediaKey('Mute');

  assert.deepEqual(calls.map((c) => c.script), ['Set-Volume.ps1', 'Set-Volume.ps1', 'Set-Volume.ps1']);
  assert.equal(calls[0].args[calls[0].args.indexOf('-Action') + 1], 'Up');
  assert.equal(calls[1].args[calls[1].args.indexOf('-Action') + 1], 'Down');
  assert.equal(calls[2].args[calls[2].args.indexOf('-Action') + 1], 'Mute');
});

test('rejects an unknown key without shelling out', async (t) => {
  const calls = captureScriptCalls(t);
  await assert.rejects(() => sendMediaKey('Bogus'), /Unknown media key/);
  assert.equal(calls.length, 0);
});
