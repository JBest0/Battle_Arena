const path = require('path');
const { EventEmitter } = require('events');
const { ArenaEngine } = require('../src/modules/realtime/arenaEngine');
const { MatchRoomManager } = require('../src/modules/realtime/matchRoomManager');
const { GameService } = require('../src/modules/game/game.service');
const { ARENA } = require('../src/modules/game/game.config');
const { loadScenarioCatalog } = require('../src/modules/scenarios/scenario.catalog');
const { compileScenario } = require('../src/modules/scenarios/scenario.map');
const { InMemoryGameRepository, inMemoryUnitOfWork } = require('./helpers/inMemoryGame');

const RULES = {
  playerSpeed: 200,
  itemsOnField: 3,
  countdownSeconds: 1,
  tickRate: 10,
  abandonSeconds: 30,
  maxMatchSeconds: 900,
};
const CONFIG = { endMode: 'TIME', durationSeconds: 100, targetPoints: null };
const PLAYERS = [
  { id: 'a', username: 'ana', avatarUrl: '/a.png' },
  { id: 'b', username: 'beto', avatarUrl: '/b.png' },
];
const COLS = ARENA.width / ARENA.cellSize;
const ROWS = ARENA.height / ARENA.cellSize;

// Escenario mínimo: borde, reactor al centro, un muro vertical y cuatro inicios.
function scenarioMap({ extraWalls = [], cells = [] } = {}) {
  const rows = Array.from({ length: ROWS }, (_, r) =>
    Array.from({ length: COLS }, (_, c) =>
      r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1 ? '#' : '.'
    )
  );
  for (let r = 8; r <= 11; r += 1) for (let c = 14; c <= 17; c += 1) rows[r][c] = 'R';
  extraWalls.forEach(([c, r]) => {
    rows[r][c] = '#';
  });
  cells.forEach(([c, r]) => {
    rows[r][c] = 'C';
  });
  rows[2][2] = '1';
  rows[17][29] = '2';
  rows[2][29] = '3';
  rows[17][2] = '4';

  return rows.map((row) => row.join(''));
}

function compiled(options) {
  return compileScenario({ id: 'x', map: scenarioMap(options) }, ARENA);
}

function createEngine(scenario, random = () => 0.5) {
  const engine = new ArenaEngine({
    config: CONFIG,
    arena: ARENA,
    rules: RULES,
    players: PLAYERS,
    random,
    scenario,
  });
  engine.step(RULES.countdownSeconds);

  return engine;
}

const player = (engine, id) => engine.players.find((p) => p.id === id);

