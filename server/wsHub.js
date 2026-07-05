const WebSocket = require('ws');
const config = require('./config');
const { getAudioState, setAudioDevice } = require('./services/audioDevices');
const { getNowPlaying } = require('./services/nowPlaying');
const { sendMediaKey } = require('./services/mediaKeys');
const { getControllerState } = require('./services/controllerBattery');

function attach(server) {
  const wss = new WebSocket.Server({ server });
  const state = { audio: null, nowPlaying: null, controller: null };

  function broadcastCard(card) {
    const message = JSON.stringify({ type: 'state', card, payload: state[card] });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && client.authed) client.send(message);
    });
  }

  function sendSnapshot(ws) {
    ws.send(JSON.stringify({ type: 'snapshot', payload: state }));
  }

  async function refreshAudio() {
    try {
      const next = await getAudioState();
      if (JSON.stringify(next) !== JSON.stringify(state.audio)) {
        state.audio = next;
        broadcastCard('audio');
      }
    } catch (e) {
      console.error('audio refresh failed:', e.message);
    }
  }

  async function refreshNowPlaying() {
    try {
      const next = await getNowPlaying();
      if (JSON.stringify(next) !== JSON.stringify(state.nowPlaying)) {
        state.nowPlaying = next;
        broadcastCard('nowPlaying');
      }
    } catch (e) {
      console.error('now-playing refresh failed:', e.message);
    }
  }

  function refreshController() {
    try {
      const next = getControllerState();
      if (JSON.stringify(next) !== JSON.stringify(state.controller)) {
        state.controller = next;
        broadcastCard('controller');
      }
    } catch (e) {
      console.error('controller refresh failed:', e.message);
    }
  }

  setInterval(refreshAudio, config.poll.audioMs);
  setInterval(refreshNowPlaying, config.poll.nowPlayingMs);
  setInterval(refreshController, config.poll.controllerMs);
  refreshAudio();
  refreshNowPlaying();
  refreshController();

  wss.on('connection', (ws) => {
    ws.authed = false;

    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      if (msg.type === 'auth') {
        ws.authed = msg.token === config.pairingToken;
        ws.send(JSON.stringify({ type: 'auth', ok: ws.authed }));
        if (ws.authed) sendSnapshot(ws);
        return;
      }

      if (!ws.authed) return; // silently drop commands from unauthenticated clients

      if (msg.type !== 'command') {
        ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }));
        return;
      }

      try {
        switch (msg.action) {
          case 'mediaKey':
            await sendMediaKey(msg.key);
            break;
          case 'setAudioDevice':
            await setAudioDevice(msg.id);
            await refreshAudio();
            break;
          default:
            ws.send(JSON.stringify({ type: 'error', message: `Unknown command action: ${msg.action}` }));
        }
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', message: e.message }));
      }
    });
  });

  return wss;
}

module.exports = { attach };
