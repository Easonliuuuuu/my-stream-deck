const express = require('express');
const path = require('path');
const http = require('http');
const config = require('./config');
const wsHub = require('./wsHub');
const { advertise } = require('./services/discovery');

const app = express();
app.use(express.static(path.join(__dirname, '..', 'client')));

const server = http.createServer(app);
wsHub.attach(server);

server.listen(config.port, () => {
  console.log(`my-stream-deck server listening on http://0.0.0.0:${config.port}`);
  console.log(`Pairing token: ${config.pairingToken}`);
  advertise(config.port);
});
