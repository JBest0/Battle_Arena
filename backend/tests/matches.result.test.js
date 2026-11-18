const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/infrastructure/prisma');
const { statsService } = require('../src/container');
const {
  clearPlayers,
  createPlayer,
  seedDefaultAvatars,
  tokenFor,
} = require('./helpers/avatarFixtures');

async function createFinishedMatch(a, b, scoreA = 50, scoreB = 30) {
  const endedAt = new Date();
  return prisma.match.create({
    data: {
      startedAt: new Date(endedAt.getTime() - 5 * 60 * 1000),
      endedAt,
      endMode: 'POINTS',
      durationSeconds: 300,
      targetPoints: 100,
      winnerId: scoreA > scoreB ? a.id : scoreB > scoreA ? b.id : null,
      participants: {
        create: [
          { userId: a.id, finalScore: scoreA },
          { userId: b.id, finalScore: scoreB },
        ],
      },
    },
  });
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

describe('GET /api/matches/:id/result', () => {
  it('rechaza peticiones sin participar o sin consolidación', async () => {
    const a = await createPlayer({ username: 'ganador', email: 'ganador@test.com' });
    const b = await createPlayer({ username: 'retador', email: 'retador@test.com' });
    const outsider = await createPlayer({
      username: 'observador',
      email: 'observador@test.com',
    });
    const unverified = await createPlayer({
      username: 'sin_verificar',
      email: 'sin-verificar@test.com',
      verified: false,
    });
    const match = await createFinishedMatch(a, b);

    const pending = await request(app)
      .get(`/api/matches/${match.id}/result`)
      .set('Authorization', `Bearer ${tokenFor(a)}`);
    expect(pending.status).toBe(409);
    expect(pending.body.error.code).toBe('MATCH_NOT_FINISHED');

    const outsiderResponse = await request(app)
      .get(`/api/matches/${match.id}/result`)
      .set('Authorization', `Bearer ${tokenFor(outsider)}`);
    expect(outsiderResponse.status).toBe(403);
    expect(outsiderResponse.body.error.code).toBe('MATCH_NOT_PARTICIPANT');

    const unverifiedResponse = await request(app)
      .get(`/api/matches/${match.id}/result`)
      .set('Authorization', `Bearer ${tokenFor(unverified)}`);
    expect(unverifiedResponse.status).toBe(403);
    expect(unverifiedResponse.body.error.code).toBe('EMAIL_NOT_VERIFIED');

    const anonymous = await request(app).get(`/api/matches/${match.id}/result`);
    expect(anonymous.status).toBe(401);
  });

  it('devuelve ganador, podio, duración y récords persistidos', async () => {
    const a = await createPlayer({ username: 'campeon', email: 'campeon@test.com' });
    const b = await createPlayer({ username: 'segundo', email: 'segundo@test.com' });
    const match = await createFinishedMatch(a, b, 80, 40);

    await statsService.recordMatchResult(match.id);

    const response = await request(app)
      .get(`/api/matches/${match.id}/result`)
      .set('Authorization', `Bearer ${tokenFor(a)}`);

    expect(response.status).toBe(200);
    expect(response.body.matchId).toBe(match.id);
    expect(response.body.durationSeconds).toBe(300);
    expect(response.body.endMode).toBe('POINTS');
    expect(response.body.winner).toEqual(
      expect.objectContaining({
        id: a.id,
        username: 'campeon',
        finalScore: 80,
        position: 1,
        result: 'WIN',
        isPersonalBest: true,
        isGlobalRecord: true,
      })
    );
    expect(response.body.participants.map((participant) => participant.position)).toEqual([
      1,
      2,
    ]);

    const persisted = await prisma.matchParticipant.findMany({
      where: { matchId: match.id },
    });
    expect(persisted.find((participant) => participant.userId === a.id)).toEqual(
      expect.objectContaining({ isPersonalBest: true, isGlobalRecord: true })
    );
  });

  it('devuelve empate sin ganador y valida UUID', async () => {
    const a = await createPlayer({ username: 'empate_a', email: 'empate-a@test.com' });
    const b = await createPlayer({ username: 'empate_b', email: 'empate-b@test.com' });
    const match = await createFinishedMatch(a, b, 50, 50);
    await statsService.recordMatchResult(match.id);

    const response = await request(app)
      .get(`/api/matches/${match.id}/result`)
      .set('Authorization', `Bearer ${tokenFor(b)}`);

    expect(response.status).toBe(200);
    expect(response.body.winner).toBeNull();
    expect(response.body.participants.map((participant) => participant.position)).toEqual([
      1,
      1,
    ]);
    expect(response.body.participants.map((participant) => participant.result)).toEqual([
      'DRAW',
      'DRAW',
    ]);

    const invalid = await request(app)
      .get('/api/matches/not-a-uuid/result')
      .set('Authorization', `Bearer ${tokenFor(a)}`);
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('devuelve 404 para partidas inexistentes', async () => {
    const player = await createPlayer({
      username: 'jugador',
      email: 'jugador@test.com',
    });
    const response = await request(app)
      .get('/api/matches/00000000-0000-4000-8000-000000000099/result')
      .set('Authorization', `Bearer ${tokenFor(player)}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('MATCH_NOT_FOUND');
  });
});
