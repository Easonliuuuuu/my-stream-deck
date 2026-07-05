const { runScript } = require('./psRunner');

const VALID_KEYS = ['PlayPause', 'Next', 'Prev', 'VolumeUp', 'VolumeDown', 'Mute'];

async function sendMediaKey(key) {
  if (!VALID_KEYS.includes(key)) throw new Error(`Unknown media key: ${key}`);
  return runScript('Send-MediaKey.ps1', ['-Key', key]);
}

module.exports = { sendMediaKey };
