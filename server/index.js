const express = require('express');
const path = require('path');
const http = require('http');
const fs = require('fs');
const qrcode = require('qrcode');
const config = require('./config');
const wsHub = require('./wsHub');
const { advertise } = require('./services/discovery');
const { buildPairingUrl } = require('./services/pairingUrl');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'client')));

const keysPath = path.join(__dirname, 'keys.json');

app.get('/keys', (_req, res) => {
  try {
    res.json(JSON.parse(fs.readFileSync(keysPath, 'utf8')));
  } catch {
    res.json([]);
  }
});

app.post('/keys', (req, res) => {
  const token = (req.headers['authorization'] || '').replace('Bearer ', '') || req.query.token;
  if (token !== config.pairingToken) return res.status(401).json({ error: 'unauthorized' });
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'expected array' });
  fs.writeFileSync(keysPath, JSON.stringify(req.body, null, 2));
  res.json({ ok: true });
});

const server = http.createServer(app);
wsHub.attach(server);

server.listen(config.port, async () => {
  const pairingUrl = buildPairingUrl(config.port, config.pairingToken);
  console.log(`my-stream-deck server listening on http://0.0.0.0:${config.port}`);
  console.log(`Pairing token: ${config.pairingToken}`);
  console.log(`Pairing URL:   ${pairingUrl}`);
  console.log('Scan with your iPhone\'s Camera app to open and auto-pair:\n');
  console.log(await qrcode.toString(pairingUrl, { type: 'terminal', small: true }));
  advertise(config.port);
});
