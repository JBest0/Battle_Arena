const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const config = require('../src/config');
const { prisma } = require('../src/infrastructure/prisma');

const DEFAULT_AVATAR_ID = '00000000-0000-4000-8000-000000000001';
const PASSWORD = 'Test1234';

let passwordHash;

async function clearData() {
  await prisma.matchParticipant.deleteMany();
  await prisma.match.deleteMany();
  await prisma.userAchievement.deleteMany();
  await prisma.playerStats.deleteMany();
  await prisma.emailVerificationToken.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.user.deleteMany();
}

async function createUser() {
  return prisma.user.create({
    data: {
      username: 'jugador_me',
      email: 'me@test.com',
      passwordHash,
      emailVerified: true,
      avatarId: DEFAULT_AVATAR_ID,
    },
  });
}

function signToken(user, options = {}) {
  return jwt.sign(
    { sub: user.id, username: user.username },
    config.jwtSecret,
    options
  );
}

function me(token) {
  const req = request(app).get('/api/auth/me');
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
}

beforeAll(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, 4);
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

describe('GET /api/auth/me', () => {
  it('CA-03.5/03.6: devuelve el usuario del token con su avatar', async () => {
    const user = await createUser();

    const response = await me(signToken(user));

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual(
      expect.objectContaining({
        id: user.id,
        username: 'jugador_me',
        email: 'me@test.com',
        emailVerified: true,
        avatarUrl: '/static/avatars/1.png',
      })
    );
    expect(response.body.user).not.toHaveProperty('passwordHash');
  });

  it('lee emailVerified de la BD aunque el token sea anterior', async () => {
    const user = await prisma.user.create({
      data: {
        username: 'jugador_me',
        email: 'me@test.com',
        passwordHash,
        emailVerified: false,
        avatarId: DEFAULT_AVATAR_ID,
      },
    });
    const token = signToken(user);

    const before = await me(token);
    expect(before.body.user.emailVerified).toBe(false);

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });

    const after = await me(token);
    expect(after.status).toBe(200);
    expect(after.body.user.emailVerified).toBe(true);
  });

  it('rechaza la petición sin token', async () => {
    const response = await me(null);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rechaza un token alterado', async () => {
    const user = await createUser();
    const token = signToken(user);
    const altered = `${token.slice(0, -2)}xx`;

    const response = await me(altered);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rechaza un token vencido con TOKEN_EXPIRED_SESSION', async () => {
    const user = await createUser();

    const response = await me(signToken(user, { expiresIn: '-1s' }));

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('TOKEN_EXPIRED_SESSION');
    expect(response.body.error.message).toBe(
      'Tu sesión expiró. Inicia sesión de nuevo'
    );
  });

  it('rechaza el token de un usuario borrado', async () => {
    const user = await createUser();
    const token = signToken(user);
    await prisma.user.delete({ where: { id: user.id } });

    const response = await me(token);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('POST /api/auth/logout', () => {
  it('responde 204 con un token válido', async () => {
    const user = await createUser();

    const response = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${signToken(user)}`);

    expect(response.status).toBe(204);
  });

  it('exige autenticación', async () => {
    const response = await request(app).post('/api/auth/logout');

    expect(response.status).toBe(401);
  });
});
