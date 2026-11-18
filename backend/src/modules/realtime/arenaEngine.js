// Motor de la arena (lado servidor, autoritativo): mueve a todos los jugadores a la vez,
// reparte los ítems, cuenta puntos y decide cuándo termina la partida. No conoce sockets
// ni base de datos: recibe `dt` en cada paso, así que se prueba de forma determinista.

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
   */
  constructor({ config, arena, rules, players, random = Math.random, scenario = null }) {
    this.config = config;
    this.scenario = scenario;
    this.arena = arena;
    this.rules = rules;
    this.random = random;

    this.status = 'COUNTDOWN';
    this.countdown = rules.countdownSeconds;
    this.elapsed = 0;
    this.items = [];
    this.winnerIds = [];
    this.nextItemId = 1;

    this.players = players.map((player, index) => ({
      id: player.id,
      username: player.username,
      avatarUrl: player.avatarUrl,
      color: PLAYER_COLORS[index % PLAYER_COLORS.length],
      ...this.spawnFor(index),
      score: 0,
      dx: 0,
      dy: 0,
    }));
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

    const { solid, cellSize, cols, rows } = this.scenario;
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
    this.movePlayers(dt);
    this.collectItems();
    this.refillItems();
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
      const distance = Math.hypot(player.dx, player.dy) * this.rules.playerSpeed * dt;
      const steps = Math.max(1, Math.ceil(distance / MAX_STEP));
      const stepDt = dt / steps;

      for (let i = 0; i < steps; i += 1) {
        const nextX = clamp(player.x + player.dx * this.rules.playerSpeed * stepDt, width);
        if (!this.collides(nextX, player.y, radius)) player.x = nextX;

        const nextY = clamp(player.y + player.dy * this.rules.playerSpeed * stepDt, height);
        if (!this.collides(player.x, nextY, radius)) player.y = nextY;
      }
    }
  }

  // Cada ítem es del jugador más cercano que lo toque; si hay empate, del primero en la lista.
  collectItems() {
    const reach = this.arena.playerRadius + this.arena.itemRadius;

    this.items = this.items.filter((item) => {
      let closest = null;
      let closestDistance = Infinity;

      for (const player of this.players) {
        const distance = Math.hypot(item.x - player.x, item.y - player.y);
        if (distance <= reach && distance < closestDistance) {
          closest = player;
          closestDistance = distance;
        }
      }

      if (closest) {
        closest.score += 1;
        return false;
      }
      return true;
    });
  }

  // Los ítems aparecen en las celdas "C" del escenario (o en un punto libre al azar si
  // el escenario no tiene), sin repetir una posición ocupada.
  refillItems() {
    while (this.items.length < this.rules.itemsOnField) {
      const spot = this.pickItemSpot();
      this.items.push({ id: `item-${this.nextItemId}`, x: spot.x, y: spot.y });
      this.nextItemId += 1;
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

    return spot || { x: this.arena.width / 2, y: margin };
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
      })),
      items: this.items.map((item) => ({
        id: item.id,
        x: round(item.x),
        y: round(item.y),
      })),
      winnerIds: this.winnerIds,
    };
  }

  result() {
    return {
      scores: Object.fromEntries(
        this.players.map((player) => [player.id, player.score])
      ),
      winnerIds: this.winnerIds,
    };
  }
}

module.exports = { ArenaEngine, PLAYER_COLORS, spawnPoint };
