const { SpecialEvent } = require('../specialEvent');

// Mitades de la arena que pueden quedar a oscuras.
const SIDES = ['top', 'bottom', 'left', 'right'];

function regionFor(side, arena) {
  const { width, height } = arena;

  switch (side) {
    case 'top':
      return { x: 0, y: 0, width, height: height / 2 };
    case 'bottom':
      return { x: 0, y: height / 2, width, height: height / 2 };
    case 'left':
      return { x: 0, y: 0, width: width / 2, height };
    default:
      return { x: width / 2, y: 0, width: width / 2, height };
  }
}

// Apagón: una mitad de la arena queda a oscuras. El servidor solo decide la región; el
// cliente la oscurece y deja una pequeña luz alrededor del jugador.
class BlackoutEvent extends SpecialEvent {
  start(engine) {
    this.side = SIDES[Math.floor(this.random() * SIDES.length)];
    this.region = regionFor(this.side, engine.arena);
  }

  params() {
    return { side: this.side, region: this.region };
  }
}

BlackoutEvent.type = 'blackout';
BlackoutEvent.label = 'Apagón';
BlackoutEvent.description = 'Una mitad de la arena se queda a oscuras.';
BlackoutEvent.accent = '#9d8cff';

module.exports = { BlackoutEvent, SIDES, regionFor };
