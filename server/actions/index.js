// Registering an action module is the only step required to make a
// capability bindable to a key (see actionRegistry.js). Requiring this file
// once at startup runs every module's registration side effect.
require('./core');
require('./system');
require('./audio');
require('./controller');
require('./performance');
require('./obs');
