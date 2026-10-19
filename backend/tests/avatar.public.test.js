const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const uploadsDir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'arena-avatars-public-')
);
process.env.UPLOADS_DIR = uploadsDir;

const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/infrastructure/prisma');
const {
  DEFAULT_AVATARS,
  clearPlayers,
  createPlayer,
  seedDefaultAvatars,
  tokenFor,
} = require('./helpers/avatarFixtures');

let userA;
let userB;
let authA;

beforeAll(async () => {
  await clearPlayers();
  await seedDefaultAvatars();
});

beforeEach(async () => {
  await clearPlayers();
  userA = await createPlayer({
    username: 'jugador_a',
    email: 'jugador_a@test.com',
    avatarId: DEFAULT_AVATARS[0].id,
  });
  userB = await createPlayer({
    username: 'jugador_b',
    email: 'jugador_b@test.com',
    avatarId: DEFAULT_AVATARS[3].id,
  });
  authA = `Bearer ${tokenFor(userA)}`;
});

afterAll(async () => {
  await clearPlayers();
  await prisma.$disconnect();
  fs.rmSync(uploadsDir, { recursive: true, force: true });
});

describe('GET /api/users/:id/public', () => {
  it('devuelve solo los datos públicos del jugador', async () => {
    const response = await request(app)
      .get(`/api/users/${userB.id}/public`)
      .set('Authorization', authA);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id: userB.id,
      username: 'jugador_b',
      avatarUrl: '/static/avatars/4.png',
    });
  });

  it('responde 404 si el jugador no existe', async () => {
    const response = await request(app)
      .get(`/api/users/${crypto.randomUUID()}/public`)
      .set('Authorization', authA);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('responde 401 sin token', async () => {
    const response = await request(app).get(`/api/users/${userB.id}/public`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });
});
