const state = {
  ws: null,
  server: localStorage.getItem('sd-server') || '',
  token: localStorage.getItem('sd-token') || '',
  audio: null,
};

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

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
      } else {
        document.getElementById('pin-error').textContent = 'Wrong pairing token';
      }
      return;
    }

    if (msg.type === 'snapshot') {
      if (msg.payload.audio) renderAudio(msg.payload.audio);
      if (msg.payload.nowPlaying) renderNowPlaying(msg.payload.nowPlaying);
      if (msg.payload.controller) renderController(msg.payload.controller);
      if (msg.payload.systemLoad) renderSystemLoad(msg.payload.systemLoad);
      return;
    }

    if (msg.type === 'state') {
      if (msg.card === 'audio') renderAudio(msg.payload);
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

// Every render target below is looked up by class, and every layout
// (portrait, landscape) that wants to display it just includes an element
// with that class — updating all of them uniformly means a new layout never
// requires touching this rendering logic again.
function setText(className, text) {
  document.querySelectorAll(`.${className}`).forEach((el) => { el.textContent = text; });
}

function renderNowPlaying(nowPlaying) {
  setText('track-title', nowPlaying.title || '—');
  setText('track-artist', nowPlaying.artist || '—');
  const artUrl = nowPlaying.art ? `url(data:image/png;base64,${nowPlaying.art})` : '';
  document.querySelectorAll('.art').forEach((el) => { el.style.backgroundImage = artUrl; });
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
  setText('performance-summary', `CPU ${load.cpu}%`);
  setText('cpu-val', `${load.cpu}%`);
  document.querySelectorAll('.cpu-fill').forEach((el) => { el.style.width = `${load.cpu}%`; });
  setText('gpu-val', `${load.gpu}%`);
  document.querySelectorAll('.gpu-fill').forEach((el) => { el.style.width = `${load.gpu}%`; });
  setText('active-app', load.activeApp || '—');
}

document.getElementById('pin-submit').addEventListener('click', () => {
  const server = document.getElementById('server-input').value.trim();
  const token = document.getElementById('pin-input').value.trim();
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

document.querySelectorAll('[data-launch]').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.ws.send(JSON.stringify({ type: 'command', action: 'launchApp', appId: btn.dataset.launch }));
  });
});

// Portrait's #stack and landscape's .grid-panel each own a `data-screen`
// value independently — scope by closest ancestor rather than hardcoding a
// container, since both layouts share this same click wiring.
document.querySelectorAll('[data-nav]').forEach((el) => {
  el.addEventListener('click', () => {
    el.closest('[data-screen]').dataset.screen = el.dataset.nav;
  });
});

// The QR code printed by the server encodes this page's own URL with a
// `token` query param, so scanning it with the phone's Camera app (not an
// in-page camera capture — that would need HTTPS) opens Safari straight to
// a ready-to-pair link. `location.host` is already this server's address.
const urlToken = new URLSearchParams(location.search).get('token');
if (urlToken) {
  connect(location.host, urlToken);
} else if (state.server && state.token) {
  document.getElementById('server-input').value = state.server;
  connect(state.server, state.token);
}
