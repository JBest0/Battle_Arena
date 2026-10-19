const { prisma } = require('../../infrastructure/prisma');

class MatchRepository {
  constructor(db = prisma) {
    this.db = db;
  }

  findFinishedWithParticipants(matchId, tx = this.db) {
    return tx.match.findUnique({
      where: { id: matchId },
      include: {
        participants: {
          include: { user: { include: { avatar: true } } },
        },
      },
    });
  }

  markStatsRecorded(matchId, tx = this.db) {
    return tx.match.update({
      where: { id: matchId },
      data: { statsRecordedAt: new Date() },
    });
  }

  async setParticipantResults(tx, matchId, results) {
    for (const result of results) {
      await tx.matchParticipant.update({
        where: {
          matchId_userId: { matchId, userId: result.userId },
        },
        data: { result: result.result, position: result.position },
      });
    }
  }
}

module.exports = { MatchRepository };
