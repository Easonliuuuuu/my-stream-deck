const { register } = require('../actionRegistry');
const { launchApp } = require('../services/appLauncher');
const { invokeSystemAction } = require('../services/systemAction');

// Title/icon are static per instance (set from the key's own `title`/`icon`
// fields, e.g. "Spotify" with the spotify icon) — these actions never push a
// render, they only react to activation.
register({
  uuid: 'com.streamdeck.system.launchApp',
  name: 'Launch App',
  icon: 'launch',
  states: [{}],
  settingsSchema: {
    appId: { type: 'text' },
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
    action: { type: 'select', options: ['lock', 'sleep'] },
  },
  async onKeyDown(ctx) {
    await invokeSystemAction(ctx.settings.action);
  },
});
