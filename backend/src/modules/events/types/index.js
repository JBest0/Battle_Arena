const { ReactorOverloadEvent } = require('./reactorOverload');
const { EnergyRainEvent } = require('./energyRain');
const { BlackoutEvent } = require('./blackout');
const { AlternateRouteEvent } = require('./alternateRoute');
const { GuardianInvasionEvent } = require('./guardianInvasion');

// Tipos de evento que conoce el juego. Para agregar uno: crear su archivo en esta carpeta
// y añadirlo aquí (no se toca el motor ni el programador). La invasión de guardianes solo se
// elige en partidas que tienen guardianes (ver GuardianInvasionEvent.canStart).
const EVENT_TYPES = [
  ReactorOverloadEvent,
  EnergyRainEvent,
  BlackoutEvent,
  AlternateRouteEvent,
  GuardianInvasionEvent,
];

module.exports = { EVENT_TYPES };
