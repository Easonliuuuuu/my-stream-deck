const { register } = require('../actionRegistry');
const { getControllerState } = require('../services/controllerBattery');
const { createPoller } = require('./pollHelper');
const config = require('../config');

const poller = createPoller(async () => getControllerState(), config.poll.controllerMs, (ctx, state) => {
  if (!state.connected) {
    ctx.setSubtitle('Disconnected');
    ctx.setImage({ icon: 'controller', badge: { kind: 'ring', pct: 0 } });
    return;
  }
  const pct = state.battery ?? 0;
  ctx.setSubtitle(state.battery == null ? '…' : `${pct}%`);
  ctx.setImage({ icon: 'controller', badge: { kind: 'ring', pct } });
});

register({
  uuid: 'com.streamdeck.controller.battery',
  name: 'Controller Battery',
  icon: 'controller',
  states: [{}],
  panel: {
    title: 'Controller',
    widgets: [
      { id: 'link', type: 'row', label: 'Link', source: 'link' },
      { id: 'device', type: 'row', label: 'Device', source: 'device' },
      { id: 'battery', type: 'row', label: 'Battery', source: 'battery' },
    ],
  },
  onWillAppear: (ctx) => poller.attach(ctx),
  onWillDisappear: (ctx) => poller.detach(ctx),
  async getPanelData() {
    const state = await poller.getLastOrFetch();
    return {
      link: 'Bluetooth',
      device: 'DualSense',
      battery: state.connected ? (state.battery == null ? '…' : `${state.battery}%`) : 'Disconnected',
    };
  },
});
