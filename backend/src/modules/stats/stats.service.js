const { AppError } = require('../../shared/AppError');

const DEFAULT_RANKING_LIMIT = 10;
const MAX_RANKING_LIMIT = 50;

class StatsService {
  constructor({
    statsRepository,
    matchRepository,
    achievementEvaluator,
    unitOfWork,
  }) {
    this.statsRepository = statsRepository;
    this.matchRepository = matchRepository;
    this.achievementEvaluator = achievementEvaluator;
    this.unitOfWork = unitOfWork;
  }

  computeResults(participants) {
    const topScore = Math.max(...participants.map((p) => p.finalScore));
    const topCount = participants.filter(
      (p) => p.finalScore === topScore
    ).length;

    return participants.map((participant) => {
      let result = 'LOSS';

      if (participant.finalScore === topScore) {
        result = topCount > 1 ? 'DRAW' : 'WIN';
      }

      return {
        userId: participant.userId,
        finalScore: participant.finalScore,
        result,
        position:
          1 +
          participants.filter((other) => other.finalScore > participant.finalScore)
            .length,
      };
    });
  }

  /**
   * Punto de integración para el módulo de partida (US-16).
   *
   * Antes de llamarlo, el módulo de partida debe haber guardado:
   * - una `Match` con `endedAt` y, opcionalmente, `winnerId`;
   * - un `MatchParticipant` por jugador con su `finalScore`.
   *
   * Es idempotente: si `statsRecordedAt` ya tiene valor, no vuelve a sumar
   * estadísticas. `result` y `position` de cada participante se calculan aquí.
   *
   * @param {string} matchId
   * @returns {Promise<{alreadyRecorded: boolean, results?: object[], unlocked?: object}>}
   */
  async recordMatchResult(matchId) {
    return this.unitOfWork.run(async (tx) => {
      const match = await this.matchRepository.findFinishedWithParticipants(
        matchId,
        tx
      );

      if (!match) {
        throw new AppError(404, 'MATCH_NOT_FOUND', 'La partida no existe');
      }

      if (!match.endedAt) {
        throw new AppError(
          409,
          'MATCH_NOT_FINISHED',
          'La partida todavía no ha terminado'
        );
      }

      if (match.statsRecordedAt) {
        return { alreadyRecorded: true };
      }

      const results = this.computeResults(match.participants);

      await this.matchRepository.setParticipantResults(tx, matchId, results);

      const updatedStats = {};
      for (const result of results) {
        updatedStats[result.userId] =
          await this.statsRepository.applyMatchResult(tx, {
            userId: result.userId,
            result: result.result,
            score: result.finalScore,
          });
      }

      const unlocked = {};
      for (const result of results) {
        const codes = this.achievementEvaluator.evaluate(
          updatedStats[result.userId]
        );

        await this.statsRepository.unlockAchievements(
          tx,
          result.userId,
          codes
        );
        unlocked[result.userId] = codes;
      }

      await this.matchRepository.markStatsRecorded(matchId, tx);

      return {
        alreadyRecorded: false,
        results: results.map(({ userId, result, position }) => ({
          userId,
          result,
          position,
        })),
        unlocked,
      };
    });
  }

  async getRanking(limit = DEFAULT_RANKING_LIMIT) {
    const safeLimit = Math.min(Math.max(limit, 1), MAX_RANKING_LIMIT);
    const [items, totalPlayers] = await Promise.all([
      this.statsRepository.getTopRanking(safeLimit),
      this.statsRepository.getTotalPlayers(),
    ]);

    return { items, totalPlayers };
  }
}

module.exports = {
  StatsService,
  DEFAULT_RANKING_LIMIT,
  MAX_RANKING_LIMIT,
};
