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

describe('GET /api/users/:id/matches (US-28)', () => {
  async function createMatchWith(scores, { endedAt = new Date(), record = true } = {}) {
    const match = await prisma.match.create({
      data: {
        startedAt: new Date(endedAt.getTime() - 3 * 60 * 1000),
        endedAt,
        endMode: 'TIME',
        participants: {
          create: scores.map(([player, finalScore]) => ({
            userId: player.id,
            finalScore,
          })),
        },
      },
    });
    if (record) {
      await statsService.recordMatchResult(match.id);
    }
    return match;
  }

  function historyRequest(player, viewer = player, query = '') {
    return request(app)
      .get(`/api/users/${player.id}/matches${query}`)
      .set('Authorization', `Bearer ${tokenFor(viewer)}`);
  }

  async function players(count) {
    const list = [];
    for (let index = 1; index <= count; index += 1) {
      list.push(
        await createPlayer({
          username: `p${index}`,
          email: `p${index}@test.com`,
          avatarId: DEFAULT_AVATAR_IDS[(index - 1) % DEFAULT_AVATAR_IDS.length],
        })
      );
    }
    return list;
  }

  it('CA-28.1/28.2 una partida finalizada queda registrada con todos los campos', async () => {
    const [me, rival] = await players(2);
    const match = await createMatchWith([
      [me, 25],
      [rival, 15],
    ]);

    const response = await historyRequest(me);

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    const [item] = response.body.items;
    expect(item).toEqual(
      expect.objectContaining({
        matchId: match.id,
        startedAt: match.startedAt.toISOString(),
        endedAt: match.endedAt.toISOString(),
        durationSeconds: 180,
        endMode: 'TIME',
        result: 'WIN',
        position: 1,
        finalScore: 25,
      })
    );
    expect(item.opponents).toEqual([
      {
        id: rival.id,
        username: 'p2',
        avatarUrl: '/static/avatars/2.png',
        finalScore: 15,
      },
    ]);
    expect(item.participants).toEqual([
      {
        id: me.id,
        username: 'p1',
        avatarUrl: '/static/avatars/1.png',
        finalScore: 25,
        position: 1,
        result: 'WIN',
      },
      {
        id: rival.id,
        username: 'p2',
        avatarUrl: '/static/avatars/2.png',
        finalScore: 15,
        position: 2,
        result: 'LOSS',
      },
    ]);
  });

  it('CA-28.3 el historial de un usuario solo contiene sus partidas finalizadas', async () => {
    const [me, rival, other, another] = await players(4);
    const mine = await createMatchWith([
      [me, 10],
      [rival, 5],
    ]);
    await createMatchWith([
      [other, 10],
      [another, 5],
    ]);
    // Partida en curso: no tiene endedAt y no debe aparecer.
    await prisma.match.create({
      data: {
        startedAt: new Date(),
        endMode: 'POINTS',
        participants: { create: [{ userId: me.id }, { userId: other.id }] },
      },
    });

    const response = await historyRequest(me);

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items.map((item) => item.matchId)).toEqual([mine.id]);
    for (const item of response.body.items) {
      expect(item.participants.map((p) => p.id)).toContain(me.id);
    }
  });

  it('partida con 3 o más participantes: posiciones y puntajes correctos', async () => {
    const [me, b, c, d] = await players(4);
    await createMatchWith([
      [me, 20],
      [b, 40],
      [c, 20],
      [d, 5],
    ]);

    const response = await historyRequest(me);
    const [item] = response.body.items;

    expect(item).toEqual(
      expect.objectContaining({ result: 'LOSS', position: 2, finalScore: 20 })
    );
    expect(item.opponents).toHaveLength(3);
    expect(
      item.participants.map(({ username, finalScore, position, result }) => ({
        username,
        finalScore,
        position,
        result,
      }))
    ).toEqual([
      { username: 'p2', finalScore: 40, position: 1, result: 'WIN' },
      { username: 'p1', finalScore: 20, position: 2, result: 'LOSS' },
      { username: 'p3', finalScore: 20, position: 2, result: 'LOSS' },
      { username: 'p4', finalScore: 5, position: 4, result: 'LOSS' },
    ]);
  });

  it('CA-28.8 procesar dos veces la misma finalización no duplica historial ni estadísticas', async () => {
    const [me, rival] = await players(2);
    const match = await createMatchWith([
      [me, 30],
      [rival, 10],
    ]);

    const second = await statsService.recordMatchResult(match.id);
    expect(second.alreadyRecorded).toBe(true);

    const history = await historyRequest(me);
    expect(history.body.total).toBe(1);
    expect(history.body.items).toHaveLength(1);

    const stats = await prisma.playerStats.findUnique({
      where: { userId: me.id },
    });
    expect(stats).toEqual(
      expect.objectContaining({
        gamesPlayed: 1,
        gamesWon: 1,
        totalPoints: 30,
        rankingPoints: 3,
      })
    );
  });

  it('paginación: orden, páginas fuera de rango y pageSize máximo 50', async () => {
    const [me, rival] = await players(2);
    const now = Date.now();
    for (let index = 0; index < 3; index += 1) {
      await createMatchWith(
        [
          [me, 10 + index],
          [rival, 5],
        ],
        { endedAt: new Date(now - index * 60 * 1000) }
      );
    }

    const all = await historyRequest(me, me, '?page=1&pageSize=50');
    expect(all.status).toBe(200);
    expect(all.body.items.map((item) => item.finalScore)).toEqual([10, 11, 12]);

    const outOfRange = await historyRequest(me, me, '?page=9&pageSize=10');
    expect(outOfRange.status).toBe(200);
    expect(outOfRange.body.items).toEqual([]);
    expect(outOfRange.body.total).toBe(3);

    for (const query of ['?pageSize=51', '?pageSize=0', '?page=0', '?page=x']) {
      const response = await historyRequest(me, me, query);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('CA-28.9 POST/PUT/PATCH/DELETE sobre /api/users/:id/matches responden 404', async () => {
    const [me, rival] = await players(2);
    await createMatchWith([
      [me, 30],
      [rival, 10],
    ]);

    for (const method of ['post', 'put', 'patch', 'delete']) {
      const response = await request(app)[method](`/api/users/${me.id}/matches`)
        .set('Authorization', `Bearer ${tokenFor(me)}`)
        .send({ result: 'WIN', finalScore: 999 });
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    }

    const history = await historyRequest(me);
    expect(history.body.items[0].finalScore).toBe(30);
  });

  it('sin token responde 401', async () => {
    const [me] = await players(1);

    const response = await request(app).get(`/api/users/${me.id}/matches`);

    expect(response.status).toBe(401);
  });
});
