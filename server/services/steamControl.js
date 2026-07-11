const { runScript } = require('./psRunner');
const { APPS } = require('./appLauncher');

async function getSteamStatus() {
  const result = await runScript('Get-SteamStatus.ps1');
  return {
    runningAppId: result?.runningAppId || 0,
    gameName: result?.gameName || null,
  };
}

async function closeSteam() {
  return runScript('Close-Steam.ps1', ['-Path', APPS.steam.path]);
}

module.exports = { getSteamStatus, closeSteam };
