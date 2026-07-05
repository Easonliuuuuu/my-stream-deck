const os = require('os');

// Best-effort pick of the PC's LAN-facing IPv4 address: the first
// non-internal IPv4 address that isn't a link-local (APIPA) fallback.
function getLanAddress() {
  const interfaces = os.networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const addr of addresses || []) {
      if (addr.family === 'IPv4' && !addr.internal && !addr.address.startsWith('169.254.')) {
        return addr.address;
      }
    }
  }
  return '127.0.0.1';
}

function buildPairingUrl(port, token) {
  return `http://${getLanAddress()}:${port}/?token=${token}`;
}

module.exports = { getLanAddress, buildPairingUrl };
