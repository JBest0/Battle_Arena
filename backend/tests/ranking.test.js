const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/infrastructure/prisma');
const {
  statsRepository,
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
