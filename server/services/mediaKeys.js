const { runScript } = require('./psRunner');

const TRANSPORT_KEYS = ['PlayPause', 'Next', 'Prev'];

// Volume/mute go through AudioDeviceCmdlets against the current default
// output device (see Set-Volume.ps1) instead of simulated hardware keys, so
// they always affect the same device the Audio panel shows as current.
const VOLUME_ACTIONS = { VolumeUp: 'Up', VolumeDown: 'Down', Mute: 'Mute' };

async function sendMediaKey(key) {
  if (TRANSPORT_KEYS.includes(key)) return runScript('Send-MediaKey.ps1', ['-Key', key]);
  if (key in VOLUME_ACTIONS) return runScript('Set-Volume.ps1', ['-Action', VOLUME_ACTIONS[key]]);
  throw new Error(`Unknown media key: ${key}`);
}

module.exports = { sendMediaKey };
