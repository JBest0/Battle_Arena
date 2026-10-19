const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const config = require('../../src/config');
const { prisma } = require('../../src/infrastructure/prisma');

const DEFAULT_AVATAR_IDS = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000005',
];

const DEFAULT_AVATARS = DEFAULT_AVATAR_IDS.map((id, index) => ({
  id,
  url: `/static/avatars/${index + 1}.png`,
}));

const PASSWORD = 'Test1234';

async function seedDefaultAvatars() {
  for (const avatar of DEFAULT_AVATARS) {
    await prisma.avatar.upsert({
      where: { id: avatar.id },
      update: { type: 'DEFAULT', url: avatar.url, ownerId: null },
      create: { id: avatar.id, type: 'DEFAULT', url: avatar.url },
    });
  }
}

async function clearPlayers() {
  await prisma.matchParticipant.deleteMany();
  await prisma.match.deleteMany();
  await prisma.userAchievement.deleteMany();
  await prisma.playerStats.deleteMany();
  await prisma.emailVerificationToken.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.avatar.deleteMany({ where: { type: 'UPLOADED' } });
}

async function createPlayer({
  username,
  email,
  verified = true,
  avatarId = DEFAULT_AVATARS[0].id,
}) {
  const passwordHash = await bcrypt.hash(PASSWORD, 4);

  return prisma.user.create({
    data: {
      username,
      email,
      passwordHash,
      emailVerified: verified,
      avatarId,
      stats: { create: {} },
    },
    include: { avatar: true },
  });
}

function tokenFor(user) {
  return jwt.sign(
    { sub: user.id, username: user.username },
    config.jwtSecret,
    { expiresIn: '1h' }
  );
}

function imageBuffer(format = 'png', background = '#ff0000') {
  const image = sharp({
    create: { width: 300, height: 300, channels: 3, background },
  });

  return image[format]().toBuffer();
}

function filePathForUrl(url) {
  return path.join(config.uploadsDir, url.replace(/^\/uploads\//, ''));
}

module.exports = {
  DEFAULT_AVATAR_IDS,
  DEFAULT_AVATARS,
  PASSWORD,
  seedDefaultAvatars,
  clearPlayers,
  createPlayer,
  tokenFor,
  imageBuffer,
  filePathForUrl,
};
