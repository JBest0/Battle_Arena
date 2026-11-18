const { AppError } = require('../../shared/AppError');

class MatchesService {
  constructor({ matchesRepository }) {
    this.matchesRepository = matchesRepository;
  }

  participantView(participant) {
    return {
      id: participant.userId,
      username: participant.user.username,
      avatarUrl: participant.user.avatar ? participant.user.avatar.url : null,
      finalScore: participant.finalScore,
      position: participant.position,
      result: participant.result,
      isPersonalBest: participant.isPersonalBest,
      isGlobalRecord: participant.isGlobalRecord,
    };
  }

  async getResult(matchId, userId) {
    const match = await this.matchesRepository.findResult(matchId);

    if (!match) {
      throw new AppError(404, 'MATCH_NOT_FOUND', 'La partida no existe');
    }

    const isParticipant = match.participants.some(
      (participant) => participant.userId === userId
    );
    if (!isParticipant) {
      throw new AppError(
        403,
        'MATCH_NOT_PARTICIPANT',
        'Solo los participantes pueden consultar el resultado'
      );
    }

    if (!match.statsRecordedAt) {
      throw new AppError(
        409,
        'MATCH_NOT_FINISHED',
        'El resultado todavía no fue consolidado'
      );
    }

    const participants = [...match.participants]
      .sort(
        (a, b) =>
          (a.position ?? Number.MAX_SAFE_INTEGER) -
            (b.position ?? Number.MAX_SAFE_INTEGER) ||
          b.finalScore - a.finalScore ||
          a.user.username.localeCompare(b.user.username)
      )
      .map((participant) => this.participantView(participant));

    const winnerParticipant =
      participants.find((participant) => participant.result === 'WIN') || null;
    const durationSeconds =
      match.durationSeconds ??
      (match.startedAt && match.endedAt
        ? Math.max(
            0,
            Math.round(
              (match.endedAt.getTime() - match.startedAt.getTime()) / 1000
            )
          )
        : null);

    return {
      matchId: match.id,
      startedAt: match.startedAt,
      endedAt: match.endedAt,
      durationSeconds,
      endMode: match.endMode,
      winner: winnerParticipant,
      participants,
    };
  }
}

module.exports = { MatchesService };
