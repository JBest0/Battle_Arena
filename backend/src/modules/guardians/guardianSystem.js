const { slowRemaining } = require('../realtime/hazards');
const { isTargetable } = require('../realtime/playerStates');
const {
  buildGrid,
  centerOf,
  indexOf,
  freeAnchors,
  nearestAnchor,
  bfs,
  pathTo,
  bestAnchorFor,
} = require('./guardianPathing');

// Largo máximo de cada paso de movimiento (menor que una celda, como en el motor).
const MAX_STEP = 4;
const MAX_STEPS_PER_UPDATE = 64;
// Separación mínima entre guardianes al colocarlos (unidades de arena).
const MIN_GUARDIAN_GAP = 75;
const RANDOM_TRIES = 30;

const round = (value) => Math.round(value * 10) / 10;

// Un punto por borde de la arena: arriba, derecha, abajo e izquierda (los "extremos" del campo).
// Los inicios de los jugadores están en las esquinas, así que ningún guardián nace sobre uno.
function edgePoints({ width, height }) {
  return [
    { x: width / 2, y: 0 },
    { x: width, y: height / 2 },
    { x: width / 2, y: height },
    { x: 0, y: height / 2 },
  ];
}

/**
 * Guardianes de una partida (US-21). Es parte del servidor autoritativo: el cliente solo
 * recibe su posición. No conoce sockets ni la base de datos; el motor le pasa `dt`.
 *
 * Comportamiento (documentado en docs/guardianes.md):
 *  - Cada guardián persigue al jugador MÁS CERCANO por camino (rodea muros y obstáculos
 *    cerrados) que se pueda congelar: no está congelado ni en gracia. Si ese jugador se
 *    congela, busca a otro de inmediato. Sin objetivos se queda quieto.
 *  - Se mueve a `settings.speed`, menor que la del jugador, así que se le puede huir.
 *  - Al tocar a un jugador lo congela `settings.freezeSeconds`. Si el jugador ya tenía
 *    tiempo de "no movimiento" (una trampa que lo ralentiza), ese tiempo se suma.
 *  - Nunca cambia ningún puntaje.
 */
class GuardianSystem {
  /** @param {object} settings  rules.guardians (ver GUARDIANS en game.config.js) */
  constructor(settings) {
    this.settings = settings;
    this.guardians = [];
    this.nextId = 1;
    this.nextExtraId = 1;
  }

  // Coloca los guardianes permanentes en los extremos del campo.
  init(engine) {
    const grid = buildGrid(engine);
    const reachable = this.reachableAnchors(engine, grid);
    if (reachable.length === 0) return;

    const points = edgePoints(engine.arena);
    const atEdges = Math.min(this.settings.count, points.length);
    const taken = new Set();

    for (let i = 0; i < atEdges; i += 1) {
      const free = reachable.filter((anchor) => !taken.has(indexOf(grid, anchor)));
      const anchor = nearestAnchor(grid, points[i].x, points[i].y, free);
      if (anchor) {
        taken.add(indexOf(grid, anchor));
        this.add(centerOf(grid, anchor), false);
      }
    }

    if (this.settings.count > atEdges) {
      this.place(engine, grid, reachable, this.settings.count - atEdges, false);
    }
  }

  // Anclas libres a las que se llega desde donde está el primer jugador.
  // eslint-disable-next-line class-methods-use-this
  reachableAnchors(engine, grid) {
    const first = engine.players[0];
    const start = first && nearestAnchor(grid, first.x, first.y);
    if (!start) return [];

    const search = bfs(grid, start);

    return freeAnchors(grid).filter((anchor) => search.dist[indexOf(grid, anchor)] >= 0);
  }

  add({ x, y }, extra) {
    const id = extra ? `guardian-x${this.nextExtraId}` : `guardian-${this.nextId}`;
    if (extra) this.nextExtraId += 1;
    else this.nextId += 1;

    const guardian = { id, x, y, extra, targetId: null, path: [], repath: 0 };
    this.guardians.push(guardian);

    return guardian;
  }

