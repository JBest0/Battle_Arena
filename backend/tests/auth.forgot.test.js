const mockSendPasswordReset = jest.fn();

jest.mock('../src/infrastructure/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendPasswordReset: mockSendPasswordReset,
  })),
}));

const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../src/app');
const { prisma } = require('../src/infrastructure/prisma');
const { hashToken } = require('../src/infrastructure/tokens');

const DEFAULT_AVATAR_ID = '00000000-0000-4000-8000-000000000001';
const PASSWORD = 'Test1234';
const GENERIC_MESSAGE =
  'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña. Vence en 30 minutos.';

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

function forgotPassword(email) {
  return request(app).post('/api/auth/forgot-password').send({ email });
}

async function resetTimestamp(userId) {
  await prisma.passwordResetToken.updateMany({
    where: { userId },
    data: { createdAt: new Date(Date.now() - 61000) },
  });
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
});

afterAll(async () => {
  await clearData();
  await prisma.$disconnect();
});

describe('POST /api/auth/forgot-password', () => {
  it('CA-05.1/05.2: crea un token de 30 minutos y envía el enlace', async () => {
    const user = await createUser();

    const response = await forgotPassword('recupera@test.com');

    expect(response.status).toBe(200);
    expect(response.body.message).toBe(GENERIC_MESSAGE);

    const record = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id },
    });

    expect(record).not.toBeNull();
    expect(record.usedAt).toBeNull();

    const ttlMs = record.expiresAt.getTime() - record.createdAt.getTime();
    expect(ttlMs).toBeGreaterThan(29 * 60 * 1000);
    expect(ttlMs).toBeLessThan(31 * 60 * 1000);

    expect(mockSendPasswordReset).toHaveBeenCalledTimes(1);
    const [to, token, username] = mockSendPasswordReset.mock.calls[0];
    expect(to).toBe('recupera@test.com');
    expect(username).toBe('recupera');
    expect(record.tokenHash).toBe(hashToken(token));
  });

  it('responde el MISMO body para un correo inexistente y no envía correo', async () => {
    await createUser();

    const existing = await forgotPassword('recupera@test.com');
    mockSendPasswordReset.mockClear();

    const missing = await forgotPassword('nadie@test.com');

    expect(missing.status).toBe(200);
    expect(missing.body).toEqual(existing.body);
    expect(mockSendPasswordReset).not.toHaveBeenCalled();
  });

  it('encuentra al usuario aunque el correo venga en mayúsculas', async () => {
    await createUser({ email: 'mayusculas@test.com' });

    const response = await forgotPassword('MAYUSCULAS@TEST.COM');

    expect(response.status).toBe(200);
    expect(mockSendPasswordReset).toHaveBeenCalledTimes(1);
    expect(mockSendPasswordReset.mock.calls[0][0]).toBe('mayusculas@test.com');
  });

  it('un enlace nuevo invalida el anterior', async () => {
    const user = await createUser();

    await forgotPassword('recupera@test.com');
    const firstToken = mockSendPasswordReset.mock.calls[0][1];
    await resetTimestamp(user.id);

    const second = await forgotPassword('recupera@test.com');
    const secondToken = mockSendPasswordReset.mock.calls[1][1];

    expect(second.status).toBe(200);
    expect(secondToken).not.toBe(firstToken);

    const oldRecord = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(firstToken) },
    });
    expect(oldRecord.usedAt).not.toBeNull();

    const active = await prisma.passwordResetToken.count({
      where: { userId: user.id, usedAt: null },
    });
    expect(active).toBe(1);
  });

  it('limita dos solicitudes seguidas con 429', async () => {
    await createUser();

    const first = await forgotPassword('recupera@test.com');
    const second = await forgotPassword('recupera@test.com');

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe('TOO_MANY_REQUESTS');
  });

  it('rechaza un correo mal formado con VALIDATION_ERROR', async () => {
    const response = await forgotPassword('no-es-correo');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.fields.email).toBe(
      'El formato del correo no es válido'
    );
  });
});
