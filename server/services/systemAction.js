const { runScript } = require('./psRunner');

function invokeSystemAction(action) {
  return runScript('Invoke-SystemAction.ps1', ['-Action', action]);
}

module.exports = { invokeSystemAction };
