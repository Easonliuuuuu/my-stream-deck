const http = require('http');
const qrcode = require('qrcode');
const config = require('./config');
require('./actions'); // registers every built-in action module before anything reads the registry
const layoutModule = require('./layout');
const { createRuntime } = require('./runtime');
const { createApp } = require('./app');
const wsHub = require('./wsHub');
const { advertise } = require('./services/discovery');
const { buildPairingUrl } = require('./services/pairingUrl');

const layout = layoutModule.loadOrMigrate();
const runtime = createRuntime(layout);
const app = createApp(runtime);
const server = http.createServer(app);
wsHub.attach(server, runtime);

server.listen(config.port, async () => {
  const pairingUrl = buildPairingUrl(config.port, config.pairingToken);
  console.log(`my-stream-deck server listening on http://0.0.0.0:${config.port}`);
  console.log(`Pairing token: ${config.pairingToken}`);
  console.log(`Pairing URL:   ${pairingUrl}`);
  console.log('Scan with your iPhone\'s Camera app to open and auto-pair:\n');
  console.log(await qrcode.toString(pairingUrl, { type: 'terminal', small: true }));
  advertise(config.port);
});
