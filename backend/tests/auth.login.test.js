const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
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

async function createUser({ username, email, verified }) {
  return prisma.user.create({
    data: {
      username,
      email,
      passwordHash,
      emailVerified: verified,
      avatarId: DEFAULT_AVATAR_ID,
    },
  });
}

function login(payload) {
  return request(app).post('/api/auth/login').send(payload);
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
  await createUser({
    username: 'jugador_verificado',
    email: 'verificado@test.com',
    verified: true,
  });
  await createUser({
    username: 'jugador_pendiente',
    email: 'pendiente@test.com',
    verified: false,
  });
});

afterAll(async () => {
  await clearData();
  await prisma.$disconnect();
});

describe('POST /api/auth/login', () => {
  it('CA-03.1/03.2: entra con nombre de usuario y devuelve token y usuario', async () => {
    const response = await login({
      identifier: 'jugador_verificado',
      password: PASSWORD,
    });

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.user).toEqual(
      expect.objectContaining({
        username: 'jugador_verificado',
        email: 'verificado@test.com',
        emailVerified: true,
        avatarId: DEFAULT_AVATAR_ID,
        avatarUrl: '/static/avatars/1.png',
      })
    );
    expect(response.body.user).not.toHaveProperty('passwordHash');
  });

  it('entra con correo electrónico', async () => {
    const response = await login({
      identifier: 'verificado@test.com',
      password: PASSWORD,
    });

    expect(response.status).toBe(200);
    expect(response.body.user.username).toBe('jugador_verificado');
  });

  it('no distingue mayúsculas ni en username ni en correo', async () => {
    const byUsername = await login({
      identifier: 'JUGADOR_VERIFICADO',
      password: PASSWORD,
    });
    expect(byUsername.status).toBe(200);

    const byEmail = await login({
      identifier: 'VERIFICADO@TEST.COM',
      password: PASSWORD,
    });
    expect(byEmail.status).toBe(200);
  });

  it('el JWT contiene sub y username, pero no emailVerified', async () => {
    const response = await login({
      identifier: 'jugador_verificado',
      password: PASSWORD,
    });

    const payload = jwt.decode(response.body.accessToken);

    expect(payload.sub).toBe(response.body.user.id);
    expect(payload.username).toBe('jugador_verificado');
    expect(payload).not.toHaveProperty('emailVerified');
  });

  it('registra el último acceso al iniciar sesión', async () => {
    const before = await prisma.user.findUnique({
      where: { email: 'verificado@test.com' },
    });
    expect(before.lastLoginAt).toBeNull();

    const response = await login({
      identifier: 'jugador_verificado',
      password: PASSWORD,
    });
    expect(response.status).toBe(200);

    const after = await prisma.user.findUnique({
      where: { email: 'verificado@test.com' },
    });
    expect(after.lastLoginAt).not.toBeNull();
    expect(after.lastLoginAt.getTime()).toBeGreaterThanOrEqual(
      before.createdAt.getTime()
    );
  });

  it('CA-03.4: avisa con notice cuando el correo no está verificado', async () => {
    const pending = await login({
      identifier: 'jugador_pendiente',
      password: PASSWORD,
    });

    expect(pending.status).toBe(200);
    expect(pending.body.notice).toEqual({
      code: 'EMAIL_NOT_VERIFIED',
      message:
        'Tu correo está pendiente de verificación. Podrás jugar cuando lo verifiques.',
    });

    const verified = await login({
      identifier: 'jugador_verificado',
      password: PASSWORD,
    });
    expect(verified.status).toBe(200);
    expect(verified.body).not.toHaveProperty('notice');
  });

  it('CA-03.3: rechaza una contraseña incorrecta', async () => {
    const response = await login({
      identifier: 'jugador_verificado',
      password: 'Otra1234',
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(response.body.error.message).toBe(
      'Usuario/correo o contraseña incorrectos'
    );
  });

  it('responde igual para un usuario inexistente', async () => {
    const wrongPassword = await login({
      identifier: 'jugador_verificado',
      password: 'Otra1234',
    });
    const missingUser = await login({
      identifier: 'no_existe',
      password: PASSWORD,
    });

    expect(missingUser.status).toBe(401);
    expect(missingUser.body.error).toEqual(wrongPassword.body.error);
  });

  it('valida los campos vacíos', async () => {
    const response = await login({ identifier: '   ', password: '' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.fields.identifier).toBe(
      'Ingresa tu usuario o correo'
    );
    expect(response.body.error.fields.password).toBe('Ingresa tu contraseña');
  });

  it('valida los campos faltantes', async () => {
    const response = await login({});

    expect(response.status).toBe(400);
    expect(response.body.error.fields.identifier).toBe(
      'Ingresa tu usuario o correo'
    );
    expect(response.body.error.fields.password).toBe('Ingresa tu contraseña');
  });
});
