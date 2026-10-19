const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/infrastructure/prisma');
const { statsService } = require('../src/container');
const {
  clearPlayers,
  createPlayer,
  seedDefaultAvatars,
  tokenFor,
  DEFAULT_AVATAR_IDS,
} = require('./helpers/avatarFixtures');

const ACHIEVEMENTS = [
  { code: 'FIRST_MATCH', name: 'Primera partida', description: 'Juega 1' },
  { code: 'FIRST_WIN', name: 'Primera victoria', description: 'Gana 1' },
  { code: 'TEN_MATCHES', name: 'Veterano', description: 'Juega 10' },
  { code: 'HIGH_SCORE', name: 'Gran puntaje', description: '100 puntos' },
  { code: 'THREE_WINS', name: 'Racha de campeón', description: 'Gana 3' },
];

async function clearData() {
  await clearPlayers();
  await prisma.achievement.deleteMany();
}

async function seedAchievements() {
  await prisma.achievement.createMany({ data: ACHIEVEMENTS });
}

async function createMatch({ playerA, playerB, scoreA, scoreB, endedAt }) {
  const match = await prisma.match.create({
    data: {
      startedAt: new Date((endedAt || Date.now()).valueOf() - 5 * 60 * 1000),
      endedAt: endedAt || new Date(),
      endMode: 'POINTS',
      participants: {
        create: [
          { userId: playerA.id, finalScore: scoreA },
          { userId: playerB.id, finalScore: scoreB },
        ],
      },
    },
  });

  await statsService.recordMatchResult(match.id);
  return match;
}

async function registerMatches(playerA, playerB) {
  const now = Date.now();
  await createMatch({
    playerA,
    playerB,
    scoreA: 50,
    scoreB: 30,
    endedAt: new Date(now - 4 * 60 * 60 * 1000),
  });
  await createMatch({
    playerA,
    playerB,
    scoreA: 45,
    scoreB: 35,
    endedAt: new Date(now - 3 * 60 * 60 * 1000),
  });
  await createMatch({
    playerA,
    playerB,
    scoreA: 40,
    scoreB: 40,
    endedAt: new Date(now - 2 * 60 * 60 * 1000),
  });
  await createMatch({
    playerA,
    playerB,
    scoreA: 10,
    scoreB: 20,
    endedAt: new Date(now - 60 * 60 * 1000),
  });
}

function authHeader(player) {
  return `Bearer ${tokenFor(player)}`;
}

beforeAll(async () => {
  await seedDefaultAvatars();
});

beforeEach(async () => {
  await clearData();
  await seedAchievements();
});

afterAll(async () => {
  await clearData();
  await prisma.$disconnect();
});

describe('GET /api/users/me/profile', () => {
  it('CA-04.1: incluye usuario, avatar, correo y fechas', async () => {
    const player = await createPlayer({
      username: 'perfil_uno',
      email: 'perfil1@test.com',
    });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'perfil_uno', password: 'Test1234' });
    expect(login.status).toBe(200);

    const response = await request(app)
      .get('/api/users/me/profile')
      .set('Authorization', `Bearer ${login.body.accessToken}`);

    expect(response.status).toBe(200);
    expect(response.body.isOwnProfile).toBe(true);
    expect(response.body.user).toEqual(
      expect.objectContaining({
        id: player.id,
        username: 'perfil_uno',
        email: 'perfil1@test.com',
        emailVerified: true,
        avatarUrl: '/static/avatars/1.png',
      })
    );
    expect(response.body.user.memberSince).toEqual(expect.any(String));
    expect(response.body.user.lastLoginAt).toEqual(expect.any(String));
  });

  it('CA-04.2: calcula estadísticas, ranking, logros e historial', async () => {
    const player = await createPlayer({
      username: 'perfil_uno',
      email: 'perfil1@test.com',
    });
    const rival = await createPlayer({
      username: 'rival',
      email: 'rival@test.com',
      avatarId: DEFAULT_AVATAR_IDS[1],
    });
    await registerMatches(player, rival);

    const response = await request(app)
      .get('/api/users/me/profile')
      .set('Authorization', authHeader(player));

    expect(response.status).toBe(200);
    expect(response.body.stats).toEqual({
      gamesPlayed: 4,
      gamesWon: 2,
      gamesLost: 1,
      gamesDrawn: 1,
      winRate: 50,
      totalPoints: 145,
      averagePoints: 36.3,
      bestScore: 50,
      rankingPoints: 7,
    });

    expect(response.body.ranking).toEqual({
      position: 1,
      totalPlayers: 2,
    });

    const unlocked = response.body.achievements
      .filter((achievement) => achievement.unlocked)
      .map((achievement) => achievement.code)
      .sort();
    expect(unlocked).toEqual(['FIRST_MATCH', 'FIRST_WIN']);
    expect(response.body.achievements).toHaveLength(ACHIEVEMENTS.length);

    expect(response.body.recentMatches.total).toBe(4);
    expect(response.body.recentMatches.items).toHaveLength(4);

    const latest = response.body.recentMatches.items[0];
    expect(latest).toEqual(
      expect.objectContaining({
        matchId: expect.any(String),
        result: 'LOSS',
        finalScore: 10,
        position: 2,
        durationSeconds: 300,
      })
    );
    expect(latest.opponents).toEqual([
      expect.objectContaining({
        id: rival.id,
        username: 'rival',
        avatarUrl: '/static/avatars/2.png',
        finalScore: 20,
      }),
    ]);
  });

  it('un jugador sin partidas ve todo en cero y sin NaN', async () => {
    const player = await createPlayer({
      username: 'nuevo',
      email: 'nuevo@test.com',
    });

    const response = await request(app)
      .get('/api/users/me/profile')
      .set('Authorization', authHeader(player));

    expect(response.status).toBe(200);
    expect(response.body.stats).toEqual({
      gamesPlayed: 0,
      gamesWon: 0,
      gamesLost: 0,
      gamesDrawn: 0,
      winRate: 0,
      totalPoints: 0,
      averagePoints: 0,
      bestScore: 0,
      rankingPoints: 0,
    });
    expect(response.body.recentMatches.items).toEqual([]);
    expect(response.body.ranking.position).toBeGreaterThanOrEqual(1);
    expect(
      response.body.achievements.every((achievement) => !achievement.unlocked)
    ).toBe(true);
  });

  it('los datos persisten entre sesiones', async () => {
    const player = await createPlayer({
      username: 'persistente',
      email: 'persistente@test.com',
    });
    const rival = await createPlayer({
      username: 'rival',
      email: 'rival@test.com',
      avatarId: DEFAULT_AVATAR_IDS[1],
    });
    await createMatch({ playerA: player, playerB: rival, scoreA: 30, scoreB: 20 });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'persistente', password: 'Test1234' });
    expect(login.status).toBe(200);

    const response = await request(app)
      .get('/api/users/me/profile')
      .set('Authorization', `Bearer ${login.body.accessToken}`);

    expect(response.body.stats.gamesPlayed).toBe(1);
    expect(response.body.stats.gamesWon).toBe(1);
    expect(response.body.recentMatches.total).toBe(1);
  });
});

