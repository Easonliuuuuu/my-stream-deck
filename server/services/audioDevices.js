const { runScript } = require('./psRunner');

async function getAudioState() {
  return runScript('Get-AudioDevices.ps1');
}

async function setAudioDevice(id) {
  if (!id) throw new Error('Missing device id');
  return runScript('Set-AudioDevice.ps1', ['-Id', id]);
}

module.exports = { getAudioState, setAudioDevice };
