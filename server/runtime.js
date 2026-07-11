const registry = require('./actionRegistry');

// Ties the layout document to the action registry: tracks which key
// instances are currently visible, brackets each visible instance's
// lifecycle (onWillAppear/onWillDisappear), and turns action-pushed
// setTitle/setSubtitle/setImage/setState calls into context-addressed render
// messages fanned out to whoever is listening (wsHub, in production).
function createRuntime(initialLayout) {
  let layout = initialLayout;
  let instances = new Map(); // context -> { context, folderId, coord, action, settings, state, title, icon, color }
  const visible = new Set();
  const lastRender = new Map(); // context -> { title, subtitle, image, state }
  const listeners = new Set();
  // Action modules (e.g. the pollers in server/actions/pollHelper.js) track
  // ctx objects by identity in a Set across onWillAppear/onWillDisappear —
  // so the SAME ctx object must be handed out both times for a given
  // context, not a fresh wrapper per call.
  const ctxCache = new Map();

  function indexLayout() {
    const next = new Map();
    for (const [folderId, folder] of Object.entries(layout.folders || {})) {
      for (const [coord, key] of Object.entries(folder.keys || {})) {
        next.set(key.context, {
          context: key.context,
          folderId,
          coord,
          action: key.action,
          settings: key.settings || {},
          state: key.state || 0,
          title: key.title,
          icon: key.icon,
          color: key.color,
        });
      }
    }
    instances = next;
  }
  indexLayout();

  function onRender(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  function emit(context, patch) {
    if (!visible.has(context)) return; // renders for invisible keys are dropped
    const prev = lastRender.get(context) || {};
    const next = { ...prev, ...patch };
    if (JSON.stringify(next) === JSON.stringify(prev)) return; // unchanged values are not re-sent
    lastRender.set(context, next);
    const message = { type: 'render', context, ...patch };
    listeners.forEach((cb) => cb(message));
  }

  // `asActionUuid` is fixed at ctx-creation time (not re-derived per call) so
  // that a render call always checks ownership against the action the
  // instance was bound to *when the ctx was handed out* — this is what makes
  // "an action cannot render into another action's key" a real guarantee
  // rather than a check the caller could race.
  function makeCtxFor(context, asActionUuid) {
    function owns() {
      const inst = instances.get(context);
      return !!inst && inst.action === asActionUuid;
    }
    return {
      get settings() { const inst = instances.get(context); return inst ? inst.settings : {}; },
      get state() { const inst = instances.get(context); return inst ? inst.state : 0; },
      setTitle(title) { if (owns()) emit(context, { title }); },
      setSubtitle(subtitle) { if (owns()) emit(context, { subtitle }); },
      setImage(image) { if (owns()) emit(context, { image }); },
      setState(state) {
        if (!owns()) return;
        instances.get(context).state = state;
        emit(context, { state });
      },
    };
  }

  function makeCtx(context) {
    if (ctxCache.has(context)) return ctxCache.get(context);
    const inst = instances.get(context);
    const ctx = makeCtxFor(context, inst && inst.action);
    ctxCache.set(context, ctx);
    return ctx;
  }

  async function setVisibleContexts(nextVisible) {
    const nextSet = new Set(nextVisible);
    const appearing = [...nextSet].filter((c) => !visible.has(c));
    const disappearing = [...visible].filter((c) => !nextSet.has(c));

    for (const context of disappearing) {
      visible.delete(context);
      const inst = instances.get(context);
      const module = inst && registry.get(inst.action);
      if (module && module.onWillDisappear) {
        try {
          await module.onWillDisappear(makeCtx(context));
        } catch (e) {
          console.error(`onWillDisappear failed for ${inst.action}:`, e.message);
        }
      }
    }

    for (const context of appearing) {
      visible.add(context);
      const inst = instances.get(context);
      const module = inst && registry.get(inst.action);
      if (module && module.onWillAppear) {
        try {
          await module.onWillAppear(makeCtx(context));
        } catch (e) {
          console.error(`onWillAppear failed for ${inst.action}:`, e.message);
        }
      }
    }
  }

  async function keyDown(context) {
    const inst = instances.get(context);
    if (!inst) throw new Error(`Unknown context: ${context}`);
    const module = registry.get(inst.action);
    if (!module) throw new Error(`Unregistered action: ${inst.action}`);
    if (module.onKeyDown) await module.onKeyDown(makeCtx(context));
  }

  // `panelOf` covers the indirection keys use (an Open Panel key pointing at
  // e.g. Audio Devices); falling back to the key's own action lets a key
  // bound directly to a panel-owning action (e.g. OBS Studio, which also
  // needs its own connection settings) open its own panel with no separate
  // indirection key required.
  async function openPanel(context) {
    const inst = instances.get(context);
    if (!inst) throw new Error(`Unknown context: ${context}`);
    const panelOfUuid = inst.settings.panelOf || inst.action;
    const module = registry.get(panelOfUuid);
    if (!module || !module.panel) throw new Error(`No panel available for: ${panelOfUuid}`);
    const data = module.getPanelData ? await module.getPanelData(inst.settings) : {};
    return { context, actionUuid: panelOfUuid, title: module.panel.title, widgets: module.panel.widgets, data };
  }

  // `context` identifies which key triggered the action, so its settings
  // (e.g. an OBS key's host/port/password) can be handed to the action —
  // it's optional since not every panel action needs settings (e.g. Audio's
  // setOutput reads entirely from its own poller cache).
  async function panelAction(actionUuid, context, name, payload) {
    const module = registry.get(actionUuid);
    if (!module) throw new Error(`Unregistered action: ${actionUuid}`);
    if (!module.onPanelAction) throw new Error(`Action has no panel actions: ${actionUuid}`);
    const inst = context ? instances.get(context) : null;
    await module.onPanelAction(name, payload, inst ? inst.settings : undefined);
  }

  function snapshotRenders() {
    return [...visible].map((context) => {
      const inst = instances.get(context);
      const module = registry.get(inst.action);
      const cached = lastRender.get(context) || {};
      return {
        context,
        title: cached.title ?? inst.title,
        subtitle: cached.subtitle,
        image: cached.image ?? (inst.icon ? { icon: inst.icon } : (module ? { icon: module.icon } : undefined)),
        state: cached.state ?? inst.state ?? 0,
      };
    });
  }

  // Reindexes after an edited layout is saved. Contexts that no longer exist
  // are dropped from the visible set; their onWillDisappear is intentionally
  // not invoked here (the client re-sends setVisibleContexts for whatever
  // folder it lands back on after saving, which settles polling correctly —
  // see design.md/tasks.md for why this simplification was accepted).
  function updateLayout(newLayout) {
    layout = newLayout;
    const oldContexts = new Set(instances.keys());
    indexLayout();
    const newContexts = new Set(instances.keys());
    for (const context of oldContexts) {
      if (!newContexts.has(context)) {
        visible.delete(context);
        lastRender.delete(context);
        ctxCache.delete(context);
      }
    }
  }

  function getLayout() {
    return layout;
  }

  // Root-folder keys are visible by default so their actions start polling
  // immediately at startup, before any client has told the runtime what
  // it's looking at. Fire-and-forget: onWillAppear failures are already
  // logged internally by setVisibleContexts and shouldn't block construction.
  setVisibleContexts([...instances.values()].filter((i) => i.folderId === layout.root).map((i) => i.context))
    .catch((e) => console.error('initial visibility bootstrap failed:', e.message));

  return {
    onRender,
    setVisibleContexts,
    keyDown,
    openPanel,
    panelAction,
    snapshotRenders,
    updateLayout,
    getLayout,
    makeCtxFor, // exposed for the cross-context render-refusal test
    getVisible: () => new Set(visible),
  };
}

module.exports = { createRuntime };
