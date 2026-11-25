const { ArenaEngine } = require('./arenaEngine');

const MAX_DT_SECONDS = 0.1;

// Mantiene un motor por partida en curso, lo avanza a `tickRate` y difunde el estado.
// Al terminar guarda el resultado una sola vez. Todo llega por inyección (emit, persist),
// así que no depende de socket.io ni de la base de datos.
class MatchRoomManager {
  /**
   * @param {object} options
   * @param {object} options.arena
   * @param {object} options.rules       GAMEPLAY (tickRate, abandonSeconds, maxMatchSeconds...)
   * @param {(matchId: string, event: string, payload: object) => void} options.emit
   * @param {(matchId: string, result: object) => Promise<void>} options.persistResult
   * @param {(scenarioId: string) => object|undefined} [options.getScenario]  escenario compilado
   * @param {import('../events/eventFactory').EventFactory} [options.eventFactory]  eventos
   *   especiales; sin ella la partida no tiene eventos
   * @param {{error: Function}} [options.logger]
   */
  constructor({
    arena,
    rules,
    emit,
    persistResult,
    getScenario,
    eventFactory = null,
    logger = console,
  }) {
    this.getScenario = getScenario;
    this.eventFactory = eventFactory;
    this.arena = arena;
    this.rules = rules;
    this.emit = emit;
    this.persistResult = persistResult;
    this.logger = logger;
    this.rooms = new Map();
  }

  isActive(matchId) {
    return this.rooms.has(matchId);
  }

  // `match` es la vista de GameService (config + players). Ignora un segundo inicio.
  startMatch(match) {
    if (this.rooms.has(match.id)) return;

    const engine = new ArenaEngine({
      config: match.config,
      arena: this.arena,
      rules: this.rules,
      players: match.players,
      scenario: match.scenarioId ? this.getScenario?.(match.scenarioId) || null : null,
      eventFactory: this.eventFactory,
    });
    const room = { engine, connections: 0, idle: 0, last: Date.now(), timer: null };

    room.timer = setInterval(
      () => this.tick(match.id, room),
      Math.round(1000 / this.rules.tickRate)
    );
    this.rooms.set(match.id, room);
  }

  snapshot(matchId) {
    const room = this.rooms.get(matchId);

    return room ? room.engine.snapshot() : null;
  }

  setInput(matchId, userId, dx, dy) {
    this.rooms.get(matchId)?.engine.setInput(userId, dx, dy);
  }

  performDevAction(matchId, action) {
    const room = this.rooms.get(matchId);
    if (!room) return { ok: false, code: 'MATCH_NOT_ACTIVE' };

    const engine = room.engine;
    if (action?.type === 'force-event') {
      const allowed = [
        'reactor-overload',
        'energy-rain',
        'blackout',
        'alternate-route',
        'guardian-invasion',
      ];
      if (!allowed.includes(action.eventType)) {
        return { ok: false, code: 'VALIDATION_ERROR' };
      }
      return engine.forceEvent(action.eventType)
        ? { ok: true, state: engine.snapshot() }
        : { ok: false, code: 'EVENT_NOT_AVAILABLE' };
    }

    if (action?.type === 'finish') {
      engine.finish();
      return { ok: true, state: engine.snapshot() };
    }

    if (action?.type === 'overtime') {
      engine.beginOvertime();
      return { ok: true, state: engine.snapshot() };
    }

    if (action?.type === 'set-score') {
      if (!engine.devSetScore(action.playerId, Number(action.score))) {
        return { ok: false, code: 'VALIDATION_ERROR' };
      }
      return { ok: true, state: engine.snapshot() };
    }

    if (action?.type === 'add-score') {
      if (!engine.devAddScore(action.playerId, Number(action.amount))) {
        return { ok: false, code: 'VALIDATION_ERROR' };
      }
      return { ok: true, state: engine.snapshot() };
    }

    if (action?.type === 'spawn-bonus') {
      engine.spawnBonusItem();
      return { ok: true, state: engine.snapshot() };
    }

    return { ok: false, code: 'VALIDATION_ERROR' };
  }

  // Acción de extraer energía. Devuelve { ok, points } o { ok: false, code, message }.
  extractEnergy(matchId, userId, actionId) {
    const room = this.rooms.get(matchId);
    if (!room) return { ok: false, code: 'NOT_RUNNING', message: 'La partida no está activa.' };

    return room.engine.extractEnergy(userId, actionId);
  }

  socketJoined(matchId) {
    const room = this.rooms.get(matchId);
    if (room) room.connections += 1;
  }

  socketLeft(matchId) {
    const room = this.rooms.get(matchId);
    if (room) room.connections = Math.max(0, room.connections - 1);
  }

  tick(matchId, room) {
    const now = Date.now();
    const dt = Math.min((now - room.last) / 1000, MAX_DT_SECONDS);
    room.last = now;

    room.idle = room.connections === 0 ? room.idle + dt : 0;
    room.engine.step(dt);

    if (
      room.idle >= this.rules.abandonSeconds ||
      room.engine.elapsed >= this.rules.maxMatchSeconds
    ) {
      room.engine.finish();
    }

    if (room.engine.status !== 'FINISHED') {
      this.emit(matchId, 'arena:state', room.engine.snapshot());
      return;
    }

    this.close(matchId, room);
  }

  async close(matchId, room) {
    clearInterval(room.timer);
    this.rooms.delete(matchId);

    try {
      await this.persistResult(matchId, room.engine.result());
    } catch (err) {
      this.logger.error(`No se pudo guardar el resultado de ${matchId}:`, err);
    }

    this.emit(matchId, 'match:finished', room.engine.snapshot());
  }

  stopAll() {
    for (const room of this.rooms.values()) {
      clearInterval(room.timer);
    }
    this.rooms.clear();
  }
}

module.exports = { MatchRoomManager };
