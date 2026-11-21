const { CyclicBlocker } = require('./cyclicBlocker');

/**
 * Puerta automática: se cierra `closedSeconds` y se abre `openSeconds`, en ciclo. `offset`
 * desfasa el ciclo para que no todas las puertas cambien a la vez.
 */
class Door extends CyclicBlocker {
  constructor(definition) {
    super(definition, 'door');
    this.openSeconds = definition.openSeconds;
    this.offsetSeconds = definition.offsetSeconds;
  }

  openDuration() {
    return this.openSeconds;
  }

  init(engine) {
    const total = this.closedSeconds + this.openSeconds;
    const phase = this.offsetSeconds % total;

    this.start(engine, {
      closedRemaining: phase < this.closedSeconds ? this.closedSeconds - phase : 0,
      openRemaining: total - phase,
    });
  }
}

module.exports = { Door };
