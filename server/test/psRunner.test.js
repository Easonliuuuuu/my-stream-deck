const test = require('node:test');
const assert = require('node:assert/strict');
const cp = require('child_process');

const { runScript } = require('../services/psRunner');

test('runScript resolves parsed JSON from stdout', async (t) => {
  t.mock.method(cp, 'execFile', (_file, _args, _opts, callback) => {
    callback(null, '{"ok":true,"value":42}\n', '');
  });

  const result = await runScript('Fake.ps1');
  assert.deepEqual(result, { ok: true, value: 42 });
});

test('runScript resolves null for empty stdout', async (t) => {
  t.mock.method(cp, 'execFile', (_file, _args, _opts, callback) => {
    callback(null, '   \n', '');
  });

  const result = await runScript('Fake.ps1');
  assert.equal(result, null);
});

test('runScript rejects with stderr text when the process errors', async (t) => {
  t.mock.method(cp, 'execFile', (_file, _args, _opts, callback) => {
    callback(new Error('exit code 1'), '', 'Something went wrong in PowerShell');
  });

  await assert.rejects(() => runScript('Fake.ps1'), /Something went wrong in PowerShell/);
});

test('runScript rejects with a clear message when stdout is not valid JSON', async (t) => {
  t.mock.method(cp, 'execFile', (_file, _args, _opts, callback) => {
    callback(null, 'not json', '');
  });

  await assert.rejects(() => runScript('Fake.ps1'), /Failed to parse PowerShell output from Fake\.ps1/);
});

test('runScript passes the script path and extra args through to execFile', async (t) => {
  let capturedArgs;
  t.mock.method(cp, 'execFile', (_file, args, _opts, callback) => {
    capturedArgs = args;
    callback(null, '{}', '');
  });

  await runScript('Fake.ps1', ['-Id', 'abc123']);

  assert.ok(capturedArgs.includes('-Id'));
  assert.ok(capturedArgs.includes('abc123'));
  assert.ok(capturedArgs.some((a) => a.endsWith('Fake.ps1')));
});
