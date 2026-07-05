const { Bonjour } = require('bonjour-service');

function advertise(port) {
  const bonjour = new Bonjour();
  const service = bonjour.publish({ name: 'My Stream Deck', type: 'streamdeck', port });

  return function stop() {
    service.stop(() => bonjour.destroy());
  };
}

module.exports = { advertise };
