const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');

const config = require('../config');
const app = require('../app');

const keysPath = path.join(__dirname, '..', 'keys.json');

async function startServer() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  return { port, close: () => new Promise((resolve) => server.close(resolve)) };
}

test('GET /keys rejects a request without a valid pairing token', async (t) => {
  const { port, close } = await startServer();
  t.after(close);

  const res = await fetch(`http://127.0.0.1:${port}/keys`);
  assert.equal(res.status, 401);
});

test('GET /keys returns the key layout for a valid pairing token', async (t) => {
  const { port, close } = await startServer();
  t.after(close);

  const res = await fetch(`http://127.0.0.1:${port}/keys?token=${config.pairingToken}`);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(await res.json()));
});

test('POST /keys rejects a request without a valid pairing token', async (t) => {
  const { port, close } = await startServer();
  t.after(close);

  const res = await fetch(`http://127.0.0.1:${port}/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '[]',
  });
  assert.equal(res.status, 401);
});

test('POST /keys with a valid token persists the submitted key array', async (t) => {
  const original = fs.readFileSync(keysPath, 'utf8');
  t.after(() => fs.writeFileSync(keysPath, original));

  const { port, close } = await startServer();
  t.after(close);

  const newKeys = [{ id: 'test', label: 'Test', icon: 'default', action: 'launch', payload: 'test', color: 'default' }];
  const res = await fetch(`http://127.0.0.1:${port}/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.pairingToken}` },
    body: JSON.stringify(newKeys),
  });
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(fs.readFileSync(keysPath, 'utf8')), newKeys);
});