describe('ArenaEngine con escenario', () => {
  it('los jugadores salen de los puntos de inicio del escenario', () => {
    const scenario = compiled();
    const engine = new ArenaEngine({ config: CONFIG, arena: ARENA, rules: RULES, players: PLAYERS, scenario });

    expect([player(engine, 'a').x, player(engine, 'a').y]).toEqual([scenario.spawns[0].x, scenario.spawns[0].y]);
    expect([player(engine, 'b').x, player(engine, 'b').y]).toEqual([scenario.spawns[1].x, scenario.spawns[1].y]);
  });

  it('un muro frena al jugador', () => {
    // muro en la columna 6, filas 1 a 4
    const engine = createEngine(compiled({ extraWalls: [[6, 1], [6, 2], [6, 3], [6, 4]] }));
    const a = player(engine, 'a');
    engine.setInput('a', 1, 0);

    for (let i = 0; i < 30; i += 1) engine.step(0.1);

    // se detiene pegado al muro (a lo sumo un paso corto antes de tocarlo)
    const limit = 6 * ARENA.cellSize - ARENA.collisionRadius;
    expect(a.x).toBeLessThanOrEqual(limit);
    expect(a.x).toBeGreaterThan(limit - 4);
  });

  it('se desliza por el muro: el eje libre sigue avanzando', () => {
    const engine = createEngine(compiled({ extraWalls: [[6, 1], [6, 2], [6, 3], [6, 4]] }));
    const a = player(engine, 'a');
    a.x = 6 * ARENA.cellSize - ARENA.collisionRadius - 1;
    a.y = 60;
    engine.setInput('a', 1, 1);
    const startY = a.y;

    engine.step(0.1);

    expect(a.y).toBeGreaterThan(startY);
    expect(a.x).toBeLessThanOrEqual(6 * ARENA.cellSize - ARENA.collisionRadius);
  });

  it('el reactor es sólido', () => {
    const engine = createEngine(compiled());
    const a = player(engine, 'a');
    a.x = 300;
    a.y = 250;
    engine.setInput('a', 1, 0);

    for (let i = 0; i < 20; i += 1) engine.step(0.1);

    const limit = 14 * ARENA.cellSize - ARENA.collisionRadius;
    expect(a.x).toBeLessThanOrEqual(limit);
    expect(a.x).toBeGreaterThan(limit - 4);
  });

  it('el jugador empieza sin tocar ningún muro, en cada escenario incluido', () => {
    const catalog = loadScenarioCatalog({
      dir: path.join(__dirname, '..', 'src', 'scenarios'),
      arena: ARENA,
      logger: { error: jest.fn() },
    });

    catalog.list().forEach((definition) => {
      const engine = new ArenaEngine({
        config: CONFIG,
        arena: ARENA,
        rules: RULES,
        players: [...PLAYERS, { id: 'c', username: 'ceci', avatarUrl: '/c.png' }, { id: 'd', username: 'dani', avatarUrl: '/d.png' }],
        scenario: catalog.getCompiled(definition.id),
      });

      engine.players.forEach((p) => {
        expect(engine.collides(p.x, p.y, ARENA.collisionRadius)).toBe(false);
      });
    });
  });

  it('un jugador no puede quedar dentro de un muro caminando al azar', () => {
    const catalog = loadScenarioCatalog({
      dir: path.join(__dirname, '..', 'src', 'scenarios'),
      arena: ARENA,
      logger: { error: jest.fn() },
    });

    catalog.list().forEach((definition) => {
      let seed = 7;
      const random = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };
      const engine = createEngine(catalog.getCompiled(definition.id), random);
      for (let i = 0; i < 600; i += 1) {
        if (i % 8 === 0) engine.setInput('a', random() * 2 - 1, random() * 2 - 1);
        engine.step(0.05);
        expect(engine.collides(player(engine, 'a').x, player(engine, 'a').y, ARENA.collisionRadius)).toBe(false);
      }
    });
  });

  it('los ítems aparecen en las celdas C del escenario, sin repetir posición', () => {
    const cells = [[5, 5], [10, 5], [20, 5], [25, 5], [5, 14]];
    const scenario = compiled({ cells });
    const engine = createEngine(scenario, () => 0.1);
    const valid = scenario.cells.map((c) => `${c.x},${c.y}`);
    const spots = engine.items.map((item) => `${item.x},${item.y}`);

    expect(engine.items).toHaveLength(RULES.itemsOnField);
    spots.forEach((spot) => expect(valid).toContain(spot));
    expect(new Set(spots).size).toBe(spots.length);
  });

  it('sin celdas C, los ítems aparecen en puntos libres (nunca dentro de un muro)', () => {
    const scenario = compiled();
    let seed = 3;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const engine = createEngine(scenario, random);
    for (let i = 0; i < 50; i += 1) {
      engine.items = [];
      engine.refillItems();
      engine.items.forEach((item) => {
        expect(engine.collides(item.x, item.y, ARENA.itemRadius)).toBe(false);
      });
    }
  });

  it('sin escenario todo sigue igual: campo abierto y salida desde las esquinas', () => {
    const engine = new ArenaEngine({ config: CONFIG, arena: ARENA, rules: RULES, players: PLAYERS });

    expect([player(engine, 'a').x, player(engine, 'a').y]).toEqual([80, 80]);
    expect(engine.collides(400, 250, 16)).toBe(false);
  });
});

