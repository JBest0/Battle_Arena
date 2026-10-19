const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const uploadsDir = fs.mkdtempSync(
  path.join(os.tmpdir(), 'arena-avatars-select-')
);
process.env.UPLOADS_DIR = uploadsDir;

const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/infrastructure/prisma');
const {
  DEFAULT_AVATARS,
  PASSWORD,
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
    avatarId: DEFAULT_AVATARS[1].id,
  });
  authA = `Bearer ${tokenFor(userA)}`;
});

afterAll(async () => {
  await clearPlayers();
  await prisma.$disconnect();
  fs.rmSync(uploadsDir, { recursive: true, force: true });
});

describe('PUT /api/users/me/avatar', () => {
  it('permite elegir un avatar default y /me lo refleja', async () => {
    const response = await request(app)
      .put('/api/users/me/avatar')
      .set('Authorization', authA)
      .send({ avatarId: DEFAULT_AVATARS[2].id });

    expect(response.status).toBe(200);
    expect(response.body.user.avatarUrl).toBe('/static/avatars/3.png');

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', authA);

    expect(me.status).toBe(200);
    expect(me.body.user.avatarUrl).toBe('/static/avatars/3.png');
  });

  it('CA-06.4: un login nuevo mantiene el avatar elegido', async () => {
    await request(app)
      .put('/api/users/me/avatar')
      .set('Authorization', authA)
      .send({ avatarId: DEFAULT_AVATARS[2].id });

    const login = await request(app).post('/api/auth/login').send({
      identifier: 'jugador_a',
      password: PASSWORD,
    });

    expect(login.status).toBe(200);
    expect(login.body.accessToken).toEqual(expect.any(String));
    expect(login.body.user.avatarUrl).toBe('/static/avatars/3.png');
  });

  it('responde 404 si el avatar no existe', async () => {
    const response = await request(app)
      .put('/api/users/me/avatar')
      .set('Authorization', authA)
      .send({ avatarId: crypto.randomUUID() });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('AVATAR_NOT_FOUND');
    expect(response.body.error.message).toBe(
      'El avatar seleccionado no existe'
    );
  });

  it('responde 400 si el avatarId no es un uuid', async () => {
    const response = await request(app)
      .put('/api/users/me/avatar')
      .set('Authorization', authA)
      .send({ avatarId: 'no-es-un-uuid' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.fields.avatarId).toBe('Avatar inválido');
  });

  it('A no puede elegir un avatar subido por B', async () => {
    const uploadedByB = await prisma.avatar.create({
      data: {
        type: 'UPLOADED',
        url: '/uploads/avatars/ajeno.webp',
        ownerId: userB.id,
      },
    });

    const response = await request(app)
      .put('/api/users/me/avatar')
      .set('Authorization', authA)
      .send({ avatarId: uploadedByB.id });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('AVATAR_NOT_FOUND');

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', authA);

    expect(me.body.user.avatarId).toBe(DEFAULT_AVATARS[0].id);
  });

  it('responde 401 sin token', async () => {
    const response = await request(app)
      .put('/api/users/me/avatar')
      .send({ avatarId: DEFAULT_AVATARS[2].id });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });
});
