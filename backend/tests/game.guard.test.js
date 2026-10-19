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
const {
  assertSocketUserVerified,
  requireVerifiedEmail,
} = require('../src/shared/middleware/requireVerifiedEmail');

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

async function createUser({ username, email, verified }) {
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

function join(token) {
  const req = request(app).post('/api/game/join');
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
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

describe('CA-02.5: POST /api/game/join', () => {
  it('rechaza la petición sin token con 401', async () => {
    const response = await join(null);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rechaza a un usuario no verificado con 403 EMAIL_NOT_VERIFIED', async () => {
    const user = await createUser({
      username: 'sin_verificar',
      email: 'sin@test.com',
      verified: false,
    });

    const response = await join(signToken(user));

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(response.body.error.message).toBe(
      'Debes verificar tu correo antes de iniciar una partida'
    );
  });

  it('deja pasar a un usuario verificado hasta el handler (501)', async () => {
    const user = await createUser({
      username: 'verificado',
      email: 'si@test.com',
      verified: true,
    });

    const response = await join(signToken(user));

    expect(response.status).toBe(501);
    expect(response.body.error.code).toBe('NOT_IMPLEMENTED');
  });

  it('assertSocketUserVerified rechaza a un usuario no verificado', async () => {
    const user = await createUser({
      username: 'socket_sin',
      email: 'socket@test.com',
      verified: false,
    });

    await expect(assertSocketUserVerified({ id: user.id })).rejects.toMatchObject(
      { status: 403, code: 'EMAIL_NOT_VERIFIED' }
    );
  });

  it('assertSocketUserVerified acepta a un usuario verificado', async () => {
    const user = await createUser({
      username: 'socket_ok',
      email: 'socket_ok@test.com',
      verified: true,
    });

    await expect(
      assertSocketUserVerified({ id: user.id, username: user.username })
    ).resolves.toEqual({ id: user.id, username: user.username });
  });
});

describe('requireVerifiedEmail', () => {
  it('consulta la BD y no confía en el JWT', async () => {
    const user = await createUser({
      username: 'guard_db',
      email: 'guard@test.com',
      verified: false,
    });

    const next = jest.fn();
    const req = { user: { id: user.id, username: user.username } };

    await requireVerifiedEmail(req, {}, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 403, code: 'EMAIL_NOT_VERIFIED' })
    );
  });
});
