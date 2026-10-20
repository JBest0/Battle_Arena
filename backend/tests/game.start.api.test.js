jest.mock('../src/infrastructure/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendVerification: jest.fn().mockResolvedValue(),
  })),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const config = require('../src/config');
const { prisma } = require('../src/infrastructure/prisma');

const DEFAULT_AVATAR_ID = '00000000-0000-4000-8000-000000000001';

async function clearData() {
  await prisma.matchParticipant.deleteMany();
  await prisma.match.deleteMany();
  await prisma.userAchievement.deleteMany();
  await prisma.playerStats.deleteMany();
  await prisma.emailVerificationToken.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.user.deleteMany();
}

async function createUser(username) {
  return prisma.user.create({
    data: {
      username,
      email: `${username}@test.com`,
      passwordHash: 'hash-de-prueba',
      emailVerified: true,
      avatarId: DEFAULT_AVATAR_ID,
    },
  });
}

function api(method, path, user) {
  const token = jwt.sign(
    { sub: user.id, username: user.username },
    config.jwtSecret
  );

  return request(app)[method](path).set('Authorization', `Bearer ${token}`);
}

async function newMatch(host, body = { endMode: 'TIME', maxPlayers: 2 }) {
  const response = await api('post', '/api/game/matches', host).send(body);

  return response.body.match;
}

beforeAll(async () => {
  await prisma.avatar.upsert({
    where: { id: DEFAULT_AVATAR_ID },
    update: { type: 'DEFAULT', url: '/static/avatars/1.png', ownerId: null },
    create: {
      id: DEFAULT_AVATAR_ID,
      type: 'DEFAULT',
      url: '/static/avatars/1.png',
    },
  });
});

beforeEach(async () => {
  await clearData();
});

afterAll(async () => {
  await clearData();
  await prisma.$disconnect();
});

describe('unirse e iniciar una partida', () => {
  it('lista las partidas en espera y permite unirse', async () => {
    const host = await createUser('anfitrion');
    const guest = await createUser('invitado');
    const match = await newMatch(host);

    const list = await api('get', '/api/game/matches', guest);
    expect(list.status).toBe(200);
    expect(list.body.matches.map((m) => m.id)).toEqual([match.id]);

    const joined = await api('post', `/api/game/matches/${match.id}/join`, guest);
    expect(joined.status).toBe(200);
    expect(joined.body.match.players.map((p) => p.username)).toEqual([
      'anfitrion',
      'invitado',
    ]);
  });

  it('rechaza unirse a una partida llena (409 MATCH_FULL)', async () => {
    const host = await createUser('anfitrion');
    const guest = await createUser('invitado');
    const third = await createUser('tercero');
    const match = await newMatch(host);
    await api('post', `/api/game/matches/${match.id}/join`, guest);

    const response = await api('post', `/api/game/matches/${match.id}/join`, third);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('MATCH_FULL');
  });

  it('no deja iniciar con un solo jugador ni a quien no es anfitrión', async () => {
    const host = await createUser('anfitrion');
    const guest = await createUser('invitado');
    const match = await newMatch(host);

    const alone = await api('post', `/api/game/matches/${match.id}/start`, host);
    expect(alone.status).toBe(409);
    expect(alone.body.error.code).toBe('NOT_ENOUGH_PLAYERS');

    await api('post', `/api/game/matches/${match.id}/join`, guest);
    const notHost = await api('post', `/api/game/matches/${match.id}/start`, guest);
    expect(notHost.status).toBe(403);
    expect(notHost.body.error.code).toBe('NOT_MATCH_CREATOR');
  });

  it('el anfitrión inicia: IN_PROGRESS con startedAt, y ya no admite jugadores', async () => {
    const host = await createUser('anfitrion');
    const guest = await createUser('invitado');
    const match = await newMatch(host, { endMode: 'POINTS', maxPlayers: 3 });
    await api('post', `/api/game/matches/${match.id}/join`, guest);

    const started = await api('post', `/api/game/matches/${match.id}/start`, host);
    expect(started.status).toBe(200);
    expect(started.body.match.status).toBe('IN_PROGRESS');
    expect(started.body.match.startedAt).not.toBeNull();

    const late = await createUser('tarde');
    const response = await api('post', `/api/game/matches/${match.id}/join`, late);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('MATCH_ALREADY_STARTED');

    const list = await api('get', '/api/game/matches', late);
    expect(list.body.matches).toEqual([]);
  });

  it('dos jugadores que se unen a la vez no superan el cupo', async () => {
    const host = await createUser('anfitrion');
    const a = await createUser('jugador_a');
    const b = await createUser('jugador_b');
    const match = await newMatch(host);

    const results = await Promise.all([
      api('post', `/api/game/matches/${match.id}/join`, a),
      api('post', `/api/game/matches/${match.id}/join`, b),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const players = await prisma.matchParticipant.count({
      where: { matchId: match.id },
    });
    expect(players).toBe(2);
  });
});
