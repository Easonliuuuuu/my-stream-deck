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
      return;
    }

    if (msg.type === 'state') {
      if (msg.card === 'audio') renderAudio(msg.payload);
      if (msg.card === 'nowPlaying') renderNowPlaying(msg.payload);
      if (msg.card === 'controller') renderController(msg.payload);
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

function renderNowPlaying(nowPlaying) {
  document.querySelector('.track-title').textContent = nowPlaying.title || '—';
  document.querySelector('.track-artist').textContent = nowPlaying.artist || '—';
  const art = document.getElementById('art');
  art.style.backgroundImage = nowPlaying.art ? `url(data:image/png;base64,${nowPlaying.art})` : '';
}

function renderDevicePicker(containerId, devices, currentId, kind) {
  const container = document.getElementById(containerId);
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
}

function renderAudio(audio) {
  state.audio = audio;
  const outputName = audio.output?.current || '—';
  document.getElementById('audio-output').textContent = outputName;
  document.getElementById('audio-input').textContent = audio.input?.current || '—';
  document.getElementById('audio-summary').textContent = outputName;
  renderDevicePicker('output-picker', audio.outputs, audio.output?.id, 'output');
  renderDevicePicker('input-picker', audio.inputs, audio.input?.id, 'input');
}

function renderController(controller) {
  const summary = document.getElementById('controller-summary');
  const ring = document.getElementById('batt-ring');
  const pct = document.getElementById('batt-pct');
  const stateLabel = document.getElementById('batt-state');

  if (!controller.connected) {
    summary.textContent = 'Disconnected';
    ring.classList.add('disconnected');
    ring.style.setProperty('--pct', '0%');
    pct.textContent = '—';
    stateLabel.textContent = 'Disconnected';
    return;
  }

  const battery = controller.battery ?? 0;
  summary.textContent = controller.battery == null ? '…' : `${battery}%`;
  ring.classList.remove('disconnected');
  ring.style.setProperty('--pct', `${battery}%`);
  pct.textContent = controller.battery == null ? '…' : `${battery}%`;
  stateLabel.textContent = controller.charging ? 'Charging' : 'Not charging';
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

document.querySelectorAll('.transport button').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.ws.send(JSON.stringify({ type: 'command', action: 'mediaKey', key: btn.dataset.key }));
  });
});

document.querySelectorAll('[data-nav]').forEach((el) => {
  el.addEventListener('click', () => {
    document.getElementById('stack').dataset.screen = el.dataset.nav;
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
