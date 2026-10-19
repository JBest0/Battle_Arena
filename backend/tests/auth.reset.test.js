const mockSendPasswordReset = jest.fn();
const mockSendPasswordChanged = jest.fn();

jest.mock('../src/infrastructure/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendPasswordReset: mockSendPasswordReset,
    sendPasswordChanged: mockSendPasswordChanged,
  })),
}));

const request = require('supertest');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const config = require('../src/config');
const { prisma } = require('../src/infrastructure/prisma');
const {
  TokenCleanupJob,
} = require('../src/infrastructure/TokenCleanupJob');

const DEFAULT_AVATAR_ID = '00000000-0000-4000-8000-000000000001';
const PASSWORD = 'Test1234';
const NEW_PASSWORD = 'Nueva1234';

async function clearData() {
  await prisma.matchParticipant.deleteMany();
  await prisma.match.deleteMany();
  await prisma.userAchievement.deleteMany();
  await prisma.playerStats.deleteMany();
  await prisma.emailVerificationToken.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.user.deleteMany();
}

async function createUser({
  username = 'recupera',
  email = 'recupera@test.com',
  verified = true,
} = {}) {
  return prisma.user.create({
    data: {
      username,
      email,
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      emailVerified: verified,
      avatarId: DEFAULT_AVATAR_ID,
    },
  });
}

async function requestResetToken(email) {
  const response = await request(app)
    .post('/api/auth/forgot-password')
    .send({ email });
  expect(response.status).toBe(200);
  return mockSendPasswordReset.mock.calls.at(-1)[1];
}

function resetPassword(payload) {
  return request(app).post('/api/auth/reset-password').send(payload);
}

function login(identifier, password) {
  return request(app).post('/api/auth/login').send({ identifier, password });
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
  mockSendPasswordReset.mockReset();
  mockSendPasswordReset.mockResolvedValue();
  mockSendPasswordChanged.mockReset();
  mockSendPasswordChanged.mockResolvedValue();
});

afterAll(async () => {
  await clearData();
  await prisma.$disconnect();
});

