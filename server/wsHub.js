const WebSocket = require('ws');
const config = require('./config');
const { getNowPlaying } = require('./services/nowPlaying');
const { sendMediaKey } = require('./services/mediaKeys');
const { getSystemLoad } = require('./services/systemLoad');

// `runtime` is created by the caller (index.js in production, tests
// directly) and shared with the HTTP layer (app.js) so that a layout saved
// over POST /layout and a key pressed over this WebSocket act on the same
// live state.
function attach(server, runtime) {
  const wss = new WebSocket.Server({ server });

  function broadcast(message) {
    const payload = JSON.stringify(message);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && client.authed) client.send(payload);
    });
  }
  runtime.onRender(broadcast);

  // now-playing (portrait now-strip / landscape info-panel) and the
  // landscape info-panel's CPU/GPU/active-app readout are fixed UI chrome,
  // not user-configurable keys — see design.md's "hybrid" decision. They
  // keep their own always-on broadcast rather than going through the
  // context/render protocol, which is gated by whether a key happens to be
  // visible. (This does mean systemLoad may be polled twice — once here,
  // once by the com.streamdeck.system.load action if the user has also
  // placed a Performance key — accepted as the simplest way to keep the
  // persistent panel truly independent of the grid's contents.)
  let nowPlaying = null;
  let systemLoad = null;

  async function refreshNowPlaying() {
    try {
      const next = await getNowPlaying();
      if (JSON.stringify(next) !== JSON.stringify(nowPlaying)) {
        nowPlaying = next;
        broadcast({ type: 'state', card: 'nowPlaying', payload: nowPlaying });
      }
    } catch (e) {
      console.error('now-playing refresh failed:', e.message);
    }
  }

  async function refreshSystemLoad() {
    try {
      const next = await getSystemLoad();
      if (JSON.stringify(next) !== JSON.stringify(systemLoad)) {
        systemLoad = next;
        broadcast({ type: 'state', card: 'systemLoad', payload: systemLoad });
      }
    } catch (e) {
      console.error('system load refresh failed:', e.message);
    }
  }

  const nowPlayingTimer = setInterval(refreshNowPlaying, config.poll.nowPlayingMs);
  const systemLoadTimer = setInterval(refreshSystemLoad, config.poll.systemLoadMs);
  refreshNowPlaying();
  refreshSystemLoad();

  function sendSnapshot(ws) {
    ws.send(JSON.stringify({
      type: 'snapshot',
      payload: {
        layout: runtime.getLayout(),
        renders: runtime.snapshotRenders(),
        nowPlaying,
        systemLoad,
      },
    }));
  }

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
          case 'keyDown':
            await runtime.keyDown(msg.context);
            break;
          case 'openPanel': {
            const panel = await runtime.openPanel(msg.context);
            ws.send(JSON.stringify({ type: 'panel', ...panel }));
            break;
          }
          case 'panelAction':
            await runtime.panelAction(msg.actionUuid, msg.name, msg.payload);
            break;
          case 'setVisibleContexts':
            await runtime.setVisibleContexts(msg.contexts || []);
            break;
          case 'mediaKey':
            await sendMediaKey(msg.key);
            break;
          default:
            ws.send(JSON.stringify({ type: 'error', message: `Unknown command action: ${msg.action}` }));
        }
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', message: e.message }));
      }
    });
  });

  function stop() {
    clearInterval(nowPlayingTimer);
    clearInterval(systemLoadTimer);
    // Drives every currently-visible context's onWillDisappear, which is
    // what tears down each action module's internal poll timer (see
    // pollHelper.js) — without this, action-module intervals would outlive
    // this server instance and leak across test runs / restarts.
    runtime.setVisibleContexts([]);
    // wss.close()'s callback only fires once every client socket is fully
    // torn down; terminate them up front instead of waiting on a graceful
    // close handshake that may not complete promptly (matters for tests that
    // tear the server down right after a client disconnects).
    wss.clients.forEach((client) => client.terminate());
    wss.close();
  }

  return { wss, stop, runtime };
}

module.exports = { attach };
