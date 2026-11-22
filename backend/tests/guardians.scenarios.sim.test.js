const path = require('path');
const { ARENA, GAMEPLAY, GUARDIANS } = require('../src/modules/game/game.config');
const { ArenaEngine } = require('../src/modules/realtime/arenaEngine');
const { loadScenarioCatalog } = require('../src/modules/scenarios/scenario.catalog');
const { createDefaultEventFactory } = require('../src/modules/events/eventFactory');
const { seededRandom } = require('../src/shared/seededRandom');

const catalog = loadScenarioCatalog({
  dir: path.join(__dirname, '..', 'src', 'scenarios'),
  arena: ARENA,
});
const PLAYERS = ['a', 'b', 'c', 'd'].map((id) => ({ id, username: id, avatarUrl: `/${id}.png` }));
const STEP = 0.1;

// Partida de 10 minutos en cada escenario real con todo activo a la vez (obstáculos, trampas,
// eventos especiales —incluida la invasión— y los guardianes) y cuatro jugadores que se mueven
// al azar. Comprueba que los guardianes funcionan en los mapas reales: nacen en suelo libre,
// no se quedan dentro de un muro, congelan de verdad y el congelamiento impide moverse.
function simulate(id, seed) {
  const scenario = catalog.getCompiled(id);
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
      guardians: GUARDIANS,
    },
    players: PLAYERS,
    random,
    scenario,
    eventFactory: createDefaultEventFactory(),
    obstacleSeed: seed,
  });

  const stats = {
    startGuardians: engine.guardians.guardians.length,
    startInWall: engine.guardians.guardians.filter((g) =>
      engine.collides(g.x, g.y, ARENA.collisionRadius)
    ).length,
    freezes: 0,
    thaws: 0,
    maxGuardians: 0,
    longestInWall: 0,
    movedWhileFrozen: 0,
  };
  const wasFrozen = new Map();
  let inWall = 0;

  for (let step = 0; step < 6000; step += 1) {
    if (step % 15 === 0) {
      engine.players.forEach((p) => engine.setInput(p.id, random() * 2 - 1, random() * 2 - 1));
    }

    // Quien sigue congelado después de este paso no debe haberse movido.
    const before = engine.players.map((p) => ({ x: p.x, y: p.y, until: p.frozenUntil }));
    engine.step(STEP);

    engine.players.forEach((player, i) => {
      const stillFrozen = engine.elapsed < before[i].until;
      if (stillFrozen && (player.x !== before[i].x || player.y !== before[i].y)) {
        stats.movedWhileFrozen += 1;
      }
    });

    engine.snapshot().players.forEach((player) => {
      const frozen = player.frozen > 0;
      if (frozen && !wasFrozen.get(player.id)) stats.freezes += 1;
      if (!frozen && wasFrozen.get(player.id)) stats.thaws += 1;
      wasFrozen.set(player.id, frozen);
    });

    stats.maxGuardians = Math.max(stats.maxGuardians, engine.guardians.guardians.length);
    // Una barrera puede moverse sobre un guardián: se le saca del muro en el siguiente replanteo.
    const stuck = engine.guardians.guardians.some((g) =>
      engine.collides(g.x, g.y, ARENA.collisionRadius - 0.5)
    );
    inWall = stuck ? inWall + 1 : 0;
    stats.longestInWall = Math.max(stats.longestInWall, inWall);
  }

  return { engine, stats };
}

describe('Guardianes en los escenarios reales', () => {
  catalog.list().forEach(({ id }) => {
    it(`${id}: nacen en suelo libre, congelan y no se quedan atascados en muros`, () => {
      const { engine, stats } = simulate(id, 777);

      expect(stats.startGuardians).toBe(GUARDIANS.count);
      expect(stats.startInWall).toBe(0);
      expect(stats.freezes).toBeGreaterThan(0);
      expect(stats.thaws).toBeGreaterThan(0);
      expect(stats.movedWhileFrozen).toBe(0);
      expect(stats.longestInWall).toBeLessThanOrEqual(2);

      // La invasión ocurrió y los extra solo existen mientras el evento está activo.
      expect(stats.maxGuardians).toBe(GUARDIANS.count + GUARDIANS.invasionCount);
      const invading = engine.events.active?.record.type === 'guardian-invasion';
      const extras = engine.guardians.guardians.filter((g) => g.extra).length;
      expect(extras).toBe(invading ? GUARDIANS.invasionCount : 0);
    });
  });
});
