const path = require('path');
const { ArenaEngine } = require('../src/modules/realtime/arenaEngine');
const { ARENA, GAMEPLAY } = require('../src/modules/game/game.config');
const { loadScenarioCatalog } = require('../src/modules/scenarios/scenario.catalog');
const { compileScenario } = require('../src/modules/scenarios/scenario.map');
const { EventFactory, createDefaultEventFactory } = require('../src/modules/events/eventFactory');
const { SpecialEvent } = require('../src/modules/events/specialEvent');
const { ReactorOverloadEvent } = require('../src/modules/events/types/reactorOverload');
const { EnergyRainEvent, EXTRA_CELLS } = require('../src/modules/events/types/energyRain');
const { BlackoutEvent } = require('../src/modules/events/types/blackout');
const {
  AlternateRouteEvent,
  findDoorCandidates,
} = require('../src/modules/events/types/alternateRoute');

const COLS = ARENA.width / ARENA.cellSize;
const ROWS = ARENA.height / ARENA.cellSize;
const RULES = {
  ...GAMEPLAY,
  itemsOnField: 3,
  countdownSeconds: 1,
  eventIntervalSeconds: 10, // con random = 0,5 el primer evento llega a los 10 s
  eventDurationSeconds: 5,
};
const CONFIG = { endMode: 'TIME', durationSeconds: 1000, targetPoints: null };
const PLAYERS = [
  { id: 'a', username: 'ana', avatarUrl: '/a.png' },
  { id: 'b', username: 'beto', avatarUrl: '/b.png' },
];

// Escenario mínimo: borde, reactor al centro y cuatro inicios; `walls` agrega muros.
function scenarioWith({ walls = [], cells = [] } = {}) {
  const rows = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) =>
      r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1 ? '#' : '.'
    )
  );
  for (let r = 8; r <= 11; r += 1) for (let c = 14; c <= 17; c += 1) rows[r][c] = 'R';
  walls.forEach(([c, r]) => {
    rows[r][c] = '#';
  });
  cells.forEach(([c, r]) => {
    rows[r][c] = 'C';
  });
  rows[2][2] = '1';
  rows[17][29] = '2';
  rows[2][29] = '3';
  rows[17][2] = '4';

  return compileScenario({ id: 'x', map: rows.map((row) => row.join('')) }, ARENA);
}

function factoryOf(...types) {
  const factory = new EventFactory();
  types.forEach((type) => factory.register(type));

  return factory;
}

function createEngine({ types, scenario = null, random = () => 0.5, rules = RULES } = {}) {
  return new ArenaEngine({
    config: CONFIG,
    arena: ARENA,
    rules,
    players: PLAYERS,
    random,
    scenario,
    eventFactory: types ? factoryOf(...types) : null,
  });
}

// Avanza el motor `seconds` en pasos de 0,1 s.
function run(engine, seconds) {
  for (let t = 0; t < seconds - 1e-9; t += 0.1) engine.step(0.1);
}

// Sale de la cuenta regresiva y deja la partida en RUNNING.
function start(engine) {
  run(engine, RULES.countdownSeconds + 0.1);
}

// Pone una celda justo bajo el jugador y la recoge; devuelve los puntos que dio.
function collectOne(engine, playerId = 'a') {
  const player = engine.players.find((p) => p.id === playerId);
  const before = player.score;
  engine.items = [{ id: 'prueba', x: player.x, y: player.y }];
  engine.collectItems();

  return player.score - before;
}

// Mueve el motor hasta que el primer evento esté activo (empieza a los ~10,1 s de juego;
// el margen evita depender de la deriva de los decimales).
function untilEvent(engine) {
  start(engine);
  run(engine, 10.3);
}

