const { loadOrCreateToken } = require('./pairing');

module.exports = {
  port: Number(process.env.PORT) || 8787,
  pairingToken: loadOrCreateToken(),
  poll: {
    audioMs: 4000,
    nowPlayingMs: 1500,
    controllerMs: 20000,
  },
};
