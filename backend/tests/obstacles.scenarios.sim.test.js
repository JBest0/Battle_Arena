const path = require('path');
const { ARENA, GAMEPLAY } = require('../src/modules/game/game.config');
const { ArenaEngine } = require('../src/modules/realtime/arenaEngine');
const { loadScenarioCatalog } = require('../src/modules/scenarios/scenario.catalog');
const { createDefaultEventFactory } = require('../src/modules/events/eventFactory');
const { seededRandom } = require('../src/shared/seededRandom');

const catalog = loadScenarioCatalog({
  dir: path.join(__dirname, '..', 'src', 'scenarios'),
  arena: ARENA,
});
const PLAYERS = ['a', 'b', 'c', 'd'].map((id) => ({ id, username: id, avatarUrl: `/${id}.png` }));

// Partida larga con todo activo a la vez (obstáculos, trampas, sectores y eventos
// especiales) y cuatro jugadores que se mueven al azar. En cada paso se comprueba que
// nadie queda dentro de un muro y que el reactor, las terminales, las celdas, los inicios y
// los jugadores siguen conectados.
function simulate(id, seed) {
  const scenario = catalog.getCompiled(id);
  const original = scenario.solid.map((row) => [...row]);
  const random = seededRandom(seed);
  const engine = new ArenaEngine({
    config: { endMode: 'TIME', durationSeconds: 5000, targetPoints: null },
    arena: ARENA,
    rules: {
      ...GAMEPLAY,
      countdownSeconds: 1,
      randomWallIntervalSeconds: 5,
      eventIntervalSeconds: 15,
      eventDurationSeconds: 8,
    },
    players: PLAYERS,
    random,
    scenario,
    eventFactory: createDefaultEventFactory(),
    obstacleSeed: seed,
  });
  const seen = { closedDoor: false, closedCorridor: false, movedBarrier: false, wall: false };
  const barrierAt = new Map();
  const slowed = new Set();
  let maxRisk = 1;

  for (let step = 0; step < 6000; step += 1) {
    if (step % 15 === 0) {
      engine.players.forEach((player) => engine.setInput(player.id, random() * 2 - 1, random() * 2 - 1));
    }
    engine.step(0.1);

    engine.players.forEach((player) => {
      if (engine.collides(player.x, player.y, ARENA.collisionRadius - 0.5)) {
        throw new Error(`${id}: ${player.username} quedó dentro de un muro (paso ${step})`);
      }
      if (engine.stillConnected(engine.solid) === false && step > 20) {
        throw new Error(`${id}: se cortó la ruta al reactor o a un jugador (paso ${step})`);
      }
      if (player.slowUntil > engine.elapsed) slowed.add(player.id);
      maxRisk = Math.max(maxRisk, player.risk);
    });

    engine.snapshot().obstacles.forEach((item) => {
      if (item.kind === 'door' && item.closed) seen.closedDoor = true;
      if (item.kind === 'corridor' && item.closed) seen.closedCorridor = true;
      if (item.kind === 'wall') seen.wall = true;
      if (item.kind === 'barrier') {
        const key = `${item.col},${item.row}`;
        if (barrierAt.has(item.id) && barrierAt.get(item.id) !== key) seen.movedBarrier = true;
        barrierAt.set(item.id, key);
      }
    });
  }

  return { engine, scenario, original, seen, slowed, maxRisk };
}

describe.each(catalog.list().map((s) => s.id))('Simulación larga en %s', (id) => {
  let result;
  beforeAll(() => {
    result = simulate(id, 2024);
  });

  it('nadie atraviesa un muro y siempre hay ruta al reactor, a las terminales y a cada jugador', () => {
    // las comprobaciones paso a paso están en simulate(): si fallaran, beforeAll lanzaría
    expect(result.engine.status).toBe('RUNNING');
  });

  it('el escenario compartido no se modifica', () => {
    expect(result.scenario.solid).toEqual(result.original);
  });

  it('los obstáculos de este escenario sí se activan durante la partida', () => {
    const def = catalog.get(id);

    if (def.obstacles.doors.length > 0) expect(result.seen.closedDoor).toBe(true);
    if (def.obstacles.corridors.length > 0) expect(result.seen.closedCorridor).toBe(true);
    if (def.obstacles.barriers.length > 0) expect(result.seen.movedBarrier).toBe(true);
    if (def.randomWalls) expect(result.seen.wall).toBe(true);
  });

  it('las trampas ralentizan y los sectores de riesgo se pisan', () => {
    expect(result.slowed.size).toBeGreaterThan(0);
    expect(result.maxRisk).toBeGreaterThanOrEqual(2);
  });
});

describe('Semilla', () => {
  it('con la misma semilla las paredes aleatorias aparecen en los mismos lugares', () => {
    const walls = (seed) =>
      simulate('laboratorio-subterraneo', seed)
        .engine.snapshot()
        .obstacles.map((o) => `${o.kind}:${o.col},${o.row}`)
        .sort();

    expect(walls(5)).toEqual(walls(5));
  });
});
