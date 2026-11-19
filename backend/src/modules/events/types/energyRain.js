const { SpecialEvent } = require('../specialEvent');

// Celdas extra que caen durante el evento (además de las normales).
const EXTRA_CELLS = 8;

// Lluvia de energía: aparecen celdas de energía adicionales poco a poco; las que nadie
// recogió desaparecen al terminar.
class EnergyRainEvent extends SpecialEvent {
  start() {
    this.dropped = 0;
    this.untilDrop = 0;
    this.dropEvery = Math.max(0.3, (this.durationSeconds * 0.7) / EXTRA_CELLS);
  }

  update(dt, engine) {
    this.untilDrop -= dt;

    while (this.untilDrop <= 0 && this.dropped < EXTRA_CELLS) {
      engine.spawnBonusItem();
      this.dropped += 1;
      this.untilDrop += this.dropEvery;
    }
  }

  // eslint-disable-next-line class-methods-use-this
  end(engine) {
    engine.removeBonusItems();
  }

  // eslint-disable-next-line class-methods-use-this
  params() {
    return { extraCells: EXTRA_CELLS };
  }
}

EnergyRainEvent.type = 'energy-rain';
EnergyRainEvent.label = 'Lluvia de energía';
EnergyRainEvent.description = 'Caen celdas de energía extra por toda la arena.';
EnergyRainEvent.accent = '#4cc9f0';

module.exports = { EnergyRainEvent, EXTRA_CELLS };
