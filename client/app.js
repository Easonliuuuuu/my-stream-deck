const state = {
  ws: null,
  server: localStorage.getItem('sd-server') || '',
  token: localStorage.getItem('sd-token') || '',
  layout: null,             // full layout document from the server
  renders: new Map(),       // context -> { title, subtitle, image, state }
  actions: [],              // registered action metadata from GET /actions
  currentFolderId: null,
  folderStack: [],          // breadcrumb of folder ids, for back-navigation across nested folders
  currentPanel: null,       // the last {context, actionUuid, title, widgets, data} received
  editingContext: null,     // null = list view; 'new'; or the coord string of the key being edited
  audio: null,
  controller: null,
  systemLoad: null,
};

// Testability hook: `state` is module-local (const, not a global) even
// though app.js is a classic script, so an E2E test driving the page
// directly (see client/test/ui.test.js) needs an explicit handle onto it.
window.state = state;

// Keeps the phone's screen from sleeping while the app is open. Falls back to
// a looping video on iOS since the server is plain http on the LAN, which
// doesn't qualify as a secure context for the native Wake Lock API — and that
// fallback needs a real user gesture to start, hence the one-time click below.
const noSleep = new NoSleep();
document.addEventListener('click', () => noSleep.enable().catch(() => {}), { once: true });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

// SVG path content for each icon, referenced by name. This is a fixed,
// built-in icon asset library the client draws itself — actions merely name
// one to use (or a key instance overrides it) — not an enum the editor
// hardcodes as the set of available *actions*. Custom icon upload is
// deferred (see proposal.md Non-Goals: custom-key-imagery).
const ICONS = {
  audio:       '<path d="M3 9v6h4l5 4V5L7 9H3z"/><path d="M16 8a5 5 0 0 1 0 8"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>',
  controller:  '<path d="M6 8h12a4 4 0 0 1 4 4l1 5a2.5 2.5 0 0 1-4.6 1.4L16 16H8l-2.4 2.4A2.5 2.5 0 0 1 1 17l1-5a4 4 0 0 1 4-4z"/><circle cx="17" cy="11" r="0.8" fill="currentColor" stroke="none"/><circle cx="15" cy="13" r="0.8" fill="currentColor" stroke="none"/>',
  performance: '<path d="M3 12h4l2-7 4 14 2-7h6"/>',
  spotify:     '<path d="M7 15V9"/><path d="M12 17V7"/><path d="M17 13v-2"/>',
  discord:     '<path d="M5 5h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H10l-4 3.5V15H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>',
  steam:       '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  settings:    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1-.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  lock:        '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  sleep:       '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  folder:      '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>',
  launch:      '<path d="M5 19 19 5"/><path d="M9 5h10v10"/>',
  default:     '<circle cx="12" cy="12" r="8"/>',
};

const ICON_NAMES    = Object.keys(ICONS);
const COLOR_OPTIONS = ['audio', 'controller', 'performance', 'spotify', 'discord', 'steam', 'folder', 'default'];

let settingsMessage = null;

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function makeIconSvg(name) {
  const paths = ICONS[name] || ICONS.default;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

// Applies a setImage push: either a raw data URI (string — e.g. album art)
// or a structured { icon, badge } descriptor the client draws itself. See
// design.md for why imagery is composed client-side rather than rasterized
// on the server.
function applyImage(iconEl, image) {
  iconEl.innerHTML = '';
  if (!image) return;

  if (typeof image === 'string') {
    const img = document.createElement('img');
    img.src = image;
    img.alt = '';
    iconEl.appendChild(img);
    return;
  }

  iconEl.innerHTML = makeIconSvg(image.icon);
  if (image.badge?.kind === 'ring') {
    const ring = document.createElement('div');
    ring.className = 'badge-ring';
    ring.style.setProperty('--pct', `${image.badge.pct}%`);
    iconEl.appendChild(ring);
  } else if (image.badge?.kind === 'text') {
    const badge = document.createElement('span');
    badge.className = 'badge-text';
    badge.textContent = image.badge.value;
    iconEl.appendChild(badge);
  }
}

function sendCommand(command) {
  if (state.ws?.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: 'command', ...command }));
  }
}

