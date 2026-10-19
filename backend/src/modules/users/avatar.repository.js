const { prisma } = require('../../infrastructure/prisma');

class AvatarRepository {
  constructor(db = prisma) {
    this.db = db;
  }

  findDefaults(tx = this.db) {
    return tx.avatar.findMany({
      where: { type: 'DEFAULT' },
      orderBy: { url: 'asc' },
      select: { id: true, url: true },
    });
  }

  findById(id, tx = this.db) {
    return tx.avatar.findUnique({ where: { id } });
  }

  findUploadedByOwner(userId, tx = this.db) {
    return tx.avatar.findFirst({
      where: { type: 'UPLOADED', ownerId: userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  createUploaded({ url, ownerId }, tx = this.db) {
    return tx.avatar.create({
      data: { type: 'UPLOADED', url, ownerId },
    });
  }

  delete(id, tx = this.db) {
    return tx.avatar.delete({ where: { id } });
  }
}

module.exports = { AvatarRepository };
