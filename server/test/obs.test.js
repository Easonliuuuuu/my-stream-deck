const test = require('node:test');
const assert = require('node:assert/strict');
const { OBSWebSocket } = require('obs-websocket-js');

const { getObsStatus, toggleRecord, toggleStream } = require('../services/obs');

function mockObs(t, { connectError, calls = {} } = {}) {
  const connectArgs = [];
  const callArgs = [];
  let disconnected = false;

  t.mock.method(OBSWebSocket.prototype, 'connect', async (...args) => {
    connectArgs.push(args);
    if (connectError) throw connectError;
  });
  t.mock.method(OBSWebSocket.prototype, 'call', async (request) => {
    callArgs.push(request);
    if (calls[request]) return calls[request];
    return {};
  });
  t.mock.method(OBSWebSocket.prototype, 'disconnect', () => { disconnected = true; });

  return { connectArgs, callArgs, wasDisconnected: () => disconnected };
}

test('getObsStatus reports connected/recording/streaming from a live OBS', async (t) => {
  mockObs(t, {
    calls: {
      GetRecordStatus: { outputActive: true, outputPaused: false },
      GetStreamStatus: { outputActive: false },
    },
  });

  const status = await getObsStatus({ host: '127.0.0.1', port: '4455', password: 'secret' });
  assert.deepEqual(status, { connected: true, recording: true, recordingPaused: false, streaming: false });
});

test('getObsStatus reports disconnected instead of throwing when OBS is unreachable', async (t) => {
  mockObs(t, { connectError: new Error('ECONNREFUSED') });

  const status = await getObsStatus({ host: '127.0.0.1', port: '4455' });
  assert.equal(status.connected, false);
  assert.match(status.error, /ECONNREFUSED/);
});

test('getObsStatus disconnects the socket even when the connection attempt fails', async (t) => {
  const mock = mockObs(t, { connectError: new Error('nope') });
  await getObsStatus({});
  assert.equal(mock.wasDisconnected(), true);
});

test('toggleRecord and toggleStream call the corresponding OBS WebSocket request', async (t) => {
  const mock = mockObs(t);

  await toggleRecord({ host: '127.0.0.1', port: '4455' });
  await toggleStream({ host: '127.0.0.1', port: '4455' });

  assert.deepEqual(mock.callArgs, ['ToggleRecord', 'ToggleStream']);
});

test('connects using the host/port from settings, defaulting when absent', async (t) => {
  const mock = mockObs(t, { calls: { GetRecordStatus: {}, GetStreamStatus: {} } });

  await getObsStatus({});
  assert.equal(mock.connectArgs[0][0], 'ws://127.0.0.1:4455');

  await getObsStatus({ host: '10.0.0.5', port: '4444', password: 'hunter2' });
  assert.equal(mock.connectArgs[1][0], 'ws://10.0.0.5:4444');
  assert.equal(mock.connectArgs[1][1], 'hunter2');
});
