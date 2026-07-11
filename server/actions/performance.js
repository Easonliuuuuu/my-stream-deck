const { register } = require('../actionRegistry');
const { getSystemLoad } = require('../services/systemLoad');
const { createPoller } = require('./pollHelper');
const config = require('../config');

function formatUptime(seconds) {
  if (seconds == null) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatNetRate(bytesPerSec) {
  const mbps = (bytesPerSec * 8) / 1_000_000;
  if (mbps < 1) return `${Math.round(bytesPerSec / 1000)} KB/s`;
  return `${mbps.toFixed(1)} Mbps`;
}

const poller = createPoller(getSystemLoad, config.poll.systemLoadMs, (ctx, state) => {
  ctx.setSubtitle(`CPU ${state.cpu}%`);
  ctx.setImage({ icon: 'performance', badge: { kind: 'text', value: `${state.cpu}%` } });
});

register({
  uuid: 'com.streamdeck.system.load',
  name: 'Performance',
  icon: 'performance',
  states: [{}],
  panel: {
    title: 'Performance',
    widgets: [
      { id: 'cpu', type: 'gauge', label: 'CPU', source: 'cpu' },
      { id: 'gpu', type: 'gauge', label: 'GPU', source: 'gpu' },
      { id: 'ram', type: 'gauge', label: 'RAM', source: 'ram' },
      { id: 'activeApp', type: 'row', label: 'Now Focused', source: 'activeApp' },
      { id: 'ramDetail', type: 'row', label: 'Memory', source: 'ramDetail' },
      { id: 'uptime', type: 'row', label: 'Uptime', source: 'uptime' },
      { id: 'network', type: 'row', label: 'Network', source: 'network' },
    ],
  },
  onWillAppear: (ctx) => poller.attach(ctx),
  onWillDisappear: (ctx) => poller.detach(ctx),
  async getPanelData() {
    const state = await poller.getLastOrFetch() || {};
    return {
      cpu: state.cpu,
      gpu: state.gpu,
      ram: state.ramPct,
      activeApp: state.activeApp || '—',
      ramDetail: state.ramUsedGB != null ? `${state.ramUsedGB} / ${state.ramTotalGB} GB` : '—',
      uptime: formatUptime(state.uptimeSeconds),
      network: formatNetRate(state.netBytesPerSec || 0),
    };
  },
});
