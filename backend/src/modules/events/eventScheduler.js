const round = (value) => Math.round(value * 100) / 100;

/**
 * Programa los eventos especiales de UNA partida: espera un tiempo aleatorio alrededor de
 * `intervalSeconds`, lanza un evento por `durationSeconds`, lo revierte y vuelve a esperar.
 * Solo hay un evento a la vez. No conoce ningún tipo concreto (usa la EventFactory) ni
 * depende de la hora real: el motor le pasa `dt`, así que se prueba de forma determinista.
 */
class EventScheduler {
  /**
   * @param {object} options
   * @param {import('./eventFactory').EventFactory} options.factory
   * @param {number} options.intervalSeconds   tiempo medio entre eventos
   * @param {number} options.durationSeconds   duración de cada evento
   * @param {() => number} options.random
   */
  constructor({ factory, intervalSeconds, durationSeconds, random = Math.random }) {
    this.factory = factory;
    this.intervalSeconds = intervalSeconds;
    this.durationSeconds = durationSeconds;
    this.random = random;

    this.active = null;
    this.records = [];
    this.lastType = null;
    this.nextId = 1;
    this.untilNext = this.rollInterval();
  }

  // Entre 0,5 y 1,5 veces el intervalo medio.
  rollInterval() {
    return this.intervalSeconds * (0.5 + this.random());
  }

  update(dt, engine) {
    if (this.active) {
      this.active.event.update(dt, engine);
      this.active.remaining -= dt;
      if (this.active.remaining <= 0) this.end(engine);

      return;
    }

    this.untilNext -= dt;
    if (this.untilNext <= 0) this.start(engine);
  }

  pickType(engine) {
    let types = this.factory.types().filter((type) => this.factory.canStart(type, engine));
    // Sin repetir el mismo tipo dos veces seguidas (si hay otra opción).
    if (types.length > 1) types = types.filter((type) => type !== this.lastType);
    if (types.length === 0) return null;

    const rainCount = this.records.filter((record) => record.type === 'energy-rain').length;
    const guaranteedCount = engine.rules?.energyRainAppearances ?? 3;
    if (
      rainCount < guaranteedCount &&
      engine.config?.endMode === 'TIME' &&
      Number.isFinite(engine.config.durationSeconds) &&
      engine.config.durationSeconds >= 120
    ) {
      const elapsedRatio = engine.elapsed / engine.config.durationSeconds;
      const dueAt = (rainCount + 1) / (guaranteedCount + 1);
      if (elapsedRatio >= dueAt && types.includes('energy-rain')) return 'energy-rain';
    }

    const total = types.reduce((sum, type) => sum + this.factory.weight(type), 0);
    let roll = this.random() * total;
    for (const type of types) {
      roll -= this.factory.weight(type);
      if (roll < 0) return type;
    }

    return types[types.length - 1];
  }

  start(engine) {
    const type = this.pickType(engine);
    if (!type) {
      this.untilNext = this.rollInterval();
      return;
    }

    const event = this.factory.create(type, {
      durationSeconds: this.durationSeconds,
      random: this.random,
    });
    event.start(engine);

    const EventClass = this.factory.get(type);
    const record = {
      id: `event-${this.nextId}`,
      type,
      startedAt: engine.elapsed,
      durationSeconds: this.durationSeconds,
      endedAt: null,
      params: event.params(),
    };
    this.nextId += 1;
    this.records.push(record);
    this.lastType = type;
    this.active = {
      event,
      record,
      remaining: this.durationSeconds,
      meta: {
        label: EventClass.label,
        description: EventClass.description,
        accent: EventClass.accent,
      },
    };
  }

  force(type, engine) {
    if (!this.factory.types().includes(type) || !this.factory.canStart(type, engine)) {
      return false;
    }

    if (this.active) this.end(engine);

    const event = this.factory.create(type, {
      durationSeconds: this.durationSeconds,
      random: this.random,
    });
    event.start(engine);

    const EventClass = this.factory.get(type);
    const record = {
      id: `event-${this.nextId}`,
      type,
      startedAt: engine.elapsed,
      durationSeconds: this.durationSeconds,
      endedAt: null,
      params: event.params(),
    };
    this.nextId += 1;
    this.records.push(record);
    this.lastType = type;
    this.active = {
      event,
      record,
      remaining: this.durationSeconds,
      meta: {
        label: EventClass.label,
        description: EventClass.description,
        accent: EventClass.accent,
      },
    };

    return true;
  }

  // Revierte el evento activo (al vencer su duración o al terminar la partida).
  end(engine) {
    if (!this.active) return;

    this.active.event.end(engine);
    this.active.record.endedAt = engine.elapsed;
    this.active = null;
    this.untilNext = this.rollInterval();
  }

  finish(engine) {
    this.end(engine);
  }

  recordBonusCollection(itemId, playerId) {
    if (!this.active || this.active.record.type !== 'energy-rain') return;
    if (typeof this.active.event.recordCollection === 'function') {
      this.active.event.recordCollection(itemId, playerId);
    }
  }

  // Modificadores de reglas que aportan los eventos activos.
  modifiers() {
    const modifiers = { pointMultiplier: 1, reactorDisabled: false };
    if (this.active) this.active.event.modify(modifiers);

    return modifiers;
  }

  // Lo que ve el cliente (va dentro de cada `arena:state`).
  publicState() {
    if (!this.active) return [];

    const { record, remaining, meta, event } = this.active;

    return [
      {
        id: record.id,
        type: record.type,
        name: meta.label,
        description: meta.description,
        accent: meta.accent,
        duration: record.durationSeconds,
        remaining: round(Math.max(0, remaining)),
        params: event.params(),
      },
    ];
  }

  // Eventos ocurridos, para guardarlos en la base de datos al terminar la partida.
  history() {
    return this.records.map((record) => ({
      ...record,
      startedAt: round(record.startedAt),
      endedAt: record.endedAt === null ? null : round(record.endedAt),
    }));
  }
}

module.exports = { EventScheduler };
