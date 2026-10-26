const mockSendVerification = jest.fn();

jest.mock('../src/infrastructure/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendVerification: mockSendVerification,
  })),
}));

const request = require('supertest');
const app = require('../src/app');
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

describe('CA-03.4: acceso al área de juego', () => {
  it('bloquea al no verificado y lo deja pasar después de verificar con el mismo token', async () => {
    const register = await request(app).post('/api/auth/register').send({
      username: 'flujo_jugador',
      email: 'flujo@test.com',
      password: 'Test1234',
      confirmPassword: 'Test1234',
    });

    expect(register.status).toBe(201);
    const verificationToken = mockSendVerification.mock.calls[0][1];

    const login = await request(app).post('/api/auth/login').send({
      identifier: 'flujo_jugador',
      password: 'Test1234',
    });

    expect(login.status).toBe(200);
    expect(login.body.notice.code).toBe('EMAIL_NOT_VERIFIED');
    const { accessToken } = login.body;

    const blocked = await request(app)
      .get('/api/game/matches')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('EMAIL_NOT_VERIFIED');

    const verify = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: verificationToken });

    expect(verify.status).toBe(200);

    const allowed = await request(app)
      .get('/api/game/matches')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(allowed.status).toBe(200);
    expect(Array.isArray(allowed.body.matches)).toBe(true);
  });
});