// --- Layout / folder helpers ---

function currentFolder() {
  return state.layout?.folders[state.currentFolderId];
}

function sortedKeyEntries(folder) {
  return Object.entries(folder?.keys || {}).sort(([a], [b]) => {
    const [ac, ar] = a.split(',').map(Number);
    const [bc, br] = b.split(',').map(Number);
    return ar - br || ac - bc;
  });
}

function actionMeta(uuid) {
  return state.actions.find((a) => a.uuid === uuid);
}

function contextsInFolder(folder) {
  return Object.values(folder?.keys || {}).map((k) => k.context);
}

function firstEmptyCoord(folder) {
  const { cols, rows } = state.layout.grid;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const coord = `${col},${row}`;
      if (!folder.keys[coord]) return coord;
    }
  }
  return null;
}

function countSettingsKeys() {
  let count = 0;
  Object.values(state.layout.folders).forEach((f) => {
    Object.values(f.keys || {}).forEach((k) => { if (k.action === 'com.streamdeck.core.settings') count += 1; });
  });
  return count;
}

// --- Grid rendering ---

function keyDisplay(key) {
  const render = state.renders.get(key.context) || {};
  const meta = actionMeta(key.action);
  return {
    title: render.title ?? key.title ?? meta?.name ?? '',
    subtitle: render.subtitle,
    image: render.image ?? (key.icon ? { icon: key.icon } : (meta ? { icon: meta.icon } : { icon: 'default' })),
    color: key.color || 'default',
  };
}

function handleKeyActivate(key) {
  if (key.action === 'com.streamdeck.core.openFolder') {
    navigateToFolder(key.settings.folderId);
    return;
  }
  if (key.action === 'com.streamdeck.core.openPanel') {
    sendCommand({ action: 'openPanel', context: key.context });
    return;
  }
  if (key.action === 'com.streamdeck.core.settings') {
    openSettingsScreen();
    return;
  }
  sendCommand({ action: 'keyDown', context: key.context });
}

// Patches an existing key button's label/subtitle/icon in place — used both
// by the initial grid build and by live render updates, so a poll tick for
// one key (e.g. CPU% every few seconds) never touches any other key's DOM
// node. Rebuilding the whole grid on every push was the original approach;
// it replayed the `.icon`'s key-boot entrance animation on every key each
// time, which is what read as constant flickering.
function applyKeyDisplay(btn, display) {
  const lbl = btn.querySelector('.lbl');
  if (lbl) lbl.textContent = display.title;
  else btn.insertAdjacentHTML('beforeend', `<span class="lbl">${esc(display.title)}</span>`);

  let sub = btn.querySelector('.sub');
  if (display.subtitle) {
    if (!sub) {
      sub = document.createElement('span');
      sub.className = 'sub';
      btn.appendChild(sub);
    }
    sub.textContent = display.subtitle;
  } else if (sub) {
    sub.remove();
  }

  applyImage(btn.querySelector('.icon'), display.image);
}

function renderGridInto(containerEl, folder, cssClass) {
  if (!containerEl) return;
  containerEl.innerHTML = '';

  // Nested folders (only reachable via a user-created openFolder key — the
  // default layout has none) get a synthetic back tile; the top-level
  // grid/panel/settings toggle has its own static back buttons in index.html.
  if (state.folderStack.length > 0) {
    const backBtn = document.createElement('button');
    backBtn.className = `${cssClass} folder`;
    backBtn.innerHTML = `<div class="icon">${makeIconSvg('folder')}</div><span class="lbl">‹ Back</span>`;
    backBtn.addEventListener('click', navigateBackFolder);
    containerEl.appendChild(backBtn);
  }

  sortedKeyEntries(folder).forEach(([, key]) => {
    const display = keyDisplay(key);
    const btn = document.createElement('button');
    btn.dataset.context = key.context;
    btn.className = `${cssClass} ${display.color}`;
    btn.innerHTML = '<div class="icon"></div>';
    btn.addEventListener('click', () => handleKeyActivate(key));
    containerEl.appendChild(btn);
    applyKeyDisplay(btn, display);
  });
}

