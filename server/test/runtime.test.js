const test = require('node:test');
const assert = require('node:assert/strict');

const registry = require('../actionRegistry');
const { createRuntime } = require('../runtime');

function baseLayout() {
  return {
    schemaVersion: 2,
    grid: { cols: 2, rows: 1 },
    root: 'folder-root',
    folders: {
      'folder-root': {
        name: 'Home',
        keys: {
          '0,0': { context: 'ctx-toggle', action: 'com.test.toggle', settings: {}, state: 0 },
          '1,0': { context: 'ctx-sub', action: 'com.test.openFolder', settings: { folderId: 'folder-sub' }, state: 0 },
        },
      },
      'folder-sub': {
        name: 'Sub',
        keys: {
          '0,0': { context: 'ctx-tracked', action: 'com.test.tracked', settings: {}, state: 0 },
        },
      },
    },
  };
}

function registerCommonFixtures() {
  registry.clear();
  registry.register({ uuid: 'com.test.toggle', name: 'Toggle', icon: 'x', states: [{}, {}] });
  registry.register({ uuid: 'com.test.openFolder', name: 'OpenFolder', icon: 'x', states: [{}] });
}

test('onWillAppear/onWillDisappear bracket a subscription across folder navigation', async () => {
  registerCommonFixtures();
  const events = [];
  registry.register({
    uuid: 'com.test.tracked', name: 'Tracked', icon: 'x', states: [{}],
    onWillAppear: () => events.push('appear'),
    onWillDisappear: () => events.push('disappear'),
  });

  const runtime = createRuntime(baseLayout());
  await new Promise((r) => setImmediate(r)); // let the constructor's fire-and-forget bootstrap settle

  // Root folder is visible by default; ctx-tracked lives in folder-sub, so no appear yet.
  assert.deepEqual(events, []);

  await runtime.setVisibleContexts(['ctx-toggle', 'ctx-sub', 'ctx-tracked']);
  assert.deepEqual(events, ['appear']);

  await runtime.setVisibleContexts(['ctx-toggle', 'ctx-sub']); // navigate back to root
  assert.deepEqual(events, ['appear', 'disappear']);
});

test('renders for invisible keys are dropped', async () => {
  registerCommonFixtures();
  registry.register({
    uuid: 'com.test.tracked', name: 'Tracked', icon: 'x', states: [{}],
    onWillAppear: (ctx) => ctx.setTitle('hello'),
  });

  const runtime = createRuntime(baseLayout());
  const renders = [];
  runtime.onRender((m) => renders.push(m));
  await new Promise((r) => setImmediate(r));

  // ctx-tracked (folder-sub) is never marked visible in this test.
  assert.deepEqual(renders.filter((m) => m.context === 'ctx-tracked'), []);
});

test('unchanged pushed values are not re-sent', async () => {
  registerCommonFixtures();
  const runtime = createRuntime(baseLayout());
  const renders = [];
  runtime.onRender((m) => renders.push(m));
  await new Promise((r) => setImmediate(r));

  const ctx = runtime.makeCtxFor('ctx-toggle', 'com.test.toggle');
  ctx.setTitle('Same');
  ctx.setTitle('Same');
  assert.equal(renders.filter((m) => m.context === 'ctx-toggle').length, 1);
});

test('setState updates a two-state key and is reflected on the ctx', async () => {
  registerCommonFixtures();
  const runtime = createRuntime(baseLayout());
  const renders = [];
  runtime.onRender((m) => renders.push(m));
  await new Promise((r) => setImmediate(r));

  const ctx = runtime.makeCtxFor('ctx-toggle', 'com.test.toggle');
  ctx.setState(1);
  assert.equal(ctx.state, 1);
  assert.ok(renders.some((m) => m.context === 'ctx-toggle' && m.state === 1));
});

test('an action cannot render into a context owned by a different action', async () => {
  registerCommonFixtures();
  registry.register({ uuid: 'com.test.rogue', name: 'Rogue', icon: 'x', states: [{}] });

  const runtime = createRuntime(baseLayout());
  const renders = [];
  runtime.onRender((m) => renders.push(m));
  await new Promise((r) => setImmediate(r));

  // ctx-toggle is genuinely bound to com.test.toggle; a ctx claiming to act
  // as com.test.rogue for that same context must be refused.
  const rogueCtx = runtime.makeCtxFor('ctx-toggle', 'com.test.rogue');
  rogueCtx.setTitle('hijacked');
  assert.equal(renders.some((m) => m.context === 'ctx-toggle'), false);
});

test('a throwing onKeyDown surfaces its error without breaking the runtime', async () => {
  registerCommonFixtures();
  registry.register({
    uuid: 'com.test.explodes', name: 'Explodes', icon: 'x', states: [{}],
    onKeyDown: () => { throw new Error('boom'); },
  });
  const layout = baseLayout();
  layout.folders['folder-root'].keys['0,0'].action = 'com.test.explodes';

  const runtime = createRuntime(layout);
  await new Promise((r) => setImmediate(r));

  await assert.rejects(() => runtime.keyDown('ctx-toggle'), /boom/);
  await assert.doesNotReject(() => runtime.setVisibleContexts(['ctx-toggle', 'ctx-sub']));
});

test('keyDown on an unknown context is refused', async () => {
  registerCommonFixtures();
  const runtime = createRuntime(baseLayout());
  await assert.rejects(() => runtime.keyDown('ctx-does-not-exist'), /Unknown context/);
});
