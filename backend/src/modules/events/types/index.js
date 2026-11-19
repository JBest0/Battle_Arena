const { ReactorOverloadEvent } = require('./reactorOverload');
const { EnergyRainEvent } = require('./energyRain');
const { BlackoutEvent } = require('./blackout');
const { AlternateRouteEvent } = require('./alternateRoute');

// Tipos de evento que conoce el juego. Para agregar uno: crear su archivo en esta carpeta
// y añadirlo aquí (no se toca el motor ni el programador). La invasión de guardianes se
// agregará de la misma forma cuando existan los guardianes.
const EVENT_TYPES = [
  ReactorOverloadEvent,
  EnergyRainEvent,
  BlackoutEvent,
  AlternateRouteEvent,
];

module.exports = { EVENT_TYPES };
