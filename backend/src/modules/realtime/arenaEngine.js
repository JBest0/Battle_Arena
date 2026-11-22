// Motor de la arena (lado servidor, autoritativo): mueve a todos los jugadores a la vez,
// reparte los ítems, cuenta puntos y decide cuándo termina la partida. No conoce sockets
// ni base de datos: recibe `dt` en cada paso, así que se prueba de forma determinista.

const { EventScheduler } = require('../events/eventScheduler');
const { ObstacleSystem } = require('../obstacles/obstacleSystem');
const { allReachable } = require('../scenarios/scenario.reachability');
const { GuardianSystem } = require('../guardians/guardianSystem');
const { initialEffects, speedFactor, slowRemaining, applyHazards } = require('./hazards');
const {
  initialPlayerState,
  isFrozen,
  freezeRemaining,
  stateOf,
  freezePlayer,
} = require('./playerStates');

// Largo máximo de cada paso de movimiento (unidades de arena); menor que una celda.
const MAX_STEP = 4;

const PLAYER_COLORS = ['#e63946', '#2a9d8f', '#f4a261', '#7b6cf6'];

function spawnPoint(index, arena) {
  const margin = 80;
  const points = [
    { x: margin, y: margin },
    { x: arena.width - margin, y: arena.height - margin },
    { x: arena.width - margin, y: margin },
    { x: margin, y: arena.height - margin },
  ];

  return points[index % points.length];
}

function round(value) {
  return Math.round(value * 10) / 10;
}

class ArenaEngine {
  /**
   * @param {object} options
   * @param {{endMode: string, durationSeconds: number|null, targetPoints: number|null}} options.config
   * @param {{width: number, height: number, playerRadius: number, itemRadius: number}} options.arena
   * @param {{playerSpeed: number, itemsOnField: number, countdownSeconds: number}} options.rules
   * @param {{id: string, username: string, avatarUrl: string}[]} options.players
   * @param {() => number} [options.random]
   * @param {object|null} [options.scenario]  escenario compilado (ver scenario.map.js); sin él
   *   la arena es un campo abierto
   * @param {object|null} [options.eventFactory]  fábrica de eventos especiales (ver
   *   modules/events); sin ella no ocurren eventos. Usa rules.eventIntervalSeconds y
   *   rules.eventDurationSeconds.
   * @param {object} [options.rules.guardians]  reglas de los guardianes (ver GUARDIANS en
   *   game.config.js). Sin ellas, o sin escenario, la partida no tiene guardianes.
   * @param {number} [options.obstacleSeed]  semilla de los obstáculos aleatorios (corredores
   *   y paredes); con la misma semilla la secuencia se repite. Por defecto sale de `random`.
   *   Las paredes aleatorias usan rules.randomWallIntervalSeconds.
   */
  constructor({
    config,
    arena,
    rules,
    players,
    random = Math.random,
    scenario = null,
    eventFactory = null,
    obstacleSeed = undefined,
  }) {
    this.config = config;
    this.scenario = scenario;
    // Copia propia de los muros: el escenario compilado se comparte entre partidas. Un
    // muro está en `solid` si es del mapa y no lo abrió un evento (ruta alternativa), o si
    // lo ocupa un obstáculo dinámico (`blockers` cuenta cuántos hay sobre cada celda).
    this.baseSolid = scenario ? scenario.solid.map((row) => [...row]) : null;
    this.solid = scenario ? scenario.solid.map((row) => [...row]) : null;
    this.blockers = new Map();
    this.openedWalls = new Set();
    this.closingWalls = new Set();
    this.arena = arena;
    this.rules = rules;
    this.random = random;

    this.status = 'COUNTDOWN';
    this.countdown = rules.countdownSeconds;
    this.elapsed = 0;
    this.items = [];
    this.winnerIds = [];
    this.nextItemId = 1;
    this.events = eventFactory
      ? new EventScheduler({
          factory: eventFactory,
          intervalSeconds: rules.eventIntervalSeconds,
          durationSeconds: rules.eventDurationSeconds,
          random,
        })
      : null;

    this.players = players.map((player, index) => ({
      id: player.id,
      username: player.username,
      avatarUrl: player.avatarUrl,
      color: PLAYER_COLORS[index % PLAYER_COLORS.length],
      ...this.spawnFor(index),
      score: 0,
      dx: 0,
      dy: 0,
      ...initialEffects(),
      ...initialPlayerState(),
    }));

    this.obstacles = null;
    if (scenario && ObstacleSystem.isNeeded(scenario)) {
      const seed =
        obstacleSeed ??
        (ObstacleSystem.usesRandom(scenario) ? Math.floor(random() * 4294967296) : 0);
      this.obstacles = new ObstacleSystem({
        scenario,
        seed,
        randomWallIntervalSeconds: rules.randomWallIntervalSeconds ?? 10,
      });
      this.obstacles.init(this);
    }

    // Guardianes (US-21): se colocan al final, con los obstáculos iniciales ya puestos.
    this.guardians = null;
    if (scenario && rules.guardians && rules.guardians.count > 0) {
      this.guardians = new GuardianSystem(rules.guardians);
      this.guardians.init(this);
    }
  }

