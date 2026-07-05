const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TOKEN_PATH = path.join(__dirname, '.pairing.json');

function loadOrCreateToken() {
  if (fs.existsSync(TOKEN_PATH)) {
    const data = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    if (data.token) return data.token;
  }
  const token = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(TOKEN_PATH, JSON.stringify({ token }, null, 2));
  return token;
}

module.exports = { loadOrCreateToken };
