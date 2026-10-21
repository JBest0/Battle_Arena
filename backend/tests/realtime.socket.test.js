const http = require('http');
const { io: connect } = require('socket.io-client');
const { createRealtime } = require('../src/modules/realtime/realtime.socket');
const { EventEmitter } = require('events');

const MATCH_ID = '11111111-1111-4111-8111-111111111111';
const ARENA = { width: 800, height: 500, playerRadius: 24, itemRadius: 10 };
const RULES = {
  playerSpeed: 200,
  itemsOnField: 3,
  countdownSeconds: 0.2,
  tickRate: 30,
  abandonSeconds: 30,
  maxMatchSeconds: 900,
};
const USERS = {
  'token-a': { id: 'a', username: 'ana', verified: true },
  'token-b': { id: 'b', username: 'beto', verified: true },
  'token-c': { id: 'c', username: 'ceci', verified: true },
  'token-sin-verificar': { id: 'd', username: 'dani', verified: false },
};

const view = (status) => ({
  id: MATCH_ID,
  status,
  config: { endMode: 'TIME', durationSeconds: 1, targetPoints: null, maxPlayers: 2 },
  players: [
    { id: 'a', username: 'ana', avatarUrl: '/a.png', score: 0 },
    { id: 'b', username: 'beto', avatarUrl: '/b.png', score: 0 },
  ],
});

let server;
let realtime;
let gameEvents;
let matchStatus;
let persistResult;
let port;
const clients = [];

function client(token) {
  const socket = connect(`http://localhost:${port}`, {
    auth: { token },
    transports: ['websocket'],
    reconnection: false,
  });
  clients.push(socket);

  return socket;
}

const connected = (socket) =>
  new Promise((resolve, reject) => {
    socket.on('connect', resolve);
    socket.on('connect_error', reject);
  });

const join = (socket, matchId = MATCH_ID) =>
  new Promise((resolve) => socket.emit('match:join', { matchId }, resolve));

const once = (socket, event) => new Promise((resolve) => socket.once(event, resolve));

beforeEach(async () => {
  matchStatus = 'IN_PROGRESS';
  gameEvents = new EventEmitter();
  persistResult = jest.fn().mockResolvedValue();
  server = http.createServer();
  realtime = createRealtime({
    server,
    corsOrigin: '*',
    authenticate: async (token) => {
      const user = USERS[token];
      if (!user) throw Object.assign(new Error('x'), { code: 'UNAUTHORIZED' });
      return { id: user.id, username: user.username };
    },
    assertVerified: async (user) => {
      const entry = Object.values(USERS).find((u) => u.id === user.id);
      if (!entry.verified) {
        throw Object.assign(new Error('x'), { code: 'EMAIL_NOT_VERIFIED' });
      }
    },
    gameService: {
      getMatch: async (id) => {
        if (id !== MATCH_ID) throw Object.assign(new Error('no existe'), { code: 'MATCH_NOT_FOUND' });
        return view(matchStatus);
      },
    },
    gameEvents,
    managerOptions: { arena: ARENA, rules: RULES, persistResult },
  });
  await new Promise((resolve) => server.listen(0, resolve));
  port = server.address().port;
});

afterEach(async () => {
  clients.splice(0).forEach((socket) => socket.close());
  await realtime.close();
});

describe('autenticación de sockets', () => {
  it('rechaza conexiones sin token o con token inválido', async () => {
    await expect(connected(client(undefined))).rejects.toMatchObject({ message: 'UNAUTHORIZED' });
    await expect(connected(client('falso'))).rejects.toMatchObject({ message: 'UNAUTHORIZED' });
  });

  it('rechaza a un usuario con el correo sin verificar', async () => {
    await expect(connected(client('token-sin-verificar'))).rejects.toMatchObject({
      message: 'EMAIL_NOT_VERIFIED',
    });
  });
});

describe('match:join', () => {
  it('rechaza ids inválidos, partidas inexistentes y a quien no participa', async () => {
    const socket = client('token-a');
    await connected(socket);

    expect(await join(socket, 'no-es-uuid')).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' });
    expect(await join(socket, '22222222-2222-4222-8222-222222222222')).toMatchObject({
      ok: false,
      code: 'MATCH_NOT_FOUND',
    });

    const outsider = client('token-c');
    await connected(outsider);
    expect(await join(outsider)).toMatchObject({ ok: false, code: 'NOT_A_PLAYER' });
  });

  it('avisa si la partida en curso ya no tiene un motor activo', async () => {
    const socket = client('token-a');
    await connected(socket);

    expect(await join(socket)).toMatchObject({ ok: false, code: 'MATCH_NOT_ACTIVE' });
  });
});

describe('partida con jugadores simultáneos', () => {
  it('dos jugadores reciben el mismo estado, mueven su avatar y ven el final', async () => {
    const a = client('token-a');
    const b = client('token-b');
    await Promise.all([connected(a), connected(b)]);

    gameEvents.emit('matchStarted', view('IN_PROGRESS'));

    const [joinedA, joinedB] = await Promise.all([join(a), join(b)]);
    expect(joinedA).toMatchObject({ ok: true, status: 'IN_PROGRESS' });
    expect(joinedB.ok).toBe(true);
    expect(joinedA.state.players.map((p) => p.id)).toEqual(['a', 'b']);

    // esperar a que termine la cuenta regresiva
    await new Promise((resolve) => {
      a.on('arena:state', function listener(state) {
        if (state.status === 'RUNNING') {
          a.off('arena:state', listener);
          resolve();
        }
      });
    });

    const startA = realtime.manager.snapshot(MATCH_ID).players[0];
    const startB = realtime.manager.snapshot(MATCH_ID).players[1];
    a.emit('player:input', { dx: 1, dy: 0 });
    b.emit('player:input', { dx: 0, dy: 1 });

    const [stateA, stateB] = await Promise.all([
      new Promise((resolve) =>
        a.on('arena:state', (s) => s.players[0].x > startA.x + 5 && resolve(s))
      ),
      new Promise((resolve) =>
        b.on('arena:state', (s) => s.players[1].y > startB.y + 5 && resolve(s))
      ),
    ]);
    expect(stateA.players[0].x).toBeGreaterThan(startA.x);
    expect(stateB.players[1].y).toBeGreaterThan(startB.y);

    const [finishedA, finishedB] = await Promise.all([
      once(a, 'match:finished'),
      once(b, 'match:finished'),
    ]);
    expect(finishedA.status).toBe('FINISHED');
    expect(finishedB.status).toBe('FINISHED');
    expect(persistResult).toHaveBeenCalledTimes(1);
    expect(persistResult.mock.calls[0][0]).toBe(MATCH_ID);
  }, 10000);

  it('ignora entradas de un socket que no se unió a ninguna partida', async () => {
    const socket = client('token-a');
    await connected(socket);

    socket.emit('player:input', { dx: 1, dy: 0 });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(realtime.manager.isActive(MATCH_ID)).toBe(false);
  });
});
