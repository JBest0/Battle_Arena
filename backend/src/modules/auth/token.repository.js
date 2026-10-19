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

  findEmailVerificationToken(tokenHash, tx = this.db) {
    return tx.emailVerificationToken.findUnique({
      where: { tokenHash },
    });
  }

  markEmailVerificationTokenUsed(id, tx = this.db) {
    return tx.emailVerificationToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
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
