const bcrypt = require('bcrypt');
const { prisma } = require('../src/infrastructure/prisma');
const { UnitOfWork } = require('../src/infrastructure/UnitOfWork');
const {
  StatsRepository,
} = require('../src/modules/stats/stats.repository');
const {
  MatchRepository,
} = require('../src/modules/stats/match.repository');
const { StatsService } = require('../src/modules/stats/stats.service');
const {
  AchievementEvaluator,
} = require('../src/modules/stats/achievements/AchievementEvaluator');
const { rules } = require('../src/modules/stats/achievements/rules');

const statsService = new StatsService({
  statsRepository: new StatsRepository(prisma),
  matchRepository: new MatchRepository(prisma),
  achievementEvaluator: new AchievementEvaluator(rules),
  unitOfWork: new UnitOfWork(prisma),
});

const AVATARS = [
  { id: '00000000-0000-4000-8000-000000000001', url: '/static/avatars/1.png' },
  { id: '00000000-0000-4000-8000-000000000002', url: '/static/avatars/2.png' },
  { id: '00000000-0000-4000-8000-000000000003', url: '/static/avatars/3.png' },
  { id: '00000000-0000-4000-8000-000000000004', url: '/static/avatars/4.png' },
  { id: '00000000-0000-4000-8000-000000000005', url: '/static/avatars/5.png' },
];

const ACHIEVEMENTS = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    code: 'FIRST_MATCH',
    name: 'Primera partida',
    description: 'Juega tu primera partida en la arena.',
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    code: 'FIRST_WIN',
    name: 'Primera victoria',
    description: 'Gana tu primera partida.',
  },
  {
    id: '00000000-0000-4000-8000-000000000103',
    code: 'TEN_MATCHES',
    name: 'Veterano',
    description: 'Completa diez partidas.',
  },
  {
    id: '00000000-0000-4000-8000-000000000104',
    code: 'HIGH_SCORE',
    name: 'Gran puntaje',
    description: 'Consigue 100 puntos o más en una partida.',
  },
  {
    id: '00000000-0000-4000-8000-000000000105',
    code: 'THREE_WINS',
    name: 'Racha de campeón',
    description: 'Gana tres partidas.',
  },
];

const USERS = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    username: 'jugador1',
    email: 'jugador1@test.com',
    displayName: 'Jugador Uno',
    bio: 'Primer jugador de la arena.',
    avatarId: AVATARS[0].id,
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    username: 'jugador2',
    email: 'jugador2@test.com',
    displayName: 'Jugador Dos',
    bio: 'Siempre listo para el siguiente reto.',
    avatarId: AVATARS[1].id,
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    username: 'jugador3',
    email: 'jugador3@test.com',
    displayName: 'Jugador Tres',
    bio: null,
    avatarId: AVATARS[2].id,
  },
];

// jugador1 gana 2, jugador2 gana 1 y hay 1 empate.
const MATCHES = [
  {
    id: '20000000-0000-4000-8000-000000000001',
    startedAt: new Date('2026-10-12T18:00:00.000Z'),
    endedAt: new Date('2026-10-12T18:05:30.000Z'),
    endMode: 'TIME',
    winnerId: USERS[0].id,
    participants: [
      { userId: USERS[0].id, finalScore: 50 },
      { userId: USERS[1].id, finalScore: 30 },
    ],
  },
  {
    id: '20000000-0000-4000-8000-000000000002',
    startedAt: new Date('2026-10-14T20:00:00.000Z'),
    endedAt: new Date('2026-10-14T20:07:15.000Z'),
    endMode: 'POINTS',
    winnerId: null,
    participants: [
      { userId: USERS[0].id, finalScore: 40 },
      { userId: USERS[1].id, finalScore: 40 },
    ],
  },
  {
    id: '20000000-0000-4000-8000-000000000003',
    startedAt: new Date('2026-10-16T19:30:00.000Z'),
    endedAt: new Date('2026-10-16T19:36:00.000Z'),
    endMode: 'TIME',
    winnerId: USERS[1].id,
    participants: [
      { userId: USERS[0].id, finalScore: 35 },
      { userId: USERS[1].id, finalScore: 45 },
    ],
  },
  {
    id: '20000000-0000-4000-8000-000000000004',
    startedAt: new Date('2026-10-18T17:15:00.000Z'),
    endedAt: new Date('2026-10-18T17:23:00.000Z'),
    endMode: 'POINTS',
    winnerId: USERS[0].id,
    participants: [
      { userId: USERS[0].id, finalScore: 60 },
      { userId: USERS[1].id, finalScore: 20 },
    ],
  },
];

