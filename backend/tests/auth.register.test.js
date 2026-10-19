const mockSendVerification = jest.fn();

jest.mock('../src/infrastructure/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendVerification: mockSendVerification,
  })),
}));

const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../src/app');
const { prisma } = require('../src/infrastructure/prisma');
const { hashToken } = require('../src/infrastructure/tokens');

const DEFAULT_AVATAR_ID = '00000000-0000-4000-8000-000000000001';

function validPayload(overrides = {}) {
  return {
    username: 'nuevo_jugador',
    email: 'nuevo@test.com',
    password: 'Test1234',
    confirmPassword: 'Test1234',
    ...overrides,
  };
}

function register(payload) {
  return request(app).post('/api/auth/register').send(payload);
}

async function clearData() {
  await prisma.matchParticipant.deleteMany();
  await prisma.match.deleteMany();
  await prisma.userAchievement.deleteMany();
  await prisma.playerStats.deleteMany();
  await prisma.emailVerificationToken.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.user.deleteMany();
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
  mockSendVerification.mockReset();
  mockSendVerification.mockResolvedValue();
});

afterAll(async () => {
  await clearData();
  await prisma.$disconnect();
});

describe('POST /api/auth/register', () => {
  it('crea la cuenta, asigna avatar y estadísticas, y envía la verificación', async () => {
    const response = await register(validPayload());

    expect(response.status).toBe(201);
    expect(response.body.message).toBe(
      'Cuenta creada. Revise su correo para verificar la cuenta antes de jugar.'
    );
    expect(response.body.emailSent).toBe(true);
    expect(response.body.user).toEqual(
      expect.objectContaining({
        username: 'nuevo_jugador',
        email: 'nuevo@test.com',
        emailVerified: false,
        avatarUrl: '/static/avatars/1.png',
      })
    );
    expect(response.body.user).not.toHaveProperty('passwordHash');

    const user = await prisma.user.findUnique({
      where: { email: 'nuevo@test.com' },
      include: { stats: true },
    });

    expect(user).not.toBeNull();
    expect(user.emailVerified).toBe(false);
    expect(user.avatarId).toBe(DEFAULT_AVATAR_ID);
    expect(user.stats).not.toBeNull();

    const token = await prisma.emailVerificationToken.findFirst({
      where: { userId: user.id },
    });
    expect(token).not.toBeNull();
    expect(token.usedAt).toBeNull();
    expect(token.expiresAt.getTime()).toBeGreaterThan(Date.now());

    expect(mockSendVerification).toHaveBeenCalledTimes(1);
    const [to, rawToken, username] = mockSendVerification.mock.calls[0];
    expect(to).toBe('nuevo@test.com');
    expect(username).toBe('nuevo_jugador');
    expect(token.tokenHash).not.toBe(rawToken);
    expect(token.tokenHash).toBe(hashToken(rawToken));
  });

  it('guarda la contraseña hasheada y nunca en texto plano', async () => {
    await register(validPayload());

    const user = await prisma.user.findUnique({
      where: { email: 'nuevo@test.com' },
    });

    expect(user.passwordHash).not.toBe('Test1234');
    await expect(bcrypt.compare('Test1234', user.passwordHash)).resolves.toBe(
      true
    );
  });

  it('normaliza el correo a minúsculas', async () => {
    const response = await register(validPayload({ email: 'Foo@Test.COM' }));

    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe('foo@test.com');

    const user = await prisma.user.findUnique({
      where: { email: 'foo@test.com' },
    });
    expect(user).not.toBeNull();
  });

  it('rechaza un nombre de usuario repetido', async () => {
    await register(validPayload());

    const response = await register(
      validPayload({ username: 'nuevo_jugador', email: 'otro@test.com' })
    );

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('USERNAME_TAKEN');
    expect(response.body.error.fields).toEqual({
      username: expect.any(String),
    });
  });

  it('rechaza un nombre de usuario repetido sin importar mayúsculas', async () => {
    await register(validPayload());

    const response = await register(
      validPayload({ username: 'NUEVO_JUGADOR', email: 'otro@test.com' })
    );

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('USERNAME_TAKEN');
  });

  it('rechaza un correo repetido sin importar mayúsculas', async () => {
    await register(validPayload());

    const response = await register(
      validPayload({ username: 'otro_jugador', email: 'NUEVO@TEST.COM' })
    );

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_TAKEN');
    expect(response.body.error.fields).toEqual({ email: expect.any(String) });
  });

  describe('campos faltantes', () => {
    const requiredFields = [
      ['username', 'El nombre de usuario es obligatorio'],
      ['email', 'El correo es obligatorio'],
      ['password', 'La contraseña es obligatoria'],
      ['confirmPassword', 'Confirme la contraseña'],
    ];

    test.each(requiredFields)(
      'responde 400 con fields.%s cuando falta %s',
      async (field, message) => {
        const payload = validPayload();
        delete payload[field];

        const response = await register(payload);

        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
        expect(response.body.error.fields[field]).toBe(message);
      }
    );
  });

  it('rechaza un correo mal formado', async () => {
    const response = await register(validPayload({ email: 'no-es-correo' }));

    expect(response.status).toBe(400);
    expect(response.body.error.fields.email).toBe(
      'El formato del correo no es válido'
    );
  });

  it('rechaza contraseñas que no coinciden', async () => {
    const response = await register(
      validPayload({ confirmPassword: 'Otra1234' })
    );

    expect(response.status).toBe(400);
    expect(response.body.error.fields.confirmPassword).toBe(
      'Las contraseñas no coinciden'
    );
  });

  describe('reglas de contraseña', () => {
    const invalidPasswords = [
      ['sin número', 'SoloLetras'],
      ['sin letra', '12345678'],
      ['con menos de 8 caracteres', 'Ab1'],
      ['con más de 72 caracteres', `${'a1'.repeat(37)}`],
    ];

    test.each(invalidPasswords)(
      'rechaza una contraseña %s',
      async (_case, password) => {
        const response = await register(
          validPayload({ password, confirmPassword: password })
        );

        expect(response.status).toBe(400);
        expect(response.body.error.fields.password).toEqual(expect.any(String));
      }
    );
  });

  it('responde 201 con emailSent false si el correo falla, y conserva la cuenta', async () => {
    mockSendVerification.mockRejectedValueOnce(new Error('SMTP caído'));
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const response = await register(validPayload());

    expect(response.status).toBe(201);
    expect(response.body.emailSent).toBe(false);

    const user = await prisma.user.findUnique({
      where: { email: 'nuevo@test.com' },
    });
    expect(user).not.toBeNull();

    consoleErrorSpy.mockRestore();
  });
});
