const { register } = require('../actionRegistry');
const { launchApp, getAppStatus } = require('../services/appLauncher');
const { closeDiscord, toggleDiscordMute } = require('../services/discordControl');
const { pollerForApp } = require('./appStatusPoller');

// Direct-bindable with its own panel (no Open Panel indirection key needed —
// see runtime.js's openPanel fallback to the key's own action), since the
// mute-toggle hotkey setting lives on this same key, matching the pattern
// set by OBS Studio's own control action.
register({
  uuid: 'com.streamdeck.discord.control',
  name: 'Discord',
  icon: 'discord',
  states: [{}],
  settingsSchema: {
    muteHotkey: { type: 'text' },
  },
  panel: {
    title: 'Discord',
    widgets: [
      { id: 'status', type: 'row', label: 'Status', source: 'status' },
      { id: 'launch', type: 'button', label: 'Launch / Focus', action: 'launch' },
      { id: 'toggleMute', type: 'button', label: 'Toggle Mute', action: 'toggleMute' },
      { id: 'close', type: 'button', label: 'Close Discord', action: 'close', style: 'danger' },
    ],
  },
  onWillAppear: (ctx) => pollerForApp('discord').attach(ctx),
  onWillDisappear: (ctx) => pollerForApp('discord').detach(ctx),
  async getPanelData() {
    const status = await getAppStatus('discord');
    return { status: status.running ? 'Running' : 'Not running' };
  },
  async onPanelAction(name, _payload, settings) {
    if (name === 'launch') return launchApp('discord');
    if (name === 'close') return closeDiscord();
    if (name === 'toggleMute') return toggleDiscordMute(settings?.muteHotkey);
    throw new Error(`Unknown panel action: ${name}`);
  },
});
