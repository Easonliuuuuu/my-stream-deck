const { register } = require('../actionRegistry');
const { launchApp, getAppStatus } = require('../services/appLauncher');
const { getSteamStatus, closeSteam } = require('../services/steamControl');
const { pollerForApp } = require('./appStatusPoller');

// Direct-bindable with its own panel, same as Discord/OBS — no settings
// needed here since Steam's install path is already fixed in
// appLauncher.js's APPS map.
register({
  uuid: 'com.streamdeck.steam.control',
  name: 'Steam',
  icon: 'steam',
  states: [{}],
  panel: {
    title: 'Steam',
    widgets: [
      { id: 'status', type: 'row', label: 'Status', source: 'status' },
      { id: 'currentGame', type: 'row', label: 'Now Playing', source: 'currentGame' },
      { id: 'launch', type: 'button', label: 'Launch / Focus', action: 'launch' },
      { id: 'close', type: 'button', label: 'Close Steam', action: 'close', style: 'danger' },
    ],
  },
  onWillAppear: (ctx) => pollerForApp('steam').attach(ctx),
  onWillDisappear: (ctx) => pollerForApp('steam').detach(ctx),
  async getPanelData() {
    const [appStatus, steamStatus] = await Promise.all([getAppStatus('steam'), getSteamStatus()]);
    const currentGame = steamStatus.gameName || (steamStatus.runningAppId ? `App ${steamStatus.runningAppId}` : 'None');
    return { status: appStatus.running ? 'Running' : 'Not running', currentGame };
  },
  async onPanelAction(name) {
    if (name === 'launch') return launchApp('steam');
    if (name === 'close') return closeSteam();
    throw new Error(`Unknown panel action: ${name}`);
  },
});
