// The action registry is the only extension point in the app: registering a
// module here is the sole step required to make a capability bindable to a
// key. See design.md for why the module shape mirrors the Elgato SDK
// lifecycle (onWillAppear/onKeyDown/onWillDisappear) — that shape is what
// lets a future plugin process boundary be a single adapter module instead of
// a rewrite of every call site.

const SUPPORTED_WIDGETS = new Set(['row', 'picker', 'gauge', 'button']);

const modules = new Map();

function validatePanel(uuid, panel) {
  for (const widget of panel.widgets || []) {
    if (!SUPPORTED_WIDGETS.has(widget.type)) {
      throw new Error(`Action "${uuid}" panel declares unsupported widget type: "${widget.type}"`);
    }
  }
}

function register(action) {
  if (!action || typeof action.uuid !== 'string' || !action.uuid) {
    throw new Error('Action must declare a non-empty string uuid');
  }
  if (modules.has(action.uuid)) {
    throw new Error(`Duplicate action uuid: ${action.uuid}`);
  }
  if (!Array.isArray(action.states) || action.states.length === 0) {
    throw new Error(`Action "${action.uuid}" must declare at least one state`);
  }
  if (action.panel) validatePanel(action.uuid, action.panel);

  modules.set(action.uuid, action);
}

function get(uuid) {
  return modules.get(uuid);
}

function has(uuid) {
  return modules.has(uuid);
}

function all() {
  return [...modules.values()];
}

// Test-only: registration happens once at process startup in production: a
// duplicate-uuid error is a real startup failure there. Tests need a clean
// slate between cases.
function clear() {
  modules.clear();
}

module.exports = { register, get, has, all, clear, SUPPORTED_WIDGETS };
