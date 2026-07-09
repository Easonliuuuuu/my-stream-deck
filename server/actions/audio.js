const { register } = require('../actionRegistry');
const { getAudioState, setAudioDevice } = require('../services/audioDevices');
const { validateDynamicOption } = require('../settingsSchema');
const { createPoller } = require('./pollHelper');
const config = require('../config');

const poller = createPoller(getAudioState, config.poll.audioMs, (ctx, state) => {
  ctx.setSubtitle(state.output?.current || '—');
});

register({
  uuid: 'com.streamdeck.audio.devices',
  name: 'Audio Devices',
  icon: 'audio',
  states: [{}],
  panel: {
    title: 'Audio',
    widgets: [
      { id: 'output', type: 'picker', label: 'Output', source: 'outputs', currentSource: 'currentOutput', onSelect: 'setOutput' },
      { id: 'input', type: 'picker', label: 'Input', source: 'inputs', currentSource: 'currentInput', onSelect: 'setInput' },
    ],
  },
  onWillAppear: (ctx) => poller.attach(ctx),
  onWillDisappear: (ctx) => poller.detach(ctx),
  async getPanelData() {
    const state = await poller.getLastOrFetch() || {};
    return {
      outputs: state.outputs || [],
      currentOutput: state.output?.id,
      inputs: state.inputs || [],
      currentInput: state.input?.id,
    };
  },
  async onPanelAction(name, payload) {
    const state = await poller.getLastOrFetch();
    if (name === 'setOutput' || name === 'setInput') {
      const list = name === 'setOutput' ? state?.outputs : state?.inputs;
      // Re-checked here even though the client only ever offers ids it just
      // received in getPanelData — the list can go stale between the picker
      // rendering and the tap (a device unplugged mid-glance), and this is
      // the boundary before a stale id would otherwise reach psRunner.
      if (state && !validateDynamicOption(list, payload.id)) {
        throw new Error(`Unknown ${name === 'setOutput' ? 'output' : 'input'} device: ${payload.id}`);
      }
      await setAudioDevice(payload.id);
      poller.invalidate();
      return;
    }
    throw new Error(`Unknown panel action: ${name}`);
  },
});
