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

  // Partidas que aún no empiezan, creadas después de `since`, de la más nueva a la más vieja.
  listWaitingMatches(since, limit, tx = this.db) {
    return tx.match.findMany({
      where: { startedAt: null, endedAt: null, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: withParticipants,
    });
  }

  // Bloquea la fila de la partida hasta que termine la transacción. Serializa
  // "unirse" e "iniciar" para que no se pase el cupo ni se una alguien tras el inicio.
  async lockMatch(matchId, tx) {
    await tx.$queryRaw`SELECT id FROM matches WHERE id = ${matchId}::uuid FOR UPDATE`;
  }

  addParticipant(matchId, userId, tx = this.db) {
    return tx.matchParticipant.create({ data: { matchId, userId } });
  }

  markStarted(matchId, startedAt, tx = this.db) {
    return tx.match.update({ where: { id: matchId }, data: { startedAt } });
  }

  // Cierra la partida: fecha de fin, ganador (null si hay empate) y puntaje de cada jugador.
  async finishMatch(matchId, { endedAt, winnerId, scores }, tx = this.db) {
    await tx.match.update({
      where: { id: matchId },
      data: { endedAt, winnerId },
    });

    for (const [userId, finalScore] of Object.entries(scores)) {
      await tx.matchParticipant.update({
        where: { matchId_userId: { matchId, userId } },
        data: { finalScore },
      });
    }
  }
}

module.exports = { GameRepository };