  // ¿Esta ancla está lejos de los jugadores y (si se pide) de los demás guardianes?
  isFarFrom(engine, point, { fromPlayers, fromGuardians }) {
    if (engine.players.some((p) => Math.hypot(p.x - point.x, p.y - point.y) < fromPlayers)) {
      return false;
    }

    return !this.guardians.some(
      (g) => Math.hypot(g.x - point.x, g.y - point.y) < fromGuardians
    );
  }

  /**
   * Coloca `count` guardianes en puntos libres y alcanzables, lejos de los jugadores.
   * Primero prueba puntos al azar; si no encuentra, recorre las anclas en orden (así siempre
   * termina, incluso con un generador aleatorio fijo en las pruebas).
   */
  place(engine, grid, reachable, count, extra) {
    const added = [];
    const total = reachable.length;
    const minPlayers = this.settings.invasionMinDistance;

    for (let n = 0; n < count && total > 0; n += 1) {
      let chosen = null;

      for (let tries = 0; tries < RANDOM_TRIES && !chosen; tries += 1) {
        const point = centerOf(grid, reachable[Math.floor(engine.random() * total)]);
        if (this.isFarFrom(engine, point, { fromPlayers: minPlayers, fromGuardians: MIN_GUARDIAN_GAP })) {
          chosen = point;
        }
      }

      // Respaldo: recorre todas; la 2.ª pasada ya no exige separación entre guardianes.
      const first = Math.floor(engine.random() * total);
      for (let pass = 0; pass < 2 && !chosen; pass += 1) {
        for (let i = 0; i < total && !chosen; i += 1) {
          const point = centerOf(grid, reachable[(first + i) % total]);
          const gap = pass === 0 ? MIN_GUARDIAN_GAP : 0;
          if (this.isFarFrom(engine, point, { fromPlayers: minPlayers, fromGuardians: gap })) {
            chosen = point;
          }
        }
      }

      if (chosen) added.push(this.add(chosen, extra));
    }

    return added;
  }

  // Evento "invasión de guardianes": guardianes extra con las mismas características.
  spawnExtra(engine, count) {
    const grid = buildGrid(engine);
    const reachable = this.reachableAnchors(engine, grid);

    return this.place(engine, grid, reachable, count, true);
  }

  removeExtra() {
    this.guardians = this.guardians.filter((guardian) => !guardian.extra);
  }

  update(dt, engine) {
    const { elapsed } = engine;
    const targets = engine.players.filter((player) => isTargetable(player, elapsed));
    let grid = null;

    for (const guardian of this.guardians) {
      // Si su objetivo ya no se puede congelar (lo congeló otro guardián, o está en gracia),
      // busca a otro en este mismo paso en vez de esperar al próximo replanteo.
      if (guardian.targetId !== null && !targets.some((p) => p.id === guardian.targetId)) {
        guardian.repath = 0;
      }

      guardian.repath -= dt;
      if (guardian.repath <= 0) {
        grid = grid || buildGrid(engine);
        this.plan(guardian, grid, engine, targets);
        guardian.repath = this.settings.repathSeconds;
      }

      this.move(guardian, dt, engine);
      this.touch(guardian, engine);
    }
  }

  // Elige al jugador más cercano por camino y calcula la ruta hasta él.
  plan(guardian, grid, engine, targets) {
    const radius = engine.arena.collisionRadius ?? engine.arena.playerRadius;

    // Un obstáculo pudo cerrarse sobre el guardián: se le saca al paso libre más cercano.
    if (engine.collides(guardian.x, guardian.y, radius - 0.5)) {
      const anchor = nearestAnchor(grid, guardian.x, guardian.y, freeAnchors(grid));
      if (anchor) Object.assign(guardian, centerOf(grid, anchor));
    }

    const start = nearestAnchor(grid, guardian.x, guardian.y);
    guardian.targetId = null;
    guardian.path = [];
    if (!start || targets.length === 0) return;

    const search = bfs(grid, start);
    let best = null;
    let bestSteps = Infinity;
    let bestAnchor = null;

    for (const player of targets) {
      const anchor = bestAnchorFor(grid, search, player.x, player.y);
      const steps = anchor ? search.dist[indexOf(grid, anchor)] : -1;
      if (steps >= 0 && steps < bestSteps) {
        best = player;
        bestSteps = steps;
        bestAnchor = anchor;
      }
    }
    if (!best) return;

    guardian.targetId = best.id;
    // Con el camino despejado va directo; si no, sigue las anclas de la ruta.
    if (this.lineClear(engine, guardian, best, radius)) return;

    const path = pathTo(grid, search, bestAnchor).map((anchor) => centerOf(grid, anchor));
    // No retroceder hasta el centro del ancla donde está si ya pasó de ella.
    while (
      path.length >= 2 &&
      Math.hypot(guardian.x - path[1].x, guardian.y - path[1].y) <=
        Math.hypot(path[0].x - path[1].x, path[0].y - path[1].y)
    ) {
      path.shift();
    }
    guardian.path = path;
  }

