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

async function createUser(username, verified = true) {
  return prisma.user.create({
    data: {
      username,
      email: `${username}@test.com`,
      passwordHash: 'hash-de-prueba',
      emailVerified: verified,
      avatarId: DEFAULT_AVATAR_ID,
    },
  });
}

function api(method, path, user) {
  const req = request(app)[method](path);
  if (!user) return req;
  const token = jwt.sign({ sub: user.id, username: user.username }, config.jwtSecret);

  return req.set('Authorization', `Bearer ${token}`);
}

beforeAll(async () => {
  await prisma.avatar.upsert({
    where: { id: DEFAULT_AVATAR_ID },
    update: { type: 'DEFAULT', url: '/static/avatars/1.png', ownerId: null },
    create: { id: DEFAULT_AVATAR_ID, type: 'DEFAULT', url: '/static/avatars/1.png' },
  });
});

beforeEach(async () => {
  await clearData();
});

afterAll(async () => {
  await clearData();
  await prisma.$disconnect();
});

describe('catálogo de escenarios', () => {
  it('exige sesión y correo verificado', async () => {
    expect((await api('get', '/api/game/scenarios')).status).toBe(401);

    const unverified = await createUser('sin_verificar', false);
    const response = await api('get', '/api/game/scenarios', unverified);

    expect(response.status).toBe(403);
  });

  it('lista al menos 4 escenarios con su mapa, paleta y música', async () => {
    const user = await createUser('jugador');

    const response = await api('get', '/api/game/scenarios', user);

    expect(response.status).toBe(200);
    expect(response.body.scenarios.length).toBeGreaterThanOrEqual(4);
    const first = response.body.scenarios[0];
    expect(first.map).toHaveLength(20);
    expect(first.palette.floor).toMatch(/^#/);
    expect(first.music.track).toBeDefined();
  });

  it('devuelve un escenario por id y 404 si no existe', async () => {
    const user = await createUser('jugador');

    const found = await api('get', '/api/game/scenarios/estacion-espacial', user);
    expect(found.status).toBe(200);
    expect(found.body.scenario.name).toBe('Estación espacial');

    const missing = await api('get', '/api/game/scenarios/no-existe', user);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('SCENARIO_NOT_FOUND');

    const invalid = await api('get', '/api/game/scenarios/Mal_Id', user);
    expect(invalid.status).toBe(400);
  });
});

describe('elegir escenario al crear la partida', () => {
  it('guarda el escenario elegido', async () => {
    const host = await createUser('anfitrion');

    const response = await api('post', '/api/game/matches', host).send({
      endMode: 'TIME',
      scenarioId: 'planta-industrial',
    });

    expect(response.status).toBe(201);
    expect(response.body.match.scenarioId).toBe('planta-industrial');
    const stored = await prisma.match.findUnique({ where: { id: response.body.match.id } });
    expect(stored.scenarioId).toBe('planta-industrial');
  });

  it('sin escenario usa el primero del catálogo, y "random" guarda uno concreto', async () => {
    const host = await createUser('anfitrion');
    const list = await api('get', '/api/game/scenarios', host);
    const ids = list.body.scenarios.map((s) => s.id);

    const byDefault = await api('post', '/api/game/matches', host).send({ endMode: 'TIME' });
    expect(byDefault.body.match.scenarioId).toBe(ids[0]);

    const random = await api('post', '/api/game/matches', host).send({
      endMode: 'TIME',
      scenarioId: 'random',
    });
    expect(ids).toContain(random.body.match.scenarioId);
  });

  it('rechaza un escenario que no existe', async () => {
    const host = await createUser('anfitrion');

    const response = await api('post', '/api/game/matches', host).send({
      endMode: 'TIME',
      scenarioId: 'no-existe',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('SCENARIO_NOT_FOUND');
    expect(await prisma.match.count()).toBe(0);
  });
});
