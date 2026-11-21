const { prisma } = require('../../infrastructure/prisma');

class MatchesRepository {
  constructor(db = prisma) {
    this.db = db;
  }

  findResult(matchId, tx = this.db) {
    return tx.match.findUnique({
      where: { id: matchId },
      include: {
        participants: {
          include: { user: { include: { avatar: true } } },
        },
      },
    });
  }
}

module.exports = { MatchesRepository };
