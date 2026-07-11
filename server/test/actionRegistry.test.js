const test = require('node:test');
const assert = require('node:assert/strict');

const registry = require('../actionRegistry');

test('duplicate uuid registration throws', () => {
  registry.clear();
  registry.register({ uuid: 'com.test.a', name: 'A', icon: 'x', states: [{}] });
  assert.throws(() => registry.register({ uuid: 'com.test.a', name: 'A2', icon: 'x', states: [{}] }), /Duplicate action uuid/);
});

test('action must declare at least one state', () => {
  registry.clear();
  assert.throws(() => registry.register({ uuid: 'com.test.b', name: 'B', icon: 'x', states: [] }), /at least one state/);
});

test('unsupported panel widget type is refused at registration', () => {
  registry.clear();
  assert.throws(() => registry.register({
    uuid: 'com.test.c',
    name: 'C',
    icon: 'x',
    states: [{}],
    panel: { title: 'C', widgets: [{ id: 'w', type: 'graph' }] },
  }), /unsupported widget type/);
});

test('button is a supported panel widget type', () => {
  registry.clear();
  assert.doesNotThrow(() => registry.register({
    uuid: 'com.test.button',
    name: 'Button',
    icon: 'x',
    states: [{}],
    panel: { title: 'Button', widgets: [{ id: 'go', type: 'button', label: 'Go', action: 'go' }] },
  }));
});

test('registered action is retrievable by uuid and appears in all()', () => {
  registry.clear();
  registry.register({ uuid: 'com.test.d', name: 'D', icon: 'x', states: [{}] });
  assert.equal(registry.get('com.test.d').name, 'D');
  assert.ok(registry.all().some((a) => a.uuid === 'com.test.d'));
  assert.equal(registry.has('com.test.d'), true);
  assert.equal(registry.has('com.test.nope'), false);
});
