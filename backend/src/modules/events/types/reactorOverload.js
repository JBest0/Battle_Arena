const { SpecialEvent } = require('../specialEvent');

const MULTIPLIER = 2;

// Sobrecarga del reactor: la energía (las celdas que se recogen) vale el doble.
// No cambia nada en el motor: solo aporta al multiplicador de puntos mientras dura.
class ReactorOverloadEvent extends SpecialEvent {
  modify(modifiers) {
    modifiers.pointMultiplier *= MULTIPLIER;
  }

  // eslint-disable-next-line class-methods-use-this
  params() {
    return { multiplier: MULTIPLIER };
  }
}

ReactorOverloadEvent.type = 'reactor-overload';
ReactorOverloadEvent.label = 'Sobrecarga del reactor';
ReactorOverloadEvent.description = 'Las celdas de energía valen el doble.';
ReactorOverloadEvent.accent = '#ff6b35';

module.exports = { ReactorOverloadEvent, MULTIPLIER };
