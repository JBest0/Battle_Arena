const { AppError } = require('../../shared/AppError');
const {
  END_MODES,
  GAME_LIMITS,
  DEFAULT_GAME_CONFIG,
  ARENA,
  normalizeConfig,
} = require('./game.config');

function matchStatus(match) {
  if (match.endedAt) return 'FINISHED';
  if (match.startedAt) return 'IN_PROGRESS';
  return 'WAITING';
}

// Forma pública de una partida: lo que necesitan la sala de juego y la arena.
function toMatchView(match) {
  return {
    id: match.id,
    status: matchStatus(match),
    config: {
      endMode: match.endMode,
      durationSeconds: match.durationSeconds,
      targetPoints: match.targetPoints,
      maxPlayers: match.maxPlayers,
    },
    createdById: match.createdById,
    startedAt: match.startedAt,
    endedAt: match.endedAt,
    players: match.participants.map((participant) => ({
      id: participant.userId,
      username: participant.user.username,
      avatarUrl: participant.user.avatar.url,
      score: participant.finalScore,
    })),
  };
}

class GameService {
  constructor({ gameRepository }) {
    this.gameRepository = gameRepository;
  }

  getOptions() {
    return {
      endModes: END_MODES,
      limits: GAME_LIMITS,
      defaults: DEFAULT_GAME_CONFIG,
      arena: ARENA,
    };
  }

  async createMatch(userId, input) {
    const config = normalizeConfig(input);
    const match = await this.gameRepository.createMatch(config, userId);

    return toMatchView(match);
  }

  async getMatch(matchId) {
    const match = await this.gameRepository.findMatchWithParticipants(matchId);

    if (!match) {
      throw new AppError(404, 'MATCH_NOT_FOUND', 'La partida no existe');
    }

    return toMatchView(match);
  }
}

module.exports = { GameService, toMatchView };
