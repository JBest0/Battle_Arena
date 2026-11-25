const { isFrozen } = require('./playerStates');

// Extracción de energía del reactor (US-18). El jugador se acerca al reactor y pulsa el botón
// de acción; el servidor decide si la extracción es válida y, solo entonces, suma los puntos.
// El cliente nunca suma puntos ni cambia el estado del reactor: solo pide y dibuja.

// Valores por defecto si las reglas no traen `reactor` (ver REACTOR en game.config.js).
const DEFAULTS = { extractPoints: 1, cooldownSeconds: 1, range: 40 };

// Cuántos identificadores de acción recientes se recuerdan por jugador (anti-duplicados).
const REMEMBERED_ACTIONS = 64;

// Motivos de rechazo (`code`) y el mensaje que ve el jugador (CA-18.5, CA-24.6).
const REJECTIONS = {
  NOT_IN_MATCH: 'No participas en esta partida.',
  NOT_RUNNING: 'La partida no está activa.',
  NO_REACTOR: 'Este escenario no tiene reactor.',
  FROZEN: 'Estás congelado: no puedes extraer energía.',
  OUT_OF_RANGE: 'Estás muy lejos del reactor. Acércate para extraer energía.',
  RECHARGING: 'El reactor se está recargando: otro jugador extrajo antes.',
  DISABLED: 'El reactor está desactivado por un evento.',
  DUPLICATE: 'Acción repetida.',
};

const reject = (code) => ({ ok: false, code, message: REJECTIONS[code] });

class ReactorSystem {
  /** @param {object} rect  scenario.reactor (x, y, width, height) @param {object} rules */
  constructor(rect, rules = {}) {
    this.rect = rect;
    this.settings = { ...DEFAULTS, ...rules };
    this.cooldownUntil = 0; // el reactor se recarga después de cada extracción (de cualquiera)
    this.extractions = 0; // extracciones válidas de la partida
    this.lastBy = null; // quién hizo la última
    this.seen = new Map(); // jugador -> ids de acción ya procesados
  }

  // Distancia de un punto al borde del reactor (0 si está encima).
  distanceTo(x, y) {
    const { rect } = this;
    const dx = Math.max(rect.x - x, 0, x - (rect.x + rect.width));
    const dy = Math.max(rect.y - y, 0, y - (rect.y + rect.height));

    return Math.hypot(dx, dy);
  }

  inRange(player) {
    return this.distanceTo(player.x, player.y) <= this.settings.range;
  }

  // Estado visible del reactor: 'available' | 'recharging' | 'disabled'.
  stateAt(elapsed, disabled = false) {
    if (disabled) return 'disabled';

    return elapsed < this.cooldownUntil ? 'recharging' : 'available';
  }

  // ¿Este identificador ya se procesó? Si no, lo recuerda. Sin identificador no hay filtro.
  isDuplicate(playerId, actionId) {
    if (typeof actionId !== 'string' || actionId === '') return false;

    const ids = this.seen.get(playerId) || new Set();
    if (ids.has(actionId)) return true;

    ids.add(actionId);
    if (ids.size > REMEMBERED_ACTIONS) ids.delete(ids.values().next().value);
    this.seen.set(playerId, ids);

    return false;
  }

  /**
   * Intenta una extracción. Devuelve { ok: true, points } o { ok: false, code, message }.
   * Valida, en este orden: duplicado, partida activa, estado del jugador, zona de
   * interacción y estado del reactor.
   */
  extract(engine, player, actionId) {
    if (this.isDuplicate(player.id, actionId)) return reject('DUPLICATE');
    // En juego: tiempo reglamentario o prórroga por empate.
    if (engine.status !== 'RUNNING' && engine.status !== 'OVERTIME') return reject('NOT_RUNNING');
    if (isFrozen(player, engine.elapsed)) return reject('FROZEN');
    if (!this.inRange(player)) return reject('OUT_OF_RANGE');

    // Un evento puede poner `modifiers.reactorDisabled = true` para apagar el reactor.
    const modifiers = engine.events ? engine.events.modifiers() : {};
    const state = this.stateAt(engine.elapsed, modifiers.reactorDisabled === true);
    if (state === 'disabled') return reject('DISABLED');
    if (state === 'recharging') return reject('RECHARGING');

    // Puntos: base × eventos activos (sobrecarga) × sector de riesgo donde está el jugador.
    const points = this.settings.extractPoints * (modifiers.pointMultiplier ?? 1) * player.risk;
    player.score += points;
    this.cooldownUntil = engine.elapsed + this.settings.cooldownSeconds;
    this.extractions += 1;
    this.lastBy = player.id;

    return { ok: true, points };
  }

  // Lo que ve el cliente en cada `arena:state`.
  snapshot(elapsed, disabled = false) {
    return {
      state: this.stateAt(elapsed, disabled),
      cooldown: Math.round(Math.max(0, this.cooldownUntil - elapsed) * 10) / 10,
      cooldownTotal: this.settings.cooldownSeconds,
      extractions: this.extractions,
      lastBy: this.lastBy,
      range: this.settings.range,
    };
  }
}

module.exports = { ReactorSystem, REJECTIONS, DEFAULTS };
