const express = require('express');
const path = require('path');
const config = require('./config');
const layoutModule = require('./layout');
const registry = require('./actionRegistry');

function requirePairingToken(req, res, next) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '') || req.query.token;
  if (token !== config.pairingToken) return res.status(401).json({ error: 'unauthorized' });
  next();
}

// `runtime` is shared with wsHub.js so a layout saved here is immediately
// live for key presses over the WebSocket. `layoutPath` is overridable so
// tests don't write through to the real server/layout.json.
function createApp(runtime, { layoutPath } = {}) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'client')));

  app.get('/layout', requirePairingToken, (_req, res) => {
    res.json(runtime.getLayout());
  });

  app.post('/layout', requirePairingToken, (req, res) => {
    try {
      const saved = layoutModule.saveLayout(req.body, layoutPath);
      runtime.updateLayout(saved);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e.message, details: e.validationErrors || [] });
    }
  });

  app.get('/actions', requirePairingToken, (_req, res) => {
    res.json(registry.all().map((a) => ({
      uuid: a.uuid,
      name: a.name,
      icon: a.icon,
      stateCount: a.states.length,
      settingsSchema: a.settingsSchema || {},
      panel: a.panel ? { title: a.panel.title } : null,
    })));
  });

  return app;
}

module.exports = { createApp };
