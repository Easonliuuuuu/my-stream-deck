const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const registry = require('./actionRegistry');
const { validateSettings } = require('./settingsSchema');

const LAYOUT_PATH = path.join(__dirname, 'layout.json');
const LEGACY_KEYS_PATH = path.join(__dirname, 'keys.json');
const DEFAULT_GRID = { cols: 3, rows: 3 };
const ROOT_FOLDER_ID = 'folder-root';

function generateContext() {
  // Random, not sequential — trivially satisfies "never reuses a retired id"
  // without needing to persist a counter alongside the layout.
  return `ctx-${crypto.randomUUID()}`;
}

// Maps each legacy verb (action/payload) onto the corresponding core/system
// action's uuid and settings shape. Keys map 1:1 to the "Migration" table in
// design.md.
function mapLegacyAction(legacy) {
  if (legacy.action === 'nav') {
    const panelOf = {
      audio: 'com.streamdeck.audio.devices',
      controller: 'com.streamdeck.controller.battery',
      performance: 'com.streamdeck.system.load',
    }[legacy.payload];
    if (!panelOf) throw new Error(`Cannot migrate unknown nav target: ${legacy.payload}`);
    return { action: 'com.streamdeck.core.openPanel', settings: { panelOf } };
  }
  if (legacy.action === 'launch') {
    return { action: 'com.streamdeck.system.launchApp', settings: { appId: legacy.payload } };
  }
  if (legacy.action === 'system') {
    return { action: 'com.streamdeck.system.action', settings: { action: legacy.payload } };
  }
  throw new Error(`Cannot migrate unknown legacy action: ${legacy.action}`);
}

function migrateLegacyKeys(legacyKeys, grid = DEFAULT_GRID) {
  const keys = {};

  legacyKeys.forEach((legacy, i) => {
    const col = i % grid.cols;
    const row = Math.floor(i / grid.cols);
    const { action, settings } = mapLegacyAction(legacy);

    keys[`${col},${row}`] = {
      context: generateContext(),
      action,
      settings,
      state: 0,
      title: legacy.label,
      icon: legacy.icon,
      color: legacy.color || 'default',
    };
  });

  return {
    schemaVersion: 2,
    grid,
    root: ROOT_FOLDER_ID,
    folders: {
      [ROOT_FOLDER_ID]: { name: 'Home', keys },
    },
  };
}

function loadOrMigrate(layoutPath = LAYOUT_PATH, legacyPath = LEGACY_KEYS_PATH) {
  if (fs.existsSync(layoutPath)) {
    return JSON.parse(fs.readFileSync(layoutPath, 'utf8'));
  }

  let legacyKeys = [];
  if (fs.existsSync(legacyPath)) {
    try {
      legacyKeys = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
    } catch {
      legacyKeys = [];
    }
  }

  const layout = migrateLegacyKeys(legacyKeys);
  fs.writeFileSync(layoutPath, JSON.stringify(layout, null, 2));

  if (fs.existsSync(legacyPath)) {
    fs.renameSync(legacyPath, `${legacyPath}.bak`);
  }

  return layout;
}

function parseCoord(coord) {
  const [col, row] = coord.split(',').map(Number);
  return { col, row };
}

function detectFolderCycle(layout, errors) {
  const edges = new Map();
  for (const [folderId, folder] of Object.entries(layout.folders)) {
    const children = Object.values(folder.keys || {})
      .filter((k) => k.action === 'com.streamdeck.core.openFolder' && k.settings && k.settings.folderId)
      .map((k) => k.settings.folderId);
    edges.set(folderId, children);
  }

  const finished = new Set();
  const reported = new Set();

  function visit(node, onPath) {
    if (onPath.has(node)) {
      if (!reported.has(node)) {
        errors.push(`Folder cycle detected involving "${node}"`);
        reported.add(node);
      }
      return;
    }
    if (finished.has(node)) return;

    onPath.add(node);
    for (const child of edges.get(node) || []) visit(child, onPath);
    onPath.delete(node);
    finished.add(node);
  }

  for (const folderId of Object.keys(layout.folders)) {
    if (!finished.has(folderId)) visit(folderId, new Set());
  }
}

function validateLayout(layout) {
  const errors = [];

  if (!layout.folders || !layout.folders[layout.root]) {
    errors.push(`Root folder "${layout.root}" does not exist`);
  }

  for (const [folderId, folder] of Object.entries(layout.folders || {})) {
    for (const [coord, key] of Object.entries(folder.keys || {})) {
      const { col, row } = parseCoord(coord);
      if (col < 0 || col >= layout.grid.cols || row < 0 || row >= layout.grid.rows) {
        errors.push(`Key at "${coord}" in folder "${folderId}" is outside the ${layout.grid.cols}x${layout.grid.rows} grid`);
        continue;
      }

      const module = registry.get(key.action);
      if (!module) {
        errors.push(`Key at "${coord}" in folder "${folderId}" references unregistered action: "${key.action}"`);
        continue;
      }

      const settingErrors = validateSettings(module.settingsSchema, key.settings);
      settingErrors.forEach((e) => errors.push(`Key at "${coord}" in folder "${folderId}": ${e}`));
    }
  }

  detectFolderCycle(layout, errors);

  return errors;
}

function saveLayout(layout, layoutPath = LAYOUT_PATH) {
  const errors = validateLayout(layout);
  if (errors.length > 0) {
    const err = new Error(errors.join('; '));
    err.validationErrors = errors;
    throw err;
  }
  fs.writeFileSync(layoutPath, JSON.stringify(layout, null, 2));
  return layout;
}

module.exports = {
  LAYOUT_PATH,
  LEGACY_KEYS_PATH,
  DEFAULT_GRID,
  ROOT_FOLDER_ID,
  generateContext,
  migrateLegacyKeys,
  loadOrMigrate,
  validateLayout,
  saveLayout,
  parseCoord,
};
