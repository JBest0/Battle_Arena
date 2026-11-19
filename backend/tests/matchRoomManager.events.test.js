const { MatchRoomManager } = require('../src/modules/realtime/matchRoomManager');
const { createDefaultEventFactory } = require('../src/modules/events/eventFactory');

const ARENA = { width: 800, height: 500, playerRadius: 24, itemRadius: 10 };
const RULES = {
  playerSpeed: 200,
  itemsOnField: 3,
  countdownSeconds: 1,
  tickRate: 10,
  abandonSeconds: 60,
  maxMatchSeconds: 900,
  eventIntervalSeconds: 2,
  eventDurationSeconds: 5,
};
const MATCH = {
  id: 'm1',
  config: { endMode: 'TIME', durationSeconds: 100, targetPoints: null, maxPlayers: 2 },
  players: [
    { id: 'a', username: 'ana', avatarUrl: '/a.png' },
    { id: 'b', username: 'beto', avatarUrl: '/b.png' },
  ],
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('MatchRoomManager con eventos especiales', () => {
  it('difunde el evento activo en arena:state y lo guarda al terminar', async () => {
    const emit = jest.fn();
    const persistResult = jest.fn().mockResolvedValue();
    const manager = new MatchRoomManager({
      arena: ARENA,
      rules: RULES,
      emit,
      persistResult,
      eventFactory: createDefaultEventFactory(),
      logger: { error: jest.fn() },
    });

    manager.startMatch(MATCH);
    manager.socketJoined('m1');
    await jest.advanceTimersByTimeAsync(4000); // cuenta regresiva + el primer evento (<= 3 s)

    const withEvent = emit.mock.calls
      .filter(([, event]) => event === 'arena:state')
      .map(([, , state]) => state)
      .find((state) => state.events.length > 0);
    expect(withEvent.events[0]).toMatchObject({
      name: expect.any(String),
      description: expect.any(String),
      accent: expect.stringMatching(/^#/),
      duration: 5,
    });

    manager.rooms.get('m1').engine.finish();
    await jest.advanceTimersByTimeAsync(200);

    const [, result] = persistResult.mock.calls[0];
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ durationSeconds: 5 });
    expect(result.events[0].endedAt).not.toBeNull();
  });

  it('sin fábrica la partida no tiene eventos', async () => {
    const emit = jest.fn();
    const manager = new MatchRoomManager({
      arena: ARENA,
      rules: RULES,
      emit,
      persistResult: jest.fn().mockResolvedValue(),
      logger: { error: jest.fn() },
    });

    manager.startMatch(MATCH);
    manager.socketJoined('m1');
    await jest.advanceTimersByTimeAsync(8000);

    const states = emit.mock.calls.filter(([, event]) => event === 'arena:state');
    expect(states.length).toBeGreaterThan(0);
    states.forEach(([, , state]) => expect(state.events).toEqual([]));
    manager.stopAll();
  });
});