function renderGrid() {
  const folder = currentFolder();
  if (!folder) return;
  renderGridInto(document.getElementById('app-grid'), folder, 'app');
  renderGridInto(document.getElementById('tile-grid'), folder, 'tile');
}

// Called for a single context when a render message arrives — patches just
// that key's button(s) in both grids without rebuilding the rest.
function updateKeyRender(context) {
  const folder = currentFolder();
  const key = Object.values(folder?.keys || {}).find((k) => k.context === context);
  if (!key) return; // key isn't in the currently-viewed folder; nothing to patch
  document.querySelectorAll(`[data-context="${context}"]`).forEach((btn) => {
    applyKeyDisplay(btn, keyDisplay(key));
  });
}

function reportVisibility() {
  const folder = currentFolder();
  if (!folder) return;
  sendCommand({ action: 'setVisibleContexts', contexts: contextsInFolder(folder) });
}

function navigateToFolder(folderId) {
  if (!state.layout.folders[folderId]) return;
  state.folderStack.push(state.currentFolderId);
  state.currentFolderId = folderId;
  renderGrid();
  reportVisibility();
  setScreen('grid');
}

function navigateBackFolder() {
  const prev = state.folderStack.pop();
  if (!prev) return;
  state.currentFolderId = prev;
  renderGrid();
  reportVisibility();
}

// name: 'grid' | 'panel' | 'settings'
function setScreen(name) {
  const stack = document.getElementById('stack');
  if (stack) stack.dataset.screen = name === 'grid' ? 'home' : name;
  const gridPanel = document.querySelector('.grid-panel');
  if (gridPanel) gridPanel.dataset.screen = name;
}

// --- Panels ---

function renderWidget(widget, data) {
  if (widget.type === 'row') {
    const value = data?.[widget.source];
    return `<div class="d-row"><span class="k">${esc(widget.label)}</span><span class="v">${esc(value == null || value === '' ? '—' : String(value))}</span></div>`;
  }
  if (widget.type === 'gauge') {
    const value = data?.[widget.source] ?? 0;
    const cls = /gpu/i.test(widget.id) ? 'gpu' : 'cpu';
    return `
      <div class="load-row">
        <div class="load-label"><span class="k">${esc(widget.label)}</span><span class="v">${esc(value)}%</span></div>
        <div class="load-bar"><div class="load-fill ${cls}" style="width:${Number(value) || 0}%"></div></div>
      </div>`;
  }
  if (widget.type === 'picker') {
    const options = data?.[widget.source] || [];
    const current = data?.[widget.currentSource];
    const items = options.map((opt) => `
      <button class="device ${opt.id === current ? 'current' : ''}" data-picker-id="${esc(opt.id)}">
        <span>${esc(opt.name)}</span>${opt.id === current ? '<span class="check"></span>' : ''}
      </button>`).join('');
    return `<div class="picker" data-onselect="${esc(widget.onSelect)}">${items}</div>`;
  }
  return '';
}

// Consecutive row/gauge widgets share one card (matching the original
// hand-written detail screens, e.g. Performance's CPU+GPU+Now-Focused card);
// each picker widget gets its own card (matching Audio's separate
// output/input cards).
function renderPanelBody(widgets, data) {
  const groups = [];
  let current = [];
  (widgets || []).forEach((w) => {
    if (w.type === 'picker') {
      if (current.length) { groups.push(current); current = []; }
      groups.push([w]);
    } else {
      current.push(w);
    }
  });
  if (current.length) groups.push(current);

  return groups.map((g) => `<div class="card">${g.map((w) => renderWidget(w, data)).join('')}</div>`).join('');
}