describe('POST /api/auth/reset-password', () => {
  it('CA-05.3: cambia la contraseña, invalida el token y revoca la anterior', async () => {
    const user = await createUser();
    const token = await requestResetToken('recupera@test.com');

    const response = await resetPassword({
      token,
      password: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe(
      'Contraseña actualizada. Ya puedes iniciar sesión.'
    );

    const newLogin = await login('recupera', NEW_PASSWORD);
    expect(newLogin.status).toBe(200);

    const oldLogin = await login('recupera', PASSWORD);
    expect(oldLogin.status).toBe(401);

    const record = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id },
    });
    expect(record.usedAt).not.toBeNull();

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated.passwordChangedAt).not.toBeNull();
    expect(await bcrypt.compare(NEW_PASSWORD, updated.passwordHash)).toBe(true);

    expect(mockSendPasswordChanged).toHaveBeenCalledWith(
      'recupera@test.com',
      'recupera'
    );
  });

  it('verifica el correo de un usuario pendiente', async () => {
    const user = await createUser({ verified: false });
    const token = await requestResetToken('recupera@test.com');

    const response = await resetPassword({
      token,
      password: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });

    expect(response.status).toBe(200);

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(updated.emailVerified).toBe(true);
  });

  it('CA-05.3: revoca los JWT emitidos antes del cambio', async () => {
    const user = await createUser();
    const issuedAt = Math.floor(Date.now() / 1000) - 60;
    const oldToken = jwt.sign(
      { sub: user.id, username: user.username, iat: issuedAt },
      config.jwtSecret,
      { expiresIn: '1h' }
    );

    const before = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${oldToken}`);
    expect(before.status).toBe(200);

    const token = await requestResetToken('recupera@test.com');
    const reset = await resetPassword({
      token,
      password: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });
    expect(reset.status).toBe(200);

    const revoked = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${oldToken}`);

    expect(revoked.status).toBe(401);
    expect(revoked.body.error.code).toBe('SESSION_REVOKED');
    expect(revoked.body.error.message).toBe(
      'Tu contraseña cambió. Inicia sesión de nuevo'
    );

    const newLogin = await login('recupera', NEW_PASSWORD);
    expect(newLogin.status).toBe(200);

    const after = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${newLogin.body.accessToken}`);
    expect(after.status).toBe(200);
  });

  it('CA-05.4: rechaza un token vencido sin cambiar la contraseña', async () => {
    const user = await createUser();
    const token = await requestResetToken('recupera@test.com');

    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await resetPassword({
      token,
      password: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });

    expect(response.status).toBe(410);
    expect(response.body.error.code).toBe('TOKEN_EXPIRED');

    const oldLogin = await login('recupera', PASSWORD);
    expect(oldLogin.status).toBe(200);
    const newLogin = await login('recupera', NEW_PASSWORD);
    expect(newLogin.status).toBe(401);
  });

  it('rechaza un token reutilizado con TOKEN_USED', async () => {
    await createUser();
    const token = await requestResetToken('recupera@test.com');

    const first = await resetPassword({
      token,
      password: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });
    expect(first.status).toBe(200);

    const second = await resetPassword({
      token,
      password: 'Otra12345',
      confirmPassword: 'Otra12345',
    });

    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe('TOKEN_USED');
  });

  it('rechaza un token alterado con TOKEN_INVALID', async () => {
    await createUser();

    const response = await resetPassword({
      token: 'f'.repeat(64),
      password: NEW_PASSWORD,
      confirmPassword: NEW_PASSWORD,
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('TOKEN_INVALID');
  });

  it('rechaza contraseñas distintas con fields.confirmPassword', async () => {
    await createUser();
    const token = await requestResetToken('recupera@test.com');

    const response = await resetPassword({
      token,
      password: NEW_PASSWORD,
      confirmPassword: 'Distinta1234',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.fields.confirmPassword).toBe(
      'Las contraseñas no coinciden'
    );
  });

  it('rechaza una contraseña que no cumple las reglas con fields.password', async () => {
    await createUser();
    const token = await requestResetToken('recupera@test.com');

    const response = await resetPassword({
      token,
      password: 'corta',
      confirmPassword: 'corta',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.fields.password).toBe(
      'La contraseña debe tener al menos 8 caracteres'
    );
  });

  it('rechaza la contraseña actual con PASSWORD_REUSED', async () => {
    await createUser();
    const token = await requestResetToken('recupera@test.com');

    const response = await resetPassword({
      token,
      password: PASSWORD,
      confirmPassword: PASSWORD,
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('PASSWORD_REUSED');
    expect(response.body.error.fields.password).toBe(
      'La nueva contraseña debe ser distinta a la actual'
    );
  });
});

describe('TokenCleanupJob', () => {
  it('solo elimina los tokens vencidos hace más de 7 días', async () => {
    const user = await createUser();
    const now = Date.now();
    const eightDaysAgo = new Date(now - 8 * 24 * 60 * 60 * 1000);
    const tomorrow = new Date(now + 24 * 60 * 60 * 1000);

    await prisma.emailVerificationToken.createMany({
      data: [
        {
          userId: user.id,
          tokenHash: 'a'.repeat(64),
          expiresAt: eightDaysAgo,
        },
        {
          userId: user.id,
          tokenHash: 'b'.repeat(64),
          expiresAt: tomorrow,
        },
      ],
    });

    await prisma.passwordResetToken.createMany({
      data: [
        {
          userId: user.id,
          tokenHash: 'c'.repeat(64),
          expiresAt: eightDaysAgo,
        },
        {
          userId: user.id,
          tokenHash: 'd'.repeat(64),
          expiresAt: tomorrow,
        },
      ],
    });

    const logger = { log: jest.fn(), error: jest.fn() };
    const result = await new TokenCleanupJob({
      logger,
      retentionDays: 7,
    }).run();

    expect(result).toEqual({ emailVerifications: 1, passwordResets: 1 });

    const emails = await prisma.emailVerificationToken.findMany({
      where: { userId: user.id },
    });
    const resets = await prisma.passwordResetToken.findMany({
      where: { userId: user.id },
    });

    expect(emails.map((item) => item.tokenHash)).toEqual(['b'.repeat(64)]);
    expect(resets.map((item) => item.tokenHash)).toEqual(['d'.repeat(64)]);
    expect(logger.log).toHaveBeenCalledWith(
      'Limpieza de tokens: 1 de verificación y 1 de recuperación eliminados'
    );
  });
});
