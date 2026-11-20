const { CyclicBlocker } = require('./cyclicBlocker');
const { seededRandom, deriveSeed } = require('../../shared/seededRandom');

/**
 * Corredor que se bloquea temporalmente: permanece abierto un tiempo al azar entre
 * `minOpenSeconds` y `maxOpenSeconds`, se cierra `closedSeconds` y se reabre. Como todo
 * cierre, nunca se hace si dejaría sin ruta alguna parte importante (ver ObstacleSystem).
 */
class Corridor extends CyclicBlocker {
  constructor(definition, seed) {
    super(definition, 'corridor');
    this.minOpenSeconds = definition.minOpenSeconds;
    this.maxOpenSeconds = definition.maxOpenSeconds;
    this.random = seededRandom(deriveSeed(seed, definition.id));
  }

  openDuration() {
    return this.minOpenSeconds + this.random() * (this.maxOpenSeconds - this.minOpenSeconds);
  }

  init(engine) {
    this.start(engine, { closedRemaining: 0, openRemaining: this.openDuration() });
  }
}

module.exports = { Corridor };
