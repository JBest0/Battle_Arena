// Motor de la arena (lado servidor, autoritativo): mueve a todos los jugadores a la vez,
// reparte los ítems, cuenta puntos y decide cuándo termina la partida. No conoce sockets
// ni base de datos: recibe `dt` en cada paso, así que se prueba de forma determinista.

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
   */
  constructor({ config, arena, rules, players, random = Math.random }) {
    this.config = config;
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
      ...spawnPoint(index, arena),
      score: 0,
      dx: 0,
      dy: 0,
    }));
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

  movePlayers(dt) {
    const { width, height, playerRadius } = this.arena;

    for (const player of this.players) {
      player.x += player.dx * this.rules.playerSpeed * dt;
      player.y += player.dy * this.rules.playerSpeed * dt;
      player.x = Math.min(Math.max(player.x, playerRadius), width - playerRadius);
      player.y = Math.min(Math.max(player.y, playerRadius), height - playerRadius);
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

  refillItems() {
    const margin = this.arena.playerRadius + 12;

    while (this.items.length < this.rules.itemsOnField) {
      this.items.push({
        id: `item-${this.nextItemId}`,
        x: margin + this.random() * (this.arena.width - margin * 2),
        y: margin + this.random() * (this.arena.height - margin * 2),
      });
      this.nextItemId += 1;
    }
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
