const { register } = require('../actionRegistry');
const { getObsStatus, toggleRecord, toggleStream } = require('../services/obs');

// Unlike Audio/Controller/Performance, this action is meant to be bound
// directly to a key (not via an Open Panel indirection key) since its
// connection settings live on that same key instance — see runtime.js's
// openPanel fallback to the key's own action when settings.panelOf is unset.
register({
  uuid: 'com.streamdeck.obs.control',
  name: 'OBS Studio',
  icon: 'obs',
  states: [{}],
  settingsSchema: {
    host: { type: 'text' },
    port: { type: 'text' },
    password: { type: 'text' },
  },
  panel: {
    title: 'OBS Studio',
    widgets: [
      { id: 'connection', type: 'row', label: 'Connection', source: 'connection' },
      { id: 'recording', type: 'row', label: 'Recording', source: 'recording' },
      { id: 'streaming', type: 'row', label: 'Streaming', source: 'streaming' },
      { id: 'toggleRecord', type: 'button', label: 'Start / Stop Recording', action: 'toggleRecord' },
      { id: 'toggleStream', type: 'button', label: 'Start / Stop Streaming', action: 'toggleStream' },
    ],
  },
  // No background poller (unlike Audio/Controller/Performance): OBS may not
  // even be running most of the time, and polling it on an interval would
  // mean a constant stream of failed-connection errors. Status is fetched
  // fresh whenever the panel is opened or a toggle is pressed instead.
  async getPanelData(settings) {
    const status = await getObsStatus(settings || {});
    return {
      connection: status.connected ? 'Connected' : (status.error || 'Disconnected'),
      recording: !status.connected ? '—' : (status.recording ? (status.recordingPaused ? 'Paused' : 'Recording') : 'Stopped'),
      streaming: !status.connected ? '—' : (status.streaming ? 'Live' : 'Offline'),
    };
  },
  async onPanelAction(name, _payload, settings) {
    if (name === 'toggleRecord') return toggleRecord(settings || {});
    if (name === 'toggleStream') return toggleStream(settings || {});
    throw new Error(`Unknown panel action: ${name}`);
  },
});
