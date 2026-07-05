const { runScript } = require('./psRunner');

// Bring the app's window to the foreground if it's already running,
// otherwise start it fresh. Paths match each app's default per-user install
// location; if yours differs, update the path here.
const APPS = {
  spotify: {
    processName: 'Spotify',
    path: `${process.env.APPDATA}\\Spotify\\Spotify.exe`,
  },
  discord: {
    processName: 'Discord',
    path: `${process.env.LOCALAPPDATA}\\Discord\\Update.exe`,
    args: '--processStart Discord.exe',
  },
  steam: {
    processName: 'steam',
    path: 'C:\\Program Files (x86)\\Steam\\steam.exe',
  },
};

async function launchApp(id) {
  const app = APPS[id];
  if (!app) throw new Error(`Unknown app: ${id}`);

  const args = ['-ProcessName', app.processName, '-Path', app.path];
  if (app.args) args.push('-Arguments', app.args);
  return runScript('Launch-App.ps1', args);
}

module.exports = { launchApp, APPS };