function attachPanelHandlers(container) {
  container.querySelectorAll('.picker').forEach((pickerEl) => {
    pickerEl.querySelectorAll('[data-picker-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        sendCommand({
          action: 'panelAction',
          actionUuid: state.currentPanel.actionUuid,
          name: pickerEl.dataset.onselect,
          payload: { id: btn.dataset.pickerId },
        });
      });
    });
  });
}

function handlePanelMessage(msg) {
  state.currentPanel = msg;
  document.querySelectorAll('.panel-title').forEach((el) => { el.textContent = msg.title; });
  document.querySelectorAll('.panel-body').forEach((el) => {
    el.innerHTML = renderPanelBody(msg.widgets, msg.data);
    attachPanelHandlers(el);
  });
  setScreen('panel');
}

// --- Settings editor ---

function showSettingsMessage(text) {
  settingsMessage = text;
  renderSettingsList();
}

function buildSettingsFields(schema, values) {
  if (!schema || !Object.keys(schema).length) return '';
  return Object.entries(schema).map(([name, field]) => {
    const value = values?.[name] ?? '';
    if (field.type === 'select') {
      const opts = (field.options || []).map((o) =>
        `<option value="${esc(o)}"${o === value ? ' selected' : ''}>${esc(o)}</option>`).join('');
      return `<label for="setting-${esc(name)}">${esc(name)}</label><select id="setting-${esc(name)}" data-setting="${esc(name)}">${opts}</select>`;
    }
    return `<label for="setting-${esc(name)}">${esc(name)}</label><input type="text" id="setting-${esc(name)}" data-setting="${esc(name)}" value="${esc(String(value))}" autocapitalize="off" autocorrect="off" />`;
  }).join('');
}

function buildListHTML() {
  const folder = currentFolder();
  const entries = sortedKeyEntries(folder);
  const message = settingsMessage ? `<p class="settings-empty">${esc(settingsMessage)}</p>` : '';

  if (!entries.length) {
    return `
      ${message}
      <p class="settings-empty">No keys yet. Add one below.</p>
      <button class="settings-add-btn">+ Add Key</button>
      <button class="settings-save-btn">Save to PC</button>
    `;
  }

  const cards = entries.map(([coord, key], i) => {
    const meta = actionMeta(key.action);
    return `
    <div class="key-card">
      <div class="key-card-icon kc-${esc(key.color || 'default')}">${makeIconSvg(key.icon || meta?.icon)}</div>
      <div class="key-card-info">
        <div class="key-card-label">${esc(key.title || meta?.name || key.action)}</div>
        <span class="key-card-action">${esc(meta?.name || key.action)}</span>
      </div>
      <div class="key-card-actions">
        <button class="key-card-btn" data-move="-1" data-coord="${coord}" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="key-card-btn" data-move="1"  data-coord="${coord}" aria-label="Move down" ${i === entries.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="key-card-btn" data-edit="${coord}" aria-label="Edit">✎</button>
        <button class="key-card-btn key-card-btn-del" data-del="${coord}" aria-label="Delete">✕</button>
      </div>
    </div>`;
  }).join('');

  return `
    ${message}
    <div class="settings-key-list">${cards}</div>
    <button class="settings-add-btn">+ Add Key</button>
    <button class="settings-save-btn">Save to PC</button>
  `;
}

