const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');

const { getLanAddress, buildPairingUrl } = require('../services/pairingUrl');

test('getLanAddress picks the first non-internal, non-link-local IPv4 address', (t) => {
  t.mock.method(os, 'networkInterfaces', () => ({
    lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
    'Local Area Connection': [
      { family: 'IPv6', internal: false, address: 'fe80::1' },
      { family: 'IPv4', internal: false, address: '169.254.83.12' },
      { family: 'IPv4', internal: false, address: '192.168.1.126' },
    ],
  }));

  assert.equal(getLanAddress(), '192.168.1.126');
});

test('getLanAddress falls back to loopback when nothing else qualifies', (t) => {
  t.mock.method(os, 'networkInterfaces', () => ({
    lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
  }));

  assert.equal(getLanAddress(), '127.0.0.1');
});

test('buildPairingUrl embeds the LAN address, port, and token', (t) => {
  t.mock.method(os, 'networkInterfaces', () => ({
    eth0: [{ family: 'IPv4', internal: false, address: '10.0.0.5' }],
  }));

  assert.equal(buildPairingUrl(8787, 'abc123'), 'http://10.0.0.5:8787/?token=abc123');
});
