import { buildInitialArenaState } from './arenaState';

/*
 * Simulación local SOLO para ver y probar la arena mientras no hay tiempo real.
 * Los jugadores persiguen el ítem más cercano y suman 1 punto al tocarlo. No guarda
 * nada en el backend ni usa el control ESP32.
 */

const BASE_SPEED = 150; // unidades de arena por segundo
const SPEED_FACTORS = [1, 0.9, 1.1, 0.95];
const ITEMS_ON_FIELD = 4;

function fillWithBots(players, maxPlayers) {
  const filled = [...players];

  for (let n = 1; filled.length < maxPlayers; n += 1) {
    filled.push({ id: `bot-${n}`, username: `Bot ${n}`, avatarUrl: null });
  }

  return filled;
}

export function createMockArena(match, arena) {
  const { config } = match;
  const players = fillWithBots(match.players, config.maxPlayers);
  const state = buildInitialArenaState({ ...match, players }, arena);
  let elapsed = 0;
  let nextItemId = 1;

  function randomPoint() {
    const margin = arena.playerRadius + 12;

    return {
      x: margin + Math.random() * (arena.width - margin * 2),
      y: margin + Math.random() * (arena.height - margin * 2),
    };
  }

  function refillItems() {
    while (state.items.length < ITEMS_ON_FIELD) {
      state.items.push({ id: `item-${nextItemId}`, ...randomPoint() });
      nextItemId += 1;
    }
  }

  function movePlayer(player, index, dt) {
    let nearest = null;
    let nearestDistance = Infinity;

    for (const item of state.items) {
      const distance = Math.hypot(item.x - player.x, item.y - player.y);
      if (distance < nearestDistance) {
        nearest = item;
        nearestDistance = distance;
      }
    }

    if (!nearest) return;

    const speed = BASE_SPEED * SPEED_FACTORS[index % SPEED_FACTORS.length];
    const step = Math.min(speed * dt, nearestDistance);

    if (nearestDistance > 0) {
      player.x += ((nearest.x - player.x) / nearestDistance) * step;
      player.y += ((nearest.y - player.y) / nearestDistance) * step;
    }

    if (nearestDistance - step <= arena.playerRadius + arena.itemRadius) {
      player.score += 1;
      state.items = state.items.filter((item) => item.id !== nearest.id);
    }
  }

  function finishIfNeeded() {
    const timeUp = config.endMode === 'TIME' && state.timeRemaining <= 0;
    const best = Math.max(...state.players.map((player) => player.score));
    const targetReached =
      config.endMode === 'POINTS' && best >= config.targetPoints;

    if (!timeUp && !targetReached) return;

    state.status = 'FINISHED';
    state.winnerIds = state.players
      .filter((player) => player.score === best)
      .map((player) => player.id);
  }

  function step(dt) {
    if (state.status === 'FINISHED') return state;

    elapsed += dt;
    if (config.endMode === 'TIME') {
      state.timeRemaining = Math.max(0, config.durationSeconds - elapsed);
    }

    state.players.forEach((player, index) => movePlayer(player, index, dt));
    refillItems();
    finishIfNeeded();

    return state;
  }

  refillItems();

  return { state, step };
}