async function seedAvatars() {
  for (const avatar of AVATARS) {
    await prisma.avatar.upsert({
      where: { id: avatar.id },
      update: { type: 'DEFAULT', url: avatar.url, ownerId: null },
      create: { id: avatar.id, type: 'DEFAULT', url: avatar.url },
    });
  }
}

async function seedAchievements() {
  for (const achievement of ACHIEVEMENTS) {
    await prisma.achievement.upsert({
      where: { code: achievement.code },
      update: {
        name: achievement.name,
        description: achievement.description,
      },
      create: achievement,
    });
  }
}

async function seedUsers() {
  const passwordHash = await bcrypt.hash('Test1234', 10);

  for (const user of USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        username: user.username,
        passwordHash,
        emailVerified: true,
        avatarId: user.avatarId,
      },
      create: {
        id: user.id,
        username: user.username,
        email: user.email,
        passwordHash,
        emailVerified: true,
        displayName: user.displayName,
        bio: user.bio,
        avatarId: user.avatarId,
      },
    });

    // Las estadísticas se crean en cero y solo las modifica recordMatchResult.
    await prisma.playerStats.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });
  }
}

async function resetSeedStatsIfNeeded() {
  const alreadyRecorded = await prisma.match.count({
    where: {
      id: { in: MATCHES.map((match) => match.id) },
      statsRecordedAt: { not: null },
    },
  });

  if (alreadyRecorded === MATCHES.length) {
    return;
  }

  await prisma.playerStats.updateMany({
    where: { userId: { in: USERS.map((user) => user.id) } },
    data: {
      gamesPlayed: 0,
      gamesWon: 0,
      totalPoints: 0,
      bestScore: 0,
      rankingPoints: 0,
    },
  });
}

async function seedMatches() {
  for (const match of MATCHES) {
    const { participants, id, ...scalars } = match;

    await prisma.match.upsert({
      where: { id },
      update: scalars,
      create: { id, ...scalars },
    });

    for (const participant of participants) {
      await prisma.matchParticipant.upsert({
        where: {
          matchId_userId: {
            matchId: id,
            userId: participant.userId,
          },
        },
        update: { finalScore: participant.finalScore },
        create: { matchId: id, ...participant },
      });
    }
  }

  await resetSeedStatsIfNeeded();

  for (const match of MATCHES) {
    await statsService.recordMatchResult(match.id);
  }
}

async function ensureUserAvatars() {
  const defaults = await prisma.avatar.findMany({
    where: { type: 'DEFAULT' },
    orderBy: { url: 'asc' },
    select: { id: true },
  });

  if (defaults.length === 0) {
    throw new Error('No hay avatares DEFAULT configurados');
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      avatar: { select: { type: true, ownerId: true } },
    },
  });

  for (const user of users) {
    const valid =
      user.avatar &&
      (user.avatar.type === 'DEFAULT' || user.avatar.ownerId === user.id);

    if (!valid) {
      await prisma.user.update({
        where: { id: user.id },
        data: { avatarId: defaults[0].id },
      });
    }
  }
}

async function main() {
  await seedAvatars();
  await seedAchievements();
  await seedUsers();
  await ensureUserAvatars();
  await seedMatches();
  console.log('Seed completado');
}

main()
  .catch((err) => {
    console.error('Error al ejecutar el seed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
