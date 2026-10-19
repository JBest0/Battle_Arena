const bcrypt = require('bcrypt');
const { prisma } = require('../src/infrastructure/prisma');
const { statsService } = require('../src/container');
const {
  AchievementEvaluator,
} = require('../src/modules/stats/achievements/AchievementEvaluator');
const { rules } = require('../src/modules/stats/achievements/rules');

const DEFAULT_AVATAR_ID = '00000000-0000-4000-8000-000000000001';
const PASSWORD = 'Test1234';

const ACHIEVEMENTS = [
  { code: 'FIRST_MATCH', name: 'Primera partida', description: 'Juega 1' },
  { code: 'FIRST_WIN', name: 'Primera victoria', description: 'Gana 1' },
  { code: 'TEN_MATCHES', name: 'Veterano', description: 'Juega 10' },
  { code: 'HIGH_SCORE', name: 'Gran puntaje', description: '100 puntos' },
  { code: 'THREE_WINS', name: 'Racha de campeón', description: 'Gana 3' },
];

let passwordHash;

async function clearData() {
  await prisma.matchParticipant.deleteMany();
  await prisma.match.deleteMany();
  await prisma.userAchievement.deleteMany();
  await prisma.achievement.deleteMany();
  await prisma.playerStats.deleteMany();
  await prisma.emailVerificationToken.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.user.deleteMany();
}

async function createPlayer(username) {
  return prisma.user.create({
    data: {
      username,
      email: `${username}@test.com`,
      passwordHash,
      emailVerified: true,
      avatarId: DEFAULT_AVATAR_ID,
      stats: { create: {} },
    },
  });
}

async function seedAchievements() {
  await prisma.achievement.createMany({ data: ACHIEVEMENTS });
}

async function createMatch({
  playerA,
  playerB,
  scoreA,
  scoreB,
  endedAt = new Date(),
  startedAt = new Date(Date.now() - 10 * 60 * 1000),
  endMode = 'POINTS',
}) {
  return prisma.match.create({
    data: {
      startedAt,
      endedAt,
      endMode,
      participants: {
        create: [
          { userId: playerA.id, finalScore: scoreA },
          { userId: playerB.id, finalScore: scoreB },
        ],
      },
    },
  });
}

function statsOf(playerId) {
  return prisma.playerStats.findUnique({ where: { userId: playerId } });
}

beforeAll(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, 4);
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
  await seedAchievements();
});

afterAll(async () => {
  await clearData();
  await prisma.$disconnect();
});

