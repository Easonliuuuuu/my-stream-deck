const cp = require('child_process');
const path = require('path');

function runScript(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '..', 'scripts', scriptName);
    const psArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args];

    // Call cp.execFile (not a destructured reference) so tests can intercept
    // it with node:test's mock.method(cp, 'execFile', ...) without needing a
    // real PowerShell/AudioDeviceCmdlets install.
    //
    // `timeout` guards against a script that hangs instead of exiting non-zero
    // (Get-NowPlaying.ps1's WinRT bridge is a documented deadlock risk) —
    // without it a single stuck powershell.exe process never resolves or
    // rejects, and every subsequent poll tick just launches another one on
    // top of it.
    cp.execFile('powershell.exe', psArgs, { windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 10000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(err.killed ? `${scriptName} timed out` : (stderr || err.message)));

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
