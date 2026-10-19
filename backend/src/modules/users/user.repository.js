const { prisma } = require('../../infrastructure/prisma');
const { AppError } = require('../../shared/AppError');

class UserRepository {
  constructor(db = prisma) {
    this.db = db;
  }

  findById(id, tx = this.db) {
    return tx.user.findUnique({
      where: { id },
      include: { avatar: true },
    });
  }

  findByUsername(username, tx = this.db) {
    return tx.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
    });
  }

  findByEmail(email, tx = this.db) {
    return tx.user.findUnique({ where: { email } });
  }

  findByIdentifier(identifier, tx = this.db) {
    const value = identifier.trim();

    if (value.includes('@')) {
      return tx.user.findUnique({
        where: { email: value.toLowerCase() },
        include: { avatar: true },
      });
    }

    return tx.user.findFirst({
      where: { username: { equals: value, mode: 'insensitive' } },
      include: { avatar: true },
    });
  }

  findByIdWithAvatar(id, tx = this.db) {
    return tx.user.findUnique({
      where: { id },
      include: { avatar: true },
    });
  }

  async getDefaultAvatarId(tx = this.db) {
    const avatar = await tx.avatar.findFirst({
      where: { type: 'DEFAULT' },
      orderBy: { url: 'asc' },
    });

    if (!avatar) {
      throw new AppError(
        500,
        'CONFIG_ERROR',
        'No hay avatares predeterminados configurados'
      );
    }

    return avatar.id;
  }

  createWithStats({ username, email, passwordHash, avatarId }, tx = this.db) {
    return tx.user.create({
      data: {
        username,
        email,
        passwordHash,
        avatarId,
        stats: { create: {} },
      },
      include: { avatar: true },
    });
  }

  markEmailVerified(userId, tx = this.db) {
    return tx.user.update({
      where: { id: userId },
      data: { emailVerified: true },
    });
  }

  async isEmailVerified(userId, tx = this.db) {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { emailVerified: true },
    });

    return Boolean(user && user.emailVerified);
  }

  update(id, data, tx = this.db) {
    return tx.user.update({ where: { id }, data });
  }

  updatePassword(userId, passwordHash, tx = this.db) {
    return tx.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        emailVerified: true,
      },
    });
  }

  async getPasswordChangedAt(userId, tx = this.db) {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { passwordChangedAt: true },
    });

    return user ? user.passwordChangedAt : null;
  }

  findByIdWithPassword(userId, tx = this.db) {
    return tx.user.findUnique({ where: { id: userId } });
  }

  findProfileById(id, tx = this.db) {
    return tx.user.findUnique({
      where: { id },
      include: { avatar: true, stats: true },
    });
  }

  updateBasicInfo(id, { displayName, bio }, tx = this.db) {
    return tx.user.update({
      where: { id },
      data: { displayName, bio },
    });
  }

  touchLastLogin(id, tx = this.db) {
    return tx.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  updateAvatar(userId, avatarId, tx = this.db) {
    return tx.user.update({
      where: { id: userId },
      data: { avatarId },
      include: { avatar: true },
    });
  }

  toPublicUser(user) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      emailVerified: user.emailVerified,
      avatarId: user.avatarId || (user.avatar ? user.avatar.id : null),
      avatarUrl: user.avatar ? user.avatar.url : null,
      createdAt: user.createdAt,
    };
  }
}

module.exports = { UserRepository };