describe('StatsService.recordMatchResult', () => {
  it('registra victoria y derrota con puntos y posiciones', async () => {
    const a = await createPlayer('jugador_a');
    const b = await createPlayer('jugador_b');
    const match = await createMatch({
      playerA: a,
      playerB: b,
      scoreA: 50,
      scoreB: 30,
    });

    const result = await statsService.recordMatchResult(match.id);

    expect(result.alreadyRecorded).toBe(false);

    const resultA = result.results.find((item) => item.userId === a.id);
    const resultB = result.results.find((item) => item.userId === b.id);

    expect(resultA).toEqual({ userId: a.id, result: 'WIN', position: 1 });
    expect(resultB).toEqual({ userId: b.id, result: 'LOSS', position: 2 });

    const statsA = await statsOf(a.id);
    expect(statsA).toMatchObject({
      gamesPlayed: 1,
      gamesWon: 1,
      totalPoints: 50,
      bestScore: 50,
      rankingPoints: 3,
    });

    const statsB = await statsOf(b.id);
    expect(statsB).toMatchObject({
      gamesPlayed: 1,
      gamesWon: 0,
      totalPoints: 30,
      bestScore: 30,
      rankingPoints: 0,
    });
  });

  it('registra un empate en el primer lugar como DRAW para ambos', async () => {
    const a = await createPlayer('jugador_a');
    const b = await createPlayer('jugador_b');
    const match = await createMatch({
      playerA: a,
      playerB: b,
      scoreA: 40,
      scoreB: 40,
    });

    const result = await statsService.recordMatchResult(match.id);

    for (const item of result.results) {
      expect(item.result).toBe('DRAW');
      expect(item.position).toBe(1);
    }

    const statsA = await statsOf(a.id);
    const statsB = await statsOf(b.id);
    expect(statsA).toMatchObject({ gamesWon: 0, rankingPoints: 1 });
    expect(statsB).toMatchObject({ gamesWon: 0, rankingPoints: 1 });
  });

  it('es idempotente: la segunda llamada no duplica estadísticas', async () => {
    const a = await createPlayer('jugador_a');
    const b = await createPlayer('jugador_b');
    const match = await createMatch({
      playerA: a,
      playerB: b,
      scoreA: 50,
      scoreB: 30,
    });

    await statsService.recordMatchResult(match.id);
    const second = await statsService.recordMatchResult(match.id);

    expect(second).toEqual({ alreadyRecorded: true });

    const statsA = await statsOf(a.id);
    expect(statsA.gamesPlayed).toBe(1);
    expect(statsA.gamesWon).toBe(1);
    expect(statsA.totalPoints).toBe(50);
    expect(statsA.rankingPoints).toBe(3);
  });

  it('desbloquea logros y no los duplica al repetir', async () => {
    const a = await createPlayer('jugador_a');
    const b = await createPlayer('jugador_b');
    const match = await createMatch({
      playerA: a,
      playerB: b,
      scoreA: 50,
      scoreB: 30,
    });

    const result = await statsService.recordMatchResult(match.id);

    expect(result.unlocked[a.id]).toEqual(
      expect.arrayContaining(['FIRST_MATCH', 'FIRST_WIN'])
    );
    expect(result.unlocked[b.id]).toEqual(['FIRST_MATCH']);

    const unlockedA = await prisma.userAchievement.findMany({
      where: { userId: a.id },
      include: { achievement: true },
    });
    const codes = unlockedA.map((item) => item.achievement.code);
    expect(codes).toEqual(expect.arrayContaining(['FIRST_MATCH', 'FIRST_WIN']));

    await statsService.recordMatchResult(match.id);

    const count = await prisma.userAchievement.count({ where: { userId: a.id } });
    expect(count).toBe(unlockedA.length);
  });

  it('desbloquea HIGH_SCORE con 100 puntos o más', async () => {
    const a = await createPlayer('jugador_a');
    const b = await createPlayer('jugador_b');
    const match = await createMatch({
      playerA: a,
      playerB: b,
      scoreA: 100,
      scoreB: 10,
    });

    const result = await statsService.recordMatchResult(match.id);

    expect(result.unlocked[a.id]).toEqual(
      expect.arrayContaining(['HIGH_SCORE'])
    );
    expect(result.unlocked[b.id]).not.toEqual(
      expect.arrayContaining(['HIGH_SCORE'])
    );
  });

  it('rechaza partidas sin terminar e inexistentes', async () => {
    const a = await createPlayer('jugador_a');
    const b = await createPlayer('jugador_b');
    const match = await createMatch({
      playerA: a,
      playerB: b,
      scoreA: 10,
      scoreB: 5,
      endedAt: null,
    });

    await expect(statsService.recordMatchResult(match.id)).rejects.toMatchObject(
      { status: 409, code: 'MATCH_NOT_FINISHED' }
    );

    await expect(
      statsService.recordMatchResult('00000000-0000-4000-8000-000000000099')
    ).rejects.toMatchObject({ status: 404, code: 'MATCH_NOT_FOUND' });
  });
});

describe('AchievementEvaluator', () => {
  it('evalúa las reglas con estadísticas inventadas, sin base de datos', () => {
    const evaluator = new AchievementEvaluator(rules);

    expect(
      evaluator.evaluate({ gamesPlayed: 0, gamesWon: 0, bestScore: 0 })
    ).toEqual([]);

    expect(
      evaluator.evaluate({ gamesPlayed: 10, gamesWon: 3, bestScore: 100 })
    ).toEqual(
      expect.arrayContaining([
        'FIRST_MATCH',
        'FIRST_WIN',
        'TEN_MATCHES',
        'HIGH_SCORE',
        'THREE_WINS',
      ])
    );
  });

  it('acepta reglas inyectadas por constructor', () => {
    const evaluator = new AchievementEvaluator([
      { code: 'RICHI', isUnlocked: (stats) => stats.totalPoints > 10 },
    ]);

    expect(evaluator.evaluate({ totalPoints: 11 })).toEqual(['RICHI']);
    expect(evaluator.evaluate({ totalPoints: 10 })).toEqual([]);
  });
});
