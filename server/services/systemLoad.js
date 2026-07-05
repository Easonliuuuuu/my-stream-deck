const { runScript } = require('./psRunner');

async function getSystemLoad() {
  return runScript('Get-SystemLoad.ps1');
}

module.exports = { getSystemLoad };
