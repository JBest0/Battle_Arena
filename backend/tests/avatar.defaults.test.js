const fs = require('fs');
const os = require('os');
const path = require('path');

const uploadsDir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'arena-avatars-defaults-')
);
process.env.UPLOADS_DIR = uploadsDir;

jest.mock('../src/infrastructure/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendVerification: jest.fn().mockResolvedValue(),
    sendPasswordReset: jest.fn().mockResolvedValue(),
  })),
}));

const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/infrastructure/prisma');
const {
  DEFAULT_AVATAR_IDS,
  clearPlayers,
  seedDefaultAvatars,
} = require('./helpers/avatarFixtures');

beforeAll(async () => {
  await clearPlayers();
  await seedDefaultAvatars();
});

afterAll(async () => {
  await clearPlayers();
  await prisma.$disconnect();
  fs.rmSync(uploadsDir, { recursive: true, force: true });
});

describe('avatares por defecto', () => {
  it('CA-06.2: devuelve exactamente los 5 avatares default', async () => {
    const response = await request(app).get('/api/avatars/defaults');

    expect(response.status).toBe(200);
    expect(response.body.avatars).toHaveLength(5);
    expect(response.body.avatars.map((avatar) => avatar.id).sort()).toEqual(
      [...DEFAULT_AVATAR_IDS].sort()
    );
    expect(response.body.avatars).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(String),
          url: expect.stringContaining('/static/avatars/'),
        }),
      ])
    );
  });

  it('CA-06.1: un usuario recién registrado tiene avatar en /me', async () => {
    const register = await request(app).post('/api/auth/register').send({
      username: 'nuevo_avatar',
      email: 'nuevo_avatar@test.com',
      password: 'Test1234',
      confirmPassword: 'Test1234',
    });

    expect(register.status).toBe(201);

    const login = await request(app).post('/api/auth/login').send({
      identifier: 'nuevo_avatar',
      password: 'Test1234',
    });

    expect(login.status).toBe(200);

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);

    expect(me.status).toBe(200);
    expect(me.body.user.avatarId).toEqual(expect.any(String));
    expect(me.body.user.avatarUrl).toEqual(
      expect.stringContaining('/static/avatars/')
    );
  });
});
