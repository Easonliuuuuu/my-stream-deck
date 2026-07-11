const { getAppStatus } = require('../services/appLauncher');
const { createPoller } = require('./pollHelper');
const config = require('../config');

// One poller per app id (not one shared poller, since different keys can
// name different appIds) — created lazily so an app nobody has bound a key
// to never gets polled. Shared by the generic Launch App action and any
// dedicated per-app control action (Discord, Steam) that also wants a live
// "Running" subtitle on its own tile.
const appPollers = new Map();
function pollerForApp(appId) {
  if (!appPollers.has(appId)) {
    appPollers.set(appId, createPoller(
      () => getAppStatus(appId),
      config.poll.appStatusMs,
      (ctx, state) => ctx.setSubtitle(state.running ? 'Running' : ''),
    ));
  }
  return appPollers.get(appId);
}

module.exports = { pollerForApp };
