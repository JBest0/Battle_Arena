const { prisma } = require('../../infrastructure/prisma');
const { AppError } = require('../../shared/AppError');

class UserRepository {
  constructor(db = prisma) {
    this.db = db;
  }

  findById(id, tx = this.db) {
    return tx.user.findUnique({ where: { id } });
  }

  findByUsername(username, tx = this.db) {
    return tx.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
    });
  }

  findByEmail(email, tx = this.db) {
    return tx.user.findUnique({ where: { email } });
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

  update(id, data, tx = this.db) {
    return tx.user.update({ where: { id }, data });
  }

  toPublicUser(user) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      emailVerified: user.emailVerified,
      avatarUrl: user.avatar ? user.avatar.url : null,
      createdAt: user.createdAt,
    };
  }
}

module.exports = { UserRepository };