describe('ArenaEngine con eventos especiales', () => {
  it('sin fábrica de eventos no cambia nada (snapshot sin eventos)', () => {
    const engine = createEngine();
    run(engine, 30);

    expect(engine.snapshot().events).toEqual([]);
    expect(engine.snapshot().openWalls).toEqual([]);
    expect(engine.result()).not.toHaveProperty('events');
  });

  describe('sobrecarga del reactor', () => {
    it('duplica los puntos mientras dura y vuelve a la normalidad', () => {
      const engine = createEngine({ types: [ReactorOverloadEvent] });
      start(engine);
      expect(collectOne(engine)).toBe(1);

      run(engine, 10.3);
      expect(engine.snapshot().events[0]).toMatchObject({
        type: 'reactor-overload',
        params: { multiplier: 2 },
      });
      expect(collectOne(engine)).toBe(2);

      run(engine, 5.2);
      expect(engine.snapshot().events).toEqual([]);
      expect(collectOne(engine)).toBe(1);
    });
  });

  describe('lluvia de energía', () => {
    it('suelta celdas extra y las retira al terminar sin tocar las normales', () => {
      const engine = createEngine({ types: [EnergyRainEvent] });
      untilEvent(engine);
      run(engine, 3);

      const during = engine.snapshot().items;
      const bonus = during.filter((item) => item.bonus);
      expect(bonus.length).toBeGreaterThan(1);
      expect(bonus.length).toBeLessThanOrEqual(EXTRA_CELLS);
      expect(during.filter((item) => !item.bonus)).toHaveLength(RULES.itemsOnField);

      run(engine, 3);
      const after = engine.snapshot();
      expect(after.events).toEqual([]);
      expect(after.items.some((item) => item.bonus)).toBe(false);
      expect(after.items).toHaveLength(RULES.itemsOnField);
    });

    it('una celda extra recogida da 1 punto', () => {
      const engine = createEngine({ types: [EnergyRainEvent] });
      untilEvent(engine);
      run(engine, 1);

      const player = engine.players[0];
      const bonus = engine.items.find((item) => item.bonus);
      engine.items = [{ ...bonus }];
      player.x = bonus.x;
      player.y = bonus.y;
      const before = player.score;
      engine.collectItems();

      expect(player.score).toBe(before + 1);
      expect(engine.items).toEqual([]);
    });

    it('funciona con las celdas del escenario y cae al azar si no alcanzan', () => {
      const scenario = scenarioWith({ cells: [[5, 5], [6, 6]] });
      const engine = createEngine({ types: [EnergyRainEvent], scenario });
      untilEvent(engine);
      run(engine, 4);

      engine.snapshot().items.forEach((item) => {
        expect(engine.collides(item.x, item.y, ARENA.itemRadius)).toBe(false);
      });
    });
  });

  describe('apagón', () => {
    it('oscurece una mitad de la arena y se acaba con el evento', () => {
      const engine = createEngine({ types: [BlackoutEvent] });
      untilEvent(engine);

      const [event] = engine.snapshot().events;
      const { region } = event.params;
      expect(event.type).toBe('blackout');
      expect(region.width * region.height).toBe((ARENA.width * ARENA.height) / 2);
      expect(region.x + region.width).toBeLessThanOrEqual(ARENA.width);
      expect(region.y + region.height).toBeLessThanOrEqual(ARENA.height);

      run(engine, 5.2);
      expect(engine.snapshot().events).toEqual([]);
    });

    it('cada lado sale con el generador aleatorio', () => {
      const sides = [0, 0.3, 0.6, 0.9].map((value) => {
        const event = new BlackoutEvent({ durationSeconds: 5, random: () => value });
        event.start({ arena: ARENA });

        return event.params().side;
      });

      expect(sides).toEqual(['top', 'bottom', 'left', 'right']);
    });
  });

  describe('ruta alternativa', () => {
    // Muro horizontal de 2 × 1 celdas con suelo a ambos lados: único hueco posible.
    const WALL = [[6, 5], [7, 5]];

    it('encuentra huecos de 2 celdas de ancho y nunca en el borde ni el reactor', () => {
      const scenario = scenarioWith({ walls: WALL });
      const candidates = findDoorCandidates({
        solid: scenario.solid,
        cols: scenario.cols,
        rows: scenario.rows,
        reactor: scenario.reactor,
      });

      expect(candidates).toEqual([{ col: 6, row: 5, cols: 2, rows: 1 }]);
    });

    it('no empieza en un campo abierto (sin muros que abrir)', () => {
      const engine = createEngine({ types: [AlternateRouteEvent] });
      untilEvent(engine);

      expect(engine.snapshot().events).toEqual([]);
    });

    it('abre el hueco, se puede cruzar y no se modifica el escenario compartido', () => {
      const scenario = scenarioWith({ walls: WALL });
      const original = scenario.solid.map((row) => [...row]);
      const engine = createEngine({ types: [AlternateRouteEvent], scenario });
      untilEvent(engine);

      const snapshot = engine.snapshot();
      expect(snapshot.events[0]).toMatchObject({ type: 'alternate-route' });
      expect(snapshot.openWalls).toEqual([[6, 5], [7, 5]]);
      // un círculo de choque cabe por el hueco (centro entre las dos celdas)
      expect(engine.collides(7 * ARENA.cellSize, 5.5 * ARENA.cellSize, ARENA.collisionRadius)).toBe(
        false
      );
      expect(scenario.solid).toEqual(original);
    });

    it('al terminar vuelve a cerrar los muros', () => {
      const scenario = scenarioWith({ walls: WALL });
      const engine = createEngine({ types: [AlternateRouteEvent], scenario });
      untilEvent(engine);
      run(engine, 5.2);

      expect(engine.snapshot().events).toEqual([]);
      expect(engine.snapshot().openWalls).toEqual([]);
      expect(engine.solid[5][6]).toBe(true);
      expect(engine.solid[5][7]).toBe(true);
    });

    it('espera a que el hueco quede libre: nunca deja a nadie dentro de un muro', () => {
      const scenario = scenarioWith({ walls: WALL });
      const engine = createEngine({ types: [AlternateRouteEvent], scenario });
      untilEvent(engine);

      const ana = engine.players[0];
      ana.x = 7 * ARENA.cellSize; // en medio del hueco
      ana.y = 5.5 * ARENA.cellSize;
      run(engine, 5.5); // el evento terminó

      expect(engine.snapshot().events).toEqual([]);
      expect(engine.snapshot().openWalls.length).toBeGreaterThan(0);
      expect(engine.collides(ana.x, ana.y, ARENA.collisionRadius)).toBe(false);

      ana.x = 3 * ARENA.cellSize; // sale del hueco
      ana.y = 3 * ARENA.cellSize;
      run(engine, 0.2);

      expect(engine.snapshot().openWalls).toEqual([]);
      expect(engine.solid[5][6]).toBe(true);
    });

    it('retira la celda que cayó dentro del hueco al cerrarlo', () => {
      const scenario = scenarioWith({ walls: WALL });
      const engine = createEngine({ types: [AlternateRouteEvent], scenario });
      untilEvent(engine);

      engine.items = [{ id: 'atrapada', x: 6.5 * ARENA.cellSize, y: 5.5 * ARENA.cellSize }];
      engine.items.push({ id: 'libre', x: 3.5 * ARENA.cellSize, y: 3.5 * ARENA.cellSize });
      engine.requestWallClose([{ col: 6, row: 5 }, { col: 7, row: 5 }]);
      engine.closePendingWalls();

      expect(engine.items.map((item) => item.id)).toEqual(['libre']);
    });

    it.each(['laboratorio-subterraneo', 'estacion-espacial', 'planta-industrial', 'complejo-militar-futurista'])(
      'tiene huecos posibles en %s',
      (id) => {
        const catalog = loadScenarioCatalog({
          dir: path.join(__dirname, '..', 'src', 'scenarios'),
          arena: ARENA,
        });
        const scenario = catalog.getCompiled(id);

        expect(
          findDoorCandidates({
            solid: scenario.solid,
            cols: scenario.cols,
            rows: scenario.rows,
            reactor: scenario.reactor,
          }).length
        ).toBeGreaterThan(0);
      }
    );
  });

  describe('ciclo de vida', () => {
    it('al terminar la partida se cierra el evento activo y queda en el historial', () => {
      const engine = createEngine({ types: [ReactorOverloadEvent] });
      untilEvent(engine);
      run(engine, 2);
      engine.finish();

      const [record] = engine.result().events;
      expect(record).toMatchObject({
        id: 'event-1',
        type: 'reactor-overload',
        durationSeconds: 5,
        params: { multiplier: 2 },
      });
      expect(record.startedAt).toBeCloseTo(10.1, 0);
      expect(record.endedAt).toBeGreaterThan(record.startedAt);
      expect(engine.snapshot().events).toEqual([]);
    });

    it('con la misma semilla ocurre la misma secuencia de eventos', () => {
      function seeded(seed) {
        let a = seed;

        return () => {
          a += 0x6d2b79f5;
          let t = a;
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      }
      const history = (seed) => {
        const engine = createEngine({
          types: [ReactorOverloadEvent, EnergyRainEvent, BlackoutEvent],
          random: seeded(seed),
          rules: { ...RULES, eventIntervalSeconds: 8, eventDurationSeconds: 5 },
        });
        start(engine);
        run(engine, 120);

        return engine.result().events;
      };

      expect(history(7)).toEqual(history(7));
      expect(history(7).length).toBeGreaterThan(3);
      expect(history(7)).not.toEqual(history(8));
    });

    it('un tipo nuevo funciona sin modificar el motor', () => {
      class TripleEvent extends SpecialEvent {
        modify(modifiers) {
          modifiers.pointMultiplier *= 3;
        }
      }
      TripleEvent.type = 'triple';
      TripleEvent.label = 'Triple';
      const engine = createEngine({ types: [TripleEvent] });
      untilEvent(engine);

      expect(engine.snapshot().events[0]).toMatchObject({ type: 'triple', name: 'Triple' });
      expect(collectOne(engine)).toBe(3);
    });
  });

  describe('invariantes con los escenarios reales', () => {
    const catalog = loadScenarioCatalog({
      dir: path.join(__dirname, '..', 'src', 'scenarios'),
      arena: ARENA,
    });

    it.each(catalog.list().map((s) => s.id))(
      '%s: nadie queda dentro de un muro y el escenario compartido no cambia',
      (id) => {
        const scenario = catalog.getCompiled(id);
        const original = scenario.solid.map((row) => [...row]);
        let seed = 12345;
        const random = () => {
          seed = (seed * 1664525 + 1013904223) % 4294967296;

          return seed / 4294967296;
        };
        const engine = new ArenaEngine({
          config: { ...CONFIG, durationSeconds: 600 },
          arena: ARENA,
          rules: { ...RULES, eventIntervalSeconds: 15, eventDurationSeconds: 8 },
          players: PLAYERS,
          random,
          scenario,
          eventFactory: createDefaultEventFactory(),
        });
        const seen = new Set();

        for (let step = 0; step < 6000; step += 1) {
          if (step % 20 === 0) {
            engine.players.forEach((player) =>
              engine.setInput(player.id, random() * 2 - 1, random() * 2 - 1)
            );
          }
          engine.step(0.1);
          engine.events.active && seen.add(engine.events.active.record.type);

          engine.players.forEach((player) => {
            if (engine.collides(player.x, player.y, ARENA.collisionRadius - 0.5)) {
              throw new Error(`${player.username} quedó dentro de un muro (paso ${step})`);
            }
          });
        }

        expect(scenario.solid).toEqual(original);
        expect(seen.size).toBeGreaterThanOrEqual(3);
        expect(seen.has('alternate-route')).toBe(true);
      }
    );
  });
});
