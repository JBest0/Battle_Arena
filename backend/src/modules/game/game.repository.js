const { prisma } = require('../../infrastructure/prisma');

const withParticipants = {
  participants: {
    include: { user: { include: { avatar: true } } },
    orderBy: { user: { username: 'asc' } },
  },
};

class GameRepository {
  constructor(db = prisma) {
    this.db = db;
  }

  // Crea la partida en espera (sin startedAt/endedAt) con el creador como primer jugador.
  createMatch(config, creatorId, tx = this.db) {
    return tx.match.create({
      data: {
        endMode: config.endMode,
        durationSeconds: config.durationSeconds,
        targetPoints: config.targetPoints,
        maxPlayers: config.maxPlayers,
        createdById: creatorId,
        participants: { create: { userId: creatorId } },
      },
      include: withParticipants,
    });
  }

  findMatchWithParticipants(matchId, tx = this.db) {
    return tx.match.findUnique({
      where: { id: matchId },
      include: withParticipants,
    });
  }
}

module.exports = { GameRepository };
