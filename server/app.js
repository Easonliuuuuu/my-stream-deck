const express = require('express');
const path = require('path');
const fs = require('fs');
const config = require('./config');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'client')));

const keysPath = path.join(__dirname, 'keys.json');

function requirePairingToken(req, res, next) {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '') || req.query.token;
  if (token !== config.pairingToken) return res.status(401).json({ error: 'unauthorized' });
  next();
}

app.get('/keys', requirePairingToken, (_req, res) => {
  try {
    res.json(JSON.parse(fs.readFileSync(keysPath, 'utf8')));
  } catch {
    res.json([]);
  }
});

app.post('/keys', requirePairingToken, (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'expected array' });
  fs.writeFileSync(keysPath, JSON.stringify(req.body, null, 2));
  res.json({ ok: true });
});

module.exports = app;
