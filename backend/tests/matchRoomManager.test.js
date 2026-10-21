const { MatchRoomManager } = require('../src/modules/realtime/matchRoomManager');

const ARENA = { width: 800, height: 500, playerRadius: 24, itemRadius: 10 };
const RULES = {
  playerSpeed: 200,
  itemsOnField: 3,
  countdownSeconds: 1,
  tickRate: 10,
  abandonSeconds: 5,
  maxMatchSeconds: 900,
};
const MATCH = {
  id: 'm1',
  config: { endMode: 'TIME', durationSeconds: 2, targetPoints: null, maxPlayers: 2 },
  players: [
    { id: 'a', username: 'ana', avatarUrl: '/a.png' },
    { id: 'b', username: 'beto', avatarUrl: '/b.png' },
  ],
};

function setup(overrides = {}) {
  const emit = jest.fn();
  const persistResult = jest.fn().mockResolvedValue();
  const manager = new MatchRoomManager({
    arena: ARENA,
    rules: RULES,
    emit,
    persistResult,
    logger: { error: jest.fn() },
    ...overrides,
  });

  return { manager, emit, persistResult };
}

async function advance(ms) {
  await jest.advanceTimersByTimeAsync(ms);
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('MatchRoomManager', () => {
  it('avanza la partida y difunde el estado en cada tick', async () => {
    const { manager, emit } = setup();
    manager.startMatch(MATCH);
    manager.socketJoined('m1');

    await advance(1000);

    const states = emit.mock.calls.filter(([, event]) => event === 'arena:state');
    expect(states.length).toBeGreaterThanOrEqual(9);
    expect(states[0][0]).toBe('m1');
    expect(manager.isActive('m1')).toBe(true);
  });

  it('ignora un segundo inicio de la misma partida', async () => {
    const { manager } = setup();

    manager.startMatch(MATCH);
    manager.startMatch(MATCH);

    expect(manager.rooms.size).toBe(1);
    manager.stopAll();
  });

  it('aplica la entrada de cada jugador al mismo motor', async () => {
    const { manager } = setup();
    manager.startMatch(MATCH);
    manager.socketJoined('m1');
    await advance(1100);
    const before = manager.snapshot('m1').players.map((p) => ({ ...p }));

    manager.setInput('m1', 'a', 1, 0);
    manager.setInput('m1', 'b', 0, 1);
    await advance(500);

    const after = manager.snapshot('m1').players;
    expect(after[0].x).toBeGreaterThan(before[0].x);
    expect(after[1].y).toBeGreaterThan(before[1].y);
    manager.stopAll();
  });

  it('al terminar guarda el resultado una sola vez y avisa match:finished', async () => {
    const { manager, emit, persistResult } = setup();
    manager.startMatch(MATCH);
    manager.socketJoined('m1');

    await advance(4000);

    expect(persistResult).toHaveBeenCalledTimes(1);
    expect(persistResult).toHaveBeenCalledWith('m1', {
      scores: { a: 0, b: 0 },
      winnerIds: ['a', 'b'],
    });
    const finished = emit.mock.calls.filter(([, event]) => event === 'match:finished');
    expect(finished).toHaveLength(1);
    expect(finished[0][2].status).toBe('FINISHED');
    expect(manager.isActive('m1')).toBe(false);
  });

  it('si no se pudo guardar, igual avisa el fin y registra el error', async () => {
    const logger = { error: jest.fn() };
    const { manager, emit } = setup({
      logger,
      persistResult: jest.fn().mockRejectedValue(new Error('BD caída')),
    });
    manager.startMatch(MATCH);
    manager.socketJoined('m1');

    await advance(4000);

    expect(logger.error).toHaveBeenCalled();
    expect(emit.mock.calls.some(([, event]) => event === 'match:finished')).toBe(true);
  });

  it('cierra la partida si nadie se conecta en abandonSeconds', async () => {
    const { manager, persistResult } = setup({
      rules: { ...RULES, abandonSeconds: 2 },
    });
    manager.startMatch({
      ...MATCH,
      config: { endMode: 'POINTS', durationSeconds: null, targetPoints: 50, maxPlayers: 2 },
    });

    await advance(3000);

    expect(manager.isActive('m1')).toBe(false);
    expect(persistResult).toHaveBeenCalledTimes(1);
  });

  it('no cierra por abandono mientras haya alguien conectado', async () => {
    const { manager } = setup({ rules: { ...RULES, abandonSeconds: 2 } });
    manager.startMatch({
      ...MATCH,
      config: { endMode: 'POINTS', durationSeconds: null, targetPoints: 50, maxPlayers: 2 },
    });
    manager.socketJoined('m1');

    await advance(5000);

    expect(manager.isActive('m1')).toBe(true);
    manager.stopAll();
  });
});