  spawnFor(index) {
    if (this.scenario) {
      const spawn = this.scenario.spawns[index % this.scenario.spawns.length];

      return { x: spawn.x, y: spawn.y };
    }

    return spawnPoint(index, this.arena);
  }

  // ¿Un círculo en (x, y) con radio `radius` toca algún muro o el reactor del escenario?
  collides(x, y, radius) {
    if (!this.scenario) return false;

    const { cellSize, cols, rows } = this.scenario;
    const { solid } = this;
    const firstCol = Math.max(0, Math.floor((x - radius) / cellSize));
    const lastCol = Math.min(cols - 1, Math.floor((x + radius) / cellSize));
    const firstRow = Math.max(0, Math.floor((y - radius) / cellSize));
    const lastRow = Math.min(rows - 1, Math.floor((y + radius) / cellSize));

    for (let row = firstRow; row <= lastRow; row += 1) {
      for (let col = firstCol; col <= lastCol; col += 1) {
        if (solid[row][col]) {
          const nearestX = Math.min(Math.max(x, col * cellSize), (col + 1) * cellSize);
          const nearestY = Math.min(Math.max(y, row * cellSize), (row + 1) * cellSize);
          if (Math.hypot(x - nearestX, y - nearestY) < radius) return true;
        }
      }
    }

    return false;
  }

  get timeRemaining() {
    if (this.config.endMode !== 'TIME') return null;

    return Math.max(0, this.config.durationSeconds - this.elapsed);
  }

  // Dirección deseada (-1..1 por eje). Se normaliza para que la diagonal no sea más rápida.
  setInput(userId, dx, dy) {
    const player = this.players.find((candidate) => candidate.id === userId);
    if (!player) return;

    let x = Number.isFinite(dx) ? dx : 0;
    let y = Number.isFinite(dy) ? dy : 0;
    const length = Math.hypot(x, y);

    if (length > 1) {
      x /= length;
      y /= length;
    }

    player.dx = x;
    player.dy = y;
  }

  step(dt) {
    if (this.status === 'FINISHED') return;

    if (this.status === 'COUNTDOWN') {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.countdown = 0;
        this.status = 'RUNNING';
        this.refillItems();
      }
      return;
    }

