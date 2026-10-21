const { ArenaEngine } = require('../src/modules/realtime/arenaEngine');

const ARENA = { width: 800, height: 500, playerRadius: 24, itemRadius: 10 };
const RULES = { playerSpeed: 200, itemsOnField: 3, countdownSeconds: 3 };
const PLAYERS = [
  { id: 'a', username: 'ana', avatarUrl: '/a.png' },
  { id: 'b', username: 'beto', avatarUrl: '/b.png' },
];
const TIME_CONFIG = { endMode: 'TIME', durationSeconds: 10, targetPoints: null };
const POINTS_CONFIG = { endMode: 'POINTS', durationSeconds: null, targetPoints: 2 };

function sequence(values) {
  let index = 0;
  return () => values[index++ % values.length];
}

function createEngine(config = TIME_CONFIG, random = sequence([0.5, 0.5])) {
  return new ArenaEngine({ config, arena: ARENA, rules: RULES, players: PLAYERS, random });
}

function startRunning(engine) {
  engine.step(RULES.countdownSeconds);
  expect(engine.status).toBe('RUNNING');
}

function player(engine, id) {
  return engine.players.find((p) => p.id === id);
}

describe('ArenaEngine: cuenta regresiva', () => {
  it('empieza en COUNTDOWN, sin ítems, y no deja mover antes de tiempo', () => {
    const engine = createEngine();
    engine.setInput('a', 1, 0);
    const startX = player(engine, 'a').x;

    engine.step(1);

    expect(engine.status).toBe('COUNTDOWN');
    expect(engine.countdown).toBeCloseTo(2);
    expect(engine.items).toHaveLength(0);
    expect(player(engine, 'a').x).toBe(startX);
  });

  it('al terminar pasa a RUNNING y reparte los ítems', () => {
    const engine = createEngine();

    startRunning(engine);

    expect(engine.items).toHaveLength(RULES.itemsOnField);
    expect(engine.timeRemaining).toBe(10);
  });
});

describe('ArenaEngine: jugadores simultáneos', () => {
  it('mueve a todos los jugadores a la vez, cada uno con su propia entrada', () => {
    const engine = createEngine();
    startRunning(engine);
    const a0 = { ...player(engine, 'a') };
    const b0 = { ...player(engine, 'b') };

    engine.setInput('a', 1, 0);
    engine.setInput('b', 0, -1);
    engine.step(0.5);

    expect(player(engine, 'a').x).toBeCloseTo(a0.x + 100);
    expect(player(engine, 'a').y).toBe(a0.y);
    expect(player(engine, 'b').y).toBeCloseTo(b0.y - 100);
    expect(player(engine, 'b').x).toBe(b0.x);
  });

  it('normaliza la diagonal y descarta valores inválidos', () => {
    const engine = createEngine();
    startRunning(engine);

    engine.setInput('a', 1, 1);
    expect(Math.hypot(player(engine, 'a').dx, player(engine, 'a').dy)).toBeCloseTo(1);

    engine.setInput('a', Number.NaN, Infinity);
    expect(player(engine, 'a').dx).toBe(0);
    expect(player(engine, 'a').dy).toBe(0);

    engine.setInput('desconocido', 1, 0);
  });

  it('no deja salir de la arena', () => {
    const engine = createEngine();
    startRunning(engine);

    engine.setInput('a', -1, -1);
    engine.step(0.1);
    for (let i = 0; i < 40; i += 1) engine.step(0.1);

    expect(player(engine, 'a').x).toBe(ARENA.playerRadius);
    expect(player(engine, 'a').y).toBe(ARENA.playerRadius);
  });

  it('cada jugador tiene un color y un punto de salida distintos', () => {
    const engine = createEngine();
    const [a, b] = engine.players;

    expect(a.color).not.toBe(b.color);
    expect([a.x, a.y]).not.toEqual([b.x, b.y]);
  });
});

describe('ArenaEngine: puntos', () => {
  it('suma un punto al tocar un ítem y lo repone', () => {
    const engine = createEngine();
    startRunning(engine);
    const a = player(engine, 'a');
    engine.items[0] = { id: 'x', x: a.x + 20, y: a.y };

    engine.step(0.01);

    expect(a.score).toBe(1);
    expect(engine.items.find((item) => item.id === 'x')).toBeUndefined();
    expect(engine.items).toHaveLength(RULES.itemsOnField);
  });

  it('si dos jugadores tocan el mismo ítem, se lo lleva el más cercano', () => {
    const engine = createEngine();
    startRunning(engine);
    const a = player(engine, 'a');
    const b = player(engine, 'b');
    a.x = 300; a.y = 200;
    b.x = 320; b.y = 200;
    engine.items[0] = { id: 'x', x: 312, y: 200 };

    engine.step(0.001);

    expect(b.score).toBe(1);
    expect(a.score).toBe(0);
  });
});

describe('ArenaEngine: fin de la partida', () => {
  it('modo TIME termina al agotarse el tiempo y gana quien tenga más puntos', () => {
    const engine = createEngine(TIME_CONFIG);
    startRunning(engine);
    player(engine, 'b').score = 3;
    player(engine, 'a').score = 1;

    for (let i = 0; i < 101; i += 1) engine.step(0.1);

    expect(engine.status).toBe('FINISHED');
    expect(engine.timeRemaining).toBe(0);
    expect(engine.winnerIds).toEqual(['b']);
    expect(engine.result()).toEqual({
      scores: { a: 1, b: 3 },
      winnerIds: ['b'],
    });
  });

  it('modo POINTS termina cuando alguien llega al objetivo', () => {
    const engine = createEngine(POINTS_CONFIG);
    startRunning(engine);
    const a = player(engine, 'a');
    a.score = 1;
    engine.items[0] = { id: 'x', x: a.x, y: a.y };

    engine.step(0.01);

    expect(engine.status).toBe('FINISHED');
    expect(engine.winnerIds).toEqual(['a']);
    expect(engine.timeRemaining).toBeNull();
  });

  it('un empate deja a todos los líderes como ganadores', () => {
    const engine = createEngine(TIME_CONFIG);
    startRunning(engine);
    player(engine, 'a').score = 2;
    player(engine, 'b').score = 2;

    engine.finish();

    expect(engine.winnerIds).toEqual(['a', 'b']);
  });

  it('después de terminar ya no cambia nada', () => {
    const engine = createEngine(TIME_CONFIG);
    startRunning(engine);
    engine.finish();
    engine.setInput('a', 1, 0);
    const before = JSON.stringify(engine.snapshot());

    engine.step(1);

    expect(JSON.stringify(engine.snapshot())).toBe(before);
  });
});

describe('ArenaEngine.snapshot', () => {
  it('trae lo que necesita el cliente y redondea las posiciones', () => {
    const engine = createEngine(POINTS_CONFIG);
    engine.players[0].x = 100.123456;

    const snapshot = engine.snapshot();

    expect(snapshot.status).toBe('COUNTDOWN');
    expect(snapshot.targetPoints).toBe(2);
    expect(snapshot.players[0]).toEqual({
      id: 'a',
      username: 'ana',
      avatarUrl: '/a.png',
      color: expect.any(String),
      x: 100.1,
      y: expect.any(Number),
      score: 0,
    });
  });
});
