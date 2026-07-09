const { register } = require('../actionRegistry');
const { getSystemLoad } = require('../services/systemLoad');
const { createPoller } = require('./pollHelper');
const config = require('../config');

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
      { id: 'activeApp', type: 'row', label: 'Now Focused', source: 'activeApp' },
    ],
  },
  onWillAppear: (ctx) => poller.attach(ctx),
  onWillDisappear: (ctx) => poller.detach(ctx),
  async getPanelData() {
    const state = await poller.getLastOrFetch() || {};
    return { cpu: state.cpu, gpu: state.gpu, activeApp: state.activeApp || '—' };
  },
});
