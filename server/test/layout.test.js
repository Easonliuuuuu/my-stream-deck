const test = require('node:test');
const assert = require('node:assert/strict');

const registry = require('../actionRegistry');
const layout = require('../layout');

const LEGACY_KEYS = [
  { id: 'audio', label: 'Audio', icon: 'audio', action: 'nav', payload: 'audio', color: 'audio' },
  { id: 'controller', label: 'Controller', icon: 'controller', action: 'nav', payload: 'controller', color: 'controller' },
  { id: 'performance', label: 'Performance', icon: 'performance', action: 'nav', payload: 'performance', color: 'performance' },
  { id: 'spotify', label: 'Spotify', icon: 'spotify', action: 'launch', payload: 'spotify', color: 'spotify' },
  { id: 'discord', label: 'Discord', icon: 'discord', action: 'launch', payload: 'discord', color: 'discord' },
  { id: 'steam', label: 'Steam', icon: 'steam', action: 'launch', payload: 'steam', color: 'steam' },
];

function registerFixtureActions() {
  registry.clear();
  registry.register({ uuid: 'com.streamdeck.core.openPanel', name: 'Open Panel', icon: 'folder', states: [{}], settingsSchema: { panelOf: { type: 'text' } } });
  registry.register({ uuid: 'com.streamdeck.core.openFolder', name: 'Open Folder', icon: 'folder', states: [{}], settingsSchema: { folderId: { type: 'text' } } });
  registry.register({ uuid: 'com.streamdeck.system.launchApp', name: 'Launch App', icon: 'launch', states: [{}], settingsSchema: { appId: { type: 'text' } } });
  registry.register({ uuid: 'com.streamdeck.system.action', name: 'System Action', icon: 'lock', states: [{}], settingsSchema: { action: { type: 'select', options: ['lock', 'sleep'] } } });
  registry.register({ uuid: 'com.streamdeck.audio.devices', name: 'Audio', icon: 'audio', states: [{}] });
  registry.register({ uuid: 'com.streamdeck.controller.battery', name: 'Controller', icon: 'controller', states: [{}] });
  registry.register({ uuid: 'com.streamdeck.system.load', name: 'Performance', icon: 'performance', states: [{}] });
}

test('migration preserves the visual order of the six default keys', () => {
  registerFixtureActions();
  const migrated = layout.migrateLegacyKeys(LEGACY_KEYS, { cols: 3, rows: 3 });

  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.root, 'folder-root');

  const keys = migrated.folders['folder-root'].keys;
  const order = LEGACY_KEYS.map((_, i) => `${i % 3},${Math.floor(i / 3)}`);
  order.forEach((coord, i) => {
    assert.ok(keys[coord], `expected a key at ${coord}`);
    assert.equal(keys[coord].title, LEGACY_KEYS[i].label);
    assert.equal(keys[coord].color, LEGACY_KEYS[i].color);
    assert.equal(keys[coord].icon, LEGACY_KEYS[i].icon, `icon should survive migration for ${coord}`);
  });

  assert.equal(keys['0,0'].action, 'com.streamdeck.core.openPanel');
  assert.equal(keys['0,0'].settings.panelOf, 'com.streamdeck.audio.devices');
  assert.equal(keys['1,1'].action, 'com.streamdeck.system.launchApp');
  assert.equal(keys['1,1'].settings.appId, 'discord');

  const errors = layout.validateLayout(migrated);
  assert.deepEqual(errors, []);
});

test('rejects a key placed outside the declared grid', () => {
  registerFixtureActions();
  const bad = {
    schemaVersion: 2,
    grid: { cols: 3, rows: 3 },
    root: 'folder-root',
    folders: {
      'folder-root': {
        name: 'Home',
        keys: {
          '5,0': { context: 'ctx-1', action: 'com.streamdeck.system.launchApp', settings: { appId: 'spotify' }, state: 0 },
        },
      },
    },
  };
  const errors = layout.validateLayout(bad);
  assert.ok(errors.some((e) => /outside the/.test(e)));
});

test('rejects a folder cycle', () => {
  registerFixtureActions();
  const cyclic = {
    schemaVersion: 2,
    grid: { cols: 1, rows: 1 },
    root: 'folder-a',
    folders: {
      'folder-a': { name: 'A', keys: { '0,0': { context: 'ctx-a', action: 'com.streamdeck.core.openFolder', settings: { folderId: 'folder-b' }, state: 0 } } },
      'folder-b': { name: 'B', keys: { '0,0': { context: 'ctx-b', action: 'com.streamdeck.core.openFolder', settings: { folderId: 'folder-a' }, state: 0 } } },
    },
  };
  const errors = layout.validateLayout(cyclic);
  assert.ok(errors.some((e) => /cycle/.test(e)));
});

test('rejects a key bound to an unregistered action', () => {
  registerFixtureActions();
  const bad = {
    schemaVersion: 2,
    grid: { cols: 1, rows: 1 },
    root: 'folder-root',
    folders: {
      'folder-root': {
        name: 'Home',
        keys: { '0,0': { context: 'ctx-1', action: 'com.nope.unknown', settings: {}, state: 0 } },
      },
    },
  };
  const errors = layout.validateLayout(bad);
  assert.ok(errors.some((e) => /unregistered action/.test(e)));
});

test('partial failure does not partially persist: saveLayout throws and leaves no side effect', () => {
  registerFixtureActions();
  const bad = {
    schemaVersion: 2,
    grid: { cols: 1, rows: 1 },
    root: 'folder-root',
    folders: {
      'folder-root': {
        name: 'Home',
        keys: {
          '0,0': { context: 'ctx-1', action: 'com.streamdeck.system.launchApp', settings: { appId: 'spotify' }, state: 0 },
          '9,9': { context: 'ctx-2', action: 'com.streamdeck.system.launchApp', settings: { appId: 'discord' }, state: 0 },
        },
      },
    },
  };
  assert.throws(() => layout.saveLayout(bad, '/tmp/should-not-be-written-layout.json'));
  const fs = require('fs');
  assert.equal(fs.existsSync('/tmp/should-not-be-written-layout.json'), false);
});

test('unknown setting key and wrong-typed setting are both rejected', () => {
  registerFixtureActions();
  const bad = {
    schemaVersion: 2,
    grid: { cols: 1, rows: 2 },
    root: 'folder-root',
    folders: {
      'folder-root': {
        name: 'Home',
        keys: {
          '0,0': { context: 'ctx-1', action: 'com.streamdeck.system.launchApp', settings: { appId: 'spotify', bogus: 'x' }, state: 0 },
          '0,1': { context: 'ctx-2', action: 'com.streamdeck.system.action', settings: { action: 'not-a-real-action' }, state: 0 },
        },
      },
    },
  };
  const errors = layout.validateLayout(bad);
  assert.ok(errors.some((e) => /Unknown setting: bogus/.test(e)));
  assert.ok(errors.some((e) => /invalid value/.test(e)));
});
