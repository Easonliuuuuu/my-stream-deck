const registry = require('../actionRegistry');
const { register } = registry;

// Client-local navigation: the client already holds the full layout tree
// (sent on connect), so opening a folder is resolved entirely in the
// browser. This module exists purely so the action is a valid registration
// target for validation and the editor's action list.
register({
  uuid: 'com.streamdeck.core.openFolder',
  name: 'Open Folder',
  icon: 'folder',
  states: [{}],
  settingsSchema: {
    folderId: { type: 'text' },
  },
});

// Opening a panel needs live data (device lists, battery, load), so unlike
// openFolder this does round-trip to the server — see runtime.openPanel.
//
// The key bound to this action is a real, separate context from the target
// capability's own — so without help, the target's onWillAppear (and the
// live subtitle/image it pushes, e.g. "Speakers" or "62%") would never run
// against THIS key at all. We forward lifecycle calls to the target action,
// wrapped in a proxy ctx whose setters redirect back onto this key's own
// context — so an openPanel key visually inherits its target's live display.
// The proxy is cached per outer ctx (stable per key context — see
// runtime.js's ctxCache) so pollHelper's Set-based attach/detach tracking,
// which depends on ctx identity, works correctly across appear/disappear.
const proxyCtxCache = new WeakMap();
function proxyCtxFor(ctx) {
  if (proxyCtxCache.has(ctx)) return proxyCtxCache.get(ctx);
  const proxy = {
    get settings() { return ctx.settings; },
    get state() { return ctx.state; },
    setTitle: (title) => ctx.setTitle(title),
    setSubtitle: (subtitle) => ctx.setSubtitle(subtitle),
    setImage: (image) => ctx.setImage(image),
    setState: (state) => ctx.setState(state),
  };
  proxyCtxCache.set(ctx, proxy);
  return proxy;
}

register({
  uuid: 'com.streamdeck.core.openPanel',
  name: 'Open Panel',
  icon: 'folder',
  states: [{}],
  settingsSchema: {
    panelOf: { type: 'text' },
  },
  onWillAppear(ctx) {
    const target = registry.get(ctx.settings.panelOf);
    if (target && target.onWillAppear) target.onWillAppear(proxyCtxFor(ctx));
  },
  onWillDisappear(ctx) {
    const target = registry.get(ctx.settings.panelOf);
    if (target && target.onWillDisappear) target.onWillDisappear(proxyCtxFor(ctx));
  },
});

// Marker action: the client special-cases any key bound to this uuid to open
// its built-in settings editor rather than dispatching anywhere.
register({
  uuid: 'com.streamdeck.core.settings',
  name: 'Settings',
  icon: 'settings',
  states: [{}],
});
