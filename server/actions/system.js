const { register } = require('../actionRegistry');
const { launchApp, APPS } = require('../services/appLauncher');
const { invokeSystemAction } = require('../services/systemAction');
const { pollerForApp } = require('./appStatusPoller');

// Title/icon are static per instance (set from the key's own `title`/`icon`
// fields, e.g. "Spotify" with the spotify icon) — only the subtitle (the
// running-indicator) is pushed live.
register({
  uuid: 'com.streamdeck.system.launchApp',
  name: 'Launch App',
  icon: 'launch',
  states: [{}],
  settingsSchema: {
    appId: { type: 'text' },
  },
  onWillAppear(ctx) {
    if (APPS[ctx.settings.appId]) pollerForApp(ctx.settings.appId).attach(ctx);
  },
  onWillDisappear(ctx) {
    if (APPS[ctx.settings.appId]) pollerForApp(ctx.settings.appId).detach(ctx);
  },
  async onKeyDown(ctx) {
    await launchApp(ctx.settings.appId);
  },
});

register({
  uuid: 'com.streamdeck.system.action',
  name: 'System Action',
  icon: 'lock',
  states: [{}],
  settingsSchema: {
    action: { type: 'select', options: ['lock', 'sleep', 'screenshot'] },
  },
  async onKeyDown(ctx) {
    await invokeSystemAction(ctx.settings.action);
  },
});