function buildEditHTML(coord) {
  const isNew = coord === 'new';
  const key = isNew
    ? { title: '', icon: ICON_NAMES[0], action: state.actions[0]?.uuid || '', settings: {}, color: 'default' }
    : { ...currentFolder().keys[coord] };

  const actionOpts = state.actions.map((a) =>
    `<option value="${esc(a.uuid)}"${a.uuid === key.action ? ' selected' : ''}>${esc(a.name)}</option>`).join('');
  const iconOpts = ICON_NAMES.map((n) =>
    `<option value="${n}"${n === (key.icon || '') ? ' selected' : ''}>${n}</option>`).join('');
  const colorOpts = COLOR_OPTIONS.map((c) =>
    `<option value="${c}"${c === (key.color || 'default') ? ' selected' : ''}>${c}</option>`).join('');

  const meta = actionMeta(key.action);

  return `
    <div class="key-edit-form">
      <h3 class="edit-form-title">${isNew ? 'New Key' : 'Edit Key'}</h3>
      <div class="form-row">
        <label for="edit-title">Label</label>
        <input type="text" id="edit-title" value="${esc(key.title || '')}" placeholder="Key label" />
      </div>
      <div class="form-row">
        <label for="edit-icon">Icon</label>
        <select id="edit-icon">${iconOpts}</select>
      </div>
      <div class="form-row">
        <label for="edit-action">Action</label>
        <select id="edit-action">${actionOpts}</select>
      </div>
      <div class="form-row" id="edit-settings-fields">${buildSettingsFields(meta?.settingsSchema, key.settings)}</div>
      <div class="form-row">
        <label for="edit-color">Color</label>
        <select id="edit-color">${colorOpts}</select>
      </div>
      <div class="form-actions">
        <button class="btn-ghost" id="edit-cancel">Cancel</button>
        <button class="btn-primary" id="edit-done">Done</button>
      </div>
    </div>
  `;
}

function renderSettingsList() {
  ['settings-portrait', 'settings-landscape'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = state.editingContext === null ? buildListHTML() : buildEditHTML(state.editingContext);
    attachSettingsHandlers(el);
  });
}

function moveKey(coord, dir) {
  const folder = currentFolder();
  const entries = sortedKeyEntries(folder);
  const i = entries.findIndex(([c]) => c === coord);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= entries.length) return;
  const [coordA, keyA] = entries[i];
  const [coordB, keyB] = entries[j];
  folder.keys[coordA] = keyB;
  folder.keys[coordB] = keyA;
}

function deleteKey(coord) {
  const folder = currentFolder();
  const key = folder.keys[coord];
  if (key?.action === 'com.streamdeck.core.settings' && countSettingsKeys() <= 1) {
    showSettingsMessage('Cannot delete the last Settings key — add another before removing this one.');
    return;
  }
  delete folder.keys[coord];
  settingsMessage = null;
}

function attachSettingsHandlers(container) {
  if (state.editingContext === null) {
    container.querySelectorAll('[data-move]').forEach((btn) => {
      btn.addEventListener('click', () => {
        moveKey(btn.dataset.coord, parseInt(btn.dataset.move, 10));
        renderGrid();
        renderSettingsList();
      });
    });

    container.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.editingContext = btn.dataset.edit;
        renderSettingsList();
      });
    });

    container.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        deleteKey(btn.dataset.del);
        renderGrid();
        renderSettingsList();
      });
    });

    const addBtn = container.querySelector('.settings-add-btn');
    if (addBtn) addBtn.addEventListener('click', () => {
      settingsMessage = null;
      state.editingContext = 'new';
      renderSettingsList();
    });

    const saveBtn = container.querySelector('.settings-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveLayoutToServer);
  } else {
    const coord = state.editingContext;

    const actionSel = container.querySelector('#edit-action');
    if (actionSel) actionSel.addEventListener('change', () => {
      const meta = actionMeta(actionSel.value);
      const row = container.querySelector('#edit-settings-fields');
      if (row) row.innerHTML = buildSettingsFields(meta?.settingsSchema, {});
    });

    const cancelBtn = container.querySelector('#edit-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => {
      state.editingContext = null;
      renderSettingsList();
    });

    const doneBtn = container.querySelector('#edit-done');
    if (doneBtn) doneBtn.addEventListener('click', () => {
      const title  = container.querySelector('#edit-title')?.value.trim();
      const icon   = container.querySelector('#edit-icon')?.value;
      const action = container.querySelector('#edit-action')?.value;
      const color  = container.querySelector('#edit-color')?.value;
      const settings = {};
      container.querySelectorAll('[data-setting]').forEach((el) => { settings[el.dataset.setting] = el.value; });

      if (!title) {
        const inp = container.querySelector('#edit-title');
        if (inp) { inp.style.borderColor = '#ff9a8b'; setTimeout(() => { inp.style.borderColor = ''; }, 1500); }
        return;
      }

      const folder = currentFolder();
      if (coord === 'new') {
        const newCoord = firstEmptyCoord(folder);
        if (!newCoord) { showSettingsMessage('Grid is full — remove a key first.'); return; }
        folder.keys[newCoord] = { context: `ctx-${crypto.randomUUID()}`, action, settings, state: 0, title, icon, color };
      } else {
        folder.keys[coord] = { ...folder.keys[coord], action, settings, title, icon, color };
      }

      settingsMessage = null;
      state.editingContext = null;
      renderGrid();
      renderSettingsList();
    });
  }
}

