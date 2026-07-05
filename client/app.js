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
  if (nowPlaying.art) {
    art.src = `data:image/png;base64,${nowPlaying.art}`;
    art.hidden = false;
  } else {
    art.hidden = true;
  }
}

function renderDevicePicker(containerId, devices, currentId, kind) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  (devices || []).forEach((device) => {
    const btn = document.createElement('button');
    btn.textContent = device.name;
    if (device.id === currentId) btn.classList.add('current');
    btn.addEventListener('click', () => {
      state.ws.send(JSON.stringify({ type: 'command', action: 'setAudioDevice', id: device.id, kind }));
    });
    container.appendChild(btn);
  });
}

function renderAudio(audio) {
  state.audio = audio;
  document.getElementById('audio-output').textContent = audio.output?.current || '—';
  document.getElementById('audio-input').textContent = audio.input?.current || '—';
  renderDevicePicker('output-picker', audio.outputs, audio.output?.id, 'output');
  renderDevicePicker('input-picker', audio.inputs, audio.input?.id, 'input');
}

function renderController(controller) {
  const el = document.querySelector('.controller-status');
  el.textContent = controller.connected
    ? `${controller.battery}%${controller.charging ? ' (charging)' : ''}`
    : 'Disconnected';
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

if (state.server && state.token) {
  document.getElementById('server-input').value = state.server;
  connect(state.server, state.token);
}
