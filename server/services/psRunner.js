const cp = require('child_process');
const path = require('path');

function runScript(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '..', 'scripts', scriptName);
    const psArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args];

    // Call cp.execFile (not a destructured reference) so tests can intercept
    // it with node:test's mock.method(cp, 'execFile', ...) without needing a
    // real PowerShell/AudioDeviceCmdlets install.
    cp.execFile('powershell.exe', psArgs, { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));

      const text = stdout.trim();
      if (!text) return resolve(null);

      try {
        resolve(JSON.parse(text));
      } catch (e) {
        reject(new Error(`Failed to parse PowerShell output from ${scriptName}: ${text.slice(0, 200)}`));
      }
    });
  });
}

module.exports = { runScript };