describe('MatchRoomManager con escenario', () => {
  const baseMatch = {
    id: 'm1',
    config: { endMode: 'TIME', durationSeconds: 50, targetPoints: null, maxPlayers: 2 },
    players: PLAYERS,
  };

  function manager(getScenario) {
    return new MatchRoomManager({
      arena: ARENA,
      rules: RULES,
      emit: jest.fn(),
      persistResult: jest.fn().mockResolvedValue(),
      getScenario,
      logger: { error: jest.fn() },
    });
  }

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('arranca el motor con el escenario de la partida', () => {
    const scenario = compiled();
    const getScenario = jest.fn().mockReturnValue(scenario);
    const rooms = manager(getScenario);

    rooms.startMatch({ ...baseMatch, scenarioId: 'x' });

    expect(getScenario).toHaveBeenCalledWith('x');
    expect(rooms.rooms.get('m1').engine.scenario).toBe(scenario);
    rooms.stopAll();
  });

  it('sin scenarioId o con un escenario que ya no existe, juega en campo abierto', () => {
    const rooms = manager(jest.fn().mockReturnValue(undefined));

    rooms.startMatch({ ...baseMatch, id: 'sin', scenarioId: null });
    rooms.startMatch({ ...baseMatch, id: 'borrado', scenarioId: 'viejo' });

    expect(rooms.rooms.get('sin').engine.scenario).toBeNull();
    expect(rooms.rooms.get('borrado').engine.scenario).toBeNull();
    rooms.stopAll();
  });
});

describe('GameService y escenarios', () => {
  const catalog = loadScenarioCatalog({
    dir: path.join(__dirname, '..', 'src', 'scenarios'),
    arena: ARENA,
    logger: { error: jest.fn() },
  });

  function setup() {
    const repository = new InMemoryGameRepository();
    const service = new GameService({
      gameRepository: repository,
      unitOfWork: inMemoryUnitOfWork,
      gameEvents: new EventEmitter(),
      scenarioCatalog: catalog,
    });

    return { repository, service, host: repository.addUser('anfitrion') };
  }

  it('sin escenario pedido usa el por defecto del catálogo', async () => {
    const { service, host } = setup();

    const match = await service.createMatch(host.id, { endMode: 'TIME' });

    expect(match.scenarioId).toBe(catalog.defaultId());
  });

  it('acepta un escenario por id y lo guarda en la partida', async () => {
    const { service, host } = setup();

    const match = await service.createMatch(host.id, { endMode: 'TIME', scenarioId: 'planta-industrial' });

    expect(match.scenarioId).toBe('planta-industrial');
    expect((await service.getMatch(match.id)).scenarioId).toBe('planta-industrial');
  });

  it('"random" guarda un escenario concreto del catálogo', async () => {
    const { service, host } = setup();
    const ids = catalog.list().map((s) => s.id);

    const match = await service.createMatch(host.id, { endMode: 'TIME', scenarioId: 'random' });

    expect(ids).toContain(match.scenarioId);
  });

  it('rechaza un escenario inexistente (400 SCENARIO_NOT_FOUND)', async () => {
    const { service, host } = setup();

    await expect(
      service.createMatch(host.id, { endMode: 'TIME', scenarioId: 'no-existe' })
    ).rejects.toMatchObject({ status: 400, code: 'SCENARIO_NOT_FOUND' });
  });

  it('lista los escenarios y devuelve uno por id (404 si no existe)', () => {
    const { service } = setup();

    expect(service.listScenarios().length).toBeGreaterThanOrEqual(4);
    expect(service.getScenario('estacion-espacial').name).toBe('Estación espacial');
    expect(() => service.getScenario('nada')).toThrow(
      expect.objectContaining({ status: 404, code: 'SCENARIO_NOT_FOUND' })
    );
  });
});
