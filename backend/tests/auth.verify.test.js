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

function validPayload(overrides = {}) {
  return {
    username: 'verifica_jugador',
    email: 'verifica@test.com',
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

async function registerAndCaptureToken(payload = validPayload()) {
  const response = await request(app).post('/api/auth/register').send(payload);
  expect(response.status).toBe(201);
  const [, token] = mockSendVerification.mock.calls[0];
  return { response, token };
}

function verify(token) {
  return request(app).post('/api/auth/verify-email').send({ token });
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

describe('POST /api/auth/verify-email', () => {
  it('CA-02.1/02.2: el registro crea un token de 24 h y envía el correo', async () => {
    await registerAndCaptureToken();

    const [to, rawToken, username] = mockSendVerification.mock.calls[0];
    expect(to).toBe('verifica@test.com');
    expect(username).toBe('verifica_jugador');

    const tokenRecord = await prisma.emailVerificationToken.findFirst({
      where: { tokenHash: hashToken(rawToken) },
    });

    expect(tokenRecord).not.toBeNull();
    expect(tokenRecord.usedAt).toBeNull();

    const ttlHours = (tokenRecord.expiresAt.getTime() - Date.now()) / 3600000;
    expect(ttlHours).toBeGreaterThan(23.9);
    expect(ttlHours).toBeLessThan(24.1);
  });

  it('CA-02.3: verifica la cuenta y marca el token como usado', async () => {
    const { token } = await registerAndCaptureToken();

    const response = await verify(token);

    expect(response.status).toBe(200);
    expect(response.body.alreadyVerified).toBe(false);
    expect(response.body.message).toBe(
      'Correo verificado. Ya puedes iniciar sesión y jugar.'
    );
    expect(response.body.user.emailVerified).toBe(true);

    const user = await prisma.user.findUnique({
      where: { email: 'verifica@test.com' },
    });
    expect(user.emailVerified).toBe(true);

    const tokenRecord = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    expect(tokenRecord.usedAt).not.toBeNull();
  });

  it('es idempotente: repetir el mismo token responde alreadyVerified', async () => {
    const { token } = await registerAndCaptureToken();
    await verify(token);

    const response = await verify(token);

    expect(response.status).toBe(200);
    expect(response.body.alreadyVerified).toBe(true);
    expect(response.body.message).toBe('Tu correo ya estaba verificado.');
  });

  it('rechaza un token alterado con TOKEN_INVALID', async () => {
    const { token } = await registerAndCaptureToken();
    const altered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;

    const response = await verify(altered);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('TOKEN_INVALID');

    const user = await prisma.user.findUnique({
      where: { email: 'verifica@test.com' },
    });
    expect(user.emailVerified).toBe(false);
  });

  it('rechaza un token con formato incorrecto o vacío', async () => {
    const badFormat = await verify('no-es-un-token');
    expect(badFormat.status).toBe(400);
    expect(badFormat.body.error.code).toBe('TOKEN_INVALID');

    const empty = await verify('');
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe('VALIDATION_ERROR');

    const missing = await request(app).post('/api/auth/verify-email').send({});
    expect(missing.status).toBe(400);
    expect(missing.body.error.fields.token).toBe(
      'Falta el token de verificación'
    );
  });

  it('rechaza un token vencido con TOKEN_EXPIRED', async () => {
    const { token } = await registerAndCaptureToken();

    await prisma.emailVerificationToken.update({
      where: { tokenHash: hashToken(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await verify(token);

    expect(response.status).toBe(410);
    expect(response.body.error.code).toBe('TOKEN_EXPIRED');

    const user = await prisma.user.findUnique({
      where: { email: 'verifica@test.com' },
    });
    expect(user.emailVerified).toBe(false);
  });

  it('rechaza el token viejo tras un reenvío con TOKEN_USED y acepta el nuevo', async () => {
    const { token: oldToken } = await registerAndCaptureToken();

    await prisma.emailVerificationToken.updateMany({
      where: { tokenHash: hashToken(oldToken) },
      data: { createdAt: new Date(Date.now() - 61000) },
    });

    const resend = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'verifica@test.com' });

    expect(resend.status).toBe(200);
    expect(mockSendVerification).toHaveBeenCalledTimes(2);
    const newToken = mockSendVerification.mock.calls[1][1];
    expect(newToken).not.toBe(oldToken);

    const oldResponse = await verify(oldToken);
    expect(oldResponse.status).toBe(400);
    expect(oldResponse.body.error.code).toBe('TOKEN_USED');

    const newResponse = await verify(newToken);
    expect(newResponse.status).toBe(200);
    expect(newResponse.body.alreadyVerified).toBe(false);
  });
});