function openSettingsScreen() {
  settingsMessage = null;
  renderSettingsList();
  setScreen('settings');
}

async function saveLayoutToServer() {
  try {
    const res = await fetch(`http://${state.server}/layout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
      body: JSON.stringify(state.layout),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    document.querySelectorAll('.settings-save-btn').forEach((btn) => {
      const orig = btn.textContent;
      btn.textContent = 'Saved ✓';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    });
    reportVisibility();
  } catch (e) {
    console.error('Save failed:', e);
    document.querySelectorAll('.settings-save-btn').forEach((btn) => {
      const orig = btn.textContent;
      btn.textContent = 'Save failed';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    });
    showSettingsMessage(`Save failed: ${e.message}`);
  }
}

// --- Actions list ---

async function fetchActions() {
  try {
    const res = await fetch(`http://${state.server}/actions`, {
      headers: { 'Authorization': `Bearer ${state.token}` },
    });
    if (res.ok) state.actions = await res.json();
  } catch {
    // keep whatever is cached
  }
}

// --- Connection & UI state ---

function setDisconnectedBanner(visible) {
  document.getElementById('disconnected-banner').hidden = !visible;
  const status = document.getElementById('conn-status');
  status.classList.toggle('warn', visible);
  status.lastChild.textContent = visible ? 'Reconnecting…' : 'Connected';
}

function connect(server, token) {
  const ws = new WebSocket(`ws://${server}`);
  state.ws = ws;

  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'auth', token }));
  });

  ws.addEventListener('message', async (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === 'auth') {
      if (msg.ok) {
        state.server = server;
        state.token = token;
        localStorage.setItem('sd-server', server);
        localStorage.setItem('sd-token', token);
        document.getElementById('pin-screen').hidden = true;
        document.getElementById('app-backdrop').hidden = false;
        document.getElementById('app').hidden = false;
        setDisconnectedBanner(false);
        await fetchActions();
      } else {
        document.getElementById('pin-error').textContent = 'Wrong pairing token';
      }
      return;
    }

    if (msg.type === 'snapshot') {
      state.layout = msg.payload.layout;
      state.currentFolderId = state.layout.root;
      state.folderStack = [];
      state.renders.clear();
      (msg.payload.renders || []).forEach((r) => state.renders.set(r.context, r));
      if (msg.payload.nowPlaying) applyNowPlaying(msg.payload.nowPlaying);
      if (msg.payload.systemLoad) applySystemLoadChrome(msg.payload.systemLoad);
      renderGrid();
      renderSettingsList();
      reportVisibility();
      return;
    }

    if (msg.type === 'render') {
      const { context, ...patch } = msg;
      delete patch.type;
      state.renders.set(context, { ...(state.renders.get(context) || {}), ...patch });
      updateKeyRender(context);
      return;
    }

    if (msg.type === 'panel') {
      handlePanelMessage(msg);
      return;
    }

    if (msg.type === 'state') {
      if (msg.card === 'nowPlaying') applyNowPlaying(msg.payload);
      if (msg.card === 'systemLoad') applySystemLoadChrome(msg.payload);
      return;
    }

    if (msg.type === 'error') {
      console.error('Server error:', msg.message);
    }
  });

  ws.addEventListener('close', () => {
    setDisconnectedBanner(true);
    setTimeout(() => connect(server, token), 2000);
  });
}

