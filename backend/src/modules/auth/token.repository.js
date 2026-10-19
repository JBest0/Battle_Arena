const { prisma } = require('../../infrastructure/prisma');

class TokenRepository {
  constructor(db = prisma) {
    this.db = db;
  }

  createEmailVerification(userId, tokenHash, expiresAt, tx = this.db) {
    return tx.emailVerificationToken.create({
      data: { userId, tokenHash, expiresAt },
    });
  }

  findEmailVerificationByHash(tokenHash, tx = this.db) {
    return tx.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { avatar: true } } },
    });
  }

  findLatestEmailVerification(userId, tx = this.db) {
    return tx.emailVerificationToken.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  markEmailVerificationUsed(id, tx = this.db) {
    return tx.emailVerificationToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  invalidateEmailVerifications(userId, tx = this.db) {
    return tx.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
  }

  findEmailVerificationToken(tokenHash, tx = this.db) {
    return tx.emailVerificationToken.findUnique({
      where: { tokenHash },
    });
  }

  markEmailVerificationTokenUsed(id, tx = this.db) {
    return this.markEmailVerificationUsed(id, tx);
  }

  createPasswordResetToken(data, tx = this.db) {
    return tx.passwordResetToken.create({ data });
  }

  findPasswordResetToken(tokenHash, tx = this.db) {
    return tx.passwordResetToken.findUnique({ where: { tokenHash } });
  }

  markPasswordResetTokenUsed(id, tx = this.db) {
    return tx.passwordResetToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }
}

module.exports = { TokenRepository };
