const mockSendVerification = jest.fn();

jest.mock('../src/infrastructure/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendVerification: mockSendVerification,
  })),
}));

const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/infrastructure/prisma');
const { hashToken } = require('../src/infrastructure/tokens');

const DEFAULT_AVATAR_ID = '00000000-0000-4000-8000-000000000001';
const GENERIC_MESSAGE =
  'Si la cuenta existe y no está verificada, te enviamos un nuevo correo.';

function validPayload(overrides = {}) {
  return {
    username: 'reenvia_jugador',
    email: 'reenvia@test.com',
    password: 'Test1234',
    confirmPassword: 'Test1234',
    ...overrides,
  };
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

async function registerUser(payload = validPayload()) {
  const response = await request(app).post('/api/auth/register').send(payload);
  expect(response.status).toBe(201);
  return response;
}

function resend(email) {
  return request(app).post('/api/auth/resend-verification').send({ email });
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

describe('POST /api/auth/resend-verification', () => {
  it('reenvía el correo, crea un token nuevo e invalida el anterior', async () => {
    await registerUser();
    const oldToken = mockSendVerification.mock.calls[0][1];
    mockSendVerification.mockClear();

    const user = await prisma.user.findUnique({
      where: { email: 'reenvia@test.com' },
    });
    await prisma.emailVerificationToken.updateMany({
      where: { userId: user.id },
      data: { createdAt: new Date(Date.now() - 61000) },
    });

    const response = await resend('reenvia@test.com');

    expect(response.status).toBe(200);
    expect(response.body.message).toBe(GENERIC_MESSAGE);
    expect(mockSendVerification).toHaveBeenCalledTimes(1);

    const newToken = mockSendVerification.mock.calls[0][1];
    expect(newToken).not.toBe(oldToken);

    const oldRecord = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashToken(oldToken) },
    });
    expect(oldRecord.usedAt).not.toBeNull();

    const newRecord = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashToken(newToken) },
    });
    expect(newRecord).not.toBeNull();
    expect(newRecord.usedAt).toBeNull();

    const activeCount = await prisma.emailVerificationToken.count({
      where: { userId: user.id, usedAt: null },
    });
    expect(activeCount).toBe(1);
  });

  it('responde el mensaje genérico para un correo inexistente sin enviar nada', async () => {
    mockSendVerification.mockClear();

    const response = await resend('nadie@test.com');

    expect(response.status).toBe(200);
    expect(response.body.message).toBe(GENERIC_MESSAGE);
    expect(mockSendVerification).not.toHaveBeenCalled();
  });

  it('responde el mensaje genérico para un usuario ya verificado sin enviar nada', async () => {
    await registerUser();
    await prisma.user.update({
      where: { email: 'reenvia@test.com' },
      data: { emailVerified: true },
    });
    mockSendVerification.mockClear();

    const response = await resend('reenvia@test.com');

    expect(response.status).toBe(200);
    expect(response.body.message).toBe(GENERIC_MESSAGE);
    expect(mockSendVerification).not.toHaveBeenCalled();
  });

  it('limita dos reenvíos seguidos con 429', async () => {
    await registerUser();
    const user = await prisma.user.findUnique({
      where: { email: 'reenvia@test.com' },
    });
    await prisma.emailVerificationToken.updateMany({
      where: { userId: user.id },
      data: { createdAt: new Date(Date.now() - 61000) },
    });

    const first = await resend('reenvia@test.com');
    expect(first.status).toBe(200);

    const second = await resend('reenvia@test.com');
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe('TOO_MANY_REQUESTS');
  });

  it('rechaza un correo mal formado con VALIDATION_ERROR', async () => {
    const response = await resend('no-es-correo');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.fields.email).toBe(
      'El formato del correo no es válido'
    );
  });
});
