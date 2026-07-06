const state = {
  ws: null,
  server: localStorage.getItem('sd-server') || '',
  token: localStorage.getItem('sd-token') || '',
  audio: null,
  controller: null,
  systemLoad: null,
};

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

// SVG path content for each icon, referenced by name in keys.json.
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
};

const ICON_NAMES    = Object.keys(ICONS).filter((k) => k !== 'settings');
const COLOR_OPTIONS = ['audio', 'controller', 'performance', 'spotify', 'discord', 'steam', 'default'];

// The Settings tile is always appended last by the client; it is not stored in keys.json.
const SETTINGS_KEY = { id: '_settings', label: 'Settings', icon: 'settings', action: 'settings', color: 'settings' };

// Settings editor state: null = list view, -1 = new key, N = editing key at index N.
let currentKeys  = [];
let editingIndex = null;

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function makeIconSvg(name) {
  const paths = ICONS[name] || ICONS.settings;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

// --- Grid rendering ---

function handleKeyAction(key, el) {
  switch (key.action) {
    case 'nav':
    case 'settings':
      el.closest('[data-screen]').dataset.screen = key.action === 'settings' ? 'settings' : key.payload;
      break;
    case 'launch':
      if (state.ws?.readyState === WebSocket.OPEN)
        state.ws.send(JSON.stringify({ type: 'command', action: 'launchApp', appId: key.payload }));
      break;
    case 'system':
      if (state.ws?.readyState === WebSocket.OPEN)
        state.ws.send(JSON.stringify({ type: 'command', action: 'systemAction', payload: key.payload }));
      break;
  }
}

function renderKeyGrid(keys) {
  const allKeys = [...keys, SETTINGS_KEY];

  const portraitGrid = document.getElementById('app-grid');
  if (portraitGrid) {
    portraitGrid.innerHTML = '';
    allKeys.forEach((key) => {
      const btn = document.createElement('button');
      btn.className = `app ${key.color || 'default'}`;
      const hasSub = key.action === 'nav';
      const subClass = hasSub ? `${key.payload}-summary` : '';
      btn.innerHTML = `
        <div class="icon">${makeIconSvg(key.icon)}</div>
        <span class="lbl">${esc(key.label)}</span>
        ${hasSub ? `<span class="sub ${subClass}">—</span>` : ''}
      `.trim();
      btn.addEventListener('click', () => handleKeyAction(key, btn));
      portraitGrid.appendChild(btn);
    });
  }

  const landscapeGrid = document.getElementById('tile-grid');
  if (landscapeGrid) {
    landscapeGrid.innerHTML = '';
    allKeys.forEach((key) => {
      const btn = document.createElement('button');
      btn.className = `tile ${key.color || 'default'}`;
      btn.innerHTML = `<div class="icon">${makeIconSvg(key.icon)}</div><span class="lbl">${esc(key.label)}</span>`;
      btn.addEventListener('click', () => handleKeyAction(key, btn));
      landscapeGrid.appendChild(btn);
    });
  }
}

async function fetchAndRenderKeys() {
  try {
    const res = await fetch(`http://${state.server}/keys`);
    if (res.ok) currentKeys = await res.json();
  } catch {
    // keep whatever is in currentKeys
  }
  renderKeyGrid(currentKeys);
  // Re-apply cached state so subtitles reflect current values immediately.
  if (state.audio)      renderAudio(state.audio);
  if (state.controller) renderController(state.controller);
  if (state.systemLoad) renderSystemLoad(state.systemLoad);
  renderSettingsList();
}

// --- Settings editor ---

function buildPayloadField(action, value = '') {
  if (action === 'nav') {
    const opts = ['audio', 'controller', 'performance'].map((s) =>
      `<option value="${s}"${s === value ? ' selected' : ''}>${s}</option>`).join('');
    return `<select id="edit-payload">${opts}</select>`;
  }
  if (action === 'system') {
    const opts = ['lock', 'sleep'].map((s) =>
      `<option value="${s}"${s === value ? ' selected' : ''}>${s}</option>`).join('');
    return `<select id="edit-payload">${opts}</select>`;
  }
  const placeholder = action === 'launch' ? 'App name (e.g. spotify)' : 'Payload';
  return `<input type="text" id="edit-payload" value="${esc(value)}" placeholder="${placeholder}" autocapitalize="off" autocorrect="off" />`;
}

function buildListHTML() {
  if (!currentKeys.length) {
    return `
      <p class="settings-empty">No keys yet. Add one below.</p>
      <button class="settings-add-btn">+ Add Key</button>
      <button class="settings-save-btn">Save to PC</button>
    `;
  }
  const cards = currentKeys.map((key, i) => `
    <div class="key-card">
      <div class="key-card-icon kc-${esc(key.color || 'default')}">${makeIconSvg(key.icon)}</div>
      <div class="key-card-info">
        <div class="key-card-label">${esc(key.label)}</div>
        <span class="key-card-action">${esc(key.action)}: ${esc(key.payload)}</span>
      </div>
      <div class="key-card-actions">
        <button class="key-card-btn" data-move="-1" data-idx="${i}" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="key-card-btn" data-move="1"  data-idx="${i}" aria-label="Move down" ${i === currentKeys.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="key-card-btn" data-edit="${i}" aria-label="Edit">✎</button>
        <button class="key-card-btn key-card-btn-del" data-del="${i}" aria-label="Delete">✕</button>
      </div>
    </div>
  `).join('');
  return `
    <div class="settings-key-list">${cards}</div>
    <button class="settings-add-btn">+ Add Key</button>
    <button class="settings-save-btn">Save to PC</button>
  `;
}

function buildEditHTML(keyIdx) {
  const key = keyIdx === -1
    ? { label: '', icon: ICON_NAMES[0], action: 'launch', payload: '', color: 'default' }
    : { ...currentKeys[keyIdx] };

  const iconOpts = ICON_NAMES.map((n) =>
    `<option value="${n}"${n === key.icon ? ' selected' : ''}>${n}</option>`).join('');
  const actionOpts = ['nav', 'launch', 'system'].map((a) =>
    `<option value="${a}"${a === key.action ? ' selected' : ''}>${a}</option>`).join('');
  const colorOpts = COLOR_OPTIONS.map((c) =>
    `<option value="${c}"${c === (key.color || 'default') ? ' selected' : ''}>${c}</option>`).join('');

  return `
    <div class="key-edit-form">
      <h3 class="edit-form-title">${keyIdx === -1 ? 'New Key' : 'Edit Key'}</h3>
      <div class="form-row">
        <label for="edit-label">Label</label>
        <input type="text" id="edit-label" value="${esc(key.label)}" placeholder="Key label" />
      </div>
      <div class="form-row">
        <label for="edit-icon">Icon</label>
        <select id="edit-icon">${iconOpts}</select>
      </div>
      <div class="form-row">
        <label for="edit-action">Action</label>
        <select id="edit-action">${actionOpts}</select>
      </div>
      <div class="form-row" id="edit-payload-row">
        <label>Payload</label>
        ${buildPayloadField(key.action, key.payload)}
      </div>
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
    el.innerHTML = editingIndex === null ? buildListHTML() : buildEditHTML(editingIndex);
    attachSettingsHandlers(el);
  });
}

function attachSettingsHandlers(container) {
  if (editingIndex === null) {
    container.querySelectorAll('[data-move]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i   = parseInt(btn.dataset.idx);
        const dir = parseInt(btn.dataset.move);
        const j   = i + dir;
        if (j < 0 || j >= currentKeys.length) return;
        [currentKeys[i], currentKeys[j]] = [currentKeys[j], currentKeys[i]];
        renderKeyGrid(currentKeys);
        renderSettingsList();
      });
    });

    container.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        editingIndex = parseInt(btn.dataset.edit);
        renderSettingsList();
      });
    });

    container.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentKeys.splice(parseInt(btn.dataset.del), 1);
        renderKeyGrid(currentKeys);
        renderSettingsList();
      });
    });

    const addBtn = container.querySelector('.settings-add-btn');
    if (addBtn) addBtn.addEventListener('click', () => {
      editingIndex = -1;
      renderSettingsList();
    });

    const saveBtn = container.querySelector('.settings-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveKeys);
  } else {
    // Swap payload field when action type changes.
    const actionSel = container.querySelector('#edit-action');
    if (actionSel) actionSel.addEventListener('change', () => {
      const row = container.querySelector('#edit-payload-row');
      if (!row) return;
      const lbl = row.querySelector('label');
      row.innerHTML = '';
      if (lbl) row.appendChild(lbl);
      row.insertAdjacentHTML('beforeend', buildPayloadField(actionSel.value));
    });

    const cancelBtn = container.querySelector('#edit-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => {
      editingIndex = null;
      renderSettingsList();
    });

    const doneBtn = container.querySelector('#edit-done');
    if (doneBtn) doneBtn.addEventListener('click', () => {
      const label   = container.querySelector('#edit-label')?.value.trim();
      const icon    = container.querySelector('#edit-icon')?.value;
      const action  = container.querySelector('#edit-action')?.value;
      const payload = container.querySelector('#edit-payload')?.value.trim();
      const color   = container.querySelector('#edit-color')?.value;

      if (!label) {
        const inp = container.querySelector('#edit-label');
        if (inp) { inp.style.borderColor = '#ff9a8b'; setTimeout(() => { inp.style.borderColor = ''; }, 1500); }
        return;
      }

      const key = { id: editingIndex === -1 ? `key-${Date.now()}` : currentKeys[editingIndex].id, label, icon, action, payload, color };
      if (editingIndex === -1) {
        currentKeys.push(key);
      } else {
        currentKeys[editingIndex] = key;
      }
      editingIndex = null;
      renderKeyGrid(currentKeys);
      renderSettingsList();
    });
  }
}

async function saveKeys() {
  try {
    const res = await fetch(`http://${state.server}/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` },
      body: JSON.stringify(currentKeys),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    document.querySelectorAll('.settings-save-btn').forEach((btn) => {
      const orig = btn.textContent;
      btn.textContent = 'Saved ✓';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    });
  } catch (e) {
    console.error('Save failed:', e);
    document.querySelectorAll('.settings-save-btn').forEach((btn) => {
      const orig = btn.textContent;
      btn.textContent = 'Save failed';
      setTimeout(() => { btn.textContent = orig; }, 2000);
    });
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

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === 'auth') {
      if (msg.ok) {
        localStorage.setItem('sd-server', server);
        localStorage.setItem('sd-token', token);
        document.getElementById('pin-screen').hidden = true;
        document.getElementById('app-backdrop').hidden = false;
        document.getElementById('app').hidden = false;
        setDisconnectedBanner(false);
        fetchAndRenderKeys();
      } else {
        document.getElementById('pin-error').textContent = 'Wrong pairing token';
      }
      return;
    }

    if (msg.type === 'snapshot') {
      if (msg.payload.audio)      renderAudio(msg.payload.audio);
      if (msg.payload.nowPlaying) renderNowPlaying(msg.payload.nowPlaying);
      if (msg.payload.controller) renderController(msg.payload.controller);
      if (msg.payload.systemLoad) renderSystemLoad(msg.payload.systemLoad);
      return;
    }

    if (msg.type === 'state') {
      if (msg.card === 'audio')      renderAudio(msg.payload);
      if (msg.card === 'nowPlaying') renderNowPlaying(msg.payload);
      if (msg.card === 'controller') renderController(msg.payload);
      if (msg.card === 'systemLoad') renderSystemLoad(msg.payload);
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

// --- Render functions ---

function setText(className, text) {
  document.querySelectorAll(`.${className}`).forEach((el) => { el.textContent = text; });
}

function renderNowPlaying(nowPlaying) {
  setText('track-title', nowPlaying.title || '—');
  setText('track-artist', nowPlaying.artist || '—');
  const artUrl = nowPlaying.art ? `url(data:image/png;base64,${nowPlaying.art})` : '';
  document.querySelectorAll('.art').forEach((el) => { el.style.backgroundImage = artUrl; });
  document.querySelectorAll('[data-key="PlayPause"]').forEach((el) => {
    el.classList.toggle('is-playing', !!nowPlaying.isPlaying);
  });
}

function renderDevicePicker(containerClass, devices, currentId, kind) {
  document.querySelectorAll(`.${containerClass}`).forEach((container) => {
    container.innerHTML = '';
    (devices || []).forEach((device) => {
      const btn = document.createElement('button');
      btn.className = 'device';
      const isCurrent = device.id === currentId;
      if (isCurrent) btn.classList.add('current');
      btn.innerHTML = `<span>${device.name}</span>${isCurrent ? '<span class="check"></span>' : ''}`;
      btn.addEventListener('click', () => {
        state.ws.send(JSON.stringify({ type: 'command', action: 'setAudioDevice', id: device.id, kind }));
      });
      container.appendChild(btn);
    });
  });
}

function renderAudio(audio) {
  state.audio = audio;
  const outputName = audio.output?.current || '—';
  setText('audio-output', outputName);
  setText('audio-input', audio.input?.current || '—');
  setText('audio-summary', outputName);
  renderDevicePicker('output-picker', audio.outputs, audio.output?.id, 'output');
  renderDevicePicker('input-picker', audio.inputs, audio.input?.id, 'input');
}

function renderController(controller) {
  state.controller = controller;
  const rings = document.querySelectorAll('.batt-ring');

  if (!controller.connected) {
    setText('controller-summary', 'Disconnected');
    rings.forEach((ring) => { ring.classList.add('disconnected'); ring.style.setProperty('--pct', '0%'); });
    setText('batt-pct', '—');
    setText('batt-state', 'Disconnected');
    return;
  }

  const battery = controller.battery ?? 0;
  setText('controller-summary', controller.battery == null ? '…' : `${battery}%`);
  rings.forEach((ring) => { ring.classList.remove('disconnected'); ring.style.setProperty('--pct', `${battery}%`); });
  setText('batt-pct', controller.battery == null ? '…' : `${battery}%`);
  setText('batt-state', controller.charging ? 'Charging' : 'Not charging');
}

function renderSystemLoad(load) {
  state.systemLoad = load;
  setText('performance-summary', `CPU ${load.cpu}%`);
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
// value independently — scope by closest ancestor.
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