// --- Fixed UI chrome: now-playing strip and the landscape info-panel ---
// These are not user-configurable keys (see design.md's "hybrid" decision —
// the persistent landscape panel and the portrait now-strip are a deliberate
// divergence from the reference model), so they're fed by their own
// always-on broadcasts rather than the context/render protocol.

function setText(className, text) {
  document.querySelectorAll(`.${className}`).forEach((el) => { el.textContent = text; });
}

// SMTC thumbnails aren't always PNG (JPEG is common); sniff the actual
// format from the base64 header instead of assuming one, since a wrong
// declared mime type is a real (if browser-tolerant) correctness bug.
function sniffImageMime(base64) {
  if (base64.startsWith('iVBORw0KGgo')) return 'image/png';
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('R0lGOD')) return 'image/gif';
  if (base64.startsWith('Qk')) return 'image/bmp';
  return 'image/png';
}

function applyNowPlaying(nowPlaying) {
  setText('track-title', nowPlaying.title || '—');
  setText('track-artist', nowPlaying.artist || '—');
  const artUrl = nowPlaying.art ? `url(data:${sniffImageMime(nowPlaying.art)};base64,${nowPlaying.art})` : '';
  document.querySelectorAll('.art').forEach((el) => { el.style.backgroundImage = artUrl; });
  document.querySelectorAll('[data-key="PlayPause"]').forEach((el) => {
    el.classList.toggle('is-playing', !!nowPlaying.isPlaying);
  });
}

function applySystemLoadChrome(load) {
  state.systemLoad = load;
  setText('cpu-val', `${load.cpu}%`);
  document.querySelectorAll('.cpu-fill').forEach((el) => { el.style.width = `${load.cpu}%`; });
  setText('gpu-val', `${load.gpu}%`);
  document.querySelectorAll('.gpu-fill').forEach((el) => { el.style.width = `${load.gpu}%`; });
  setText('active-app', load.activeApp || '—');
}

// --- Pairing ---

function parsePairingUrl(text) {
  try {
    const url = new URL(text);
    const token = url.searchParams.get('token');
    if (!token) return null;
    return { server: url.host, token };
  } catch {
    return null;
  }
}

function readPinFields() {
  const serverInput = document.getElementById('server-input');
  const pinInput    = document.getElementById('pin-input');
  const parsed      = parsePairingUrl(pinInput.value.trim()) || parsePairingUrl(serverInput.value.trim());
  if (parsed) return parsed;
  return { server: serverInput.value.trim(), token: pinInput.value.trim() };
}

document.getElementById('pin-submit').addEventListener('click', () => {
  const { server, token } = readPinFields();
  if (!server || !token) {
    document.getElementById('pin-error').textContent = 'Enter the PC address and pairing token';
    return;
  }
  connect(server, token);
});

document.querySelectorAll('[data-key]').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.ws.send(JSON.stringify({ type: 'command', action: 'mediaKey', key: btn.dataset.key }));
  });
});

// Portrait's #stack and landscape's .grid-panel each own a `data-screen`
// value independently — scope by closest ancestor. This toggles between the
// grid, the currently-open panel, and settings; it does not change which
// folder's keys are showing (see navigateToFolder/navigateBackFolder).
document.querySelectorAll('[data-nav]').forEach((el) => {
  el.addEventListener('click', () => {
    el.closest('[data-screen]').dataset.screen = el.dataset.nav;
  });
});

const urlToken = new URLSearchParams(location.search).get('token');
if (urlToken) {
  connect(location.host, urlToken);
} else if (state.server && state.token) {
  document.getElementById('server-input').value = state.server;
  connect(state.server, state.token);
}

document.body.addEventListener('touchstart', () => {}, { passive: true });
