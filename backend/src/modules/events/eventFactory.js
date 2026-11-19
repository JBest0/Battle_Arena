const { EVENT_TYPES } = require('./types');

/**
 * Fábrica de eventos especiales (patrón Factory, US-22 / RNF-11): crea un evento a partir
 * de su tipo. Los tipos se registran como clases; el motor y el programador solo usan la
 * fábrica, así que un tipo nuevo no los modifica.
 */
class EventFactory {
  constructor() {
    this.registry = new Map();
  }

  /** @param {typeof import('./specialEvent').SpecialEvent} EventClass  con `type` único */
  register(EventClass) {
    const { type } = EventClass;

    if (typeof type !== 'string' || type.length === 0 || type === 'special-event') {
      throw new Error('El tipo de evento debe declarar un `type` propio');
    }
    if (this.registry.has(type)) {
      throw new Error(`Ya existe un evento registrado con el tipo "${type}"`);
    }

    this.registry.set(type, EventClass);

    return this;
  }

  has(type) {
    return this.registry.has(type);
  }

  types() {
    return [...this.registry.keys()];
  }

  get(type) {
    const EventClass = this.registry.get(type);
    if (!EventClass) throw new Error(`Tipo de evento desconocido: "${type}"`);

    return EventClass;
  }

  // ¿Tiene sentido este tipo en la partida de `engine`?
  canStart(type, engine) {
    return this.get(type).canStart(engine);
  }

  weight(type) {
    const { weight } = this.get(type);

    return Number.isFinite(weight) && weight > 0 ? weight : 1;
  }

  create(type, options) {
    const EventClass = this.get(type);

    return new EventClass(options);
  }
}

function createDefaultEventFactory(types = EVENT_TYPES) {
  const factory = new EventFactory();
  types.forEach((EventClass) => factory.register(EventClass));

  return factory;
}

module.exports = { EventFactory, createDefaultEventFactory };