    this.elapsed += dt;
    this.events?.update(dt, this);
    this.guardians?.update(dt, this);
    this.movePlayers(dt);
    this.obstacles?.update(dt, this);
    this.applyPlayerHazards();
    this.collectItems();
    this.refillItems();
    this.closePendingWalls();
    this.finishIfNeeded();
  }

  // Se mueve en pasos cortos (de a lo sumo MAX_STEP unidades) y eje por eje: si un eje choca
  // con un muro se queda quieto y el otro sigue, así el jugador se desliza por las paredes y
  // queda pegado al muro en vez de frenar lejos de él.
  movePlayers(dt) {
    const { width, height, playerRadius } = this.arena;
    const radius = this.arena.collisionRadius ?? playerRadius;
    const clamp = (value, max) => Math.min(Math.max(value, playerRadius), max - playerRadius);

    for (const player of this.players) {
      // Un jugador congelado por un guardián no se mueve hasta descongelarse (playerStates.js).
      if (isFrozen(player, this.elapsed)) continue;

      // Una trampa pisada reduce la velocidad un rato (ver hazards.js).
      const speed = this.rules.playerSpeed * speedFactor(player, this.elapsed);
      const distance = Math.hypot(player.dx, player.dy) * speed * dt;
      const steps = Math.max(1, Math.ceil(distance / MAX_STEP));
      const stepDt = dt / steps;

      for (let i = 0; i < steps; i += 1) {
        const nextX = clamp(player.x + player.dx * speed * stepDt, width);
        if (!this.collides(nextX, player.y, radius)) player.x = nextX;

        const nextY = clamp(player.y + player.dy * speed * stepDt, height);
        if (!this.collides(player.x, nextY, radius)) player.y = nextY;
      }
    }
  }

  // Trampas y sectores de riesgo del escenario (si tiene).
  applyPlayerHazards() {
    if (!this.scenario) return;

    applyHazards({
      players: this.players,
      traps: this.scenario.traps,
      riskZones: this.scenario.riskZones,
      elapsed: this.elapsed,
    });
  }

  // Cada ítem es del jugador más cercano que lo toque; si hay empate, del primero en la lista.
  collectItems() {
    const reach = this.arena.playerRadius + this.arena.itemRadius;
    // Cada celda vale 1 punto, multiplicado por los eventos activos (sobrecarga: x2) y por
    // el sector de riesgo donde está quien la recoge.
    const eventMultiplier = this.events ? this.events.modifiers().pointMultiplier : 1;

    this.items = this.items.filter((item) => {
      let closest = null;
      let closestDistance = Infinity;

      for (const player of this.players) {
        // Congelado: no puede recoger celdas.
        if (isFrozen(player, this.elapsed)) continue;

        const distance = Math.hypot(item.x - player.x, item.y - player.y);
        if (distance <= reach && distance < closestDistance) {
          closest = player;
          closestDistance = distance;
        }
      }

      if (closest) {
        closest.score += eventMultiplier * closest.risk;
        return false;
      }
      return true;
    });
  }

  // Los ítems aparecen en las celdas "C" del escenario (o en un punto libre al azar si
  // el escenario no tiene), sin repetir una posición ocupada.
  refillItems() {
    // Las celdas extra de los eventos no cuentan: las normales se reponen igual.
    while (this.items.filter((item) => !item.bonus).length < this.rules.itemsOnField) {
      const spot = this.pickItemSpot();
      this.items.push({ id: `item-${this.nextItemId}`, x: spot.x, y: spot.y });
      this.nextItemId += 1;
    }
  }

  // Congela a un jugador (lo llaman los guardianes). Solo el servidor decide los estados: el
  // cliente no puede ponerlos ni quitarlos. La gracia posterior evita el recongelamiento.
  freezePlayer(player, seconds) {
    freezePlayer(player, this.elapsed, seconds, this.rules.guardians?.graceSeconds ?? 0);
  }

  // Celda extra (la usan los eventos, p. ej. la lluvia de energía). Se marca como `bonus`
  // para poder retirarla cuando el evento termina.
  spawnBonusItem() {
    const spot = this.pickItemSpot();
    this.items.push({ id: `item-${this.nextItemId}`, x: spot.x, y: spot.y, bonus: true });
    this.nextItemId += 1;
  }

  removeBonusItems() {
    this.items = this.items.filter((item) => !item.bonus);
  }

  // --- Muros dinámicos ---
  // Los cambian los eventos (ruta alternativa: openWall / requestWallClose) y los obstáculos
  // (tryBlocks). Ninguna operación deja a un jugador dentro de un muro ni cierra todas las
  // rutas al reactor.

  // Datos de la cuadrícula del mapa (sin obstáculos) para decidir qué muros se pueden abrir.
  wallGrid() {
    const { cols, rows, reactor } = this.scenario;

    return { solid: this.baseSolid, cols, rows, reactor };
  }

  // Valor de una celda: muro del mapa que no abrió un evento, u ocupada por un obstáculo.
  cellIsSolid(col, row) {
    return (
      (this.baseSolid[row][col] && !this.openedWalls.has(`${col},${row}`)) ||
      (this.blockers.get(`${col},${row}`) || 0) > 0
    );
  }

  refreshCell(col, row) {
    this.solid[row][col] = this.cellIsSolid(col, row);
  }

  removeItemsIn(cells) {
    const size = this.scenario.cellSize;
    this.items = this.items.filter(
      (item) =>
        !cells.some(
          ({ col, row }) => Math.floor(item.x / size) === col && Math.floor(item.y / size) === row
        )
    );
  }

  openWall(col, row) {
    if (!this.baseSolid?.[row]?.[col]) return;

    this.openedWalls.add(`${col},${row}`);
    this.closingWalls.delete(`${col},${row}`);
    this.refreshCell(col, row);
  }

  // Pide cerrar esos muros: cada uno se cierra apenas no haya ningún jugador tocándolo y no
  // quede incomunicada ninguna zona, para no dejar a nadie atrapado.
  requestWallClose(cells) {
    cells.forEach(({ col, row }) => {
      if (this.openedWalls.has(`${col},${row}`)) this.closingWalls.add(`${col},${row}`);
    });
  }

  wallBlockedByPlayer(col, row) {
    const size = this.scenario.cellSize;
    const radius = (this.arena.collisionRadius ?? this.arena.playerRadius) + 1;

    return this.players.some((player) => {
      const nearestX = Math.min(Math.max(player.x, col * size), (col + 1) * size);
      const nearestY = Math.min(Math.max(player.y, row * size), (row + 1) * size);

      return Math.hypot(player.x - nearestX, player.y - nearestY) < radius;
    });
  }

  // ¿Con esos muros siguen conectados el reactor, las terminales, las celdas, los inicios y
  // cada jugador? (pasillos donde cabe el jugador, ver scenario.reachability)
  stillConnected(solid) {
    const { cols, rows, reactor, targets, cellSize } = this.scenario;
    if (!allReachable({ solid, cols, rows, reactor, targets })) return false;

    const start = targets[0];
    if (!start) return true;

    const seen = new Set([`${start.col},${start.row}`]);
    const queue = [start];
    while (queue.length > 0) {
      const { col, row } = queue.shift();
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dc, dr]) => {
        const nextCol = col + dc;
        const nextRow = row + dr;
        const key = `${nextCol},${nextRow}`;
        if (
          nextCol >= 0 &&
          nextCol < cols &&
          nextRow >= 0 &&
          nextRow < rows &&
          !solid[nextRow][nextCol] &&
          !seen.has(key)
        ) {
          seen.add(key);
          queue.push({ col: nextCol, row: nextRow });
        }
      });
    }

    return this.players.every((player) => {
      const col = Math.min(cols - 1, Math.max(0, Math.floor(player.x / cellSize)));
      const row = Math.min(rows - 1, Math.max(0, Math.floor(player.y / cellSize)));
      return seen.has(`${col},${row}`);
    });
  }

  /**
   * Cambia qué celdas ocupan los obstáculos: `add` las ocupa y `remove` las libera. Solo se
   * hace si ninguna celda que pase a ser muro toca a un jugador y si, con el cambio, el
   * reactor, las terminales, las celdas de energía, los inicios y los jugadores siguen
   * conectados. Devuelve si se aplicó. Liberar celdas siempre se puede.
   */
  tryBlocks({ add = [], remove = [] }) {
    const { cols, rows } = this.scenario;
    const delta = new Map();
    const bump = ({ col, row }, amount) => {
      const key = `${col},${row}`;
      delta.set(key, { col, row, change: (delta.get(key)?.change || 0) + amount });
    };
    [...add, ...remove].forEach(({ col, row }) => {
      if (col < 0 || row < 0 || col >= cols || row >= rows) delta.set('fuera', { invalid: true });
    });
    if (delta.has('fuera')) return false;
    add.forEach((cell) => bump(cell, 1));
    remove.forEach((cell) => bump(cell, -1));

    const next = this.solid.map((row) => [...row]);
    const newlySolid = [];
    for (const [key, { col, row, change }] of delta) {
      const count = (this.blockers.get(key) || 0) + change;
      const solid =
        (this.baseSolid[row][col] && !this.openedWalls.has(key)) || count > 0;
      if (solid && !this.solid[row][col]) newlySolid.push({ col, row });
      next[row][col] = solid;
    }

    if (newlySolid.length > 0) {
      if (newlySolid.some(({ col, row }) => this.wallBlockedByPlayer(col, row))) return false;
      if (!this.stillConnected(next)) return false;
    }

    for (const [key, { col, row, change }] of delta) {
      const count = (this.blockers.get(key) || 0) + change;
      if (count > 0) this.blockers.set(key, count);
      else this.blockers.delete(key);
      this.refreshCell(col, row);
    }
    // Una celda de energía que quedó dentro de un obstáculo no se podría recoger.
    this.removeItemsIn(newlySolid);

    return true;
  }

  closePendingWalls() {
    if (this.closingWalls.size === 0) return;

    for (const key of [...this.closingWalls]) {
      const [col, row] = key.split(',').map(Number);
      if (!this.wallBlockedByPlayer(col, row)) {
        // El hueco puede ser una ruta de la que dependen otras zonas (si un obstáculo cerró
        // la otra): espera a que cerrarlo no deje a nadie sin camino.
        const next = this.solid.map((line) => [...line]);
        next[row][col] = true;
        if (!this.stillConnected(next)) continue;

        this.openedWalls.delete(key);
        this.closingWalls.delete(key);
        this.refreshCell(col, row);
        // Una celda que cayó dentro del hueco no se podría recoger: se retira.
        this.removeItemsIn([{ col, row }]);
      }
    }
  }

  pickItemSpot() {
    const free = (this.scenario?.cells || []).filter(
      (cell) => !this.items.some((item) => item.x === cell.x && item.y === cell.y)
    );
    if (free.length > 0) {
      return free[Math.floor(this.random() * free.length)];
    }

    const margin = this.arena.playerRadius + 12;
    let spot = null;
    for (let attempt = 0; attempt < 30 && !spot; attempt += 1) {
      const candidate = {
        x: margin + this.random() * (this.arena.width - margin * 2),
        y: margin + this.random() * (this.arena.height - margin * 2),
      };
      if (!this.collides(candidate.x, candidate.y, this.arena.itemRadius)) spot = candidate;
    }

    return spot || this.scanForItemSpot() || { x: this.arena.width / 2, y: margin };
  }

  // Respaldo: recorre los centros de las celdas del escenario (desde una al azar) y devuelve
  // el primero libre de muros y sin otra celda de energía encima.
  scanForItemSpot() {
    if (!this.scenario) return null;

    const { cols, rows, cellSize } = this.scenario;
    const total = cols * rows;
    const first = Math.floor(this.random() * total);

    for (let i = 0; i < total; i += 1) {
      const index = (first + i) % total;
      const x = (index % cols) * cellSize + cellSize / 2;
      const y = Math.floor(index / cols) * cellSize + cellSize / 2;
      const taken = this.items.some((item) => item.x === x && item.y === y);
      if (!taken && !this.collides(x, y, this.arena.itemRadius)) return { x, y };
    }

    return null;
  }

  finishIfNeeded() {
    const best = Math.max(...this.players.map((player) => player.score));
    const timeUp = this.config.endMode === 'TIME' && this.timeRemaining <= 0;
    const targetReached =
      this.config.endMode === 'POINTS' && best >= this.config.targetPoints;

    if (timeUp || targetReached) {
      this.finish();
    }
  }

  // Termina la partida; ganan todos los que tengan el puntaje más alto (varios = empate).
  finish() {
    if (this.status === 'FINISHED') return;

    this.events?.finish(this);
    const best = Math.max(...this.players.map((player) => player.score));
    this.status = 'FINISHED';
    this.winnerIds = this.players
      .filter((player) => player.score === best)
      .map((player) => player.id);
  }

  snapshot() {
    return {
      status: this.status,
      countdown: this.countdown,
      timeRemaining: this.timeRemaining,
      targetPoints:
        this.config.endMode === 'POINTS' ? this.config.targetPoints : null,
      players: this.players.map((player) => ({
        id: player.id,
        username: player.username,
        avatarUrl: player.avatarUrl,
        color: player.color,
        x: round(player.x),
        y: round(player.y),
        score: player.score,
        // Efectos: segundos de ralentización que le quedan (0 = ninguno) y multiplicador del
        // sector de riesgo donde está (1 = fuera de uno).
        slow: round(slowRemaining(player, this.elapsed)),
        risk: player.risk,
        // Estado temporal ('normal' | 'frozen') y segundos de congelamiento que le quedan.
        state: stateOf(player, this.elapsed),
        frozen: round(freezeRemaining(player, this.elapsed)),
      })),
      items: this.items.map((item) => ({
        id: item.id,
        x: round(item.x),
        y: round(item.y),
        bonus: Boolean(item.bonus),
      })),
      events: this.events ? this.events.publicState() : [],
      // Guardianes: { id, x, y, extra (de la invasión), targetId (a quién persiguen) }.
      guardians: this.guardians ? this.guardians.snapshot() : [],
      // Muros abiertos por eventos, como [columna, fila] (los que se están cerrando incluidos).
      openWalls: [...this.openedWalls].sort().map((key) => key.split(',').map(Number)),
      // Obstáculos dinámicos con su posición y estado: { id, kind (barrier | door | corridor |
      // wall), col, row, cols, rows, closed, warning }.
      obstacles: this.obstacles ? this.obstacles.snapshot() : [],
      winnerIds: this.winnerIds,
    };
  }

  result() {
    return {
      scores: Object.fromEntries(
        this.players.map((player) => [player.id, player.score])
      ),
      winnerIds: this.winnerIds,
      // Solo si la partida tiene eventos especiales (ver modules/events).
      ...(this.events ? { events: this.events.history() } : {}),
    };
  }
}

module.exports = { ArenaEngine, PLAYER_COLORS, spawnPoint };
