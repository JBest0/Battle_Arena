const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/infrastructure/prisma');
const {
  statsRepository,
  statsService,
} = require('../src/container');
const {
  clearPlayers,
  createPlayer,
  seedDefaultAvatars,
  tokenFor,
} = require('./helpers/avatarFixtures');

async function setStats(playerId, stats) {
  return prisma.playerStats.update({ where: { userId: playerId }, data: stats });
}

async function createFinishedMatch(scores) {
  const endedAt = new Date();
  const match = await prisma.match.create({
    data: {
      startedAt: new Date(endedAt.getTime() - 5 * 60 * 1000),
      endedAt,
      endMode: 'POINTS',
      participants: {
        create: scores.map(([player, finalScore]) => ({
          userId: player.id,
          finalScore,
        })),
      },
    },
  });

  return match;
}

async function createRankedPlayers(count, prefix = 'jugador') {
  const players = [];
  for (let index = 1; index <= count; index += 1) {
    const player = await createPlayer({
      username: `${prefix}${String(index).padStart(2, '0')}`,
      email: `${prefix}${index}@test.com`,
    });
    await setStats(player.id, { rankingPoints: count - index });
    players.push(player);
  }
  return players;
}

function rankingRequest(token, query = '') {
  return request(app)
    .get(`/api/ranking${query}`)
    .set('Authorization', `Bearer ${token}`);
}

beforeAll(async () => {
  await seedDefaultAvatars();
});

beforeEach(async () => {
  await clearPlayers();
});

afterAll(async () => {
  await clearPlayers();
  await prisma.$disconnect();
});

