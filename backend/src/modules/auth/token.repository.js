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

  createPasswordReset(userId, tokenHash, expiresAt, tx = this.db) {
    return tx.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt },
    });
  }

  findPasswordResetByHash(tokenHash, tx = this.db) {
    return tx.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
  }

  findLatestPasswordReset(userId, tx = this.db) {
    return tx.passwordResetToken.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  markPasswordResetUsed(id, tx = this.db) {
    return tx.passwordResetToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  invalidatePasswordResets(userId, tx = this.db) {
    return tx.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
  }

  async deleteExpiredTokens(olderThan, tx = this.db) {
    const filter = {
      OR: [{ expiresAt: { lt: olderThan } }, { usedAt: { lt: olderThan } }],
    };

    const [emailVerifications, passwordResets] = await Promise.all([
      tx.emailVerificationToken.deleteMany({ where: filter }),
      tx.passwordResetToken.deleteMany({ where: filter }),
    ]);

    return {
      emailVerifications: emailVerifications.count,
      passwordResets: passwordResets.count,
    };
  }
}

module.exports = { TokenRepository };
