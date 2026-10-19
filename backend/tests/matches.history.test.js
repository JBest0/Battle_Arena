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

async function createHistory(player, rival, count) {
  const now = Date.now();
  const matches = [];

  for (let index = 1; index <= count; index += 1) {
    const endedAt = new Date(now - index * 60 * 60 * 1000);
    const match = await prisma.match.create({
      data: {
        startedAt: new Date(endedAt.getTime() - 5 * 60 * 1000),
        endedAt,
        endMode: index % 2 === 0 ? 'TIME' : 'POINTS',
        participants: {
          create: [
            { userId: player.id, finalScore: 50 - index },
            { userId: rival.id, finalScore: 10 + index },
          ],
        },
      },
    });
    await statsService.recordMatchResult(match.id);
    matches.push(match);
  }

  return matches;
}

beforeAll(async () => {
  await seedDefaultAvatars();
});

beforeEach(async () => {
  await clearData();
  await prisma.achievement.createMany({ data: ACHIEVEMENTS });
});

afterAll(async () => {
  await clearData();
  await prisma.$disconnect();
});

describe('GET /api/users/:id/matches', () => {
  it('pagina de la partida más reciente a la más antigua', async () => {
    const player = await createPlayer({
      username: 'historial',
      email: 'historial@test.com',
    });
    const rival = await createPlayer({
      username: 'rival',
      email: 'rival@test.com',
      avatarId: DEFAULT_AVATAR_IDS[1],
    });
    const matches = await createHistory(player, rival, 12);

    const firstPage = await request(app)
      .get(`/api/users/${player.id}/matches?page=1&pageSize=5`)
      .set('Authorization', `Bearer ${tokenFor(player)}`);

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.total).toBe(12);
    expect(firstPage.body.page).toBe(1);
    expect(firstPage.body.pageSize).toBe(5);
    expect(firstPage.body.items).toHaveLength(5);
    expect(firstPage.body.items[0].matchId).toBe(matches[0].id);

    const secondPage = await request(app)
      .get(`/api/users/${player.id}/matches?page=2&pageSize=5`)
      .set('Authorization', `Bearer ${tokenFor(player)}`);

    expect(secondPage.status).toBe(200);
    expect(secondPage.body.total).toBe(12);
    expect(secondPage.body.items).toHaveLength(5);
    expect(secondPage.body.items[0].matchId).toBe(matches[5].id);

    const timestamps = secondPage.body.items.map((item) =>
      new Date(item.endedAt).getTime()
    );
    expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
  });

  it('cada partida trae rivales, resultado, posición y duración', async () => {
    const player = await createPlayer({
      username: 'historial',
      email: 'historial@test.com',
    });
    const rival = await createPlayer({
      username: 'rival',
      email: 'rival@test.com',
      avatarId: DEFAULT_AVATAR_IDS[1],
    });
    await createHistory(player, rival, 2);

    const response = await request(app)
      .get(`/api/users/${player.id}/matches`)
      .set('Authorization', `Bearer ${tokenFor(player)}`);

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(2);

    const [latest] = response.body.items;
    expect(latest).toEqual(
      expect.objectContaining({
        result: 'WIN',
        finalScore: 49,
        position: 1,
        durationSeconds: 300,
        endMode: 'POINTS',
      })
    );
    expect(latest.opponents).toEqual([
      {
        id: rival.id,
        username: 'rival',
        avatarUrl: '/static/avatars/2.png',
        finalScore: 11,
      },
    ]);
    expect(latest.opponents.some((opponent) => opponent.id === player.id)).toBe(
      false
    );
  });
});
