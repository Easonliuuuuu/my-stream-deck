const { OBSWebSocket } = require('obs-websocket-js');

const CONNECT_TIMEOUT_MS = 5000;

function connectionUrl(settings) {
  const host = settings.host || '127.0.0.1';
  const port = settings.port || '4455';
  return `ws://${host}:${port}`;
}

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_resolve, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

// Connects fresh for each call rather than holding a persistent connection —
// OBS may not even be running, and a short-lived per-call socket avoids
// needing reconnect/keepalive logic for what's an infrequent, user-triggered
// action (matches the psRunner pattern of shelling out fresh each time).
async function withObs(settings, fn) {
  const obs = new OBSWebSocket();
  try {
    await withTimeout(
      obs.connect(connectionUrl(settings || {}), settings?.password || undefined),
      CONNECT_TIMEOUT_MS,
      'Could not reach OBS — is it running with the WebSocket server enabled (Tools → WebSocket Server Settings)?'
    );
    return await fn(obs);
  } finally {
    obs.disconnect();
  }
}

async function getObsStatus(settings) {
  try {
    return await withObs(settings, async (obs) => {
      const [record, stream] = await Promise.all([
        obs.call('GetRecordStatus'),
        obs.call('GetStreamStatus'),
      ]);
      return {
        connected: true,
        recording: record.outputActive,
        recordingPaused: record.outputPaused,
        streaming: stream.outputActive,
      };
    });
  } catch (e) {
    return { connected: false, recording: false, streaming: false, error: e.message };
  }
}

async function toggleRecord(settings) {
  return withObs(settings, (obs) => obs.call('ToggleRecord'));
}

async function toggleStream(settings) {
  return withObs(settings, (obs) => obs.call('ToggleStream'));
}

module.exports = { getObsStatus, toggleRecord, toggleStream };
