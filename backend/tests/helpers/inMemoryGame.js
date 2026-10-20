const { randomUUID } = require('crypto');

// Repositorio y unidad de trabajo en memoria con la misma interfaz que GameRepository
// y UnitOfWork: permite probar el servicio de juego sin base de datos.
class InMemoryGameRepository {
  constructor() {
    this.matches = new Map();
    this.users = new Map();
  }

  addUser(username) {
    const user = { id: randomUUID(), username, avatarUrl: '/static/avatars/1.png' };
    this.users.set(user.id, user);
    return user;
  }

  _snapshot(match) {
    return {
      ...match,
      participants: match.participants
        .map((p) => ({
          userId: p.userId,
          finalScore: p.finalScore,
          user: {
            username: this.users.get(p.userId).username,
            avatar: { url: this.users.get(p.userId).avatarUrl },
          },
        }))
        .sort((a, b) => a.user.username.localeCompare(b.user.username)),
    };
  }

  async createMatch(config, creatorId) {
    const match = {
      id: randomUUID(),
      ...config,
      createdById: creatorId,
      createdAt: new Date(),
      startedAt: null,
      endedAt: null,
      winnerId: null,
      participants: [{ userId: creatorId, finalScore: 0 }],
    };
    this.matches.set(match.id, match);

    return this._snapshot(match);
  }

  async findMatchWithParticipants(matchId) {
    const match = this.matches.get(matchId);

    return match ? this._snapshot(match) : null;
  }

  async listWaitingMatches(since, limit) {
    return [...this.matches.values()]
      .filter((m) => !m.startedAt && !m.endedAt && m.createdAt >= since)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((m) => this._snapshot(m));
  }

  async lockMatch() {}

  async addParticipant(matchId, userId) {
    this.matches.get(matchId).participants.push({ userId, finalScore: 0 });
  }

  async markStarted(matchId, startedAt) {
    this.matches.get(matchId).startedAt = startedAt;
  }
}

const inMemoryUnitOfWork = { run: (work) => work({}) };

module.exports = { InMemoryGameRepository, inMemoryUnitOfWork };
