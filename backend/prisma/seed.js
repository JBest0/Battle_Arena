const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

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
];

const USERS = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    username: 'jugador1',
    email: 'jugador1@test.com',
    avatarId: AVATARS[0].id,
    stats: {
      gamesPlayed: 2,
      gamesWon: 1,
      totalPoints: 35,
      bestScore: 20,
      rankingPoints: 12,
    },
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    username: 'jugador2',
    email: 'jugador2@test.com',
    avatarId: AVATARS[1].id,
    stats: {
      gamesPlayed: 2,
      gamesWon: 1,
      totalPoints: 33,
      bestScore: 18,
      rankingPoints: 10,
    },
  },
];

const MATCHES = [
  {
    id: '20000000-0000-4000-8000-000000000001',
    startedAt: new Date('2026-01-10T18:00:00.000Z'),
    endedAt: new Date('2026-01-10T18:05:00.000Z'),
    endMode: 'TIME',
    winnerId: USERS[0].id,
    participants: [
      { userId: USERS[0].id, finalScore: 20, position: 1 },
      { userId: USERS[1].id, finalScore: 15, position: 2 },
    ],
  },
  {
    id: '20000000-0000-4000-8000-000000000002',
    startedAt: new Date('2026-01-11T20:00:00.000Z'),
    endedAt: new Date('2026-01-11T20:06:00.000Z'),
    endMode: 'POINTS',
    winnerId: USERS[1].id,
    participants: [
      { userId: USERS[1].id, finalScore: 18, position: 1 },
      { userId: USERS[0].id, finalScore: 15, position: 2 },
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
        avatarId: user.avatarId,
      },
    });

    await prisma.playerStats.upsert({
      where: { userId: user.id },
      update: user.stats,
      create: { userId: user.id, ...user.stats },
    });
  }
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
        update: {
          finalScore: participant.finalScore,
          position: participant.position,
        },
        create: { matchId: id, ...participant },
      });
    }
  }
}

async function main() {
  await seedAvatars();
  await seedAchievements();
  await seedUsers();
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