describe('GET /api/ranking', () => {
  it('ordena por puntos, victorias y nombre de usuario', async () => {
    const viewer = await createPlayer({
      username: 'viewer',
      email: 'viewer@test.com',
    });
    const a = await createPlayer({ username: 'aa', email: 'aa@test.com' });
    const b = await createPlayer({ username: 'bb', email: 'bb@test.com' });
    const c = await createPlayer({ username: 'cc', email: 'cc@test.com' });
    const d = await createPlayer({ username: 'dd', email: 'dd@test.com' });

    await setStats(a.id, { rankingPoints: 10, gamesWon: 2 });
    await setStats(b.id, { rankingPoints: 10, gamesWon: 3 });
    await setStats(c.id, { rankingPoints: 10, gamesWon: 2 });
    await setStats(d.id, { rankingPoints: 5, gamesWon: 10 });
    await setStats(viewer.id, { rankingPoints: 0, gamesWon: 0 });

    const response = await rankingRequest(tokenFor(viewer));

    expect(response.status).toBe(200);
    expect(response.body.totalPlayers).toBe(5);
    expect(response.body.items.map((item) => item.username)).toEqual([
      'bb',
      'aa',
      'cc',
      'dd',
      'viewer',
    ]);
    expect(response.body.items.map((item) => item.position)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(response.body.items[0]).toEqual(
      expect.objectContaining({
        userId: b.id,
        rankingPoints: 10,
        gamesWon: 3,
        gamesPlayed: 0,
      })
    );
  });

  it('usa limit 10 por defecto y respeta limit=2', async () => {
    const viewer = await createPlayer({
      username: 'viewer',
      email: 'viewer@test.com',
    });
    for (let index = 1; index <= 11; index += 1) {
      const player = await createPlayer({
        username: `jugador${String(index).padStart(2, '0')}`,
        email: `jugador${index}@test.com`,
      });
      await setStats(player.id, { rankingPoints: index });
    }

    const defaultLimit = await rankingRequest(tokenFor(viewer));
    expect(defaultLimit.body.items).toHaveLength(10);
    expect(defaultLimit.body.totalPlayers).toBe(12);

    const limited = await rankingRequest(tokenFor(viewer), '?limit=2');
    expect(limited.body.items).toHaveLength(2);
  });

  it('rechaza límites fuera de rango', async () => {
    const viewer = await createPlayer({
      username: 'viewer',
      email: 'viewer@test.com',
    });
    const token = tokenFor(viewer);

    for (const limit of ['0', '100', 'abc']) {
      const response = await rankingRequest(token, `?limit=${limit}`);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('getRankingPosition coincide con la posición del top', async () => {
    const players = [];
    for (let index = 1; index <= 5; index += 1) {
      const player = await createPlayer({
        username: `pos${index}`,
        email: `pos${index}@test.com`,
      });
      await setStats(player.id, {
        rankingPoints: index,
        gamesWon: index % 2,
      });
      players.push(player);
    }

    const top = await statsRepository.getTopRanking(50);
    const positions = new Map(
      top.map((entry) => [entry.userId, entry.position])
    );

    for (const player of players) {
      expect(await statsRepository.getRankingPosition(player.id)).toBe(
        positions.get(player.id)
      );
    }
  });
});

describe('GET /api/ranking (US-27)', () => {
  it('CA-27.2 incluye a todos los jugadores registrados, también sin partidas', async () => {
    const viewer = await createPlayer({
      username: 'viewer',
      email: 'viewer@test.com',
    });
    const veteran = await createPlayer({
      username: 'veterano',
      email: 'veterano@test.com',
    });
    const rookie = await createPlayer({
      username: 'novato',
      email: 'novato@test.com',
    });
    await prisma.playerStats.delete({ where: { userId: rookie.id } });

    const match = await createFinishedMatch([
      [veteran, 30],
      [viewer, 10],
    ]);
    await statsService.recordMatchResult(match.id);

    const response = await rankingRequest(tokenFor(viewer), '?page=1');

    expect(response.status).toBe(200);
    expect(response.body.totalPlayers).toBe(3);
    expect(response.body.items.map((item) => item.userId).sort()).toEqual(
      [viewer.id, veteran.id, rookie.id].sort()
    );
    const rookieEntry = response.body.items.find(
      (item) => item.userId === rookie.id
    );
    expect(rookieEntry).toEqual(
      expect.objectContaining({ rankingPoints: 0, gamesPlayed: 0, gamesWon: 0 })
    );
  });

  it('CA-27.3 cada entrada trae posición, username y la métrica', async () => {
    const viewer = await createPlayer({
      username: 'viewer',
      email: 'viewer@test.com',
    });
    await setStats(viewer.id, { rankingPoints: 4 });

    const response = await rankingRequest(tokenFor(viewer), '?page=1&pageSize=5');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        totalPlayers: 1,
        page: 1,
        pageSize: 5,
        metric: { key: 'rankingPoints', label: 'Puntos de ranking' },
      })
    );
    expect(response.body.items[0]).toEqual({
      userId: viewer.id,
      username: 'viewer',
      avatarUrl: '/static/avatars/1.png',
      rankingPoints: 4,
      gamesPlayed: 0,
      gamesWon: 0,
      position: 1,
    });
  });

  it('CA-27.4 tras recordMatchResult el ranking cambia sin reiniciar nada', async () => {
    const a = await createPlayer({ username: 'alfa', email: 'alfa@test.com' });
    const b = await createPlayer({ username: 'beta', email: 'beta@test.com' });
    const token = tokenFor(a);

    const before = await rankingRequest(token, '?page=1');
    expect(before.body.items.map((item) => item.username)).toEqual([
      'alfa',
      'beta',
    ]);

    const match = await createFinishedMatch([
      [a, 5],
      [b, 20],
    ]);
    await statsService.recordMatchResult(match.id);

    const after = await rankingRequest(token, '?page=1');
    expect(after.body.items.map((item) => item.username)).toEqual([
      'beta',
      'alfa',
    ]);
    expect(after.body.items[0]).toEqual(
      expect.objectContaining({ rankingPoints: 3, gamesWon: 1, gamesPlayed: 1 })
    );
  });

  it('CA-27.5/27.6 ordena por puntos, luego victorias y luego username', async () => {
    const viewer = await createPlayer({
      username: 'zz_viewer',
      email: 'viewer@test.com',
    });
    const a = await createPlayer({ username: 'carla', email: 'carla@test.com' });
    const b = await createPlayer({ username: 'bruno', email: 'bruno@test.com' });
    const c = await createPlayer({ username: 'ana', email: 'ana@test.com' });
    const d = await createPlayer({ username: 'diego', email: 'diego@test.com' });

    await setStats(a.id, { rankingPoints: 9, gamesWon: 3 });
    await setStats(b.id, { rankingPoints: 9, gamesWon: 2 });
    await setStats(c.id, { rankingPoints: 9, gamesWon: 2 });
    await setStats(d.id, { rankingPoints: 12, gamesWon: 0 });

    const response = await rankingRequest(tokenFor(viewer), '?page=1');

    expect(response.body.items.map((item) => item.username)).toEqual([
      'diego',
      'carla',
      'ana',
      'bruno',
      'zz_viewer',
    ]);
  });

  it('paginación: la página 2 continúa las posiciones de la página 1', async () => {
    const players = await createRankedPlayers(7);
    const token = tokenFor(players[0]);

    const first = await rankingRequest(token, '?page=1&pageSize=3');
    const second = await rankingRequest(token, '?page=2&pageSize=3');
    const third = await rankingRequest(token, '?page=3&pageSize=3');

    expect(first.body.items.map((item) => item.position)).toEqual([1, 2, 3]);
    expect(second.status).toBe(200);
    expect(second.body.page).toBe(2);
    expect(second.body.items.map((item) => item.position)).toEqual([4, 5, 6]);
    expect(second.body.items.map((item) => item.username)).toEqual([
      'jugador04',
      'jugador05',
      'jugador06',
    ]);
    expect(third.body.items.map((item) => item.position)).toEqual([7]);
    expect(third.body.totalPlayers).toBe(7);
  });

  it('paginación: pageSize por defecto es 20 y el máximo es 100', async () => {
    const players = await createRankedPlayers(22);
    const token = tokenFor(players[0]);

    const defaults = await rankingRequest(token, '?page=1');
    expect(defaults.body.pageSize).toBe(20);
    expect(defaults.body.items).toHaveLength(20);

    const onlyPageSize = await rankingRequest(token, '?pageSize=100');
    expect(onlyPageSize.status).toBe(200);
    expect(onlyPageSize.body.page).toBe(1);
    expect(onlyPageSize.body.items).toHaveLength(22);

    for (const query of ['?pageSize=101', '?pageSize=0', '?page=0', '?page=abc']) {
      const response = await rankingRequest(token, query);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('paginación: una página fuera de rango devuelve items vacíos', async () => {
    const players = await createRankedPlayers(3);

    const response = await rankingRequest(tokenFor(players[0]), '?page=5&pageSize=10');

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([]);
    expect(response.body.totalPlayers).toBe(3);
    expect(response.body.page).toBe(5);
  });

  it('paginación: el parámetro heredado limit conserva la forma anterior', async () => {
    const players = await createRankedPlayers(4);

    const response = await rankingRequest(tokenFor(players[0]), '?limit=2');

    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual(['items', 'totalPlayers']);
    expect(response.body.items.map((item) => item.position)).toEqual([1, 2]);
    expect(response.body.totalPlayers).toBe(4);
  });

  it('paginación: limit junto con page o pageSize devuelve 400', async () => {
    const players = await createRankedPlayers(2);
    const token = tokenFor(players[0]);

    for (const query of ['?limit=5&page=1', '?limit=5&pageSize=10']) {
      const response = await rankingRequest(token, query);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.fields.limit).toBe(
        'No se puede combinar limit con page o pageSize'
      );
    }
  });

  it('CA-27.7 los datos se leen de PostgreSQL', async () => {
    const viewer = await createPlayer({
      username: 'viewer',
      email: 'viewer@test.com',
    });
    const token = tokenFor(viewer);

    const initial = await rankingRequest(token, '?page=1');
    expect(initial.body.items[0].rankingPoints).toBe(0);

    await prisma.playerStats.update({
      where: { userId: viewer.id },
      data: { rankingPoints: 42, gamesWon: 14, gamesPlayed: 14 },
    });
    await createPlayer({ username: 'recien', email: 'recien@test.com' });

    const reloaded = await rankingRequest(token, '?page=1');
    expect(reloaded.body.totalPlayers).toBe(2);
    expect(reloaded.body.items[0]).toEqual(
      expect.objectContaining({
        userId: viewer.id,
        rankingPoints: 42,
        gamesWon: 14,
        position: 1,
      })
    );
  });

  it('CA-27.8 registrar dos veces la misma partida no cambia el ranking', async () => {
    const a = await createPlayer({ username: 'alfa', email: 'alfa@test.com' });
    const b = await createPlayer({ username: 'beta', email: 'beta@test.com' });
    const match = await createFinishedMatch([
      [a, 30],
      [b, 10],
    ]);
    const token = tokenFor(a);

    await statsService.recordMatchResult(match.id);
    const once = await rankingRequest(token, '?page=1');

    const second = await statsService.recordMatchResult(match.id);
    expect(second.alreadyRecorded).toBe(true);
    const twice = await rankingRequest(token, '?page=1');

    expect(twice.body).toEqual(once.body);
    expect(twice.body.items[0]).toEqual(
      expect.objectContaining({ userId: a.id, rankingPoints: 3, gamesPlayed: 1 })
    );
  });

  it('CA-27.9 el ranking es coherente con match_participants', async () => {
    const a = await createPlayer({ username: 'alfa', email: 'alfa@test.com' });
    const b = await createPlayer({ username: 'beta', email: 'beta@test.com' });
    const c = await createPlayer({ username: 'gama', email: 'gama@test.com' });

    const games = [
      [[a, 30], [b, 10], [c, 5]],
      [[a, 20], [b, 20], [c, 1]],
      [[a, 0], [b, 5], [c, 40]],
      [[b, 15], [c, 15]],
    ];
    for (const scores of games) {
      const match = await createFinishedMatch(scores);
      await statsService.recordMatchResult(match.id);
    }

    const response = await rankingRequest(tokenFor(a), '?page=1');

    for (const entry of response.body.items) {
      const rows = await prisma.matchParticipant.findMany({
        where: { userId: entry.userId, match: { endedAt: { not: null } } },
      });
      const wins = rows.filter((row) => row.result === 'WIN').length;
      const draws = rows.filter((row) => row.result === 'DRAW').length;

      expect(entry.rankingPoints).toBe(3 * wins + draws);
      expect(entry.gamesWon).toBe(wins);
      expect(entry.gamesPlayed).toBe(rows.length);
    }
  });

  it('sin token responde 401', async () => {
    const response = await request(app).get('/api/ranking?page=1');

    expect(response.status).toBe(401);
  });

  it('las rutas de escritura sobre /api/ranking responden 404', async () => {
    const viewer = await createPlayer({
      username: 'viewer',
      email: 'viewer@test.com',
    });
    const token = tokenFor(viewer);

    for (const method of ['post', 'put', 'patch', 'delete']) {
      const response = await request(app)[method]('/api/ranking')
        .set('Authorization', `Bearer ${token}`)
        .send({ rankingPoints: 999 });
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    }
  });
});