describe('GET /api/users/:id/profile', () => {
  it('muestra el perfil de otro jugador sin datos privados', async () => {
    const viewer = await createPlayer({
      username: 'viewer',
      email: 'viewer@test.com',
    });
    const other = await createPlayer({
      username: 'otro',
      email: 'otro@test.com',
      avatarId: DEFAULT_AVATAR_IDS[1],
    });

    const response = await request(app)
      .get(`/api/users/${other.id}/profile`)
      .set('Authorization', authHeader(viewer));

    expect(response.status).toBe(200);
    expect(response.body.isOwnProfile).toBe(false);
    expect(response.body.user.username).toBe('otro');
    expect(response.body.user).not.toHaveProperty('email');
    expect(response.body.user).not.toHaveProperty('emailVerified');
  });

  it('rechaza ids inexistentes, mal formados y peticiones sin token', async () => {
    const viewer = await createPlayer({
      username: 'viewer',
      email: 'viewer@test.com',
    });

    const missing = await request(app)
      .get('/api/users/00000000-0000-4000-8000-000000000099/profile')
      .set('Authorization', authHeader(viewer));

    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('USER_NOT_FOUND');

    const invalid = await request(app)
      .get('/api/users/no-es-uuid/profile')
      .set('Authorization', authHeader(viewer));

    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
    expect(invalid.body.error.fields.id).toBe(
      'Identificador de jugador inválido'
    );

    const anonymous = await request(app).get(
      `/api/users/${viewer.id}/profile`
    );
    expect(anonymous.status).toBe(401);
  });
});

describe('PATCH /api/users/me', () => {
  it('guarda displayName y bio', async () => {
    const player = await createPlayer({
      username: 'editable',
      email: 'editable@test.com',
    });

    const response = await request(app)
      .patch('/api/users/me')
      .set('Authorization', authHeader(player))
      .send({ displayName: 'El Editable', bio: 'Jugador de prueba' });

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual(
      expect.objectContaining({
        displayName: 'El Editable',
        bio: 'Jugador de prueba',
      })
    );

    const stored = await prisma.user.findUnique({ where: { id: player.id } });
    expect(stored.displayName).toBe('El Editable');
    expect(stored.bio).toBe('Jugador de prueba');

    const reload = await request(app)
      .get('/api/users/me/profile')
      .set('Authorization', authHeader(player));
    expect(reload.body.user.displayName).toBe('El Editable');
  });

  it('valida la biografía demasiado larga y el body vacío', async () => {
    const player = await createPlayer({
      username: 'editable',
      email: 'editable@test.com',
    });

    const tooLong = await request(app)
      .patch('/api/users/me')
      .set('Authorization', authHeader(player))
      .send({ bio: 'x'.repeat(201) });

    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.code).toBe('VALIDATION_ERROR');
    expect(tooLong.body.error.fields.bio).toBe(
      'La biografía debe tener como máximo 200 caracteres'
    );

    const empty = await request(app)
      .patch('/api/users/me')
      .set('Authorization', authHeader(player))
      .send({});

    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe('VALIDATION_ERROR');
  });
});
