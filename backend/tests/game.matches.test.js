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
const UNKNOWN_ID = '00000000-0000-4000-8000-0000000000ff';

async function clearData() {
  await prisma.matchParticipant.deleteMany();
  await prisma.match.deleteMany();
  await prisma.userAchievement.deleteMany();
  await prisma.playerStats.deleteMany();
  await prisma.emailVerificationToken.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.user.deleteMany();
}

async function createUser({ username, email, verified = true }) {
  return prisma.user.create({
    data: {
      username,
      email,
      passwordHash: 'hash-de-prueba',
      emailVerified: verified,
      avatarId: DEFAULT_AVATAR_ID,
    },
  });
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username },
    config.jwtSecret
  );
}

function auth(req, user) {
  return user ? req.set('Authorization', `Bearer ${signToken(user)}`) : req;
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

describe('GET /api/game/options', () => {
  it('exige sesión', async () => {
    const response = await request(app).get('/api/game/options');

    expect(response.status).toBe(401);
  });

  it('exige correo verificado', async () => {
    const user = await createUser({
      username: 'sin_verificar',
      email: 'sin@test.com',
      verified: false,
    });

    const response = await auth(request(app).get('/api/game/options'), user);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('devuelve modos, límites, valores por defecto y arena', async () => {
    const user = await createUser({ username: 'ok', email: 'ok@test.com' });

    const response = await auth(request(app).get('/api/game/options'), user);

    expect(response.status).toBe(200);
    expect(response.body.endModes).toEqual(['TIME', 'POINTS']);
    expect(response.body.defaults.endMode).toBe('TIME');
    expect(response.body.limits.maxPlayers).toEqual({
      min: 2,
      max: 4,
      default: 2,
    });
    expect(response.body.arena.width).toBeGreaterThan(0);
  });
});

describe('POST /api/game/matches', () => {
  it('exige sesión y correo verificado', async () => {
    const anonymous = await request(app)
      .post('/api/game/matches')
      .send({ endMode: 'TIME' });
    expect(anonymous.status).toBe(401);

    const user = await createUser({
      username: 'sin_verificar',
      email: 'sin@test.com',
      verified: false,
    });
    const blocked = await auth(request(app).post('/api/game/matches'), user).send(
      { endMode: 'TIME' }
    );
    expect(blocked.status).toBe(403);
    expect(await prisma.match.count()).toBe(0);
  });

  it('crea una partida por tiempo con el creador como primer jugador', async () => {
    const user = await createUser({ username: 'host', email: 'host@test.com' });

    const response = await auth(request(app).post('/api/game/matches'), user).send(
      { endMode: 'TIME', durationSeconds: 120, maxPlayers: 3 }
    );

    expect(response.status).toBe(201);
    expect(response.body.match.status).toBe('WAITING');
    expect(response.body.match.config).toEqual({
      endMode: 'TIME',
      durationSeconds: 120,
      targetPoints: null,
      maxPlayers: 3,
    });
    expect(response.body.match.players).toEqual([
      {
        id: user.id,
        username: 'host',
        avatarUrl: '/static/avatars/1.png',
        score: 0,
      },
    ]);
  });

  it('crea una partida por puntos y descarta la duración', async () => {
    const user = await createUser({ username: 'host', email: 'host@test.com' });

    const response = await auth(request(app).post('/api/game/matches'), user).send(
      { endMode: 'POINTS', targetPoints: 25, durationSeconds: 100 }
    );

    expect(response.status).toBe(201);
    expect(response.body.match.config).toMatchObject({
      endMode: 'POINTS',
      durationSeconds: null,
      targetPoints: 25,
      maxPlayers: 2,
    });
  });

  it('rechaza una configuración inválida con VALIDATION_ERROR por campo', async () => {
    const user = await createUser({ username: 'host', email: 'host@test.com' });

    const response = await auth(request(app).post('/api/game/matches'), user).send(
      { endMode: 'TIME', durationSeconds: 5, maxPlayers: 10 }
    );

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.fields).toHaveProperty('durationSeconds');
    expect(response.body.error.fields).toHaveProperty('maxPlayers');
    expect(await prisma.match.count()).toBe(0);
  });

  it('la partida en espera no aparece en el historial del jugador', async () => {
    const user = await createUser({ username: 'host', email: 'host@test.com' });
    await auth(request(app).post('/api/game/matches'), user).send({
      endMode: 'TIME',
    });

    const response = await auth(
      request(app).get(`/api/users/${user.id}/matches`),
      user
    );

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(0);
  });
});

describe('GET /api/game/matches/:id', () => {
  it('devuelve la configuración y los jugadores', async () => {
    const user = await createUser({ username: 'host', email: 'host@test.com' });
    const created = await auth(request(app).post('/api/game/matches'), user).send(
      { endMode: 'POINTS', targetPoints: 40 }
    );

    const response = await auth(
      request(app).get(`/api/game/matches/${created.body.match.id}`),
      user
    );

    expect(response.status).toBe(200);
    expect(response.body.match.id).toBe(created.body.match.id);
    expect(response.body.match.config.targetPoints).toBe(40);
  });

  it('responde 404 MATCH_NOT_FOUND si no existe y 400 si el id no es UUID', async () => {
    const user = await createUser({ username: 'host', email: 'host@test.com' });

    const missing = await auth(
      request(app).get(`/api/game/matches/${UNKNOWN_ID}`),
      user
    );
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('MATCH_NOT_FOUND');

    const invalid = await auth(
      request(app).get('/api/game/matches/no-es-uuid'),
      user
    );
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });
});
