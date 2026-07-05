const { runScript } = require('./psRunner');

const IDLE_STATE = { title: null, artist: null, album: null, isPlaying: false, art: null };

async function getNowPlaying() {
  const result = await runScript('Get-NowPlaying.ps1');
  if (!result || Object.keys(result).length === 0) return IDLE_STATE;
  return { ...IDLE_STATE, ...result };
}

module.exports = { getNowPlaying };
