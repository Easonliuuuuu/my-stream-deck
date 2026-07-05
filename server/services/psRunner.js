const { execFile } = require('child_process');
const path = require('path');

function runScript(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '..', 'scripts', scriptName);
    const psArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args];

    execFile('powershell.exe', psArgs, { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
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