  // ¿Se puede ir en línea recta de `from` a `to` sin tocar muros?
  // eslint-disable-next-line class-methods-use-this
  lineClear(engine, from, to, radius) {
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distance / (MAX_STEP + 1)));

    for (let i = 1; i <= steps; i += 1) {
      const x = from.x + ((to.x - from.x) * i) / steps;
      const y = from.y + ((to.y - from.y) * i) / steps;
      if (engine.collides(x, y, radius)) return false;
    }

    return true;
  }

  // Avanza hacia el siguiente punto de la ruta (o hacia el jugador). Eje por eje, como los
  // jugadores: si choca con un muro se desliza por él en vez de atravesarlo.
  move(guardian, dt, engine) {
    // Sin objetivo se queda quieto hasta el próximo replanteo.
    if (guardian.targetId === null) return;

    const target = engine.players.find((player) => player.id === guardian.targetId);
    if (!target || !isTargetable(target, engine.elapsed)) {
      // Su objetivo se congeló (o se fue): que busque otro ya en el próximo paso.
      guardian.targetId = null;
      guardian.path = [];
      guardian.repath = 0;
      return;
    }

    const radius = engine.arena.collisionRadius ?? engine.arena.playerRadius;
    let remaining = this.settings.speed * dt;

    for (let guard = 0; guard < MAX_STEPS_PER_UPDATE && remaining > 0.001; guard += 1) {
      while (
        guardian.path.length > 0 &&
        Math.hypot(guardian.path[0].x - guardian.x, guardian.path[0].y - guardian.y) < 1
      ) {
        guardian.path.shift();
      }

      const goal = guardian.path[0] || target;
      const dx = goal.x - guardian.x;
      const dy = goal.y - guardian.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 0.001) break;

      const step = Math.min(remaining, MAX_STEP, distance);
      const nextX = guardian.x + (dx / distance) * step;
      const nextY = guardian.y + (dy / distance) * step;
      let moved = false;

      if (!engine.collides(nextX, guardian.y, radius)) {
        guardian.x = nextX;
        moved = true;
      }
      if (!engine.collides(guardian.x, nextY, radius)) {
        guardian.y = nextY;
        moved = true;
      }
      if (!moved) break;

      remaining -= step;
    }
  }

  // Si toca a un jugador que se pueda congelar, lo congela. El tiempo de ralentización que
  // el jugador ya tuviera (trampa) se suma al congelamiento.
  touch(guardian, engine) {
    const { elapsed } = engine;

    for (const player of engine.players) {
      if (
        isTargetable(player, elapsed) &&
        Math.hypot(player.x - guardian.x, player.y - guardian.y) <= this.settings.touchRadius
      ) {
        engine.freezePlayer(player, this.settings.freezeSeconds + slowRemaining(player, elapsed));
      }
    }
  }

  // Lo que ve el cliente: posición, si es de la invasión y a quién persigue.
  snapshot() {
    return this.guardians.map((guardian) => ({
      id: guardian.id,
      x: round(guardian.x),
      y: round(guardian.y),
      extra: guardian.extra,
      targetId: guardian.targetId,
    }));
  }
}

module.exports = { GuardianSystem, edgePoints };
